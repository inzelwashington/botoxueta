/* =====================================================================
   РАНТАЙМ-ТЕСТ: заглушки DOM + Canvas, но гоняется НАСТОЯЩИЙ код игры
   (main.js, render.js, minigames.js, narration.js) — без браузера.
   Запуск: node tools/runtime-test.mjs
   ===================================================================== */

import fs from 'node:fs';

const errors = [];
const record = (where) => (e) => {
  errors.push(where + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
};

/* ---------------------- Canvas 2D ---------------------- */
function makeGradient(){ return { addColorStop(){} }; }
function makeCtx(rec){
  const noop = () => {};
  const wrap = (name) => (...args) => { if (rec) rec.push(name + '(' + args.length + ')'); };
  return {
    canvas: null, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    lineCap: 'butt', lineJoin: 'miter', font: '', textAlign: 'left', textBaseline: 'alphabetic',
    shadowColor: '', shadowBlur: 0, globalCompositeOperation: 'source-over', filter: 'none',
    setTransform: wrap('setTransform'), resetTransform: wrap('resetTransform'), save: wrap('save'),
    restore: wrap('restore'), translate: wrap('translate'), scale: wrap('scale'), rotate: wrap('rotate'),
    clearRect: wrap('clearRect'), fillRect: wrap('fillRect'), strokeRect: wrap('strokeRect'),
    beginPath: wrap('beginPath'), closePath: wrap('closePath'), moveTo: wrap('moveTo'), lineTo: wrap('lineTo'),
    quadraticCurveTo: wrap('quadraticCurveTo'), bezierCurveTo: wrap('bezierCurveTo'), arc: wrap('arc'),
    arcTo: wrap('arcTo'), ellipse: wrap('ellipse'), rect: wrap('rect'), roundRect: wrap('roundRect'),
    fill: wrap('fill'), stroke: wrap('stroke'), clip: wrap('clip'),
    fillText: wrap('fillText'), strokeText: wrap('strokeText'),
    measureText: () => ({ width: 40 }), setLineDash: wrap('setLineDash'), getLineDash: () => [],
    drawImage: wrap('drawImage'), createPattern: () => null,
    putImageData: noop, getImageData: () => ({ data: [] }),
    createLinearGradient: makeGradient, createRadialGradient: makeGradient, createConicGradient: makeGradient,
  };
}

/* ---------------------- матчер селекторов ---------------------- */
function parseSimple(sel){
  const s = sel.trim();
  const out = { tag: null, id: null, cls: [], attrs: [] };
  const re = /([#.]?[\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
  let m;
  while ((m = re.exec(s))){
    if (m[2]) out.attrs.push({ name: m[2], val: m[3] });
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

/* ---------------------- DOM ---------------------- */
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
        return (own + ' ' + this.children.map((c) => c.textContent).join(' ')).replace(/\s+/g, ' ').trim();
      },
      set(v){ this._text = String(v); this.children = []; this._html = ''; },
      configurable: true,
    });
    this._html = '';
    this.hidden = false; this.disabled = false; this.value = '';
    this.width = 800; this.height = 400;
    this.clientWidth = 1220; this.clientHeight = 340;
    this.offsetParent = {}; this.offsetWidth = 1220;
    this.naturalWidth = 206; this.naturalHeight = 460; this.complete = true;
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
  setPointerCapture(){}
  getBoundingClientRect(){
    return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight,
      right: this.clientWidth, bottom: this.clientHeight, x: 0, y: 0 };
  }
  _all(){ const out = []; for (const c of this.children){ out.push(c); out.push(...c._all()); } return out; }
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

const RUNTIME_IDS = [
  'crt','flash','fatal','app','topbar','tb-station','tb-turn','tb-left','tb-fill','tb-marker','tb-details',
  'scene-wrap','scene','vp','vp-title','vp-text','toasts','mg','mg-title','mg-timer','mg-hint','mg-canvas',
  'mg-score','mg-skip','chips','story','speaker','sp-face','sp-name','card-tag','card-title','card-text',
  'narr','choices','actions','log','drawer','drawer-inner','drawer-close','meters','crew-list','inv','mods',
  'ticker','seed','screen','screen-body','btn-sound','tb-build',
];
const registry = new Map();
for (const id of RUNTIME_IDS){
  const e = new El(id === 'scene' || id === 'mg-canvas' ? 'canvas' : 'div', id);
  if (id === 'scene' || id === 'mg-canvas') e.getContext = () => { const c = makeCtx(); c.canvas = e; return c; };
  registry.set(id, e);
}
registry.get('scene-wrap').appendChild(registry.get('scene'));
registry.get('mg').appendChild(registry.get('mg-canvas'));
registry.get('mg').hidden = true;

const documentStub = {
  _listeners: {},
  getElementById(id){
    const direct = registry.get(id);
    if (direct) return direct;
    for (const e of registry.values()){ const f = e._all().find((c) => c.id === id); if (f) return f; }
    return null;
  },
  querySelector(sel){
    const idm = /^#([\w-]+)$/.exec(sel.trim());
    if (idm) return documentStub.getElementById(idm[1]);
    for (const e of registry.values()){
      if (matchesSimple(e, parseSimple(sel))) return e;
      const r = e.querySelector(sel);
      if (r) return r;
    }
    return null;
  },
  querySelectorAll(sel){
    const out = [];
    for (const e of registry.values()){
      if (matchesSimple(e, parseSimple(sel))) out.push(e);
      out.push(...e.querySelectorAll(sel));
    }
    return out;
  },
  createElement: (tag) => new El(tag),
  addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
  removeEventListener(){},
  body: new El('body'), documentElement: new El('html'), hidden: false,
};

/* ---------------------- браузерные API ---------------------- */
const rafQueue = [];
let fakeNow = 1000;
globalThis.document = documentStub;
globalThis.window = {
  _listeners: {},
  addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
  removeEventListener(){},
  dispatchEvent(ev){ (this._listeners[ev.type] || []).forEach((fn) => fn(ev)); return true; },
  devicePixelRatio: 1, AudioContext: undefined,
  location: { href: 'http://127.0.0.1:8777/' },
};
globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.performance = { now: () => fakeNow };
globalThis.localStorage = { _d: {}, getItem(k){ return this._d[k] ?? null; }, setItem(k, v){ this._d[k] = String(v); } };
globalThis.Image = class {
  constructor(){ this.src = ''; this.complete = true; this.naturalWidth = 206; this.naturalHeight = 460; }
  addEventListener(){}
};
globalThis.Audio = class {
  constructor(){ this.src = ''; this.paused = true; this.ended = false; this.currentTime = 0; this.volume = 1; this.playbackRate = 1; this.loop = false; this.muted = false; this.dataset = {}; }
  play(){ this.paused = false; return Promise.resolve(); }
  pause(){ this.paused = true; }
  load(){}
  cloneNode(){ return new globalThis.Audio(); }
  addEventListener(){}
};
globalThis.PointerEvent = class { constructor(t, o = {}){ this.type = t; Object.assign(this, o); } };
globalThis.KeyboardEvent = class { constructor(t, o = {}){ this.type = t; Object.assign(this, o); } };
globalThis.Path2D = class { moveTo(){} lineTo(){} quadraticCurveTo(){} bezierCurveTo(){} arc(){} arcTo(){} ellipse(){} rect(){} closePath(){} };

/* ---------------------- прогон ---------------------- */
function step(n = 1, dtMs = 16){
  for (let i = 0; i < n; i++){
    fakeNow += dtMs;
    const q = rafQueue.splice(0, rafQueue.length);
    for (const fn of q){ try { fn(fakeNow); } catch (e){ record('кадр рендера')(e); } }
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = async (name, fn) => {
  try { await fn(); console.log('  ✓ ' + name); }
  catch (e){ record(name)(e); console.log('  ✖ ' + name + ' → ' + (e.message || e)); }
};

console.log('--- импорт модулей ---');
let renderMod, mgMod, eventsMod, audioMod;
try {
  await import('../src/main.js');
  renderMod = await import('../src/render.js');
  mgMod = await import('../src/minigames.js');
  eventsMod = await import('../src/events.js');
  audioMod = await import('../src/audio.js');
  await import('../src/narration.js');
  console.log('  ✓ main / render / minigames / events / audio / narration импортированы');
} catch (e){
  record('импорт')(e);
  console.log('  ✖ импорт упал: ' + (e.stack || e));
  process.exit(1);
}

console.log('--- звуки ---');
clean('игра не зовёт несуществующие звуки sfx.*', () => {
  const known = new Set(audioMod.sfxKeys);
  const bad = [];
  for (const f of ['src/main.js', 'src/minigames.js', 'src/render.js', 'src/game.js', 'src/audio.js']){
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bsfx\.([A-Za-z_]\w*)\s*\(/g)){
      if (!known.has(m[1])) bad.push(f + ' → sfx.' + m[1] + '()');
    }
  }
  if (bad.length) throw new Error('несуществующие звуки: ' + bad.join(', '));
  console.log('    · доступно звуков: ' + known.size + ' (' + [...known].join(', ') + ')');
});

console.log('--- меню и первые кадры ---');
step(20);
clean('сцена рисует кадры без исключений', () => {
  if (errors.some((e) => e.startsWith('кадр рендера'))) throw new Error('исключения в кадрах');
});
const api = globalThis.window.bagbier;
clean('отладочный API опубликован', () => { if (!api) throw new Error('нет window.bagbier'); });
const go = documentStub.getElementById('go');
clean('кнопка «НАЧАТЬ РЕЙС» есть и нажимается', () => {
  if (!go) throw new Error('в меню нет #go');
  go.click();
});
step(20);

console.log('--- интерфейс ---');
clean('в интерфейсе видна метка сборки (по ней сразу ясно, свежий ли код)', () => {
  const b = registry.get('tb-build');
  if (!b) throw new Error('нет элемента #tb-build');
  if (/…/.test(b.textContent)) throw new Error('метка не заполнена — значит код не доехал до старта: ' + b.textContent);
  console.log('    · ' + b.textContent);
});
clean('нарратив заполняется (спикер, заголовок, текст)', () => {
  const n = api.narrative();
  if (!n.title || n.title === '…') throw new Error('нет заголовка события');
  if (!n.text || n.text.length < 20) throw new Error('текст события пуст');
  if (!n.speaker) throw new Error('не выбран спикер');
  console.log('    · ' + n.speaker + ': «' + n.title + '» — ' + n.text.slice(0, 70) + '…');
});
clean('есть варианты выбора', () => {
  if (api.choices().length < 2) throw new Error('вариантов: ' + api.choices().length);
});
clean('ресурсы показаны чипами', () => {
  const chips = documentStub.querySelectorAll('.chip-res');
  if (chips.length < 6) throw new Error('чипов: ' + chips.length);
});
clean('кнопки действий отрисованы', () => {
  const host = registry.get('actions');
  const acts = host.querySelectorAll('.act');
  const travel = host.querySelectorAll('[data-travel]');
  const all = host._all();
  if (acts.length < 4 || travel.length < 3){
    throw new Error(`кнопок .act=${acts.length}, перегона=${travel.length}, всего детей=${host.children.length}, `
      + `innerHTML=${host.innerHTML.length}, phase=${api.state.phase}, теги=${all.map((c) => c.tagName).join(',')}`);
  }
});
clean('панель подробностей открывается и закрывается', () => {
  const d = registry.get('drawer');
  registry.get('tb-details').click();
  if (!d.classList.contains('on')) throw new Error('не открылась');
  registry.get('drawer-close').click();
  if (d.classList.contains('on')) throw new Error('не закрылась');
});

console.log('--- бредометр ---');
clean('бредометр растёт от выпивки и меняет рассказчика', () => {
  const before = api.mad().value;
  for (let i = 0; i < 4; i++) api.act('drink');
  const after = api.mad().value;
  if (!(after > before)) throw new Error(`бредометр не вырос: ${before} → ${after}`);
  console.log(`    · бредометр ${before.toFixed(0)} → ${after.toFixed(0)} (${api.mad().label})`);
});
let madTexts = new Set();
clean('при высоком бредометре текст событий становится другим', () => {
  api.newRun(4242);
  const ev = api.state.currentEvent;
  if (!ev) throw new Error('нет текущего события');
  const real = api.state;
  const seen = [];
  for (const v of [5, 30, 60, 80, 97]){
    const fake = Object.assign({}, real);
    fake.mad = v;
    api.setTestState(fake);
    api.refresh();
    seen.push(v + ' (' + api.mad().label + '): ' + api.narrative().text.slice(0, 46));
  }
  api.setTestState(real);
  madTexts = new Set(seen.map((s) => s.split(': ').slice(1).join(': ')));
  if (madTexts.size < 3) throw new Error('текст почти не меняется: вариантов ' + madTexts.size + ' → ' + [...madTexts].join(' / '));
  seen.forEach((s) => console.log('    · ' + s));
});
clean('при бредометре 90+ появляются варианты про неё', () => {
  api.newRun(999);
  const real = api.state;
  const fake = Object.assign({}, real);
  fake.mad = 95; fake.dist = 3;
  api.setTestState(fake);
  api.refresh();
  const raw = registry.get('choices').innerHTML;
  const labels = api.choices().map((c) => c.label);
  api.setTestState(real);
  const hasLove = labels.some((l) => /окн|неё|она|налить ей|позвать/i.test(l));
  if (!hasLove){
    throw new Error(`нет «бредовых» вариантов. labels=[${labels.join(' | ')}] html=${raw.slice(0, 240)}`);
  }
  console.log('    · ' + labels.filter((l) => /окн|неё|она|налить ей|позвать/i.test(l)).join(' | '));
});

console.log('--- инопланетная линия ---');
clean('событие «она за окном» появляется при высоком бредометре', () => {
  let found = false;
  for (let seed = 1; seed <= 60 && !found; seed++){
    api.newRun(seed * 7919);
    api.state.mad = 70;
    api.state.dist = 2.5;
    for (let t = 0; t < 12; t++){
      if (api.state.currentEvent && api.state.currentEvent.id === 'alien_window'){ found = true; break; }
      api.travel('leg');
    }
  }
  if (!found) throw new Error('событие alien_window не выпало за 60 попыток');
});
clean('все события инопланетной линии проходят без исключений', () => {
  const ids = ['alien_window', 'alien_tambur', 'alien_night', 'alien_fiancee'];
  for (const id of ids){
    const e = eventsMod.EVENTS.find((x) => x.id === id);
    if (!e) throw new Error('нет события ' + id);
    e.choices.forEach((c, i) => {
      const st = api.state;
      st.mad = 90; st.alien = 60; st.bag = 40; st.dist = 3;
      st.flags.alienMet = true;
      try { c.run(st); } catch (err){ throw new Error(`${id} выбор ${i}: ${err.message}`); }
    });
    console.log(`    · ${id}: ${e.choices.length} варианта(ов) — ок`);
  }
});
clean('особый финал «ХВАТИЛО НА ДВОИХ» выдаётся', () => {
  api.newRun(31337);
  api.state.flags.alienFiance = true;
  api.state.alien = 90;
  api.state.bag = 14;
  const over = api.forceEnd(true);
  if (!over || over.grade !== 'S+') throw new Error('особый финал не сработал: ' + JSON.stringify(over && over.grade));
  const text = api.screenText();
  if (!/ХВАТИЛО НА ДВОИХ/.test(text)) throw new Error('нет звания в экране: ' + text.slice(0, 90));
  console.log('    · ' + text.slice(0, 100));
});

console.log('--- мини-игры (все четыре, через настоящий ввод) ---');
const mgCtl = new mgMod.Minigames(new renderMod.Renderer((() => {
  const wrap = new El('div');
  const c = new El('canvas');
  c.getContext = () => { const g = makeCtx(); g.canvas = c; return g; };
  wrap.appendChild(c);
  return c;
})()));

function playMg(kind, strategy){
  let res = null, frames = 0;
  mgCtl.start(kind, (r) => { res = r; });
  const model0 = mgCtl.mg;
  while (!res && frames < 4000){
    const m = mgCtl.mg;
    if (!m) break;
    if (strategy === 'tap') mgCtl.press(true, { x: 700, y: 400 });
    else if (strategy === 'rhythm'){
      // тапаем, когда нота близко к метке (метка у x0 = 82% ширины)
      let near = false;
      for (const n of m.notes){ if (!n.hit && Math.abs(n.t - (m.elapsed || 0)) < 0.26){ near = true; break; } }
      if (near) mgCtl.press(true, { x: 1500, y: 400 });
    } else if (strategy === 'pour'){
      const want = m.level < m.target - 0.02;
      mgCtl.press(want, { x: 800, y: 400 });
    } else if (strategy === 'sync'){
      // жмём, когда обе метки в зоне (у неё может быть свой ход — тогда ждём пересечения)
      const inA = m.a >= m.zone.s && m.a <= m.zone.s + m.zone.w;
      const inB = m.b >= m.zone.s && m.b <= m.zone.s + m.zone.w;
      mgCtl.press(inA && inB, { x: 800, y: 400 });
    } else if (strategy === 'dock'){
      // ведём вагон к кольцу: тапаем только когда нужно подправить курс (как живой игрок)
      const diff = m.portY - m.y;
      const wantVel = Math.max(-0.35, Math.min(0.35, diff * 2));
      const err = wantVel - m.vel;
      mgCtl.press(Math.abs(err) > 0.06, { x: 400, y: err < 0 ? 60 : 260 });
    }
    step(1, 20); frames++;
  }
  return { res, frames, model0 };
}

for (const [kind, strat, minGrade] of [
  ['tap', 'tap', 'perfect'],
  ['rhythm', 'rhythm', 'good'],
  ['pour', 'pour', 'perfect'],
  ['sync', 'sync', 'good'],
  ['dock', 'dock', 'perfect'],
]){
  clean('мини-игра «' + kind + '»: доигрывается и даёт оценку', () => {
    const r = playMg(kind, strat);
    if (!r.res) throw new Error('не завершилась за 4000 кадров');
    if (!['perfect', 'good', 'bad'].includes(r.res.grade)) throw new Error('оценка: ' + r.res.grade);
    console.log(`    · ${kind}: оценка ${r.res.grade}, кадров ${r.frames}, ${r.res.text || ''}`);
    const rank = { bad: 0, good: 1, perfect: 2 };
    if (minGrade && rank[r.res.grade] < rank[minGrade]){
      throw new Error(`автоигрок должен был сыграть минимум на «${minGrade}», а получил «${r.res.grade}»`);
    }
  });
}

clean('мини-игра рисуется без исключений', () => {
  const before = errors.length;
  mgCtl.start('tap', () => {});
  step(30, 20);
  mgCtl.abort();
  const fresh = errors.slice(before).filter((e) => e.startsWith('кадр рендера'));
  if (fresh.length) throw new Error('исключения при отрисовке: ' + fresh[0]);
});

/* --- ключевая проверка: мини-игра РЕАЛЬНО рисует, а не оставляет чёрный холст --- */
for (const kind of ['tap', 'rhythm', 'pour', 'sync', 'dock']){
  clean('мини-игра «' + kind + '» реально что-то рисует на холсте', () => {
    const rec = [];
    const wrap = new El('div');
    const cv = new El('canvas');
    cv.getContext = () => { const c = makeCtx(rec); c.canvas = cv; return c; };
    cv.clientWidth = 640; cv.clientHeight = 320;
    wrap.appendChild(cv);
    const r = new renderMod.Renderer(cv);
    const r2 = new renderMod.Renderer(cv);
    void r2;
    r.cssW = 800; r.cssH = 300;
    const mini = new mgMod.Minigames(r);
    mini.start(kind, () => {});
    rec.length = 0;
    step(6, 20);
    mini.abort();
    const paints = rec.filter((c) => /^(fill|stroke|fillRect|fillText|drawImage|rect|arc|ellipse|roundRect|moveTo|lineTo)\(/.test(c));
    if (paints.length < 12){
      throw new Error(`нарисовано всего ${paints.length} операций: ${[...new Set(rec)].slice(0, 12).join(', ')}`);
    }
    const hasText = rec.some((c) => c.startsWith('fillText'));
    if (!hasText) throw new Error('нет ни одной надписи на холсте');
  });
}

clean('мини-игра рисуется на СВОЁМ холсте, а не на холсте сцены', () => {
  const sceneRec = [], mgRec = [];
  const sceneCv = new El('canvas');
  sceneCv.clientWidth = 900; sceneCv.clientHeight = 300;
  sceneCv.getContext = () => { const c = makeCtx(sceneRec); c.canvas = sceneCv; return c; };
  const wrap = new El('div'); wrap.appendChild(sceneCv);
  const r = new renderMod.Renderer(sceneCv);
  r.cssW = 900; r.cssH = 300;

  // холст мини-игры ищем через document (как в настоящей игре)
  const mgCv = registry.get('mg-canvas');
  mgCv.clientWidth = 640; mgCv.clientHeight = 320;
  mgCv.getContext = () => { const c = makeCtx(mgRec); c.canvas = mgCv; return c; };
  mgCv.width = 0; mgCv.height = 0;

  const mini = new mgMod.Minigames(r);
  mini.start('tap', () => {});
  mgRec.length = 0;
  sceneRec.length = 0;
  step(5, 20);
  mini.abort();

  const mgPaints = mgRec.filter((c) => /^(fill|stroke|fillRect|fillText|drawImage|arc|roundRect)\(/.test(c));
  if (mgPaints.length < 8) throw new Error('на холсте мини-игры нарисовано всего ' + mgPaints.length + ' операций');
  // размеры холста должны быть в device-пикселях, а не дефолтные 300x150
  if (mgCv.width <= 300 || mgCv.height <= 150){
    throw new Error(`холст мини-игры остался дефолтного размера: ${mgCv.width}x${mgCv.height} — это и есть чёрный экран`);
  }
  console.log('    · холст мини-игры: ' + mgCv.width + 'x' + mgCv.height + ' (device px), операций ' + mgPaints.length);
});
clean('закрытие мини-игры возвращает интерфейс', () => {
  mgCtl.start('pour', () => {});
  mgCtl.abort();
  if (mgCtl.active) throw new Error('мини-игра осталась активной');
  if (!registry.get('mg').hidden) throw new Error('оверлей не скрылся');
});

clean('мини-игра в перегоне запускается, играется и закрывается (как в игре)', async () => {
  api.newRun(555);
  let started = 0;
  for (let attempt = 0; attempt < 14 && !started; attempt++){
    const chs = api.choices();
    if (!chs.length){ api.travel('leg'); await sleep(60); continue; }
    const ok = chs.map((c, i) => ({ c, i })).filter((x) => x.c.ok);
    api.choose(ok[(Math.random() * ok.length) | 0].i);
    for (let w = 0; w < 45 && !api.minigame(); w++) await sleep(60);
    if (!api.minigame()) continue;
    started++;
    const title = api.minigame();
    if (title === 'МИНИ-ИГРА') throw new Error('заголовок дефолтный — start() не выполнился');
    if (!/сборка/.test(title)) throw new Error('в заголовке нет метки сборки: ' + title);
    if (!api.minigameModel()) throw new Error('модель мини-игры не создана');
    for (let f = 0; f < 400 && api.minigame(); f++){
      const m = api.minigameModel();
      if (!m) break;
      if (m.kind === 'dock'){
        const diff = m.portY - m.y;
        const want = Math.max(-0.35, Math.min(0.35, diff * 2));
        const err = want - m.vel;
        mgCtl.press(Math.abs(err) > 0.06, { x: 400, y: err < 0 ? 60 : 260 });
      } else if (m.kind === 'pour'){
        mgCtl.press(m.level < m.target - 0.02, { x: 800, y: 400 });
      } else {
        mgCtl.press(true, { x: 700, y: 400 });
      }
      step(2, 25);
      await sleep(2);
    }
    step(4);
    await sleep(250);
    if (api.minigame()){
      // автоигрок не идеален (особенно на «удержании»), поэтому это не провал теста:
      // доигрываемость каждой мини-игры проверяется отдельными тестами ниже
      console.log('    · «' + title + '» ещё идёт (автоигрок не дожал) — закрываю принудительно');
      mgCtl.abort();
      await sleep(60);
    }
    if (registry.get('mg').hidden !== true) throw new Error('оверлей остался видимым');
    console.log('    · «' + title + '» запущена в игре и закрыта');
  }
  if (!started) throw new Error('мини-игра так и не выпала за 14 попыток');
});

clean('мини-игра не остаётся висеть, даже если модель сломалась', () => {
  const wrap = new El('div');
  const cv = new El('canvas');
  cv.getContext = () => { const c = makeCtx(); c.canvas = cv; return c; };
  wrap.appendChild(cv);
  const r = new renderMod.Renderer(cv);
  const mini = new mgMod.Minigames(r);
  // ломаем создание модели
  mini._create = () => { throw new Error('специально сломанная модель'); };
  let res = null;
  mini.start('tap', (x) => { res = x; });
  if (registry.get('mg').hidden) throw new Error('оверлей не показался');
  const title = documentStub.getElementById('mg-title').textContent;
  const hint = documentStub.getElementById('mg-hint').textContent;
  if (title === 'МИНИ-ИГРА') throw new Error('заголовок остался дефолтным — игрок не поймёт, что играет');
  if (/^…?$/.test(hint)) throw new Error('подсказка осталась дефолтной');
  if (!/сломалась|текстом|панел/i.test(hint)) throw new Error('нет текстового режима в подсказке: ' + hint);
  // тапами можно доиграть текстовый режим
  for (let i = 0; i < 30 && !res; i++){ mini.press(true, { x: 100, y: 100 }); step(1, 20); }
  mini.abort();
  if (!res) throw new Error('текстовый режим нельзя доиграть');
  console.log('    · сломанная модель → текстовый режим, оценка ' + res.grade);
});

console.log('--- полный рейс через UI ---');
let turns = 0, events = 0, minigames = 0, finished = null;
for (let i = 0; i < 2500 && finished === null; i++){
  if (api.screen()){ finished = api.screenText(); break; }
  if (api.minigame()){
    minigames++;
    const kind = api.minigameModel() ? api.minigameModel().kind : 'tap';
    for (let f = 0; f < 500 && api.minigame(); f++){
      const m = api.minigameModel();
      if (!m) break;
      if (kind === 'tap') mgCtl.press(true, { x: 700, y: 400 });
      else if (kind === 'pour') mgCtl.press(m.level < m.target - 0.02, { x: 800, y: 400 });
      else if (kind === 'dock'){
        const diff = m.portY - m.y;
        const wantVel = Math.max(-0.35, Math.min(0.35, diff * 2));
        const err = wantVel - m.vel;
        mgCtl.press(Math.abs(err) > 0.06, { x: 400, y: err < 0 ? 60 : 260 });
      }
      else if (kind === 'sync'){
        const inA = m.a >= m.zone.s && m.a <= m.zone.s + m.zone.w;
        mgCtl.press(inA, { x: 800, y: 400 });
      } else if (Array.isArray(m.notes)){
        if (m.notes.some((n) => !n.hit && Math.abs(n.t - (m.elapsed || 0)) < 0.26)) mgCtl.press(true, { x: 1500, y: 400 });
      } else {
        // неизвестный вид мини-игры — просто тапаем, лишь бы не падать
        mgCtl.press(true, { x: 700, y: 400 });
      }
      step(2, 25);
      await sleep(2);
    }
    step(6);
    await sleep(150);
    continue;
  }
  const chs = api.choices();
  if (chs.length){
    events++;
    const ok = chs.map((c, idx) => ({ c, idx })).filter((x) => x.c.ok);
    if (!ok.length){ record('выборы')(new Error('все выборы заблокированы')); break; }
    api.choose(ok[(Math.random() * ok.length) | 0].idx);
    step(8);
    await sleep(1700);
    step(8);
    continue;
  }
  const usable = api.actions().filter((a) => a.avail && !a.id.startsWith('item_'));
  if (usable.length && Math.random() < 0.35){
    api.act(usable[(Math.random() * usable.length) | 0].id);
    step(6);
    await sleep(40);
  } else {
    const r = Math.random();
    if (turns >= 16) api.state.dist = Math.max(api.state.dist, 4.09);   // бюджет теста
    api.travel(r < 0.15 ? 'full' : r < 0.35 ? 'drift' : 'leg');
    turns++;
    step(6);
  }
  await sleep(8);
}
console.log(`  ✓ перегонов=${turns}, событий=${events}, мини-игр=${minigames}`);
clean('рейс дошёл до финального экрана', () => {
  if (!finished) throw new Error('за 2500 шагов рейс не завершился');
  console.log('    · ' + finished.slice(0, 110));
});
clean('в протоколе есть бредометр и «она»', () => {
  if (!/ПРОТОКОЛ РЕЙСА/.test(finished)) throw new Error('нет протокола');
  if (!/Бредометр/.test(finished)) throw new Error('нет бредометра в протоколе');
});

console.log('--- финальные экраны ---');
clean('экран поражения рисуется', () => {
  api.newRun(777002);
  api.state.bag = 0.01;
  api.forceEnd(false);
  const text = api.screenText();
  if (!/ХВАТИТ|НЕ ХВАТИЛО|ВЫСАДИЛИ|МИНУС|ПРЕРВАН|НЕ УСПЕЛИ/i.test(text)) throw new Error('нет текста поражения: ' + text.slice(0, 100));
  console.log('    · ' + text.slice(0, 100));
});
clean('меню снова открывается', () => {
  api.menu();
  if (!api.screen()) throw new Error('меню не открылось');
  if (!documentStub.getElementById('go')) throw new Error('в меню нет кнопки старта');
});

console.log('\n=== ИТОГ ===');
if (errors.length){
  console.log('ОШИБОК: ' + errors.length);
  errors.slice(0, 25).forEach((e) => console.log(' • ' + e));
  process.exit(1);
}
console.log('✔ рантайм-тест пройден без ошибок');
process.exit(0);
