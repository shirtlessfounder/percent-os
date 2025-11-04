import MarketChart from './MarketChart';

interface ChartBoxProps {
  proposalId: number;
  selectedMarket: 'pass' | 'fail';
}

export function ChartBox({ proposalId, selectedMarket }: ChartBoxProps) {
  const borderColor = selectedMarket === 'pass'
    ? 'rgba(110, 204, 148, 0.1)'
    : 'rgba(255, 111, 148, 0.1)';

  const hoverBorderColor = selectedMarket === 'pass'
    ? 'rgba(110, 204, 148, 0.3)'
    : 'rgba(255, 111, 148, 0.3)';

  return (
    <div
      className="bg-theme-card border rounded-[9px] p-3 transition-all duration-300"
      style={{ borderColor }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = hoverBorderColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = borderColor;
      }}
    >
      <div className="bg-[#1A1A1A] overflow-hidden rounded-lg">
        <MarketChart proposalId={proposalId} market={selectedMarket} height={512} />
      </div>
    </div>
  );
}
