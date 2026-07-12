// Thin wrapper around gtag so game code can log events without caring
// whether analytics loaded (ad blockers, offline dev, etc.).

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(event: string, params?: Record<string, string | number | boolean>) {
  try {
    window.gtag?.('event', event, params);
  } catch {
    /* analytics must never break the game */
  }
}
