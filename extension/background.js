chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  (async () => {
    if (message.type === 'READ_CONVERSATION') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab?.url || 'about:blank');
      if (url.hostname !== 'www.linkedin.com' || !url.pathname.startsWith('/messaging')) throw new Error('Open a LinkedIn messaging conversation first.');
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      const conversation = results[0]?.result;
      if (!conversation || conversation.error) throw new Error(conversation?.error || 'Could not read the conversation.');
      return conversation;
    }
    if (message.type === 'GENERATE_REPLIES') {
      const response = await fetch('http://localhost:3000/api/replies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message.payload), signal: AbortSignal.timeout(25000)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not generate replies.');
      if (!Array.isArray(result.replies) || result.replies.length !== 3 || result.replies.some(x => typeof x !== 'string' || !x.trim())) throw new Error('The server returned an invalid reply format.');
      return result;
    }
    throw new Error('Unsupported request.');
  })().then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, error: error.name === 'TimeoutError' ? 'The server request timed out.' : error.message === 'Failed to fetch' ? 'Start the local server at localhost:3000.' : error.message }));
  return true;
});
