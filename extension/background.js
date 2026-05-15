chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["sameTakeSettings"], (result) => {
    if (!result.sameTakeSettings) {
      chrome.storage.local.set({
        sameTakeSettings: {
          enabled: true,
          allowedRepeats: 3,
          resetVersion: Date.now()
        }
      });
    }
  });
});
