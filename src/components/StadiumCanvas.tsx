import React, { useEffect, useRef } from 'react';

interface StadiumCanvasProps {
  paused?: boolean;
  accentHex?: string;
}

const PARTICLE_COUNT = 42;

export const StadiumCanvas: React.FC<StadiumCanvasProps> = ({
  paused = false,
  accentHex = '#F59E0B',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);
  const accentRef = useRef(accentHex);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    accentRef.current = accentHex;
  }, [accentHex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pre-allocated typed ring buffer for zero-GC 60fps simulation
    const px = new Float32Array(PARTICLE_COUNT);
    const py = new Float32Array(PARTICLE_COUNT);
    const vx = new Float32Array(PARTICLE_COUNT);
    const vy = new Float32Array(PARTICLE_COUNT);
    const pr = new Float32Array(PARTICLE_COUNT);
    const pa = new Float32Array(PARTICLE_COUNT);

    let width = window.innerWidth;
    let height = window.innerHeight;

    const resetParticle = (i: number, randomY: boolean) => {
      px[i] = Math.random() * width;
      py[i] = randomY ? Math.random() * height : height + 12;
      vx[i] = (Math.random() - 0.5) * 18;
      vy[i] = -(14 + Math.random() * 28);
      pr[i] = 1.2 + Math.random() * 2.4;
      pa[i] = 0.15 + Math.random() * 0.45;
    };

    const SCALE = 0.5;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const syncSize = () => {
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.round(width * SCALE));
      canvas.height = Math.max(1, Math.round(height * SCALE));
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    };

    syncSize();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      resetParticle(i, true);
    }

    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);

    let rafId = 0;
    let lastDrawTime = performance.now();
    let sweepTime = 0;

    const drawFrame = (dt: number) => {
      sweepTime += dt;
      ctx.clearRect(0, 0, width, height);

      // Subtle stadium floodlight cones from top corners
      const beamSwing = Math.sin(sweepTime * 0.55) * 0.08;
      ctx.save();
      const gradLeft = ctx.createLinearGradient(0, 0, width * (0.45 + beamSwing), height * 0.75);
      gradLeft.addColorStop(0, 'rgba(16, 185, 129, 0.09)');
      gradLeft.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = gradLeft;
      ctx.fillRect(0, 0, width, height);

      const gradRight = ctx.createLinearGradient(width, 0, width * (0.55 - beamSwing), height * 0.75);
      gradRight.addColorStop(0, 'rgba(245, 158, 11, 0.09)');
      gradRight.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = gradRight;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // Update & draw pooled stadium sparks
      ctx.fillStyle = accentRef.current;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        if (py[i] < -10 || px[i] < -10 || px[i] > width + 10) {
          resetParticle(i, false);
        }
        ctx.globalAlpha = pa[i];
        ctx.beginPath();
        ctx.arc(px[i], py[i], pr[i], 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    drawFrame(0.016);
    if (prefersReducedMotion) {
      return () => {
        ro.disconnect();
      };
    }

    const tick = (now: number) => {
      const elapsed = (now - lastDrawTime) / 1000;
      if (elapsed >= 0.066) {
        lastDrawTime = now;
        const dt = Math.min(Math.max(elapsed, 0), 0.08);
        if (!pausedRef.current) {
          drawFrame(dt);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="stadium-canvas"
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
      aria-hidden="true"
    />
  );
};
