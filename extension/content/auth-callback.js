// Injected into the AniList callback success page.
// Reads session from localStorage (written by the success page script)
// and forwards it to the background via chrome.runtime.sendMessage.
(function () {
  const raw = localStorage.getItem('omnisync_pending_session');
  if (!raw) return;
  try {
    const session = JSON.parse(raw);
    localStorage.removeItem('omnisync_pending_session');
    chrome.runtime.sendMessage({ action: 'SAVE_SESSION', session }, () => {
      // After background saves it, close this tab
      window.close();
    });
  } catch (e) {
    console.error('[OmniSync] Failed to parse pending session', e);
  }
})();
