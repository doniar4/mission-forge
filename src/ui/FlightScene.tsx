import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Director } from '../flight/director';
import { useT } from '../i18n';
import type { FlightStage, FlightView } from '../three/FlightStage';

/**
 * The 3D flight scene. The 3D code and models load on demand; if WebGL is missing, or the
 * player asked for reduced motion, `fallback` is shown and the flight still plays out in numbers.
 */
export function FlightScene({
  director,
  view,
  onStage,
  fallback,
  children,
}: {
  director: Director;
  view: FlightView;
  onStage: (s: FlightStage | null) => void;
  fallback: ReactNode;
  children?: ReactNode;
}) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'failed' : 'loading',
  );
  const live = useRef({ onStage, view });
  live.current = { onStage, view };

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let dead = false;
    let made: FlightStage | null = null;
    (async () => {
      try {
        const [{ FlightStage }, { loadAssets, webglAvailable }] = await Promise.all([import('../three/FlightStage'), import('../three/assets')]);
        if (!webglAvailable()) throw new Error('no webgl');
        const assets = await loadAssets();
        if (dead || !canvas.current) return;
        made = new FlightStage(canvas.current, assets, director, live.current.view);
        live.current.onStage(made);
        setState('ready');
      } catch (e) {
        console.error(e);
        if (!dead) setState('failed');
      }
    })();
    return () => {
      dead = true;
      made?.dispose();
      live.current.onStage(null);
    };
  }, [director]);

  return (
    <div className="viewport" data-state={state}>
      {state === 'failed' ? (
        <div className="viewport-fallback">{fallback}</div>
      ) : (
        <canvas ref={canvas} role="img" aria-label={t('Трёхмерная сцена полёта. Изображение можно вращать.', '3D view of the flight. Drag to look around.')} />
      )}
      {state === 'loading' && <span className="viewport-wait">{t('Готовим стартовый комплекс…', 'Preparing the launch complex…')}</span>}
      {children}
    </div>
  );
}
