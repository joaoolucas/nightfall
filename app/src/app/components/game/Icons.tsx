/**
 * The header glyphs.
 *
 * Drawn as squared-off SVG rather than an icon font or emoji: the client is
 * pixel art at a whole-number scale, and a rounded webfont glyph beside it
 * reads as a different program. `shapeRendering="crispEdges"` keeps the strokes
 * from being antialiased into grey mush at 18px.
 */

const common = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  shapeRendering: "crispEdges" as const,
  "aria-hidden": true,
};

export function MapIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...common} width={size} height={size}>
      <path d="M1.5 3.5 L6 1.5 L10 3.5 L14.5 1.5 V12.5 L10 14.5 L6 12.5 L1.5 14.5 Z" />
      <path d="M6 1.5 V12.5 M10 3.5 V14.5" />
    </svg>
  );
}

export function SkillsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...common} width={size} height={size} strokeWidth={0} fill="currentColor">
      <rect x="1.5" y="9" width="3.5" height="5.5" />
      <rect x="6.25" y="5.5" width="3.5" height="9" />
      <rect x="11" y="2" width="3.5" height="12.5" />
    </svg>
  );
}

export function BackpackIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...common} width={size} height={size}>
      <path d="M5 6 V4.5 A3 3 0 0 1 11 4.5 V6" />
      <rect x="1.5" y="6" width="13" height="8.5" />
      <path d="M6 9.5 H10 V12 H6 Z" />
    </svg>
  );
}
