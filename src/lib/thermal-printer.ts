'use client'

import { encodeT02Job, toRaster, T02_PREAMBLE_LENGTHS } from '@/domain/thermal-print'

/**
 * The T02 over Web Bluetooth.
 *
 * Android Chrome only: iOS has no Web Bluetooth, and Samsung Internet hides
 * it. Where it is missing, the label falls back to the print screen.
 *
 * One printer per tab, remembered for the whole session: choosing it is the
 * only step that needs a tap of its own (the browser insists the picker opens
 * from a tap), and every label after that prints straight away. A dropped
 * connection is reopened on the next print without asking again.
 */

// The few Web Bluetooth types used here; the DOM library does not ship them.
type Characteristic = {
  writeValue(data: BufferSource): Promise<void>
  writeValueWithoutResponse?(data: BufferSource): Promise<void>
}
type Device = {
  name?: string
  gatt?: {
    connected: boolean
    connect(): Promise<{
      getPrimaryService(uuid: string | number): Promise<{ getCharacteristic(uuid: string | number): Promise<Characteristic> }>
    }>
  }
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void
}
type Bluetooth = {
  requestDevice(options: {
    filters: Array<{ namePrefix?: string; services?: Array<string | number> }>
    optionalServices?: Array<string | number>
  }): Promise<Device>
}

const SERVICE = 0xff00
const WRITE = 0xff02
const CHUNK = 128
const CHUNK_DELAY_MS = 20

function bluetooth(): Bluetooth | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as unknown as { bluetooth?: Bluetooth }).bluetooth ?? null
}

export function canPrintDirect() {
  return bluetooth() !== null
}

let device: Device | null = null
let characteristic: Characteristic | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/** The connected printer's name, or null. */
export function printerName() {
  return device?.name ?? (device ? 'T02' : null)
}

export function onPrinterChange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

async function open(): Promise<Characteristic> {
  if (!device?.gatt) throw new Error('No printer chosen.')
  if (characteristic && device.gatt.connected) return characteristic
  const server = await device.gatt.connect()
  const service = await server.getPrimaryService(SERVICE)
  characteristic = await service.getCharacteristic(WRITE)
  return characteristic
}

/** Opens the browser's printer picker. Must be called from a tap. */
export async function choosePrinter() {
  const bt = bluetooth()
  if (!bt) throw new Error('This browser cannot reach a Bluetooth printer. Use Chrome on the tablet.')
  const chosen = await bt.requestDevice({
    filters: [{ namePrefix: 'T02' }, { services: [SERVICE] }],
    optionalServices: [SERVICE],
  })
  device = chosen
  characteristic = null
  chosen.addEventListener('gattserverdisconnected', () => {
    characteristic = null
    notify()
  })
  await open()
  notify()
}

export function forgetPrinter() {
  device = null
  characteristic = null
  notify()
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function write(target: Characteristic, bytes: Uint8Array) {
  const view = bytes.slice()
  if (target.writeValueWithoutResponse) {
    try {
      await target.writeValueWithoutResponse(view)
      return
    } catch {
      // Some firmware only takes acknowledged writes.
    }
  }
  await target.writeValue(view)
}

/** Prints a drawn label. Throws with a sentence an usher can act on. */
export async function printCanvas(canvas: HTMLCanvasElement) {
  if (!device) throw new Error('Connect the printer first.')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read the label.')
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const job = encodeT02Job(toRaster(pixels))

  let target: Characteristic
  try {
    target = await open()
  } catch {
    throw new Error('The printer is not answering. Check it is on and close by, then try again.')
  }

  let at = 0
  for (const length of T02_PREAMBLE_LENGTHS) {
    await write(target, job.slice(at, at + length))
    at += length
    await pause(50)
  }
  for (; at < job.length; at += CHUNK) {
    await write(target, job.slice(at, Math.min(at + CHUNK, job.length)))
    await pause(CHUNK_DELAY_MS)
  }
}
