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

    // Register with audio master
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

    // Play real MP3 voiceover if available
    const voicePlayed = audioMaster.playVoice(this.currentId, () => {
      // Voice completed callback
    });

    this.startTypewriter(duration, voicePlayed);
  }

  startTypewriter(duration, hasVoiceAudio = false) {
    this.clearTimers();
    this.isTyping = true;

    const speed = hasVoiceAudio ? 28 : 36;

    this.typewriterInterval = setInterval(() => {
      if (this.typewriterIndex < this.targetText.length) {
        this.currentText += this.targetText[this.typewriterIndex];
        if (this.textElem) this.textElem.textContent = this.currentText;
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

  // Global Tab Switcher Function
  window.switchAdminTab = function(targetId) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
      const match = btn.getAttribute('data-tab') === targetId;
      btn.classList.toggle('active', match);
    });

    tabPanes.forEach(pane => {
      const match = pane.id === targetId;
      pane.classList.toggle('active', match);
      if (match) {
        pane.style.display = 'block';
      } else {
        pane.style.display = 'none';
      }
    });

    if (targetId === 'tab-audio') {
      renderGlobalAudioBox();
      renderAudioMasterList();
    }
    if (targetId === 'tab-story') renderStoryMasterView();
  };

  // Attach tab switching events via container delegation and direct clicks
  const tabsContainer = document.querySelector('.admin-tabs');
  if (tabsContainer) {
    tabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (btn) {
        const tabId = btn.getAttribute('data-tab');
        if (tabId) window.switchAdminTab(tabId);
      }
    });
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = btn.getAttribute('data-tab');
      if (tabId) window.switchAdminTab(tabId);
    });
  });

  // Modal open / close
  toggleBtn?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
    renderGlobalAudioBox();
    renderAudioMasterList();
    renderStoryMasterView();
  });

  closeBtn?.addEventListener('click', () => {
    modal?.classList.add('hidden');
    audioMaster.stopVoice();
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

  // Global Audio / BGM Box Renderer
  function renderGlobalAudioBox() {
    const box = document.getElementById('global-audio-box');
    if (!box) return;

    const hasGlobal = audioMaster.hasGlobalAudio();
    const globalInfo = audioMaster.getGlobalAudioInfo();
    const isPlaying = audioMaster.isGlobalAudioPlaying;
    const isEnabled = audioMaster.globalAudioEnabled;
    const isLoop = audioMaster.globalAudioLoop;

    const durStr = globalInfo && globalInfo.duration ? ` • ${globalInfo.duration}s` : '';
    const sizeStr = globalInfo && globalInfo.size ? ` • ${(globalInfo.size / 1024).toFixed(1)} KB` : '';

    let statusText = '📁 NINCS GLOBÁLIS AUDIO BEÁLLÍTVA';
    let statusClass = 'no-voice';

    if (hasGlobal) {
      if (!isEnabled) {
        statusText = '🔇 NÉMÍTVA / KIKAPCSOLVA';
        statusClass = 'disabled-voice';
      } else if (isPlaying) {
        statusText = '🟢 AKTÍV ÉS LEJÁTSZÓDIK A JÁTÉKBAN';
        statusClass = 'has-voice';
      } else {
        statusText = '⏸️ SZÜNETELTETVE (Interakcióra vár vagy leállítva)';
        statusClass = 'has-voice';
      }
    }

    box.innerHTML = `
      <div class="global-audio-header">
        <span class="global-audio-title">🎵 GLOBÁLIS HÁTTÉRZENE / AUDIO (Mentve & Használva)</span>
        <span class="voice-badge ${statusClass}">${statusText}</span>
      </div>

      <p class="section-desc">
        Itt tölthetsz fel valódi MP3/WAV zenét, ami <strong>globálisan mentésre kerül</strong> a böngésződben (IndexedDB + LocalStorage) és a játék teljes ideje alatt szól háttérzeneként.
      </p>

      ${hasGlobal ? `
        <div class="global-audio-details">
          <div class="audio-player-wrapper">
            <audio controls class="real-audio-player" src="${globalInfo.objectUrl || globalInfo.dataUrl}"></audio>
            <span class="audio-file-meta">Fájlnév: <strong>${globalInfo.name || 'global_music.mp3'}</strong>${durStr}${sizeStr}</span>
          </div>

          <div class="global-audio-controls-row">
            <button type="button" id="btn-toggle-global-play" class="retro-btn ${isPlaying ? 'pause-btn' : 'play-btn'}">
              ${isPlaying ? '⏸️ Szüneteltetés' : '▶️ Lejátszás Most'}
            </button>
            <label class="checkbox-label">
              <input type="checkbox" id="chk-global-enabled" ${isEnabled ? 'checked' : ''} />
              <span>🔊 Zene bekapcsolva a játékban</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="chk-global-loop" ${isLoop ? 'checked' : ''} />
              <span>🔁 Végtelen ismétlés (Loop)</span>
            </label>
          </div>
        </div>
      ` : ''}

      <div class="global-upload-row">
        <label for="upload-global-audio-file" class="file-label">
          ${hasGlobal ? '🔄 Új Globális Audio Feltöltése & Csere:' : '📁 Globális MP3 Hangfájl Feltöltése:'}
        </label>
        <input type="file" id="upload-global-audio-file" accept="audio/*,.mp3,.wav,.ogg,.m4a" class="retro-file-input" />
      </div>
      <div id="global-upload-status" class="upload-status-msg"></div>

      ${hasGlobal ? `
        <div class="global-audio-footer-actions">
          <button type="button" id="btn-delete-global-audio" class="delete-voice-btn danger-btn retro-btn">
            🗑 Globális Audio Törlése & Némítás
          </button>
        </div>
      ` : ''}
    `;

    // Event listeners
    const fileInput = box.querySelector('#upload-global-audio-file');
    const statusElem = box.querySelector('#global-upload-status');
    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        if (statusElem) {
          statusElem.textContent = `⏳ Feltöltés és mentés: ${file.name}...`;
          statusElem.className = 'upload-status-msg loading';
        }
        await audioMaster.saveGlobalAudio(file, file.name);
        if (statusElem) {
          statusElem.textContent = `✅ Globális audio sikeresen elmentve: ${file.name}!`;
          statusElem.className = 'upload-status-msg success';
        }
        renderGlobalAudioBox();
      }
    });

    box.querySelector('#btn-toggle-global-play')?.addEventListener('click', () => {
      audioMaster.toggleGlobalAudioPlay();
      renderGlobalAudioBox();
    });

    box.querySelector('#chk-global-enabled')?.addEventListener('change', (e) => {
      audioMaster.setGlobalAudioEnabled(e.target.checked);
      renderGlobalAudioBox();
    });

    box.querySelector('#chk-global-loop')?.addEventListener('change', (e) => {
      audioMaster.setGlobalAudioLoop(e.target.checked);
      renderGlobalAudioBox();
    });

    box.querySelector('#btn-delete-global-audio')?.addEventListener('click', async () => {
      await audioMaster.deleteGlobalAudio();
      renderGlobalAudioBox();
    });
  }

  // Audio Master List Renderer with Direct MP3 Upload & Audio Controls
  function renderAudioMasterList() {
    const container = document.getElementById('audio-master-list');
    if (!container) return;

    const dialogues = audioMaster.getAllDialogues();
    if (dialogues.length === 0) {
      container.innerHTML = '<p class="empty-state">Nincsenek regisztrált dialógusok.</p>';
      return;
    }

    container.innerHTML = '';

    // Quick Voice Upload Box for primary dialogues
    const quickUploadBox = document.createElement('div');
    quickUploadBox.className = 'quick-voice-box';
    quickUploadBox.innerHTML = `
      <div class="quick-voice-header">⚡ GYORS SZINKRON MP3 FELTÖLTÉS</div>
      <div class="quick-voice-row">
        <label for="quick-dialogue-select">Válassz Dialógust:</label>
        <select id="quick-dialogue-select" class="retro-select">
          ${dialogues.map(d => `<option value="${d.id}">#${d.id} (${d.speaker}): "${d.text.slice(0, 32)}..."</option>`).join('')}
        </select>
      </div>
      <div class="quick-voice-row">
        <label for="quick-mp3-file">MP3 / Hang Fájl:</label>
        <input type="file" id="quick-mp3-file" accept="audio/*,.mp3,.wav,.ogg,.m4a" class="retro-file-input" />
      </div>
      <div id="quick-upload-status" class="upload-status-msg"></div>
    `;

    const quickFileInput = quickUploadBox.querySelector('#quick-mp3-file');
    const quickSelect = quickUploadBox.querySelector('#quick-dialogue-select');
    const quickStatus = quickUploadBox.querySelector('#quick-upload-status');

    quickFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      const targetDlgId = quickSelect?.value;
      if (file && targetDlgId) {
        quickStatus.textContent = `⏳ Feltöltés folyamatban: ${file.name}...`;
        quickStatus.className = 'upload-status-msg loading';
        await audioMaster.saveVoice(targetDlgId, file, file.name);
        quickStatus.textContent = `✅ Sikeresen feltöltve #${targetDlgId} dialógushoz: ${file.name} (${(file.size / 1024).toFixed(1)} KB)!`;
        quickStatus.className = 'upload-status-msg success';
        renderAudioMasterList();
      }
    });

    container.appendChild(quickUploadBox);

    // List each dialogue card
    dialogues.forEach(dlg => {
      const hasVoice = audioMaster.hasVoice(dlg.id);
      const voiceInfo = audioMaster.getVoiceInfo(dlg.id);

      const row = document.createElement('div');
      row.className = 'audio-item-card';

      const durStr = voiceInfo && voiceInfo.duration ? ` (${voiceInfo.duration}s)` : '';
      const sizeStr = voiceInfo && voiceInfo.size ? ` • ${(voiceInfo.size / 1024).toFixed(1)} KB` : '';

      row.innerHTML = `
        <div class="audio-item-header">
          <span class="dialogue-id-tag">ID: <strong>${dlg.id}</strong></span>
          <span class="voice-badge ${hasVoice ? 'has-voice' : 'no-voice'}">
            ${hasVoice ? `✅ MP3 SZINKRON BETÖLTVE${durStr}` : '🔇 SZÖVEGES / NÉMA'}
          </span>
        </div>
        <div class="audio-dialogue-preview">
          <span class="speaker-tag">${dlg.speaker}:</span> "${dlg.text}"
        </div>
        
        ${hasVoice && (voiceInfo.objectUrl || voiceInfo.dataUrl) ? `
          <div class="audio-player-wrapper">
            <audio controls class="real-audio-player" src="${voiceInfo.objectUrl || voiceInfo.dataUrl}"></audio>
            <span class="audio-file-meta">Fájl: <strong>${voiceInfo.name || dlg.id + '.mp3'}</strong>${sizeStr}</span>
          </div>
        ` : ''}

        <div class="audio-file-selector-row">
          <label class="file-label">📁 MP3 Fájl Kiválasztása:</label>
          <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" class="voice-file-input" data-id="${dlg.id}" />
        </div>

        <div class="audio-actions">
          ${hasVoice ? `
            <button type="button" class="delete-voice-btn danger-btn retro-btn" data-id="${dlg.id}">🗑 MP3 Törlése</button>
          ` : ''}
          <button type="button" class="trigger-dialogue-btn retro-btn" data-id="${dlg.id}">💬 Tesztelés Játékban</button>
        </div>
      `;

      // Event listeners for file upload
      const fileInput = row.querySelector('.voice-file-input');
      fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          await audioMaster.saveVoice(dlg.id, file, file.name);
          renderAudioMasterList();
        }
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
  const bgmVol = document.getElementById('vol-bgm');
  const voiceVol = document.getElementById('vol-voice');
  if (masterVol) {
    masterVol.value = audioMaster.masterVolume;
    masterVol.addEventListener('input', (e) => audioMaster.setMasterVolume(parseFloat(e.target.value)));
  }
  if (bgmVol) {
    bgmVol.value = audioMaster.bgmVolume;
    bgmVol.addEventListener('input', (e) => audioMaster.setBgmVolume(parseFloat(e.target.value)));
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
        <div class="stage-num">${idx === storyMaster.currentStage ? '▶ Aktív Fázis ' + idx : 'Fázis ' + idx}</div>
        <div class="stage-task"><strong>Küldetés/Feladat:</strong> ${st.task}</div>
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
      renderGlobalAudioBox();
      renderAudioMasterList();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~' || e.key === 'F2') {
      modal?.classList.toggle('hidden');
      if (!modal.classList.contains('hidden')) {
        renderGlobalAudioBox();
        renderAudioMasterList();
        renderStoryMasterView();
      }
    }
  });
}
