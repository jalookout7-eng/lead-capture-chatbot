const webpush = require('web-push');
const { Resend } = require('resend');
const { loadAllConfig } = require('./config-store');
const { getClient } = require('../db/client');

const SUBSCRIPTION_GONE_CODES = [404, 410];

function substituteName(template, name) {
  return String(template || '').replace(/\{\{name\}\}/g, name || '');
}

async function loadPushSubscriptions() {
  const client = getClient();
  const result = await client.execute({
    sql: 'SELECT id, endpoint, p256dh_key, auth_key FROM push_subscriptions',
    args: []
  });
  return result.rows;
}

async function deletePushSubscription(id) {
  const client = getClient();
  await client.execute({
    sql: 'DELETE FROM push_subscriptions WHERE id = ?',
    args: [id]
  });
}

async function markSubscriptionUsed(id) {
  const client = getClient();
  await client.execute({
    sql: 'UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?',
    args: [new Date().toISOString(), id]
  });
}

async function sendWebPush(lead, _config) {
  const subscriptions = await loadPushSubscriptions();
  if (!subscriptions.length) return { sent: 0 };

  const payload = JSON.stringify({
    title: `New ${lead.score} lead`,
    body: `${lead.name} · ${lead.product}`,
    url: `/admin/?leadId=${lead.id}`
  });

  let sent = 0;
  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh_key, auth: sub.auth_key }
    };
    try {
      await webpush.sendNotification(pushSubscription, payload);
      await markSubscriptionUsed(sub.id);
      sent++;
    } catch (err) {
      if (err && SUBSCRIPTION_GONE_CODES.includes(err.statusCode)) {
        await deletePushSubscription(sub.id);
        console.log(`[notifications] Removed expired subscription ${sub.id}`);
      } else {
        console.error('[notifications] Web push failed for', sub.id, err && err.message ? err.message : err);
      }
    }
  }
  return { sent };
}

function buildTeamEmailHtml(lead) {
  const bottlenecks = Array.isArray(lead.bottlenecks)
    ? lead.bottlenecks
    : (typeof lead.bottlenecks === 'string' ? safeParseArray(lead.bottlenecks) : []);
  const bnHtml = bottlenecks.length
    ? '<ul>' + bottlenecks.map(b => `<li>${escapeHtml(b)}</li>`).join('') + '</ul>'
    : '<p>(none)</p>';
  return `
<h2>New lead captured</h2>
<table>
  <tr><td><b>Name</b></td><td>${escapeHtml(lead.name)}</td></tr>
  <tr><td><b>Email</b></td><td>${escapeHtml(lead.email)}</td></tr>
  <tr><td><b>Phone</b></td><td>${escapeHtml(lead.phone || '—')}</td></tr>
  <tr><td><b>Product</b></td><td>${escapeHtml(lead.product)}</td></tr>
  <tr><td><b>Score</b></td><td>${escapeHtml(lead.score)}</td></tr>
</table>
<h3>Summary</h3>
<p>${escapeHtml(lead.summary || '')}</p>
<h3>Bottlenecks</h3>
${bnHtml}
<h3>Suggested follow-up</h3>
<blockquote>${escapeHtml(lead.followup || '')}</blockquote>
<p><a href="https://lead-capture-chatbot-beta.vercel.app/admin/?leadId=${encodeURIComponent(lead.id)}">Open in Mission Control →</a></p>
`;
}

function safeParseArray(s) {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendTeamEmail(lead, config) {
  if (config.notify_team_email !== 'true') return { skipped: 'disabled' };
  if (!config.resend_api_key) return { skipped: 'no_api_key' };
  // Recipient defaults to from-address (sender's own inbox) when notification_recipient is unset.
  // Set notification_recipient explicitly to route alerts to a different address (e.g., Gmail for testing).
  const recipient = (config.notification_recipient && config.notification_recipient.includes('@'))
    ? config.notification_recipient
    : config.resend_from_address;
  const resend = new Resend(config.resend_api_key);
  const result = await resend.emails.send({
    from: config.resend_from_address,
    to: recipient,
    subject: `New ${lead.score} lead — ${lead.name}`,
    html: buildTeamEmailHtml(lead)
  });
  return { sent: true, id: result?.id };
}

async function sendLeadConfirmation(lead, config) {
  if (config.notify_lead_confirmation !== 'true') return { skipped: 'disabled' };
  if (!config.resend_api_key) return { skipped: 'no_api_key' };
  if (!lead.email || !lead.email.includes('@')) return { skipped: 'invalid_email' };
  const resend = new Resend(config.resend_api_key);
  const subject = substituteName(config.lead_confirmation_subject, lead.name);
  const html = substituteName(config.lead_confirmation_body, lead.name);
  const result = await resend.emails.send({
    from: config.resend_from_address,
    to: lead.email,
    subject,
    html
  });
  return { sent: true, id: result?.id };
}

async function notifyNewLead(lead) {
  const config = await loadAllConfig();
  const results = await Promise.allSettled([
    sendWebPush(lead, config),
    sendTeamEmail(lead, config),
    sendLeadConfirmation(lead, config)
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[notifications] Worker ${i} rejected:`, r.reason && r.reason.message ? r.reason.message : r.reason);
    }
  });
  return results;
}

module.exports = { notifyNewLead, sendWebPush, sendTeamEmail, sendLeadConfirmation, substituteName };
