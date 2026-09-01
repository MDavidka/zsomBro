import { sound } from './audio.js';
import { audioMaster } from './audioMaster.js';

class DialogueSystem {
  constructor() {
    this.container = document.getElementById('dialogue-container');
    this.speakerElem = document.getElementById('dialogue-speaker');
    this.textElem = document.getElementById('dialogue-text');
    this.avatarElem = document.getElementById('dialogue-avatar');
    this.arrowElem = document.getElementById('dialogue-arrow');
    this.dialogueIdBadge = document.getElementById('dialogue-id-badge');

    this.currentText = '';
    this.targetText = '';
    this.currentId = '';
    this.typewriterIndex = 0;
    this.typewriterInterval = null;
    this.autoCloseTimeout = null;
    this.isTyping = false;
    this.onDismissCallback = null;
    this.currentOnDismiss = null;

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

    // Global click / tap to advance dialogue & cinematic intro
    window.addEventListener('click', (e) => {
      if (this.container && !this.container.classList.contains('hidden')) {
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

  setOnDismiss(cb) {
    this.onDismissCallback = cb;
  }

  show({ id = '', speaker = 'Narrátor', text = '', duration = 10000, avatar = null, onDismiss = null }) {
    if (!this.container) return;

    this.currentId = id || `custom_${Date.now()}`;
    this.targetText = text;
    this.currentText = '';
    this.typewriterIndex = 0;
    this.currentOnDismiss = onDismiss;

    // Register with audio master if not already present
    if (id) {
      audioMaster.registerDialogue(id, { speaker, text });
    }

    if (this.speakerElem) this.speakerElem.textContent = speaker;
    if (this.dialogueIdBadge) {
      this.dialogueIdBadge.textContent = `#${this.currentId}`;
    }

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

    // Play MP3 voiceover if available
    const voicePlayed = audioMaster.playVoice(this.currentId, () => {
      // Voice ended callback
    });

    this.startTypewriter(duration, voicePlayed);
  }

  startTypewriter(duration, hasVoiceAudio = false) {
    this.clearTimers();
    this.isTyping = true;

    // If custom voice audio is playing, typewriter runs smoothly
    const speed = hasVoiceAudio ? 28 : 36;

    this.typewriterInterval = setInterval(() => {
      if (this.typewriterIndex < this.targetText.length) {
        this.currentText += this.targetText[this.typewriterIndex];
        if (this.textElem) this.textElem.textContent = this.currentText;
        
        // If no voice audio is playing, emit 8-bit sound tones
        if (!hasVoiceAudio && this.typewriterIndex % 2 === 0 && this.targetText[this.typewriterIndex] !== ' ') {
          sound.playTone(430 + (this.typewriterIndex % 4) * 35, 'square', 0.035, 0.04);
        }
        
        this.typewriterIndex++;
      } else {
        this.finishTyping(duration);
      }
    }, speed);
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
    audioMaster.stopVoice();

    if (this.container) {
      this.container.classList.add('hidden');
    }

    const callback = this.currentOnDismiss;
    this.currentOnDismiss = null;

    if (callback) {
      callback();
    }
    if (this.onDismissCallback) {
      this.onDismissCallback();
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

// Admin System (Assets, Audio Master, Story Master)
export function initAdmin(assets, bitManager, storyMaster, onAssetUpdated, onTriggerDialogue) {
  const modal = document.getElementById('admin-modal');
  const toggleBtn = document.getElementById('admin-toggle-btn');
  const closeBtn = document.getElementById('admin-close-btn');
  const resetBtn = document.getElementById('reset-assets-btn');
  const testBtn = document.getElementById('test-dialogue-btn');

  // Modal open / close
  toggleBtn?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
    renderAudioMasterList();
    renderStoryMasterView();
  });

  closeBtn?.addEventListener('click', () => {
    modal?.classList.add('hidden');
    audioMaster.stopPreview();
  });

  // Tab switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');
      if (targetId === 'tab-audio') renderAudioMasterList();
      if (targetId === 'tab-story') renderStoryMasterView();
    });
  });

  // Assets Uploaders
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
        } else if (assetKey === 'bit' && bitManager) {
          bitManager.setSprite(dataUrl);
        } else if (assets[assetKey]) {
          assets[assetKey].src = dataUrl;
        }

        if (onAssetUpdated) onAssetUpdated(assetKey, dataUrl);
      };
      reader.readAsDataURL(file);
    });
  };

  setupUploader('upload-background', 'background', 'background');
  setupUploader('upload-bit', 'bit', 'bit');
  setupUploader('upload-dialogue', 'dialogue', 'dialogue');
  setupUploader('upload-idle', 'idle', 'idle');
  setupUploader('upload-walk1', 'walk1', 'walk1');
  setupUploader('upload-walk2', 'walk2', 'walk2');
  setupUploader('upload-run1', 'run1', 'run1');

  resetBtn?.addEventListener('click', () => {
    const keys = ['background', 'bit', 'dialogue', 'idle', 'walk1', 'walk2', 'run1'];
    keys.forEach(k => localStorage.removeItem('custom_asset_' + k));
    location.reload();
  });

  testBtn?.addEventListener('click', () => {
    const speaker = document.getElementById('test-speaker')?.value || 'Zsombor';
    const text = document.getElementById('test-message')?.value || 'Teszt üzenet!';
    const testId = document.getElementById('test-dialogue-id')?.value || 'custom_test';
    modal?.classList.add('hidden');
    if (onTriggerDialogue) onTriggerDialogue(testId, speaker, text);
  });

  // Audio Master List Renderer
  function renderAudioMasterList() {
    const container = document.getElementById('audio-master-list');
    if (!container) return;

    const dialogues = audioMaster.getAllDialogues();
    if (dialogues.length === 0) {
      container.innerHTML = '<p class="empty-state">Nincsenek regisztrált dialógusok.</p>';
      return;
    }

    container.innerHTML = '';
    dialogues.forEach(dlg => {
      const hasVoice = audioMaster.hasVoice(dlg.id);
      const voiceInfo = audioMaster.getVoiceInfo(dlg.id);

      const row = document.createElement('div');
      row.className = 'audio-item-card';
      row.innerHTML = `
        <div class="audio-item-header">
          <span class="dialogue-id-tag">ID: <strong>${dlg.id}</strong></span>
          <span class="voice-badge ${hasVoice ? 'has-voice' : 'no-voice'}">
            ${hasVoice ? '🎵 MP3 HANG FELTÖLTVE' : '🔇 SZINTETIZÁLT HANG'}
          </span>
        </div>
        <div class="audio-dialogue-preview">
          <span class="speaker-tag">${dlg.speaker}:</span> "${dlg.text}"
        </div>
        <div class="audio-actions">
          <label class="upload-mp3-btn">
            📁 MP3 Feltöltése
            <input type="file" accept="audio/*" class="voice-file-input" data-id="${dlg.id}" style="display:none;" />
          </label>
          ${hasVoice ? `
            <button class="preview-btn retro-btn" data-id="${dlg.id}">▶ Lejátszás</button>
            <button class="delete-voice-btn danger-btn retro-btn" data-id="${dlg.id}">🗑 Törlés</button>
          ` : ''}
          <button class="trigger-dialogue-btn retro-btn" data-id="${dlg.id}">💬 Tesztelés Képernyőn</button>
        </div>
      `;

      // Event listeners for this row
      const fileInput = row.querySelector('.voice-file-input');
      fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          await audioMaster.saveVoice(dlg.id, file, file.name);
          renderAudioMasterList();
        }
      });

      const previewBtn = row.querySelector('.preview-btn');
      previewBtn?.addEventListener('click', () => {
        audioMaster.playPreview(dlg.id);
      });

      const deleteBtn = row.querySelector('.delete-voice-btn');
      deleteBtn?.addEventListener('click', async () => {
        await audioMaster.deleteVoice(dlg.id);
        renderAudioMasterList();
      });

      const triggerBtn = row.querySelector('.trigger-dialogue-btn');
      triggerBtn?.addEventListener('click', () => {
        modal?.classList.add('hidden');
        dialogue.show({
          id: dlg.id,
          speaker: dlg.speaker,
          text: dlg.text
        });
      });

      container.appendChild(row);
    });
  }

  // Volume Sliders
  const masterVol = document.getElementById('vol-master');
  const voiceVol = document.getElementById('vol-voice');
  if (masterVol) {
    masterVol.value = audioMaster.masterVolume;
    masterVol.addEventListener('input', (e) => audioMaster.setMasterVolume(parseFloat(e.target.value)));
  }
  if (voiceVol) {
    voiceVol.value = audioMaster.voiceVolume;
    voiceVol.addEventListener('input', (e) => audioMaster.setVoiceVolume(parseFloat(e.target.value)));
  }

  // Story Master View Renderer
  function renderStoryMasterView() {
    const container = document.getElementById('story-master-info');
    if (!container || !storyMaster) return;

    const story = storyMaster.stories[storyMaster.activeStoryId];
    if (!story) return;

    let stagesHtml = story.stages.map((st, idx) => `
      <div class="story-stage-row ${idx === storyMaster.currentStage ? 'active-stage' : ''}">
        <div class="stage-num">${idx === storyMaster.currentStage ? '▶ Fázis ' + idx : 'Fázis ' + idx}</div>
        <div class="stage-task"><strong>Feladat:</strong> ${st.task}</div>
        ${st.dialogue ? `<div class="stage-dlg"><strong>Dialógus (${st.dialogue.id}):</strong> ${st.dialogue.speaker}: "${st.dialogue.text}"</div>` : ''}
      </div>
    `).join('');

    container.innerHTML = `
      <div class="story-header-box">
        <h3>📜 Aktív Küldetés: ${story.title}</h3>
        <p>Jelenlegi fázis: ${storyMaster.currentStage} / ${story.stages.length - 1}</p>
        <button id="story-restart-btn" class="retro-btn danger-btn">🔄 Küldetés Újraindítása</button>
      </div>
      <div class="story-stages-list">
        ${stagesHtml}
      </div>
    `;

    document.getElementById('story-restart-btn')?.addEventListener('click', () => {
      modal?.classList.add('hidden');
      storyMaster.reset();
    });
  }

  // Update audio master list whenever audioMaster changes
  audioMaster.onChange(() => {
    if (modal && !modal.classList.contains('hidden')) {
      renderAudioMasterList();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~' || e.key === 'F2') {
      modal?.classList.toggle('hidden');
      if (!modal.classList.contains('hidden')) {
        renderAudioMasterList();
        renderStoryMasterView();
      }
    }
  });
}
