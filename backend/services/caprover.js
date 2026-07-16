// backend/services/caprover.js
//
// Deploys a pre-built Docker image to a CapRover app via CapRover's HTTP API,
// authenticated with an app-scoped token (least privilege — the token can only
// deploy that one app, generated in the app's Deployment tab).
//
// We call the API directly instead of the `caprover` CLI because the CLI's
// image deploy (-i) sends no git metadata — the API's `gitHash` field is what
// populates the "git hash" column in CapRover's deploy history, which is the
// whole reason this integration exists.
//
// SECURITY: the app token must never be written to run logs — everything sent
// to onLog is user-visible in the Build view.

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

function normalizeUrl(caproverUrl) {
  let url = (caproverUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  return url;
}

function headers(appToken) {
  return {
    "Content-Type": "application/json",
    "x-namespace": "captain",
    "x-captain-app-token": appToken,
  };
}

async function capFetch(url, appToken, options = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    ...options,
    headers: headers(appToken),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`CapRover returned non-JSON response (HTTP ${res.status})`);
  }
  // CapRover wraps everything in { status, description, data } —
  // 100 = OK, 101 = OK deploy started (the expected answer to a detached deploy).
  if (body.status !== 100 && body.status !== 101) {
    throw new Error(
      `CapRover error ${body.status}: ${body.description || "unknown error"}`
    );
  }
  return body;
}

async function getAppData(baseUrl, appName, appToken) {
  const body = await capFetch(
    `${baseUrl}/api/v2/user/apps/appData/${encodeURIComponent(appName)}`,
    appToken
  );
  return body.data || {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// App-scoped tokens are deploy-only: CapRover rejects them on every other
// endpoint (including reads) with 1106 "Auth token corrupted".
const APP_TOKEN_REJECTED = /error 1106/;

// Validates the target as far as an app-scoped token allows. Reaching the
// appData endpoint and getting CapRover's 1106 rejection proves the URL is a
// live CapRover instance, but the token and app name themselves can only be
// verified by an actual deploy.
async function testConnection({ caproverUrl, appName, appToken }) {
  const baseUrl = normalizeUrl(caproverUrl);
  try {
    const data = await getAppData(baseUrl, appName, appToken);
    return {
      ok: true,
      appName,
      isAppBuilding: !!data.isAppBuilding,
      instanceCount: data.instanceCount ?? null,
    };
  } catch (err) {
    if (APP_TOKEN_REJECTED.test(err.message)) {
      return {
        ok: true,
        appName,
        instanceCount: null,
        warning:
          "Reached a live CapRover instance at this URL. App tokens are deploy-only, so the token and app name can only be fully verified by running a deploy.",
      };
    }
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error(
        `Could not reach ${baseUrl} within 15s — check the URL and network access`
      );
    }
    if (err.cause?.code) {
      throw new Error(`Could not reach ${baseUrl} — ${err.cause.code}`);
    }
    throw err;
  }
}

// Triggers the deploy and waits for CapRover to finish updating the app.
// Resolves on success, throws on failure/timeout. onLog receives progress
// lines. An aborted `signal` stops the watch loop (the deploy itself keeps
// running server-side on CapRover — there is no API to retract it).
async function deployImage({
  caproverUrl,
  appName,
  appToken,
  imageName,
  gitHash,
  signal,
  onLog = () => {},
}) {
  const baseUrl = normalizeUrl(caproverUrl);
  const definition = JSON.stringify({ schemaVersion: 2, imageName });

  onLog(
    `Deploying ${imageName} to CapRover app '${appName}' (${baseUrl})...\n`
  );
  if (gitHash) onLog(`Git hash: ${gitHash}\n`);

  await capFetch(
    `${baseUrl}/api/v2/user/apps/appData/${encodeURIComponent(
      appName
    )}?detached=1`,
    appToken,
    {
      method: "POST",
      body: JSON.stringify({
        captainDefinitionContent: definition,
        gitHash: gitHash || "",
      }),
    }
  );
  onLog("Deploy accepted by CapRover. Waiting for the app to update...\n");

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let wasBuilding = false;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (signal?.aborted) {
      throw Object.assign(new Error("Deploy watch cancelled"), {
        name: "AbortError",
      });
    }
    let data;
    try {
      data = await getAppData(baseUrl, appName, appToken);
    } catch (err) {
      if (APP_TOKEN_REJECTED.test(err.message)) {
        // App tokens can't read deploy status — the deploy was accepted and
        // proceeds on CapRover; there is just nothing more we can observe.
        onLog(
          "Deploy accepted. Note: app tokens are deploy-only, so CapRover does not allow watching progress with them — check the CapRover dashboard for the final status.\n"
        );
        return;
      }
      // Transient poll errors shouldn't kill an otherwise-running deploy.
      onLog(`(poll) ${err.message}\n`);
      continue;
    }
    if (data.isAppBuilding) {
      if (!wasBuilding) onLog("CapRover is updating the app...\n");
      wasBuilding = true;
      continue;
    }
    if (data.isBuildFailed) {
      throw new Error(
        "CapRover reports the deploy failed — check the CapRover app logs (often an image pull/auth issue)."
      );
    }
    onLog(`Deploy complete — '${appName}' is now running ${imageName}.\n`);
    return;
  }
  throw new Error(
    `Timed out after ${
      POLL_TIMEOUT_MS / 60000
    } minutes waiting for CapRover to finish the deploy.`
  );
}

module.exports = { deployImage, testConnection, normalizeUrl };
