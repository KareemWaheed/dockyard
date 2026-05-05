// backend/services/backup.js

function exportConfig(db) {
  const servers = db.prepare('SELECT * FROM servers').all();
  const stacks = db.prepare('SELECT * FROM compose_stacks').all();
  const notifications = db.prepare('SELECT * FROM notifications').all();
  const appConfigRows = db.prepare('SELECT key, value_json FROM app_config').all();
  const flywayEnvs = db.prepare('SELECT * FROM flyway_envs').all();
  const flywayDbs = db.prepare('SELECT * FROM flyway_databases').all();

  const app_config = {};
  for (const row of appConfigRows) {
    app_config[row.key] = JSON.parse(row.value_json);
  }

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    servers: servers.map(({ id, ...s }) => ({
      ...s,
      stacks: stacks
        .filter(st => st.server_id === id)
        .map(({ id: _id, server_id: _sid, ...st }) => st),
    })),
    notifications: notifications.map(({ id, ...n }) => n),
    app_config,
    flyway_envs: flywayEnvs.map(({ id, ...e }) => ({
      ...e,
      databases: flywayDbs
        .filter(d => d.env_id === id)
        .map(({ id: _id, env_id: _eid, ...d }) => d),
    })),
  };
}

function importConfig(db, payload) {
  if (!payload || !payload.version) throw new Error('Invalid payload: missing version');
  const { servers, notifications, app_config, flyway_envs } = payload;
  if (!servers && !notifications && !app_config && !flyway_envs) {
    throw new Error('Invalid payload: no data');
  }

  db.transaction(() => {
    db.prepare('DELETE FROM compose_stacks').run();
    db.prepare('DELETE FROM servers').run();
    db.prepare('DELETE FROM notifications').run();
    db.prepare('DELETE FROM app_config').run();
    db.prepare('DELETE FROM flyway_databases').run();
    db.prepare('DELETE FROM flyway_envs').run();

    for (const s of (servers || [])) {
      const { stacks, ...row } = s;
      const { lastInsertRowid: sid } = db.prepare(`
        INSERT INTO servers (env_key, name, host, ssh_username, ssh_password, ssh_key_path,
                             ssh_key_content, ssh_passphrase, docker_compose_cmd, aws_sg_id)
        VALUES (@env_key, @name, @host, @ssh_username, @ssh_password, @ssh_key_path,
                @ssh_key_content, @ssh_passphrase, @docker_compose_cmd, @aws_sg_id)
      `).run({
        ssh_password: null, ssh_key_path: null, ssh_key_content: null,
        ssh_passphrase: null, docker_compose_cmd: 'docker compose', aws_sg_id: null,
        ...row,
      });
      for (const st of (stacks || [])) {
        db.prepare('INSERT INTO compose_stacks (server_id, name, path) VALUES (?, ?, ?)')
          .run(sid, st.name, st.path);
      }
    }

    for (const n of (notifications || [])) {
      db.prepare('INSERT INTO notifications (type, label, config_json, enabled, envs_json) VALUES (?, ?, ?, ?, ?)')
        .run(n.type, n.label, n.config_json, n.enabled ?? 1, n.envs_json ?? null);
    }

    for (const [key, value] of Object.entries(app_config || {})) {
      db.prepare('INSERT INTO app_config (key, value_json) VALUES (?, ?)').run(key, JSON.stringify(value));
    }

    for (const env of (flyway_envs || [])) {
      const { databases, name, description } = env;
      const { lastInsertRowid: eid } = db.prepare(
        'INSERT INTO flyway_envs (name, description) VALUES (?, ?)'
      ).run(name, description ?? null);
      for (const d of (databases || [])) {
        db.prepare(`
          INSERT INTO flyway_databases
            (env_id, name, url, db_user, db_password, schemas, locations, baseline_on_migrate, baseline_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(eid, d.name, d.url, d.db_user, d.db_password, d.schemas,
               d.locations, d.baseline_on_migrate, d.baseline_version);
      }
    }
  })();
}

module.exports = { exportConfig, importConfig };
