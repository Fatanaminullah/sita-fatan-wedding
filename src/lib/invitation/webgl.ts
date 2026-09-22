/**
 * Can this device actually run the invitation's 3D?
 *
 * One place, because the answer has to be the same in every section. It was
 * three copies and two of them accepted WebGL 1, which three.js has not
 * supported since r163: on a phone with WebGL 1 and no WebGL 2 the section
 * decided it could draw, the renderer then failed with "Error creating WebGL
 * context", and the guest got an empty black stage where the figures should
 * be. A tester's Android showed exactly that (2026-09-22).
 *
 * The context is created and then thrown away on purpose. Asking the browser
 * is the only reliable answer: a device can advertise the API and still
 * refuse the context, for lack of memory or because the driver is blocked.
 */
export function canRunWebGL(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number }
    if (nav.deviceMemory !== undefined && nav.deviceMemory < 3) return false
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return false
    // Hand it back at once. A browser allows only a handful of live contexts,
    // and this one is a question, not a scene.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
