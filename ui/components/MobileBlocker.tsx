'use client';

import { useEffect, useState } from 'react';

export default function MobileBlocker({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkIfMobile = () => {
      // Check both user agent and screen width
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileUA = /iphone|ipad|ipod|android|blackberry|windows phone/i.test(userAgent);
      const isMobileWidth = window.innerWidth < 768; // Tailwind's md breakpoint

      setIsMobile(isMobileUA || isMobileWidth);
      setIsChecking(false);
    };

    checkIfMobile();

    // Re-check on resize
    window.addEventListener('resize', checkIfMobile);
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Don't show anything while checking to avoid flash
  if (isChecking) {
    return null;
  }

  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-theme-secondary flex items-center justify-center p-6 z-50">
        <div className="max-w-md text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-theme-text">📱</h1>
            <h2 className="text-2xl font-bold text-theme-text">Mobile Coming Soon</h2>
          </div>

          <p className="text-theme-text-secondary text-lg">
            The mobile experience is currently under development. Please visit us on desktop for the full trading experience.
          </p>

          <div className="pt-4">
            <p className="text-sm text-theme-text-disabled">
              For the best experience, we recommend using a desktop browser with a minimum width of 768px.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
