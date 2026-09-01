import { sound } from './audio.js';

class DialogueSystem {
  constructor() {
    this.container = document.getElementById('dialogue-container');
    this.speakerElem = document.getElementById('dialogue-speaker');
    this.textElem = document.getElementById('dialogue-text');
    this.avatarElem = document.getElementById('dialogue-avatar');
    this.arrowElem = document.getElementById('dialogue-arrow');

    this.currentText = '';
    this.targetText = '';
    this.typewriterIndex = 0;
    this.typewriterInterval = null;
    this.autoCloseTimeout = null;
    this.isTyping = false;
    this.onCompleteCallback = null;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    const advance = (e) => {
      e.stopPropagation();
      sound.init();
      if (this.isTyping) {
        // Instant finish typing
        this.finishTyping();
      } else {
        // Close / advance dialogue
        this.hide();
      }
    };

    this.container.addEventListener('click', advance);
    this.container.addEventListener('touchstart', advance, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (this.container && !this.container.classList.contains('hidden')) {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
          advance(e);
        }
      }
    });
  }

  show({ speaker = 'Narrátor', text = '', duration = 10000, avatar = 'assets/zsomborr.png', onComplete = null }) {
    if (!this.container) return;

    this.targetText = text;
    this.currentText = '';
    this.typewriterIndex = 0;
    this.onCompleteCallback = onComplete;

    if (this.speakerElem) this.speakerElem.textContent = speaker;
    if (this.avatarElem && avatar) this.avatarElem.src = avatar;
    if (this.textElem) this.textElem.textContent = '';
    if (this.arrowElem) this.arrowElem.style.display = 'none';

    this.container.classList.remove('hidden');

    this.startTypewriter(duration);
  }

  startTypewriter(duration) {
    this.clearTimers();
    this.isTyping = true;

    this.typewriterInterval = setInterval(() => {
      if (this.typewriterIndex < this.targetText.length) {
        this.currentText += this.targetText[this.typewriterIndex];
        this.textElem.textContent = this.currentText;
        
        // Play subtle retro blip
        if (this.typewriterIndex % 2 === 0 && this.targetText[this.typewriterIndex] !== ' ') {
          sound.playTone(420 + (this.typewriterIndex % 5) * 40, 'square', 0.04, 0.05);
        }
        
        this.typewriterIndex++;
      } else {
        this.finishTyping(duration);
      }
    }, 38);
  }

  finishTyping(autoCloseDuration = 10000) {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    this.isTyping = false;
    this.currentText = this.targetText;
    if (this.textElem) this.textElem.textContent = this.currentText;
    if (this.arrowElem) this.arrowElem.style.display = 'block';

    // Set auto-dismiss timer
    if (autoCloseDuration > 0) {
      this.autoCloseTimeout = setTimeout(() => {
        this.hide();
      }, autoCloseDuration);
    }
  }

  hide() {
    this.clearTimers();
    if (this.container) {
      this.container.classList.add('hidden');
    }
    if (this.onCompleteCallback) {
      const cb = this.onCompleteCallback;
      this.onCompleteCallback = null;
      cb();
    }
  }

  clearTimers() {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    if (this.autoCloseTimeout) {
      clearTimeout(this.autoCloseTimeout);
      this.autoCloseTimeout = null;
    }
  }
}

export const dialogue = new DialogueSystem();

// Admin Asset Manager
export function initAdmin(assets, onAssetUpdated) {
  const modal = document.getElementById('admin-modal');
  const toggleBtn = document.getElementById('admin-toggle-btn');
  const closeBtn = document.getElementById('admin-close-btn');
  const resetBtn = document.getElementById('reset-assets-btn');
  const testBtn = document.getElementById('test-dialogue-btn');

  // Toggle modal
  toggleBtn?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
  });

  closeBtn?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });

  // Upload handler helper
  const setupUploader = (inputId, assetKey, storageKey) => {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        try {
          localStorage.setItem('custom_asset_' + storageKey, dataUrl);
        } catch (err) {
          console.warn('Storage limit exceeded, keeping in memory', err);
        }

        if (assetKey === 'dialogue') {
          const bg = document.getElementById('dialogue-bg');
          if (bg) bg.src = dataUrl;
        } else if (assets[assetKey]) {
          assets[assetKey].src = dataUrl;
        }

        if (onAssetUpdated) onAssetUpdated(assetKey, dataUrl);
      };
      reader.readAsDataURL(file);
    });
  };

  setupUploader('upload-background', 'background', 'background');
  setupUploader('upload-dialogue', 'dialogue', 'dialogue');
  setupUploader('upload-idle', 'idle', 'idle');
  setupUploader('upload-walk1', 'walk1', 'walk1');
  setupUploader('upload-walk2', 'walk2', 'walk2');
  setupUploader('upload-run1', 'run1', 'run1');

  // Reset assets
  resetBtn?.addEventListener('click', () => {
    const keys = ['background', 'dialogue', 'idle', 'walk1', 'walk2', 'run1'];
    keys.forEach(k => localStorage.removeItem('custom_asset_' + k));
    location.reload();
  });

  // Test custom dialogue
  testBtn?.addEventListener('click', () => {
    const speaker = document.getElementById('test-speaker')?.value || 'Zsombor';
    const text = document.getElementById('test-message')?.value || 'Teszt üzenet!';
    modal?.classList.add('hidden');
    dialogue.show({ speaker, text, duration: 6000 });
  });

  // Key shortcut for Admin: `~` or F2
  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~' || e.key === 'F2') {
      modal?.classList.toggle('hidden');
    }
  });
}
