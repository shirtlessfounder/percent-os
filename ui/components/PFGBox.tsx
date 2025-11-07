interface PFGBoxProps {
  pfgPercentage: number | null;
}

export function PFGBox({ pfgPercentage }: PFGBoxProps) {
  return (
    <div className="bg-theme-card border border-theme-border rounded-[9px] py-3 px-5 hover:border-theme-border-hover transition-all duration-300">
      <div className="text-theme-text flex flex-col">
        <span className="text-sm text-theme-text font-semibold uppercase mb-6">PFG</span>
        <span className="text-sm font-mono font-semibold">
          {pfgPercentage !== null ? `${pfgPercentage.toFixed(2)}%` : '--'}
        </span>
      </div>
    </div>
  );
}
