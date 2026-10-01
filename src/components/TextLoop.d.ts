import type { CSSProperties, ComponentType } from 'react'

export interface TextLoopProps {
  text?: string
  shape?: 'wave' | 'circle' | 'infinity' | 'arch' | 'line'
  path?: string
  speed?: number
  direction?: 'forward' | 'reverse'
  separator?: string
  curviness?: number
  fontSize?: number
  fontWeight?: number | string
  letterSpacing?: number
  uppercase?: boolean
  color?: string
  ribbon?: boolean
  ribbonColor?: string
  ribbonWidth?: number
  pauseOnHover?: boolean
  className?: string
  style?: CSSProperties
}

declare const TextLoop: ComponentType<TextLoopProps>

export default TextLoop
