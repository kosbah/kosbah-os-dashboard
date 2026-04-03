/* ═══════════════════════════════════════════
   Kosbah OS · App Logic
   Firebase, state, Firestore, render functions
   Last updated: 2026-04-03
═══════════════════════════════════════════ */

/* ═══ LOADER ═══ */
function showLoader() { document.getElementById('global-loader').classList.add('active') }
function hideLoader() { document.getElementById('global-loader').classList.remove('active') }

/* ═══ FIREBASE ═══ */
const firebaseConfig = {
  apiKey: "AIzaSyB5RvLoSf7QTRZ_5mIzcXd2sFKpdXyratg",
  authDomain: "axial-analyzer-304321.firebaseapp.com",
  projectId: "axial-analyzer-304321",
  storageBucket: "axial-analyzer-304321.firebasestorage.app",
  messagingSenderId: "921985846891",
  appId: "1:921985846891:web:850735aea4bfec07bf2b2e"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
db.settings({ merge: true });

function signInWithGoogle() {
  showLoader();
  const p = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(p).catch(e => {
    console.error('Auth error:', e);
    hideLoader();
    showToast('⚠ Sign-in failed');
  });
}

/* ═══ CONFIG ═══ */
const CFG = {
  lat: 31.0883,
  lon: 31.5969,
  method: 5,
  waterCups: 8,
  waterInterval: 50,
  weightGoal: 93,
  weightMilestoneStep: 2,
  slackWebhook: '',
  n8nWorkWebhook: ''
};
const TZ = 'Africa/Cairo';

/* ═══ TIME HELPERS ═══ */
function cairoNow() {
  const n = new Date();
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(n);
  const g = t => parseInt(p.find(x => x.type === t)?.value || '0', 10);
  return { h: g('hour'), m: g('minute'), s: g('second') };
}
const toMins = t => { if (!t) return 0; const c = t.split(' ')[0]; const [h, m] = c.split(':').map(Number); return h * 60 + m };
const fromMins = m => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
const addMins = (t, d) => fromMins(toMins(t) + d);
const nowSecs = () => { const c = cairoNow(); return c.h * 3600 + c.m * 60 + c.s };
const nowMins = () => { const c = cairoNow(); return c.h * 60 + c.m };

function dateStr(off = 0) {
  const d = new Date(Date.now() + off * 864e5);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = t => p.find(x => x.type === t)?.value || '00';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function getEffectiveDate() {
  const cm = nowMins();
  const fM = PRAYERS ? toMins(PRAYERS.Fajr) : 280;
  if (cm < fM) return dateStr(-1);
  return dateStr(0);
}

function fmt12(t) {
  if (!t) return '—';
  const c = t.split(' ')[0];
  const [h, m] = c.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} <small>${h < 12 ? 'AM' : 'PM'}</small>`;
}

function fmt12plain(t) {
  if (!t) return '—';
  const c = t.split(' ')[0];
  const [h, m] = c.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function fmtSecs(ts) {
  if (ts <= 0) return '0s';
  const h = Math.floor(ts / 3600), m = Math.floor((ts % 3600) / 60), s = ts % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function clockFmt(mins) {
  if (!mins) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function friendlyDate(d = new Date()) {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function getDaysInMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function shortDay(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}

function shortDate(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ═══ FIRESTORE HELPERS ═══ */
let CURRENT_UID = null;
function userRef() { return db.collection('users').doc(CURRENT_UID) }
function dayRef(dk) { return userRef().collection('days').doc(dk) }
function weekRef(wk) { return userRef().collection('weeks').doc(wk) }
function monthRef(mk) { return userRef().collection('months').doc(mk) }
function metaRef() { return userRef().collection('meta').doc('info') }

/* ═══ MEDICINE DEFAULTS ═══ */
const DEFAULT_MEDS = [
  { id: 'pill-dose1', name: 'Dose 1', type: 'pill', dose: '4 pills', anchor: '12:30', taken: false },
  { id: 'pill-dose2', name: 'Dose 2', type: 'pill', dose: '4 pills', anchor: '00:30', taken: false }
];

/* ═══ STATE ═══ */
let TODAY, SK;
let PRAYERS = null, TOMORROW_FAJR = null, HIJRI_DATA = null;
let DAY_CACHE = {};
let unsubscribeToday = null;

function refreshToday() { TODAY = getEffectiveDate(); SK = `os-${TODAY}`; }

function initState() {
  return {
    date: TODAY,
    body: { cold: false, sun: false, breathing: false, vacuum: false, azkar: false, tahseen: false, hair: false, workout: false, siwak: false, walk1: false, walk2: false, quran: false, english: false },
    cups: Array(CFG.waterCups).fill(false),
    meds: JSON.parse(JSON.stringify(DEFAULT_MEDS)),
    work: { short: { sessions: 0, log: [] }, medium: { sessions: 0, log: [] }, long: { sessions: 0, log: [] } },
    spiritual: { prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false }, dua: false },
    expenses: { items: [], totals: { EGP: 0, USD: 0, AED: 0 } },
    weight: { value: null, unit: 'kg', note: '' }
  };
}

function fsToState(doc) {
  if (!doc || !doc.exists) return null;
  const d = doc.data();
  const s = initState();
  s.date = doc.id;
  if (d.health) {
    ['cold', 'sun', 'breathing', 'vacuum', 'azkar', 'tahseen', 'hair', 'workout', 'siwak', 'walk1', 'walk2', 'quran', 'english'].forEach(k => { s.body[k] = !!d.health[k] });
  }
  if (d.water && Array.isArray(d.water.cups)) s.cups = d.water.cups;
  if (d.medicine && Array.isArray(d.medicine.items) && d.medicine.items.length) s.meds = d.medicine.items;
  if (d.work) {
    if (d.work.short) s.work.short = { sessions: d.work.short.sessions || 0, log: d.work.short.log || [] };
    if (d.work.medium) s.work.medium = { sessions: d.work.medium.sessions || 0, log: d.work.medium.log || [] };
    if (d.work.long) s.work.long = { sessions: d.work.long.sessions || 0, log: d.work.long.log || [] };
  }
  if (d.spiritual) s.spiritual = d.spiritual;
  if (d.expenses) s.expenses = d.expenses;
  if (d.weight && d.weight.value != null) s.weight = d.weight;
  return s;
}

function stateToFs(s) {
  const sc = calcScores(s);
  return {
    health: { cold: !!s.body.cold, sun: !!s.body.sun, breathing: !!s.body.breathing, vacuum: !!s.body.vacuum, azkar: !!s.body.azkar, tahseen: !!s.body.tahseen, hair: !!s.body.hair, workout: !!s.body.workout, siwak: !!s.body.siwak, walk1: !!s.body.walk1, walk2: !!s.body.walk2, quran: !!s.body.quran, english: !!s.body.english },
    water: { cups: s.cups, total: s.cups.filter(Boolean).length },
    medicine: { items: s.meds },
    work: {
      short: { sessions: s.work.short.sessions, totalMins: s.work.short.sessions * 30, log: s.work.short.log || [] },
      medium: { sessions: s.work.medium.sessions, totalMins: s.work.medium.sessions * 50, log: s.work.medium.log || [] },
      long: { sessions: s.work.long.sessions, totalMins: s.work.long.sessions * 90, log: s.work.long.log || [] }
    },
    spiritual: s.spiritual || { prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false }, dua: false },
    expenses: s.expenses || { items: [], totals: { EGP: 0, USD: 0, AED: 0 } },
    weight: s.weight || { value: null, unit: 'kg', note: '' },
    scores: { health: sc.health, water: sc.water, medicine: sc.medicine, work: sc.work, overall: sc.overall },
    meta: { gregorianDate: s.date, hijriDate: { day: HIJRI_DATA ? parseInt(HIJRI_DATA.day) : 0, month: HIJRI_DATA ? HIJRI_DATA.month.en : '', year: HIJRI_DATA ? parseInt(HIJRI_DATA.year) : 1447 } }
  };
}

async function saveState() {
  DAY_CACHE[TODAY] = ST;
  renderScoreStrip();
  try {
    await dayRef(TODAY).set(stateToFs(ST), { merge: true });
  } catch (e) {
    console.error('saveState failed', e);
    showToast('⚠ Save failed — check connection');
  }
}

async function loadTodayFromFs() {
  try {
    const doc = await dayRef(TODAY).get();
    const s = fsToState(doc);
    return s || initState();
  } catch (e) {
    console.error('loadTodayFromFs failed', e);
    return initState();
  }
}

function subscribeToday() {
  if (unsubscribeToday) unsubscribeToday();
  unsubscribeToday = dayRef(TODAY).onSnapshot(doc => {
    const s = fsToState(doc);
    if (s) {
      ST = s;
      DAY_CACHE[TODAY] = ST;
      renderScoreStrip(); renderBody(); renderCups(); renderPills(); renderWork(); renderWeight(); renderWeekSection();
    }
  }, e => console.warn('snapshot error', e));
}

/* ═══ DAY CACHE + ASYNC WEEK READS ═══ */
async function loadDayState(dk) {
  if (DAY_CACHE[dk] !== undefined) return DAY_CACHE[dk];
  try {
    const doc = await dayRef(dk).get();
    const s = fsToState(doc);
    DAY_CACHE[dk] = s;
    return s;
  } catch {
    DAY_CACHE[dk] = null;
    return null;
  }
}

async function prefetchWeek(days) {
  const missing = days.filter(d => DAY_CACHE[d] === undefined);
  if (!missing.length) return;
  await Promise.all(missing.map(d => loadDayState(d)));
}

/* ═══ SCORES ═══ */
function calcScores(s) {
  if (!s) return { health: 0, water: 0, medicine: 0, work: 0, overall: 0 };
  const bi = ['cold', 'sun', 'breathing', 'vacuum', 'azkar', 'tahseen', 'hair', 'workout', 'siwak', 'walk1', 'walk2', 'quran', 'english'];
  const bd = bi.filter(id => s.body && s.body[id]).length;
  const health = Math.round((bd / 13) * 100);
  const water = Math.round(((s.cups || []).filter(Boolean).length / 8) * 100);
  const meds = s.meds || [];
  const medTotal = meds.length || 1;
  const medDone = meds.filter(m => m.taken).length;
  const medicine = Math.round((medDone / medTotal) * 100);
  const effectiveDay = s.date || getEffectiveDate();
  const isFriday = new Date(effectiveDay + 'T12:00:00').getDay() === 5;
  const totalMins = s.work ? (s.work.short.sessions * 30 + s.work.medium.sessions * 50 + s.work.long.sessions * 90) : 0;
  const actualWork = Math.round((totalMins / 600) * 100);
  const work = isFriday ? Math.max(100, actualWork) : actualWork;
  const overall = Math.round(health * .3 + water * .2 + medicine * .2 + work * .3);
  return { health, water, medicine, work, overall };
}

async function getWeekAvgScores() {
  let t = { health: 0, water: 0, medicine: 0, work: 0 }, c = 0;
  for (let i = 1; i <= 7; i++) {
    const d = dateStr(-i);
    const s = await loadDayState(d);
    if (s) { const sc = calcScores(s); t.health += sc.health; t.water += sc.water; t.medicine += sc.medicine; t.work += sc.work; c++; }
  }
  if (c === 0) return { health: 0, water: 0, medicine: 0, work: 0 };
  return { health: Math.round(t.health / c), water: Math.round(t.water / c), medicine: Math.round(t.medicine / c), work: Math.round(t.work / c) };
}

/* ═══ SCORE STRIP ═══ */
function renderScoreStrip() {
  const sc = calcScores(ST);
  const items = [
    { label: 'Work', pct: sc.work, color: '#F59E0B' },
    { label: 'Health', pct: sc.health, color: '#10B981' },
    { label: 'Water', pct: sc.water, color: '#3B82F6' },
    { label: 'Medicine', pct: sc.medicine, color: '#8B5CF6' }
  ];
  const C = 2 * Math.PI * 26;
  document.getElementById('score-strip').innerHTML = items.map(it => {
    const dash = (Math.min(it.pct, 100) / 100) * C;
    return `<div class="score-ring-card"><svg class="sr-svg" viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" fill="none" stroke="#1F2937" stroke-width="5"/><circle cx="30" cy="30" r="26" fill="none" stroke="${it.color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 30 30)"/></svg><div class="sr-pct" style="color:${it.color}">${it.pct}%</div><div class="sr-label">${it.label}</div></div>`;
  }).join('');
}

/* ═══ LAST WEEK STRIP ═══ */
async function renderLastWeekStrip() {
  const el = document.getElementById('last-week-strip');
  if (!el) return;
  let weightFirst = null, weightLast = null;
  let sunTotal = 0, waterTotal = 0, workMins = 0, cnt = 0;
  for (let i = 7; i >= 1; i--) {
    const d = dateStr(-i);
    const s = DAY_CACHE[d];
    if (!s) continue;
    cnt++;
    const w = s.weight && s.weight.value != null ? s.weight.value : null;
    if (w && !weightFirst) weightFirst = w;
    if (w) weightLast = w;
    sunTotal += (s.body && s.body.sun) ? 1 : 0;
    waterTotal += calcScores(s).water;
    workMins += s.work ? (s.work.short.sessions * 30 + s.work.medium.sessions * 50 + s.work.long.sessions * 90) : 0;
  }
  if (cnt === 0) { el.innerHTML = ''; return; }
  const weightDelta = (weightFirst != null && weightLast != null) ? (weightLast - weightFirst).toFixed(1) : null;
  const wdColor = weightDelta == null ? 'var(--muted)' : weightDelta < 0 ? 'var(--green)' : weightDelta > 0 ? 'var(--red)' : 'var(--muted)';
  const wdText = weightDelta == null ? '— kg' : `${weightDelta > 0 ? '+' : ''}${weightDelta} kg`;
  const sunPct = Math.round((sunTotal / cnt) * 100);
  const hydPct = Math.round(waterTotal / cnt);
  const workH = (workMins / 60).toFixed(1);
  const pctColor = v => v >= 70 ? 'var(--green)' : v >= 40 ? 'var(--primary)' : 'var(--red)';
  el.innerHTML = `<div class="lw-strip"><span class="lw-metric" style="color:${wdColor}">⚖️ ${wdText}</span><span class="lw-sep">·</span><span class="lw-metric" style="color:${pctColor(hydPct)}">💧 ${hydPct}%</span><span class="lw-sep">·</span><span class="lw-metric" style="color:${pctColor(sunPct)}">☀️ ${sunPct}%</span><span class="lw-sep">·</span><span class="lw-metric" style="color:var(--primary)">⚡ ${workH}h</span></div>`;
}

/* ═══ WEIGHT ═══ */
function getWeight(dk) {
  const s = DAY_CACHE[dk];
  if (s && s.weight && s.weight.value != null) return s.weight.value;
  return null;
}

async function saveWeight() {
  const v = parseFloat(document.getElementById('wc-input').value);
  if (isNaN(v) || v < 40 || v > 250) { showToast('Enter a valid weight'); return; }
  ST.weight = { value: v, unit: 'kg', note: '' };
  document.getElementById('wc-input').value = '';
  await saveState();
  renderWeight();
  showToast(`⚖️ ${v} kg saved`);
}

function renderWeight() {
  const tw = getWeight(TODAY), yw = getWeight(dateStr(-1));
  document.getElementById('wc-today').innerHTML = tw ? `${tw}<small> kg</small>` : '—<small> kg</small>';
  const dEl = document.getElementById('wc-delta');
  if (tw && yw) {
    const diff = tw - yw;
    dEl.className = `wc-delta ${diff < 0 ? 'loss' : diff > 0 ? 'gain' : 'flat'}`;
    dEl.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg vs yesterday`;
  } else dEl.textContent = '';
  const cw = tw || yw || 112;
  const nm = Math.floor(cw / CFG.weightMilestoneStep) * CFG.weightMilestoneStep;
  document.getElementById('wc-milestone').innerHTML = `<div class="wc-mile-next">🎯 Next milestone: ${nm} kg · ${(cw - nm).toFixed(1)} kg to go</div><div class="wc-mile-end">End goal: ${CFG.weightGoal} kg · ${(cw - CFG.weightGoal).toFixed(1)} kg total journey</div>`;
  const tbl = document.getElementById('wc-week-table');
  let rows = '';
  for (let i = 6; i >= 0; i--) {
    const d = dateStr(-i);
    const w = getWeight(d);
    const isT = d === TODAY;
    rows += `<tr><td class="w7-day">${shortDay(d)} ${new Date(d + 'T12:00:00').getDate()}</td><td class="${w ? (isT ? 'w7-val w7-today' : 'w7-val') : 'w7-empty'}">${w ? w + ' kg' : '—'}</td></tr>`;
  }
  tbl.innerHTML = `<table class="w7-table">${rows}</table>`;
}

/* ═══ PRAYER API ═══ */
async function fetchTimings(date = dateStr()) {
  const [y, m, d] = date.split('-');
  const r = await fetch(`https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${CFG.lat}&longitude=${CFG.lon}&method=${CFG.method}`);
  if (!r.ok) throw new Error('API');
  return (await r.json()).data;
}

async function loadPrayers() {
  try {
    const data = await fetchTimings();
    PRAYERS = data.timings;
    HIJRI_DATA = data.date.hijri;
    document.getElementById('h-hijri').textContent = `${ordinal(parseInt(HIJRI_DATA.day, 10))} ${HIJRI_DATA.month.en} ${HIJRI_DATA.year}`;
    document.getElementById('h-hijri-year').textContent = '';
    renderProgress();
  } catch {
    PRAYERS = { Fajr: '04:42', Dhuhr: '12:04', Asr: '15:27', Maghrib: '18:00', Isha: '19:18' };
    document.getElementById('h-hijri').textContent = 'Offline';
    showToast('⚠ Using offline prayer times');
  }
}

function derived() {
  if (!PRAYERS) return null;
  return {
    waterOpen: addMins(PRAYERS.Maghrib, 120),
    pill1: PRAYERS.Maghrib,
    pill23: addMins(PRAYERS.Maghrib, 30),
    pillNight: '23:30',
    pillSuhoor: addMins(PRAYERS.Fajr, -45)
  };
}

function cupTimes() {
  const d = derived();
  if (!d) return [];
  return Array.from({ length: CFG.waterCups }, (_, i) => addMins(d.waterOpen, i * CFG.waterInterval));
}

function getMedTime(anchor) {
  const d = derived();
  if (!d) return null;
  if (anchor === 'maghrib') return d.pill1;
  if (anchor === 'maghrib+30') return d.pill23;
  if (anchor === 'fajr-45') return d.pillSuhoor;
  return anchor;
}

/* ═══ PRAYERS ═══ */
const PRAYER_DEF = [
  { key: 'Fajr', icon: '🌙', label: 'Fajr' },
  { key: 'Dhuhr', icon: '☀️', label: 'Dhuhr' },
  { key: 'Asr', icon: '🌤', label: 'Asr' },
  { key: 'Maghrib', icon: '🌅', label: 'Maghrib', note: '· Iftar' },
  { key: 'Isha', icon: '🌙', label: 'Isha' }
];

function renderPrayers() {
  if (!PRAYERS) return;
  const nM = nowMins(), nS = nowSecs();
  let nI = -1;
  for (let i = 0; i < PRAYER_DEF.length; i++) {
    let d = toMins(PRAYERS[PRAYER_DEF[i].key]) - nM;
    if (i === 0 && d < -18 * 60) d += 1440;
    if (d > 0) { nI = i; break; }
  }
  let isT = false, cs = '';
  if (nI >= 0) {
    let d = toMins(PRAYERS[PRAYER_DEF[nI].key]) * 60 - nS;
    if (d < 0) d += 86400;
    cs = fmtSecs(d);
  } else {
    loadTomorrowFajr();
    const fT = TOMORROW_FAJR || PRAYERS.Fajr;
    let d = (toMins(fT) + 1440) * 60 - nS;
    if (d >= 86400) d -= 86400;
    cs = fmtSecs(d);
    nI = 0; isT = true;
  }
  document.getElementById('prayer-list').innerHTML = PRAYER_DEF.map((p, i) => {
    const t = PRAYERS[p.key], pm = toMins(t);
    let d = pm - nM;
    if (i === 0 && !isT && d < -18 * 60) d += 1440;
    let cls = 'upcoming', badge = '', tC = '', nC = 'pr-name';
    if (i === nI) { cls = 'active'; tC = 't-next'; nC = 'pr-name pr-name-next'; badge = `<span class="pr-cdown">⏱ ${cs}</span>`; }
    else if (d <= 0 || (isT && i !== nI)) { cls = 'done'; badge = '<span class="pr-badge b-done">✓ Prayed</span>'; tC = 't-done'; }
    const note = p.note ? `<span style="font-size:10px;color:var(--muted);font-weight:400"> ${p.note}</span>` : '';
    const tmrw = (isT && i === 0) ? ' <span style="font-size:9px;color:var(--muted)">· tmrw</span>' : '';
    return `<div class="pr-row ${cls}"><div class="pr-icon">${p.icon}</div><div class="${nC}">${p.label}${note}${tmrw}</div><div class="pr-time ${tC}">${fmt12(t)}</div>${badge}</div>`;
  }).join('');
  document.getElementById('next-bar').style.display = 'none';
}

async function loadTomorrowFajr() {
  if (TOMORROW_FAJR) return;
  try {
    const data = await fetchTimings(dateStr(1));
    TOMORROW_FAJR = data.timings.Fajr;
    const s = document.getElementById('fajr-strip');
    if (s) s.style.display = 'flex';
    const f = document.getElementById('fajr-time');
    if (f) f.innerHTML = fmt12(TOMORROW_FAJR);
  } catch { }
}

/* ═══ PROGRESS RINGS ═══ */
function renderProgress() {
  const C = 2 * Math.PI * 44;
  const hD = HIJRI_DATA ? parseInt(HIJRI_DATA.day, 10) : 1;
  const hM = HIJRI_DATA ? HIJRI_DATA.month.en : '—';
  const hMD = 30;
  document.getElementById('ram-arc').setAttribute('stroke-dasharray', `${(hD / hMD * C).toFixed(1)} ${C.toFixed(1)}`);
  document.getElementById('ram-day').textContent = hD;
  document.getElementById('ram-of').textContent = `of ${hMD}`;
  document.getElementById('ram-label').textContent = hM;
  document.getElementById('ram-sub').textContent = (hMD - hD) > 0 ? `${hMD - hD} day${(hMD - hD) !== 1 ? 's' : ''} left` : 'Last day 🌙';
  const today = new Date();
  const mD = today.getDate(), mT = getDaysInMonth(today), mL = mT - mD, mN = today.toLocaleDateString('en-US', { month: 'long' });
  document.getElementById('mon-arc').setAttribute('stroke-dasharray', `${(mD / mT * C).toFixed(1)} ${C.toFixed(1)}`);
  document.getElementById('mon-day').textContent = mD;
  document.getElementById('mon-of').textContent = `of ${mT}`;
  document.getElementById('mon-label').textContent = mN;
  document.getElementById('mon-sub').textContent = `${mL} day${mL !== 1 ? 's' : ''} left`;
}

/* ═══ BODY ═══ */
const BODY_ITEMS = [
  { id: 'cold', icon: '🚿', label: 'Cold shower' },
  { id: 'sun', icon: '☀️', label: 'Sun · 20 min' },
  { id: 'breathing', icon: '🌬️', label: 'Breathing · 4x' },
  { id: 'vacuum', icon: '🫁', label: 'Stomach Vacuum · 5x' },
  { id: 'azkar', icon: '📿', label: 'Azkar' },
  { id: 'tahseen', icon: '🛡️', label: 'Tahseen' },
  { id: 'hair', icon: '💆', label: 'Hair wash' },
  { id: 'workout', icon: '💪', label: 'Workout · 10–60 min' },
  { id: 'siwak', icon: '🪥', label: 'Siwak (after Asr)' },
  { id: 'walk1', icon: '🚶', label: 'Walk 1 · 10–30 min' },
  { id: 'walk2', icon: '🚶', label: 'Walk 2 · 10–30 min' },
  { id: 'quran', icon: '📖', label: 'Quran' },
  { id: 'english', icon: '🗣️', label: 'English Practice' }
];

function renderBody() {
  document.getElementById('body-grid').innerHTML = BODY_ITEMS.map(it => {
    const d = !!ST.body[it.id];
    return `<div class="body-item ${d ? 'checked' : ''}" onclick="toggleBody('${it.id}')"><div class="bi-icon">${it.icon}</div><div class="bi-label">${it.label}</div><div class="bi-dot">${d ? '✓' : ''}</div></div>`;
  }).join('');
}

async function toggleBody(id) {
  ST.body[id] = !ST.body[id];
  renderBody();
  await saveState();
  showToast(ST.body[id] ? '✓ Done' : 'Unmarked');
}

/* ═══ CUPS ═══ */
function renderCups() {
  const times = cupTimes();
  document.getElementById('cups-row').innerHTML = Array.from({ length: CFG.waterCups }, (_, i) => {
    const f = ST.cups[i];
    const tL = times[i] ? fmt12plain(times[i]) : '';
    return `<div class="cup ${f ? 'filled' : ''}" onclick="toggleCup(${i})" title="Cup ${i + 1}${tL ? ' · ' + tL : ''}">${f ? '💧' : `<span>${i + 1}</span>`}</div>`;
  }).join('');
  const dr = ST.cups.filter(Boolean).length;
  const nI = ST.cups.findIndex(c => !c);
  const h = document.getElementById('cup-hint');
  if (nI === -1) { h.textContent = 'All 8 cups done · 4.0L ✓'; h.style.color = '#6ee7b7'; }
  else if (cupTimes()[nI]) { h.innerHTML = `${dr} of 8 · ${(dr * .5).toFixed(1)}L &nbsp;·&nbsp; Next: Cup ${nI + 1} at <strong>${fmt12plain(cupTimes()[nI])}</strong>`; h.style.color = ''; }
  else { h.textContent = `${dr} of 8 cups tracked`; h.style.color = ''; }
}

async function toggleCup(i) {
  ST.cups[i] = !ST.cups[i];
  renderCups();
  await saveState();
  showToast(ST.cups[i] ? `💧 ${(ST.cups.filter(Boolean).length * .5).toFixed(1)}L done` : 'Cup unchecked');
}

/* ═══ MEDICINE ═══ */
function renderPills() {
  const el = document.getElementById('pills-row');
  el.innerHTML = ST.meds.map((m, i) => {
    const t = getMedTime(m.anchor);
    const tStr = t ? fmt12(t) : '—';
    return `<div class="pill-item ${m.taken ? 'taken' : ''}" onclick="toggleMed(${i})"><div class="pi-icon">${m.type === 'packet' ? '📦' : m.type === 'injection' ? '💉' : m.type === 'scoop' ? '🥄' : '💊'}</div><div class="pi-info"><div class="pi-name">${m.name}${m.dose ? ' · ' + m.dose : ''}</div><div class="pi-meta">${tStr} · ${m.anchor}</div></div><div class="pi-badge ${m.taken ? 'taken-b' : 'untaken'}">${m.taken ? '✓ Taken' : 'Tap'}</div><div class="pi-del" onclick="event.stopPropagation();removeMed(${i})" title="Remove">✕</div></div>`;
  }).join('');
}

async function toggleMed(i) {
  ST.meds[i].taken = !ST.meds[i].taken;
  renderPills();
  await saveState();
  showToast(ST.meds[i].taken ? '💊 Taken' : 'Unmarked');
}

async function removeMed(i) {
  if (!confirm(`Remove "${ST.meds[i].name}"?`)) return;
  ST.meds.splice(i, 1);
  renderPills();
  await saveState();
  showToast('Medicine removed');
}

function openAddMed() {
  document.getElementById('med-modal-root').innerHTML = `<div class="med-modal-overlay" onclick="if(event.target===this)closeAddMed()"><div class="med-modal"><h3>Add Medicine</h3><label>Name</label><input id="mm-name" placeholder="e.g. Vitamin D"><label>Type</label><select id="mm-type"><option value="pill">💊 Pill</option><option value="packet">📦 Packet</option><option value="scoop">🥄 Scoop</option><option value="injection">💉 Injection</option></select><label>Dose (optional)</label><input id="mm-dose" placeholder="e.g. 500mg"><label>Anchor Time</label><select id="mm-anchor"><option value="12:00">12:00 PM</option><option value="12:30">12:30 PM</option><option value="13:00">1:00 PM</option><option value="13:30">1:30 PM</option><option value="14:00">2:00 PM</option><option value="14:30">2:30 PM</option><option value="15:00">3:00 PM</option><option value="15:30">3:30 PM</option><option value="16:00">4:00 PM</option><option value="16:30">4:30 PM</option><option value="17:00">5:00 PM</option><option value="17:30">5:30 PM</option><option value="18:00">6:00 PM</option><option value="18:30">6:30 PM</option><option value="19:00">7:00 PM</option><option value="19:30">7:30 PM</option><option value="20:00">8:00 PM</option><option value="20:30">8:30 PM</option><option value="21:00">9:00 PM</option><option value="21:30">9:30 PM</option><option value="22:00">10:00 PM</option><option value="22:30">10:30 PM</option><option value="23:00">11:00 PM</option><option value="23:30">11:30 PM</option><option value="00:00">12:00 AM</option><option value="00:30">12:30 AM</option><option value="01:00">1:00 AM</option><option value="01:30">1:30 AM</option><option value="02:00">2:00 AM</option></select><div class="med-modal-btns"><button class="mm-cancel" onclick="closeAddMed()">Cancel</button><button class="mm-save" onclick="saveMed()">Add</button></div></div></div>`;
}

function closeAddMed() { document.getElementById('med-modal-root').innerHTML = ''; }

async function saveMed() {
  const name = document.getElementById('mm-name').value.trim();
  if (!name) { showToast('Enter a name'); return; }
  const med = { id: 'med-' + Date.now(), name, type: document.getElementById('mm-type').value, dose: document.getElementById('mm-dose').value.trim(), anchor: document.getElementById('mm-anchor').value, taken: false };
  ST.meds.push(med);
  renderPills();
  await saveState();
  closeAddMed();
  showToast(`💊 ${name} added`);
}

/* ═══ WORK ═══ */
function renderWork() {
  const WORK_TYPES = [
    { key: 'short', mins: 30, cls: 'done-g', icon: '⚡', glow: 'rgba(16,185,129,.35)', ring: 'rgba(16,185,129,.5)' },
    { key: 'medium', mins: 50, cls: 'done-g', icon: '🔥', glow: 'rgba(245,158,11,.35)', ring: 'rgba(245,158,11,.5)' },
    { key: 'long', mins: 90, cls: 'done-u', icon: '🚀', glow: 'rgba(59,130,246,.35)', ring: 'rgba(59,130,246,.5)' }
  ];
  const allSessions = [];
  WORK_TYPES.forEach(({ key, mins, icon }) => {
    const log = ST.work[key].log || [];
    log.forEach((e, i) => allSessions.push({ key, icon, time: e.time, localIdx: i }));
  });
  function timeToSortKey(t) {
    if (!t) return 0;
    const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return 0;
    let h = parseInt(m[1]); const min = parseInt(m[2]); const ap = m[3].toUpperCase();
    if (ap === 'AM' && h === 12) h = 0;
    if (ap === 'PM' && h !== 12) h += 12;
    return h * 60 + min;
  }
  allSessions.sort((a, b) => timeToSortKey(a.time) - timeToSortKey(b.time));
  const globalNumMap = {};
  allSessions.forEach((s, gi) => { globalNumMap[`${s.key}-${s.localIdx}`] = gi + 1; });

  WORK_TYPES.forEach(({ key, mins, cls, icon, glow, ring }) => {
    const w = ST.work[key]; const c = w.sessions; const log = w.log || [];
    const dE = document.getElementById(`${key}-dots`);
    if (dE) dE.innerHTML = Array.from({ length: c }, (_, i) => `<div class="sesh-dot" title="Session ${i + 1} · click to remove" onclick="removeSession('${key}',${i})" style="width:46px;height:46px;background:${glow.replace('.35', '.15')};border:2px solid ${ring};box-shadow:0 0 10px ${glow};font-size:20px;">${icon}</div>`).join('') + `<div class="sesh-dot add" onclick="startSession('${key}')">+</div>`;
    const lE = document.getElementById(`${key}-log`);
    if (lE) lE.innerHTML = log.map((e, i) => {
      const gNum = globalNumMap[`${key}-${i}`] || '?';
      return `<div class="wt-log-item" style="--accent-color:${ring}"><span><span class="log-num">#${gNum}</span>${icon} ${key.charAt(0).toUpperCase() + key.slice(1)}</span><span class="log-time">${e.time}</span></div>`;
    }).reverse().join('');
  });

  const sm = ST.work.short.sessions * 30;
  const mm = ST.work.medium.sessions * 50;
  const lm = ST.work.long.sessions * 90;
  const ss = document.getElementById('ws-short-sum'); if (ss) ss.textContent = sm >= 60 ? clockFmt(sm) : sm + ' min';
  const ms = document.getElementById('ws-medium-sum'); if (ms) ms.textContent = mm >= 60 ? clockFmt(mm) : mm + ' min';
  const ls = document.getElementById('ws-long-sum'); if (ls) ls.textContent = lm >= 60 ? clockFmt(lm) : lm + ' min';
  const ts = document.getElementById('ws-total-sum'); if (ts) ts.textContent = clockFmt(sm + mm + lm);
  const tc = document.getElementById('ws-total-count'); if (tc) tc.textContent = ST.work.short.sessions + ST.work.medium.sessions + ST.work.long.sessions;
  const sc2 = document.getElementById('ws-short-count'); if (sc2) sc2.textContent = ST.work.short.sessions;
  const mc2 = document.getElementById('ws-medium-count'); if (mc2) mc2.textContent = ST.work.medium.sessions;
  const lc2 = document.getElementById('ws-long-count'); if (lc2) lc2.textContent = ST.work.long.sessions;
}

async function removeSession(type, idx) {
  if (ST.work[type].sessions <= 0) return;
  ST.work[type].sessions--;
  ST.work[type].log.splice(idx, 1);
  renderWork();
  await saveState();
  showToast('Session removed');
}

async function startSession(type) {
  const t = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  ST.work[type].sessions++;
  ST.work[type].log.push({ time: t });
  renderWork();
  await saveState();
  const wh = CFG.n8nWorkWebhook || CFG.slackWebhook;
  if (wh) fetch(wh, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionType: type, startTime: t }) }).catch(() => { });
  showToast(`▶ ${type.charAt(0).toUpperCase() + type.slice(1)} session started`);
}

/* ═══ EVENT LISTENERS ═══ */
document.getElementById('short-btn').addEventListener('click', () => startSession('short'));
document.getElementById('medium-btn').addEventListener('click', () => startSession('medium'));
document.getElementById('long-btn').addEventListener('click', () => startSession('long'));
document.getElementById('wc-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveWeight(); });

/* ═══ YOUR WEEK ═══ */
let weekOff = 0, selDay = null;

function getWeekBounds(off = 0) {
  const ref = new Date(TODAY + 'T12:00:00');
  ref.setDate(ref.getDate() + (off * 7));
  const dow = ref.getDay();
  const mon = new Date(ref);
  mon.setDate(ref.getDate() - ((dow + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return { days, monStr: days[0], sunStr: days[6] };
}

async function renderWeekSection() {
  const wk = getWeekBounds(weekOff);
  const td = new Date(TODAY + 'T12:00:00');
  const prefetchDays = [...wk.days];
  for (let i = 1; i <= 7; i++) prefetchDays.push(dateStr(-i));
  await prefetchWeek(prefetchDays);
  renderLastWeekStrip();
  document.getElementById('week-nav').innerHTML = `<button class="week-nav-btn" onclick="changeWeek(-1)">‹</button><div class="week-nav-label">${shortDate(wk.monStr)} — ${shortDate(wk.sunStr)}</div><button class="week-nav-btn" onclick="changeWeek(1)" ${weekOff >= 0 ? 'disabled' : ''}>›</button>`;
  document.getElementById('week-strip').innerHTML = wk.days.map(d => {
    const dd = new Date(d + 'T12:00:00');
    const isFut = dd > td;
    const isT = d === TODAY;
    const st = DAY_CACHE[d];
    const sc = st ? calcScores(st) : null;
    const pct = sc ? sc.overall : 0;
    const bc = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
    const sel = selDay === d;
    return `<div class="ws-day ${isT ? 'today' : ''} ${sel ? 'selected' : ''} ${isFut ? 'future' : ''}" onclick="${isFut ? '' : `selectDay('${d}')`}"><div class="ws-day-name">${shortDay(d)}</div><div class="ws-day-num">${new Date(d + 'T12:00:00').getDate()}</div><div class="ws-day-bar"><div class="ws-day-bar-fill" style="width:${isFut ? 0 : pct}%;background:${bc}"></div></div><div class="ws-day-pct" style="color:${isFut ? 'var(--muted)' : bc}">${isFut ? '—' : pct + '%'}</div></div>`;
  }).join('');
  renderDayDetail(); renderWeekTable(); renderWeight();
}

async function changeWeek(dir) { weekOff += dir; if (weekOff > 0) weekOff = 0; selDay = null; await renderWeekSection(); }
async function selectDay(d) { selDay = selDay === d ? null : d; await renderWeekSection(); }

function renderDayDetail() {
  const c = document.getElementById('day-detail-container');
  if (!selDay) { c.innerHTML = ''; return; }
  const st = DAY_CACHE[selDay];
  if (!st) { c.innerHTML = `<div class="day-detail"><div class="dd-header"><span>${shortDate(selDay)} — No data</span><span class="dd-close" onclick="selectDay('${selDay}')">✕</span></div></div>`; return; }
  const sc = calcScores(st);
  const w = getWeight(selDay);
  const bd = BODY_ITEMS.filter(it => st.body && st.body[it.id]).length;
  const cd = (st.cups || []).filter(Boolean).length;
  const meds = st.meds || [];
  const md = meds.filter(m => m.taken).length;
  const wk = st.work || { short: { sessions: 0 }, medium: { sessions: 0 }, long: { sessions: 0 } };
  const totalMins = wk.short.sessions * 30 + wk.medium.sessions * 50 + wk.long.sessions * 90;
  c.innerHTML = `<div class="day-detail"><div class="dd-header"><span>📊 ${shortDate(selDay)} · Overall ${sc.overall}%</span><span class="dd-close" onclick="selectDay('${selDay}')">✕</span></div><div class="dd-grid"><div class="dd-item"><div class="dd-item-label">Health</div><div class="dd-item-val" style="color:var(--green)">${bd}/13 · ${sc.health}%</div></div><div class="dd-item"><div class="dd-item-label">Water</div><div class="dd-item-val" style="color:var(--blue)">${cd}/8 · ${sc.water}%</div></div><div class="dd-item"><div class="dd-item-label">Medicine</div><div class="dd-item-val" style="color:var(--purple)">${md}/${meds.length} · ${sc.medicine}%</div></div><div class="dd-item"><div class="dd-item-label">Work</div><div class="dd-item-val" style="color:var(--primary)">${wk.short.sessions}S · ${wk.medium.sessions}M · ${wk.long.sessions}L · ${sc.work}%</div></div><div class="dd-item"><div class="dd-item-label">Weight</div><div class="dd-item-val">${w ? w + ' kg' : '—'}</div></div><div class="dd-item"><div class="dd-item-label">Deep Hours</div><div class="dd-item-val">${clockFmt(totalMins)}</div></div></div></div>`;
}

function renderWeekTable() {
  const wk = getWeekBounds(weekOff);
  const refDate = new Date(wk.monStr + 'T12:00:00');
  const yr = refDate.getFullYear(), mo = refDate.getMonth();
  const mName = refDate.toLocaleDateString('en-US', { month: 'long' });
  const lastD = new Date(yr, mo + 1, 0).getDate();
  const todayD = new Date(TODAY + 'T12:00:00');
  const weeks = [];
  for (let s = 1; s <= lastD; s += 7) {
    const e = Math.min(s + 6, lastD);
    const days = [];
    for (let d = s; d <= e; d++) days.push(`${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    weeks.push({ label: `${mName.slice(0, 3)} ${s}–${e}`, days });
  }
  let html = `<thead><tr><th style="text-align:left">${mName}</th><th>Health</th><th>Water</th><th>Work</th><th>Wt Δ</th><th>Hrs</th></tr></thead><tbody>`;
  weeks.forEach(w => {
    const past = w.days.filter(d => new Date(d + 'T12:00:00') <= todayD);
    const isCur = past.length > 0 && past.length < w.days.length;
    if (past.length === 0) { html += `<tr><td class="wt-label-cell">${w.label}</td><td class="wt-empty">—</td><td class="wt-empty">—</td><td class="wt-empty">—</td><td class="wt-empty">—</td><td class="wt-empty">—</td></tr>`; return; }
    let hS = 0, wS = 0, wkS = 0, cnt = 0, tS = 0, fW = null, lW = null;
    past.forEach(d => {
      const st = DAY_CACHE[d];
      if (st) { const sc = calcScores(st); hS += sc.health; wS += sc.water; wkS += sc.work; cnt++; tS += st.work ? (st.work.short.sessions * 30 + st.work.medium.sessions * 50 + st.work.long.sessions * 90) : 0; }
      const wt = getWeight(d);
      if (wt) { if (!fW) fW = wt; lW = wt; }
    });
    const aH = cnt ? Math.round(hS / cnt) : 0, aW = cnt ? Math.round(wS / cnt) : 0, aWk = cnt ? Math.round(wkS / cnt) : 0;
    const wd = (fW && lW) ? (lW - fW).toFixed(1) : null;
    const dH = (tS / 60).toFixed(1);
    const pc = v => v >= 70 ? 'wt-pct-good' : v >= 40 ? 'wt-pct-ok' : 'wt-pct-bad';
    html += `<tr class="${isCur ? 'wt-current' : ''}"><td class="wt-label-cell">${w.label}</td><td class="${pc(aH)}">${aH}%</td><td class="${pc(aW)}">${aW}%</td><td class="${pc(aWk)}">${aWk}%</td><td style="color:${wd && wd < 0 ? 'var(--green)' : wd > 0 ? 'var(--red)' : 'var(--muted)'}">${wd ? (wd > 0 ? '+' : '') + wd + 'kg' : '—'}</td><td>${dH}h</td></tr>`;
  });
  html += '</tbody>';
  document.getElementById('week-table').innerHTML = html;
  document.getElementById('month-grid-container').innerHTML = `<button class="view-month-btn" onclick="toggleMonthGrid()">📊 View Full Month</button><div id="month-grid" style="display:none"></div>`;
}

function toggleMonthGrid() {
  const g = document.getElementById('month-grid');
  if (g.style.display === 'none') { g.style.display = 'block'; renderMonthGrid(); }
  else g.style.display = 'none';
}

function renderMonthGrid() {
  const wk = getWeekBounds(weekOff);
  const refDate = new Date(wk.monStr + 'T12:00:00');
  const yr = refDate.getFullYear(), mo = refDate.getMonth();
  const lastD = new Date(yr, mo + 1, 0).getDate();
  const todayD = new Date(TODAY + 'T12:00:00');
  let h = `<div class="month-list">`;
  for (let d = 1; d <= lastD; d++) {
    const ds = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dd = new Date(ds + 'T12:00:00');
    const isFut = dd > todayD;
    const st = DAY_CACHE[ds];
    const sc = st ? calcScores(st) : null;
    const pct = sc ? sc.overall : 0;
    const bc = isFut ? 'var(--border)' : pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--primary)' : 'var(--red)';
    h += `<div class="ml-row"><div class="ml-day" style="color:${isFut ? 'var(--muted)' : bc}">${d}</div><div class="ml-bar"><div class="ml-bar-fill" style="width:${isFut ? 0 : pct}%;background:${bc}"></div></div><div class="ml-pct" style="color:${isFut ? 'var(--muted)' : bc}">${isFut ? '—' : pct + '%'}</div></div>`;
  }
  h += '</div>';
  document.getElementById('month-grid').innerHTML = h;
}

/* ═══ DAY ARCHITECTURE ═══ */
function renderDayArch() {
  const el = document.getElementById('day-arch');
  const p = PRAYERS || { Fajr: '04:42', Dhuhr: '12:04', Asr: '15:27', Maghrib: '18:00', Isha: '19:18' };
  const fM = toMins(p.Fajr), dhM = toMins(p.Dhuhr), asM = toMins(p.Asr), mgM = toMins(p.Maghrib), isM = toMins(p.Isha);
  const sleepStart = fM + 45, sleepEnd = dhM;
  const w1Open = dhM + 15, w1Close = mgM - 120;
  const famEnd = mgM + 180;
  const w2Open = famEnd + 15;
  const w2Close = fM - 180;
  const w2CloseAdj = w2Close < w2Open ? w2Close + 1440 : w2Close;
  const shift = mgM;
  const rPos = m => ((m - shift) + 1440) % 1440;
  const rPct = m => `${(rPos(m) / 1440 * 100).toFixed(2)}%`;
  const pct = r => `${(r / 1440 * 100).toFixed(2)}%`;
  const rFamEnd = 180;
  const rSleepStart = rPos(sleepStart), rSleepEnd = rPos(sleepEnd);
  const rW1Open = rPos(w1Open), rW1Close = rPos(w1Close);
  const rW2Open = rFamEnd + 15, rW2Close = rPos(w2CloseAdj) || 1440;
  const rIsha = rPos(isM), rFajr = rPos(fM), rAsr = rPos(asM);
  const blocks = [
    { rFrom: 0, rWidth: rFamEnd, label: '👨‍👩‍👧 FAMILY', cls: 't-family' },
    { rFrom: rFamEnd, rWidth: rSleepStart - rFamEnd, label: '⚡ WORK', cls: 't-work' },
    { rFrom: rSleepStart, rWidth: rSleepEnd - rSleepStart, label: '😴 SLEEP', cls: 't-sleep' },
    { rFrom: rSleepEnd, rWidth: 1440 - rSleepEnd, label: '⚡ WORK', cls: 't-work' }
  ].filter(b => b.rWidth > 0);
  const waterBlocksRaw = [
    { rFrom: rW2Open, rWidth: rW2Close - rW2Open, label: '💧 Water', cls: 't-water' },
    { rFrom: rW1Open, rWidth: rW1Close - rW1Open, label: '💧 Water', cls: 't-water' }
  ].filter(b => b.rWidth > 0).sort((a, b) => a.rFrom - b.rFrom);
  const bHTML = blocks.map(b => `<div class="t-block ${b.cls}" style="left:${pct(b.rFrom)};width:${pct(b.rWidth)}">${b.label}</div>`).join('');
  const wHTML = waterBlocksRaw.map(b => `<div class="t-block ${b.cls}" style="left:${pct(b.rFrom)};width:${pct(b.rWidth)}">${b.label}</div>`).join('');
  const makeAxis = ticks => `<div style="position:relative;height:20px;margin-bottom:2px">${ticks.map(t => `<span style="position:absolute;left:${pct(t.r)};transform:translateX(-50%);color:${t.color};font-size:8px;font-weight:700;white-space:nowrap">${t.label}</span>`).join('')}</div>`;
  const workTicks = [
    { r: rFamEnd, label: fmt12plain(fromMins(mgM + 180)), color: '#10B981' },
    { r: rSleepStart, label: fmt12plain(fromMins(sleepStart)), color: '#10B981' },
    { r: rSleepEnd, label: fmt12plain(fromMins(sleepEnd)), color: '#10B981' }
  ];
  const waterTicks = [
    { r: rW2Open, label: fmt12plain(fromMins(w2Open)), color: '#3b82f6' },
    { r: rW2Close, label: fmt12plain(fromMins(w2CloseAdj % 1440)), color: '#3b82f6' },
    { r: rW1Open, label: fmt12plain(fromMins(w1Open)), color: '#3b82f6' },
    { r: rW1Close, label: fmt12plain(fromMins(w1Close)), color: '#3b82f6' }
  ];
  const sleepFamTicks = [
    { r: 0, label: fmt12plain(p.Maghrib), color: '#ef4444' },
    { r: rFamEnd, label: fmt12plain(fromMins(mgM + 180)), color: '#ef4444' },
    { r: rSleepStart, label: fmt12plain(fromMins(sleepStart)), color: '#888888' },
    { r: rSleepEnd, label: fmt12plain(fromMins(sleepEnd)), color: '#888888' }
  ];
  const adanTicks = [
    { r: 0, label: fmt12plain(p.Maghrib), color: '#10B981' },
    { r: rIsha, label: fmt12plain(p.Isha), color: '#F59E0B' },
    { r: rFajr, label: fmt12plain(p.Fajr), color: '#F59E0B' },
    { r: rSleepEnd, label: fmt12plain(p.Dhuhr), color: '#F59E0B' },
    { r: rAsr, label: fmt12plain(p.Asr), color: '#F59E0B' }
  ];
  const markers = [
    { mins: mgM, icon: '🌙', label: 'Maghrib', color: '#10B981' },
    { mins: isM, icon: '🕌', label: 'Isha', color: '#F59E0B' },
    { mins: fM, icon: '🕌', label: 'Fajr', color: '#F59E0B' },
    { mins: dhM, icon: '🕌', label: 'Dhuhr', color: '#F59E0B' },
    { mins: asM, icon: '🕌', label: 'Asr', color: '#F59E0B' }
  ];
  const mHTML = markers.map(m => `<div class="pm-item" style="left:${rPct(m.mins)}"><div class="pm-line" style="background:${m.color}"></div><div class="pm-icon">${m.icon}</div><div class="pm-label" style="color:${m.color}">${m.label}</div></div>`).join('');
  const sleepMins = sleepEnd - sleepStart, napMins = 90, famMins = 180;
  const workMins = 1440 - sleepMins - napMins - famMins;
  const w1Mins = w1Close - w1Open, w2Mins = w2CloseAdj - w2Open;
  const waterMins = w1Mins + w2Mins;
  el.innerHTML = `<div class="arch-context">Islamic day view · Maghrib → Maghrib · Dikirnis prayer times</div>${makeAxis(waterTicks)}<div class="timeline-row"><div class="timeline-outer-wrap"><div class="timeline-outer slim">${wHTML}</div></div></div>${makeAxis(sleepFamTicks)}<div class="timeline-row"><div class="timeline-outer-wrap"><div class="timeline-outer">${bHTML}</div></div></div>${makeAxis(workTicks)}${makeAxis(adanTicks)}<div class="prayer-marker-row">${mHTML}</div><div class="arch-stats" style="grid-template-columns:repeat(4,1fr)"><div class="ss-item"><div class="ss-val">${clockFmt(sleepMins + napMins)}</div><div class="ss-lbl">😴 Sleep + Nap</div></div><div class="ss-item"><div class="ss-val">${clockFmt(workMins)}</div><div class="ss-lbl">⚡ Work</div></div><div class="ss-item"><div class="ss-val">${clockFmt(famMins)}</div><div class="ss-lbl">👨‍👩‍👧 Family</div></div><div class="ss-item"><div class="ss-val">${clockFmt(waterMins)}</div><div class="ss-lbl">💧 Water</div></div></div>`;
}

/* ═══ QUOTES ═══ */
let QUOTES_FS = [];
let quoteIdx = 0, quoteAnchored = false;

async function loadQuotes() {
  try {
    const snap = await userRef().collection('quotes').orderBy('num').get();
    QUOTES_FS = snap.docs.map(d => d.data());
  } catch (e) {
    console.warn('Quotes load failed', e);
    QUOTES_FS = [];
  }
}

function renderQuote() {
  if (!QUOTES_FS.length) return;
  if (!quoteAnchored) { quoteIdx = (new Date().getDate() - 1) % QUOTES_FS.length; quoteAnchored = true; }
  const q = QUOTES_FS[quoteIdx % QUOTES_FS.length];
  document.getElementById('qtext').innerHTML = q.html;
  document.getElementById('qnum').textContent = `${q.num} / ${QUOTES_FS.length}`;
  document.getElementById('qtags').innerHTML = q.tags.map(t => `<span class="qtag">${t}</span>`).join('');
}

function prevQuote() { quoteIdx = (quoteIdx - 1 + QUOTES_FS.length) % QUOTES_FS.length; renderQuote(); }
function nextQuote() { quoteIdx = (quoteIdx + 1) % QUOTES_FS.length; renderQuote(); }

/* ═══ HEADER ═══ */
function renderHeader() { document.getElementById('h-date').textContent = friendlyDate(); }

/* ═══ TOAST ═══ */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ═══ INTERVALS ═══ */
setInterval(() => renderPrayers(), 1000);
setInterval(() => { renderCups(); renderPills(); }, 30000);

/* ═══ INIT ═══ */
async function init() {
  showLoader();
  refreshToday();
  ST = await loadTodayFromFs();
  DAY_CACHE[TODAY] = ST;
  renderHeader();
  renderScoreStrip();
  renderLastWeekStrip();
  renderWeight();
  renderProgress();
  renderBody();
  renderCups();
  renderWork();
  await loadQuotes();
  renderQuote();
  await renderWeekSection();
  await loadPrayers();
  renderPrayers(); renderCups(); renderPills(); renderProgress(); renderDayArch();
  loadTomorrowFajr();
  subscribeToday();
  hideLoader();
}

/* ═══ AUTH ═══ */
const ALLOWED_UID = 'vnJbfZMnIdRlddIwZDptqANz1SK2';
showLoader();
auth.onAuthStateChanged(user => {
  if (user) {
    if (user.uid !== ALLOWED_UID) {
      auth.signOut();
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
      document.getElementById('login-error').style.display = 'block';
      hideLoader();
      return;
    }
    CURRENT_UID = user.uid;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    init();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    hideLoader();
  }
});
