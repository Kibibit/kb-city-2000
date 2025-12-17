/**
 * DisasterSystem - Manages random disasters that can affect the city
 * 
 * Inspired by SimCity 2000, disasters add risk and excitement to gameplay.
 * They can destroy buildings and infrastructure, requiring players to rebuild.
 * 
 * Disaster Types:
 * - Fire: Starts on a developed tile, spreads to adjacent tiles over time
 * - Tornado: Spawns at map edge, moves across map destroying everything in path
 * - Earthquake: Affects entire map simultaneously, randomly damages buildings
 */

import { MAP_SIZE } from '@/types';
import type { Tile, PowerPlant, WaterPump } from '@/types';

// =============================================================================
// Disaster Types
// =============================================================================

/** Types of disasters that can occur */
export type DisasterType = 'fire' | 'tornado' | 'earthquake';

/**
 * Represents an active disaster in the game
 */
export interface ActiveDisaster {
  /** Unique identifier for this disaster instance */
  id: string;
  /** Type of disaster */
  type: DisasterType;
  /** Set of affected tile coordinates in 'x,y' format */
  affectedTiles: Set<string>;
  /** Game tick when the disaster started */
  startTick: number;
  /** Current tick count for this disaster (for tracking duration) */
  currentTick: number;
  /** For tornado: current position */
  position?: { x: number; y: number };
  /** For tornado: movement direction */
  direction?: { dx: number; dy: number };
  /** For fire: tiles that have already burned (can't burn again) */
  burnedTiles?: Set<string>;
}

/**
 * Result of applying disaster damage to the game state
 */
export interface DisasterDamage {
  /** Tiles that need to be updated (damaged/destroyed) */
  damagedTiles: Array<{ x: number; y: number }>;
  /** Power plants that were destroyed */
  destroyedPowerPlants: Array<{ x: number; y: number }>;
  /** Water pumps that were destroyed */
  destroyedWaterPumps: Array<{ x: number; y: number }>;
  /** Population lost */
  populationLost: number;
  /** Jobs lost */
  jobsLost: number;
}

// =============================================================================
// Disaster Configuration
// =============================================================================

/** Base disaster chance per month (0.5%) */
const BASE_DISASTER_CHANCE = 0.005;

/** Maximum disaster chance at high population (2%) */
const MAX_DISASTER_CHANCE = 0.02;

/** Population threshold for max disaster chance */
const HIGH_POPULATION_THRESHOLD = 10000;

/** Fire configuration */
const FIRE_CONFIG = {
  /** Ticks between fire spread attempts */
  spreadInterval: 2,
  /** Chance to spread to each adjacent tile (0-1) */
  spreadChance: 0.4,
  /** Maximum number of ticks before fire burns out */
  maxDuration: 15,
  /** Chance to destroy a building per tick (0-1) */
  damageChance: 0.3,
};

/** Tornado configuration */
const TORNADO_CONFIG = {
  /** Tiles moved per tick */
  speed: 1,
  /** Width of destruction path (tiles on each side of center) */
  pathWidth: 1,
};

/** Earthquake configuration */
const EARTHQUAKE_CONFIG = {
  /** Chance to damage each developed tile (0-1) */
  damageChance: 0.3,
  /** Chance to damage roads (0-1) */
  roadDamageChance: 0.15,
};

// =============================================================================
// Disaster System Class
// =============================================================================

/**
 * Manages disaster events in the game
 */
export class DisasterSystem {
  /** Map of active disasters by ID */
  private activeDisasters: Map<string, ActiveDisaster> = new Map();
  
  /** Counter for generating unique disaster IDs */
  private disasterIdCounter = 0;
  
  /** Current game tick (for tracking disaster timing) */
  private currentGameTick = 0;

  /**
   * Generate a unique ID for a new disaster
   */
  private generateId(): string {
    return `disaster_${++this.disasterIdCounter}_${Date.now()}`;
  }

  /**
   * Check if a random disaster should occur this month
   * Chance increases with population (more to lose = more tension)
   * 
   * @param population - Current city population
   * @returns Type of disaster to trigger, or null if none
   */
  checkForRandomDisaster(population: number): DisasterType | null {
    // Calculate disaster chance based on population
    const populationFactor = Math.min(population / HIGH_POPULATION_THRESHOLD, 1);
    const disasterChance = BASE_DISASTER_CHANCE + (MAX_DISASTER_CHANCE - BASE_DISASTER_CHANCE) * populationFactor;
    
    // Roll for disaster
    if (Math.random() > disasterChance) {
      return null;
    }
    
    // Random disaster type selection (weighted)
    const roll = Math.random();
    if (roll < 0.5) {
      return 'fire';      // 50% chance
    } else if (roll < 0.85) {
      return 'tornado';   // 35% chance
    } else {
      return 'earthquake'; // 15% chance
    }
  }

  /**
   * Start a specific disaster
   * 
   * @param type - Type of disaster to start
   * @param tiles - Current game tiles (to find valid starting locations)
   * @returns The started disaster, or null if couldn't start
   */
  startDisaster(
    type: DisasterType,
    tiles: Tile[][]
  ): ActiveDisaster | null {
    this.currentGameTick++;
    
    switch (type) {
      case 'fire':
        return this.startFire(tiles);
      case 'tornado':
        return this.startTornado();
      case 'earthquake':
        return this.startEarthquake(tiles);
      default:
        return null;
    }
  }

  /**
   * Start a fire disaster on a random developed zone
   */
  private startFire(tiles: Tile[][]): ActiveDisaster | null {
    // Find all developed tiles (potential fire starting points)
    const developedTiles: Array<{ x: number; y: number }> = [];
    
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = tiles[y]?.[x];
        if (tile && tile.zone && tile.developmentProgress >= 100) {
          developedTiles.push({ x, y });
        }
      }
    }
    
    // Need at least one developed tile to start fire
    if (developedTiles.length === 0) {
      return null;
    }
    
    // Pick a random developed tile
    const startTile = developedTiles[Math.floor(Math.random() * developedTiles.length)];
    
    // Safety check (shouldn't happen since we checked length > 0)
    if (!startTile) {
      return null;
    }
    
    const disaster: ActiveDisaster = {
      id: this.generateId(),
      type: 'fire',
      affectedTiles: new Set([`${startTile.x},${startTile.y}`]),
      startTick: this.currentGameTick,
      currentTick: 0,
      burnedTiles: new Set(),
    };
    
    this.activeDisasters.set(disaster.id, disaster);
    return disaster;
  }

  /**
   * Start a tornado disaster at a random map edge
   */
  private startTornado(): ActiveDisaster {
    // Choose random edge and direction
    const edge = Math.floor(Math.random() * 4);
    let position: { x: number; y: number };
    let direction: { dx: number; dy: number };
    
    switch (edge) {
      case 0: // Top edge, moving down
        position = { x: Math.floor(Math.random() * MAP_SIZE), y: 0 };
        direction = { dx: (Math.random() - 0.5) * 0.5, dy: 1 };
        break;
      case 1: // Bottom edge, moving up
        position = { x: Math.floor(Math.random() * MAP_SIZE), y: MAP_SIZE - 1 };
        direction = { dx: (Math.random() - 0.5) * 0.5, dy: -1 };
        break;
      case 2: // Left edge, moving right
        position = { x: 0, y: Math.floor(Math.random() * MAP_SIZE) };
        direction = { dx: 1, dy: (Math.random() - 0.5) * 0.5 };
        break;
      case 3: // Right edge, moving left
      default:
        position = { x: MAP_SIZE - 1, y: Math.floor(Math.random() * MAP_SIZE) };
        direction = { dx: -1, dy: (Math.random() - 0.5) * 0.5 };
        break;
    }
    
    // Normalize direction
    const magnitude = Math.sqrt(direction.dx ** 2 + direction.dy ** 2);
    direction.dx /= magnitude;
    direction.dy /= magnitude;
    
    const disaster: ActiveDisaster = {
      id: this.generateId(),
      type: 'tornado',
      affectedTiles: new Set([`${Math.floor(position.x)},${Math.floor(position.y)}`]),
      startTick: this.currentGameTick,
      currentTick: 0,
      position,
      direction,
    };
    
    this.activeDisasters.set(disaster.id, disaster);
    return disaster;
  }

  /**
   * Start an earthquake disaster (affects entire map)
   */
  private startEarthquake(tiles: Tile[][]): ActiveDisaster {
    const affectedTiles = new Set<string>();
    
    // Mark all developed tiles as potentially affected
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = tiles[y]?.[x];
        if (tile && (tile.zone || tile.hasRoad)) {
          affectedTiles.add(`${x},${y}`);
        }
      }
    }
    
    const disaster: ActiveDisaster = {
      id: this.generateId(),
      type: 'earthquake',
      affectedTiles,
      startTick: this.currentGameTick,
      currentTick: 0,
    };
    
    this.activeDisasters.set(disaster.id, disaster);
    return disaster;
  }

  /**
   * Update all active disasters (spread fire, move tornado, etc.)
   * Should be called each game tick
   * 
   * @param tiles - Current game tiles
   * @param powerPlants - Current power plants
   * @param waterPumps - Current water pumps
   * @returns Damage to apply to the game state
   */
  update(
    tiles: Tile[][],
    powerPlants: PowerPlant[],
    waterPumps: WaterPump[]
  ): DisasterDamage {
    const damage: DisasterDamage = {
      damagedTiles: [],
      destroyedPowerPlants: [],
      destroyedWaterPumps: [],
      populationLost: 0,
      jobsLost: 0,
    };
    
    const disastersToRemove: string[] = [];
    
    for (const [_id, disaster] of this.activeDisasters) {
      disaster.currentTick++;
      
      switch (disaster.type) {
        case 'fire':
          this.updateFire(disaster, tiles, powerPlants, waterPumps, damage, disastersToRemove);
          break;
        case 'tornado':
          this.updateTornado(disaster, tiles, powerPlants, waterPumps, damage, disastersToRemove);
          break;
        case 'earthquake':
          this.updateEarthquake(disaster, tiles, powerPlants, waterPumps, damage, disastersToRemove);
          break;
      }
    }
    
    // Remove finished disasters
    for (const id of disastersToRemove) {
      this.activeDisasters.delete(id);
    }
    
    return damage;
  }

  /**
   * Update fire disaster: spread to adjacent tiles and damage buildings
   */
  private updateFire(
    disaster: ActiveDisaster,
    tiles: Tile[][],
    powerPlants: PowerPlant[],
    waterPumps: WaterPump[],
    damage: DisasterDamage,
    disastersToRemove: string[]
  ): void {
    // Check if fire should burn out
    if (disaster.currentTick >= FIRE_CONFIG.maxDuration || disaster.affectedTiles.size === 0) {
      disastersToRemove.push(disaster.id);
      return;
    }
    
    // Try to spread fire on spread intervals
    if (disaster.currentTick % FIRE_CONFIG.spreadInterval === 0) {
      const newFires = new Set<string>();
      
      for (const tileKey of disaster.affectedTiles) {
        const parts = tileKey.split(',').map(Number);
        const x = parts[0];
        const y = parts[1];
        
        // Skip if coordinates are invalid
        if (x === undefined || y === undefined) continue;
        
        // Damage current tile
        if (Math.random() < FIRE_CONFIG.damageChance && !disaster.burnedTiles?.has(tileKey)) {
          const tile = tiles[y]?.[x];
          if (tile && tile.zone && tile.developmentProgress >= 100) {
            damage.damagedTiles.push({ x, y });
            
            // Track population/job loss
            if (tile.zone === 'residential') {
              damage.populationLost += tile.population;
            } else {
              damage.jobsLost += tile.jobs;
            }
            
            disaster.burnedTiles?.add(tileKey);
          }
          
          // Check if fire hits infrastructure
          const hitPowerPlant = powerPlants.find(pp => pp.x === x && pp.y === y);
          if (hitPowerPlant) {
            damage.destroyedPowerPlants.push({ x, y });
          }
          
          const hitWaterPump = waterPumps.find(wp => wp.x === x && wp.y === y);
          if (hitWaterPump) {
            damage.destroyedWaterPumps.push({ x, y });
          }
        }
        
        // Try to spread to adjacent tiles
        const adjacentCoords = [
          { x: x - 1, y },
          { x: x + 1, y },
          { x, y: y - 1 },
          { x, y: y + 1 },
        ];
        
        for (const coord of adjacentCoords) {
          if (coord.x === undefined || coord.y === undefined) continue;
          if (coord.x < 0 || coord.x >= MAP_SIZE || coord.y < 0 || coord.y >= MAP_SIZE) {
            continue;
          }
          
          const adjacentKey = `${coord.x},${coord.y}`;
          if (disaster.affectedTiles.has(adjacentKey) || disaster.burnedTiles?.has(adjacentKey)) {
            continue;
          }
          
          const adjacentTile = tiles[coord.y]?.[coord.x];
          if (!adjacentTile) continue;
          
          // Fire can spread to zones and buildings (but not water)
          const canBurn = adjacentTile.terrain !== 'water' && 
                         (adjacentTile.zone || adjacentTile.hasRoad);
          
          if (canBurn && Math.random() < FIRE_CONFIG.spreadChance) {
            newFires.add(adjacentKey);
          }
        }
      }
      
      // Add new fires
      for (const fireKey of newFires) {
        disaster.affectedTiles.add(fireKey);
      }
    }
    
    // Remove tiles that have fully burned
    for (const burnedKey of disaster.burnedTiles || []) {
      disaster.affectedTiles.delete(burnedKey);
    }
  }

  /**
   * Update tornado disaster: move across map and destroy everything in path
   */
  private updateTornado(
    disaster: ActiveDisaster,
    tiles: Tile[][],
    powerPlants: PowerPlant[],
    waterPumps: WaterPump[],
    damage: DisasterDamage,
    disastersToRemove: string[]
  ): void {
    if (!disaster.position || !disaster.direction) {
      disastersToRemove.push(disaster.id);
      return;
    }
    
    // Move tornado
    disaster.position.x += disaster.direction.dx * TORNADO_CONFIG.speed;
    disaster.position.y += disaster.direction.dy * TORNADO_CONFIG.speed;
    
    // Check if tornado has left the map
    if (
      disaster.position.x < -2 ||
      disaster.position.x >= MAP_SIZE + 2 ||
      disaster.position.y < -2 ||
      disaster.position.y >= MAP_SIZE + 2
    ) {
      disastersToRemove.push(disaster.id);
      return;
    }
    
    // Update affected tiles (tornado path)
    disaster.affectedTiles.clear();
    
    const centerX = Math.floor(disaster.position.x);
    const centerY = Math.floor(disaster.position.y);
    
    for (let dx = -TORNADO_CONFIG.pathWidth; dx <= TORNADO_CONFIG.pathWidth; dx++) {
      for (let dy = -TORNADO_CONFIG.pathWidth; dy <= TORNADO_CONFIG.pathWidth; dy++) {
        const x = centerX + dx;
        const y = centerY + dy;
        
        if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) {
          continue;
        }
        
        const tileKey = `${x},${y}`;
        disaster.affectedTiles.add(tileKey);
        
        // Tornado destroys everything in its path
        const tile = tiles[y]?.[x];
        if (tile && (tile.zone || tile.hasRoad || tile.hasPowerLine || tile.hasWaterPipe)) {
          damage.damagedTiles.push({ x, y });
          
          // Track population/job loss
          if (tile.zone === 'residential' && tile.developmentProgress >= 100) {
            damage.populationLost += tile.population;
          } else if (tile.zone && tile.developmentProgress >= 100) {
            damage.jobsLost += tile.jobs;
          }
        }
        
        // Check if tornado hits infrastructure buildings
        const hitPowerPlant = powerPlants.find(pp => pp.x === x && pp.y === y);
        if (hitPowerPlant) {
          damage.destroyedPowerPlants.push({ x, y });
        }
        
        const hitWaterPump = waterPumps.find(wp => wp.x === x && wp.y === y);
        if (hitWaterPump) {
          damage.destroyedWaterPumps.push({ x, y });
        }
      }
    }
  }

  /**
   * Update earthquake disaster: instant damage to random tiles
   */
  private updateEarthquake(
    disaster: ActiveDisaster,
    tiles: Tile[][],
    powerPlants: PowerPlant[],
    waterPumps: WaterPump[],
    damage: DisasterDamage,
    disastersToRemove: string[]
  ): void {
    // Earthquake is instant (one tick)
    if (disaster.currentTick > 1) {
      disastersToRemove.push(disaster.id);
      return;
    }
    
    // Damage random developed tiles
    for (const tileKey of disaster.affectedTiles) {
      const parts = tileKey.split(',').map(Number);
      const x = parts[0];
      const y = parts[1];
      
      // Skip if coordinates are invalid
      if (x === undefined || y === undefined) continue;
      
      const tile = tiles[y]?.[x];
      if (!tile) continue;
      
      // Different damage chances for different structures
      let shouldDamage = false;
      if (tile.zone && tile.developmentProgress >= 100) {
        shouldDamage = Math.random() < EARTHQUAKE_CONFIG.damageChance;
      } else if (tile.hasRoad) {
        shouldDamage = Math.random() < EARTHQUAKE_CONFIG.roadDamageChance;
      }
      
      if (shouldDamage) {
        damage.damagedTiles.push({ x, y });
        
        // Track population/job loss
        if (tile.zone === 'residential') {
          damage.populationLost += tile.population;
        } else if (tile.zone) {
          damage.jobsLost += tile.jobs;
        }
      }
    }
    
    // Damage power plants and water pumps
    for (const plant of powerPlants) {
      if (Math.random() < EARTHQUAKE_CONFIG.damageChance * 0.5) {
        damage.destroyedPowerPlants.push({ x: plant.x, y: plant.y });
      }
    }
    
    for (const pump of waterPumps) {
      if (Math.random() < EARTHQUAKE_CONFIG.damageChance * 0.5) {
        damage.destroyedWaterPumps.push({ x: pump.x, y: pump.y });
      }
    }
    
    // Clear affected tiles after earthquake (it's instant)
    disaster.affectedTiles.clear();
    disastersToRemove.push(disaster.id);
  }

  /**
   * Get all tiles currently affected by any disaster
   * 
   * @returns Map of tile coordinates to disaster type
   */
  getAffectedTiles(): Map<string, DisasterType> {
    const affectedMap = new Map<string, DisasterType>();
    
    for (const disaster of this.activeDisasters.values()) {
      for (const tileKey of disaster.affectedTiles) {
        affectedMap.set(tileKey, disaster.type);
      }
    }
    
    return affectedMap;
  }

  /**
   * Get all active disasters
   */
  getActiveDisasters(): ActiveDisaster[] {
    return Array.from(this.activeDisasters.values());
  }

  /**
   * Check if any disasters are currently active
   */
  hasActiveDisasters(): boolean {
    return this.activeDisasters.size > 0;
  }

  /**
   * Check if a specific disaster type is active
   */
  hasActiveDisasterType(type: DisasterType): boolean {
    for (const disaster of this.activeDisasters.values()) {
      if (disaster.type === type) return true;
    }
    return false;
  }

  /**
   * Force end all active disasters (for debug/testing)
   */
  clearAllDisasters(): void {
    this.activeDisasters.clear();
  }

  /**
   * Get the current position of a tornado (for rendering)
   */
  getTornadoPosition(): { x: number; y: number } | null {
    for (const disaster of this.activeDisasters.values()) {
      if (disaster.type === 'tornado' && disaster.position) {
        return { ...disaster.position };
      }
    }
    return null;
  }
}

// Export singleton instance
export const disasterSystem = new DisasterSystem();
