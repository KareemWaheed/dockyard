const nodemailer = require('nodemailer');
const db = require('../db');

async function notifyDeploy({ env, container, action, fromTag, toTag, durationMs, success, error }) {
  const rows = db.prepare('SELECT * FROM notifications WHERE enabled = 1').all();
  const matching = rows.filter(row => {
    if (!row.envs_json) return true;
    const envs = JSON.parse(row.envs_json);
    return envs.includes(env);
  });

  const payload = {
    event: success ? 'deploy.success' : 'deploy.failure',
    env,
    container,
    action,
    from_tag: fromTag ?? null,
    to_tag: toTag ?? null,
    duration_ms: durationMs ?? null,
    timestamp: new Date().toISOString(),
    error: error ?? null,
  };

  await Promise.allSettled(matching.map(row => fireNotifier(row, payload)));
}

// Sends one notification; throws when the channel rejects it.
async function sendNotifier(row, payload) {
  const cfg = JSON.parse(row.config_json);
  if (row.type === 'webhook') {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.headers || {}) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Webhook ${cfg.url} returned ${res.status}`);
  } else if (row.type === 'email') {
    const transporter = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transporter.sendMail({
      from: cfg.from,
      to: cfg.to,
      subject: `[Namaa] ${payload.event} — ${payload.env}/${payload.container}`,
      text: JSON.stringify(payload, null, 2),
    });
  } else {
    throw new Error(`Unsupported notifier type "${row.type}"`);
  }
}

// Deploy notifications never fail the deploy: errors are only logged.
async function fireNotifier(row, payload) {
  try {
    await sendNotifier(row, payload);
  } catch (err) {
    console.error(`[notify] Failed to fire notifier "${row.label}":`, err.message);
  }
}

// Sends a sample event to one notifier, whatever its enabled flag or env filter,
// and lets its error surface so the settings page can show it.
async function sendTestNotification(row) {
  await sendNotifier(row, {
    event: 'deploy.success',
    env: 'test',
    container: 'test-container',
    action: 'restart',
    from_tag: null,
    to_tag: null,
    duration_ms: 0,
    timestamp: new Date().toISOString(),
    error: null,
    test: true,
  });
}

module.exports = { notifyDeploy, sendTestNotification };
