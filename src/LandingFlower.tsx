import { useEffect, useRef } from 'react'

const SOURCE_WIDTH = 1536
const SOURCE_HEIGHT = 1024
const FLOWER_CENTER = { x: 790, y: 554 }
const PETAL_COUNT = 12
const PIXEL_CELL_SIZE = 8
const ACTIVATION_RISE_MS = 110
const ACTIVATION_FADE_MS = 650

type FlowerCell = {
  id: number
  x: number
  y: number
  radius: number
  angle: number
  petal: number
  noise: number
}

type ExtractedFlower = {
  canvas: HTMLCanvasElement
  cells: FlowerCell[]
}

function isReferenceTypography(x: number, y: number) {
  return (
    (x < 615 && y < 315) ||
    (x < 410 && y > 382 && y < 515) ||
    (x < 205 && y > 915) ||
    (x > 1340 && y < 115) ||
    (x > 1140 && x < 1385 && y > 165 && y < 315) ||
    (x > 1220 && y > 545 && y < 705) ||
    (x > 1205 && y > 785)
  )
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function petalForAngle(angle: number) {
  const normalized = (angle + Math.PI * 2) % (Math.PI * 2)
  return Math.floor(normalized / (Math.PI * 2 / PETAL_COUNT))
}

function cellNoise(column: number, row: number) {
  const value = Math.sin(column * 12.9898 + row * 78.233) * 43758.5453
  return value - Math.floor(value)
}

function extractFlower(image: HTMLImageElement): ExtractedFlower | null {
  const source = document.createElement('canvas')
  source.width = SOURCE_WIDTH
  source.height = SOURCE_HEIGHT
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) return null
  sourceContext.drawImage(image, 0, 0, SOURCE_WIDTH, SOURCE_HEIGHT)

  const imageData = sourceContext.getImageData(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT)
  const pixels = imageData.data
  for (let y = 0; y < SOURCE_HEIGHT; y += 1) {
    for (let x = 0; x < SOURCE_WIDTH; x += 1) {
      const offset = (y * SOURCE_WIDTH + x) * 4
      const red = pixels[offset]
      const green = pixels[offset + 1]
      const blue = pixels[offset + 2]
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114
      const isBluePixel = blue - red > 22 && blue - green > 12
      const isFlowerPixel = luminance < 224 || isBluePixel

      if (!isFlowerPixel || isReferenceTypography(x, y)) {
        pixels[offset + 3] = 0
        continue
      }

      // Shape comes directly from land.png. The base state stays monochrome so
      // electronic blue is reserved for live pointer response.
      const gray = Math.max(18, Math.min(188, Math.round(luminance)))
      pixels[offset] = gray
      pixels[offset + 1] = gray
      pixels[offset + 2] = gray
      pixels[offset + 3] = Math.min(255, Math.max(70, (236 - luminance) * 5.2))
    }
  }
  sourceContext.putImageData(imageData, 0, 0)

  // The interaction index contains only cells with visible flower pixels.
  // Pointer input selects from this index instead of painting a new shape.
  const cells: FlowerCell[] = []
  for (let y = 0; y < SOURCE_HEIGHT; y += PIXEL_CELL_SIZE) {
    for (let x = 0; x < SOURCE_WIDTH; x += PIXEL_CELL_SIZE) {
      let occupiedPixels = 0
      const maxY = Math.min(SOURCE_HEIGHT, y + PIXEL_CELL_SIZE)
      const maxX = Math.min(SOURCE_WIDTH, x + PIXEL_CELL_SIZE)
      for (let sampleY = y; sampleY < maxY; sampleY += 2) {
        for (let sampleX = x; sampleX < maxX; sampleX += 2) {
          if (pixels[(sampleY * SOURCE_WIDTH + sampleX) * 4 + 3] > 28) occupiedPixels += 1
        }
      }
      if (occupiedPixels < 2) continue

      const centerX = x + PIXEL_CELL_SIZE / 2
      const centerY = y + PIXEL_CELL_SIZE / 2
      const dx = centerX - FLOWER_CENTER.x
      const dy = centerY - FLOWER_CENTER.y
      const angle = Math.atan2(dy, dx)
      cells.push({
        id: cells.length,
        x,
        y,
        radius: Math.hypot(dx, dy),
        angle,
        petal: petalForAngle(angle),
        noise: cellNoise(x / PIXEL_CELL_SIZE, y / PIXEL_CELL_SIZE),
      })
    }
  }

  return { canvas: source, cells }
}

function selectActivatedCells(cells: FlowerCell[], sourceX: number, sourceY: number) {
  let nearest: FlowerCell | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const cell of cells) {
    const dx = cell.x + PIXEL_CELL_SIZE / 2 - sourceX
    const dy = cell.y + PIXEL_CELL_SIZE / 2 - sourceY
    const distance = dx * dx + dy * dy
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = cell
    }
  }

  // Empty space never creates blue pixels, even when it is inside the canvas.
  if (!nearest || nearestDistance > 42 * 42) return new Set<number>()

  const anchorRadius = nearest.radius
  const anchorAngle = nearest.angle
  const nearCore = anchorRadius < 150
  const candidates = cells
    .filter(cell => {
      if (!nearCore && cell.petal !== nearest.petal) return false
      const longitudinalDistance = Math.abs(cell.radius - anchorRadius)
      const lateralDistance = Math.abs(normalizeAngle(cell.angle - anchorAngle)) * Math.max(110, anchorRadius)
      const irregularLongEdge = 92 + cell.noise * 34
      const irregularSideEdge = 38 + cell.noise * 25
      return longitudinalDistance < irregularLongEdge && lateralDistance < irregularSideEdge
    })
    .sort((a, b) => {
      const aLong = Math.abs(a.radius - anchorRadius) / 112
      const bLong = Math.abs(b.radius - anchorRadius) / 112
      const aSide = Math.abs(normalizeAngle(a.angle - anchorAngle)) * Math.max(110, anchorRadius) / 58
      const bSide = Math.abs(normalizeAngle(b.angle - anchorAngle)) * Math.max(110, anchorRadius) / 58
      return aLong + aSide + a.noise * 0.2 - (bLong + bSide + b.noise * 0.2)
    })
    .slice(0, nearCore ? 42 : 68)

  return new Set(candidates.map(cell => cell.id))
}

export function LandingFlower() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flowerRef = useRef<HTMLCanvasElement | null>(null)
  const cellsRef = useRef<FlowerCell[]>([])
  const selectedCellsRef = useRef<Set<number>>(new Set())
  const activeLevelsRef = useRef<Map<number, number>>(new Map())
  const reduceMotionRef = useRef(false)
  const frame = useRef<number | null>(null)
  const redraw = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    reduceMotionRef.current = reduceMotion
    let disposed = false
    let previousTime = 0

    const draw = (time = 0) => {
      const flower = flowerRef.current
      if (!flower) return
      const elapsed = previousTime ? Math.min(40, time - previousTime) : 16
      previousTime = time
      context.clearRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT)

      const radius = 1240
      for (let index = 0; index < PETAL_COUNT; index += 1) {
        const start = -Math.PI + index * Math.PI * 2 / PETAL_COUNT
        const end = start + Math.PI * 2 / PETAL_COUNT + 0.025
        const breath = reduceMotion ? 0 : Math.sin(time * 0.00036 + index * 0.78) * 3.1
        context.save()
        context.beginPath()
        context.moveTo(FLOWER_CENTER.x, FLOWER_CENTER.y)
        context.arc(FLOWER_CENTER.x, FLOWER_CENTER.y, radius, start, end)
        context.closePath()
        context.clip()
        context.drawImage(flower, 0, breath)
        context.restore()
      }

      // The flower core is stable while the petals breathe around it.
      context.save()
      context.beginPath()
      context.arc(FLOWER_CENTER.x, FLOWER_CENTER.y, 128, 0, Math.PI * 2)
      context.clip()
      context.drawImage(flower, 0, 0)
      context.restore()

      const selectedCells = selectedCellsRef.current
      const activeLevels = activeLevelsRef.current
      for (const id of selectedCells) {
        if (!activeLevels.has(id)) activeLevels.set(id, 0)
      }

      for (const [id, currentLevel] of activeLevels) {
        const isSelected = selectedCells.has(id)
        const nextLevel = isSelected
          ? Math.min(1, currentLevel + elapsed / ACTIVATION_RISE_MS)
          : Math.max(0, currentLevel - elapsed / ACTIVATION_FADE_MS)
        if (!isSelected && nextLevel <= 0) activeLevels.delete(id)
        else activeLevels.set(id, nextLevel)
      }

      // Every blue rectangle is clipped by the rendered flower. Only original
      // flower pixels can change colour; the background and outline stay intact.
      context.save()
      context.globalCompositeOperation = 'source-atop'
      for (const [id, level] of activeLevels) {
        const cell = cellsRef.current[id]
        if (!cell || level <= 0) continue
        const breath = reduceMotion || cell.radius < 128
          ? 0
          : Math.sin(time * 0.00036 + cell.petal * 0.78) * 3.1
        const opacity = level * (0.82 + cell.noise * 0.16)
        context.fillStyle = `rgba(20, 82, 239, ${opacity})`
        context.fillRect(cell.x, cell.y + breath, PIXEL_CELL_SIZE, PIXEL_CELL_SIZE)
      }
      context.restore()
    }

    const animate = (time: number) => {
      draw(time)
      if (!reduceMotion && !disposed) frame.current = requestAnimationFrame(animate)
    }

    const image = new Image()
    image.decoding = 'async'
    image.src = '/references/land.png'
    image.onload = () => {
      if (disposed) return
      const extracted = extractFlower(image)
      flowerRef.current = extracted?.canvas ?? null
      cellsRef.current = extracted?.cells ?? []
      redraw.current = () => draw(performance.now())
      if (reduceMotion) draw()
      else frame.current = requestAnimationFrame(animate)
    }

    return () => {
      disposed = true
      flowerRef.current = null
      cellsRef.current = []
      selectedCellsRef.current.clear()
      activeLevelsRef.current.clear()
      redraw.current = null
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])

  const updatePointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const fit = window.getComputedStyle(canvas).objectFit
    const scale = fit === 'cover'
      ? Math.max(rect.width / SOURCE_WIDTH, rect.height / SOURCE_HEIGHT)
      : Math.min(rect.width / SOURCE_WIDTH, rect.height / SOURCE_HEIGHT)
    const renderedWidth = SOURCE_WIDTH * scale
    const renderedHeight = SOURCE_HEIGHT * scale
    const offsetX = (rect.width - renderedWidth) / 2
    const offsetY = (rect.height - renderedHeight) / 2
    const sourceX = (clientX - rect.left - offsetX) / scale
    const sourceY = (clientY - rect.top - offsetY) / scale
    const selectedCells = selectActivatedCells(cellsRef.current, sourceX, sourceY)
    selectedCellsRef.current = selectedCells

    if (reduceMotionRef.current) {
      activeLevelsRef.current.clear()
      for (const id of selectedCells) activeLevelsRef.current.set(id, 1)
    }
    redraw.current?.()
  }

  const resetPointer = () => {
    selectedCellsRef.current = new Set()
    if (reduceMotionRef.current) activeLevelsRef.current.clear()
    redraw.current?.()
  }

  return <canvas
    ref={canvasRef}
    className="landing-flower"
    width={SOURCE_WIDTH}
    height={SOURCE_HEIGHT}
    aria-hidden="true"
    onPointerEnter={event => updatePointer(event.clientX, event.clientY)}
    onPointerMove={event => updatePointer(event.clientX, event.clientY)}
    onPointerLeave={resetPointer}
  />
}
