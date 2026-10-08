import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SPLASH_FADES_AT } from './lib/splash'

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

// The splash in index.html lets go once the app has drawn (see SPLASH_FADES_AT). Timers
// rather than animation frames, so a page opened in a background tab still lets go of it.
// If this never runs, the splash steps aside by itself after 10 s and uncovers the note
// in #root that rendering the app replaces.
const splash = document.getElementById('splash')
if (splash) {
  window.setTimeout(() => {
    splash.classList.add('done')
    window.setTimeout(() => splash.remove(), 500)
  }, SPLASH_FADES_AT - performance.now())
}
