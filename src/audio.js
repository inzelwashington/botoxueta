/* =====================================================================
   ЗВУК: процедурная атмосфера поезда + сэмплы из assets/
   ===================================================================== */

const FILES = {
  wow:    ['assets/sfx-wow.mp3',      0.85],
  crack:  ['assets/sfx-crack.mp3',    0.70],
  bruh:   ['assets/sfx-bruh.mp3',     0.80],
  core:   ['assets/sfx-core.mp3',     0.80],
  ding:   ['assets/sfx-ding.mp3',     0.60],
  fart:   ['assets/sfx-fart.mp3',     0.75],
  fah:    ['assets/sfx-fah.mp3',      0.75],
  galaxy: ['assets/sfx-galaxy.mp3',   0.85],
  jump:   ['assets/sfx-jump.mp3',     0.60],
  airhorn:['assets/sfx-airhorn.mp3',  0.55],
  rizz:   ['assets/sfx-rizz.mp3',     0.85],
  s67:    ['assets/sfx-67.mp3',       0.70],
  hd:     ['assets/sfx-hd.mp3',       0.40],
  // CC0-музыка (см. README, раздел «Лицензии на ассеты»)
  space:  ['assets/music-space.ogg',  0.55],
  soviet: ['assets/music-soviet.ogg', 0.45],
  horn:   ['assets/sfx-horn.ogg',     0.75],
};

// длинные файлы помечаем как «музыкальные»: играют тише и в одиночку
const MUSIC = new Set(['hd', 'galaxy', 'space', 'soviet']);

const pools = {};
let ctx = null;
let master = null, musicGain = null, sfxGain = null;
let muted = false;
let ambience = null;
let musicEl = null;
let musicKey = null;
let unlocked = false;
const lastPlay = {};

/* --------------------------- подготовка ---------------------------- */
export function preload(){
  for (const [key, [url]] of Object.entries(FILES)){
    const a = new Audio();
    a.src = url;
    a.preload = 'auto';
    a.crossOrigin = 'anonymous';
    const pool = [];
    for (let i = 0; i < 3; i++) pool.push(i === 0 ? a : a.cloneNode(true));
    pools[key] = pool;
    a.addEventListener('error', () => { FILES[key] = null; }, { once:true });
  }
}

export function unlock(){
  if (unlocked) return;
  unlocked = true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.85;
    sfxGain.connect(master);
    startAmbience();
  } catch (_) { ctx = null; }
  for (const pool of Object.values(pools)) {
    if (!pool) continue;
    pool.forEach((a) => { try { a.load(); } catch(_){} });
  }
}

export function isMuted(){ return muted; }

export function setMuted(v){
  muted = !!v;
  if (master) master.gain.value = muted ? 0 : 0.9;
  if (musicEl) musicEl.muted = muted;
  try { localStorage.setItem('bagbier.mute', muted ? '1' : '0'); } catch(_){}
}

export function restoreMute(){
  try {
    const v = localStorage.getItem('bagbier.mute');
    if (v === '1') muted = true;
  } catch(_){}
  return muted;
}

/* --------------------------- сэмплы -------------------------------- */
export function play(key, { vol = 1, rate = 1, dedupe = 90 } = {}){
  if (muted) return;
  const entry = FILES[key];
  const pool = pools[key];
  if (!entry || !pool) return;
  const now = performance.now();
  if (dedupe && lastPlay[key] && now - lastPlay[key] < dedupe) return;
  lastPlay[key] = now;

  const isMusic = MUSIC.has(key);
  const gain = entry[1] * vol * (isMusic ? 0.7 : 1);

  // музыкальные — через WebAudio (если есть), чтобы не глохли
  if (ctx && isMusic) playViaCtx(key, gain, rate);
  else playViaTag(pool, gain, rate);
}

function playViaTag(pool, gain, rate){
  const a = pool.find((el) => el.paused || el.ended) || pool[0];
  try {
    a.pause();
    a.currentTime = 0;
    a.volume = Math.max(0, Math.min(1, gain));
    a.playbackRate = rate;
    a.play().catch(() => {});
  } catch (_) {}
}

function playViaCtx(key, gain, rate){
  const pool = pools[key];
  if (!pool) return;
  const el = pool[0];
  if (!el.dataset.src) el.dataset.src = el.src;
  // уже декодировали?
  const buf = bufferCache[key];
  if (buf){
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g); g.connect(musicGain);
    src.start();
    return;
  }
  playViaTag(pool, gain, rate);
}

const bufferCache = {};

async function decodeAll(){
  if (!ctx) return;
  for (const [key, entry] of Object.entries(FILES)){
    if (!entry || !MUSIC.has(key) || bufferCache[key]) continue;
    try {
      const res = await fetch(entry[0]);
      const ab = await res.arrayBuffer();
      bufferCache[key] = await ctx.decodeAudioData(ab);
    } catch (_) {}
  }
}
export { decodeAll };

/* ------------------------ атмосфера поезда ------------------------- */
let clackTimer = 0;
let clackPhase = 0;
let clackRate = 1.55; // стуков в секунду
let ambVol = 0.5;

export function setTrainSpeed(v){ clackRate = 0.9 + v * 1.5; }
export function setAmbienceVolume(v){ ambVol = Math.max(0, Math.min(1, v)); }

function noiseBuffer(){
  const len = Math.floor(ctx.sampleRate * 0.35);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
  return buf;
}

let nbuf = null;

function clack(){
  if (!ctx || muted) return;
  if (!nbuf) nbuf = noiseBuffer();
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = nbuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 130 + Math.random() * 90;
  bp.Q.value = 1.4;
  const g = ctx.createGain();
  const amp = 0.5 * ambVol;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  src.connect(bp); bp.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 0.2);
}

function startAmbience(){
  if (!ctx || ambience) return;
  // гул вагона: низкий дрон
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 42;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 180;
  const g = ctx.createGain(); g.gain.value = 0.05 * ambVol;
  osc.connect(lp); lp.connect(g); g.connect(sfxGain);
  osc.start();
  ambience = { osc, g };
  // цикл стука
  const tick = () => {
    if (!ambience) return;
    const interval = 1000 / clackRate;
    const beat = clackPhase % 4;
    if (beat < 2) clack();          // «тух-тух»
    clackPhase++;
    clackTimer = setTimeout(tick, beat === 1 ? interval * 0.62 : interval * 0.38);
  };
  tick();
}

export function stopAmbience(){
  if (clackTimer) { clearTimeout(clackTimer); clackTimer = 0; }
  if (ambience){ try { ambience.osc.stop(); } catch(_){} ambience = null; }
}

/* --------------------------- музыка-петля -------------------------- */
export function music(key, vol = 1){
  if (muted) return;
  if (musicKey === key && musicEl && !musicEl.paused) return;
  stopMusic();
  const entry = FILES[key];
  if (!entry) return;
  musicEl = new Audio(entry[0]);
  musicEl.loop = true;
  musicEl.volume = entry[1] * vol * 0.8;
  musicEl.muted = muted;
  musicEl.play().catch(() => {});
  musicKey = key;
}

export function stopMusic(){
  if (musicEl){ try { musicEl.pause(); } catch(_){} musicEl = null; }
  musicKey = null;
}

/* ---------------------- удобные «мемные» связки -------------------- */
export const sfx = {
  ui:      () => play('ding', { vol: .35, dedupe: 40 }),
  ding:    () => play('ding', { vol: .55, dedupe: 40 }),
  hit:     () => play('crack', { vol: .8 }),
  fail:    () => play('bruh', { vol: .9 }),
  good:    () => play('core', { vol: .7 }),
  win:     () => { play('airhorn', { vol: .6 }); play('wow', { vol: .8, dedupe: 0 }); },
  rizz:    () => play('rizz', { vol: .95 }),
  mem67:   () => play('s67', { vol: .85 }),
  fart:    () => play('fart', { vol: .9 }),
  scream:  () => play('fah', { vol: .85 }),
  jump:    () => play('jump', { vol: .6 }),
  space:   () => play('galaxy', { vol: .9 }),
  boom:    () => { play('crack', { vol: 1 }); play('hd', { vol: .8, dedupe: 0 }); },
  sip:     () => { play('fart', { vol: .22, rate: 1.7, dedupe: 30 }); },
  perfect: () => { play('core', { vol: .8 }); play('rizz', { vol: .5, dedupe: 0 }); },
  horn:    () => play('horn', { vol: .8 }),
  station: () => { play('horn', { vol: .8 }); play('ding', { vol: .45, dedupe: 0 }); },
};

/** Все доступные ключи — тест проверяет, что игра не зовёт несуществующий звук. */
export const sfxKeys = Object.keys(sfx);
