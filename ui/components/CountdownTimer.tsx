'use client';

import { useState, useEffect, memo } from 'react';

interface CountdownTimerProps {
  endsAt: number;
  onTimerEnd?: () => void;
  isPending?: boolean;
}

export const CountdownTimer = memo(({ endsAt, onTimerEnd, isPending }: CountdownTimerProps) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [hasEnded, setHasEnded] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const diff = endsAt - now;

      if (diff <= 0) {
        setTimeLeft('00:00:00');
        // Only trigger onTimerEnd if proposal is pending and we haven't already triggered
        if (!hasEnded && isPending) {
          setHasEnded(true);
          onTimerEnd?.();
        }
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [endsAt, hasEnded, onTimerEnd, isPending]);

  return <>{timeLeft}</>;
});

CountdownTimer.displayName = 'CountdownTimer';
