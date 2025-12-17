/**
 * Tooltip Component
 *
 * Displays zone information when hovering over zone tiles.
 * Shows zone type, road access, power, and water status.
 */

import { useUIStore } from '@/store';
import './Tooltip.css';

/**
 * Zone type labels for display
 */
const ZONE_LABELS: Record<string, string> = {
  residential: 'Residential Zone',
  commercial: 'Commercial Zone',
  industrial: 'Industrial Zone',
};

/**
 * Zone icons for display
 */
const ZONE_ICONS: Record<string, string> = {
  residential: '🏠',
  commercial: '🏪',
  industrial: '🏭',
};

/**
 * Abandonment reason labels for display
 */
const ABANDONMENT_REASON_LABELS: Record<string, string> = {
  no_power: 'No Power (3+ months)',
  no_water: 'No Water (3+ months)',
  high_crime: 'High Crime (3+ months)',
  high_pollution: 'High Pollution (3+ months)',
};

/**
 * Get crime level label and class based on crime value (0-100)
 */
function getCrimeLevelInfo(crimeLevel: number): { label: string; className: string } {
  if (crimeLevel === 0) {
    return { label: 'None', className: 'crime-none' };
  } else if (crimeLevel <= 25) {
    return { label: 'Low', className: 'crime-low' };
  } else if (crimeLevel <= 50) {
    return { label: 'Medium', className: 'crime-medium' };
  } else if (crimeLevel <= 75) {
    return { label: 'High', className: 'crime-high' };
  } else {
    return { label: 'Extreme', className: 'crime-extreme' };
  }
}

/**
 * Get pollution level label and class based on pollution value (0-100)
 */
function getPollutionLevelInfo(pollutionLevel: number): { label: string; className: string } {
  if (pollutionLevel === 0) {
    return { label: 'None', className: 'pollution-none' };
  } else if (pollutionLevel <= 25) {
    return { label: 'Low', className: 'pollution-low' };
  } else if (pollutionLevel <= 50) {
    return { label: 'Medium', className: 'pollution-medium' };
  } else if (pollutionLevel <= 75) {
    return { label: 'High', className: 'pollution-high' };
  } else {
    return { label: 'Extreme', className: 'pollution-extreme' };
  }
}

/**
 * Tooltip component that shows zone information
 */
export function Tooltip() {
  const tooltipInfo = useUIStore((state) => state.tooltipInfo);

  // Don't render if no tooltip info
  if (!tooltipInfo) {
    return null;
  }

  const { 
    screenX, 
    screenY, 
    zoneType, 
    hasRoadAccess, 
    hasPower, 
    hasWater, 
    crimeLevel, 
    hasPoliceCoverage, 
    pollutionLevel,
    isAbandoned,
    abandonmentReason,
    developmentProgress,
  } = tooltipInfo;
  const label = ZONE_LABELS[zoneType] || 'Unknown Zone';
  const icon = ZONE_ICONS[zoneType] || '❓';
  const crimeInfo = getCrimeLevelInfo(crimeLevel);
  const pollutionInfo = getPollutionLevelInfo(pollutionLevel);

  // Check if any utility is missing
  const missingUtilities: string[] = [];
  if (!hasRoadAccess) missingUtilities.push('road');
  if (!hasPower) missingUtilities.push('power');
  if (!hasWater) missingUtilities.push('water');

  // Generate hint message for missing utilities or abandonment
  const getHintMessage = () => {
    const hints: string[] = [];
    
    if (isAbandoned) {
      hints.push('Bulldoze this building ($5) to clear and rebuild');
      return hints;
    }
    
    if (missingUtilities.length === 0) return null;
    
    if (!hasRoadAccess) hints.push('Place a road adjacent to this zone');
    if (!hasPower) hints.push('Connect to power grid with power lines');
    if (!hasWater) hints.push('Connect to water network with pipes');
    
    return hints;
  };

  const hints = getHintMessage();

  // Position tooltip near cursor with offset
  // Adjust position to keep tooltip on screen
  const tooltipStyle: React.CSSProperties = {
    left: screenX + 16,
    top: screenY + 16,
  };

  return (
    <div className={`tooltip ${isAbandoned ? 'tooltip-abandoned' : ''}`} style={tooltipStyle} role="tooltip">
      <div className="tooltip-header">
        <span className="tooltip-icon">{icon}</span>
        <span className="tooltip-title">{label}</span>
      </div>
      
      {/* Abandoned Warning Banner */}
      {isAbandoned && (
        <div className="tooltip-abandoned-banner">
          <span className="abandoned-icon">⚠️</span>
          <span className="abandoned-text">ABANDONED</span>
        </div>
      )}
      
      <div className="tooltip-content">
        {/* Abandonment Reason (if abandoned) */}
        {isAbandoned && abandonmentReason && (
          <div className="tooltip-status status-error tooltip-abandonment-reason">
            <span className="status-icon">❌</span>
            <span className="status-text">
              {ABANDONMENT_REASON_LABELS[abandonmentReason] || 'Unknown reason'}
            </span>
          </div>
        )}
        
        {/* Development Progress (if not fully developed) */}
        {developmentProgress !== undefined && developmentProgress < 100 && !isAbandoned && (
          <div className="tooltip-status status-info">
            <span className="status-icon">🏗️</span>
            <span className="status-text">
              Development: {Math.round(developmentProgress)}%
            </span>
          </div>
        )}
        
        {/* Road Access Status */}
        <div className={`tooltip-status ${hasRoadAccess ? 'status-ok' : 'status-warning'}`}>
          <span className="status-icon">{hasRoadAccess ? '✓' : '✗'}</span>
          <span className="status-text">
            {hasRoadAccess ? 'Road Access' : 'No Road Access'}
          </span>
        </div>
        
        {/* Power Status */}
        <div className={`tooltip-status ${hasPower ? 'status-ok' : 'status-warning'}`}>
          <span className="status-icon">{hasPower ? '✓' : '✗'}</span>
          <span className="status-text">
            {hasPower ? 'Power' : 'No Power'}
          </span>
        </div>
        
        {/* Water Status */}
        <div className={`tooltip-status ${hasWater ? 'status-ok' : 'status-warning'}`}>
          <span className="status-icon">{hasWater ? '✓' : '✗'}</span>
          <span className="status-text">
            {hasWater ? 'Water' : 'No Water'}
          </span>
        </div>
        
        {/* Crime Level */}
        <div className={`tooltip-status tooltip-crime ${crimeInfo.className}`}>
          <span className="status-icon">🚨</span>
          <span className="status-text">
            Crime: {crimeInfo.label} ({Math.round(crimeLevel)})
          </span>
        </div>
        
        {/* Police Coverage */}
        <div className={`tooltip-status ${hasPoliceCoverage ? 'status-ok' : 'status-neutral'}`}>
          <span className="status-icon">{hasPoliceCoverage ? '👮' : '👮'}</span>
          <span className="status-text">
            {hasPoliceCoverage ? 'Police Coverage' : 'No Police Coverage'}
          </span>
        </div>
        
        {/* Pollution Level */}
        <div className={`tooltip-status tooltip-pollution ${pollutionInfo.className}`}>
          <span className="status-icon">🏭</span>
          <span className="status-text">
            Pollution: {pollutionInfo.label} ({Math.round(pollutionLevel)})
          </span>
        </div>
        
        {/* Hints for missing utilities or abandonment */}
        {hints && hints.length > 0 && (
          <div className="tooltip-hints">
            {hints.map((hint, index) => (
              <div key={index} className="tooltip-hint">
                {hint}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
