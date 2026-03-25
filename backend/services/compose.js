const yaml = require('js-yaml');

function detectMode(imageLine) {
  return /\$\{[^}]+\}/.test(imageLine) ? 'env' : 'compose';
}

function extractVarName(imageLine) {
  // Extract all ${VAR} references, return the last one (typically the tag variable)
  const matches = [...imageLine.matchAll(/\$\{([^}]+)\}/g)];
  if (!matches.length) return null;
  return matches[matches.length - 1][1];
}

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > -1) vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return vars;
}

function stringifyEnvFile(vars) {
  return Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
}

function updateImageInCompose(composeContent, serviceName, newTag) {
  // Replace the tag in the image line for the given service
  // Works for literal image lines: replaces everything after the last colon
  const doc = yaml.load(composeContent);
  const service = doc.services?.[serviceName];
  if (!service) throw new Error(`Service ${serviceName} not found in compose file`);

  const currentImage = service.image;
  const colonIdx = currentImage.lastIndexOf(':');
  if (colonIdx === -1) throw new Error(`Cannot parse image line: ${currentImage}`);
  service.image = currentImage.slice(0, colonIdx + 1) + newTag;
  return yaml.dump(doc, { lineWidth: -1, quotingType: '"' });
}

function updateEnvVar(envContent, varName, newValue) {
  const vars = parseEnvFile(envContent);
  vars[varName] = newValue;
  return stringifyEnvFile(vars);
}

function addEnvVarToCompose(composeContent, serviceName, key, value) {
  const doc = yaml.load(composeContent);
  const service = doc.services?.[serviceName];
  if (!service) throw new Error(`Service ${serviceName} not found`);
  if (!service.environment) service.environment = [];
  if (Array.isArray(service.environment)) {
    // Remove existing entry if present
    service.environment = service.environment.filter(e => !e.startsWith(`${key}=`));
    service.environment.push(`${key}=${value}`);
  } else {
    service.environment[key] = value;
  }
  return yaml.dump(doc, { lineWidth: -1 });
}

function appendService(composeContent, serviceDef) {
  const doc = yaml.load(composeContent);
  if (!doc.services) doc.services = {};
  doc.services[serviceDef.name] = buildServiceObject(serviceDef);
  return yaml.dump(doc, { lineWidth: -1, quotingType: '"' });
}

function buildServiceObject(def) {
  const svc = {
    container_name: def.name,
    image: def.image,
    restart: def.restart || 'always',
    labels: { 'com.dockyard.managed': 'true' },
  };
  if (def.ports?.length) svc.ports = def.ports;
  if (def.environment && Object.keys(def.environment).length) {
    svc.environment = Object.entries(def.environment).map(([k, v]) => `${k}=${v}`);
  }
  return svc;
}

function buildServiceBlock(def) {
  const obj = { [def.name]: buildServiceObject(def) };
  // Wrap in a services key for the test assertion check
  const doc = { services: obj };
  return yaml.dump(doc, { lineWidth: -1, quotingType: '"' });
}

module.exports = {
  detectMode,
  extractVarName,
  parseEnvFile,
  stringifyEnvFile,
  updateImageInCompose,
  updateEnvVar,
  addEnvVarToCompose,
  appendService,
  buildServiceBlock,
};
