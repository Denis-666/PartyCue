(() => {
  let workerPromise = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== "owr-offscreen" || message?.type !== "RUN_OCR_BATCH") {
      return false;
    }

    (async () => {
      const results = await runOcrBatch(message.candidates);
      return { ok: true, results };
    })()
      .then(sendResponse)
      .catch((error) => {
        workerPromise = null;
        sendResponse({ ok: false, error: error.message || String(error) });
      });

    return true;
  });

  async function runOcrBatch(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) {
      return [];
    }

    const worker = await getWorker();
    const results = [];

    for (const candidate of list) {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: String(candidate?.psm ?? 6),
        user_defined_dpi: "180"
      });

      const { data } = await worker.recognize(String(candidate?.imageDataUrl || ""));
      results.push({
        name: String(candidate?.name || ""),
        text: data?.text || ""
      });
    }

    return results;
  }

  async function getWorker() {
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker("eng", 1, {
        corePath: chrome.runtime.getURL("vendor"),
        gzip: true,
        langPath: chrome.runtime.getURL("vendor/lang"),
        workerBlobURL: false,
        workerPath: chrome.runtime.getURL("vendor/worker.min.js")
      }).catch((error) => {
        workerPromise = null;
        throw error;
      });
    }

    return workerPromise;
  }
})();
