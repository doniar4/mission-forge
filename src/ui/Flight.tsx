import { useEffect, useState } from 'react';
import { scenarioById } from '../engine/scenarios';
import { useT } from '../i18n';
import { useDesign, useStore } from '../store';
import { LangToggle } from './common';
import { OrbitView } from './OrbitView';
import { ScienceChart } from './ScienceChart';

export function Flight() {
  const t = useT();
  const sim = useStore((s) => s.sim)!;
  const goto = useStore((s) => s.goto);
  const sc = scenarioById(useStore((s) => s.scenarioId));
  const design = useDesign();
  const total = sim.months.length;
  const [shown, setShown] = useState(0);
  const [speed, setSpeed] = useState<0 | 1 | 4>(1);
  const done = shown >= total;

  useEffect(() => {
    if (speed === 0 || done) return;
    const id = setTimeout(() => setShown((n) => n + 1), 280 / speed);
    return () => clearTimeout(id);
  }, [shown, speed, done]);

  const rec = shown > 0 ? sim.months[shown - 1] : null;
  const now = rec?.t ?? 0;
  const transitTotal = sim.months.filter((m) => m.phase === 'transit').length;
  const opsMonth = rec?.phase === 'ops' ? now - transitTotal : 0;
  const events = sim.events.filter((e) => e.month <= now).reverse();
  const lostNow = !!sim.lost && done;
  const science = rec?.science ?? 0;

  const phase = sim.launchFailed
    ? t('Аппарат потерян при запуске', 'Spacecraft lost at launch')
    : lostNow
      ? t('Связь потеряна', 'Contact lost')
      : !rec
        ? t('Старт', 'Lift-off')
        : rec.phase === 'transit'
          ? t(`Перелёт, месяц ${now} из ${transitTotal}`, `Cruise, month ${now} of ${transitTotal}`)
          : t(`Работа на орбите, месяц ${opsMonth} из ${sim.plannedMonths}`, `In orbit, month ${opsMonth} of ${sim.plannedMonths}`);

  return (
    <div className="page flight">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand">{t(sc.name)}</span>
          <span className="crumb" aria-live="polite">{phase}</span>
        </div>
        <div className="topbar-right">
          <LangToggle />
        </div>
      </header>

      <div className="flight-grid">
        <div className="scene">
          <OrbitView orbit={design.orbit!} record={rec} transitTotal={transitTotal} lost={lostNow || sim.launchFailed} running={speed > 0 && !done} />
          <div className="controls">
            {done ? (
              <button type="button" className="primary" onClick={() => goto('report')}>
                {t('Открыть разбор миссии', 'Open the mission debrief')}
              </button>
            ) : (
              <>
                <div className="segmented" role="radiogroup" aria-label={t('Скорость воспроизведения', 'Playback speed')}>
                  <button type="button" role="radio" aria-checked={speed === 0} onClick={() => setSpeed(0)}>
                    {t('Пауза', 'Pause')}
                  </button>
                  <button type="button" role="radio" aria-checked={speed === 1} onClick={() => setSpeed(1)}>
                    ×1
                  </button>
                  <button type="button" role="radio" aria-checked={speed === 4} onClick={() => setSpeed(4)}>
                    ×4
                  </button>
                </div>
                <button type="button" className="secondary" onClick={() => setShown(total)}>
                  {t('Перейти к концу миссии', 'Skip to the end')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="telemetry">
          <div className="readout">
            <span className="readout-label">{t('Наука, переданная на Землю', 'Science returned to Earth')}</span>
            <span className="readout-value">{t.pct(science)}</span>
            <span className="readout-note">{t('от цели заказчика', 'of the customer’s target')}</span>
          </div>
          <ScienceChart months={sim.months} upto={shown} />
          <div className="meters">
            <Meter label={t('Питание приборов', 'Instrument power')} value={rec?.phase === 'ops' ? rec.power : null} />
            <Meter label={t('Данные доходят до Земли', 'Data reaching Earth')} value={rec?.phase === 'ops' ? rec.data : null} />
          </div>

          <h3>{t('Бортовой журнал', 'Mission log')}</h3>
          <ol className="log" aria-live="polite">
            {events.map((e, i) => (
              <li key={`${e.month}-${events.length - i}`} data-kind={e.kind}>
                <span className="log-when">{e.month === 0 ? t('Старт', 'Launch') : t(`Месяц ${e.month}`, `Month ${e.month}`)}</span>
                <b>{t(e.title)}</b>
                <span>{t(e.text)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number | null }) {
  const t = useT();
  return (
    <div className="meter" data-state={value === null ? 'idle' : value >= 0.98 ? 'ok' : value >= 0.6 ? 'tight' : 'over'}>
      <div className="gauge-row">
        <span className="gauge-label">{label}</span>
        <span className="gauge-value">{value === null ? '—' : t.pct(value)}</span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${(value ?? 0) * 100}%` }} />
      </div>
    </div>
  );
}
