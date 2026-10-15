/* =====================================================================
   РЕНДЕР
   ---------------------------------------------------------------------
   Сцена на canvas: звёзды, вагон изнутри, ПЯТИЛИТРУХА (настоящее фото
   Bagbier с прозрачной серединой) и отрисовка мини-игр.
   ===================================================================== */

const W = 1600, H = 900;              // виртуальное разрешение сцены
const BUILD_RENDER = 'v9';            // подпись сборки на холсте мини-игры

/** Все картинки сцены собраны здесь — их же проверяет tools/check-dom.mjs */
export const ASSETS = {
  bottle: 'assets/portraits/bottle-body.png',
  mask: 'assets/portraits/bottle-mask.png',
  alien: 'assets/portraits/alien.jpg',
  alienLegs: 'assets/portraits/alien-legs.jpg',
  group: 'assets/img-m29.jpg',
  trio: 'assets/img-m28.jpg',
};

function loadImg(src){
  const img = new Image();
  img.src = src;
  return img;
}

export class Renderer {
  constructor(canvas){
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.mgCanvas = null;             // холст мини-игры, берём лениво
    this.stars = [];
    this.nebulas = [];
    this.particles = [];
    this.floats = [];
    this.shake = 0;
    this.t = 0;
    this.tilt = 0;
    this.bagLevel = 0.6;
    this.bagTarget = 0.6;
    this.bagSlosh = 0;
    this.speedNorm = 0.5;
    this.gradNorm = 0.3;
    this.madNorm = 0.1;
    this.tempNorm = 0.6;
    this.distNorm = 0;
    this.alienLevel = 0;              // 0..1 — насколько она «есть»
    this.bottleShakeT = 0;
    this.flashCol = null;
    this.flashA = 0;
    this.mg = null;
    this.dpr = 1;
    this.cssW = 800; this.cssH = 300;

    this.imgBottle = loadImg(ASSETS.bottle);
    this.imgMask = loadImg(ASSETS.mask);
    this.imgAlien = loadImg(ASSETS.alien);
    this.imgAlienLegs = loadImg(ASSETS.alienLegs);
    this.imgGroup = loadImg(ASSETS.group);       // «БОТОХУЕТА МЕШАЕТ РОССИИ»
    this.imgTrio = loadImg(ASSETS.trio);         // «КТО УПРАВЛЯЕТ БОТОХУЕТОЙ?»

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
      const count = 88 - layer * 12;
      for (let i = 0; i < count; i++){
        this.stars.push({
          layer, x: rs(0, W * 1.4), y: rs(0, H),
          r: 0.6 + layer * 0.75 + Math.random() * 0.9,
          tw: rs(0, 6.28),
          hue: Math.random() < 0.12 ? rs(180, 220) : (Math.random() < 0.2 ? rs(20, 45) : 0),
        });
      }
    }
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
    this.cssW = Math.max(320, wrap.clientWidth);
    this.cssH = Math.max(150, wrap.clientHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this._syncCanvas(this.cv, this.cssW, this.cssH);
    this.scale = Math.max(this.cssW / W, this.cssH / H);   // fill, а не fit — фон без полей
    this.ox = (this.cssW - W * this.scale) / 2;
    this.oy = (this.cssH - H * this.scale) / 2;
  }

  /** Приводим РЕАЛЬНЫЙ размер холста (в device-пикселях) к его CSS-размеру.
      Без этого у canvas остаётся внутренняя область 300x150 по умолчанию,
      и всё нарисованное сжимается в угол — холст мини-игры выглядел чёрным. */
  _syncCanvas(el, fallbackW, fallbackH){
    if (!el) return { w: 1, h: 1, dpr: 1 };
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    const w = Math.max(1, Math.round(r && r.width ? r.width : fallbackW));
    const h = Math.max(1, Math.round(r && r.height ? r.height : fallbackH));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)){
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
    }
    return { w, h, dpr };
  }

  /* ---------------------- внешние команды ---------------------- */
  addShake(power){ this.shake = Math.min(40, this.shake + power); }
  flash(color, a = 0.5){ this.flashCol = color; this.flashA = a; }
  setBag(v){ this.bagTarget = Math.max(0, Math.min(1, v)); }
  setAlienInCar(v){ this.alienInCar = !!v; }

  burst(x, y, n, opts = {}){
    for (let i = 0; i < n; i++){
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.sp || 2) * (0.3 + Math.random());
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 1.4),
        life: opts.life || 60, max: opts.life || 60,
        r: opts.r || 3, col: opts.col || '#ffcf7a', grav: opts.grav ?? 0.06,
      });
    }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  float(text, col = '#ffd166'){
    this.floats.push({ text, col, life: 70, y: 0, x: (Math.random() - 0.5) * 160, ax: null, ay: null });
    if (this.floats.length > 8) this.floats.shift();
  }
  floatAt(text, x, y, col){
    this.floats.push({ text, col, life: 60, y: 0, x: 0, ax: x, ay: y });
  }

  /* ---------------------- главный цикл ---------------------- */
  _loop(now){
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.t += dt;

    this.bagLevel += (this.bagTarget - this.bagLevel) * Math.min(1, dt * 3.2);
    this.bagSlosh *= Math.pow(0.02, dt);
    this.shake *= Math.pow(0.02, dt);
    if (this.shake < 0.3) this.shake = 0;
    this.flashA *= Math.pow(0.01, dt);
    this.bottleShakeT = Math.max(0, this.bottleShakeT - dt);

    const sway = Math.sin(this.t * 1.7) * 0.7 + Math.sin(this.t * 3.1 + 1.2) * 0.3;
    this.tilt = sway * (0.5 + this.speedNorm) * 0.018 + this.bagSlosh * 0.06;

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

    this._draw();
    requestAnimationFrame(this._loop);
  }

  /* ---------------------- основная отрисовка ---------------------- */
  _draw(){
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    const sh = this.shake;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh * 0.7;
    const k = Math.min(this.cssW / W, this.cssH / H) * 1.0;
    this.drawScale = Math.max(this.cssW / W, this.cssH / H);
    const ox = (this.cssW - W * this.drawScale) / 2;
    const oy = (this.cssH - H * this.drawScale) / 2;

    ctx.save();
    ctx.translate(ox + sx, oy + sy);
    ctx.scale(this.drawScale, this.drawScale);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(this.tilt * 0.5);
    ctx.translate(-W / 2, -H / 2);

    this._drawSky(ctx);
    this._drawInterior(ctx);
    this._drawAlien(ctx);
    this._drawTable(ctx);
    this._drawBottle(ctx);
    this._drawParticles(ctx);
    this._drawFloats(ctx);
    ctx.restore();
    void k;

    if (this.mg) this.drawMinigame(this.mg);

    if (this.flashA > 0.01){
      ctx.fillStyle = this.flashCol || '#fff';
      ctx.globalAlpha = Math.min(0.6, this.flashA);
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.globalAlpha = 1;
    }
    const g = ctx.createRadialGradient(this.cssW / 2, this.cssH / 2, this.cssH * 0.3, this.cssW / 2, this.cssH / 2, this.cssH);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  _drawSky(ctx){
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05070f');
    bg.addColorStop(0.55, '#0a0d1c');
    bg.addColorStop(1, '#120a18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (const n of this.nebulas){
      n.x -= (0.25 + n.layer * 0.5) * this.speedNorm * 0.7;
      if (n.x < -n.r) n.x = W + n.r;
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      const hue = this.madNorm > 0.7 ? (n.hue + 60) % 360 : n.hue;
      g.addColorStop(0, `hsla(${hue},70%,60%,${n.a * (1 + this.madNorm * 0.6)})`);
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }

    // Альфа-Центавра растёт по мере приближения
    const d = this.distNorm;
    const cx = W * 0.17, cy = H * 0.3;
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

    for (const s of this.stars){
      s.x -= (0.12 + s.layer * 0.55) * (0.4 + this.speedNorm * 1.8);
      if (s.x < -20){ s.x = W + 20; s.y = Math.random() * H; }
      const tw = 0.55 + 0.45 * Math.sin(this.t * 2.4 + s.tw);
      let col = `rgba(255,255,255,${(0.25 + s.layer * 0.2) * tw})`;
      if (s.hue) col = `hsla(${s.hue},80%,72%,${(0.3 + s.layer * 0.2) * tw})`;
      ctx.fillStyle = col;
      const streak = this.speedNorm * s.layer * 7;
      ctx.fillRect(s.x, s.y, s.r + streak, s.r * 0.8 + (streak > 2 ? 1 : 0));
    }
  }

  /** интерьер купе: окно, полки, столик */
  _drawInterior(ctx){
    const lampGlow = 0.4 + this.tempNorm * 0.6;
    const wx = 130, wy = 90, ww = 1340, wh = 430, wr = 26;

    ctx.save();
    ctx.beginPath(); roundRect(ctx, wx - 26, wy - 26, ww + 52, wh + 52, wr + 8);
    ctx.fillStyle = '#151a28'; ctx.fill();
    ctx.beginPath(); roundRect(ctx, wx, wy, ww, wh, wr);
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(120,170,255,.06)';
    ctx.fillRect(wx, wy, ww, wh);
    const bg = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
    bg.addColorStop(0, 'rgba(255,255,255,.10)');
    bg.addColorStop(0.35, 'rgba(255,255,255,.02)');
    bg.addColorStop(0.62, 'rgba(255,255,255,.07)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.globalAlpha = lampGlow * 0.45;
    const rg = ctx.createRadialGradient(W * 0.62, wy + 170, 0, W * 0.62, wy + 170, 220);
    rg.addColorStop(0, 'rgba(255,214,140,.5)');
    rg.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.globalAlpha = 1;
    // морозные узоры при сильном морозе
    if (this.tempNorm < 0.4){
      ctx.strokeStyle = `rgba(200,235,255,${(0.4 - this.tempNorm) * 0.9})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++){
        const bx = wx + ((i * 211) % ww), by = wy + ((i * 97) % wh);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 40, by + 26);
        ctx.moveTo(bx + 40, by);
        ctx.lineTo(bx, by + 26);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.strokeStyle = '#1d2436'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(W * 0.5, wy); ctx.lineTo(W * 0.5, wy + wh); ctx.stroke();
    ctx.beginPath(); roundRect(ctx, wx, wy, ww, wh, wr);
    ctx.strokeStyle = '#232b40'; ctx.lineWidth = 7; ctx.stroke();
    ctx.restore();

    // полка сверху
    ctx.fillStyle = '#10141f'; ctx.fillRect(0, wy - 74, W, 58);
    ctx.fillStyle = '#1a2030'; ctx.fillRect(0, wy - 16, W, 16);

    // советская полоса
    ctx.fillStyle = '#8d2b1f'; ctx.fillRect(0, wy + wh + 26, W, 12);
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, wy + wh + 38, W, 5);

    // плафоны
    for (let i = -1; i <= 2; i++){
      const x = W * 0.5 + i * 340;
      const g = ctx.createRadialGradient(x, 34, 0, x, 34, 150);
      g.addColorStop(0, `rgba(255,220,160,${0.34 * lampGlow})`);
      g.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 150, -60, 300, 300);
      ctx.fillStyle = '#3b3427';
      roundRect(ctx, x - 60, 4, 120, 20, 8); ctx.fill();
      ctx.fillStyle = `rgba(255,236,190,${0.5 + 0.5 * lampGlow})`;
      roundRect(ctx, x - 54, 8, 108, 12, 6); ctx.fill();
    }

    // диван и пол
    const floorY = H * 0.80;
    ctx.fillStyle = '#241a24'; roundRect(ctx, 30, floorY - 16, W - 60, 56, 14); ctx.fill();
    ctx.fillStyle = '#33203a'; roundRect(ctx, 30, floorY - 16, W - 60, 24, 12); ctx.fill();
    const fg = ctx.createLinearGradient(0, floorY + 40, 0, H);
    fg.addColorStop(0, '#1a1420'); fg.addColorStop(1, '#07060b');
    ctx.fillStyle = fg; ctx.fillRect(0, floorY + 40, W, H - floorY - 40);

    ctx.strokeStyle = '#4a5470'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, wy + 26); ctx.lineTo(W, wy + 26); ctx.stroke();

    // тамбур
    ctx.fillStyle = '#0b0e18';
    roundRect(ctx, W - 150, wy + 100, 110, 300, 16); ctx.fill();
    ctx.strokeStyle = '#242c40'; ctx.lineWidth = 5;
    roundRect(ctx, W - 150, wy + 100, 110, 300, 16); ctx.stroke();

    this._drawWallProps(ctx, wy, wh);
  }

  /** зеркало с наблюдателем и фотографии на стене */
  _drawWallProps(ctx, wy, wh){
    const ky = wy + 120;

    // --- зеркало над умывальником ---
    const mx = W * 0.09, my = ky, mw = 190, mh = 250;
    ctx.fillStyle = '#2a2118';
    roundRect(ctx, mx - mw / 2 - 10, my - 10, mw + 20, mh + 20, 12); ctx.fill();
    const mg = ctx.createLinearGradient(mx - mw / 2, my, mx + mw / 2, my + mh);
    mg.addColorStop(0, '#5c7490');
    mg.addColorStop(0.4, '#31404f');
    mg.addColorStop(1, '#1b2531');
    ctx.fillStyle = mg;
    roundRect(ctx, mx - mw / 2, my, mw, mh, 8); ctx.fill();
    // блик
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#dff0ff';
    ctx.beginPath();
    ctx.moveTo(mx - mw / 2, my + mh * 0.7);
    ctx.lineTo(mx - mw / 2 + mw * 0.45, my);
    ctx.lineTo(mx - mw / 2 + mw * 0.7, my);
    ctx.lineTo(mx - mw / 2, my + mh);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // наблюдатель: темнеет тем сильнее, чем выше КГБ-метр
    const k = Math.min(1, this.kgbNorm * 1.35);
    if (k > 0.05){
      ctx.save();
      ctx.globalAlpha = 0.25 + k * 0.65;
      ctx.fillStyle = '#0a0d14';
      // силуэт в шляпе
      ctx.beginPath();
      ctx.ellipse(mx, my + mh * 0.52, mw * 0.2, mh * 0.24, 0, 0, 6.284);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(mx, my + mh * 0.25, mw * 0.17, mh * 0.1, 0, 0, 6.284);
      ctx.fill();
      ctx.fillRect(mx - mw * 0.24, my + mh * 0.16, mw * 0.48, 8);
      // глаза
      ctx.globalAlpha = 0.5 + k * 0.5;
      ctx.fillStyle = '#ff6a6a';
      ctx.beginPath(); ctx.arc(mx - 18, my + mh * 0.26, 3.2, 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + 18, my + mh * 0.26, 3.2, 0, 6.284); ctx.fill();
      ctx.restore();
    }

    // --- фотографии на стене ---
    const pics = [
      { img: this.imgTrio, x: W * 0.86, y: wy + 300, w: 210, h: 118, rot: -0.04 },
      { img: this.imgGroup, x: W * 0.72, y: wy + 210, w: 170, h: 96, rot: 0.05 },
    ];
    for (const p of pics){
      if (!p.img.complete || !p.img.naturalWidth) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot + this.tilt * 0.5);
      ctx.fillStyle = '#2a2118';
      roundRect(ctx, -p.w / 2 - 8, -p.h / 2 - 8, p.w + 16, p.h + 16, 6); ctx.fill();
      ctx.save();
      ctx.beginPath(); roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 3); ctx.clip();
      // кадрируем по центру
      const s = Math.max(p.w / p.img.naturalWidth, p.h / p.img.naturalHeight);
      const dw = p.img.naturalWidth * s, dh = p.img.naturalHeight * s;
      ctx.drawImage(p.img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,230,190,.25)';
      ctx.lineWidth = 2;
      roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 3); ctx.stroke();
      ctx.restore();
    }

    // --- бумажка с надписью на стенке ---
    ctx.save();
    ctx.translate(W * 0.63, wy + 330);
    ctx.rotate(0.06 + this.tilt * 0.5);
    ctx.fillStyle = 'rgba(240,232,210,.92)';
    roundRect(ctx, -70, -34, 140, 68, 4); ctx.fill();
    ctx.fillStyle = '#8d2b1f';
    ctx.font = '700 17px "Russo One", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('НЕ ТРЯСТИ', 0, -6);
    ctx.fillText('ПЯТИЛИТРУХУ', 0, 14);
    ctx.font = '600 12px "Segoe UI", sans-serif';
    ctx.fillStyle = '#6b6152';
    ctx.fillText('администрация', 0, 30);
    ctx.restore();
  }

  /** ОНА за окном: появляется при высоком бредометре */
  _drawAlien(ctx){
    const lvl = this.alienLevel;
    if (lvl <= 0.02 || !this.imgAlien.complete) return;
    const a = Math.min(1, lvl) * (0.55 + 0.45 * Math.abs(Math.sin(this.t * 0.7)));
    const bob = Math.sin(this.t * 1.1) * 12;
    const px = W * 0.80, py = H * 0.30 + bob;

    // оголовье: портрет в окне
    ctx.save();
    ctx.globalAlpha = 0.34 + a * 0.44;
    const w = 230, h = 310;
    ctx.beginPath(); roundRect(ctx, px - w / 2, py - h / 2, w, h, 18); ctx.clip();
    ctx.drawImage(this.imgAlien, px - w / 2, py - h / 2, w, h);
    ctx.restore();

    // «она в купе»: нижняя часть фигуры, если она уже в вагоне и бред высокий
    if (this.alienInCar && this.madNorm > 0.6 && this.imgAlienLegs.complete){
      ctx.save();
      ctx.globalAlpha = 0.28 + (this.madNorm - 0.6) * 0.9;
      const lw = 260, lh = 300, ly = H * 0.86 + Math.sin(this.t * 1.3) * 6;
      ctx.beginPath(); roundRect(ctx, px - lw / 2, ly - lh, lw, lh, 22); ctx.clip();
      ctx.drawImage(this.imgAlienLegs, px - lw / 2, ly - lh, lw, lh);
      ctx.restore();
    }

    // свечение
    ctx.save();
    const g = ctx.createRadialGradient(px, py, 0, px, py, 200);
    g.addColorStop(0, `rgba(95,215,255,${0.16 * a})`);
    g.addColorStop(1, 'rgba(95,215,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - 200, py - 200, 400, 400);
    ctx.restore();
  }

  /** ПЯТИЛИТРУХА — настоящее фото с прозрачной серединой */
  _drawBottle(ctx){
    const cx = W * 0.5, baseY = H * 0.845;
    const img = this.imgBottle;
    const mask = this.imgMask;
    if (!img.complete || !img.naturalWidth) return;

    const maxH = 330;
    const s = Math.min(maxH / img.naturalHeight, 1.6);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;

    const shaking = this.bottleShakeT > 0;
    const wob = shaking ? Math.sin(this.t * 44) * 0.13 * (this.bottleShakeT / 0.5) : 0;
    const slosh = Math.sin(this.t * 3.4) * 0.03 * (0.4 + this.speedNorm) + this.bagSlosh * 0.1;

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.rotate(wob + this.tilt * 0.5);

    // тень
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.ellipse(0, 4, w * 0.55, 13, 0, 0, 6.284); ctx.fill();

    const x0 = -w / 2, y0 = -h;

    // 1) жидкость (по маске), обрезаем снизу по уровню
    if (mask.complete && mask.naturalWidth){
      const lvl = this.bagLevel;
      const topY = y0 + h * (0.10 + (1 - lvl) * 0.78);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - 4, topY + slosh * 30, w + 8, h * 1.2);
      ctx.clip();
      const lg = ctx.createLinearGradient(0, topY, 0, y0 + h);
      const warm = this.gradNorm;
      lg.addColorStop(0, `rgba(${246 - warm * 20},${206 - warm * 30},${112 - warm * 20},.80)`);
      lg.addColorStop(0.6, 'rgba(214,158,58,.85)');
      lg.addColorStop(1, 'rgba(150,98,26,.92)');
      ctx.fillStyle = lg;
      ctx.drawImage(mask, x0, y0, w, h);
      // пузырьки
      ctx.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 16; i++){
        const bx = x0 + ((i * 53) % w);
        const by = y0 + h - ((this.t * (30 + i * 5) + i * 61) % Math.max(30, h - (topY - y0)));
        ctx.fillStyle = `rgba(255,248,220,${0.25 + (i % 3) * 0.12})`;
        ctx.beginPath(); ctx.arc(bx, by, 2 + (i % 3), 0, 6.284); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      // поверхность жидкости
      ctx.strokeStyle = 'rgba(255,240,200,.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0 + w * 0.08, topY + Math.sin(this.t * 2.6) * 3 + slosh * 30);
      ctx.quadraticCurveTo(0, topY - 6 + Math.sin(this.t * 3.3) * 4 + slosh * 46, x0 + w * 0.92, topY + Math.sin(this.t * 2.9) * 3 + slosh * 30);
      ctx.stroke();
    }

    // 2) сам корпус фото поверх жидкости
    ctx.drawImage(img, x0, y0, w, h);

    // 3) подпись уровня
    ctx.textAlign = 'center';
    const liters = this.bagLevel * 50;
    ctx.font = '700 30px "Russo One", Impact, sans-serif';
    ctx.fillStyle = liters < 8 ? '#ff8080' : liters < 18 ? '#ffd166' : '#8bf0b4';
    ctx.fillText(`${liters.toFixed(1).replace('.', ',')} л`, 0, y0 - 40);
    ctx.font = '600 15px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(200,215,240,.7)';
    ctx.fillText('из пятилитрухи', 0, y0 - 18);
    ctx.restore();
  }

  _drawTable(ctx){
    const y = H * 0.855;
    ctx.fillStyle = '#2b2233';
    roundRect(ctx, 80, y, W - 160, 26, 8); ctx.fill();
    ctx.fillStyle = '#3a2e44';
    roundRect(ctx, 80, y, W - 160, 10, 6); ctx.fill();

    // стаканы
    [[W * 0.20, 0], [W * 0.80, 0.2]].forEach(([x, o]) => {
      ctx.fillStyle = 'rgba(200,225,255,.22)';
      roundRect(ctx, x - 18, y - 54 + o * 10, 36, 54, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(220,240,255,.5)'; ctx.lineWidth = 3;
      roundRect(ctx, x - 18, y - 54 + o * 10, 36, 54, 5); ctx.stroke();
      if (this.gradNorm > 0.3){
        ctx.fillStyle = 'rgba(214,158,58,.5)';
        roundRect(ctx, x - 15, y - 30 + o * 10, 30, 27, 4); ctx.fill();
      }
    });

    // банка огурцов
    ctx.fillStyle = 'rgba(150,210,255,.14)';
    roundRect(ctx, W * 0.64, y - 84, 74, 84, 8); ctx.fill();
    ctx.fillStyle = '#4e7a34';
    for (let i = 0; i < 4; i++){
      ctx.beginPath();
      ctx.ellipse(W * 0.64 + 18 + (i % 2) * 34, y - 22 - ((i / 2) | 0) * 34, 15, 19, i * 0.6, 0, 6.284);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(220,240,255,.45)'; ctx.lineWidth = 3;
    roundRect(ctx, W * 0.64, y - 84, 74, 84, 8); ctx.stroke();

    // салфетка с расчётами
    ctx.save();
    ctx.translate(W * 0.38, y - 18);
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
      const x = (f.ax ?? W / 2) + f.x;
      const y = (f.ay ?? H * 0.5) + f.y;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillText(f.text, x + 2, y + 2);
      ctx.fillStyle = f.col;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /* =====================================================================
     ОТРИСОВКА МИНИ-ИГР
     ===================================================================== */
  drawMinigame(m){
    const el = this.mgCanvas || (this.mgCanvas = document.getElementById('mg-canvas'));
    if (!el) return;
    // ВАЖНО: мини-игра рисуется на ОТДЕЛЬНОМ холсте. Его размеры надо
    // синхронизировать в device-пикселях, иначе у canvas остаётся
    // внутренняя область 300x150 и холст выглядит чёрным.
    const { w: cw, h: ch, dpr } = this._syncCanvas(el, 600, 300);
    const ctx = el.getContext('2d');

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(4,6,13,.55)';
    ctx.fillRect(0, 0, cw, ch);

    // БАЗОВЫЙ СЛОЙ: фон и рамка рисуются ВСЕГДА, чтобы холст
    // никогда не выглядел пустым, даже если конкретная мини-игра упадёт.
    this._mgBase(ctx, cw, ch);

    try {
      const pad = Math.max(10, cw * 0.03);
      const bx = pad, by = pad, bw = cw - pad * 2, bh = ch - pad * 2;
      if (m.kind === 'tap') this._mgTap(ctx, m, bx, by, bw, bh);
      else if (m.kind === 'rhythm') this._mgRhythm(ctx, m, bx, by, bw, bh);
      else if (m.kind === 'pour') this._mgPour(ctx, m, bx, by, bw, bh);
      else if (m.kind === 'sync') this._mgSync(ctx, m, bx, by, bw, bh);
      else if (m.kind === 'dock') this._mgDock(ctx, m, bx, by, bw, bh);
    } catch (e){
      // рисуем сообщение прямо на холсте, а не оставляем черноту
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffb3ad';
      ctx.font = '600 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ошибка отрисовки: ' + (e && e.message ? e.message : e), cw / 2, ch / 2 + 8);
      ctx.restore();
      throw e;                                  // пусть Minigames включит текстовый режим
    }
    ctx.restore();
  }

  /** фон и подсказка — гарантированно видны всегда */
  _mgBase(ctx, cw, ch){
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#0d1424');
    g.addColorStop(1, '#05070e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    // рамка
    ctx.strokeStyle = 'rgba(255,196,92,.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, cw - 12, ch - 12);
    // подпись
    ctx.fillStyle = 'rgba(200,215,240,.5)';
    ctx.font = '600 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('МИНИ-ИГРА · сборка ' + BUILD_RENDER, cw - 14, ch - 14);
  }

  /** ПРОСТЕНЬКИЙ КОСМОСИМ: ведём вагон тапами и стыкуемся с кольцом */
  _mgDock(ctx, m, bx, by, bw, bh){
    const shake = (m.shake || 0) * 10;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // звёздное поле
    ctx.fillStyle = '#04060c';
    ctx.fillRect(bx, by, bw, bh);
    for (const s of m.stars){
      const x = bx + s.x * bw, y = by + s.y * bh;
      ctx.fillStyle = `rgba(200,225,255,${0.12 + s.z * 0.4})`;
      ctx.fillRect(x, y, 1 + s.z * 1.6, 1 + s.z * 1.6);
    }

    // станция: кольцо стыковки
    const sx = bx + bw * 0.78, sy = by + bh * (0.12 + m.portY * 0.76);
    const rr = Math.min(bw, bh) * 0.1;
    const off = Math.abs(m.y - m.portY);
    const inRing = off < 0.075;
    ctx.save();
    ctx.strokeStyle = inRing ? '#7dffb0' : '#5fd7ff';
    ctx.lineWidth = 4;
    const pulse = 1 + Math.sin(this.t * 6) * (inRing ? 0.12 : 0.04);
    ctx.beginPath(); ctx.arc(sx, sy, rr * pulse, 0, 6.284); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, rr * 0.55, 0, 6.284); ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = inRing ? '#7dffb0' : '#5fd7ff';
    ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 6.284); ctx.fill();
    ctx.globalAlpha = 1;
    // крест
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - rr * 1.5, sy); ctx.lineTo(sx + rr * 1.5, sy);
    ctx.moveTo(sx, sy - rr * 1.5); ctx.lineTo(sx, sy + rr * 1.5);
    ctx.stroke();
    ctx.restore();
    // корпус станции
    ctx.fillStyle = '#1b2437';
    roundRect(ctx, sx + rr * 1.1, sy - rr * 2.2, rr * 1.5, rr * 4.4, 8); ctx.fill();
    ctx.strokeStyle = '#31405c'; ctx.lineWidth = 2;
    roundRect(ctx, sx + rr * 1.1, sy - rr * 2.2, rr * 1.5, rr * 4.4, 8); ctx.stroke();

    // наш вагон
    const vx = bx + bw * 0.2, vy = by + bh * (0.12 + m.y * 0.76);
    ctx.save();
    ctx.translate(vx, vy);
    ctx.rotate(m.vel * 0.35);
    ctx.fillStyle = '#2c3a5e';
    roundRect(ctx, -34, -20, 68, 40, 10); ctx.fill();
    ctx.fillStyle = '#8d2b1f';
    roundRect(ctx, -34, 4, 68, 7, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,190,.92)';
    roundRect(ctx, -22, -13, 18, 16, 4); ctx.fill();
    roundRect(ctx, 2, -13, 18, 16, 4); ctx.fill();
    // сопло
    ctx.fillStyle = m.dir ? '#ffd166' : '#3a4560';
    ctx.beginPath();
    ctx.moveTo(-34, -8); ctx.lineTo(-34 - (m.dir ? 22 : 8), 0); ctx.lineTo(-34, 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // пунктир подлёта
    ctx.save();
    ctx.strokeStyle = inRing ? 'rgba(125,255,176,.5)' : 'rgba(255,255,255,.16)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(vx + 40, vy); ctx.lineTo(sx - rr * 1.2, vy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // индикатор курса
    const barW = bw * 0.5, barX = bx + bw * 0.5 - barW / 2, barY = by + bh * 0.9;
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    roundRect(ctx, barX, barY, barW, 12, 6); ctx.fill();
    ctx.fillStyle = inRing ? '#7dffb0' : '#ffb43d';
    roundRect(ctx, barX, barY, Math.max(2, barW * Math.min(1, m.hold / m.need)), 12, 6); ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = inRing ? '#7dffb0' : '#fff';
    ctx.font = `700 ${Math.round(bh * 0.085)}px "Russo One", Impact, sans-serif`;
    ctx.fillText(inRing ? 'ЕСТЬ КОНТАКТ — ДЕРЖИ!' : 'ВЕДИ ВАГОН В КОЛЬЦО', bx + bw / 2, by + bh * 0.12);
    ctx.fillStyle = 'rgba(200,215,240,.8)';
    ctx.font = `600 ${Math.round(bh * 0.045)}px "Segoe UI", sans-serif`;
    ctx.fillText(`СТЫКОВОК: ${m.docks} / ${m.need3}   ·   ТОПЛИВО: ${Math.round(m.fuel)}   ·   АВАРИЙ: ${m.crashes}`, bx + bw / 2, by + bh * 0.19);
    ctx.fillStyle = 'rgba(160,180,210,.75)';
    ctx.font = `600 ${Math.round(bh * 0.038)}px "Segoe UI", sans-serif`;
    ctx.fillText('ТАП ВВЕРХУ — ВВЕРХ, ТАП ВНИЗУ — ВНИЗ', bx + bw / 2, by + bh * 0.97);

    // подсказки зон тапа
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#5fd7ff';
    ctx.fillRect(bx, by, 4, bh / 2);
    ctx.fillStyle = '#ffb43d';
    ctx.fillRect(bx, by + bh / 2, 4, bh / 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** большая бутылка по центру — тапай по ней */
  _mgTap(ctx, m, bx, by, bw, bh){
    const cx = bx + bw / 2, cy = by + bh * 0.56;
    const img = this.imgBottle;
    const sc = Math.min((bh * 0.86) / (img.naturalHeight || 460), bw * 0.34 / (img.naturalWidth || 206));
    const w = (img.naturalWidth || 206) * sc, h = (img.naturalHeight || 460) * sc;
    const wob = Math.sin(this.t * 34) * 0.09 * m.wobble;

    // фон-подсветка
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(bw, bh) * 0.5);
    g.addColorStop(0, `rgba(255,180,61,${0.1 + m.foam * 0.18})`);
    g.addColorStop(1, 'rgba(255,180,61,0)');
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, bw, bh);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wob);
    // пена за бутылкой
    for (const s of m.splashes){
      ctx.globalAlpha = Math.max(0, s.life) * 0.7;
      ctx.fillStyle = '#fff3cf';
      ctx.beginPath(); ctx.arc((s.x / 1600) * bw + bx - cx, cy - 40 - Math.random() * 40, 4 + 8 * (1 - s.life), 0, 6.284); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (img.complete && img.naturalWidth){
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      // пена внутри
      ctx.save();
      ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
      const foamTop = h / 2 - (h * 0.86) * m.foam;
      ctx.fillStyle = 'rgba(255,250,230,.75)';
      ctx.beginPath();
      ctx.moveTo(-w, foamTop + Math.sin(this.t * 12) * 4);
      for (let x = -w; x <= w; x += 12) ctx.lineTo(x, foamTop + Math.sin(this.t * 14 + x * 0.06) * 5);
      ctx.lineTo(w, h); ctx.lineTo(-w, h); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    this._mgBar(ctx, bx + bw * 0.1, by + bh * 0.93, bw * 0.8, 16, m.foam, '#fff0c0', '#ffb43d');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(Math.min(bw, bh) * 0.07)}px "Russo One", Impact, sans-serif`;
    ctx.fillText(`ТАПОВ: ${m.taps}`, cx, by + bh * 0.09);
    ctx.fillStyle = 'rgba(200,215,240,.8)';
    ctx.font = `600 ${Math.round(Math.min(bw, bh) * 0.038)}px "Segoe UI", sans-serif`;
    ctx.fillText('нужно 22 тапа для идеальной тряски', cx, by + bh * 0.16);
  }

  /** дорожка с ромбами */
  _mgRhythm(ctx, m, bx, by, bw, bh){
    const laneY = by + bh * 0.6;
    const x0 = bx + bw * 0.82, x1 = bx + bw * 0.1;
    const span = x0 - x1;
    void span;
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx + bw * 0.08, laneY); ctx.lineTo(bx + bw * 0.92, laneY); ctx.stroke();

    const SPEED = 0.62; // доля дорожки в секунду
    for (const n of m.notes){
      const dt = n.t - (m.elapsed || 0);
      const x = x0 - (dt * SPEED) * bw * 0.78;
      if (x < bx - 60 || x > bx + bw + 60) continue;
      const r = bh * 0.055;
      ctx.fillStyle = n.hit === 'perfect' ? '#ffd166' : n.hit === 'good' ? '#5fd7ff' : 'rgba(255,255,255,.8)';
      ctx.beginPath();
      ctx.moveTo(x, laneY - r); ctx.lineTo(x + r * 0.85, laneY); ctx.lineTo(x, laneY + r); ctx.lineTo(x - r * 0.85, laneY);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      ctx.font = `700 ${Math.round(r * 0.8)}px "Russo One", Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('67', x, laneY + r * 0.3);
    }

    // метка
    const mx = x0;
    ctx.strokeStyle = m.flash >= 0 ? '#7dffb0' : '#ff8080';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(mx, laneY - bh * 0.22); ctx.lineTo(mx, laneY + bh * 0.22); ctx.stroke();
    ctx.fillStyle = m.flash >= 0 ? '#7dffb0' : '#ff8080';
    ctx.beginPath(); ctx.arc(mx, laneY, 12, 0, 6.284); ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(bh * 0.11)}px "Russo One", Impact, sans-serif`;
    ctx.fillText(`${m.score}`, bx + bw * 0.5, by + bh * 0.16);
    ctx.fillStyle = 'rgba(200,215,240,.75)';
    ctx.font = `600 ${Math.round(bh * 0.05)}px "Segoe UI", sans-serif`;
    ctx.fillText(`комбо ${m.combo} · промахов ${m.miss}`, bx + bw * 0.5, by + bh * 0.24);
  }

  /** стакан и метка уровня */
  _mgPour(ctx, m, bx, by, bw, bh){
    const gx = bx + bw * 0.5, gy = by + bh * 0.14, gw = Math.min(bw * 0.26, 150), gh = bh * 0.7;
    // стакан
    ctx.fillStyle = 'rgba(200,225,255,.10)';
    roundRect(ctx, gx - gw / 2, gy, gw, gh, 10); ctx.fill();
    // налитое
    const lh = gh * Math.min(1, m.level);
    const lg = ctx.createLinearGradient(0, gy + gh - lh, 0, gy + gh);
    lg.addColorStop(0, 'rgba(255,224,150,.9)');
    lg.addColorStop(1, 'rgba(190,130,40,.95)');
    ctx.fillStyle = lg;
    roundRect(ctx, gx - gw / 2 + 4, gy + gh - lh, gw - 8, Math.max(0, lh - 4), 8); ctx.fill();
    // метка цели
    const ty = gy + gh * (1 - m.target);
    ctx.strokeStyle = '#7dffb0';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 7]);
    ctx.beginPath(); ctx.moveTo(gx - gw * 0.75, ty); ctx.lineTo(gx + gw * 0.75, ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#7dffb0';
    ctx.textAlign = 'left';
    ctx.font = `700 ${Math.round(bh * 0.045)}px "Russo One", Impact, sans-serif`;
    ctx.fillText('НАЛИТЬ ДО ЭТОЙ ЛИНИИ', gx + gw * 0.8, ty + 6);
    // контур
    ctx.strokeStyle = 'rgba(220,240,255,.6)';
    ctx.lineWidth = 4;
    roundRect(ctx, gx - gw / 2, gy, gw, gh, 10); ctx.stroke();

    // пролитое
    if (m.spilled > 0){
      ctx.fillStyle = 'rgba(214,158,58,.5)';
      ctx.beginPath(); ctx.ellipse(gx, gy + gh + 26, gw * 0.9, 12, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = '#ff9a92';
      ctx.textAlign = 'center';
      ctx.font = `600 ${Math.round(bh * 0.04)}px "Segoe UI", sans-serif`;
      ctx.fillText(`пролито ${m.spilled.toFixed(2)} л`, gx, gy + gh + 58);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(bh * 0.1)}px "Russo One", Impact, sans-serif`;
    ctx.fillText(`СТАКАНОВ: ${m.cups}/5`, gx, by + bh * 0.075);
  }

  /** две метки: ты и она */
  _mgSync(ctx, m, bx, by, bw, bh){
    const lw = bw * 0.72, lx = bx + (bw - lw) / 2;
    // зона
    const zx = lx + m.zone.s * lw, zw = m.zone.w * lw;
    ctx.fillStyle = 'rgba(125,255,176,.28)';
    roundRect(ctx, zx, by + bh * 0.1, zw, bh * 0.8, 10); ctx.fill();

    // её метка (синяя)
    const by1 = by + bh * 0.3;
    this._mgBar(ctx, lx, by1, lw, 20, 0, '#0a2a3a', '#0a2a3a');
    ctx.fillStyle = '#5fd7ff';
    roundRect(ctx, lx, by1, lw * m.b, 20, 10); ctx.fill();
    ctx.fillStyle = '#a9e7ff';
    ctx.textAlign = 'left';
    ctx.font = `700 ${Math.round(bh * 0.045)}px "Russo One", Impact, sans-serif`;
    ctx.fillText('ОНА', lx, by1 - 12);

    // твоя метка (золотая)
    const by2 = by + bh * 0.6;
    this._mgBar(ctx, lx, by2, lw, 20, 0, '#3a2a0a', '#3a2a0a');
    ctx.fillStyle = '#ffb43d';
    roundRect(ctx, lx, by2, lw * m.a, 20, 10); ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillText('ТЫ', lx, by2 - 12);

    ctx.textAlign = 'center';
    ctx.fillStyle = m.flash >= 0 ? '#7dffb0' : '#ff8080';
    ctx.font = `700 ${Math.round(bh * 0.1)}px "Russo One", Impact, sans-serif`;
    ctx.fillText(`СОВПАДЕНИЙ: ${m.hits} / ${m.need || 4}`, bx + bw / 2, by + bh * 0.075);
    if (m.linger > 0.05){
      ctx.fillStyle = 'rgba(125,255,176,.9)';
      ctx.font = `600 ${Math.round(bh * 0.045)}px "Segoe UI", sans-serif`;
      ctx.fillText('СЕЙЧАС!', bx + bw / 2, by + bh * 0.93);
    }
  }

  _mgBar(ctx, x, y, w, h, fill, c1, c2){
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    if (fill > 0){
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g;
      roundRect(ctx, x, y, Math.max(4, w * fill), h, h / 2); ctx.fill();
    }
  }
}

export function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
