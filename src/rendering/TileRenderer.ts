import type { Tile, Camera, Viewport, VisibleBounds, ZoneType, PowerPlant, WaterPump, PoliceStation } from '../types';
import { TERRAIN_COLORS, ZONE_COLORS, ZONE_COLOR_VARIANTS, INFRASTRUCTURE_COLORS, STATUS_COLORS, OVERLAY_COLORS_POWER, OVERLAY_COLORS_WATER, OVERLAY_COLORS_CRIME, OVERLAY_COLORS_POLLUTION, TILE_SIZE, MAP_SIZE } from '../types';
import { gridToScreen, getVisibleTileBounds, getScaledTileSize } from './coordinates';
import type { DisasterType } from '@/systems';

/**
 * Function type for checking road access
 */
type RoadAccessChecker = (x: number, y: number) => boolean;

/**
 * Function type for getting power plant at position
 */
type PowerPlantGetter = (x: number, y: number) => PowerPlant | null;

/**
 * Function type for getting water pump at position
 */
type WaterPumpGetter = (x: number, y: number) => WaterPump | null;

/**
 * Grid line configuration
 */
interface GridLineConfig {
  /** Whether to show grid lines */
  enabled: boolean;
  /** Grid line color */
  color: string;
  /** Grid line width */
  lineWidth: number;
  /** Minimum zoom level to show grid lines */
  minZoom: number;
}

const DEFAULT_GRID_CONFIG: GridLineConfig = {
  enabled: true,
  color: 'rgba(255, 255, 255, 0.1)',
  lineWidth: 1,
  minZoom: 0.75, // Only show grid when zoom >= 0.75
};

/**
 * Renders tiles to a canvas using the Canvas 2D API
 */
export class TileRenderer {
  private ctx: CanvasRenderingContext2D;
  private gridConfig: GridLineConfig;

  constructor(ctx: CanvasRenderingContext2D, gridConfig: Partial<GridLineConfig> = {}) {
    this.ctx = ctx;
    this.gridConfig = { ...DEFAULT_GRID_CONFIG, ...gridConfig };
  }

  /**
   * Render all visible tiles
   * Uses two-pass rendering to ensure buildings (which may overflow their tiles)
   * render on top of flat infrastructure like roads.
   * 
   * Render order (back to front):
   * 1. Terrain (grass, water)
   * 2. Empty/developing zones (flat overlays)
   * 3. Water pipes
   * 4. Power lines
   * 5. Roads
   * 6. Power plants
   * 7. Water pumps
   * 8. Police stations
   * 9. Developed buildings (may overflow tiles - rendered last to be on top)
   * 10. Zone status indicators
   * 11. Grid lines
   * 
   * @param tiles - 2D array of tiles
   * @param camera - Current camera state
   * @param viewport - Viewport dimensions
   * @param hasRoadAccess - Optional function to check road access for zones
   * @param getPowerPlantAt - Optional function to get power plant at position
   * @param powerPlants - Optional array of power plants
   * @param waterPumps - Optional array of water pumps
   * @param policeStations - Optional array of police stations
   */
  renderTiles(
    tiles: Tile[][],
    camera: Camera,
    viewport: Viewport,
    hasRoadAccess?: RoadAccessChecker,
    _getPowerPlantAt?: PowerPlantGetter,
    powerPlants?: PowerPlant[],
    _getWaterPumpAt?: WaterPumpGetter,
    waterPumps?: WaterPump[],
    policeStations?: PoliceStation[]
  ): void {
    const bounds = getVisibleTileBounds(camera, viewport);
    const scaledTileSize = getScaledTileSize(camera);

    // === PASS 1: Flat items (terrain, empty/developing zones, infrastructure) ===

    // Render terrain layer
    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = tiles[y]?.[x];
        if (tile) {
          this.renderTileTerrain(tile, camera, scaledTileSize);
        }
      }
    }

    // Render empty and developing zone overlays (NOT developed buildings)
    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = tiles[y]?.[x];
        if (tile && tile.zone) {
          const progress = tile.developmentProgress || 0;
          const isDeveloped = progress >= 100;
          // Only render empty/developing zones in this pass
          if (!isDeveloped) {
            this.renderZoneOverlay(tile, camera, scaledTileSize);
          }
        }
      }
    }

    // Render water pipes (below power lines)
    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = tiles[y]?.[x];
        if (tile && tile.hasWaterPipe) {
          this.renderWaterPipe(tile, tiles, camera, scaledTileSize);
        }
      }
    }

    // Render power lines (above water pipes, below roads)
    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = tiles[y]?.[x];
        if (tile && tile.hasPowerLine) {
          this.renderPowerLine(tile, tiles, camera, scaledTileSize);
        }
      }
    }

    // Render roads (above power lines, below buildings)
    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = tiles[y]?.[x];
        if (tile && tile.hasRoad) {
          this.renderRoad(tile, tiles, camera, scaledTileSize);
        }
      }
    }

    // Render power plants (above roads, below developed buildings)
    if (powerPlants) {
      for (const plant of powerPlants) {
        if (plant.x >= bounds.startX && plant.x <= bounds.endX &&
            plant.y >= bounds.startY && plant.y <= bounds.endY) {
          this.renderPowerPlant(plant, camera, scaledTileSize);
        }
      }
    }

    // Render water pumps (above roads, same level as power plants)
    if (waterPumps) {
      for (const pump of waterPumps) {
        if (pump.x >= bounds.startX && pump.x <= bounds.endX &&
            pump.y >= bounds.startY && pump.y <= bounds.endY) {
          this.renderWaterPump(pump, camera, scaledTileSize);
        }
      }
    }

    // Render police stations (above roads, same level as other buildings)
    if (policeStations) {
      for (const station of policeStations) {
        if (station.position.gridX >= bounds.startX && station.position.gridX <= bounds.endX &&
            station.position.gridY >= bounds.startY && station.position.gridY <= bounds.endY) {
          this.renderPoliceStation(station, camera, scaledTileSize);
        }
      }
    }

    // === PASS 2: Tall items (developed buildings that may overflow their tiles) ===

    // Render developed buildings LAST so they appear on top of roads
    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = tiles[y]?.[x];
        if (tile && tile.zone) {
          const progress = tile.developmentProgress || 0;
          const isDeveloped = progress >= 100;
          // Only render developed buildings in this pass
          if (isDeveloped) {
            this.renderZoneOverlay(tile, camera, scaledTileSize);
          }
        }
      }
    }

    // Render zone status indicators (above buildings)
    if (hasRoadAccess) {
      for (let y = bounds.startY; y <= bounds.endY; y++) {
        for (let x = bounds.startX; x <= bounds.endX; x++) {
          const tile = tiles[y]?.[x];
          if (tile && tile.zone) {
            const hasAccess = hasRoadAccess(tile.x, tile.y);
            this.renderZoneStatusIndicators(tile, camera, scaledTileSize, hasAccess);
          }
        }
      }
    }

    // Render grid lines on top
    if (this.gridConfig.enabled && camera.zoom >= this.gridConfig.minZoom) {
      this.renderGridLines(bounds, camera);
    }
  }

  /**
   * Render terrain for a single tile
   */
  private renderTileTerrain(tile: Tile, camera: Camera, scaledTileSize: number): void {
    const screenPos = gridToScreen({ gridX: tile.x, gridY: tile.y }, camera);

    // Get terrain color
    const color = TERRAIN_COLORS[tile.terrain];
    
    this.ctx.fillStyle = color;
    this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
    
    // Add subtle texture variation for grass
    if (tile.terrain === 'grass') {
      this.addGrassTexture(tile, screenPos.screenX, screenPos.screenY, scaledTileSize);
    }
    
    // Add water shimmer effect
    if (tile.terrain === 'water') {
      this.addWaterEffect(tile, screenPos.screenX, screenPos.screenY, scaledTileSize);
    }
  }

  /**
   * Add subtle texture to grass tiles for visual interest
   */
  private addGrassTexture(tile: Tile, x: number, y: number, size: number): void {
    // Use tile position to create deterministic variation
    const variation = ((tile.x * 7 + tile.y * 13) % 20) - 10;
    const brightness = variation > 0 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    
    if (Math.abs(variation) > 5) {
      this.ctx.fillStyle = brightness;
      this.ctx.fillRect(x, y, size, size);
    }
  }

  /**
   * Add shimmer effect to water tiles
   */
  private addWaterEffect(tile: Tile, x: number, y: number, size: number): void {
    // Create subtle wave pattern
    const waveOffset = ((tile.x + tile.y) % 4) * 0.25;
    const brightness = waveOffset > 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    
    this.ctx.fillStyle = brightness;
    this.ctx.fillRect(x, y, size, size);
  }

  /**
   * Render zone overlay on a tile
   * - Empty zone (0% progress): semi-transparent overlay
   * - Developing zone (1-99%): show progress indicator
   * - Developed zone (100%): render as building with darker color
   */
  private renderZoneOverlay(tile: Tile, camera: Camera, scaledTileSize: number): void {
    if (!tile.zone) return;

    const screenPos = gridToScreen({ gridX: tile.x, gridY: tile.y }, camera);
    const progress = tile.developmentProgress || 0;
    const isDeveloped = progress >= 100;
    const isDeveloping = progress > 0 && progress < 100;
    
    if (isDeveloped) {
      // Fully developed - render as building
      this.renderDevelopedBuilding(tile, screenPos, scaledTileSize);
    } else if (isDeveloping) {
      // Developing - show zone with progress indicator
      this.renderDevelopingZone(tile, screenPos, scaledTileSize, progress);
    } else {
      // Empty zone - semi-transparent overlay
      const color = ZONE_COLORS[tile.zone];
      this.ctx.fillStyle = color;
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      // Add border for visual clarity
      const borderColor = ZONE_COLOR_VARIANTS[tile.zone].border;
      this.ctx.strokeStyle = borderColor;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(
        screenPos.screenX + 0.5,
        screenPos.screenY + 0.5,
        scaledTileSize - 1,
        scaledTileSize - 1
      );
    }
  }
  
  /**
   * Render a developing zone with progress indicator
   */
  private renderDevelopingZone(
    tile: Tile, 
    screenPos: { screenX: number; screenY: number }, 
    scaledTileSize: number, 
    progress: number
  ): void {
    if (!tile.zone) return;
    
    // Base zone overlay
    const color = ZONE_COLORS[tile.zone];
    this.ctx.fillStyle = color;
    this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
    
    // Border
    const borderColor = ZONE_COLOR_VARIANTS[tile.zone].border;
    this.ctx.strokeStyle = borderColor;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(
      screenPos.screenX + 0.5,
      screenPos.screenY + 0.5,
      scaledTileSize - 1,
      scaledTileSize - 1
    );
    
    // Progress bar at bottom of tile
    const barHeight = Math.max(3, scaledTileSize * 0.1);
    const barPadding = scaledTileSize * 0.1;
    const barWidth = scaledTileSize - barPadding * 2;
    const barX = screenPos.screenX + barPadding;
    const barY = screenPos.screenY + scaledTileSize - barHeight - barPadding;
    
    // Background (empty part)
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(barX, barY, barWidth, barHeight);
    
    // Fill (progress)
    const fillWidth = (progress / 100) * barWidth;
    this.ctx.fillStyle = ZONE_COLOR_VARIANTS[tile.zone].primary;
    this.ctx.fillRect(barX, barY, fillWidth, barHeight);
    
    // Construction icon in center (small building outline)
    const iconSize = scaledTileSize * 0.3;
    const iconX = screenPos.screenX + (scaledTileSize - iconSize) / 2;
    const iconY = screenPos.screenY + (scaledTileSize - iconSize) / 2 - barHeight / 2;
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.lineWidth = Math.max(1, scaledTileSize * 0.04);
    this.ctx.setLineDash([2, 2]);
    this.ctx.strokeRect(iconX, iconY, iconSize, iconSize);
    this.ctx.setLineDash([]);
  }
  
  /**
   * Render a fully developed building
   */
  private renderDevelopedBuilding(
    tile: Tile, 
    screenPos: { screenX: number; screenY: number }, 
    scaledTileSize: number
  ): void {
    if (!tile.zone) return;
    
    const isMediumDensity = tile.zoneDensity === 'medium';
    
    // Check if the building is abandoned
    if (tile.isAbandoned) {
      this.renderAbandonedBuilding(tile, screenPos, scaledTileSize, isMediumDensity);
      return;
    }
    
    if (isMediumDensity) {
      this.renderMediumDensityBuilding(tile, screenPos, scaledTileSize);
    } else {
      this.renderLowDensityBuilding(tile, screenPos, scaledTileSize);
    }
  }
  
  /**
   * Render an abandoned building with darker/desaturated appearance and boarded windows
   */
  private renderAbandonedBuilding(
    tile: Tile,
    screenPos: { screenX: number; screenY: number },
    scaledTileSize: number,
    isMediumDensity: boolean
  ): void {
    if (!tile.zone) return;
    
    const padding = isMediumDensity ? scaledTileSize * 0.06 : scaledTileSize * 0.08;
    const buildingSize = scaledTileSize - padding * 2;
    const buildingHeight = isMediumDensity ? scaledTileSize * 1.3 : buildingSize;
    const buildingTop = isMediumDensity 
      ? screenPos.screenY - scaledTileSize * 0.3 
      : screenPos.screenY + padding;
    
    // Desaturated, darker colors for abandoned buildings
    const abandonedColors = {
      main: '#4A4A4A',     // Dark gray
      dark: '#2E2E2E',     // Darker gray
      roof: '#5A5A5A',     // Medium gray
      window: '#3A3A3A',   // Very dark gray (boarded windows)
      board: '#5D4E37',    // Wood board color
    };
    
    // Main building body with desaturated color
    this.ctx.fillStyle = abandonedColors.main;
    if (isMediumDensity) {
      this.ctx.fillRect(
        screenPos.screenX + padding,
        buildingTop + buildingHeight * 0.15,
        buildingSize,
        buildingHeight * 0.85
      );
    } else {
      this.ctx.fillRect(
        screenPos.screenX + padding,
        buildingTop + buildingSize * 0.2,
        buildingSize,
        buildingSize * 0.8
      );
    }
    
    // Building shadow/depth on right side
    this.ctx.fillStyle = abandonedColors.dark;
    if (isMediumDensity) {
      this.ctx.fillRect(
        screenPos.screenX + padding + buildingSize * 0.85,
        buildingTop + buildingHeight * 0.15,
        buildingSize * 0.15,
        buildingHeight * 0.85
      );
    } else {
      this.ctx.fillRect(
        screenPos.screenX + padding + buildingSize * 0.85,
        buildingTop + buildingSize * 0.2,
        buildingSize * 0.15,
        buildingSize * 0.8
      );
    }
    
    // Roof (darker, more worn looking)
    this.ctx.fillStyle = abandonedColors.roof;
    if (isMediumDensity) {
      this.ctx.fillRect(
        screenPos.screenX + padding,
        buildingTop,
        buildingSize,
        buildingHeight * 0.18
      );
    } else {
      this.ctx.fillRect(
        screenPos.screenX + padding,
        buildingTop,
        buildingSize,
        buildingSize * 0.25
      );
    }
    
    // Boarded windows - only if tile is large enough
    if (scaledTileSize >= 20) {
      const windowSize = isMediumDensity 
        ? Math.max(2, buildingSize * 0.12)
        : Math.max(2, buildingSize * 0.15);
      
      // Draw boarded windows with X pattern
      this.ctx.fillStyle = abandonedColors.window;
      this.ctx.strokeStyle = abandonedColors.board;
      this.ctx.lineWidth = Math.max(1, scaledTileSize * 0.03);
      
      if (isMediumDensity) {
        // 4 rows of windows for medium density
        const windowGapX = buildingSize * 0.22;
        const windowGapY = buildingHeight * 0.15;
        
        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 3; col++) {
            const wx = screenPos.screenX + padding + windowGapX * (col + 0.4);
            const wy = buildingTop + buildingHeight * 0.22 + windowGapY * row;
            
            // Dark window
            this.ctx.fillRect(wx, wy, windowSize, windowSize * 1.2);
            
            // Boarded X pattern
            this.ctx.beginPath();
            this.ctx.moveTo(wx, wy);
            this.ctx.lineTo(wx + windowSize, wy + windowSize * 1.2);
            this.ctx.moveTo(wx + windowSize, wy);
            this.ctx.lineTo(wx, wy + windowSize * 1.2);
            this.ctx.stroke();
          }
        }
      } else {
        // 2 rows of windows for low density
        const windowGap = buildingSize * 0.25;
        
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 2; col++) {
            const wx = screenPos.screenX + padding + windowGap * (col + 0.5);
            const wy = buildingTop + buildingSize * 0.35 + windowGap * row;
            
            // Dark window
            this.ctx.fillRect(wx, wy, windowSize, windowSize);
            
            // Boarded X pattern
            this.ctx.beginPath();
            this.ctx.moveTo(wx, wy);
            this.ctx.lineTo(wx + windowSize, wy + windowSize);
            this.ctx.moveTo(wx + windowSize, wy);
            this.ctx.lineTo(wx, wy + windowSize);
            this.ctx.stroke();
          }
        }
      }
    }
    
    // Building border (darker)
    this.ctx.strokeStyle = abandonedColors.dark;
    this.ctx.lineWidth = 1;
    if (isMediumDensity) {
      this.ctx.strokeRect(
        screenPos.screenX + padding,
        buildingTop,
        buildingSize,
        buildingHeight
      );
    } else {
      this.ctx.strokeRect(
        screenPos.screenX + padding,
        buildingTop,
        buildingSize,
        buildingSize
      );
    }
    
    // "ABANDONED" indicator badge in top-right corner
    const badgeWidth = Math.max(12, scaledTileSize * 0.35);
    const badgeHeight = Math.max(8, scaledTileSize * 0.15);
    const badgeX = screenPos.screenX + scaledTileSize - badgeWidth - padding;
    const badgeY = buildingTop + padding;
    
    // Red warning badge background
    this.ctx.fillStyle = 'rgba(244, 67, 54, 0.9)'; // Red
    this.ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Badge border
    this.ctx.strokeStyle = '#D32F2F';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Warning icon (⚠) if large enough
    if (scaledTileSize >= 24) {
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = `bold ${Math.max(6, badgeHeight * 0.8)}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('⚠', badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
    }
    
    // Overall darkening/desaturation overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    if (isMediumDensity) {
      this.ctx.fillRect(
        screenPos.screenX + padding,
        buildingTop,
        buildingSize,
        buildingHeight
      );
    } else {
      this.ctx.fillRect(
        screenPos.screenX + padding,
        buildingTop,
        buildingSize,
        buildingSize
      );
    }
  }
  
  /**
   * Render a low density building (small house/shop/factory)
   */
  private renderLowDensityBuilding(
    tile: Tile, 
    screenPos: { screenX: number; screenY: number }, 
    scaledTileSize: number
  ): void {
    if (!tile.zone) return;
    
    const padding = scaledTileSize * 0.08;
    const buildingSize = scaledTileSize - padding * 2;
    
    // Building colors based on zone type
    const buildingColors = {
      residential: { main: '#2E7D32', dark: '#1B5E20', roof: '#4CAF50' },
      commercial: { main: '#1565C0', dark: '#0D47A1', roof: '#2196F3' },
      industrial: { main: '#F57C00', dark: '#E65100', roof: '#FF9800' },
    };
    
    const colors = buildingColors[tile.zone];
    
    // Main building body
    this.ctx.fillStyle = colors.main;
    this.ctx.fillRect(
      screenPos.screenX + padding,
      screenPos.screenY + padding + buildingSize * 0.2,
      buildingSize,
      buildingSize * 0.8
    );
    
    // Building shadow/depth on right side
    this.ctx.fillStyle = colors.dark;
    this.ctx.fillRect(
      screenPos.screenX + padding + buildingSize * 0.85,
      screenPos.screenY + padding + buildingSize * 0.2,
      buildingSize * 0.15,
      buildingSize * 0.8
    );
    
    // Roof (flat top)
    this.ctx.fillStyle = colors.roof;
    this.ctx.fillRect(
      screenPos.screenX + padding,
      screenPos.screenY + padding,
      buildingSize,
      buildingSize * 0.25
    );
    
    // Windows (small rectangles) - only if tile is large enough
    if (scaledTileSize >= 20) {
      const windowSize = Math.max(2, buildingSize * 0.15);
      const windowGap = buildingSize * 0.25;
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      
      // Two rows of windows
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const wx = screenPos.screenX + padding + windowGap * (col + 0.5);
          const wy = screenPos.screenY + padding + buildingSize * 0.35 + windowGap * row;
          this.ctx.fillRect(wx, wy, windowSize, windowSize);
        }
      }
    }
    
    // Building border
    this.ctx.strokeStyle = colors.dark;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(
      screenPos.screenX + padding,
      screenPos.screenY + padding,
      buildingSize,
      buildingSize
    );
  }
  
  /**
   * Render a medium density building (taller building with more floors)
   */
  private renderMediumDensityBuilding(
    tile: Tile, 
    screenPos: { screenX: number; screenY: number }, 
    scaledTileSize: number
  ): void {
    if (!tile.zone) return;
    
    const padding = scaledTileSize * 0.06;
    const buildingWidth = scaledTileSize - padding * 2;
    // Medium density buildings are taller - extend above the tile
    const buildingHeight = scaledTileSize * 1.3;
    const buildingTop = screenPos.screenY - scaledTileSize * 0.3;
    
    // Building colors based on zone type - slightly brighter/more saturated for medium density
    const buildingColors = {
      residential: { main: '#388E3C', dark: '#1B5E20', roof: '#66BB6A', accent: '#81C784' },
      commercial: { main: '#1976D2', dark: '#0D47A1', roof: '#42A5F5', accent: '#64B5F6' },
      industrial: { main: '#FB8C00', dark: '#E65100', roof: '#FFA726', accent: '#FFCC80' },
    };
    
    const colors = buildingColors[tile.zone];
    
    // Main building body (taller)
    this.ctx.fillStyle = colors.main;
    this.ctx.fillRect(
      screenPos.screenX + padding,
      buildingTop + buildingHeight * 0.15,
      buildingWidth,
      buildingHeight * 0.85
    );
    
    // Building shadow/depth on right side
    this.ctx.fillStyle = colors.dark;
    this.ctx.fillRect(
      screenPos.screenX + padding + buildingWidth * 0.85,
      buildingTop + buildingHeight * 0.15,
      buildingWidth * 0.15,
      buildingHeight * 0.85
    );
    
    // Roof (flat top with accent)
    this.ctx.fillStyle = colors.roof;
    this.ctx.fillRect(
      screenPos.screenX + padding,
      buildingTop,
      buildingWidth,
      buildingHeight * 0.18
    );
    
    // Windows (more rows for taller building) - only if tile is large enough
    if (scaledTileSize >= 20) {
      const windowSize = Math.max(2, buildingWidth * 0.12);
      const windowGapX = buildingWidth * 0.22;
      const windowGapY = buildingHeight * 0.15;
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      
      // 4 rows of windows for medium density
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          const wx = screenPos.screenX + padding + windowGapX * (col + 0.4);
          const wy = buildingTop + buildingHeight * 0.22 + windowGapY * row;
          this.ctx.fillRect(wx, wy, windowSize, windowSize * 1.2);
        }
      }
    }
    
    // Building border
    this.ctx.strokeStyle = colors.dark;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(
      screenPos.screenX + padding,
      buildingTop,
      buildingWidth,
      buildingHeight
    );
    
    // "M" indicator badge in top-right corner (medium density indicator)
    const badgeSize = Math.max(8, scaledTileSize * 0.2);
    const badgeX = screenPos.screenX + scaledTileSize - badgeSize - padding;
    const badgeY = buildingTop + padding;
    
    this.ctx.fillStyle = colors.accent;
    this.ctx.beginPath();
    this.ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
    this.ctx.fill();
    
    // "M" text
    if (scaledTileSize >= 24) {
      this.ctx.fillStyle = colors.dark;
      this.ctx.font = `bold ${Math.max(6, badgeSize * 0.7)}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('M', badgeX + badgeSize / 2, badgeY + badgeSize / 2);
    }
  }

  /**
   * Render zone status indicators (road access, power, and water)
   * Shows icons in corners: bottom-right for road, bottom-left for power, top-left for water
   */
  private renderZoneStatusIndicators(tile: Tile, camera: Camera, scaledTileSize: number, hasRoadAccess: boolean): void {
    const screenPos = gridToScreen({ gridX: tile.x, gridY: tile.y }, camera);
    
    // Icon size scales with zoom but has min/max
    const iconSize = Math.max(8, Math.min(14, scaledTileSize * 0.3));
    const padding = Math.max(2, scaledTileSize * 0.06);
    
    // Road access indicator - bottom-right corner
    const roadIconX = screenPos.screenX + scaledTileSize - iconSize - padding;
    const roadIconY = screenPos.screenY + scaledTileSize - iconSize - padding;
    
    if (hasRoadAccess) {
      // Green checkmark for road access
      this.ctx.strokeStyle = STATUS_COLORS.success.base;
      this.ctx.lineWidth = Math.max(1.5, iconSize * 0.15);
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      
      this.ctx.beginPath();
      this.ctx.moveTo(roadIconX + iconSize * 0.15, roadIconY + iconSize * 0.5);
      this.ctx.lineTo(roadIconX + iconSize * 0.4, roadIconY + iconSize * 0.75);
      this.ctx.lineTo(roadIconX + iconSize * 0.85, roadIconY + iconSize * 0.25);
      this.ctx.stroke();
    } else {
      // Red X for no road access
      this.ctx.strokeStyle = STATUS_COLORS.error.base;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(
        screenPos.screenX + 2,
        screenPos.screenY + 2,
        scaledTileSize - 4,
        scaledTileSize - 4
      );
      this.ctx.setLineDash([]);
      
      this.ctx.lineWidth = Math.max(1.5, iconSize * 0.15);
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(roadIconX + iconSize * 0.2, roadIconY + iconSize * 0.2);
      this.ctx.lineTo(roadIconX + iconSize * 0.8, roadIconY + iconSize * 0.8);
      this.ctx.moveTo(roadIconX + iconSize * 0.8, roadIconY + iconSize * 0.2);
      this.ctx.lineTo(roadIconX + iconSize * 0.2, roadIconY + iconSize * 0.8);
      this.ctx.stroke();
    }
    
    // Power indicator - bottom-left corner (lightning bolt)
    const powerIconX = screenPos.screenX + padding;
    const powerIconY = screenPos.screenY + scaledTileSize - iconSize - padding;
    
    if (tile.isPowered) {
      // Green lightning bolt for powered
      this.ctx.fillStyle = STATUS_COLORS.success.base;
      this.ctx.strokeStyle = STATUS_COLORS.success.dark;
    } else {
      // Red lightning bolt for unpowered
      this.ctx.fillStyle = STATUS_COLORS.error.base;
      this.ctx.strokeStyle = STATUS_COLORS.error.dark;
    }
    
    // Draw lightning bolt
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(powerIconX + iconSize * 0.6, powerIconY);
    this.ctx.lineTo(powerIconX + iconSize * 0.2, powerIconY + iconSize * 0.5);
    this.ctx.lineTo(powerIconX + iconSize * 0.5, powerIconY + iconSize * 0.5);
    this.ctx.lineTo(powerIconX + iconSize * 0.4, powerIconY + iconSize);
    this.ctx.lineTo(powerIconX + iconSize * 0.8, powerIconY + iconSize * 0.45);
    this.ctx.lineTo(powerIconX + iconSize * 0.5, powerIconY + iconSize * 0.45);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    
    // Water indicator - top-left corner (water drop)
    const waterIconX = screenPos.screenX + padding;
    const waterIconY = screenPos.screenY + padding;
    
    if (tile.hasWaterService) {
      // Blue water drop for water service
      this.ctx.fillStyle = STATUS_COLORS.info.base;
      this.ctx.strokeStyle = STATUS_COLORS.info.dark;
    } else {
      // Gray water drop for no water service
      this.ctx.fillStyle = '#9E9E9E';
      this.ctx.strokeStyle = '#757575';
    }
    
    // Draw water drop
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    // Water drop shape
    this.ctx.moveTo(waterIconX + iconSize * 0.5, waterIconY);
    this.ctx.bezierCurveTo(
      waterIconX + iconSize * 0.5, waterIconY + iconSize * 0.3,
      waterIconX + iconSize, waterIconY + iconSize * 0.5,
      waterIconX + iconSize * 0.5, waterIconY + iconSize
    );
    this.ctx.bezierCurveTo(
      waterIconX, waterIconY + iconSize * 0.5,
      waterIconX + iconSize * 0.5, waterIconY + iconSize * 0.3,
      waterIconX + iconSize * 0.5, waterIconY
    );
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
  }

  /**
   * Render a power plant building
   */
  private renderPowerPlant(plant: PowerPlant, camera: Camera, scaledTileSize: number): void {
    const screenPos = gridToScreen({ gridX: plant.x, gridY: plant.y }, camera);
    
    // Power plant is a single tile building with industrial gray color
    const buildingPadding = scaledTileSize * 0.1;
    const buildingSize = scaledTileSize - buildingPadding * 2;
    
    // Main building
    this.ctx.fillStyle = '#5C5C5C'; // Industrial gray
    this.ctx.fillRect(
      screenPos.screenX + buildingPadding,
      screenPos.screenY + buildingPadding,
      buildingSize,
      buildingSize
    );
    
    // Building border
    this.ctx.strokeStyle = '#3A3A3A';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      screenPos.screenX + buildingPadding,
      screenPos.screenY + buildingPadding,
      buildingSize,
      buildingSize
    );
    
    // Smokestack
    const stackWidth = buildingSize * 0.2;
    const stackHeight = buildingSize * 0.4;
    this.ctx.fillStyle = '#4A4A4A';
    this.ctx.fillRect(
      screenPos.screenX + buildingPadding + buildingSize * 0.7,
      screenPos.screenY + buildingPadding - stackHeight * 0.3,
      stackWidth,
      stackHeight
    );
    
    // Lightning bolt symbol in center
    const boltSize = buildingSize * 0.5;
    const boltX = screenPos.screenX + scaledTileSize / 2 - boltSize / 2;
    const boltY = screenPos.screenY + scaledTileSize / 2 - boltSize / 2;
    
    this.ctx.fillStyle = '#FFD700'; // Gold/yellow
    this.ctx.strokeStyle = '#FFA500'; // Orange outline
    this.ctx.lineWidth = 1;
    
    this.ctx.beginPath();
    this.ctx.moveTo(boltX + boltSize * 0.6, boltY);
    this.ctx.lineTo(boltX + boltSize * 0.2, boltY + boltSize * 0.5);
    this.ctx.lineTo(boltX + boltSize * 0.5, boltY + boltSize * 0.5);
    this.ctx.lineTo(boltX + boltSize * 0.4, boltY + boltSize);
    this.ctx.lineTo(boltX + boltSize * 0.8, boltY + boltSize * 0.45);
    this.ctx.lineTo(boltX + boltSize * 0.5, boltY + boltSize * 0.45);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
  }

  /**
   * Render a water pump building
   */
  private renderWaterPump(pump: WaterPump, camera: Camera, scaledTileSize: number): void {
    const screenPos = gridToScreen({ gridX: pump.x, gridY: pump.y }, camera);
    
    // Water pump is a single tile building with blue color
    const buildingPadding = scaledTileSize * 0.1;
    const buildingSize = scaledTileSize - buildingPadding * 2;
    
    // Main building
    this.ctx.fillStyle = '#1976D2'; // Blue
    this.ctx.fillRect(
      screenPos.screenX + buildingPadding,
      screenPos.screenY + buildingPadding,
      buildingSize,
      buildingSize
    );
    
    // Building border
    this.ctx.strokeStyle = '#0D47A1';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      screenPos.screenX + buildingPadding,
      screenPos.screenY + buildingPadding,
      buildingSize,
      buildingSize
    );
    
    // Water drop symbol in center
    const dropSize = buildingSize * 0.5;
    const dropX = screenPos.screenX + scaledTileSize / 2;
    const dropY = screenPos.screenY + scaledTileSize / 2 - dropSize / 4;
    
    this.ctx.fillStyle = '#E3F2FD'; // Light blue
    this.ctx.strokeStyle = '#90CAF9'; // Light blue outline
    this.ctx.lineWidth = 1;
    
    // Draw water drop
    this.ctx.beginPath();
    this.ctx.moveTo(dropX, dropY - dropSize * 0.4);
    this.ctx.bezierCurveTo(
      dropX, dropY,
      dropX + dropSize * 0.5, dropY + dropSize * 0.3,
      dropX, dropY + dropSize * 0.6
    );
    this.ctx.bezierCurveTo(
      dropX - dropSize * 0.5, dropY + dropSize * 0.3,
      dropX, dropY,
      dropX, dropY - dropSize * 0.4
    );
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
  }

  /**
   * Render a police station building
   */
  private renderPoliceStation(station: PoliceStation, camera: Camera, scaledTileSize: number): void {
    const screenPos = gridToScreen({ gridX: station.position.gridX, gridY: station.position.gridY }, camera);
    
    // Police station is a single tile building with blue/white color scheme
    const buildingPadding = scaledTileSize * 0.1;
    const buildingSize = scaledTileSize - buildingPadding * 2;
    
    // Main building (blue)
    this.ctx.fillStyle = '#1565C0'; // Police blue
    this.ctx.fillRect(
      screenPos.screenX + buildingPadding,
      screenPos.screenY + buildingPadding,
      buildingSize,
      buildingSize
    );
    
    // Building border
    this.ctx.strokeStyle = '#0D47A1';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      screenPos.screenX + buildingPadding,
      screenPos.screenY + buildingPadding,
      buildingSize,
      buildingSize
    );
    
    // Roof (lighter blue stripe at top)
    this.ctx.fillStyle = '#42A5F5';
    this.ctx.fillRect(
      screenPos.screenX + buildingPadding,
      screenPos.screenY + buildingPadding,
      buildingSize,
      buildingSize * 0.2
    );
    
    // Police badge/star icon in center
    const badgeSize = buildingSize * 0.45;
    const centerX = screenPos.screenX + scaledTileSize / 2;
    const centerY = screenPos.screenY + scaledTileSize / 2 + buildingSize * 0.05;
    
    // Draw star shape
    this.ctx.fillStyle = '#FFD700'; // Gold badge
    this.ctx.strokeStyle = '#FFA500';
    this.ctx.lineWidth = 1;
    
    this.ctx.beginPath();
    const spikes = 6;
    const outerRadius = badgeSize / 2;
    const innerRadius = badgeSize / 4;
    
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    
    // Small blue circle in center of badge
    this.ctx.fillStyle = '#1565C0';
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, badgeSize * 0.15, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /**
   * Check if an adjacent tile has a water pipe
   */
  private hasAdjacentWaterPipe(tiles: Tile[][], x: number, y: number): boolean {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) {
      return false;
    }
    return tiles[y]?.[x]?.hasWaterPipe ?? false;
  }

  /**
   * Render a water pipe on a tile with connections
   */
  private renderWaterPipe(tile: Tile, tiles: Tile[][], camera: Camera, scaledTileSize: number): void {
    const screenPos = gridToScreen({ gridX: tile.x, gridY: tile.y }, camera);
    const pipeColor = INFRASTRUCTURE_COLORS.waterPipe;
    
    // Check adjacent tiles for connections
    const hasNorth = this.hasAdjacentWaterPipe(tiles, tile.x, tile.y - 1);
    const hasSouth = this.hasAdjacentWaterPipe(tiles, tile.x, tile.y + 1);
    const hasWest = this.hasAdjacentWaterPipe(tiles, tile.x - 1, tile.y);
    const hasEast = this.hasAdjacentWaterPipe(tiles, tile.x + 1, tile.y);
    
    const centerX = screenPos.screenX + scaledTileSize / 2;
    const centerY = screenPos.screenY + scaledTileSize / 2;
    const pipeWidth = Math.max(3, scaledTileSize * 0.12);
    
    // Draw pipe segments
    this.ctx.strokeStyle = pipeColor;
    this.ctx.lineWidth = pipeWidth;
    this.ctx.lineCap = 'round';
    
    this.ctx.beginPath();
    
    // Draw pipes to adjacent tiles
    if (hasNorth) {
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(centerX, screenPos.screenY);
    }
    if (hasSouth) {
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(centerX, screenPos.screenY + scaledTileSize);
    }
    if (hasWest) {
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(screenPos.screenX, centerY);
    }
    if (hasEast) {
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(screenPos.screenX + scaledTileSize, centerY);
    }
    
    // If no connections, draw a small cross
    if (!hasNorth && !hasSouth && !hasWest && !hasEast) {
      const crossSize = scaledTileSize * 0.2;
      this.ctx.moveTo(centerX - crossSize, centerY);
      this.ctx.lineTo(centerX + crossSize, centerY);
      this.ctx.moveTo(centerX, centerY - crossSize);
      this.ctx.lineTo(centerX, centerY + crossSize);
    }
    
    this.ctx.stroke();
    
    // Draw junction circle in center
    const junctionSize = Math.max(4, scaledTileSize * 0.1);
    this.ctx.fillStyle = pipeColor;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, junctionSize, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /**
   * Check if an adjacent tile has a power line
   */
  private hasAdjacentPowerLine(tiles: Tile[][], x: number, y: number): boolean {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) {
      return false;
    }
    return tiles[y]?.[x]?.hasPowerLine ?? false;
  }

  /**
   * Render a power line on a tile with connections
   */
  private renderPowerLine(tile: Tile, tiles: Tile[][], camera: Camera, scaledTileSize: number): void {
    const screenPos = gridToScreen({ gridX: tile.x, gridY: tile.y }, camera);
    const lineColor = '#FFB84D'; // Orange/yellow for power lines
    const poleColor = INFRASTRUCTURE_COLORS.powerLine.pole;
    
    // Check adjacent tiles for connections
    const hasNorth = this.hasAdjacentPowerLine(tiles, tile.x, tile.y - 1);
    const hasSouth = this.hasAdjacentPowerLine(tiles, tile.x, tile.y + 1);
    const hasWest = this.hasAdjacentPowerLine(tiles, tile.x - 1, tile.y);
    const hasEast = this.hasAdjacentPowerLine(tiles, tile.x + 1, tile.y);
    
    const centerX = screenPos.screenX + scaledTileSize / 2;
    const centerY = screenPos.screenY + scaledTileSize / 2;
    const lineWidth = Math.max(2, scaledTileSize * 0.08);
    
    // Draw pole in center
    const poleSize = Math.max(4, scaledTileSize * 0.15);
    this.ctx.fillStyle = poleColor;
    this.ctx.fillRect(
      centerX - poleSize / 2,
      centerY - poleSize / 2,
      poleSize,
      poleSize
    );
    
    // Draw power lines
    this.ctx.strokeStyle = lineColor;
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = 'round';
    
    this.ctx.beginPath();
    
    // Draw lines to adjacent tiles
    if (hasNorth) {
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(centerX, screenPos.screenY);
    }
    if (hasSouth) {
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(centerX, screenPos.screenY + scaledTileSize);
    }
    if (hasWest) {
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(screenPos.screenX, centerY);
    }
    if (hasEast) {
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(screenPos.screenX + scaledTileSize, centerY);
    }
    
    // If no connections, draw a small cross
    if (!hasNorth && !hasSouth && !hasWest && !hasEast) {
      const crossSize = scaledTileSize * 0.25;
      this.ctx.moveTo(centerX - crossSize, centerY);
      this.ctx.lineTo(centerX + crossSize, centerY);
      this.ctx.moveTo(centerX, centerY - crossSize);
      this.ctx.lineTo(centerX, centerY + crossSize);
    }
    
    this.ctx.stroke();
  }

  /**
   * Check if an adjacent tile has a road
   */
  private hasAdjacentRoad(tiles: Tile[][], x: number, y: number): boolean {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) {
      return false;
    }
    return tiles[y]?.[x]?.hasRoad ?? false;
  }

  /**
   * Render road on a tile with connections to adjacent roads
   */
  private renderRoad(tile: Tile, tiles: Tile[][], camera: Camera, scaledTileSize: number): void {
    const screenPos = gridToScreen({ gridX: tile.x, gridY: tile.y }, camera);
    const roadColor = INFRASTRUCTURE_COLORS.road.surface;
    
    // Check adjacent tiles for road connections
    const hasNorth = this.hasAdjacentRoad(tiles, tile.x, tile.y - 1);
    const hasSouth = this.hasAdjacentRoad(tiles, tile.x, tile.y + 1);
    const hasWest = this.hasAdjacentRoad(tiles, tile.x - 1, tile.y);
    const hasEast = this.hasAdjacentRoad(tiles, tile.x + 1, tile.y);
    
    // Road width is about 60% of tile size
    const roadWidth = scaledTileSize * 0.6;
    const roadOffset = (scaledTileSize - roadWidth) / 2;
    
    this.ctx.fillStyle = roadColor;
    
    // Always draw center square
    this.ctx.fillRect(
      screenPos.screenX + roadOffset,
      screenPos.screenY + roadOffset,
      roadWidth,
      roadWidth
    );
    
    // Extend to edges based on connections
    // North connection
    if (hasNorth) {
      this.ctx.fillRect(
        screenPos.screenX + roadOffset,
        screenPos.screenY,
        roadWidth,
        roadOffset
      );
    }
    
    // South connection
    if (hasSouth) {
      this.ctx.fillRect(
        screenPos.screenX + roadOffset,
        screenPos.screenY + roadOffset + roadWidth,
        roadWidth,
        roadOffset
      );
    }
    
    // West connection
    if (hasWest) {
      this.ctx.fillRect(
        screenPos.screenX,
        screenPos.screenY + roadOffset,
        roadOffset,
        roadWidth
      );
    }
    
    // East connection
    if (hasEast) {
      this.ctx.fillRect(
        screenPos.screenX + roadOffset + roadWidth,
        screenPos.screenY + roadOffset,
        roadOffset,
        roadWidth
      );
    }
    
    // Add subtle border for depth
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.lineWidth = 1;
    
    // Draw border around the road shape
    this.ctx.beginPath();
    
    // Center square border (only outer edges not connected to roads)
    if (!hasNorth) {
      this.ctx.moveTo(screenPos.screenX + roadOffset, screenPos.screenY + roadOffset);
      this.ctx.lineTo(screenPos.screenX + roadOffset + roadWidth, screenPos.screenY + roadOffset);
    }
    if (!hasSouth) {
      this.ctx.moveTo(screenPos.screenX + roadOffset, screenPos.screenY + roadOffset + roadWidth);
      this.ctx.lineTo(screenPos.screenX + roadOffset + roadWidth, screenPos.screenY + roadOffset + roadWidth);
    }
    if (!hasWest) {
      this.ctx.moveTo(screenPos.screenX + roadOffset, screenPos.screenY + roadOffset);
      this.ctx.lineTo(screenPos.screenX + roadOffset, screenPos.screenY + roadOffset + roadWidth);
    }
    if (!hasEast) {
      this.ctx.moveTo(screenPos.screenX + roadOffset + roadWidth, screenPos.screenY + roadOffset);
      this.ctx.lineTo(screenPos.screenX + roadOffset + roadWidth, screenPos.screenY + roadOffset + roadWidth);
    }
    
    this.ctx.stroke();
  }

  /**
   * Render grid lines over tiles
   */
  private renderGridLines(bounds: VisibleBounds, camera: Camera): void {
    this.ctx.strokeStyle = this.gridConfig.color;
    this.ctx.lineWidth = this.gridConfig.lineWidth;
    
    // Calculate grid line positions
    const startScreenPos = gridToScreen(
      { gridX: bounds.startX, gridY: bounds.startY },
      camera
    );
    const endScreenPos = gridToScreen(
      { gridX: bounds.endX + 1, gridY: bounds.endY + 1 },
      camera
    );

    this.ctx.beginPath();

    // Vertical lines
    for (let x = bounds.startX; x <= bounds.endX + 1; x++) {
      const screenX = gridToScreen({ gridX: x, gridY: 0 }, camera).screenX;
      this.ctx.moveTo(screenX, startScreenPos.screenY);
      this.ctx.lineTo(screenX, endScreenPos.screenY);
    }

    // Horizontal lines
    for (let y = bounds.startY; y <= bounds.endY + 1; y++) {
      const screenY = gridToScreen({ gridX: 0, gridY: y }, camera).screenY;
      this.ctx.moveTo(startScreenPos.screenX, screenY);
      this.ctx.lineTo(endScreenPos.screenX, screenY);
    }

    this.ctx.stroke();
  }

  /**
   * Render a hover highlight on a tile
   */
  renderHoverHighlight(
    gridX: number,
    gridY: number,
    camera: Camera
  ): void {
    const screenPos = gridToScreen({ gridX, gridY }, camera);
    const scaledTileSize = getScaledTileSize(camera);

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      screenPos.screenX + 1,
      screenPos.screenY + 1,
      scaledTileSize - 2,
      scaledTileSize - 2
    );
  }

  /**
   * Render a zone placement preview on a tile
   * @param gridX - X coordinate in grid space
   * @param gridY - Y coordinate in grid space
   * @param camera - Current camera state
   * @param zoneType - Type of zone to preview
   * @param isValid - Whether placement is valid (affects color)
   */
  renderZonePlacementPreview(
    gridX: number,
    gridY: number,
    camera: Camera,
    zoneType: ZoneType,
    isValid: boolean
  ): void {
    const screenPos = gridToScreen({ gridX, gridY }, camera);
    const scaledTileSize = getScaledTileSize(camera);

    if (isValid) {
      // Valid placement: show zone color with pulsing effect
      const color = ZONE_COLORS[zoneType];
      this.ctx.fillStyle = color;
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      // Add border
      const borderColor = ZONE_COLOR_VARIANTS[zoneType].border;
      this.ctx.strokeStyle = borderColor;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    } else {
      // Invalid placement: show red overlay
      this.ctx.fillStyle = 'rgba(244, 67, 54, 0.4)';
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      this.ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    }
  }

  /**
   * Render a road placement preview on a tile
   * @param gridX - X coordinate in grid space
   * @param gridY - Y coordinate in grid space
   * @param camera - Current camera state
   * @param isValid - Whether placement is valid (affects color)
   */
  renderRoadPlacementPreview(
    gridX: number,
    gridY: number,
    camera: Camera,
    isValid: boolean
  ): void {
    const screenPos = gridToScreen({ gridX, gridY }, camera);
    const scaledTileSize = getScaledTileSize(camera);
    
    // Road width is about 60% of tile size
    const roadWidth = scaledTileSize * 0.6;
    const roadOffset = (scaledTileSize - roadWidth) / 2;

    if (isValid) {
      // Valid placement: show road preview with semi-transparent gray
      this.ctx.fillStyle = 'rgba(74, 74, 74, 0.6)'; // Road color with transparency
      this.ctx.fillRect(
        screenPos.screenX + roadOffset,
        screenPos.screenY + roadOffset,
        roadWidth,
        roadWidth
      );
      
      // Add border
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    } else {
      // Invalid placement: show red overlay
      this.ctx.fillStyle = 'rgba(244, 67, 54, 0.4)';
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      this.ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    }
  }

  /**
   * Render power overlay on all visible tiles
   * Shows green for powered tiles, red for unpowered zones/buildings
   */
  renderPowerOverlay(tiles: Tile[][], camera: Camera, viewport: Viewport, powerPlants: PowerPlant[]): void {
    const bounds = getVisibleTileBounds(camera, viewport);
    const scaledTileSize = getScaledTileSize(camera);

    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = tiles[y]?.[x];
        if (!tile) continue;
        
        const screenPos = gridToScreen({ gridX: x, gridY: y }, camera);
        
        // Check if this is a power plant location
        const isPowerPlant = powerPlants.some(pp => pp.x === x && pp.y === y);
        
        if (isPowerPlant) {
          // Power source - bright green
          this.ctx.fillStyle = OVERLAY_COLORS_POWER.source;
        } else if (tile.isPowered) {
          // Powered tile - green
          this.ctx.fillStyle = OVERLAY_COLORS_POWER.connected;
        } else if (tile.zone || tile.hasPowerLine) {
          // Unpowered zone or power line - red
          this.ctx.fillStyle = OVERLAY_COLORS_POWER.disconnected;
        } else {
          // Regular tile without power needs - skip or very subtle
          continue;
        }
        
        this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      }
    }
  }

  /**
   * Render water overlay on all visible tiles
   * Shows blue for serviced tiles, red for unserviced zones/buildings
   */
  renderWaterOverlay(tiles: Tile[][], camera: Camera, viewport: Viewport, waterPumps: WaterPump[]): void {
    const bounds = getVisibleTileBounds(camera, viewport);
    const scaledTileSize = getScaledTileSize(camera);

    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = tiles[y]?.[x];
        if (!tile) continue;
        
        const screenPos = gridToScreen({ gridX: x, gridY: y }, camera);
        
        // Check if this is a water pump location
        const isWaterPump = waterPumps.some(wp => wp.x === x && wp.y === y);
        
        if (isWaterPump) {
          // Water source - bright blue
          this.ctx.fillStyle = OVERLAY_COLORS_WATER.source;
        } else if (tile.hasWaterService) {
          // Serviced tile - blue
          this.ctx.fillStyle = OVERLAY_COLORS_WATER.connected;
        } else if (tile.zone || tile.hasWaterPipe) {
          // Unserviced zone or water pipe - red
          this.ctx.fillStyle = OVERLAY_COLORS_WATER.disconnected;
        } else {
          // Regular tile without water needs - skip
          continue;
        }
        
        this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      }
    }
  }

  /**
   * Render crime overlay on all visible tiles
   * Shows red for high crime areas, green for low crime/protected areas
   */
  renderCrimeOverlay(
    tiles: Tile[][],
    camera: Camera,
    viewport: Viewport,
    crimeMap: Map<string, number>,
    policeStations: PoliceStation[]
  ): void {
    const bounds = getVisibleTileBounds(camera, viewport);
    const scaledTileSize = getScaledTileSize(camera);

    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = tiles[y]?.[x];
        if (!tile) continue;
        
        // Skip water tiles
        if (tile.terrain === 'water') continue;
        
        const screenPos = gridToScreen({ gridX: x, gridY: y }, camera);
        const tileKey = `${x},${y}`;
        const crimeLevel = crimeMap.get(tileKey) ?? 0;
        
        // Check if this is a police station location
        const isPoliceStation = policeStations.some(
          ps => ps.position.gridX === x && ps.position.gridY === y
        );
        
        if (isPoliceStation) {
          // Police station - show as protected
          this.ctx.fillStyle = OVERLAY_COLORS_CRIME.protected;
        } else if (crimeLevel === 0) {
          // No crime
          this.ctx.fillStyle = OVERLAY_COLORS_CRIME.none;
        } else if (crimeLevel <= 25) {
          // Low crime
          this.ctx.fillStyle = OVERLAY_COLORS_CRIME.low;
        } else if (crimeLevel <= 50) {
          // Medium crime
          this.ctx.fillStyle = OVERLAY_COLORS_CRIME.medium;
        } else if (crimeLevel <= 75) {
          // High crime
          this.ctx.fillStyle = OVERLAY_COLORS_CRIME.high;
        } else {
          // Extreme crime
          this.ctx.fillStyle = OVERLAY_COLORS_CRIME.extreme;
        }
        
        this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      }
    }
  }

  /**
   * Render pollution overlay on all visible tiles
   * Shows brown/gray for polluted areas, green for clean areas
   */
  renderPollutionOverlay(
    tiles: Tile[][],
    camera: Camera,
    viewport: Viewport,
    pollutionMap: Map<string, number>
  ): void {
    const bounds = getVisibleTileBounds(camera, viewport);
    const scaledTileSize = getScaledTileSize(camera);

    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = tiles[y]?.[x];
        if (!tile) continue;
        
        // Skip water tiles
        if (tile.terrain === 'water') continue;
        
        const screenPos = gridToScreen({ gridX: x, gridY: y }, camera);
        const tileKey = `${x},${y}`;
        const pollutionLevel = pollutionMap.get(tileKey) ?? 0;
        
        // Check if this is an industrial zone (pollution source)
        const isIndustrialSource = tile.zone === 'industrial' && tile.developmentProgress >= 100;
        
        if (isIndustrialSource) {
          // Pollution source - show as industrial emitter
          this.ctx.fillStyle = OVERLAY_COLORS_POLLUTION.source;
        } else if (pollutionLevel === 0) {
          // No pollution
          this.ctx.fillStyle = OVERLAY_COLORS_POLLUTION.none;
        } else if (pollutionLevel <= 25) {
          // Low pollution
          this.ctx.fillStyle = OVERLAY_COLORS_POLLUTION.low;
        } else if (pollutionLevel <= 50) {
          // Medium pollution
          this.ctx.fillStyle = OVERLAY_COLORS_POLLUTION.medium;
        } else if (pollutionLevel <= 75) {
          // High pollution
          this.ctx.fillStyle = OVERLAY_COLORS_POLLUTION.high;
        } else {
          // Extreme pollution
          this.ctx.fillStyle = OVERLAY_COLORS_POLLUTION.extreme;
        }
        
        this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      }
    }
  }

  /**
   * Render power line placement preview
   */
  renderPowerLinePlacementPreview(
    gridX: number,
    gridY: number,
    camera: Camera,
    isValid: boolean
  ): void {
    const screenPos = gridToScreen({ gridX, gridY }, camera);
    const scaledTileSize = getScaledTileSize(camera);
    
    const centerX = screenPos.screenX + scaledTileSize / 2;
    const centerY = screenPos.screenY + scaledTileSize / 2;
    
    if (isValid) {
      // Valid placement: show power line preview
      const crossSize = scaledTileSize * 0.25;
      this.ctx.strokeStyle = 'rgba(255, 184, 77, 0.8)';
      this.ctx.lineWidth = Math.max(3, scaledTileSize * 0.1);
      this.ctx.lineCap = 'round';
      
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - crossSize, centerY);
      this.ctx.lineTo(centerX + crossSize, centerY);
      this.ctx.moveTo(centerX, centerY - crossSize);
      this.ctx.lineTo(centerX, centerY + crossSize);
      this.ctx.stroke();
      
      // Add border
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    } else {
      // Invalid placement: show red overlay
      this.ctx.fillStyle = 'rgba(244, 67, 54, 0.4)';
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      this.ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    }
  }

  /**
   * Render power plant placement preview
   */
  renderPowerPlantPlacementPreview(
    gridX: number,
    gridY: number,
    camera: Camera,
    isValid: boolean
  ): void {
    const screenPos = gridToScreen({ gridX, gridY }, camera);
    const scaledTileSize = getScaledTileSize(camera);
    
    if (isValid) {
      // Valid placement: show power plant preview
      const buildingPadding = scaledTileSize * 0.1;
      const buildingSize = scaledTileSize - buildingPadding * 2;
      
      this.ctx.fillStyle = 'rgba(92, 92, 92, 0.6)';
      this.ctx.fillRect(
        screenPos.screenX + buildingPadding,
        screenPos.screenY + buildingPadding,
        buildingSize,
        buildingSize
      );
      
      // Lightning bolt preview
      const boltSize = buildingSize * 0.5;
      const boltX = screenPos.screenX + scaledTileSize / 2 - boltSize / 2;
      const boltY = screenPos.screenY + scaledTileSize / 2 - boltSize / 2;
      
      this.ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
      this.ctx.beginPath();
      this.ctx.moveTo(boltX + boltSize * 0.6, boltY);
      this.ctx.lineTo(boltX + boltSize * 0.2, boltY + boltSize * 0.5);
      this.ctx.lineTo(boltX + boltSize * 0.5, boltY + boltSize * 0.5);
      this.ctx.lineTo(boltX + boltSize * 0.4, boltY + boltSize);
      this.ctx.lineTo(boltX + boltSize * 0.8, boltY + boltSize * 0.45);
      this.ctx.lineTo(boltX + boltSize * 0.5, boltY + boltSize * 0.45);
      this.ctx.closePath();
      this.ctx.fill();
      
      // Border
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    } else {
      // Invalid placement: show red overlay
      this.ctx.fillStyle = 'rgba(244, 67, 54, 0.4)';
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      this.ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    }
  }

  /**
   * Render water pump placement preview
   */
  renderWaterPumpPlacementPreview(
    gridX: number,
    gridY: number,
    camera: Camera,
    isValid: boolean
  ): void {
    const screenPos = gridToScreen({ gridX, gridY }, camera);
    const scaledTileSize = getScaledTileSize(camera);
    
    if (isValid) {
      // Valid placement: show water pump preview
      const buildingPadding = scaledTileSize * 0.1;
      const buildingSize = scaledTileSize - buildingPadding * 2;
      
      this.ctx.fillStyle = 'rgba(25, 118, 210, 0.6)'; // Blue with transparency
      this.ctx.fillRect(
        screenPos.screenX + buildingPadding,
        screenPos.screenY + buildingPadding,
        buildingSize,
        buildingSize
      );
      
      // Water drop preview
      const dropSize = buildingSize * 0.5;
      const dropX = screenPos.screenX + scaledTileSize / 2;
      const dropY = screenPos.screenY + scaledTileSize / 2 - dropSize / 4;
      
      this.ctx.fillStyle = 'rgba(227, 242, 253, 0.8)';
      this.ctx.beginPath();
      this.ctx.moveTo(dropX, dropY - dropSize * 0.4);
      this.ctx.bezierCurveTo(
        dropX, dropY,
        dropX + dropSize * 0.5, dropY + dropSize * 0.3,
        dropX, dropY + dropSize * 0.6
      );
      this.ctx.bezierCurveTo(
        dropX - dropSize * 0.5, dropY + dropSize * 0.3,
        dropX, dropY,
        dropX, dropY - dropSize * 0.4
      );
      this.ctx.closePath();
      this.ctx.fill();
      
      // Border
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    } else {
      // Invalid placement: show red overlay
      this.ctx.fillStyle = 'rgba(244, 67, 54, 0.4)';
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      this.ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    }
  }

  /**
   * Render water pipe placement preview
   */
  renderWaterPipePlacementPreview(
    gridX: number,
    gridY: number,
    camera: Camera,
    isValid: boolean
  ): void {
    const screenPos = gridToScreen({ gridX, gridY }, camera);
    const scaledTileSize = getScaledTileSize(camera);
    
    const centerX = screenPos.screenX + scaledTileSize / 2;
    const centerY = screenPos.screenY + scaledTileSize / 2;
    
    if (isValid) {
      // Valid placement: show water pipe preview
      const crossSize = scaledTileSize * 0.2;
      this.ctx.strokeStyle = 'rgba(25, 118, 210, 0.8)'; // Blue
      this.ctx.lineWidth = Math.max(3, scaledTileSize * 0.12);
      this.ctx.lineCap = 'round';
      
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - crossSize, centerY);
      this.ctx.lineTo(centerX + crossSize, centerY);
      this.ctx.moveTo(centerX, centerY - crossSize);
      this.ctx.lineTo(centerX, centerY + crossSize);
      this.ctx.stroke();
      
      // Add border
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    } else {
      // Invalid placement: show red overlay
      this.ctx.fillStyle = 'rgba(244, 67, 54, 0.4)';
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      this.ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    }
  }

  /**
   * Render police station placement preview with coverage radius
   * The coverage radius is 8 tiles (Manhattan distance)
   */
  renderPoliceStationPlacementPreview(
    gridX: number,
    gridY: number,
    camera: Camera,
    isValid: boolean
  ): void {
    const screenPos = gridToScreen({ gridX, gridY }, camera);
    const scaledTileSize = getScaledTileSize(camera);
    const coverageRadius = 8; // POLICE_COVERAGE_RADIUS from gameStore
    
    // Always render coverage radius preview (even if placement is invalid)
    // This helps players understand the coverage area
    this.renderPoliceCoverageRadius(gridX, gridY, camera, coverageRadius);
    
    if (isValid) {
      // Valid placement: show police station preview
      const buildingPadding = scaledTileSize * 0.1;
      const buildingSize = scaledTileSize - buildingPadding * 2;
      
      this.ctx.fillStyle = 'rgba(21, 101, 192, 0.6)'; // Police blue with transparency
      this.ctx.fillRect(
        screenPos.screenX + buildingPadding,
        screenPos.screenY + buildingPadding,
        buildingSize,
        buildingSize
      );
      
      // Badge preview (star shape)
      const badgeSize = buildingSize * 0.45;
      const centerX = screenPos.screenX + scaledTileSize / 2;
      const centerY = screenPos.screenY + scaledTileSize / 2;
      
      this.ctx.fillStyle = 'rgba(255, 215, 0, 0.8)'; // Gold badge
      this.ctx.beginPath();
      const spikes = 6;
      const outerRadius = badgeSize / 2;
      const innerRadius = badgeSize / 4;
      
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.closePath();
      this.ctx.fill();
      
      // Border
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    } else {
      // Invalid placement: show red overlay
      this.ctx.fillStyle = 'rgba(244, 67, 54, 0.4)';
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      this.ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
    }
  }
  
  /**
   * Render the police coverage radius as a semi-transparent blue overlay
   * Uses Manhattan distance (diamond shape) to match the actual coverage calculation
   */
  private renderPoliceCoverageRadius(
    centerGridX: number,
    centerGridY: number,
    camera: Camera,
    radius: number
  ): void {
    const scaledTileSize = getScaledTileSize(camera);
    
    // Render all tiles within Manhattan distance of radius
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        // Skip the center tile (it's rendered separately as the building preview)
        if (dx === 0 && dy === 0) continue;
        
        // Check Manhattan distance
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance > radius) continue;
        
        const tileX = centerGridX + dx;
        const tileY = centerGridY + dy;
        
        // Skip tiles outside map bounds
        if (tileX < 0 || tileX >= MAP_SIZE || tileY < 0 || tileY >= MAP_SIZE) continue;
        
        const tileScreenPos = gridToScreen({ gridX: tileX, gridY: tileY }, camera);
        
        // Semi-transparent blue overlay for coverage area
        // Fade based on distance from center
        const alphaBase = 0.15;
        const alphaFade = (1 - distance / radius) * 0.1;
        this.ctx.fillStyle = `rgba(33, 150, 243, ${alphaBase + alphaFade})`; // Blue
        this.ctx.fillRect(
          tileScreenPos.screenX,
          tileScreenPos.screenY,
          scaledTileSize,
          scaledTileSize
        );
      }
    }
    
    // Draw coverage boundary outline (diamond shape)
    const centerScreenPos = gridToScreen({ gridX: centerGridX, gridY: centerGridY }, camera);
    const centerX = centerScreenPos.screenX + scaledTileSize / 2;
    const centerY = centerScreenPos.screenY + scaledTileSize / 2;
    const radiusPixels = (radius + 0.5) * scaledTileSize;
    
    this.ctx.strokeStyle = 'rgba(33, 150, 243, 0.6)'; // Blue outline
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    // Diamond shape (rotated square based on Manhattan distance)
    this.ctx.moveTo(centerX, centerY - radiusPixels); // Top
    this.ctx.lineTo(centerX + radiusPixels, centerY); // Right
    this.ctx.lineTo(centerX, centerY + radiusPixels); // Bottom
    this.ctx.lineTo(centerX - radiusPixels, centerY); // Left
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  /**
   * Render debug information
   */
  renderDebugInfo(
    camera: Camera,
    viewport: Viewport,
    fps: number
  ): void {
    const bounds = getVisibleTileBounds(camera, viewport);
    const tileCount = (bounds.endX - bounds.startX + 1) * (bounds.endY - bounds.startY + 1);

    this.ctx.fillStyle = 'white';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(`FPS: ${fps.toFixed(0)}`, 10, 20);
    this.ctx.fillText(`Visible tiles: ${tileCount}`, 10, 35);
    this.ctx.fillText(
      `Camera: (${camera.x.toFixed(0)}, ${camera.y.toFixed(0)})`,
      10,
      50
    );
    this.ctx.fillText(`Zoom: ${camera.zoom.toFixed(2)}x`, 10, 65);
    this.ctx.fillText(`Tile size: ${TILE_SIZE}px`, 10, 80);
  }

  /**
   * Update grid configuration
   */
  setGridConfig(config: Partial<GridLineConfig>): void {
    this.gridConfig = { ...this.gridConfig, ...config };
  }

  /**
   * Render bulldoze preview on a tile
   * - Red tint if there's something to remove
   * - Gray/neutral if nothing to remove (empty tile)
   * @param gridX - X coordinate in grid space
   * @param gridY - Y coordinate in grid space
   * @param camera - Current camera state
   * @param canBulldoze - Whether there's something to bulldoze at this location
   */
  renderBulldozePreview(
    gridX: number,
    gridY: number,
    camera: Camera,
    canBulldoze: boolean
  ): void {
    const screenPos = gridToScreen({ gridX, gridY }, camera);
    const scaledTileSize = getScaledTileSize(camera);

    if (canBulldoze) {
      // Something to bulldoze: show red tint indicating "will be removed"
      this.ctx.fillStyle = 'rgba(244, 67, 54, 0.5)'; // Red overlay
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      // Red border
      this.ctx.strokeStyle = 'rgba(244, 67, 54, 0.9)';
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(
        screenPos.screenX + 1.5,
        screenPos.screenY + 1.5,
        scaledTileSize - 3,
        scaledTileSize - 3
      );
      
      // Draw X icon in center to indicate demolition
      const iconSize = Math.max(12, scaledTileSize * 0.4);
      const centerX = screenPos.screenX + scaledTileSize / 2;
      const centerY = screenPos.screenY + scaledTileSize / 2;
      
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      this.ctx.lineWidth = Math.max(2, scaledTileSize * 0.08);
      this.ctx.lineCap = 'round';
      
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - iconSize / 2, centerY - iconSize / 2);
      this.ctx.lineTo(centerX + iconSize / 2, centerY + iconSize / 2);
      this.ctx.moveTo(centerX + iconSize / 2, centerY - iconSize / 2);
      this.ctx.lineTo(centerX - iconSize / 2, centerY + iconSize / 2);
      this.ctx.stroke();
    } else {
      // Nothing to bulldoze: show neutral/gray indicator
      this.ctx.fillStyle = 'rgba(158, 158, 158, 0.3)'; // Gray overlay
      this.ctx.fillRect(screenPos.screenX, screenPos.screenY, scaledTileSize, scaledTileSize);
      
      // Gray border
      this.ctx.strokeStyle = 'rgba(158, 158, 158, 0.6)';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(
        screenPos.screenX + 1,
        screenPos.screenY + 1,
        scaledTileSize - 2,
        scaledTileSize - 2
      );
      this.ctx.setLineDash([]);
    }
  }

  /**
   * Render disaster effects on affected tiles
   * 
   * @param affectedTiles - Map of tile coordinates to disaster type
   * @param camera - Current camera state
   * @param viewport - Viewport dimensions
   * @param animationTime - Time value for animations (e.g., performance.now())
   */
  renderDisasterEffects(
    affectedTiles: Map<string, DisasterType>,
    camera: Camera,
    viewport: Viewport,
    animationTime: number
  ): void {
    const bounds = getVisibleTileBounds(camera, viewport);
    const scaledTileSize = getScaledTileSize(camera);

    for (const [tileKey, disasterType] of affectedTiles) {
      const parts = tileKey.split(',').map(Number);
      const x = parts[0];
      const y = parts[1];
      
      // Skip if coordinates are invalid
      if (x === undefined || y === undefined) continue;
      
      // Skip if outside visible bounds
      if (x < bounds.startX || x > bounds.endX || y < bounds.startY || y > bounds.endY) {
        continue;
      }
      
      const screenPos = gridToScreen({ gridX: x, gridY: y }, camera);
      
      switch (disasterType) {
        case 'fire':
          this.renderFireEffect(screenPos.screenX, screenPos.screenY, scaledTileSize, animationTime);
          break;
        case 'tornado':
          // Tornado is rendered as a moving sprite, handled separately
          break;
        case 'earthquake':
          // Earthquake is instant and shown via screen shake
          break;
      }
    }
  }

  /**
   * Render flickering fire effect on a tile
   */
  private renderFireEffect(
    x: number,
    y: number,
    size: number,
    animationTime: number
  ): void {
    // Create flickering effect with multiple semi-transparent layers
    const flickerPhase = (Math.sin(animationTime * 0.01) + 1) * 0.5;
    const flickerPhase2 = (Math.sin(animationTime * 0.015 + 1) + 1) * 0.5;
    
    // Base fire color (orange-red)
    const alpha = 0.4 + flickerPhase * 0.3;
    this.ctx.fillStyle = `rgba(255, ${Math.floor(80 + flickerPhase * 80)}, 0, ${alpha})`;
    this.ctx.fillRect(x, y, size, size);
    
    // Secondary flame layer (yellow-orange)
    const alpha2 = 0.2 + flickerPhase2 * 0.2;
    this.ctx.fillStyle = `rgba(255, ${Math.floor(150 + flickerPhase2 * 105)}, 0, ${alpha2})`;
    
    // Draw flame shapes
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const flameHeight = size * (0.6 + flickerPhase * 0.2);
    const flameWidth = size * 0.4;
    
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - flameWidth / 2, y + size);
    this.ctx.quadraticCurveTo(
      centerX - flameWidth / 4,
      centerY,
      centerX,
      y + size - flameHeight
    );
    this.ctx.quadraticCurveTo(
      centerX + flameWidth / 4,
      centerY,
      centerX + flameWidth / 2,
      y + size
    );
    this.ctx.closePath();
    this.ctx.fill();
    
    // Add glow effect
    this.ctx.fillStyle = `rgba(255, 200, 50, ${0.1 + flickerPhase * 0.1})`;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, size * 0.6, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Fire border/outline
    this.ctx.strokeStyle = `rgba(255, 100, 0, ${0.6 + flickerPhase * 0.4})`;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
  }

  /**
   * Render tornado sprite at a specific position
   * 
   * @param position - World position of the tornado
   * @param camera - Current camera state
   * @param animationTime - Time value for animations
   */
  renderTornado(
    position: { x: number; y: number },
    camera: Camera,
    animationTime: number
  ): void {
    const screenPos = gridToScreen(
      { gridX: position.x, gridY: position.y },
      camera
    );
    const scaledTileSize = getScaledTileSize(camera);
    
    // Tornado is larger than a single tile
    const tornadoWidth = scaledTileSize * 1.5;
    const tornadoHeight = scaledTileSize * 3;
    const centerX = screenPos.screenX + scaledTileSize / 2;
    const baseY = screenPos.screenY + scaledTileSize;
    
    // Rotation animation
    const rotation = (animationTime * 0.02) % (Math.PI * 2);
    
    this.ctx.save();
    this.ctx.translate(centerX, baseY - tornadoHeight / 2);
    
    // Draw funnel shape with swirling effect
    const segments = 20;
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const segmentHeight = tornadoHeight / segments;
      const segmentY = -tornadoHeight / 2 + i * segmentHeight;
      
      // Width tapers from bottom (wide) to top (narrow)
      const widthFactor = 1 - t * 0.7;
      const segmentWidth = tornadoWidth * widthFactor;
      
      // Swirl offset
      const swirlOffset = Math.sin(rotation + t * Math.PI * 4) * segmentWidth * 0.2;
      
      // Gradient alpha (darker at edges)
      const alpha = 0.3 + (1 - Math.abs(t - 0.5) * 2) * 0.4;
      
      // Gray-blue tornado color
      this.ctx.fillStyle = `rgba(100, 120, 140, ${alpha})`;
      this.ctx.fillRect(
        -segmentWidth / 2 + swirlOffset,
        segmentY,
        segmentWidth,
        segmentHeight + 1
      );
      
      // Debris particles
      if (i % 3 === 0) {
        const debrisX = swirlOffset + (Math.random() - 0.5) * segmentWidth;
        const debrisSize = Math.max(2, scaledTileSize * 0.08);
        this.ctx.fillStyle = 'rgba(80, 60, 40, 0.7)';
        this.ctx.fillRect(debrisX - debrisSize / 2, segmentY, debrisSize, debrisSize);
      }
    }
    
    // Add swirling lines for motion effect
    this.ctx.strokeStyle = 'rgba(150, 170, 190, 0.5)';
    this.ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const startAngle = rotation + i * (Math.PI * 2 / 3);
      this.ctx.beginPath();
      for (let t = 0; t <= 1; t += 0.1) {
        const y = -tornadoHeight / 2 + t * tornadoHeight;
        const width = tornadoWidth * (1 - t * 0.7) / 2;
        const angle = startAngle + t * Math.PI * 6;
        const x = Math.cos(angle) * width;
        if (t === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.stroke();
    }
    
    this.ctx.restore();
    
    // Ground dust cloud at base
    this.ctx.fillStyle = 'rgba(139, 119, 101, 0.4)';
    this.ctx.beginPath();
    this.ctx.ellipse(
      centerX,
      baseY,
      tornadoWidth * 0.8,
      scaledTileSize * 0.3,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.fill();
  }
}
