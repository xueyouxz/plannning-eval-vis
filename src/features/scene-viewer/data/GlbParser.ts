/**
 * GlbParser.ts
 *
 * Pure TypeScript GLB (glTF 2.0 Binary) parser.
 * Handles the 12-byte header, JSON chunk (0x4E4F534A) and BIN chunk (0x004E4942).
 */

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a // 'JSON'
const CHUNK_BIN = 0x004e4942 // 'BIN\0'

const COMPONENT_TYPE = {
  FLOAT: 5126,
  UNSIGNED_INT: 5125,
  UNSIGNED_SHORT: 5123,
  UNSIGNED_BYTE: 5121,
} as const

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
}

export interface GlbData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any
  bin: DataView
}

/**
 * Parse an ArrayBuffer containing a GLB file.
 * Returns the parsed JSON object and a DataView over the BIN chunk.
 */
export function parseGlb(buffer: ArrayBuffer): GlbData {
  const view = new DataView(buffer)
  let offset = 0

  // ── Header (12 bytes) ─────────────────────────────────────────────────────
  const magic = view.getUint32(offset, true)
  offset += 4
  if (magic !== GLB_MAGIC) {
    throw new Error(`Invalid GLB magic: 0x${magic.toString(16)}`)
  }
  offset += 4 // version (unused)
  offset += 4 // totalLength (unused)

  // ── JSON Chunk ────────────────────────────────────────────────────────────
  const jsonChunkLength = view.getUint32(offset, true)
  offset += 4
  const jsonChunkType = view.getUint32(offset, true)
  offset += 4
  if (jsonChunkType !== CHUNK_JSON) {
    throw new Error(`Expected JSON chunk, got 0x${jsonChunkType.toString(16)}`)
  }
  const jsonBytes = new Uint8Array(buffer, offset, jsonChunkLength)
  const jsonText = new TextDecoder().decode(jsonBytes)
   
  const json = JSON.parse(jsonText)
  offset += jsonChunkLength

  // ── BIN Chunk ─────────────────────────────────────────────────────────────
  // BIN chunk may not be present in all GLB files; default to empty DataView
  let bin: DataView = new DataView(new ArrayBuffer(0))

  if (offset < buffer.byteLength) {
    const binChunkLength = view.getUint32(offset, true)
    offset += 4
    const binChunkType = view.getUint32(offset, true)
    offset += 4
    if (binChunkType === CHUNK_BIN) {
      bin = new DataView(buffer, offset, binChunkLength)
    }
  }

  return { json, bin }
}

/**
 * Read an accessor referenced by a JSON Pointer string like "#/accessors/0".
 * Returns a flat TypedArray (Float32Array for FLOAT, Uint32Array for UNSIGNED_INT).
 * The caller interprets the stride (e.g. every 3 elements for VEC3).
 */
export function readAccessor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any,
  bin: DataView,
  ref: string,
): Float32Array | Uint32Array {
  const idx = parseInt(ref.split('/').pop()!, 10)
   
  const acc = json.accessors[idx] as {
    bufferView: number
    componentType: number
    type: string
    count: number
    byteOffset?: number
  }
   
  const bv = json.bufferViews[acc.bufferView] as {
    byteOffset: number
    byteLength: number
    byteStride?: number
  }

  const componentCount = TYPE_COMPONENTS[acc.type] ?? 1
  const elementCount = acc.count * componentCount
  const accByteOffset = acc.byteOffset ?? 0
  const byteOffset = bin.byteOffset + bv.byteOffset + accByteOffset

  if (acc.componentType === COMPONENT_TYPE.FLOAT) {
    return new Float32Array(bin.buffer, byteOffset, elementCount)
  } else if (acc.componentType === COMPONENT_TYPE.UNSIGNED_INT) {
    return new Uint32Array(bin.buffer, byteOffset, elementCount)
  } else {
    // Fallback: copy into a regular array and cast
    const raw = new Uint8Array(bin.buffer, byteOffset, elementCount * 4)
    return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
  }
}

/**
 * Read an image referenced by "#/images/N" and return a Blob URL.
 * Caller is responsible for calling URL.revokeObjectURL when done.
 */
export function readImageBlobUrl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any,
  bin: DataView,
  ref: string,
): string {
  const idx = parseInt(ref.split('/').pop()!, 10)
   
  const imgMeta = json.images[idx] as {
    bufferView: number
    mimeType: string
  }
   
  const bv = json.bufferViews[imgMeta.bufferView] as {
    byteOffset: number
    byteLength: number
  }

  const byteOffset = bin.byteOffset + bv.byteOffset
  // Copy into a plain ArrayBuffer so Blob accepts it regardless of buffer type
  const imgSrc = new Uint8Array(bin.buffer, byteOffset, bv.byteLength)
  const imgBytes = imgSrc.slice()
  const blob = new Blob([imgBytes], { type: imgMeta.mimeType })
  return URL.createObjectURL(blob)
}
