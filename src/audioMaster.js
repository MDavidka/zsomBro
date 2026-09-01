// Audio Master - Voice Over & Dialogue Audio Engine with IndexedDB & LocalStorage persistence

const DB_NAME = 'ZsomBroAudioDB';
const DB_VERSION = 2;
const STORE_NAME = 'dialogue_voices';

class AudioMasterSystem {
  constructor() {
    this.db = null;
    this.currentAudio = null;
    this.previewAudio = null;
    this.voicesCache = new Map(); // dialogueId -> { blob, objectUrl, dataUrl, name, size, duration, type, updatedAt }
    
    // Volume controls (persisted in localStorage)
    this.masterVolume = parseFloat(localStorage.getItem('zsombro_vol_master') || '1.0');
    this.voiceVolume = parseFloat(localStorage.getItem('zsombro_vol_voice') || '1.0');
    this.sfxVolume = parseFloat(localStorage.getItem('zsombro_vol_sfx') || '0.8');
    this.bgmVolume = parseFloat(localStorage.getItem('zsombro_vol_bgm') || '0.6');

    // Dialogue Registry: catalogue of all known dialogue IDs in the game
    this.dialogueRegistry = new Map();
    this.listeners = new Set();

    // Load localStorage backups first for instant availability
    this.loadFromLocalStorage();
    this.dbReady = this.initDB();
  }

  loadFromLocalStorage() {
    try {
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
      console.warn('Could not load voices from localStorage', e);
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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'dialogueId' });
        }
      };
      request.onsuccess = async (e) => {
        this.db = e.target.result;
        await this.loadAllVoicesFromDB();
        resolve(this.db);
      };
      request.onerror = (err) => {
        console.warn('Error opening IndexedDB for AudioMaster:', err);
        resolve(null);
      };
    });
  }

  async loadAllVoicesFromDB() {
    if (!this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const records = req.result || [];
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
          this.notifyChange();
          resolve();
        };
        req.onerror = () => resolve();
      } catch (err) {
        console.warn('Failed to read from IndexedDB', err);
        resolve();
      }
    });
  }

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

    // Convert to DataURL for immediate playback and localStorage persistence
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

    // Detect audio duration
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

    // Save in cache
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

    // Save in localStorage if under 4MB
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

    // Save in IndexedDB
    if (this.db) {
      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
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
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
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
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
        if (onEnded) onEnded();
      };

      audio.onerror = (e) => {
        console.warn('Audio playback error for dialogue ID:', dialogueId, e);
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio autoplay prevented or error:', err);
        });
      }

      this.currentAudio = audio;
      return true;
    } catch (e) {
      console.warn('Could not play audio', e);
      return false;
    }
  }

  stopVoice() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
      this.currentAudio = null;
    }
  }

  playPreview(dialogueId) {
    this.stopPreview();
    const item = this.voicesCache.get(dialogueId);
    if (!item || (!item.objectUrl && !item.dataUrl)) return false;

    const audioSrc = item.objectUrl || item.dataUrl;

    try {
      const audio = new Audio(audioSrc);
      audio.volume = Math.max(0, Math.min(1, this.masterVolume * this.voiceVolume));
      audio.onended = () => {
        if (this.previewAudio === audio) this.previewAudio = null;
        this.notifyChange();
      };
      this.previewAudio = audio;
      audio.play().catch(console.warn);
      this.notifyChange();
      return true;
    } catch (err) {
      console.warn('Preview error', err);
      return false;
    }
  }

  stopPreview() {
    if (this.previewAudio) {
      try {
        this.previewAudio.pause();
        this.previewAudio.currentTime = 0;
      } catch (e) {}
      this.previewAudio = null;
      this.notifyChange();
    }
  }

  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, val));
    localStorage.setItem('zsombro_vol_master', this.masterVolume);
    if (this.currentAudio) this.currentAudio.volume = this.masterVolume * this.voiceVolume;
  }

  setVoiceVolume(val) {
    this.voiceVolume = Math.max(0, Math.min(1, val));
    localStorage.setItem('zsombro_vol_voice', this.voiceVolume);
    if (this.currentAudio) this.currentAudio.volume = this.masterVolume * this.voiceVolume;
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
