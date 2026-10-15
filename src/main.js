/* =====================================================================
   ПЯТИЛИТРУХА БАГБИРА — главный модуль
   ---------------------------------------------------------------------
   Раскладка простая: сцена → ресурсы → НАРРАТИВ → действия → лог.
   Мини-игры: тап/держи. Бредометр правит рассказчиком.
   ===================================================================== */

import { Renderer } from './render.js';
import { Minigames, BUILD as MG_BUILD } from './minigames.js';
import * as A from './audio.js';
import {
  createState, seedRng, beginTurn, resolveChoice, applyEffect, applyEffects,
  ACTIONS, inventoryActions, checkLoss, winRun, summary, attachMinigame,
  currentStationName, nextStationName, STATIONS, ITEMS, TOTAL_DIST, MAX_TURNS,
  clamp, addLog, addTicker, say,
} from './game.js';
import { TICKER_LINES } from './events.js';
import { eventText, narratorVoice, madInfo, madLevel, madChoices } from './narration.js';

const $ = (s) => document.querySelector(s);

/* Версия сборки. Если в браузере версия не совпадает с той, что в src/main.js —
   страница работает на старом коде из кэша: жми Ctrl+F5. */
const BUILD = MG_BUILD;   // версия берётся из minigames.js, чтобы не расходились

/* ------------------------- DOM ------------------------- */
const el = {
  topStation: $('#tb-station'), topTurn: $('#tb-turn'), topLeft: $('#tb-left'),
  topFill: $('#tb-fill'), topMarker: $('#tb-marker'), details: $('#tb-details'),
  build: $('#tb-build'),
  canvas: $('#scene'),
  vpText: $('#vp-text'), vpTitle: $('#vp-title'),
  toasts: $('#toasts'),
  chips: $('#chips'),
  speaker: $('#speaker'), spFace: $('#sp-face'), spName: $('#sp-name'),
  cardTag: $('#card-tag'), cardTitle: $('#card-title'), cardText: $('#card-text'),
  narr: $('#narr'), choices: $('#choices'),
  actions: $('#actions'), log: $('#log'),
  drawer: $('#drawer'), drawerClose: $('#drawer-close'),
  meters: $('#meters'), inv: $('#inv'), mods: $('#mods'), crewList: $('#crew-list'), ticker: $('#ticker'),
  seed: $('#seed'),
  screen: $('#screen'), screenBody: $('#screen-body'),
  sound: $('#btn-sound'), flash: $('#flash'), fatal: $('#fatal'),
};

const renderer = new Renderer(el.canvas);
const mg = new Minigames(renderer);

let S = createState(1);
let busy = false;
let typeTimer = 0;
let lastChoiceLabels = [];

/* =====================================================================
   ВИДИМЫЕ ОШИБКИ: игра не должна молчать
   ===================================================================== */
function fatal(msg){
  const d = document.createElement('div');
  d.textContent = '⚠ ' + msg;
  el.fatal.appendChild(d);
  setTimeout(() => d.remove(), 12000);
}
window.addEventListener('error', (e) => fatal('ошибка: ' + (e.message || e)));
window.addEventListener('unhandledrejection', (e) => fatal('ошибка: ' + ((e.reason && e.reason.message) || e.reason)));

/* =====================================================================
   ТОСТЫ / ЭФФЕКТЫ
   ===================================================================== */
function toast(text, cls = ''){
  const d = document.createElement('div');
  d.className = 'toast ' + cls;
  d.textContent = text;
  el.toasts.appendChild(d);
  setTimeout(() => d.remove(), 2600);
  while (el.toasts.children.length > 5) el.toasts.firstChild.remove();
}
function flashScreen(col = '#fff', ms = 100){
  el.flash.style.background = col;
  el.flash.classList.add('on');
  setTimeout(() => el.flash.classList.remove('on'), ms);
}

/* =====================================================================
   РЕСУРСЫ — одна строка чипов
   ===================================================================== */
const CHIPS = [
  { id: 'bag',  ico: '🍾', name: 'Багбир',   max: 60,  unit: ' л', dec: 1, c1: '#c98a1e', c2: '#ffd166',
    warn: (v) => v < 12, crit: (v) => v < 5 },
  { id: 'grad', ico: '🌡️', name: 'Градус',   max: 100, unit: '°',  dec: 0, c1: '#8a2b4f', c2: '#ff6b9a',
    warn: (v) => v < 14, crit: (v) => v < 6 },
  { id: 'vmen', ico: '🧠', name: 'Вменяем.', max: 100, unit: '',   dec: 0, c1: '#1f7a5c', c2: '#54d98c',
    warn: (v) => v < 26, crit: (v) => v < 12 },
  { id: 'mad',  ico: '🌀', name: 'Бредометр', max: 100, unit: '',  dec: 0, c1: '#5a2b7a', c2: '#b070ff',
    warn: null, crit: null },
  { id: 'temp', ico: '🔥', name: 'Тепло',    max: 100, unit: '',   dec: 0, c1: '#8a3a12', c2: '#ff9a3d',
    warn: (v) => v < 25, crit: (v) => v < 12 },
  { id: 'fuel', ico: '⛽', name: 'Бак',      max: 26,  unit: ' л', dec: 1, c1: '#1f4f7a', c2: '#5fd7ff',
    warn: (v) => v < 4, crit: (v) => v < 1.5 },
  { id: 'rizz', ico: '✨', name: 'Ризз',     max: 60,  unit: '',   dec: 0, c1: '#6b3aa8', c2: '#d7a4ff',
    warn: null, crit: null },
  { id: 'kgb',  ico: '🕵️', name: 'КГБ',      max: 100, unit: '',   dec: 0, c1: '#5a2b7a', c2: '#ff5f5f',
    warn: (v) => v > 68, crit: (v) => v > 88 },
];

function buildChips(){
  el.chips.innerHTML = CHIPS.map((c) => `
    <div class="chip-res" data-c="${c.id}" title="${c.name}">
      <i class="fill" style="--c1:${c.c1};--c2:${c.c2}"></i>
      <span class="ico">${c.ico}</span>
      <span class="body"><span class="nm">${c.name}</span>
      <span class="vl"><b data-v="${c.id}">0</b><small>${c.unit}</small></span></span>
    </div>`).join('');
}
function renderChips(){
  for (const c of CHIPS){
    const box = el.chips.querySelector(`[data-c="${c.id}"]`);
    if (!box) continue;
    const v = S[c.id] ?? 0;
    const pct = clamp((v / c.max) * 100, 0, 100);
    box.querySelector('.fill').style.width = pct + '%';
    const val = box.querySelector(`[data-v="${c.id}"]`);
    val.textContent = c.dec ? v.toFixed(c.dec).replace('.', ',') : Math.round(v);
    box.classList.toggle('warn', !!(c.warn && c.warn(v)));
    box.classList.toggle('crit', !!(c.crit && c.crit(v)));
    if (c.id === 'mad') box.title = 'Бредометр: ' + madInfo(v).label + ' — ' + madInfo(v).hint;
  }
}

/* ---- подробная панель ---- */
const METERS = [
  { id: 'bag',  name: '🍾 БАГБИР', max: 60, dec: 1, unit: ' л', c1: '#c98a1e', c2: '#ffd166', glow: 'rgba(255,209,102,.6)' },
  { id: 'grad', name: '🌡️ ГРАДУС', max: 100, dec: 0, unit: '°', c1: '#8a2b4f', c2: '#ff6b9a', glow: 'rgba(255,107,154,.5)' },
  { id: 'vmen', name: '🧠 ВМЕНЯЕМОСТЬ', max: 100, dec: 0, unit: '', c1: '#1f7a5c', c2: '#54d98c', glow: 'rgba(84,217,140,.5)' },
  { id: 'mad',  name: '🌀 БРЕДОМЕТР', max: 100, dec: 0, unit: '', c1: '#5a2b7a', c2: '#b070ff', glow: 'rgba(176,112,255,.55)' },
  { id: 'temp', name: '🔥 ТЕПЛО', max: 100, dec: 0, unit: '', c1: '#8a3a12', c2: '#ff9a3d', glow: 'rgba(255,154,61,.5)' },
  { id: 'fuel', name: '⛽ БАК', max: 26, dec: 1, unit: ' л', c1: '#1f4f7a', c2: '#5fd7ff', glow: 'rgba(95,215,255,.5)' },
  { id: 'speed', name: '💨 ХОД', max: 12, dec: 1, unit: '', c1: '#2b6b7a', c2: '#8ef0e0', glow: 'rgba(142,240,224,.4)' },
  { id: 'rizz', name: '✨ РИЗЗ', max: 60, dec: 0, unit: '', c1: '#6b3aa8', c2: '#d7a4ff', glow: 'rgba(215,164,255,.55)' },
  { id: 'kgb',  name: '🕵️ КГБ-МЕТР', max: 100, dec: 0, unit: '', c1: '#5a2b7a', c2: '#ff5f5f', glow: 'rgba(255,95,95,.5)' },
  { id: 'alien', name: '💙 ОНА', max: 100, dec: 0, unit: '', c1: '#1f5a7a', c2: '#5fd7ff', glow: 'rgba(95,215,255,.55)' },
];
function buildMeters(){
  el.meters.innerHTML = METERS.map((m) => `
    <div class="meter" data-m="${m.id}">
      <div class="meter-row"><span class="meter-name">${m.name}</span>
      <span class="meter-val"><b data-v="${m.id}">0</b><small>${m.unit}</small></span></div>
      <div class="track"><i style="--c1:${m.c1};--c2:${m.c2};--glow:${m.glow}"></i></div>
    </div>`).join('');
}
function renderMeters(){
  for (const m of METERS){
    const box = el.meters.querySelector(`[data-m="${m.id}"]`);
    if (!box) continue;
    const v = S[m.id] ?? 0;
    box.querySelector('i').style.width = clamp((v / m.max) * 100, 0, 100) + '%';
    const val = box.querySelector(`[data-v="${m.id}"]`);
    val.textContent = m.dec ? v.toFixed(m.dec).replace('.', ',') : Math.round(v);
  }
}

function renderInv(){
  const slots = [];
  for (const k of Object.keys(ITEMS)){
    const n = S.items[k] || 0;
    slots.push(`<div class="slot ${n ? 'filled' : ''}" title="${ITEMS[k].name}: ${ITEMS[k].desc}">
      ${n ? `<span>${ITEMS[k].emoji}</span><span class="cnt">×${n}</span>` : '<span style="opacity:.18">·</span>'}</div>`);
  }
  while (slots.length % 5) slots.push('<div class="slot"></div>');
  el.inv.innerHTML = slots.join('');
}
function renderMods(){
  const entries = Object.values(S.mods);
  el.mods.innerHTML = entries.length
    ? entries.map((m) => `<span class="chip ${m.kind}" title="${m.desc || ''}">${m.name}${m.turns > 0 ? ' ·' + m.turns : ''}</span>`).join('')
    : '<span class="empty">чисто, как в вагоне-музее</span>';
}
function renderLog(){
  el.log.innerHTML = S.log.slice(0, 12).map((l, i) => `<div class="n-${i} ${l.cls}">${l.text}</div>`).join('');
}
function renderTicker(){
  el.ticker.innerHTML = S.ticker.slice(0, 22).map((t) => `<div>${t}</div>`).join('');
}
function renderCrewList(){
  el.crewList.innerHTML = S.crew.slice(0, 10).map((c) => {
    const op = 1 - Math.min(0.6, (S.turn - c.turn) * 0.05);
    return `<li style="opacity:${op}"><span class="who">${c.who}:</span><span class="what">«${c.what}»</span></li>`;
  }).join('');
}
function fmtTime(min){
  const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function renderTop(){
  el.topStation.textContent = `● ${currentStationName(S)} → ${nextStationName(S)}`;
  el.topTurn.textContent = S.turn;
  el.topLeft.textContent = (TOTAL_DIST - S.dist).toFixed(2).replace('.', ',');
  const pct = clamp((S.dist / TOTAL_DIST) * 100, 0, 100);
  el.topFill.style.width = pct + '%';
  el.topMarker.style.left = pct + '%';
  el.seed.textContent = S.seed.toString(16).toUpperCase().padStart(8, '0');
}

function renderActions(){
  if (S.phase === 'over'){ el.actions.innerHTML = ''; return; }
  const acts = [...ACTIONS, ...inventoryActions(S)];
  el.actions.innerHTML = acts.map((a) => {
    const ok = a.avail ? a.avail(S) : true;
    return `<button class="act ${a.cls || ''}" data-act="${a.id}" ${ok ? '' : 'disabled'}>
      <span class="k">${a.key || ''}</span><b>${a.name}</b><small>${a.hint || ''}</small></button>`;
  }).join('') +
  `<button class="act go" data-travel="leg"><span class="k">Ж</span><b>🚂 ЕДЕМ ДАЛЬШЕ</b>
     <small>Один перегон. Печка ест топливо из бака, багбир понемногу уходит. Дальше — новое событие.</small></button>
   <button class="act" data-travel="full"><span class="k">Ф</span><b>⚡ ПОЛНЫЙ ХОД</b>
     <small>−2,5 л багбира, −6 вменяемости, +1,0 к ходу. Когда надо спешить.</small></button>
   <button class="act" data-travel="drift"><span class="k">И</span><b>🌌 ДРЕЙФ</b>
     <small>−0,25 к ходу, +0,3 л багбира, +4 вменяемости. Экономия.</small></button>`;

  el.actions.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => doAction(b.dataset.act)));
  el.actions.querySelectorAll('[data-travel]').forEach((b) => b.addEventListener('click', () => doTravel(b.dataset.travel)));
}

function renderAll(){
  renderChips(); renderMeters(); renderInv(); renderMods();
  renderLog(); renderTicker(); renderCrewList(); renderTop(); renderActions();
  renderer.setBag(S.bag / 60);
  renderer.gradNorm = S.grad / 100;
  renderer.tempNorm = S.temp / 100;
  renderer.madNorm = S.mad / 100;
  renderer.speedNorm = clamp(S.speed / 8, 0.05, 1.4);
  renderer.distNorm = S.dist / TOTAL_DIST;
  renderer.alienLevel = clamp((S.alien || 0) / 60, 0, 1) * (S.flags.alienMet ? 1 : 0.4);
  renderer.alienInCar = !!(S.alienInCar || S.flags.alienTambur);
}

/* =====================================================================
   СПИКЕР
   ===================================================================== */
const FACES = {
  sur:   { cls: 'sur',   name: 'СУРДИН',      role: 'астроном' },
  vas:   { cls: 'vas',   name: 'ВАСЯ',        role: 'научпопный алкаш' },
  brig:  { cls: 'brig',  name: 'БРИГАДИР',    role: 'третий в купе' },
  alien: { cls: 'alien', name: 'ИНОПЛАНЕТЯНКА', role: 'она' },
  narr:  { cls: 'none',  name: 'РАССКАЗЧИК',  role: 'голос вагона' },
};
function setSpeaker(who){
  const f = FACES[who] || FACES.narr;
  el.spFace.className = 'sp-face ' + f.cls;
  el.spFace.textContent = who && FACES[who] && f.cls === 'none' ? '📻' : (who ? '' : '📻');
  el.spName.textContent = f.name;
}

/* Текст события ставится сразу целиком — читать можно с первой секунды.
   «Живость» даёт анимация появления (см. .card-text в styles.css). */
function typeText(node, html){
  clearInterval(typeTimer);
  node.innerHTML = html;
  node.classList.remove('reveal');
  void node.offsetWidth;
  node.classList.add('reveal');
}

/* =====================================================================
   СОБЫТИЕ
   ===================================================================== */
function tagName(t, ev){
  if (ev && ev.love) return '💙 ОНА';
  return { danger: '⚠ ОПАСНО', weird: '🌀 АНОМАЛИЯ', good: '✔ ХОРОШО', '': 'СОБЫТИЕ В ПУТИ' }[t] || 'СОБЫТИЕ В ПУТИ';
}

function typeTextLegacy(node, html){
  clearInterval(typeTimer);
  let i = 0;
  const step = Math.max(2, Math.round(html.length / 90));
  node.innerHTML = '';
  typeTimer = setInterval(() => {
    i += step;
    node.innerHTML = html.slice(0, i);
    if (i >= html.length){ clearInterval(typeTimer); node.innerHTML = html; }
  }, 16);
}
void typeTextLegacy;

function showEvent(ev, choices){
  S.phase = 'event';
  el.cardTag.textContent = tagName(ev.tag, ev);
  el.cardTag.className = 'tag ' + (ev.tag || '');
  el.cardTitle.textContent = ev.title;
  typeText(el.cardText, eventText(ev, S.mad));

  // рассказчик комментирует в зависимости от бредометра
  const v = narratorVoice(S.mad, 0.7);
  el.narr.className = 'narr' + (v ? (v.alien ? ' alien' : v.level >= 3 ? ' mad' : '') : '');
  el.narr.textContent = v ? v.text : '';
  const info = madInfo(S.mad);
  el.cardTag.title = `Бредометр ${Math.round(S.mad)}/100 — ${info.label} (${info.hint})`;

  setSpeaker(ev.who || (v && v.alien ? 'alien' : 'narr'));

  // базовые варианты + дополнительные «бредовые»
  const extra = madChoices(S).map((m, i) => ({
    idx: 1000 + i, c: { label: m.label, sub: m.sub, cls: m.cls, run: m.run }, ok: true, extra: m,
  }));
  const all = [...choices, ...extra];
  lastChoiceLabels = all.map((ch) => ch.c.label);

  el.choices.innerHTML = all.map((ch) => {
    const cost = ch.c.cost || ch.c.cost || {};
    const costStr = [
      cost.rizz ? `−${cost.rizz} ризз` : '',
      cost.bag ? `−${cost.bag} л` : '',
      cost.fuel ? `−${cost.fuel} л топлива` : '',
    ].filter(Boolean).join(' · ');
    const cls = [ch.c.rizz ? 'rizz' : '', ch.c.kb ? 'kb' : '', ch.ok && ch.c.hot ? 'hot' : '', ch.c.cls || ''].filter(Boolean).join(' ');
    return `<button class="choice ${cls}" data-choice="${ch.idx}" ${ch.ok ? '' : 'disabled'} title="${ch.reason || ''}">
      <b>${ch.c.label}</b>
      <small>${ch.c.sub || ''}</small>
      ${costStr ? `<span class="cost">${costStr}</span>` : ''}
      ${ch.ok ? '' : `<span class="cost lock">🔒 ${ch.reason}</span>`}
    </button>`;
  }).join('');

  el.choices.querySelectorAll('[data-choice]').forEach((b) => {
    b.addEventListener('click', () => choose(+b.dataset.choice));
  });

  if (ev.tag === 'danger' || ev.tag === 'weird' || ev.love){
    el.screenBody.classList.remove('glitch');
    el.cardTitle.classList.remove('glitch');
    void el.cardTitle.offsetWidth;
    el.cardTitle.classList.add('glitch');
  }
  if (S.eventToast) toast(S.eventToast.text, S.eventToast.cls);
  renderAll();
}

/* =====================================================================
   ВЫБОР
   ===================================================================== */
function choose(idx){
  if (busy || mg.active) return;
  const extra = idx >= 1000 ? madChoices(S)[idx - 1000] : null;
  busy = true;

  let out = {}, pay = [];
  if (extra){
    const res = extra.run(S);
    applyEffects(S, res.effects);
    out = res;
    addLog(S, `▸ ${extra.label}`, 'hi');
    if (res.log) addLog(S, res.log, '');
    if (res.mem) S.mem67 += res.mem;
    A.sfx.rizz();
    toast('РИЗЗ!', 'weird');
    renderer.float('РИЗЗ', '#d7a4ff');
  } else {
    const choice = S.currentEvent.choices[idx];
    if (!choice){ busy = false; return; }
    const r = resolveChoice(S, idx);
    out = r.out; pay = r.pay;
    if (choice.rizz){ A.sfx.rizz(); toast('РИЗЗ!', 'weird'); renderer.float('РИЗЗ', '#d7a4ff'); }
  }

  renderer.addShake(7);
  (out.toasts || []).slice(0, 2).forEach((t) => {
    const str = String(t);
    const [txt, cls] = str.includes('|') ? str.split('|').map((x) => x.trim()) : [str, ''];
    toast(txt, cls || '');
  });
  // реплика персонажа из выбора
  if (out.say && out.say.length === 2){
    say(S, out.say[0], out.say[1]);
    setSpeaker(out.say[0] === 'alien' ? 'alien' : out.say[0]);
    flashScreen('#4fd0ff', 140);
  }

  el.cardTag.textContent = 'ИТОГ';
  el.cardTag.className = 'tag';
  el.cardTitle.textContent = extra ? extra.label : S.currentEvent.choices[idx].label;
  clearInterval(typeTimer);
  el.cardText.innerHTML = out.log || '…';
  el.narr.textContent = '';
  el.choices.innerHTML = '<div style="color:#8e9ab5;font-size:.8em">Смотрим, что стало с пятилитрухой…</div>';
  renderAll();
  busy = false;
  setTimeout(afterChoice, 1600);
}

function afterChoice(){
  const loss = checkLoss(S);
  if (loss){ showEnd(); return; }
  if (S.currentEvent && S.currentEvent.final){
    winRun(S);
    renderer.addShake(12);
    flashScreen('#ffe9b0', 350);
    toast('АЛЬФА-ЦЕНТАВРА', 'good');
    setTimeout(showEnd, 1400);
    return;
  }
  const kind = attachMinigame(S);
  if (kind) runTransit(kind);
  else startTurn();
}

/* =====================================================================
   ПЕРЕГОННАЯ МИНИ-ИГРА
   ===================================================================== */
function runTransit(kind){
  el.cardTag.textContent = 'В ПУТИ';
  el.cardTag.className = 'tag good';
  el.cardTitle.textContent = 'ЧТО-ТО ПРОИСХОДИТ НА ПЕРЕГОНЕ';
  clearInterval(typeTimer);
  el.cardText.innerHTML = 'Нужно поработать руками. Или не руками — но быстро.';
  el.narr.textContent = '';
  el.choices.innerHTML = '';
  renderAll();

  mg.start(kind, (res) => {
    applyTransitResult(kind, res);
    renderAll();
    setTimeout(() => {
      if (checkLoss(S)){ showEnd(); return; }
      startTurn();
    }, 1500);
  });
}

function applyTransitResult(kind, res){
  const g = res.grade, good = g === 'perfect', mid = g === 'good';
  const H = 128;
  if (kind === 'tap'){
    if (good){ applyEffect(S, { kind: 'bag', delta: +1.6 }); applyEffect(S, { kind: 'grad', delta: +5 }); S.mem67 += 3; }
    else if (mid){ applyEffect(S, { kind: 'bag', delta: +0.6 }); S.mem67 += 1; }
    else applyEffect(S, { kind: 'bag', delta: -0.7, why: 'перетряхнули' });
  } else if (kind === 'rhythm'){
    if (good){ applyEffect(S, { kind: 'speed', delta: +1.2 }); applyEffect(S, { kind: 'grad', delta: +8 }); S.mem67 += 4; }
    else if (mid){ applyEffect(S, { kind: 'speed', delta: +0.5 }); S.mem67 += 2; }
    else applyEffect(S, { kind: 'kgb', delta: +8 });
  } else if (kind === 'pour'){
    if (good){ applyEffect(S, { kind: 'bag', delta: +1.0 }); applyEffect(S, { kind: 'vmen', delta: +6 }); }
    else if (mid){ applyEffect(S, { kind: 'bag', delta: +0.3 }); }
    else applyEffect(S, { kind: 'bag', delta: -1.0, why: 'разлили' });
  } else if (kind === 'dock'){
    if (good){ applyEffect(S, { kind: 'speed', delta: +0.8 }); applyEffect(S, { kind: 'fuel', delta: +5 }); S.mem67 += 3; }
    else if (mid){ applyEffect(S, { kind: 'fuel', delta: +2 }); S.mem67 += 1; }
    else { applyEffect(S, { kind: 'fuel', delta: -3 }); applyEffect(S, { kind: 'temp', delta: -4 }); }
  } else {
    if (good){ applyEffect(S, { kind: 'alien', delta: +16 }); applyEffect(S, { kind: 'rizz', delta: +8 }); applyEffect(S, { kind: 'mad', delta: +8 }); }
    else if (mid){ applyEffect(S, { kind: 'alien', delta: +7 }); applyEffect(S, { kind: 'mad', delta: +4 }); }
    else applyEffect(S, { kind: 'alien', delta: -6 });
  }
  addLog(S, `Мини-игра «${res.text || kind}»: ${good ? 'идеально' : mid ? 'нормально' : 'не вышло'}.`, good ? 'good' : mid ? '' : 'bad');
  toast(good ? 'ИДЕАЛЬНО!' : mid ? 'НОРМАЛЬНО' : 'НЕ ВЫШЛО', good ? 'good' : mid ? '' : 'bad');
  if (good) { renderer.addShake(10); flashScreen('#ffe9b0', 120); }
  A.sfx.jump();
  void H;
}

/* =====================================================================
   ДЕЙСТВИЯ
   ===================================================================== */
function doAction(id){
  if (busy || S.phase === 'over' || mg.active) return;
  const all = [...ACTIONS, ...inventoryActions(S)];
  const act = all.find((a) => a.id === id);
  if (!act || (act.avail && !act.avail(S))) return;
  busy = true;
  act.run(S, {
    minigame: (kind, cb) => { mg.start(kind, cb); },
    toast,
  });
  renderer.addShake(4);
  renderAll();
  busy = false;
  if (S.pending === null && S.phase === 'event') renderActions();
}

function doTravel(kind){
  if (busy || S.phase === 'over' || mg.active) return;
  if (kind === 'full'){
    if (S.bag < 2.6){ toast('НА ПОЛНЫЙ ХОД НЕ ХВАТИТ БАГБИРА', 'bad'); return; }
    applyEffect(S, { kind: 'bag', delta: -2.5 });
    applyEffect(S, { kind: 'vmen', delta: -6 });
    applyEffect(S, { kind: 'speed', delta: +1.0 });
    applyEffect(S, { kind: 'mad', delta: +5 });
    addLog(S, 'ПОЛНЫЙ ХОД: в бак пошло больше обычного.', 'hi');
    renderer.addShake(14);
    toast('ПОЛНЫЙ ХОД', 'good');
  } else if (kind === 'drift'){
    applyEffect(S, { kind: 'speed', delta: -0.25 });
    applyEffect(S, { kind: 'vmen', delta: +4 });
    applyEffect(S, { kind: 'bag', delta: +0.3 });
    applyEffect(S, { kind: 'mad', delta: -4 });
    addLog(S, 'Дрейф на инерции. Вагон идёт тихо, багбир почти не тратится.', '');
  } else {
    applyEffect(S, { kind: 'speed', delta: +0.15 });
  }
  renderAll();
  startTurn();
}

/* =====================================================================
   ХОД
   ===================================================================== */
function startTurn(){
  const prevStation = S.stationIdx;
  const r = beginTurn(S);
  renderAll();
  if (r.done || S.over){ showEnd(); return; }
  if (S.stationIdx > prevStation) A.sfx.station();
  else if (Math.random() < 0.25) A.sfx.horn();
  A.setTrainSpeed(clamp(S.speed / 4, 0.4, 2.4));

  // «бредовые» вставки на перегоне
  const lvl = madLevel(S.mad);
  if (lvl >= 3 && Math.random() < 0.3){
    renderer.float(['67', 'ОНА ЗДЕСЬ', 'ХВАТИТ?', 'БОТОХУЕТА'][(Math.random() * 4) | 0], '#b070ff');
  }
  if (S.grad > 70 && Math.random() < 0.35){ toast('67', ''); A.sfx.mem67(); }
  if (lvl >= 4 && Math.random() < 0.3) flashScreen('#2a4a6a', 180);

  showEvent(r.event, S.currentChoices || []);
  renderer.addShake(5);
}

/* =====================================================================
   ЭКРАНЫ
   ===================================================================== */
const MEME_STRIP = [
  'assets/img-m26.jpg', 'assets/img-m28.jpg', 'assets/img-photo43.jpg',
  'assets/img-boto-2.webp', 'assets/img-channels.jpg', 'assets/img-m29.jpg',
  'assets/img-photo46.jpg', 'assets/img-boto-3.webp', 'assets/img-portrait-a.jpg',
  'assets/img-boto-1.webp', 'assets/img-m27.jpg',
];

function showScreen(html){ el.screenBody.innerHTML = html; el.screen.classList.add('on'); }
function hideScreen(){ el.screen.classList.remove('on'); }

function screenMenu(){
  showScreen(`
    <div class="big-emoji">🚂🍾</div>
    <h1>ПЯТИЛИТРУХА <span class="amber">БАГБИРА</span></h1>
    <p class="lede">Купе советского электропоезда. За окном межзвёздная среда.
    В купе <b>Сурдин</b>, <b>научпопный советский алкаш</b> и <b>одна пятилитруха</b>.
    Вопрос рейса ровно один: <b>ХВАТИТ ЛИ?</b></p>

    <div class="meme-frame">${MEME_STRIP.map((m) => `<img src="${m}" alt="" loading="lazy">`).join('')}</div>

    <div class="epi">«До Альфа-Центавры 4,1 светового года. Двигатель у нас на багбире.
    Так что вопрос не философский, а чисто топливный». — Сурдин</div>

    <h2>КАК ИГРАТЬ</h2>
    <ul class="tips">
      <li>Читай, что происходит, и <b>выбирай вариант</b>. Каждый выбор что-то меняет.</li>
      <li>Между событиями жми <b>действия</b>: хлебнуть, залить в бак, <b>ТРЯХНУТЬ БУТЫЛЬ</b>, поспать.</li>
      <li>Потом <b>🚂 ЕДЕМ ДАЛЬШЕ</b> — поезд едет, багбир уходит, случается новое событие.</li>
      <li>Иногда в перегоне выпадает <b>мини-игра</b>: тапай по бутылке, лови ритм «67», наливай до метки.</li>
      <li><b>🌀 БРЕДОМЕТР</b> растёт вместе с градусом. Чем он выше, тем страннее рассказчик —
      и тем реальнее <b>та, что стоит за окном</b>. При очень высоком бредометре её можно позвать в купе.</li>
      <li>Проиграть можно так: кончился багбир · стал слишком трезв · КГБ-метр 100 · замёрз · не успел за 24 перегона.</li>
    </ul>
    <div class="btnrow">
      <button class="btn" id="go">🚂 НАЧАТЬ РЕЙС</button>
      <button class="btn ghost" id="go-rand">🎲 ДРУГОЙ РЕЙС (случайное семя)</button>
    </div>
  `);
  $('#go').addEventListener('click', () => startRun(Date.now() >>> 0));
  $('#go-rand').addEventListener('click', () => startRun((Math.random() * 0xffffffff) >>> 0));
}

function screenEnd(){
  const o = S.over || {};
  const sum = summary(S);
  const win = o.id === 'win';
  const love = !!o.love;

  const rankHtml = win
    ? `<div class="rank">${o.rank}<small>${o.grade}${love ? ' · инопланетная линия пройдена' : ' · ' + sum.prob + '% выживаемости пятилитрухи'}</small></div><p>${o.comment}</p>`
    : `<div class="rank"><span style="color:var(--red)">РЕЙС ПРЕРВАН</span><small>пройдено ${((sum.dist / TOTAL_DIST) * 100).toFixed(0)}% маршрута</small></div>`;

  showScreen(`
    <div class="big-emoji">${o.emoji || '🚂'}</div>
    <h1>${win ? '<span class="amber">' : '<span style="color:var(--red)">'}${o.title}</span></h1>
    <p class="lede">${o.text || ''}</p>
    ${rankHtml}
    <div class="epi">${o.epi || ''}</div>

    <h2>ПРОТОКОЛ РЕЙСА</h2>
    <div class="kv">
      <div><small>Литров осталось</small><b>${sum.bagLeft.toFixed(1).replace('.', ',')} л</b></div>
      <div><small>Выпито за рейс</small><b>${sum.drank.toFixed(1).replace('.', ',')} л</b></div>
      <div><small>Сожжено в баке</small><b>${sum.fuelled.toFixed(1).replace('.', ',')} л</b></div>
      <div><small>Перегонов</small><b>${sum.turn} / ${MAX_TURNS}</b></div>
      <div><small>Мемов «67»</small><b>${sum.mem67}</b></div>
      <div><small>Ризз-очков</small><b>${sum.rizz}</b></div>
      <div><small>Бредометр в конце</small><b>${Math.round(sum.mad)}/100 · ${madInfo(sum.mad).label}</b></div>
      <div><small>Она заметила</small><b>${Math.round(sum.alien)}/100</b></div>
    </div>

    <div class="meme-frame">${MEME_STRIP.map((m) => `<img src="${m}" alt="" loading="lazy">`).join('')}</div>
    ${love ? `<h2>ФОТОГРАФИЯ С РЕЙСА</h2>
      <div class="meme-frame"><img src="assets/img-portrait-b.jpg" alt="она" style="width:clamp(160px,22vw,260px);aspect-ratio:auto;transform:none"></div>
      <p style="text-align:center;color:#a9e7ff">Она настоящая. Сурдин всё ещё спорит с этим.</p>` : ''}

    <div class="btnrow">
      <button class="btn" id="again">🔁 ЕЩЁ РЕЙС</button>
      <button class="btn ghost" id="menu">📋 В МЕНЮ</button>
      <button class="btn ghost" id="share">📢 ПОХВАСТАТЬСЯ</button>
    </div>
  `);
  A.stopMusic();
  if (win){ A.sfx.win(); A.music('soviet', 0.5); }
  else { A.sfx.fail(); A.music('space', 0.35); }

  $('#again').addEventListener('click', () => startRun((Math.random() * 0xffffffff) >>> 0));
  $('#menu').addEventListener('click', () => { hideScreen(); screenMenu(); });
  $('#share').addEventListener('click', (e) => {
    const txt = win
      ? `Я доехал до Альфа-Центавры и получил «${o.rank}» (${o.grade}). Осталось ${sum.bagLeft.toFixed(1)} л багбира. Бредометр: ${Math.round(sum.mad)}/100. Мемов «67»: ${sum.mem67}.`
      : `Я не доехал: ${o.title}. Осталось ${sum.bagLeft.toFixed(1)} л, пройдено ${((sum.dist / TOTAL_DIST) * 100).toFixed(0)}%. Бредометр: ${Math.round(sum.mad)}/100.`;
    navigator.clipboard?.writeText(txt + ' — #ПятилитрухаБагбира').then(
      () => { e.target.textContent = '✔ СКОПИРОВАНО'; },
      () => { e.target.textContent = '✖ НЕ ВЫШЛО'; },
    );
  });
}

function showEnd(){
  if (!S.over) winRun(S);
  screenEnd();
}

/* =====================================================================
   СТАРТ / РЕСТАРТ
   ===================================================================== */
function startRun(seed){
  seedRng(seed);
  mg.abort();
  clearInterval(typeTimer);
  S = createState(seed);
  addLog(S, `Рейс №67. Семя: ${seed.toString(16).toUpperCase()}. Пятилитруха на месте.`, 'hi');
  addTicker(S, 'Машинист: «Поехали. Пятилитруха на месте? Значит, доедем».');
  say(S, 'sur', 'До Альфа-Центавры 4,1 светового года. Багбира — пять литров. Считайте сами.');
  say(S, 'vas', 'Я посчитал. Не хватит. Но поехали.');
  hideScreen();
  busy = false;
  buildChips();
  buildMeters();
  renderAll();
  S.turn = 0;
  startTurn();
  A.unlock();
  A.setTrainSpeed(1.1);
  A.music('space', 0.5);
  A.sfx.station();
}

/* =====================================================================
   ОБРАБОТЧИКИ
   ===================================================================== */
window.addEventListener('keydown', (e) => {
  if (mg.active) return;
  const k = e.key.toLowerCase();
  if (k === 'r' && !e.ctrlKey && !e.metaKey && !el.screen.classList.contains('on')){
    startRun((Math.random() * 0xffffffff) >>> 0);
    return;
  }
  if (k === 'escape'){ el.drawer.classList.remove('on'); return; }
  if (k === 'ж' || k === ';') doTravel('leg');
  if (k === 'ф' || k === 'a') doTravel('full');
  if (k === 'и' || k === 'b') doTravel('drift');
  const n = parseInt(k, 10);
  if (n >= 1 && n <= 9 && S.phase !== 'over' && !mg.active){
    const a = [...ACTIONS, ...inventoryActions(S)].find((x) => x.key === String(n));
    if (a) doAction(a.id);
  }
});

el.details.addEventListener('click', () => {
  const on = el.drawer.classList.toggle('on');
  el.details.textContent = on ? '▸ скрыть' : '▾ подробности';
});
el.drawerClose.addEventListener('click', () => {
  el.drawer.classList.remove('on');
  el.details.textContent = '▾ подробности';
});

/* телеприёмник */
const VP = [
  '...расстояние до Альфа-Центавры — 4,1 светового года. Крикните «эй!» — ответ придёт через восемь лет.',
  'Служебный вагон сообщает: расход багбира на перегоне — больше литра. Это, товарищи, много.',
  'Исследования показывают: 67% пассажиров считают, что «на донышке ещё есть».',
  'Учёные выяснили: пятилитровая ёмкость в невесомости ведёт себя как жидкостный маятник.',
  'Прогноз погоды в межзвёздной среде: везде минус, местами очень минус.',
  'Если пятилитруха кончилась раньше Альфы — вы не рассчитали маршрут, а не выпивку.',
  'Научный факт: при скорости 0,67 c вы не постареете. Багбир, к сожалению, всё равно кончится.',
  'Внимание: за окном может наблюдаться оптический обман в виде женской фигуры. Это норма.',
];
let vpIdx = 0;
setInterval(() => {
  if (el.vpText) el.vpText.textContent = VP[vpIdx++ % VP.length];
}, 13000);
el.vpText.textContent = VP[0];

/* звук */
A.restoreMute();
el.sound.addEventListener('click', () => {
  A.unlock();
  const m = !A.isMuted();
  A.setMuted(m);
  el.sound.textContent = m ? '🔇' : '🔊';
  el.sound.classList.toggle('off', m);
});
window.addEventListener('pointerdown', () => A.unlock(), { once: true });
if (A.isMuted()){ el.sound.textContent = '🔇'; el.sound.classList.add('off'); }

/* тикер */
setInterval(() => {
  if (S.phase === 'over') return;
  addTicker(S, TICKER_LINES[(Math.random() * TICKER_LINES.length) | 0]);
  renderTicker();
}, 9000);

/* =====================================================================
   ОТЛАДОЧНЫЙ API
   ===================================================================== */
window.bagbier = {
  get state(){ return S; },
  get summary(){ return summary(S); },
  newRun: (seed) => startRun((seed ?? (Math.random() * 0xffffffff)) >>> 0),
  travel: (kind = 'leg') => doTravel(kind),
  act: (id) => doAction(id),
  choose: (i) => choose(i),
  actions: () => [...ACTIONS, ...inventoryActions(S)].map((a) => ({ id: a.id, key: a.key, name: a.name, avail: a.avail ? a.avail(S) : true })),
  choices: () => Array.from(el.choices.querySelectorAll('[data-choice]')).map((b, i) => ({
    label: lastChoiceLabels[i] || (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    ok: !b.disabled,
    reason: b.title || '',
  })),
  screen: () => el.screen.classList.contains('on'),
  screenText: () => el.screenBody.textContent.replace(/\s+/g, ' ').trim(),
  cardText: () => `${el.cardTag.textContent} | ${el.cardTitle.textContent}`,
  narrator: () => el.narr.textContent,
  narrative: () => ({ title: el.cardTitle.textContent, text: el.cardText.textContent, speaker: el.spName.textContent, narrator: el.narr.textContent }),
  minigame: () => (mg.active ? $('#mg-title').textContent : null),
  minigameModel: () => mg.mg,
  build: BUILD,
  mad: () => ({ value: S.mad, label: madInfo(S.mad).label }),
  madChoices: () => madChoices(S).map((m) => m.label),
  /** перерисовать текущее событие вместе с «бредовыми» вариантами */
  refresh: () => { if (S.currentEvent) showEvent(S.currentEvent, S.currentChoices || []); },
  /** подменить состояние (только для тестов) */
  setTestState: (st) => { S = st; },
  menu: () => screenMenu(),
  forceEnd: (win = true) => {
    if (win){ S.dist = TOTAL_DIST; winRun(S); } else { checkLoss(S); }
    if (!S.over) winRun(S);
    screenEnd();
    return S.over;
  },
  version: '2.0.0',
};

/* =====================================================================
   СТАРТ
   ===================================================================== */
A.preload();
buildChips();
buildMeters();
renderAll();
setSpeaker('narr');
screenMenu();
A.decodeAll?.();
console.log(`ПЯТИЛИТРУХА БАГБИРА · сборка ${BUILD}`);
window.bagbier.build = BUILD;
if (el.build) el.build.textContent = 'сборка ' + BUILD;

// сверяем сборку с той, что лежит на сервере: ловим кэш браузера
try {
  const loc = globalThis.location;
  if (loc && String(loc.protocol || '').startsWith('http') && typeof fetch === 'function'){
    fetch('/__build?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : null))
      .then((disk) => {
        if (disk && disk.trim() && disk.trim() !== BUILD){
          fatal(`Страница работает на старом коде (в браузере ${BUILD}, на диске ${disk.trim()}). Нажми Ctrl+F5.`);
        }
      })
      .catch(() => {});
  }
} catch (_){ /* не в браузере — проверка не нужна */ }
