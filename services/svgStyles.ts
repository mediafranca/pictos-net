/**
 * Canonical SVG styles for pictos-net pictograms.
 *
 * This is the single source of truth for all CSS classes and keyframe
 * animations embedded in generated SVGs. Import `SVG_STYLESHEET` to get
 * the full CSS string ready for embedding inside a <style> block.
 */

export const SVG_STYLESHEET = `
/* ── Semantic role classes ───────────────────────────────────────────── */
.main, .primary, .foreground {
  fill: #1a1a1a;
  stroke: #ffffff;
  stroke-width: 3pt;
  vector-effect: non-scaling-stroke;
}
.secondary, .background {
  fill: #ffffff;
  stroke: #1a1a1a;
  stroke-width: 3pt;
  vector-effect: non-scaling-stroke;
}
.tertiary, .neutral {
  fill: #98a0ae;
  stroke: #7e838b;
  stroke-width: 3pt;
  vector-effect: non-scaling-stroke;
}
.accent, .highlight {
  fill: #00ccff;
  stroke: #06a0c6;
  stroke-width: 3pt;
  vector-effect: non-scaling-stroke;
}
.red, .danger {
  fill: #ef4444;
  stroke: #b91c1c;
  stroke-width: 3pt;
  vector-effect: non-scaling-stroke;
}
.green, .success {
  fill: #22c55e;
  stroke: #15803d;
  stroke-width: 3pt;
  vector-effect: non-scaling-stroke;
}

/* ── Stroke utilities ────────────────────────────────────────────────── */
.st-dark {
  stroke: #000000;
  stroke-width: 3pt;
  vector-effect: non-scaling-stroke;
}
.st-light {
  stroke: #ffffff;
  stroke-width: 3pt;
  fill: none;
  vector-effect: non-scaling-stroke;
}
.dashed {
  stroke-dasharray: 4 8;
  fill: none;
  stroke: #636363;
  stroke-width: 3pt;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

/* ── Effect utilities ────────────────────────────────────────────────── */
.glow {
  filter: drop-shadow(0 0 4pt #0ea5e9);
  stroke: none;
}

/* ── Animation classes ───────────────────────────────────────────────── */
.anim-blink {
  animation: kf-blink 1.5s infinite ease-in-out;
}
.anim-beat {
  animation: kf-beat 1.5s infinite ease-in-out;
  transform-box: fill-box;
  transform-origin: center;
}
.anim-swing {
  animation: kf-swing 2s infinite ease-in-out;
  transform-box: fill-box;
  transform-origin: center;
}
.slide-r {
  animation: kf-slide-r 2s infinite ease-in-out;
}
.slide-u {
  animation: kf-slide-u 2s infinite ease-in-out;
}

/* ── Keyframes ───────────────────────────────────────────────────────── */
@keyframes kf-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
@keyframes kf-beat {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.2); }
}
@keyframes kf-swing {
  0%, 100% { transform: rotate(-15deg); }
  50%       { transform: rotate(15deg); }
}
@keyframes kf-slide-r {
  0%, 100% { transform: translateX(0); }
  50%       { transform: translateX(12px); }
}
@keyframes kf-slide-u {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-12px); }
}

/* ── Accessibility ───────────────────────────────────────────────────── */
g[role="group"]:focus {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}
`;
