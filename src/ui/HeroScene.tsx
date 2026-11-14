import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { HeroStage } from '../three/HeroStage';

/** The rocket at dusk behind the home page's headline. Decoration: without WebGL a gradient stands in. */
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

  return (
    <div className="hero-bg" data-state={state} aria-hidden={state !== 'ready'}>
      {state !== 'failed' && <canvas ref={canvas} role="img" aria-label={t('Ракета «Атлант» на стартовом столе в сумерках', 'The Atlant rocket on its launch pad at dusk')} />}
    </div>
  );
}
