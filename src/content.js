(() => {
  removeInjectedPanel();

  if (window.__partyCueNoPanelExtension) {
    return;
  }

  const TARGET_VIDEO_ID = "UFYFO9YLItI";
  const MESSAGE_TARGET = "partycue-content";
  const SCAN_INTERVAL_MS = 30000;
  const STORAGE_KEY = "owrNowPlayingState";

  const state = {
    active: false,
    busy: false,
    enabled: isTargetPage(),
    lastError: "",
    lastScanAt: "",
    link: "",
    linkTitle: "",
    query: "",
    rawText: "",
    searchUrl: "",
    status: "准备开场",
    track: null,
    warning: ""
  };

  let intervalId = 0;

  window.__partyCueNoPanelExtension = {
    scanOnce,
    startListening,
    stopListening,
    getState: () => ({ ...state })
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== MESSAGE_TARGET) {
      return false;
    }

    removeInjectedPanel();

    (async () => {
      if (message?.type === "PING") {
        return { ok: true, state: { ...state } };
      }

      if (message?.type === "SCAN_ONCE") {
        const result = await scanOnce();
        return { ok: true, state: result };
      }

      if (message?.type === "START_LISTENING") {
        const result = await startListening();
        return { ok: true, state: result };
      }

      if (message?.type === "STOP_LISTENING") {
        stopListening();
        return { ok: true, state: { ...state } };
      }

      if (message?.type === "GET_STATE") {
        return { ok: true, state: { ...state } };
      }

      return { ok: false, error: "Unknown message type." };
    })()
      .then(sendResponse)
      .catch((error) => {
        setError(error);
        sendResponse({ ok: false, error: state.lastError, state: { ...state } });
      });

    return true;
  });

  window.addEventListener("yt-navigate-finish", () => {
    state.enabled = isTargetPage();
    if (!state.enabled) {
      stopListening();
      setStatus("PartyCue 目前只针对指定的 One World Radio 视频");
    }
    persistState().catch(() => {});
  });

  function isTargetPage() {
    try {
      return new URL(location.href).searchParams.get("v") === TARGET_VIDEO_ID;
    } catch {
      return false;
    }
  }

  async function startListening() {
    state.active = true;
    setStatus("舞台监听中");

    if (!intervalId) {
      intervalId = window.setInterval(() => {
        scanOnce().catch(setError);
      }, SCAN_INTERVAL_MS);
    }

    await scanOnce();
    return { ...state };
  }

  function stopListening() {
    state.active = false;
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = 0;
    }
    setStatus("监听已暂停");
  }

  async function scanOnce() {
    state.enabled = isTargetPage();
    if (!state.enabled) {
      throw new Error("当前页不是目标视频：https://www.youtube.com/watch?v=UFYFO9YLItI");
    }

    if (state.busy) {
      return { ...state };
    }

    state.busy = true;
    state.lastError = "";
    state.warning = "";
    setStatus("正在扫舞台字幕");

    try {
      const videoRect = getVideoRect();
      const capture = await sendRuntimeMessage({ type: "CAPTURE_VISIBLE_TAB" });
      if (!capture.ok || !capture.dataUrl) {
        throw new Error(capture.error || "无法截图。请先点击扩展图标授权当前标签页。");
      }

      const screenshot = await loadImage(capture.dataUrl);
      const candidates = makeCandidateCrops(screenshot, videoRect);
      const payload = candidates.map((candidate) => ({
        imageDataUrl: candidate.canvas.toDataURL("image/png"),
        name: candidate.name,
        psm: candidate.psm
      }));
      const ocrBatch = await sendRuntimeMessage({ type: "RUN_OCR_BATCH", candidates: payload });
      if (!ocrBatch.ok || !Array.isArray(ocrBatch.results)) {
        throw new Error(ocrBatch.error || "OCR 引擎处理失败。");
      }

      const ocrResults = [];

      for (const result of ocrBatch.results) {
        const rawText = normalizeOcrText(result?.text || "");
        const parsed = parseTrack(rawText);
        ocrResults.push({ ...parsed, rawText, name: result?.name || "" });

        if (parsed.score >= 70) {
          break;
        }
      }

      const best = pickBestOcrResult(ocrResults);
      state.rawText = best.rawText || "";

      if (!best.track) {
        throw new Error("OCR 没读出稳定的歌手/歌名。请确认视频左下角 Now Playing 区域在屏幕上。");
      }

      state.track = best.track;
      state.query = `${best.track.artist} ${best.track.title}`.replace(/\s+/g, " ").trim();
      setStatus("正在点亮网易云链接");

      const resolved = await sendRuntimeMessage({ type: "RESOLVE_NETEASE_URL", query: state.query, track: state.track });
      if (!resolved.ok) {
        throw new Error(resolved.error || "网易云链接匹配失败。");
      }

      state.link = resolved.url || resolved.searchUrl || "";
      state.linkTitle = resolved.title || "";
      state.searchUrl = resolved.searchUrl || "";
      state.warning = resolved.warning || "";
      state.lastScanAt = new Date().toLocaleTimeString();
      setStatus(state.active ? "舞台监听中" : "歌名已点亮");
      state.busy = false;
      await persistState();
      return { ...state };
    } catch (error) {
      setError(error);
      await persistState();
      return { ...state };
    } finally {
      state.busy = false;
    }
  }

  function getVideoRect() {
    const video = document.querySelector("video");
    if (!video) {
      throw new Error("找不到 YouTube video 元素。");
    }

    const rect = video.getBoundingClientRect();
    if (rect.width < 200 || rect.height < 120) {
      throw new Error("视频区域太小，无法可靠 OCR。");
    }

    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width
    };
  }

  function makeCandidateCrops(image, rect) {
    const scaleX = image.naturalWidth / window.innerWidth;
    const scaleY = image.naturalHeight / window.innerHeight;
    const base = {
      left: rect.left * scaleX,
      top: rect.top * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY
    };

    const cropSpecs = [
      { name: "text-wide-block", x: 0.275, y: 0.735, w: 0.54, h: 0.215, psm: 6, delta: 10 },
      { name: "text-wide-sparse", x: 0.275, y: 0.735, w: 0.54, h: 0.215, psm: 11, delta: 10 },
      { name: "text-primary", x: 0.30, y: 0.795, w: 0.48, h: 0.135, psm: 6, delta: 8 }
    ];

    return cropSpecs.map((spec) => {
      const source = {
        left: base.left + base.width * spec.x,
        top: base.top + base.height * spec.y,
        width: base.width * spec.w,
        height: base.height * spec.h
      };

      return {
        name: spec.name,
        psm: spec.psm,
        canvas: preprocessCrop(image, source, spec.delta)
      };
    });
  }

  function preprocessCrop(image, source, delta) {
    const padding = 18;
    const scale = 3;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale + padding * 2));
    canvas.height = Math.max(1, Math.round(source.height * scale + padding * 2));

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      source.left,
      source.top,
      source.width,
      source.height,
      padding,
      padding,
      source.width * scale,
      source.height * scale
    );

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = data.data;
    const width = canvas.width;
    const height = canvas.height;
    const integralWidth = width + 1;
    const luminance = new Float32Array(width * height);
    const integral = new Float64Array((width + 1) * (height + 1));

    for (let y = 0; y < height; y += 1) {
      let rowSum = 0;
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const lum = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
        luminance[y * width + x] = lum;
        rowSum += lum;
        integral[(y + 1) * integralWidth + x + 1] = integral[y * integralWidth + x + 1] + rowSum;
      }
    }

    const radius = Math.max(18, Math.round(8 * scale));

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const local = averageLuminance(integral, integralWidth, width, height, x, y, radius);
        const lum = luminance[y * width + x];
        const value = lum > local + delta ? 0 : 255;
        pixels[index] = value;
        pixels[index + 1] = value;
        pixels[index + 2] = value;
        pixels[index + 3] = 255;
      }
    }

    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  function averageLuminance(integral, integralWidth, width, height, x, y, radius) {
    const left = Math.max(0, x - radius);
    const top = Math.max(0, y - radius);
    const right = Math.min(width - 1, x + radius);
    const bottom = Math.min(height - 1, y + radius);
    const x1 = right + 1;
    const y1 = bottom + 1;
    const sum = integral[y1 * integralWidth + x1]
      - integral[top * integralWidth + x1]
      - integral[y1 * integralWidth + left]
      + integral[top * integralWidth + left];
    const area = (x1 - left) * (y1 - top);
    return sum / Math.max(1, area);
  }

  function parseTrack(rawText) {
    const ignored = /(now\s*playing|one\s*world|radio|daybreak|session|tomorrowland)/i;
    const lines = rawText
      .split("\n")
      .map(cleanOcrLine)
      .filter(Boolean)
      .map(stripPlayedBy)
      .map(cleanTrackPart)
      .filter(Boolean)
      .filter((line) => !ignored.test(line))
      .filter((line) => !isLikelyNoiseLine(line));

    if (!lines.length) {
      return { score: 0, track: null };
    }

    const candidates = buildTrackCandidates(lines);
    if (candidates.length) {
      const best = candidates.sort((a, b) => b.score - a.score)[0];
      return {
        score: best.score,
        track: {
          artist: best.artist,
          title: best.title
        }
      };
    }

    if (lines.length >= 2) {
      const artist = cleanTrackPart(lines[lines.length - 2]);
      const title = cleanTrackPart(lines[lines.length - 1]);
      if (artist && title && artist.length >= 2 && title.length >= 2) {
        return {
          score: 35,
          track: { artist, title }
        };
      }
    }

    const split = splitSingleLine(lines[0]);
    if (!split.artist || !split.title) {
      return { score: 0, track: null };
    }

    return {
      score: 28,
      track: split
    };
  }

  function cleanOcrLine(line) {
    return String(line || "")
      .replace(/[“”]/g, '"')
      .replace(/[’‘]/g, "'")
      .replace(/[|\\]/g, " ")
      .replace(/[^\w\s.'&(),:!?/-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripPlayedBy(value) {
    return String(value || "")
      .replace(/\(?\s*play(?:ed|ing)?\s+by\b.*$/i, "")
      .replace(/\([^)]*$/g, "")
      .trim();
  }

  function isLikelyNoiseLine(value) {
    const text = String(value || "").trim();
    if (!text) {
      return true;
    }

    const tokens = text.split(" ").filter(Boolean);
    if (!tokens.length) {
      return true;
    }

    if (tokens.length === 1 && tokens[0].length <= 2) {
      return true;
    }

    const singleCharWords = tokens.filter((token) => token.length === 1).length;
    if (singleCharWords >= 1 && tokens.length <= 2 && text.length <= 6) {
      return true;
    }

    if (/^\d+$/.test(text)) {
      return true;
    }

    return false;
  }

  function buildTrackCandidates(lines) {
    const candidates = [];

    for (let artistIndex = 0; artistIndex < lines.length; artistIndex += 1) {
      const artist = cleanTrackPart(lines[artistIndex]);
      if (!artist) {
        continue;
      }

      for (let titleIndex = artistIndex + 1; titleIndex < Math.min(lines.length, artistIndex + 3); titleIndex += 1) {
        const title = cleanTrackPart(lines[titleIndex]);
        if (!title) {
          continue;
        }

        const score = scoreTrackPair(artist, title, artistIndex, titleIndex, lines.length);
        if (score > 0) {
          candidates.push({
            artist,
            score,
            title
          });
        }
      }
    }

    return candidates;
  }

  function scoreTrackPair(artist, title, artistIndex, titleIndex, totalLines) {
    if (!artist || !title || artist.length < 2 || title.length < 2) {
      return -1;
    }

    const artistScore = scoreTrackPartQuality(artist);
    const titleScore = scoreTrackPartQuality(title);
    if (artistScore <= 0 || titleScore <= 0) {
      return -1;
    }

    const artistNorm = normalizeTrackText(artist);
    const titleNorm = normalizeTrackText(title);

    let score = artistScore + titleScore;
    if (titleIndex === artistIndex + 1) {
      score += 8;
    }
    if (artistIndex >= Math.max(0, totalLines - 3)) {
      score += 4;
    }
    if (titleIndex >= Math.max(1, totalLines - 2)) {
      score += 6;
    }
    if (artistNorm === titleNorm) {
      score -= 24;
    } else if (artistNorm.includes(titleNorm) || titleNorm.includes(artistNorm)) {
      score -= 10;
    }

    return score;
  }

  function scoreTrackPartQuality(value) {
    const text = String(value || "").trim();
    if (!text || text.length < 2) {
      return -50;
    }

    const tokens = text.split(" ").filter(Boolean);
    if (!tokens.length) {
      return -50;
    }

    const shortTokens = tokens.filter((token) => token.length <= 2).length;
    const singleCharTokens = tokens.filter((token) => token.length === 1).length;
    const stopwordHit = /\b(now|playing|radio|tomorrowland|youtube|live|session|daybreak)\b/i.test(text);

    let score = Math.min(24, text.length * 1.4);
    if (tokens.length >= 2) {
      score += 7;
    }
    if (tokens.length > 6) {
      score -= 5;
    }
    if (singleCharTokens > 0) {
      score -= singleCharTokens * 14;
    }
    if (shortTokens / tokens.length > 0.55) {
      score -= 16;
    }
    if (stopwordHit) {
      score -= 45;
    }
    if (/^[A-Z0-9\s.'&-]+$/.test(text)) {
      score += 6;
    }

    return score;
  }

  function normalizeTrackText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitSingleLine(line) {
    const match = line.match(/^([A-Z0-9.'&\s-]{3,})\s+([A-Z][A-Za-z0-9.'&\s()/:-]{2,})$/);
    if (!match) {
      return { artist: "", title: "" };
    }

    return { artist: match[1], title: match[2] };
  }

  function cleanTrackPart(value) {
    let cleaned = String(value || "")
      .replace(/^[-:.\s]+|[-:.\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (/^[A-Z0-9\s.'&-]+$/.test(cleaned)) {
      cleaned = cleaned.replace(/\b([A-Z]{3,})\s+([A-Z]{1,2})\b/g, "$1$2");
    }

    return cleaned;
  }

  function pickBestOcrResult(results) {
    return results
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || b.rawText.length - a.rawText.length)[0] || { score: 0, track: null, rawText: "" };
  }

  function normalizeOcrText(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("截图图片加载失败。"));
      image.src = dataUrl;
    });
  }

  function sendRuntimeMessage(message) {
    return chrome.runtime.sendMessage({
      target: "owr-background",
      ...message
    });
  }

  function setStatus(status) {
    state.status = status;
  }

  function setError(error) {
    state.lastError = error?.message || String(error);
    state.status = "出错";
    state.busy = false;
  }

  async function persistState() {
    await chrome.storage.local.set({ [STORAGE_KEY]: { ...state } });
  }

  function removeInjectedPanel() {
    document.getElementById("owr-now-playing-host")?.remove();
  }
})();
