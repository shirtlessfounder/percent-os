import { StatusBadge } from './StatusBadge';

type ProposalStatus = 'Pending' | 'Passed' | 'Failed' | 'Executed';

interface StatusBadgeBoxProps {
  status: ProposalStatus;
}

export function StatusBadgeBox({ status }: StatusBadgeBoxProps) {
  return (
    <div className="bg-theme-card border border-theme-border rounded-[9px] p-3 hover:border-theme-border-hover transition-all duration-300">
      <div className="text-theme-text flex items-center justify-center">
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
