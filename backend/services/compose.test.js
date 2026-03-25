const { detectMode, extractVarName, buildServiceBlock } = require('./compose');

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

console.log('compose tests passed');
