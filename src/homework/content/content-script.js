(() => {
  if (window.__SABIS_HOMEWORK_ASSISTANT_CONTENT_SCRIPT__) {
    console.debug("SABIS Homework Assistant content script already active.");
    return;
  }

  async function init() {
    let collectAssignmentsPayloadFromDocument;
    try {
      ({ collectAssignmentsPayloadFromDocument } = await import(
        chrome.runtime.getURL("src/homework/shared/collector.js")
      ));
    } catch (error) {
      console.error(
        "SABIS Homework Assistant collector modulu yuklenemedi.",
        error
      );
      return;
    }

    window.__SABIS_HOMEWORK_ASSISTANT_CONTENT_SCRIPT__ = true;

    function collectAssignmentsPayload() {
      return collectAssignmentsPayloadFromDocument(
        document,
        window.location.href
      );
    }

    async function collectAssignmentsWithRetries({
      timeoutMs = 8000,
      delayMs = 400
    } = {}) {
      const deadline = Date.now() + timeoutMs;
      let payload = collectAssignmentsPayload();

      while (
        (!payload?.assignments || payload.assignments.length === 0) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        payload = collectAssignmentsPayload();
      }

      return payload;
    }

    function exposeApi() {
      window.__SABIS_HOMEWORK_ASSISTANT__ =
        window.__SABIS_HOMEWORK_ASSISTANT__ || {};
      window.__SABIS_HOMEWORK_ASSISTANT__.collectAssignmentsPayload =
        collectAssignmentsPayload;
    }

    exposeApi();

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "COLLECT_ASSIGNMENTS") {
        collectAssignmentsWithRetries()
          .then((payload) => sendResponse(payload))
          .catch((error) =>
            sendResponse({
              assignments: [],
              collectedAt: new Date().toISOString(),
              sourceUrl: window.location.href,
              metadata: {
                error: error instanceof Error ? error.message : String(error)
              }
            })
          );
        return true;
      }
    });
  }

  init();
})();
