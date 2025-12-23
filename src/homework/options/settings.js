const DEFAULT_SETTINGS = {
  dueSoonDays: 3,
  longTermDays: 10
};

const form = document.querySelector("#settings-form");
const dueSoonInput = document.querySelector("#due-soon-days");
const longTermInput = document.querySelector("#long-term-days");
const statusEl = document.querySelector("#status");

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  dueSoonInput.value = settings.dueSoonDays;
  longTermInput.value = settings.longTermDays;
}

function showStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.dataset.status = type;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const dueSoonDays = Number(dueSoonInput.value);
  const longTermDays = Number(longTermInput.value);

  if (Number.isNaN(dueSoonDays) || Number.isNaN(longTermDays)) {
    showStatus("Gecerli bir sayi girin.", "error");
    return;
  }

  if (longTermDays <= dueSoonDays) {
    showStatus(
      "Uzun sureli gun sayisi, yaklasan teslimat esiginden buyuk olmali.",
      "error"
    );
    return;
  }

  await chrome.storage.sync.set({ dueSoonDays, longTermDays });
  showStatus("Ayarlar kaydedildi.", "success");
});

loadSettings().catch((error) => {
  showStatus(`Ayarlar yuklenemedi: ${error.message}`, "error");
});
