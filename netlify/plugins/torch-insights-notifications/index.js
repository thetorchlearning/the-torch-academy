const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');

const STATE_FILE = path.join('.netlify', 'torch-insights-notification-state.json');
const SITE = 'https://thetorchacademy.ng';

function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;',
  })[character]);
}

function campaignHtml(article) {
  return `<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>New on Torch Insights</title></head>
  <body style=\"margin:0;padding:28px 12px;background:#f4f6f2;font-family:Arial,Helvetica,sans-serif;color:#26352b;\">
    <div style=\"max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e3e9e2;border-radius:16px;overflow:hidden;\">
      <div style=\"padding:26px 30px;background:#0b4b2b;color:#ffffff;\"><p style=\"margin:0 0 8px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;\">The Torch Academy</p><h1 style=\"margin:0;font-size:25px;line-height:1.25;\">Torch Insights</h1></div>
      <div style=\"padding:30px;\"><p style=\"margin:0 0 12px;color:#52715d;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;\">A new article is here</p>
      <h2 style=\"margin:0 0 16px;color:#0b4b2b;font-size:25px;line-height:1.3;\">{{params.ARTICLE_TITLE}}</h2>
      <p style=\"margin:0 0 24px;font-size:16px;line-height:1.7;color:#4b5b50;\">{{params.ARTICLE_EXCERPT}}</p>
      <a href=\"{{params.ARTICLE_URL}}\" style=\"display:inline-block;padding:13px 20px;border-radius:8px;background:#0b4b2b;color:#ffffff;text-decoration:none;font-weight:bold;\">Read the article</a>
      <p style=\"margin:28px 0 0;font-size:14px;line-height:1.6;color:#647267;\">Thank you for being part of the Torch Insights community.</p></div>
      <div style=\"padding:20px 30px;background:#f7f8f5;border-top:1px solid #e8ece6;font-size:12px;line-height:1.7;color:#718075;\">You are receiving this email because you subscribed to Torch Insights.<br><a href=\"{{ unsubscribe }}\" style=\"color:#0b4b2b;\">Unsubscribe</a> from future updates.</div>
    </div></body></html>`;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { queue: {}, sent: {} }; }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function brevoRequest(url, apiKey, options = {}) {
  const response = await fetch(`https://api.brevo.com/v3${url}`, {
    ...options,
    headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`Brevo API ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

module.exports = {
  async onPreBuild({ utils }) {
    await utils.cache.restore(STATE_FILE);
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    if (!fs.existsSync(STATE_FILE)) saveState({ queue: {}, sent: {} });
  },

  async onSuccess({ utils }) {
    const state = readState();
    state.queue = state.queue || {};
    state.sent = state.sent || {};

    // Queue only newly created article files, never edits to existing articles.
    const created = utils.git.fileMatch('blog/posts/*.md').created || [];
    for (const relativeFile of created) {
      const absoluteFile = path.resolve(relativeFile);
      if (!fs.existsSync(absoluteFile)) continue;
      const parsed = matter(fs.readFileSync(absoluteFile, 'utf8'));
      const data = parsed.data || {};
      const slug = slugify(data.slug || path.basename(relativeFile, '.md'));
      if (!slug || state.sent[slug] || state.queue[slug]) continue;
      const title = String(data.title || path.basename(relativeFile, '.md')).trim();
      const excerpt = String(data.description || parsed.content.replace(/[#>*_`\[\]()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)).trim();
      state.queue[slug] = { title, excerpt, articleUrl: `${SITE}/blog/${slug}/`, status: 'queued' };
    }
    saveState(state);
    await utils.cache.save(STATE_FILE);

    const queuedSlugs = Object.keys(state.queue).filter((slug) => state.queue[slug]?.status !== 'sent');
    if (!queuedSlugs.length) {
      console.log('Torch Insights: no newly published articles are waiting for notification.');
      return;
    }

    const apiKey = process.env.BREVO_API_KEY;
    const listId = Number(process.env.BREVO_LIST_ID || '3');
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || 'The Torch Academy';

    if (!apiKey || !senderEmail || !Number.isInteger(listId) || listId < 1) {
      console.log('Torch Insights: Brevo notification settings are incomplete. Queued article notifications will wait; the website deploy remains successful.');
      return;
    }

    for (const slug of queuedSlugs) {
      const article = state.queue[slug];
      try {
        if (!article.campaignId) {
          const commit = process.env.COMMIT_REF || 'deploy';
          const campaignName = `Torch Insights - ${slug} - ${commit.slice(0, 12)}`;
          const campaign = await brevoRequest('/emailCampaigns', apiKey, {
            method: 'POST',
            body: JSON.stringify({
              name: campaignName,
              sender: { name: senderName, email: senderEmail },
              subject: `New on Torch Insights: ${article.title}`,
              previewText: 'A fresh perspective on education, learning and the communities that shape them.',
              recipients: { listIds: [listId] },
              htmlContent: campaignHtml(article),
              params: {
                ARTICLE_TITLE: escapeHtml(article.title),
                ARTICLE_EXCERPT: escapeHtml(article.excerpt),
                ARTICLE_URL: article.articleUrl,
              },
            }),
          });
          if (!campaign.id) throw new Error('Brevo did not return a campaign ID.');
          article.campaignId = campaign.id;
          article.campaignName = campaignName;
          article.status = 'pending';
          saveState(state);
          await utils.cache.save(STATE_FILE);
        }

        await brevoRequest(`/emailCampaigns/${article.campaignId}/sendNow`, apiKey, { method: 'POST', body: '{}' });
        article.status = 'sent';
        article.sentAt = new Date().toISOString();
        state.sent[slug] = { campaignId: article.campaignId, sentAt: article.sentAt };
        saveState(state);
        await utils.cache.save(STATE_FILE);
        delete state.queue[slug];
        saveState(state);
        await utils.cache.save(STATE_FILE);
        console.log(`Torch Insights: campaign ${article.campaignId} sent for newly published article: ${article.title}.`);
      } catch (error) {
        console.error(`Torch Insights: notification for "${article.title}" is still queued and will be retried after a later successful deploy.`, error.message);
      }
    }
  },
};
