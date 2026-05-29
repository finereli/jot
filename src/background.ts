// Service worker: routes the keyboard command to the active tab's content script.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-note-mode') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, { type: 'jot:toggle' }).catch(() => {
        // No content script on this page (e.g. chrome:// pages). Ignore.
      });
    }
  });
});
