interface StartDateBoxProps {
  createdAt: number; // Unix timestamp
}

export function StartDateBox({ createdAt }: StartDateBoxProps) {
  return (
    <div className="bg-theme-card border border-theme-border rounded-[9px] py-3 px-5 hover:border-theme-border-hover transition-all duration-300">
      <div className="text-theme-text flex flex-col">
        <span className="text-sm text-theme-text font-semibold uppercase mb-6">Started</span>
        <span className="text-sm text-theme-text-secondary">
          {new Date(createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          })} {new Date(createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      </div>
    </div>
  );
}
