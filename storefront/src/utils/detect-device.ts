type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
  type: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export function detectDevice(): DeviceInfo {
  const ua =
    navigator.userAgent ||
    navigator.vendor ||
    (window as unknown as { opera?: string }).opera ||
    '';

  const width: number = window.innerWidth;
  const hasTouch: boolean =
    'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const isIPad: boolean =
    /iPad/i.test(ua) ||
    (navigator.platform === 'MacIntel' && hasTouch);

  const isTablet: boolean =
    isIPad ||
    /Tablet/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
    (hasTouch && width >= 768 && width <= 1024);

  const isMobile: boolean =
    !isTablet &&
    (/Mobi|iPhone|Android/i.test(ua) || (hasTouch && width < 768));

  const isDesktop: boolean = !isMobile && !isTablet;

  return {
    type: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
    isMobile,
    isTablet,
    isDesktop
  };
}
