const DEFAULT_SETTINGS = {
  dueSoonDays: 3,
  longTermDays: 10
};

const SABIS_HOME_URL = "https://obs.sabis.sakarya.edu.tr/";

const categoryOrder = ["dueSoon", "longTerm", "overdue"];

const statusMessageEl = document.querySelector("#status-message");
const noteStatusEl = document.querySelector("#status");
const noteToggleEl = document.querySelector("#extToggle");
const assignmentsContainer = document.querySelector("#assignments-container");
const examsContainer = document.querySelector("#exams-container");
const lastUpdatedEl = document.querySelector("#last-updated");
const openSabisLink = document.querySelector("#open-sabis");
const openSettingsLink = document.querySelector("#open-settings");
const refreshButton = document.querySelector("#refresh-button");
const tabsNav = document.querySelector("#category-tabs");
const tabButtons = Array.from(document.querySelectorAll("[data-category-tab]"));
const modeTabs = document.querySelector("#mode-tabs");
const modeButtons = Array.from(document.querySelectorAll("[data-mode-tab]"));
const template = document.querySelector("#assignment-template");
const examTemplate = document.querySelector("#exam-template");

let activeCategory = "dueSoon";
let activeMode = "assignments";

async function initNoteToggle() {
  if (!noteStatusEl || !noteToggleEl) {
    return;
  }

  const { extensionEnabled = true } =
    await chrome.storage.local.get("extensionEnabled");
  noteToggleEl.checked = extensionEnabled;
  noteStatusEl.textContent = extensionEnabled ? "Not aktif" : "Not pasif";

  noteToggleEl.addEventListener("change", async () => {
    const enabled = noteToggleEl.checked;
    await chrome.storage.local.set({ extensionEnabled: enabled });
    noteStatusEl.textContent = enabled ? "Not aktif" : "Not pasif";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.reload(tab.id);
    }
  });
}

function msToDays(ms) {
  return ms / (1000 * 60 * 60 * 24);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatCountdown(diffMs) {
  const diffDays = msToDays(diffMs);
  if (diffDays <= -1) {
    return "Suresi gecti";
  }
  if (diffDays < 0) {
    return "Bugun teslim";
  }
  if (diffDays < 0.5) {
    return "Saatler icinde teslim";
  }
  return `${Math.ceil(diffDays)} gun kaldi`;
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

function categorizeItems(items, settings) {
  const now = Date.now();
  const groups = {
    dueSoon: [],
    longTerm: [],
    overdue: []
  };

  items.forEach((item) => {
    if (!item.dueTimestamp) {
      return;
    }

    const diffMs = item.dueTimestamp - now;
    const diffDays = msToDays(diffMs);

    if (diffDays < 0) {
      groups.overdue.push({ ...item, diffMs });
    } else if (diffDays <= settings.dueSoonDays) {
      groups.dueSoon.push({ ...item, diffMs });
    } else if (diffDays >= settings.longTermDays) {
      groups.longTerm.push({ ...item, diffMs });
    } else {
      groups.dueSoon.push({ ...item, diffMs });
    }
  });

  categoryOrder.forEach((category) => {
    groups[category].sort(
      (a, b) => (a.dueTimestamp ?? Infinity) - (b.dueTimestamp ?? Infinity)
    );
  });

  return groups;
}

function createAssignmentElement(assignment) {
  const clone = template.content.firstElementChild.cloneNode(true);
  const titleEl = clone.querySelector(".assignment-title");
  const dueLabelEl = clone.querySelector(".due-label");
  const dueCountdownEl = clone.querySelector(".due-countdown");

  titleEl.textContent = assignment.title || "Baslik bulunamadi";

  if (assignment.dueTimestamp) {
    const dueDate = new Date(assignment.dueTimestamp);
    dueLabelEl.textContent = formatDate(dueDate);
    const diffMs =
      assignment.diffMs ?? assignment.dueTimestamp - Date.now();
    dueCountdownEl.textContent = formatCountdown(diffMs);
  } else {
    dueLabelEl.textContent = assignment.dueDateText || "Tarih bulunamadi";
    dueCountdownEl.textContent = "";
  }

  return clone;
}

function createExamElement(exam) {
  const clone = examTemplate.content.firstElementChild.cloneNode(true);
  const titleEl = clone.querySelector(".assignment-title");
  const dueLabelEl = clone.querySelector(".due-label");
  const dueCountdownEl = clone.querySelector(".due-countdown");
  const joinButton = clone.querySelector(".exam-join");

  titleEl.textContent = exam.title || "Baslik bulunamadi";

  if (exam.dueTimestamp) {
    const dueDate = new Date(exam.dueTimestamp);
    dueLabelEl.textContent = formatDate(dueDate);
    const diffMs = exam.diffMs ?? exam.dueTimestamp - Date.now();
    dueCountdownEl.textContent = formatCountdown(diffMs);
  } else {
    dueLabelEl.textContent = exam.dateRangeText || "Tarih bulunamadi";
    dueCountdownEl.textContent = exam.statusText || "";
  }

  if (exam.joinUrl) {
    joinButton.href = exam.joinUrl;
  } else {
    joinButton.remove();
  }

  return clone;
}

function clearCategories(container) {
  container.querySelectorAll(".category").forEach((categoryEl) => {
    categoryEl.classList.add("empty");
  });
  container.querySelectorAll(".category-body").forEach((body) => {
    body.innerHTML = "";
  });
}

function renderAssignments(groups) {
  clearCategories(assignmentsContainer);

  categoryOrder.forEach((category) => {
    const categoryEl = assignmentsContainer.querySelector(
      `.category[data-category="${category}"]`
    );
    if (!categoryEl) {
      return;
    }

    const body = categoryEl.querySelector(".category-body");
    const items = groups[category];

    if (!items?.length) {
      categoryEl.classList.add("empty");
      return;
    }

    categoryEl.classList.remove("empty");
    body.innerHTML = "";
    items.forEach((assignment) => {
      const element = createAssignmentElement(assignment);
      body.appendChild(element);
    });
  });
}

function renderExams(groups) {
  clearCategories(examsContainer);

  categoryOrder.forEach((category) => {
    const categoryEl = examsContainer.querySelector(
      `.category[data-category="${category}"]`
    );
    if (!categoryEl) {
      return;
    }

    const body = categoryEl.querySelector(".category-body");
    const items = groups[category];

    if (!items?.length) {
      categoryEl.classList.add("empty");
      return;
    }

    categoryEl.classList.remove("empty");
    body.innerHTML = "";
    items.forEach((exam) => {
      const element = createExamElement(exam);
      body.appendChild(element);
    });
  });
}

function updateCategoryVisibilityFor(container) {
  container.querySelectorAll(".category").forEach((section) => {
    const category = section.dataset.category;
    const isActive = category === activeCategory;
    section.hidden = !isActive;
    section.setAttribute("aria-hidden", String(!isActive));
  });
}

function updateTabStates() {
  tabButtons.forEach((button) => {
    const category = button.dataset.categoryTab;
    const isActive = category === activeCategory;
    button.setAttribute("aria-selected", String(isActive));
    button.classList.toggle("is-active", isActive);
  });
}

function setActiveCategory(category, { focus = true } = {}) {
  if (!categoryOrder.includes(category)) {
    return;
  }

  activeCategory = category;
  updateTabStates();
  updateCategoryVisibilityFor(getActiveContainer());

  if (focus) {
    const activeButton = tabButtons.find(
      (btn) => btn.dataset.categoryTab === category
    );
    activeButton?.focus();
  }
}

function ensureActiveCategory(groups) {
  if (groups[activeCategory]?.length) {
    updateCategoryVisibilityFor(getActiveContainer());
    updateTabStates();
    return;
  }

  const fallback =
    categoryOrder.find((category) => groups[category]?.length) ||
    categoryOrder[0];
  setActiveCategory(fallback, { focus: false });
}

function setStatus(message, type = "info") {
  statusMessageEl.textContent = message;
  statusMessageEl.dataset.status = type;
}

function toggleMainVisibility(show) {
  const showAssignments = show && activeMode === "assignments";
  const showExams = show && activeMode === "exams";
  assignmentsContainer.hidden = !showAssignments;
  examsContainer.hidden = !showExams;
  tabsNav.hidden = !show;
  modeTabs.hidden = false;
}

function getActiveContainer() {
  return activeMode === "exams" ? examsContainer : assignmentsContainer;
}

function updateModeTabs() {
  modeButtons.forEach((button) => {
    const mode = button.dataset.modeTab;
    const isActive = mode === activeMode;
    button.setAttribute("aria-selected", String(isActive));
    button.classList.toggle("is-active", isActive);
  });
}

function setActiveMode(mode) {
  if (!["assignments", "exams"].includes(mode)) {
    return;
  }

  activeMode = mode;
  updateModeTabs();
  updateTabStates();
  updateCategoryVisibilityFor(getActiveContainer());

  if (activeMode === "assignments") {
    fetchAssignments();
  } else {
    fetchExams();
  }
}

async function fetchAssignments() {
  setStatus("Veriler toplaniyor...", "info");
  toggleMainVisibility(false);
  lastUpdatedEl.textContent = "";

  try {
    const settings = await loadSettings();
    const response = await chrome.runtime.sendMessage({
      type: "FETCH_ASSIGNMENTS"
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Bilinmeyen hata");
    }

    const { assignments, collectedAt, sourceUrl } = response.data;
    if (!assignments?.length) {
      setStatus(
        "Odev duyurusu bulunamadi. SABIS duyurularinda yeni icerik olup olmadigini kontrol edin.",
        "warning"
      );
      return;
    }

    const groups = categorizeItems(assignments, settings);
    renderAssignments(groups);
    ensureActiveCategory(groups);

    toggleMainVisibility(true);
    setStatus(`Toplam ${assignments.length} odev bulundu.`, "success");

    if (collectedAt) {
      const collectedDate = new Date(collectedAt);
      lastUpdatedEl.textContent = `Guncelleme: ${formatDate(collectedDate)}`;
    }

    openSabisLink.href = SABIS_HOME_URL;
  } catch (error) {
    toggleMainVisibility(false);
    lastUpdatedEl.textContent = "";
    setStatus(error.message, "error");
  }
}

async function fetchExams() {
  setStatus("Sınavlar toplanıyor...", "info");
  toggleMainVisibility(false);
  lastUpdatedEl.textContent = "";

  try {
    const settings = await loadSettings();
    const response = await chrome.runtime.sendMessage({
      type: "FETCH_EXAMS"
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Bilinmeyen hata");
    }

    const { exams, collectedAt } = response.data;
    if (!exams?.length) {
      setStatus(
        "Sınav listesi bulunamadı. SABIS'te aktif dönemin açık olduğundan emin olun.",
        "warning"
      );
      return;
    }

    const groups = categorizeItems(exams, settings);
    renderExams(groups);
    ensureActiveCategory(groups);

    toggleMainVisibility(true);
    setStatus(`Toplam ${exams.length} sınav bulundu.`, "success");

    if (collectedAt) {
      const collectedDate = new Date(collectedAt);
      lastUpdatedEl.textContent = `Guncelleme: ${formatDate(collectedDate)}`;
    }

    openSabisLink.href = SABIS_HOME_URL;
  } catch (error) {
    toggleMainVisibility(false);
    lastUpdatedEl.textContent = "";
    setStatus(error.message, "error");
  }
}

function initEventListeners() {
  refreshButton.addEventListener("click", () => {
    if (activeMode === "assignments") {
      fetchAssignments();
    } else {
      fetchExams();
    }
  });

  openSettingsLink.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.categoryTab;
      setActiveCategory(category);
    });
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.modeTab;
      setActiveMode(mode);
    });
  });
}

async function init() {
  initEventListeners();
  updateModeTabs();
  updateCategoryVisibilityFor(getActiveContainer());
  updateTabStates();
  await initNoteToggle();
  await fetchAssignments();
}

document.addEventListener("DOMContentLoaded", init);
