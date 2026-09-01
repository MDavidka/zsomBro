import { sound } from './audio.js';

class DialogueSystem {
  constructor() {
    this.container = document.getElementById('dialogue-container');
    this.speakerElem = document.getElementById('dialogue-speaker');
    this.textElem = document.getElementById('dialogue-text');
    this.avatarElem = document.getElementById('dialogue-avatar');
    this.arrowElem = document.getElementById('dialogue-arrow');
    this.cinematicTop = document.getElementById('cinematic-top');
    this.cinematicBottom = document.getElementById('cinematic-bottom');

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
    const advance = (e) => {
      if (this.container && !this.container.classList.contains('hidden')) {
        if (e) e.stopPropagation();
        sound.init();
        if (this.isTyping) {
          this.finishTyping();
        } else {
          this.hide();
        }
      }
    };

    if (this.container) {
      this.container.addEventListener('click', advance);
      this.container.addEventListener('touchstart', advance, { passive: false });
    }

    // Clicking anywhere on screen during cinematic intro advances/dismisses it
    window.addEventListener('click', (e) => {
      if (this.container && !this.container.classList.contains('hidden')) {
        // don't double trigger if clicked dialogue directly
        if (!e.target.closest('#admin-modal') && !e.target.closest('#admin-toggle-btn')) {
          advance(e);
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (this.container && !this.container.classList.contains('hidden')) {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
          advance(e);
        }
      }
    });
  }

  showCinematicBars() {
    this.cinematicTop?.classList.remove('dismissed');
    this.cinematicBottom?.classList.remove('dismissed');
  }

  dismissCinematicBars() {
    this.cinematicTop?.classList.add('dismissed');
    this.cinematicBottom?.classList.add('dismissed');
  }

  show({ speaker = 'Narrátor', text = '', duration = 10000, avatar = null, cinematic = true, onComplete = null }) {
    if (!this.container) return;

    this.targetText = text;
    this.currentText = '';
    this.typewriterIndex = 0;
    this.onCompleteCallback = onComplete;

    if (cinematic) {
      this.showCinematicBars();
    }

    if (this.speakerElem) this.speakerElem.textContent = speaker;
    if (this.avatarElem) {
      if (avatar) {
        this.avatarElem.src = avatar;
        this.avatarElem.classList.remove('hidden');
      } else {
        this.avatarElem.classList.add('hidden');
      }
    }

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
        
        if (this.typewriterIndex % 2 === 0 && this.targetText[this.typewriterIndex] !== ' ') {
          sound.playTone(430 + (this.typewriterIndex % 4) * 35, 'square', 0.035, 0.04);
        }
        
        this.typewriterIndex++;
      } else {
        this.finishTyping(duration);
      }
    }, 36);
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

    if (autoCloseDuration > 0) {
      this.autoCloseTimeout = setTimeout(() => {
        this.hide();
      }, autoCloseDuration);
    }
  }

  hide() {
    this.clearTimers();
    this.dismissCinematicBars();
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

  toggleBtn?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
  });

  closeBtn?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });

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

  resetBtn?.addEventListener('click', () => {
    const keys = ['background', 'dialogue', 'idle', 'walk1', 'walk2', 'run1'];
    keys.forEach(k => localStorage.removeItem('custom_asset_' + k));
    location.reload();
  });

  testBtn?.addEventListener('click', () => {
    const speaker = document.getElementById('test-speaker')?.value || 'Zsombor';
    const text = document.getElementById('test-message')?.value || 'Teszt üzenet!';
    modal?.classList.add('hidden');
    dialogue.show({ speaker, text, duration: 6000, cinematic: true });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~' || e.key === 'F2') {
      modal?.classList.toggle('hidden');
    }
  });
}
