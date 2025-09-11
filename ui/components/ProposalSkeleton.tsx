'use client';

import { memo } from 'react';

const ProposalSkeleton = memo(() => {
  return (
    <div className="w-full p-3 rounded-lg bg-[#1F1F1F] animate-pulse">
      <div className="relative overflow-hidden">
        {/* Title skeleton */}
        <div className="h-4 bg-[#2A2A2A] rounded w-3/4 mb-2"></div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {/* Status badge skeleton */}
        <div className="h-6 w-16 bg-[#2A2A2A] rounded-full"></div>
        {/* Date skeleton */}
        <div className="h-3 w-20 bg-[#2A2A2A] rounded"></div>
      </div>
    </div>
  );
});

ProposalSkeleton.displayName = 'ProposalSkeleton';

export const ProposalListSkeleton = memo(() => {
  return (
    <div className="space-y-1">
      {[...Array(5)].map((_, i) => (
        <ProposalSkeleton key={i} />
      ))}
    </div>
  );
});

ProposalListSkeleton.displayName = 'ProposalListSkeleton';

export default ProposalSkeleton;