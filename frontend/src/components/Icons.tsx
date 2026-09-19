/**
 * The tiny hand-drawn icon set (NEW-WORLD-SPEC §5): a single consistent
 * drawing discipline — a 0 0 20 20 box, mitered square caps, currentColor
 * strokes — so glyphs never fall back to a font. Decorative only: they carry
 * `aria-hidden` and the surrounding control owns the accessible name.
 */
interface IconProps {
  /** Rendered size in pixels. Defaults to 16. */
  size?: number;
}

/** An X drawn from two diagonals. */
export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="4" y1="4" x2="16" y2="16" />
      <line x1="16" y1="4" x2="4" y2="16" />
    </svg>
  );
}

/** A left chevron as a single polyline. */
export function ChevronLeftIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="12 4 6 10 12 16" />
    </svg>
  );
}

/** A right chevron as a single polyline. */
export function ChevronRightIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="8 4 14 10 8 16" />
    </svg>
  );
}
