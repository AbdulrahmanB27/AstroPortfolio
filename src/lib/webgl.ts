/**
 * Whether this browser can actually give us a WebGL context.
 *
 * Not a user-agent guess: it asks for a context and checks that one comes back. Browsers
 * with WebGL disabled, blocklisted drivers, and machines that have exhausted their context
 * budget all fail here, and all of them would otherwise reach a black canvas.
 */
export function hasWebGL(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    // WebGL2 only: that is the one context three's renderer asks for, so a WebGL1-only
    // browser passing this gate would reach the renderer's throw and a black canvas
    // instead of the simplified site.
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    // Release it immediately: the check must not eat one of the browser's few contexts.
    const lose = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a visitor who cannot render the 3D site to the simplified one, preserving the query
 * string so `?nointro` and friends still mean something there. `replace` rather than
 * `assign` so the back button does not bounce them into the black canvas they just left.
 */
export function redirectToLite(): void {
  const url = new URL('lite/', window.location.href);
  url.search = window.location.search;
  window.location.replace(url.toString());
}
