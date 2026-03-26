const router = require('express').Router();
const { spawn } = require('child_process');
const path = require('path');
const db = require('../db');

// POST /api/awssg/whitelist  body: { env: 'stage'|'prod' }
// Streams output via chunked plain text
router.post('/whitelist', (req, res) => {
  const { env } = req.body;
  if (!env) {
    return res.status(400).json({ error: 'env is required' });
  }

  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
  if (!server.aws_sg_id) return res.status(400).json({ error: `No AWS Security Group configured for ${env}. Set it in Settings → Servers.` });

  const awsSgRow = db.prepare("SELECT value_json FROM app_config WHERE key = 'awsSg'").get();
  const awsSg = awsSgRow ? JSON.parse(awsSgRow.value_json) : {};
  const description = awsSg.description;
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'aws-sg.sh');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const proc = spawn('bash', [scriptPath, '-g', server.aws_sg_id, '-d', description, '-e', env], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      ...(awsSg.accessKeyId && { AWS_ACCESS_KEY_ID: awsSg.accessKeyId }),
      ...(awsSg.secretAccessKey && { AWS_SECRET_ACCESS_KEY: awsSg.secretAccessKey }),
      ...(awsSg.region && { AWS_DEFAULT_REGION: awsSg.region }),
    },
  });

  proc.stdout.on('data', (d) => res.write(d));
  proc.stderr.on('data', (d) => res.write(d));
  proc.on('close', (code) => {
    res.write(`\n__EXIT_CODE__${code}`);
    res.end();
  });
});

module.exports = router;
