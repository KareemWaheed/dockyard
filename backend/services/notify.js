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

async function fireNotifier(row, payload) {
  const cfg = JSON.parse(row.config_json);
  try {
    if (row.type === 'webhook') {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cfg.headers || {}) },
        body: JSON.stringify(payload),
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
    }
  } catch (err) {
    console.error(`[notify] Failed to fire notifier "${row.label}":`, err.message);
  }
}

module.exports = { notifyDeploy };
