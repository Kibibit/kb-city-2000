/**
 * SaveManager - Handles saving and loading game state to/from localStorage
 */

import type { Tile, PowerPlant, WaterPump, PoliceStation } from '@/types';
import type { DemandState, UnlockedFeatures } from '@/store/gameStore';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error codes for save/load operations
 */
export type SaveErrorCode =
  | 'CORRUPTED_JSON'
  | 'MISSING_FIELDS'
  | 'WRONG_VERSION'
  | 'STORAGE_FULL'
  | 'NOT_FOUND'
  | 'MAX_SLOTS_REACHED'
  | 'UNKNOWN_ERROR';

/**
 * Error messages for each error code
 */
export const SAVE_ERROR_MESSAGES: Record<SaveErrorCode, string> = {
  CORRUPTED_JSON: 'Save file is corrupted and cannot be loaded',
  MISSING_FIELDS: 'Save file is incomplete or damaged',
  WRONG_VERSION: 'Save file is from an incompatible version',
  STORAGE_FULL: 'Cannot save - browser storage is full',
  NOT_FOUND: 'Save file not found',
  MAX_SLOTS_REACHED: 'Maximum save slots reached',
  UNKNOWN_ERROR: 'An unexpected error occurred',
};

/**
 * Result type for save operations
 */
export interface SaveResult {
  success: boolean;
  error?: SaveErrorCode;
  errorMessage?: string;
}

/**
 * Result type for load operations
 */
export interface LoadResult {
  success: boolean;
  data?: SaveData;
  error?: SaveErrorCode;
  errorMessage?: string;
}

/**
 * Validation result for save data
 */
export interface ValidationResult {
  valid: boolean;
  error?: SaveErrorCode;
  errorMessage?: string;
}

// =============================================================================
// Types
// =============================================================================

/**
 * Complete save data structure
 */
export interface SaveData {
  /** Save format version for migration compatibility */
  version: string;
  /** User-provided save name */
  name: string;
  /** Timestamp when the save was created */
  timestamp: number;
  /** The actual game state */
  gameState: SavedGameState;
}

/**
 * Game state that gets saved
 */
export interface SavedGameState {
  /** 2D array of tiles */
  tiles: Tile[][];
  /** Power plants on the map */
  powerPlants: PowerPlant[];
  /** Water pumps on the map */
  waterPumps: WaterPump[];
  /** Police stations on the map */
  policeStations: PoliceStation[];
  /** Player's budget */
  budget: number;
  /** City population */
  population: number;
  /** Commercial jobs */
  commercialJobs: number;
  /** Industrial jobs */
  industrialJobs: number;
  /** Current game year */
  gameYear: number;
  /** Current game month */
  gameMonth: number;
  /** Demand values for zones */
  demand: DemandState;
  /** Population milestones reached */
  milestonesReached: number[];
  /** Unlocked features */
  unlockedFeatures: UnlockedFeatures;
}

/**
 * Metadata for save listing (doesn't include full state)
 */
export interface SaveMetadata {
  /** Unique key for this save in localStorage */
  key: string;
  /** User-provided save name */
  name: string;
  /** Timestamp when the save was created */
  timestamp: number;
  /** Save format version */
  version: string;
  /** Population at time of save */
  population: number;
  /** Budget at time of save */
  budget: number;
  /** Game year at time of save */
  gameYear: number;
  /** Game month at time of save */
  gameMonth: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Prefix for all save keys in localStorage */
const SAVE_KEY_PREFIX = 'simcity_save_';

/** Metadata index key for quick listing */
const SAVE_INDEX_KEY = 'simcity_save_index';

/** Current save format version */
export const SAVE_VERSION = '1.0.0';

/** Maximum number of save slots */
export const MAX_SAVE_SLOTS = 10;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique save key from a save name
 */
function generateSaveKey(name: string): string {
  // Sanitize name and create a slug
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 32);
  
  // Add timestamp for uniqueness
  const timestamp = Date.now();
  return `${SAVE_KEY_PREFIX}${slug}_${timestamp}`;
}

/**
 * Get the save index from localStorage
 */
function getSaveIndex(): string[] {
  try {
    const indexJson = localStorage.getItem(SAVE_INDEX_KEY);
    if (indexJson) {
      return JSON.parse(indexJson) as string[];
    }
  } catch (e) {
    console.error('Failed to parse save index:', e);
  }
  return [];
}

/**
 * Update the save index in localStorage
 */
function updateSaveIndex(keys: string[]): void {
  localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(keys));
}

/**
 * Check if a version is compatible with the current save version
 * For now, we only support exact version matches, but this can be extended
 * for migrations in the future.
 */
function isVersionCompatible(version: string): boolean {
  // Current policy: only accept the current version
  // In the future, we could support migrations from older versions
  return version === SAVE_VERSION;
}

/**
 * Validate save data structure and content
 * 
 * @param data - Unknown data to validate
 * @returns Validation result with error details if invalid
 */
export function validateSaveData(data: unknown): ValidationResult {
  // Check if data is an object
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      error: 'CORRUPTED_JSON',
      errorMessage: SAVE_ERROR_MESSAGES.CORRUPTED_JSON,
    };
  }

  const save = data as Record<string, unknown>;

  // Check version exists
  if (typeof save.version !== 'string') {
    return {
      valid: false,
      error: 'MISSING_FIELDS',
      errorMessage: SAVE_ERROR_MESSAGES.MISSING_FIELDS,
    };
  }

  // Check version compatibility
  if (!isVersionCompatible(save.version)) {
    return {
      valid: false,
      error: 'WRONG_VERSION',
      errorMessage: SAVE_ERROR_MESSAGES.WRONG_VERSION,
    };
  }

  // Check required top-level fields
  if (typeof save.name !== 'string' || typeof save.timestamp !== 'number') {
    return {
      valid: false,
      error: 'MISSING_FIELDS',
      errorMessage: SAVE_ERROR_MESSAGES.MISSING_FIELDS,
    };
  }

  // Check gameState exists and is an object
  if (!save.gameState || typeof save.gameState !== 'object') {
    return {
      valid: false,
      error: 'MISSING_FIELDS',
      errorMessage: SAVE_ERROR_MESSAGES.MISSING_FIELDS,
    };
  }

  const gameState = save.gameState as Record<string, unknown>;

  // Check required gameState fields
  const requiredFields = [
    'tiles',
    'powerPlants',
    'waterPumps',
    'budget',
    'population',
    'commercialJobs',
    'industrialJobs',
    'gameYear',
    'gameMonth',
    'demand',
    'milestonesReached',
    'unlockedFeatures',
  ];

  for (const field of requiredFields) {
    if (!(field in gameState)) {
      return {
        valid: false,
        error: 'MISSING_FIELDS',
        errorMessage: SAVE_ERROR_MESSAGES.MISSING_FIELDS,
      };
    }
  }

  // Check data types for critical fields
  if (!Array.isArray(gameState.tiles) || gameState.tiles.length === 0) {
    return {
      valid: false,
      error: 'MISSING_FIELDS',
      errorMessage: SAVE_ERROR_MESSAGES.MISSING_FIELDS,
    };
  }

  if (typeof gameState.budget !== 'number' || typeof gameState.population !== 'number') {
    return {
      valid: false,
      error: 'MISSING_FIELDS',
      errorMessage: SAVE_ERROR_MESSAGES.MISSING_FIELDS,
    };
  }

  if (!Array.isArray(gameState.powerPlants) || !Array.isArray(gameState.waterPumps)) {
    return {
      valid: false,
      error: 'MISSING_FIELDS',
      errorMessage: SAVE_ERROR_MESSAGES.MISSING_FIELDS,
    };
  }

  // policeStations is optional for backwards compatibility - default to empty array if missing
  if (gameState.policeStations !== undefined && !Array.isArray(gameState.policeStations)) {
    return {
      valid: false,
      error: 'MISSING_FIELDS',
      errorMessage: SAVE_ERROR_MESSAGES.MISSING_FIELDS,
    };
  }

  // All checks passed
  return { valid: true };
}

/**
 * Check if an error is a quota exceeded error
 */
function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException) {
    // Most browsers
    return error.name === 'QuotaExceededError' || error.code === 22;
  }
  // Older browsers may throw a different error
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('quota');
  }
  return false;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Save the game state to localStorage
 * 
 * @param name - User-provided name for this save
 * @param gameState - The game state to save
 * @param existingKey - Optional key to overwrite an existing save
 * @returns SaveResult with success status and error details if failed
 */
export function saveGame(
  name: string,
  gameState: SavedGameState,
  existingKey?: string
): SaveResult {
  try {
    // Create save data
    const saveData: SaveData = {
      version: SAVE_VERSION,
      name,
      timestamp: Date.now(),
      gameState,
    };

    // Serialize
    const saveJson = JSON.stringify(saveData);

    // Determine save key
    let saveKey: string;
    if (existingKey) {
      // Overwriting existing save
      saveKey = existingKey;
    } else {
      // Check slot limit
      const index = getSaveIndex();
      if (index.length >= MAX_SAVE_SLOTS) {
        console.error(`Maximum save slots (${MAX_SAVE_SLOTS}) reached`);
        return {
          success: false,
          error: 'MAX_SLOTS_REACHED',
          errorMessage: SAVE_ERROR_MESSAGES.MAX_SLOTS_REACHED,
        };
      }
      saveKey = generateSaveKey(name);
    }

    // Save to localStorage
    try {
      localStorage.setItem(saveKey, saveJson);
    } catch (storageError) {
      if (isQuotaExceededError(storageError)) {
        console.error('localStorage quota exceeded:', storageError);
        return {
          success: false,
          error: 'STORAGE_FULL',
          errorMessage: SAVE_ERROR_MESSAGES.STORAGE_FULL,
        };
      }
      throw storageError; // Re-throw for general error handling
    }

    // Update index
    const index = getSaveIndex();
    if (!index.includes(saveKey)) {
      index.push(saveKey);
      updateSaveIndex(index);
    }

    console.log(`Game saved: ${name} (${saveKey})`);
    return { success: true };
  } catch (e) {
    console.error('Failed to save game:', e);
    return {
      success: false,
      error: 'UNKNOWN_ERROR',
      errorMessage: SAVE_ERROR_MESSAGES.UNKNOWN_ERROR,
    };
  }
}

/**
 * Load a game save from localStorage
 * 
 * @param key - The save key to load
 * @returns LoadResult with success status, data, and error details if failed
 */
export function loadGame(key: string): LoadResult {
  try {
    // Try to get the save from localStorage
    const saveJson = localStorage.getItem(key);
    if (!saveJson) {
      console.error(`Save not found: ${key}`);
      return {
        success: false,
        error: 'NOT_FOUND',
        errorMessage: SAVE_ERROR_MESSAGES.NOT_FOUND,
      };
    }

    // Try to parse JSON
    let saveData: unknown;
    try {
      saveData = JSON.parse(saveJson);
    } catch (parseError) {
      console.error('Failed to parse save JSON:', parseError);
      return {
        success: false,
        error: 'CORRUPTED_JSON',
        errorMessage: SAVE_ERROR_MESSAGES.CORRUPTED_JSON,
      };
    }

    // Validate the save data structure
    const validation = validateSaveData(saveData);
    if (!validation.valid) {
      console.error(`Save validation failed: ${validation.error}`);
      return {
        success: false,
        error: validation.error ?? 'UNKNOWN_ERROR',
        errorMessage: validation.errorMessage ?? SAVE_ERROR_MESSAGES.UNKNOWN_ERROR,
      };
    }

    return {
      success: true,
      data: saveData as SaveData,
    };
  } catch (e) {
    console.error('Failed to load game:', e);
    return {
      success: false,
      error: 'UNKNOWN_ERROR',
      errorMessage: SAVE_ERROR_MESSAGES.UNKNOWN_ERROR,
    };
  }
}

/**
 * List all saved games with metadata
 * 
 * @returns Array of save metadata, sorted by timestamp (newest first)
 */
export function listSaves(): SaveMetadata[] {
  const index = getSaveIndex();
  const saves: SaveMetadata[] = [];

  for (const key of index) {
    try {
      const saveJson = localStorage.getItem(key);
      if (saveJson) {
        const saveData = JSON.parse(saveJson) as SaveData;
        saves.push({
          key,
          name: saveData.name,
          timestamp: saveData.timestamp,
          version: saveData.version,
          population: saveData.gameState.population,
          budget: saveData.gameState.budget,
          gameYear: saveData.gameState.gameYear,
          gameMonth: saveData.gameState.gameMonth,
        });
      }
    } catch (e) {
      console.error(`Failed to parse save ${key}:`, e);
    }
  }

  // Sort by timestamp, newest first
  saves.sort((a, b) => b.timestamp - a.timestamp);

  return saves;
}

/**
 * Delete a saved game
 * 
 * @param key - The save key to delete
 * @returns true if deleted, false if not found
 */
export function deleteSave(key: string): boolean {
  try {
    // Check if exists
    if (!localStorage.getItem(key)) {
      return false;
    }

    // Remove from localStorage
    localStorage.removeItem(key);

    // Update index
    const index = getSaveIndex();
    const newIndex = index.filter(k => k !== key);
    updateSaveIndex(newIndex);

    console.log(`Save deleted: ${key}`);
    return true;
  } catch (e) {
    console.error('Failed to delete save:', e);
    return false;
  }
}

/**
 * Check if a save name already exists
 * 
 * @param name - The save name to check
 * @returns true if a save with this name exists
 */
export function saveNameExists(name: string): boolean {
  const saves = listSaves();
  return saves.some(s => s.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get the number of save slots remaining
 * 
 * @returns Number of available slots
 */
export function getAvailableSlots(): number {
  const index = getSaveIndex();
  return MAX_SAVE_SLOTS - index.length;
}

/**
 * Format a timestamp for display
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date string
 */
export function formatSaveDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
