const storageArea = chrome.storage.local;
const DEFAULTS = { enabled: true, allowedRepeats: 3, resetVersion: Date.now() };

const enabledEl = document.getElementById("enabled");
const repeatsEl = document.getElementById("allowedRepeats");
const resetEl = document.getElementById("reset");
const statusEl = document.getElementById("status");
const scannedCountEl = document.getElementById("scannedCount");
const topicCountEl = document.getElementById("topicCount");
const blockedCountEl = document.getElementById("blockedCount");
const pageSignalEl = document.getElementById("pageSignal");

function setStatus(message) {
  statusEl.textContent = message;
  window.setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = "";
  }, 1800);
}

function getSettings(callback) {
  storageArea.get(["sameTakeSettings"], (result) => {
    callback({ ...DEFAULTS, ...(result.sameTakeSettings || {}) });
  });
}

function saveSettings(patch, message) {
  getSettings((settings) => {
    const next = { ...settings, ...patch };
    storageArea.set({ sameTakeSettings: next }, () => setStatus(message));
  });
}

getSettings((settings) => {
  enabledEl.checked = Boolean(settings.enabled);
  repeatsEl.value = String(settings.allowedRepeats || 3);
});

function renderMetrics(metrics) {
  scannedCountEl.textContent = String(metrics.scanned || 0);
  topicCountEl.textContent = String(metrics.topics || 0);
  blockedCountEl.textContent = String(metrics.blocked || 0);
  if (metrics.active) {
    const url = metrics.url ? new URL(metrics.url).pathname : "";
    pageSignalEl.textContent = `Active on LinkedIn ${url}`;
  } else {
    pageSignalEl.textContent = "No page signal yet";
  }
}

storageArea.get(["sameTakeMetrics"], (result) => {
  renderMetrics(result.sameTakeMetrics || {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.sameTakeMetrics) return;
  renderMetrics(changes.sameTakeMetrics.newValue || {});
});

enabledEl.addEventListener("change", () => {
  saveSettings({ enabled: enabledEl.checked }, enabledEl.checked ? "Enabled" : "Disabled");
});

repeatsEl.addEventListener("change", () => {
  saveSettings({ allowedRepeats: Number(repeatsEl.value) }, "Setting saved");
});

resetEl.addEventListener("click", () => {
  chrome.storage.local.remove(["sameTakeMemory"], () => {
    saveSettings({ resetVersion: Date.now() }, "Topic memory reset");
  });
});
