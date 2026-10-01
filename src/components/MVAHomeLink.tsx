import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function MVAHomeLink({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Link to="/" className={`mva-home-link${className ? ` ${className}` : ''}`} aria-label="Return to MVA home">{children}</Link>
}
