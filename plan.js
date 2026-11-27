// Plan parsing, date helpers, analytics and coaching calculations.

const TZ = 'Asia/Kolkata';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const FOOT_RUN = new Set(['Run', 'TrailRun', 'VirtualRun']);
export const WALK = new Set(['Walk', 'Hike']);
export const INVERTED_LIFTS = new Set(['pull up (assisted)']);

export const STEP_TARGET_FALLBACK = 7500;
export const SLEEP_TARGET_HOURS = 8.0;
export const SLEEP_SHORT_HOURS = 6.5;
export const CUTOFF_MINUTES = 20 * 60;
export const STALE_HOURS = 8;

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[,%\s]+/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function avg(arr) {
  const valid = arr.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function sum(arr) {
  return arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
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
  if (!isDateString(s)) return s || '';
  const opts = { timeZone: 'UTC', day: 'numeric', month: 'short' };
  if (withWeekday) opts.weekday = 'short';
  return new Intl.DateTimeFormat('en-GB', opts).format(toDate(s));
}

export function shortMonth(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || '';
  const d = new Date(ym + '-01T00:00:00Z');
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', year: '2-digit' }).format(d);
}

export function parsePaceToMin(paceStr) {
  if (!paceStr) return null;
  const m = /^(\d+):(\d{2})$/.exec(String(paceStr).trim());
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
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
  plan.weeks.sort((a, b) => a.week - b.week);
  return plan;
}

// ---- data -------------------------------------------------------------------

export function buildHub(snap) {
  const plan = parsePlan(Array.isArray(snap.plan) ? snap.plan : []);

  const ring = new Map();
  const ringList = [];
  (snap.ring || []).forEach((r) => {
    if (!r.Date) return;
    const item = {
      date: r.Date,
      month: r.Month || r.Date.slice(0, 7),
      sleepScore: num(r.Sleep_Score),
      sleep: num(r.Total_Sleep_hr),
      timeInBed: num(r.Time_In_Bed_hr),
      efficiency: num(r.Sleep_Efficiency_pct),
      deepMin: num(r.Deep_Sleep_min),
      remMin: num(r.REM_Sleep_min),
      lightMin: num(r.Light_Sleep_min),
      awakeMin: num(r.Awake_min),
      restorativePct: num(r.Restorative_Sleep_pct),
      bedtime: r.Bedtime_IST || '',
      wakeTime: r.Wake_Time_IST || '',
      rhr: num(r.Sleep_RHR_bpm) ?? num(r.Night_RHR_bpm),
      minHr: num(r.Min_Sleep_HR_bpm),
      dayAvgHr: num(r.Daytime_Avg_HR_bpm),
      dayMaxHr: num(r.Daytime_Max_HR_bpm),
      hrv: num(r.Avg_Sleep_HRV_ms),
      minHrv: num(r.Min_HRV_ms),
      maxHrv: num(r.Max_HRV_ms),
      skinTemp: num(r.Overnight_Skin_Temp_C),
      skinTempDev: num(r.Skin_Temp_Dev_C),
      recovery: num(r.Recovery_Index),
      movement: num(r.Movement_Index),
      steps: num(r.Steps),
      activeMin: num(r.Active_Min),
      inactiveMin: num(r.Inactive_Min),
      alertness: num(r.Morning_Alertness),
      vo2Max: num(r.VO2_Max),
      weeklyActiveMin: num(r.Weekly_Active_Min),
      synced: r.Synced_At_IST || '',
    };
    ring.set(item.date, item);
    ringList.push(item);
  });
  ringList.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const activities = (snap.runs || []).map((r) => ({
    id: r.Activity_ID,
    month: r.Month || (r.Date || '').slice(0, 7),
    date: r.Date,
    start: r.Start_Time_Local || '',
    sport: r.Sport_Type || '',
    workoutType: r.Workout_Type || '',
    name: r.Name || '',
    km: num(r.Distance_km),
    movingMin: num(r.Moving_Time_min),
    elapsedMin: num(r.Elapsed_Time_min),
    pace: r.Pace_min_per_km || '',
    paceMin: parsePaceToMin(r.Pace_min_per_km),
    maxSpeed: num(r.Max_Speed_kmh),
    avgHr: num(r.Avg_HR_bpm),
    maxHr: num(r.Max_HR_bpm),
    cadence: num(r.Avg_Cadence_spm),
    elevGain: num(r.Elevation_Gain_m),
    kcal: num(r.Calories_kcal),
    re: num(r.Relative_Effort),
    prs: num(r.PR_Count) || 0,
    shoe: r.Shoe_Gear_Name || '',
    device: r.Device_Name || '',
    splits: r.Per_Km_Splits || '',
    bestEfforts: r.Best_Efforts || '',
    description: r.Description || '',
    z1: num(r.Z1_min),
    z2: num(r.Z2_min),
    z3: num(r.Z3_min),
    z4: num(r.Z4_min),
    z5: num(r.Z5_min),
    z2pct: num(r.Zone2_pct),
    hr1: num(r.First_Half_HR_bpm),
    hr2: num(r.Second_Half_HR_bpm),
    pace1: r.First_Half_Pace || '',
    pace2: r.Second_Half_Pace || '',
    drift: num(r.Cardiac_Drift_pct),
    laps: r.Laps_Summary || '',
    tempC: num(r.Average_Temp_C),
    achievements: num(r.Achievement_Count) || 0,
  })).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const byId = new Map();
  (snap.lifts || []).forEach((r) => {
    if (!r.Activity_ID) return;
    let s = byId.get(r.Activity_ID);
    if (!s) {
      const rawDur = num(r.Duration_min);
      s = {
        id: r.Activity_ID,
        month: r.Month || (r.Date || '').slice(0, 7),
        date: r.Date,
        start: r.Start_Time_Local || '',
        title: r.Workout_Title || 'Strength Session',
        durationMin: rawDur !== null && rawDur < 300 ? rawDur : null, // guard stray 100h timer outlier
        avgHr: num(r.Avg_HR_bpm),
        maxHr: num(r.Max_HR_bpm),
        kcal: num(r.Calories_kcal),
        sets: [],
      };
      byId.set(r.Activity_ID, s);
    }
    if (r.Exercise && r.Exercise !== '(Workout Summary)') {
      s.sets.push({
        exercise: r.Exercise,
        setNum: num(r.Set_Number),
        type: r.Set_Type || 'Normal',
        kg: num(r.Weight_kg),
        reps: num(r.Reps),
        volKg: num(r.Volume_kg),
        est1rm: num(r.Est_1RM_kg),
        other: r.Duration_or_Dist || '',
      });
    }
  });
  const sessions = Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const monthly = (snap.monthly || []).map((m) => ({
    month: m.Month,
    days: num(m.Days_Tracked),
    sleepScore: num(m.Avg_Sleep_Score),
    sleepHr: num(m.Avg_Sleep_hr),
    deepMin: num(m.Avg_Deep_min),
    remMin: num(m.Avg_REM_min),
    effPct: num(m.Avg_Sleep_Eff_pct),
    rhr: num(m.Avg_Sleep_RHR_bpm),
    hrv: num(m.Avg_Sleep_HRV_ms),
    recovery: num(m.Avg_Recovery_Index),
    movement: num(m.Avg_Movement_Index),
    steps: num(m.Avg_Ring_Steps),
    vo2Max: num(m.Avg_Ring_VO2_Max),
    cardioSessions: num(m.Cardio_Sessions) || 0,
    runKm: num(m.Total_Run_km) || 0,
    cardioHr: num(m.Total_Cardio_hr) || 0,
    avgRunHr: num(m.Avg_Run_HR_bpm),
    elevGain: num(m.Total_Elev_Gain_m) || 0,
    gymSessions: num(m.Gym_Sessions) || 0,
    totalSets: num(m.Total_Sets) || 0,
    gymVolKg: num(m.Total_Gym_Vol_kg) || 0,
    gymHr: num(m.Total_Gym_hr) || 0,
  })).filter((m) => m.month).sort((a, b) => (a.month < b.month ? 1 : -1));

  const daily = new Map();
  (snap.daily || []).forEach((d) => {
    if (!d.Date) return;
    daily.set(d.Date, {
      roll7Sleep: num(d.Roll7d_Sleep_hr),
      roll7Hrv: num(d.Roll7d_HRV_ms),
      roll7Rhr: num(d.Roll7d_RHR_bpm),
      roll7RunKm: num(d.Roll7d_Run_km),
      roll7GymVol: num(d.Roll7d_Gym_Vol_kg),
    });
  });

  let lastSync = '';
  ringList.forEach((v) => { if (v.synced > lastSync) lastSync = v.synced; });

  return { plan, ring, ringList, activities, sessions, monthly, daily, lastSync, generatedAt: snap.generatedAt || '' };
}

export const zone2Low = (hub) => (hub.plan.zone.z2 && hub.plan.zone.z2.low) || 132;
export const zone2Max = (hub) => (hub.plan.zone.z2 && hub.plan.zone.z2.high) || 163;
export const stepTarget = (hub) => num(hub.plan.target.steps_min && hub.plan.target.steps_min.value) || STEP_TARGET_FALLBACK;

export const footRuns = (hub) => hub.activities.filter((a) => FOOT_RUN.has(a.sport));
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

export function allRaces(hub, d) {
  return hub.plan.races
    .filter((r) => isDateString(r.date))
    .map((r) => ({ ...r, days: daysBetween(d, r.date) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function nextRace(hub, d) {
  const upcoming = allRaces(hub, d).filter((r) => r.days >= 0);
  return upcoming.length ? upcoming[0] : null;
}

// ---- lifting analytics ------------------------------------------------------

export function topSet(sets, inverted) {
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
  if (s.kg !== null && s.kg > 0 && s.reps !== null) return `${s.kg} kg × ${s.reps}`;
  if (s.reps !== null) return `${s.reps} reps`;
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
    if (s.volKg !== null) kg += s.volKg;
    else if (s.kg !== null && s.reps !== null) kg += s.kg * s.reps;
  });
  return { sets, kg: Math.round(kg) };
}

export function trackedExercises(hub) {
  const counts = new Map();
  hub.sessions.forEach((s) => {
    const seen = new Set();
    s.sets.forEach((st) => {
      if (st.type === 'Warm-up' || st.kg === null || st.kg <= 0) return;
      if (!seen.has(st.exercise)) {
        seen.add(st.exercise);
        counts.set(st.exercise, (counts.get(st.exercise) || 0) + 1);
      }
    });
  });
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, inverted: INVERTED_LIFTS.has(name.toLowerCase()) }));
}

export function exerciseHistory(hub, exerciseName) {
  const key = exerciseName.toLowerCase();
  const inverted = INVERTED_LIFTS.has(key);
  const points = [];
  const chronological = [...hub.sessions].reverse();
  chronological.forEach((s) => {
    const matching = s.sets.filter((st) => st.exercise.toLowerCase() === key && st.type !== 'Warm-up' && st.kg !== null && st.kg > 0);
    if (!matching.length) return;
    const best = topSet(matching, inverted);
    const best1rm = Math.max(...matching.map((m) => m.est1rm || 0));
    const vol = sum(matching.map((m) => m.volKg ?? ((m.kg || 0) * (m.reps || 0))));
    points.push({
      date: s.date,
      label: prettyDate(s.date, false),
      kg: best ? best.kg : null,
      reps: best ? best.reps : null,
      est1rm: best1rm > 0 ? Math.round(best1rm * 10) / 10 : null,
      vol: Math.round(vol),
    });
  });
  return { inverted, points };
}

export function pullUpProgress(hub) {
  const hist = exerciseHistory(hub, 'Pull Up (Assisted)');
  if (!hist.points.length) return null;
  const start = Math.max(...hist.points.map((p) => p.kg));
  const current = hist.points[hist.points.length - 1].kg;
  const best = Math.min(...hist.points.map((p) => p.kg));
  return { start, current, best, goal: 0, points: hist.points };
}

// ---- running analytics ------------------------------------------------------

export function runnaProgress(hub) {
  const runs = footRuns(hub);
  return hub.plan.weeks.map((w) => {
    const actualKm = sum(runs.filter((r) => r.date >= w.start && r.date <= w.end).map((r) => r.km || 0));
    const race = hub.plan.races.find((rc) => rc.week === w.week);
    return {
      week: w.week,
      label: `W${w.week}`,
      start: w.start,
      end: w.end,
      planned: w.km || 0,
      actual: Math.round(actualKm * 10) / 10,
      note: w.note || '',
      race: race ? `${race.name} (${race.distance})` : null,
    };
  });
}

export function shoeMileage(hub) {
  const map = new Map();
  footRuns(hub).forEach((r) => {
    const name = r.shoe || 'Unassigned Shoe';
    map.set(name, (map.get(name) || 0) + (r.km || 0));
  });
  return Array.from(map.entries())
    .map(([name, km]) => ({ name, km: Math.round(km * 10) / 10 }))
    .sort((a, b) => b.km - a.km);
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
  const row = hub.ring.get(today) || hub.ringList[hub.ringList.length - 1];
  const sleep = row ? row.sleep : null;
  if (sleep === null || sleep <= 0) return { level: 'none', headline: 'No sleep data yet', text: 'Sync Ultrahuman Ring to see today’s readiness.' };

  const y = strain(hub, addDays(today, -1));
  const y2 = strain(hub, addDays(today, -2));
  const short = sleep < SLEEP_SHORT_HOURS;

  const parts = [`Slept ${sleep.toFixed(1)} h` + (row.sleepScore ? ` (Score ${row.sleepScore})` : '') + (short ? ` — under ${SLEEP_SHORT_HOURS} h` : '') + '.'];
  if (row.recovery) parts.push(`Recovery ${row.recovery}/100.`);
  if (y.hotHr !== null) parts.push(`Yesterday’s run averaged ${y.hotHr} bpm (above Z2 cap ${zone2Max(hub)}).`);
  if (y.late) parts.push('Yesterday’s workout finished after 8 pm.');

  const flagged = short || y.any;
  let level = flagged ? 'easy' : 'ok';
  let headline;
  if (toggles && toggles.ankle) { headline = 'Protect the ankle — no running today'; level = 'stop'; }
  else if (toggles && toggles.period) { headline = 'Go by feel — honour your energy'; level = 'easy'; }
  else if (dayType === 'rest') { headline = flagged ? 'Recovery day — well timed' : 'Planned rest & mobility day'; }
  else if (y.any && y2.any) { headline = 'Two hot/late days — consider swapping'; level = 'swap'; }
  else { headline = flagged ? 'Dial intensity back — keep it easy' : 'Green light — train as planned'; }

  return { level, headline, text: parts.join(' ') };
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
    days.push({
      date: d, name: dayName(d), planned: p, done,
      isToday: d === today, isFuture: d > today,
      steps: row ? row.steps : null, sleep: row ? row.sleep : null,
      actualKm: Math.round(sum(runs.map((r) => r.km || 0)) * 10) / 10,
      gymTitle: lifts.length ? lifts[0].title : null,
    });
  }

  const week = weekFor(hub, today);
  return {
    days,
    weekNum: week ? week.week : null,
    weekNote: week ? week.note : '',
    runKm: Math.round(runKm * 10) / 10,
    weekKm: week ? week.km : null,
    runsDone, runsPlanned,
    gymDone, gymPlanned,
    runsLeft: Math.max(0, runsPlanned - runsDone),
    gymLeft: Math.max(0, gymPlanned - gymDone),
  };
}

// ---- recent wins ------------------------------------------------------------

export function recentWins(hub, today) {
  const from = addDays(today, -14);
  const inRange = (d) => d >= from && d <= today;
  const wins = [];

  for (const s of hub.sessions) {
    if (!inRange(s.date)) continue;
    const ups = liftsUp(hub, s);
    ups.slice(0, 2).forEach((u) => {
      wins.push({
        type: 'lift',
        title: `${u.exercise} PR`,
        detail: `${formatSet(u.now)} (${prettyDate(s.date, false)}) — up from ${formatSet(u.prev)}`,
      });
    });
  }

  const max = zone2Max(hub);
  const calm = footRuns(hub).find((a) => inRange(a.date) && a.avgHr !== null && a.avgHr <= max);
  if (calm) {
    wins.push({
      type: 'run',
      title: 'Zone 2 Locked In',
      detail: `${calm.km} km on ${prettyDate(calm.date, false)} averaged ${Math.round(calm.avgHr)} bpm (≤ ${max})`,
    });
  }

  const recentRing = hub.ringList.filter((r) => inRange(r.date));
  const bestSteps = recentRing.reduce((best, r) => (r.steps !== null && (!best || r.steps > best.steps) ? r : best), null);
  if (bestSteps && bestSteps.steps >= stepTarget(hub)) {
    wins.push({
      type: 'steps',
      title: 'Peak Movement Day',
      detail: `${bestSteps.steps.toLocaleString()} steps on ${prettyDate(bestSteps.date, false)}`,
    });
  }

  const bestSleep = recentRing.reduce((best, r) => (r.sleepScore !== null && (!best || r.sleepScore > best.sleepScore) ? r : best), null);
  if (bestSleep && bestSleep.sleepScore >= 80) {
    wins.push({
      type: 'sleep',
      title: 'Top Sleep Score',
      detail: `${bestSleep.sleepScore}/100 (${bestSleep.sleep?.toFixed(1)} h) on ${prettyDate(bestSleep.date, false)}`,
    });
  }

  return wins.slice(0, 4);
}

// ---- freshness --------------------------------------------------------------

export function freshness(hub) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(hub.lastSync);
  if (!m) return { label: 'Sync time unknown', stale: true };
  const at = Date.parse(m[1] + 'T' + m[2] + ':00+05:30');
  const hours = (Date.now() - at) / 3600000;
  const day = m[1] === todayIST() ? 'today' : prettyDate(m[1], false);
  return { label: `Synced ${m[2]} ${day}`, stale: hours > STALE_HOURS };
}
