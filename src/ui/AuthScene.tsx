import { useEffect, useRef, useState } from 'react';
import type { AuthStage } from '../three/AuthStage';

/**
 * Earth's night side and an orbital sunrise behind the sign-in page. Decoration: it loads after the
 * page is on screen, and without WebGL a drawn horizon stands in.
 */
export function AuthScene() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let dead = false;
    let made: AuthStage | null = null;
    (async () => {
      try {
        const [{ AuthStage }, { webglAvailable }] = await Promise.all([import('../three/AuthStage'), import('../three/assets')]);
        if (!webglAvailable()) throw new Error('no webgl');
        if (dead || !canvas.current) return;
        made = new AuthStage(canvas.current, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
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
    <div className="auth-bg" data-state={state} aria-hidden="true">
      {state !== 'failed' && <canvas ref={canvas} />}
    </div>
  );
}
