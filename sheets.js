// Live Google Identity Services OAuth + Google Sheets API v4 batchGet loader.
// Security: access token is kept strictly in module memory (never localStorage/sessionStorage/URL/logs).

import { CLIENT_ID, SCOPE, SHEET_ID } from './config.js';

const RANGES = [
  'Plan_Config!A1:I150',
  'Ultrahuman_Ring!A1:AI300',
  'Strava_Runs!A1:AU150',
  'Hevy_Lifting!A1:V1000',
  'Monthly_Summary!A1:AB50',
  'Daily_Master!A1:AX350',
];

let accessToken = null;
let tokenClient = null;
let pendingResolve = null;
let pendingReject = null;

export function isOAuthConfigured() {
  return Boolean(CLIENT_ID && !CLIENT_ID.startsWith('PASTE_'));
}

export function isSignedIn() {
  return Boolean(accessToken);
}

export function isLocalPreviewHost() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

function waitForGIS(maxMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function check() {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        resolve(true);
      } else if (Date.now() - start >= maxMs) {
        resolve(false);
      } else {
        setTimeout(check, 80);
      }
    })();
  });
}

async function ensureTokenClient() {
  if (tokenClient) return tokenClient;
  const loaded = await waitForGIS();
  if (!loaded) throw new Error('Google Sign-In script did not load. Check your connection.');
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      if (!resp || resp.error || !resp.access_token) {
        accessToken = null;
        if (pendingReject) pendingReject(new Error('Sign-in was cancelled or did not complete.'));
      } else {
        accessToken = resp.access_token;
        if (pendingResolve) pendingResolve(accessToken);
      }
      pendingResolve = null;
      pendingReject = null;
    },
    error_callback: (err) => {
      accessToken = null;
      const type = err && err.type ? err.type : 'unknown';
      const msg = type === 'popup_failed_to_open'
        ? 'Sign-in popup was blocked by the browser.'
        : type === 'popup_closed'
          ? 'Sign-in window was closed.'
          : `Google Sign-In failed (${type}).`;
      if (pendingReject) pendingReject(new Error(msg));
      pendingResolve = null;
      pendingReject = null;
    },
  });
  return tokenClient;
}

export async function signInWithGoogle(prompt = '') {
  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    client.requestAccessToken({ prompt });
  });
}

export function signOutGoogle() {
  const tok = accessToken;
  accessToken = null;
  if (tok && window.google && window.google.accounts && window.google.accounts.oauth2) {
    window.google.accounts.oauth2.revoke(tok, () => {});
  }
}

function rowsToObjects(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const header = rows[0].map((h) => String(h || '').trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || !r.length) continue;
    const obj = {};
    let hasAny = false;
    for (let c = 0; c < header.length; c++) {
      const k = header[c];
      const v = r[c];
      if (k && v !== undefined && v !== null && String(v).trim() !== '') {
        obj[k] = String(v);
        hasAny = true;
      }
    }
    if (hasAny) out.push(obj);
  }
  return out;
}

export async function fetchLiveSheetSnapshot() {
  if (!accessToken) throw new Error('Not signed in.');
  const qs = RANGES.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SHEET_ID)}/values:batchGet?${qs}&valueRenderOption=FORMATTED_VALUE`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (resp.status === 401) {
    accessToken = null;
    throw new Error('SESSION_EXPIRED');
  }
  if (resp.status === 403 || resp.status === 404) {
    accessToken = null;
    throw new Error('This Google account does not have read access to Priyanka Live Health Hub.');
  }
  if (!resp.ok) {
    throw new Error(`Google Sheets returned HTTP ${resp.status}.`);
  }

  const data = await resp.json();
  const vr = Array.isArray(data.valueRanges) ? data.valueRanges : [];
  const valAt = (idx) => (vr[idx] && Array.isArray(vr[idx].values) ? vr[idx].values : []);

  const planRaw = valAt(0).slice(1).map((r) => {
    const copy = r.map((x) => (x === undefined || x === null ? '' : String(x)));
    while (copy.length < 9) copy.push('');
    return copy;
  });

  const ring = rowsToObjects(valAt(1)).filter((r) => r.Date);
  const runs = rowsToObjects(valAt(2));
  const lifts = rowsToObjects(valAt(3));
  const monthly = rowsToObjects(valAt(4));
  const daily = rowsToObjects(valAt(5));

  return {
    source: 'sheets-live',
    generatedAt: new Date().toISOString(),
    plan: planRaw,
    ring,
    runs,
    lifts,
    monthly,
    daily,
  };
}
