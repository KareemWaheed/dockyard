// backend/services/history.js
const db = require('../db');

const insert = db.prepare(`
  INSERT INTO deploy_history
    (timestamp, env, container_name, service_name, stack_path, stack_name,
     action, old_tag, new_tag, triggered_by, success, error_message, duration_ms, note_snapshot)
  VALUES
    (@timestamp, @env, @container_name, @service_name, @stack_path, @stack_name,
     @action, @old_tag, @new_tag, @triggered_by, @success, @error_message, @duration_ms, @note_snapshot)
`);

function writeHistory({ env, containerName, serviceName, stackPath, stackName,
                        action, oldTag, newTag, success, errorMessage, durationMs, noteSnapshot }) {
  insert.run({
    timestamp: new Date().toISOString(),
    env,
    container_name: containerName,
    service_name: serviceName,
    stack_path: stackPath,
    stack_name: stackName,
    action,
    old_tag: oldTag ?? null,
    new_tag: newTag ?? null,
    triggered_by: 'manual',
    success: success ? 1 : 0,
    error_message: errorMessage ?? null,
    duration_ms: durationMs ?? null,
    note_snapshot: noteSnapshot ?? null,
  });
}

module.exports = { writeHistory };
