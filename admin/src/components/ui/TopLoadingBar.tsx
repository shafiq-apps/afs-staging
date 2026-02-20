'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type LoadingState = {
  loading: boolean;
  progress: number;
};

export default function TopLoadingBar() {
  const pathname = usePathname();

  const [state, setState] = useState<LoadingState>({
    loading: false,
    progress: 0,
  });

  useEffect(() => {
    setState({ loading: true, progress: 0 });

    const interval = setInterval(() => {
      setState((prev) => {
        if (prev.progress >= 90) {
          return { ...prev, progress: 90 };
        }

        return {
          ...prev,
          progress: Math.min(prev.progress + Math.random() * 15, 90),
        };
      });
    }, 100);

    const timeout = setTimeout(() => {
      setState((prev) => ({ ...prev, progress: 100 }));

      const finishTimeout = setTimeout(() => {
        setState({ loading: false, progress: 0 });
      }, 200);

      return () => clearTimeout(finishTimeout);
    }, 300);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pathname]);

  if (!state.loading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-1 bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 shadow-lg shadow-blue-500/50"
        style={{
          width: `${state.progress}%`,
          transition: state.progress === 100 ? 'width 0.2s ease-out' : 'width 0.1s ease-out',
        }}
      />
    </div>
  );
}
