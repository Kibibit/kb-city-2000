import type { CanvasConfig } from '../types';

/**
 * Manages the HTML5 Canvas element with DPR scaling and responsive resizing
 */
export class CanvasManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: CanvasConfig;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private onResizeCallback: ((width: number, height: number) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);
    
    // Get 2D context with performance optimizations
    const ctx = this.canvas.getContext('2d', {
      alpha: false, // Opaque canvas for better performance
      desynchronized: true, // Reduce latency where supported
    });
    
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context');
    }
    this.ctx = ctx;
    
    // Calculate initial config
    this.config = this.calculateConfig();
    this.applyConfig();
    
    // Set up resize observer for responsive handling
    this.setupResizeObserver();
  }

  /**
   * Calculate canvas configuration based on container size and DPR
   */
  private calculateConfig(): CanvasConfig {
    // Cap DPR at 2 for performance
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.container.getBoundingClientRect();
    
    return {
      baseWidth: rect.width,
      baseHeight: rect.height,
      dpr,
      bufferWidth: Math.floor(rect.width * dpr),
      bufferHeight: Math.floor(rect.height * dpr),
    };
  }

  /**
   * Apply canvas configuration for proper DPR scaling
   */
  private applyConfig(): void {
    const { baseWidth, baseHeight, bufferWidth, bufferHeight, dpr } = this.config;
    
    // Set buffer size (actual pixels)
    this.canvas.width = bufferWidth;
    this.canvas.height = bufferHeight;
    
    // Set display size (CSS pixels)
    this.canvas.style.width = `${baseWidth}px`;
    this.canvas.style.height = `${baseHeight}px`;
    
    // Scale context to match DPR
    this.ctx.scale(dpr, dpr);
    
    // Set rendering defaults
    this.ctx.imageSmoothingEnabled = false; // Crisp pixel art
  }

  /**
   * Set up ResizeObserver for responsive canvas
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this.container) {
          this.handleResize();
        }
      }
    });
    
    this.resizeObserver.observe(this.container);
  }

  /**
   * Handle container resize
   */
  private handleResize(): void {
    // Calculate new config
    const newConfig = this.calculateConfig();
    
    // Only process resize if dimensions actually changed
    // This prevents spurious resize events (e.g., from notification appearance)
    // from triggering unnecessary canvas reconfiguration.
    // Use Math.floor comparison to handle sub-pixel differences from getBoundingClientRect
    if (
      Math.floor(newConfig.baseWidth) === Math.floor(this.config.baseWidth) &&
      Math.floor(newConfig.baseHeight) === Math.floor(this.config.baseHeight) &&
      newConfig.dpr === this.config.dpr
    ) {
      return;
    }
    
    // Update config
    this.config = newConfig;
    
    // Reset transform before applying new config
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Apply new config
    this.applyConfig();
    
    // Notify callback if set
    if (this.onResizeCallback) {
      this.onResizeCallback(this.config.baseWidth, this.config.baseHeight);
    }
  }

  /**
   * Set callback for resize events
   */
  onResize(callback: (width: number, height: number) => void): void {
    this.onResizeCallback = callback;
  }

  /**
   * Get the 2D rendering context
   */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /**
   * Get the canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Get current canvas configuration
   */
  getConfig(): Readonly<CanvasConfig> {
    return this.config;
  }

  /**
   * Get viewport dimensions (in CSS pixels)
   */
  getViewport(): { width: number; height: number } {
    return {
      width: this.config.baseWidth,
      height: this.config.baseHeight,
    };
  }

  /**
   * Clear the entire canvas with a specified color
   */
  clear(color: string = '#0f0f1a'): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.config.baseWidth, this.config.baseHeight);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}
