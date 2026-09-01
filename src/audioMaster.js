// Audio Master - Voice Over & Global Audio / BGM Engine with IndexedDB & LocalStorage persistence

const DB_NAME = 'ZsomBroAudioDB';
const DB_VERSION = 3;
const STORE_VOICES = 'dialogue_voices';
const STORE_GLOBAL = 'global_settings';

class AudioMasterSystem {
  constructor() {
    this.db = null;
    this.currentVoiceAudio = null;
    this.globalAudio = null;
    this.globalAudioData = null; // { objectUrl, dataUrl, name, size, duration, type, updatedAt }
    this.isGlobalAudioPlaying = false;
    this.globalAudioEnabled = localStorage.getItem('zsombro_global_audio_enabled') !== 'false';
    this.globalAudioLoop = localStorage.getItem('zsombro_global_audio_loop') !== 'false';

    this.voicesCache = new Map(); // dialogueId -> { blob, objectUrl, dataUrl, name, size, duration, type, updatedAt }
    
    // Volume controls (persisted in localStorage)
    this.masterVolume = parseFloat(localStorage.getItem('zsombro_vol_master') || '1.0');
    this.bgmVolume = parseFloat(localStorage.getItem('zsombro_vol_bgm') || '0.7');
    this.voiceVolume = parseFloat(localStorage.getItem('zsombro_vol_voice') || '1.0');

    // Dialogue Registry: catalogue of all known dialogue IDs in the game
    this.dialogueRegistry = new Map();
    this.listeners = new Set();
    this.userInteracted = false;

    // Load localStorage backups first for instant availability
    this.loadFromLocalStorage();
    this.dbReady = this.initDB();
    this.setupInteractionUnlock();
  }

  setupInteractionUnlock() {
    const unlock = () => {
      this.userInteracted = true;
      if (this.globalAudio && this.globalAudioEnabled && this.globalAudio.paused) {
        this.playGlobalAudio();
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  loadFromLocalStorage() {
    try {
      // 1. Load Global Audio
      const globalDataUrl = localStorage.getItem('zsombro_global_audio_data');
      const globalMetaStr = localStorage.getItem('zsombro_global_audio_meta');
      if (globalDataUrl) {
        let meta = {};
        if (globalMetaStr) {
          try { meta = JSON.parse(globalMetaStr); } catch (e) {}
        }
        this.globalAudioData = {
          objectUrl: globalDataUrl,
          dataUrl: globalDataUrl,
          name: meta.name || 'global_music.mp3',
          size: meta.size || Math.round(globalDataUrl.length * 0.75),
          duration: meta.duration || 0,
          type: meta.type || 'audio/mp3',
          updatedAt: meta.updatedAt || Date.now()
        };
        this.initGlobalAudioElement();
      }

      // 2. Load Dialogues
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('zsombro_voice_data_')) {
          const dialogueId = key.replace('zsombro_voice_data_', '');
          const dataUrl = localStorage.getItem(key);
          const metaJson = localStorage.getItem('zsombro_voice_meta_' + dialogueId);
          let meta = {};
          if (metaJson) {
            try { meta = JSON.parse(metaJson); } catch (e) {}
          }
          if (dataUrl) {
            this.voicesCache.set(dialogueId, {
              objectUrl: dataUrl,
              dataUrl: dataUrl,
              name: meta.name || `${dialogueId}.mp3`,
              size: meta.size || Math.round(dataUrl.length * 0.75),
              duration: meta.duration || 0,
              type: meta.type || 'audio/mp3',
              updatedAt: meta.updatedAt || Date.now()
            });
          }
        }
      }
    } catch (e) {
      console.warn('Could not load audio from localStorage', e);
    }
  }

  async initDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, using in-memory and localStorage audio store.');
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_VOICES)) {
          db.createObjectStore(STORE_VOICES, { keyPath: 'dialogueId' });
        }
        if (!db.objectStoreNames.contains(STORE_GLOBAL)) {
          db.createObjectStore(STORE_GLOBAL, { keyPath: 'key' });
        }
      };
      request.onsuccess = async (e) => {
        this.db = e.target.result;
        await this.loadAllFromDB();
        resolve(this.db);
      };
      request.onerror = (err) => {
        console.warn('Error opening IndexedDB for AudioMaster:', err);
        resolve(null);
      };
    });
  }

  async loadAllFromDB() {
    if (!this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([STORE_VOICES, STORE_GLOBAL], 'readonly');
        
        // Load Global Audio from DB
        const globalStore = tx.objectStore(STORE_GLOBAL);
        const globalReq = globalStore.get('global_bgm');
        globalReq.onsuccess = () => {
          const rec = globalReq.result;
          if (rec && (rec.blob || rec.dataUrl)) {
            let url = rec.dataUrl;
            if (rec.blob) {
              url = URL.createObjectURL(rec.blob);
            }
            this.globalAudioData = {
              blob: rec.blob,
              objectUrl: url,
              dataUrl: rec.dataUrl,
              name: rec.name || 'global_music.mp3',
              size: rec.size || (rec.blob ? rec.blob.size : 0),
              duration: rec.duration || 0,
              type: rec.type || 'audio/mp3',
              updatedAt: rec.updatedAt || Date.now()
            };
            this.initGlobalAudioElement();
          }
        };

        // Load Voices
        const voiceStore = tx.objectStore(STORE_VOICES);
        const voiceReq = voiceStore.getAll();
        voiceReq.onsuccess = () => {
          const records = voiceReq.result || [];
          records.forEach((rec) => {
            if (rec && rec.dialogueId && (rec.blob || rec.dataUrl)) {
              let url = rec.dataUrl;
              if (rec.blob) {
                url = URL.createObjectURL(rec.blob);
              }
              this.voicesCache.set(rec.dialogueId, {
                blob: rec.blob,
                objectUrl: url,
                dataUrl: rec.dataUrl,
                name: rec.name || `${rec.dialogueId}.mp3`,
                size: rec.size || (rec.blob ? rec.blob.size : 0),
                duration: rec.duration || 0,
                type: rec.type || 'audio/mp3',
                updatedAt: rec.updatedAt || Date.now()
              });
            }
          });
        };

        tx.oncomplete = () => {
          this.notifyChange();
          resolve();
        };
        tx.onerror = () => resolve();
      } catch (err) {
        console.warn('Failed to read from IndexedDB', err);
        resolve();
      }
    });
  }

  // ==========================================
  // GLOBAL AUDIO / BGM METHODS
  // ==========================================

  initGlobalAudioElement() {
    if (!this.globalAudioData) return;
    const src = this.globalAudioData.objectUrl || this.globalAudioData.dataUrl;
    if (!src) return;

    if (!this.globalAudio) {
      this.globalAudio = new Audio();
    }
    
    if (this.globalAudio.src !== src) {
      this.globalAudio.src = src;
      this.globalAudio.loop = this.globalAudioLoop;
      this.updateGlobalAudioVolume();

      this.globalAudio.onplay = () => {
        this.isGlobalAudioPlaying = true;
        this.notifyChange();
      };
      this.globalAudio.onpause = () => {
        this.isGlobalAudioPlaying = false;
        this.notifyChange();
      };
      this.globalAudio.onended = () => {
        if (!this.globalAudioLoop) {
          this.isGlobalAudioPlaying = false;
          this.notifyChange();
        }
      };

      if (this.globalAudioEnabled) {
        this.playGlobalAudio();
      }
    }
  }

  async saveGlobalAudio(fileOrBlob, fileName = '') {
    await this.dbReady;
    const blob = fileOrBlob;
    const name = fileName || fileOrBlob.name || 'global_music.mp3';

    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

    let duration = 0;
    if (dataUrl) {
      try {
        duration = await new Promise((resolve) => {
          const tempAudio = new Audio();
          tempAudio.src = dataUrl;
          tempAudio.onloadedmetadata = () => resolve(tempAudio.duration);
          tempAudio.onerror = () => resolve(0);
        });
      } catch (e) {}
    }

    const record = {
      key: 'global_bgm',
      blob,
      dataUrl,
      name,
      size: blob.size,
      duration: Math.round(duration * 10) / 10,
      type: blob.type || 'audio/mp3',
      updatedAt: Date.now()
    };

    this.globalAudioData = {
      blob,
      objectUrl: dataUrl || URL.createObjectURL(blob),
      dataUrl,
      name: record.name,
      size: record.size,
      duration: record.duration,
      type: record.type,
      updatedAt: record.updatedAt
    };

    if (dataUrl && dataUrl.length < 5 * 1024 * 1024) {
      try {
        localStorage.setItem('zsombro_global_audio_data', dataUrl);
        localStorage.setItem('zsombro_global_audio_meta', JSON.stringify({
          name: record.name,
          size: record.size,
          duration: record.duration,
          type: record.type,
          updatedAt: record.updatedAt
        }));
      } catch (err) {
        console.warn('localStorage quota reached for global audio', err);
      }
    }

    if (this.db) {
      try {
        const tx = this.db.transaction(STORE_GLOBAL, 'readwrite');
        const store = tx.objectStore(STORE_GLOBAL);
        store.put(record);
      } catch (err) {
        console.warn('Failed to persist global audio into IndexedDB', err);
      }
    }

    this.initGlobalAudioElement();
    if (this.globalAudioEnabled) {
      this.playGlobalAudio();
    }
    this.notifyChange();
    return true;
  }

  async deleteGlobalAudio() {
    await this.dbReady;
    if (this.globalAudio) {
      this.globalAudio.pause();
      this.globalAudio.src = '';
      this.globalAudio = null;
    }
    if (this.globalAudioData && this.globalAudioData.objectUrl && this.globalAudioData.objectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.globalAudioData.objectUrl);
    }
    this.globalAudioData = null;
    this.isGlobalAudioPlaying = false;

    try {
      localStorage.removeItem('zsombro_global_audio_data');
      localStorage.removeItem('zsombro_global_audio_meta');
    } catch (e) {}

    if (this.db) {
      try {
        const tx = this.db.transaction(STORE_GLOBAL, 'readwrite');
        const store = tx.objectStore(STORE_GLOBAL);
        store.delete('global_bgm');
      } catch (err) {
        console.warn('Failed to delete global audio from IndexedDB', err);
      }
    }

    this.notifyChange();
  }

  playGlobalAudio() {
    if (!this.globalAudioData) return false;
    if (!this.globalAudio) {
      this.initGlobalAudioElement();
    }
    if (!this.globalAudio) return false;

    this.globalAudio.loop = this.globalAudioLoop;
    this.updateGlobalAudioVolume();

    const promise = this.globalAudio.play();
    if (promise !== undefined) {
      promise
        .then(() => {
          this.isGlobalAudioPlaying = true;
          this.notifyChange();
        })
        .catch((err) => {
          console.warn('Global audio autoplay wait for interaction:', err.message);
        });
    }
    return true;
  }

  pauseGlobalAudio() {
    if (this.globalAudio) {
      this.globalAudio.pause();
      this.isGlobalAudioPlaying = false;
      this.notifyChange();
    }
  }

  toggleGlobalAudioPlay() {
    if (this.isGlobalAudioPlaying) {
      this.pauseGlobalAudio();
    } else {
      this.playGlobalAudio();
    }
  }

  setGlobalAudioEnabled(enabled) {
    this.globalAudioEnabled = !!enabled;
    localStorage.setItem('zsombro_global_audio_enabled', this.globalAudioEnabled ? 'true' : 'false');
    if (this.globalAudioEnabled) {
      this.playGlobalAudio();
    } else {
      this.pauseGlobalAudio();
    }
    this.notifyChange();
  }

  setGlobalAudioLoop(loop) {
    this.globalAudioLoop = !!loop;
    localStorage.setItem('zsombro_global_audio_loop', this.globalAudioLoop ? 'true' : 'false');
    if (this.globalAudio) {
      this.globalAudio.loop = this.globalAudioLoop;
    }
    this.notifyChange();
  }

  updateGlobalAudioVolume() {
    if (this.globalAudio) {
      const vol = Math.max(0, Math.min(1, this.masterVolume * this.bgmVolume));
      this.globalAudio.volume = vol;
    }
  }

  hasGlobalAudio() {
    return !!(this.globalAudioData && (this.globalAudioData.objectUrl || this.globalAudioData.dataUrl));
  }

  getGlobalAudioInfo() {
    return this.globalAudioData;
  }

  // ==========================================
  // DIALOGUE VOICES METHODS
  // ==========================================

  registerDialogue(id, info) {
    this.dialogueRegistry.set(id, {
      id,
      speaker: info.speaker || 'Narrátor',
      text: info.text || '',
      category: info.category || 'Story'
    });
    this.notifyChange();
  }

  getAllDialogues() {
    return Array.from(this.dialogueRegistry.values());
  }

  hasVoice(dialogueId) {
    const item = this.voicesCache.get(dialogueId);
    return !!(item && (item.objectUrl || item.dataUrl));
  }

  getVoiceInfo(dialogueId) {
    return this.voicesCache.get(dialogueId) || null;
  }

  async saveVoice(dialogueId, fileOrBlob, fileName = '') {
    await this.dbReady;
    const blob = fileOrBlob;
    const name = fileName || fileOrBlob.name || `${dialogueId}.mp3`;

    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

    let duration = 0;
    if (dataUrl) {
      try {
        duration = await new Promise((resolve) => {
          const tempAudio = new Audio();
          tempAudio.src = dataUrl;
          tempAudio.onloadedmetadata = () => resolve(tempAudio.duration);
          tempAudio.onerror = () => resolve(0);
        });
      } catch (e) {}
    }

    const record = {
      dialogueId,
      blob,
      dataUrl,
      name,
      size: blob.size,
      duration: Math.round(duration * 10) / 10,
      type: blob.type || 'audio/mp3',
      updatedAt: Date.now()
    };

    this.voicesCache.set(dialogueId, {
      blob,
      objectUrl: dataUrl || URL.createObjectURL(blob),
      dataUrl,
      name: record.name,
      size: record.size,
      duration: record.duration,
      type: record.type,
      updatedAt: record.updatedAt
    });

    if (dataUrl && dataUrl.length < 4 * 1024 * 1024) {
      try {
        localStorage.setItem('zsombro_voice_data_' + dialogueId, dataUrl);
        localStorage.setItem('zsombro_voice_meta_' + dialogueId, JSON.stringify({
          name: record.name,
          size: record.size,
          duration: record.duration,
          type: record.type,
          updatedAt: record.updatedAt
        }));
      } catch (err) {
        console.warn('localStorage full, voice saved in IndexedDB and memory only', err);
      }
    }

    if (this.db) {
      try {
        const tx = this.db.transaction(STORE_VOICES, 'readwrite');
        const store = tx.objectStore(STORE_VOICES);
        store.put(record);
      } catch (err) {
        console.warn('Failed to persist audio into IndexedDB', err);
      }
    }

    this.notifyChange();
    return true;
  }

  async deleteVoice(dialogueId) {
    await this.dbReady;
    const item = this.voicesCache.get(dialogueId);
    if (item && item.objectUrl && item.objectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.objectUrl);
    }
    this.voicesCache.delete(dialogueId);

    try {
      localStorage.removeItem('zsombro_voice_data_' + dialogueId);
      localStorage.removeItem('zsombro_voice_meta_' + dialogueId);
    } catch (e) {}

    if (this.db) {
      try {
        const tx = this.db.transaction(STORE_VOICES, 'readwrite');
        const store = tx.objectStore(STORE_VOICES);
        store.delete(dialogueId);
      } catch (err) {
        console.warn('Failed to delete audio from IndexedDB', err);
      }
    }

    this.notifyChange();
  }

  playVoice(dialogueId, onEnded = null) {
    this.stopVoice();
    const item = this.voicesCache.get(dialogueId);
    if (!item || (!item.objectUrl && !item.dataUrl)) {
      return false;
    }

    const audioSrc = item.objectUrl || item.dataUrl;

    try {
      const audio = new Audio(audioSrc);
      const effectiveVolume = Math.max(0, Math.min(1, this.masterVolume * this.voiceVolume));
      audio.volume = effectiveVolume;

      audio.onended = () => {
        if (this.currentVoiceAudio === audio) {
          this.currentVoiceAudio = null;
        }
        if (onEnded) onEnded();
      };

      audio.onerror = (e) => {
        console.warn('Audio playback error for dialogue ID:', dialogueId, e);
        if (this.currentVoiceAudio === audio) {
          this.currentVoiceAudio = null;
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio autoplay prevented or error:', err);
        });
      }

      this.currentVoiceAudio = audio;
      return true;
    } catch (e) {
      console.warn('Could not play audio', e);
      return false;
    }
  }

  stopVoice() {
    if (this.currentVoiceAudio) {
      try {
        this.currentVoiceAudio.pause();
        this.currentVoiceAudio.currentTime = 0;
      } catch (e) {}
      this.currentVoiceAudio = null;
    }
  }

  // ==========================================
  // VOLUME SETTINGS
  // ==========================================

  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, val));
    localStorage.setItem('zsombro_vol_master', this.masterVolume);
    this.updateGlobalAudioVolume();
    if (this.currentVoiceAudio) {
      this.currentVoiceAudio.volume = this.masterVolume * this.voiceVolume;
    }
  }

  setBgmVolume(val) {
    this.bgmVolume = Math.max(0, Math.min(1, val));
    localStorage.setItem('zsombro_vol_bgm', this.bgmVolume);
    this.updateGlobalAudioVolume();
  }

  setVoiceVolume(val) {
    this.voiceVolume = Math.max(0, Math.min(1, val));
    localStorage.setItem('zsombro_vol_voice', this.voiceVolume);
    if (this.currentVoiceAudio) {
      this.currentVoiceAudio.volume = this.masterVolume * this.voiceVolume;
    }
  }

  onChange(cb) {
    this.listeners.add(cb);
  }

  notifyChange() {
    for (const cb of this.listeners) {
      try { cb(); } catch (e) {}
    }
  }
}

export const audioMaster = new AudioMasterSystem();
