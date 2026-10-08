/**
 * When the splash in index.html starts to fade, on the performance.now() clock, or 0 without
 * one. It covers the page until the app has drawn, long enough for its logo animation to
 * finish; the panel times its entrance by it, or the slide-in would play unseen underneath.
 */
export const SPLASH_FADES_AT = (() => {
  if (!document.getElementById('splash')) return 0
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const now = performance.now()
  return now + Math.max(reduced ? 100 : 1100 - now, 100)
})()
