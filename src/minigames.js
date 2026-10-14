/* =====================================================================
   МИНИ-ИГРЫ: тряска, ритм «67», удержание, вагон-скроллер
   Все рисуются рендерером на сцене, тут — логика и оверлей
   ===================================================================== */

import { sfx } from './audio.js';

const $ = (s) => document.querySelector(s);

const DEFS = {
  shake: {
    title: 'ТРЯСКА ПЯТИЛИТРУХИ',
    hint: 'Жми ЛКМ / ПРОБЕЛ, когда бегунок в зелёной зоне. Нужно 3 попадания из 3 — тогда багбира станет больше.',
    time: 9.5,
  },
  rhythm: {
    title: 'РИТМ «67»',
    hint: 'Жми в такт ромбам. Идеальные попадания дают +2. Ритм тряски = разгон поезда.',
    time: 8.5,
  },
  hold: {
    title: 'УДЕРЖАТЬ УРОВЕНЬ',
    hint: 'Зажми палец/мышь в синей зоне и держи. Полоска внизу — прогресс.',
    time: 14,
  },
  dodge: {
    title: 'ВАГОН-СКРОЛЛЕР: ПЕРЕГОН',
    hint: 'Веди вагон мышью/пальцем или стрелками. Лови 5Л, уклоняйся от камней. Три жизни.',
    time: 20,
  },
};

export class Minigames {
  constructor(renderer){
    this.r = renderer;
    this.el = $('#mg');
    this.titleEl = $('#mg-title');
    this.hintEl = $('#mg-hint');
    this.hudEl = $('#mg-hud');
    this.skipBtn = $('#mg-skip');
    this.current = null;
    this.done = null;
    this.timer = 0;
    this._bind();
  }

  _bind(){
    const press = (e) => {
      if (!this.current) return;
      if (e && e.preventDefault) e.preventDefault();
      const m = this.r.mg;
      if (m) m.mixing = true;                 // удержание (мини-игра hold)
      this.r.input(true, null, null);
      this._tapFx();
    };
    const release = () => {
      if (!this.current) return;
      const m = this.r.mg;
      if (m) m.mixing = false;
      this.r.input(false, null, null);
    };

    this.el.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('keyup', (e) => {
      if (!this.current) return;
      if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'Enter') release();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.current) return;
      if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'Enter'){
        e.preventDefault();
        const m = this.r.mg;
        if (m) m.mixing = true;
        this.r.input(true, null, null);
        this._tapFx();
      }
      if (this.current === 'dodge'){
        const m = this.r.mg;
        if (!m) return;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') m.playerX = Math.max(160, m.playerX - 90);
        if (e.code === 'ArrowRight' || e.code === 'KeyD') m.playerX = Math.min(1440, m.playerX + 90);
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (this.current !== 'dodge') return;
      const rect = this.r.cv.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 1600;
      this.r.input(false, x, null);
    });
    this.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.current) return;
      this._end({ grade: 'bad', score: 0, skipped: true });
    });
  }

  _tapFx(){
    const m = this.r.mg;
    if (!m) return;
    if (this.current === 'shake') sfx.mem67();
    else if (this.current === 'rhythm') sfx.ui();
    else if (this.current === 'hold') sfx.sip();
  }

  /** Запуск. resolve({grade, score}) */
  start(kind, resolve){
    const def = DEFS[kind] || DEFS.shake;
    this.current = kind;
    this.done = resolve;
    this.titleEl.textContent = def.title;
    this.hintEl.textContent = def.hint;
    this.hudEl.innerHTML = '';
    this.el.hidden = false;
    this.r.startMinigame(kind, (res) => this._end(res));
    this._startWatchdog(def.time + 6);
    sfx.ui();
  }

  _startWatchdog(sec){
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.current) this._end({ grade: 'bad', score: 0, timeout: true });
    }, sec * 1000);
  }

  _end(res){
    if (!this.current) return;
    clearTimeout(this.timer);
    const cb = this.done;
    this.current = null;
    this.done = null;
    this.el.hidden = true;
    this.r.stopMinigame();
    if (res.grade === 'perfect') sfx.perfect();
    else if (res.grade === 'good') sfx.good();
    else sfx.fail();
    if (cb) cb(res);
  }

  get active(){ return !!this.current; }
}
