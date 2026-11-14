import { useEffect, useRef, useState } from 'react';
import type { Design, Evaluation } from '../engine/types';
import { useT } from '../i18n';
import type { CraftStage } from '../three/CraftStage';
import { Spacecraft } from './Spacecraft';

/**
 * The spacecraft in 3D, assembled from the player's choices. The 3D code is loaded on demand;
 * without WebGL the technical drawing takes its place.
 */
export function Craft3D({ design, ev }: { design: Design; ev: Evaluation }) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<CraftStage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let dead = false;
    let made: CraftStage | null = null;
    (async () => {
      try {
        const [{ CraftStage }, { loadAssets, webglAvailable }] = await Promise.all([import('../three/CraftStage'), import('../three/assets')]);
        if (!webglAvailable()) throw new Error('no webgl');
        const assets = await loadAssets();
        if (dead || !canvas.current) return;
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        made = new CraftStage(canvas.current, assets, still);
        stage.current = made;
        setState('ready');
      } catch {
        if (!dead) setState('failed');
      }
    })();
    return () => {
      dead = true;
      made?.dispose();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    if (state === 'ready') stage.current?.setDesign(design, ev.mass.dry);
  }, [design, ev.mass.dry, state]);

  if (state === 'failed') return <Spacecraft design={design} ev={ev} />;

  return (
    <figure className="craft3d" data-state={state}>
      <div className="craft3d-view">
        <canvas
          ref={canvas}
          role="img"
          aria-label={t(
            `Трёхмерная модель аппарата: сухая масса ${Math.round(ev.mass.dry)} кг, приборов ${design.instruments.length}. Модель можно вращать.`,
            `3D model of the spacecraft: dry mass ${Math.round(ev.mass.dry)} kg, ${design.instruments.length} instruments. Drag to rotate.`,
          )}
        />
        {state === 'loading' && <span className="craft3d-wait">{t('Собираем модель…', 'Assembling the model…')}</span>}
      </div>
      <figcaption>
        <span>
          {t(
            `сухая масса ${t.n(ev.mass.dry)} кг, с топливом ${t.n(ev.mass.wet)} кг`,
            `dry mass ${t.n(ev.mass.dry)} kg, fuelled ${t.n(ev.mass.wet)} kg`,
          )}
        </span>
        <span className="craft3d-tip">{t('потяните, чтобы повернуть', 'drag to rotate')}</span>
      </figcaption>
    </figure>
  );
}
