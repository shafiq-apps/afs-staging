'use client';

import { useEffect, useState } from 'react';

export interface LoadingBarProps {
  loading?: boolean;
  progress?: number;
}

export function LoadingBar({ loading = false, progress }: LoadingBarProps) {
  const [internalProgress, setInternalProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (loading) {
      setIsVisible(true);
      setInternalProgress(0);

      // Simulate progress if not provided
      if (progress === undefined) {
        const interval = setInterval(() => {
          setInternalProgress((prev) => {
            if (prev >= 90) {
              return 90;
            }
            return prev + Math.random() * 15;
          });
        }, 100);

        return () => clearInterval(interval);
      } else {
        setInternalProgress(progress);
      }
    } else {
      // Complete animation
      setInternalProgress(100);
      const timeout = setTimeout(() => {
        setIsVisible(false);
        setInternalProgress(0);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [loading, progress]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-1 bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 transition-all duration-300 ease-out shadow-lg shadow-blue-500/50"
        style={{
          width: `${internalProgress}%`,
          transition: internalProgress === 100 ? 'width 0.2s ease-out' : 'width 0.1s ease-out',
        }}
      />
    </div>
  );
}

