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

export function latestRingWith(hub, field) {
  for (let i = hub.ringList.length - 1; i >= 0; i--) {
    const r = hub.ringList[i];
    if (r[field] !== null && r[field] !== undefined && r[field] !== '' && r[field] !== 0) return r;
  }
  return hub.ringList[hub.ringList.length - 1] || {};
}

export function readiness(hub, today, dayType, toggles) {
  const todayRow = hub.ring.get(today) || null;
  const hasTodaySleep = Boolean(todayRow && todayRow.sleep !== null && todayRow.sleep > 0);
  const row = hasTodaySleep ? todayRow : latestRingWith(hub, 'sleep');
  const sleep = row ? row.sleep : null;
  if (sleep === null || sleep <= 0) return { level: 'none', headline: 'No sleep data yet', text: 'Sync Ultrahuman Ring to see today’s readiness.' };

  const y = strain(hub, addDays(today, -1));
  const y2 = strain(hub, addDays(today, -2));
  const short = sleep < SLEEP_SHORT_HOURS;

  const whenPrefix = hasTodaySleep ? 'Slept ' : `Latest synced sleep (${prettyDate(row.date, false)}): `;
  const parts = [`${whenPrefix}${sleep.toFixed(1)} h` + (row.sleepScore ? ` (Score ${row.sleepScore})` : '') + (short ? ` — under ${SLEEP_SHORT_HOURS} h` : '') + '.'];
  if (!hasTodaySleep) parts.push('Today’s Ring sleep hasn’t synced to your Sheet yet.');
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

  return { level, headline, text: parts.join(' '), hasTodaySleep };
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

// ---- "Are You On Track?" Live Coaching Scorecard ----------------------------

export function onTrackScorecard(hub, today) {
  const wv = weekView(hub, today);
  const sTarget = stepTarget(hub);
  const z2Hi = zone2Max(hub);
  const last7Ring = hub.ringList.slice(-7);
  const last14Ring = hub.ringList.slice(-14);

  // 1. Sleep (7d avg vs 7.5h floor / 8h goal)
  const sleep7 = avg(last7Ring.map((r) => r.sleep));
  const sleepStatus = sleep7 === null ? 'info' : sleep7 >= 7.5 ? 'ok' : sleep7 >= 6.8 ? 'warn' : 'off';

  // 2. Weekly Runs (Runna progress vs elapsed days of week)
  const dow = (toDate(today).getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const runPct = wv.weekKm ? (wv.runKm / wv.weekKm) * 100 : 0;
  const expectedRunPct = dow >= 5 ? 60 : dow >= 2 ? 25 : 0;
  const runStatus = wv.weekKm ? (runPct >= 85 || runPct >= expectedRunPct ? 'ok' : dow >= 3 ? 'warn' : 'ok') : 'info';

  // 3. Weekly Strength (Gym sessions vs 3/wk)
  const gymPct = wv.gymPlanned ? (wv.gymDone / wv.gymPlanned) * 100 : 0;
  const expectedGym = dow >= 5 ? 2 : dow >= 2 ? 1 : 0;
  const gymStatus = wv.gymDone >= wv.gymPlanned ? 'ok' : wv.gymDone >= expectedGym ? 'ok' : 'warn';

  // 4. Daily Steps consistency (14d >= 7,500)
  const stepDays = last14Ring.filter((r) => r.steps !== null && r.steps > 0);
  const stepHit = stepDays.length ? Math.round((stepDays.filter((r) => r.steps >= sTarget).length / stepDays.length) * 100) : null;
  const stepStatus = stepHit === null ? 'info' : stepHit >= 65 ? 'ok' : stepHit >= 40 ? 'warn' : 'off';

  // 5. Zone 2 Aerobic Discipline (last 5 runs with HR)
  const recentHrRuns = footRuns(hub).filter((r) => r.avgHr !== null).slice(0, 5);
  const avgRecentHr = avg(recentHrRuns.map((r) => r.avgHr));
  const z2Status = avgRecentHr === null ? 'info' : avgRecentHr <= z2Hi ? 'ok' : avgRecentHr <= z2Hi + 10 ? 'warn' : 'off';

  const pillars = [
    {
      name: 'Sleep (7d)',
      value: sleep7 !== null ? `${sleep7.toFixed(1)}h avg` : '—',
      target: 'Goal 7.5–8.0h',
      status: sleepStatus,
      pct: sleep7 !== null ? Math.min(100, (sleep7 / 8) * 100) : 0,
    },
    {
      name: `Runs (W${wv.weekNum ?? ''})`,
      value: `${wv.runKm} / ${wv.weekKm ?? '—'} km`,
      target: wv.runsLeft > 0 ? `${wv.runsLeft} run${wv.runsLeft === 1 ? '' : 's'} left` : 'Target hit',
      status: runStatus,
      pct: Math.min(100, runPct),
    },
    {
      name: 'Strength',
      value: `${wv.gymDone} / ${wv.gymPlanned} lifts`,
      target: wv.gymLeft > 0 ? `${wv.gymLeft} left this week` : 'Target hit',
      status: gymStatus,
      pct: Math.min(100, gymPct),
    },
    {
      name: 'Steps (14d)',
      value: stepHit !== null ? `${stepHit}% days` : '—',
      target: `Floor ${sTarget.toLocaleString()}/d`,
      status: stepStatus,
      pct: stepHit ?? 0,
    },
    {
      name: 'Zone 2 HR',
      value: avgRecentHr !== null ? `${Math.round(avgRecentHr)} bpm` : '—',
      target: `Cap ≤ ${z2Hi} bpm`,
      status: z2Status,
      pct: avgRecentHr !== null ? Math.min(100, (z2Hi / avgRecentHr) * 100) : 0,
    },
  ];

  const scored = pillars.filter((p) => p.status !== 'info');
  const okCount = scored.filter((p) => p.status === 'ok').length;
  const scorePct = scored.length ? Math.round((okCount / scored.length) * 100) : 0;

  let verdict = 'On Track';
  let tone = 'ok';
  if (scorePct < 50) { verdict = 'Needs Reset'; tone = 'warn'; }
  else if (scorePct < 80) { verdict = 'Mostly On Track'; tone = 'warn'; }

  const strengths = pillars.filter((p) => p.status === 'ok').map((p) => p.name);
  const focus = pillars.find((p) => p.status === 'off') || pillars.find((p) => p.status === 'warn');
  const summary = focus
    ? `${okCount}/${scored.length} pillars green${strengths.length ? ` (${strengths.slice(0, 2).join(' & ')} strong)` : ''}. Next focus: ${focus.name} (${focus.value} vs ${focus.target}).`
    : `All ${okCount}/${scored.length} pillars green — keep this exact rhythm going.`;

  return { verdict, tone, scorePct, okCount, total: scored.length, summary, pillars };
}

// ---- Smart Auto-Fallback Coach ----------------------------------------------

export function autoFallback(hub, today, planDay, toggles) {
  const todayRing = hub.ring.get(today) || {};
  const sleepRing = (todayRing.sleep !== null && todayRing.sleep > 0) ? todayRing : latestRingWith(hub, 'sleep');
  const hrvRing = (todayRing.hrv !== null && todayRing.hrv > 0) ? todayRing : latestRingWith(hub, 'hrv');
  const rhrRing = (todayRing.rhr !== null && todayRing.rhr > 0) ? todayRing : latestRingWith(hub, 'rhr');
  const tempRing = (todayRing.skinTemp !== null && todayRing.skinTemp > 0) ? todayRing : latestRingWith(hub, 'skinTemp');
  const roll7 = hub.daily.get(today) || hub.daily.get(sleepRing.date) || {};
  const last7Temp = avg(hub.ringList.slice(-8, -1).map((r) => r.skinTemp));

  const triggers = [];
  if (toggles && toggles.ankle) triggers.push({ key: 'ankle', label: 'Ankle swollen (hard stop on running)', severity: 'stop' });
  if (sleepRing.sleep !== null && sleepRing.sleep < SLEEP_SHORT_HOURS) {
    triggers.push({ key: 'sleep', label: `Short sleep (${sleepRing.sleep.toFixed(1)}h < ${SLEEP_SHORT_HOURS}h)`, severity: 'warn' });
  }
  if (hrvRing.hrv !== null && roll7.roll7Hrv && hrvRing.hrv < roll7.roll7Hrv * 0.85) {
    triggers.push({ key: 'hrv', label: `HRV dip (${Math.round(hrvRing.hrv)} ms vs ${Math.round(roll7.roll7Hrv)} ms 7d avg)`, severity: 'warn' });
  }
  if (rhrRing.rhr !== null && roll7.roll7Rhr && rhrRing.rhr >= roll7.roll7Rhr + 4) {
    triggers.push({ key: 'rhr', label: `Elevated RHR (${Math.round(rhrRing.rhr)} bpm vs ${Math.round(roll7.roll7Rhr)} bpm avg)`, severity: 'warn' });
  }
  if (tempRing.skinTemp !== null && last7Temp !== null && tempRing.skinTemp >= last7Temp + 0.4) {
    triggers.push({ key: 'temp', label: `Skin temp +${(tempRing.skinTemp - last7Temp).toFixed(2)} °C above baseline`, severity: 'warn' });
  }
  if (toggles && toggles.period) triggers.push({ key: 'period', label: 'Period — go by feel', severity: 'warn' });
  if (toggles && toggles.low) triggers.push({ key: 'low', label: 'Low energy check-in', severity: 'warn' });
  if (toggles && toggles.short) triggers.push({ key: 'short', label: 'Short on time (25-min Express)', severity: 'info' });
  if (toggles && toggles.late) triggers.push({ key: 'late', label: 'After 7:30 pm (8 pm sleep cutoff)', severity: 'warn' });

  if (!triggers.length) return { active: false, triggers: [], headline: '', actions: [], expressGym: false };

  const hasStop = triggers.some((t) => t.key === 'ankle');
  const hasLate = triggers.some((t) => t.key === 'late');
  const hasShort = triggers.some((t) => t.key === 'short' || t.key === 'low');
  const z2Hi = zone2Max(hub);

  let headline = 'Modified Fallback Plan Active';
  const actions = [];
  let expressGym = false;

  if (planDay.type === 'run') {
    if (hasStop) {
      headline = 'Swap Run → Mobility or Upper Body';
      actions.push('Zero running until ankle swelling is 100% gone.');
      actions.push('Optional: 20 min core/upper-body or pure rest + elevation.');
    } else if (hasLate) {
      headline = 'Protect Tonight’s Sleep — Easy Walk Only';
      actions.push('Skip hard cardio after 8:00 pm; do a 20-min easy walk + stretch.');
    } else {
      const capKm = planDay.km ? Math.max(2, Math.round(planDay.km * 0.65 * 2) / 2) : 2.5;
      headline = `Easy Fallback Run — ${capKm} km @ ≤ ${z2Hi - 8} bpm`;
      actions.push(`Cap distance at ~${capKm} km (or 20 min easy run/walk) instead of ${planDay.km || 'full'} km.`);
      actions.push(`Lower HR ceiling to ≤ ${z2Hi - 8} bpm — take walk breaks early.`);
    }
  } else if (planDay.type === 'gym') {
    if (hasLate) {
      headline = 'Light Mobility Only (Past 8 pm Cutoff)';
      actions.push('Skip heavy lifting late at night so HR drops before sleep.');
    } else if (hasShort) {
      headline = '25-Min Express Gym (Top 3 Lifts Only)';
      expressGym = true;
      actions.push('Hit only the first 3 compound lifts (2 working sets each) — accessories optional.');
      actions.push('Hold last session’s weights; focus on crisp form.');
    } else {
      headline = 'Recovery-Adjusted Gym (-1 Set, Hold Weights)';
      actions.push('Drop 1 working set per exercise (2 sets instead of 3).');
      actions.push('Hold last session’s weights — save PR attempts for a green recovery day.');
    }
  } else {
    headline = 'Rest Day — Prioritize Recovery';
    actions.push('Aim for early bed (< 12:30 am), hydration, and easy walking.');
  }

  return { active: true, triggers, headline, actions, expressGym };
}

// ---- Personal Sleep Sweet-Spot & 7-Day Sleep Debt ---------------------------

function bedtimeHoursFromMidnight(bt) {
  if (!bt) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(bt).trim());
  if (!m) return null;
  const h = Number(m[1]) + Number(m[2]) / 60;
  // Normalize 19:00..23:59 as -5..0 and 00:00..06:00 as 0..6
  return h >= 18 ? h - 24 : h;
}

export function sleepSweetSpot(hub) {
  const buckets = [
    { id: 'early', label: 'Before 1:00 am', rows: [] },
    { id: 'mid', label: '1:00 – 2:00 am', rows: [] },
    { id: 'late', label: 'After 2:00 am', rows: [] },
  ];
  hub.ringList.forEach((r) => {
    const rel = bedtimeHoursFromMidnight(r.bedtime);
    if (rel === null || r.sleepScore === null) return;
    if (rel < 1.0) buckets[0].rows.push(r);
    else if (rel < 2.0) buckets[1].rows.push(r);
    else buckets[2].rows.push(r);
  });
  return buckets.map((b) => ({
    id: b.id,
    label: b.label,
    nights: b.rows.length,
    avgScore: avg(b.rows.map((r) => r.sleepScore)),
    avgSleep: avg(b.rows.map((r) => r.sleep)),
    avgHrv: avg(b.rows.map((r) => r.hrv)),
  }));
}

export function sleepDebt7d(hub) {
  const valid = hub.ringList.filter((r) => r.sleep !== null && r.sleep > 0).slice(-7);
  if (!valid.length) return { nights: 0, debtHr: null, avgHr: null };
  const totalActual = sum(valid.map((r) => r.sleep));
  const targetTotal = valid.length * SLEEP_TARGET_HOURS;
  return {
    nights: valid.length,
    debtHr: Math.round((targetTotal - totalActual) * 10) / 10, // positive = debt, negative = surplus
    avgHr: Math.round((totalActual / valid.length) * 100) / 100,
  };
}

// ---- Running PRs (Best Efforts) & 10K Readiness -----------------------------

function parseClockToSec(t) {
  if (!t) return null;
  const parts = String(t).trim().split(':').map(Number);
  if (parts.some((x) => !Number.isFinite(x))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function runningPRs(hub) {
  const wanted = ['1K', '1 mile', '2 mile', '5K', '10K'];
  const best = new Map();
  footRuns(hub).forEach((r) => {
    if (!r.bestEfforts) return;
    r.bestEfforts.split('|').forEach((chunk) => {
      const idx = chunk.indexOf(':');
      if (idx < 0) return;
      const dist = chunk.slice(0, idx).trim();
      const timeStr = chunk.slice(idx + 1).trim();
      if (!wanted.includes(dist)) return;
      const sec = parseClockToSec(timeStr);
      if (sec === null) return;
      const prev = best.get(dist);
      if (!prev || sec < prev.sec) best.set(dist, { dist, time: timeStr, sec, date: r.date });
    });
  });
  return wanted.map((d) => best.get(d)).filter(Boolean);
}

// ---- Strength PR Wall & Progressive Overload Nudges -------------------------

export function strengthPRWall(hub) {
  const list = trackedExercises(hub).slice(0, 8);
  return list.map((ex) => {
    const hist = exerciseHistory(hub, ex.name);
    if (!hist.points.length) return null;
    const bestPt = hist.points.reduce((best, p) => {
      if (!best) return p;
      const better = hist.inverted ? p.kg < best.kg : p.kg > best.kg;
      return better || (p.kg === best.kg && (p.reps || 0) > (best.reps || 0)) ? p : best;
    }, null);
    const max1rm = Math.max(...hist.points.map((p) => p.est1rm || 0));
    return {
      name: ex.name,
      inverted: hist.inverted,
      sessions: ex.count,
      bestKg: bestPt.kg,
      bestReps: bestPt.reps,
      bestDate: bestPt.date,
      est1rm: !hist.inverted && max1rm > 0 ? max1rm : null,
    };
  }).filter(Boolean);
}

export function overloadNudge(last) {
  if (!last || !last.top || last.top.kg === null || last.top.kg <= 0) return null;
  const { kg, reps } = last.top;
  if (last.inverted) {
    const nextKg = Math.max(0, kg - 2);
    return reps !== null && reps >= 6 ? `Try ${nextKg} kg assist` : `Aim ${kg} kg × ${(reps || 5) + 1}`;
  }
  if (reps !== null && reps >= 12) {
    const inc = kg >= 20 ? 2.5 : 1;
    return `Try ${kg + inc} kg × 8–10`;
  }
  if (reps !== null) return `Aim ${kg} kg × ${reps + 1}`;
  return null;
}
