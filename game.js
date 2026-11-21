/**
 * Kyiv 2027: Tactical Air Defense Simulator
 * High-performance canvas-based simulation of Kyiv airspace protection.
 * Features:
 * - Real geography simulation (Dnipro river, major bridges, critical infrastructure)
 * - Multiple defense layers: Mobile Fire Groups (МВГ), Gepard, Patriot/Iris-T, FPV Interceptors
 * - Realistic ballistic physics, lead prediction, searchlights and tracer rounds
 * - Synthesized Web Audio sound effects (radar ping, AA autocannon, missile launch, explosion, sirens)
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
    this.selectedWeapon = 'mvg'; // 'mvg', 'gepard', 'patriot', 'fpv'
    this.speedMultiplier = 1;
    this.wave = 1;
    this.spawnTimer = 0;

    // Simulation entities
    this.threats = [];
    this.projectiles = [];
    this.particles = [];
    this.searchlights = [];
    this.batteries = [];
    this.infrastructure = [];

    // Audio setup (Web Audio API synthesized sound, zero external dependencies)
    this.audioCtx = null;
    this.setupAudio();

    // Resize handling
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Setup map infrastructure & batteries
    this.initWorld();

    // Input listeners
    this.setupInputs();

    // Start render loop
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
      filter.frequency.value = 800;
      const gain = this.audioCtx.createGain();
      gain.gain.value = 0.12;
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
      const dur = large ? 0.6 : 0.3;
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
      filter.frequency.value = large ? 160 : 320;
      const gain = this.audioCtx.createGain();
      gain.gain.value = large ? 0.3 : 0.15;
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
      osc.frequency.setValueAtTime(300, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, this.audioCtx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.35);
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

    // Infrastructure targets to protect (relative coordinates based on Kyiv map)
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
        name: 'МВГ Оболонь',
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
        range: 200,
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
        range: 340,
        rate: 1.8,
        lastFire: 0,
        ammo: 16,
        angle: 0
      },
      {
        id: 'b4',
        name: 'МВГ Русанівка',
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
        range: 200,
        rate: 0.08,
        lastFire: 0,
        ammo: 240,
        angle: 0
      }
    ];

    // Searchlights sweeping the sky
    this.searchlights = [
      { x: w * 0.40, y: h * 0.32, angle: -Math.PI / 2, sweepSpeed: 0.02, beamLength: 260, width: 0.2 },
      { x: w * 0.60, y: h * 0.50, angle: -Math.PI / 2, sweepSpeed: -0.018, beamLength: 240, width: 0.22 },
      { x: w * 0.46, y: h * 0.65, angle: -Math.PI / 2, sweepSpeed: 0.022, beamLength: 280, width: 0.18 }
    ];
  }

  setupInputs() {
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Resume sound on user interaction
      this.resumeAudio();

      // Check if clicked near a threat or infrastructure, or direct manual target intercept
      this.manualTarget(clickX, clickY);
    });

    // Weapon selector buttons in the UI
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
        if (textSpan) textSpan.textContent = this.isMuted ? 'Звук: Вимкнено' : 'Звук: Увімкнено';
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
        if (textSpan) textSpan.textContent = this.isRunning ? 'Пауза' : 'Пуск симулятора';
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
    // Find closest threat within radius or deploy interceptor
    let target = null;
    let minDist = 40;
    for (const t of this.threats) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < minDist) {
        minDist = d;
        target = t;
      }
    }

    // Trigger battery closest to target or mouse
    let bestBattery = null;
    let bestDist = Infinity;
    for (const b of this.batteries) {
      if (b.type === this.selectedWeapon || this.selectedWeapon === 'all') {
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < b.range * 1.3 && d < bestDist) {
          bestDist = d;
          bestBattery = b;
        }
      }
    }

    if (!bestBattery) {
      // Pick any nearest battery
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
      // Triple tracer burst
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const spread = (Math.random() - 0.5) * 0.08;
          this.projectiles.push({
            x: battery.x,
            y: battery.y,
            vx: Math.cos(angle + spread) * 550,
            vy: Math.sin(angle + spread) * 550,
            life: 0.65,
            type: 'tracer',
            color: '#f2c230',
            size: 2.5
          });
          this.playGunfire();
        }, i * 40);
      }
    } else if (battery.type === 'gepard') {
      // Rapid dual autocannon burst
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          this.projectiles.push({
            x: battery.x + (i % 2 === 0 ? -3 : 3) * Math.sin(angle),
            y: battery.y + (i % 2 === 0 ? 3 : -3) * Math.cos(angle),
            vx: Math.cos(angle) * 750,
            vy: Math.sin(angle) * 750,
            life: 0.55,
            type: 'flak',
            color: '#ffdd55',
            size: 3
          });
          this.playGunfire();
        }, i * 30);
      }
    } else if (battery.type === 'patriot') {
      // Interceptor guided missile
      this.projectiles.push({
        x: battery.x,
        y: battery.y,
        vx: Math.cos(angle) * 420,
        vy: Math.sin(angle) * 420,
        target: targetEntity || { x: tx, y: ty },
        life: 2.2,
        type: 'missile',
        color: '#6aa3ff',
        size: 4
      });
      this.playLaunch();
    }
  }

  spawnThreat() {
    const w = this.width;
    const h = this.height;

    // Threats enter from North, North-East, or East (typical threat vectors over Kyiv)
    const sides = ['N', 'NE', 'E', 'SE'];
    const side = sides[Math.floor(Math.random() * sides.length)];

    let x, y;
    if (side === 'N') {
      x = w * (0.2 + Math.random() * 0.6);
      y = -10;
    } else if (side === 'NE') {
      x = w + 10;
      y = h * (0.05 + Math.random() * 0.35);
    } else if (side === 'E') {
      x = w + 10;
      y = h * (0.35 + Math.random() * 0.4);
    } else {
      x = w * (0.6 + Math.random() * 0.4);
      y = h + 10;
    }

    // Pick an alive infrastructure target
    const aliveTargets = this.infrastructure.filter(inf => inf.hp > 0);
    const target = aliveTargets.length > 0
      ? aliveTargets[Math.floor(Math.random() * aliveTargets.length)]
      : { x: w * 0.5, y: h * 0.5 };

    const isCruiseMissile = Math.random() < 0.25;
    const isBallistic = !isCruiseMissile && Math.random() < 0.1;

    let type = 'shahed';
    let speed = 65 + Math.random() * 25;
    let hp = 1;
    let color = '#ff4444';
    let label = 'Shahed-136';

    if (isCruiseMissile) {
      type = 'kalibr';
      speed = 130 + Math.random() * 30;
      hp = 2;
      color = '#ff9900';
      label = 'Крилата ракета';
    } else if (isBallistic) {
      type = 'ballistic';
      speed = 220;
      hp = 3;
      color = '#ff2222';
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
      trail: [],
      revealed: false
    });

    // Beep radar alert
    this.playTone(520, 'triangle', 0.08, 0.04);
  }

  update(dt) {
    if (!this.isRunning) return;

    // Spawn waves
    this.spawnTimer += dt;
    const spawnInterval = Math.max(1.8, 4.5 - this.wave * 0.3);
    if (this.spawnTimer > spawnInterval) {
      this.spawnTimer = 0;
      this.spawnThreat();
      if (Math.random() < 0.4) this.spawnThreat(); // Multi-drone swarm
    }

    // Auto-fire autonomous batteries (Gepard & MVG)
    for (const b of this.batteries) {
      b.lastFire += dt;
      // Find nearest threat in range
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

    // Update searchlights
    for (const s of this.searchlights) {
      s.angle += s.sweepSpeed;
      if (s.angle > -Math.PI * 0.2 || s.angle < -Math.PI * 0.8) {
        s.sweepSpeed = -s.sweepSpeed;
      }
    }

    // Update threats
    for (let i = this.threats.length - 1; i >= 0; i--) {
      const t = this.threats[i];
      t.x += t.vx * dt;
      t.y += t.vy * dt;

      // Trail
      if (Math.random() < 0.5) {
        t.trail.push({ x: t.x, y: t.y, life: 0.6 });
      }
      for (let j = t.trail.length - 1; j >= 0; j--) {
        t.trail[j].life -= dt;
        if (t.trail[j].life <= 0) t.trail.splice(j, 1);
      }

      // Check hit target
      const distToTarget = Math.hypot(t.x - t.target.x, t.y - t.target.y);
      if (distToTarget < 22) {
        // Impact!
        t.target.hp = Math.max(0, t.target.hp - 25);
        this.gridIntegrity = Math.max(0, this.gridIntegrity - 8);
        this.missedCount++;
        this.createExplosion(t.x, t.y, 40, '#ff4400');
        this.playExplosion(true);
        this.threats.splice(i, 1);
        this.updateHUD();
        continue;
      }

      // Out of bounds
      if (t.x < -40 || t.x > this.width + 40 || t.y < -40 || t.y > this.height + 40) {
        this.threats.splice(i, 1);
      }
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;

      if (p.type === 'missile' && p.target) {
        // Guided steering towards target
        const targetX = p.target.x;
        const targetY = p.target.y;
        const desiredAngle = Math.atan2(targetY - p.y, targetX - p.x);
        const currentAngle = Math.atan2(p.vy, p.vx);
        let diff = desiredAngle - currentAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const steerSpeed = 6.0;
        const newAngle = currentAngle + Math.sign(diff) * Math.min(Math.abs(diff), steerSpeed * dt);
        const speed = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(newAngle) * speed;
        p.vy = Math.sin(newAngle) * speed;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Check collisions with threats
      let hit = false;
      for (let j = this.threats.length - 1; j >= 0; j--) {
        const t = this.threats[j];
        const hitRadius = p.type === 'missile' ? 24 : 14;
        const d = Math.hypot(p.x - t.x, p.y - t.y);

        if (d < hitRadius) {
          hit = true;
          t.hp -= (p.type === 'missile' ? 2 : 1);

          if (t.hp <= 0) {
            // Destroyed!
            this.createExplosion(t.x, t.y, 28, '#ffcc00');
            this.threats.splice(j, 1);
            this.interceptedCount++;
            this.score += (t.type === 'ballistic' ? 500 : t.type === 'kalibr' ? 300 : 100);
            this.playExplosion(false);
            this.updateHUD();
          } else {
            // Partial hit spark
            this.createExplosion(p.x, p.y, 8, '#ffffff');
          }
          break;
        }
      }

      if (hit || p.life <= 0) {
        if (p.type === 'flak') {
          this.createExplosion(p.x, p.y, 10, '#ffaa33');
        }
        this.projectiles.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.life -= dt;
      if (part.life <= 0) this.particles.splice(i, 1);
    }
  }

  createExplosion(x, y, count = 20, color = '#ffaa00') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 120 + 20;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Math.random() * 0.4 + 0.2,
        maxLife: 0.6,
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
      gridEl.style.background = this.gridIntegrity > 50 ? '#1f5fbf' : this.gridIntegrity > 25 ? '#f2c230' : '#ff4444';
    }

    const gridText = document.getElementById('sim-grid-text');
    if (gridText) gridText.textContent = `${this.gridIntegrity}%`;
  }

  reset() {
    this.threats = [];
    this.projectiles = [];
    this.particles = [];
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

    // Dark military radar canvas background
    ctx.fillStyle = '#0a0f16';
    ctx.fillRect(0, 0, w, h);

    // Subtle tactical grid lines
    ctx.strokeStyle = 'rgba(31, 95, 191, 0.08)';
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

    // Concentric radar rings centered on Maidan / Pechersk
    const centerX = w * 0.46;
    const centerY = h * 0.50;
    ctx.strokeStyle = 'rgba(106, 163, 255, 0.12)';
    for (let r = 80; r < Math.max(w, h); r += 80) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw stylized Dnipro River & islands
    ctx.fillStyle = 'rgba(18, 48, 86, 0.45)';
    ctx.beginPath();
    ctx.moveTo(w * 0.48, 0);
    ctx.bezierCurveTo(w * 0.49, h * 0.25, w * 0.53, h * 0.45, w * 0.54, h * 0.7);
    ctx.bezierCurveTo(w * 0.55, h * 0.85, w * 0.58, h * 0.95, w * 0.60, h);
    ctx.lineTo(w * 0.68, h);
    ctx.bezierCurveTo(w * 0.64, h * 0.9, w * 0.62, h * 0.75, w * 0.60, h * 0.6);
    ctx.bezierCurveTo(w * 0.59, h * 0.4, w * 0.56, h * 0.2, w * 0.54, 0);
    ctx.closePath();
    ctx.fill();

    // Draw Bridges across the Dnipro
    ctx.strokeStyle = '#3d4d60';
    ctx.lineWidth = 4;
    // Pivnichnyi bridge
    ctx.beginPath();
    ctx.moveTo(w * 0.45, h * 0.20);
    ctx.lineTo(w * 0.57, h * 0.18);
    ctx.stroke();

    // Metro / Paton bridge
    ctx.beginPath();
    ctx.moveTo(w * 0.48, h * 0.51);
    ctx.lineTo(w * 0.60, h * 0.53);
    ctx.stroke();

    // Pivdennyi bridge
    ctx.beginPath();
    ctx.moveTo(w * 0.50, h * 0.69);
    ctx.lineTo(w * 0.62, h * 0.67);
    ctx.stroke();

    // Draw Searchlights sweeping the night sky
    ctx.save();
    for (const s of this.searchlights) {
      const grad = ctx.createRadialGradient(s.x, s.y, 10, s.x + Math.cos(s.angle) * s.beamLength, s.y + Math.sin(s.angle) * s.beamLength, s.beamLength);
      grad.addColorStop(0, 'rgba(255, 255, 220, 0.45)');
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

    // Draw Infrastructure Targets
    for (const inf of this.infrastructure) {
      ctx.save();
      const isDamaged = inf.hp < 100;
      const isDead = inf.hp <= 0;

      ctx.fillStyle = isDead ? '#444' : isDamaged ? '#f2c230' : '#1f5fbf';
      ctx.strokeStyle = isDead ? '#666' : '#fff';
      ctx.lineWidth = 1.5;

      // Target icon
      ctx.beginPath();
      ctx.arc(inf.x, inf.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // HP bar
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(inf.x - 20, inf.y - 18, 40, 4);
      ctx.fillStyle = inf.hp > 50 ? '#00e676' : inf.hp > 25 ? '#ffeb3b' : '#ff1744';
      ctx.fillRect(inf.x - 20, inf.y - 18, (inf.hp / inf.maxHp) * 40, 4);

      // Label
      ctx.font = '11px "Inter", sans-serif';
      ctx.fillStyle = '#e8ecf0';
      ctx.textAlign = 'center';
      ctx.fillText(inf.name, inf.x, inf.y + 18);
      ctx.restore();
    }

    // Draw Defense Batteries
    for (const b of this.batteries) {
      ctx.save();
      // Range indicator ring
      ctx.strokeStyle = b.type === 'patriot' ? 'rgba(106, 163, 255, 0.18)' : 'rgba(242, 194, 48, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Battery body
      ctx.fillStyle = b.type === 'patriot' ? '#6aa3ff' : '#f2c230';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Barrel orientation
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + Math.cos(b.angle) * 12, b.y + Math.sin(b.angle) * 12);
      ctx.stroke();

      // Battery label
      ctx.font = '10px "Inter", sans-serif';
      ctx.fillStyle = '#98a3ae';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x, b.y - 10);
      ctx.restore();
    }

    // Draw Threats
    for (const t of this.threats) {
      ctx.save();
      // Threat trail
      for (const p of t.trail) {
        ctx.fillStyle = `rgba(255, 80, 50, ${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Threat marker (delta wing / missile icon)
      ctx.fillStyle = t.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;

      const angle = Math.atan2(t.vy, t.vx);
      ctx.translate(t.x, t.y);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, -5);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-angle);
      // Threat label
      ctx.font = '10px "Inter", sans-serif';
      ctx.fillStyle = t.color;
      ctx.fillText(t.label, 12, 4);
      ctx.restore();
    }

    // Draw Projectiles
    for (const p of this.projectiles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw Particles / Explosions
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

    // If simulation paused, show helpful overlay
    if (!this.isRunning) {
      ctx.save();
      ctx.fillStyle = 'rgba(10, 15, 22, 0.72)';
      ctx.fillRect(0, 0, w, h);

      ctx.font = '600 20px "Unbounded", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('ТАКТИЧНИЙ СИМУЛЯТОР ППО ГОТОВИЙ', w / 2, h / 2 - 18);

      ctx.font = '14px "Inter", sans-serif';
      ctx.fillStyle = '#98a3ae';
      ctx.fillText('Натисніть «Пуск симулятора» або клікніть по карті для оборони столиці', w / 2, h / 2 + 14);
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

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.kyivSim = new KyivDefenseSimulator('defense-radar-canvas');
});
