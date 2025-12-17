/**
 * BudgetPanel Component
 *
 * Displays monthly budget breakdown: income from taxes,
 * expenses for infrastructure maintenance, and net change.
 */

import { useGameStore } from '@/store';
import './BudgetPanel.css';

// =============================================================================
// Helper Functions
// =============================================================================

function formatCurrency(value: number, showSign = false): string {
  const absValue = Math.abs(value);
  const formatted = absValue.toLocaleString();
  
  if (showSign) {
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  }
  
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

// =============================================================================
// Sub-components
// =============================================================================

interface BudgetLineProps {
  label: string;
  amount: number;
  type: 'income' | 'expense' | 'net';
  icon?: string;
}

function BudgetLine({ label, amount, type, icon }: BudgetLineProps) {
  const displayAmount = type === 'expense' 
    ? formatCurrency(-amount, true)
    : type === 'net'
      ? formatCurrency(amount, true)
      : formatCurrency(amount, true);
  
  const valueClass = type === 'expense' 
    ? 'expense' 
    : type === 'net' 
      ? (amount >= 0 ? 'positive' : 'negative')
      : 'income';

  return (
    <div className={`budget-line budget-line-${type}`}>
      {icon && <span className="budget-line-icon">{icon}</span>}
      <span className="budget-line-label">{label}</span>
      <span className={`budget-line-amount ${valueClass}`}>{displayAmount}</span>
    </div>
  );
}

interface BalanceDisplayProps {
  balance: number;
  isInDeficit: boolean;
}

function BalanceDisplay({ balance, isInDeficit }: BalanceDisplayProps) {
  const isNegative = balance < 0;
  const isLow = balance < 5000 && balance >= 0;
  const balanceClass = isNegative ? 'negative' : isLow ? 'low' : 'positive';
  
  // Show warning icon when in deficit
  const icon = isInDeficit ? '⚠️' : '💰';

  return (
    <div className={`budget-balance ${balanceClass} ${isInDeficit ? 'deficit' : ''}`}>
      <span className="budget-balance-icon">{icon}</span>
      <span className="budget-balance-label">Balance</span>
      <span className="budget-balance-value">{formatCurrency(balance)}</span>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function BudgetPanel() {
  const budget = useGameStore((state) => state.budget);
  const budgetBreakdown = useGameStore((state) => state.budgetBreakdown);
  const isInDeficit = useGameStore((state) => state.isInDeficit);

  const {
    taxRevenue,
    roadMaintenance,
    powerMaintenance,
    waterMaintenance,
    policeMaintenance,
    netChange,
  } = budgetBreakdown;

  // Check if there's any budget activity to show
  const hasActivity = taxRevenue > 0 || roadMaintenance > 0 || powerMaintenance > 0 || waterMaintenance > 0 || policeMaintenance > 0;

  return (
    <div className={`budget-panel ${isInDeficit ? 'budget-panel-deficit' : ''}`} role="region" aria-label="City budget">
      {/* Current Balance */}
      <BalanceDisplay balance={budget} isInDeficit={isInDeficit} />

      {/* Divider */}
      <div className="budget-divider" aria-hidden="true" />

      {/* Monthly Breakdown */}
      <div className="budget-breakdown">
        {/* Income Section */}
        <BudgetLine 
          label="Taxes" 
          amount={taxRevenue} 
          type="income" 
          icon="💵"
        />

        {/* Expenses Section */}
        {roadMaintenance > 0 && (
          <BudgetLine 
            label="Roads" 
            amount={roadMaintenance} 
            type="expense" 
            icon="🛣️"
          />
        )}
        {powerMaintenance > 0 && (
          <BudgetLine 
            label="Power" 
            amount={powerMaintenance} 
            type="expense" 
            icon="⚡"
          />
        )}
        {waterMaintenance > 0 && (
          <BudgetLine 
            label="Water" 
            amount={waterMaintenance} 
            type="expense" 
            icon="💧"
          />
        )}
        {policeMaintenance > 0 && (
          <BudgetLine 
            label="Police" 
            amount={policeMaintenance} 
            type="expense" 
            icon="👮"
          />
        )}

        {/* Net Change */}
        {hasActivity && (
          <>
            <div className="budget-breakdown-divider" aria-hidden="true" />
            <BudgetLine 
              label="Net/mo" 
              amount={netChange} 
              type="net"
            />
          </>
        )}
      </div>
    </div>
  );
}
