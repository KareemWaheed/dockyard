const router = require('express').Router();
const db = require('../db');
const { isValidName } = require('../services/shell');
const { splitImage, recentBuildsForRepo, previousTags } = require('../services/suggestions');

// GET /api/deploy-suggestions/:env/:service?image=<current image>&current=<current tag>
// otherEnvs is filled in by the frontend from data it already has (no SSH here).
router.get('/:env/:service', (req, res) => {
  const { env, service } = req.params;
  if (!isValidName(service)) return res.status(400).json({ error: 'Invalid service name' });
  const image = String(req.query.image || '');
  const current = String(req.query.current || '');

  const runs = db
    .prepare(
      `SELECT project, build_number, branch, finished_at, pushed_images_json FROM build_runs
       WHERE type = 'build' AND status = 'success' AND pushed_images_json IS NOT NULL
       ORDER BY id DESC LIMIT 20`,
    )
    .all();
  const rows = db
    .prepare(
      `SELECT new_tag, old_tag, timestamp FROM deploy_history
       WHERE env = ? AND service_name = ? AND action = 'update-tag' AND success = 1
       ORDER BY timestamp DESC LIMIT 100`,
    )
    .all(env, service);

  res.json({
    otherEnvs: [],
    recentBuilds: image ? recentBuildsForRepo(runs, splitImage(image).repo, current) : [],
    previous: previousTags(rows, current),
  });
});

module.exports = router;
