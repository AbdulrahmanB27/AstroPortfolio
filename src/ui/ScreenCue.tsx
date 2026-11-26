/**
 * The status line under an in-world display: what scrolling will do next. Its box is always in the layout and
 * CSS picks the one line to show, so the cue can never change the size of the page above it (a cue that
 * appears only on overflow can create the very overflow it reports).
 */
export function ScreenCue() {
  return (
    <>
      <span className="cue cue--zoom">Scroll to zoom in ↓</span>
      <span className="cue cue--more">Scroll for more ↓</span>
      <span className="cue cue--out">
        <i>Esc or scroll up to zoom out</i>
        <b>Pull down to zoom out</b>
      </span>
    </>
  )
}
