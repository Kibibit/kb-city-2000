/**
 * Utils module exports
 */

export {
  saveGame,
  loadGame,
  listSaves,
  deleteSave,
  saveNameExists,
  getAvailableSlots,
  formatSaveDate,
  validateSaveData,
  SAVE_VERSION,
  MAX_SAVE_SLOTS,
  SAVE_ERROR_MESSAGES,
  type SaveData,
  type SavedGameState,
  type SaveMetadata,
  type SaveResult,
  type LoadResult,
  type ValidationResult,
  type SaveErrorCode,
} from './SaveManager';

export { audioManager, type SoundEffectName } from './AudioManager';
