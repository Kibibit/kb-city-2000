/**
 * InputManager - Handles keyboard input for the game
 * Tracks which keys are currently pressed and provides clean API for querying input state
 */

/**
 * Keys that the InputManager tracks
 */
export type TrackedKey = 
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Equal'      // + or = key
  | 'Minus'      // - key
  | 'Space'
  // Tool shortcut keys
  | 'KeyR'       // Residential
  | 'KeyC'       // Commercial
  | 'KeyI'       // Industrial
  | 'KeyD'       // Road
  | 'KeyL'       // Power Line
  | 'KeyW'       // Water Pipe
  | 'KeyP'       // Power Plant
  | 'KeyU'       // Water Pump
  | 'KeyB'       // Bulldoze
  | 'Escape';    // Deselect tool

/**
 * Map of keyboard codes to tracked keys
 */
const KEY_CODE_MAP: Record<string, TrackedKey> = {
  'ArrowUp': 'ArrowUp',
  'ArrowDown': 'ArrowDown',
  'ArrowLeft': 'ArrowLeft',
  'ArrowRight': 'ArrowRight',
  'Equal': 'Equal',           // + or = key
  'NumpadAdd': 'Equal',       // Numpad +
  'Minus': 'Minus',           // - key
  'NumpadSubtract': 'Minus',  // Numpad -
  'Space': 'Space',
  // Tool shortcut keys
  'KeyR': 'KeyR',             // Residential
  'KeyC': 'KeyC',             // Commercial
  'KeyI': 'KeyI',             // Industrial
  'KeyD': 'KeyD',             // Road
  'KeyL': 'KeyL',             // Power Line
  'KeyW': 'KeyW',             // Water Pipe
  'KeyP': 'KeyP',             // Power Plant
  'KeyU': 'KeyU',             // Water Pump
  'KeyB': 'KeyB',             // Bulldoze
  'Escape': 'Escape',         // Deselect tool
};

/**
 * InputManager class for handling keyboard input
 */
export class InputManager {
  private keysDown: Set<TrackedKey> = new Set();
  private keyDownHandlers: Map<TrackedKey, (() => void)[]> = new Map();
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private boundHandleKeyUp: (e: KeyboardEvent) => void;
  private attached: boolean = false;

  constructor() {
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
  }

  /**
   * Attach event listeners to the specified element
   * @param element - The element to attach listeners to (canvas or window)
   */
  attach(element: HTMLElement | Window): void {
    if (this.attached) {
      return;
    }

    element.addEventListener('keydown', this.boundHandleKeyDown as EventListener);
    element.addEventListener('keyup', this.boundHandleKeyUp as EventListener);
    this.attached = true;
  }

  /**
   * Detach event listeners from the specified element
   * @param element - The element to detach listeners from
   */
  detach(element: HTMLElement | Window): void {
    if (!this.attached) {
      return;
    }

    element.removeEventListener('keydown', this.boundHandleKeyDown as EventListener);
    element.removeEventListener('keyup', this.boundHandleKeyUp as EventListener);
    this.keysDown.clear();
    this.attached = false;
  }

  /**
   * Handle keydown event
   */
  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore if typing in an input element
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const trackedKey = KEY_CODE_MAP[e.code];
    if (trackedKey) {
      // Prevent default for arrow keys and +/- to avoid scrolling
      // Don't prevent default for letter keys or Escape to allow browser shortcuts when needed
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Equal', 'Minus', 'Space'].includes(trackedKey)) {
        e.preventDefault();
      }
      
      // Only fire handlers on initial press, not repeat
      const wasPressed = this.keysDown.has(trackedKey);
      this.keysDown.add(trackedKey);
      
      // Fire one-time handlers only on initial press
      if (!wasPressed) {
        const handlers = this.keyDownHandlers.get(trackedKey);
        if (handlers) {
          handlers.forEach(handler => handler());
        }
      }
    }
  }

  /**
   * Handle keyup event
   */
  private handleKeyUp(e: KeyboardEvent): void {
    const trackedKey = KEY_CODE_MAP[e.code];
    if (trackedKey) {
      this.keysDown.delete(trackedKey);
    }
  }

  /**
   * Check if a key is currently pressed
   * @param key - The key to check
   * @returns True if the key is currently pressed
   */
  isKeyDown(key: TrackedKey): boolean {
    return this.keysDown.has(key);
  }

  /**
   * Check if any of the specified keys are pressed
   * @param keys - Array of keys to check
   * @returns True if any of the keys are pressed
   */
  isAnyKeyDown(keys: TrackedKey[]): boolean {
    return keys.some(key => this.keysDown.has(key));
  }

  /**
   * Register a handler for when a key is initially pressed
   * @param key - The key to listen for
   * @param handler - The handler function to call
   */
  onKeyDown(key: TrackedKey, handler: () => void): void {
    if (!this.keyDownHandlers.has(key)) {
      this.keyDownHandlers.set(key, []);
    }
    this.keyDownHandlers.get(key)!.push(handler);
  }

  /**
   * Remove a handler for a key
   * @param key - The key to remove handler from
   * @param handler - The handler function to remove
   */
  offKeyDown(key: TrackedKey, handler: () => void): void {
    const handlers = this.keyDownHandlers.get(key);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get the current horizontal pan direction based on arrow keys
   * @returns -1 for left, 1 for right, 0 for none
   */
  getPanX(): number {
    let x = 0;
    if (this.isKeyDown('ArrowLeft')) x -= 1;
    if (this.isKeyDown('ArrowRight')) x += 1;
    return x;
  }

  /**
   * Get the current vertical pan direction based on arrow keys
   * @returns -1 for up, 1 for down, 0 for none
   */
  getPanY(): number {
    let y = 0;
    if (this.isKeyDown('ArrowUp')) y -= 1;
    if (this.isKeyDown('ArrowDown')) y += 1;
    return y;
  }

  /**
   * Get the current zoom direction based on +/- keys
   * @returns 1 for zoom in (+), -1 for zoom out (-), 0 for none
   */
  getZoomDirection(): number {
    let zoom = 0;
    if (this.isKeyDown('Equal')) zoom += 1;
    if (this.isKeyDown('Minus')) zoom -= 1;
    return zoom;
  }

  /**
   * Check if space bar is pressed (for pause detection)
   * @returns True if space is pressed
   */
  isSpacePressed(): boolean {
    return this.isKeyDown('Space');
  }

  /**
   * Clear all tracked key states
   * Useful when canvas loses focus
   */
  clearKeys(): void {
    this.keysDown.clear();
  }

  /**
   * Get all currently pressed keys
   * @returns Set of currently pressed keys
   */
  getPressedKeys(): ReadonlySet<TrackedKey> {
    return this.keysDown;
  }
}
