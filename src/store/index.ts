/**
 * Store module exports
 */

import { useGameStore as _useGameStore } from './gameStore';

// Re-export useGameStore
export const useGameStore = _useGameStore;

// Expose to window for debugging in browser console
if (typeof window !== 'undefined') {
  (window as unknown as { useGameStore: typeof _useGameStore }).useGameStore = _useGameStore;
}

export { 
  INITIAL_BUDGET, 
  ZONE_COST, 
  ROAD_COST,
  POWER_PLANT_COST,
  POWER_PLANT_CAPACITY,
  POWER_LINE_COST,
  POWER_RANGE,
  WATER_PUMP_COST,
  WATER_PUMP_CAPACITY,
  WATER_PIPE_COST,
  WATER_RANGE,
  TAX_RATE_PER_PERSON,
  ROAD_MAINTENANCE_COST,
  POWER_PLANT_MAINTENANCE_COST,
  WATER_PUMP_MAINTENANCE_COST,
  type MonthlyBudgetBreakdown,
  type BudgetDeficitEvent,
  type SaveableGameState,
  type DemandState,
  type UnlockedFeatures,
  type DisasterEvent,
} from './gameStore';
export {
  useUIStore,
  TOOLS,
  getToolById,
  getToolsByCategory,
  type Tool,
  type ToolId,
  type GameSpeed,
  type OverlayType,
  type UIState,
  type UIActions,
  type UIStore,
  type NotificationType,
  type NotificationState,
} from './uiStore';
