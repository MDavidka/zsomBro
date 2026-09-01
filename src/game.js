import { sound } from './audio.js';
import { audioMaster } from './audioMaster.js';
import { dialogue, initAdmin } from './dialogue.js';
import { BitManager } from './bits.js';
import { StoryMaster } from './storyMaster.js';

// Canvas Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Virtual coordinate system (Height fixed to 512)
const VIRTUAL_HEIGHT = 512;
let virtualWidth = 1024;
let scale = 1;
const GROUND_Y = 388;

// Input state
const keys = {
  left: false,
  right: false,
  jump: false,
  run: false
};

// Systems
const bitManager = new BitManager(sound);
bitManager.initDefaultBits();

const storyMaster = new StoryMaster(dialogue, audioMaster);
storyMaster.setBitManager(bitManager);

// Particles for dust & sparkles
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

// Camera
const camera = {
  x: 0
};

// Cinematic Letterbox System
const cinematic = {
  active: true,
  progress: 1.0,
  target: 1.0,
  barHeight: 80,

  update(dt) {
    if (this.progress !== this.target) {
      const speed = 2.4;
      if (this.progress < this.target) {
        this.progress = Math.min(this.target, this.progress + dt * speed);
      } else {
        this.progress = Math.max(this.target, this.progress - dt * speed);
      }
    }
  },

  draw(ctx) {
    if (this.progress <= 0.001) return;
    const currentH = this.barHeight * this.progress;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, virtualWidth, currentH);
    ctx.fillRect(0, VIRTUAL_HEIGHT - currentH, virtualWidth, currentH);
  },

  dismiss() {
    this.target = 0.0;
    this.active = false;
  },

  show() {
    this.target = 1.0;
    this.active = true;
  }
};

dialogue.setOnDismiss(() => {
  cinematic.dismiss();
});

// Player Object (Zsomborr)
const player = {
  name: 'Zsomborr',
  x: 400,
  y: GROUND_Y,
  height: 125,
  vx: 0,
  vy: 0,
  speed: 4.4,
  runSpeed: 7.6,
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
      }
      this.y = GROUND_Y;
      this.vy = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
      this.state = 'jumping';
    }

    // Horizontal movement & boundaries
    if (storyMaster.isInsideApartment) {
      this.x = Math.max(70, Math.min(940, this.x + this.vx));
      const maxCamX = Math.max(0, 1024 - virtualWidth);
      camera.x = Math.max(0, Math.min(maxCamX, this.x - virtualWidth / 2));
    } else {
      this.x = Math.max(100, this.x + this.vx);
      camera.x = this.x - virtualWidth / 2;
    }

    this.idleTimer += dt * 3;

    // Notify story master of movement
    storyMaster.onPlayerMove(this.x);
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
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(-renderWidth / 2, -this.height, renderWidth, this.height);
    }

    ctx.restore();
  }
};

// Canvas Resize
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

// Assets Loader with LocalStorage Persistence
function loadImage(defaultSrc, storageKey) {
  const img = new Image();
  const saved = localStorage.getItem('custom_asset_' + storageKey);
  img.src = saved || defaultSrc;
  return img;
}

const assets = {
  background: loadImage('assets/background.png', 'background'),
  interior: loadImage('assets/tatai_haz_interior.png', 'interior'),
  idle: loadImage('assets/zsomborr.png', 'idle'),
  walk1: loadImage('assets/walk1.png', 'walk1'),
  walk2: loadImage('assets/walk2.png', 'walk2'),
  run1: loadImage('assets/run1.png', 'run1')
};

// Background rendering
function drawBackground(ctx) {
  if (storyMaster.isInsideApartment) {
    const intImg = assets.interior;
    const bgWidth = 1024;
    const bgHeight = 512;

    if (intImg.complete && intImg.naturalWidth > 0) {
      const screenX = -camera.x;
      ctx.drawImage(intImg, screenX, 0, bgWidth, bgHeight);
    } else {
      ctx.fillStyle = '#2d1b0d';
      ctx.fillRect(0, 0, virtualWidth, VIRTUAL_HEIGHT);
      ctx.fillStyle = '#784315';
      ctx.fillRect(0, GROUND_Y, virtualWidth, VIRTUAL_HEIGHT - GROUND_Y);
    }

    // Cozy fireplace embers floating up into chimney (fireplace at x ~ 625, y ~ 310)
    if (Math.random() < 0.35) {
      createDust(625 + (Math.random() * 24 - 12), 310 + (Math.random() * 12 - 6), 1, Math.random() > 0.4 ? '#f97316' : '#fbbf24');
    }
    return;
  }

  const bgImg = assets.background;
  if (!bgImg.complete || bgImg.naturalWidth === 0) {
    ctx.fillStyle = '#659ad2';
    ctx.fillRect(0, 0, virtualWidth, VIRTUAL_HEIGHT);
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
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillRect(Math.round(screenX), Math.round(screenY), p.size, p.size);
  }
  ctx.globalAlpha = 1.0;
}

// Mobile touch button bindings
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
    } else if (keyName === 'interact') {
      storyMaster.interactApartment(player);
    } else {
      keys[keyName] = true;
    }
  };
  const end = (e) => {
    e.preventDefault();
    btn.classList.remove('active');
    if (keyName !== 'interact') {
      keys[keyName] = false;
    }
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
bindTouch('btn-interact', 'interact');

// Keyboard event listeners
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
  if (e.code === 'KeyE' || e.code === 'Enter') {
    storyMaster.interactApartment(player);
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') keys.jump = false;
  if (!e.shiftKey && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) keys.run = false;
});

window.addEventListener('pointerdown', () => {
  sound.init();
  if (audioMaster.globalAudioEnabled && !audioMaster.isGlobalAudioPlaying) {
    audioMaster.playGlobalAudio();
  }
}, { once: true });

// Initialize Admin System
initAdmin(
  assets,
  bitManager,
  storyMaster,
  (assetKey, dataUrl) => {
    if (assetKey === 'idle') {
      const avatar = document.getElementById('dialogue-avatar');
      if (avatar) avatar.src = dataUrl;
    }
  },
  (testId, speaker, text) => {
    cinematic.show();
    dialogue.show({ id: testId, speaker, text, duration: 6000 });
  }
);

// Start Initial Story: "Találd meg a tatai albérleted"
storyMaster.start();

// Main game loop
let lastTime = performance.now();

function gameLoop(timestamp) {
  const now = timestamp / 1000;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  // Clear full canvas buffer
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply virtual coordinate scale
  ctx.scale(scale, scale);

  // Update logic
  player.update(dt);
  bitManager.update(dt, player, now);
  storyMaster.update(dt, now);
  cinematic.update(dt);

  // Render Scene
  drawBackground(ctx);
  storyMaster.drawApartment(ctx, camera.x, player);
  if (!storyMaster.isInsideApartment) {
    bitManager.draw(ctx, camera.x, now);
  }
  updateAndDrawParticles(ctx, dt);
  player.draw(ctx);

  // Render Cinematic Bars on top of scene
  cinematic.draw(ctx);

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
