/**
 * DemandMeters Component
 *
 * Displays R/C/I demand bars that show current zone demand.
 * Connected to game store for real-time updates.
 * 
 * Values range from 0-100:
 * - 0-29: Low demand (slow development)
 * - 30-70: Medium demand (normal development)
 * - 71-100: High demand (fast development)
 */

import { useGameStore } from '@/store/gameStore';
import './DemandMeters.css';

// =============================================================================
// Types
// =============================================================================

type ZoneType = 'residential' | 'commercial' | 'industrial';

interface DemandMeterProps {
  zone: ZoneType;
  value: number; // 0 to 100
  label: string;
}

// =============================================================================
// Sub-components
// =============================================================================

function DemandMeter({ zone, value, label }: DemandMeterProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.max(0, Math.min(100, value));

  // Calculate fill height (0-100% of bar height)
  const fillHeight = clampedValue;

  return (
    <div className={`demand-meter ${zone}`}>
      <span className="demand-meter-label">{label}</span>
      <div className="demand-meter-bar">
        {/* Fill bar - grows from bottom */}
        <div
          className="demand-meter-fill"
          style={{
            height: `${fillHeight}%`,
          }}
          role="meter"
          aria-valuenow={clampedValue}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} demand: ${clampedValue}%`}
        />
      </div>
      <span className="demand-meter-value">
        {clampedValue}%
      </span>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function DemandMeters() {
  // Subscribe to demand state from the game store
  const demand = useGameStore((state) => state.demand);

  return (
    <div
      className="demand-meters"
      role="group"
      aria-label="Zone demand meters"
    >
      <DemandMeter
        zone="residential"
        value={demand.residential}
        label="R"
      />
      <DemandMeter
        zone="commercial"
        value={demand.commercial}
        label="C"
      />
      <DemandMeter
        zone="industrial"
        value={demand.industrial}
        label="I"
      />
    </div>
  );
}
