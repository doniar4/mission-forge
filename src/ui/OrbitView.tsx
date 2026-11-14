import { useEffect, useRef } from 'react';
import type { MonthRecord, OrbitId } from '../engine/types';
import { useT } from '../i18n';

interface Shape {
  /** body centre and radius */
  bx: number;
  by: number;
  br: number;
  body: 'earth' | 'moon' | 'mars';
  /** orbit centre, radii and tilt */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tilt: number;
}

const SHAPES: Record<OrbitId, Shape> = {
  leo: { bx: 200, by: 150, br: 58, body: 'earth', cx: 200, cy: 150, rx: 86, ry: 30, tilt: -28 },
  sso: { bx: 200, by: 150, br: 58, body: 'earth', cx: 200, cy: 150, rx: 26, ry: 92, tilt: 8 },
  geo: { bx: 200, by: 150, br: 22, body: 'earth', cx: 200, cy: 150, rx: 168, ry: 52, tilt: -6 },
  llo: { bx: 200, by: 150, br: 58, body: 'moon', cx: 200, cy: 150, rx: 24, ry: 80, tilt: 6 },
  elo: { bx: 150, by: 150, br: 34, body: 'moon', cx: 215, cy: 150, rx: 130, ry: 54, tilt: -14 },
  l1: { bx: 352, by: 150, br: 12, body: 'earth', cx: 262, cy: 150, rx: 14, ry: 40, tilt: 0 },
  lmo: { bx: 200, by: 150, br: 58, body: 'mars', cx: 200, cy: 150, rx: 88, ry: 34, tilt: 18 },
  emo: { bx: 150, by: 150, br: 34, body: 'mars', cx: 222, cy: 150, rx: 136, ry: 56, tilt: 10 },
};

// A fixed star field: decoration that must not change between renders.
const STARS = Array.from({ length: 46 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12543.123;
  return { x: (a - Math.floor(a)) * 400, y: (b - Math.floor(b)) * 300, r: i % 7 === 0 ? 1.1 : 0.6 };
});

/** The spacecraft circling its destination. Purely illustrative; the numbers live in the telemetry. */
export function OrbitView({
  orbit,
  record,
  transitTotal,
  lost,
  running,
}: {
  orbit: OrbitId;
  record: MonthRecord | null;
  transitTotal: number;
  lost: boolean;
  running: boolean;
}) {
  const t = useT();
  const s = SHAPES[orbit];
  const vertical = s.ry > s.rx;
  const back = useRef<SVGGElement>(null);
  const front = useRef<SVGGElement>(null);
  const angle = useRef(0.6);
  const live = useRef({ record, running, lost, transitTotal });
  live.current = { record, running, lost, transitTotal };

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    const place = (now: number) => {
      const { record: rec, running: run, lost: gone, transitTotal: cruise } = live.current;
      const dt = Math.min(64, now - last);
      last = now;
      if (run && !gone && !still) angle.current += dt * 0.0016;
      const a = angle.current;
      let x = s.cx + s.rx * Math.cos(a);
      let y = s.cy + s.ry * Math.sin(a);
      let behind = vertical ? Math.cos(a) < 0 : Math.sin(a) < 0;
      if (!rec || rec.phase === 'transit') {
        // Cruise: approach the orbit along a straight line from the edge of the frame.
        const f = rec && cruise > 0 ? rec.t / cruise : 0;
        x = 16 + (s.cx - s.rx - 16) * f;
        y = 284 + (s.cy - 284) * f;
        behind = false;
      }
      for (const [g, show] of [
        [back.current, behind],
        [front.current, !behind],
      ] as const) {
        if (!g) continue;
        g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        g.style.opacity = show && !gone ? '1' : '0';
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [s, vertical]);

  const frontArc = vertical
    ? `M${s.cx} ${s.cy - s.ry}A${s.rx} ${s.ry} 0 0 1 ${s.cx} ${s.cy + s.ry}`
    : `M${s.cx - s.rx} ${s.cy}A${s.rx} ${s.ry} 0 0 0 ${s.cx + s.rx} ${s.cy}`;
  const sat = (
    <>
      <rect x="-9" y="-1.6" width="18" height="3.2" className="sat-wing" />
      <rect x="-3" y="-3" width="6" height="6" className="sat-bus" />
    </>
  );
  const tilt = `rotate(${s.tilt} ${s.cx} ${s.cy})`;

  return (
    <svg className="orbitview" viewBox="0 0 400 300" role="img" aria-label={t('Аппарат на орбите', 'The spacecraft in orbit')}>
      <defs>
        <radialGradient id="g-earth" cx="35%" cy="32%">
          <stop offset="0" stopColor="#7FB6F2" />
          <stop offset="0.6" stopColor="#2F6FD0" />
          <stop offset="1" stopColor="#12306E" />
        </radialGradient>
        <radialGradient id="g-moon" cx="35%" cy="32%">
          <stop offset="0" stopColor="#E3E5EA" />
          <stop offset="0.7" stopColor="#9A9FAD" />
          <stop offset="1" stopColor="#4B5062" />
        </radialGradient>
        <radialGradient id="g-mars" cx="35%" cy="32%">
          <stop offset="0" stopColor="#F0A77C" />
          <stop offset="0.65" stopColor="#C2562C" />
          <stop offset="1" stopColor="#5E2413" />
        </radialGradient>
        <radialGradient id="g-sun">
          <stop offset="0" stopColor="#FFF4C2" />
          <stop offset="0.5" stopColor="#FFC83D" />
          <stop offset="1" stopColor="#FFC83D" stopOpacity="0" />
        </radialGradient>
      </defs>
      {STARS.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} className="star" />
      ))}
      {orbit === 'l1' && (
        <>
          <circle cx="-10" cy="150" r="120" fill="url(#g-sun)" />
          <line x1="70" y1="150" x2="340" y2="150" className="axis" />
        </>
      )}
      <g transform={tilt}>
        <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} className="orbit-back" />
        <g ref={back} className="sat">{sat}</g>
      </g>
      <circle cx={s.bx} cy={s.by} r={s.br} fill={`url(#g-${s.body})`} />
      <g transform={tilt}>
        <path d={frontArc} className="orbit-front" />
        <g ref={front} className="sat">{sat}</g>
      </g>
    </svg>
  );
}
