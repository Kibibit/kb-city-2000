/**
 * Zustand store for UI state management
 */

import { create } from 'zustand';

// =============================================================================
// Tool Types
// =============================================================================

/**
 * All available tool types in the game
 */
export type ToolId =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'residential-medium'
  | 'commercial-medium'
  | 'industrial-medium'
  | 'road'
  | 'powerLine'
  | 'waterPipe'
  | 'powerPlant'
  | 'waterPump'
  | 'policeStation'
  | 'bulldoze'
  | 'select';

/**
 * Tool definition with metadata
 */
export interface Tool {
  id: ToolId;
  label: string;
  icon: string;
  cost: number | 'FREE';
  shortcut: string;
  category: 'zones' | 'zones-medium' | 'infrastructure' | 'buildings' | 'actions';
  description: string;
  /** Whether this tool requires a feature unlock */
  requiresUnlock?: 'mediumDensity';
  /** Population required to unlock this tool */
  unlockPopulation?: number;
}

/**
 * All available tools
 */
export const TOOLS: Tool[] = [
  // Low Density Zones
  {
    id: 'residential',
    label: 'Residential',
    icon: '🏠',
    cost: 100,
    shortcut: 'R',
    category: 'zones',
    description: 'Place low density residential zones',
  },
  {
    id: 'commercial',
    label: 'Commercial',
    icon: '🏪',
    cost: 100,
    shortcut: 'C',
    category: 'zones',
    description: 'Place low density commercial zones',
  },
  {
    id: 'industrial',
    label: 'Industrial',
    icon: '🏭',
    cost: 100,
    shortcut: 'I',
    category: 'zones',
    description: 'Place low density industrial zones',
  },
  // Medium Density Zones
  {
    id: 'residential-medium',
    label: 'Res. Med',
    icon: '🏢',
    cost: 200,
    shortcut: 'Shift+R',
    category: 'zones-medium',
    description: 'Place medium density residential zones (2x capacity)',
    requiresUnlock: 'mediumDensity',
    unlockPopulation: 500,
  },
  {
    id: 'commercial-medium',
    label: 'Com. Med',
    icon: '🏬',
    cost: 200,
    shortcut: 'Shift+C',
    category: 'zones-medium',
    description: 'Place medium density commercial zones (2x capacity)',
    requiresUnlock: 'mediumDensity',
    unlockPopulation: 500,
  },
  {
    id: 'industrial-medium',
    label: 'Ind. Med',
    icon: '🏗️',
    cost: 200,
    shortcut: 'Shift+I',
    category: 'zones-medium',
    description: 'Place medium density industrial zones (2x capacity)',
    requiresUnlock: 'mediumDensity',
    unlockPopulation: 500,
  },
  // Infrastructure
  {
    id: 'road',
    label: 'Road',
    icon: '🛤️',
    cost: 10,
    shortcut: 'D',
    category: 'infrastructure',
    description: 'Place roads',
  },
  {
    id: 'powerLine',
    label: 'Power Line',
    icon: '⚡',
    cost: 5,
    shortcut: 'L',
    category: 'infrastructure',
    description: 'Connect power grid',
  },
  {
    id: 'waterPipe',
    label: 'Water Pipe',
    icon: '💧',
    cost: 5,
    shortcut: 'W',
    category: 'infrastructure',
    description: 'Connect water network',
  },
  // Buildings
  {
    id: 'powerPlant',
    label: 'Power Plant',
    icon: '🔌',
    cost: 5000,
    shortcut: 'P',
    category: 'buildings',
    description: 'Build coal power plant',
  },
  {
    id: 'waterPump',
    label: 'Water Pump',
    icon: '🚰',
    cost: 3000,
    shortcut: 'U',
    category: 'buildings',
    description: 'Build water pump',
  },
  {
    id: 'policeStation',
    label: 'Police Station',
    icon: '👮',
    cost: 500,
    shortcut: 'O',
    category: 'buildings',
    description: 'Police Station - Reduces crime in area',
  },
  // Actions
  {
    id: 'bulldoze',
    label: 'Bulldoze',
    icon: '🚜',
    cost: 5,
    shortcut: 'B',
    category: 'actions',
    description: 'Remove structures ($5 per tile)',
  },
  {
    id: 'select',
    label: 'Select',
    icon: '👆',
    cost: 'FREE',
    shortcut: 'Escape',
    category: 'actions',
    description: 'View info, no action',
  },
];

// =============================================================================
// Game Speed Types
// =============================================================================

/**
 * Available game speed options
 */
export type GameSpeed = 'paused' | 'normal' | 'fast';

// =============================================================================
// Notification Types
// =============================================================================

/**
 * Notification type for different message categories
 */
export type NotificationType = 'milestone' | 'warning' | 'info' | 'error' | 'disaster';

/**
 * Notification state for displaying messages to the player
 */
export interface NotificationState {
  /** Message to display */
  message: string;
  /** Type of notification */
  type: NotificationType;
  /** Optional subtitle/secondary message */
  subtitle?: string;
}

// =============================================================================
// Tooltip Types
// =============================================================================

import type { ZoneType } from '@/types';

/**
 * Tooltip info for zone tiles
 */
export interface ZoneTooltipInfo {
  /** Grid X position */
  gridX: number;
  /** Grid Y position */
  gridY: number;
  /** Screen X position for tooltip placement */
  screenX: number;
  /** Screen Y position for tooltip placement */
  screenY: number;
  /** Zone type */
  zoneType: ZoneType;
  /** Whether the zone has road access */
  hasRoadAccess: boolean;
  /** Whether the zone has power */
  hasPower: boolean;
  /** Whether the zone has water service */
  hasWater: boolean;
  /** Crime level for this tile (0-100) */
  crimeLevel: number;
  /** Whether this tile has police coverage */
  hasPoliceCoverage: boolean;
  /** Pollution level for this tile (0-100) */
  pollutionLevel: number;
  /** Whether the building is abandoned */
  isAbandoned?: boolean;
  /** Reason for abandonment (if abandoned) */
  abandonmentReason?: 'no_power' | 'no_water' | 'high_crime' | 'high_pollution';
  /** Development progress (0-100) */
  developmentProgress?: number;
}

// =============================================================================
// Store Types
// =============================================================================

/**
 * Types of data overlays that can be shown on the map
 */
export type OverlayType = 'none' | 'power' | 'water' | 'traffic' | 'landValue' | 'crime' | 'pollution';

export interface UIState {
  /** Whether the game has started (splash screen dismissed) */
  hasGameStarted: boolean;
  /** Currently selected tool */
  selectedTool: Tool | null;
  /** Current game speed */
  gameSpeed: GameSpeed;
  /** Whether the game is paused (derived from gameSpeed) */
  isPaused: boolean;
  /** Previous game speed (for toggling pause) */
  previousSpeed: GameSpeed;
  /** Current tooltip info (null if no tooltip should show) */
  tooltipInfo: ZoneTooltipInfo | null;
  /** Currently active data overlay */
  activeOverlay: OverlayType;
  /** Current notification (null if none) */
  notification: NotificationState | null;
  /** Whether the save dialog is open */
  isSaveDialogOpen: boolean;
  /** Whether the load dialog is open */
  isLoadDialogOpen: boolean;
  /** Whether the settings dialog is open */
  isSettingsDialogOpen: boolean;
  /** Whether screen shake effect is active (for earthquake) */
  isScreenShaking: boolean;
  /** Counter to force animation re-trigger */
  screenShakeKey: number;
  /** Whether screensaver mode is active */
  isScreensaverMode: boolean;
}

export interface UIActions {
  /** Start the game (dismiss splash screen) */
  startGame: () => void;
  /** Set the currently selected tool */
  setTool: (toolId: ToolId | null) => void;
  /** Set the game speed */
  setGameSpeed: (speed: GameSpeed) => void;
  /** Toggle pause state */
  togglePause: () => void;
  /** Set tooltip info for zone hover */
  setTooltipInfo: (info: ZoneTooltipInfo | null) => void;
  /** Set the active data overlay */
  setOverlay: (overlay: OverlayType) => void;
  /** Toggle a specific overlay (or turn off if already active) */
  toggleOverlay: (overlay: OverlayType) => void;
  /** Show a notification */
  showNotification: (message: string, type: NotificationType, subtitle?: string) => void;
  /** Clear the current notification */
  clearNotification: () => void;
  /** Open the save dialog */
  openSaveDialog: () => void;
  /** Close the save dialog */
  closeSaveDialog: () => void;
  /** Open the load dialog */
  openLoadDialog: () => void;
  /** Close the load dialog */
  closeLoadDialog: () => void;
  /** Open the settings dialog */
  openSettingsDialog: () => void;
  /** Close the settings dialog */
  closeSettingsDialog: () => void;
  /** Trigger screen shake effect (for earthquake) */
  triggerScreenShake: (duration?: number) => void;
  /** Start screensaver mode */
  startScreensaver: () => void;
  /** Exit screensaver mode back to splash screen */
  exitScreensaver: () => void;
}

export type UIStore = UIState & UIActions;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get a tool by its ID
 */
export function getToolById(toolId: ToolId): Tool | undefined {
  return TOOLS.find((t) => t.id === toolId);
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: Tool['category']): Tool[] {
  return TOOLS.filter((t) => t.category === category);
}

// =============================================================================
// Store Definition
// =============================================================================

export const useUIStore = create<UIStore>((set, get) => ({
  // Initial state
  hasGameStarted: false,
  selectedTool: null,
  gameSpeed: 'normal',
  isPaused: false,
  previousSpeed: 'normal',
  tooltipInfo: null,
  activeOverlay: 'none',
  notification: null,
  isSaveDialogOpen: false,
  isLoadDialogOpen: false,
  isSettingsDialogOpen: false,
  isScreenShaking: false,
  screenShakeKey: 0,
  isScreensaverMode: false,

  // Actions
  startGame: () => {
    set({ hasGameStarted: true });
  },

  setTool: (toolId: ToolId | null) => {
    if (toolId === null) {
      set({ selectedTool: null });
    } else {
      const tool = getToolById(toolId);
      set({ selectedTool: tool ?? null });
    }
  },

  setGameSpeed: (speed: GameSpeed) => {
    const { gameSpeed: currentSpeed } = get();
    // Remember the previous non-paused speed
    if (speed === 'paused' && currentSpeed !== 'paused') {
      set({
        gameSpeed: speed,
        isPaused: true,
        previousSpeed: currentSpeed,
      });
    } else {
      set({
        gameSpeed: speed,
        isPaused: speed === 'paused',
      });
    }
  },

  togglePause: () => {
    const { isPaused, previousSpeed } = get();
    if (isPaused) {
      // Resume to previous speed
      set({ gameSpeed: previousSpeed, isPaused: false });
    } else {
      // Pause the game and remember current speed
      const { gameSpeed: currentSpeed } = get();
      set({ gameSpeed: 'paused', isPaused: true, previousSpeed: currentSpeed });
    }
  },
  
  setTooltipInfo: (info: ZoneTooltipInfo | null) => {
    set({ tooltipInfo: info });
  },
  
  setOverlay: (overlay: OverlayType) => {
    set({ activeOverlay: overlay });
  },
  
  toggleOverlay: (overlay: OverlayType) => {
    const { activeOverlay } = get();
    if (activeOverlay === overlay) {
      set({ activeOverlay: 'none' });
    } else {
      set({ activeOverlay: overlay });
    }
  },
  
  showNotification: (message: string, type: NotificationType, subtitle?: string) => {
    const notification: NotificationState = { message, type };
    if (subtitle !== undefined) {
      notification.subtitle = subtitle;
    }
    set({ notification });
  },
  
  clearNotification: () => {
    set({ notification: null });
  },
  
  openSaveDialog: () => {
    set({ isSaveDialogOpen: true });
  },
  
  closeSaveDialog: () => {
    set({ isSaveDialogOpen: false });
  },
  
  openLoadDialog: () => {
    set({ isLoadDialogOpen: true });
  },
  
  closeLoadDialog: () => {
    set({ isLoadDialogOpen: false });
  },
  
  openSettingsDialog: () => {
    set({ isSettingsDialogOpen: true });
  },
  
  closeSettingsDialog: () => {
    set({ isSettingsDialogOpen: false });
  },
  
  triggerScreenShake: (duration: number = 500) => {
    // Increment key to force animation re-trigger even if already shaking
    const currentKey = get().screenShakeKey;
    set({ isScreenShaking: true, screenShakeKey: currentKey + 1 });
    setTimeout(() => {
      set({ isScreenShaking: false });
    }, duration);
  },
  
  startScreensaver: () => {
    set({ 
      isScreensaverMode: true, 
      hasGameStarted: true,
      gameSpeed: 'fast',
      isPaused: false,
      selectedTool: null,
    });
  },
  
  exitScreensaver: () => {
    set({ 
      isScreensaverMode: false, 
      hasGameStarted: false,
      gameSpeed: 'normal',
    });
  },
}));
