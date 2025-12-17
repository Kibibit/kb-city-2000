import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from './store/gameStore';
import { useUIStore, type GameSpeed } from './store/uiStore';
import { CanvasManager, TileRenderer, TrafficRenderer, getVisibleTileBounds, getVisibleTileCount, screenToGrid, isValidGridCoord } from './rendering';
import { InputManager } from './input';
import { audioManager } from './utils';
import { disasterSystem } from './systems';
import type { Camera, Viewport, ZoneType, ZoneDensity, GridPosition } from './types';
import { MIN_ZOOM, MAX_ZOOM, TILE_SIZE, MAP_SIZE } from './types';
import { clamp } from './rendering';

/**
 * Simulation speed configuration (milliseconds per game month)
 */
const SIMULATION_SPEEDS: Record<GameSpeed, number> = {
  paused: Infinity,
  normal: 2000,  // 1 month per 2 seconds
  fast: 1000,    // 1 month per 1 second
};

/**
 * Camera configuration constants
 */
const CAMERA_PAN_SPEED = 300;    // pixels per second at 1x zoom
const CAMERA_ZOOM_SPEED = 0.5;  // zoom units per second
const CAMERA_SMOOTH_FACTOR = 0.12; // lerp factor for smooth transitions (0.1-0.15 range)

/**
 * Linear interpolation helper
 */
function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

/**
 * Target camera state for smooth transitions
 */
interface TargetCamera {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Screensaver auto-pan configuration
 */
const SCREENSAVER_PAN_SPEED = 15; // pixels per second (slow, relaxing pan)
const SCREENSAVER_DIRECTION_CHANGE_INTERVAL = 8000; // ms between direction changes

/**
 * Main game component that manages the canvas and rendering loop
 */
export function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasManagerRef = useRef<CanvasManager | null>(null);
  const tileRendererRef = useRef<TileRenderer | null>(null);
  const trafficRendererRef = useRef<TrafficRenderer | null>(null);
  const inputManagerRef = useRef<InputManager | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const fpsRef = useRef<number>(60);
  const frameCountRef = useRef<number>(0);
  const fpsUpdateTimeRef = useRef<number>(0);
  
  // Camera state with smooth transitions
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const targetCameraRef = useRef<TargetCamera>({ x: 0, y: 0, zoom: 1 });
  
  // Panning state
  const isPanningRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Tool placement state (zones and roads)
  const isDraggingToolRef = useRef<boolean>(false);
  const hoverTileRef = useRef<GridPosition | null>(null);
  const lastPlacedTileRef = useRef<string | null>(null); // Track last placed tile to avoid duplicate placements during drag
  
  // Simulation timer
  const simulationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Screensaver pan direction state
  const screensaverDirectionRef = useRef<{ dx: number; dy: number }>({ dx: 1, dy: 0.5 });
  const lastDirectionChangeRef = useRef<number>(0);

  // Zustand stores
  const isInitialized = useGameStore((state) => state.isInitialized);
  const initializeMap = useGameStore((state) => state.initializeMap);

  /**
   * Clamp camera position to map bounds
   * 
   * When zoomed out (map smaller than viewport), allows free positioning
   * anywhere in the viewport, only preventing the map from going completely off-screen.
   * When zoomed in (map larger than viewport), uses traditional bounds clamping.
   */
  const clampCameraToMap = useCallback((cam: Camera | TargetCamera, viewport: Viewport): Camera => {
    const mapWidth = MAP_SIZE * TILE_SIZE;
    const mapHeight = MAP_SIZE * TILE_SIZE;
    const viewWidth = viewport.width / cam.zoom;
    const viewHeight = viewport.height / cam.zoom;
    
    // Calculate map size on screen
    const mapWidthOnScreen = mapWidth * cam.zoom;
    const mapHeightOnScreen = mapHeight * cam.zoom;
    
    // Minimum visible portion of map (20% must stay visible)
    const minVisibleFraction = 0.2;
    const minVisibleWidth = mapWidth * minVisibleFraction;
    const minVisibleHeight = mapHeight * minVisibleFraction;
    
    let minX: number, maxX: number, minY: number, maxY: number;
    
    if (mapWidthOnScreen < viewport.width) {
      // Map is smaller than viewport horizontally - allow free horizontal positioning
      // Camera X can range from showing map at right edge to showing map at left edge
      // Min: map's right edge at viewport's left edge + minVisible
      // Max: map's left edge at viewport's right edge - minVisible
      minX = -(viewWidth - minVisibleWidth);
      maxX = mapWidth - minVisibleWidth;
    } else {
      // Map is larger than viewport - traditional clamping with small padding
      const sidePadding = TILE_SIZE * 2;
      minX = -sidePadding;
      maxX = mapWidth - viewWidth + sidePadding;
    }
    
    if (mapHeightOnScreen < viewport.height) {
      // Map is smaller than viewport vertically - allow free vertical positioning
      minY = -(viewHeight - minVisibleHeight);
      maxY = mapHeight - minVisibleHeight;
    } else {
      // Map is larger than viewport - traditional clamping with extra bottom padding for HUD
      const topPadding = TILE_SIZE * 2;
      const bottomPadding = TILE_SIZE * 8; // Extra for HUD overlay
      minY = -topPadding;
      maxY = mapHeight - viewHeight + bottomPadding;
    }
    
    return {
      x: clamp(cam.x, minX, maxX),
      y: clamp(cam.y, minY, maxY),
      zoom: clamp(cam.zoom, MIN_ZOOM, MAX_ZOOM),
    };
  }, []);

  /**
   * Update target camera position (for keyboard panning)
   */
  const updateTargetCamera = useCallback((deltaX: number, deltaY: number, deltaZoom: number, viewport: Viewport) => {
    const current = targetCameraRef.current;
    const newTarget = {
      x: current.x + deltaX,
      y: current.y + deltaY,
      zoom: clamp(current.zoom + deltaZoom, MIN_ZOOM, MAX_ZOOM),
    };
    const clamped = clampCameraToMap(newTarget, viewport);
    targetCameraRef.current = clamped;
  }, [clampCameraToMap]);

  /**
   * Process keyboard input and update camera target
   */
  const processKeyboardInput = useCallback((deltaTime: number, viewport: Viewport) => {
    const inputManager = inputManagerRef.current;
    if (!inputManager) return;

    const currentZoom = targetCameraRef.current.zoom;
    
    // Calculate pan delta based on arrow keys
    // Pan speed is adjusted by zoom level so it feels consistent
    const panX = inputManager.getPanX();
    const panY = inputManager.getPanY();
    const panDelta = (CAMERA_PAN_SPEED * deltaTime) / (1000 * currentZoom);
    
    // Calculate zoom delta based on +/- keys
    const zoomDir = inputManager.getZoomDirection();
    const zoomDelta = (CAMERA_ZOOM_SPEED * deltaTime) / 1000;

    if (panX !== 0 || panY !== 0 || zoomDir !== 0) {
      updateTargetCamera(
        panX * panDelta,
        panY * panDelta,
        zoomDir * zoomDelta,
        viewport
      );
    }
  }, [updateTargetCamera]);

  /**
   * Process screensaver auto-pan camera movement
   */
  const processScreensaverPan = useCallback((deltaTime: number, currentTime: number, viewport: Viewport) => {
    const direction = screensaverDirectionRef.current;
    const currentZoom = targetCameraRef.current.zoom;
    
    // Randomly change direction periodically
    if (currentTime - lastDirectionChangeRef.current > SCREENSAVER_DIRECTION_CHANGE_INTERVAL) {
      // Generate new random direction
      const angle = Math.random() * Math.PI * 2;
      screensaverDirectionRef.current = {
        dx: Math.cos(angle),
        dy: Math.sin(angle),
      };
      lastDirectionChangeRef.current = currentTime;
    }
    
    // Calculate pan delta
    const panDelta = (SCREENSAVER_PAN_SPEED * deltaTime) / (1000 * currentZoom);
    
    // Get current position
    const currentTarget = targetCameraRef.current;
    const mapWidth = MAP_SIZE * TILE_SIZE;
    const mapHeight = MAP_SIZE * TILE_SIZE;
    
    // Calculate new position
    let newX = currentTarget.x + direction.dx * panDelta;
    let newY = currentTarget.y + direction.dy * panDelta;
    
    // Bounce off map edges
    const margin = 50; // Margin from edge before bouncing
    const viewWidth = viewport.width / currentZoom;
    const viewHeight = viewport.height / currentZoom;
    
    if (newX < -margin || newX > mapWidth - viewWidth + margin) {
      screensaverDirectionRef.current.dx *= -1;
      newX = clamp(newX, -margin, mapWidth - viewWidth + margin);
    }
    
    if (newY < -margin || newY > mapHeight - viewHeight + margin) {
      screensaverDirectionRef.current.dy *= -1;
      newY = clamp(newY, -margin, mapHeight - viewHeight + margin);
    }
    
    const newCam = clampCameraToMap({
      x: newX,
      y: newY,
      zoom: currentZoom,
    }, viewport);
    
    targetCameraRef.current = newCam;
  }, [clampCameraToMap]);

  /**
   * Apply smooth camera interpolation
   */
  const smoothCameraUpdate = useCallback(() => {
    const current = cameraRef.current;
    const target = targetCameraRef.current;
    
    // Apply lerp for smooth transitions
    cameraRef.current = {
      x: lerp(current.x, target.x, CAMERA_SMOOTH_FACTOR),
      y: lerp(current.y, target.y, CAMERA_SMOOTH_FACTOR),
      zoom: lerp(current.zoom, target.zoom, CAMERA_SMOOTH_FACTOR),
    };
  }, []);

  /**
   * Handle mouse wheel for zooming
   */
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    
    if (!canvasManagerRef.current) return;
    
    const viewport = canvasManagerRef.current.getViewport();
    const currentTarget = targetCameraRef.current;
    
    // Zoom speed
    const zoomDelta = -Math.sign(e.deltaY) * 0.1;
    const newZoom = clamp(currentTarget.zoom + zoomDelta, MIN_ZOOM, MAX_ZOOM);
    
    if (newZoom !== currentTarget.zoom) {
      // Zoom towards cursor position
      const rect = canvasManagerRef.current.getCanvas().getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate world position under cursor before zoom
      const worldX = mouseX / currentTarget.zoom + currentTarget.x;
      const worldY = mouseY / currentTarget.zoom + currentTarget.y;
      
      // Calculate new camera position to keep world position under cursor
      const newCam = clampCameraToMap({
        x: worldX - mouseX / newZoom,
        y: worldY - mouseY / newZoom,
        zoom: newZoom,
      }, viewport);
      
      // Update both target and current for immediate wheel response
      targetCameraRef.current = newCam;
      cameraRef.current = newCam;
    }
  }, [clampCameraToMap]);

  /**
   * Get the grid position from a mouse event
   */
  const getGridPosFromMouseEvent = useCallback((e: MouseEvent): GridPosition | null => {
    if (!canvasManagerRef.current) return null;
    
    const canvas = canvasManagerRef.current.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    const gridPos = screenToGrid({ screenX, screenY }, cameraRef.current);
    
    if (isValidGridCoord(gridPos)) {
      return gridPos;
    }
    return null;
  }, []);

  /**
   * Try to place a zone at the given grid position
   */
  const tryPlaceZone = useCallback((gridPos: GridPosition, zoneType: ZoneType, density: ZoneDensity = 'low') => {
    const { canPlaceZone, placeZone } = useGameStore.getState();
    
    // Create a key for this tile to avoid duplicate placements during drag
    const tileKey = `${gridPos.gridX},${gridPos.gridY}`;
    
    // Skip if we just placed at this tile (during drag)
    if (lastPlacedTileRef.current === tileKey) {
      return;
    }
    
    if (canPlaceZone(gridPos.gridX, gridPos.gridY, density)) {
      placeZone(gridPos.gridX, gridPos.gridY, zoneType, density);
      audioManager.playSound('zone_place');
      lastPlacedTileRef.current = tileKey;
    } else {
      // Play error sound only on initial click, not during drag
      if (lastPlacedTileRef.current === null) {
        audioManager.playSound('error');
      }
    }
  }, []);

  /**
   * Try to place a road at the given grid position
   */
  const tryPlaceRoad = useCallback((gridPos: GridPosition) => {
    const { canPlaceRoad, placeRoad } = useGameStore.getState();
    
    // Create a key for this tile to avoid duplicate placements during drag
    const tileKey = `${gridPos.gridX},${gridPos.gridY}`;
    
    // Skip if we just placed at this tile (during drag)
    if (lastPlacedTileRef.current === tileKey) {
      return;
    }
    
    if (canPlaceRoad(gridPos.gridX, gridPos.gridY)) {
      placeRoad(gridPos.gridX, gridPos.gridY);
      audioManager.playSound('road_place');
      lastPlacedTileRef.current = tileKey;
    } else {
      // Play error sound only on initial click, not during drag
      if (lastPlacedTileRef.current === null) {
        audioManager.playSound('error');
      }
    }
  }, []);

  /**
   * Try to place a power line at the given grid position
   */
  const tryPlacePowerLine = useCallback((gridPos: GridPosition) => {
    const { canPlacePowerLine, placePowerLine } = useGameStore.getState();
    
    // Create a key for this tile to avoid duplicate placements during drag
    const tileKey = `${gridPos.gridX},${gridPos.gridY}`;
    
    // Skip if we just placed at this tile (during drag)
    if (lastPlacedTileRef.current === tileKey) {
      return;
    }
    
    if (canPlacePowerLine(gridPos.gridX, gridPos.gridY)) {
      placePowerLine(gridPos.gridX, gridPos.gridY);
      audioManager.playSound('road_place'); // Use road sound for infrastructure
      lastPlacedTileRef.current = tileKey;
    } else {
      if (lastPlacedTileRef.current === null) {
        audioManager.playSound('error');
      }
    }
  }, []);

  /**
   * Try to place a power plant at the given grid position
   */
  const tryPlacePowerPlant = useCallback((gridPos: GridPosition) => {
    const { canPlacePowerPlant, placePowerPlant } = useGameStore.getState();
    
    if (canPlacePowerPlant(gridPos.gridX, gridPos.gridY)) {
      placePowerPlant(gridPos.gridX, gridPos.gridY);
      audioManager.playSound('building_complete');
    } else {
      audioManager.playSound('error');
    }
  }, []);

  /**
   * Try to place a water pump at the given grid position
   */
  const tryPlaceWaterPump = useCallback((gridPos: GridPosition) => {
    const { canPlaceWaterPump, placeWaterPump } = useGameStore.getState();
    
    if (canPlaceWaterPump(gridPos.gridX, gridPos.gridY)) {
      placeWaterPump(gridPos.gridX, gridPos.gridY);
      audioManager.playSound('building_complete');
    } else {
      audioManager.playSound('error');
    }
  }, []);

  /**
   * Try to place a police station at the given grid position
   */
  const tryPlacePoliceStation = useCallback((gridPos: GridPosition) => {
    const { canPlacePoliceStation, placePoliceStation } = useGameStore.getState();
    
    if (canPlacePoliceStation(gridPos.gridX, gridPos.gridY)) {
      placePoliceStation(gridPos.gridX, gridPos.gridY);
      audioManager.playSound('building_complete');
    } else {
      audioManager.playSound('error');
    }
  }, []);

  /**
   * Try to place a water pipe at the given grid position
   */
  const tryPlaceWaterPipe = useCallback((gridPos: GridPosition) => {
    const { canPlaceWaterPipe, placeWaterPipe } = useGameStore.getState();
    
    // Create a key for this tile to avoid duplicate placements during drag
    const tileKey = `${gridPos.gridX},${gridPos.gridY}`;
    
    // Skip if we just placed at this tile (during drag)
    if (lastPlacedTileRef.current === tileKey) {
      return;
    }
    
    if (canPlaceWaterPipe(gridPos.gridX, gridPos.gridY)) {
      placeWaterPipe(gridPos.gridX, gridPos.gridY);
      audioManager.playSound('road_place'); // Use road sound for infrastructure
      lastPlacedTileRef.current = tileKey;
    } else {
      if (lastPlacedTileRef.current === null) {
        audioManager.playSound('error');
      }
    }
  }, []);

  /**
   * Try to bulldoze at the given grid position
   */
  const tryBulldoze = useCallback((gridPos: GridPosition) => {
    const { canBulldoze, bulldoze } = useGameStore.getState();
    
    // Create a key for this tile to avoid duplicate bulldoze during drag
    const tileKey = `${gridPos.gridX},${gridPos.gridY}`;
    
    // Skip if we just bulldozed at this tile (during drag)
    if (lastPlacedTileRef.current === tileKey) {
      return;
    }
    
    if (canBulldoze(gridPos.gridX, gridPos.gridY)) {
      bulldoze(gridPos.gridX, gridPos.gridY);
      audioManager.playSound('bulldoze');
      lastPlacedTileRef.current = tileKey;
    } else {
      // Play error sound only on initial click, not during drag
      if (lastPlacedTileRef.current === null) {
        audioManager.playSound('error');
      }
    }
  }, []);

  /**
   * Handle mouse down for panning or tool placement
   */
  const handleMouseDown = useCallback((e: MouseEvent) => {
    // In screensaver mode, any click exits
    const isScreensaverMode = useUIStore.getState().isScreensaverMode;
    if (isScreensaverMode) {
      const exitScreensaver = useUIStore.getState().exitScreensaver;
      exitScreensaver();
      // Stop menu music when exiting
      audioManager.stopMenuMusic(true);
      return;
    }
    
    // Middle click or right click to pan
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      isPanningRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    
    // Left click for tool actions
    if (e.button === 0) {
      const selectedTool = useUIStore.getState().selectedTool;
      const gridPos = getGridPosFromMouseEvent(e);
      
      if (!selectedTool || !gridPos) return;
      
      // Check if a low density zone tool is selected
      if (['residential', 'commercial', 'industrial'].includes(selectedTool.id)) {
        isDraggingToolRef.current = true;
        lastPlacedTileRef.current = null; // Reset last placed tile
        tryPlaceZone(gridPos, selectedTool.id as ZoneType, 'low');
      }
      // Check if a medium density zone tool is selected
      else if (['residential-medium', 'commercial-medium', 'industrial-medium'].includes(selectedTool.id)) {
        isDraggingToolRef.current = true;
        lastPlacedTileRef.current = null; // Reset last placed tile
        const zoneType = selectedTool.id.replace('-medium', '') as ZoneType;
        tryPlaceZone(gridPos, zoneType, 'medium');
      }
      // Check if road tool is selected
      else if (selectedTool.id === 'road') {
        isDraggingToolRef.current = true;
        lastPlacedTileRef.current = null; // Reset last placed tile
        tryPlaceRoad(gridPos);
      }
      // Check if power line tool is selected
      else if (selectedTool.id === 'powerLine') {
        isDraggingToolRef.current = true;
        lastPlacedTileRef.current = null; // Reset last placed tile
        tryPlacePowerLine(gridPos);
      }
      // Check if power plant tool is selected (single click, no drag)
      else if (selectedTool.id === 'powerPlant') {
        tryPlacePowerPlant(gridPos);
      }
      // Check if water pump tool is selected (single click, no drag)
      else if (selectedTool.id === 'waterPump') {
        tryPlaceWaterPump(gridPos);
      }
      // Check if police station tool is selected (single click, no drag)
      else if (selectedTool.id === 'policeStation') {
        tryPlacePoliceStation(gridPos);
      }
      // Check if water pipe tool is selected
      else if (selectedTool.id === 'waterPipe') {
        isDraggingToolRef.current = true;
        lastPlacedTileRef.current = null; // Reset last placed tile
        tryPlaceWaterPipe(gridPos);
      }
      // Check if bulldoze tool is selected
      else if (selectedTool.id === 'bulldoze') {
        isDraggingToolRef.current = true;
        lastPlacedTileRef.current = null; // Reset last bulldozed tile
        tryBulldoze(gridPos);
      }
    }
  }, [getGridPosFromMouseEvent, tryPlaceZone, tryPlaceRoad, tryPlacePowerLine, tryPlacePowerPlant, tryPlaceWaterPump, tryPlacePoliceStation, tryPlaceWaterPipe, tryBulldoze]);

  /**
   * Handle mouse move for panning, tool drag placement, hover preview, and tooltip
   */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Update hover tile for preview
    const gridPos = getGridPosFromMouseEvent(e);
    hoverTileRef.current = gridPos;
    
    // Update tooltip info for zone tiles
    if (gridPos) {
      const gameState = useGameStore.getState();
      const tile = gameState.getTile(gridPos.gridX, gridPos.gridY);
      if (tile && tile.zone) {
        const hasRoadAccess = gameState.hasRoadAccess(gridPos.gridX, gridPos.gridY);
        const crimeLevel = gameState.getCrimeAt(gridPos.gridX, gridPos.gridY);
        const hasPoliceCoverage = gameState.hasPoliceCoverage(gridPos.gridX, gridPos.gridY);
        const pollutionLevel = gameState.getPollutionAt(gridPos.gridX, gridPos.gridY);
        
        // Build tooltip info with all properties
        // Optional properties use explicit values to satisfy exactOptionalPropertyTypes
        useUIStore.getState().setTooltipInfo({
          gridX: gridPos.gridX,
          gridY: gridPos.gridY,
          screenX: e.clientX,
          screenY: e.clientY,
          zoneType: tile.zone,
          hasRoadAccess,
          hasPower: tile.isPowered,
          hasWater: tile.hasWaterService,
          crimeLevel,
          hasPoliceCoverage,
          pollutionLevel,
          // Convert undefined to explicit boolean for abandoned status
          ...(tile.isAbandoned === true && { isAbandoned: true }),
          ...(tile.abandonmentReason && { abandonmentReason: tile.abandonmentReason }),
          ...(tile.developmentProgress !== undefined && { developmentProgress: tile.developmentProgress }),
        });
      } else {
        // Clear tooltip when not over a zone
        useUIStore.getState().setTooltipInfo(null);
      }
    } else {
      // Clear tooltip when off map
      useUIStore.getState().setTooltipInfo(null);
    }
    
    // Handle camera panning
    if (isPanningRef.current && canvasManagerRef.current) {
      const viewport = canvasManagerRef.current.getViewport();
      const currentTarget = targetCameraRef.current;
      
      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;
      
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      
      const newCam = clampCameraToMap({
        x: currentTarget.x - deltaX / currentTarget.zoom,
        y: currentTarget.y - deltaY / currentTarget.zoom,
        zoom: currentTarget.zoom,
      }, viewport);
      
      // Update both target and current for immediate mouse drag response
      targetCameraRef.current = newCam;
      cameraRef.current = newCam;
      return;
    }
    
    // Handle tool drag placement (zones, roads, power lines, water pipes, bulldoze)
    if (isDraggingToolRef.current && gridPos) {
      const selectedTool = useUIStore.getState().selectedTool;
      if (selectedTool) {
        if (['residential', 'commercial', 'industrial'].includes(selectedTool.id)) {
          tryPlaceZone(gridPos, selectedTool.id as ZoneType, 'low');
        } else if (['residential-medium', 'commercial-medium', 'industrial-medium'].includes(selectedTool.id)) {
          const zoneType = selectedTool.id.replace('-medium', '') as ZoneType;
          tryPlaceZone(gridPos, zoneType, 'medium');
        } else if (selectedTool.id === 'road') {
          tryPlaceRoad(gridPos);
        } else if (selectedTool.id === 'powerLine') {
          tryPlacePowerLine(gridPos);
        } else if (selectedTool.id === 'waterPipe') {
          tryPlaceWaterPipe(gridPos);
        } else if (selectedTool.id === 'bulldoze') {
          tryBulldoze(gridPos);
        }
      }
    }
  }, [clampCameraToMap, getGridPosFromMouseEvent, tryPlaceZone, tryPlaceRoad, tryPlacePowerLine, tryPlaceWaterPipe, tryBulldoze]);

  /**
   * Handle mouse up to stop panning and tool placement
   */
  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    isDraggingToolRef.current = false;
    lastPlacedTileRef.current = null;
  }, []);

  /**
   * Prevent context menu on right click
   */
  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
  }, []);

  /**
   * Render debug information
   */
  const renderDebugInfo = useCallback((
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewport: Viewport
  ) => {
    const bounds = getVisibleTileBounds(camera, viewport);
    const tileCount = getVisibleTileCount(bounds);
    
    ctx.fillStyle = 'white';
    ctx.font = '12px monospace';
    ctx.fillText(`FPS: ${fpsRef.current.toFixed(0)}`, 10, 20);
    ctx.fillText(`Visible tiles: ${tileCount}`, 10, 35);
    ctx.fillText(`Camera: (${camera.x.toFixed(0)}, ${camera.y.toFixed(0)})`, 10, 50);
    ctx.fillText(`Zoom: ${camera.zoom.toFixed(2)}x`, 10, 65);
    ctx.fillText(`Map: ${MAP_SIZE}x${MAP_SIZE} (${TILE_SIZE}px tiles)`, 10, 80);
  }, []);

  /**
   * Main render loop
   */
  const render = useCallback((currentTime: number) => {
    if (!canvasManagerRef.current || !tileRendererRef.current) return;
    
    // Calculate delta time
    const deltaTime = currentTime - lastTimeRef.current;
    lastTimeRef.current = currentTime;
    
    // Update FPS counter
    frameCountRef.current++;
    if (currentTime - fpsUpdateTimeRef.current >= 1000) {
      fpsRef.current = frameCountRef.current;
      frameCountRef.current = 0;
      fpsUpdateTimeRef.current = currentTime;
    }
    
    const canvasManager = canvasManagerRef.current;
    const tileRenderer = tileRendererRef.current;
    const trafficRenderer = trafficRendererRef.current;
    const viewport = canvasManager.getViewport();
    const isScreensaverMode = useUIStore.getState().isScreensaverMode;
    
    // Process keyboard input and update target camera (skip in screensaver mode)
    if (!isScreensaverMode) {
      processKeyboardInput(deltaTime, viewport);
    } else {
      // Auto-pan camera in screensaver mode
      processScreensaverPan(deltaTime, currentTime, viewport);
    }
    
    // Apply smooth camera interpolation
    smoothCameraUpdate();
    
    const currentCamera = cameraRef.current;
    const gameState = useGameStore.getState();
    const currentTiles = gameState.tiles;
    const powerPlants = gameState.powerPlants;
    const waterPumps = gameState.waterPumps;
    const policeStations = gameState.policeStations;
    const crimeMap = gameState.crimeMap;
    const pollutionMap = gameState.pollutionMap;
    const population = gameState.population;
    const selectedTool = useUIStore.getState().selectedTool;
    const activeOverlay = useUIStore.getState().activeOverlay;
    const gameSpeed = useUIStore.getState().gameSpeed;
    
    // Clear canvas
    canvasManager.clear('#0f0f1a');
    
    // Render tiles with road access checker, power plants, water pumps, and police stations
    if (currentTiles.length > 0) {
      const hasRoadAccess = gameState.hasRoadAccess;
      const getPowerPlantAt = gameState.getPowerPlantAt;
      const getWaterPumpAt = gameState.getWaterPumpAt;
      tileRenderer.renderTiles(currentTiles, currentCamera, viewport, hasRoadAccess, getPowerPlantAt, powerPlants, getWaterPumpAt, waterPumps, policeStations);
    }
    
    // Update and render traffic (animated cars on roads)
    // Only update when game is not paused
    if (trafficRenderer && currentTiles.length > 0) {
      const roadTiles = gameState.getRoadTiles();
      // Update traffic simulation (only when not paused)
      if (gameSpeed !== 'paused') {
        trafficRenderer.update(deltaTime, roadTiles, population);
      }
      // Always render traffic (even when paused, just don't update positions)
      trafficRenderer.render(canvasManager.getContext(), currentCamera, viewport);
    }
    
    // Render power overlay if active
    if (activeOverlay === 'power' && currentTiles.length > 0) {
      tileRenderer.renderPowerOverlay(currentTiles, currentCamera, viewport, powerPlants);
    }
    
    // Render water overlay if active
    if (activeOverlay === 'water' && currentTiles.length > 0) {
      tileRenderer.renderWaterOverlay(currentTiles, currentCamera, viewport, waterPumps);
    }
    
    // Render crime overlay if active
    if (activeOverlay === 'crime' && currentTiles.length > 0) {
      tileRenderer.renderCrimeOverlay(currentTiles, currentCamera, viewport, crimeMap, policeStations);
    }
    
    // Render pollution overlay if active
    if (activeOverlay === 'pollution' && currentTiles.length > 0) {
      tileRenderer.renderPollutionOverlay(currentTiles, currentCamera, viewport, pollutionMap);
    }
    
    // Render disaster effects
    const disasterAffectedTiles = gameState.getDisasterAffectedTiles();
    if (disasterAffectedTiles.size > 0) {
      tileRenderer.renderDisasterEffects(disasterAffectedTiles, currentCamera, viewport, currentTime);
      
      // Render tornado if active
      const tornadoPos = disasterSystem.getTornadoPosition();
      if (tornadoPos) {
        tileRenderer.renderTornado(tornadoPos, currentCamera, currentTime);
      }
    }
    
    // Render tool placement preview when hovering with a tool selected
    const hoverTile = hoverTileRef.current;
    if (hoverTile && selectedTool) {
      if (['residential', 'commercial', 'industrial'].includes(selectedTool.id)) {
        // Low density zone placement preview
        const canPlace = gameState.canPlaceZone(hoverTile.gridX, hoverTile.gridY, 'low');
        tileRenderer.renderZonePlacementPreview(
          hoverTile.gridX,
          hoverTile.gridY,
          currentCamera,
          selectedTool.id as ZoneType,
          canPlace
        );
      } else if (['residential-medium', 'commercial-medium', 'industrial-medium'].includes(selectedTool.id)) {
        // Medium density zone placement preview
        const zoneType = selectedTool.id.replace('-medium', '') as ZoneType;
        const canPlace = gameState.canPlaceZone(hoverTile.gridX, hoverTile.gridY, 'medium');
        tileRenderer.renderZonePlacementPreview(
          hoverTile.gridX,
          hoverTile.gridY,
          currentCamera,
          zoneType,
          canPlace
        );
      } else if (selectedTool.id === 'road') {
        // Road placement preview
        const canPlace = gameState.canPlaceRoad(hoverTile.gridX, hoverTile.gridY);
        tileRenderer.renderRoadPlacementPreview(
          hoverTile.gridX,
          hoverTile.gridY,
          currentCamera,
          canPlace
        );
      } else if (selectedTool.id === 'powerLine') {
        // Power line placement preview
        const canPlace = gameState.canPlacePowerLine(hoverTile.gridX, hoverTile.gridY);
        tileRenderer.renderPowerLinePlacementPreview(
          hoverTile.gridX,
          hoverTile.gridY,
          currentCamera,
          canPlace
        );
      } else if (selectedTool.id === 'powerPlant') {
        // Power plant placement preview
        const canPlace = gameState.canPlacePowerPlant(hoverTile.gridX, hoverTile.gridY);
        tileRenderer.renderPowerPlantPlacementPreview(
          hoverTile.gridX,
          hoverTile.gridY,
          currentCamera,
          canPlace
        );
      } else if (selectedTool.id === 'waterPump') {
        // Water pump placement preview
        const canPlace = gameState.canPlaceWaterPump(hoverTile.gridX, hoverTile.gridY);
        tileRenderer.renderWaterPumpPlacementPreview(
          hoverTile.gridX,
          hoverTile.gridY,
          currentCamera,
          canPlace
        );
      } else if (selectedTool.id === 'waterPipe') {
        // Water pipe placement preview
        const canPlace = gameState.canPlaceWaterPipe(hoverTile.gridX, hoverTile.gridY);
        tileRenderer.renderWaterPipePlacementPreview(
          hoverTile.gridX,
          hoverTile.gridY,
          currentCamera,
          canPlace
        );
      } else if (selectedTool.id === 'policeStation') {
        // Police station placement preview
        const canPlace = gameState.canPlacePoliceStation(hoverTile.gridX, hoverTile.gridY);
        tileRenderer.renderPoliceStationPlacementPreview(
          hoverTile.gridX,
          hoverTile.gridY,
          currentCamera,
          canPlace
        );
      } else if (selectedTool.id === 'bulldoze') {
        // Bulldoze preview
        const canBulldoze = gameState.canBulldoze(hoverTile.gridX, hoverTile.gridY);
        tileRenderer.renderBulldozePreview(
          hoverTile.gridX,
          hoverTile.gridY,
          currentCamera,
          canBulldoze
        );
      } else {
        // For other tools, show a simple hover highlight
        tileRenderer.renderHoverHighlight(hoverTile.gridX, hoverTile.gridY, currentCamera);
      }
    }
    
    // Render debug info
    renderDebugInfo(canvasManager.getContext(), currentCamera, viewport);
    
    // Continue render loop
    animationFrameRef.current = requestAnimationFrame(render);
  }, [renderDebugInfo, processKeyboardInput, processScreensaverPan, smoothCameraUpdate]);

  /**
   * Handle canvas focus/blur for keyboard input
   */
  const handleCanvasFocus = useCallback(() => {
    // Canvas gained focus, nothing special needed
  }, []);

  const handleCanvasBlur = useCallback(() => {
    // Canvas lost focus, clear pressed keys to avoid stuck keys
    inputManagerRef.current?.clearKeys();
  }, []);

  /**
   * Initialize canvas and start rendering
   */
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Create canvas manager
    const canvasManager = new CanvasManager(containerRef.current);
    canvasManagerRef.current = canvasManager;
    
    // Create tile renderer
    const tileRenderer = new TileRenderer(canvasManager.getContext());
    tileRendererRef.current = tileRenderer;
    
    // Create traffic renderer for animated vehicles
    const trafficRenderer = new TrafficRenderer();
    trafficRendererRef.current = trafficRenderer;
    
    // Create input manager
    const inputManager = new InputManager();
    inputManagerRef.current = inputManager;
    
    // Set up event listeners
    const canvas = canvasManager.getCanvas();
    
    // Make canvas focusable for keyboard events
    canvas.tabIndex = 0;
    canvas.style.outline = 'none'; // Remove focus outline
    
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('contextmenu', handleContextMenu);
    canvas.addEventListener('focus', handleCanvasFocus);
    canvas.addEventListener('blur', handleCanvasBlur);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    // Attach input manager to canvas for keyboard events
    inputManager.attach(canvas);
    
    // Focus the canvas so keyboard events work immediately
    canvas.focus();
    
    // Handle resize - keep camera centered
    canvasManager.onResize((width, height) => {
      const currentTarget = targetCameraRef.current;
      const newCam = clampCameraToMap(currentTarget, { width, height });
      targetCameraRef.current = newCam;
      cameraRef.current = newCam;
    });
    
    // Initialize map if not already done
    if (!isInitialized) {
      initializeMap();
    }
    
    // Center camera on map
    const viewport = canvasManager.getViewport();
    const mapCenterX = (MAP_SIZE * TILE_SIZE) / 2;
    const mapCenterY = (MAP_SIZE * TILE_SIZE) / 2;
    const initialCamera = {
      x: mapCenterX - viewport.width / 2,
      y: mapCenterY - viewport.height / 2,
      zoom: 1,
    };
    cameraRef.current = initialCamera;
    targetCameraRef.current = initialCamera;
    
    // Start render loop
    lastTimeRef.current = performance.now();
    fpsUpdateTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(render);
    
    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      // Detach input manager
      inputManager.detach(canvas);
      
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      canvas.removeEventListener('focus', handleCanvasFocus);
      canvas.removeEventListener('blur', handleCanvasBlur);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      
      canvasManager.destroy();
    };
  }, [
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    handleCanvasFocus,
    handleCanvasBlur,
    initializeMap,
    isInitialized,
    render,
    clampCameraToMap,
  ]);

  // Simulation timer effect - runs simulation based on game speed
  const gameSpeed = useUIStore((state) => state.gameSpeed);
  const runMonthlySimulation = useGameStore((state) => state.runMonthlySimulation);
  const checkMilestones = useGameStore((state) => state.checkMilestones);
  const checkBudgetDeficitEvent = useGameStore((state) => state.checkBudgetDeficitEvent);
  const checkForDisaster = useGameStore((state) => state.checkForDisaster);
  const updateDisasters = useGameStore((state) => state.updateDisasters);
  const getLastDisasterEvent = useGameStore((state) => state.getLastDisasterEvent);
  const getLastAbandonmentEvents = useGameStore((state) => state.getLastAbandonmentEvents);
  const showNotification = useUIStore((state) => state.showNotification);
  const triggerScreenShake = useUIStore((state) => state.triggerScreenShake);
  
  useEffect(() => {
    // Clear existing timer
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    
    // Don't start timer if paused or not initialized
    if (gameSpeed === 'paused' || !isInitialized) {
      return;
    }
    
    // Set up simulation timer
    const intervalMs = SIMULATION_SPEEDS[gameSpeed];
    simulationTimerRef.current = setInterval(() => {
      runMonthlySimulation();
      
      // Check for random disasters each month
      const newDisaster = checkForDisaster();
      if (newDisaster !== null) {
        // Show disaster notification
        let disasterMessage = '';
        let disasterSubtitle = '';
        
        switch (newDisaster) {
          case 'fire':
            disasterMessage = '🔥 Fire broke out in your city!';
            disasterSubtitle = 'Buildings are burning!';
            audioManager.playSound('disaster_fire');
            break;
          case 'tornado':
            disasterMessage = '🌪️ Tornado spotted! Take cover!';
            disasterSubtitle = 'A tornado is tearing through the city!';
            audioManager.playSound('disaster_tornado');
            break;
          case 'earthquake':
            disasterMessage = '🌍 Earthquake! Buildings damaged!';
            disasterSubtitle = 'The ground is shaking!';
            audioManager.playSound('disaster_earthquake');
            triggerScreenShake(1000);
            break;
        }
        
        showNotification(disasterMessage, 'disaster', disasterSubtitle);
      }
      
      // Update any active disasters (spread fire, move tornado, etc.)
      updateDisasters();
      
      // Check for disaster damage events
      const disasterEvent = getLastDisasterEvent();
      if (disasterEvent && disasterEvent.damage.tilesDestroyed > 0) {
        // Show damage report if significant damage occurred
        const { tilesDestroyed, populationLost, jobsLost, infrastructureDestroyed } = disasterEvent.damage;
        const totalLoss = tilesDestroyed + infrastructureDestroyed;
        
        if (totalLoss > 5 || populationLost > 100 || jobsLost > 50) {
          const lossDetails: string[] = [];
          if (tilesDestroyed > 0) lossDetails.push(`${tilesDestroyed} buildings`);
          if (populationLost > 0) lossDetails.push(`${populationLost} residents`);
          if (jobsLost > 0) lossDetails.push(`${jobsLost} jobs`);
          if (infrastructureDestroyed > 0) lossDetails.push(`${infrastructureDestroyed} infrastructure`);
          
          showNotification(
            `Disaster damage: ${lossDetails.join(', ')} lost!`,
            'warning',
            'Time to rebuild...'
          );
        }
      }
      
      // Check for budget deficit events
      const deficitEvent = checkBudgetDeficitEvent();
      if (deficitEvent !== null) {
        const currentBudget = useGameStore.getState().budget;
        const formattedBudget = Math.abs(currentBudget).toLocaleString();
        
        if (deficitEvent === 'entered_deficit') {
          showNotification(
            'Warning: Budget in deficit!',
            'warning',
            'Your city is losing money'
          );
        } else if (deficitEvent === 'still_in_deficit') {
          showNotification(
            `Budget still negative: -$${formattedBudget}`,
            'warning',
            'Increase taxes or reduce expenses'
          );
        }
      }
      
      // Check for building abandonment events
      const abandonmentEvents = getLastAbandonmentEvents();
      if (abandonmentEvents.length > 0) {
        // Consolidate messages if multiple buildings abandoned
        if (abandonmentEvents.length === 1) {
          const event = abandonmentEvents[0];
          // Map reason to human-readable message
          const reasonLabels: Record<string, string> = {
            no_power: 'no power',
            no_water: 'no water',
            high_crime: 'high crime',
            high_pollution: 'high pollution',
          };
          const reason = event ? reasonLabels[event.reason] || 'poor conditions' : 'poor conditions';
          
          showNotification(
            `⚠️ Building abandoned due to ${reason}!`,
            'warning',
            'Bulldoze to clear and rebuild'
          );
        } else {
          // Multiple buildings abandoned
          showNotification(
            `⚠️ ${abandonmentEvents.length} buildings abandoned!`,
            'warning',
            'Check city conditions and bulldoze to rebuild'
          );
        }
      }
      
      // Check for milestone achievements after population updates
      const newMilestone = checkMilestones();
      if (newMilestone !== null) {
        // Format population with commas for display
        const formattedPop = newMilestone.toLocaleString();
        
        // Get subtitle based on milestone
        let subtitle = '';
        if (newMilestone === 100) subtitle = 'Your village is growing!';
        else if (newMilestone === 500) subtitle = 'Medium density zones unlocked! 🏢';
        else if (newMilestone === 1000) subtitle = "You're becoming a town!";
        else if (newMilestone === 2000) subtitle = 'A thriving community!';
        else if (newMilestone === 5000) subtitle = 'A bustling town!';
        else if (newMilestone === 10000) subtitle = 'Welcome to cityhood!';
        
        showNotification(
          `🎉 Population reached ${formattedPop}!`,
          'milestone',
          subtitle
        );
      }
    }, intervalMs);
    
    // Cleanup
    return () => {
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
        simulationTimerRef.current = null;
      }
    };
  }, [gameSpeed, isInitialized, runMonthlySimulation, checkMilestones, checkBudgetDeficitEvent, checkForDisaster, updateDisasters, getLastDisasterEvent, getLastAbandonmentEvents, showNotification, triggerScreenShake]);

  // Get selected tool for cursor styling
  const selectedTool = useUIStore((state) => state.selectedTool);
  
  // Get screensaver mode state
  const isScreensaverMode = useUIStore((state) => state.isScreensaverMode);
  const exitScreensaver = useUIStore((state) => state.exitScreensaver);
  
  // Handle ESC key to exit screensaver mode
  useEffect(() => {
    if (!isScreensaverMode) return;
    
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitScreensaver();
        audioManager.stopMenuMusic(true);
      }
    };
    
    window.addEventListener('keydown', handleEscapeKey);
    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isScreensaverMode, exitScreensaver]);
  
  // Get screen shake state
  const isScreenShaking = useUIStore((state) => state.isScreenShaking);
  const screenShakeKey = useUIStore((state) => state.screenShakeKey);
  
  // Force animation restart when screenShakeKey changes
  useEffect(() => {
    if (isScreenShaking && containerRef.current) {
      // Force browser to restart animation by triggering reflow
      const container = containerRef.current;
      container.classList.remove('screen-shake');
      // Force reflow - reading offsetHeight forces the browser to recalculate styles
      void container.offsetHeight;
      container.classList.add('screen-shake');
    }
  }, [screenShakeKey, isScreenShaking]);
  
  // Determine cursor based on state and selected tool
  const getCursor = () => {
    // In screensaver mode, always use default cursor
    if (isScreensaverMode) return 'default';
    if (isPanningRef.current) return 'grabbing';
    if (selectedTool) {
      // Zone (low and medium density), road, and bulldoze tools get crosshair
      if (['residential', 'commercial', 'industrial', 'residential-medium', 'commercial-medium', 'industrial-medium', 'road', 'bulldoze'].includes(selectedTool.id)) {
        return 'crosshair';
      }
      // Other tools get pointer
      return 'pointer';
    }
    return 'default';
  };

  return (
    <div 
      ref={containerRef} 
      className={`game-container ${isScreenShaking ? 'screen-shake' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: getCursor(),
      }}
    />
  );
}
