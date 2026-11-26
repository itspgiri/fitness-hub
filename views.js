// Five interactive athlete telemetry views:
// 1. Today (Command Center & Dynamic Coach)
// 2. Running & 10K Lab (Runna 21-Week + Zone 2 HR + Full Run Log)
// 3. Strength & Lifting Lab (Hevy PRs + Inverted Assisted Pull-Up + Gym Blocks)
// 4. Sleep, Recovery & Ring (137-Day Ultrahuman Biometrics)
// 5. Monthly Archive & Roadmap (Monthly_Summary + 21-Week Schedule)

import {
  addDays, allRaces, avg, exerciseHistory, footRuns, formatSet, lastLoggedFor,
  nextRace, planned, prettyDate, pullUpProgress, readiness, recentWins,
  runnaProgress, sessionTotals, shoeMileage, shortMonth, stepTarget, sum,
  trackedExercises, weekView, zone2Low, zone2Max,
} from './plan.js';
import { barChart, icon, lineChart, radialRing, zoneBar } from './charts.js';
import { el, kpiCard, legend, pill, safeExternalLink } from './ui.js';

const fmt = (n, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toFixed(d));
const fmtInt = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString());

function hrPill(hr, z2Hi) {
  if (hr === null || hr === undefined) return pill('—', 'muted');
  const v = Math.round(hr);
  if (v <= z2Hi) return pill(`${v} bpm`, 'green');
  if (v <= 176) return pill(`${v} bpm`, 'amber');
  return pill(`${v} bpm`, 'rose');
}

// =============================================================================
// VIEW 1: TODAY COMMAND CENTER (WHOOP / ULTRAHUMAN / APPLE MINIMALISM)
// =============================================================================

export function renderTodayView(hub, state, redraw) {
  const frag = document.createDocumentFragment();
  const today = state.today;
  const selectedDay = state.selectedDay || today;
  const planDay = planned(hub, selectedDay);
  const wv = weekView(hub, today);
  const latestRing = hub.ring.get(today) || hub.ringList[hub.ringList.length - 1] || {};
  const prevRing = hub.ring.get(addDays(today, -1)) || hub.ringList[hub.ringList.length - 2] || {};
  const roll7 = hub.daily.get(today) || hub.daily.get(latestRing.date) || {};
  const rdy = readiness(hub, today, planDay.type, state.toggles);
  const sTarget = stepTarget(hub);
  const z2Lo = zone2Low(hub);
  const z2Hi = zone2Max(hub);
  const race = nextRace(hub, today);

  const activeToggleCount = Object.values(state.toggles).filter(Boolean).length;

  // Minimalist Apple-style Header
  frag.appendChild(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('div', { class: 'page-kicker', text: `${prettyDate(today, true)} • ${wv.weekNum ? `Runna Week ${wv.weekNum} of 21` : 'Training Hub'}` }),
      el('h1', { class: 'page-title', text: 'Overview' }),
    ]),
    el('div', { class: 'chip-row' }, [
      race ? el('span', { class: 'muted-xs tabular', text: `${race.days}d to ${race.name}` }) : null,
      el('button', {
        type: 'button',
        class: `chip${state.checkinOpen || activeToggleCount ? ' active' : ''}`,
        text: activeToggleCount ? `Adjust today (${activeToggleCount})` : 'Adjust today',
        onClick: () => { state.checkinOpen = !state.checkinOpen; redraw(); },
      }),
    ]),
  ]));

  // Front Current Status Bar (at-a-glance athlete posture)
  const runsList = footRuns(hub);
  const lastRun = runsList[0] || null;
  const sleepPct = latestRing.sleep ? Math.min(100, (latestRing.sleep / 8) * 100) : 0;
  const runPct = wv.weekKm ? Math.min(100, (wv.runKm / wv.weekKm) * 100) : 0;
  const gymPct = wv.gymPlanned ? Math.min(100, (wv.gymDone / wv.gymPlanned) * 100) : 0;
  const recVal = latestRing.recovery ?? 0;
  const statusLabel = rdy.level === 'stop' ? 'Ankle Stop'
    : rdy.level === 'ok' ? 'Green Light'
      : rdy.level === 'swap' ? 'Swap / Easy'
        : 'Easy / Pace';
  const statusTone = rdy.level === 'stop' ? 'stop' : rdy.level === 'ok' ? 'ok' : 'warn';
  const statusColor = statusTone === 'ok' ? 'var(--green)' : statusTone === 'stop' ? 'var(--rose)' : 'var(--amber)';

  const statusCell = ({ k, v, sub, pct, color, dot }) => el('div', { class: 'status-cell' }, [
    el('div', { class: 'status-cell-k' }, [
      el('span', { text: k }),
      el('span', { class: `status-dot ${dot}` }),
    ]),
    el('div', { class: 'status-cell-v', text: v }),
    el('div', { class: 'status-cell-sub', text: sub }),
    el('div', { class: 'mini-bar' }, [
      el('div', { class: 'mini-bar-fill', style: { width: `${Math.max(4, Math.min(100, pct)).toFixed(0)}%`, background: color } }),
    ]),
  ]);

  frag.appendChild(el('section', { class: 'status-bar' }, [
    statusCell({
      k: 'Current Status',
      v: statusLabel,
      sub: recVal ? `Recovery ${Math.round(recVal)}/100 · ${planDay.session}` : planDay.session,
      pct: recVal || 50,
      color: statusColor,
      dot: statusTone,
    }),
    statusCell({
      k: 'Sleep Target',
      v: latestRing.sleep ? `${latestRing.sleep.toFixed(2)} / 8.0h` : '—',
      sub: `Score ${latestRing.sleepScore ?? '—'} · Eff ${latestRing.efficiency ?? '—'}%`,
      pct: sleepPct,
      color: sleepPct >= 95 ? 'var(--green)' : 'var(--indigo)',
      dot: sleepPct >= 95 ? 'ok' : 'info',
    }),
    statusCell({
      k: `Week ${wv.weekNum ?? ''} Runs`,
      v: `${wv.runKm} / ${wv.weekKm ?? '—'} km`,
      sub: wv.runsLeft > 0 ? `${wv.runsLeft} run${wv.runsLeft === 1 ? '' : 's'} left this week` : 'Weekly run goal hit',
      pct: runPct,
      color: runPct >= 100 ? 'var(--green)' : 'var(--cyan)',
      dot: runPct >= 100 ? 'ok' : 'info',
    }),
    statusCell({
      k: 'Week Strength',
      v: `${wv.gymDone} / ${wv.gymPlanned} sessions`,
      sub: wv.gymLeft > 0 ? `${wv.gymLeft} lift${wv.gymLeft === 1 ? '' : 's'} remaining` : 'Weekly strength hit',
      pct: gymPct,
      color: gymPct >= 100 ? 'var(--green)' : 'var(--amber)',
      dot: gymPct >= 100 ? 'ok' : 'warn',
    }),
    statusCell({
      k: 'Aerobic Cap',
      v: lastRun && lastRun.avgHr ? `${Math.round(lastRun.avgHr)} bpm last` : `≤ ${z2Hi} bpm`,
      sub: lastRun ? `${lastRun.km} km on ${prettyDate(lastRun.date, false)} · Z2 ≤ ${z2Hi}` : `Zone 2 ${z2Lo}–${z2Hi} bpm`,
      pct: lastRun && lastRun.avgHr ? Math.min(100, (z2Hi / lastRun.avgHr) * 100) : 70,
      color: lastRun && lastRun.avgHr && lastRun.avgHr <= z2Hi ? 'var(--green)' : 'var(--amber)',
      dot: lastRun && lastRun.avgHr && lastRun.avgHr <= z2Hi ? 'ok' : 'warn',
    }),
  ]));

  // Section 1: Whoop / Ultrahuman Hero Ring Triad + Readiness Coach
  const todaySteps = latestRing.steps ?? 0;
  const displaySteps = todaySteps < 500 && prevRing.steps ? prevRing.steps : todaySteps;
  const stepsLabel = todaySteps < 500 && prevRing.steps ? 'Yest. Steps' : 'Steps';

  const toggleDefs = [
    { key: 'ankle', label: 'Ankle swollen', danger: true },
    { key: 'period', label: 'Period' },
    { key: 'low', label: 'Low energy' },
    { key: 'short', label: 'Short on time' },
    { key: 'late', label: 'After 7:30 pm' },
  ];

  const heroBriefKids = [
    el('div', { class: `status-line ${rdy.level}` }, [
      rdy.level === 'ok' ? '● Ready to Train'
        : rdy.level === 'stop' ? '● Hard Stop — Ankle'
          : rdy.level === 'swap' ? '● Consider Swap'
            : '● Easy / Recovery',
    ]),
    el('h2', { class: 'hero-headline', text: rdy.headline }),
    el('p', { class: 'hero-text', text: rdy.text }),
  ];

  if (state.checkinOpen || activeToggleCount > 0) {
    heroBriefKids.push(el('div', { class: 'checkin-drawer' }, [
      el('div', { class: 'chip-row' }, toggleDefs.map((t) =>
        el('button', {
          type: 'button',
          class: `chip${t.danger ? ' danger' : ''}${state.toggles[t.key] ? ' active' : ''}`,
          text: t.label,
          onClick: () => { state.toggles[t.key] = !state.toggles[t.key]; redraw(); },
        }),
      )),
    ]));
  }

  frag.appendChild(el('section', { class: 'hero-triad' }, [
    el('div', { class: 'hero-rings' }, [
      el('div', { class: 'ring-box' }, [
        radialRing({
          value: latestRing.recovery, max: 100, size: 118, stroke: 8,
          color: (latestRing.recovery ?? 0) >= 70 ? '#10d981' : '#f59e0b',
          label: 'Recovery',
          displayValue: latestRing.recovery !== null ? `${Math.round(latestRing.recovery)}%` : '—',
          sublabel: '/ 100',
        }),
        el('span', { class: 'ring-caption', text: 'Recovery' }),
      ]),
      el('div', { class: 'ring-box' }, [
        radialRing({
          value: latestRing.sleepScore, max: 100, size: 118, stroke: 8,
          color: '#818cf8',
          label: 'Sleep Score',
          displayValue: latestRing.sleepScore !== null ? String(Math.round(latestRing.sleepScore)) : '—',
          sublabel: latestRing.sleep ? `${latestRing.sleep.toFixed(1)}h` : '',
        }),
        el('span', { class: 'ring-caption', text: 'Sleep' }),
      ]),
      el('div', { class: 'ring-box' }, [
        radialRing({
          value: displaySteps, max: sTarget, size: 118, stroke: 8,
          color: displaySteps >= sTarget ? '#10d981' : '#38bdf8',
          label: stepsLabel,
          displayValue: displaySteps >= 1000 ? `${(displaySteps / 1000).toFixed(1)}k` : String(displaySteps),
          sublabel: `/ ${(sTarget / 1000).toFixed(1)}k`,
        }),
        el('span', { class: 'ring-caption', text: stepsLabel }),
      ]),
    ]),
    el('div', { class: 'hero-brief' }, heroBriefKids),
  ]));

  // Section 2: 4 Core Biometric Strip (Ultrahuman style — restrained, clear deltas)
  const last14 = hub.ringList.slice(-14);
  const hrvDelta = latestRing.hrv !== null && roll7.roll7Hrv ? latestRing.hrv - roll7.roll7Hrv : null;
  const rhrDelta = latestRing.rhr !== null && roll7.roll7Rhr ? latestRing.rhr - roll7.roll7Rhr : null;
  const sleepDelta = latestRing.sleep !== null && roll7.roll7Sleep ? latestRing.sleep - roll7.roll7Sleep : null;

  const deltaEl = (val, unit, lowerIsBetter = false) => {
    if (val === null) return null;
    const sign = val > 0 ? '+' : '';
    const isGood = lowerIsBetter ? val <= 0 : val >= 0;
    return el('span', {
      class: `kpi-delta ${Math.abs(val) < 0.2 ? 'neutral' : isGood ? 'good' : 'warn'}`,
      text: `${sign}${val.toFixed(1)}${unit} vs 7d`,
    });
  };

  frag.appendChild(el('section', { class: 'grid grid-4' }, [
    kpiCard({
      label: 'Sleep',
      value: fmt(latestRing.sleep, 2),
      unit: 'h',
      badge: deltaEl(sleepDelta, 'h'),
      sub: `Deep ${latestRing.deepMin ?? '—'}m · REM ${latestRing.remMin ?? '—'}m · Eff ${latestRing.efficiency ?? '—'}%`,
      spark: last14.map((r) => r.sleep),
      color: '#818cf8',
      target: 8,
    }),
    kpiCard({
      label: 'HRV',
      value: latestRing.hrv !== null ? Math.round(latestRing.hrv) : '—',
      unit: 'ms',
      badge: deltaEl(hrvDelta, ' ms'),
      sub: `7d avg ${fmt(roll7.roll7Hrv, 1)} ms · Range ${latestRing.minHrv ?? '—'}–${latestRing.maxHrv ?? '—'}`,
      spark: last14.map((r) => r.hrv),
      color: '#10d981',
    }),
    kpiCard({
      label: 'Resting HR',
      value: latestRing.rhr !== null ? Math.round(latestRing.rhr) : '—',
      unit: 'bpm',
      badge: deltaEl(rhrDelta, ' bpm', true),
      sub: `7d avg ${fmt(roll7.roll7Rhr, 1)} bpm · Sleep min ${latestRing.minHr ?? '—'}`,
      spark: last14.map((r) => r.rhr),
      color: '#a1a1aa',
    }),
    kpiCard({
      label: 'Temp & VO2',
      value: fmt(latestRing.skinTemp, 2),
      unit: '°C',
      badge: latestRing.vo2Max ? el('span', { class: 'kpi-delta neutral', text: `VO2 ${fmt(latestRing.vo2Max, 0)}` }) : null,
      sub: `Movement ${latestRing.movement ?? '—'}/100 · ${latestRing.bedtime || '—'} → ${latestRing.wakeTime || '—'}`,
      spark: last14.map((r) => r.skinTemp),
      color: '#38bdf8',
    }),
  ]));

  // Section 3: Minimalist Week Rail
  frag.appendChild(el('section', { class: 'card', style: { marginBottom: '16px', padding: '18px 22px' } }, [
    el('div', { class: 'card-head', style: { marginBottom: '12px' } }, [
      el('h3', { class: 'card-title', text: wv.weekNum ? `This Week · Runna W${wv.weekNum}` : 'This Week' }),
      el('div', { class: 'muted-xs tabular', text: `Runs ${wv.runKm} / ${wv.weekKm ?? '—'} km   ·   Gym ${wv.gymDone} / ${wv.gymPlanned}` }),
    ]),
    el('div', { class: 'week-strip' }, wv.days.map((d) => {
      const planLbl = d.planned.type === 'run'
        ? (d.planned.km ? `${d.planned.km} km` : 'Run')
        : d.planned.session.replace('Upper ', 'Up ');
      const subLbl = d.actualKm > 0 ? `${d.actualKm} km`
        : d.gymTitle ? 'Done'
          : d.steps !== null ? `${(d.steps / 1000).toFixed(1)}k` : '—';
      return el('button', {
        type: 'button',
        class: `day-tile${d.isToday ? ' today' : ''}${d.date === selectedDay ? ' selected' : ''}`,
        onClick: () => { state.selectedDay = d.date; redraw(); },
      }, [
        el('div', { class: 'day-name', text: d.name }),
        el('div', { class: 'day-plan', text: planLbl }),
        el('div', { class: 'day-meta', text: subLbl }),
        el('div', { class: `day-dot${d.done ? ' ' + d.done : ''}` }),
      ]);
    })),
  ]));

  // Section 4: Clean 2-Column Editorial Split (Zero Nested Boxes)
  const rxCard = buildPrescriptionCard(hub, selectedDay, planDay, state, redraw);
  const rightCard = buildMilestonesAndWinsCard(hub, today);
  frag.appendChild(el('section', { class: 'grid grid-7-5' }, [rxCard, rightCard]));
  return frag;
}

function buildPrescriptionCard(hub, day, planDay, state, redraw) {
  const z2Lo = zone2Low(hub);
  const z2Hi = zone2Max(hub);
  const card = el('div', { class: 'card' });

  const kicker = day === state.today ? 'Today’s Session' : prettyDate(day, true);
  card.appendChild(el('div', { class: 'card-head', style: { marginBottom: '6px' } }, [
    el('h3', { class: 'card-title', text: kicker }),
    el('span', { class: 'muted-xs', text: planDay.type === 'run' ? 'Zone 2 Aerobic' : planDay.type === 'gym' ? 'Strength Block' : 'Active Recovery' }),
  ]));

  const titleText = planDay.type === 'run' && planDay.km
    ? `${planDay.session} — ${planDay.km} km`
    : planDay.session;
  card.appendChild(el('h2', { class: 'session-hero-title', text: titleText }));

  // Active toggle coaching callout
  if (state.toggles.ankle && planDay.type === 'run') {
    card.appendChild(el('div', { class: 'detail-panel', style: { borderLeft: '2px solid var(--rose)', marginBottom: '14px' } }, [
      el('strong', { text: 'Ankle Protocol — Skip Running' }),
      el('span', { text: 'Hard stop on running while swollen. Swap for gentle mobility, upper-body work, or rest.' }),
    ]));
  } else if (state.toggles.late) {
    card.appendChild(el('div', { class: 'detail-panel', style: { borderLeft: '2px solid var(--amber)', marginBottom: '14px' } }, [
      el('strong', { text: 'After 8:00 pm Cutoff' }),
      el('span', { text: 'Keep movement light (easy walk or 15-min mobility) to protect tonight’s sleep.' }),
    ]));
  } else if (state.toggles.short || state.toggles.low) {
    card.appendChild(el('div', { class: 'detail-panel', style: { borderLeft: '2px solid var(--cyan)', marginBottom: '14px' } }, [
      el('strong', { text: state.toggles.short ? 'Express 25-Min Option' : 'Low-Energy Floor' }),
      el('span', {
        text: planDay.type === 'run'
          ? '20 min easy run/walk strictly under 163 bpm — consistency beats volume.'
          : 'Hit the first 3 compound lifts (2 working sets each) and call it a win.',
      }),
    ]));
  }

  if (planDay.type === 'run') {
    card.appendChild(el('div', { class: 'spec-row' }, [
      el('div', { class: 'spec-item' }, [el('span', { class: 'spec-k', text: 'Distance' }), el('span', { class: 'spec-v tabular', text: planDay.km ? `${planDay.km} km` : 'Easy' })]),
      el('div', { class: 'spec-item' }, [el('span', { class: 'spec-k', text: 'Heart Rate Cap' }), el('span', { class: 'spec-v tabular', text: `${z2Lo}–${z2Hi} bpm` })]),
      el('div', { class: 'spec-item' }, [el('span', { class: 'spec-k', text: 'Execution' }), el('span', { class: 'spec-v', text: 'Easy pace · walk breaks if > 163' })]),
    ]));

    const pre = hub.plan.warmup.pre_run || [];
    const actions = [];
    if (pre.length) {
      actions.push(el('button', {
        type: 'button',
        class: 'drawer-btn',
        text: state.warmupOpen ? `Hide Pre-Run Warmup (${pre.length})` : `Pre-Run Warmup (${pre.length} moves)`,
        onClick: () => { state.warmupOpen = !state.warmupOpen; redraw(); },
      }));
    }
    const runLink = safeExternalLink(hub.plan.link.run_cards, 'Swipe Cards ↗');
    if (runLink) actions.push(runLink);
    card.appendChild(el('div', { class: 'chip-row' }, actions));

    if (state.warmupOpen && pre.length) {
      card.appendChild(el('div', { class: 'hairline-list', style: { marginTop: '12px' } }, pre.map((w) =>
        el('div', { class: 'hairline-row' }, [
          el('div', {}, [el('div', { class: 'row-title', text: w.move }), el('div', { class: 'row-sub', text: w.cue })]),
          el('div', { class: 'row-right', text: w.dose }),
        ]),
      )));
    }
  } else if (planDay.type === 'gym') {
    const list = hub.plan.exercises[planDay.session] || [];
    card.appendChild(el('div', { class: 'hairline-list' }, list.map((ex) => {
      const last = lastLoggedFor(hub, ex, day);
      const expKey = `rx:${ex.name}`;
      const isOpen = !!state.expanded[expKey];
      const item = el('div', { class: 'ex-item' }, [
        el('div', {
          class: 'ex-head',
          onClick: () => { state.expanded[expKey] = !isOpen; redraw(); },
        }, [
          el('div', {}, [
            el('div', { class: 'ex-name', text: `${ex.order}. ${ex.name}` }),
            el('div', { class: 'ex-dose', text: ex.dose }),
          ]),
          el('span', { class: 'row-right', text: last ? formatSet(last.top) : 'New' }),
        ]),
      ]);
      if (isOpen) {
        item.appendChild(el('div', { class: 'ex-cues' }, [
          ex.setup ? el('div', {}, [el('strong', { text: 'Setup: ' }), ex.setup]) : null,
          ex.feel ? el('div', {}, [el('strong', { text: 'Feel: ' }), ex.feel]) : null,
          ex.watch ? el('div', {}, [el('strong', { text: 'Watch out: ' }), ex.watch]) : null,
        ]));
      }
      return item;
    })));
    const gymLink = safeExternalLink(hub.plan.link.gym_cards, 'Gym Swipe Cards ↗');
    if (gymLink) card.appendChild(el('div', { style: { marginTop: '14px' } }, [gymLink]));
  } else {
    card.appendChild(el('p', {
      class: 'hero-text',
      text: 'Rest day — hit your 7,500+ step floor with easy walks, hydrate, prioritize protein, and aim for 8 h of sleep.',
    }));
  }

  return card;
}

function buildMilestonesAndWinsCard(hub, today) {
  const races = allRaces(hub, today);
  const wins = recentWins(hub, today).slice(0, 3);

  return el('div', { class: 'card' }, [
    el('div', { class: 'card-head', style: { marginBottom: '6px' } }, [
      el('h3', { class: 'card-title', text: 'Upcoming Races' }),
    ]),
    el('div', { class: 'hairline-list' }, races.map((r) => el('div', { class: 'hairline-row' }, [
      el('div', {}, [
        el('div', { class: 'row-title', text: `${r.name}` }),
        el('div', { class: 'row-sub', text: `${r.distance} · ${prettyDate(r.date, false)} · Week ${r.week}` }),
      ]),
      el('div', { class: 'row-right', text: r.days >= 0 ? `${r.days}d` : 'Done' }),
    ]))),
    el('div', { class: 'section-divider' }),
    el('div', { class: 'card-head', style: { marginBottom: '6px' } }, [
      el('h3', { class: 'card-title', text: 'Recent Momentum' }),
    ]),
    el('div', { class: 'hairline-list' }, wins.length
      ? wins.map((w) => el('div', { class: 'hairline-row' }, [
        el('div', {}, [
          el('div', { class: 'row-title', text: w.title }),
          el('div', { class: 'row-sub', text: w.detail }),
        ]),
      ]))
      : [el('p', { class: 'card-sub', text: 'Your next PR or Zone 2 milestone will appear here.' })]),
  ]);
}

// =============================================================================
// VIEW 2: RUNNING & 10K LAB
// =============================================================================

export function renderRunningView(hub, state, redraw) {
  const frag = document.createDocumentFragment();
  const runs = footRuns(hub);
  const allCardio = hub.activities;
  const z2Lo = zone2Low(hub);
  const z2Hi = zone2Max(hub);

  const totalRunKm = sum(runs.map((r) => r.km || 0));
  const avgRunHr = avg(runs.map((r) => r.avgHr));
  const avgZ2 = avg(runs.map((r) => r.z2pct));
  const totalElev = sum(runs.map((r) => r.elevGain || 0));

  frag.appendChild(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title', text: 'Running & 10K Lab' }),
      el('p', { class: 'page-sub', text: `Runna 21-Week Build • Zone 2 Aerobic Cap ${z2Lo}–${z2Hi} bpm • ${runs.length} runs & ${allCardio.length - runs.length} walks synced` }),
    ]),
  ]));

  // Top 4 KPIs
  frag.appendChild(el('section', { class: 'grid grid-4' }, [
    kpiCard({ label: 'Total Run Distance', value: fmt(totalRunKm, 1), unit: 'km', sub: `${runs.length} Strava runs logged`, color: '#38bdf8' }),
    kpiCard({
      label: 'Avg Run Heart Rate',
      value: avgRunHr ? Math.round(avgRunHr) : '—',
      unit: 'bpm',
      sub: `Target ≤ ${z2Hi} bpm (Zone 2)`,
      badge: hrPill(avgRunHr, z2Hi),
    }),
    kpiCard({
      label: 'Avg Time in Zone 2',
      value: avgZ2 !== null ? fmt(avgZ2, 1) : '—',
      unit: '%',
      sub: `${runs.filter((r) => r.z2pct !== null).length} runs with HR stream`,
      color: '#22c55e',
    }),
    kpiCard({ label: 'Total Elevation Gain', value: fmtInt(totalElev), unit: 'm', sub: `${fmtInt(sum(runs.map((r) => r.kcal || 0)))} kcal burned` }),
  ]));

  // Two side-by-side main charts
  const runnaData = runnaProgress(hub);
  const runnaCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h3', { class: 'card-title', text: '21-Week Runna Volume: Planned vs Actual' }),
        el('div', { class: 'card-sub', text: 'Gold dots mark race weeks • Hover bars for exact km' }),
      ]),
      legend([
        { color: 'rgba(148,163,184,0.45)', label: 'Planned km' },
        { color: '#38bdf8', label: 'Actual km' },
        { color: '#f59e0b', label: 'Race week' },
      ]),
    ]),
    barChart({
      items: runnaData.map((w) => ({
        label: w.label,
        planned: w.planned,
        actual: w.actual,
        tooltip: `W${w.week} (${prettyDate(w.start, false)})`,
        marker: w.race,
      })),
      series: [
        { key: 'planned', label: 'Planned', color: 'rgba(148,163,184,0.45)' },
        { key: 'actual', label: 'Actual', color: '#38bdf8' },
      ],
      yUnit: ' km',
      height: 230,
    }),
  ]);

  const chronoRuns = [...runs].reverse().filter((r) => r.avgHr !== null);
  const hrChartCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h3', { class: 'card-title', text: 'Avg Heart Rate per Run vs Zone 2 Band' }),
        el('div', { class: 'card-sub', text: `Shaded green band = Zone 2 (${z2Lo}–${z2Hi} bpm)` }),
      ]),
      legend([
        { color: '#22c55e', label: `In Z2 (≤${z2Hi})` },
        { color: '#f59e0b', label: 'Z3 (164–176)' },
        { color: '#f43f5e', label: 'Hot (>176)' },
      ]),
    ]),
    lineChart({
      labels: chronoRuns.map((r) => prettyDate(r.date, false)),
      series: [{
        name: 'Avg HR',
        values: chronoRuns.map((r) => r.avgHr),
        color: '#38bdf8',
        area: true,
        pointColor: (v) => (v <= z2Hi ? '#22c55e' : v <= 176 ? '#f59e0b' : '#f43f5e'),
      }],
      yMin: 120,
      yMax: 195,
      yUnit: '',
      band: { low: z2Lo, high: z2Hi, color: '#22c55e', label: `ZONE 2 (${z2Lo}–${z2Hi} bpm)` },
      height: 230,
    }),
  ]);

  frag.appendChild(el('section', { class: 'grid grid-2' }, [runnaCard, hrChartCard]));

  // Cumulative HR Zones & Shoe Mileage
  const zTotals = {
    z1: sum(runs.map((r) => r.z1 || 0)),
    z2: sum(runs.map((r) => r.z2 || 0)),
    z3: sum(runs.map((r) => r.z3 || 0)),
    z4: sum(runs.map((r) => r.z4 || 0)),
    z5: sum(runs.map((r) => r.z5 || 0)),
  };
  const zSum = zTotals.z1 + zTotals.z2 + zTotals.z3 + zTotals.z4 + zTotals.z5;
  const shoes = shoeMileage(hub);

  frag.appendChild(el('section', { class: 'grid grid-2' }, [
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { class: 'card-title', text: 'Cumulative HR Zone Distribution' }),
        el('span', { class: 'card-sub', text: `${Math.round(zSum)} total zone minutes` }),
      ]),
      zoneBar(zTotals),
      el('div', { class: 'detail-grid', style: { marginTop: '12px' } }, [
        ['Z1 Easy', zTotals.z1, 'muted'],
        ['Z2 Aerobic', zTotals.z2, 'green'],
        ['Z3 Tempo', zTotals.z3, 'amber'],
        ['Z4 Threshold', zTotals.z4, 'amber'],
        ['Z5 Peak', zTotals.z5, 'rose'],
      ].map(([lbl, mins, tone]) => el('div', { class: 'detail-kv' }, [
        el('span', { class: 'detail-k', text: lbl }),
        pill(`${Math.round(mins)}m (${zSum > 0 ? Math.round((mins / zSum) * 100) : 0}%)`, tone),
      ]))),
    ]),
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { class: 'card-title' }, [icon('shoe', 16), 'Shoe Mileage Tracker']),
        el('span', { class: 'card-sub', text: 'Replace around 600–700 km' }),
      ]),
      ...shoes.map((sh) => {
        const pct = Math.min(100, (sh.km / 650) * 100);
        return el('div', { style: { marginBottom: '10px' } }, [
          el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 600 } }, [
            el('span', { text: sh.name }),
            el('span', { class: 'tabular', text: `${sh.km} / 650 km` }),
          ]),
          el('div', { class: 'prog-track' }, [el('div', { class: 'prog-fill', style: { width: `${pct.toFixed(1)}%` } })]),
        ]);
      }),
    ]),
  ]));

  // Full Expandable Run Log
  const filter = state.runFilter || 'Run';
  const filtered = filter === 'All' ? allCardio : allCardio.filter((a) => (filter === 'Run' ? a.sport.includes('Run') : !a.sport.includes('Run')));

  const tbody = el('tbody');
  filtered.forEach((a) => {
    const isOpen = !!state.expanded[`run:${a.id}`];
    const tr = el('tr', {
      class: 'clickable',
      onClick: () => { state.expanded[`run:${a.id}`] = !isOpen; redraw(); },
    }, [
      el('td', { class: 'strong', text: prettyDate(a.date, false) }),
      el('td', { class: 'strong' }, [
        a.name,
        a.prs > 0 ? el('span', { style: { marginLeft: '6px' } }, [pill(`${a.prs} PR`, 'amber')]) : null,
      ]),
      el('td', { text: a.km !== null ? `${a.km.toFixed(2)} km` : '—' }),
      el('td', { text: a.pace ? `${a.pace} /km` : '—' }),
      el('td', { text: a.movingMin !== null ? `${Math.round(a.movingMin)}m` : '—' }),
      el('td', {}, [hrPill(a.avgHr, z2Hi)]),
      el('td', {}, [zoneBar({ z1: a.z1, z2: a.z2, z3: a.z3, z4: a.z4, z5: a.z5 })]),
      el('td', { text: a.z2pct !== null ? `${a.z2pct}%` : '—' }),
    ]);
    tbody.appendChild(tr);

    if (isOpen) {
      const details = el('div', { class: 'detail-panel' }, [
        el('div', { class: 'detail-grid' }, [
          a.maxHr ? el('div', { class: 'detail-kv' }, [el('span', { class: 'detail-k', text: 'Max HR' }), el('span', { class: 'detail-v', text: `${Math.round(a.maxHr)} bpm` })]) : null,
          a.hr1 && a.hr2 ? el('div', { class: 'detail-kv' }, [el('span', { class: 'detail-k', text: '1st → 2nd Half HR' }), el('span', { class: 'detail-v', text: `${Math.round(a.hr1)} → ${Math.round(a.hr2)} bpm` })]) : null,
          a.pace1 && a.pace2 ? el('div', { class: 'detail-kv' }, [el('span', { class: 'detail-k', text: '1st → 2nd Half Pace' }), el('span', { class: 'detail-v', text: `${a.pace1} → ${a.pace2}` })]) : null,
          a.drift !== null ? el('div', { class: 'detail-kv' }, [el('span', { class: 'detail-k', text: 'Cardiac Drift' }), el('span', { class: 'detail-v', text: `${a.drift}%` })]) : null,
          a.elevGain !== null ? el('div', { class: 'detail-kv' }, [el('span', { class: 'detail-k', text: 'Elevation' }), el('span', { class: 'detail-v', text: `${a.elevGain} m` })]) : null,
          a.kcal ? el('div', { class: 'detail-kv' }, [el('span', { class: 'detail-k', text: 'Calories' }), el('span', { class: 'detail-v', text: `${Math.round(a.kcal)} kcal` })]) : null,
          a.shoe ? el('div', { class: 'detail-kv' }, [el('span', { class: 'detail-k', text: 'Shoe' }), el('span', { class: 'detail-v', text: a.shoe })]) : null,
        ]),
        a.description ? el('div', {}, [el('strong', { text: 'Notes: ' }), a.description]) : null,
        a.splits ? el('div', {}, [el('strong', { text: 'Per-km Splits: ' }), a.splits]) : null,
        a.bestEfforts ? el('div', {}, [el('strong', { text: 'Best Efforts: ' }), a.bestEfforts]) : null,
      ]);
      tbody.appendChild(el('tr', {}, [el('td', { colspan: 8, style: { padding: '4px 10px 12px' } }, [details])]));
    }
  });

  frag.appendChild(el('section', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h3', { class: 'card-title', text: 'Cardio Activity Log' }),
        el('div', { class: 'card-sub', text: 'Click any row to inspect splits, HR halves, drift & Strava notes' }),
      ]),
      el('div', { class: 'seg-group' }, ['Run', 'Walk', 'All'].map((opt) =>
        el('button', {
          type: 'button',
          class: `seg-btn${filter === opt ? ' active' : ''}`,
          text: opt === 'Run' ? `Runs (${runs.length})` : opt === 'Walk' ? `Walks (${allCardio.length - runs.length})` : `All (${allCardio.length})`,
          onClick: () => { state.runFilter = opt; redraw(); },
        }),
      )),
    ]),
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data-table' }, [
        el('thead', {}, [el('tr', {}, ['Date', 'Activity', 'Dist', 'Pace', 'Time', 'Avg HR', 'Z1–Z5 Zones', 'Z2 %'].map((h) => el('th', { text: h })))]),
        tbody,
      ]),
    ]),
  ]));

  return frag;
}

// =============================================================================
// VIEW 3: STRENGTH & LIFTING LAB (HEVY)
// =============================================================================

export function renderStrengthView(hub, state, redraw) {
  const frag = document.createDocumentFragment();
  const parsedSessions = hub.sessions.filter((s) => s.sets.length > 0);
  const totalSets = sum(parsedSessions.map((s) => sessionTotals(s).sets));
  const totalVol = sum(parsedSessions.map((s) => sessionTotals(s).kg));
  const pullUp = pullUpProgress(hub);
  const exercises = trackedExercises(hub);

  if (!state.selectedExercise && exercises.length) {
    const preferred = exercises.find((e) => e.name.toLowerCase().includes('hip thrust')) || exercises[0];
    state.selectedExercise = preferred.name;
  }

  frag.appendChild(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title', text: 'Strength & Lifting Lab' }),
      el('p', { class: 'page-sub', text: `Hevy Set-by-Set Telemetry • ${hub.sessions.length} strength workouts (${parsedSessions.length} parsed with full sets)` }),
    ]),
  ]));

  // Top 4 KPIs
  frag.appendChild(el('section', { class: 'grid grid-4' }, [
    kpiCard({ label: 'Strength Workouts', value: hub.sessions.length, sub: `${parsedSessions.length} Hevy set-parsed` }),
    kpiCard({ label: 'Total Sets Logged', value: fmtInt(totalSets), sub: 'Across Upper A, Lower & Upper B', color: '#f59e0b' }),
    kpiCard({ label: 'Total Volume Lifted', value: `${(totalVol / 1000).toFixed(1)}t`, sub: `${fmtInt(totalVol)} kg cumulative tonnage`, color: '#22c55e' }),
    kpiCard({
      label: 'Assisted Pull-Up',
      value: pullUp ? pullUp.best : '—',
      unit: 'kg assist',
      sub: pullUp ? `Down from ${pullUp.start} kg → goal 0 kg` : 'Lower = stronger',
      badge: pullUp ? pill(`-${pullUp.start - pullUp.best} kg`, 'green') : null,
    }),
  ]));

  // Featured Inverted Assisted Pull-Up Countdown Card + Exercise Progression Explorer
  const pullUpCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h3', { class: 'card-title', text: 'Pull-Up Countdown (Lower = Stronger)' }),
        el('div', { class: 'card-sub', text: 'Inverted assistance tracker toward first unassisted pull-up (0 kg)' }),
      ]),
      pullUp ? pill(`Best: ${pullUp.best} kg`, 'green') : null,
    ]),
    ...(pullUp ? [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, marginBottom: '4px' } }, [
        el('span', { text: `Start: ${pullUp.start} kg` }),
        el('span', { style: { color: 'var(--green)' }, text: `Current Best: ${pullUp.best} kg (${Math.round(((pullUp.start - pullUp.best) / pullUp.start) * 100)}% of way to 0 kg)` }),
        el('span', { text: 'Goal: 0 kg' }),
      ]),
      el('div', { class: 'prog-track' }, [
        el('div', { class: 'prog-fill', style: { width: `${Math.max(5, ((pullUp.start - pullUp.best) / Math.max(1, pullUp.start)) * 100).toFixed(1)}%` } }),
      ]),
      lineChart({
        labels: pullUp.points.map((p) => p.label),
        series: [{ name: 'Assistance (kg)', values: pullUp.points.map((p) => p.kg), color: '#22c55e', area: true }],
        yMin: 0,
        yUnit: ' kg',
        targetLine: { value: 0, color: '#22c55e', label: 'UNASSISTED (0 kg)' },
        height: 175,
      }),
    ] : [el('p', { class: 'card-sub', text: 'Log Pull Up (Assisted) in Hevy to track countdown.' })]),
  ]);

  const hist = state.selectedExercise ? exerciseHistory(hub, state.selectedExercise) : { points: [], inverted: false };
  const exSelect = el('select', {
    class: 'select-input',
    onChange: (e) => { state.selectedExercise = e.target.value; redraw(); },
  }, exercises.map((ex) => el('option', {
    value: ex.name,
    selected: ex.name === state.selectedExercise ? 'selected' : null,
    text: `${ex.name} (${ex.count}×)`,
  })));

  const progCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h3', { class: 'card-title', text: 'Exercise Progression' }),
        el('div', { class: 'card-sub', text: hist.inverted ? 'Inverted: lower assistance kg = stronger' : 'Top working weight (kg) & Estimated 1RM (kg)' }),
      ]),
      exSelect,
    ]),
    legend([
      { color: '#f59e0b', label: 'Top Set (kg)' },
      ...(!hist.inverted ? [{ color: '#818cf8', label: 'Est. 1RM (kg)' }] : []),
    ]),
    lineChart({
      labels: hist.points.map((p) => p.label),
      series: [
        { name: 'Top kg', values: hist.points.map((p) => p.kg), color: '#f59e0b', area: true },
        ...(!hist.inverted ? [{ name: 'Est 1RM', values: hist.points.map((p) => p.est1rm), color: '#818cf8', dashed: true }] : []),
      ],
      yUnit: ' kg',
      height: 205,
    }),
  ]);

  frag.appendChild(el('section', { class: 'grid grid-2' }, [pullUpCard, progCard]));

  // Monthly Tonnage Bar Chart
  const monthlyChron = [...hub.monthly].reverse().filter((m) => m.gymVolKg > 0 || m.gymSessions > 0);
  frag.appendChild(el('section', { class: 'card', style: { marginBottom: '16px' } }, [
    el('div', { class: 'card-head' }, [
      el('h3', { class: 'card-title', text: 'Monthly Strength Tonnage (kg)' }),
      el('span', { class: 'card-sub', text: 'Total kg lifted per month from Monthly_Summary' }),
    ]),
    barChart({
      items: monthlyChron.map((m) => ({
        label: shortMonth(m.month),
        value: m.gymVolKg,
        tooltip: `${shortMonth(m.month)} (${m.gymSessions} sessions, ${m.totalSets} sets)`,
      })),
      color: '#f59e0b',
      yUnit: '',
      width: 1020,
      height: 210,
    }),
  ]));

  // Switchable: Workout History vs Gym Block Cues
  const subTab = state.strengthTab || 'history';
  const bottomCard = el('section', { class: 'card' });
  bottomCard.appendChild(el('div', { class: 'card-head' }, [
    el('h3', { class: 'card-title', text: subTab === 'history' ? 'Workout History (Set-by-Set)' : 'Gym Program Blocks & Cues' }),
    el('div', { class: 'seg-group' }, [
      ['history', 'Workout History'],
      ['Upper A', 'Upper A'],
      ['Lower', 'Lower'],
      ['Upper B', 'Upper B'],
    ].map(([k, lbl]) => el('button', {
      type: 'button',
      class: `seg-btn${subTab === k ? ' active' : ''}`,
      text: lbl,
      onClick: () => { state.strengthTab = k; redraw(); },
    }))),
  ]));

  if (subTab === 'history') {
    const tbody = el('tbody');
    hub.sessions.forEach((s) => {
      const totals = sessionTotals(s);
      const isOpen = !!state.expanded[`lift:${s.id}`];
      tbody.appendChild(el('tr', {
        class: 'clickable',
        onClick: () => { state.expanded[`lift:${s.id}`] = !isOpen; redraw(); },
      }, [
        el('td', { class: 'strong', text: prettyDate(s.date, false) }),
        el('td', { class: 'strong', text: s.title }),
        el('td', { text: s.durationMin ? `${Math.round(s.durationMin)}m` : '—' }),
        el('td', { text: totals.sets ? `${totals.sets} sets` : 'Summary only' }),
        el('td', { text: totals.kg ? `${fmtInt(totals.kg)} kg` : '—' }),
        el('td', { text: s.kcal ? `${Math.round(s.kcal)} kcal` : '—' }),
      ]));

      if (isOpen && s.sets.length) {
        const grouped = new Map();
        s.sets.forEach((st) => {
          if (!grouped.has(st.exercise)) grouped.set(st.exercise, []);
          grouped.get(st.exercise).push(st);
        });
        const panel = el('div', { class: 'detail-panel' }, Array.from(grouped.entries()).map(([exName, sets]) =>
          el('div', { style: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' } }, [
            el('strong', { text: exName }),
            el('div', { class: 'chip-row' }, sets.map((st) =>
              pill(formatSet(st) + (st.type === 'Warm-up' ? ' (W)' : ''), st.type === 'Warm-up' ? 'muted' : 'amber'),
            )),
          ]),
        ));
        tbody.appendChild(el('tr', {}, [el('td', { colspan: 6, style: { padding: '4px 10px 12px' } }, [panel])]));
      }
    });
    bottomCard.appendChild(el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data-table' }, [
        el('thead', {}, [el('tr', {}, ['Date', 'Workout', 'Duration', 'Sets', 'Volume', 'Calories'].map((h) => el('th', { text: h })))]),
        tbody,
      ]),
    ]));
  } else {
    const list = hub.plan.exercises[subTab] || [];
    list.forEach((ex) => {
      const last = lastLoggedFor(hub, ex, addDays(state.today, 1));
      bottomCard.appendChild(el('div', { class: 'ex-item' }, [
        el('div', { class: 'ex-head' }, [
          el('div', {}, [el('div', { class: 'ex-name', text: `${ex.order}. ${ex.name}` }), el('div', { class: 'ex-dose', text: ex.dose })]),
          last ? pill(`Last: ${formatSet(last.top)} (${prettyDate(last.date, false)})`, 'amber') : pill('Not logged yet', 'muted'),
        ]),
        el('div', { class: 'ex-cues' }, [
          ex.setup ? el('div', {}, [el('strong', { text: 'Setup: ' }), ex.setup]) : null,
          ex.feel ? el('div', {}, [el('strong', { text: 'Feel: ' }), ex.feel]) : null,
          ex.watch ? el('div', {}, [el('strong', { text: 'Watch out: ' }), ex.watch]) : null,
        ]),
      ]));
    });
  }

  frag.appendChild(bottomCard);
  return frag;
}

// =============================================================================
// VIEW 4: SLEEP, RECOVERY & RING BIOMETRICS (137 DAYS)
// =============================================================================

export function renderSleepView(hub, state, redraw) {
  const frag = document.createDocumentFragment();
  const range = state.ringRange || 30;
  const slice = range === 'ALL' ? hub.ringList : hub.ringList.slice(-range);
  const sTarget = stepTarget(hub);

  const avgSleep = avg(slice.map((r) => r.sleep));
  const avgScore = avg(slice.map((r) => r.sleepScore));
  const avgHrv = avg(slice.map((r) => r.hrv));
  const avgRhr = avg(slice.map((r) => r.rhr));
  const avgSteps = avg(slice.map((r) => r.steps));
  const stepDays = slice.filter((r) => r.steps !== null);
  const stepHitPct = stepDays.length ? Math.round((stepDays.filter((r) => r.steps >= sTarget).length / stepDays.length) * 100) : 0;

  frag.appendChild(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title', text: 'Sleep, Recovery & Biometrics' }),
      el('p', { class: 'page-sub', text: `Ultrahuman Ring Air • ${hub.ringList.length} days tracked (${prettyDate(hub.ringList[0]?.date, false)} → ${prettyDate(hub.ringList[hub.ringList.length - 1]?.date, false)})` }),
    ]),
    el('div', { class: 'seg-group' }, [14, 30, 90, 'ALL'].map((r) =>
      el('button', {
        type: 'button',
        class: `seg-btn${range === r ? ' active' : ''}`,
        text: r === 'ALL' ? `All (${hub.ringList.length}d)` : `${r}D`,
        onClick: () => { state.ringRange = r; redraw(); },
      }),
    )),
  ]));

  // 4 Range Summary KPIs
  frag.appendChild(el('section', { class: 'grid grid-4' }, [
    kpiCard({ label: 'Avg Sleep', value: fmt(avgSleep, 2), unit: 'h', sub: `Avg Score ${avgScore ? Math.round(avgScore) : '—'}/100 • Target 8.0h`, color: '#818cf8' }),
    kpiCard({ label: 'Avg Sleep HRV', value: avgHrv ? fmt(avgHrv, 1) : '—', unit: 'ms', sub: `Avg Recovery ${fmt(avg(slice.map((r) => r.recovery)), 0)}/100`, color: '#22c55e' }),
    kpiCard({ label: 'Avg Sleep RHR', value: avgRhr ? fmt(avgRhr, 1) : '—', unit: 'bpm', sub: `Avg Skin Temp ${fmt(avg(slice.map((r) => r.skinTemp)), 2)} °C`, color: '#f43f5e' }),
    kpiCard({ label: 'Avg Daily Steps', value: fmtInt(avgSteps), sub: `${stepHitPct}% of days hit ≥ ${sTarget.toLocaleString()}`, badge: pill(`${stepHitPct}% hit`, stepHitPct >= 65 ? 'green' : 'amber') }),
  ]));

  // Sleep Architecture Stacked Bar Chart + Daily Steps Chart
  const sleepArchCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h3', { class: 'card-title', text: 'Sleep Architecture (Deep / REM / Light)' }),
        el('div', { class: 'card-sub', text: 'Hours per night vs 8.0 h target' }),
      ]),
      legend([
        { color: '#6366f1', label: 'Deep' },
        { color: '#a855f7', label: 'REM' },
        { color: '#38bdf8', label: 'Light' },
      ]),
    ]),
    barChart({
      items: slice.map((r) => ({
        label: prettyDate(r.date, false),
        tooltip: `${r.date} (Score ${r.sleepScore ?? '—'})`,
        deep: r.deepMin ? Math.round((r.deepMin / 60) * 100) / 100 : 0,
        rem: r.remMin ? Math.round((r.remMin / 60) * 100) / 100 : 0,
        light: r.lightMin ? Math.round((r.lightMin / 60) * 100) / 100 : 0,
      })),
      stacked: true,
      series: [
        { key: 'deep', label: 'Deep', color: '#6366f1' },
        { key: 'rem', label: 'REM', color: '#a855f7' },
        { key: 'light', label: 'Light', color: '#38bdf8' },
      ],
      yUnit: 'h',
      targetLine: { value: 8, color: '#22c55e', label: '8.0h TARGET' },
      height: 225,
    }),
  ]);

  const stepsCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h3', { class: 'card-title', text: 'Daily Steps vs 7,500 Floor' }),
        el('div', { class: 'card-sub', text: 'Emerald = hit target • Blue = below floor' }),
      ]),
      pill(`${stepHitPct}% Consistency`, stepHitPct >= 65 ? 'green' : 'cyan'),
    ]),
    barChart({
      items: slice.map((r) => ({
        label: prettyDate(r.date, false),
        tooltip: r.date,
        value: r.steps || 0,
        color: (r.steps || 0) >= sTarget ? '#22c55e' : '#38bdf8',
      })),
      targetLine: { value: sTarget, color: '#22c55e', label: '7.5k FLOOR' },
      height: 225,
    }),
  ]);

  frag.appendChild(el('section', { class: 'grid grid-2' }, [sleepArchCard, stepsCard]));

  // HRV + RHR & Recovery + Movement Trends
  const hrvCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { class: 'card-title', text: 'Autonomic Trends: HRV (ms) & Sleep RHR (bpm)' }),
      legend([{ color: '#22c55e', label: 'HRV (ms)' }, { color: '#f43f5e', label: 'Sleep RHR (bpm)' }]),
    ]),
    lineChart({
      labels: slice.map((r) => prettyDate(r.date, false)),
      series: [
        { name: 'HRV', values: slice.map((r) => r.hrv), color: '#22c55e', area: true },
        { name: 'RHR', values: slice.map((r) => r.rhr), color: '#f43f5e' },
      ],
      height: 215,
    }),
  ]);

  const recCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { class: 'card-title', text: 'Recovery Index & Movement Index' }),
      legend([{ color: '#818cf8', label: 'Recovery' }, { color: '#38bdf8', label: 'Movement' }]),
    ]),
    lineChart({
      labels: slice.map((r) => prettyDate(r.date, false)),
      series: [
        { name: 'Recovery', values: slice.map((r) => r.recovery), color: '#818cf8', area: true },
        { name: 'Movement', values: slice.map((r) => r.movement), color: '#38bdf8' },
      ],
      yMin: 20,
      yMax: 100,
      height: 215,
    }),
  ]);

  frag.appendChild(el('section', { class: 'grid grid-2' }, [hrvCard, recCard]));

  // Recent 14 Nights Table
  const recent14 = [...hub.ringList].reverse().slice(0, 14);
  frag.appendChild(el('section', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { class: 'card-title', text: 'Recent 14 Nights Telemetry' }),
    ]),
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data-table' }, [
        el('thead', {}, [el('tr', {}, ['Date', 'Score', 'Sleep', 'Deep / REM', 'Eff', 'Bed → Wake', 'RHR', 'HRV', 'Recovery', 'Steps'].map((h) => el('th', { text: h })))]),
        el('tbody', {}, recent14.map((r) => el('tr', {}, [
          el('td', { class: 'strong', text: prettyDate(r.date, true) }),
          el('td', {}, [pill(r.sleepScore ?? '—', (r.sleepScore ?? 0) >= 80 ? 'green' : (r.sleepScore ?? 0) >= 65 ? 'indigo' : 'amber')]),
          el('td', { class: 'strong', text: r.sleep ? `${r.sleep.toFixed(2)}h` : '—' }),
          el('td', { text: `${r.deepMin ?? '—'}m / ${r.remMin ?? '—'}m` }),
          el('td', { text: r.efficiency ? `${r.efficiency}%` : '—' }),
          el('td', { text: r.bedtime && r.wakeTime ? `${r.bedtime} → ${r.wakeTime}` : '—' }),
          el('td', { text: r.rhr ? `${Math.round(r.rhr)}` : '—' }),
          el('td', { text: r.hrv ? `${Math.round(r.hrv)} ms` : '—' }),
          el('td', { text: r.recovery ? `${Math.round(r.recovery)}` : '—' }),
          el('td', { text: r.steps !== null ? r.steps.toLocaleString() : '—' }),
        ]))),
      ]),
    ]),
  ]));

  return frag;
}

// =============================================================================
// VIEW 5: MONTHLY ARCHIVE & 21-WEEK ROADMAP
// =============================================================================

export function renderMonthlyView(hub) {
  const frag = document.createDocumentFragment();
  const monthlyChron = [...hub.monthly].reverse();

  frag.appendChild(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { class: 'page-title', text: 'Monthly Archive & 21-Week Roadmap' }),
      el('p', { class: 'page-sub', text: `Live rollups from Monthly_Summary (${hub.monthly.length} months) & Runna schedule` }),
    ]),
  ]));

  // Monthly Run km & Monthly Avg Steps charts
  frag.appendChild(el('section', { class: 'grid grid-2' }, [
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { class: 'card-title', text: 'Monthly Running Volume (km)' }),
      ]),
      barChart({
        items: monthlyChron.map((m) => ({ label: shortMonth(m.month), value: m.runKm, tooltip: `${shortMonth(m.month)} (${m.cardioSessions} sessions)` })),
        color: '#38bdf8',
        yUnit: ' km',
        height: 205,
      }),
    ]),
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { class: 'card-title', text: 'Monthly Avg Sleep (h) & Recovery' }),
        legend([{ color: '#818cf8', label: 'Avg Sleep (h)' }]),
      ]),
      lineChart({
        labels: monthlyChron.filter((m) => m.sleepHr).map((m) => shortMonth(m.month)),
        series: [{ name: 'Sleep', values: monthlyChron.filter((m) => m.sleepHr).map((m) => m.sleepHr), color: '#818cf8', area: true }],
        yMin: 5,
        yMax: 9.5,
        yUnit: 'h',
        targetLine: { value: 8, color: '#22c55e', label: '8.0h' },
        height: 205,
      }),
    ]),
  ]));

  // Full Monthly_Summary table
  frag.appendChild(el('section', { class: 'card', style: { marginBottom: '16px' } }, [
    el('div', { class: 'card-head' }, [
      el('h3', { class: 'card-title', text: 'Month-by-Month Rollup' }),
    ]),
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data-table' }, [
        el('thead', {}, [el('tr', {}, ['Month', 'Days', 'Sleep Score', 'Avg Sleep', 'RHR', 'HRV', 'Recovery', 'Avg Steps', 'Runs', 'Run km', 'Avg Run HR', 'Gym', 'Gym Tonnage'].map((h) => el('th', { text: h })))]),
        el('tbody', {}, hub.monthly.map((m) => el('tr', {}, [
          el('td', { class: 'strong', text: shortMonth(m.month) }),
          el('td', { text: m.days ?? '—' }),
          el('td', { text: m.sleepScore ? fmt(m.sleepScore, 1) : '—' }),
          el('td', { text: m.sleepHr ? `${fmt(m.sleepHr, 2)}h` : '—' }),
          el('td', { text: m.rhr ? fmt(m.rhr, 1) : '—' }),
          el('td', { text: m.hrv ? `${fmt(m.hrv, 1)} ms` : '—' }),
          el('td', { text: m.recovery ? fmt(m.recovery, 1) : '—' }),
          el('td', { text: m.steps ? fmtInt(m.steps) : '—' }),
          el('td', { text: m.cardioSessions || '—' }),
          el('td', { class: 'strong', text: m.runKm ? `${fmt(m.runKm, 1)} km` : '—' }),
          el('td', { text: m.avgRunHr ? `${Math.round(m.avgRunHr)} bpm` : '—' }),
          el('td', { text: m.gymSessions ? `${m.gymSessions} (${m.totalSets}s)` : '—' }),
          el('td', { class: 'strong', text: m.gymVolKg ? `${fmtInt(m.gymVolKg)} kg` : '—' }),
        ]))),
      ]),
    ]),
  ]));

  // Full 21-Week Runna Table
  const runna = runnaProgress(hub);
  frag.appendChild(el('section', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { class: 'card-title', text: '21-Week Runna Schedule' }),
      el('span', { class: 'card-sub', text: 'Wed / Fri / Sun • Distance only, Zone 2 cap' }),
    ]),
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data-table' }, [
        el('thead', {}, [el('tr', {}, ['Week', 'Dates', 'Planned', 'Logged', 'Status', 'Notes / Race'].map((h) => el('th', { text: h })))]),
        el('tbody', {}, runna.map((w) => {
          const hit = w.planned > 0 && w.actual >= w.planned * 0.9;
          return el('tr', {}, [
            el('td', { class: 'strong', text: `Week ${w.week}` }),
            el('td', { text: `${prettyDate(w.start, false)} – ${prettyDate(w.end, false)}` }),
            el('td', { text: `${w.planned} km` }),
            el('td', { class: 'strong', text: w.actual > 0 ? `${w.actual} km` : '—' }),
            el('td', {}, [
              w.race ? pill(w.race, 'amber')
                : hit ? pill('On Target', 'green')
                  : w.actual > 0 ? pill('In Progress', 'cyan')
                    : pill('Upcoming', 'muted'),
            ]),
            el('td', { text: w.note || '' }),
          ]);
        })),
      ]),
    ]),
  ]));

  return frag;
}
