/**
 * Kyiv 2027: Tactical Air Defense Simulator
 * High-performance canvas simulation of Kyiv airspace defense.
 * Cyber-Tactical edition:
 * - Real geography simulation (Dnipro river, bridges, critical energy plants)
 * - 360° Rotating Radar Sweep Line with phosphor persistence
 * - Multiple defense layers: Mobile Fire Groups (МВГ), Gepard 35mm, Patriot PAC-3
 * - Flak shockwaves, ballistic lead prediction, incandescent tracer rounds
 * - Synthesized Web Audio sound effects (radar ping, gunfire, flak explosion, missile launch)
 */

class KyivDefenseSimulator {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Simulation state
    this.isRunning = false;
    this.isMuted = true;
    this.score = 0;
    this.interceptedCount = 0;
    this.missedCount = 0;
    this.gridIntegrity = 100;
    this.selectedWeapon = 'mvg'; // 'mvg', 'gepard', 'patriot'
    this.speedMultiplier = 1;
    this.wave = 1;
    this.spawnTimer = 0;
    this.radarAngle = 0; // 360° sweep line angle

    // Mouse / Target Reticle
    this.mouseX = 0;
    this.mouseY = 0;
    this.isHovering = false;

    // Entities
    this.threats = [];
    this.projectiles = [];
    this.particles = [];
    this.shockwaves = [];
    this.searchlights = [];
    this.batteries = [];
    this.infrastructure = [];

    // Synthesized Audio
    this.audioCtx = null;
    this.setupAudio();

    // Resize handling
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Setup map
    this.initWorld();
    this.setupInputs();

    // Render loop
    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {
      console.warn('Web Audio not supported');
    }
  }

  resumeAudio() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.08) {
    if (this.isMuted || !this.audioCtx) return;
    this.resumeAudio();
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {}
  }

  playGunfire() {
    if (this.isMuted || !this.audioCtx) return;
    this.resumeAudio();
    try {
      const bufferSize = this.audioCtx.sampleRate * 0.05;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 850;
      const gain = this.audioCtx.createGain();
      gain.gain.value = 0.14;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioCtx.destination);
      noise.start();
    } catch (e) {}
  }

  playExplosion(large = false) {
    if (this.isMuted || !this.audioCtx) return;
    this.resumeAudio();
    try {
      const dur = large ? 0.65 : 0.35;
      const bufferSize = this.audioCtx.sampleRate * dur;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = large ? 180 : 340;
      const gain = this.audioCtx.createGain();
      gain.gain.value = large ? 0.32 : 0.16;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioCtx.destination);
      noise.start();
    } catch (e) {}
  }

  playLaunch() {
    if (this.isMuted || !this.audioCtx) return;
    this.resumeAudio();
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1500, this.audioCtx.currentTime + 0.38);
      gain.gain.setValueAtTime(0.14, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.38);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.38);
    } catch (e) {}
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width || 800;
    this.height = Math.max(480, Math.min(rect.height || 540, 680));
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
    this.initWorld();
  }

  initWorld() {
    const w = this.width;
    const h = this.height;

    // Infrastructure targets to protect
    this.infrastructure = [
      { id: 'tec5', name: 'ТЕЦ-5 (Видубичі)', x: w * 0.48, y: h * 0.62, hp: 100, maxHp: 100, type: 'power' },
      { id: 'tec6', name: 'ТЕЦ-6 (Троєщина)', x: w * 0.72, y: h * 0.22, hp: 100, maxHp: 100, type: 'power' },
      { id: 'patona', name: 'Міст Патона', x: w * 0.54, y: h * 0.52, hp: 100, maxHp: 100, type: 'bridge' },
      { id: 'pivdennyi', name: 'Південний міст', x: w * 0.56, y: h * 0.68, hp: 100, maxHp: 100, type: 'bridge' },
      { id: 'maidan', name: 'Урядовий квартал', x: w * 0.44, y: h * 0.45, hp: 100, maxHp: 100, type: 'center' }
    ];

    // Defense assets placed across the city
    this.batteries = [
      {
        id: 'b1',
        name: 'МВГ-01 Оболонь',
        type: 'mvg',
        x: w * 0.38,
        y: h * 0.26,
        range: 160,
        rate: 0.15,
        lastFire: 0,
        ammo: 120,
        angle: 0
      },
      {
        id: 'b2',
        name: 'Gepard Поділ',
        type: 'gepard',
        x: w * 0.42,
        y: h * 0.38,
        range: 210,
        rate: 0.08,
        lastFire: 0,
        ammo: 240,
        angle: 0
      },
      {
        id: 'b3',
        name: 'Patriot Центр',
        type: 'patriot',
        x: w * 0.46,
        y: h * 0.54,
        range: 350,
        rate: 1.8,
        lastFire: 0,
        ammo: 16,
        angle: 0
      },
      {
        id: 'b4',
        name: 'МВГ-02 Русанівка',
        type: 'mvg',
        x: w * 0.62,
        y: h * 0.46,
        range: 160,
        rate: 0.15,
        lastFire: 0,
        ammo: 120,
        angle: 0
      },
      {
        id: 'b5',
        name: 'Gepard Південний',
        type: 'gepard',
        x: w * 0.52,
        y: h * 0.72,
        range: 210,
        rate: 0.08,
        lastFire: 0,
        ammo: 240,
        angle: 0
      }
    ];

    // Searchlights sweeping the sky
    this.searchlights = [
      { x: w * 0.40, y: h * 0.32, angle: -Math.PI / 2, sweepSpeed: 0.02, beamLength: 280, width: 0.2 },
      { x: w * 0.60, y: h * 0.50, angle: -Math.PI / 2, sweepSpeed: -0.018, beamLength: 260, width: 0.22 },
      { x: w * 0.46, y: h * 0.65, angle: -Math.PI / 2, sweepSpeed: 0.022, beamLength: 300, width: 0.18 }
    ];
  }

  setupInputs() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.isHovering = true;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isHovering = false;
    });

    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      this.resumeAudio();
      this.manualTarget(clickX, clickY);
    });

    // Weapon selector buttons
    const weaponButtons = document.querySelectorAll('[data-weapon]');
    weaponButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        weaponButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedWeapon = btn.dataset.weapon;
      });
    });

    // Audio toggle
    const audioBtn = document.getElementById('sim-audio-toggle');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        this.isMuted = !this.isMuted;
        audioBtn.classList.toggle('muted', this.isMuted);
        const textSpan = audioBtn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = this.isMuted ? '🔊 Звук: Вимкнено' : '🔊 Звук: Увімкнено';
        if (!this.isMuted) {
          this.resumeAudio();
          this.playTone(880, 'sine', 0.15, 0.1);
        }
      });
    }

    // Play/Pause button
    const playBtn = document.getElementById('sim-play-toggle');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.isRunning = !this.isRunning;
        playBtn.classList.toggle('active', this.isRunning);
        const textSpan = playBtn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = this.isRunning ? '⏸ Пауза' : '▶ Пуск симулятора';
      });
    }

    // Reset button
    const resetBtn = document.getElementById('sim-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.reset();
      });
    }
  }

  manualTarget(x, y) {
    let target = null;
    let minDist = 45;
    for (const t of this.threats) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < minDist) {
        minDist = d;
        target = t;
      }
    }

    let bestBattery = null;
    let bestDist = Infinity;
    for (const b of this.batteries) {
      if (b.type === this.selectedWeapon || this.selectedWeapon === 'all') {
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < b.range * 1.35 && d < bestDist) {
          bestDist = d;
          bestBattery = b;
        }
      }
    }

    if (!bestBattery) {
      for (const b of this.batteries) {
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < bestDist) {
          bestDist = d;
          bestBattery = b;
        }
      }
    }

    if (bestBattery) {
      this.fireBatteryAt(bestBattery, x, y, target);
    }
  }

  fireBatteryAt(battery, tx, ty, targetEntity = null) {
    const angle = Math.atan2(ty - battery.y, tx - battery.x);
    battery.angle = angle;

    if (battery.type === 'mvg') {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const spread = (Math.random() - 0.5) * 0.08;
          this.projectiles.push({
            x: battery.x,
            y: battery.y,
            vx: Math.cos(angle + spread) * 580,
            vy: Math.sin(angle + spread) * 580,
            life: 0.65,
            type: 'tracer',
            color: '#f59e0b',
            size: 2.8
          });
          this.playGunfire();
        }, i * 40);
      }
    } else if (battery.type === 'gepard') {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          this.projectiles.push({
            x: battery.x + (i % 2 === 0 ? -4 : 4) * Math.sin(angle),
            y: battery.y + (i % 2 === 0 ? 4 : -4) * Math.cos(angle),
            vx: Math.cos(angle) * 780,
            vy: Math.sin(angle) * 780,
            life: 0.55,
            type: 'flak',
            color: '#00f0ff',
            size: 3.2
          });
          this.playGunfire();
        }, i * 30);
      }
    } else if (battery.type === 'patriot') {
      this.projectiles.push({
        x: battery.x,
        y: battery.y,
        vx: Math.cos(angle) * 440,
        vy: Math.sin(angle) * 440,
        target: targetEntity || { x: tx, y: ty },
        life: 2.4,
        type: 'missile',
        color: '#38bdf8',
        size: 4.5
      });
      this.playLaunch();
    }
  }

  spawnThreat() {
    const w = this.width;
    const h = this.height;

    const sides = ['N', 'NE', 'E', 'SE'];
    const side = sides[Math.floor(Math.random() * sides.length)];

    let x, y;
    if (side === 'N') {
      x = w * (0.2 + Math.random() * 0.6);
      y = -15;
    } else if (side === 'NE') {
      x = w + 15;
      y = h * (0.05 + Math.random() * 0.35);
    } else if (side === 'E') {
      x = w + 15;
      y = h * (0.35 + Math.random() * 0.4);
    } else {
      x = w * (0.6 + Math.random() * 0.4);
      y = h + 15;
    }

    const aliveTargets = this.infrastructure.filter(inf => inf.hp > 0);
    const target = aliveTargets.length > 0
      ? aliveTargets[Math.floor(Math.random() * aliveTargets.length)]
      : { x: w * 0.5, y: h * 0.5 };

    const isCruiseMissile = Math.random() < 0.25;
    const isBallistic = !isCruiseMissile && Math.random() < 0.1;

    let type = 'shahed';
    let speed = 65 + Math.random() * 25;
    let hp = 1;
    let color = '#ef4444';
    let label = 'Shahed-136';

    if (isCruiseMissile) {
      type = 'kalibr';
      speed = 135 + Math.random() * 30;
      hp = 2;
      color = '#f59e0b';
      label = 'Крилата ракета';
    } else if (isBallistic) {
      type = 'ballistic';
      speed = 220;
      hp = 3;
      color = '#ec4899';
      label = 'Балістика (Іскандер)';
    }

    const angle = Math.atan2(target.y - y, target.x - x);

    this.threats.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      target,
      speed,
      hp,
      maxHp: hp,
      type,
      label,
      color,
      trail: []
    });

    this.playTone(520, 'triangle', 0.08, 0.04);
  }

  update(dt) {
    if (!this.isRunning) return;

    // 360° sweep line rotation
    this.radarAngle += dt * 1.4;
    if (this.radarAngle > Math.PI * 2) this.radarAngle -= Math.PI * 2;

    // Spawn waves
    this.spawnTimer += dt;
    const spawnInterval = Math.max(1.8, 4.5 - this.wave * 0.3);
    if (this.spawnTimer > spawnInterval) {
      this.spawnTimer = 0;
      this.spawnThreat();
      if (Math.random() < 0.4) this.spawnThreat();
    }

    // Auto-fire batteries
    for (const b of this.batteries) {
      b.lastFire += dt;
      let nearestThreat = null;
      let nearestDist = b.range;

      for (const t of this.threats) {
        const d = Math.hypot(t.x - b.x, t.y - b.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestThreat = t;
        }
      }

      if (nearestThreat && b.lastFire >= b.rate) {
        b.lastFire = 0;
        this.fireBatteryAt(b, nearestThreat.x, nearestThreat.y, nearestThreat);
      }
    }

    // Searchlights
    for (const s of this.searchlights) {
      s.angle += s.sweepSpeed;
      if (s.angle > -Math.PI * 0.18 || s.angle < -Math.PI * 0.82) {
        s.sweepSpeed = -s.sweepSpeed;
      }
    }

    // Threats
    for (let i = this.threats.length - 1; i >= 0; i--) {
      const t = this.threats[i];
      t.x += t.vx * dt;
      t.y += t.vy * dt;

      if (Math.random() < 0.6) {
        t.trail.push({ x: t.x, y: t.y, life: 0.5 });
      }
      for (let j = t.trail.length - 1; j >= 0; j--) {
        t.trail[j].life -= dt;
        if (t.trail[j].life <= 0) t.trail.splice(j, 1);
      }

      const distToTarget = Math.hypot(t.x - t.target.x, t.y - t.target.y);
      if (distToTarget < 24) {
        t.target.hp = Math.max(0, t.target.hp - 25);
        this.gridIntegrity = Math.max(0, this.gridIntegrity - 8);
        this.missedCount++;
        this.createShockwave(t.x, t.y, '#ef4444');
        this.createExplosion(t.x, t.y, 45, '#ef4444');
        this.playExplosion(true);
        this.threats.splice(i, 1);
        this.updateHUD();
        continue;
      }

      if (t.x < -50 || t.x > this.width + 50 || t.y < -50 || t.y > this.height + 50) {
        this.threats.splice(i, 1);
      }
    }

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;

      if (p.type === 'missile' && p.target) {
        const targetX = p.target.x;
        const targetY = p.target.y;
        const desiredAngle = Math.atan2(targetY - p.y, targetX - p.x);
        const currentAngle = Math.atan2(p.vy, p.vx);
        let diff = desiredAngle - currentAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const steerSpeed = 6.5;
        const newAngle = currentAngle + Math.sign(diff) * Math.min(Math.abs(diff), steerSpeed * dt);
        const speed = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(newAngle) * speed;
        p.vy = Math.sin(newAngle) * speed;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      let hit = false;
      for (let j = this.threats.length - 1; j >= 0; j--) {
        const t = this.threats[j];
        const hitRadius = p.type === 'missile' ? 26 : 15;
        const d = Math.hypot(p.x - t.x, p.y - t.y);

        if (d < hitRadius) {
          hit = true;
          t.hp -= (p.type === 'missile' ? 2 : 1);

          if (t.hp <= 0) {
            this.createShockwave(t.x, t.y, '#00f0ff');
            this.createExplosion(t.x, t.y, 32, '#fbbf24');
            this.threats.splice(j, 1);
            this.interceptedCount++;
            this.score += (t.type === 'ballistic' ? 500 : t.type === 'kalibr' ? 300 : 100);
            this.playExplosion(false);
            this.updateHUD();
          } else {
            this.createExplosion(p.x, p.y, 10, '#ffffff');
          }
          break;
        }
      }

      if (hit || p.life <= 0) {
        if (p.type === 'flak') {
          this.createExplosion(p.x, p.y, 12, '#00f0ff');
        }
        this.projectiles.splice(i, 1);
      }
    }

    // Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += dt * 140;
      sw.alpha -= dt * 1.5;
      if (sw.alpha <= 0) this.shockwaves.splice(i, 1);
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.life -= dt;
      if (part.life <= 0) this.particles.splice(i, 1);
    }
  }

  createShockwave(x, y, color = '#00f0ff') {
    this.shockwaves.push({ x, y, radius: 4, maxRadius: 50, alpha: 0.8, color });
  }

  createExplosion(x, y, count = 20, color = '#ffaa00') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 140 + 20;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Math.random() * 0.45 + 0.2,
        maxLife: 0.65,
        color,
        size: Math.random() * 3 + 1.5
      });
    }
  }

  updateHUD() {
    const scoreEl = document.getElementById('sim-score');
    if (scoreEl) scoreEl.textContent = this.score.toLocaleString();

    const interceptedEl = document.getElementById('sim-intercepted');
    if (interceptedEl) interceptedEl.textContent = this.interceptedCount;

    const missedEl = document.getElementById('sim-missed');
    if (missedEl) missedEl.textContent = this.missedCount;

    const gridEl = document.getElementById('sim-grid-bar');
    if (gridEl) {
      gridEl.style.width = `${this.gridIntegrity}%`;
      gridEl.style.background = this.gridIntegrity > 50
        ? 'linear-gradient(90deg, #00f0ff, #3b82f6)'
        : this.gridIntegrity > 25 ? '#f59e0b' : '#ef4444';
    }

    const gridText = document.getElementById('sim-grid-text');
    if (gridText) gridText.textContent = `${this.gridIntegrity}%`;
  }

  reset() {
    this.threats = [];
    this.projectiles = [];
    this.particles = [];
    this.shockwaves = [];
    this.score = 0;
    this.interceptedCount = 0;
    this.missedCount = 0;
    this.gridIntegrity = 100;
    this.initWorld();
    this.updateHUD();
  }

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Tactical Radar Background
    ctx.fillStyle = '#06090e';
    ctx.fillRect(0, 0, w, h);

    // Fine grid
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Concentric Range Rings centered on Kyiv center
    const centerX = w * 0.46;
    const centerY = h * 0.50;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
    for (let r = 80; r < Math.max(w, h); r += 80) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 360° Radar Sweep Line with gradient tail
    ctx.save();
    const sweepGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(w, h));
    sweepGrad.addColorStop(0, 'rgba(0, 240, 255, 0.2)');
    sweepGrad.addColorStop(1, 'rgba(0, 240, 255, 0.02)');

    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, Math.max(w, h), this.radarAngle - 0.4, this.radarAngle);
    ctx.closePath();
    ctx.fill();

    // Leading sweep line
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(this.radarAngle) * Math.max(w, h), centerY + Math.sin(this.radarAngle) * Math.max(w, h));
    ctx.stroke();
    ctx.restore();

    // Stylized Dnipro River
    ctx.fillStyle = 'rgba(12, 38, 70, 0.55)';
    ctx.beginPath();
    ctx.moveTo(w * 0.48, 0);
    ctx.bezierCurveTo(w * 0.49, h * 0.25, w * 0.53, h * 0.45, w * 0.54, h * 0.7);
    ctx.bezierCurveTo(w * 0.55, h * 0.85, w * 0.58, h * 0.95, w * 0.60, h);
    ctx.lineTo(w * 0.68, h);
    ctx.bezierCurveTo(w * 0.64, h * 0.9, w * 0.62, h * 0.75, w * 0.60, h * 0.6);
    ctx.bezierCurveTo(w * 0.59, h * 0.4, w * 0.56, h * 0.2, w * 0.54, 0);
    ctx.closePath();
    ctx.fill();

    // Kyiv Bridges
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.45, h * 0.20);
    ctx.lineTo(w * 0.57, h * 0.18);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w * 0.48, h * 0.51);
    ctx.lineTo(w * 0.60, h * 0.53);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w * 0.50, h * 0.69);
    ctx.lineTo(w * 0.62, h * 0.67);
    ctx.stroke();

    // Searchlights
    ctx.save();
    for (const s of this.searchlights) {
      const grad = ctx.createRadialGradient(s.x, s.y, 8, s.x + Math.cos(s.angle) * s.beamLength, s.y + Math.sin(s.angle) * s.beamLength, s.beamLength);
      grad.addColorStop(0, 'rgba(255, 255, 220, 0.5)');
      grad.addColorStop(0.3, 'rgba(255, 255, 200, 0.22)');
      grad.addColorStop(1, 'rgba(255, 255, 200, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.arc(s.x, s.y, s.beamLength, s.angle - s.width, s.angle + s.width);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Infrastructure
    for (const inf of this.infrastructure) {
      ctx.save();
      const isDead = inf.hp <= 0;

      ctx.fillStyle = isDead ? '#475569' : inf.hp < 100 ? '#f59e0b' : '#00f0ff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.arc(inf.x, inf.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // HP bar
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(inf.x - 22, inf.y - 18, 44, 4);
      ctx.fillStyle = inf.hp > 50 ? '#10b981' : inf.hp > 25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(inf.x - 22, inf.y - 18, (inf.hp / inf.maxHp) * 44, 4);

      ctx.font = '10px "Inter", sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'center';
      ctx.fillText(inf.name, inf.x, inf.y + 18);
      ctx.restore();
    }

    // Batteries
    for (const b of this.batteries) {
      ctx.save();
      ctx.strokeStyle = b.type === 'patriot' ? 'rgba(0, 240, 255, 0.25)' : 'rgba(245, 158, 11, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = b.type === 'patriot' ? '#00f0ff' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + Math.cos(b.angle) * 14, b.y + Math.sin(b.angle) * 14);
      ctx.stroke();

      ctx.font = '10px "Inter", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x, b.y - 10);
      ctx.restore();
    }

    // Threats
    for (const t of this.threats) {
      ctx.save();
      for (const p of t.trail) {
        ctx.fillStyle = `rgba(239, 68, 68, ${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = t.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;

      const angle = Math.atan2(t.vy, t.vx);
      ctx.translate(t.x, t.y);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-7, -5);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-angle);
      ctx.font = '10px "Inter", sans-serif';
      ctx.fillStyle = t.color;
      ctx.fillText(t.label, 12, 4);
      ctx.restore();
    }

    // Projectiles
    for (const p of this.projectiles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size || 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Shockwaves
    for (const sw of this.shockwaves) {
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = sw.alpha;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Particles
    for (const part of this.particles) {
      ctx.save();
      const alpha = part.life / part.maxLife;
      ctx.fillStyle = part.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Reticle on mouse hover
    if (this.isHovering && this.isRunning) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.lineWidth = 1;
      const size = 16;
      ctx.strokeRect(this.mouseX - size / 2, this.mouseY - size / 2, size, size);
      ctx.beginPath();
      ctx.moveTo(this.mouseX - size, this.mouseY);
      ctx.lineTo(this.mouseX + size, this.mouseY);
      ctx.moveTo(this.mouseX, this.mouseY - size);
      ctx.lineTo(this.mouseX, this.mouseY + size);
      ctx.stroke();
      ctx.restore();
    }

    // Pause overlay
    if (!this.isRunning) {
      ctx.save();
      ctx.fillStyle = 'rgba(6, 9, 14, 0.75)';
      ctx.fillRect(0, 0, w, h);

      ctx.font = '700 22px "Unbounded", sans-serif';
      ctx.fillStyle = '#00f0ff';
      ctx.textAlign = 'center';
      ctx.fillText('ТАКТИЧНИЙ СИМУЛЯТОР ППО // РЕЖИМ ЧЕРГУВАННЯ', w / 2, h / 2 - 16);

      ctx.font = '14px "Inter", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Натисніть «Пуск симулятора» або клікніть по карті для оборони столиці', w / 2, h / 2 + 16);
      ctx.restore();
    }
  }

  animate(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.update(dt * this.speedMultiplier);
    this.render();

    requestAnimationFrame(this.animate);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.kyivSim = new KyivDefenseSimulator('defense-radar-canvas');
});
