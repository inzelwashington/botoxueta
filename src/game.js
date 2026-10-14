/* =====================================================================
   ЯДРО ИГРЫ: состояние, ходы, экономика, мини-игры, финалы
   ===================================================================== */

import { EVENTS, MG_ATTACH, TICKER_LINES, RANDOM_TOASTS } from './events.js';
import { sfx, setTrainSpeed } from './audio.js';

/* ------------------------- утилиты ------------------------- */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const R = (a, b) => a + Math.random() * (b - a);
const RI = (a, b) => Math.round(R(a, b));
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export const TOTAL_DIST = 4.1;    // световых лет
export const MAX_TURNS = 24;
const TANK_MAX = 26;              // литров в баке
const BAG_MAX = 60;               // литров в пятилитрухе (да, она резиновая)

/* ------------------------- маршрут ------------------------- */
export const STATIONS = [
  { n: 'Земля, Ярославский вокзал', d: 0 },
  { n: 'Луна, депо «Южное»', d: 0.02 },
  { n: 'Пояс астероидов, разъезд 67', d: 0.22 },
  { n: 'Орбита Юпитера', d: 0.5 },
  { n: 'Станция «Европа-Товарная»', d: 0.74 },
  { n: 'Сатурн, кольцевая ветка', d: 1.05 },
  { n: 'Пост ГАИ «Титан-Транзит»', d: 1.33 },
  { n: 'Уран, полустанок 41', d: 1.62 },
  { n: 'Нептун, разъезд «Тритон»', d: 1.9 },
  { n: 'Облако Оорта, будка 24', d: 2.15 },
  { n: 'Гелиопауза, пост КГБ', d: 2.4 },
  { n: 'Межзвёздная среда, 0.1 ly', d: 2.62 },
  { n: 'Перегон «Тишина»', d: 2.84 },
  { n: 'Разъезд «Багбирный»', d: 3.05 },
  { n: 'Туманность «Пятилитровка»', d: 3.25 },
  { n: 'Объект 67 (не в каталоге)', d: 3.45 },
  { n: 'Перегон «Отчаяние»', d: 3.64 },
  { n: 'Разъезд «Последний Глоток»', d: 3.81 },
  { n: 'Периферия Альфа-Центавры A', d: 3.94 },
  { n: 'Орбита Альфа-Центавры B', d: 4.03 },
  { n: 'Станция «АЛЬФА-ЦЕНТАВРА»', d: 4.1 },
];

export const ITEMS = {
  kanistra:  { name: 'Канистра', emoji: '🛢️',  desc: 'Резерв 6 л. Уходит в бак одним нажатием.' },
  ogurec:    { name: 'Огурцы',   emoji: '🥒',  desc: 'Рассол поднимает вменяемость на +12.' },
  aptechka:  { name: 'Аптечка',  emoji: '🧰',  desc: 'Лечит всё: +18 вменяемости, +6 к теплу.' },
  reduktor:  { name: 'Редуктор', emoji: '⚙️',  desc: 'Инженерная мысль: +6 к скорости, если пусто в баке.' },
  babushka:  { name: 'Бидон',    emoji: '🥛',  desc: 'Бабушкин запас: +4 л в пятилитруху.' },
  telogreyka:{ name: 'Теплогрейка', emoji: '🧣', desc: 'Держит тепло: мгновенно +22 к температуре.' },
  shapka:    { name: 'Шапка-ушанка', emoji: '🧢', desc: '−14 к вниманию КГБ. Надевается сразу.' },
  karta:     { name: 'Карта Млечного Пути', emoji: '🗺️', desc: 'Показывает разъезд: +0.6 к скорости, +4 к вменяемости.' },
};

/* ------------------------- состояние ------------------------- */
export function createState(seed){
  const s = {
    seed: seed >>> 0,
    turn: 0,
    stationIdx: 0,
    phase: 'menu',            // menu | event | resolve | over
    over: null,
    /* ресурсы */
    bag: 52, grad: 24, vmen: 64, temp: 62, kgb: 6, fuel: 16, rizz: 0,
    speed: 1.6, dist: 0,
    /* вспомогательное */
    items: {},
    mods: {},
    flags: {},
    mem67: 0,
    shakes: { perfect: 0, good: 0, bad: 0 },
    minutes: 8 * 60,
    seen: {},
    pending: null,            // активный выбор/эффекты
    log: [], ticker: [], crew: [],
    mgResult: null,
    voice: { sur: null, vas: null },
    stats: { drinks: 0, litersDrank: 0, litersFuel: 0, events: 0, perfect: 0, crit: 0 },
  };
  return s;
}

/* ------------------------- лог ------------------------- */
export function addLog(S, text, cls = ''){
  S.log.unshift({ text, cls, t: S.turn });
  if (S.log.length > 60) S.log.pop();
}
export function addTicker(S, text){
  S.ticker.unshift(text);
  if (S.ticker.length > 40) S.ticker.pop();
}
export function say(S, who, text){
  S.voice[who] = text;
  S.crew.unshift({ who: who === 'sur' ? 'СУРДИН' : 'ВАСЯ', what: text, turn: S.turn, dead: false });
  if (S.crew.length > 14) S.crew.pop();
}

/* ------------------------- ГСЧ ------------------------- */
let rngState = 1;
export function seedRng(seed){ rngState = (seed >>> 0) || 1; }
function rnd(){
  rngState ^= rngState << 13; rngState >>>= 0;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;  rngState >>>= 0;
  return rngState / 4294967296;
}
const rndRange = (a, b) => a + rnd() * (b - a);
const rndInt = (a, b) => Math.round(rndRange(a, b));

/* =====================================================================
   ЭФФЕКТЫ
   ===================================================================== */
export function applyEffect(S, ef){
  const why = ef.why ? ` (${ef.why})` : '';
  switch (ef.kind){
    case 'bag': {
      const before = S.bag;
      S.bag = clamp(S.bag + ef.delta, 0, BAG_MAX);
      if (ef.delta < 0 && before > 0) addLog(S, `Багбир ${f1(ef.delta)} л${why}`, 'bad');
      else if (ef.delta > 0) addLog(S, `Багбир +${f1(ef.delta)} л${why}`, 'good');
      break;
    }
    case 'grad': {
      S.grad = clamp(S.grad + ef.delta, 0, 100);
      if (Math.abs(ef.delta) >= 5)
        addLog(S, `Градус ${ef.delta > 0 ? '+' : ''}${Math.round(ef.delta)}`, ef.delta > 0 ? 'good' : 'bad');
      break;
    }
    case 'vmen': {
      S.vmen = clamp(S.vmen + ef.delta, 0, 100);
      addLog(S, `Вменяемость ${ef.delta > 0 ? '+' : ''}${Math.round(ef.delta)}`, ef.delta > 0 ? 'good' : 'bad');
      break;
    }
    case 'temp': {
      S.temp = clamp(S.temp + ef.delta, 0, 100);
      if (Math.abs(ef.delta) >= 4)
        addLog(S, `Температура в вагоне ${ef.delta > 0 ? '+' : ''}${Math.round(ef.delta)}`, ef.delta > 0 ? 'good' : 'bad');
      break;
    }
    case 'kgb': {
      S.kgb = clamp(S.kgb + ef.delta, 0, 100);
      addLog(S, `Внимание КГБ ${ef.delta > 0 ? '+' : ''}${Math.round(ef.delta)}`, ef.delta > 0 ? 'bad' : 'good');
      break;
    }
    case 'fuel': {
      S.fuel = clamp(S.fuel + ef.delta, 0, TANK_MAX);
      addLog(S, `Топливо ${ef.delta > 0 ? '+' : ''}${f1(ef.delta)} л`, ef.delta > 0 ? 'good' : 'bad');
      break;
    }
    case 'speed': {
      S.speed = clamp(S.speed + ef.delta, 0.4, 12);
      addLog(S, `Ход ${ef.delta > 0 ? '+' : ''}${f1(ef.delta)}`, '');
      break;
    }
    case 'rizz': {
      S.rizz += ef.delta;
      if (ef.delta) addLog(S, `Ризз ${ef.delta > 0 ? '+' : ''}${Math.round(ef.delta)}`, ef.delta > 0 ? 'good' : 'bad');
      break;
    }
    case 'gain': {
      const it = ef.item;
      if (it && ITEMS[it]){ S.items[it] = (S.items[it] || 0) + 1; addLog(S, `В инвентарь: ${ITEMS[it].emoji} ${ITEMS[it].name}`, 'good'); }
      break;
    }
    case 'lose': {
      const it = ef.item;
      if (it && S.items[it]){ S.items[it]--; if (!S.items[it]) delete S.items[it]; addLog(S, `Потеряно: ${ITEMS[it].name}`, 'bad'); }
      break;
    }
    case 'mod': {
      S.mods[ef.id] = { turns: ef.turns || 3, name: ef.name || ef.id, kind: ef.mkind || 'weird', desc: ef.desc || '' };
      addLog(S, `Состояние: ${ef.name || ef.id}`, 'hi');
      break;
    }
    case 'time': S.minutes += ef.minutes || 60; break;
    case 'mind': S.mem67 += ef.n || 1; break;
  }
}

export function applyEffects(S, list){
  (list || []).forEach((ef) => {
    if (ef.kind === 'log') { addLog(S, ef.text, ef.cls || ''); return; }
    if (ef.kind === 'toast') return;      // тосты обрабатывает UI
    if (ef.kind === 'rizz'){ if (ef.mem) S.mem67 += ef.mem; if (ef.delta) applyEffect(S, ef); return; }
    if (ef.kind === 'hold'){ S.pending = { type: 'hold', text: ef.text }; return; }
    if (ef.kind === 'cursor'){ S.pending = { type: 'rhythm', text: ef.text, goal: ef.goal }; return; }
    applyEffect(S, ef);
  });
}

/* =====================================================================
   ДЕЙСТВИЯ ХОДА
   ===================================================================== */
export const ACTIONS = [
  {
    id: 'sip', key: '1', name: 'Хлебнуть 41 г', cls: 'drink',
    hint: 'В честь 4,1. +вменяемость, −чуть багбира. Наука требует точности.',
    avail: (S) => S.bag >= 0.5,
    run: (S) => {
      const amt = 0.41;
      applyEffect(S, { kind: 'bag', delta: -amt });
      applyEffect(S, { kind: 'grad', delta: +7 });
      applyEffect(S, { kind: 'vmen', delta: +5 });
      S.stats.drinks++; S.stats.litersDrank += amt;
      sfx.sip();
      addLog(S, '41 грамм — метрологически точно.', 'hi');
    },
  },
  {
    id: 'drink', key: '2', name: 'Выпить 250 г', cls: 'drink',
    hint: '−0,25 л. +градус, +вменяемость, +скорость. Классика жанра.',
    avail: (S) => S.bag >= 0.3,
    run: (S) => {
      applyEffect(S, { kind: 'bag', delta: -0.25 });
      applyEffect(S, { kind: 'grad', delta: +15 });
      applyEffect(S, { kind: 'vmen', delta: +11 });
      applyEffect(S, { kind: 'speed', delta: +0.3 });
      S.stats.drinks++; S.stats.litersDrank += 0.25;
      sfx.sip();
      addLog(S, 'Сурдин: «Это уже не наука, это практика».', 'hi');
      if (S.grad > 88 && Math.random() < 0.4){
        applyEffect(S, { kind: 'kgb', delta: +7 });
        addLog(S, 'Проводница посмотрела в вашу сторону. Долго.', 'bad');
      }
    },
  },
  {
    id: 'pour', key: '3', name: 'Залить в бак 0,5 л',
    hint: '−0,5 л багбира → +2,2 л топлива и +0,35 к ходу. Поезд на выпивке.',
    avail: (S) => S.bag >= 0.6,
    run: (S) => {
      applyEffect(S, { kind: 'bag', delta: -0.5 });
      applyEffect(S, { kind: 'fuel', delta: +2.2 });
      applyEffect(S, { kind: 'speed', delta: +0.35 });
      S.stats.litersFuel += 0.5;
      sfx.good();
      addLog(S, 'Литр ушёл в бак. Двигатель заурчал с явным удовольствием.', 'good');
      if (!S.flags.engineTold){ S.flags.engineTold = true; S.mem67 += 2; addLog(S, 'ОТКРЫТИЕ: багбир — ракетное топливо. Вася в шоке.', 'hi'); }
    },
  },
  {
    id: 'shake', key: '4', name: 'ТРЯХНУТЬ БУТЫЛЬ', cls: 'shake',
    hint: 'Ритуал. Пауза идёт быстрее, градус растёт, багбира может стать больше.',
    avail: (S) => S.bag >= 0.6 && !S.mods.shakeCd,
    run: (S, api) => {
      api.minigame('shake', (res) => {
        S.shakes[res.grade === 'perfect' ? 'perfect' : res.grade === 'good' ? 'good' : 'bad']++;
        if (res.grade === 'perfect'){
          S.stats.perfect++;
          applyEffect(S, { kind: 'bag', delta: +0.9 });
          applyEffect(S, { kind: 'grad', delta: +6 });
          applyEffect(S, { kind: 'speed', delta: +0.7 });
          S.mem67 += 3;
          addLog(S, 'ИДЕАЛЬНАЯ ТРЯСКА. Осадок поднялся, объём вырос, Сурдин снял очки.', 'good');
          api.toast('ИДЕАЛЬНАЯ ТРЯСКА +0.9 л', 'good');
          sfx.perfect();
        } else if (res.grade === 'good'){
          applyEffect(S, { kind: 'bag', delta: +0.3 });
          applyEffect(S, { kind: 'grad', delta: +4 });
          S.mem67 += 1;
          addLog(S, 'Неплохая тряска. Пятилитруха булькнула одобрительно.', 'good');
          sfx.good();
        } else {
          applyEffect(S, { kind: 'bag', delta: -0.5, why: 'выплеснулось при тряске' });
          applyEffect(S, { kind: 'kgb', delta: +6 });
          addLog(S, 'Тряхнули слишком сильно. Часть — на стене, часть — на Васе.', 'bad');
          api.toast('ПЕРЕТРЯХНУЛИ', 'bad');
          sfx.fail();
        }
        applyEffect(S, { kind: 'mod', id: 'shakeCd', name: 'Пятилитруха отстаивается', turns: 1, mkind: 'weird', desc: 'Трясти нельзя один ход' });
      });
    },
  },
  {
    id: 'read', key: '5', name: 'Почитать Сурдина',
    hint: '+ризз, +вменяемость. Иногда можно выпросить лишний литр у Васи.',
    avail: () => true,
    run: (S) => {
      applyEffect(S, { kind: 'vmen', delta: +9 });
      applyEffect(S, { kind: 'rizz', delta: +4 });
      S.mem67 += 1;
      sfx.ui();
      if (Math.random() < 0.35){
        applyEffect(S, { kind: 'bag', delta: +0.6 });
        addLog(S, 'Вася дослушал лекцию до конца и в благодарность налил вам из своей заначки.', 'good');
      } else {
        addLog(S, 'Сурдин прочитал про тёмную материю. Вы почти всё поняли. Почти.', 'hi');
      }
    },
  },
  {
    id: 'sleep', key: '6', name: 'Поспать 4 часа',
    hint: '+вменяемость, +тепло, но поезд идёт тише и багбир тратится сам.',
    avail: (S) => S.turn < MAX_TURNS,
    run: (S) => {
      applyEffect(S, { kind: 'vmen', delta: +14 });
      applyEffect(S, { kind: 'temp', delta: +5 });
      applyEffect(S, { kind: 'bag', delta: -0.5, why: 'расход за время сна' });
      applyEffect(S, { kind: 'speed', delta: -0.3 });
      sfx.ui();
      addLog(S, 'Спали в купе. Снилось, что доехали и пятилитруха полная.', 'hi');
    },
  },
];

export function inventoryActions(S){
  const out = [];
  for (const key of Object.keys(S.items)){
    const it = ITEMS[key];
    if (!it || !S.items[key]) continue;
    out.push({
      id: 'item_' + key, name: `${it.emoji} ${it.name}`, hint: it.desc, cls: 'item',
      avail: () => true,
      run: (S2) => {
        S2.items[key]--;
        if (!S2.items[key]) delete S2.items[key];
        switch (key){
          case 'kanistra':
            applyEffect(S2, { kind: 'fuel', delta: +8 });
            applyEffect(S2, { kind: 'speed', delta: +0.6 });
            break;
          case 'ogurec':   applyEffect(S2, { kind: 'vmen', delta: +12 }); break;
          case 'aptechka': applyEffect(S2, { kind: 'vmen', delta: +18 }); applyEffect(S2, { kind: 'temp', delta: +6 }); break;
          case 'reduktor': applyEffect(S2, { kind: 'speed', delta: +0.6 }); S2.mem67 += 2; break;
          case 'babushka': applyEffect(S2, { kind: 'bag', delta: +4.0 }); break;
          case 'telogreyka': applyEffect(S2, { kind: 'temp', delta: +22 }); break;
          case 'shapka':   applyEffect(S2, { kind: 'kgb', delta: -14 }); break;
          case 'karta':    applyEffect(S2, { kind: 'speed', delta: +0.6 }); applyEffect(S2, { kind: 'vmen', delta: +4 }); break;
        }
        sfx.good();
        addLog(S2, `Использовано: ${it.name}`, 'good');
      },
    });
  }
  return out;
}

/* =====================================================================
   ХОД
   ===================================================================== */
export function nextStationName(S){
  const nx = STATIONS[Math.min(S.stationIdx + 1, STATIONS.length - 1)];
  return nx ? nx.n : 'АЛЬФА-ЦЕНТАВРА';
}

export function currentStationName(S){
  const st = STATIONS[Math.min(S.stationIdx, STATIONS.length - 1)];
  return st ? st.n : 'АЛЬФА-ЦЕНТАВРА';
}

/** Продвижение поезда + пассивная экономика. Возвращает реальную скорость. */
export function advanceTrain(S){
  // --- тяга: печка и двигатель кормятся из бака
  let need = 0.38;
  if (S.mods.eco) need -= 0.1;
  const canBurn = Math.min(S.fuel, need);
  S.fuel = clamp(S.fuel - canBurn, 0, TANK_MAX);
  const fed = canBurn >= need - 0.001;

  let spd = S.speed;
  if (!fed){
    spd *= 0.55;
    addLog(S, 'Бак пуст: печка встала, двигатель идёт на инерции.', 'bad');
  }
  spd *= 1 + (S.grad - 50) / 260;                    // градус добавляет ходу
  spd *= 0.35 + 0.65 * (S.temp / 100);               // холод тормозит
  spd *= 1 - S.kgb / 420;                            // КГБ дышит в затылок
  spd *= S.mods.nitro ? 1.8 : 1;
  spd *= S.mods.breakdown ? 0.55 : 1;
  spd = clamp(spd, 0.15, 14);

  // --- расход багбира на быт купе
  let burn = 1.55;
  if (S.mods.thirst) burn += 0.5;
  if (S.mods.eco) burn -= 0.2;
  burn = Math.max(0.3, burn);
  const real = Math.min(S.bag, burn);
  S.bag = clamp(S.bag - real, 0, BAG_MAX);
  S.stats.litersDrank += real;
  if (S.bag <= 0.001) addLog(S, 'Пятилитруха пуста. Абсолютно, звонко пуста.', 'bad');

  // --- путь: ход * коэффициент, за 24 перегона надо набрать 4,1 св. года
  const gained = (spd * 0.45) / 10;
  S.dist = clamp(S.dist + gained, 0, TOTAL_DIST);

  // --- природа: трезвеем, выстываем (если тепло нечем топить)
  S.grad = clamp(S.grad - 5, 0, 100);
  if (fed){
    S.temp = clamp(S.temp + (S.temp < 88 ? 1.6 : -2), 0, 100);
  } else {
    S.temp = clamp(S.temp - 9, 0, 100);
    if (S.temp <= 0.001) addLog(S, 'В вагоне минус. Стёкла в наледи, багбир в лёд.', 'bad');
  }
  S.kgb = clamp(S.kgb + 1.8, 0, 100);
  S.speed = clamp(S.speed + 0.02, 0.4, 12);

  // --- состояния тикают
  for (const k of Object.keys(S.mods)){
    const m = S.mods[k];
    m.turns--;
    if (m.turns <= 0){
      if (k === 'hunger') applyEffect(S, { kind: 'vmen', delta: -4 });
      delete S.mods[k];
    }
  }

  S.minutes += 67 + RI(0, 40);
  if (S.minutes > 24 * 60) S.minutes -= 24 * 60;

  // --- станция
  const nextIdx = STATIONS.findIndex((st) => st.d > S.dist + 1e-9);
  const newIdx = nextIdx < 0 ? STATIONS.length - 1 : Math.max(0, nextIdx - 1);
  if (newIdx > S.stationIdx){
    S.stationIdx = newIdx;
    addLog(S, `● СТАНЦИЯ: ${currentStationName(S)}`, 'hi');
  }
  setTrainSpeed(clamp(spd / 4, 0.4, 2.4));
  return spd;
}

/* ------------------------- условия проигрыша ------------------------- */
export function checkLoss(S){
  if (S.over) return S.over;
  if (S.bag <= 0.02){    return endRun(S, {
      id: 'dry',
      title: 'ХВАТИТ? НЕ ХВАТИЛО.',
      emoji: '🫗',
      text: 'Пятилитруха кончилась в открытом космосе. Двигатель, работающий на багбире, вежливо кашлянул и заглох. Поезд пошёл по инерции — а инерция, как известно, до Альфа-Центавры не доводит.',
      epi: '«Вот поэтому я и говорю: сначала считаем, потом пьём. Хотя, если честно, я всегда делал наоборот». — Сурдин',
    });
  }
  if (S.vmen <= 0){
    return endRun(S, {
      id: 'sober',
      title: 'СЛИШКОМ ТРЕЗВ, ЧТОБЫ ЖИТЬ',
      emoji: '🧊',
      text: 'Вменяемость кончилась раньше багбира. Вы осознали всё сразу: расстояние, время, собственную жизнь, стоимость пятилитрухи на орбите. Организм не выдержал ясности и выпил запас целиком в один глоток.',
      epi: '«Трезвость — это когда видно всё. Обычно именно этого и не надо». — научпопный советский алкаш',
    });
  }
  if (S.kgb >= 100){
    return endRun(S, {
      id: 'kgb',
      title: 'ВЫСАДИЛИ НА 67-м РАЗЪЕЗДЕ',
      emoji: '🕵️',
      text: 'За вами пришли в тамбур. Проверили билет, пятилитруху, редуктор в обшивке и салфетку с расчётами. Салфетку признали государственной тайной и изъяли вместе с вами.',
      epi: '«Пятилитруха осталась в вагоне. Вагон, кстати, поехал дальше. Мы видели это из будки». ',
    });
  }
  if (S.temp <= 0){
    return endRun(S, {
      id: 'cold',
      title: 'МИНУС СТО ДВАДЦАТЬ',
      emoji: '❄️',
      text: 'Печка встала окончательно, а температура снаружи не прощает. Багбир замёрз в стекло, стекло замёрзло в лёд. Вы сидели вдвоём в шапках и молчали о том, что делать дальше.',
      epi: '«Физика — дама строгая. Она не согреет».',
    });
  }
  return null;
}

export function winRun(S){
  const arrived = S.dist >= TOTAL_DIST - 0.02;
  if (!arrived){
    // время вышло, а станция «АЛЬФА-ЦЕНТАВРА» так и не показалась
    return endRun(S, {
      id: 'timeout',
      title: 'НЕ УСПЕЛИ. РЕЙС ЗАКРЫТ.',
      emoji: '⏱️',
      text: `Отведённые ${MAX_TURNS} перегонов кончились, а тройной системы в окне так и нет: пройдено ${(S.dist / TOTAL_DIST * 100).toFixed(0)}% маршрута. Диспетчер объявил конечную, но она не та, ради которой ехали. Багбир, кстати, ещё есть — и это самое обидное.`,
      epi: '«Медленно ехали, товарищи. Наука не терпит дрейфа». — диспетчер Альфа-Центавры (не дозвонились)',
    });
  }
  const left = S.bag;
  const vmen = S.vmen;
  let rank, grade, comment;
  if (left >= 26){
    rank = 'АКАДЕМИК СУРДИН'; grade = 'S';
    comment = 'Приехали с запасом, о котором в вагоне будут рассказывать легенды. Пятилитруха смотрит на вас с уважением.';
  } else if (left >= 17){
    rank = 'ПОЧЁТНЫЙ НАУЧПОП'; grade = 'A';
    comment = 'Запас остался. Немного, но остался — а значит, вы считали, а не пили наугад.';
  } else if (left >= 10){
    rank = 'НАУЧНЫЙ СОТРУДНИК'; grade = 'B';
    comment = 'Осталось ровно на один тост. Зато этот тост будет на орбите Альфа-Центавры.';
  } else if (left >= 4){
    rank = 'ДОЕХАЛ НА ЧЕСТНОМ СЛОВЕ'; grade = 'C';
    comment = 'В пятилитрухе плещется на донышке. Плещется, между прочим, уже четыре световых года.';
  } else {
    rank = 'МЛАДШИЙ ЛАБОРАНТ КОСМОСА'; grade = 'D';
    comment = 'Пусто. Но доехали — а это, по большому счёту, и был вопрос рейса.';
  }
  // бонусы и штрафы к рангу
  const mem = S.mem67;
  return endRun(S, {
    id: 'win',
    title: 'АЛЬФА-ЦЕНТАВРА. ТРОЙНАЯ СИСТЕМА В ОКНЕ.',
    emoji: '🌟',
    text: `Поезд подошёл к станции с надписью на табло, ради которой ехали 4,1 светового года. Сурдин встал, поправил свитер и произнёс: «Ну вот. Теперь можно и открыть».`,
    epi: '«Хватило? Хватило. Но я бы всё равно взял вторую». — Сурдин',
    rank, grade, comment, left, mem, vmen,
  });
}

function endRun(S, res){
  S.over = res;
  S.phase = 'over';
  return res;
}

/* =====================================================================
   ВЫБОР СОБЫТИЙ
   ===================================================================== */
export function pickEvent(S){
  const arrived = S.dist >= TOTAL_DIST - 0.02;
  const outOfTime = S.turn >= MAX_TURNS;
  if (arrived || outOfTime){
    const fin = EVENTS.find((e) => e.id === 'arrival');
    return fin;
  }
  const pool = EVENTS.filter((e) => !e.final && canUse(S, e));
  // события-продолжения по флагам
  const weights = pool.map((e) => {
    let w = e.weight || 10;
    if (S.seen[e.id]) w *= S.seen[e.id] > 1 ? 0.12 : 0.35;
    if (e.tag === 'danger' && S.kgb > 60) w *= 1.4;
    if (e.tag === 'good' && S.bag < 12) w *= 1.5;
    if (e.id === 'kgb_check' && S.kgb > 65) w *= 4;
    if (e.id === 'final_check' && S.dist > 3.5) w *= 6;
    return { e, w };
  });
  const total = weights.reduce((a, b) => a + b.w, 0) || 1;
  let r = rnd() * total;
  for (const { e, w } of weights){ r -= w; if (r <= 0) return e; }
  return pool[0] || EVENTS[0];
}

function canUse(S, e){
  if (e.cond && !e.cond(S)) return false;
  return true;
}

/* =====================================================================
   ХОД ИГРЫ (внешний API для UI)
   ===================================================================== */
export function beginTurn(S){
  S.turn++;
  S.phase = 'event';
  S.pending = null;
  S.mgResult = null;

  const spd = advanceTrain(S);
  // случайный мемный тост / байка
  if (Math.random() < 0.5) addTicker(S, pick(TICKER_LINES));
  if (Math.random() < 0.22){
    const [t, cls] = pick(RANDOM_TOASTS);
    S.pending = S.pending || {};
    S.randomToast = { text: t, cls };
  }

  const loss = checkLoss(S);
  if (loss) return { done: true };

  const ev = pickEvent(S);
  S.seen[ev.id] = (S.seen[ev.id] || 0) + 1;
  S.stats.events++;
  S.currentEvent = ev;
  S.currentChoices = buildChoices(S, ev);
  S.eventToast = S.randomToast; S.randomToast = null;
  if (Math.random() < 0.35) say(S, ev.who === 'vas' ? 'vas' : 'sur', pick(SUR_LINES[ev.who === 'vas' ? 'vas' : 'sur']));
  return { event: ev, spd };
}

const SUR_LINES = {
  sur: [
    'Это, кстати, отличный пример гравитационного взаимодействия.',
    'С точки зрения физики, мы сейчас находимся в интереснейшем месте.',
    'Я фиксирую падение уровня. Дважды за рейс.',
    'Фактически пятилитруха — это наш единственный прибор.',
    'Не спеши. Сначала посчитаем, потом будем пить.',
    'Расстояние — это не проблема. Проблема — расход.',
  ],
  vas: [
    'Сурдин, а если не хватит?',
    'Я тут посчитал... ну, примерно посчитал.',
    'Мне кажется, или мы уже это проезжали?',
    'Надо экономить. С завтрашнего дня. Честно.',
    'Кто опять трогал пятилитруху без спроса?',
  ],
};

/* ---------- подготовка выборов: проверка требований ---------- */
function buildChoices(S, ev){
  return (ev.choices || []).map((c, i) => {
    const req = c.req || {};
    const cost = c.cost || {};
    let ok = true, reason = '';
    if (req.rizz && S.rizz < req.rizz){ ok = false; reason = `нужно ризз ${req.rizz} (у вас ${S.rizz})`; }
    if (req.grad && S.grad < req.grad){ ok = false; reason = `нужно градус ${req.grad}`; }
    if (req.bag && S.bag < req.bag){ ok = false; reason = `нужно ${req.bag} л багбира`; }
    if (cost.rizz && S.rizz < cost.rizz){ ok = false; reason = `нужно ризз ${cost.rizz}`; }
    if (cost.fuel && S.fuel < cost.fuel){ ok = false; reason = `нужно ${cost.fuel} л топлива`; }
    if (cost.bag && S.bag < cost.bag){ ok = false; reason = `нужно ${cost.bag} л багбира`; }
    return { idx: i, c, ok, reason };
  });
}

/** Игрок сделал выбор. Возвращает { texts, toasts, minigame, done } */
export function resolveChoice(S, idx){
  const choice = S.currentEvent.choices[idx];
  if (!choice) return {};
  const cost = choice.cost || {};
  const pay = [];
  if (cost.rizz) pay.push(`−${cost.rizz} ризз`);
  if (cost.bag) pay.push(`−${cost.bag} л багбира`);
  if (cost.fuel) pay.push(`−${cost.fuel} л топлива`);
  if (cost.rizz) applyEffect(S, { kind: 'rizz', delta: -cost.rizz });
  if (cost.bag) applyEffect(S, { kind: 'bag', delta: -cost.bag });
  if (cost.fuel) applyEffect(S, { kind: 'fuel', delta: -cost.fuel });

  const out = choice.run ? choice.run(S) : {};
  applyEffects(S, out.effects);

  if (choice.rizz) S.mem67 += 1;
  if (out.mem) S.mem67 += out.mem;

  addLog(S, `▸ ${choice.label}`, 'hi');
  if (out.log) addLog(S, out.log, '');
  S.phase = 'resolve';
  S.currentChoices = null;          // выбор сделан — вариантов больше нет

  // финальное событие — здесь рейс и заканчивается
  if (S.currentEvent && S.currentEvent.final && !S.over){
    winRun(S);
  }
  return { pay, out };
}

/** Запуск мини-игры по требованию */
export function attachMinigame(S){
  if (S.currentEvent && S.currentEvent.final) return null;
  if (Math.random() > 0.34) return null;
  const total = MG_ATTACH.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * total;
  for (const m of MG_ATTACH){ r -= m.weight; if (r <= 0) return m.id; }
  return MG_ATTACH[0].id;
}

/* =====================================================================
   ИТОГИ
   ===================================================================== */
export function summary(S){
  const spd = S.dist / Math.max(1, S.turn);
  const prob = S.over && S.over.id === 'win'
    ? clamp(40 + (S.bag / BAG_MAX) * 120 + S.mem67 * 0.5, 0, 99)
    : clamp(20 + S.dist / TOTAL_DIST * 60, 0, 99);
  return {
    turn: S.turn,
    bagLeft: S.bag,
    mem67: S.mem67,
    rizz: S.rizz,
    drank: S.stats.litersDrank,
    fuelled: S.stats.litersFuel,
    perfect: S.stats.perfect,
    events: S.stats.events,
    dist: S.dist,
    kgb: S.kgb,
    vmen: S.vmen,
    prob: Math.round(prob),
  };
}
