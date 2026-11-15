import { useMemo, useState } from 'react';
import { compareFireWatch } from '../engine/trainingComparison';
import { useT } from '../i18n';

export function TrainingComparison() {
  const t = useT();
  const [prediction, setPrediction] = useState<'same' | 'more' | null>(null);
  const results = useMemo(compareFireWatch, []);
  return (
    <section className="block">
      <h3>{t('Пожарный дозор за пять минут', 'Five-minute Fire Watch')}</h3>
      <p>{t('Что случится, если заменить антенну S-диапазона на X-диапазон и оставить приборы прежними?', 'What happens if you upgrade from S-band to X-band and keep the same instruments?')}</p>
      <button type="button" aria-pressed={prediction === 'same'} onClick={() => setPrediction('same')}>
        {t('На Землю поступит столько же', 'The same amount reaches Earth')}
      </button>{' '}
      <button type="button" aria-pressed={prediction === 'more'} onClick={() => setPrediction('more')}>
        {t('На Землю поступит больше', 'More data reaches Earth')}
      </button>
      <div aria-live="polite">
        {prediction && <>
          <p>{t('Более быстрый канал доставляет больше данных с тех же приборов, но стоит массы, энергии и денег.', 'A faster downlink delivers more from the same instruments and costs mass, power and money.')}</p>
          <p>{t('Оба расчёта используют одинаковые события и решения в полёте. Затраты и события этапа разработки в упражнение не входят.', 'Both simulations use identical flight events and decisions. The exercise excludes development events and their extra costs.')}</p>
          {results.map(({ design, resources, flight }) => (
            <div key={design.comms}>
              <h4>{design.comms === 'sband' ? 'S-band' : 'X-band'}</h4>
              <p>{t('Записано / канал в сутки', 'Recorded / downlink capacity per day')}{' '}{t.n(resources.data.generated, 1)} / {t.n(resources.data.downlink, 1)} {t('ГБ', 'GB')}</p>
              <p>{t('Доставлено за полёт', 'Delivered over the flight')}{' '}{t.n(flight.dataReturned / 1000, 2)} {t('ТБ', 'TB')} · {t.pct(flight.sciencePct)} {t('научной цели', 'of the science target')}</p>
              <p>{t.n(resources.mass.wet, 1)} {t('кг', 'kg')} · {t.n(resources.power.load, 0)} {t('Вт', 'W')} · {t.money(resources.cost.total)}</p>
            </div>
          ))}
        </>}
      </div>
    </section>
  );
}
