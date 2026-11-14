import { ANTENNAS, POWER } from '../engine/catalog';
import type { Design, Evaluation } from '../engine/types';
import { useT } from '../i18n';

/**
 * A technical drawing of the spacecraft that grows with the design:
 * bigger arrays for more power, a dish for the high-gain antenna, a nozzle for the engine.
 */
export function Spacecraft({ design, ev, compact = false }: { design: Design; ev: Evaluation; compact?: boolean }) {
  const t = useT();
  const cx = 180;
  const cy = 96;
  const w = Math.min(86, Math.max(44, 30 + Math.sqrt(ev.mass.dry) * 2.4));
  const h = w * 1.12;
  const left = cx - w / 2;
  const top = cy - h / 2;

  const powerIdx = POWER.findIndex((p) => p.id === design.power);
  const wing = [0, 34, 56, 82, 108, 0][powerIdx] ?? 0;
  const wingH = [0, 20, 26, 32, 38, 0][powerIdx] ?? 0;
  const panels = Math.max(1, Math.round(wing / 24));
  const antIdx = ANTENNAS.findIndex((a) => a.id === design.comms);
  const insts = design.instruments.slice(0, 6);
  const hasBoom = design.instruments.includes('magnetometer');

  const wingSide = (dir: 1 | -1) => {
    const x0 = dir === 1 ? cx + w / 2 + 8 : cx - w / 2 - 8 - wing;
    return (
      <g key={dir}>
        <line x1={cx + (dir * w) / 2} y1={cy} x2={cx + dir * (w / 2 + 8)} y2={cy} />
        <rect x={x0} y={cy - wingH / 2} width={wing} height={wingH} className="fill-cell" />
        {Array.from({ length: panels - 1 }, (_, i) => (
          <line key={i} x1={x0 + ((i + 1) * wing) / panels} y1={cy - wingH / 2} x2={x0 + ((i + 1) * wing) / panels} y2={cy + wingH / 2} />
        ))}
        <line x1={x0} y1={cy} x2={x0 + wing} y2={cy} className="thin" />
      </g>
    );
  };

  return (
    <svg
      className="craft"
      viewBox={compact ? '40 20 280 150' : '0 0 360 200'}
      role="img"
      aria-label={t(
        `Чертёж аппарата: сухая масса ${Math.round(ev.mass.dry)} кг, приборов ${design.instruments.length}`,
        `Spacecraft drawing: dry mass ${Math.round(ev.mass.dry)} kg, ${design.instruments.length} instruments`,
      )}
    >
      {/* solar arrays */}
      {wing > 0 && [wingSide(1), wingSide(-1)]}

      {/* radioisotope generator on a boom */}
      {design.power === 'rtg' && (
        <g>
          <line x1={cx + w / 2} y1={cy + h / 4} x2={cx + w / 2 + 30} y2={cy + h / 4 + 14} />
          <rect x={cx + w / 2 + 28} y={cy + h / 4 + 6} width="38" height="16" rx="3" className="fill-paper" transform={`rotate(24 ${cx + w / 2 + 30} ${cy + h / 4 + 14})`} />
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={cx + w / 2 + 38 + i * 7} y1={cy + h / 4 + 8} x2={cx + w / 2 + 34 + i * 7} y2={cy + h / 4 + 30} className="thin" />
          ))}
        </g>
      )}

      {/* magnetometer boom */}
      {hasBoom && (
        <g>
          <line x1={left} y1={top + 8} x2={left - 46} y2={top - 22} />
          <rect x={left - 54} y={top - 29} width="10" height="10" className="fill-paper" />
        </g>
      )}

      {/* engine */}
      {design.propulsion !== 'none' &&
        (design.propulsion === 'ion' ? (
          <g>
            <rect x={cx - 11} y={top + h} width="22" height="7" className="fill-paper" />
            <path d={`M${cx - 8} ${top + h + 11}h16M${cx - 6} ${top + h + 15}h12M${cx - 4} ${top + h + 19}h8`} className="thin" />
          </g>
        ) : (
          <path
            d={
              design.propulsion === 'coldgas'
                ? `M${cx - 4} ${top + h}l-3 8h14l-3-8z`
                : `M${cx - 5} ${top + h}l-${design.propulsion === 'biprop' ? 9 : 6} ${design.propulsion === 'biprop' ? 18 : 12}h${design.propulsion === 'biprop' ? 28 : 22}l-${design.propulsion === 'biprop' ? 9 : 6}-${design.propulsion === 'biprop' ? 18 : 12}z`
            }
            className="fill-paper"
          />
        ))}

      {/* bus */}
      <rect x={left} y={top} width={w} height={h} rx="2" className="fill-paper bus" />
      {powerIdx === 0 && (
        <g className="thin">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={left + w * f} y1={top} x2={left + w * f} y2={top + h * 0.42} />
          ))}
          <line x1={left} y1={top + h * 0.42} x2={left + w} y2={top + h * 0.42} />
        </g>
      )}
      {design.redundancy === 'redundant' && <rect x={left + 4} y={top + 4} width={w - 8} height={h - 8} rx="1" className="thin dashed" />}

      {/* instruments: one aperture each, on the face that looks at the target */}
      {insts.map((id, i) => {
        const cols = Math.min(3, insts.length);
        const col = i % 3;
        const row = Math.floor(i / 3);
        const gx = cx + (col - (cols - 1) / 2) * (w / 3.4);
        const gy = top + h * 0.62 + row * (h * 0.22) - (insts.length > 3 ? h * 0.08 : 0);
        const r = Math.min(8, w / 9);
        return id === 'sar' || id === 'altimeter' ? (
          <rect key={id} x={gx - r} y={gy - r * 0.6} width={r * 2} height={r * 1.2} className="fill-gold" />
        ) : (
          <g key={id}>
            <circle cx={gx} cy={gy} r={r} className="fill-gold" />
            <circle cx={gx} cy={gy} r={r * 0.45} className="thin" />
          </g>
        );
      })}

      {/* antenna */}
      {antIdx <= 0 && <path d={`M${cx - 8} ${top}l-10-24M${cx + 8} ${top}l10-24`} />}
      {antIdx === 1 && <rect x={cx - 9} y={top - 5} width="18" height="5" className="fill-paper" />}
      {(antIdx === 2 || antIdx === 3) && (
        <g>
          <line x1={cx} y1={top} x2={cx} y2={top - 12} />
          <path
            d={antIdx === 2 ? `M${cx - 17} ${top - 24}q17 22 34 0z` : `M${cx - 27} ${top - 30}q27 32 54 0z`}
            className="fill-paper"
          />
          <line x1={cx} y1={top - 14} x2={cx} y2={top - (antIdx === 2 ? 30 : 38)} className="thin" />
        </g>
      )}
      {antIdx === 4 && (
        <g>
          <rect x={cx - 7} y={top - 20} width="14" height="20" className="fill-paper" />
          <circle cx={cx} cy={top - 20} r="5" className="fill-gold" />
          <line x1={cx} y1={top - 25} x2={cx} y2={top - 44} className="thin dashed" />
        </g>
      )}

      {/* dimension line: the drawing's one annotation */}
      {!compact && (
        <g className="dim">
          <line x1="70" y1="184" x2="290" y2="184" />
          <path d="M70 179v10M290 179v10" />
          <text x="180" y="178" textAnchor="middle">
            {t(
              `сухая масса ${t.n(ev.mass.dry)} кг, с топливом ${t.n(ev.mass.wet)} кг`,
              `dry mass ${t.n(ev.mass.dry)} kg, fuelled ${t.n(ev.mass.wet)} kg`,
            )}
          </text>
        </g>
      )}
    </svg>
  );
}
