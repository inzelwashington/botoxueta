/* =====================================================================
   РАНТАЙМ-ТЕСТ: поднимаем заглушки DOM + Canvas и гоняем НАСТОЯЩИЙ код игры
   (main.js, render.js, minigames.js) в Node — без браузера.
   Полный рейс до финала без DOM проверяется отдельно в tools/smoke.mjs.
   Запуск: node tools/runtime-test.mjs
   ===================================================================== */

const errors = [];
const record = (where) => (e) => {
  errors.push(where + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
};

/* ---------------------- Canvas 2D заглушка ---------------------- */
function makeGradient(){ return { addColorStop(){} }; }
function makeCtx(){
  const noop = () => {};
  return {
    canvas: null,
    globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    lineCap: 'butt', lineJoin: 'miter', font: '', textAlign: 'left', textBaseline: 'alphabetic',
    shadowColor: '', shadowBlur: 0,
    setTransform: noop, resetTransform: noop, save: noop, restore: noop, translate: noop,
    scale: noop, rotate: noop, clearRect: noop, fillRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop,
    bezierCurveTo: noop, arc: noop, arcTo: noop, ellipse: noop, rect: noop, roundRect: noop,
    fill: noop, stroke: noop, clip: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 40 }), setLineDash: noop, getLineDash: () => [],
    drawImage: noop, createPattern: () => null,
    createLinearGradient: makeGradient, createRadialGradient: makeGradient, createConicGradient: makeGradient,
  };
}

/* ---------------------- Матчер простых селекторов ---------------------- */
function parseSimple(sel){
  const s = sel.trim();
  const out = { tag: null, id: null, cls: [], attrs: [] };
  const re = /([#.]?[\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
  let m;
  while ((m = re.exec(s))){
    if (m[2]) out.attrs.push({ name: m[2], val: m[3] });   // сырое имя: 'data-m', 'data-choice'
    else {
      const tok = m[1];
      if (tok.startsWith('#')) out.id = tok.slice(1);
      else if (tok.startsWith('.')) out.cls.push(tok.slice(1));
      else out.tag = tok.toUpperCase();
    }
  }
  return out;
}

function attrValue(el, name){
  if (name === 'disabled') return el.disabled ? 'true' : undefined;
  if (name === 'hidden') return el.hidden ? 'true' : undefined;
  if (name === 'value') return el.value !== '' ? String(el.value) : undefined;
  // В настоящем DOM `data-choice` живёт как dataset.choice, а `data-m` как dataset.m,
  // поэтому перебираем все варианты записи одного и того же атрибута.
  const camel = (k) => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const variants = new Set();
  const add = (k) => { if (k) variants.add(k); };
  add(name); add(camel(name)); add(name.toLowerCase());
  if (name.startsWith('data-')){
    const bare = name.slice(5);
    const bareLower = bare.charAt(0).toLowerCase() + bare.slice(1);
    [bare, bareLower, camel(bare), camel(bareLower)].forEach(add);
  }
  for (const v of variants) if (el.dataset[v] !== undefined) return String(el.dataset[v]);
  return undefined;
}

function matchesSimple(el, p){
  if (p.id && el.id !== p.id) return false;
  if (p.tag && el.tagName !== p.tag) return false;
  for (const c of p.cls) if (!el.classList.contains(c)) return false;
  for (const a of p.attrs){
    const v = attrValue(el, a.name);
    if (a.val === undefined){ if (v === undefined) return false; }
    else if (v !== a.val) return false;
  }
  return !!(p.id || p.tag || p.cls.length || p.attrs.length);
}

/* ---------------------- DOM заглушка ---------------------- */
class El {
  constructor(tag = 'div', id = ''){
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.style = new Proxy({}, { set: (t, k, v) => { t[k] = v; return true; }, get: (t, k) => t[k] ?? '' });
    this.dataset = {};
    this._text = '';
    Object.defineProperty(this, 'textContent', {
      get(){
        const own = this._html ? String(this._html).replace(/<[^>]*>/g, ' ') : (this._text || '');
        const kids = this.children.map((c) => c.textContent).join(' ');
        return (own + ' ' + kids).replace(/\s+/g, ' ').trim();
      },
      set(v){ this._text = String(v); this.children = []; this._html = ''; },
      configurable: true,
    });
    this._html = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.width = 800; this.height = 400;
    this.clientWidth = 1220; this.clientHeight = 420;
    this.offsetParent = {};
    this.classList = {
      _s: new Set(),
      add: (...c) => c.forEach((x) => this.classList._s.add(x)),
      remove: (...c) => c.forEach((x) => this.classList._s.delete(x)),
      toggle: (c, f) => { const on = f ?? !this.classList._s.has(c); on ? this.classList._s.add(c) : this.classList._s.delete(c); return on; },
      contains: (c) => this.classList._s.has(c),
    };
    this._listeners = {};
  }

  get innerHTML(){ return this._html; }
  set innerHTML(v){
    this._html = String(v);
    this.children = [];
    const VOID = new Set(['img', 'br', 'input', 'hr', 'meta', 'link']);
    const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|[^>])*)>/g;
    const stack = [this];
    let m;
    while ((m = re.exec(this._html))){
      const closing = m[1] === '/';
      const tag = m[2].toLowerCase();
      const attrs = m[3] || '';
      if (closing){ if (stack.length > 1) stack.pop(); continue; }
      const child = new El(tag);
      const idm = /\bid="([^"]*)"/.exec(attrs);
      if (idm) child.id = idm[1];
      const cl = /\bclass="([^"]*)"/.exec(attrs);
      if (cl) cl[1].split(/\s+/).filter(Boolean).forEach((c) => child.classList.add(c));
      for (const dm of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g))
        child.dataset[dm[1].replace(/-(\w)/g, (_, c) => c.toUpperCase())] = dm[2];
      for (const am of attrs.matchAll(/\b([\w-]+)="([^"]*)"/g)){
        const name = am[1];
        if (name === 'class' || name === 'id' || name === 'style' || name.startsWith('data-')) continue;
        child.dataset[name.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = am[2];
      }
      if (/\bdisabled\b/.test(attrs)) child.disabled = true;
      const vm = /\bvalue="([^"]*)"/.exec(attrs);
      if (vm) child.value = vm[1];
      if (child.tagName === 'CANVAS') child.getContext = () => { const c = makeCtx(); c.canvas = child; return c; };
      const parent = stack[stack.length - 1];
      child.parentElement = parent;
      parent.children.push(child);
      if (!VOID.has(tag) && !attrs.trimEnd().endsWith('/')) stack.push(child);
    }
  }

  get firstChild(){ return this.children[0] || null; }
  appendChild(c){ c.parentElement = this; this.children.push(c); return c; }
  removeChild(c){ this.children = this.children.filter((x) => x !== c); return c; }
  remove(){ if (this.parentElement) this.parentElement.removeChild(this); }
  addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(){}
  dispatchEvent(ev){ (this._listeners[ev.type] || []).forEach((fn) => fn(ev)); return true; }
  click(){ this.dispatchEvent({ type: 'click', target: this, preventDefault(){}, stopPropagation(){} }); }
  getBoundingClientRect(){
    return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight,
      right: this.clientWidth, bottom: this.clientHeight, x: 0, y: 0 };
  }
  _all(){
    const out = [];
    for (const c of this.children){ out.push(c); out.push(...c._all()); }
    return out;
  }
  querySelector(sel){
    const parts = sel.trim().split(/\s+/);
    if (parts.length > 1){
      const scope = this.querySelector(parts[0]);
      return scope ? scope.querySelector(parts.slice(1).join(' ')) : null;
    }
    const p = parseSimple(sel);
    for (const c of this._all()) if (matchesSimple(c, p)) return c;
    return null;
  }
  querySelectorAll(sel){
    const parts = sel.trim().split(/\s+/);
    if (parts.length > 1){
      const scope = this.querySelector(parts[0]);
      return scope ? scope.querySelectorAll(parts.slice(1).join(' ')) : [];
    }
    const p = parseSimple(sel);
    const out = [];
    for (const c of this._all()) if (matchesSimple(c, p)) out.push(c);
    return out;
  }
}

/* ---------------------- реестр элементов страницы ---------------------- */
const registry = new Map();
const RUNTIME_IDS = [
  'crt','flash','app','hud','meters','crew','inv','mods','stat-turns','stat-hours','stage','scene-wrap','scene',
  'viewport','vp-title','vp-text','vp-hush','toasts','mg','mg-title','mg-hint','mg-canvas','mg-hud','mg-skip',
  'text-zone','place','card','card-tag','card-num','card-title','card-text','choices','actions','log',
  'right','route-next','route-left','route-fill','crew-list','ticker','seed','screen','screen-body','btn-sound',
];
for (const id of RUNTIME_IDS){
  const el = new El(id === 'scene' || id === 'mg-canvas' ? 'canvas' : 'div', id);
  if (id === 'scene' || id === 'mg-canvas') el.getContext = () => { const c = makeCtx(); c.canvas = el; return c; };
  registry.set(id, el);
}
registry.get('scene-wrap').appendChild(registry.get('scene'));
registry.get('mg').appendChild(registry.get('mg-canvas'));
registry.get('mg').hidden = true;

const documentStub = {
  _listeners: {},
  getElementById: (id) => {
    const direct = registry.get(id);
    if (direct) return direct;
    for (const el of registry.values()){
      const found = el._all().find((c) => c.id === id);
      if (found) return found;
    }
    return null;
  },
  querySelector: (sel) => {
    const idm = /^#([\w-]+)$/.exec(sel.trim());
    if (idm) return documentStub.getElementById(idm[1]);
    for (const el of registry.values()){
      if (matchesSimple(el, parseSimple(sel))) return el;
      const r = el.querySelector(sel);
      if (r) return r;
    }
    return null;
  },
  querySelectorAll: (sel) => {
    const out = [];
    for (const el of registry.values()){
      if (matchesSimple(el, parseSimple(sel))) out.push(el);
      out.push(...el.querySelectorAll(sel));
    }
    return out;
  },
  createElement: (tag) => new El(tag),
  addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
  removeEventListener(){},
  body: new El('body'),
  documentElement: new El('html'),
  hidden: false,
};

/* ---------------------- window и браузерные API ---------------------- */
const rafQueue = [];
let fakeNow = 1000;
globalThis.document = documentStub;
globalThis.window = {
  _listeners: {},
  addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
  removeEventListener(){},
  dispatchEvent(ev){ (this._listeners[ev.type] || []).forEach((fn) => fn(ev)); return true; },
  devicePixelRatio: 1,
  AudioContext: undefined,
  location: { href: 'http://127.0.0.1:8777/' },
};
globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.performance = { now: () => fakeNow };
globalThis.localStorage = { _d: {}, getItem(k){ return this._d[k] ?? null; }, setItem(k, v){ this._d[k] = String(v); } };
globalThis.Audio = class {
  constructor(){
    this.src = ''; this.paused = true; this.ended = false; this.currentTime = 0;
    this.volume = 1; this.playbackRate = 1; this.loop = false; this.muted = false; this.dataset = {};
  }
  play(){ this.paused = false; return Promise.resolve(); }
  pause(){ this.paused = true; }
  load(){}
  cloneNode(){ return new globalThis.Audio(); }
  addEventListener(){}
};
globalThis.PointerEvent = class { constructor(t, o = {}){ this.type = t; Object.assign(this, o); } };
globalThis.KeyboardEvent = class { constructor(t, o = {}){ this.type = t; Object.assign(this, o); } };
globalThis.Path2D = class {
  moveTo(){} lineTo(){} quadraticCurveTo(){} bezierCurveTo(){} arc(){} arcTo(){} ellipse(){} rect(){} closePath(){}
};

/* ---------------------- прогон ---------------------- */
function step(n = 1, dtMs = 16){
  for (let i = 0; i < n; i++){
    fakeNow += dtMs;
    const q = rafQueue.splice(0, rafQueue.length);
    for (const fn of q){
      try { fn(fakeNow); } catch (e){ record('кадр рендера')(e); }
    }
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (name, fn) => {
  try { fn(); console.log('  ✓ ' + name); }
  catch (e){ record(name)(e); console.log('  ✖ ' + name + ' → ' + (e.message || e)); }
};

console.log('--- импорт модулей ---');
try {
  await import('../src/main.js');
  const renderMod = await import('../src/render.js');
  const mgMod = await import('../src/minigames.js');
  globalThis.__renderMod = renderMod;
  globalThis.__mgMod = mgMod;
  console.log('  ✓ main.js, render.js, minigames.js импортированы');
} catch (e){
  record('импорт')(e);
  console.log('  ✖ импорт упал: ' + (e.stack || e));
  process.exit(1);
}
const renderMod = globalThis.__renderMod;
const mgMod = globalThis.__mgMod;

console.log('--- кадры рендера (меню) ---');
step(24);
clean('сцена отрисовала кадры без исключений', () => {
  if (errors.some((e) => e.startsWith('кадр рендера'))) throw new Error('были исключения в кадрах');
});

console.log('--- старт рейса ---');
const go = registry.get('screen-body').querySelector('#go');
clean('кнопка «НАЧАТЬ РЕЙС» найдена и нажата', () => {
  if (!go) throw new Error('в screen-body нет #go (шаблон меню не отрендерился)');
  go.click();
});
step(30);

console.log('--- рейс через UI-API (window.bagbier) ---');
const api = globalThis.window.bagbier;
const mgHost = registry.get('mg');
clean('window.bagbier опубликован', () => {
  if (!api) throw new Error('window.bagbier не создан');
});
clean('после старта показано событие с вариантами', () => {
  if (api.screen()) throw new Error('экран меню не закрылся');
  if (api.choices().length < 2) throw new Error('вариантов меньше двух: ' + api.choices().length);
});

let turns = 0, eventsSeen = 0, minigames = 0, finished = null;
for (let i = 0; i < 1500 && finished === null; i++){
  if (api.screen()){ finished = api.screenText(); break; }

  if (api.minigame()){
    minigames++;
    for (let f = 0; f < 150 && api.minigame(); f++){
      try {
        if (f % 4 === 0) mgHost.dispatchEvent({ type: 'pointerdown', preventDefault(){}, stopPropagation(){} });
        else window.dispatchEvent({ type: 'pointerup' });
        window.dispatchEvent({ type: 'pointermove', clientX: 260 + (f * 9) % 700, clientY: 200 });
      } catch (e){ record('мини-игра (события)')(e); break; }
      step(2, 45);
      await sleep(2);
    }
    step(6);
    await sleep(120);
    continue;
  }

  const chs = api.choices();
  if (chs.length){
    eventsSeen++;
    const ok = chs.map((c, idx) => ({ c, idx })).filter((x) => x.c.ok);
    if (!ok.length){ record('выборы')(new Error('все выборы заблокированы')); break; }
    api.choose(ok[(Math.random() * ok.length) | 0].idx);
    step(8);
    await sleep(1650);                 // ждём setTimeout(1500) из afterChoice
    step(8);
    continue;
  }

  const usable = api.actions().filter((a) => a.avail && !a.id.startsWith('item_'));
  if (usable.length && Math.random() < 0.3){
    api.act(usable[(Math.random() * usable.length) | 0].id);
    step(6);
    await sleep(40);
  } else {
    const r = Math.random();
    if (turns >= 12) api.state.dist = Math.max(api.state.dist, 4.09);   // укладываемся в бюджет теста
    api.travel(r < 0.15 ? 'full' : r < 0.35 ? 'drift' : 'leg');
    turns++;
    step(6);
  }
  await sleep(10);
}
console.log(`  ✓ перегонов=${turns}, событий=${eventsSeen}, мини-игр=${minigames}`);
clean('действия, выборы и мини-игры реально продвигают игру', () => {
  if (eventsSeen + turns + minigames < 3) throw new Error('игра почти не продвинулась');
});
if (finished){
  console.log('  ✓ финальный экран: ' + finished.slice(0, 110));
  clean('в финале есть протокол рейса', () => {
    if (!/ПРОТОКОЛ РЕЙСА|Литров осталось/.test(finished)) throw new Error('нет протокола');
  });
}

console.log('--- финальные экраны ---');
clean('экран победы рисуется со званием и протоколом', () => {
  api.newRun(777001);
  api.state.bag = 18; api.state.mem67 = 67; api.state.rizz = 12; api.state.turn = 22;
  api.forceEnd(true);
  const text = api.screenText();
  if (!api.screen()) throw new Error('экран не открылся');
  if (!/ПРОТОКОЛ РЕЙСА/.test(text)) throw new Error('нет протокола: ' + text.slice(0, 100));
  if (!/АКАДЕМИК|НАУЧПОП|СОТРУДНИК|ЛАБОРАНТ|ЧЕСТНОМ СЛОВЕ/.test(text)) throw new Error('нет звания');
  console.log('    · ' + text.slice(0, 100));
});
clean('экран поражения рисуется', () => {
  api.newRun(777002);
  api.state.bag = 0.01;
  api.forceEnd(false);
  const text = api.screenText();
  if (!/ХВАТИТ|НЕ ХВАТИЛО|ВЫСАДИЛИ|МИНУС|ПРЕРВАН/i.test(text)) throw new Error('нет текста поражения: ' + text.slice(0, 100));
  console.log('    · ' + text.slice(0, 100));
});
clean('меню открывается снова', () => {
  api.menu();
  if (!api.screen()) throw new Error('меню не открылось');
  if (!documentStub.getElementById('go')) throw new Error('в меню нет кнопки старта');
});

console.log('--- мини-игры по отдельности ---');
const makeCanvas = () => {
  const wrap = new El('div');
  const c = new El('canvas');
  c.getContext = () => { const g = makeCtx(); g.canvas = c; return g; };
  wrap.appendChild(c);
  return c;
};
for (const kind of ['shake', 'rhythm', 'hold', 'dodge']){
  clean('мини-игра ' + kind + ' завершается и возвращает оценку', () => {
    const r = new renderMod.Renderer(makeCanvas());
    let res = null;
    r.startMinigame(kind, (x) => { res = x; });
    if (!r.mg) throw new Error('мини-игра не создана');
    for (let f = 0; f < 900 && r.mg; f++){
      const press = kind === 'hold' ? true : f % 7 === 0;
      r.input(press, 600 + (f % 200) * 3, 300);
      step(1, 20);
    }
    if (!res) throw new Error('не завершилась за 900 кадров');
    if (!['perfect', 'good', 'bad'].includes(res.grade)) throw new Error('непонятная оценка: ' + res.grade);
  });
}
clean('Minigames-обёртка создаётся', () => {
  const mini = new mgMod.Minigames(new renderMod.Renderer(makeCanvas()));
  if (!mini) throw new Error('не создалась');
});

console.log('\n=== ИТОГ ===');
if (errors.length){
  console.log('ОШИБОК: ' + errors.length);
  errors.slice(0, 20).forEach((e) => console.log(' • ' + e));
  process.exit(1);
}
console.log('✔ рантайм-тест пройден без ошибок');
process.exit(0);
