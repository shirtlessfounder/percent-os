'use client';

import { memo } from 'react';
import { IoMdStopwatch } from 'react-icons/io';
import { CountdownTimer } from './CountdownTimer';

interface ProgressBarProps {
  status: string;
  passThresholdBps: number;
  pfgPercentage: number | null;
  isPassing: boolean;
  finalizedAt: number;
  onTimerEnd?: () => void;
}

export const ProgressBar = memo(({
  status,
  passThresholdBps,
  pfgPercentage,
  isPassing,
  finalizedAt,
  onTimerEnd
}: ProgressBarProps) => {
  const calculateProgressWidth = () => {
    if (status === 'Passed' || status === 'Executed') return 100;
    if (status === 'Failed') return 0;
    if (pfgPercentage !== null) {
      const thresholdPercentage = passThresholdBps / 100;
      const progressPercentage = (pfgPercentage / thresholdPercentage) * 100;
      console.log('Progress Bar Debug:', {
        pfgPercentage,
        passThresholdBps,
        thresholdPercentage,
        progressPercentage,
        finalWidth: Math.min(100, Math.max(0, progressPercentage))
      });
      return Math.min(100, Math.max(0, progressPercentage));
    }
    return 0;
  };

  const getProgressBarColor = () => {
    if (status === 'Passed' || status === 'Executed') return 'bg-emerald-500';
    if (status === 'Failed') return 'bg-rose-500';
    return 'bg-emerald-500';
  };

  const getTargetText = () => {
    if (status === 'Failed') return 'Failed';
    if (status === 'Passed' || status === 'Executed') return 'Passed';
    return `Target PFG: ${(passThresholdBps / 100).toFixed(2)}%`;
  };

  const getTargetTextColor = () => {
    if (status === 'Failed') return 'text-rose-400';
    if (status === 'Passed' || status === 'Executed') return 'text-white';
    return 'text-gray-500';
  };

  return (
    <div className="border-t border-l border-r border-[#282828] px-4 py-4">
      <div className="flex items-center gap-6">
        {/* Progress Bar */}
        <div className="relative flex-1">
          <div className="relative h-10 bg-[#2A2A2A] rounded-full overflow-hidden border border-[#2A2A2A] flex items-center">
            {/* Pass/Failed/Passed text at the end - behind progress bar */}
            <span className={`absolute right-4 text-sm font-medium z-10 ${getTargetTextColor()}`}>
              {getTargetText()}
            </span>
            {/* Progress Fill - on top to overlap text */}
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3 z-20 ${getProgressBarColor()}`}
              style={{ width: `${calculateProgressWidth()}%` }}
            >
              {/* Percentage Text inside progress - show TWAP-based PFG for Pending status */}
              {status === 'Pending' && (
                <span className="text-base font-bold text-white">
                  {pfgPercentage !== null
                    ? isPassing
                      ? `${pfgPercentage.toFixed(2)}% (Passing)`
                      : `${pfgPercentage.toFixed(2)}%`
                    : 'Loading TWAP...'
                  }
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Countdown Timer */}
        <div className="flex items-center justify-center gap-2 w-36">
          {/* Stopwatch Icon */}
          <IoMdStopwatch className="w-6 h-6 text-gray-400 flex-shrink-0" />
          <div className="text-2xl font-mono font-bold text-white">
            <CountdownTimer
              endsAt={finalizedAt}
              onTimerEnd={onTimerEnd}
              isPending={status === 'Pending'}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';
