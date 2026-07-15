// frontend/src/components/settings/CapRoverTab.jsx
import React, { useEffect, useState } from "react";
import {
  fetchProjects,
  fetchCapRoverTargets,
  createCapRoverTarget,
  updateCapRoverTarget,
  deleteCapRoverTarget,
} from "../../api";

const EMPTY = {
  project: "",
  env_key: "",
  name: "",
  caprover_url: "",
  app_name: "",
  app_token: "",
};

export default function CapRoverTab() {
  const [targets, setTargets] = useState([]);
  const [projects, setProjects] = useState({});
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(null);

  const load = () =>
    fetchCapRoverTargets()
      .then(setTargets)
      .catch(() => {});
  useEffect(() => {
    load();
    fetchProjects()
      .then(setProjects)
      .catch(() => {});
  }, []);

  const openAdd = () => {
    setEditId(null);
    setError(null);
    setForm({ ...EMPTY });
  };
  const openEdit = (t) => {
    setEditId(t.id);
    setError(null);
    setForm({
      project: t.project,
      env_key: t.env_key,
      name: t.name || "",
      caprover_url: t.caprover_url,
      app_name: t.app_name,
      app_token: "",
    });
  };
  const cancel = () => {
    setForm(null);
    setError(null);
  };
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const { project, env_key, caprover_url, app_name, app_token } = form;
    if (!project || !env_key || !caprover_url || !app_name) {
      setError("Project, environment, CapRover URL and app name are required.");
      return;
    }
    if (!editId && !app_token) {
      setError("App token is required for a new target.");
      return;
    }
    try {
      if (editId) await updateCapRoverTarget(editId, form);
      else await createCapRoverTarget(form);
      setForm(null);
      setError(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this CapRover target?")) return;
    await deleteCapRoverTarget(id);
    load();
  };

  const projectKeys = Object.keys(projects);

  return (
    <div className="settings-tab">
      <div className="settings-tab-header">
        <h3>CapRover Deploy Targets</h3>
        <button className="btn-primary" onClick={openAdd}>
          + Add Target
        </button>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 12 }}>
        Each target maps a build project + environment to a CapRover app. The
        app token is generated in CapRover under the app&apos;s Deployment tab
        (&quot;App Token&quot;) — it can only deploy that one app.
      </p>

      {form && (
        <div className="settings-card" style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <label>
              Project *
              <select
                value={form.project}
                onChange={(e) => setField("project", e.target.value)}
              >
                <option value="">Select project…</option>
                {projectKeys.map((k) => (
                  <option key={k} value={k}>
                    {projects[k].name || k}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Environment key *
              <input
                value={form.env_key}
                onChange={(e) => setField("env_key", e.target.value)}
                placeholder="e.g. test, dal, prod"
              />
            </label>
            <label>
              Label
              <input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Optional display name"
              />
            </label>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <label>
              CapRover URL *
              <input
                value={form.caprover_url}
                onChange={(e) => setField("caprover_url", e.target.value)}
                placeholder="https://captain.example.com"
              />
            </label>
            <label>
              App name *
              <input
                value={form.app_name}
                onChange={(e) => setField("app_name", e.target.value)}
                placeholder="e.g. namaa-frontend"
              />
            </label>
            <label>
              App token {editId ? "(leave blank to keep)" : "*"}
              <input
                type="password"
                value={form.app_token}
                onChange={(e) => setField("app_token", e.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
          {error && (
            <p style={{ color: "var(--red)", fontSize: 11, marginBottom: 8 }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn-primary" onClick={save}>
              Save
            </button>
            <button onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {targets.length === 0 && !form && (
        <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
          No CapRover targets yet. Add one to enable deploys from the Build
          view.
        </div>
      )}

      {targets.map((t) => (
        <div key={t.id} className="settings-card" style={{ marginBottom: 8 }}>
          <div className="settings-card-row">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
              }}
            >
              <span className="settings-card-name">{t.name || t.env_key}</span>
              <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                {projects[t.project]?.name || t.project} · {t.env_key}
              </span>
              <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                {t.caprover_url} → {t.app_name}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => openEdit(t)}>Edit</button>
              <button
                onClick={() => remove(t.id)}
                style={{ color: "var(--red)" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
