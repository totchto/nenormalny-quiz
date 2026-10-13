(() => {
  'use strict';

  const canvas = document.getElementById('flight');
  const ctx = canvas.getContext('2d', { alpha: false });
  const overlay = document.getElementById('game-overlay');
  const startButton = document.getElementById('start-game');
  const overlayKicker = document.getElementById('overlay-kicker');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayCopy = document.getElementById('overlay-copy');
  const scoreDisplay = document.getElementById('pants-count');
  const timeDisplay = document.getElementById('time-left');
  const livesDisplay = document.getElementById('lives');
  const bestDisplay = document.getElementById('best-score');
  const W = canvas.width;
  const H = canvas.height;
  const DURATION = 52;
  const FINAL_STORM = DURATION - 12;
  const BEST_KEY = 'shanny-potok:best:v1';
  const keys = new Set();
  const hazards = ['voice', 'forward', 'usb', 'mention'];
  let state = 'ready';
  let lastFrame = 0;
  let elapsed = 0;
  let spawnClock = 0;
  let backgroundOffset = 0;
  let score = 0;
  let pants = 0;
  let lives = 3;
  let combo = 0;
  let comboAge = 0;
  let invulnerable = 0;
  let flash = 0;
  let pointerDown = false;
  let pointer = { x: W / 2, y: H * .73 };
  let objects = [];
  let particles = [];
  let best = readBest();
  const player = { x: W / 2, y: H * .72, vx: 0, vy: 0, radius: 11 };
  const stars = Array.from({ length: 48 }, (_, i) => ({
    x: (i * 83 + 29) % W,
    y: (i * 67 + 17) % H,
    size: i % 7 === 0 ? 2 : 1,
    speed: 18 + (i % 5) * 8,
    color: i % 6 === 0 ? '#55c5c4' : '#686b89'
  }));

  function readBest() {
    try { return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0); }
    catch { return 0; }
  }

  function saveBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* storage may be disabled */ }
  }

  function updateHud() {
    scoreDisplay.textContent = String(pants).padStart(2, '0');
    timeDisplay.textContent = String(Math.max(0, Math.ceil(DURATION - elapsed))).padStart(2, '0');
    livesDisplay.textContent = `${'♥ '.repeat(lives)}${'· '.repeat(3 - lives)}`.trim();
    livesDisplay.setAttribute('aria-label', `${lives} ${lives === 1 ? 'жизнь' : 'жизни'}`);
    bestDisplay.textContent = `РЕКОРД НА ЭТОМ УСТРОЙСТВЕ: ${best}`;
  }

  function pixelText(text, x, y, color = '#f4f0da', size = 9, align = 'center') {
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function block(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function drawBackground(dt) {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#171a2b');
    gradient.addColorStop(1, '#101722');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    backgroundOffset = (backgroundOffset + dt * (state === 'playing' ? 66 : 18)) % 80;
    for (const star of stars) {
      const y = (star.y + backgroundOffset * star.speed / 66) % H;
      block(star.x, y, star.size, star.size, star.color);
    }

    // A quiet message-stream grid gives the flight a sense of forward motion.
    ctx.globalAlpha = .28;
    for (let row = -1; row < 6; row++) {
      const y = row * 62 + (backgroundOffset % 62);
      block(27 + (row % 2) * 10, y, 2, 20, '#3d5364');
      block(W - 30 - (row % 2) * 10, y + 15, 2, 25, '#3d5364');
    }
    ctx.globalAlpha = 1;

    if (elapsed >= FINAL_STORM && state === 'playing') {
      ctx.fillStyle = `rgba(255, 91, 111, ${.035 + Math.sin(elapsed * 7) * .02})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawPants(x, y, rotation = 0, scale = 1) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    block(-7, -8, 14, 5, '#fff0a4');
    block(-8, -5, 16, 6, '#ffcf62');
    block(-7, 1, 6, 11, '#55c5d8');
    block(1, 1, 6, 11, '#55c5d8');
    block(-7, 10, 5, 3, '#d9fa6a');
    block(2, 10, 5, 3, '#d9fa6a');
    block(-1, -5, 2, 5, '#f3a946');
    ctx.restore();
  }

  function drawPlayer(x, y, now = 0) {
    if (invulnerable > 0 && Math.floor(now / 75) % 2 === 0) return;
    const bob = state === 'playing' ? Math.sin(now / 100) * 1.4 : 0;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + bob));
    ctx.scale(1.18, 1.18);

    // Pixel shadow and little speed streaks.
    block(-12, 15, 8, 2, '#0a0c16');
    block(4, 15, 8, 2, '#0a0c16');
    if (state === 'playing') {
      block(-9, 21, 3, 7, '#5e687e');
      block(6, 21, 3, 10, '#5e687e');
    }

    // Lavender hood frames a longer face, short side-parted brown hair and light eyes.
    block(-11, -10, 22, 18, '#82788e');
    block(-9, -14, 18, 9, '#b5aebe');
    block(-10, -6, 4, 11, '#a59bad');
    block(6, -6, 4, 11, '#a59bad');
    block(-7, -11, 14, 14, '#e2bb9b');
    block(-8, -6, 2, 4, '#d3a789');
    block(6, -6, 2, 4, '#d3a789');

    // Hairline and side sweep.
    block(-8, -14, 16, 6, '#563d30');
    block(-6, -15, 11, 3, '#76543c');
    block(-4, -13, 8, 2, '#947052');
    block(2, -12, 5, 3, '#684a37');
    block(-8, -10, 3, 4, '#563d30');

    // Brows, pale eyes, nose and a restrained half-smile.
    block(-6, -7, 4, 1, '#74513d');
    block(2, -7, 4, 1, '#74513d');
    block(-5, -5, 3, 2, '#d9e4de');
    block(2, -5, 3, 2, '#d9e4de');
    block(-4, -5, 1, 2, '#5a7180');
    block(3, -5, 1, 2, '#5a7180');
    block(-1, -3, 2, 3, '#c39378');
    block(-3, 1, 6, 1, '#9e655f');
    block(-2, 2, 4, 1, '#b8786c');

    // Hoodie sleeves, drawstrings and jeans keep the outfit from the reference.
    block(-15, 2, 7, 10, '#a49baa');
    block(8, 2, 7, 10, '#a49baa');
    block(-8, 1, 16, 14, '#bdb6c5');
    block(-7, 3, 14, 11, '#aaa2b3');
    block(-4, 2, 1, 7, '#e0d9db');
    block(3, 2, 1, 7, '#e0d9db');
    block(-7, 13, 6, 8, '#53647d');
    block(1, 13, 6, 8, '#53647d');
    block(-8, 20, 7, 3, '#d3d1c8');
    block(1, 20, 7, 3, '#d3d1c8');
    block(-2, 4, 4, 2, '#92899d');
    ctx.restore();
  }

  function drawHazard(item) {
    const x = Math.round(item.x);
    const y = Math.round(item.y);
    ctx.save();
    ctx.translate(x, y);
    if (item.type === 'voice') {
      block(-20, -13, 40, 26, '#762e4a');
      block(-17, -10, 34, 20, '#f36f7d');
      block(-13, -6, 3, 12, '#321d38');
      block(-8, -9, 3, 18, '#321d38');
      block(-3, -5, 3, 10, '#321d38');
      block(3, -8, 3, 16, '#321d38');
      block(9, -4, 3, 8, '#321d38');
      pixelText('03:47', 0, 22, '#ffd8cf', 8);
    } else if (item.type === 'forward') {
      block(-23, -15, 46, 30, '#6d342f');
      block(-21, -17, 42, 30, '#ffad62');
      block(-16, -11, 24, 3, '#783a3b');
      block(-16, -5, 32, 3, '#783a3b');
      block(-16, 1, 27, 3, '#783a3b');
      pixelText('ПЕРЕСЛАНО', 0, 9, '#602b36', 6);
    } else if (item.type === 'usb') {
      block(-13, -20, 26, 39, '#894e38');
      block(-11, -17, 22, 32, '#f3a652');
      block(-7, -23, 14, 5, '#b6c3c6');
      block(-4, -22, 8, 3, '#d6dedb');
      pixelText('КП', 0, -4, '#603044', 10);
      pixelText('КРИПТО', 0, 9, '#603044', 5);
    } else {
      block(-23, -14, 46, 28, '#71344c');
      block(-21, -16, 42, 27, '#ff7183');
      block(-13, -9, 26, 3, '#5e2b46');
      block(-13, -3, 18, 3, '#5e2b46');
      block(-13, 3, 22, 3, '#5e2b46');
      block(-6, 11, 9, 7, '#ff7183');
      pixelText('ОТВЕТЬ', 0, -22, '#ffd5d1', 7);
    }
    ctx.restore();
  }

  function drawHeart(x, y, scale = 1) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    block(-8, -7, 6, 4, '#ff7885'); block(2, -7, 6, 4, '#ff7885');
    block(-10, -3, 20, 8, '#ff7885');
    block(-7, 5, 14, 4, '#ff7885');
    block(-4, 9, 8, 4, '#ff7885');
    block(-6, -5, 3, 3, '#ffd3b7');
    ctx.restore();
  }

  function drawObject(item) {
    if (item.type === 'pants') drawPants(item.x, item.y, Math.sin(item.age * 4) * .14, 1.05);
    else if (item.type === 'heart') drawHeart(item.x, item.y, 1.1);
    else drawHazard(item);
  }

  function addParticles(x, y, color, amount = 9) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 80;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .34 + Math.random() * .38, maxLife: .72, color, size: 2 + Math.floor(Math.random() * 3) });
    }
  }

  function spawn() {
    const x = 32 + Math.random() * (W - 64);
    const late = elapsed > FINAL_STORM;
    const roll = Math.random();
    let type;
    if (roll < .55) type = 'pants';
    else if (roll < .59 && lives < 3) type = 'heart';
    else type = hazards[Math.floor(Math.random() * hazards.length)];
    const speed = 73 + Math.random() * 35 + elapsed * .62 + (late ? 20 : 0);
    objects.push({ type, x, y: -25, vx: (Math.random() - .5) * (type === 'pants' ? 22 : 9), vy: speed, age: 0, radius: type === 'pants' ? 12 : type === 'heart' ? 12 : 20 });
  }

  function startGame() {
    state = 'playing';
    elapsed = 0;
    spawnClock = .5;
    score = 0;
    pants = 0;
    lives = 3;
    combo = 0;
    comboAge = 0;
    invulnerable = 0;
    flash = 0;
    objects = [];
    particles = [];
    player.x = W / 2;
    player.y = H * .72;
    player.vx = 0;
    player.vy = 0;
    keys.clear();
    overlay.hidden = true;
    canvas.focus({ preventScroll: true });
    updateHud();
  }

  function endGame(completed) {
    state = 'finished';
    saveBest();
    updateHud();
    overlayKicker.textContent = completed ? 'ФИНИШ / ЧАТ ПЕРЕЖИТ' : 'СООБЩЕНИЕ НЕ ДОСТАВЛЕНО';
    overlayTitle.innerHTML = completed ? 'ПОТОК<br>ПРОЙДЕН' : 'ПОЛЁТ<br>ПРЕРВАН';
    const comboText = combo > 1 ? ` Лучшее комбо — ${combo}.` : '';
    overlayCopy.textContent = completed
      ? `Ты долетел до конца и собрал ${pants} ${pants === 1 ? 'пару штанов' : 'пар штанов'}. Результат: ${score} очков.${comboText}`
      : `Ты собрал ${pants} ${pants === 1 ? 'пару штанов' : 'пар штанов'} и набрал ${score} очков. Попробуй ещё раз — чат всё ещё летит.`;
    startButton.innerHTML = 'ЕЩЁ РАЗ <span aria-hidden="true">↻</span>';
    overlay.hidden = false;
    addParticles(player.x, player.y, completed ? '#d7fa6a' : '#ff7885', 24);
  }

  function collect(item) {
    if (item.type === 'pants') {
      combo += 1;
      comboAge = 0;
      pants += 1;
      score += 10 + Math.min(combo - 1, 5) * 2;
      addParticles(item.x, item.y, '#d7fa6a', 11);
    } else if (item.type === 'heart') {
      lives = Math.min(3, lives + 1);
      score += 5;
      addParticles(item.x, item.y, '#ff7885', 12);
    } else {
      if (invulnerable > 0) return;
      lives -= 1;
      combo = 0;
      invulnerable = 1.35;
      flash = .22;
      addParticles(player.x, player.y, '#ff7885', 13);
      if (lives <= 0) {
        updateHud();
        endGame(false);
      }
    }
    updateHud();
  }

  function updatePlayer(dt) {
    let dx = (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? 1 : 0);
    let dy = (keys.has('ArrowDown') || keys.has('s') || keys.has('S') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') || keys.has('W') ? 1 : 0);
    if (!dx && !dy && pointerDown) {
      dx = Math.max(-1, Math.min(1, (pointer.x - player.x) / 31));
      dy = Math.max(-1, Math.min(1, (pointer.y - player.y) / 31));
    }
    if (dx && dy) { dx *= .7071; dy *= .7071; }
    const speed = 190;
    const response = Math.min(1, dt * 8);
    player.vx += (dx * speed - player.vx) * response;
    player.vy += (dy * speed - player.vy) * response;
    if (!dx) player.vx *= Math.max(0, 1 - dt * 3.8);
    if (!dy) player.vy *= Math.max(0, 1 - dt * 3.8);
    player.x = Math.max(19, Math.min(W - 19, player.x + player.vx * dt));
    player.y = Math.max(34, Math.min(H - 24, player.y + player.vy * dt));
  }

  function update(dt, now) {
    drawBackground(dt);
    if (state === 'playing') {
      elapsed += dt;
      spawnClock -= dt;
      if (spawnClock <= 0) {
        spawn();
        spawnClock = Math.max(.38, .76 - elapsed * .004) + Math.random() * .24;
      }
      updatePlayer(dt);
      invulnerable = Math.max(0, invulnerable - dt);
      comboAge += dt;
      if (comboAge > 3.2) combo = 0;
      flash = Math.max(0, flash - dt);

      for (const item of objects) {
        item.age += dt;
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        if (item.x < 25 || item.x > W - 25) item.vx *= -1;
      }
      for (let i = objects.length - 1; i >= 0; i--) {
        const item = objects[i];
        if (item.y > H + 30) { objects.splice(i, 1); continue; }
        const dx = item.x - player.x;
        const dy = item.y - player.y;
        if (dx * dx + dy * dy < (item.radius + player.radius) ** 2) {
          objects.splice(i, 1);
          collect(item);
          if (state !== 'playing') break;
        }
      }

      if (elapsed >= DURATION && state === 'playing') endGame(true);
      if (Math.floor(elapsed) !== Math.floor(elapsed - dt)) updateHud();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 2);
      p.vy *= Math.max(0, 1 - dt * 2);
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (const item of objects) drawObject(item);
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life / .16, p.life / p.maxLife + .25);
      block(p.x, p.y, p.size, p.size, p.color);
    }
    ctx.globalAlpha = 1;

    if (elapsed >= FINAL_STORM && state === 'playing') {
      pixelText('ФИНАЛЬНЫЙ ШКВАЛ', W / 2, 16, '#ff9c91', 9);
    }
    if (combo > 1 && state === 'playing') pixelText(`КОМБО ×${combo}`, W / 2, H - 13, '#d7fa6a', 9);
    drawPlayer(player.x, player.y, now);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 104, 126, ${flash * .65})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state === 'playing' && elapsed >= FINAL_STORM && Math.floor(now / 220) % 2 === 0) {
      ctx.fillStyle = '#ff667b14';
      ctx.fillRect(0, 0, W, H);
    }
    lastFrame = now;
    requestAnimationFrame(frame);
  }

  function frame(now) {
    const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000 || 0));
    update(dt, now);
  }

  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) * W / rect.width;
    pointer.y = (event.clientY - rect.top) * H / rect.height;
  }

  startButton.addEventListener('click', startGame);
  canvas.addEventListener('pointerdown', event => {
    if (state !== 'playing') return;
    pointerDown = true;
    setPointer(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => { if (pointerDown) setPointer(event); });
  canvas.addEventListener('pointerup', () => { pointerDown = false; });
  canvas.addEventListener('pointercancel', () => { pointerDown = false; });
  window.addEventListener('keydown', event => {
    if (state === 'playing') {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
      keys.add(event.key);
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.key));
  window.addEventListener('blur', () => { keys.clear(); pointerDown = false; });

  updateHud();
  requestAnimationFrame(frame);
})();
