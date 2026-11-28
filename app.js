// Main application shell: supports live Google Sheets OAuth (GitHub Pages)
// and local snapshot preview (localhost). Zero innerHTML, strict CSP-compliant.

import { buildHub, footRuns, freshness, nextRace, todayIST } from './plan.js?v=20261128b';
import { icon } from './charts.js?v=20261128b';
import { el } from './ui.js?v=20261128b';
import { fetchLiveAqi, fetchLiveAqiCoords, locateBrowserCoords } from './aqi.js?v=20261128b';
import {
  fetchLiveSheetSnapshot, isLocalPreviewHost, isOAuthConfigured,
  isSignedIn, signInWithGoogle, signOutGoogle,
} from './sheets.js?v=20261128b';
import {
  renderMonthlyView, renderRunningView, renderSleepView,
  renderStrengthView, renderTodayView,
} from './views.js?v=20261128b';

const root = document.getElementById('app');
const CACHE_KEY = 'fh_tab_cache_v1';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30-minute tab-scoped TTL (no tokens ever stored)

function saveTabCache(snap) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      expiresAt: Date.now() + CACHE_TTL_MS,
      snap,
    }));
  } catch {
    // Ignore storage quota / private-mode errors
  }
}

function loadTabCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.snap || typeof parsed.expiresAt !== 'number' || Date.now() > parsed.expiresAt) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed.snap;
  } catch {
    return null;
  }
}

function clearTabCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

const state = {
  tab: 'today',
  theme: 'light',
  today: todayIST(),
  selectedDay: todayIST(),
  toggles: { ankle: false, period: false, low: false, short: false, late: false, feelGood: false },
  checkinOpen: false,
  warmupOpen: false,
  expanded: {},
  runFilter: 'Run',
  ringRange: 30,
  selectedExercise: null,
  strengthTab: 'history',
  refreshing: false,
  refreshNote: '',
  authBusy: false,
  authError: '',
  mode: 'loading', // 'loading' | 'auth' | 'ready' | 'error'
  aqiCity: 'gurugram',
  aqiData: null,
  aqiLocating: false,
  aqiError: '',
  onCityChange: null,
  onLocateMe: null,
};

let hub = null;

function getWaqiToken() {
  return (hub && hub.plan && hub.plan.meta && hub.plan.meta.waqi_token) || '';
}

async function refreshAqi(cityId) {
  state.aqiCity = cityId || state.aqiCity;
  state.aqiError = '';
  try {
    state.aqiData = await fetchLiveAqi(state.aqiCity, getWaqiToken());
  } catch {
    state.aqiData = null;
  }
  if (state.mode === 'ready') render();
}

state.onCityChange = (cityId) => {
  state.aqiData = null;
  state.aqiError = '';
  render();
  refreshAqi(cityId);
};

state.onLocateMe = async () => {
  if (state.aqiLocating) return;
  state.aqiLocating = true;
  state.aqiError = '';
  render();
  try {
    const coords = await locateBrowserCoords();
    state.aqiCity = 'gps';
    state.aqiData = await fetchLiveAqiCoords(coords, getWaqiToken());
  } catch (err) {
    state.aqiError = err && err.message ? err.message : 'Could not get location.';
  } finally {
    state.aqiLocating = false;
    if (state.mode === 'ready') render();
  }
};

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#050608' : '#f5f5f7');
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  render();
}

async function loadLocalSnapshot() {
  const res = await fetch(`local-data/snapshot.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Local snapshot not found.');
  const snap = await res.json();
  hub = buildHub(snap);
  state.today = todayIST();
}

async function handleSignIn(promptMode = '') {
  if (state.authBusy) return;
  state.authBusy = true;
  state.authError = '';
  render();
  try {
    await signInWithGoogle(promptMode);
    const snap = await fetchLiveSheetSnapshot();
    saveTabCache(snap);
    hub = buildHub(snap);
    state.today = todayIST();
    state.mode = 'ready';
    refreshAqi(state.aqiCity);
  } catch (err) {
    state.authError = err.message === 'SESSION_EXPIRED'
      ? 'Session expired. Please sign in again.'
      : (err.message || 'Sign-in failed.');
    state.mode = 'auth';
  } finally {
    state.authBusy = false;
    render();
  }
}

function handleSignOut() {
  signOutGoogle();
  clearTabCache();
  hub = null;
  state.authError = '';
  state.mode = 'auth';
  render();
}

async function handleRefresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  state.refreshNote = 'Syncing Sheet…';
  render();
  try {
    if (isOAuthConfigured()) {
      if (!isSignedIn()) {
        await signInWithGoogle('select_account');
      }
      const snap = await fetchLiveSheetSnapshot();
      saveTabCache(snap);
      hub = buildHub(snap);
      state.today = todayIST();
      state.refreshNote = 'Updated just now';
    } else if (isLocalPreviewHost()) {
      const resp = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'X-Requested-With': 'fitness-hub' },
      });
      if (!resp.ok && resp.status !== 404 && resp.status !== 405 && resp.status !== 501) {
        throw new Error('Refresh failed');
      }
      await loadLocalSnapshot();
      state.refreshNote = 'Updated just now';
    }
  } catch (err) {
    if (err && err.message === 'SESSION_EXPIRED') {
      hub = null;
      state.mode = 'auth';
      state.authError = 'Google session expired — sign in again to refresh.';
    } else {
      state.refreshNote = 'Refresh failed';
    }
  } finally {
    state.refreshing = false;
    render();
  }
}

function renderAuthScreen() {
  const configured = isOAuthConfigured();
  const card = el('div', { class: 'auth-card' }, [
    el('div', { class: 'auth-mark', text: 'PG' }),
    el('h1', { class: 'auth-title', text: 'Fitness Hub' }),
    el('p', {
      class: 'auth-sub',
      text: configured
        ? 'Sign in with your Google account to load live Ring, Strava, and Hevy telemetry directly from your private Sheet.'
        : 'Add your Google OAuth Client ID to config.js to enable live Google Sheets sign-in.',
    }),
    configured
      ? el('button', {
        type: 'button',
        class: 'auth-btn',
        disabled: state.authBusy ? 'disabled' : null,
        text: state.authBusy ? 'Connecting to Google Sheets…' : 'Sign in with Google',
        onClick: () => handleSignIn('select_account'),
      })
      : null,
    state.authError ? el('div', { class: 'auth-err', text: state.authError }) : null,
    el('div', {
      class: 'auth-note',
      text: 'Read-only Google Sheets access · Token stays strictly in memory.',
    }),
  ]);
  root.replaceChildren(el('div', { class: 'auth-wrap' }, [card]));
}

function render() {
  if (state.mode === 'auth') {
    renderAuthScreen();
    return;
  }
  if (!hub) return;
  root.replaceChildren();

  const fresh = freshness(hub);
  const race = nextRace(hub, state.today);
  const showLogout = isOAuthConfigured() && (isSignedIn() || Boolean(loadTabCache()));

  const navItems = [
    { id: 'today', label: 'Today', ico: 'today', badge: null },
    { id: 'running', label: 'Running', ico: 'run', badge: String(footRuns(hub).length) },
    { id: 'strength', label: 'Strength', ico: 'lift', badge: String(hub.sessions.length) },
    { id: 'sleep', label: 'Sleep & Ring', ico: 'sleep', badge: `${hub.ringList.length}d` },
    { id: 'monthly', label: 'Monthly', ico: 'archive', badge: String(hub.monthly.length) },
  ];

  const actionBtns = [
    el('button', {
      type: 'button',
      class: `icon-btn${state.refreshing ? ' spinning' : ''}`,
      title: 'Fetch latest data from Google Sheet',
      'aria-label': 'Refresh data',
      disabled: state.refreshing ? 'disabled' : null,
      onClick: handleRefresh,
    }, [icon('refresh', 15)]),
    el('button', {
      type: 'button',
      class: 'icon-btn',
      title: `Switch to ${state.theme === 'dark' ? 'light' : 'dark'} theme`,
      'aria-label': 'Toggle theme',
      onClick: toggleTheme,
    }, [icon(state.theme === 'dark' ? 'sun' : 'moon', 15)]),
  ];
  if (showLogout) {
    actionBtns.push(el('button', {
      type: 'button',
      class: 'icon-btn',
      title: 'Sign out',
      'aria-label': 'Sign out',
      onClick: handleSignOut,
    }, [icon('logout', 15)]));
  }

  // Desktop Sidebar
  const sidebar = el('aside', { class: 'sidebar' }, [
    el('div', { class: 'brand' }, [
      el('div', { class: 'brand-mark', text: 'PG' }),
      el('div', {}, [
        el('div', { class: 'brand-title', text: 'Fitness Hub' }),
        el('div', { class: 'brand-sub', text: 'Live Telemetry · v3.7' }),
      ]),
    ]),
    el('nav', { class: 'nav-list', 'aria-label': 'Dashboard sections' }, navItems.map((it) =>
      el('button', {
        type: 'button',
        class: `nav-btn${state.tab === it.id ? ' active' : ''}`,
        onClick: () => { state.tab = it.id; window.scrollTo(0, 0); render(); },
      }, [
        icon(it.ico, 18),
        el('span', { text: it.label }),
        it.badge ? el('span', { class: 'nav-badge', text: it.badge }) : null,
      ]),
    )),
    race ? el('div', { class: 'sidebar-race' }, [
      el('div', { class: 'sidebar-race-kicker', text: 'Next Race' }),
      el('div', { class: 'sidebar-race-name', text: `${race.name} (${race.distance})` }),
      el('div', { class: 'sidebar-race-days', text: `${race.days} days` }),
      el('div', { class: 'sidebar-race-sub', text: `Runna Week ${race.week}` }),
    ]) : null,
    el('div', { class: 'sidebar-foot' }, [
      el('div', { class: 'sync-pill' }, [
        el('span', { class: `sync-dot${fresh.stale ? ' stale' : ''}` }),
        el('span', { text: state.refreshNote || fresh.label }),
      ]),
      el('div', { class: 'foot-actions' }, actionBtns),
    ]),
  ]);

  // Mobile Top Bar
  const mobileBar = el('header', { class: 'mobile-bar' }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px' } }, [
      el('div', { class: 'brand-mark', style: { width: '30px', height: '30px', fontSize: '12px' }, text: 'PG' }),
      el('div', {}, [
        el('div', { class: 'brand-title', style: { fontSize: '14px' }, text: 'Fitness Hub' }),
        el('div', { class: 'brand-sub', text: state.refreshNote || fresh.label }),
      ]),
    ]),
    el('div', { class: 'foot-actions' }, [
      el('button', {
        type: 'button',
        class: `icon-btn${state.refreshing ? ' spinning' : ''}`,
        'aria-label': 'Refresh data',
        disabled: state.refreshing ? 'disabled' : null,
        onClick: handleRefresh,
      }, [icon('refresh', 15)]),
      el('button', {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Toggle theme',
        onClick: toggleTheme,
      }, [icon(state.theme === 'dark' ? 'sun' : 'moon', 15)]),
    ]),
  ]);

  // Main Content Canvas
  const main = el('main', { class: 'main-content' });
  if (state.tab === 'today') main.appendChild(renderTodayView(hub, state, render));
  else if (state.tab === 'running') main.appendChild(renderRunningView(hub, state, render));
  else if (state.tab === 'strength') main.appendChild(renderStrengthView(hub, state, render));
  else if (state.tab === 'sleep') main.appendChild(renderSleepView(hub, state, render));
  else if (state.tab === 'monthly') main.appendChild(renderMonthlyView(hub, state, render));

  // Mobile Bottom Nav
  const mobileNav = el('nav', { class: 'mobile-nav', 'aria-label': 'Mobile navigation' }, navItems.map((it) =>
    el('button', {
      type: 'button',
      class: `mobile-nav-btn${state.tab === it.id ? ' active' : ''}`,
      onClick: () => { state.tab = it.id; window.scrollTo(0, 0); render(); },
    }, [
      icon(it.ico, 18),
      el('span', { text: it.label.replace(' & Ring', '') }),
    ]),
  ));

  root.appendChild(sidebar);
  root.appendChild(mobileBar);
  root.appendChild(main);
  root.appendChild(mobileNav);
}

async function boot() {
  applyTheme();
  const forceLocal = isLocalPreviewHost() && new URLSearchParams(window.location.search).get('preview') === 'local';
  if (isOAuthConfigured() && !forceLocal) {
    refreshAqi(state.aqiCity);
    const cached = loadTabCache();
    if (cached) {
      hub = buildHub(cached);
      state.today = todayIST();
      state.mode = 'ready';
      render();
      refreshAqi(state.aqiCity);
      return;
    }
    state.mode = 'auth';
    render();
    return;
  }
  if (isLocalPreviewHost()) {
    try {
      await loadLocalSnapshot();
      state.mode = 'ready';
      render();
      return;
    } catch (err) {
      state.authError = err.message || 'Could not load local snapshot.';
    }
  }
  state.mode = 'auth';
  render();
}

boot();
