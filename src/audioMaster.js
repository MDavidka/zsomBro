// Audio Master - Voice Over & Dialogue Audio Engine with IndexedDB persistence

const DB_NAME = 'ZsomBroAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'dialogue_voices';

class AudioMasterSystem {
  constructor() {
    this.db = null;
    this.dbReady = this.initDB();
    this.currentAudio = null;
    this.previewAudio = null;
    this.voicesCache = new Map(); // dialogueId -> { blob, objectUrl, name, size, type, updatedAt }
    
    // Volume controls (persisted in localStorage)
    this.masterVolume = parseFloat(localStorage.getItem('zsombro_vol_master') || '1.0');
    this.voiceVolume = parseFloat(localStorage.getItem('zsombro_vol_voice') || '1.0');
    this.sfxVolume = parseFloat(localStorage.getItem('zsombro_vol_sfx') || '0.8');
    this.bgmVolume = parseFloat(localStorage.getItem('zsombro_vol_bgm') || '0.6');

    // Dialogue Registry: catalogue of all known dialogue IDs in the game
    this.dialogueRegistry = new Map();
    this.listeners = new Set();
  }

  async initDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, using in-memory audio store.');
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
            if (rec && rec.dialogueId && rec.blob) {
              const url = URL.createObjectURL(rec.blob);
              this.voicesCache.set(rec.dialogueId, {
                blob: rec.blob,
                objectUrl: url,
                name: rec.name || `${rec.dialogueId}.mp3`,
                size: rec.size || rec.blob.size,
                type: rec.type || rec.blob.type || 'audio/mp3',
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
    return this.voicesCache.has(dialogueId);
  }

  getVoiceInfo(dialogueId) {
    return this.voicesCache.get(dialogueId) || null;
  }

  async saveVoice(dialogueId, fileOrBlob, fileName = '') {
    await this.dbReady;
    const blob = fileOrBlob;
    const url = URL.createObjectURL(blob);
    
    // Revoke old URL if present
    const old = this.voicesCache.get(dialogueId);
    if (old && old.objectUrl) {
      URL.revokeObjectURL(old.objectUrl);
    }

    const record = {
      dialogueId,
      blob,
      name: fileName || fileOrBlob.name || `${dialogueId}.mp3`,
      size: blob.size,
      type: blob.type || 'audio/mp3',
      updatedAt: Date.now()
    };

    this.voicesCache.set(dialogueId, {
      blob,
      objectUrl: url,
      name: record.name,
      size: record.size,
      type: record.type,
      updatedAt: record.updatedAt
    });

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
    if (item && item.objectUrl) {
      URL.revokeObjectURL(item.objectUrl);
    }
    this.voicesCache.delete(dialogueId);

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
    if (!item || !item.objectUrl) {
      return false;
    }

    try {
      const audio = new Audio(item.objectUrl);
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
    if (!item || !item.objectUrl) return false;

    try {
      const audio = new Audio(item.objectUrl);
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
