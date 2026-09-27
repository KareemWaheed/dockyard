const assert = require('assert');
const { splitImage, recentBuildsForRepo, previousTags } = require('./suggestions');

// Shared image fixtures: frontend/src/lib/image.test.js uses the SAME table.
const IMAGE_CASES = [
  ['reg.example.com/ns/frontend:16.3.0-20', 'reg.example.com/ns/frontend', '16.3.0-20'],
  ['192.0.2.1:5000/app', '192.0.2.1:5000/app', 'latest'],
  ['192.0.2.1:5000/app:1.2', '192.0.2.1:5000/app', '1.2'],
  ['repo/app@sha256:abc123', 'repo/app', 'sha256:abc123'],
  ['app', 'app', 'latest'],
  ['', '', 'latest'],
];
for (const [image, repo, tag] of IMAGE_CASES) {
  assert.deepStrictEqual(splitImage(image), { repo, tag }, `splitImage(${image})`);
}

const runs = [
  { project: 'fe', build_number: 90, branch: 'main', finished_at: '2026-09-25 10:00:00',
    pushed_images_json: JSON.stringify(['reg.example.com/ns/frontend:16.4.0-1']) },
  { project: 'fe', build_number: 89, branch: 'main', finished_at: '2026-09-24 10:00:00',
    pushed_images_json: JSON.stringify(['reg.example.com/ns/frontend:16.3.0-20']) }, // == current → excluded
  { project: 'be', build_number: 12, branch: 'dev', finished_at: '2026-09-24 09:00:00',
    pushed_images_json: JSON.stringify(['reg.example.com/ns/backend:1', 'reg.example.com/ns/frontend-sso:1']) },
  { project: 'fe', build_number: 88, branch: 'x', finished_at: null, pushed_images_json: 'not json' },
];
assert.deepStrictEqual(recentBuildsForRepo(runs, 'reg.example.com/ns/frontend', '16.3.0-20'), [
  { tag: '16.4.0-1', project: 'fe', buildNumber: 90, branch: 'main', finishedAt: '2026-09-25 10:00:00' },
]);
assert.strictEqual(recentBuildsForRepo(runs, 'reg.example.com/ns/frontend', 'zzz', 1).length, 1, 'limit respected');

const rows = [
  { new_tag: '3', old_tag: '2', timestamp: 't3' },
  { new_tag: '2', old_tag: '1', timestamp: 't2' },
  { new_tag: null, old_tag: null, timestamp: 't1' },
];
assert.deepStrictEqual(previousTags(rows, '3'), [
  { tag: '2', at: 't3' },
  { tag: '1', at: 't2' },
]);
assert.strictEqual(previousTags(rows, 'none', 2).length, 2, 'limit respected');
console.log('suggestions service tests passed');
