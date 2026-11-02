document.getElementById('open-modal-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status-msg');
  statusEl.style.display = 'none';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('aistudio.google.com')) {
    statusEl.textContent = '⚠️ Please open aistudio.google.com/generate-speech first.';
    statusEl.style.display = 'block';
    return;
  }

  try {
    // Always re-inject latest content.css and content.js so updates apply without needing a tab refresh
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    setTimeout(async () => {
      await chrome.tabs.sendMessage(tab.id, { action: 'OPEN_IMPORTER_MODAL' });
      window.close();
    }, 100);
  } catch (err) {
    statusEl.textContent = `⚠️ Error: ${err.message}`;
    statusEl.style.display = 'block';
  }
});
