/**
 * Toolbar Component
 *
 * Displays tool buttons organized by category.
 * Supports keyboard shortcuts for tool selection.
 */

import { useEffect, useCallback } from 'react';
import { useUIStore, getToolsByCategory, type Tool, type ToolId, type OverlayType } from '@/store';
import { useGameStore } from '@/store';
import { listSaves, audioManager } from '@/utils';
import './Toolbar.css';

/**
 * Overlay button definitions
 */
interface OverlayButton {
  id: OverlayType;
  label: string;
  icon: string;
  shortcut: string;
}

const OVERLAY_BUTTONS: OverlayButton[] = [
  { id: 'power', label: 'Power', icon: '⚡', shortcut: '1' },
  { id: 'water', label: 'Water', icon: '💧', shortcut: '2' },
  { id: 'crime', label: 'Crime', icon: '🚨', shortcut: '3' },
  { id: 'pollution', label: 'Pollution', icon: '🏭', shortcut: '4' },
];

/**
 * Tool button component
 */
interface ToolButtonProps {
  tool: Tool;
  isActive: boolean;
  disabled?: boolean;
  locked?: boolean;
  unlockPopulation?: number | undefined;
  onClick: (toolId: ToolId) => void;
}

function ToolButton({ tool, isActive, disabled = false, locked = false, unlockPopulation, onClick }: ToolButtonProps) {
  const handleClick = () => {
    if (!disabled && !locked) {
      audioManager.playSound('ui_click');
      onClick(tool.id);
    }
  };

  const isDisabledOrLocked = disabled || locked;

  return (
    <button
      className={`toolbar-button ${isActive ? 'active' : ''} ${locked ? 'locked' : ''}`}
      disabled={isDisabledOrLocked}
      onClick={handleClick}
      title={locked ? `Unlock at ${unlockPopulation} pop` : `${tool.label} (${tool.shortcut})`}
      aria-label={tool.label}
    >
      <span className="toolbar-button-shortcut">{tool.shortcut}</span>
      <span className="toolbar-button-icon">{tool.icon}</span>
      {locked ? (
        <span className="toolbar-button-locked">🔒 {unlockPopulation}</span>
      ) : (
        <span className="toolbar-button-cost">
          {tool.cost === 'FREE' ? 'FREE' : `$${tool.cost.toLocaleString()}`}
        </span>
      )}
    </button>
  );
}

/**
 * Tool category section
 */
interface ToolCategoryProps {
  label: string;
  category: Tool['category'];
  selectedToolId: ToolId | null;
  onSelectTool: (toolId: ToolId) => void;
  unlockedFeatures: { mediumDensity: boolean };
}

function ToolCategory({ label, category, selectedToolId, onSelectTool, unlockedFeatures }: ToolCategoryProps) {
  const tools = getToolsByCategory(category);

  return (
    <div className="toolbar-category">
      <span className="toolbar-category-label">{label}</span>
      <div className="toolbar-buttons">
        {tools.map((tool) => {
          const isLocked = tool.requiresUnlock === 'mediumDensity' && !unlockedFeatures.mediumDensity;
          return (
            <ToolButton
              key={tool.id}
              tool={tool}
              isActive={selectedToolId === tool.id}
              locked={isLocked}
              unlockPopulation={tool.unlockPopulation}
              onClick={onSelectTool}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Map of keyboard shortcuts to tool IDs (non-shift keys)
 */
const SHORTCUT_TO_TOOL: Record<string, ToolId | null> = {
  'r': 'residential',
  'c': 'commercial',
  'i': 'industrial',
  'd': 'road',
  'l': 'powerLine',
  'w': 'waterPipe',
  'p': 'powerPlant',
  'u': 'waterPump',
  'o': 'policeStation',
  'b': 'bulldoze',
  'escape': null, // Deselect tool
};

/**
 * Map of number key shortcuts to overlay types
 */
const SHORTCUT_TO_OVERLAY: Record<string, OverlayType> = {
  '1': 'power',
  '2': 'water',
  '3': 'crime',
  '4': 'pollution',
};

/**
 * Map of Shift+key shortcuts to medium density tool IDs
 */
const SHIFT_SHORTCUT_TO_TOOL: Record<string, ToolId> = {
  'r': 'residential-medium',
  'c': 'commercial-medium',
  'i': 'industrial-medium',
};

/**
 * Main Toolbar component
 */
export function Toolbar() {
  const selectedTool = useUIStore((state) => state.selectedTool);
  const setTool = useUIStore((state) => state.setTool);
  const activeOverlay = useUIStore((state) => state.activeOverlay);
  const toggleOverlay = useUIStore((state) => state.toggleOverlay);
  const openSaveDialog = useUIStore((state) => state.openSaveDialog);
  const openLoadDialog = useUIStore((state) => state.openLoadDialog);
  const openSettingsDialog = useUIStore((state) => state.openSettingsDialog);
  const unlockedFeatures = useGameStore((state) => state.unlockedFeatures);

  const selectedToolId = selectedTool?.id ?? null;
  const hasSaves = listSaves().length > 0;

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input element
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const key = e.key.toLowerCase();
    
    // Handle Ctrl+S / Cmd+S for save
    if ((e.ctrlKey || e.metaKey) && key === 's') {
      e.preventDefault();
      openSaveDialog();
      return;
    }
    
    // Handle Ctrl+O / Cmd+O for load
    if ((e.ctrlKey || e.metaKey) && key === 'o') {
      e.preventDefault();
      openLoadDialog();
      return;
    }
    
    // Handle number keys for overlay toggling
    if (key in SHORTCUT_TO_OVERLAY) {
      const overlay = SHORTCUT_TO_OVERLAY[key];
      if (overlay) {
        toggleOverlay(overlay);
        return;
      }
    }
    
    // Handle Shift+key for medium density zones
    if (e.shiftKey && Object.prototype.hasOwnProperty.call(SHIFT_SHORTCUT_TO_TOOL, key)) {
      // Only allow if medium density is unlocked
      if (unlockedFeatures.mediumDensity) {
        const toolId = SHIFT_SHORTCUT_TO_TOOL[key as keyof typeof SHIFT_SHORTCUT_TO_TOOL] as ToolId;
        setTool(toolId);
      }
      return;
    }
    
    if (Object.prototype.hasOwnProperty.call(SHORTCUT_TO_TOOL, key)) {
      const toolId = SHORTCUT_TO_TOOL[key as keyof typeof SHORTCUT_TO_TOOL];
      // toolId can be ToolId or null (for Escape), which is valid for setTool
      setTool(toolId ?? null);
    }
  }, [setTool, toggleOverlay, unlockedFeatures.mediumDensity, openSaveDialog, openLoadDialog]);

  // Set up keyboard event listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className="toolbar" role="toolbar" aria-label="Game tools">
      <ToolCategory
        label="Low Density"
        category="zones"
        selectedToolId={selectedToolId}
        onSelectTool={setTool}
        unlockedFeatures={unlockedFeatures}
      />
      <ToolCategory
        label="Med Density"
        category="zones-medium"
        selectedToolId={selectedToolId}
        onSelectTool={setTool}
        unlockedFeatures={unlockedFeatures}
      />
      <ToolCategory
        label="Infrastructure"
        category="infrastructure"
        selectedToolId={selectedToolId}
        onSelectTool={setTool}
        unlockedFeatures={unlockedFeatures}
      />
      <ToolCategory
        label="Buildings"
        category="buildings"
        selectedToolId={selectedToolId}
        onSelectTool={setTool}
        unlockedFeatures={unlockedFeatures}
      />
      <ToolCategory
        label="Actions"
        category="actions"
        selectedToolId={selectedToolId}
        onSelectTool={setTool}
        unlockedFeatures={unlockedFeatures}
      />
      
      {/* Overlays section */}
      <div className="toolbar-category toolbar-category-overlays">
        <span className="toolbar-category-label">Overlays</span>
        <div className="toolbar-buttons">
          {OVERLAY_BUTTONS.map((overlay) => (
            <button
              key={overlay.id}
              className={`toolbar-button toolbar-button-overlay ${activeOverlay === overlay.id ? 'active' : ''}`}
              onClick={() => {
                audioManager.playSound('ui_click');
                toggleOverlay(overlay.id);
              }}
              title={`${overlay.label} Overlay (${overlay.shortcut})`}
              aria-label={`${overlay.label} Overlay`}
              aria-pressed={activeOverlay === overlay.id}
            >
              <span className="toolbar-button-shortcut">{overlay.shortcut}</span>
              <span className="toolbar-button-icon">{overlay.icon}</span>
              <span className="toolbar-button-cost">{overlay.label}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Save/Load section */}
      <div className="toolbar-category">
        <span className="toolbar-category-label">Game</span>
        <div className="toolbar-buttons">
          <button
            className="toolbar-button"
            onClick={() => {
              audioManager.playSound('ui_click');
              openSaveDialog();
            }}
            title="Save Game (Ctrl+S)"
            aria-label="Save Game"
          >
            <span className="toolbar-button-shortcut">⌘S</span>
            <span className="toolbar-button-icon">💾</span>
            <span className="toolbar-button-cost">Save</span>
          </button>
          <button
            className={`toolbar-button ${!hasSaves ? 'disabled-no-saves' : ''}`}
            onClick={() => {
              audioManager.playSound('ui_click');
              openLoadDialog();
            }}
            title="Load Game (Ctrl+O)"
            aria-label="Load Game"
          >
            <span className="toolbar-button-shortcut">⌘O</span>
            <span className="toolbar-button-icon">📂</span>
            <span className="toolbar-button-cost">Load</span>
          </button>
          <button
            className="toolbar-button"
            onClick={() => {
              audioManager.playSound('ui_click');
              openSettingsDialog();
            }}
            title="Settings"
            aria-label="Settings"
          >
            <span className="toolbar-button-shortcut"></span>
            <span className="toolbar-button-icon">⚙️</span>
            <span className="toolbar-button-cost">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
