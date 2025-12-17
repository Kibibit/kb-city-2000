/**
 * SettingsDialog Component
 *
 * Modal dialog for adjusting game settings including audio controls.
 * Features:
 * - Music volume slider (0-100%)
 * - SFX volume slider (0-100%)
 * - Master mute toggle
 * - Real-time audio adjustment
 */

import { useState, useCallback, useEffect } from 'react';
import { useUIStore } from '@/store';
import { audioManager } from '@/utils';
import './SettingsDialog.css';

/**
 * SettingsDialog component - Modal for game settings
 */
export function SettingsDialog() {
  const isOpen = useUIStore((state) => state.isSettingsDialogOpen);
  const closeSettingsDialog = useUIStore((state) => state.closeSettingsDialog);

  // Local state for audio settings
  const [musicVolume, setMusicVolume] = useState(() => 
    Math.round(audioManager.getMusicVolume() * 100)
  );
  const [sfxVolume, setSfxVolume] = useState(() => 
    Math.round(audioManager.getSfxVolume() * 100)
  );
  const [isMuted, setIsMuted] = useState(() => audioManager.getIsMuted());

  // Sync state with AudioManager when dialog opens
  useEffect(() => {
    if (isOpen) {
      setMusicVolume(Math.round(audioManager.getMusicVolume() * 100));
      setSfxVolume(Math.round(audioManager.getSfxVolume() * 100));
      setIsMuted(audioManager.getIsMuted());
    }
  }, [isOpen]);

  // Handle music volume change
  const handleMusicVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setMusicVolume(value);
    audioManager.setMusicVolume(value / 100);
  }, []);

  // Handle SFX volume change
  const handleSfxVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setSfxVolume(value);
    audioManager.setSfxVolume(value / 100);
  }, []);

  // Handle mute toggle
  const handleMuteToggle = useCallback(() => {
    const newMutedState = audioManager.toggleMute();
    setIsMuted(newMutedState);
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeSettingsDialog();
    }
  }, [closeSettingsDialog]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeSettingsDialog();
    }
  }, [closeSettingsDialog]);

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="settings-dialog-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div className="settings-dialog">
        {/* Header */}
        <div className="settings-dialog-header">
          <span className="settings-dialog-icon" aria-hidden="true">⚙️</span>
          <h2 id="settings-dialog-title" className="settings-dialog-title">Settings</h2>
          <button
            className="settings-dialog-close"
            onClick={closeSettingsDialog}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="settings-dialog-content">
          {/* Audio Section */}
          <div className="settings-section">
            <h3 className="settings-section-title">
              <span aria-hidden="true">🔊</span> Audio
            </h3>

            {/* Music Volume */}
            <div className="settings-control">
              <label htmlFor="music-volume" className="settings-label">
                Music Volume
              </label>
              <div className="settings-slider-container">
                <input
                  id="music-volume"
                  type="range"
                  min="0"
                  max="100"
                  value={musicVolume}
                  onChange={handleMusicVolumeChange}
                  className="settings-slider"
                  disabled={isMuted}
                />
                <span className="settings-slider-value">{musicVolume}%</span>
              </div>
            </div>

            {/* SFX Volume */}
            <div className="settings-control">
              <label htmlFor="sfx-volume" className="settings-label">
                SFX Volume
              </label>
              <div className="settings-slider-container">
                <input
                  id="sfx-volume"
                  type="range"
                  min="0"
                  max="100"
                  value={sfxVolume}
                  onChange={handleSfxVolumeChange}
                  className="settings-slider"
                  disabled={isMuted}
                />
                <span className="settings-slider-value">{sfxVolume}%</span>
              </div>
            </div>

            {/* Mute All */}
            <div className="settings-control settings-control-checkbox">
              <label htmlFor="mute-all" className="settings-checkbox-label">
                <input
                  id="mute-all"
                  type="checkbox"
                  checked={isMuted}
                  onChange={handleMuteToggle}
                  className="settings-checkbox"
                />
                <span className="settings-checkbox-custom">
                  {isMuted ? '🔇' : '🔊'}
                </span>
                <span className="settings-checkbox-text">Mute All</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="settings-dialog-footer">
          <button
            className="settings-dialog-btn settings-dialog-btn-close"
            onClick={closeSettingsDialog}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
