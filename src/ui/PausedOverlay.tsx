/**
 * PausedOverlay Component
 *
 * Displays a prominent "PAUSED" indicator when the game is paused.
 * Includes a semi-transparent overlay and instructions to resume.
 */

import { useUIStore } from '@/store';
import './PausedOverlay.css';

export function PausedOverlay() {
  const isPaused = useUIStore((state) => state.isPaused);
  const togglePause = useUIStore((state) => state.togglePause);

  if (!isPaused) {
    return null;
  }

  return (
    <div 
      className="paused-overlay" 
      onClick={togglePause}
      role="dialog"
      aria-label="Game paused"
    >
      <div className="paused-content">
        <span className="paused-icon">⏸️</span>
        <span className="paused-text">PAUSED</span>
        <span className="paused-hint">Press Space or click to resume</span>
      </div>
    </div>
  );
}
