// Today screen. Local preview: reads a snapshot file, no sign-in.
// All text goes in through textContent; nothing is logged.
import {
  addDays, buildHub, dayName, footRunsOn, formatSet, freshness, isDateString, lastLoggedFor,
  liftsUp, nextRace, oneWin, planned, prettyDate, readiness, sessionTotals, sessionsOn,
  todayIST, walksOn, weekFor, weekView, zone2Max,
} from './plan.js';

const SNAPSHOT_URL = 'local-data/snapshot.json';
const TOGGLE_KEY = 'fh.toggles.v1';
const TOGGLES = [
  { id: 'ankle', label: 'Ankle swollen', sticky: true },
  { id: 'period', label: 'Period' },
  { id: 'low', label: 'Low day' },
  { id: 'short', label: 'Short on time' },
  { id: 'late', label: 'After 7:30 pm' },
];

const root = document.getElementById('app');
const state = { hub: null, today: todayIST(), view: null, toggles: {} };

// ---- small DOM helper ---------------------------------------------------------

function h(tag, props, children) {
  const node = document.createElement(tag);
  const p = props || {};
  Object.keys(p).forEach((k) => {
    if (k === 'class') node.className = p[k];
    else if (k === 'text') node.textContent = p[k];
    else if (k === 'on') Object.keys(p.on).forEach((ev) => node.addEventListener(ev, p.on[ev]));
    else if (p[k] === true) node.setAttribute(k, '');
    else if (p[k] !== false && p[k] !== null && p[k] !== undefined) node.setAttribute(k, String(p[k]));
  });
  (children || []).forEach((c) => { if (c) node.appendChild(c); });
  return node;
}

const line = (text, cls) => h('p', { class: cls || '', text });

// ---- toggles (the only thing kept in browser storage) -----------------------

function loadToggles() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(TOGGLE_KEY) || '{}') || {}; } catch (_) { saved = {}; }
  const daily = saved.day === state.today && saved.daily && typeof saved.daily === 'object' ? saved.daily : {};
  const out = { ankle: saved.ankle === true };
  TOGGLES.filter((t) => !t.sticky).forEach((t) => { out[t.id] = daily[t.id] === true; });
  return out;
}

function saveToggles() {
  const daily = {};
  TOGGLES.filter((t) => !t.sticky).forEach((t) => { daily[t.id] = state.toggles[t.id] === true; });
  try {
    localStorage.setItem(TOGGLE_KEY, JSON.stringify({ ankle: state.toggles.ankle === true, day: state.today, daily }));
  } catch (_) { /* storage unavailable: toggles last for this visit only */ }
}

// ---- sections -----------------------------------------------------------------

function header(hub, d) {
  const week = weekFor(hub, d);
  const race = nextRace(hub, state.today);
  const fresh = freshness(hub);
  const total = hub.plan.weeks.length;
  const weekText = week
    ? 'Week ' + week.week + ' of ' + total + (week.note ? ' · ' + week.note : '')
    : 'Outside the plan dates';
  return h('header', { class: 'top' }, [
    h('h1', { text: prettyDate(d, true) }),
    line(weekText, 'sub'),
    race ? line(race.name + ' ' + race.distance + ' in ' + race.days + ' days', 'sub') : null,
    line(fresh.label + (fresh.stale ? ' · may be out of date' : ''), fresh.stale ? 'sub warn' : 'sub'),
  ]);
}

function checklist(title, items) {
  return h('details', {}, [
    h('summary', { text: title }),
    h('ul', { class: 'checks' }, items.map((it) => h('li', {}, [
      h('label', {}, [
        h('input', { type: 'checkbox' }),
        h('span', {}, [
          h('strong', { text: it.move }),
          h('span', { class: 'dose', text: ' · ' + it.dose }),
          it.cue ? h('span', { class: 'cue', text: it.cue }) : null,
        ]),
      ]),
    ]))),
  ]);
}

function doneBlock(hub, d) {
  const max = zone2Max(hub);
  const parts = [];

  footRunsOn(hub, d).forEach((a) => {
    const bits = [];
    if (a.km !== null) bits.push(a.km + ' km');
    if (a.movingMin !== null) bits.push(Math.round(a.movingMin) + ' min');
    if (a.avgHr !== null) bits.push('average ' + Math.round(a.avgHr) + ' bpm');
    let feedback;
    if (a.avgHr === null) feedback = 'No heart rate on this run. Record on the Watch next time.';
    else if (a.avgHr <= max) feedback = 'Stayed in Zone 2.';
    else feedback = 'This one ran hot at ' + Math.round(a.avgHr) + '. Next run, walk earlier.';
    parts.push(h('div', { class: 'done' }, [
      line('Done: run, ' + bits.join(', '), 'done-title'),
      line(feedback),
    ]));
  });

  walksOn(hub, d).forEach((a) => {
    const bits = [];
    if (a.km !== null) bits.push(a.km + ' km');
    if (a.movingMin !== null) bits.push(Math.round(a.movingMin) + ' min');
    parts.push(h('div', { class: 'done' }, [line('Done: ' + a.sport.toLowerCase() + ', ' + bits.join(', '), 'done-title')]));
  });

  sessionsOn(hub, d).forEach((s) => {
    const totals = sessionTotals(s);
    const ups = liftsUp(hub, s);
    const bits = [];
    if (totals.sets) bits.push(totals.sets + ' sets');
    if (totals.kg) bits.push(totals.kg.toLocaleString('en-IN') + ' kg lifted');
    if (s.durationMin !== null) bits.push(Math.round(s.durationMin) + ' min');
    parts.push(h('div', { class: 'done' }, [
      line('Done: ' + (s.title || 'gym session') + (bits.length ? ', ' + bits.join(', ') : ''), 'done-title'),
      ups.length
        ? line('Up from last time: ' + ups.map((u) => u.exercise + ' ' + formatSet(u.now)).join('; ') + '.')
        : null,
    ]));
  });

  return parts;
}

function runCard(hub, p, t) {
  const rule = hub.plan.rule;
  const nodes = [];
  if (t.ankle) {
    nodes.push(h('h2', { text: 'No running today' }));
    nodes.push(line(rule.ankle || 'Ankle swollen: no running.'));
    return nodes;
  }
  nodes.push(h('h2', { text: p.km ? 'Run · ' + p.km + ' km' : 'Run' }));
  if (t.low) nodes.push(line('Smallest version: a 20-minute walk. Showing up counts.', 'note'));
  if (t.short) nodes.push(line('Short version: a 25-minute Zone 2 run.', 'note'));
  [rule.run_effort, rule.run_walk, rule.run_form].filter(Boolean).forEach((text) => nodes.push(line(text)));
  if (hub.plan.warmup.pre_run) nodes.push(checklist('Before the run', hub.plan.warmup.pre_run));
  if (hub.plan.warmup.post_run) nodes.push(checklist('After the run', hub.plan.warmup.post_run));
  return nodes;
}

function gymCard(hub, p, t, d) {
  const rule = hub.plan.rule;
  const all = hub.plan.exercises[p.session] || [];
  const limit = t.low ? 2 : t.short ? 3 : all.length;
  const nodes = [h('h2', { text: 'Gym · ' + p.session })];
  if (t.low) nodes.push(line('Smallest version: the first two lifts. Showing up counts.', 'note'));
  else if (t.short) nodes.push(line('Short version: the first three lifts.', 'note'));
  if (rule.gym_tempo) nodes.push(line(rule.gym_tempo));
  if (hub.plan.warmup.gym) nodes.push(checklist('Warm-up', hub.plan.warmup.gym));

  all.slice(0, limit).forEach((ex) => {
    const last = lastLoggedFor(hub, ex, d);
    const lastText = last
      ? 'Last time: ' + formatSet(last.top) + ' on ' + prettyDate(last.date, false) +
        (last.inverted ? ' (less weight is harder)' : '')
      : 'No synced session yet';
    nodes.push(h('div', { class: 'exercise' }, [
      h('h3', { text: ex.name }),
      line(ex.dose, 'dose'),
      line(lastText, 'last'),
      ex.feel ? line('Feel it in: ' + ex.feel) : null,
      ex.watch ? line('Watch out: ' + ex.watch) : null,
      ex.setup ? h('details', {}, [h('summary', { text: 'Setup' }), line(ex.setup)]) : null,
    ]));
  });

  if (isHttpsUrl(hub.plan.link.gym_cards)) {
    nodes.push(h('p', {}, [h('a', {
      href: hub.plan.link.gym_cards, target: '_blank', rel: 'noopener noreferrer', text: 'Open the swipe cards',
    })]));
  }
  return nodes;
}

function restCard(hub, d) {
  const target = hub.plan.target;
  const tomorrow = planned(hub, addDays(d, 1));
  const nodes = [h('h2', { text: 'Rest day' })];
  if (target.steps_clock) nodes.push(line('Steps: ' + target.steps_clock.value));
  if (target.water) nodes.push(line('Water: ' + target.water.value + ' ' + target.water.unit));
  nodes.push(line('Tomorrow: ' + describe(tomorrow), 'sub'));
  return nodes;
}

function describe(p) {
  if (p.type === 'run') return p.km ? 'Run, ' + p.km + ' km' : 'Run';
  if (p.type === 'gym') return 'Gym, ' + p.session;
  return 'Rest';
}

function isHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch (_) { return false; }
}

function todayCard(hub, d, t) {
  const p = planned(hub, d);
  const done = doneBlock(hub, d);
  const nodes = [];
  if (t.period) nodes.push(line('Optional today. This is an 1,800 kcal day.', 'note'));
  if (t.late && p.type !== 'rest') nodes.push(line('Your cutoff is 8 pm. Moving this to tomorrow is fine.', 'note'));
  if (t.ankle && p.type !== 'run') nodes.push(line(hub.plan.rule.ankle || 'Ankle swollen: no running.', 'note'));

  const body = p.type === 'run' ? runCard(hub, p, t) : p.type === 'gym' ? gymCard(hub, p, t, d) : restCard(hub, d);
  return h('section', { class: 'card today' }, done.concat(nodes, body));
}

function toggleBar() {
  return h('section', { class: 'toggles', 'aria-label': 'How today is going' }, TOGGLES.map((t) => h('button', {
    type: 'button',
    class: 'chip' + (state.toggles[t.id] ? ' on' : ''),
    'aria-pressed': state.toggles[t.id] ? 'true' : 'false',
    text: t.label,
    on: { click: () => { state.toggles[t.id] = !state.toggles[t.id]; saveToggles(); render(); } },
  })));
}

function weekStrip(hub) {
  const w = weekView(hub, state.today);
  const letter = (p) => (p.type === 'run' ? 'R' : p.type === 'gym' ? (p.session.startsWith('Lower') ? 'L' : 'U') : '·');
  const mark = (day) => (day.done === 'workout' ? '✓' : day.done === 'walk' ? 'walk' : '');
  const left = [];
  if (w.runsLeft) left.push(w.runsLeft + (w.runsLeft === 1 ? ' run' : ' runs'));
  if (w.gymLeft) left.push(w.gymLeft + (w.gymLeft === 1 ? ' gym session' : ' gym sessions'));

  return h('section', { class: 'card' }, [
    h('h2', { text: 'This week' }),
    h('div', { class: 'week' }, w.days.map((day) => h('button', {
      type: 'button',
      class: 'day' + (day.isToday ? ' is-today' : '') + (day.date === state.view ? ' is-view' : '') + (day.done ? ' is-done' : ''),
      'aria-label': day.name + ': ' + describe(day.planned) + (day.done ? ', ' + (day.done === 'walk' ? 'walk day' : 'done') : ''),
      on: { click: () => { state.view = day.date === state.today ? null : day.date; render(); } },
    }, [
      h('span', { class: 'dn', text: day.name.slice(0, 1) }),
      h('span', { class: 'dl', text: letter(day.planned) }),
      h('span', { class: 'dm', text: mark(day) }),
    ]))),
    line('Runs: ' + w.runKm + (w.weekKm !== null ? ' of ' + w.weekKm : '') + ' km', 'sub'),
    left.length ? line('Left this week: ' + left.join(', ') + '.', 'sub') : line('Everything planned this week is done.', 'sub'),
    line('Tap a day to see its plan.', 'hint'),
  ]);
}

// ---- render -------------------------------------------------------------------

function render() {
  const hub = state.hub;
  const d = state.view || state.today;
  const viewingToday = d === state.today;
  const t = viewingToday ? state.toggles : {};
  const p = planned(hub, d);
  const win = oneWin(hub, state.today);
  const ready = readiness(hub, state.today, planned(hub, state.today).type, state.toggles);

  const nodes = [
    line('Local preview. Snapshot of your sheet taken ' + hub.generatedAt + '. No sign-in.', 'banner'),
    header(hub, d),
  ];
  if (!viewingToday) {
    nodes.push(h('p', { class: 'preview' }, [
      h('span', { text: 'Showing ' + dayName(d) + '’s plan. ' }),
      h('button', { type: 'button', class: 'link', text: 'Back to today', on: { click: () => { state.view = null; render(); } } }),
    ]));
  }
  nodes.push(todayCard(hub, d, t));
  if (viewingToday) {
    nodes.push(h('section', { class: 'card ready ' + ready.level }, [line(ready.text)]));
    nodes.push(toggleBar());
  }
  nodes.push(weekStrip(hub));
  if (win) nodes.push(h('section', { class: 'card win' }, [h('h2', { text: 'One win' }), line(win)]));
  nodes.push(line('Suggestions only. You and your doctor decide.', 'hint'));

  root.replaceChildren(...nodes);
  document.title = 'Fitness Hub · ' + describe(p);
}

async function start() {
  const param = new URLSearchParams(window.location.search).get('date');
  if (param && isDateString(param)) state.today = param;
  state.toggles = loadToggles();

  let snap;
  try {
    const resp = await fetch(SNAPSHOT_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error('missing');
    snap = await resp.json();
  } catch (_) {
    root.replaceChildren(
      h('h1', { text: 'Fitness Hub' }),
      line('No data to show. The local snapshot file is missing.'),
    );
    return;
  }
  state.hub = buildHub(snap);
  if (!state.hub.plan.weeks.length) {
    root.replaceChildren(h('h1', { text: 'Fitness Hub' }), line('The plan is empty. Check the Plan_Config tab.'));
    return;
  }
  render();
}

start();
