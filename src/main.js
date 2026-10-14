/* =====================================================================
   ПЯТИЛИТРУХА БАГБИРА — главный модуль
   ===================================================================== */

import { Renderer } from './render.js';
import { Minigames } from './minigames.js';
import * as A from './audio.js';
import {
  createState, seedRng, beginTurn, resolveChoice, applyEffect, applyEffects,
  ACTIONS, inventoryActions, checkLoss, winRun, summary, attachMinigame,
  currentStationName, nextStationName, STATIONS, ITEMS, TOTAL_DIST, MAX_TURNS,
  clamp, addLog, addTicker, say,
} from './game.js';
import { TICKER_LINES } from './events.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ------------------------- ссылки на DOM ------------------------- */
const el = {
  meters: $('#meters'),
  crew: $('#crew'),
  inv: $('#inv'),
  mods: $('#mods'),
  actions: $('#actions'),
  log: $('#log'),
  card: $('#card'),
  cardTag: $('#card-tag'),
  cardNum: $('#card-num'),
  cardTitle: $('#card-title'),
  cardText: $('#card-text'),
  choices: $('#choices'),
  place: $('#place'),
  toasts: $('#toasts'),
  screen: $('#screen'),
  screenBody: $('#screen-body'),
  vpText: $('#vp-text'),
  vpTitle: $('#vp-title'),
  vp: $('#viewport'),
  hush: $('#vp-hush'),
  routeNext: $('#route-next'),
  routeLeft: $('#route-left'),
  routeFill: $('#route-fill'),
  crewList: $('#crew-list'),
  ticker: $('#ticker'),
  statTurns: $('#stat-turns'),
  statHours: $('#stat-hours'),
  seed: $('#seed'),
  sound: $('#btn-sound'),
  flash: $('#flash'),
};

/* ------------------------- шины ------------------------- */
const renderer = new Renderer($('#scene'));
const mg = new Minigames(renderer);

let S = createState(1);
let busy = false;

/* =====================================================================
   ТОСТЫ / ЭФФЕКТЫ
   ===================================================================== */
function toast(text, cls = ''){
  const d = document.createElement('div');
  d.className = 'toast ' + cls;
  d.textContent = text;
  el.toasts.appendChild(d);
  setTimeout(() => d.remove(), 2500);
  if (el.toasts.children.length > 5) el.toasts.firstChild.remove();
}

function flashScreen(col = '#fff', ms = 90){
  el.flash.style.background = col;
  el.flash.classList.add('on');
  setTimeout(() => el.flash.classList.remove('on'), ms);
}

/* =====================================================================
   ОТРИСОВКА ИНТЕРФЕЙСА
   ===================================================================== */
const METERS = [
  { id: 'bag',  name: '🍾 БАГБИР',    max: 60, unit: ' л', dec: 1, warn: (v) => v < 10, crit: (v) => v < 5, c1: '#c98a1e', c2: '#ffd166', glow: 'rgba(255,209,102,.6)' },
  { id: 'grad', name: '🌡️ ГРАДУС',    max: 100, unit: '°', dec: 0, warn: (v) => v < 12, crit: (v) => v < 5, c1: '#8a2b4f', c2: '#ff6b9a', glow: 'rgba(255,107,154,.5)' },
  { id: 'vmen', name: '🧠 ВМЕНЯЕМОСТЬ', max: 100, unit: '', dec: 0, warn: (v) => v < 25, crit: (v) => v < 12, c1: '#1f7a5c', c2: '#54d98c', glow: 'rgba(84,217,140,.5)' },
  { id: 'temp', name: '🔥 ТЕПЛО',     max: 100, unit: '', dec: 0, warn: (v) => v < 25, crit: (v) => v < 12, c1: '#8a3a12', c2: '#ff9a3d', glow: 'rgba(255,154,61,.5)' },
  { id: 'kgb',  name: '🕵️ КГБ-МЕТР',  max: 100, unit: '', dec: 0, inv: true, warn: (v) => v > 65, crit: (v) => v > 85, c1: '#5a2b7a', c2: '#b070ff', glow: 'rgba(176,112,255,.5)' },
  { id: 'fuel', name: '⛽ БАК',       max: 26, unit: ' л', dec: 1, warn: (v) => v < 4, crit: (v) => v < 1.5, c1: '#1f4f7a', c2: '#5fd7ff', glow: 'rgba(95,215,255,.5)' },
  { id: 'speed', name: '💨 ХОД',      max: 12, unit: '', dec: 1, c1: '#2b6b7a', c2: '#8ef0e0', glow: 'rgba(142,240,224,.4)' },
  { id: 'rizz', name: '✨ РИЗЗ',      max: 60, unit: '', dec: 0, c1: '#6b3aa8', c2: '#d7a4ff', glow: 'rgba(215,164,255,.55)' },
];

function buildMeters(){
  el.meters.innerHTML = METERS.map((m) => `
    <div class="meter" data-m="${m.id}">
      <div class="meter-row">
        <span class="meter-name">${m.name}</span>
        <span class="meter-val"><b data-v="${m.id}">0</b><small>${m.unit}</small></span>
      </div>
      <div class="track"><i style="--c1:${m.c1};--c2:${m.c2};--glow:${m.glow}"></i></div>
    </div>`).join('');
}

function renderMeters(){
  for (const m of METERS){
    const wrap = el.meters.querySelector(`[data-m="${m.id}"]`);
    if (!wrap) continue;
    const bar = wrap.querySelector('i');
    const val = wrap.querySelector(`[data-v="${m.id}"]`);
    const v = S[m.id] ?? 0;
    const pct = clamp((v / m.max) * 100, 0, 100);
    bar.style.width = pct + '%';
    val.textContent = m.dec ? v.toFixed(m.dec).replace('.', ',') : Math.round(v);
    wrap.classList.toggle('warn', !!(m.warn && m.warn(v)));
    wrap.classList.toggle('crit', !!(m.crit && m.crit(v)));
  }
}

const FACES = {
  sur: { img: 'assets/img-portrait-a.jpg', emoji: '🧑‍🔬', name: 'СУРДИН', role: 'астроном · научпоп' },
  vas: { img: 'assets/img-portrait-b.jpg', emoji: '🧔', name: 'ВАСЯ', role: 'научпопный алкаш' },
};

function renderCrew(){
  const g = S.grad;
  const mood = g > 78 ? '🥴' : g > 46 ? '😄' : g > 20 ? '🙂' : g > 8 ? '🥶' : '🧊';
  el.crew.innerHTML = Object.entries(FACES).map(([k, f]) => `
    <div class="crew-card ${S.voice[k] ? 'speaking' : ''}" title="${f.name}">
      <div class="face" style="background-image:url('${f.img}')"><span style="opacity:${S.deadPortrait ? 0 : 1}">${f.emoji}</span></div>
      <span class="mood">${mood}</span>
      <div class="nom"><b>${f.name}</b><small>${f.role}</small></div>
    </div>`).join('');
}

function renderInv(){
  const keys = Object.keys(ITEMS);
  const slots = [];
  for (const k of keys){
    const n = S.items[k] || 0;
    slots.push(`<div class="slot ${n ? 'filled' : ''}" title="${ITEMS[k].name}: ${ITEMS[k].desc}">
      ${n ? `<span>${ITEMS[k].emoji}</span><span class="cnt">×${n}</span>` : '<span style="opacity:.18">·</span>'}
    </div>`);
  }
  while (slots.length % 4) slots.push('<div class="slot"></div>');
  el.inv.innerHTML = slots.join('');
}

function renderMods(){
  const entries = Object.values(S.mods);
  if (!entries.length){ el.mods.innerHTML = '<span class="empty">чисто, как в вагоне-музее</span>'; return; }
  el.mods.innerHTML = entries.map((m) =>
    `<span class="chip ${m.kind}" title="${m.desc || ''}">${m.name} ${m.turns > 0 ? '·' + m.turns : ''}</span>`).join('');
}

function renderLog(){
  el.log.innerHTML = S.log.slice(0, 14)
    .map((l, i) => `<div class="n-${i} ${l.cls}">${l.text}</div>`).join('');
}

function renderTicker(){
  el.ticker.innerHTML = S.ticker.slice(0, 22).map((t) => `<div>${t}</div>`).join('');
}

function renderCrewList(){
  el.crewList.innerHTML = S.crew.slice(0, 10)
    .map((c) => `<li class="${c.dead ? 'dead' : ''}" style="opacity:${1 - Math.min(0.6, (S.turn - c.turn) * 0.05)}">
      <span class="who">${c.who}:</span><span class="what">«${c.what}»</span></li>`).join('');
}

function fmtTime(min){
  const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function renderRoute(){
  el.routeLeft.textContent = (TOTAL_DIST - S.dist).toFixed(2).replace('.', ',');
  el.routeFill.style.width = clamp((S.dist / TOTAL_DIST) * 100, 0, 100) + '%';
  el.routeNext.textContent = nextStationName(S);
  el.statTurns.textContent = `ХОД ${S.turn}/${MAX_TURNS}`;
  el.statHours.textContent = fmtTime(S.minutes);
  el.place.innerHTML = `● ${currentStationName(S)} <small>· перегон ${S.turn} из ${MAX_TURNS} · за окном ${S.dist.toFixed(2).replace('.', ',')} св. года</small>`;
}

function renderActions(){
  if (S.phase === 'over'){ el.actions.innerHTML = ''; return; }
  const acts = [...ACTIONS, ...inventoryActions(S)];
  const html = acts.map((a, i) => {
    const ok = a.avail ? a.avail(S) : true;
    return `<button class="act ${a.cls || ''}" data-act="${a.id}" ${ok ? '' : 'disabled'}>
      <span class="k">${a.key || ''}</span><b>${a.name}</b><small>${a.hint || ''}</small></button>`;
  }).join('');
  el.actions.innerHTML = html +
    `<button class="act next" data-travel="leg"><span class="k">Ж</span><b>🚂 ЕДЕМ ДАЛЬШЕ</b>
       <small>Следующий перегон. Бак тратится сам, печка греет. Одно событие в пути.</small></button>
     <button class="act next" data-travel="full"><span class="k">Ф</span><b>⚡ ПОЛНЫЙ ХОД</b>
       <small>−2,5 л багбира и −6 вменяемости, зато +2,2 к ходу. Иногда надо спешить.</small></button>
     <button class="act" data-travel="drift" style="grid-column:1/-1"><span class="k">И</span><b>🌌 ДРЕЙФ НА ИНЕРЦИИ</b>
       <small>−0,8 к ходу, но −0,3 л расхода багбира и +4 вменяемости. Вариант для экономии.</small></button>`;
  el.actions.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', () => doAction(b.dataset.act));
  });
  el.actions.querySelectorAll('[data-travel]').forEach((b) => {
    b.addEventListener('click', () => doTravel(b.dataset.travel));
  });
}

function renderAll(){
  renderMeters(); renderCrew(); renderInv(); renderMods();
  renderLog(); renderTicker(); renderCrewList(); renderRoute();
  renderActions();
  el.seed.textContent = S.seed.toString(16).toUpperCase().padStart(8, '0');
  // синхронизация сцены
  renderer.setBag(S.bag / 60);
  renderer.gradNorm = S.grad / 100;
  renderer.tempNorm = S.temp / 100;
  renderer.kgbNorm = S.kgb / 100;
  renderer.speedNorm = clamp(S.speed / 8, 0.05, 1.4);
  renderer.distNorm = S.dist / TOTAL_DIST;
}

/* =====================================================================
   КАРТОЧКА СОБЫТИЯ
   ===================================================================== */
function showEvent(ev, choices){
  S.phase = 'event';
  el.cardTag.textContent = tagName(ev.tag);
  el.cardTag.className = 'tag ' + (ev.tag || '');
  el.cardNum.textContent = `перегон ${S.turn} / ${MAX_TURNS}`;
  el.cardTitle.textContent = ev.title;
  el.cardText.innerHTML = ev.text;
  el.choices.innerHTML = choices.map((ch) => {
    const cost = ch.c.cost || {};
    const costStr = [
      cost.rizz ? `−${cost.rizz} ризз` : '',
      cost.bag ? `−${cost.bag} л` : '',
      cost.fuel ? `−${cost.fuel} л топлива` : '',
    ].filter(Boolean).join(' · ');
    return `<button class="choice ${ch.c.rizz ? 'rizz' : ''} ${ch.c.kb ? 'kb' : ''} ${ch.ok && ch.c.hot ? 'hot' : ''}"
      data-choice="${ch.idx}" ${ch.ok ? '' : 'disabled'} title="${ch.reason || ''}">
      <b>${ch.c.label}</b>
      <small>${ch.c.sub || ''}</small>
      ${costStr ? `<span class="cost">${costStr}</span>` : ''}
      ${ch.ok ? '' : `<small class="cost">🔒 ${ch.reason}</small>`}
    </button>`;
  }).join('');
  el.choices.querySelectorAll('[data-choice]').forEach((b) => {
    b.addEventListener('click', () => choose(+b.dataset.choice));
  });
  el.card.classList.remove('glitch');
  void el.card.offsetWidth;
  if (ev.tag === 'danger' || ev.tag === 'weird') el.card.classList.add('glitch');
  if (ev.who) say(S, ev.who, ev.title.toLowerCase() + '…');
  if (S.eventToast) toast(S.eventToast.text, S.eventToast.cls);
  renderAll();
}

function tagName(t){
  return { danger: '⚠ ОПАСНО', weird: '🌀 АНОМАЛИЯ', good: '✔ ХОРОШО', '': 'СОБЫТИЕ В ПУТИ' }[t] || 'СОБЫТИЕ В ПУТИ';
}

function choose(idx){
  if (busy || mg.active) return;
  busy = true;
  const choice = S.currentEvent.choices[idx];
  const res = resolveChoice(S, idx);
  if (choice.rizz){ A.sfx.rizz(); toast('РИЗЗ!', 'weird'); renderer.float('РИЗЗ', '#d7a4ff'); }
  renderer.addShake(6);
  (res.out.toasts || []).slice(0, 2).forEach((t) => {
    const str = String(t);
    const [txt, cls] = str.includes('|') ? str.split('|').map((x) => x.trim()) : [str, ''];
    toast(txt, cls || '');
  });

  // отображаем итог выбора
  el.cardTag.textContent = 'ИТОГ';
  el.cardTag.className = 'tag';
  el.cardTitle.textContent = choice.label;
  el.cardText.innerHTML = `${res.out.log || '…'}`;
  el.choices.innerHTML = '<div style="grid-column:1/-1;color:#8e9ab5;font-size:.8em">Смотрим, что стало с багбиром…</div>';
  renderAll();

  busy = false;
  setTimeout(() => afterChoice(), 1500);
}

function afterChoice(){
  const loss = checkLoss(S);
  if (loss){ showEnd(); return; }
  // финальное событие = приехали
  if (S.currentEvent && S.currentEvent.final){
    winRun(S);
    renderer.addShake(10);
    renderer.flash('#ffe9b0', 0.35);
    toast('АЛЬФА-ЦЕНТАВРА', 'good');
    setTimeout(() => showEnd(), 1200);
    return;
  }
  const kind = attachMinigame(S);
  if (kind){ runTransit(kind); return; }
  startTurn();
}

/* =====================================================================
   ПЕРЕГОННЫЕ МИНИ-ИГРЫ
   ===================================================================== */
function runTransit(kind){
  el.cardTag.textContent = 'В ПУТИ';
  el.cardTag.className = 'tag good';
  el.cardTitle.textContent = 'ЧТО-ТО ПРОИСХОДИТ НА ПЕРЕГОНЕ';
  el.cardText.innerHTML = 'Нужно подработать руками — и это не метафора.';
  el.choices.innerHTML = '';
  mg.start(kind, (res) => {
    applyTransitResult(kind, res);
    renderAll();
    setTimeout(() => {
      if (checkLoss(S)){ showEnd(); return; }
      startTurn();
    }, 1400);
  });
}

function applyTransitResult(kind, res){
  const g = res.grade;
  const good = g === 'perfect', mid = g === 'good';
  if (kind === 'shake'){
    if (good){
      applyEffect(S, { kind: 'bag', delta: +1.4 });
      applyEffect(S, { kind: 'grad', delta: +5 });
      applyEffect(S, { kind: 'speed', delta: +0.5 });
      S.mem67 += 3; addLog(S, 'Идеальная тряска в пути: осадок поднялся, объём вырос.', 'good');
      toast('ИДЕАЛЬНАЯ ТРЯСКА! +1,4 л', 'good'); renderer.float('+1,4 Л', '#7dffb0');
    } else if (mid){
      applyEffect(S, { kind: 'bag', delta: +0.5 }); S.mem67 += 1;
      addLog(S, 'Тряска удалась наполовину.', 'good');
    } else {
      applyEffect(S, { kind: 'bag', delta: -0.7, why: 'перетряхнули' });
      addLog(S, 'Перетряхнули. Половина ушла на стены вагона.', 'bad');
      toast('ПЕРЕТРЯХНУЛИ', 'bad'); renderer.addShake(12);
    }
  } else if (kind === 'rhythm'){
    if (good){
      applyEffect(S, { kind: 'speed', delta: +1.3 });
      applyEffect(S, { kind: 'grad', delta: +8 });
      S.mem67 += 4; addLog(S, 'Ритм «67» в тамбуре: вагон пошёл в такт и прибавил ходу.', 'good');
      toast('РИТМ 67! ХОД +1,3', 'good');
    } else if (mid){
      applyEffect(S, { kind: 'speed', delta: +0.6 }); S.mem67 += 2;
      addLog(S, 'Ритм поймали частично.', 'good');
    } else {
      applyEffect(S, { kind: 'kgb', delta: +8 });
      addLog(S, 'Стучали не в такт. Проснулся весь вагон и один человек в штатском.', 'bad');
      toast('НЕ В ТАКТ. ВСЕ СЛЫШАЛИ', 'bad');
    }
  } else if (kind === 'hold'){
    if (good || mid){
      applyEffect(S, { kind: 'bag', delta: +1.0 });
      applyEffect(S, { kind: 'vmen', delta: +6 });
      addLog(S, 'Уровень удержали: ни капли мимо.', 'good');
      toast('НИ КАПЛИ МИМО', 'good');
    } else {
      applyEffect(S, { kind: 'bag', delta: -1.2, why: 'не удержали' });
      addLog(S, 'Не удержали. Половина на столе, половина на Васе.', 'bad');
      toast('РАЗЛИЛИ', 'bad');
    }
  } else if (kind === 'dodge'){
    if (good){
      applyEffect(S, { kind: 'bag', delta: +2.2 });
      applyEffect(S, { kind: 'kgb', delta: -6 });
      S.mem67 += 3; addLog(S, 'Перегон прошли чисто: собрали три чужие пятилитрухи в тамбуре.', 'good');
      toast('ПЕРЕГОН ПРОЙДЕН ЧИСТО! +2,2 л', 'good');
    } else if (mid){
      applyEffect(S, { kind: 'bag', delta: +0.8 });
      applyEffect(S, { kind: 'temp', delta: -3 });
      addLog(S, 'Прошли перегон, но с пробоиной в обшивке.', '');
    } else {
      applyEffect(S, { kind: 'bag', delta: -1.0, why: 'авария на перегоне' });
      applyEffect(S, { kind: 'temp', delta: -9 });
      applyEffect(S, { kind: 'vmen', delta: -6 });
      addLog(S, 'Перегон был тяжёлым. Камни, холод, крики в тамбуре.', 'bad');
      toast('ТЯЖЁЛЫЙ ПЕРЕГОН', 'bad');
      renderer.addShake(18);
    }
  }
  A.sfx.jump();
}

/* =====================================================================
   ДЕЙСТВИЯ
   ===================================================================== */
function doAction(id){
  if (busy || S.phase === 'over' || mg.active) return;
  const all = [...ACTIONS, ...inventoryActions(S)];
  const act = all.find((a) => a.id === id);
  if (!act) return;
  if (act.avail && !act.avail(S)) return;
  busy = true;
  act.run(S, { minigame: (kind, cb) => { mg.start(kind, cb); }, toast });
  renderer.addShake(4);
  renderAll();
  busy = false;
}

function doTravel(kind){
  if (busy || S.phase === 'over' || mg.active) return;
  if (kind === 'full'){
    if (S.bag < 2.6){ toast('НА ПОЛНЫЙ ХОД НЕ ХВАТИТ БАГБИРА', 'bad'); return; }
    applyEffect(S, { kind: 'bag', delta: -2.5 });
    applyEffect(S, { kind: 'vmen', delta: -6 });
    applyEffect(S, { kind: 'speed', delta: +1.0 });
    addLog(S, 'ПОЛНЫЙ ХОД: в бак пошло больше обычного.', 'hi');
    renderer.addShake(14);
    toast('ПОЛНЫЙ ХОД', 'good');
  } else if (kind === 'drift'){
    applyEffect(S, { kind: 'speed', delta: -0.25 });
    applyEffect(S, { kind: 'vmen', delta: +4 });
    applyEffect(S, { kind: 'bag', delta: +0.3 });
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
  if (S.stationIdx > prevStation) A.sfx.station();                       // прибыли: гудок + дзинь
  else if (Math.random() < 0.25) A.sfx.horn();                           // просто гудок в пути
  A.setTrainSpeed(clamp(S.speed / 4, 0.4, 2.4));
  // мемные тосты на перегоне
  if (S.grad > 70 && Math.random() < 0.35){ toast('67', ''); A.sfx.mem67(); }
  if (Math.random() < 0.2){ renderer.float(['РИЗЗ', '67', 'БОТОХУЕТА', 'НАУЧНО'][(Math.random() * 4) | 0], '#d7a4ff'); }
  showEvent(r.event, S.currentChoices || []);
  renderer.addShake(5);
}

/* =====================================================================
   ЭКРАНЫ
   ===================================================================== */
const MEME_STRIP = [
  'assets/img-m26.jpg', 'assets/img-m28.jpg', 'assets/img-photo43.jpg',
  'assets/img-boto-2.webp', 'assets/img-channels.jpg', 'assets/img-m29.jpg',
  'assets/img-photo46.jpg', 'assets/img-boto-3.webp',
  'assets/img-boto-1.webp', 'assets/img-m27.jpg',
];

function showScreen(html){
  el.screenBody.innerHTML = html;
  el.screen.classList.add('on');
}
function hideScreen(){ el.screen.classList.remove('on'); }

function screenMenu(){
  showScreen(`
    <div class="big-emoji">🚂🍾</div>
    <h1>ПЯТИЛИТРУХА <span class="amber">БАГБИРА</span></h1>
    <p class="lede">Купе советского электропоезда. За окном — межзвёздная среда.
    В купе — <b>Сурдин</b> и <b>научпопный советский алкаш</b>.
    Вопрос рейса ровно один: <b>ХВАТИТ ЛИ ПЯТИЛИТРУХИ БАГБИРА, ЧТОБЫ ДОЛЕТЕТЬ ДО АЛЬФА-ЦЕНТАВРЫ?</b></p>

    <div class="meme-frame">${MEME_STRIP.map((m) => `<img src="${m}" alt="" loading="lazy">`).join('')}</div>

    <div class="epi">«До Альфа-Центавры — 4,1 светового года. Это 4,1 года, если бы вы летели светом,
    а не багбиром. Двигатель у нас, кстати, тоже на багбире». — Сурдин</div>

    <h2>ЧТО ТУТ ПРОИСХОДИТ</h2>
    <ul class="tips">
      <li>Поезд едет на багбире. <code>🍾 БАГБИР</code> — это и топливо, и выпивка, и смысл рейса.</li>
      <li>Ходы: каждый перегон — <b>24 перегона</b> до станции «АЛЬФА-ЦЕНТАВРА». Кончится багбир — кончится рейс.</li>
      <li><code>🌡️ ГРАДУС</code> даёт ход, но злит проводницу. <code>🧠 ВМЕНЯЕМОСТЬ</code> — не дай себе стать слишком трезвым.</li>
      <li><code>🕵️ КГБ-МЕТР</code> — за вами смотрят из зеркала. 100 — высадят на 67-м разъезде.</li>
      <li><code>✨ РИЗЗ</code> — открывает лучшие варианты в событиях. Набирается мемами, лекциями и наглостью.</li>
      <li>Мини-игры: <b>ТРЯСКА</b> (в ритме), <b>РИТМ «67»</b>, <b>УДЕРЖАНИЕ</b>, <b>ВАГОН-СКРОЛЛЕР</b> — за них дают литры.</li>
      <li>Всё, что нажимаешь: <code>1..6</code> — действия, <code>Ж</code>/<code>Ф</code>/<code>И</code> — ехать, <code>R</code> — новый рейс.</li>
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
  const rankHtml = win ? `
    <div class="rank">${o.rank}<small>${o.grade} · ${sum.prob}% выживаемости пятилитрухи</small></div>
    <p>${o.comment}</p>` : `
    <div class="rank"><span class="red">РЕЙС ПРЕРВАН</span><small>пройдено ${(sum.dist / TOTAL_DIST * 100).toFixed(0)}% маршрута</small></div>`;

  showScreen(`
    <div class="big-emoji">${o.emoji || '🚂'}</div>
    <h1>${win ? '<span class="amber">' : '<span class="red">'}${o.title}</span></h1>
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
      <div><small>Идеальных трясок</small><b>${sum.perfect}</b></div>
      <div><small>КГБ-метр в конце</small><b>${Math.round(sum.kgb)}</b></div>
    </div>

    <div class="meme-frame">${MEME_STRIP.map((m) => `<img src="${m}" alt="" loading="lazy">`).join('')}</div>

    <div class="btnrow">
      <button class="btn" id="again">🔁 ЕЩЁ РЕЙС</button>
      <button class="btn ghost" id="menu">📋 В МЕНЮ</button>
      <button class="btn ghost" id="share">📢 ПОХВАСТАТЬСЯ</button>
    </div>
  `);
  A.stopMusic();
  if (win){ A.sfx.win(); A.music('soviet', 0.5); }   // на финале — ретро-марш (CC0)
  else { A.sfx.fail(); A.music('space', 0.35); }

  $('#again').addEventListener('click', () => startRun((Math.random() * 0xffffffff) >>> 0));
  $('#menu').addEventListener('click', () => { hideScreen(); screenMenu(); });
  $('#share').addEventListener('click', (e) => {
    const txt = win
      ? `Я доехал до Альфа-Центавры и получил звание «${o.rank}» (${o.grade}). Осталось ${sum.bagLeft.toFixed(1)} л багбира из пятилитрухи. Мемов «67»: ${sum.mem67}. Ризз: ${sum.rizz}.`
      : `Я не доехал: ${o.title}. Осталось ${sum.bagLeft.toFixed(1)} л, пройдено ${(sum.dist / TOTAL_DIST * 100).toFixed(0)}% пути. Мемов «67»: ${sum.mem67}.`;
    navigator.clipboard?.writeText(txt + ' — #ПятилитрухаБагбира').then(
      () => { e.target.textContent = '✔ СКОПИРОВАНО'; },
      () => { e.target.textContent = '✖ НЕ ВЫШЛО'; },
    );
  });
}

function showEnd(){
  if (S.over) { screenEnd(); return; }
  const loss = checkLoss(S);
  if (!loss){ winRun(S); }
  screenEnd();
}

/* =====================================================================
   СТАРТ
   ===================================================================== */
function startRun(seed){
  seedRng(seed);
  S = createState(seed);
  S.voice = { sur: null, vas: null };
  addLog(S, `Рейс №67. Семя рейса: ${seed.toString(16).toUpperCase()}.`, 'hi');
  addTicker(S, 'Машинист: «Поехали. Пятилитруха на месте? Значит, доедем».');
  say(S, 'sur', 'До Альфа-Центавры 4,1 светового года. Багбира — пять литров. Считайте сами.');
  say(S, 'vas', 'Я посчитал. Не хватит. Но поехали.');
  hideScreen();
  busy = false;
  renderer.setBag(S.bag / 60);
  buildMeters();
  renderAll();
  // первое событие сразу
  S.turn = 0;
  startTurn();
  A.unlock();
  A.setTrainSpeed(1.1);
  A.music('space', 0.5);         // CC0-эмбиент межзвёздного перегона
  A.sfx.station();               // гудок отправления (CC0)
}

/* ------------------------- глобальные обработчики ------------------------- */
window.addEventListener('keydown', (e) => {
  if (mg.active) return;
  const k = e.key.toLowerCase();
  if (k === 'r' && !e.ctrlKey && !e.metaKey && el.screen.classList.contains('on') === false){
    startRun((Math.random() * 0xffffffff) >>> 0);
  }
  if (k === 'ж' || k === ';') doTravel('leg');
  if (k === 'ф' || k === 'a') doTravel('full');
  if (k === 'и' || k === 'b') doTravel('drift');
  const n = parseInt(k, 10);
  if (n >= 1 && n <= 6 && S.phase !== 'over' && !mg.active){
    const acts = [...ACTIONS, ...inventoryActions(S)];
    const a = acts.find((x) => x.key === String(n));
    if (a) doAction(a.id);
  }
});

/* ------------------------- телеприёмник ------------------------- */
const VP = [
  '...и снова о главном: расстояние до Альфа-Центавры — 4,1 светового года. То есть если бы вы крикнули «эй!» — ответ пришёл бы через восемь лет.',
  'Учёные выяснили: пятилитровая ёмкость в условиях невесомости ведёт себя как жидкостный маятник.',
  'Служебный вагон сообщает: расход багбира на перегоне — 1,02 литра. Это, товарищи, много.',
  'Исследования показывают: 67% пассажиров дальних рейсов считают, что «ещё есть немного на донышке».',
  'Прогноз погоды в межзвёздной среде: везде минус, местами очень минус.',
  'Совет от машиниста: если пятилитруха кончилась раньше Альфы — вы не рассчитали маршрут, а не выпивку.',
  'Внимание: в вагоне-музее выставлен «Багбир» 1974 года. Смотритель спит. Мы ни на что не намекаем.',
  'Научный факт: при скорости 0,67 c вы не постареете. Багбир, к сожалению, всё равно кончится.',
];

let vpIdx = 0;
function vpTick(){
  el.vpTitle.textContent = 'ТЕЛЕПРИЁМНИК «РАДИОТОЧКА»';
  el.vpText.textContent = VP[vpIdx % VP.length];
  vpIdx++;
}
setInterval(vpTick, 14000);
el.hush.addEventListener('click', () => {
  el.vp.classList.toggle('hushed');
  const h = el.vp.classList.contains('hushed');
  el.hush.textContent = h ? '🔈' : '🔇';
  A.setAmbienceVolume(h ? 0.12 : 0.5);
});

/* ------------------------- звук ------------------------- */
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

/* ------------------------- тикер ------------------------- */
setInterval(() => {
  if (S.phase === 'over') return;
  addTicker(S, TICKER_LINES[(Math.random() * TICKER_LINES.length) | 0]);
  renderTicker();
}, 9000);

/* ------------------------- старт ------------------------- */
A.preload();
buildMeters();
renderAll();
screenMenu();
A.decodeAll?.();

/* ---------------------------------------------------------------------
   Отладочный API: доступен из консоли браузера как window.bagbier
   Примеры:
     bagbier.newRun()          — начать новый рейс
     bagbier.travel('leg')     — проехать перегон ('leg' | 'full' | 'drift')
     bagbier.choose(0)         — выбрать вариант события
     bagbier.act('pour')       — выполнить действие хода
     bagbier.state             — текущее состояние (только чтение)
   --------------------------------------------------------------------- */
window.bagbier = {
  get state(){ return S; },
  get summary(){ return summary(S); },
  newRun: (seed) => startRun((seed ?? (Math.random() * 0xffffffff)) >>> 0),
  travel: (kind = 'leg') => doTravel(kind),
  act: (id) => doAction(id),
  choose: (i) => choose(i),
  actions: () => [...ACTIONS, ...inventoryActions(S)].map((a) => ({ id: a.id, key: a.key, name: a.name, avail: a.avail ? a.avail(S) : true })),
  screen: () => el.screen.classList.contains('on'),
  screenText: () => el.screenBody.textContent.replace(/\s+/g, ' ').trim(),
  cardText: () => `${el.cardTag.textContent} | ${el.cardTitle.textContent}`,
  choices: () => Array.from(el.choices.querySelectorAll('[data-choice]')).map((b) => ({
    label: (b.textContent || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '',
    ok: !b.disabled,
    reason: b.title || '',
  })),
  choiceNodes: () => el.choices.querySelectorAll('[data-choice]'),
  choiceProbe: () => {
    const all = el.choices.querySelectorAll('button');
    return {
      buttons: all.length,
      allChildren: el.choices.children.length,
      datas: all.map((b) => JSON.stringify(b.dataset)),
      innerLen: el.choices.innerHTML.length,
    };
  },
  minigame: () => (mg.active ? $('#mg-title').textContent : null),
  menu: () => screenMenu(),
  /** принудительно показать финальный экран (для тестов и отладки) */
  forceEnd: (win = true) => {
    if (win){ S.dist = TOTAL_DIST; winRun(S); } else { checkLoss(S); }
    if (!S.over) winRun(S);
    screenEnd();
    return S.over;
  },
  version: '1.0.0',
};
