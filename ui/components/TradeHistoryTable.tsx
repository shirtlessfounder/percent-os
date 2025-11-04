import { formatNumber, formatVolume } from '@/lib/formatters';

interface Trade {
  id: number;
  userAddress: string;
  market: 'pass' | 'fail';
  isBaseToQuote: boolean;
  amountIn: string;
  txSignature: string | null;
  timestamp: string;
}

interface TradeHistoryTableProps {
  trades: Trade[];
  loading: boolean;
  getTimeAgo: (timestamp: string) => string;
  formatAddress: (address: string) => string;
  getTokenUsed: (isBaseToQuote: boolean, market: 'pass' | 'fail') => string;
}

const GRID_COLUMNS = '1.5fr 0.7fr 0.7fr 1.5fr 1.5fr 0.7fr';

export function TradeHistoryTable({
  trades,
  loading,
  getTimeAgo,
  formatAddress,
  getTokenUsed
}: TradeHistoryTableProps) {
  return (
    <div className="border-b border-l border-r border-[#282828]">
      {/* Table Header */}
      <div
        className="grid gap-4 px-4 py-3 text-xs text-[#9C9D9E] font-medium border-b border-theme-border-hover"
        style={{ gridTemplateColumns: GRID_COLUMNS }}
      >
        <div>Trader</div>
        <div>Bet</div>
        <div>Type</div>
        <div>Amount</div>
        <div>Tx</div>
        <div className="text-right">Age</div>
      </div>

      {/* Table Body - Scrollable */}
      <div className="max-h-[400px] overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="px-4 py-8 text-center text-[#9C9D9E] text-xs">
            Loading trades...
          </div>
        ) : trades.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#9C9D9E] text-xs">
            No trades yet
          </div>
        ) : (
          trades.map((trade) => {
            const tokenUsed = getTokenUsed(trade.isBaseToQuote, trade.market);
            const isBuy = !trade.isBaseToQuote;
            const amount = parseFloat(trade.amountIn);
            const decimals = tokenUsed === 'SOL' ? 3 : 0;
            const formattedAmount = formatNumber(amount, decimals);

            return (
              <div
                key={trade.id}
                className="grid gap-4 px-4 py-3 text-xs hover:bg-[#272A2D]/30 transition-colors"
                style={{ gridTemplateColumns: GRID_COLUMNS }}
              >
                <div className="text-theme-text flex items-center gap-1">
                  <span>{formatAddress(trade.userAddress)}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(trade.userAddress)}
                    className="text-[#9C9D9E] hover:text-theme-text transition-colors"
                    title="Copy address"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                  <a
                    href={`https://solscan.io/account/${trade.userAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#9C9D9E] hover:text-theme-text transition-colors"
                    title="View on Solscan"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                  </a>
                </div>
                <div style={{ color: trade.market === 'pass' ? '#6ECC94' : '#FF6F94' }}>
                  {trade.market === 'pass' ? 'Pass' : 'Fail'}
                </div>
                <div style={{ color: isBuy ? '#6ECC94' : '#FF6F94' }}>
                  {isBuy ? 'Buy' : 'Sell'}
                </div>
                <div className="text-theme-text">
                  {formattedAmount} {tokenUsed}
                </div>
                <div className="text-theme-text flex items-center gap-1">
                  <span>{trade.txSignature ? `${trade.txSignature.slice(0, 4)}...${trade.txSignature.slice(-4)}` : '—'}</span>
                  {trade.txSignature && (
                    <a
                      href={`https://solscan.io/tx/${trade.txSignature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#9C9D9E] hover:text-theme-text transition-colors"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  )}
                </div>
                <div className="text-[#9C9D9E] text-right">{getTimeAgo(trade.timestamp)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
