const TARGET_URL = "https://www.youtube.com/watch?v=UFYFO9YLItI";
const TARGET_VIDEO_ID = "UFYFO9YLItI";

const els = {
  hint: document.getElementById("hint"),
  listen: document.getElementById("listen"),
  pageStatus: document.getElementById("page-status"),
  rawText: document.getElementById("raw-text"),
  result: document.getElementById("result"),
  scan: document.getElementById("scan")
};

let activeTab = null;
let contentReady = false;
let currentState = null;

document.addEventListener("DOMContentLoaded", init);
els.scan.addEventListener("click", () => runAction("SCAN_ONCE"));
els.listen.addEventListener("click", () => runAction(currentState?.active ? "STOP_LISTENING" : "START_LISTENING"));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.owrNowPlayingState?.newValue) {
    return;
  }
  currentState = changes.owrNowPlayingState.newValue;
  renderState(currentState);
});

async function init() {
  setBusy(true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    if (!isTargetTab(tab)) {
      contentReady = false;
      els.pageStatus.textContent = "当前标签页不是目标视频。";
      els.hint.textContent = `请打开 ${TARGET_URL}`;
      renderState(null);
      return;
    }

    await ensureContentScript(tab.id);
    contentReady = true;
    els.pageStatus.textContent = "已连接目标视频。";
    els.hint.textContent = "插件已在页面右上角放置浮层。识别后点击结果即可打开网易云。";

    const shown = await sendToContent("SHOW_PANEL");
    currentState = shown.state;
    renderState(currentState);
  } catch (error) {
    contentReady = false;
    els.pageStatus.textContent = error.message || String(error);
    renderState(null);
  } finally {
    setBusy(false);
  }
}

async function runAction(type) {
  if (!contentReady || !activeTab?.id) {
    return;
  }

  setBusy(true);
  try {
    const response = await sendToContent(type);
    currentState = response.state;
    renderState(currentState);
  } catch (error) {
    els.pageStatus.textContent = error.message || String(error);
  } finally {
    setBusy(false);
  }
}

async function ensureContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (response?.ok) {
      return;
    }
  } catch {
    // The tab may have been loaded before the extension was installed.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function sendToContent(type) {
  const response = await chrome.tabs.sendMessage(activeTab.id, { type });
  if (!response?.ok) {
    throw new Error(response?.error || "页面脚本没有响应。");
  }
  return response;
}

function isTargetTab(tab) {
  if (!tab?.url) {
    return false;
  }

  try {
    const url = new URL(tab.url);
    return url.hostname === "www.youtube.com" && url.searchParams.get("v") === TARGET_VIDEO_ID;
  } catch {
    return false;
  }
}

function renderState(state) {
  currentState = state;
  els.result.classList.toggle("has-track", Boolean(state?.track));

  if (!state?.track) {
    els.result.innerHTML = '<div class="empty"><span class="empty-orbit" aria-hidden="true"></span>暂无识别结果</div>';
    els.rawText.textContent = state?.rawText || "等待截图。";
  } else {
    const link = state.link
      ? `<a href="${escapeAttribute(state.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(state.linkTitle || state.link)}</a>`
      : "";
    els.result.innerHTML = `
      <div class="artist">${escapeHtml(state.track.artist)}</div>
      <div class="song">${escapeHtml(state.track.title)}</div>
      ${link}
    `;
    els.rawText.textContent = state.rawText || "";
  }

  if (state?.lastError) {
    els.pageStatus.textContent = state.lastError;
  } else if (state?.status) {
    els.pageStatus.textContent = state.status;
  }

  els.listen.textContent = state?.active ? "停止监听" : "开始监听";
  els.listen.dataset.active = state?.active ? "true" : "false";
}

function setBusy(busy) {
  els.scan.disabled = busy || !contentReady && Boolean(activeTab);
  els.listen.disabled = busy || !contentReady && Boolean(activeTab);
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
