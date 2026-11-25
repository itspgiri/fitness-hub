// Sign-in test: sign in with Google, read one cell of the private sheet.
// The access token lives only in this variable. Nothing is written to
// localStorage, sessionStorage or the URL, and nothing is logged.
import { CLIENT_ID, SHEET_ID, SCOPE, TEST_RANGE } from './config.js';

const el = (id) => document.getElementById(id);
const signinBtn = el('signin');
const signoutBtn = el('signout');
const statusEl = el('status');
const resultEl = el('result');

let accessToken = null;
let tokenClient = null;
let startedAt = 0;

const standalone =
  window.navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches;
el('mode').textContent = standalone
  ? 'Opened from the home screen'
  : 'Opened in the browser';

function setStatus(text) {
  statusEl.textContent = text;
}

function setSignedIn(signedIn) {
  signinBtn.hidden = signedIn;
  signoutBtn.hidden = !signedIn;
}

function clearSession() {
  accessToken = null;
  resultEl.textContent = '';
  setSignedIn(false);
}

async function readTestCell() {
  setStatus('Reading the sheet…');
  const url =
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(SHEET_ID) +
    '/values/' +
    encodeURIComponent(TEST_RANGE);
  let resp;
  try {
    resp = await fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken },
      cache: 'no-store',
    });
  } catch (_) {
    setStatus('Could not reach Google Sheets. Check the connection.');
    return;
  }
  if (resp.status === 401) {
    clearSession();
    setStatus('The sign-in expired. Sign in again.');
    return;
  }
  if (resp.status === 403 || resp.status === 404) {
    clearSession();
    setStatus('Access denied: this Google account cannot open the sheet.');
    return;
  }
  if (!resp.ok) {
    setStatus('Google Sheets returned an error (' + resp.status + ').');
    return;
  }
  const data = await resp.json();
  const value =
    data && Array.isArray(data.values) && data.values[0] ? data.values[0][0] : '';
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  resultEl.textContent = value ? String(value) : '(the cell is empty)';
  setStatus('Read one cell in ' + seconds + ' s. Sign-in works.');
}

function onToken(resp) {
  if (!resp || resp.error || !resp.access_token) {
    clearSession();
    setStatus('Sign-in did not complete.');
    return;
  }
  accessToken = resp.access_token;
  setSignedIn(true);
  readTestCell();
}

function onTokenError(err) {
  clearSession();
  const type = err && err.type ? err.type : 'unknown';
  setStatus(
    type === 'popup_failed_to_open'
      ? 'The Google sign-in window was blocked.'
      : type === 'popup_closed'
        ? 'The Google sign-in window was closed.'
        : 'Sign-in failed (' + type + ').'
  );
}

function init() {
  if (!CLIENT_ID || CLIENT_ID.indexOf('PASTE_') === 0) {
    setStatus('Setup needed: the Google client ID is not filled in yet.');
    return;
  }
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    setStatus('Google sign-in did not load.');
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: onToken,
    error_callback: onTokenError,
  });
  signinBtn.disabled = false;
  setStatus('Ready.');
}

signinBtn.addEventListener('click', () => {
  if (!tokenClient) return;
  startedAt = performance.now();
  setStatus('Opening Google sign-in…');
  tokenClient.requestAccessToken({ prompt: '' });
});

signoutBtn.addEventListener('click', () => {
  const token = accessToken;
  clearSession();
  setStatus('Signed out.');
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    google.accounts.oauth2.revoke(token, () => {});
  }
});

// The Google script loads with "async defer", so wait for it briefly.
let tries = 0;
(function waitForGoogle() {
  if (window.google && google.accounts && google.accounts.oauth2) {
    init();
  } else if (tries++ < 50) {
    setTimeout(waitForGoogle, 100);
  } else {
    init();
  }
})();
