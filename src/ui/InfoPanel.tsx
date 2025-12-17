/**
 * InfoPanel Component
 *
 * Displays city information: Population and Date.
 * Budget display is handled by BudgetPanel for more detailed breakdown.
 */

import { useGameStore } from '@/store';
import './InfoPanel.css';

// =============================================================================
// Helper Functions
// =============================================================================

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function getMonthName(month: number): string {
  return MONTH_NAMES_SHORT[month - 1] || '???';
}

// =============================================================================
// Sub-components
// =============================================================================

interface PopulationDisplayProps {
  population: number;
}

function PopulationDisplay({ population }: PopulationDisplayProps) {
  return (
    <div className="info-stat info-population">
      <span className="info-stat-icon">👥</span>
      <span className="info-stat-label">Population</span>
      <span className="info-stat-value">{formatNumber(population)}</span>
    </div>
  );
}

interface DateDisplayProps {
  month: number;
  year: number;
}

function DateDisplay({ month, year }: DateDisplayProps) {
  return (
    <div className="info-stat info-date">
      <span className="info-stat-icon">📅</span>
      <span className="info-stat-label">Date</span>
      <div className="info-date-value">
        <span className="info-date-month">{getMonthName(month)}</span>
        <span className="info-date-year">Year {year}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function InfoPanel() {
  // Get values from game store (real-time updates)
  const population = useGameStore((state) => state.population);
  const gameYear = useGameStore((state) => state.gameYear);
  const gameMonth = useGameStore((state) => state.gameMonth);

  return (
    <div className="info-panel" role="region" aria-label="City information">
      <PopulationDisplay population={population} />
      <div className="info-divider" aria-hidden="true" />
      <DateDisplay month={gameMonth} year={gameYear} />
    </div>
  );
}
