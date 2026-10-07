import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* Riders who ask their system for less motion get fades instead of movement. */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)

// The splash in index.html covers the page until the app has drawn, long enough for
// its logo animation to finish. Timers rather than animation frames, so a page opened
// in a background tab still lets go of it. If this never runs, the splash steps aside
// by itself after 10 s and uncovers the note in #root that rendering the app replaces.
const splash = document.getElementById('splash')
if (splash) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const wait = Math.max(reduced ? 100 : 1100 - performance.now(), 100)
  window.setTimeout(() => {
    splash.classList.add('done')
    window.setTimeout(() => splash.remove(), 500)
  }, wait)
}
