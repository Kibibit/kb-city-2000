/**
 * SplashScreen Component
 *
 * Full-screen title screen shown when the game first loads.
 * Displays the game title, subtitle, and menu buttons.
 * Shows different options based on whether saved games exist.
 * Handles keyboard (Space/Enter) and click interactions to start the game.
 */

import { useState, useEffect, useCallback } from 'react';
import { useUIStore } from '@/store';
import { useGameStore } from '@/store';
import { audioManager, listSaves } from '@/utils';
import './SplashScreen.css';

export function SplashScreen() {
  const hasGameStarted = useUIStore((state) => state.hasGameStarted);
  const startGame = useUIStore((state) => state.startGame);
  const startScreensaver = useUIStore((state) => state.startScreensaver);
  const openLoadDialog = useUIStore((state) => state.openLoadDialog);
  const openSettingsDialog = useUIStore((state) => state.openSettingsDialog);
  const generateRandomCity = useGameStore((state) => state.generateRandomCity);

  // Check if any saves exist
  const [hasSaves, setHasSaves] = useState(false);

  /**
   * Handle starting the game - crossfades music and transitions to game
   */
  const handleStartGame = useCallback(() => {
    // Crossfade from menu music to city music for smooth transition
    audioManager.crossfadeToGameMusic();
    startGame();
  }, [startGame]);

  /**
   * Handle opening load dialog from splash screen
   */
  const handleLoadGame = useCallback(() => {
    audioManager.playSound('ui_click');
    openLoadDialog();
  }, [openLoadDialog]);

  /**
   * Handle opening settings dialog from splash screen
   */
  const handleOpenSettings = useCallback(() => {
    audioManager.playSound('ui_click');
    openSettingsDialog();
  }, [openSettingsDialog]);

  /**
   * Handle starting screensaver mode
   */
  const handleStartScreensaver = useCallback(() => {
    audioManager.playSound('ui_click');
    // Generate a random city for screensaver
    generateRandomCity();
    // Play menu music (calmer vibe for screensaver)
    audioManager.playMenuMusic();
    // Start screensaver mode
    startScreensaver();
  }, [generateRandomCity, startScreensaver]);

  /**
   * Handle keyboard events to start the game
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        handleStartGame();
      }
    },
    [handleStartGame]
  );

  /**
   * Preload audio assets and check for saves when splash screen mounts
   * Menu music is started on first user interaction due to browser autoplay restrictions
   */
  useEffect(() => {
    audioManager.preload();
    setHasSaves(listSaves().length > 0);

    // Start menu music on first user interaction (browsers block autoplay before interaction)
    const startMusicOnInteraction = () => {
      audioManager.playMenuMusic();
      // Remove listeners after first interaction
      document.removeEventListener('click', startMusicOnInteraction);
      document.removeEventListener('keydown', startMusicOnInteraction);
    };

    document.addEventListener('click', startMusicOnInteraction);
    document.addEventListener('keydown', startMusicOnInteraction);

    return () => {
      document.removeEventListener('click', startMusicOnInteraction);
      document.removeEventListener('keydown', startMusicOnInteraction);
    };
  }, []);

  /**
   * Set up keyboard listener when splash screen is visible
   */
  useEffect(() => {
    if (!hasGameStarted) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [hasGameStarted, handleKeyDown]);

  // Don't render if game has started
  if (hasGameStarted) {
    return null;
  }

  return (
    <div 
      className="splash-screen" 
      role="dialog" 
      aria-label="Game start screen"
      aria-modal="true"
    >
      {/* Background elements */}
      <div className="splash-background" aria-hidden="true" />
      <div className="splash-skyline" aria-hidden="true" />

      {/* Main content */}
      <div className="splash-content">
        <span className="splash-icon" role="img" aria-label="City">
          🏙️
        </span>

        <h1 className="splash-title">City Builder</h1>

        <p className="splash-subtitle">Inspired by SimCity 2000</p>

        {/* Menu buttons */}
        <div className="splash-menu">
          {hasSaves ? (
            <>
              <button
                className="splash-menu-button splash-menu-button-primary"
                onClick={handleStartGame}
                type="button"
                autoFocus
              >
                <span className="splash-button-icon" aria-hidden="true">▶</span>
                New Game
              </button>
              <button
                className="splash-menu-button splash-menu-button-secondary"
                onClick={handleLoadGame}
                type="button"
              >
                <span className="splash-button-icon" aria-hidden="true">📂</span>
                Load Game
              </button>
            </>
          ) : (
            <button
              className="splash-menu-button splash-menu-button-primary"
              onClick={handleStartGame}
              type="button"
              autoFocus
            >
              <span className="splash-button-icon" aria-hidden="true">▶</span>
              Start Game
            </button>
          )}
          <button
            className="splash-menu-button splash-menu-button-tertiary"
            onClick={handleStartScreensaver}
            type="button"
          >
            <span className="splash-button-icon" aria-hidden="true">🌃</span>
            Screensaver
          </button>
          <button
            className="splash-menu-button splash-menu-button-tertiary"
            onClick={handleOpenSettings}
            type="button"
          >
            <span className="splash-button-icon" aria-hidden="true">⚙️</span>
            Settings
          </button>
        </div>

        <div className="splash-hint">
          <span>
            Press <kbd>Space</kbd> or <kbd>Enter</kbd> to begin
          </span>
        </div>
      </div>

      {/* Version badge */}
      <div className="splash-version" aria-hidden="true">
        v0.1.0
      </div>
    </div>
  );
}
