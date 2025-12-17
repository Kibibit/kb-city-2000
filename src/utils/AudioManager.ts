/**
 * AudioManager - Handles all game audio including background music and sound effects
 * 
 * Features:
 * - Preloading of all audio assets
 * - Background music with loop support
 * - Sound effects for game actions
 * - Volume control for music and SFX separately
 * - Mute toggle with persistence to localStorage
 */

/** Sound effect names mapped to their file paths */
const SOUND_EFFECTS = {
  zone_place: '/audio/sfx_zone_place.mp3',
  road_place: '/audio/sfx_road_place.mp3',
  building_complete: '/audio/sfx_building_complete.mp3',
  bulldoze: '/audio/sfx_bulldoze.mp3',
  error: '/audio/sfx_error.mp3',
  milestone: '/audio/sfx_milestone.mp3',
  ui_click: '/audio/sfx_ui_click.mp3',
  disaster_earthquake: '/audio/sfx_disaster_earthquake.mp3',
  disaster_fire: '/audio/sfx_disaster_fire.mp3',
  disaster_tornado: '/audio/sfx_disaster_tornado.mp3',
} as const;

/** Type for valid sound effect names */
export type SoundEffectName = keyof typeof SOUND_EFFECTS;

/** Background music paths */
const BACKGROUND_MUSIC_PATH = '/audio/music_city_ambient_loop.mp3';
const MENU_MUSIC_PATH = '/audio/music_menu_ambient_loop.mp3';

/** LocalStorage key for audio preferences */
const STORAGE_KEY_MUTED = 'simcity_audio_muted';
const STORAGE_KEY_MUSIC_VOLUME = 'simcity_music_volume';
const STORAGE_KEY_SFX_VOLUME = 'simcity_sfx_volume';

/** Duration of fade transitions in milliseconds */
const FADE_DURATION = 1000;

/**
 * AudioManager class for managing game audio
 */
class AudioManager {
  private bgMusic: HTMLAudioElement | null = null;
  private menuMusic: HTMLAudioElement | null = null;
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private musicVolume: number = 0.02;
  private sfxVolume: number = 0.1;
  private isMuted: boolean = false;
  private isPreloaded: boolean = false;
  private fadeIntervals: Map<HTMLAudioElement, number> = new Map();

  constructor() {
    // Load saved preferences from localStorage
    this.loadPreferences();
  }

  /**
   * Load audio preferences from localStorage
   */
  private loadPreferences(): void {
    try {
      const mutedStr = localStorage.getItem(STORAGE_KEY_MUTED);
      if (mutedStr !== null) {
        this.isMuted = mutedStr === 'true';
      }

      const musicVol = localStorage.getItem(STORAGE_KEY_MUSIC_VOLUME);
      if (musicVol !== null) {
        this.musicVolume = Math.max(0, Math.min(1, parseFloat(musicVol)));
      }

      const sfxVol = localStorage.getItem(STORAGE_KEY_SFX_VOLUME);
      if (sfxVol !== null) {
        this.sfxVolume = Math.max(0, Math.min(1, parseFloat(sfxVol)));
      }
    } catch {
      // localStorage not available, use defaults
    }
  }

  /**
   * Save audio preferences to localStorage
   */
  private savePreferences(): void {
    try {
      localStorage.setItem(STORAGE_KEY_MUTED, String(this.isMuted));
      localStorage.setItem(STORAGE_KEY_MUSIC_VOLUME, String(this.musicVolume));
      localStorage.setItem(STORAGE_KEY_SFX_VOLUME, String(this.sfxVolume));
    } catch {
      // localStorage not available, ignore
    }
  }

  /**
   * Preload all audio assets
   * Call this early (e.g., on splash screen) to ensure audio is ready
   */
  preload(): void {
    if (this.isPreloaded) return;

    // Preload background music (city music)
    this.bgMusic = new Audio(BACKGROUND_MUSIC_PATH);
    this.bgMusic.loop = true;
    this.bgMusic.volume = this.isMuted ? 0 : this.musicVolume;
    this.bgMusic.preload = 'auto';

    // Preload menu music
    this.menuMusic = new Audio(MENU_MUSIC_PATH);
    this.menuMusic.loop = true;
    this.menuMusic.volume = this.isMuted ? 0 : this.musicVolume;
    this.menuMusic.preload = 'auto';

    // Preload all sound effects
    for (const [name, path] of Object.entries(SOUND_EFFECTS)) {
      const audio = new Audio(path);
      audio.preload = 'auto';
      audio.volume = this.isMuted ? 0 : this.sfxVolume;
      this.sounds.set(name, audio);
    }

    this.isPreloaded = true;
  }

  /**
   * Fade an audio element's volume over time
   * Each audio element can have its own independent fade
   */
  private fadeAudio(
    audio: HTMLAudioElement,
    fromVolume: number,
    toVolume: number,
    duration: number,
    onComplete?: () => void
  ): void {
    // Clear any existing fade for THIS audio element
    const existingInterval = this.fadeIntervals.get(audio);
    if (existingInterval !== undefined) {
      clearInterval(existingInterval);
      this.fadeIntervals.delete(audio);
    }

    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = (toVolume - fromVolume) / steps;
    let currentStep = 0;

    audio.volume = fromVolume;

    const intervalId = window.setInterval(() => {
      currentStep++;
      const newVolume = Math.max(0, Math.min(1, fromVolume + volumeStep * currentStep));
      audio.volume = newVolume;

      if (currentStep >= steps) {
        clearInterval(intervalId);
        this.fadeIntervals.delete(audio);
        audio.volume = toVolume;
        onComplete?.();
      }
    }, stepDuration);

    this.fadeIntervals.set(audio, intervalId);
  }

  /**
   * Start playing background music with optional fade in
   * Note: Browsers require user interaction before playing audio
   */
  playMusic(fadeIn: boolean = false): void {
    if (!this.bgMusic) {
      this.preload();
    }

    if (this.bgMusic) {
      const targetVolume = this.isMuted ? 0 : this.musicVolume;
      
      if (fadeIn && !this.isMuted) {
        this.bgMusic.volume = 0;
        const playPromise = this.bgMusic.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              this.fadeAudio(this.bgMusic!, 0, targetVolume, FADE_DURATION);
            })
            .catch(() => {
              // Autoplay was prevented
            });
        }
      } else {
        this.bgMusic.volume = targetVolume;
        const playPromise = this.bgMusic.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Autoplay was prevented
          });
        }
      }
    }
  }

  /**
   * Stop background music with optional fade out
   */
  stopMusic(fadeOut: boolean = false): void {
    if (this.bgMusic) {
      if (fadeOut && this.bgMusic.volume > 0) {
        this.fadeAudio(this.bgMusic, this.bgMusic.volume, 0, FADE_DURATION, () => {
          this.bgMusic?.pause();
          if (this.bgMusic) this.bgMusic.currentTime = 0;
        });
      } else {
        this.bgMusic.pause();
        this.bgMusic.currentTime = 0;
      }
    }
  }

  /**
   * Start playing menu music (for splash screen) with optional fade in
   * Note: Browsers require user interaction before playing audio
   */
  playMenuMusic(fadeIn: boolean = false): void {
    if (!this.menuMusic) {
      this.preload();
    }

    if (this.menuMusic) {
      const targetVolume = this.isMuted ? 0 : this.musicVolume;
      
      if (fadeIn && !this.isMuted) {
        this.menuMusic.volume = 0;
        const playPromise = this.menuMusic.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              this.fadeAudio(this.menuMusic!, 0, targetVolume, FADE_DURATION);
            })
            .catch(() => {
              // Autoplay was prevented
            });
        }
      } else {
        this.menuMusic.volume = targetVolume;
        const playPromise = this.menuMusic.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Autoplay was prevented
          });
        }
      }
    }
  }

  /**
   * Stop menu music with optional fade out
   */
  stopMenuMusic(fadeOut: boolean = false): void {
    if (this.menuMusic) {
      if (fadeOut && this.menuMusic.volume > 0) {
        this.fadeAudio(this.menuMusic, this.menuMusic.volume, 0, FADE_DURATION, () => {
          this.menuMusic?.pause();
          if (this.menuMusic) this.menuMusic.currentTime = 0;
        });
      } else {
        this.menuMusic.pause();
        this.menuMusic.currentTime = 0;
      }
    }
  }

  /**
   * Crossfade from menu music to background music
   * Fades out menu music while fading in background music
   */
  crossfadeToGameMusic(): void {
    // Start fading out menu music
    this.stopMenuMusic(true);
    
    // Start game music with fade in after a short delay
    setTimeout(() => {
      this.playMusic(true);
    }, FADE_DURATION / 2);
  }

  /**
   * Pause background music (can be resumed)
   */
  pauseMusic(): void {
    if (this.bgMusic) {
      this.bgMusic.pause();
    }
  }

  /**
   * Resume background music
   */
  resumeMusic(): void {
    if (this.bgMusic && this.bgMusic.paused) {
      this.bgMusic.play().catch(() => {
        // Ignore autoplay errors
      });
    }
  }

  /**
   * Play a sound effect by name
   * Creates a clone to allow overlapping sounds
   */
  playSound(name: SoundEffectName): void {
    if (this.isMuted) return;

    // Ensure sounds are loaded
    if (!this.isPreloaded) {
      this.preload();
    }

    const sound = this.sounds.get(name);
    if (sound) {
      // Clone the audio to allow overlapping sounds
      const clone = sound.cloneNode() as HTMLAudioElement;
      clone.volume = this.sfxVolume;
      clone.play().catch(() => {
        // Ignore autoplay errors
      });
    }
  }

  /**
   * Set music volume (0 to 1)
   */
  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (!this.isMuted) {
      if (this.bgMusic) {
        this.bgMusic.volume = this.musicVolume;
      }
      if (this.menuMusic) {
        this.menuMusic.volume = this.musicVolume;
      }
    }
    this.savePreferences();
  }

  /**
   * Get current music volume
   */
  getMusicVolume(): number {
    return this.musicVolume;
  }

  /**
   * Set sound effects volume (0 to 1)
   */
  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    // Update volume on all preloaded sounds
    if (!this.isMuted) {
      for (const sound of this.sounds.values()) {
        sound.volume = this.sfxVolume;
      }
    }
    this.savePreferences();
  }

  /**
   * Get current SFX volume
   */
  getSfxVolume(): number {
    return this.sfxVolume;
  }

  /**
   * Toggle mute state
   * Returns the new mute state
   */
  toggleMute(): boolean {
    this.isMuted = !this.isMuted;

    // Update background music volume
    if (this.bgMusic) {
      this.bgMusic.volume = this.isMuted ? 0 : this.musicVolume;
    }

    // Update menu music volume
    if (this.menuMusic) {
      this.menuMusic.volume = this.isMuted ? 0 : this.musicVolume;
    }

    // Update all sound effect volumes
    for (const sound of this.sounds.values()) {
      sound.volume = this.isMuted ? 0 : this.sfxVolume;
    }

    this.savePreferences();
    return this.isMuted;
  }

  /**
   * Set mute state directly
   */
  setMuted(muted: boolean): void {
    if (this.isMuted !== muted) {
      this.toggleMute();
    }
  }

  /**
   * Get current mute state
   */
  getIsMuted(): boolean {
    return this.isMuted;
  }
}

/** Singleton instance of AudioManager */
export const audioManager = new AudioManager();
