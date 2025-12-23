import { collectAssignmentsPayloadFromHtml } from "../homework/shared/collector.js";
import { collectExamsPayloadFromHtml } from "../homework/shared/exam-collector.js";

const OBS_MATCH_PATTERN = "*://*.sabis.sakarya.edu.tr/*";
const SABIS_HOME_URL = "https://obs.sabis.sakarya.edu.tr/";
const COLLECTOR_NOT_READY = "COLLECTOR_NOT_READY";
const HOMEWORK_POPUP_URL = "src/homework/popup/popup.html";
const HOMEWORK_MENU_ID = "open-homework-popup";
const SABIS_EXAM_URL = "https://esinav.sabis.sakarya.edu.tr/Session/Exam";

const COLLECTOR_TIMEOUT_MS = 15000;
const COLLECTOR_RETRY_DELAY_MS = 300;
const ANNOUNCEMENT_PATH_CANDIDATES = [
  "Duyuru",
  "Duyuru/",
  "Duyurular",
  "Duyurular/",
  "Duyuru/Index",
  "Duyuru/Announcements",
  "Home/Duyuru",
  "Home/Duyurular",
  "Home/Announcements",
  "Announcement",
  "Announcements"
];

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isCollectorHandshakeError(message) {
  if (!message) {
    return false;
  }

  return (
    message.includes("Could not establish connection") ||
    message.includes("Receiving end does not exist") ||
    message.includes("The message port closed before a response was received")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveUrl(href, baseUrl) {
  if (!href) {
    return null;
  }

  try {
    return new URL(href, baseUrl || SABIS_HOME_URL).toString();
  } catch {
    return null;
  }
}

function findAnnouncementUrl(html, baseUrl) {
  const regex = /href=["']([^"']*duyuru[^"']*)["']/gi;
  let match = regex.exec(html || "");
  while (match) {
    const candidate = resolveUrl(match[1], baseUrl);
    if (candidate) {
      return candidate;
    }
    match = regex.exec(html || "");
  }
  return null;
}

function extractRequestVerificationToken(html) {
  if (!html) {
    return null;
  }

  const tokenInput = html.match(
    /name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i
  );
  if (tokenInput && tokenInput[1]) {
    return tokenInput[1];
  }

  const tokenFromScript = html.match(
    /__RequestVerificationToken["']\s*type=["']hidden["']\s*value=["']([^"']+)["']/i
  );
  if (tokenFromScript && tokenFromScript[1]) {
    return tokenFromScript[1];
  }

  return null;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    credentials: "include",
    redirect: "follow"
  });

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`HTTP ${response.status}${statusText}`);
  }

  const html = await response.text();
  const sourceUrl = response.url || url;
  return { html, sourceUrl };
}

async function fetchAnnouncementComponent(baseUrl, token) {
  if (!token) {
    throw new Error("REQUEST_VERIFICATION_TOKEN_MISSING");
  }

  const endpoint = resolveUrl("/Component/GenelDuyuru", baseUrl);
  if (!endpoint) {
    throw new Error("ANNOUNCEMENT_ENDPOINT_MISSING");
  }

  const body = new URLSearchParams({
    __RequestVerificationToken: token
  });

  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    redirect: "follow",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body
  });

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`HTTP ${response.status}${statusText}`);
  }

  const html = await response.text();
  const sourceUrl = response.url || endpoint;
  return { html, sourceUrl };
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("Offscreen dokuman desteklenmiyor.");
  }

  if (chrome.offscreen.hasDocument) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) {
      return;
    }
  }

  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("src/homework/offscreen/offscreen.html"),
    reasons: ["DOM_PARSER"],
    justification:
      "SABIS sayfasini arka planda gorunur sekme acmadan parse edebilmek."
  });
}

async function closeOffscreenDocument() {
  if (!chrome.offscreen?.closeDocument) {
    return;
  }

  if (chrome.offscreen.hasDocument) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (!hasDoc) {
      return;
    }
  }

  try {
    await chrome.offscreen.closeDocument();
  } catch {
    // No-op: kapatma sirasinda hata olursa yoksay.
  }
}

function isAnnouncementTab(tab) {
  const url = tab?.url || "";
  return /duyuru/i.test(url);
}

async function getPreferredSabisTab() {
  const tabs = await chrome.tabs.query({ url: OBS_MATCH_PATTERN });
  if (!tabs.length) {
    return null;
  }

  const announcementTab = tabs.find(isAnnouncementTab);
  if (announcementTab) {
    return announcementTab;
  }

  const activeTab = tabs.find((tab) => tab.active && tab.lastFocusedWindow);
  return activeTab || tabs[0];
}

async function waitForTabReady(tabId, timeoutMs = 15000) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) {
    throw new Error("TAB_NOT_FOUND");
  }
  if (tab.status === "complete") {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("TAB_LOAD_TIMEOUT"));
    }, timeoutMs);

    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve();
      }
    };

    const onRemoved = (removedTabId) => {
      if (removedTabId === tabId) {
        cleanup();
        reject(new Error("TAB_CLOSED"));
      }
    };

    function cleanup() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  }).catch(() => {});
}

async function findReadySabisTab() {
  const tab = await getPreferredSabisTab();
  if (!tab) {
    return null;
  }

  await waitForTabReady(tab.id).catch(() => {});
  return tab;
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["src/homework/content/content-script.js"]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Icerik betigi enjekte edilemedi. Sekmeyi yenileyip tekrar deneyin. Hata: ${message}`
    );
  }
}

async function tryCollectAssignments(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "COLLECT_ASSIGNMENTS"
    });

    if (!response) {
      return { ok: false, error: "COLLECTOR_RETURNED_NOTHING" };
    }

    return { ok: true, data: response };
  } catch (error) {
    const message = toErrorMessage(error);
    if (isCollectorHandshakeError(message)) {
      return { ok: false, error: COLLECTOR_NOT_READY, code: COLLECTOR_NOT_READY };
    }

    return { ok: false, error: message, code: "SEND_MESSAGE_FAILED" };
  }
}

async function collectWithRetries(tabId) {
  await injectContentScript(tabId);

  const deadline = Date.now() + COLLECTOR_TIMEOUT_MS;
  let lastError = COLLECTOR_NOT_READY;

  while (Date.now() < deadline) {
    const result = await tryCollectAssignments(tabId);
    if (result.ok) {
      return result.data;
    }

    if (result.code === "SEND_MESSAGE_FAILED") {
      throw new Error(
        `Icerik betigi iletisimi kurulamadi. Hata: ${result.error}`
      );
    }

    if (result.code === COLLECTOR_NOT_READY || result.error === COLLECTOR_NOT_READY) {
      await injectContentScript(tabId);
      await sleep(COLLECTOR_RETRY_DELAY_MS);
      continue;
    }

    lastError = result.error || "Bilinmeyen hata";
    break;
  }

  if (lastError === COLLECTOR_NOT_READY) {
    throw new Error(
      "Icerik betigi hazir degil. Lutfen SABIS sekmesinin tam yuklendiginden emin olun."
    );
  }

  throw new Error(`Icerik betigi veri donduremedi. Hata: ${lastError}`);
}

async function fetchAssignmentsFromTab(tab) {
  return collectWithRetries(tab.id);
}

function normalisePayload(payload, tabId) {
  const data = payload || {};
  const collectedAt = data.collectedAt || new Date().toISOString();
  const assignments = Array.isArray(data.assignments) ? data.assignments : [];
  const sourceUrl = data.sourceUrl || SABIS_HOME_URL;
  return {
    assignments,
    collectedAt,
    sourceUrl,
    tabId,
    metadata: data.metadata
  };
}

async function collectAssignmentsViaOffscreen(html, sourceUrl) {
  await ensureOffscreenDocument();

  const result = await chrome.runtime
    .sendMessage({
      target: "offscreen",
      type: "OFFSCREEN_COLLECT",
      html,
      sourceUrl
    })
    .catch((error) => ({
      ok: false,
      error: toErrorMessage(error)
    }));

  if (!result) {
    throw new Error("Offscreen dokumandan yanit alinamadi.");
  }

  if (!result.ok) {
    throw new Error(result.error || "Offscreen parse islemi basarisiz.");
  }

  return result.data;
}

async function collectExamsViaOffscreen(html, sourceUrl) {
  await ensureOffscreenDocument();

  const result = await chrome.runtime
    .sendMessage({
      target: "offscreen",
      type: "OFFSCREEN_COLLECT_EXAMS",
      html,
      sourceUrl
    })
    .catch((error) => ({
      ok: false,
      error: toErrorMessage(error)
    }));

  if (!result) {
    throw new Error("Offscreen dokumandan yanit alinamadi.");
  }

  if (!result.ok) {
    throw new Error(result.error || "Offscreen parse islemi basarisiz.");
  }

  return result.data;
}

async function parseAssignmentsFromHtml(html, sourceUrl) {
  try {
    return collectAssignmentsPayloadFromHtml(html, sourceUrl);
  } catch (parserError) {
    const parserMessage = toErrorMessage(parserError);
    if (parserMessage.includes("DOMParser is not defined")) {
      const payload = await collectAssignmentsViaOffscreen(html, sourceUrl);
      await closeOffscreenDocument();
      return payload;
    }

    throw parserError;
  }
}

async function parseExamsFromHtml(html, sourceUrl) {
  try {
    return collectExamsPayloadFromHtml(html, sourceUrl);
  } catch (parserError) {
    const parserMessage = toErrorMessage(parserError);
    if (parserMessage.includes("DOMParser is not defined")) {
      const payload = await collectExamsViaOffscreen(html, sourceUrl);
      await closeOffscreenDocument();
      return payload;
    }

    throw parserError;
  }
}

function isLikelyLoggedOut(html, responseUrl) {
  const url = responseUrl || "";
  if (/login|giris|oturum/i.test(url)) {
    return true;
  }

  const snippet = (html || "").slice(0, 20000).toLowerCase();
  return (
    snippet.includes("giris") ||
    snippet.includes("oturum") ||
    snippet.includes("sifre") ||
    snippet.includes("parola") ||
    snippet.includes("kullanici") ||
    snippet.includes("login")
  );
}

async function fetchAssignmentsDirectly() {
  try {
    const { html, sourceUrl } = await fetchHtml(SABIS_HOME_URL);

    if (isLikelyLoggedOut(html, sourceUrl)) {
      throw new Error(
        "Oturum acik degil. SABIS'te giris yapip tekrar deneyin."
      );
    }

    let payload = await parseAssignmentsFromHtml(html, sourceUrl);
    if (payload?.assignments?.length) {
      return payload;
    }

    const token = extractRequestVerificationToken(html);
    if (token) {
      const componentData = await fetchAnnouncementComponent(sourceUrl, token);
      if (isLikelyLoggedOut(componentData.html, componentData.sourceUrl)) {
        throw new Error(
          "Oturum acik degil. SABIS'te giris yapip tekrar deneyin."
        );
      }
      payload = await parseAssignmentsFromHtml(
        componentData.html,
        componentData.sourceUrl
      );
      if (payload?.assignments?.length) {
        return payload;
      }
    }

    const triedUrls = new Set([sourceUrl]);
    const announcementUrl = findAnnouncementUrl(html, sourceUrl);
    if (announcementUrl && !triedUrls.has(announcementUrl)) {
      const announcementData = await fetchHtml(announcementUrl);
      triedUrls.add(announcementData.sourceUrl);
      if (isLikelyLoggedOut(announcementData.html, announcementData.sourceUrl)) {
        throw new Error(
          "Oturum acik degil. SABIS'te giris yapip tekrar deneyin."
        );
      }
      payload = await parseAssignmentsFromHtml(
        announcementData.html,
        announcementData.sourceUrl
      );
    }

    if (!payload?.assignments?.length) {
      for (const path of ANNOUNCEMENT_PATH_CANDIDATES) {
        const candidateUrl = resolveUrl(path, SABIS_HOME_URL);
        if (!candidateUrl || triedUrls.has(candidateUrl)) {
          continue;
        }
        const candidateData = await fetchHtml(candidateUrl);
        triedUrls.add(candidateData.sourceUrl);
        if (isLikelyLoggedOut(candidateData.html, candidateData.sourceUrl)) {
          throw new Error(
            "Oturum acik degil. SABIS'te giris yapip tekrar deneyin."
          );
        }
        payload = await parseAssignmentsFromHtml(
          candidateData.html,
          candidateData.sourceUrl
        );
        if (payload?.assignments?.length) {
          break;
        }
      }
    }

    return payload;
  } catch (error) {
    const message = toErrorMessage(error);
    throw new Error(`SABIS sayfasindan veri cekilemedi. Hata: ${message}`);
  }
}

async function fetchExamsDirectly() {
  try {
    const { html, sourceUrl } = await fetchHtml(SABIS_EXAM_URL);

    if (isLikelyLoggedOut(html, sourceUrl)) {
      throw new Error(
        "Oturum acik degil. SABIS'te giris yapip tekrar deneyin."
      );
    }

    return await parseExamsFromHtml(html, sourceUrl);
  } catch (error) {
    const message = toErrorMessage(error);
    throw new Error(`Sinav sayfasi cekilemedi. Hata: ${message}`);
  }
}

async function collectWithExistingTab() {
  const tab = await findReadySabisTab();
  if (!tab) {
    return { ok: false, error: null, code: "NO_TAB" };
  }

  try {
    const payload = await fetchAssignmentsFromTab(tab);
    return { ok: true, payload: normalisePayload(payload, tab.id) };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

async function handleFetchAssignmentsRequest() {
  const existingResult = await collectWithExistingTab();
  if (existingResult.ok && existingResult.payload.assignments.length) {
    return existingResult.payload;
  }

  const directResult = await (async () => {
    try {
      const payload = await fetchAssignmentsDirectly();
      const normalised = normalisePayload(payload);
      if (normalised.assignments.length) {
        return { ok: true, payload: normalised };
      }

      return {
        ok: false,
        error: "Arka plan istegi sifir odev dondurdu."
      };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  })();

  if (directResult.ok) {
    return directResult.payload;
  }

  const reasons = [];
  if (existingResult.ok && !existingResult.payload.assignments.length) {
    reasons.push("Mevcut sekmede odev duyurusu bulunamadi.");
  } else if (existingResult.error && existingResult.code !== "NO_TAB") {
    reasons.push(`Mevcut sekme: ${existingResult.error}`);
  }

  if (directResult.error) {
    reasons.push(`Arka plan istegi: ${directResult.error}`);
  }

  const message =
    reasons.length > 0
      ? reasons.join(" | ")
      : "Odev duyurusu alinamadi. SABIS oturumunuzun acik oldugundan emin olun.";

  throw new Error(message);
}

async function handleFetchExamsRequest() {
  const payload = await fetchExamsDirectly();
  if (payload?.exams?.length) {
    return payload;
  }

  throw new Error("Sinav listesi bos geldi.");
}

function openHomeworkPopup() {
  chrome.tabs.create({
    url: chrome.runtime.getURL(HOMEWORK_POPUP_URL)
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ extensionEnabled: true });
  if (chrome.contextMenus?.create) {
    chrome.contextMenus.create({
      id: HOMEWORK_MENU_ID,
      title: "Odev Takibi",
      contexts: ["action"]
    });
  }
});

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === HOMEWORK_MENU_ID) {
      openHomeworkPopup();
    }
  });
}

if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === "open-homework-popup") {
      openHomeworkPopup();
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FETCH_ASSIGNMENTS") {
    handleFetchAssignmentsRequest()
      .then((result) => sendResponse({ ok: true, data: result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "FETCH_EXAMS") {
    handleFetchExamsRequest()
      .then((result) => sendResponse({ ok: true, data: result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return undefined;
});
