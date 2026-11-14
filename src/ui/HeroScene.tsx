import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { HeroStage } from '../three/HeroStage';

/** The rocket on the home page. Decoration: without WebGL the page simply goes without it. */
export function HeroScene() {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let dead = false;
    let made: HeroStage | null = null;
    (async () => {
      try {
        const [{ HeroStage }, { loadAssets, webglAvailable }] = await Promise.all([import('../three/HeroStage'), import('../three/assets')]);
        if (!webglAvailable()) throw new Error('no webgl');
        const assets = await loadAssets();
        if (dead || !canvas.current) return;
        made = new HeroStage(canvas.current, assets, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        setState('ready');
      } catch {
        if (!dead) setState('failed');
      }
    })();
    return () => {
      dead = true;
      made?.dispose();
    };
  }, []);

  if (state === 'failed') return null;
  return (
    <figure className="hero-scene" data-state={state}>
      <div className="hero-view">
        <canvas ref={canvas} role="img" aria-label={t('Ракета «Атлант» на стартовом столе', 'The Atlant rocket on its launch pad')} />
      </div>
      <figcaption>{t('«Атлант», средняя ракета: 8 тонн на низкую орбиту', 'Atlant, medium launcher: 8 tonnes to low orbit')}</figcaption>
    </figure>
  );
}
