import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';

export interface TraceSample {
  /** Battery charge, 0..1. */
  battery: number;
  /** Onboard storage filled, 0..1. */
  buffer: number;
  eclipse: boolean;
  contact: boolean;
}

const KEEP = 160; // samples kept: 40 s at four a second
const W = 320;
const H = 84;

/**
 * Live telemetry of the last few orbits: battery charge and storage fill, with the planet's
 * shadow and the ground passes as bands behind them. It reads the same numbers the flight scene
 * shows, so the player sees the battery drain in every eclipse and the memory empty at every pass.
 */
export function TelemetryTrace({ read, active, showData }: { read: () => TraceSample | null; active: boolean; showData: boolean }) {
  const t = useT();
  const [samples, setSamples] = useState<TraceSample[]>([]);
  const reader = useRef(read);
  reader.current = read;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const s = reader.current();
      if (s) setSamples((prev) => [...prev.slice(-(KEEP - 1)), s]);
    }, 250);
    return () => clearInterval(id);
  }, [active]);
  if (samples.length < 2) return null;

  const dx = W / (KEEP - 1);
  const x0 = W - (samples.length - 1) * dx;
  const line = (f: (s: TraceSample) => number) =>
    samples.map((s, i) => `${(x0 + i * dx).toFixed(1)},${(4 + (1 - f(s)) * (H - 14)).toFixed(1)}`).join(' ');
  const bands = (on: (s: TraceSample) => boolean) => {
    const out: { from: number; to: number }[] = [];
    samples.forEach((s, i) => {
      if (!on(s)) return;
      const x = x0 + i * dx;
      const last = out[out.length - 1];
      if (last && Math.abs(last.to - (x - dx)) < 0.01) last.to = x;
      else out.push({ from: x, to: x });
    });
    return out;
  };
  const last = samples[samples.length - 1];

  return (
    <figure className="trace">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t(`Батарея ${Math.round(last.battery * 100)}%, память ${Math.round(last.buffer * 100)}%`, `Battery ${Math.round(last.battery * 100)}%, storage ${Math.round(last.buffer * 100)}%`)}>
        {bands((s) => s.eclipse).map((b, i) => (
          <rect key={`e${i}`} className="trace-shadow" x={b.from} y={0} width={Math.max(dx, b.to - b.from)} height={H - 8} />
        ))}
        {showData &&
          bands((s) => s.contact).map((b, i) => <rect key={`c${i}`} className="trace-pass" x={b.from} y={H - 6} width={Math.max(dx, b.to - b.from)} height={4} />)}
        <line className="trace-axis" x1={0} x2={W} y1={H - 10} y2={H - 10} />
        <polyline className="trace-battery" points={line((s) => s.battery)} />
        {showData && <polyline className="trace-buffer" points={line((s) => s.buffer)} />}
      </svg>
      <figcaption>
        <span className="trace-key" data-k="battery">{t('Батарея', 'Battery')}</span>
        {showData && <span className="trace-key" data-k="buffer">{t('Память', 'Storage')}</span>}
        <span className="trace-key" data-k="shadow">{t('Тень', 'Shadow')}</span>
        {showData && <span className="trace-key" data-k="pass">{t('Сеанс связи', 'Ground pass')}</span>}
      </figcaption>
    </figure>
  );
}

/**
 * The same budgets as a fixed profile for the debrief: the battery over one orbit (it drains in
 * the shadow by the share of its capacity the eclipse needs) and the memory over one day (it fills
 * between ground passes up to what must be stored, and empties during contact).
 */
export function BudgetProfile({ sunFraction, eclipseLoad, contactFraction, storageLoad, showData }: { sunFraction: number; eclipseLoad: number; contactFraction: number; storageLoad: number; showData: boolean }) {
  const t = useT();
  const depth = Math.min(1, Math.max(0, eclipseLoad) * 0.92);
  const lit = Math.min(1, Math.max(0, sunFraction));
  const N = 60;
  const battery = Array.from({ length: N + 1 }, (_, i) => {
    const x = i / N;
    if (x <= lit || lit >= 1) return 1;
    return 1 - depth * ((x - lit) / (1 - lit));
  });
  const pass = Math.min(1, Math.max(0, contactFraction));
  const peak = Math.min(1, Math.max(0, storageLoad));
  const storage = Array.from({ length: N + 1 }, (_, i) => {
    const x = i / N;
    const off = 1 - pass;
    return x <= off ? (off > 0 ? peak * (x / off) : 0) : peak * (1 - (x - off) / Math.max(0.01, pass));
  });
  const path = (ys: number[]) => ys.map((y, i) => `${((i / N) * W).toFixed(1)},${(4 + (1 - y) * (H - 14)).toFixed(1)}`).join(' ');
  return (
    <div className="budget-profile">
      <figure className="trace">
        <figcaption className="trace-title">
          {t('Батарея за один виток', 'Battery over one orbit')} · {t(`минимум ${Math.round((1 - depth) * 100)}%`, `lowest ${Math.round((1 - depth) * 100)}%`)}
        </figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t(`Батарея опускается до ${Math.round((1 - depth) * 100)}% в тени`, `The battery drops to ${Math.round((1 - depth) * 100)}% in the shadow`)}>
          {lit < 1 && <rect className="trace-shadow" x={lit * W} y={0} width={(1 - lit) * W} height={H - 8} />}
          <line className="trace-axis" x1={0} x2={W} y1={H - 10} y2={H - 10} />
          <polyline className="trace-battery" points={path(battery)} />
        </svg>
      </figure>
      {showData && (
        <figure className="trace">
          <figcaption className="trace-title">
            {t('Память за сутки', 'Storage over one day')} · {storageLoad > 1 ? t('переполняется', 'overflows') : t(`пик ${Math.round(peak * 100)}%`, `peak ${Math.round(peak * 100)}%`)}
          </figcaption>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t(`Память заполняется до ${Math.round(peak * 100)}% между сеансами`, `Storage fills to ${Math.round(peak * 100)}% between passes`)}>
            {pass > 0 && <rect className="trace-pass" x={(1 - pass) * W} y={H - 6} width={pass * W} height={4} />}
            <line className="trace-axis" x1={0} x2={W} y1={H - 10} y2={H - 10} />
            <polyline className="trace-buffer" points={path(storage)} />
          </svg>
        </figure>
      )}
    </div>
  );
}
