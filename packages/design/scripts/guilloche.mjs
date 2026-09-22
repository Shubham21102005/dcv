// Design-time generator for the security-print textures used by the apps.
// node scripts/guilloche.mjs  ->  rosette.svg (hypotrochoid rosette) and band.svg (wave band)
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const out = (name, svg) => writeFileSync(resolve(here, '..', name), svg.trim() + '\n');
const f = (n) => n.toFixed(1);

/** Hypotrochoid: a circle of radius r rolling inside R, pen at distance d from its centre. */
function hypotrochoid({ R, r, d, cx, cy, steps = 1100 }) {
  const pts = [];
  const turns = r / gcd(R, r); // closes after this many turns of t = 2π
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * 2 * Math.PI;
    const k = (R - r) / r;
    pts.push([cx + (R - r) * Math.cos(t) + d * Math.cos(k * t), cy + (R - r) * Math.sin(t) - d * Math.sin(k * t)]);
  }
  return `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
}
function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

// ---- rosette ------------------------------------------------------------------------------------
{
  const S = 600;
  const c = S / 2;
  const blue = '#5B7FA6';
  const rose = '#B36B7C';
  const layers = [
    { R: 285, r: 57, d: 62, color: blue, w: 0.55 },
    { R: 275, r: 25, d: 34, color: rose, w: 0.45 },
    { R: 240, r: 96, d: 70, color: blue, w: 0.45 },
    { R: 200, r: 36, d: 60, color: rose, w: 0.4 },
    { R: 150, r: 42, d: 90, color: blue, w: 0.4 },
    { R: 110, r: 24, d: 40, color: rose, w: 0.35 },
  ];
  const paths = layers.map((l) => `<path d="${hypotrochoid({ ...l, cx: c, cy: c })}" stroke="${l.color}" stroke-width="${l.w}"/>`).join('\n  ');
  out(
    'rosette.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" fill="none" stroke-linejoin="round">
  ${paths}
</svg>`,
  );
}

// ---- wave band (tiles horizontally) ------------------------------------------------------------------
{
  const W = 600;
  const H = 96;
  const lines = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const y0 = 8 + (i * (H - 16)) / (n - 1);
    const amp = 5 + 3 * Math.sin(i * 1.3);
    const phase = i * 0.9;
    const pts = [];
    for (let x = 0; x <= W; x += 4) pts.push(`${x} ${f(y0 + amp * Math.sin((x / W) * 4 * Math.PI + phase))}`);
    lines.push(`<path d="M${pts.join('L')}" stroke="${i % 2 ? '#B36B7C' : '#5B7FA6'}" stroke-width="0.5"/>`);
  }
  out(
    'band.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none">
  ${lines.join('\n  ')}
</svg>`,
  );
}

console.log('wrote rosette.svg and band.svg');
