/* =====================================================================
   HEADLESS-ПРОГОН: 400 рейсов, случайные (и не очень) стратегии.
   Запуск: node tools/smoke.mjs
   ===================================================================== */

/* --- заглушки браузерного окружения, чтобы импортировать игровые модули --- */
const listeners = {};
globalThis.window = {
  addEventListener(){}, removeEventListener(){},
  AudioContext: undefined,
  devicePixelRatio: 1,
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem(){} };
globalThis.Audio = class { constructor(){ this.src=''; this.paused=true; } play(){ return Promise.resolve(); } pause(){} load(){} cloneNode(){ return new globalThis.Audio(); } };

const G = await import('../src/game.js');
const { EVENTS } = await import('../src/events.js');

const STRATS = {
  greedy:  (S) => S.bag > 8 ? 'pour' : (S.vmen < 35 ? 'drink' : 'leg'),
  drinker: (S) => S.vmen < 55 ? 'drink' : (S.bag > 20 ? 'shake' : 'leg'),
  hoarder: (S) => S.bag < 12 ? 'read' : 'leg',
  mixed:   (S) => ['pour','drink','shake','read','sleep','leg'][(Math.random()*6)|0],
  lush:    (S) => {
    // стратегия «пить, чтобы стало интереснее»: гонит бредометр вверх ради инопланетной линии
    if (S.flags.alienMet && S.alien < 70 && S.bag > 4) return 'drink';
    if (S.bag > 10) return Math.random() < 0.3 ? 'shake' : 'drink';
    if (S.fuel < 3) return 'pour';
    return 'leg';
  },
  smart:   (S) => {
    if (S.fuel < 4 && S.bag > 3) return 'pour';
    if (S.vmen < 30 && S.bag > 1) return 'drink';
    if (S.kgb > 70) return 'sleep';
    if (S.bag > 26 && S.fuel > 6) return 'shake';
    if (S.temp < 30) return 'sleep';
    return Math.random() < 0.25 ? 'read' : 'leg';
  },
};

let crashes = 0, wins = 0, total = 0;
const causes = {};
const ranks = {};
const lefts = [];
const turnEnds = [];
let alienSeen = 0, alienChains = 0, madSum = 0;
let loveWins = 0, loveRuns = 0;

/** игрок, который целенаправленно идёт по инопланетной линии */
function chaseAlien(S, choices){
  const love = choices.filter((c) => c.ok && /она|неё|окн|налить ей|позвать|впустить|вместе|рук|предложить/i.test(c.c.label));
  if (love.length) return love[0].idx;
  const ok = choices.filter((c) => c.ok);
  return ok[(Math.random() * ok.length) | 0].idx;
}

function playOne(seed, stratName){
  const strat = STRATS[stratName];
  G.seedRng(seed);
  const S = G.createState(seed);
  let guard = 0;
  let turn = 0;

  while (!S.over && guard++ < 400){
    const r = G.beginTurn(S);
    turn = S.turn;
    if (r.done || S.over) break;
    if (!S.currentEvent) throw new Error('нет события после beginTurn');
    if (!S.currentChoices || !S.currentChoices.length) throw new Error('нет выборов');
    // выбираем доступный вариант, предпочитая ризз-опции изредка
    const ok = S.currentChoices.filter((c) => c.ok);
    if (!ok.length) throw new Error('все выборы заблокированы: ' + S.currentEvent.id);
    let pickIdx;
    if (S.loveChase) pickIdx = chaseAlien(S, ok);
    else if (Math.random() < 0.25 && ok.some((c) => c.c.rizz)) pickIdx = ok.filter((c) => c.c.rizz)[(Math.random()*ok.filter((c)=>c.c.rizz).length)|0].idx;
    else pickIdx = ok[(Math.random()*ok.length)|0].idx;
    G.resolveChoice(S, pickIdx);
    if (G.checkLoss(S)) break;

    // мини-игры: считаем, что игрок играет «в полсилы»
    const mg = G.attachMinigame(S);
    if (mg){
      const grade = Math.random() < 0.45 ? 'perfect' : Math.random() < 0.6 ? 'good' : 'bad';
      const S2 = S;
      if (grade === 'perfect'){ G.applyEffect(S2, { kind: 'bag', delta: +1.0 }); G.applyEffect(S2, { kind: 'speed', delta: +0.4 }); }
      else if (grade === 'good'){ G.applyEffect(S2, { kind: 'bag', delta: +0.4 }); }
      else { G.applyEffect(S2, { kind: 'bag', delta: -0.6, why: 'провал' }); }
      if (G.checkLoss(S)) break;
    }

    // действие хода
    let stop = false;
    for (let acts = 0; acts < 3 && !stop; acts++){
      const all = [...G.ACTIONS, ...G.inventoryActions(S)];
      const want = strat(S);
      const travel = ['leg','full','drift'].includes(want);
      if (travel){
        if (want === 'full'){
          if (S.bag < 2.6) { G.applyEffect(S, { kind: 'speed', delta: +0.2 }); }
          else { G.applyEffect(S, { kind: 'bag', delta: -2.5 }); G.applyEffect(S, { kind: 'speed', delta: +2.2 }); }
        } else if (want === 'drift'){
          G.applyEffect(S, { kind: 'speed', delta: -0.8 }); G.applyEffect(S, { kind: 'vmen', delta: +4 });
        }
        stop = true;
      } else {
        const a = all.find((x) => x.id === want);
        if (a && (!a.avail || a.avail(S))){
          let usedMg = false;
          a.run(S, { minigame: (kind, cb) => { usedMg = true; cb({ grade: Math.random() < 0.4 ? 'perfect' : 'good' }); }, toast(){} });
          void usedMg;
        } else stop = true;
      }
      if (G.checkLoss(S)) { stop = true; }
    }
    if (S.over) break;
  }

  total++;
  turnEnds.push(turn);
  madSum += S.mad;
  if (S.flags.alienMet) alienSeen++;
  if (S.flags.alienFiance) alienChains++;
  if (S.over && S.over.id === 'win'){
    wins++;
    ranks[S.over.rank] = (ranks[S.over.rank] || 0) + 1;
    lefts.push(S.bag);
  } else if (S.over){
    causes[S.over.id] = (causes[S.over.id] || 0) + 1;
  } else {
    causes['не завершился (guard)'] = (causes['не завершился (guard)'] || 0) + 1;
    crashes++;
  }
  return S.over;
}

for (const name of Object.keys(STRATS)){
  const before = wins;
  for (let i = 0; i < 80; i++){
    try { playOne(1000 + i * 7, name); }
    catch (e){ crashes++; console.log('ОШИБКА [' + name + ' #' + i + ']:', e.message); }
  }
  console.log('  ' + name.padEnd(9), 'побед', String(wins - before).padStart(3), '/80');
}

/* --- целенаправленная погоня за инопланетной линией --- */
console.log('\n--- ЦЕЛЕНАПРАВЛЕННО ЗА НЕЙ (пьём и выбираем её) ---');
const savedSeed = G.seedRng;
void savedSeed;
for (let i = 0; i < 60; i++){
  // DBG
  G.seedRng(5000 + i * 13);
  const S = G.createState(5000 + i * 13);
  S.loveChase = true;
  loveRuns++;
  try {
    // играем «lush»-стратегией действий, но выборы — всегда в её пользу
    let guard = 0;
    while (!S.over && guard++ < 400){
      const r = G.beginTurn(S);
      if (r.done || S.over) break;
      const ok = S.currentChoices.filter((c) => c.ok);
      if (!ok.length) break;
      G.resolveChoice(S, chaseAlien(S, ok));
      if (G.checkLoss(S)) break;
      const want = STRATS.lush(S);
      const all = [...G.ACTIONS, ...G.inventoryActions(S)];
      if (!['leg','full','drift'].includes(want)){
        const a = all.find((x) => x.id === want);
        if (a && (!a.avail || a.avail(S))) a.run(S, { minigame: (k, cb) => cb({ grade: 'good' }), toast(){} });
      } else {
        if (want === 'full' && S.bag >= 2.6){ G.applyEffect(S, { kind: 'bag', delta: -2.5 }); G.applyEffect(S, { kind: 'speed', delta: +1.0 }); }
        else G.applyEffect(S, { kind: 'speed', delta: +0.15 });
      }
      if (G.checkLoss(S)) break;
    }
  } catch (e){ console.log('  ошибка в погоне:', e.message); }
  if (S.over && S.over.love) loveWins++;
  if (i < 8) console.log('    DBG seed', 5000+i*13, 'итог', S.over && S.over.id, '| ход', S.turn, '| путь', S.dist.toFixed(2), '| бред', Math.round(S.mad), '| она', Math.round(S.alien||0), '| флаги', JSON.stringify({met:!!S.flags.alienMet, inCar:!!S.alienInCar, night:!!S.flags.alienNight, fia:!!S.flags.alienFiance}));
}
console.log(`  дошли с ней до Альфы: ${loveWins} из ${loveRuns} попыток`);

if (process.env.TRACE){
  const name = process.env.TRACE;
  G.seedRng(4242);
  const S = G.createState(4242);
  const strat = STRATS[name] || STRATS.smart;
  console.log('\n--- ТРАССИРОВКА', name, '---');
  for (let i = 0; i < 30 && !S.over; i++){
    const r = G.beginTurn(S);
    if (r.done) break;
    const ok = S.currentChoices.filter((c) => !c.ok ? false : true);
    G.resolveChoice(S, ok[(Math.random() * ok.length) | 0].idx);
    const want = strat(S);
    const all = [...G.ACTIONS, ...G.inventoryActions(S)];
    if (!['leg','full','drift'].includes(want)){
      const a = all.find((x) => x.id === want);
      if (a && (!a.avail || a.avail(S))) a.run(S, { minigame: (k, cb) => cb({ grade: 'good' }), toast(){} });
    } else if (want === 'full'){
      G.applyEffect(S, { kind: 'bag', delta: -2.5 }); G.applyEffect(S, { kind: 'speed', delta: +2.2 });
    }
    console.log(
      'ход', String(S.turn).padStart(2),
      '| путь', S.dist.toFixed(3),
      '| багбир', S.bag.toFixed(1).padStart(5),
      '| темп', String(Math.round(S.temp)).padStart(3),
      '| вмен', String(Math.round(S.vmen)).padStart(3),
      '| град', String(Math.round(S.grad)).padStart(3),
      '| кгб', String(Math.round(S.kgb)).padStart(3),
      '| бак', S.fuel.toFixed(1).padStart(4),
      '| ход', S.speed.toFixed(1).padStart(4),
      '|', S.currentEvent ? S.currentEvent.id : '—');
  }
  console.log('финал:', S.over ? S.over.id : 'не завершён');
}

const avgLeft = lefts.length ? (lefts.reduce((a, b) => a + b, 0) / lefts.length) : 0;
const avgTurn = turnEnds.reduce((a, b) => a + b, 0) / turnEnds.length;

console.log('--- ПРОГОН', total, 'РЕЙСОВ ---');
console.log('побед:', wins, '(' + ((wins / total) * 100).toFixed(1) + '%)');
console.log('крашей/зависаний:', crashes);
console.log('средний ход окончания:', avgTurn.toFixed(1), 'из', G.MAX_TURNS);
console.log('средний остаток при победе:', avgLeft.toFixed(1), 'л');
console.log('причины поражений:', causes);
console.log('ранги:', ranks);
console.log('событий в пуле:', EVENTS.length);
console.log('бредометр в среднем:', (madSum / total).toFixed(1), '| знакомство с ней:', alienSeen, '| дошло до финала с ней:', alienChains);

/* --- проверка целостности пула событий --- */
let schemaErrors = 0;
EVENTS.forEach((e) => {
  if (!e.id || !e.title || !e.text) { console.log('!! событие без id/title/text:', e.id); schemaErrors++; }
  if (!e.choices || e.choices.length < 2) { console.log('!! у события мало выборов:', e.id); schemaErrors++; }
  e.choices.forEach((c, i) => {
    if (!c.label) { console.log('!! выбор без label:', e.id, i); schemaErrors++; }
    if (typeof c.run !== 'function') { console.log('!! выбор без run():', e.id, i); schemaErrors++; }
  });
});
// прогон каждого события в одиночку — не должно быть исключений
EVENTS.forEach((e) => {
  e.choices.forEach((c, i) => {
    const S = G.createState(1);
    S.bag = 40; S.rizz = 40; S.fuel = 20; S.grad = 60; S.vmen = 60;
    S.currentEvent = e;
    try {
      c.run(S);
    } catch (err){ console.log('!! исключение в', e.id, 'выбор', i, '→', err.message); schemaErrors++; }
  });
});
console.log('ошибок схемы событий:', schemaErrors);
process.exit(crashes || schemaErrors ? 1 : 0);
