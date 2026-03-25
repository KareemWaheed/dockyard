// backend/db.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temp config and temp db for the test
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'namaa-db-test-'));
const tmpConfig = path.join(tmpDir, 'config.json');
const tmpDb = path.join(tmpDir, 'dashboard.db');

const testConfig = {
  awsSg: { region: 'us-east-1', groupId: 'sg-abc' },
  gitlab: { token: 'glpat-test', baseUrl: 'https://gitlab.example.com' },
  projects: { webapp: { name: 'webapp', repo: 'group/webapp', buildScript: './build.sh' } },
  servers: {
    dev: {
      host: '10.0.0.1',
      name: 'Development',
      dockerCompose: 'docker compose',
      ssh: { username: 'ec2-user', password: 'secret' },
      composeStacks: [{ name: 'Main', path: '/home/ec2-user/main/docker-compose.yml' }],
    },
    prod: {
      host: '10.0.0.2',
      name: 'Production',
      ssh: { username: 'ubuntu', privateKeyPath: '/home/user/.ssh/id_rsa', passphrase: 'pp' },
      composeStacks: [
        { name: 'App', path: '/app/docker-compose.yml' },
        { name: 'Monitoring', path: '/monitoring/docker-compose.yml' },
      ],
    },
  },
};

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

fs.writeFileSync(tmpConfig, JSON.stringify(testConfig));

// Point db.js at tmp paths
process.env.DB_PATH = tmpDb;
process.env.CONFIG_PATH = tmpConfig;

const db = require('./db');

// Servers migrated
const servers = db.prepare('SELECT * FROM servers ORDER BY env_key').all();
assert(servers.length === 2, 'should have 2 servers');
const dev = servers.find(s => s.env_key === 'dev');
assert(dev.host === '10.0.0.1', 'dev host');
assert(dev.ssh_password === 'secret', 'dev password');
assert(dev.ssh_key_path === null, 'dev key_path null');
assert(dev.ssh_username === 'ec2-user', 'dev ssh_username');
assert(dev.docker_compose_cmd === 'docker compose', 'dev docker_compose_cmd');
const prod = servers.find(s => s.env_key === 'prod');
assert(prod.ssh_key_path === '/home/user/.ssh/id_rsa', 'prod key path');
assert(prod.ssh_passphrase === 'pp', 'prod passphrase');

// Stacks migrated
const stacks = db.prepare('SELECT * FROM compose_stacks').all();
assert(stacks.length === 3, 'should have 3 stacks total');
const prodStacks = stacks.filter(s => s.server_id === prod.id);
assert(prodStacks.length === 2, 'prod has 2 stacks');
const devStack = stacks.find(s => s.server_id === dev.id);
assert(devStack.path === '/home/ec2-user/main/docker-compose.yml', 'dev stack path');
assert(devStack.name === 'Main', 'dev stack name');

// app_config migrated
const awsSg = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='awsSg'").get().value_json);
assert(awsSg.region === 'us-east-1', 'awsSg region');
const gitlab = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='gitlab'").get().value_json);
assert(gitlab.token === 'glpat-test', 'gitlab token');
const projects = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='projects'").get().value_json);
assert(projects.webapp.buildScript === './build.sh', 'projects migrated');

// config.json renamed to .bak
assert(!fs.existsSync(tmpConfig), 'config.json removed');
assert(fs.existsSync(tmpConfig + '.bak'), 'config.json.bak exists');

// Cleanup
db.close();
fs.rmSync(tmpDir, { recursive: true });

console.log('db migration tests passed');
