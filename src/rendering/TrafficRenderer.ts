import type { Camera, Viewport, GridPosition } from '../types';
import { TILE_SIZE } from '../types';
import { getVisibleTileBounds } from './coordinates';

/**
 * Direction a vehicle can travel
 */
type VehicleDirection = 'n' | 's' | 'e' | 'w';

/**
 * Represents a single vehicle on the road
 */
interface Vehicle {
  /** Unique identifier */
  id: number;
  /** Current X position in world pixels */
  x: number;
  /** Current Y position in world pixels */
  y: number;
  /** Target X position in world pixels */
  targetX: number;
  /** Target Y position in world pixels */
  targetY: number;
  /** Movement speed in pixels per second */
  speed: number;
  /** Vehicle color */
  color: string;
  /** Current direction of travel */
  direction: VehicleDirection;
  /** Current grid position (for path finding) */
  currentGridX: number;
  currentGridY: number;
  /** Target grid position */
  targetGridX: number;
  targetGridY: number;
}

/**
 * Vehicle color palette for visual variety
 */
const VEHICLE_COLORS = [
  '#E53935', // Red
  '#1E88E5', // Blue
  '#FFFFFF', // White
  '#FDD835', // Yellow
  '#43A047', // Green
  '#7E57C2', // Purple
  '#FF7043', // Orange
  '#26C6DA', // Cyan
];

/**
 * Traffic density thresholds based on population
 */
const TRAFFIC_THRESHOLDS = {
  /** Light traffic under 2000 population */
  light: 2000,
  /** Medium traffic between 2000 and 10000 population */
  medium: 10000,
};

/**
 * Vehicle configuration
 */
const VEHICLE_CONFIG = {
  /** Base vehicle width at 1x zoom (4 pixels) */
  baseWidth: 4,
  /** Base vehicle length at 1x zoom (8 pixels) */
  baseLength: 8,
  /** Base speed in pixels per second */
  baseSpeed: 30,
  /** Speed variation (±) */
  speedVariation: 10,
  /** Maximum number of vehicles regardless of population */
  maxVehicles: 50,
  /** How often to spawn new vehicles (ms) */
  spawnInterval: 500,
};

/**
 * Renders animated traffic (vehicles) on roads
 */
export class TrafficRenderer {
  private vehicles: Vehicle[] = [];
  private nextVehicleId = 0;
  private lastSpawnTime = 0;

  /**
   * Calculate the target number of vehicles based on population
   * Light traffic: < 2,000 pop → few cars (5-15)
   * Medium traffic: 2,000 - 10,000 → moderate cars (15-35)
   * Heavy traffic: > 10,000 → many cars (35-50)
   */
  private calculateTargetVehicleCount(population: number): number {
    if (population < TRAFFIC_THRESHOLDS.light) {
      // Light traffic: 5-15 vehicles, scaled by population
      const scale = population / TRAFFIC_THRESHOLDS.light;
      return Math.max(0, Math.min(15, Math.floor(5 + scale * 10)));
    } else if (population < TRAFFIC_THRESHOLDS.medium) {
      // Medium traffic: 15-35 vehicles
      const scale = (population - TRAFFIC_THRESHOLDS.light) / 
                   (TRAFFIC_THRESHOLDS.medium - TRAFFIC_THRESHOLDS.light);
      return Math.floor(15 + scale * 20);
    } else {
      // Heavy traffic: 35-50 vehicles, capped at max
      const scale = Math.min(1, (population - TRAFFIC_THRESHOLDS.medium) / TRAFFIC_THRESHOLDS.medium);
      return Math.min(VEHICLE_CONFIG.maxVehicles, Math.floor(35 + scale * 15));
    }
  }

  /**
   * Get random vehicle color
   */
  private getRandomColor(): string {
    const index = Math.floor(Math.random() * VEHICLE_COLORS.length);
    return VEHICLE_COLORS[index] ?? '#FFFFFF';
  }

  /**
   * Get random speed with variation
   */
  private getRandomSpeed(): number {
    return VEHICLE_CONFIG.baseSpeed + 
           (Math.random() * 2 - 1) * VEHICLE_CONFIG.speedVariation;
  }

  /**
   * Get adjacent road tiles from a position
   */
  private getAdjacentRoads(
    gridX: number, 
    gridY: number, 
    roads: GridPosition[],
    excludeDirection?: VehicleDirection
  ): Array<{ pos: GridPosition; direction: VehicleDirection }> {
    const adjacent: Array<{ pos: GridPosition; direction: VehicleDirection }> = [];
    
    const directions: Array<{ dx: number; dy: number; dir: VehicleDirection }> = [
      { dx: 0, dy: -1, dir: 'n' },
      { dx: 0, dy: 1, dir: 's' },
      { dx: -1, dy: 0, dir: 'w' },
      { dx: 1, dy: 0, dir: 'e' },
    ];
    
    // Exclude the opposite of the excluded direction (don't go backwards)
    const oppositeDir: Record<VehicleDirection, VehicleDirection> = {
      'n': 's', 's': 'n', 'e': 'w', 'w': 'e'
    };
    
    for (const { dx, dy, dir } of directions) {
      // Skip if this is the opposite of our excluded direction (no U-turns)
      if (excludeDirection && dir === oppositeDir[excludeDirection]) {
        continue;
      }
      
      const targetX = gridX + dx;
      const targetY = gridY + dy;
      
      // Check if there's a road at this position
      const hasRoad = roads.some(r => r.gridX === targetX && r.gridY === targetY);
      if (hasRoad) {
        adjacent.push({ pos: { gridX: targetX, gridY: targetY }, direction: dir });
      }
    }
    
    return adjacent;
  }

  /**
   * Convert grid position to world pixel position (center of tile)
   */
  private gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
    return {
      x: gridX * TILE_SIZE + TILE_SIZE / 2,
      y: gridY * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  /**
   * Spawn a new vehicle on a random road tile
   */
  private spawnVehicle(roads: GridPosition[]): Vehicle | null {
    if (roads.length === 0) return null;
    
    // Pick a random road tile
    const startIndex = Math.floor(Math.random() * roads.length);
    const startRoad = roads[startIndex];
    
    if (!startRoad) return null;
    
    // Get adjacent roads to determine initial direction
    const adjacentRoads = this.getAdjacentRoads(startRoad.gridX, startRoad.gridY, roads);
    
    if (adjacentRoads.length === 0) {
      // Isolated road tile, can't have traffic
      return null;
    }
    
    // Pick a random adjacent road as initial target
    const targetIndex = Math.floor(Math.random() * adjacentRoads.length);
    const target = adjacentRoads[targetIndex];
    
    if (!target) return null;
    
    const startWorld = this.gridToWorld(startRoad.gridX, startRoad.gridY);
    const targetWorld = this.gridToWorld(target.pos.gridX, target.pos.gridY);
    
    const vehicle: Vehicle = {
      id: this.nextVehicleId++,
      x: startWorld.x,
      y: startWorld.y,
      targetX: targetWorld.x,
      targetY: targetWorld.y,
      speed: this.getRandomSpeed(),
      color: this.getRandomColor(),
      direction: target.direction,
      currentGridX: startRoad.gridX,
      currentGridY: startRoad.gridY,
      targetGridX: target.pos.gridX,
      targetGridY: target.pos.gridY,
    };
    
    return vehicle;
  }

  /**
   * Pick a new target for a vehicle that has reached its destination
   */
  private pickNewTarget(vehicle: Vehicle, roads: GridPosition[]): void {
    // Vehicle has reached its target grid position
    vehicle.currentGridX = vehicle.targetGridX;
    vehicle.currentGridY = vehicle.targetGridY;
    
    // Get adjacent roads, excluding the direction we came from
    const adjacentRoads = this.getAdjacentRoads(
      vehicle.currentGridX, 
      vehicle.currentGridY, 
      roads,
      vehicle.direction
    );
    
    if (adjacentRoads.length === 0) {
      // Dead end - try to turn around
      const allAdjacent = this.getAdjacentRoads(vehicle.currentGridX, vehicle.currentGridY, roads);
      if (allAdjacent.length === 0) {
        // Truly isolated, remove vehicle by setting invalid position
        vehicle.currentGridX = -1;
        return;
      }
      const targetIndex = Math.floor(Math.random() * allAdjacent.length);
      const target = allAdjacent[targetIndex];
      if (!target) {
        vehicle.currentGridX = -1;
        return;
      }
      vehicle.targetGridX = target.pos.gridX;
      vehicle.targetGridY = target.pos.gridY;
      vehicle.direction = target.direction;
    } else {
      // Pick a random direction (weighted towards going straight if possible)
      let target: { pos: GridPosition; direction: VehicleDirection } | undefined;
      
      // Prefer going straight (70% chance if available)
      const straightAhead = adjacentRoads.find(r => r.direction === vehicle.direction);
      if (straightAhead && Math.random() < 0.7) {
        target = straightAhead;
      } else {
        const targetIndex = Math.floor(Math.random() * adjacentRoads.length);
        target = adjacentRoads[targetIndex];
      }
      
      if (!target) {
        vehicle.currentGridX = -1;
        return;
      }
      
      vehicle.targetGridX = target.pos.gridX;
      vehicle.targetGridY = target.pos.gridY;
      vehicle.direction = target.direction;
    }
    
    // Update world target position
    const targetWorld = this.gridToWorld(vehicle.targetGridX, vehicle.targetGridY);
    vehicle.targetX = targetWorld.x;
    vehicle.targetY = targetWorld.y;
  }

  /**
   * Update all vehicles
   * @param deltaTime - Time since last update in milliseconds
   * @param roads - Array of road tile positions
   * @param population - Current city population
   */
  update(deltaTime: number, roads: GridPosition[], population: number): void {
    // No traffic when population is 0
    if (population === 0) {
      this.vehicles = [];
      return;
    }

    const currentTime = performance.now();
    
    // Calculate target vehicle count based on population
    const targetCount = this.calculateTargetVehicleCount(population);
    
    // Spawn new vehicles if needed
    if (currentTime - this.lastSpawnTime > VEHICLE_CONFIG.spawnInterval) {
      this.lastSpawnTime = currentTime;
      
      // Spawn vehicles until we reach target count
      if (this.vehicles.length < targetCount && roads.length > 0) {
        const newVehicle = this.spawnVehicle(roads);
        if (newVehicle) {
          this.vehicles.push(newVehicle);
        }
      }
    }
    
    // Remove excess vehicles if population dropped
    while (this.vehicles.length > targetCount && this.vehicles.length > 0) {
      // Remove random vehicle
      const removeIndex = Math.floor(Math.random() * this.vehicles.length);
      this.vehicles.splice(removeIndex, 1);
    }
    
    // Update each vehicle's position
    const deltaSeconds = deltaTime / 1000;
    
    for (const vehicle of this.vehicles) {
      // Calculate distance to target
      const dx = vehicle.targetX - vehicle.x;
      const dy = vehicle.targetY - vehicle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 2) {
        // Reached target, pick new destination
        this.pickNewTarget(vehicle, roads);
      } else {
        // Move towards target
        const moveDistance = vehicle.speed * deltaSeconds;
        
        if (moveDistance >= distance) {
          // Will reach target this frame
          vehicle.x = vehicle.targetX;
          vehicle.y = vehicle.targetY;
        } else {
          // Interpolate position
          const ratio = moveDistance / distance;
          vehicle.x += dx * ratio;
          vehicle.y += dy * ratio;
        }
      }
    }
    
    // Remove invalid vehicles (those that hit dead ends)
    this.vehicles = this.vehicles.filter(v => v.currentGridX >= 0);
  }

  /**
   * Render all vehicles
   * @param ctx - Canvas rendering context
   * @param camera - Current camera state
   * @param viewport - Viewport dimensions
   */
  render(ctx: CanvasRenderingContext2D, camera: Camera, viewport: Viewport): void {
    if (this.vehicles.length === 0) return;
    
    const bounds = getVisibleTileBounds(camera, viewport);
    
    // Calculate vehicle dimensions based on zoom
    const vehicleWidth = VEHICLE_CONFIG.baseWidth * camera.zoom;
    const vehicleLength = VEHICLE_CONFIG.baseLength * camera.zoom;
    
    // Render each vehicle
    for (const vehicle of this.vehicles) {
      // Convert world position to grid position for culling
      const gridX = Math.floor(vehicle.x / TILE_SIZE);
      const gridY = Math.floor(vehicle.y / TILE_SIZE);
      
      // Skip vehicles outside visible bounds (with 1 tile padding)
      if (gridX < bounds.startX - 1 || gridX > bounds.endX + 1 ||
          gridY < bounds.startY - 1 || gridY > bounds.endY + 1) {
        continue;
      }
      
      // Convert world position to screen position
      const screenX = (vehicle.x - camera.x) * camera.zoom;
      const screenY = (vehicle.y - camera.y) * camera.zoom;
      
      // Save context state
      ctx.save();
      
      // Translate to vehicle position
      ctx.translate(screenX, screenY);
      
      // Rotate based on direction
      let rotation = 0;
      switch (vehicle.direction) {
        case 'n': rotation = -Math.PI / 2; break;
        case 's': rotation = Math.PI / 2; break;
        case 'e': rotation = 0; break;
        case 'w': rotation = Math.PI; break;
      }
      ctx.rotate(rotation);
      
      // Draw vehicle body (rectangle centered on position)
      ctx.fillStyle = vehicle.color;
      ctx.fillRect(
        -vehicleLength / 2,
        -vehicleWidth / 2,
        vehicleLength,
        vehicleWidth
      );
      
      // Draw vehicle outline for better visibility
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(
        -vehicleLength / 2,
        -vehicleWidth / 2,
        vehicleLength,
        vehicleWidth
      );
      
      // Draw headlights (small white rectangles at front)
      if (camera.zoom >= 0.75) {
        ctx.fillStyle = '#FFFFFF';
        const headlightSize = Math.max(1, vehicleWidth * 0.25);
        // Left headlight
        ctx.fillRect(
          vehicleLength / 2 - headlightSize,
          -vehicleWidth / 2,
          headlightSize,
          headlightSize
        );
        // Right headlight
        ctx.fillRect(
          vehicleLength / 2 - headlightSize,
          vehicleWidth / 2 - headlightSize,
          headlightSize,
          headlightSize
        );
      }
      
      // Restore context state
      ctx.restore();
    }
  }

  /**
   * Get current vehicle count for debugging
   */
  getVehicleCount(): number {
    return this.vehicles.length;
  }

  /**
   * Clear all vehicles (e.g., when loading a new game)
   */
  clear(): void {
    this.vehicles = [];
    this.lastSpawnTime = 0;
  }
}
