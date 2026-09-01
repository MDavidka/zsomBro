import { sound } from './audio.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusElem = document.getElementById('char-status');
const soundBtn = document.getElementById('sound-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Disable smoothing for crisp pixel-art look
ctx.imageSmoothingEnabled = false;

// Game constants
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 512;
const GROUND_Y = 380; // Grass platform level

// Assets
const assets = {
  background: new Image(),
  zsomborr: new Image(),
  loaded: false
};

let loadedCount = 0;
const totalAssets = 2;

function checkAssetLoaded() {
  loadedCount++;
  if (loadedCount === totalAssets) {
    assets.loaded = true;
  }
}

assets.background.onload = checkAssetLoaded;
assets.zsomborr.onload = checkAssetLoaded;

assets.background.src = 'assets/background.png';
assets.zsomborr.src = 'assets/zsomborr.png';

// Particle system for dust & landing
const particles = [];
function createDust(x, y, count = 3, color = 'rgba(230, 240, 230, 0.7)') {
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

// Key listeners
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

// Touch listeners for mobile
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

// Sound toggle
soundBtn.addEventListener('click', () => {
  sound.init();
  const isMuted = sound.toggleMute();
  soundBtn.textContent = isMuted ? '🔇 SFX' : '🔊 SFX';
});

// Fullscreen toggle
fullscreenBtn.addEventListener('click', () => {
  const container = document.getElementById('game-container');
  if (!document.fullscreenElement) {
    container.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

// Camera state
const camera = {
  x: 0,
  speed: 0
};

// Player: Zsomborr
const player = {
  name: 'Zsomborr',
  x: CANVAS_WIDTH / 2 - 40,
  y: GROUND_Y,
  width: 64,   // scaled width for pixel sprite
  height: 124, // scaled height for pixel sprite
  vx: 0,
  vy: 0,
  speed: 3.8,
  runSpeed: 6.2,
  gravity: 0.55,
  jumpStrength: -12.5,
  isGrounded: true,
  facingRight: true,
  walkTimer: 0,
  idleTimer: 0,
  state: 'idle',

  tryJump() {
    if (this.isGrounded) {
      this.vy = this.jumpStrength;
      this.isGrounded = false;
      sound.playShoot();
      createDust(this.x + this.width / 2, this.y, 6);
    }
  },

  update(dt) {
    // Movement calculation
    let moveDir = 0;
    if (keys.left) moveDir -= 1;
    if (keys.right) moveDir += 1;

    const currentSpeed = keys.run ? this.runSpeed : this.speed;

    if (moveDir !== 0) {
      this.vx = moveDir * currentSpeed;
      this.facingRight = moveDir > 0;
      this.walkTimer += dt * (keys.run ? 14 : 9);

      if (this.isGrounded) {
        this.state = keys.run ? 'Running' : 'Walking';
        if (Math.sin(this.walkTimer) < -0.8) {
          createDust(this.x + this.width / 2, this.y, 1);
        }
      }
    } else {
      this.vx = 0;
      this.walkTimer = 0;
      if (this.isGrounded) {
        this.state = 'Idle';
      }
    }

    // Apply gravity
    this.vy += this.gravity;
    this.y += this.vy;

    // Ground collision
    if (this.y >= GROUND_Y) {
      if (!this.isGrounded && this.vy > 2) {
        createDust(this.x + this.width / 2, GROUND_Y, 8);
        sound.playHit();
      }
      this.y = GROUND_Y;
      this.vy = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
      this.state = this.vy < 0 ? 'Jumping' : 'Falling';
    }

    // Horizontal position & camera scrolling
    this.x += this.vx;

    // Keep player in center region and pan camera/background
    const margin = 350;
    if (this.x > CANVAS_WIDTH - margin) {
      const diff = this.x - (CANVAS_WIDTH - margin);
      this.x = CANVAS_WIDTH - margin;
      camera.x += diff;
    } else if (this.x < margin) {
      const diff = margin - this.x;
      this.x = margin;
      camera.x -= diff;
    }

    this.idleTimer += dt * 3;
  },

  draw(ctx) {
    if (!assets.loaded) return;

    ctx.save();

    // Position origin at feet
    const drawX = Math.round(this.x);
    let drawY = Math.round(this.y);

    // Subtle walking bounce / breathing animation
    let bounceY = 0;
    let tiltAngle = 0;

    if (this.state === 'Walking' || this.state === 'Running') {
      bounceY = Math.abs(Math.sin(this.walkTimer)) * 4;
      tiltAngle = Math.sin(this.walkTimer) * (this.facingRight ? 0.05 : -0.05);
    } else if (this.state === 'Idle') {
      bounceY = Math.sin(this.idleTimer) * 1.5;
    } else if (!this.isGrounded) {
      tiltAngle = this.vy * 0.015 * (this.facingRight ? 1 : -1);
    }

    // Character shadow on the grass
    ctx.fillStyle = 'rgba(15, 25, 10, 0.4)';
    ctx.beginPath();
    const shadowScale = Math.max(0.4, 1 - (GROUND_Y - this.y) / 200);
    ctx.ellipse(
      drawX + this.width / 2,
      GROUND_Y - 2,
      (this.width / 2) * shadowScale,
      6 * shadowScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Character drawing with direction flip
    ctx.translate(drawX + this.width / 2, drawY - bounceY);
    ctx.rotate(tiltAngle);

    if (!this.facingRight) {
      ctx.scale(-1, 1);
    }

    // Draw sprite centered at feet base
    ctx.drawImage(
      assets.zsomborr,
      -this.width / 2,
      -this.height,
      this.width,
      this.height
    );

    ctx.restore();
  }
};

// Draw seamless repeating background
function drawBackground(ctx) {
  if (!assets.loaded) {
    ctx.fillStyle = '#4a75a0';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return;
  }

  const bgWidth = assets.background.width || 1024;
  const bgHeight = assets.background.height || 512;
  const offsetX = -(camera.x % bgWidth);

  // Render main and seamless adjacent tiles
  ctx.drawImage(assets.background, offsetX - bgWidth, 0, bgWidth, CANVAS_HEIGHT);
  ctx.drawImage(assets.background, offsetX, 0, bgWidth, CANVAS_HEIGHT);
  ctx.drawImage(assets.background, offsetX + bgWidth, 0, bgWidth, CANVAS_HEIGHT);
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

    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1.0;
}

// Game loop
let lastTime = performance.now();

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  // Clear canvas
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (!assets.loaded) {
    ctx.fillStyle = '#0f111a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#58a6ff';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOADING ASSETS...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    requestAnimationFrame(gameLoop);
    return;
  }

  // Update
  player.update(dt);

  // Update UI Status
  if (statusElem) {
    statusElem.textContent = player.state;
  }

  // Render Scene
  drawBackground(ctx);
  updateAndDrawParticles(ctx, dt);
  player.draw(ctx);

  requestAnimationFrame(gameLoop);
}

// Start game
requestAnimationFrame(gameLoop);
