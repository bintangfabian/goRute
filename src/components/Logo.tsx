// The goRute mark: a "g" whose bowl is where you start and whose tail is the
// route to an amber stop. Paths come from the master in public/favicon.svg.
const ROUTE =
  'M61 88A68 68 0 1 1 197 88A68 68 0 1 1 61 88Z M97 88A32 32 0 1 0 161 88A32 32 0 1 0 97 88Z M161 38A18 18 0 0 1 197 38V152A68 68 0 0 1 129 220H111V184H129A32 32 0 0 0 161 152Z'
const STOP = 'M59 202A30 30 0 1 1 119 202A30 30 0 1 1 59 202Z M78 202A11 11 0 1 0 100 202A11 11 0 1 0 78 202Z'

/** The mark on its teal tile, as on the app icon. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden="true">
      <rect width="256" height="256" rx="58" fill="#0f766e" />
      <g transform="translate(43.52 43.52) scale(0.66)">
        <path fill="#fff" d={ROUTE} />
        <path fill="#fbbf24" d={STOP} />
      </g>
    </svg>
  )
}

/** "goRute" with "go" in the brand colour. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight text-slate-900 ${className}`}>
      <span className="text-brand">go</span>Rute
    </span>
  )
}
