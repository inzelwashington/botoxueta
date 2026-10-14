/* =====================================================================
   РЕНДЕР: звёздное небо, вагон изнутри, пятилитруха, частицы, тряска
   ===================================================================== */

const W = 1600, H = 900;              // виртуальное разрешение сцены

export class Renderer {
  constructor(canvas){
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = [];
    this.nebulas = [];
    this.particles = [];
    this.floats = [];
    this.shake = 0;
    this.shakeDecay = 0.9;
    this.t = 0;
    this.tilt = 0;
    this.bagLevel = 0.6;
    this.bagTarget = 0.6;
    this.bagSlosh = 0;
    this.speedNorm = 0.5;
    this.gradNorm = 0.3;
    this.kgbNorm = 0.1;
    this.tempNorm = 0.6;
    this.distNorm = 0;
    this.bottleShakeT = 0;
    this.flashCol = null;
    this.flashA = 0;
    this.mg = null;               // {kind, ...}
    this.onMgDone = null;
    this.dpr = 1;
    this._initStars();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _initStars(){
    const rs = (a, b) => a + Math.random() * (b - a);
    this.stars = [];
    for (let layer = 0; layer < 4; layer++){
      const count = 90 - layer * 12;
      for (let i = 0; i < count; i++){
        this.stars.push({
          layer,
          x: rs(0, W * 1.4),
          y: rs(0, H),
          r: 0.6 + layer * 0.75 + Math.random() * 0.9,
          tw: rs(0, 6.28),
          hue: Math.random() < 0.12 ? rs(180, 220) : (Math.random() < 0.2 ? rs(20, 45) : 0),
        });
      }
    }
    // туманности
    this.nebulas = [];
    for (let i = 0; i < 5; i++){
      this.nebulas.push({
        x: rs(-200, W * 1.5), y: rs(-100, H + 100), r: rs(220, 520),
        hue: [280, 200, 320, 25, 170][i % 5], a: rs(0.05, 0.13), layer: i % 3,
      });
    }
  }

  _resize(){
    const wrap = this.cv.parentElement;
    const w = Math.max(320, wrap.clientWidth);
    const h = Math.max(170, wrap.clientHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.floor(w * this.dpr);
    this.cv.height = Math.floor(h * this.dpr);
    this.cssW = w; this.cssH = h;
    this.scale = Math.min(w / W, h / H);
    this.ox = (w - W * this.scale) / 2;
    this.oy = (h - H * this.scale) / 2;
  }

  /* ---------------------- внешние команды ---------------------- */
  addShake(power){ this.shake = Math.min(40, this.shake + power); }
  flash(color, a = 0.5){ this.flashCol = color; this.flashA = a; }
  setBag(v){ this.bagTarget = Math.max(0, Math.min(1, v)); }

  burst(x, y, n, opts = {}){
    for (let i = 0; i < n; i++){
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.sp || 2) * (0.3 + Math.random());
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 1.4),
        life: opts.life || 60, max: opts.life || 60,
        r: opts.r || 3, col: opts.col || '#ffcf7a', grav: opts.grav ?? 0.06,
        glyph: opts.glyph || null,
      });
    }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  float(text, col = '#ffd166'){
    this.floats.push({ text, col, life: 70, y: 0, x: (Math.random() - 0.5) * 160 });
    if (this.floats.length > 8) this.floats.shift();
  }

  /* ---------------------- мини-игры ---------------------- */
  startMinigame(kind, onDone){
    this.onMgDone = onDone;
    this.mgT = 0;
    if (kind === 'shake'){
      this.mg = { kind, pos: 0, dir: 1, zone: this._newZone(), hits: 0, target: 3, life: 9.5, lastHit: -1 };
    } else if (kind === 'rhythm'){
      const n = 8;
      this.mg = { kind, notes: Array.from({ length: n }, (_, i) => ({ t: 1.1 + i * 0.72, hit: null })), pos: 0, score: 0, best: 0, life: 1.1 + n * 0.72 + 1.6, combo: 0, maxCombo: 0 };
    } else if (kind === 'hold'){
      this.mg = { kind, need: 0.96, baseNeed: 0.96, held: 0, pos: 0, dir: 1, zone: null, hooks: 0, misses: 0, life: 11, keep: 0.55 };
      this._newHoldZone();
    } else if (kind === 'dodge'){
      this.mg = { kind, playerX: W / 2, obs: [], spawn: 0.6, t0: 0, beaten: 0, hp: 3, done: false, life: 19 };
    }
    return this.mg;
  }

  _newZone(){
    const width = 0.17;
    return { start: 0.2 + Math.random() * (0.75 - width), width };
  }

  _newHoldZone(){
    const w = 0.14;
    this.mg.zone = { start: 0.15 + Math.random() * (1 - w - 0.3), width: w, ttl: 1.5, hit: 0 };
  }

  stopMinigame(){ this.mg = null; this.onMgDone = null; }

  /* ---------------------- главный цикл ---------------------- */
  _loop(now){
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.t += dt;

    // динамика
    this.bagLevel += (this.bagTarget - this.bagLevel) * Math.min(1, dt * 3.2);
    this.bagSlosh *= Math.pow(0.02, dt);
    this.shake *= Math.pow(0.02, dt);
    if (this.shake < 0.3) this.shake = 0;
    this.flashA *= Math.pow(0.01, dt);
    this.bottleShakeT = Math.max(0, this.bottleShakeT - dt);

    // качание вагона
    const sway = Math.sin(this.t * 1.7) * 0.7 + Math.sin(this.t * 3.1 + 1.2) * 0.3;
    this.tilt = sway * (0.5 + this.speedNorm) * 0.018 + this.bagSlosh * 0.06;

    // частицы
    for (let i = this.particles.length - 1; i >= 0; i--){
      const p = this.particles[i];
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
      p.vy += p.grav * dt * 60; p.vx *= 0.995;
      p.life -= dt * 60;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--){
      this.floats[i].life -= dt * 60; this.floats[i].y -= dt * 40;
      if (this.floats[i].life <= 0) this.floats.splice(i, 1);
    }

    if (this.mg) this._updateMg(dt);

    this._draw();
    requestAnimationFrame(this._loop);
  }

  _updateMg(dt){
    const m = this.mg;
    m.life -= dt;

    if (m.kind === 'shake'){
      m.pos += dt * m.dir * 1.62;
      if (m.pos > 1){ m.pos = 1; m.dir = -1; }
      if (m.pos < 0){ m.pos = 0; m.dir = 1; }
      if (m.lastHit >= 0) m.lastHit += dt;
      if (m.life <= 0){
        const grade = m.hits >= 3 ? 'perfect' : m.hits >= 2 ? 'good' : 'bad';
        this._finishMg({ grade, hits: m.hits, score: m.hits });
      }
      return;
    }

    if (m.kind === 'rhythm'){
      if (m.life <= 0){
        const grade = m.score >= 10 ? 'perfect' : m.score >= 6 ? 'good' : 'bad';
        this._finishMg({ grade, score: m.score, combo: m.maxCombo });
      }
      return;
    }

    if (m.kind === 'hold'){
      m.pos += dt * m.dir * 0.3;              // медленный ход, чтобы зону реально можно было поймать
      if (m.pos > 1){ m.pos = 1; m.dir = -1; }
      if (m.pos < 0){ m.pos = 0; m.dir = 1; }
      m.zone.ttl -= dt;
      if (m.zone.ttl <= 0){
        if (!m.zone.done){ m.misses++; this.float('УПУСТИЛ', '#ff8080'); }
        this._newHoldZone();
      }
      const inZone = m.pos >= m.zone.start && m.pos <= m.zone.start + m.zone.width;
      const pressing = this._pressed || m.mixing;
      m.need = Math.max(0.48, m.baseNeed - m.misses * 0.24);   // подстраховка: чем больше промахов, тем короче цель
      if (!m.zone.done){
        if (inZone && pressing){
          m.held += dt; m.zone.hitT = (m.zone.hitT || 0) + dt;
          if (m.zone.hitT >= 0.15){
            m.zone.done = true; m.hooks++;
            m.held = Math.max(m.held, m.hooks * 0.24);   // прогресс за каждую пойманную зону
            this.burst(W * 0.5, H * 0.48, 12, { col: '#5fd7ff', sp: 3 });
            this.float('+', '#7dffb0');
          }
        } else if (pressing){
          m.held = Math.max(0, m.held - dt * 0.6);
        }
      }
      if (m.held >= m.need || m.life <= 0){
        const grade = m.held >= m.need ? 'perfect' : m.held >= m.need * 0.5 ? 'good' : 'bad';
        this._finishMg({ grade, held: m.held, hooks: m.hooks, misses: m.misses });
      }
      return;
    }

    if (m.kind === 'dodge'){
      m.t0 += dt;
      m.spawn -= dt;
      if (m.spawn <= 0 && !m.done){
        m.spawn = Math.max(0.42, 1.15 - m.t0 * 0.03);
        const lane = Math.random() < 0.5;
        m.obs.push({ y: -80, x: lane ? W * 0.3 : W * 0.7, r: 30 + Math.random() * 26, kind: Math.random() < 0.25 ? 'good' : 'bad', v: 420 + m.t0 * 26 });
      }
      for (let i = m.obs.length - 1; i >= 0; i--){
        const o = m.obs[i];
        o.y += o.v * dt;
        const dx = o.x - m.playerX, dy = o.y - (H - 200);
        if (Math.hypot(dx, dy) < o.r + 34){
          if (o.kind === 'good'){ m.beaten++; this.burst(o.x, o.y, 12, { col: '#8bf0b4', sp: 3 }); this.floatAt('+БАГБИР', o.x, o.y, '#8bf0b4'); }
          else { m.hp--; this.addShake(16); this.flash('#ff4d4d', 0.4); this.burst(o.x, o.y, 18, { col: '#ff8080', sp: 4 }); }
          m.obs.splice(i, 1); continue;
        }
        if (o.y > H + 90) m.obs.splice(i, 1);
      }
      if (m.hp <= 0 || m.t0 > 17){
        m.done = true;
        const grade = m.hp >= 3 && m.beaten >= 4 ? 'perfect' : m.hp >= 2 ? 'good' : 'bad';
        this._finishMg({ grade, score: m.beaten, hp: m.hp });
      }
    }
  }

  _finishMg(res){
    const cb = this.onMgDone;
    this.mg = null; this.onMgDone = null;
    if (cb) cb(res);
  }

  floatAt(text, x, y, col){
    this.floats.push({ text, col, life: 60, y: 0, x: 0, ax: x, ay: y });
  }

  /* ---------------------- ввод ---------------------- */
  input(pressed, x, y){
    this._pressed = pressed;
    void y;
    const m = this.mg;
    if (!m) return;
    if (m.kind === 'hold') m.mixing = pressed;
    if (m.kind === 'shake' && pressed){
      const inZone = m.pos >= m.zone.start && m.pos <= m.zone.start + m.zone.width;
      if (inZone){
        m.hits++; m.lastHit = 0;
        this.bagSlosh = 1.4; this.bottleShakeT = 0.5; this.addShake(14);
        this.burst(W / 2, H - 250, 16, { col: '#ffe6a8', sp: 3, up: 2 });
        this.float('ЕСТЬ!', '#7dffb0');
      } else {
        m.hits = Math.max(0, m.hits - 1);
        this.addShake(6);
        this.float('МИМО', '#ff8080');
      }
      m.zone = this._newZone();
    }
    if (m.kind === 'rhythm' && pressed){
      let best = null, bd = 99;
      for (const n of m.notes){ if (n.hit) continue; const d = Math.abs(n.t - m.pos); if (d < bd){ bd = d; best = n; } }
      if (best && bd < 0.34){
        best.hit = bd < 0.16 ? 'perfect' : 'good';
        m.score += best.hit === 'perfect' ? 2 : 1;
        m.combo++; m.maxCombo = Math.max(m.maxCombo, m.combo);
        this.burst(W / 2, H - 300, 10, { col: best.hit === 'perfect' ? '#ffd166' : '#5fd7ff', sp: 3 });
        this.float(best.hit === 'perfect' ? 'ИДЕАЛЬНО' : 'НОРМ', best.hit === 'perfect' ? '#ffd166' : '#5fd7ff');
      } else {
        m.combo = 0; this.float('МИМО', '#ff8080');
      }
    }
    if (m.kind === 'dodge'){
      if (x != null) m.playerX = Math.max(W * 0.12, Math.min(W * 0.88, x));
      else if (pressed) m.playerX = m.playerX > W / 2 ? W * 0.3 : W * 0.7;
    }
  }

  /* ===================== ОТРИСОВКА ===================== */
  _draw(){
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    const sh = this.shake;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh * 0.7;
    ctx.save();
    ctx.translate(this.ox + sx, this.oy + sy);
    ctx.scale(this.scale, this.scale);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(this.tilt * 0.5);
    ctx.translate(-W / 2, -H / 2);

    this._drawSky(ctx);
    this._drawTrain(ctx);
    this._drawInterior(ctx);
    this._drawCharacters(ctx);
    this._drawBottle(ctx);
    this._drawTable(ctx);
    this._drawParticles(ctx);
    this._drawFloats(ctx);
    ctx.restore();

    if (this.mg) this._drawMg(ctx);
    if (this.flashA > 0.01){
      ctx.fillStyle = this.flashCol || '#fff';
      ctx.globalAlpha = Math.min(0.6, this.flashA);
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.globalAlpha = 1;
    }
    // виньетка
    const g = ctx.createRadialGradient(this.cssW / 2, this.cssH / 2, this.cssH * 0.25, this.cssW / 2, this.cssH / 2, this.cssH * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  _drawSky(ctx){
    // фон
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05070f');
    bg.addColorStop(0.55, '#0a0d1c');
    bg.addColorStop(1, '#120a18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // туманности
    for (const n of this.nebulas){
      n.x -= (0.25 + n.layer * 0.5) * this.speedNorm * 0.6;
      if (n.x < -n.r) n.x = W + n.r;
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, `hsla(${n.hue},70%,60%,${n.a})`);
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }

    // Альфа-Центавра вдалеке: растёт по мере приближения
    const d = this.distNorm;
    const cx = W * 0.16, cy = H * 0.30;
    const size = 8 + d * 46;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 5);
    glow.addColorStop(0, `rgba(255,240,200,${0.5 + d * 0.5})`);
    glow.addColorStop(0.25, `rgba(200,180,255,${0.25 + d * 0.3})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - size * 5, cy - size * 5, size * 10, size * 10);
    ctx.fillStyle = '#fff6de';
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.5, 0, 6.284); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + size * 0.9, cy + size * 0.2, size * 0.32, 0, 6.284);
    ctx.fillStyle = '#ffd9a8'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx - size * 0.7, cy - size * 0.35, size * 0.2, 0, 6.284);
    ctx.fillStyle = '#ffb0b0'; ctx.fill();

    // звёзды (параллакс)
    for (const s of this.stars){
      s.x -= (0.12 + s.layer * 0.55) * (0.4 + this.speedNorm * 1.8);
      if (s.x < -20){ s.x = W + 20; s.y = Math.random() * H; }
      const tw = 0.55 + 0.45 * Math.sin(this.t * 2.4 + s.tw);
      let col = `rgba(255,255,255,${(0.25 + s.layer * 0.2) * tw})`;
      if (s.hue) col = `hsla(${s.hue},80%,72%,${(0.3 + s.layer * 0.2) * tw})`;
      ctx.fillStyle = col;
      // звёздные штрихи при большой скорости
      const streak = this.speedNorm * s.layer * 7;
      ctx.fillRect(s.x, s.y, s.r + streak, s.r * 0.8 + (streak > 2 ? 1 : 0));
    }

    // кометный лёд, летящий от поезда
    for (let i = 0; i < 22; i++){
      const x = ((this.t * (60 + i * 9) + i * 173) % (W + 200)) - 100;
      const y = (i * 137) % H;
      ctx.fillStyle = `rgba(150,210,255,${0.06 + (i % 4) * 0.02})`;
      ctx.fillRect(W - x, y, 90 + (i % 5) * 30, 1.4);
    }
  }

  /** корпус поезда — виден в окнах как тень и огни впереди */
  _drawTrain(ctx){
    // далёкий локомотив с дымом
    const lx = W * 0.06 - this.distNorm * W * 0.02;
    const ly = H * 0.74;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#1a2033';
    ctx.beginPath();
    ctx.moveTo(lx - 130, ly + 40);
    ctx.lineTo(lx - 130, ly - 20);
    ctx.lineTo(lx - 40, ly - 46);
    ctx.lineTo(lx + 120, ly - 40);
    ctx.lineTo(lx + 150, ly + 40);
    ctx.closePath(); ctx.fill();
    // пар
    for (let i = 0; i < 7; i++){
      const p = ((this.t * 26 + i * 34) % 220);
      ctx.globalAlpha = 0.12 * (1 - p / 220);
      ctx.beginPath();
      ctx.arc(lx - 90 - p * 1.2, ly - 50 - p * 0.55, 16 + p * 0.24, 0, 6.284);
      ctx.fillStyle = '#cfe4ff'; ctx.fill();
    }
    // фара
    const gl = ctx.createRadialGradient(lx + 130, ly - 12, 0, lx + 130, ly - 12, 300);
    gl.addColorStop(0, 'rgba(255,240,190,.55)');
    gl.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = gl;
    ctx.fillRect(lx - 200, ly - 300, 700, 600);
    ctx.restore();
  }

  /** интерьер купе: окно, полки, поручни, лампа */
  _drawInterior(ctx){
    const lampGlow = 0.35 + this.tempNorm * 0.65;

    // окно (через него видно небо)
    const wx = 150, wy = 120, ww = 1300, wh = 430, wr = 26;
    ctx.save();
    // рама
    ctx.beginPath(); roundRect(ctx, wx - 26, wy - 26, ww + 52, wh + 52, wr + 8);
    ctx.fillStyle = '#151a28'; ctx.fill();
    // проём — «стекло»: слегка затемняем небо
    ctx.beginPath(); roundRect(ctx, wx, wy, ww, wh, wr);
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(120,170,255,.07)';
    ctx.fillRect(wx, wy, ww, wh);
    // блик на стекле
    const bg = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
    bg.addColorStop(0, 'rgba(255,255,255,.10)');
    bg.addColorStop(0.35, 'rgba(255,255,255,.02)');
    bg.addColorStop(0.6, 'rgba(255,255,255,.07)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(wx, wy, ww, wh);
    // отражение лампы
    ctx.globalAlpha = lampGlow * 0.5;
    const rg = ctx.createRadialGradient(W * 0.62, wy + 170, 0, W * 0.62, wy + 170, 220);
    rg.addColorStop(0, 'rgba(255,214,140,.5)');
    rg.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.globalAlpha = 1;
    ctx.restore();

    // импосты окна
    ctx.strokeStyle = '#1d2436';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, wy); ctx.lineTo(W * 0.5, wy + wh);
    ctx.stroke();
    ctx.beginPath(); roundRect(ctx, wx, wy, ww, wh, wr);
    ctx.strokeStyle = '#232b40'; ctx.lineWidth = 7; ctx.stroke();
    // защёлки
    ctx.fillStyle = '#3a4560';
    [0.22, 0.5, 0.78].forEach((f) => {
      ctx.beginPath(); ctx.arc(wx + ww * f, wy + wh - 6, 7, 0, 6.284); ctx.fill();
    });
    ctx.restore();

    // верхняя полка и багажная ниша
    ctx.fillStyle = '#10141f';
    ctx.fillRect(0, wy - 70, W, 56);
    ctx.fillStyle = '#1a2030';
    ctx.fillRect(0, wy - 14, W, 16);

    // цветовая полоса советского вагона
    ctx.fillStyle = '#8d2b1f';
    ctx.fillRect(0, wy + wh + 26, W, 12);
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(0, wy + wh + 38, W, 5);

    // потолочные плафоны
    for (let i = -1; i <= 2; i++){
      const x = W * 0.5 + i * 330;
      const g = ctx.createRadialGradient(x, 40, 0, x, 40, 150);
      g.addColorStop(0, `rgba(255,220,160,${0.35 * lampGlow})`);
      g.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 150, -60, 300, 300);
      ctx.fillStyle = '#3b3427';
      roundRect(ctx, x - 60, 6, 120, 20, 8); ctx.fill();
      ctx.fillStyle = `rgba(255,236,190,${0.55 + 0.45 * lampGlow})`;
      roundRect(ctx, x - 54, 10, 108, 12, 6); ctx.fill();
    }

    // нижняя часть: полки, столик
    const floorY = H * 0.815;
    // сиденья
    ctx.fillStyle = '#241a24';
    roundRect(ctx, 40, floorY - 20, W - 80, 60, 14); ctx.fill();
    ctx.fillStyle = '#33203a';
    roundRect(ctx, 40, floorY - 20, W - 80, 26, 12); ctx.fill();
    // пол
    const fg = ctx.createLinearGradient(0, floorY + 40, 0, H);
    fg.addColorStop(0, '#1a1420');
    fg.addColorStop(1, '#08070c');
    ctx.fillStyle = fg;
    ctx.fillRect(0, floorY + 40, W, H - floorY - 40);

    // поручни
    ctx.strokeStyle = '#4a5470'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, wy + 26); ctx.lineTo(W, wy + 26); ctx.stroke();

    // окно-тамбур справа
    ctx.save();
    ctx.fillStyle = '#0b0e18';
    roundRect(ctx, W - 150, wy + 90, 110, 300, 16); ctx.fill();
    ctx.strokeStyle = '#242c40'; ctx.lineWidth = 5;
    roundRect(ctx, W - 150, wy + 90, 110, 300, 16); ctx.stroke();
    ctx.restore();
  }

  _drawCharacters(ctx){
    const baseY = H * 0.80;
    const breathe = Math.sin(this.t * 1.6) * 4;
    const g = (this.gradNorm - 0.5);

    // Сурдин — слева: свитер, очки
    this._drawFigure(ctx, W * 0.30, baseY + breathe - g * 8, {
      coat: '#2c3a5e', coat2: '#1b2540', skin: '#e8b98e',
      hair: '#cfd6e4', glasses: true, sway: Math.sin(this.t * 1.3) * 3, tilt: -0.05,
    });
    // Вася — справа: телогрейка, шапка
    this._drawFigure(ctx, W * 0.70, baseY - breathe + g * 10, {
      coat: '#4a3a26', coat2: '#2f2517', skin: '#dda87c',
      hair: '#3a2b1c', hat: true, glasses: false, sway: Math.sin(this.t * 1.1 + 2) * 5, tilt: 0.07,
    });
  }

  _drawFigure(ctx, x, y, o){
    ctx.save();
    ctx.translate(x + o.sway, y);
    ctx.rotate(o.tilt);
    // тень
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(0, 6, 92, 16, 0, 0, 6.284); ctx.fill();
    // туловище
    ctx.beginPath();
    ctx.moveTo(-86, 0);
    ctx.quadraticCurveTo(-70, -150, -34, -186);
    ctx.lineTo(34, -186);
    ctx.quadraticCurveTo(70, -150, 86, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(-80, -190, 80, 0);
    g.addColorStop(0, o.coat); g.addColorStop(1, o.coat2);
    ctx.fillStyle = g; ctx.fill();
    // воротник
    ctx.fillStyle = o.coat2;
    ctx.beginPath();
    ctx.moveTo(-34, -186); ctx.quadraticCurveTo(0, -160, 34, -186);
    ctx.quadraticCurveTo(0, -196, -34, -186); ctx.fill();
    // руки
    ctx.strokeStyle = o.coat; ctx.lineWidth = 26; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-62, -140); ctx.lineTo(-92, -60); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(62, -140); ctx.lineTo(92, -66); ctx.stroke();
    // голова
    ctx.fillStyle = o.skin;
    ctx.beginPath(); ctx.ellipse(0, -222, 44, 50, 0, 0, 6.284); ctx.fill();
    // уши
    ctx.beginPath(); ctx.ellipse(-42, -218, 8, 12, 0, 0, 6.284); ctx.fill();
    ctx.beginPath(); ctx.ellipse(42, -218, 8, 12, 0, 0, 6.284); ctx.fill();
    // волосы
    ctx.fillStyle = o.hair;
    ctx.beginPath();
    ctx.ellipse(0, -250, 45, 26, 0, Math.PI, 0);
    ctx.fill();
    if (o.hat){
      ctx.fillStyle = '#5b4630';
      roundRect(ctx, -50, -276, 100, 34, 10); ctx.fill();
      ctx.fillStyle = '#3d2f20';
      roundRect(ctx, -56, -252, 112, 12, 6); ctx.fill();
    }
    // глаза
    if (o.glasses){
      ctx.strokeStyle = '#20263a'; ctx.lineWidth = 4;
      ctx.beginPath(); roundRect(ctx, -32, -234, 26, 20, 6); ctx.stroke();
      ctx.beginPath(); roundRect(ctx, 6, -234, 26, 20, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, -224); ctx.lineTo(6, -224); ctx.stroke();
      ctx.fillStyle = 'rgba(180,225,255,.35)';
      ctx.beginPath(); roundRect(ctx, -32, -234, 26, 20, 6); ctx.fill();
      ctx.beginPath(); roundRect(ctx, 6, -234, 26, 20, 6); ctx.fill();
    } else {
      ctx.fillStyle = '#20263a';
      ctx.beginPath(); ctx.arc(-16, -224, 5, 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.arc(16, -224, 5, 0, 6.284); ctx.fill();
    }
    // рот — улыбка зависит от градуса
    ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 4;
    ctx.beginPath();
    const smile = 6 + this.gradNorm * 12;
    ctx.moveTo(-16, -198);
    ctx.quadraticCurveTo(0, -198 + smile, 16, -198);
    ctx.stroke();
    // румянец от градуса
    if (this.gradNorm > 0.4){
      ctx.fillStyle = `rgba(230,90,90,${(this.gradNorm - 0.4) * 0.55})`;
      ctx.beginPath(); ctx.ellipse(-28, -208, 12, 8, 0, 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.ellipse(28, -208, 12, 8, 0, 0, 6.284); ctx.fill();
    }
    ctx.restore();
  }

  /** ПЯТИЛИТРУХА — главная героиня */
  _drawBottle(ctx){
    const cx = W * 0.5, baseY = H * 0.845;
    const w = 176, h = 300;
    const lvl = this.bagLevel;
    const shaking = this.bottleShakeT > 0;
    const wob = shaking ? Math.sin(this.t * 42) * 0.14 * (this.bottleShakeT / 0.5) : 0;
    const slosh = Math.sin(this.t * 3.4) * 0.035 * (0.4 + this.speedNorm) + this.bagSlosh * 0.12;

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.rotate(wob + this.tilt * 0.6);

    // тень
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.ellipse(0, 4, w * 0.62, 14, 0, 0, 6.284); ctx.fill();

    // стекло
    const path = new Path2D();
    const hw = w / 2;
    path.moveTo(-hw, -h + 60);
    path.quadraticCurveTo(-hw - 6, -h * 0.45, -hw * 0.86, -h * 0.2);
    path.quadraticCurveTo(-hw * 0.8, 0, -hw * 0.72, 0);
    path.lineTo(hw * 0.72, 0);
    path.quadraticCurveTo(hw * 0.8, 0, hw * 0.86, -h * 0.2);
    path.quadraticCurveTo(hw + 6, -h * 0.45, hw, -h + 60);
    path.lineTo(hw * 0.42, -h - 6);
    path.lineTo(-hw * 0.42, -h - 6);
    path.closePath();

    // жидкость
    ctx.save();
    ctx.clip(path);
    const topY = -h + 40 + (1 - lvl) * (h - 60);
    const lg = ctx.createLinearGradient(0, topY, 0, 10);
    const warm = this.gradNorm;
    lg.addColorStop(0, `rgba(${240 - warm * 30},${196 - warm * 40},${96 - warm * 20},.72)`);
    lg.addColorStop(0.5, 'rgba(214,158,58,.78)');
    lg.addColorStop(1, 'rgba(158,104,28,.86)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(-hw - 10, topY + Math.sin(this.t * 2.6) * 4 + slosh * 40);
    ctx.quadraticCurveTo(0, topY - 8 + Math.sin(this.t * 3.3 + 1) * 5 + slosh * 60, hw + 10, topY + Math.sin(this.t * 2.9 + 2) * 4 + slosh * 40);
    ctx.lineTo(hw + 10, 20); ctx.lineTo(-hw - 10, 20);
    ctx.closePath();
    ctx.fill();
    // блеск жидкости
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(255,236,180,.7)';
    ctx.beginPath();
    ctx.ellipse(-hw * 0.35, topY + 26, 16, 40, 0.2, 0, 6.284); ctx.fill();
    ctx.globalAlpha = 1;
    // пузырьки
    for (let i = 0; i < 14; i++){
      const bx = ((i * 71) % 140) - 70;
      const by = 10 - ((this.t * (22 + i * 4) + i * 43) % Math.max(20, -topY));
      if (by < topY) continue;
      ctx.fillStyle = `rgba(255,246,214,${0.35 + (i % 3) * 0.15})`;
      ctx.beginPath(); ctx.arc(bx * 0.8, by, 2 + (i % 3), 0, 6.284); ctx.fill();
    }
    ctx.restore();

    // стекло: заливка и обводка
    const gg = ctx.createLinearGradient(-hw, 0, hw, 0);
    gg.addColorStop(0, 'rgba(190,220,255,.18)');
    gg.addColorStop(0.35, 'rgba(255,255,255,.06)');
    gg.addColorStop(0.75, 'rgba(190,220,255,.14)');
    gg.addColorStop(1, 'rgba(140,180,230,.22)');
    ctx.fillStyle = gg; ctx.fill(path);
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(215,238,255,.55)'; ctx.stroke(path);

    // рёбра жёсткости
    ctx.strokeStyle = 'rgba(220,240,255,.18)';
    ctx.lineWidth = 3;
    for (let i = 1; i <= 3; i++){
      ctx.beginPath();
      ctx.moveTo(-hw * 0.9, -h * (0.2 + i * 0.16));
      ctx.lineTo(hw * 0.9, -h * (0.2 + i * 0.16));
      ctx.stroke();
    }

    // ручка
    ctx.strokeStyle = 'rgba(230,246,255,.6)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(hw * 0.5, -h + 24);
    ctx.quadraticCurveTo(hw * 1.15, -h - 12, hw * 0.34, -h - 26);
    ctx.stroke();

    // крышка
    ctx.fillStyle = '#2d7a4f';
    roundRect(ctx, -hw * 0.44, -h - 30, hw * 0.88, 30, 7); ctx.fill();
    ctx.fillStyle = '#49b877';
    roundRect(ctx, -hw * 0.44, -h - 30, hw * 0.88, 11, 5); ctx.fill();

    // этикетка
    ctx.fillStyle = 'rgba(246,238,214,.94)';
    roundRect(ctx, -hw * 0.62, -h * 0.56, hw * 1.24, 82, 8); ctx.fill();
    ctx.fillStyle = '#8d2b1f';
    ctx.font = '700 26px "Russo One", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('БАГБИР', 0, -h * 0.56 + 32);
    ctx.fillStyle = '#3a3226';
    ctx.font = '600 17px "Segoe UI", sans-serif';
    ctx.fillText('ГОСТ 67-41', 0, -h * 0.56 + 56);
    ctx.font = '600 14px "Segoe UI", sans-serif';
    ctx.fillStyle = '#6b6152';
    ctx.fillText('5 л · для особо дальних', 0, -h * 0.56 + 74);

    // уровень в литрах над бутылью
    if (!this.mg){
      const liters = lvl * 50;
      ctx.font = '700 30px "Russo One", Impact, sans-serif';
      ctx.fillStyle = liters < 8 ? '#ff8080' : liters < 18 ? '#ffd166' : '#8bf0b4';
      ctx.fillText(`${liters.toFixed(1).replace('.', ',')} л`, 0, -h - 54);
      ctx.font = '600 15px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(200,215,240,.7)';
      ctx.fillText('из пятилитрухи', 0, -h - 32);
    }
    ctx.restore();
  }

  _drawTable(ctx){
    const y = H * 0.855;
    ctx.fillStyle = '#2b2233';
    roundRect(ctx, 90, y, W - 180, 26, 8); ctx.fill();
    ctx.fillStyle = '#3a2e44';
    roundRect(ctx, 90, y, W - 180, 10, 6); ctx.fill();
    // стаканы
    [[W * 0.19, 0.0], [W * 0.81, 0.2]].forEach(([x, o]) => {
      ctx.fillStyle = 'rgba(200,225,255,.22)';
      roundRect(ctx, x - 18, y - 54 + o * 10, 36, 54, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(220,240,255,.5)'; ctx.lineWidth = 3;
      roundRect(ctx, x - 18, y - 54 + o * 10, 36, 54, 5); ctx.stroke();
      if (this.gradNorm > 0.35){
        ctx.fillStyle = 'rgba(214,158,58,.5)';
        roundRect(ctx, x - 15, y - 30 + o * 10, 30, 27, 4); ctx.fill();
      }
    });
    // огурцы в банке
    ctx.fillStyle = 'rgba(150,210,255,.14)';
    roundRect(ctx, W * 0.63, y - 84, 74, 84, 8); ctx.fill();
    ctx.fillStyle = '#4e7a34';
    for (let i = 0; i < 4; i++){
      ctx.beginPath();
      ctx.ellipse(W * 0.63 + 18 + (i % 2) * 34, y - 22 - ((i / 2) | 0) * 34, 15, 19, i * 0.6, 0, 6.284);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(220,240,255,.45)'; ctx.lineWidth = 3;
    roundRect(ctx, W * 0.63, y - 84, 74, 84, 8); ctx.stroke();
    // салфетка с расчётами
    ctx.save();
    ctx.translate(W * 0.40, y - 18);
    ctx.rotate(-0.08 + this.tilt);
    ctx.fillStyle = 'rgba(246,240,222,.9)';
    roundRect(ctx, -60, -40, 120, 46, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(120,110,90,.7)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++){
      ctx.beginPath(); ctx.moveTo(-50, -30 + i * 10); ctx.lineTo(-50 + [90, 70, 84, 50][i], -30 + i * 10); ctx.stroke();
    }
    ctx.restore();
  }

  _drawParticles(ctx){
    for (const p of this.particles){
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.8), 0, 6.284); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawFloats(ctx){
    ctx.textAlign = 'center';
    for (const f of this.floats){
      const a = Math.min(1, f.life / 28);
      ctx.globalAlpha = a;
      ctx.font = '700 34px "Russo One", Impact, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      const x = (f.ax ?? W / 2) + f.x;
      const y = (f.ay ?? H * 0.5) + f.y;
      ctx.fillText(f.text, x + 2, y + 2);
      ctx.fillStyle = f.col;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- отрисовка мини-игр ---------------- */
  _drawMg(ctx){
    const m = this.mg;
    const s = Math.min(this.cssW / W, this.cssH / H);
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,14,.55)';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.restore();

    if (m.kind === 'shake'){
      const bx = W * 0.18, by = H * 0.42, bw = W * 0.64, bh = 74;
      // дорожка
      ctx.fillStyle = 'rgba(8,11,20,.92)';
      roundRect(ctx, bx - 18, by - 30, bw + 36, bh + 60, 16); ctx.fill();
      ctx.strokeStyle = 'rgba(255,196,92,.35)'; ctx.lineWidth = 3;
      roundRect(ctx, bx - 18, by - 30, bw + 36, bh + 60, 16); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      roundRect(ctx, bx, by, bw, bh, 10); ctx.fill();
      // зона
      const zx = bx + m.zone.start * bw, zw = m.zone.width * bw;
      const zg = ctx.createLinearGradient(zx, 0, zx + zw, 0);
      zg.addColorStop(0, 'rgba(84,217,140,.35)');
      zg.addColorStop(0.5, 'rgba(84,217,140,.85)');
      zg.addColorStop(1, 'rgba(84,217,140,.35)');
      ctx.fillStyle = zg;
      roundRect(ctx, zx, by, zw, bh, 8); ctx.fill();
      // бегунок
      const px = bx + m.pos * bw;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 26;
      roundRect(ctx, px - 6, by - 14, 12, bh + 28, 6); ctx.fill();
      ctx.shadowBlur = 0;
      // попадания
      for (let i = 0; i < 3; i++){
        ctx.beginPath();
        ctx.arc(bx + bw * 0.5 - 40 + i * 40, by + bh + 34, 12, 0, 6.284);
        ctx.fillStyle = i < m.hits ? '#7dffb0' : 'rgba(255,255,255,.16)';
        ctx.fill();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(200,215,240,.85)';
      ctx.font = '600 24px "Segoe UI", sans-serif';
      ctx.fillText('ЖМИ, КОГДА БЕГУНОК В ЗЕЛЁНОЙ ЗОНЕ. НУЖНО 3 ПОПАДАНИЯ.', W / 2, by - 52);
      ctx.fillStyle = '#ffd166';
      ctx.font = '700 22px "Russo One", Impact, sans-serif';
      ctx.fillText(`ОСТАЛОСЬ ${Math.max(0, m.life).toFixed(1)} с`, W / 2, by + bh + 76);
    }

    if (m.kind === 'rhythm'){
      const bx = W * 0.1, by = H * 0.30, bw = W * 0.8, laneY = by + 200;
      ctx.fillStyle = 'rgba(8,11,20,.92)';
      roundRect(ctx, bx - 24, by - 60, bw + 48, 400, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(176,112,255,.4)'; ctx.lineWidth = 3;
      roundRect(ctx, bx - 24, by - 60, bw + 48, 400, 18); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d7a4ff';
      ctx.font = '700 26px "Russo One", Impact, sans-serif';
      ctx.fillText('ТРЯСИ В РИТМ: ЖМИ НА «67»', W / 2, by - 20);
      // линия
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx, laneY); ctx.lineTo(bx + bw, laneY); ctx.stroke();
      const note = (t) => bx + ((t - m.pos) * 620);
      for (const n of m.notes){
        const x = note(n.t);
        if (x > bx + bw + 40 || x < bx - 40) continue;
        const hit = n.hit === 'perfect';
        ctx.fillStyle = n.hit === 'perfect' ? '#ffd166' : n.hit === 'good' ? '#5fd7ff' : 'rgba(255,255,255,.75)';
        ctx.beginPath();
        ctx.moveTo(x, laneY - 40); ctx.lineTo(x + 22, laneY); ctx.lineTo(x, laneY + 40); ctx.lineTo(x - 22, laneY);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.7)';
        ctx.font = '700 13px "Russo One", Impact, sans-serif';
        ctx.fillText('67', x, laneY + 5);
      }
      // цель
      ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(bx, laneY - 70); ctx.lineTo(bx, laneY + 70); ctx.stroke();
      ctx.fillStyle = '#7dffb0';
      ctx.beginPath(); ctx.arc(bx, laneY, 16, 0, 6.284); ctx.fill();
      // счёт
      ctx.fillStyle = '#fff';
      ctx.font = '700 30px "Russo One", Impact, sans-serif';
      ctx.fillText(`${m.score}`, W / 2, by + 300);
      ctx.fillStyle = 'rgba(200,215,240,.7)';
      ctx.font = '600 18px "Segoe UI", sans-serif';
      ctx.fillText(`комбо ${m.combo} · лучший ${m.maxCombo}`, W / 2, by + 328);
    }

    if (m.kind === 'hold'){
      const bx = W * 0.16, by = H * 0.44, bw = W * 0.68, bh = 70;
      ctx.fillStyle = 'rgba(8,11,20,.92)';
      roundRect(ctx, bx - 18, by - 40, bw + 36, bh + 130, 16); ctx.fill();
      ctx.strokeStyle = 'rgba(95,215,255,.4)'; ctx.lineWidth = 3;
      roundRect(ctx, bx - 18, by - 40, bw + 36, bh + 130, 16); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      roundRect(ctx, bx, by, bw, bh, 10); ctx.fill();
      const zx = bx + m.zone.start * bw, zw = m.zone.width * bw;
      ctx.fillStyle = m.zone.done ? 'rgba(120,120,140,.4)' : 'rgba(95,215,255,.75)';
      roundRect(ctx, zx, by, zw, bh, 8); ctx.fill();
      const px = bx + m.pos * bw;
      ctx.fillStyle = '#fff'; ctx.shadowColor = '#5fd7ff'; ctx.shadowBlur = 24;
      roundRect(ctx, px - 7, by - 16, 14, bh + 32, 7); ctx.fill();
      ctx.shadowBlur = 0;
      // прогресс удержания
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      roundRect(ctx, bx, by + bh + 26, bw, 22, 11); ctx.fill();
      const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      pg.addColorStop(0, '#5fd7ff'); pg.addColorStop(1, '#7dffb0');
      ctx.fillStyle = pg;
      roundRect(ctx, bx, by + bh + 26, Math.max(6, bw * Math.min(1, m.held / m.need)), 22, 11); ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(200,215,240,.85)';
      ctx.font = '600 22px "Segoe UI", sans-serif';
      ctx.fillText('ДЕРЖИ ПАЛЕЦ В СИНЕЙ ЗОНЕ', W / 2, by - 62);
      ctx.fillStyle = '#ffd166';
      ctx.font = '700 20px "Russo One", Impact, sans-serif';
      ctx.fillText(`${m.held.toFixed(1)} / ${m.need.toFixed(1)} с`, W / 2, by + bh + 92);
    }

    if (m.kind === 'dodge'){
      ctx.save();
      ctx.fillStyle = 'rgba(6,9,18,.92)';
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      const k = Math.min(this.cssW / W, this.cssH / H);
      ctx.translate((this.cssW - W * k) / 2, (this.cssH - H * k) / 2);
      ctx.scale(k, k);
      // дорога
      ctx.fillStyle = '#0b0f1c';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(120,160,255,.08)';
      for (let i = 0; i < 26; i++){
        const y = ((this.t * 420 + i * 70) % (H + 100));
        ctx.fillRect(0, y, W, 2);
      }
      // линии полос
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 4;
      [W * 0.5].forEach((x) => {
        ctx.setLineDash([40, 40]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.setLineDash([]);
      });
      // объекты
      for (const o of m.obs){
        if (o.kind === 'good'){
          ctx.fillStyle = '#7dffb0';
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.8, 0, 6.284); ctx.fill();
          ctx.fillStyle = 'rgba(125,255,176,.25)';
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.6, 0, 6.284); ctx.fill();
          ctx.fillStyle = '#04351f';
          ctx.font = '700 26px "Russo One", Impact, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('5Л', o.x, o.y + 9);
        } else {
          const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
          g.addColorStop(0, '#c9b28a'); g.addColorStop(1, '#5e4c34');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(o.x - o.r, o.y - o.r * 0.4);
          ctx.lineTo(o.x + o.r * 0.7, o.y - o.r);
          ctx.lineTo(o.x + o.r, o.y + o.r * 0.6);
          ctx.lineTo(o.x - o.r * 0.5, o.y + o.r);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#3a2f1e'; ctx.lineWidth = 3; ctx.stroke();
        }
      }
      // игрок — тот самый вагон
      const x = m.playerX, y = H - 200;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#2c3a5e';
      roundRect(ctx, -60, -90, 120, 150, 18); ctx.fill();
      ctx.fillStyle = '#8d2b1f';
      roundRect(ctx, -60, -20, 120, 16, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,190,.9)';
      roundRect(ctx, -46, -74, 42, 42, 8); ctx.fill();
      roundRect(ctx, 6, -74, 42, 42, 8); ctx.fill();
      ctx.fillStyle = '#49b877';
      roundRect(ctx, -26, 34, 52, 26, 8); ctx.fill();
      ctx.restore();
      // HP
      for (let i = 0; i < 3; i++){
        ctx.fillStyle = i < m.hp ? '#7dffb0' : 'rgba(255,255,255,.18)';
        roundRect(ctx, W / 2 - 80 + i * 60, 40, 44, 20, 8); ctx.fill();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.font = '700 30px "Russo One", Impact, sans-serif';
      ctx.fillText(`СОБРАНО ПЯТИЛИТРУХ: ${m.beaten}`, W / 2, 110);
      ctx.fillStyle = 'rgba(200,215,240,.8)';
      ctx.font = '600 20px "Segoe UI", sans-serif';
      ctx.fillText('ВЕДИ ВАГОН ВЛЕВО-ВПРАВО. ЛОВИ 5Л, УКЛОНЯЙСЯ ОТ КАМНЕЙ.', W / 2, 146);
      ctx.restore();
    }
  }
}

/* ---------------------- хелпер ---------------------- */
function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
export { roundRect };
