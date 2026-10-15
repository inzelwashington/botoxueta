/* =====================================================================
   МИНИ-ИГРЫ
   ---------------------------------------------------------------------
   Четыре штуки, все управляются одинаково: ТАП или ДЕРЖИ палец/мышь
   по картинке. Никаких клавиатур и ловли мелких зон.

     1. ТРЯСКА   — части тапами, пока не вышло время. Больше тапов — лучше.
     2. РИТМ 67  — тапай, когда ромб подходит к метке.
     3. РАЗЛИВ   — держи, чтобы налить ровно до метки. Много не наливай.
     4. СИНХРОН   — она повторяет движения. Тапни, когда обе метки совпали.

   Логика живёт здесь, рисование — в render.js (drawMinigame).
   ===================================================================== */

import { sfx } from './audio.js';

/** Версия сборки — печатается прямо в окне мини-игры, чтобы сразу видеть,
    работает ли страница на свежем коде или на старом из кэша. */
export const BUILD = 'v9';

const $ = (s) => document.querySelector(s);

export const MG_DEFS = {
  tap: {
    title: 'ТРЯСКА ПЯТИЛИТРУХИ',
    hint: 'ТАПАЙ ПО БУТЫЛКЕ как можно быстрее. Чем больше тапов — тем лучше поднимется осадок.',
    time: 7,
  },
  rhythm: {
    title: 'РИТМ «67»',
    hint: 'ТАПАЙ, когда ромб подходит к зелёной метке. Промах — минус очко.',
    time: 11,
  },
  pour: {
    title: 'РАЗЛИТЬ ПО СТАКАНАМ',
    hint: 'ДЕРЖИ палец, чтобы налить. Отпусти точно на метке. Пролитое — потеряно.',
    time: 14,
  },
  sync: {
    title: 'СИНХРОН С НЕЙ',
    hint: 'Она повторяет за тобой. ТАПАЙ в момент, когда обе метки в зелёной зоне.',
    time: 9,
  },
  dock: {
    title: 'СТЫКОВКА НА РАЗЪЕЗДЕ',
    hint: 'ТАПАЙ ВВЕРХ или ВНИЗ, чтобы вести вагон. Попади в кольцо стыковки и удерживай курс — 3 стыковки подряд.',
    time: 22,
  },
};

export class Minigames {
  constructor(renderer){
    this.r = renderer;
    this.el = $('#mg');
    this.titleEl = $('#mg-title');
    this.hintEl = $('#mg-hint');
    this.scoreEl = $('#mg-score');
    this.timerEl = $('#mg-timer');
    this.skipBtn = $('#mg-skip');
    this.canvas = $('#mg-canvas');
    this.ctrlEl = $('#mg-ctrl');
    this.upBtn = $('#mg-up');
    this.downBtn = $('#mg-down');
    this.kind = null;
    this.mg = null;
    this.done = null;
    this.raf = 0;
    this.last = 0;
    this._bind();
  }

  get active(){ return !!this.kind; }

  /* ---------------------------- ввод ---------------------------- */
  _bind(){
    const down = (e) => {
      if (!this.kind) return;
      e.preventDefault();
      if (e.pointerId != null && this.canvas.setPointerCapture){
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      }
      this.press(true, this._xy(e));
      sfx.ui();
    };
    const up = (e) => {
      if (!this.kind) return;
      if (e) e.preventDefault();
      this.press(false);
    };
    const move = (e) => {
      if (!this.kind || e.buttons === 0) return;
      this.move(this._xy(e));
    };

    this.canvas.addEventListener('pointerdown', down);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerup', () => up(null));
    window.addEventListener('blur', () => this.press(false));

    this.skipBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.kind) this.finish({ grade: 'bad', skipped: true });
    });

    /* Большие кнопки ▲▼ для стыковки: работают даже если холст не рисуется.
       Жмёшь и держишь — то же самое, что «тап в верхней/нижней половине». */
    const hold = (dir) => (e) => {
      if (!this.kind) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget && e.currentTarget.setPointerCapture && e.pointerId != null){
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_){}
      }
      this.press(true, { x: 800, y: dir < 0 ? 60 : 700 });
    };
    const drop = (e) => {
      if (!this.kind) return;
      if (e && e.stopPropagation) e.stopPropagation();
      this.press(false, null);
    };
    for (const [btn, dir] of [[this.upBtn, -1], [this.downBtn, 1]]){
      if (!btn) continue;
      btn.addEventListener('pointerdown', hold(dir));
      btn.addEventListener('pointerup', drop);
      btn.addEventListener('pointerleave', drop);
      btn.addEventListener('pointercancel', drop);
    }
    if (this.ctrlEl) this.ctrlEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  _xy(e){
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * 1600,
      y: ((e.clientY - r.top) / Math.max(1, r.height)) * 900,
    };
  }

  /* ---------------------------- запуск ----------------------------
     Порядок важен: сначала ВСЁ, что видит игрок (заголовок, подсказка,
     таймер), и только потом модель и цикл. Если модель почему-то не
     создалась — окно не остаётся висеть: показываем текстовый режим. */
  start(kind, resolve){
    const def = MG_DEFS[kind] || MG_DEFS.tap;
    this.kind = kind;
    this.done = resolve;
    this.drawFails = 0;
    this.tickFails = 0;
    this.fallback = false;
    this.token = (this.token || 0) + 1;
    this.runToken = this.token;
    if (this.scoreEl) this.scoreEl.textContent = '';

    // всё, что видит игрок, ставим ДО создания модели: даже если модель упадёт,
    // на экране будет понятная надпись, а не дефолтное «МИНИ-ИГРА»
    if (this.titleEl) this.titleEl.textContent = def.title + ' · сборка ' + BUILD;
    if (this.hintEl) this.hintEl.textContent = def.hint;
    if (this.timerEl) this.timerEl.textContent = def.time.toFixed(1);
    if (this.ctrlEl) this.ctrlEl.classList.toggle('on', kind === 'dock');
    this.el.hidden = false;
    // сообщаем рендереру, на каком холсте рисовать мини-игру:
    // раньше он рисовал на холст сцены, а холст мини-игры так и оставался чёрным
    this.r.mgCanvas = this.canvas;

    try {
      this.mg = this._create(kind);
      this.r.mg = this.mg;
      this.r._resize?.();          // холст мог быть нулевой ширины, пока оверлей был скрыт
      this._hud(this.mg);
    } catch (err){
      console.error('Мини-игру не удалось создать:', err);
      this.mg = { kind: 'tap', time: def.time, taps: 0, foam: 0, splashes: [] };
      this.r.mg = this.mg;
      this.drawFails = 99;
      this._fallback(this.mg, err);
    }
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this._tick(t));
    sfx.horn();
  }

  /** если холст молчит — показываем текстовый вариант, а не пустоту */
  _fallback(m, err){
    this.fallback = true;
    if (this.scoreEl) this.scoreEl.innerHTML = '⚠ холст недоступен — жми по панели, каждое нажатие считается';
    if (this.hintEl) this.hintEl.textContent = (err ? 'Мини-игра сломалась: ' + err.message + '. ' : '') + 'Жми по панели, чтобы играть текстом.';
    if (this.timerEl) this.timerEl.textContent = '…';
    if (m) m.taps = m.taps || 0;
  }

  _create(kind){
    const R = (a, b) => a + Math.random() * (b - a);
    if (kind === 'tap'){
      return { kind, time: MG_DEFS.tap.time, taps: 0, foam: 0, wobble: 0, splashes: [], best: 0 };
    }
    if (kind === 'rhythm'){
      const notes = [];
      for (let i = 0; i < 14; i++) notes.push({ t: 1.4 + i * 0.62, hit: null });
      return { kind, time: MG_DEFS.rhythm.time, notes, score: 0, combo: 0, maxCombo: 0, miss: 0, flash: 0 };
    }
    if (kind === 'pour'){
      return {
        kind, time: MG_DEFS.pour.time, level: 0, pouring: false,
        target: R(0.52, 0.82), glass: 0, spilled: 0, cups: 0, done: false, flash: 0,
      };
    }
    if (kind === 'dock'){
      // простенький космосим: ведём вагон тапами, попадаем в кольцо, удерживаем курс
      return {
        kind, time: MG_DEFS.dock.time,
        y: 0.5,        // высота вагона 0..1
        portY: R(0.25, 0.75),
        vel: 0,        // инерция по вертикали
        hold: 0,       // удержание курса в кольце (нужно 1.2 с)
        need: 1.2,
        settle: 1.2,   // первые секунды кольцо стоит на месте — время прицелиться
        docks: 0, need3: 3, crashes: 0,
        fuel: 100, flash: 0, shake: 0, dir: 0,
        stars: Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), z: R(0.3, 1) })),
      };
    }
    // sync
    return {
      kind, time: MG_DEFS.sync.time,
      a: 0, ad: 1, b: 0.30, bd: 1, zone: { s: 0.26, w: 0.34 },
      hits: 0, misses: 0, flash: 0, linger: 0, need: 4,
    };
  }

  /* ---------------------------- ввод ---------------------------- */
  press(isDown, p){
    const m = this.mg;
    if (!m) return;
    // ВАЖНО: this.last не трогаем — иначе частые тапы «замораживают» время игры.

    if (m.kind === 'tap'){
      if (isDown){
        m.taps++;
        m.foam = Math.min(1, m.foam + 0.075);
        m.wobble = 1;
        if (m.splashes){
          m.splashes.push({ x: p ? p.x : 800, y: p ? p.y : 400, life: 1 });
          if (m.splashes.length > 40) m.splashes.shift();
        }
        sfx.sip();
        if (this.fallback && m.taps >= 22) this.finish(this._grade(m));
      }
    } else if (m.kind === 'rhythm'){
      if (isDown){
        // ВАЖНО: сравниваем с m.elapsed — временем от старта мини-игры,
        // а не с performance.now() (иначе все тапы всегда «мимо»).
        const el = m.elapsed || 0;
        let best = null, bd = 9;
        for (const n of m.notes){ if (n.hit) continue; const d = Math.abs(n.t - el); if (d < bd){ bd = d; best = n; } }
        if (best && bd < 0.5){
          const perfect = bd < 0.22;
          best.hit = perfect ? 'perfect' : 'good';
          m.score += perfect ? 2 : 1;
          m.combo++; m.maxCombo = Math.max(m.maxCombo, m.combo);
          m.flash = perfect ? 1 : 0.5;
          if (perfect) sfx.mem67(); else sfx.good();
        } else {
          m.miss++; m.combo = 0; m.flash = -1;
          sfx.fail();
        }
      }
    } else if (m.kind === 'pour'){
      m.pouring = isDown;
      if (!isDown && m.level > 0.03) this._lockCup(m);
    } else if (m.kind === 'sync'){
      if (isDown){
        const inA = m.a >= m.zone.s && m.a <= m.zone.s + m.zone.w;
        const inB = m.b >= m.zone.s && m.b <= m.zone.s + m.zone.w;
        if (inA && inB){
          m.hits++; m.flash = 1;
          m.b = 0.02; m.a = Math.max(0.02, m.a - 0.15);
          sfx.perfect();
        } else {
          m.misses++; m.flash = -1;
          sfx.fail();
        }
      }
    } else if (m.kind === 'dock'){
      if (isDown && p){
        // верхняя половина экрана — вверх, нижняя — вниз
        m.dir = p.y < (this.r.cssH || 300) / 2 ? -1 : 1;
        m.fuel = Math.max(0, m.fuel - 0.25);
        m.vel += m.dir * 0.075;
        m.flash = m.dir < 0 ? 0.4 : -0.4;
      } else if (!isDown){
        m.dir = 0;
      }
    }
  }

  move(p){
    const m = this.mg;
    if (!m) return;
    if (m.kind === 'tap' && m.wobble > 0.2){
      m.splashes.push({ x: p.x, y: p.y, life: 0.8 });
    }
  }

  _lockCup(m){
    const diff = m.level - m.target;
    if (Math.abs(diff) < 0.07){
      m.cups++; m.score = (m.score || 0) + 2;
      m.flash = 1; sfx.ui();
    } else if (diff > 0){
      m.spilled += m.level; m.cups++; m.flash = -1; sfx.fart();
    } else {
      m.cups++; m.flash = 0; sfx.ui();
    }
    m.level = 0;
    m.target = 0.52 + Math.random() * 0.3;
    if (m.cups >= 5) m.done = true;
  }

  /* ---------------------------- цикл ----------------------------
     ВАЖНО: любая ошибка внутри кадра не должна прерывать цикл, иначе окно
     мини-игры остаётся висеть, а холст — чёрным. Поэтому весь кадр в try. */
  _tick(now){
    const m = this.mg;
    if (!m || this.runToken !== this.token) return;      // кадр от прошлой сессии
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    try {
      this._step(m, dt);
      this._hud(m);
      if (this._isOver(m)){ this.finish(this._grade(m)); return; }
      try {
        this.r.drawMinigame(m);
        this.drawFails = 0;
      } catch (e){
        this.drawFails = (this.drawFails || 0) + 1;
        if (this.drawFails === 1) console.error('Ошибка отрисовки мини-игры:', e);
        if (this.drawFails >= 2 && !this.fallback) this._fallback(m, e);
      }
    } catch (err){
      // логика упала — не оставляем игрока в чёрном окне
      this.tickFails = (this.tickFails || 0) + 1;
      if (this.tickFails === 1){
        console.error('Ошибка в логике мини-игры:', err);
        this._fallback(m, err);
      }
      if (m) m.time = Math.min(m.time, 0.2);            // даём окну закрыться самому
      if (this.tickFails > 900){ this.finish({ grade: 'bad', score: 0, broken: true }); return; }
    }
    this.raf = requestAnimationFrame((t) => this._tick(t));
  }

  /** шаг логики: время, эффекты и поведение конкретной мини-игры */
  _step(m, dt){
    m.time -= dt;
    m.elapsed = (m.elapsed || 0) + dt;
    m.wobble = Math.max(0, (m.wobble || 0) - dt * 3);
    m.flash = (m.flash || 0) * Math.pow(0.02, dt);
    for (let i = (m.splashes || []).length - 1; i >= 0; i--){
      m.splashes[i].life -= dt * 1.6;
      if (m.splashes[i].life <= 0) m.splashes.splice(i, 1);
    }

    if (m.kind === 'pour'){
      if (m.pouring) m.level = Math.min(1.15, m.level + dt * 0.42);
    }
    if (m.kind === 'sync'){
      // «залипание» в зоне: даёт игроку честное окно, чтобы попасть
      const inA = m.a >= m.zone.s && m.a <= m.zone.s + m.zone.w;
      const inB = m.b >= m.zone.s && m.b <= m.zone.s + m.zone.w;
      m.linger = (inA && inB) ? (m.linger || 0) + dt : 0;
      const speed = inA && inB ? 0.85 : 0.5;     // в зоне разгоняемся — окно короткое, но честное
      m.a += dt * speed * m.ad;
      m.b += dt * speed * m.bd;
      if (m.a > 1){ m.a = 1; m.ad = -1; }
      if (m.a < 0){ m.a = 0; m.ad = 1; }
      if (m.b > 1){ m.b = 1; m.bd = -1; }
      if (m.b < 0){ m.b = 0; m.bd = 1; }
      if (Math.random() < 0.004) m.bd *= -1;
    }

    if (m.kind === 'dock'){
      // инерция + трение: вагон «плывёт», тапы дают тягу
      m.vel += (m.dir || 0) * 0.55 * dt;
      m.vel *= Math.pow(0.12, dt);
      m.y += m.vel * dt;
      if (m.y < 0.12){ m.y = 0.12; m.vel = Math.abs(m.vel) * 0.25; }
      if (m.y > 0.88){ m.y = 0.88; m.vel = -Math.abs(m.vel) * 0.25; }
      m.fuel = Math.max(0, m.fuel - dt * 0.85);
      m.shake = Math.max(0, (m.shake || 0) - dt * 4);
      m.flash *= 0.9;

      const off = Math.abs(m.y - m.portY);
      const inRing = off < 0.075;
      m.settle = Math.max(0, (m.settle || 0) - dt);
      if (inRing){
        m.hold += dt;
        if (m.hold >= m.need){
          m.docks++; m.hold = 0;
          if (m.docks < m.need3) m.portY = 0.25 + Math.random() * 0.5;
          m.vel *= 0.3;
          m.flash = 1;
          sfx.ding();
          if (m.docks >= m.need3) m.done = true;
        }
      } else {
        m.hold = 0;
        if (m.settle <= 0 && off > 0.3 && Math.random() < 0.02){
          m.crashes++; m.shake = 1; sfx.fail();
        }
      }
      if (m.fuel <= 0 && !m.done){
        m.done = true;
        m.outOfFuel = true;
      }
    }
  }

  _isOver(m){
    if (m.kind === 'pour') return m.done || m.time <= 0;
    if (m.kind === 'dock') return m.done || m.time <= 0;
    return m.time <= 0;
  }

  _grade(m){
    if (m.kind === 'tap'){
      const n = m.taps;
      return { grade: n >= 22 ? 'perfect' : n >= 13 ? 'good' : 'bad', taps: n, score: n,
        text: n >= 22 ? 'осадок поднялся идеально' : n >= 13 ? 'неплохая тряска' : 'почти не тряхнул' };
    }
    if (m.kind === 'rhythm'){
      return { grade: m.score >= 16 ? 'perfect' : m.score >= 8 ? 'good' : 'bad', score: m.score,
        combo: m.maxCombo, miss: m.miss,
        text: `очков ${m.score}, промахов ${m.miss}` };
    }
    if (m.kind === 'pour'){
      const perfect = m.score || 0;
      return { grade: perfect >= 6 ? 'perfect' : perfect >= 3 ? 'good' : 'bad', score: perfect,
        spilled: +m.spilled.toFixed(2), cups: m.cups,
        text: `точно налито ${m.cups - (m.spilled > 0 ? 1 : 0)} из ${m.cups}, пролито ${m.spilled.toFixed(2)} л` };
    }
    if (m.kind === 'dock'){
      return {
        grade: m.docks >= m.need3 ? 'perfect' : m.docks >= 2 ? 'good' : 'bad',
        score: m.docks, crashes: m.crashes,
        text: m.outOfFuel
          ? `топливо кончилось на ${m.docks} из ${m.need3} стыковок`
          : `стыковок ${m.docks} из ${m.need3}, аварий ${m.crashes}`,
      };
    }
    return { grade: m.hits >= m.need ? 'perfect' : m.hits >= 2 ? 'good' : 'bad', score: m.hits, misses: m.misses,
      text: `совпадений ${m.hits} из ${m.need}, мимо ${m.misses}` };
  }

  _hud(m){
    if (!this.timerEl) return;
    this.timerEl.textContent = Math.max(0, m.time).toFixed(1);
    if (!this.scoreEl) return;
    let s = '';
    if (m.kind === 'tap') s = `ТАПОВ: <b>${m.taps}</b> · нужно 22`;
    else if (m.kind === 'rhythm') s = `ОЧКИ: <b>${m.score}</b> · комбо <b>${m.combo}</b> · промахов ${m.miss}`;
    else if (m.kind === 'pour') s = `СТАКАНОВ: <b>${m.cups}</b>/5 · пролито <b>${m.spilled.toFixed(2)}</b> л`;
    else if (m.kind === 'dock') s = `СТЫКОВОК: <b>${m.docks}</b>/${m.need3} · курс <b>${Math.round(m.hold / m.need * 100)}%</b> · топливо <b>${Math.round(m.fuel)}</b>`;
    else s = `СОВПАДЕНИЙ: <b>${m.hits}</b> · мимо ${m.misses}`;
    this.scoreEl.innerHTML = s;
  }

  finish(res){
    if (!this.kind) return;
    cancelAnimationFrame(this.raf);
    const cb = this.done;
    this.kind = null;
    this.done = null;
    this.mg = null;
    this.r.mg = null;
    this.el.hidden = true;
    if (res.grade === 'perfect') sfx.perfect();
    else if (res.grade === 'good') sfx.good();
    else sfx.fail();
    if (cb) cb(res);
  }

  /** аварийное закрытие (например, при рестарте) */
  abort(){
    cancelAnimationFrame(this.raf);
    this.token = (this.token || 0) + 1;
    this.runToken = this.token;
    this.kind = null;
    this.done = null;
    this.mg = null;
    this.fallback = false;
    if (this.r) this.r.mg = null;
    if (this.ctrlEl) this.ctrlEl.classList.remove('on');
    this.el.hidden = true;
  }
}
