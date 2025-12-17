/**
 * MuteButton Component
 *
 * A simple toggle button to mute/unmute all game audio.
 * Shows 🔊 when unmuted and 🔇 when muted.
 * Persists preference to localStorage via AudioManager.
 * Keyboard shortcut: M
 */

import { useState, useCallback, useEffect } from 'react';
import { audioManager } from '@/utils';
import './MuteButton.css';

export function MuteButton() {
  // Track mute state locally for UI updates
  const [isMuted, setIsMuted] = useState(() => audioManager.getIsMuted());

  /**
   * Toggle mute state
   */
  const handleToggleMute = useCallback(() => {
    const newMutedState = audioManager.toggleMute();
    setIsMuted(newMutedState);
  }, []);

  /**
   * Handle keyboard shortcut for mute toggle (M key)
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if typing in an input element
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        handleToggleMute();
      }
    },
    [handleToggleMute]
  );

  /**
   * Set up keyboard event listener
   */
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <button
      className={`mute-button ${isMuted ? 'muted' : ''}`}
      onClick={handleToggleMute}
      title={isMuted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
      aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
      aria-pressed={isMuted}
    >
      <span className="mute-button-icon" aria-hidden="true">
        {isMuted ? '🔇' : '🔊'}
      </span>
    </button>
  );
}
