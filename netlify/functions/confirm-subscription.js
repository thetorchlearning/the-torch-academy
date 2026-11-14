const crypto = require('node:crypto');
const { connectLambda, getStore } = require('@netlify/blobs');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed.' });
  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return json(400, { message: 'This confirmation request is invalid.' }); }
  const token = typeof payload.token === 'string' ? payload.token : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return json(400, { message: 'This confirmation link is invalid or incomplete.' });

  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_LIST_ID || '3');
  if (!apiKey || !Number.isInteger(listId) || listId < 1) {
    console.error('Confirmation service is missing required Brevo settings.');
    return json(503, { message: 'We cannot complete your confirmation right now. Please try again later.' });
  }

  try {
    connectLambda(event);
    const pending = getStore('torch-insights-pending');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = await pending.get(tokenHash, { type: 'json', consistency: 'strong' });
    if (!record) return json(400, { message: 'This confirmation link has already been used or is invalid. Please subscribe again if you still wish to join.' });
    if (!record.email || !Number.isFinite(record.expiresAt) || Date.now() > record.expiresAt) {
      await pending.delete(tokenHash);
      return json(410, { message: 'This confirmation link has expired. Please subscribe again to receive a new one.' });
    }

    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ email: record.email, listIds: [listId], updateEnabled: true }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('Brevo could not add the confirmed subscriber:', response.status, detail.slice(0, 400));
      return json(502, { message: 'Your email was confirmed, but we could not finish adding it to the subscriber list. Please try again shortly.' });
    }

    await pending.delete(tokenHash);
    return json(200, { message: 'Your email address has been confirmed. Welcome to the Torch Insights community!' });
  } catch (error) {
    console.error('Subscription confirmation error:', error.message);
    return json(502, { message: 'We could not complete your confirmation right now. Please try again later.' });
  }
};
