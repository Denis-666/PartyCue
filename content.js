(() => {
  if (window.__owrNowPlayingExtension) {
    window.__owrNowPlayingExtension.ensurePanel();
    return;
  }

  const TARGET_VIDEO_ID = "UFYFO9YLItI";
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
  let panel = null;
  let shadow = null;

  window.__owrNowPlayingExtension = {
    ensurePanel,
    scanOnce,
    startListening,
    stopListening,
    getState: () => ({ ...state })
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target && message.target !== "owr-content") {
      return false;
    }

    (async () => {
      if (message?.type === "PING") {
        return { ok: true, state: { ...state } };
      }

      if (message?.type === "SHOW_PANEL") {
        ensurePanel();
        updatePanel();
        return { ok: true, state: { ...state } };
      }

      if (message?.type === "SCAN_ONCE") {
        ensurePanel();
        const result = await scanOnce();
        return { ok: true, state: result };
      }

      if (message?.type === "START_LISTENING") {
        ensurePanel();
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
    updatePanel();
  });

  function isTargetPage() {
    try {
      return new URL(location.href).searchParams.get("v") === TARGET_VIDEO_ID;
    } catch {
      return false;
    }
  }

  function ensurePanel() {
    if (panel) {
      panel.style.display = "block";
      return panel;
    }

    panel = document.createElement("div");
    panel.id = "owr-now-playing-host";
    panel.style.position = "fixed";
    panel.style.top = "88px";
    panel.style.right = "18px";
    panel.style.zIndex = "2147483647";
    panel.style.display = "block";
    document.documentElement.appendChild(panel);

    shadow = panel.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .card {
          position: relative;
          width: 326px;
          box-sizing: border-box;
          color: #ffffff;
          background:
            linear-gradient(126deg, rgba(122, 176, 255, 0.46) 0 15%, transparent 30%),
            radial-gradient(ellipse at 82% -8%, rgba(213, 52, 255, 0.62), transparent 43%),
            radial-gradient(ellipse at 8% 92%, rgba(143, 57, 214, 0.76), transparent 48%),
            linear-gradient(145deg, rgba(18, 0, 31, 0.96), rgba(33, 0, 56, 0.94) 46%, rgba(8, 0, 18, 0.96));
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 8px;
          box-shadow: 0 22px 52px rgba(4, 0, 14, 0.44), 0 0 34px rgba(158, 59, 238, 0.24);
          font: 13px/1.42 Arial, Helvetica, sans-serif;
          overflow: hidden;
          backdrop-filter: blur(16px) saturate(1.25);
        }
        .card::before,
        .card::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .card::before {
          background:
            radial-gradient(ellipse 86% 76% at -16% 40%, transparent 0 43%, rgba(145, 60, 221, 0.72) 44% 54%, transparent 55%),
            radial-gradient(ellipse 92% 82% at 108% 22%, transparent 0 43%, rgba(84, 25, 158, 0.78) 44% 56%, transparent 57%),
            linear-gradient(132deg, transparent 0 28%, rgba(155, 69, 230, 0.56) 29% 36%, transparent 37% 72%, rgba(5, 0, 14, 0.66) 73% 88%, transparent 89%);
          opacity: 0.92;
        }
        .card::after {
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.10), transparent 22% 78%, rgba(255, 255, 255, 0.07)),
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 36%);
          mix-blend-mode: screen;
          opacity: 0.7;
        }
        .head {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.11);
          background: rgba(0, 0, 0, 0.12);
        }
        .title-wrap {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 9px;
        }
        .mini-mark {
          position: relative;
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background:
            radial-gradient(ellipse at 82% 14%, rgba(176, 95, 255, 0.52), transparent 42%),
            radial-gradient(ellipse at 18% 82%, rgba(24, 0, 44, 0.84), transparent 56%),
            linear-gradient(145deg, #2b0044 0%, #0c001d 54%, #4c0788 100%);
          box-shadow: 0 0 20px rgba(168, 66, 248, 0.30);
          overflow: hidden;
        }
        .mini-mark::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 88% 74% at -12% 72%, transparent 0 47%, rgba(156, 78, 226, 0.80) 48% 58%, transparent 59%),
            linear-gradient(42deg, transparent 0 58%, rgba(139, 47, 221, 0.72) 59% 68%, transparent 69%);
        }
        .mini-glyph {
          position: absolute;
          inset: 6px;
          width: 26px;
          height: 26px;
          filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.24));
        }
        .glyph-line {
          fill: none;
          stroke: #ffffff;
          stroke-width: 6;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .glyph-fill {
          fill: #ffffff;
        }
        .glyph-cut {
          fill: #170027;
        }
        .glyph-smile {
          fill: none;
          stroke: #170027;
          stroke-width: 8;
          stroke-linecap: round;
        }
        .mini-divider {
          flex: 0 0 auto;
          width: 2px;
          height: 40px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.88);
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.16);
        }
        .eyebrow {
          color: rgba(255, 255, 255, 0.74);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0;
          text-transform: uppercase;
        }
        .title {
          min-width: 0;
          color: #ffffff;
          font-family: Impact, "Arial Black", Arial, Helvetica, sans-serif;
          font-size: 19px;
          font-weight: 900;
          line-height: 0.95;
          letter-spacing: 0;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-shadow: 0 0 18px rgba(255, 255, 255, 0.18);
        }
        .close {
          position: relative;
          z-index: 1;
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.78);
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          width: 28px;
          height: 28px;
          border-radius: 6px;
        }
        .close:hover { background: rgba(255, 255, 255, 0.14); color: #ffffff; }
        .body {
          position: relative;
          z-index: 1;
          padding: 12px;
        }
        .status {
          display: flex;
          align-items: center;
          gap: 8px;
          color: rgba(255, 255, 255, 0.70);
          min-height: 20px;
          margin-bottom: 10px;
        }
        .dot {
          flex: 0 0 auto;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.32);
        }
        .dot.active { background: #90c7ff; box-shadow: 0 0 0 4px rgba(83, 150, 255, 0.22), 0 0 16px rgba(126, 185, 255, 0.74); }
        .dot.busy { background: #d78bff; box-shadow: 0 0 0 4px rgba(189, 97, 255, 0.20), 0 0 16px rgba(207, 113, 255, 0.64); }
        .track {
          position: relative;
          padding: 10px;
          border-radius: 8px;
          background:
            linear-gradient(126deg, rgba(174, 82, 255, 0.20), transparent 32% 70%, rgba(75, 154, 255, 0.15)),
            rgba(8, 0, 18, 0.42);
          border: 1px solid rgba(255, 255, 255, 0.12);
          margin-bottom: 10px;
          overflow: hidden;
        }
        .track::before {
          content: "";
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 0;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, #ffffff, #d68aff, #5aa7ff);
          box-shadow: 0 0 16px rgba(199, 104, 255, 0.52);
        }
        .artist {
          position: relative;
          color: #ffffff;
          font-family: Impact, "Arial Black", Arial, Helvetica, sans-serif;
          font-size: 19px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0;
          text-transform: uppercase;
          overflow-wrap: anywhere;
          text-shadow: 0 0 16px rgba(255, 255, 255, 0.16);
        }
        .song {
          position: relative;
          color: rgba(255, 255, 255, 0.74);
          margin-top: 5px;
          overflow-wrap: anywhere;
        }
        .link {
          position: relative;
          display: block;
          color: #91c5ff;
          font-weight: 700;
          text-decoration: none;
          overflow-wrap: anywhere;
          margin-top: 8px;
        }
        .link:hover { text-decoration: underline; }
        .raw {
          color: rgba(255, 255, 255, 0.68);
          max-height: 74px;
          overflow: auto;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          padding: 8px;
          border-radius: 6px;
          background: rgba(6, 0, 15, 0.36);
          border: 1px solid rgba(255, 255, 255, 0.10);
          margin-bottom: 10px;
        }
        .actions { display: flex; gap: 8px; }
        button.action {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 36px;
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 6px;
          color: #ffffff;
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 38%),
            linear-gradient(135deg, #6d21cc, #af3dff 48%, #3b83ff);
          cursor: pointer;
          font: 800 12px/1 Arial, Helvetica, sans-serif;
          padding: 9px 10px;
          box-shadow: 0 12px 24px rgba(7, 0, 18, 0.26);
        }
        button.action::before {
          content: "";
          flex: 0 0 auto;
          width: 14px;
          height: 14px;
          background: currentColor;
          mask: center / contain no-repeat;
        }
        button[data-action="scan"]::before {
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2zm6 10l.9 2.8 2.8.9-2.8.9L18 20l-.9-2.4-2.8-.9 2.8-.9L18 12zM5 14l.8 2.3L8 17l-2.2.7L5 20l-.8-2.3L2 17l2.2-.7L5 14z'/%3E%3C/svg%3E");
        }
        button[data-action="toggle"]::before {
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M8 5v14l11-7L8 5z'/%3E%3C/svg%3E");
        }
        button[data-action="toggle"][data-active="true"]::before {
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M7 7h10v10H7z'/%3E%3C/svg%3E");
        }
        button.secondary {
          color: #ffffff;
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent 42%),
            linear-gradient(135deg, rgba(20, 8, 43, 0.92), rgba(58, 21, 93, 0.86));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.10);
        }
        button.action:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .small {
          color: rgba(255, 255, 255, 0.56);
          font-size: 11px;
          margin-top: 10px;
        }
      </style>
      <div class="card">
        <div class="head">
          <div class="title-wrap">
            <span class="mini-mark" aria-hidden="true">
              <svg class="mini-glyph" viewBox="0 0 128 128" focusable="false">
                <circle class="glyph-fill" cx="64" cy="64" r="45"/>
                <circle class="glyph-cut" cx="48" cy="55" r="6"/>
                <circle class="glyph-cut" cx="80" cy="55" r="6"/>
                <path class="glyph-smile" d="M42 74c9 15 35 15 44 0"/>
              </svg>
            </span>
            <span class="mini-divider" aria-hidden="true"></span>
            <div>
              <div class="eyebrow">PartyCue</div>
              <div class="title">Now Playing</div>
            </div>
          </div>
          <button class="close" title="隐藏">×</button>
        </div>
        <div class="body">
          <div class="status"><span class="dot"></span><span data-role="status">准备开场</span></div>
          <div class="track" data-role="track">
            <div class="artist">舞台灯光待命</div>
            <div class="song">打开目标视频后点“识别一次”。</div>
          </div>
          <div class="raw" data-role="raw">OCR 原文会显示在这里。</div>
          <div class="actions">
            <button class="action" data-action="scan">识别一次</button>
            <button class="action secondary" data-action="toggle">开始监听</button>
          </div>
          <div class="small" data-role="meta">仅支持 UFYFO9YLItI 这个 YouTube 视频。</div>
        </div>
      </div>
    `;

    shadow.querySelector(".close").addEventListener("click", () => {
      panel.style.display = "none";
    });
    shadow.querySelector('[data-action="scan"]').addEventListener("click", () => scanOnce());
    shadow.querySelector('[data-action="toggle"]').addEventListener("click", () => {
      if (state.active) {
        stopListening();
      } else {
        startListening();
      }
    });

    updatePanel();
    return panel;
  }

  async function startListening() {
    state.active = true;
    setStatus("舞台监听中");
    updatePanel();

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
    updatePanel();
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
    updatePanel();

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
      updatePanel();

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
      await persistState();
      return { ...state };
    } catch (error) {
      setError(error);
      await persistState();
      return { ...state };
    } finally {
      state.busy = false;
      updatePanel();
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
    updatePanel();
  }

  async function persistState() {
    await chrome.storage.local.set({ [STORAGE_KEY]: { ...state } });
  }

  function updatePanel() {
    if (!shadow) {
      return;
    }

    const statusEl = shadow.querySelector('[data-role="status"]');
    const dotEl = shadow.querySelector(".dot");
    const trackEl = shadow.querySelector('[data-role="track"]');
    const rawEl = shadow.querySelector('[data-role="raw"]');
    const metaEl = shadow.querySelector('[data-role="meta"]');
    const scanButton = shadow.querySelector('[data-action="scan"]');
    const toggleButton = shadow.querySelector('[data-action="toggle"]');

    statusEl.textContent = state.lastError || state.status;
    dotEl.className = `dot${state.busy ? " busy" : state.active ? " active" : ""}`;
    scanButton.disabled = state.busy || !state.enabled;
    toggleButton.disabled = state.busy || !state.enabled;
    toggleButton.textContent = state.active ? "停止监听" : "开始监听";
    toggleButton.dataset.active = state.active ? "true" : "false";

    if (state.track) {
      const linkHtml = state.link
        ? `<a class="link" href="${escapeAttribute(state.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(state.linkTitle || state.link)}</a>`
        : "";
      trackEl.innerHTML = `
        <div class="artist">${escapeHtml(state.track.artist)}</div>
        <div class="song">${escapeHtml(state.track.title)}</div>
        ${linkHtml}
      `;
    } else {
      trackEl.innerHTML = `
        <div class="artist">还没有识别结果</div>
        <div class="song">${state.enabled ? "点“识别一次”读取左下角曲名。" : "当前页不是目标视频。"}</div>
      `;
    }

    rawEl.textContent = state.rawText || "OCR 原文会显示在这里。";
    metaEl.textContent = [
      state.lastScanAt ? `上次识别：${state.lastScanAt}` : "首次 OCR 可能需要几秒加载本地模型。",
      state.warning ? `匹配提示：${state.warning}` : ""
    ].filter(Boolean).join("  ");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
