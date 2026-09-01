import { sound } from './audio.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Virtual coordinate system (Height fixed to background height 512)
const VIRTUAL_HEIGHT = 512;
let virtualWidth = 1024;
let scale = 1;

function resize() {
  const w = window.innerWidth || document.documentElement.clientWidth || 1024;
  const h = window.innerHeight || document.documentElement.clientHeight || 512;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  scale = canvas.height / VIRTUAL_HEIGHT;
  virtualWidth = canvas.width / scale;

  ctx.imageSmoothingEnabled = false;
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
resize();

const GROUND_Y = 380; // Ground platform level

// Sprite Assets
function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const assets = {
  background: loadImage('assets/background.png'),
  idle: loadImage('assets/zsomborr.png'),
  walk1: loadImage('assets/walk1.png'),
  walk2: loadImage('assets/walk2.png'),
  run1: loadImage('assets/run1.png')
};

// Particles for dust effects
const particles = [];
function createDust(x, y, count = 3, color = 'rgba(230, 245, 230, 0.75)') {
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

// Keyboard events
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

// Mobile touch button helper
function bindTouch(btnId, keyName) {
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
}

bindTouch('btn-left', 'left');
bindTouch('btn-right', 'right');
bindTouch('btn-jump', 'jump');
bindTouch('btn-run', 'run');

// Enable audio context on first screen touch/click
window.addEventListener('pointerdown', () => sound.init(), { once: true });

// Camera
const camera = {
  x: 0
};

// Player (Zsomborr)
const player = {
  name: 'Zsomborr',
  x: 512,
  y: GROUND_Y,
  height: 125,
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

    // Gravity
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

    // Horizontal movement & camera tracking
    this.x += this.vx;
    camera.x = this.x - virtualWidth / 2;

    this.idleTimer += dt * 3;
  },

  draw(ctx) {
    let currentSprite = assets.idle;
    let bounceY = 0;
    let tiltAngle = 0;

    if (this.state === 'running') {
      currentSprite = (assets.run1.complete && assets.run1.naturalWidth > 0) ? assets.run1 : assets.idle;
      bounceY = Math.abs(Math.sin(this.animTimer * 1.3)) * 6;
      tiltAngle = (this.facingRight ? 0.12 : -0.12);
    } else if (this.state === 'walking') {
      const step = Math.floor(this.animTimer) % 2;
      const walkImg = step === 0 ? assets.walk1 : assets.walk2;
      currentSprite = (walkImg.complete && walkImg.naturalWidth > 0) ? walkImg : assets.idle;
      bounceY = Math.abs(Math.sin(this.animTimer)) * 4;
      tiltAngle = Math.sin(this.animTimer) * (this.facingRight ? 0.04 : -0.04);
    } else if (this.state === 'idle') {
      currentSprite = assets.idle;
      bounceY = Math.sin(this.idleTimer) * 1.5;
    } else if (this.state === 'jumping') {
      currentSprite = keys.run && assets.run1.complete ? assets.run1 : (assets.walk1.complete ? assets.walk1 : assets.idle);
      tiltAngle = this.vy * 0.015 * (this.facingRight ? 1 : -1);
    }

    const screenX = this.x - camera.x;
    const screenY = this.y;

    const imgWidth = currentSprite.naturalWidth || currentSprite.width || 100;
    const imgHeight = currentSprite.naturalHeight || currentSprite.height || 188;
    const spriteAspect = imgWidth / imgHeight;
    const renderWidth = this.height * spriteAspect;

    ctx.save();

    // Ground Shadow
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

    // Character position & flip
    ctx.translate(screenX, screenY - bounceY);
    ctx.rotate(tiltAngle);

    if (!this.facingRight) {
      ctx.scale(-1, 1);
    }

    if (currentSprite.complete && currentSprite.naturalWidth > 0) {
      ctx.drawImage(
        currentSprite,
        -renderWidth / 2,
        -this.height,
        renderWidth,
        this.height
      );
    } else {
      // Fallback silhouette if image is still loading
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(-renderWidth / 2, -this.height, renderWidth, this.height);
    }

    ctx.restore();
  }
};

// Background rendering
function drawBackground(ctx) {
  const bgImg = assets.background;
  if (!bgImg.complete || bgImg.naturalWidth === 0) {
    // Sky fallback
    ctx.fillStyle = '#659ad2';
    ctx.fillRect(0, 0, virtualWidth, VIRTUAL_HEIGHT);
    // Ground fallback
    ctx.fillStyle = '#4f7d3c';
    ctx.fillRect(0, GROUND_Y, virtualWidth, VIRTUAL_HEIGHT - GROUND_Y);
    return;
  }

  const bgWidth = 1024;
  const bgHeight = 512;
  const modX = ((camera.x % bgWidth) + bgWidth) % bgWidth;
  let drawX = -modX;

  while (drawX < virtualWidth) {
    ctx.drawImage(bgImg, drawX, 0, bgWidth, bgHeight);
    drawX += bgWidth;
  }
}

// Particle rendering
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

// Game loop
let lastTime = performance.now();

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  // Clear full canvas buffer
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply virtual scale
  ctx.scale(scale, scale);

  // Update
  player.update(dt);

  // Render
  drawBackground(ctx);
  updateAndDrawParticles(ctx, dt);
  player.draw(ctx);

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
