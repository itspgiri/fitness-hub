// Main application shell: loads local snapshot, manages navigation, theme & state.
// Zero innerHTML, zero personal data in code, strict CSP-compliant.

import { buildHub, footRuns, freshness, nextRace, todayIST } from './plan.js';
import { icon } from './charts.js';
import { el } from './ui.js';
import {
  renderMonthlyView, renderRunningView, renderSleepView,
  renderStrengthView, renderTodayView,
} from './views.js';

const root = document.getElementById('app');

const state = {
  tab: 'today',
  theme: 'light',
  today: todayIST(),
  selectedDay: todayIST(),
  toggles: { ankle: false, period: false, low: false, short: false, late: false },
  checkinOpen: false,
  warmupOpen: false,
  expanded: {},
  runFilter: 'Run',
  ringRange: 30,
  selectedExercise: null,
  strengthTab: 'history',
  refreshing: false,
  refreshNote: '',
};

let hub = null;

async function fetchSnapshot() {
  const res = await fetch(`local-data/snapshot.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Snapshot not found');
  const snap = await res.json();
  hub = buildHub(snap);
  state.today = todayIST();
}

async function handleRefresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  state.refreshNote = 'Syncing Sheet…';
  render();
  try {
    const resp = await fetch('/api/refresh', {
      method: 'POST',
      headers: { 'X-Requested-With': 'fitness-hub' },
    });
    if (!resp.ok && resp.status !== 404 && resp.status !== 405 && resp.status !== 501) {
      throw new Error('Refresh failed');
    }
    await fetchSnapshot();
    state.refreshNote = 'Updated just now';
  } catch {
    state.refreshNote = 'Refresh failed';
  } finally {
    state.refreshing = false;
    render();
    setTimeout(() => {
      if (!state.refreshing && state.refreshNote) {
        state.refreshNote = '';
        render();
      }
    }, 3500);
  }
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#070a12' : '#f4f6fb');
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  render();
}

function render() {
  if (!hub) return;
  root.replaceChildren();

  const fresh = freshness(hub);
  const race = nextRace(hub, state.today);

  const navItems = [
    { id: 'today', label: 'Today', ico: 'today', badge: null },
    { id: 'running', label: 'Running', ico: 'run', badge: String(footRuns(hub).length) },
    { id: 'strength', label: 'Strength', ico: 'lift', badge: String(hub.sessions.length) },
    { id: 'sleep', label: 'Sleep & Ring', ico: 'sleep', badge: `${hub.ringList.length}d` },
    { id: 'monthly', label: 'Monthly', ico: 'archive', badge: String(hub.monthly.length) },
  ];

  // Desktop Sidebar
  const sidebar = el('aside', { class: 'sidebar' }, [
    el('div', { class: 'brand' }, [
      el('div', { class: 'brand-mark', text: 'PG' }),
      el('div', {}, [
        el('div', { class: 'brand-title', text: 'Fitness Hub' }),
        el('div', { class: 'brand-sub', text: 'Live Health Telemetry' }),
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
      el('div', { class: 'foot-actions' }, [
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
      ]),
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
  try {
    await fetchSnapshot();
    render();
  } catch (err) {
    root.replaceChildren(el('div', { class: 'loading-state' }, [
      el('h2', { text: 'Unable to load telemetry snapshot' }),
      el('p', { text: err.message }),
    ]));
  }
}

boot();
