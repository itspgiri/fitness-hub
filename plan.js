// Plan parsing, date helpers and the rules behind the Today screen.
// Everything here is plain calculation on the data it is given.

const TZ = 'Asia/Kolkata';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FOOT_RUN = new Set(['Run', 'TrailRun', 'VirtualRun']);
const WALK = new Set(['Walk', 'Hike']);
const INVERTED_LIFTS = new Set(['pull up (assisted)']);

export const STEP_TARGET_FALLBACK = 7500;
export const SLEEP_SHORT_HOURS = 6.5;
export const CUTOFF_MINUTES = 20 * 60;
export const STALE_HOURS = 8;

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---- dates (all as 'YYYY-MM-DD' strings) -----------------------------------

const toDate = (s) => new Date(s + 'T00:00:00Z');

export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayName = (s) => DAY_NAMES[toDate(s).getUTCDay()];
export const mondayOf = (s) => addDays(s, -((toDate(s).getUTCDay() + 6) % 7));
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
export const isDateString = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDate(s).getTime());

export function prettyDate(s, withWeekday) {
  const opts = { timeZone: 'UTC', day: 'numeric', month: 'short' };
  if (withWeekday) opts.weekday = 'short';
  return new Intl.DateTimeFormat('en-GB', opts).format(toDate(s));
}

function clockMinutes(text) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(text || '').slice(10));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// ---- plan -------------------------------------------------------------------

export function parsePlan(rows) {
  const plan = {
    meta: {}, rule: {}, zone: {}, target: {}, split: {}, races: [], weeks: [],
    exercises: {}, warmup: {}, link: {}, period: {},
  };
  rows.forEach((r) => {
    const [section, key, v1, v2, v3, v4, v5, v6, v7] = r;
    if (section === 'meta') plan.meta[key] = v1;
    else if (section === 'rule') plan.rule[key] = v1;
    else if (section === 'zone') plan.zone[key] = { low: num(v1), high: num(v2) };
    else if (section === 'target') plan.target[key] = { value: v1, unit: v2, note: v3 };
    else if (section === 'split') plan.split[key] = { type: v1, session: v2 };
    else if (section === 'race') plan.races.push({ name: v1, distance: v2, date: v3, week: num(v4), note: v5 });
    else if (section === 'runna_week') {
      plan.weeks.push({
        week: num(key), start: v1, end: v2, km: num(v3),
        Wed: num(v4), Fri: num(v5), Sun: num(v6), note: v7,
      });
    } else if (section === 'exercise') {
      (plan.exercises[key] = plan.exercises[key] || []).push({
        order: num(v1), name: v2, alias: v3, dose: v4, setup: v5, feel: v6, watch: v7,
      });
    } else if (section === 'warmup') {
      (plan.warmup[key] = plan.warmup[key] || []).push({ order: num(v1), move: v2, dose: v3, cue: v4 });
    } else if (section === 'link') plan.link[key] = v1;
    else if (section === 'period') plan.period[key] = v1;
  });
  Object.values(plan.exercises).forEach((list) => list.sort((a, b) => a.order - b.order));
  Object.values(plan.warmup).forEach((list) => list.sort((a, b) => a.order - b.order));
  return plan;
}

// ---- data -------------------------------------------------------------------

export function buildHub(snap) {
  const plan = parsePlan(Array.isArray(snap.plan) ? snap.plan : []);

  const ring = new Map();
  (snap.ring || []).forEach((r) => {
    if (r.Date) ring.set(r.Date, { sleep: num(r.Total_Sleep_hr), steps: num(r.Steps), synced: r.Synced_At_IST || '' });
  });

  const activities = (snap.runs || []).map((r) => ({
    id: r.Activity_ID, date: r.Date, start: r.Start_Time_Local || '', sport: r.Sport_Type || '',
    name: r.Name || '', km: num(r.Distance_km), movingMin: num(r.Moving_Time_min),
    elapsedMin: num(r.Elapsed_Time_min), avgHr: num(r.Avg_HR_bpm), z2pct: num(r.Zone2_pct),
  }));

  const byId = new Map();
  (snap.lifts || []).forEach((r) => {
    if (!r.Activity_ID) return;
    let s = byId.get(r.Activity_ID);
    if (!s) {
      s = { id: r.Activity_ID, date: r.Date, start: r.Start_Time_Local || '', title: r.Workout_Title || '', durationMin: num(r.Duration_min), sets: [] };
      byId.set(r.Activity_ID, s);
    }
    if (r.Exercise && r.Exercise !== '(Workout Summary)') {
      s.sets.push({ exercise: r.Exercise, type: r.Set_Type || '', kg: num(r.Weight_kg), reps: num(r.Reps), other: r.Duration_or_Dist || '' });
    }
  });
  const sessions = Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  let lastSync = '';
  ring.forEach((v) => { if (v.synced > lastSync) lastSync = v.synced; });

  return { plan, ring, activities, sessions, lastSync, generatedAt: snap.generatedAt || '' };
}

export const zone2Max = (hub) => (hub.plan.zone.z2 && hub.plan.zone.z2.high) || 163;
export const stepTarget = (hub) => num(hub.plan.target.steps_min && hub.plan.target.steps_min.value) || STEP_TARGET_FALLBACK;

export const footRunsOn = (hub, d) => hub.activities.filter((a) => a.date === d && FOOT_RUN.has(a.sport));
export const walksOn = (hub, d) => hub.activities.filter((a) => a.date === d && WALK.has(a.sport));
export const sessionsOn = (hub, d) => hub.sessions.filter((s) => s.date === d);

export function weekFor(hub, d) {
  return hub.plan.weeks.find((w) => w.start <= d && d <= w.end) || null;
}

export function planned(hub, d) {
  const name = dayName(d);
  const slot = hub.plan.split[name] || { type: 'rest', session: 'Rest' };
  const week = weekFor(hub, d);
  if (slot.type === 'run') {
    const km = week ? week[name] : null;
    if (km === 0) return { type: 'rest', session: 'Rest', km: null };
    return { type: 'run', session: slot.session, km };
  }
  return { type: slot.type, session: slot.session, km: null };
}

export function nextRace(hub, d) {
  const upcoming = hub.plan.races.filter((r) => isDateString(r.date) && r.date >= d).sort((a, b) => (a.date < b.date ? -1 : 1));
  return upcoming.length ? { ...upcoming[0], days: daysBetween(d, upcoming[0].date) } : null;
}

// ---- lifting ----------------------------------------------------------------

function topSet(sets, inverted) {
  const working = sets.filter((s) => s.type !== 'Warm-up');
  const weighted = working.filter((s) => s.kg !== null && s.kg > 0 && s.reps !== null);
  if (weighted.length) {
    return weighted.reduce((best, s) => {
      if (!best) return s;
      const better = inverted ? s.kg < best.kg : s.kg > best.kg;
      return better || (s.kg === best.kg && s.reps > best.reps) ? s : best;
    }, null);
  }
  const repsOnly = working.filter((s) => s.reps !== null);
  if (repsOnly.length) return repsOnly.reduce((best, s) => (!best || s.reps > best.reps ? s : best), null);
  return working.find((s) => s.other) || null;
}

export function formatSet(s) {
  if (!s) return '';
  if (s.kg !== null && s.kg > 0 && s.reps !== null) return s.kg + ' kg × ' + s.reps;
  if (s.reps !== null) return s.reps + ' reps';
  return s.other || '';
}

function isBetter(a, b, inverted) {
  if (!a || !b || a.kg === null || b.kg === null || !(a.kg > 0) || !(b.kg > 0)) return false;
  if (a.kg !== b.kg) return inverted ? a.kg < b.kg : a.kg > b.kg;
  return a.reps !== null && b.reps !== null && a.reps > b.reps;
}

function namesOf(exercise) {
  return [exercise.name, exercise.alias].filter(Boolean).map((n) => n.toLowerCase());
}

// The most recent synced session before `before` that includes this exercise.
export function lastLogged(hub, names, before) {
  const inverted = names.some((n) => INVERTED_LIFTS.has(n));
  for (const s of hub.sessions) {
    if (s.date >= before) continue;
    const sets = s.sets.filter((x) => names.includes(x.exercise.toLowerCase()));
    const top = topSet(sets, inverted);
    if (top) return { date: s.date, top, inverted };
  }
  return null;
}

export const lastLoggedFor = (hub, exercise, before) => lastLogged(hub, namesOf(exercise), before);

// Lifts in one session that beat the previous synced session.
export function liftsUp(hub, session) {
  const out = [];
  const seen = new Set();
  session.sets.forEach((x) => {
    const key = x.exercise.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const inverted = INVERTED_LIFTS.has(key);
    const now = topSet(session.sets.filter((y) => y.exercise.toLowerCase() === key), inverted);
    const prev = lastLogged(hub, [key], session.date);
    if (prev && isBetter(now, prev.top, inverted)) out.push({ exercise: x.exercise, now, prev: prev.top });
  });
  return out;
}

export function sessionTotals(session) {
  let sets = 0;
  let kg = 0;
  session.sets.forEach((s) => {
    sets += 1;
    if (s.kg !== null && s.reps !== null) kg += s.kg * s.reps;
  });
  return { sets, kg: Math.round(kg) };
}

// ---- readiness --------------------------------------------------------------

function strain(hub, d) {
  const max = zone2Max(hub);
  const hot = footRunsOn(hub, d).map((a) => a.avgHr).filter((hr) => hr !== null && hr > max);
  let late = false;
  hub.activities.filter((a) => a.date === d).forEach((a) => {
    const start = clockMinutes(a.start);
    if (start !== null && a.elapsedMin !== null && start + a.elapsedMin > CUTOFF_MINUTES) late = true;
  });
  sessionsOn(hub, d).forEach((s) => {
    const start = clockMinutes(s.start);
    if (start !== null && s.durationMin !== null && start + s.durationMin > CUTOFF_MINUTES) late = true;
  });
  return { hotHr: hot.length ? Math.round(Math.max(...hot)) : null, late, any: hot.length > 0 || late };
}

export function readiness(hub, today, dayType, toggles) {
  const row = hub.ring.get(today);
  const sleep = row ? row.sleep : null;
  if (sleep === null || sleep <= 0) return { level: 'none', text: 'No sleep data for last night.' };

  const y = strain(hub, addDays(today, -1));
  const y2 = strain(hub, addDays(today, -2));
  const short = sleep < SLEEP_SHORT_HOURS;

  let text = 'Slept ' + sleep.toFixed(1) + ' h' + (short ? ', under ' + SLEEP_SHORT_HOURS : '') + '.';
  if (y.hotHr !== null) text += ' Yesterday’s run averaged ' + y.hotHr + '.';
  if (y.late) text += ' Yesterday’s workout ended after 8 pm.';

  const flagged = short || y.any;
  let level = flagged ? 'easy' : 'ok';
  let advice;
  if (toggles && toggles.period) advice = 'Go by feel today.';
  else if (dayType === 'rest') advice = flagged ? 'Good day to rest.' : 'Rest day, as planned.';
  else if (y.any && y2.any) { advice = 'Consider swapping with tomorrow.'; level = 'swap'; }
  else advice = flagged ? 'Keep it easy today.' : 'Fine to train as planned.';

  return { level, text: text + ' ' + advice };
}

// ---- week -------------------------------------------------------------------

export function weekView(hub, today) {
  const monday = mondayOf(today);
  const target = stepTarget(hub);
  const days = [];
  let runKm = 0;
  let runsDone = 0;
  let gymDone = 0;
  let runsPlanned = 0;
  let gymPlanned = 0;

  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const p = planned(hub, d);
    const runs = footRunsOn(hub, d);
    const lifts = sessionsOn(hub, d);
    const row = hub.ring.get(d);
    runs.forEach((a) => { runKm += a.km || 0; });
    runsDone += runs.length ? 1 : 0;
    gymDone += lifts.length ? 1 : 0;
    if (p.type === 'run') runsPlanned += 1;
    if (p.type === 'gym') gymPlanned += 1;

    let done = null;
    if (runs.length || lifts.length) done = 'workout';
    else if (walksOn(hub, d).length || (row && row.steps !== null && row.steps >= target)) done = 'walk';
    days.push({ date: d, name: dayName(d), planned: p, done, isToday: d === today, isFuture: d > today });
  }

  const week = weekFor(hub, today);
  return {
    days,
    runKm: Math.round(runKm * 10) / 10,
    weekKm: week ? week.km : null,
    runsLeft: Math.max(0, runsPlanned - runsDone),
    gymLeft: Math.max(0, gymPlanned - gymDone),
  };
}

// ---- one win ----------------------------------------------------------------

export function oneWin(hub, today) {
  const from = addDays(today, -6);
  const inRange = (d) => d >= from && d <= today;
  const longDay = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(toDate(d));

  for (const s of hub.sessions) {
    if (!inRange(s.date)) continue;
    const ups = liftsUp(hub, s);
    if (ups.length) {
      const u = ups[0];
      return u.exercise + ': ' + formatSet(u.now) + ' on ' + longDay(s.date) + ', up from ' + formatSet(u.prev) + '.';
    }
  }

  const max = zone2Max(hub);
  const calm = hub.activities.find((a) => inRange(a.date) && FOOT_RUN.has(a.sport) && a.avgHr !== null && a.avgHr <= max);
  if (calm) return longDay(calm.date) + '’s run stayed in Zone 2 (average ' + Math.round(calm.avgHr) + ').';

  let best = null;
  hub.ring.forEach((v, d) => {
    if (inRange(d) && v.steps !== null && (!best || v.steps > best.steps)) best = { date: d, steps: v.steps };
  });
  if (best && best.steps >= stepTarget(hub)) {
    return (Math.round(best.steps / 100) / 10) + 'k steps on ' + longDay(best.date) + '.';
  }

  const count = hub.sessions.filter((s) => inRange(s.date)).length +
    hub.activities.filter((a) => inRange(a.date) && FOOT_RUN.has(a.sport)).length;
  return count ? count + (count === 1 ? ' session' : ' sessions') + ' in the last 7 days.' : null;
}

// ---- freshness --------------------------------------------------------------

export function freshness(hub) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(hub.lastSync);
  if (!m) return { label: 'Sync time unknown', stale: true };
  const at = Date.parse(m[1] + 'T' + m[2] + ':00+05:30');
  const hours = (Date.now() - at) / 3600000;
  const day = m[1] === todayIST() ? 'today' : prettyDate(m[1], false);
  return { label: 'Data as of ' + m[2] + ' ' + day, stale: hours > STALE_HOURS };
}
