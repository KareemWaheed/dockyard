const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

// One connection per environment, reused across requests
const connections = {};

function buildConnectConfig(sshCfg) {
  const cfg = {
    host: sshCfg.host,
    port: 22,
    username: sshCfg.username,
    readyTimeout: 10000,
  };
  if (sshCfg.privateKeyPath) {
    const keyPath = path.isAbsolute(sshCfg.privateKeyPath)
      ? sshCfg.privateKeyPath
      : path.join(REPO_ROOT, sshCfg.privateKeyPath);
    cfg.privateKey = fs.readFileSync(keyPath);
    const passphrase = sshCfg.passphrase;
    if (passphrase) cfg.passphrase = passphrase;
    // if empty string or absent, do NOT set passphrase (ssh2 needs undefined for unencrypted keys)
  } else {
    cfg.password = sshCfg.password;
  }
  return cfg;
}

function connect(env, serverCfg) {
  return new Promise((resolve, reject) => {
    if (connections[env]?.connected) {
      return resolve(connections[env]);
    }
    const conn = new Client();
    conn.on('ready', () => {
      conn.connected = true;
      connections[env] = conn;
      resolve(conn);
    });
    conn.on('error', (err) => reject(err));
    conn.on('close', () => {
      conn.connected = false;
      delete connections[env];
    });
    conn.connect(buildConnectConfig({
      host: serverCfg.host,
      ...serverCfg.ssh,
    }));
  });
}

function exec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', (d) => stdout += d);
      stream.stderr.on('data', (d) => stderr += d);
      stream.on('close', (code) => {
        if (code !== 0) return reject(new Error(`Command failed (exit ${code}): ${stderr || stdout}`));
        resolve(stdout);
      });
    });
  });
}

async function readFile(conn, remotePath) {
  return exec(conn, `cat "${remotePath}"`);
}

async function writeFile(conn, remotePath, content) {
  // Write via base64 to avoid any shell quoting issues with special characters
  const b64 = Buffer.from(content).toString('base64');
  await exec(conn, `echo '${b64}' | base64 -d > "${remotePath}"`);
}

function disconnect(env) {
  if (connections[env]) {
    connections[env].end();
    delete connections[env];
  }
}

module.exports = { connect, exec, readFile, writeFile, disconnect };
