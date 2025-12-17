/**
 * LoadDialog Component
 *
 * Modal dialog for loading game state from localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { useUIStore, useGameStore } from '@/store';
import {
  loadGame,
  listSaves,
  deleteSave,
  formatSaveDate,
  audioManager,
  type SaveMetadata,
} from '@/utils';
import './LoadDialog.css';

/**
 * LoadDialog component - Modal for loading saved games
 */
export function LoadDialog() {
  const isOpen = useUIStore((state) => state.isLoadDialogOpen);
  const closeLoadDialog = useUIStore((state) => state.closeLoadDialog);
  const showNotification = useUIStore((state) => state.showNotification);
  const hasGameStarted = useUIStore((state) => state.hasGameStarted);
  const startGame = useUIStore((state) => state.startGame);
  const loadSaveData = useGameStore((state) => state.loadSaveData);

  // Local state
  const [saves, setSaves] = useState<SaveMetadata[]>([]);
  const [selectedSave, setSelectedSave] = useState<SaveMetadata | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load saves when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSaves(listSaves());
      setSelectedSave(null);
      setIsDeleting(false);
      setLoadError(null);
    }
  }, [isOpen]);

  // Handle load action
  const handleLoad = useCallback(() => {
    if (!selectedSave) {
      showNotification('Please select a save', 'warning');
      return;
    }

    // Clear any previous error
    setLoadError(null);

    const result = loadGame(selectedSave.key);

    if (result.success && result.data) {
      loadSaveData(result.data.gameState);
      showNotification('Game Loaded!', 'info', `"${result.data.name}" loaded successfully`);
      closeLoadDialog();
      
      // If loading from splash screen, crossfade music and start the game
      if (!hasGameStarted) {
        audioManager.crossfadeToGameMusic();
        startGame();
      }
    } else {
      // Show error inline in dialog - don't close
      const errorMessage = result.errorMessage ?? 'Could not load the save';
      setLoadError(errorMessage);
      // Also show notification for visibility
      showNotification('Load Failed', 'error', errorMessage);
    }
  }, [selectedSave, loadSaveData, showNotification, closeLoadDialog, hasGameStarted, startGame]);

  // Handle selecting a save
  const handleSelectSave = useCallback((save: SaveMetadata) => {
    setSelectedSave(save);
    setIsDeleting(false);
    setLoadError(null); // Clear error when selecting a different save
  }, []);

  // Handle delete save
  const handleDelete = useCallback((save: SaveMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!isDeleting || selectedSave?.key !== save.key) {
      // First click: confirm delete
      setSelectedSave(save);
      setIsDeleting(true);
      return;
    }

    // Second click: actually delete
    const success = deleteSave(save.key);
    if (success) {
      setSaves(listSaves());
      setSelectedSave(null);
      setIsDeleting(false);
      showNotification('Save Deleted', 'info', `"${save.name}" deleted`);
    }
  }, [isDeleting, selectedSave, showNotification]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeLoadDialog();
    } else if (e.key === 'Enter' && selectedSave) {
      handleLoad();
    }
  }, [closeLoadDialog, handleLoad, selectedSave]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeLoadDialog();
    }
  }, [closeLoadDialog]);

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="load-dialog-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-dialog-title"
    >
      <div className="load-dialog">
        {/* Header */}
        <div className="load-dialog-header">
          <span className="load-dialog-icon" aria-hidden="true">📂</span>
          <h2 id="load-dialog-title" className="load-dialog-title">Load Game</h2>
          <button
            className="load-dialog-close"
            onClick={closeLoadDialog}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="load-dialog-content">
          {/* Error message */}
          {loadError && (
            <div className="load-dialog-error" role="alert">
              <span className="load-dialog-error-icon" aria-hidden="true">❌</span>
              <span className="load-dialog-error-text">{loadError}</span>
              <span className="load-dialog-error-hint">
                Try a different save or delete the corrupted one.
              </span>
            </div>
          )}
          
          {/* Saves list */}
          {saves.length > 0 ? (
            <div className="load-dialog-saves">
              <span className="load-dialog-saves-label">Select a save to load:</span>
              <div className="load-dialog-saves-list">
                {saves.map((save) => (
                  <div
                    key={save.key}
                    className={`load-dialog-save-item ${
                      selectedSave?.key === save.key ? 'selected' : ''
                    } ${isDeleting && selectedSave?.key === save.key ? 'deleting' : ''}`}
                    onClick={() => handleSelectSave(save)}
                    onDoubleClick={handleLoad}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleSelectSave(save)}
                  >
                    <div className="save-item-info">
                      <span className="save-item-icon" aria-hidden="true">🏙️</span>
                      <div className="save-item-details">
                        <span className="save-item-name">{save.name}</span>
                        <span className="save-item-meta">
                          Pop: {save.population.toLocaleString()} • Budget: ${save.budget.toLocaleString()}
                        </span>
                        <span className="save-item-meta">
                          Year {save.gameYear}, Month {save.gameMonth}
                        </span>
                        <span className="save-item-date">
                          Saved: {formatSaveDate(save.timestamp)}
                        </span>
                      </div>
                    </div>
                    <button
                      className={`save-item-delete ${
                        isDeleting && selectedSave?.key === save.key ? 'confirm' : ''
                      }`}
                      onClick={(e) => handleDelete(save, e)}
                      aria-label={
                        isDeleting && selectedSave?.key === save.key
                          ? 'Click again to confirm delete'
                          : 'Delete save'
                      }
                      title={
                        isDeleting && selectedSave?.key === save.key
                          ? 'Click again to confirm'
                          : 'Delete'
                      }
                    >
                      {isDeleting && selectedSave?.key === save.key ? '⚠️' : '🗑️'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Empty state
            <div className="load-dialog-empty">
              <span className="load-dialog-empty-icon" aria-hidden="true">📭</span>
              <span className="load-dialog-empty-text">No saved games found</span>
              <span className="load-dialog-empty-hint">
                Save your game first to load it later
              </span>
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className="load-dialog-footer">
          <button
            className="load-dialog-btn load-dialog-btn-cancel"
            onClick={closeLoadDialog}
          >
            Cancel
          </button>
          <button
            className="load-dialog-btn load-dialog-btn-load"
            onClick={handleLoad}
            disabled={!selectedSave || isDeleting}
          >
            <span aria-hidden="true">📂</span>
            Load
          </button>
        </div>
      </div>
    </div>
  );
}
