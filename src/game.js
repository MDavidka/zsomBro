import { sound } from './audio.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state & virtual resolution
const VIRTUAL_HEIGHT = 512;
let VIRTUAL_WIDTH = 1024;
let scale = 1;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  canvas.width = screenWidth * dpr;
  canvas.height = screenHeight * dpr;

  // Scale virtual coordinates to fit screen height
  scale = (screenHeight * dpr) / VIRTUAL_HEIGHT;
  VIRTUAL_WIDTH = (screenWidth * dpr) / scale;

  ctx.imageSmoothingEnabled = false;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const GROUND_Y = 380; // Ground platform height in virtual units

// Assets manager
const assets = {
  background: new Image(),
  idle: new Image(),
  walk1: new Image(),
  walk2: new Image(),
  run1: new Image(),
  loaded: false
};

let loadedCount = 0;
const totalAssets = 5;

function checkAssetLoaded() {
  loadedCount++;
  if (loadedCount === totalAssets) {
    assets.loaded = true;
  }
}

assets.background.onload = checkAssetLoaded;
assets.idle.onload = checkAssetLoaded;
assets.walk1.onload = checkAssetLoaded;
assets.walk2.onload = checkAssetLoaded;
assets.run1.onload = checkAssetLoaded;

assets.background.src = 'assets/background.png';
assets.idle.src = 'assets/zsomborr.png';
assets.walk1.src = 'assets/walk1.png';
assets.walk2.src = 'assets/walk2.png';
assets.run1.src = 'assets/run1.png';

// Particle system
const particles = [];
function createDust(x, y, count = 3, color = 'rgba(240, 245, 240, 0.7)') {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x + (Math.random() * 16 - 8),
      y: y + (Math.random() * 4 - 2),
      vx: (Math.random() - 0.5) * 2,
      vy: -Math.random() * 1.5 - 0.5,
      size: Math.random() * 3 + 2,
      life: 1.0,
      decay: Math.random() * 0.04 + 0.03,
      color: color
    });
  }
}

// Input state
const keys = {
  left: false,
  right: false,
  jump: false,
  run: false
};

// Keyboard inputs
window.addEventListener('keydown', (e) => {
  sound.init();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
    if (!keys.jump) {
      player.tryJump();
    }
    keys.jump = true;
    e.preventDefault();
  }
  if (e.shiftKey || e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.run = true;
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') keys.jump = false;
  if (!e.shiftKey && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) keys.run = false;
});

// Mobile touch bindings
const bindTouch = (btnId, keyName) => {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const start = (e) => {
    e.preventDefault();
    sound.init();
    btn.classList.add('active');
    if (keyName === 'jump') {
      player.tryJump();
      keys.jump = true;
    } else {
      keys[keyName] = true;
    }
  };
  const end = (e) => {
    e.preventDefault();
    btn.classList.remove('active');
    keys[keyName] = false;
  };
  btn.addEventListener('touchstart', start, { passive: false });
  btn.addEventListener('touchend', end, { passive: false });
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', end);
  btn.addEventListener('mouseleave', end);
};

bindTouch('btn-left', 'left');
bindTouch('btn-right', 'right');
bindTouch('btn-jump', 'jump');
bindTouch('btn-run', 'run');

// Enable sound on first interaction anywhere
window.addEventListener('pointerdown', () => sound.init(), { once: true });

// Camera
const camera = {
  x: 0
};

// Player: Zsomborr
const player = {
  name: 'Zsomborr',
  x: 512,
  y: GROUND_Y,
  height: 130, // rendered height
  vx: 0,
  vy: 0,
  speed: 4.2,
  runSpeed: 7.2,
  gravity: 0.58,
  jumpStrength: -13.2,
  isGrounded: true,
  facingRight: true,
  animTimer: 0,
  idleTimer: 0,
  state: 'idle',

  tryJump() {
    if (this.isGrounded) {
      this.vy = this.jumpStrength;
      this.isGrounded = false;
      sound.playShoot();
      createDust(this.x, this.y, 7);
    }
  },

  update(dt) {
    let moveDir = 0;
    if (keys.left) moveDir -= 1;
    if (keys.right) moveDir += 1;

    const currentSpeed = keys.run ? this.runSpeed : this.speed;

    if (moveDir !== 0) {
      this.vx = moveDir * currentSpeed;
      this.facingRight = moveDir > 0;
      this.animTimer += dt * (keys.run ? 14 : 9);

      if (this.isGrounded) {
        this.state = keys.run ? 'running' : 'walking';
        if (Math.sin(this.animTimer) < -0.8) {
          createDust(this.x, this.y, keys.run ? 2 : 1);
        }
      }
    } else {
      this.vx = 0;
      this.animTimer = 0;
      if (this.isGrounded) {
        this.state = 'idle';
      }
    }

    // Apply gravity
    this.vy += this.gravity;
    this.y += this.vy;

    // Ground collision
    if (this.y >= GROUND_Y) {
      if (!this.isGrounded && this.vy > 2) {
        createDust(this.x, GROUND_Y, 8);
        sound.playHit();
      }
      this.y = GROUND_Y;
      this.vy = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
      this.state = 'jumping';
    }

    // Move player & scroll camera smoothly
    this.x += this.vx;
    camera.x = this.x - VIRTUAL_WIDTH / 2;

    this.idleTimer += dt * 3;
  },

  draw(ctx) {
    if (!assets.loaded) return;

    // Select active sprite frame
    let currentSprite = assets.idle;
    let bounceY = 0;
    let tiltAngle = 0;

    if (this.state === 'running') {
      currentSprite = assets.run1;
      bounceY = Math.abs(Math.sin(this.animTimer * 1.3)) * 6;
      tiltAngle = (this.facingRight ? 0.12 : -0.12);
    } else if (this.state === 'walking') {
      // Alternate between walk1 and walk2
      const step = Math.floor(this.animTimer) % 2;
      currentSprite = step === 0 ? assets.walk1 : assets.walk2;
      bounceY = Math.abs(Math.sin(this.animTimer)) * 4;
      tiltAngle = Math.sin(this.animTimer) * (this.facingRight ? 0.04 : -0.04);
    } else if (this.state === 'idle') {
      currentSprite = assets.idle;
      bounceY = Math.sin(this.idleTimer) * 1.5;
    } else if (this.state === 'jumping') {
      currentSprite = keys.run ? assets.run1 : assets.walk1;
      tiltAngle = this.vy * 0.015 * (this.facingRight ? 1 : -1);
    }

    // Calculate aspect ratio width
    const spriteAspect = (currentSprite.width || 100) / (currentSprite.height || 188);
    const renderWidth = this.height * spriteAspect;

    const screenX = this.x - camera.x;
    const screenY = this.y;

    ctx.save();

    // Shadow under feet
    ctx.fillStyle = 'rgba(15, 25, 10, 0.45)';
    ctx.beginPath();
    const shadowScale = Math.max(0.35, 1 - (GROUND_Y - this.y) / 200);
    ctx.ellipse(
      screenX,
      GROUND_Y - 2,
      (renderWidth / 2.2) * shadowScale,
      6 * shadowScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Position origin at feet base
    ctx.translate(screenX, screenY - bounceY);
    ctx.rotate(tiltAngle);

    if (!this.facingRight) {
      ctx.scale(-1, 1);
    }

    // Draw sprite
    ctx.drawImage(
      currentSprite,
      -renderWidth / 2,
      -this.height,
      renderWidth,
      this.height
    );

    ctx.restore();
  }
};

// Draw seamless repeating background
function drawBackground(ctx) {
  if (!assets.loaded) return;

  const bgWidth = assets.background.width || 1024;
  const bgHeight = VIRTUAL_HEIGHT;

  // Calculate parallax offset
  const offsetX = -(camera.x % bgWidth);
  const startTile = Math.floor(-offsetX / bgWidth) - 1;
  const endTile = Math.ceil((VIRTUAL_WIDTH - offsetX) / bgWidth) + 1;

  for (let i = startTile; i <= endTile; i++) {
    ctx.drawImage(
      assets.background,
      offsetX + i * bgWidth,
      0,
      bgWidth,
      bgHeight
    );
  }
}

// Particle update & draw
function updateAndDrawParticles(ctx, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    const screenX = p.x - camera.x;
    const screenY = p.y;

    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.fillRect(Math.round(screenX), Math.round(screenY), p.size, p.size);
  }
  ctx.globalAlpha = 1.0;
}

// Main game loop
let lastTime = performance.now();

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  ctx.save();
  ctx.scale(scale, scale);

  // Clear canvas
  ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

  if (!assets.loaded) {
    ctx.fillStyle = '#0f111a';
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    ctx.fillStyle = '#58a6ff';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOADING ZSOMBRO...', VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2);
    ctx.restore();
    requestAnimationFrame(gameLoop);
    return;
  }

  // Update logic
  player.update(dt);

  // Render Scene
  drawBackground(ctx);
  updateAndDrawParticles(ctx, dt);
  player.draw(ctx);

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
