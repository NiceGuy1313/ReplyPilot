const $ = id => document.getElementById(id);
const defaults = { tone: 'Friendly', length: 'Short', short: true, natural: true, avoidAI: true, noEmoji: true, instructions: '' };
let conversation = null;
function settings() { return Object.fromEntries(Object.keys(defaults).map(key => [key, typeof defaults[key] === 'boolean' ? $(key).checked : $(key).value])); }
async function request(type, payload) { const result = await chrome.runtime.sendMessage({ type, payload }); if (!result?.ok) throw new Error(result?.error || 'Could not connect to the extension.'); return result.data; }
function busy(value) { $('read').disabled = value; $('generate').disabled = value || !conversation; }
(async () => {
  const stored = await chrome.storage.local.get({ settings: defaults });
  for (const [key, value] of Object.entries({ ...defaults, ...stored.settings })) if ($(key)) { if (typeof defaults[key] === 'boolean') $(key).checked = value; else $(key).value = value; }
  for (const key of Object.keys(defaults)) $(key).addEventListener('change', () => chrome.storage.local.set({ settings: settings() }).catch(() => { $('status').textContent = 'Could not save your preferences.'; }));
})().catch(() => { $('status').textContent = 'Could not load your preferences.'; });
$('read').addEventListener('click', async () => {
  conversation = null; $('preview').hidden = true; $('replies').replaceChildren(); busy(true); $('status').textContent = 'Reading conversation…';
  try { conversation = await request('READ_CONVERSATION'); $('contact').textContent = conversation.contact; $('latest').textContent = conversation.latestMessage; $('context').textContent = conversation.messages.map(m => `${m.sender}: ${m.text}`).join('\n\n'); $('preview').hidden = false; $('status').textContent = 'Review the conversation, then click Generate replies. Read again after switching threads.'; }
  catch (error) { $('status').textContent = error.message; } finally { busy(false); }
});
$('generate').addEventListener('click', async () => {
  busy(true); $('replies').replaceChildren(); $('status').textContent = 'Generating replies…';
  try {
    const result = await request('GENERATE_REPLIES', { conversation, settings: settings() });
    for (const [index, reply] of result.replies.entries()) {
      const card = document.createElement('article'); card.className = 'reply'; const text = document.createElement('p'); text.textContent = reply;
      const copy = document.createElement('button'); copy.textContent = `Copy ${index + 1}`;
      copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(reply); copy.textContent = 'Copied!'; } catch { $('status').textContent = 'Could not copy. Select and copy the reply text manually.'; } });
      card.append(text, copy); $('replies').append(card);
    }
    $('status').textContent = result.demo ? 'These are fixed demo replies. Configure the server API key and disable demo mode for live generation.' : 'Three replies are ready. Check facts and commitments before copying.';
  } catch (error) { $('status').textContent = error.message; } finally { busy(false); }
});
