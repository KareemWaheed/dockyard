// backend/routes/history.js
const router = require('express').Router();
const db = require('../db');

// GET /api/history — all envs
router.get('/', (req, res) => {
  const { container, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM deploy_history';
  const params = [];
  if (container) {
    sql += ' WHERE container_name = ?';
    params.push(container);
  }
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  res.json(db.prepare(sql).all(...params));
});

// GET /api/history/:env — single env
router.get('/:env', (req, res) => {
  const { env } = req.params;
  const { container, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM deploy_history WHERE env = ?';
  const params = [env];
  if (container) {
    sql += ' AND container_name = ?';
    params.push(container);
  }
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
