import type { GridPosition, ScreenPosition, Camera, VisibleBounds, Viewport } from '../types';
import { TILE_SIZE, MAP_SIZE } from '../types';

/**
 * Convert grid coordinates to screen coordinates
 * @param grid - Position in grid/tile coordinates
 * @param camera - Current camera state
 * @returns Position in screen pixels
 */
export function gridToScreen(grid: GridPosition, camera: Camera): ScreenPosition {
  return {
    screenX: (grid.gridX * TILE_SIZE - camera.x) * camera.zoom,
    screenY: (grid.gridY * TILE_SIZE - camera.y) * camera.zoom,
  };
}

/**
 * Convert screen coordinates to grid coordinates
 * @param screen - Position in screen pixels
 * @param camera - Current camera state
 * @returns Position in grid/tile coordinates (floored to tile index)
 */
export function screenToGrid(screen: ScreenPosition, camera: Camera): GridPosition {
  return {
    gridX: Math.floor((screen.screenX / camera.zoom + camera.x) / TILE_SIZE),
    gridY: Math.floor((screen.screenY / camera.zoom + camera.y) / TILE_SIZE),
  };
}

/**
 * Check if a grid coordinate is within the map bounds
 * @param grid - Position to check
 * @returns True if the position is valid
 */
export function isValidGridCoord(grid: GridPosition): boolean {
  return (
    grid.gridX >= 0 &&
    grid.gridX < MAP_SIZE &&
    grid.gridY >= 0 &&
    grid.gridY < MAP_SIZE
  );
}

/**
 * Calculate which tiles are visible in the current viewport
 * Returns inclusive bounds for tile iteration
 * @param camera - Current camera state
 * @param viewport - Viewport dimensions
 * @returns Bounds object with start/end tile indices
 */
export function getVisibleTileBounds(camera: Camera, viewport: Viewport): VisibleBounds {
  // Add 1 tile padding for smooth scrolling
  const padding = 1;
  
  const startX = Math.floor(camera.x / TILE_SIZE) - padding;
  const startY = Math.floor(camera.y / TILE_SIZE) - padding;
  const endX = Math.ceil((camera.x + viewport.width / camera.zoom) / TILE_SIZE) + padding;
  const endY = Math.ceil((camera.y + viewport.height / camera.zoom) / TILE_SIZE) + padding;

  return {
    startX: Math.max(0, startX),
    startY: Math.max(0, startY),
    endX: Math.min(MAP_SIZE - 1, endX),
    endY: Math.min(MAP_SIZE - 1, endY),
  };
}

/**
 * Get total visible tile count for performance monitoring
 * @param bounds - Visible tile bounds
 * @returns Number of tiles in the visible area
 */
export function getVisibleTileCount(bounds: VisibleBounds): number {
  return (bounds.endX - bounds.startX + 1) * (bounds.endY - bounds.startY + 1);
}

/**
 * Get the scaled tile size based on current zoom level
 * @param camera - Current camera state
 * @returns Tile size in screen pixels
 */
export function getScaledTileSize(camera: Camera): number {
  return TILE_SIZE * camera.zoom;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
