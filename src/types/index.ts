/**
 * Core type definitions for the SimCity browser game
 */

// =============================================================================
// Disaster Types (re-exported from systems)
// =============================================================================

// Note: Disaster types are defined in systems/DisasterSystem.ts
// Re-export for convenience
export type { DisasterType, ActiveDisaster, DisasterDamage } from '@/systems/DisasterSystem';

// =============================================================================
// Terrain & Tile Types
// =============================================================================

/**
 * Types of terrain that can exist on a tile
 */
export type TerrainType = 'grass' | 'water';

/**
 * Types of zones that can be placed on tiles
 */
export type ZoneType = 'residential' | 'commercial' | 'industrial';

/**
 * Density level for zones
 */
export type ZoneDensity = 'low' | 'medium';

/**
 * Types of tiles (terrain or developed)
 */
export type TileType = TerrainType | ZoneType | 'road' | 'power_line' | 'water_pipe';

/**
 * Represents a single tile on the game map
 */
export interface Tile {
  /** X position in grid coordinates */
  x: number;
  /** Y position in grid coordinates */
  y: number;
  /** The type of terrain on this tile */
  terrain: TerrainType;
  /** Zone placed on this tile, if any */
  zone: ZoneType | null;
  /** Density level of the zone (low or medium) */
  zoneDensity?: ZoneDensity;
  /** Whether this tile has a road */
  hasRoad: boolean;
  /** Whether this tile has a power line */
  hasPowerLine: boolean;
  /** Whether this tile has a water pipe */
  hasWaterPipe: boolean;
  /** Whether this tile is powered */
  isPowered: boolean;
  /** Whether this tile has water service */
  hasWaterService: boolean;
  /** Land value (0-100) */
  landValue: number;
  /** Development progress for zones (0-100, 100 = fully developed) */
  developmentProgress: number;
  /** Population for residential zones (when developed) */
  population: number;
  /** Jobs for commercial/industrial zones (when developed) */
  jobs: number;
  /** Whether this building is abandoned */
  isAbandoned?: boolean;
  /** Consecutive months without power (for abandonment tracking) */
  monthsWithoutPower?: number;
  /** Consecutive months without water (for abandonment tracking) */
  monthsWithoutWater?: number;
  /** Consecutive months with high crime >80 (for abandonment tracking) */
  monthsWithHighCrime?: number;
  /** Consecutive months with high pollution >80 - residential only (for abandonment tracking) */
  monthsWithHighPollution?: number;
  /** Reason for abandonment, if abandoned */
  abandonmentReason?: 'no_power' | 'no_water' | 'high_crime' | 'high_pollution';
}

// =============================================================================
// Power Infrastructure Types
// =============================================================================

/**
 * Represents a power plant on the map
 */
export interface PowerPlant {
  /** X position in grid coordinates */
  x: number;
  /** Y position in grid coordinates */
  y: number;
  /** Maximum power capacity in MW */
  capacity: number;
  /** Current power output in MW */
  output: number;
}

/**
 * Power grid node for tracking power distribution
 */
export interface PowerGridNode {
  /** Whether this tile has power */
  hasPower: boolean;
  /** Source of power (power plant position), null if no power */
  powerSource: { x: number; y: number } | null;
}

// =============================================================================
// Water Infrastructure Types
// =============================================================================

/**
 * Represents a water pump on the map
 */
export interface WaterPump {
  /** X position in grid coordinates */
  x: number;
  /** Y position in grid coordinates */
  y: number;
  /** Maximum water capacity in gallons/day */
  capacity: number;
}

// =============================================================================
// Police Infrastructure Types
// =============================================================================

/**
 * Represents a police station on the map
 */
export interface PoliceStation {
  /** Unique identifier */
  id: string;
  /** Position in grid coordinates */
  position: GridPosition;
}

// =============================================================================
// Coordinate Types
// =============================================================================

/**
 * Position in grid/tile coordinates (0 to MAP_SIZE-1)
 */
export interface GridPosition {
  /** X coordinate in grid space (tile index) */
  gridX: number;
  /** Y coordinate in grid space (tile index) */
  gridY: number;
}

/**
 * Position in screen/pixel coordinates
 */
export interface ScreenPosition {
  /** X coordinate in screen pixels */
  screenX: number;
  /** Y coordinate in screen pixels */
  screenY: number;
}

// =============================================================================
// Camera & Viewport Types
// =============================================================================

/**
 * Camera state for rendering the game world
 */
export interface Camera {
  /** World X position (top-left corner) */
  x: number;
  /** World Y position (top-left corner) */
  y: number;
  /** Zoom level (0.3 to 2.0) */
  zoom: number;
}

/**
 * Viewport dimensions in CSS pixels
 */
export interface Viewport {
  /** Viewport width in pixels */
  width: number;
  /** Viewport height in pixels */
  height: number;
}

/**
 * Bounds of visible tiles for viewport culling
 */
export interface VisibleBounds {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// =============================================================================
// Game Constants
// =============================================================================

/** Size of each tile in pixels (base, before zoom) */
export const TILE_SIZE = 32;

/** Map dimensions (50x50 grid for MVP) */
export const MAP_SIZE = 50;

/** Minimum zoom level (allows map to be ~30% of viewport size) */
export const MIN_ZOOM = 0.3;

/** Maximum zoom level */
export const MAX_ZOOM = 2.0;

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Canvas configuration for DPR scaling
 */
export interface CanvasConfig {
  /** Base canvas width before DPR scaling */
  baseWidth: number;
  /** Base canvas height before DPR scaling */
  baseHeight: number;
  /** Device pixel ratio for sharp rendering */
  dpr: number;
  /** Actual canvas buffer width */
  bufferWidth: number;
  /** Actual canvas buffer height */
  bufferHeight: number;
}

// =============================================================================
// Color Constants (aligned with design-system.md)
// =============================================================================

/**
 * Colors used for rendering terrain
 */
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  grass: '#4A7C31', // Meadow Green
  water: '#2563EB', // Ocean Blue
};

/**
 * Extended terrain color palette for depth and variation
 */
export const TERRAIN_COLOR_VARIANTS = {
  grass: {
    base: '#4A7C31',    // Meadow Green - primary grass
    light: '#5D9B3E',   // Spring Green - highlighted tiles
    dark: '#3A6225',    // Forest Green - shading/depth
    accent: '#6BB848',  // Fresh Grass - newly placed zones
  },
  water: {
    base: '#2563EB',    // Ocean Blue - primary water
    light: '#3B82F6',   // Shimmer Blue - wave highlights
    dark: '#1D4ED8',    // Deep Blue - water depth
    accent: '#0EA5E9',  // Coastal Cyan - shoreline
  },
} as const;

/**
 * Colors used for zone highlights (tile overlays)
 */
export const ZONE_COLORS: Record<ZoneType, string> = {
  residential: 'rgba(144, 238, 144, 0.4)', // Residential Green overlay
  commercial: 'rgba(100, 149, 237, 0.4)',  // Commercial Blue overlay
  industrial: 'rgba(255, 215, 0, 0.4)',    // Industrial Gold overlay
};

/**
 * Extended zone color palette for UI elements
 */
export const ZONE_COLOR_VARIANTS = {
  residential: {
    primary: '#90EE90',   // Residential Green - labels, demand bars
    light: '#B8F5B8',     // Residential Light - hover highlights
    medium: '#66D966',    // Residential Medium - active indicator
    dark: '#2E7D32',      // Residential Dark - gradient endpoints
    overlay: 'rgba(144, 238, 144, 0.4)',
    border: 'rgba(144, 238, 144, 0.8)',
  },
  commercial: {
    primary: '#6495ED',   // Commercial Blue - labels, demand bars
    light: '#93B8F5',     // Commercial Light - hover highlights
    medium: '#4A7DD9',    // Commercial Medium - active indicator
    dark: '#1565C0',      // Commercial Dark - gradient endpoints
    overlay: 'rgba(100, 149, 237, 0.4)',
    border: 'rgba(100, 149, 237, 0.8)',
  },
  industrial: {
    primary: '#FFD700',   // Industrial Gold - labels, demand bars
    light: '#FFE44D',     // Industrial Light - hover highlights
    medium: '#E6C200',    // Industrial Medium - active indicator
    dark: '#F57C00',      // Industrial Dark - gradient endpoints
    overlay: 'rgba(255, 215, 0, 0.4)',
    border: 'rgba(255, 215, 0, 0.8)',
  },
} as const;

/**
 * Overlay colors for power grid visualization
 */
export const OVERLAY_COLORS_POWER = {
  connected: 'rgba(76, 175, 80, 0.5)',    // Power On - powered tiles
  disconnected: 'rgba(244, 67, 54, 0.5)', // Power Off - unpowered tiles
  source: 'rgba(139, 195, 74, 0.6)',      // Power Source - power plants
} as const;

/**
 * Overlay colors for water service visualization
 */
export const OVERLAY_COLORS_WATER = {
  connected: 'rgba(33, 150, 243, 0.5)',   // Water On - serviced tiles
  disconnected: 'rgba(244, 67, 54, 0.5)', // Water Off - unserviced tiles
  source: 'rgba(3, 169, 244, 0.6)',       // Water Source - water pumps
} as const;

/**
 * Overlay colors for traffic density visualization (gradient)
 */
export const OVERLAY_COLORS_TRAFFIC = {
  low: 'rgba(76, 175, 80, 0.5)',     // Traffic Clear (0-33%)
  medium: 'rgba(255, 152, 0, 0.5)', // Traffic Moderate (34-66%)
  high: 'rgba(244, 67, 54, 0.5)',   // Traffic Heavy (67-100%)
} as const;

/**
 * Overlay colors for land value visualization (gradient)
 */
export const OVERLAY_COLORS_LAND_VALUE = {
  low: 'rgba(244, 67, 54, 0.5)',    // Value Low (0-25)
  fair: 'rgba(255, 152, 0, 0.5)',   // Value Fair (26-50)
  good: 'rgba(255, 235, 59, 0.5)', // Value Good (51-75)
  high: 'rgba(76, 175, 80, 0.5)',   // Value Premium (76-100)
} as const;

/**
 * Overlay colors for crime visualization (gradient)
 * Red = high crime, Green = low crime
 */
export const OVERLAY_COLORS_CRIME = {
  none: 'rgba(76, 175, 80, 0.5)',     // No crime (0)
  low: 'rgba(139, 195, 74, 0.5)',     // Low crime (1-25)
  medium: 'rgba(255, 235, 59, 0.5)', // Medium crime (26-50)
  high: 'rgba(255, 152, 0, 0.5)',    // High crime (51-75)
  extreme: 'rgba(244, 67, 54, 0.5)', // Extreme crime (76-100)
  protected: 'rgba(33, 150, 243, 0.5)', // Police protection indicator
} as const;

/**
 * Overlay colors for pollution visualization (gradient)
 * Brown/gray = polluted, Green = clean
 */
export const OVERLAY_COLORS_POLLUTION = {
  none: 'rgba(76, 175, 80, 0.5)',     // No pollution (0)
  low: 'rgba(139, 195, 74, 0.4)',     // Low pollution (1-25)
  medium: 'rgba(139, 119, 101, 0.5)', // Medium pollution (26-50) - brown
  high: 'rgba(107, 84, 63, 0.6)',     // High pollution (51-75) - darker brown
  extreme: 'rgba(79, 61, 46, 0.7)',   // Extreme pollution (76-100) - dark brown/gray
  source: 'rgba(89, 71, 56, 0.8)',    // Pollution source - industrial zones
} as const;

/**
 * Infrastructure colors for roads, power lines, and pipes
 */
export const INFRASTRUCTURE_COLORS = {
  road: {
    surface: '#4A4A4A',   // Asphalt Gray
    marking: '#D4D4D4',   // Line White
  },
  powerLine: {
    cable: '#6B6B6B',     // Wire Gray
    pole: '#8B4513',      // Pole Brown
  },
  waterPipe: '#1976D2',   // Pipe Blue
} as const;

/**
 * Status colors for UI feedback
 */
export const STATUS_COLORS = {
  success: {
    base: '#4CAF50',      // Growth Green
    light: '#66BB6A',
    dark: '#388E3C',
    background: 'rgba(76, 175, 80, 0.15)',
  },
  warning: {
    base: '#FF9800',      // Alert Amber
    light: '#FFB74D',
    dark: '#F57C00',
    background: 'rgba(255, 152, 0, 0.15)',
  },
  error: {
    base: '#F44336',      // Danger Red
    light: '#EF5350',
    dark: '#D32F2F',
    background: 'rgba(244, 67, 54, 0.15)',
  },
  info: {
    base: '#2196F3',      // Info Blue
    light: '#42A5F5',
    dark: '#1976D2',
    background: 'rgba(33, 150, 243, 0.15)',
  },
} as const;

/**
 * Brand colors for primary UI accents
 */
export const BRAND_COLORS = {
  primary: '#4A90D9',       // Civic Blue - CTAs, selected states
  primaryHover: '#5A9FE9',  // Civic Blue Light
  primaryActive: '#3A80C9', // Civic Blue Dark
  accent: '#FFB84D',        // Achievement Gold - milestones
} as const;
