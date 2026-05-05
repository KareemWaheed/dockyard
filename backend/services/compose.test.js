const yaml = require('js-yaml');
const { detectMode, extractVarName, buildServiceBlock, setManagedLabelInCompose, updateEnvVar } = require('./compose');

// detectMode: literal image
console.assert(detectMode('192.0.2.100:5000/my-frontend:test-r15') === 'compose', 'literal → compose mode');

// detectMode: variable image
console.assert(detectMode('${DOCKER_REGISTRY}/my-frontend:${IMAGE_TAG}') === 'env', 'variable → env mode');
console.assert(detectMode('myrepo/name:${TAG}') === 'env', 'partial variable → env mode');

// extractVarName: gets the tag variable name from image line
console.assert(extractVarName('${DOCKER_REGISTRY}/name:${IMAGE_TAG}') === 'IMAGE_TAG', 'extracts last var');
console.assert(extractVarName('repo/name:${TAG}') === 'TAG', 'extracts TAG');

// buildServiceBlock: creates valid YAML for a new service
const block = buildServiceBlock({
  name: 'frontend-client2',
  image: '192.0.2.100:5000/my-frontend:test-r15',
  ports: ['3001:80'],
  environment: { API_URL: 'http://192.0.2.1:4002/app-api', TZ: 'UTC' },
  restart: 'always',
});
console.assert(block.includes('frontend-client2:'), 'block has service name');
console.assert(block.includes('com.dockyard.managed: "true"'), 'managed label auto-added');
console.assert(block.includes('3001:80'), 'port included');

const toggledOn = setManagedLabelInCompose(`services:\n  app:\n    image: nginx:latest\n`, 'app', true);
console.assert(toggledOn.includes('com.dockyard.managed: "true"'), 'managed label can be added');

const toggledOff = setManagedLabelInCompose(`services:\n  app:\n    image: nginx:latest\n    labels:\n      com.dockyard.managed: "true"\n      com.example.keep: "yes"\n`, 'app', false);
console.assert(!toggledOff.includes('com.dockyard.managed: "true"'), 'managed label can be removed');
console.assert(yaml.load(toggledOff).services.app.labels['com.example.keep'] === 'yes', 'other labels are preserved');

// updateEnvVar: targeted in-place replacement — preserves comments and blank lines
const envFile = '# registry\nDOCKER_REGISTRY=192.168.1.10:5000\n\nIMAGE_TAG=v1.2.3\nDB_HOST=db.internal\n';
const updated = updateEnvVar(envFile, 'IMAGE_TAG', 'v1.3.0');
console.assert(updated.includes('IMAGE_TAG=v1.3.0'), 'tag updated');
console.assert(updated.includes('# registry'), 'comment preserved');
console.assert(updated.includes('DOCKER_REGISTRY=192.168.1.10:5000'), 'other var preserved');
console.assert(updated.includes('DB_HOST=db.internal'), 'third var preserved');
console.assert(!updated.includes('IMAGE_TAG=v1.2.3'), 'old tag gone');

// updateEnvVar: appends if variable not present
const envWithout = 'OTHER=value\n';
const appended = updateEnvVar(envWithout, 'NEW_VAR', 'hello');
console.assert(appended.includes('NEW_VAR=hello'), 'new var appended');
console.assert(appended.includes('OTHER=value'), 'existing var preserved when appending');

// updateEnvVar: handles empty .env (e.g. file not found returns '')
const fromEmpty = updateEnvVar('', 'IMAGE_TAG', 'v1.0.0');
console.assert(fromEmpty.trim() === 'IMAGE_TAG=v1.0.0', 'works on empty content');

console.log('compose tests passed');
