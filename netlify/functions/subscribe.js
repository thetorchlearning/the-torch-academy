const crypto = require('node:crypto');
const { connectLambda, getStore } = require('@netlify/blobs');

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
  body: JSON.stringify(body),
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function sendBrevoEmail(apiKey, payload) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo transactional email failed (${response.status}): ${detail.slice(0, 400)}`);
  }
  return response.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return json(400, { message: 'Please enter a valid email address.' }); }

  // Quietly accept bot submissions without forwarding them to Brevo.
  if (typeof payload.company === 'string' && payload.company.trim()) {
    return json(200, { message: 'Thank you. Please check your inbox for a confirmation email.' });
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!payload.consent || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json(400, { message: 'Please enter a valid email address and agree to receive Torch Insights.' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'The Torch Academy';
  const siteUrl = (process.env.BREVO_SITE_URL || 'https://thetorchacademy.ng').replace(/\/$/, '');
  const listId = Number(process.env.BREVO_LIST_ID || '3');
  if (!apiKey || !senderEmail || !Number.isInteger(listId) || listId < 1) {
    console.error('Subscription service is missing BREVO_API_KEY, BREVO_SENDER_EMAIL, or a valid BREVO_LIST_ID.');
    return json(503, { message: 'Subscriptions are temporarily unavailable. Please try again later.' });
  }

  try {
    connectLambda(event);
    const pending = getStore('torch-insights-pending');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    await pending.setJSON(tokenHash, { email, expiresAt, createdAt: Date.now() });

    const confirmationUrl = `${siteUrl}/blog/subscription-confirmed/?token=${encodeURIComponent(token)}`;
    const safeEmail = escapeHtml(email);
    await sendBrevoEmail(apiKey, {
      sender: { name: senderName, email: senderEmail },
      to: [{ email }],
      subject: 'Confirm your Torch Insights subscription',
      htmlContent: `<!doctype html><html lang="en"><body style="margin:0;padding:28px 12px;background:#f4f6f2;font-family:Arial,Helvetica,sans-serif;color:#26352b;"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e3e9e2;border-radius:14px;overflow:hidden;"><div style="padding:26px 30px;background:#0b4b2b;color:#fff;"><p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">The Torch Academy</p><h1 style="margin:0;font-size:25px;">Torch Insights</h1></div><div style="padding:30px;"><h2 style="margin:0 0 14px;color:#0b4b2b;">Confirm your subscription</h2><p style="font-size:16px;line-height:1.7;">Thanks for signing up for Torch Insights. Please confirm that you want to receive our email updates at <strong>${safeEmail}</strong>.</p><p style="margin:26px 0;"><a href="${confirmationUrl}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#0b4b2b;color:#fff;text-decoration:none;font-weight:bold;">Confirm my subscription</a></p><p style="font-size:13px;line-height:1.6;color:#647267;">This link expires in 24 hours. If you did not request this subscription, you can ignore this email.</p></div></div></body></html>`,
      textContent: `Thanks for signing up for Torch Insights. Confirm your subscription using this link: ${confirmationUrl}\n\nThis link expires in 24 hours. If you did not request this subscription, ignore this email.`,
    });

    return json(200, { message: 'Thank you! Please check your inbox for a confirmation email. You will only be added after confirming.' });
  } catch (error) {
    console.error('Subscription request error:', error.message);
    return json(502, { message: 'We could not send your confirmation email just now. Please try again later.' });
  }
};
