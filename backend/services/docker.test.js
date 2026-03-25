const { parseComposePs, parseInspect } = require('./docker');

// Test parseComposePs
const psOutput = JSON.stringify({ Name: 'frontend', State: 'running', Image: 'my-frontend:test-r15-s1' })
  + '\n'
  + JSON.stringify({ Name: 'backend', State: 'exited', Image: 'my-backend:test-r15-s1' });

const containers = parseComposePs(psOutput);
console.assert(containers.length === 2, 'should parse 2 containers');
console.assert(containers[0].name === 'frontend', 'first container name');
console.assert(containers[0].status === 'running', 'first container status');
console.assert(containers[1].status === 'stopped', 'exited maps to stopped');

// Test parseInspect
const inspectOutput = JSON.stringify([{
  Config: {
    Image: 'my-frontend:test-r15-s1',
    Labels: { 'com.namaa.dashboard.managed': 'true' },
    Env: ['API_URL=http://192.0.2.1:4001/app-api', 'TZ=UTC']
  },
  State: { Status: 'running' }
}]);

const info = parseInspect(inspectOutput);
console.assert(info.managed === true, 'managed label should be true');
console.assert(info.env.API_URL === 'http://192.0.2.1:4001/app-api', 'env should parse');
console.assert(info.image === 'my-frontend:test-r15-s1', 'image should parse');

console.log('docker parser tests passed');
