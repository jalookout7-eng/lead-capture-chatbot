const webpush = require('web-push');
const { getConfig, setConfig } = require('./config-store');

const VAPID_SUBJECT = 'mailto:john.alexander@3dvisualpro.com';

let configured = false;

/**
 * Generate VAPID keys on first boot if missing, persist to scraper_config,
 * then call webpush.setVapidDetails. Safe to call multiple times — only
 * generates once. Idempotent.
 */
async function bootstrapVapid() {
  let publicKey = await getConfig('vapid_public_key');
  let privateKey = await getConfig('vapid_private_key');

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await setConfig('vapid_public_key', publicKey);
    await setConfig('vapid_private_key', privateKey);
    console.log('[vapid] Generated and persisted new VAPID keys.');
  }

  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  configured = true;
}

function isConfigured() { return configured; }

module.exports = { bootstrapVapid, isConfigured };
