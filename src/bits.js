// Collectible Bits Engine

export class BitManager {
  constructor(soundSystem) {
    this.sound = soundSystem;
    this.bits = [];
    this.collectedCount = 0;
    this.totalCount = 5;
    this.img = new Image();
    this.img.src = localStorage.getItem('custom_asset_bit') || 'assets/bit.png';
    this.onCollectCallback = null;
    this.particles = [];
  }

  setSprite(src) {
    this.img.src = src;
  }

  setOnCollect(cb) {
    this.onCollectCallback = cb;
  }

  initDefaultBits() {
    this.bits = [
      { id: 1, x: 680,  baseY: 340, collected: false, offset: 0.0, size: 40 },
      { id: 2, x: 980,  baseY: 260, collected: false, offset: 1.2, size: 40 }, // Requires jump!
      { id: 3, x: 1320, baseY: 340, collected: false, offset: 2.4, size: 40 },
      { id: 4, x: 1650, baseY: 250, collected: false, offset: 3.6, size: 40 }, // Requires jump!
      { id: 5, x: 2050, baseY: 335, collected: false, offset: 4.8, size: 44 }
    ];
    this.collectedCount = 0;
    this.totalCount = this.bits.length;
    this.updateHUD();
  }

  reset() {
    this.initDefaultBits();
  }

  update(dt, player, time) {
    // Update ambient particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt * p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Player bounding box
    const pW = 50;
    const pH = player.height || 120;
    const pLeft = player.x - pW / 2;
    const pRight = player.x + pW / 2;
    const pTop = player.y - pH;
    const pBottom = player.y;

    for (const bit of this.bits) {
      if (bit.collected) continue;

      const bobY = bit.baseY + Math.sin(time * 3 + bit.offset) * 6;
      const bSize = bit.size;
      const bLeft = bit.x - bSize / 2;
      const bRight = bit.x + bSize / 2;
      const bTop = bobY - bSize / 2;
      const bBottom = bobY + bSize / 2;

      // Occasional ambient sparkle around bit
      if (Math.random() < 0.08) {
        this.particles.push({
          x: bit.x + (Math.random() * 24 - 12),
          y: bobY + (Math.random() * 24 - 12),
          vx: (Math.random() - 0.5) * 0.8,
          vy: -Math.random() * 1.2 - 0.2,
          size: Math.random() * 3 + 1.5,
          color: Math.random() > 0.4 ? '#e9d5ff' : '#c084fc',
          life: 1.0,
          decay: 2.2
        });
      }

      // Check collision
      if (pRight >= bLeft && pLeft <= bRight && pBottom >= bTop && pTop <= bBottom) {
        bit.collected = true;
        this.collectedCount++;
        this.sound?.playGem();
        this.spawnCollectionBurst(bit.x, bobY);
        this.updateHUD();

        if (this.onCollectCallback) {
          this.onCollectCallback(bit, this.collectedCount, this.totalCount);
        }
      }
    }
  }

  spawnCollectionBurst(x, y) {
    const colors = ['#ffffff', '#f3e8ff', '#d8b4fe', '#a855f7', '#7e22ce'];
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.2;
      const spd = Math.random() * 3.5 + 1.5;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 1.2,
        size: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0,
        decay: 1.4
      });
    }
  }

  draw(ctx, cameraX, time) {
    // Draw particles
    for (const p of this.particles) {
      const sx = p.x - cameraX;
      const sy = p.y;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fillRect(Math.round(sx - p.size / 2), Math.round(sy - p.size / 2), p.size, p.size);
      ctx.restore();
    }

    // Draw bits
    for (const bit of this.bits) {
      if (bit.collected) continue;

      const sx = bit.x - cameraX;
      const bobY = bit.baseY + Math.sin(time * 3 + bit.offset) * 6;
      const bSize = bit.size;

      ctx.save();
      ctx.translate(sx, bobY);

      // Subtle pulse scale
      const pulse = 1 + Math.sin(time * 4 + bit.offset) * 0.08;
      ctx.scale(pulse, pulse);

      // Glow halo
      const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, bSize * 0.9);
      grad.addColorStop(0, 'rgba(216, 180, 254, 0.45)');
      grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.2)');
      grad.addColorStop(1, 'rgba(126, 34, 206, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, bSize * 0.9, 0, Math.PI * 2);
      ctx.fill();

      // Draw bit image
      if (this.img.complete && this.img.naturalWidth > 0) {
        ctx.drawImage(this.img, -bSize / 2, -bSize / 2, bSize, bSize);
      } else {
        // Fallback diamond shape
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.moveTo(0, -bSize / 2);
        ctx.lineTo(bSize / 2, 0);
        ctx.lineTo(0, bSize / 2);
        ctx.lineTo(-bSize / 2, 0);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }
  }

  updateHUD() {
    const countElem = document.getElementById('bit-count');
    const totalElem = document.getElementById('bit-total');
    if (countElem) countElem.textContent = this.collectedCount;
    if (totalElem) totalElem.textContent = this.totalCount;
  }
}
