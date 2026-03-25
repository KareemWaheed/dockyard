const router = require('express').Router();
const { spawn } = require('child_process');
const path = require('path');
const db = require('../db');

// POST /api/awssg/whitelist  body: { env: 'stage'|'prod' }
// Streams output via chunked plain text
router.post('/whitelist', (req, res) => {
  const { env } = req.body;
  if (!['stage', 'prod'].includes(env)) {
    return res.status(400).json({ error: 'env must be stage or prod' });
  }

  const awsSgRow = db.prepare("SELECT value_json FROM app_config WHERE key = 'awsSg'").get();
  const awsSg = awsSgRow ? JSON.parse(awsSgRow.value_json) : {};
  const description = awsSg.description;
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'aws-sg.sh');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const proc = spawn('bash', [scriptPath, '-d', description, '-e', env], {
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
