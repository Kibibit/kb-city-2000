/**
 * GameHUD Component
 *
 * Container that positions all UI elements as a fixed overlay.
 * Layout: Toolbar (left) | Info Panel + Demand Meters (center) | Speed Controls (right)
 */

import { Toolbar } from './Toolbar';
import { InfoPanel } from './InfoPanel';
import { BudgetPanel } from './BudgetPanel';
import { DemandMeters } from './DemandMeters';
import { SpeedControls } from './SpeedControls';
import './GameHUD.css';

export function GameHUD() {
  return (
    <div className="game-hud" role="region" aria-label="Game interface">
      {/* Left section: Toolbar */}
      <div className="game-hud-left">
        <Toolbar />
      </div>

      {/* Center section: Info Panel + Budget Panel + Demand Meters */}
      <div className="game-hud-center">
        <InfoPanel />
        <BudgetPanel />
        <DemandMeters />
      </div>

      {/* Right section: Speed Controls */}
      <div className="game-hud-right">
        <SpeedControls />
      </div>
    </div>
  );
}
