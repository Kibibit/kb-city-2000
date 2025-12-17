/**
 * SpeedControls Component
 *
 * Game speed controls with keyboard shortcuts:
 * - Space: Toggle pause
 * - 1: Normal speed
 * - 2: Fast speed
 */

import { useEffect, useCallback } from 'react';
import { useUIStore, type GameSpeed } from '@/store';
import { audioManager } from '@/utils';
import './SpeedControls.css';

// =============================================================================
// Types
// =============================================================================

interface SpeedButtonProps {
  speed: GameSpeed;
  icon: string;
  label: string;
  shortcut: string;
  isActive: boolean;
  onClick: () => void;
}

// =============================================================================
// Sub-components
// =============================================================================

function SpeedButton({ speed, icon, label, shortcut, isActive, onClick }: SpeedButtonProps) {
  const speedClass = speed === 'paused' ? 'pause' : speed === 'fast' ? 'fast' : '';

  const handleClick = () => {
    audioManager.playSound('ui_click');
    onClick();
  };

  return (
    <button
      className={`speed-button ${speedClass} ${isActive ? 'active' : ''}`}
      onClick={handleClick}
      title={`${label} (${shortcut})`}
      aria-label={`${label} - Press ${shortcut}`}
      aria-pressed={isActive}
    >
      <span className="speed-button-icon">{icon}</span>
      <span className="speed-button-shortcut">{shortcut}</span>
    </button>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SpeedControls() {
  const gameSpeed = useUIStore((state) => state.gameSpeed);
  const setGameSpeed = useUIStore((state) => state.setGameSpeed);
  const togglePause = useUIStore((state) => state.togglePause);

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          togglePause();
          break;
        case 'Digit1':
        case 'Numpad1':
          event.preventDefault();
          setGameSpeed('normal');
          break;
        case 'Digit2':
        case 'Numpad2':
          event.preventDefault();
          setGameSpeed('fast');
          break;
      }
    },
    [togglePause, setGameSpeed]
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
    <div
      className="speed-controls"
      role="group"
      aria-label="Game speed controls"
    >
      <SpeedButton
        speed="paused"
        icon="⏸️"
        label="Paused"
        shortcut="Space"
        isActive={gameSpeed === 'paused'}
        onClick={togglePause}
      />
      <SpeedButton
        speed="normal"
        icon="▶️"
        label="Normal"
        shortcut="1"
        isActive={gameSpeed === 'normal'}
        onClick={() => setGameSpeed('normal')}
      />
      <SpeedButton
        speed="fast"
        icon="⏩"
        label="Fast"
        shortcut="2"
        isActive={gameSpeed === 'fast'}
        onClick={() => setGameSpeed('fast')}
      />
    </div>
  );
}
