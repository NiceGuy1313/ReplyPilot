import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, validate, prompt } from '../replies.js';
const body = () => ({ conversation: { contact: 'Alex', messages: [{ sender: 'Alex', role: 'contact', text: 'Hello!' }], latestMessage: 'Hello!' }, settings: { tone: 'Friendly', length: 'Medium', short: true, natural: true, avoidAI: true, noEmoji: true, instructions: '' } });
test('valid input and explicit demo mode', async () => { assert.equal((await generate(body(), { demo: true })).replies.length, 3); });
test('reject mismatched last contact message and invalid settings', () => { const b = body(); b.conversation.latestMessage = 'different'; assert.throws(() => validate(b)); const c = body(); c.settings.tone = 'invalid'; assert.throws(() => validate(c)); });
test('style priority and untrusted context instruction', () => { const p = prompt(body().settings); assert.match(p, /Length: Short/); assert.match(p, /untrusted data/); assert.match(p, /Do not use emojis/); });
test('provider payload keeps conversation separate and accepts three replies', async () => { const result = await generate(body(), { demo: false, key: 'test-only', fetcher: async (url, options) => { const sent = JSON.parse(options.body); assert.equal(url, 'https://api.anthropic.com/v1/messages'); assert.equal(options.headers['x-api-key'], 'test-only'); assert.equal(options.headers['anthropic-version'], '2023-06-01'); assert.equal(sent.model, 'claude-haiku-4-5-20251001'); assert.equal(sent.max_tokens, 2048); assert.match(sent.system, /untrusted data/); assert.equal(sent.output_config.format.type, 'json_schema'); assert.equal(sent.messages[0].role, 'user'); assert.equal(JSON.parse(sent.messages[0].content).conversation.contact, 'Alex'); return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ replies: ['One', 'Two', 'Three'] }) }] }) }; } }); assert.deepEqual(result.replies, ['One', 'Two', 'Three']); });
test('reject malformed provider output', async () => { await assert.rejects(generate(body(), { demo: false, key: 'test-only', fetcher: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{"replies":["one"]}' }] }) }) }), /three nonempty/); });

test('reject truncated or refused replies', async () => {
  for (const stop_reason of ['max_tokens', 'refusal']) {
    await assert.rejects(generate(body(), { demo: false, key: 'test-only', fetcher: async () => ({ ok: true, json: async () => ({ stop_reason, content: [{ type: 'text', text: JSON.stringify({ replies: ['One', 'Two', 'Three'] }) }] }) }) }), /could not complete/);
  }
});
test('report missing key and provider errors', async () => {
  await assert.rejects(generate(body(), { demo: false, key: '' }), /ANTHROPIC_API_KEY/);
  await assert.rejects(generate(body(), { demo: false, key: 'test-only', fetcher: async () => ({ ok: false, status: 401 }) }), /401/);
});
