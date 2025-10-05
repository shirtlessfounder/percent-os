import { formatNumber } from '@/lib/formatters';

interface UserMarketBalancesProps {
  userBalances: {
    base: { passConditional: string; failConditional: string };
    quote: { passConditional: string; failConditional: string };
  };
}

export function UserMarketBalances({ userBalances }: UserMarketBalancesProps) {
  return (
    <div className="grid grid-cols-2 gap-4 mt-6">
      {/* Pass Market Column */}
      <div className="space-y-4">
        {/* Pass Market Balance */}
        <div className="bg-[#1A1A1A] border border-emerald-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-emerald-400">If Proposal Passes</span>
            <span className="text-xs text-gray-500">Balance</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-400">$ZC:</span>
              <span className="text-sm font-semibold text-white">
                {formatNumber(parseFloat(userBalances.base.passConditional || '0') / 1e6, 2)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-400">SOL:</span>
              <span className="text-sm font-semibold text-white">
                {formatNumber(parseFloat(userBalances.quote.passConditional || '0') / 1e9, 6)}
              </span>
            </div>
          </div>
        </div>

        {/* Pass Market Chart */}
        <div className="bg-[#1A1A1A] border border-emerald-500/20 rounded-lg p-4 h-64">
          <div className="text-xs font-medium text-emerald-400 mb-2">Pass Market Chart</div>
          <div className="flex items-center justify-center h-[calc(100%-2rem)] text-gray-500 text-sm">
            Chart coming soon
          </div>
        </div>
      </div>

      {/* Fail Market Column */}
      <div className="space-y-4">
        {/* Fail Market Balance */}
        <div className="bg-[#1A1A1A] border border-rose-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-rose-400">If Proposal Fails</span>
            <span className="text-xs text-gray-500">Balance</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-400">$ZC:</span>
              <span className="text-sm font-semibold text-white">
                {formatNumber(parseFloat(userBalances.base.failConditional || '0') / 1e6, 2)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-400">SOL:</span>
              <span className="text-sm font-semibold text-white">
                {formatNumber(parseFloat(userBalances.quote.failConditional || '0') / 1e9, 6)}
              </span>
            </div>
          </div>
        </div>

        {/* Fail Market Chart */}
        <div className="bg-[#1A1A1A] border border-rose-500/20 rounded-lg p-4 h-64">
          <div className="text-xs font-medium text-rose-400 mb-2">Fail Market Chart</div>
          <div className="flex items-center justify-center h-[calc(100%-2rem)] text-gray-500 text-sm">
            Chart coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
