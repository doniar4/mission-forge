import { useEffect, useRef, useState } from 'react';
import type { Design, Evaluation } from '../engine/types';
import { useT } from '../i18n';
import type { Backdrop, CraftStage } from '../three/CraftStage';
import { Spacecraft } from './Spacecraft';

/**
 * The spacecraft in 3D, assembled from the player's choices. The 3D code is loaded on demand;
 * without WebGL the technical drawing takes its place.
 *
 * variant 'stage' fills its parent: the hangar, with the destination below and a camera that
 * leans towards the parts in `focus`. variant 'card' is a framed picture for a panel.
 */
export function Craft3D({
  design,
  ev,
  variant = 'card',
  focus = [],
  backdrop = 'earth',
  offset = [0, 0],
  rocket = null,
  inspect = false,
}: {
  design: Design;
  ev: Evaluation;
  variant?: 'stage' | 'card';
  focus?: string[];
  backdrop?: Backdrop;
  offset?: [number, number];
  /** On the rocket step: the launch vehicle to show instead of the spacecraft. */
  rocket?: string | null;
  /** Free look: no leaning towards parts, wider zoom. */
  inspect?: boolean;
}) {
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
        made = new CraftStage(canvas.current, assets, { still, mode: variant === 'stage' ? 'space' : 'card' });
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
  }, [variant]);

  useEffect(() => {
    if (state === 'ready') stage.current?.setDesign(design, ev.mass.dry);
  }, [design, ev.mass.dry, state]);
  const focusKey = focus.join('|');
  useEffect(() => {
    if (state === 'ready') stage.current?.setFocus(focusKey ? focusKey.split('|') : []);
  }, [focusKey, state]);
  useEffect(() => {
    if (state === 'ready') stage.current?.setBackdrop(backdrop);
  }, [backdrop, state]);
  useEffect(() => {
    if (state === 'ready') stage.current?.setRocket(rocket);
  }, [rocket, state]);
  useEffect(() => {
    if (state === 'ready') stage.current?.setInspect(inspect);
    if (state === 'ready' && !inspect) stage.current?.setFocus(focusKey ? focusKey.split('|') : []);
  }, [inspect, state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state === 'ready') stage.current?.setOffset(offset[0], offset[1]);
  }, [offset[0], offset[1], state]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = t(
    `Трёхмерная модель аппарата: сухая масса ${Math.round(ev.mass.dry)} кг, приборов ${design.instruments.length}. Модель можно вращать.`,
    `3D model of the spacecraft: dry mass ${Math.round(ev.mass.dry)} kg, ${design.instruments.length} instruments. Drag to rotate.`,
  );

  if (variant === 'stage')
    return (
      <div className="stage3d" data-state={state}>
        {state === 'failed' ? (
          <div className="stage3d-fallback">
            <Spacecraft design={design} ev={ev} />
          </div>
        ) : (
          <canvas ref={canvas} role="img" aria-label={label} />
        )}
        {state === 'loading' && <span className="stage3d-wait">{t('Собираем аппарат…', 'Assembling the spacecraft…')}</span>}
      </div>
    );

  if (state === 'failed') return <Spacecraft design={design} ev={ev} />;
  return (
    <figure className="craft3d" data-state={state}>
      <div className="craft3d-view">
        <canvas ref={canvas} role="img" aria-label={label} />
        {state === 'loading' && <span className="craft3d-wait">{t('Собираем модель…', 'Assembling the model…')}</span>}
      </div>
      <figcaption>
        <span>
          {t(`сухая масса ${t.n(ev.mass.dry)} кг, с топливом ${t.n(ev.mass.wet)} кг`, `dry mass ${t.n(ev.mass.dry)} kg, fuelled ${t.n(ev.mass.wet)} kg`)}
        </span>
        <span className="craft3d-tip">{t('потяните, чтобы повернуть', 'drag to rotate')}</span>
      </figcaption>
    </figure>
  );
}
