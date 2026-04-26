const OFFSCREEN_DOCUMENT = "src/offscreen.html";
let creatingOffscreen = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target && message.target !== "owr-background") {
    return false;
  }

  (async () => {
    if (message?.type === "CAPTURE_VISIBLE_TAB") {
      return captureVisibleTab(sender);
    }

    if (message?.type === "RESOLVE_NETEASE_URL") {
      return resolveNeteaseUrl(message.query, message.track);
    }

    if (message?.type === "RUN_OCR_BATCH") {
      return runOcrBatch(message.candidates);
    }

    return { ok: false, error: "Unknown message type." };
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("当前环境不支持 Offscreen Document API。");
  }

  const documentUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT);
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [documentUrl]
    });
    if (contexts.length > 0) {
      return;
    }
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT,
    reasons: ["DOM_PARSER"],
    justification: "Run OCR in extension context without page CSP limits."
  });

  try {
    await creatingOffscreen;
  } catch (error) {
    const message = error?.message || String(error);
    if (!message.includes("Only a single offscreen document may be created")) {
      throw error;
    }
  } finally {
    creatingOffscreen = null;
  }
}

async function runOcrBatch(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) {
    return { ok: true, results: [] };
  }

  await ensureOffscreenDocument();

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      target: "owr-offscreen",
      type: "RUN_OCR_BATCH",
      candidates: list
    });
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }

  if (!response?.ok) {
    return { ok: false, error: response?.error || "Offscreen OCR failed." };
  }

  return {
    ok: true,
    results: Array.isArray(response.results) ? response.results : []
  };
}

async function captureVisibleTab(sender) {
  const windowId = sender?.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  return { ok: true, dataUrl };
}

async function resolveNeteaseUrl(query, track) {
  const cleanedQuery = String(query || "").replace(/\s+/g, " ").trim();
  if (!cleanedQuery) {
    return { ok: false, error: "Empty search query." };
  }

  const searchUrl = `https://music.163.com/#/search/m/?s=${encodeURIComponent(cleanedQuery)}&type=1`;
  const apiUrl = [
    "https://music.163.com/api/search/get/web?csrf_token=",
    "&hlpretag=",
    "&hlposttag=",
    `&s=${encodeURIComponent(cleanedQuery)}`,
    "&type=1",
    "&offset=0",
    "&total=true",
    "&limit=8"
  ].join("");

  try {
    const response = await fetch(apiUrl, {
      credentials: "omit",
      referrer: "https://music.163.com/"
    });

    if (!response.ok) {
      throw new Error(`NetEase search returned HTTP ${response.status}.`);
    }

    const data = await response.json();
    const songs = Array.isArray(data?.result?.songs) ? data.result.songs : [];
    const song = pickBestSong(songs, track, cleanedQuery);

    if (!song) {
      return { ok: true, url: searchUrl, searchUrl, source: "netease-search-fallback" };
    }

    return {
      ok: true,
      url: `https://music.163.com/#/song?id=${song.id}`,
      searchUrl,
      title: formatSongTitle(song),
      songId: song.id,
      source: "netease-search-best-match"
    };
  } catch (error) {
    return {
      ok: true,
      url: searchUrl,
      searchUrl,
      source: "netease-search-fallback",
      warning: error.message || String(error)
    };
  }
}

function pickBestSong(songs, track, query) {
  if (!songs.length) {
    return null;
  }

  const expectedTitle = normalizeForMatch(track?.title || query);
  const expectedArtist = normalizeForMatch(track?.artist || "");
  const expectedTokens = tokenSet(`${track?.artist || ""} ${track?.title || query}`);

  return songs
    .map((song, index) => ({ song, score: scoreSong(song, expectedTitle, expectedArtist, expectedTokens) - index * 0.2 }))
    .sort((a, b) => b.score - a.score)[0]?.song || null;
}

function scoreSong(song, expectedTitle, expectedArtist, expectedTokens) {
  const songTitle = normalizeForMatch(song?.name || "");
  const songArtists = normalizeForMatch((song?.artists || []).map((artist) => artist.name).join(" "));
  const songTokens = tokenSet(`${song?.name || ""} ${(song?.artists || []).map((artist) => artist.name).join(" ")}`);

  let score = 0;

  if (songTitle && expectedTitle) {
    if (songTitle === expectedTitle) {
      score += 60;
    } else if (songTitle.includes(expectedTitle) || expectedTitle.includes(songTitle)) {
      score += 38;
    }
  }

  if (songArtists && expectedArtist) {
    if (songArtists === expectedArtist) {
      score += 45;
    } else if (songArtists.includes(expectedArtist) || expectedArtist.includes(songArtists)) {
      score += 30;
    }
  }

  score += overlapScore(expectedTokens, songTokens) * 12;
  return score;
}

function formatSongTitle(song) {
  const artists = (song?.artists || []).map((artist) => artist.name).filter(Boolean).join(" / ");
  const name = song?.name || "网易云音乐";
  return artists ? `网易云：${artists} - ${name}` : `网易云：${name}`;
}

function normalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeForMatch(value).split(" ").filter((token) => token.length > 1));
}

function overlapScore(a, b) {
  if (!a.size || !b.size) {
    return 0;
  }

  let shared = 0;
  a.forEach((token) => {
    if (b.has(token)) {
      shared += 1;
    }
  });
  return shared / Math.max(a.size, b.size);
}
