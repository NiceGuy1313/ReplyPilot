import express from 'express';
import { generate, validate } from './replies.js';
const app = express();
app.disable('x-powered-by');
// Requests come from the extension service worker, not LinkedIn's web page.
// Do not enable wildcard CORS or expose the server on the LAN.
app.use((req, res, next) => {
  if (!['localhost:3000', '127.0.0.1:3000'].includes(req.headers.host)) return res.status(403).json({ error: 'Invalid host.' });
  if (req.headers.origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin)) return res.status(403).json({ error: 'Only browser extension requests are allowed.' });
  next();
});
app.use(express.json({ limit: '64kb', type: 'application/json' }));
app.get('/health', (req, res) => res.json({ ok: true, demo: process.env.DEMO_MODE === 'true' }));
let inFlight = false;
app.post('/api/replies', async (req, res) => {
  try { validate(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
  if (inFlight) return res.status(429).json({ error: 'Replies are already being generated. Please try again shortly.' });
  inFlight = true;
  try { res.json(await generate(req.body)); }
  catch (error) { res.status(502).json({ error: error.name === 'TimeoutError' ? 'The AI API request timed out.' : error.message }); }
  finally { inFlight = false; }
});
app.use((error, req, res, next) => res.status(error.status === 413 ? 413 : 400).json({ error: 'Check the request JSON format and size.' }));
app.listen(3000, '127.0.0.1', () => console.log('ReplyPilot server: http://localhost:3000'));
