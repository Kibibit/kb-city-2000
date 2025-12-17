/**
 * SaveDialog Component
 *
 * Modal dialog for saving game state to localStorage.
 * Supports multiple save slots with overwrite capability.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUIStore, useGameStore } from '@/store';
import {
  saveGame,
  listSaves,
  deleteSave,
  formatSaveDate,
  getAvailableSlots,
  MAX_SAVE_SLOTS,
  type SaveMetadata,
} from '@/utils';
import './SaveDialog.css';

/**
 * SaveDialog component - Modal for saving the game
 */
export function SaveDialog() {
  const isOpen = useUIStore((state) => state.isSaveDialogOpen);
  const closeSaveDialog = useUIStore((state) => state.closeSaveDialog);
  const showNotification = useUIStore((state) => state.showNotification);
  const getSaveData = useGameStore((state) => state.getSaveData);

  // Local state
  const [saveName, setSaveName] = useState('');
  const [saves, setSaves] = useState<SaveMetadata[]>([]);
  const [selectedSave, setSelectedSave] = useState<SaveMetadata | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Input ref for focus
  const inputRef = useRef<HTMLInputElement>(null);

  // Load saves when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSaves(listSaves());
      setSaveName('');
      setSelectedSave(null);
      setIsDeleting(false);
      // Focus input after a short delay for animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle save action
  const handleSave = useCallback(() => {
    const name = saveName.trim();
    if (!name) {
      showNotification('Please enter a save name', 'warning');
      return;
    }

    const gameState = getSaveData();
    const existingKey = selectedSave?.key;

    const result = saveGame(name, gameState, existingKey);

    if (result.success) {
      showNotification(
        existingKey ? 'Game Overwritten!' : 'Game Saved!',
        'info',
        `"${name}" saved successfully`
      );
      closeSaveDialog();
    } else {
      // Show specific error message
      const errorMessage = result.errorMessage ?? 'Could not save the game';
      showNotification('Save Failed', 'error', errorMessage);
    }
  }, [saveName, selectedSave, getSaveData, showNotification, closeSaveDialog]);

  // Handle selecting an existing save (for overwrite)
  const handleSelectSave = useCallback((save: SaveMetadata) => {
    if (selectedSave?.key === save.key) {
      // Deselect if clicking same save
      setSelectedSave(null);
      setSaveName('');
    } else {
      setSelectedSave(save);
      setSaveName(save.name);
    }
    setIsDeleting(false);
  }, [selectedSave]);

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
      setSaveName('');
      setIsDeleting(false);
      showNotification('Save Deleted', 'info', `"${save.name}" deleted`);
    }
  }, [isDeleting, selectedSave, showNotification]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeSaveDialog();
    } else if (e.key === 'Enter' && saveName.trim()) {
      handleSave();
    }
  }, [closeSaveDialog, handleSave, saveName]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeSaveDialog();
    }
  }, [closeSaveDialog]);

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  const availableSlots = getAvailableSlots();
  const canCreateNew = availableSlots > 0;

  return (
    <div
      className="save-dialog-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-dialog-title"
    >
      <div className="save-dialog">
        {/* Header */}
        <div className="save-dialog-header">
          <span className="save-dialog-icon" aria-hidden="true">💾</span>
          <h2 id="save-dialog-title" className="save-dialog-title">Save Game</h2>
          <button
            className="save-dialog-close"
            onClick={closeSaveDialog}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="save-dialog-content">
          {/* Save name input */}
          <div className="save-dialog-input-group">
            <label htmlFor="save-name-input" className="save-dialog-label">
              Save Name:
            </label>
            <input
              ref={inputRef}
              id="save-name-input"
              type="text"
              className="save-dialog-input"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Enter save name..."
              maxLength={50}
            />
          </div>

          {/* Slot count */}
          <div className="save-dialog-slots">
            <span className="save-dialog-slots-label">
              Save Slots: {saves.length} / {MAX_SAVE_SLOTS}
            </span>
            {!canCreateNew && !selectedSave && (
              <span className="save-dialog-slots-warning">
                Select a save to overwrite
              </span>
            )}
          </div>

          {/* Existing saves list */}
          {saves.length > 0 && (
            <div className="save-dialog-saves">
              <span className="save-dialog-saves-label">Existing Saves:</span>
              <div className="save-dialog-saves-list">
                {saves.map((save) => (
                  <div
                    key={save.key}
                    className={`save-dialog-save-item ${
                      selectedSave?.key === save.key ? 'selected' : ''
                    } ${isDeleting && selectedSave?.key === save.key ? 'deleting' : ''}`}
                    onClick={() => handleSelectSave(save)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleSelectSave(save)}
                  >
                    <div className="save-item-info">
                      <span className="save-item-icon" aria-hidden="true">🏙️</span>
                      <div className="save-item-details">
                        <span className="save-item-name">{save.name}</span>
                        <span className="save-item-meta">
                          Pop: {save.population.toLocaleString()} • Year {save.gameYear}, Month {save.gameMonth}
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
          )}

          {/* Empty state */}
          {saves.length === 0 && (
            <div className="save-dialog-empty">
              <span className="save-dialog-empty-icon" aria-hidden="true">📁</span>
              <span className="save-dialog-empty-text">No saved games yet</span>
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className="save-dialog-footer">
          <button
            className="save-dialog-btn save-dialog-btn-cancel"
            onClick={closeSaveDialog}
          >
            Cancel
          </button>
          <button
            className="save-dialog-btn save-dialog-btn-save"
            onClick={handleSave}
            disabled={!saveName.trim() || (!canCreateNew && !selectedSave)}
          >
            <span aria-hidden="true">💾</span>
            {selectedSave ? 'Overwrite' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
