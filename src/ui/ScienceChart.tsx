import type { MonthRecord } from '../engine/types';
import { useT } from '../i18n';

/** Science returned over the mission, against the customer's target. */
export function ScienceChart({ months, upto }: { months: MonthRecord[]; upto?: number }) {
  const t = useT();
  const W = 520;
  const H = 150;
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const shown = months.slice(0, upto ?? months.length);
  const lastT = months.length ? months[months.length - 1].t : 1;
  const top = Math.max(1.2, ...months.map((m) => m.science)) * 1.05;
  const x = (tt: number) => pad.l + ((W - pad.l - pad.r) * tt) / lastT;
  const y = (v: number) => H - pad.b - ((H - pad.t - pad.b) * v) / top;
  const line = shown.map((m) => `${x(m.t).toFixed(1)},${y(m.science).toFixed(1)}`).join(' ');
  const end = shown[shown.length - 1];
  const years = Math.floor(lastT / 12);
  const tickEvery = years > 6 ? 2 : 1;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t(
        `График: наука, переданная на Землю, ${end ? Math.round(end.science * 100) : 0}% от цели`,
        `Chart: science returned to Earth, ${end ? Math.round(end.science * 100) : 0}% of target`,
      )}
    >
      <line x1={pad.l} y1={y(0)} x2={W - pad.r} y2={y(0)} className="chart-axis" />
      <line x1={pad.l} y1={y(1)} x2={W - pad.r} y2={y(1)} className="chart-target" />
      <text x={pad.l - 6} y={y(1) + 4} textAnchor="end">100%</text>
      <text x={pad.l - 6} y={y(0) + 4} textAnchor="end">0</text>
      <text x={W - pad.r} y={y(1) - 5} textAnchor="end">{t('цель', 'target')}</text>
      {Array.from({ length: Math.floor(years / tickEvery) }, (_, i) => (i + 1) * tickEvery).map((yr) => (
        <text key={yr} x={x(yr * 12)} y={H - 6} textAnchor="middle">
          {t(`${yr} г.`, `yr ${yr}`)}
        </text>
      ))}
      {shown.length > 0 && (
        <>
          <polygon points={`${x(shown[0].t).toFixed(1)},${y(0)} ${line} ${x(end.t).toFixed(1)},${y(0)}`} className="chart-area" />
          <polyline points={line} className="chart-line" />
          <circle cx={x(end.t)} cy={y(end.science)} r="3.5" className="chart-dot" />
        </>
      )}
    </svg>
  );
}
