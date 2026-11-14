import React, { useEffect, useRef } from 'react';

interface UpgradeConfettiCanvasProps {
  grade: number;
}

const GOLD_PALETTE = [
  '#a3e635', // FC Online Volt Lime
  '#facc15', // Champion Gold
  '#fde047', // Bright Gold
  '#f59e0b', // Amber
  '#34d399', // Pitch Emerald
  '#ffffff', // Stadium Flash White
];

const ELITE_PALETTE = [
  '#fde047', // Pure Gold
  '#fb7185', // Crimson Star
  '#38bdf8', // Diamond Cyan
  '#a3e635', // Volt Lime
  '#f97316', // Pyro Orange
  '#ffffff', // Flash White
];

type ParticleShape = 'rect' | 'ribbon' | 'star';

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  shape: ParticleShape;
  angle: number;
  spin: number;
  tilt: number;
  tiltSpeed: number;
  alpha: number;
  life: number;
  maxLife: number;
}

function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  r: number
): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 === 0 ? r : r * 0.36;
    const theta = (i * Math.PI) / 4;
    const px = Math.cos(theta) * rad;
    const py = Math.sin(theta) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

export const UpgradeConfettiCanvas: React.FC<UpgradeConfettiCanvasProps> = ({ grade }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = canvas.clientWidth || 720;
    let height = canvas.clientHeight || 400;

    const syncSize = () => {
      width = canvas.clientWidth || 720;
      height = canvas.clientHeight || 400;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    syncSize();

    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);

    const isElite = grade >= 11;
    const palette = isElite ? ELITE_PALETTE : GOLD_PALETTE;
    const particles: ConfettiParticle[] = [];

    const spawnBurst = (
      originXRatio: number,
      originYRatio: number,
      baseAngleRad: number,
      spreadRad: number,
      count: number,
      speedMin: number,
      speedMax: number
    ) => {
      const ox = width * originXRatio;
      const oy = height * originYRatio;
      for (let i = 0; i < count; i++) {
        const theta = baseAngleRad + (Math.random() - 0.5) * spreadRad;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        const roll = Math.random();
        const shape: ParticleShape = roll < 0.2 ? 'star' : roll < 0.58 ? 'ribbon' : 'rect';
        particles.push({
          x: ox + (Math.random() - 0.5) * 16,
          y: oy + (Math.random() - 0.5) * 16,
          vx: Math.cos(theta) * speed,
          vy: Math.sin(theta) * speed,
          w: shape === 'ribbon' ? 5 + Math.random() * 4 : 6 + Math.random() * 5,
          h: shape === 'ribbon' ? 12 + Math.random() * 8 : 5 + Math.random() * 4,
          color: palette[Math.floor(Math.random() * palette.length)],
          shape,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 9,
          tilt: Math.random() * Math.PI * 2,
          tiltSpeed: 6 + Math.random() * 7,
          alpha: 1,
          life: 0,
          maxLife: 2.4 + Math.random() * 1.4,
        });
      }
    };

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Static tasteful gold-lime celebration scatter when reduced motion is preferred
      spawnBurst(0.5, 0.45, -Math.PI / 2, Math.PI * 2, isElite ? 56 : 42, 40, 260);
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        const x = p.x + p.vx * 0.6;
        const y = p.y + p.vy * 0.6;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = p.color;
        if (p.shape === 'star') {
          drawFourPointStar(ctx, p.w * 0.7);
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      return () => {
        ro.disconnect();
      };
    }

    // Wave 1: Immediate dual stadium side cannons + center fireworks crown
    const cannonCount = isElite ? 48 : 34;
    spawnBurst(0.06, 0.92, -Math.PI * 0.32, Math.PI * 0.28, cannonCount, 380, 740);
    spawnBurst(0.94, 0.92, -Math.PI * 0.68, Math.PI * 0.28, cannonCount, 380, 740);
    spawnBurst(0.5, 0.48, -Math.PI / 2, Math.PI * 1.65, isElite ? 42 : 28, 180, 520);

    // Wave 2 & 3: Staggered golden bursts
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        spawnBurst(0.24, 0.3, Math.PI * 0.4, Math.PI * 1.8, isElite ? 34 : 24, 140, 420);
        spawnBurst(0.76, 0.3, Math.PI * 0.6, Math.PI * 1.8, isElite ? 34 : 24, 140, 420);
      }, 380)
    );

    if (isElite) {
      timers.push(
        window.setTimeout(() => {
          spawnBurst(0.5, 0.22, Math.PI * 0.5, Math.PI * 2, 46, 160, 480);
        }, 780)
      );
    }

    let rafId = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.04, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      const gravity = 460;
      const dragX = Math.pow(0.26, dt);
      const dragY = Math.pow(0.62, dt);

      let aliveCount = 0;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife || p.y > height + 36) {
          particles.splice(i, 1);
          continue;
        }
        aliveCount++;

        p.vx *= dragX;
        p.vy = p.vy * dragY + gravity * dt;
        p.x += p.vx * dt + Math.sin(p.tilt) * 28 * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        p.tilt += p.tiltSpeed * dt;

        const fadeRatio = p.life / p.maxLife;
        p.alpha = fadeRatio > 0.68 ? Math.max(0, 1 - (fadeRatio - 0.68) / 0.32) : 1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = p.alpha * 0.94;
        ctx.fillStyle = p.color;

        if (p.shape === 'star') {
          const pulseScale = 0.72 + Math.abs(Math.sin(p.tilt)) * 0.42;
          drawFourPointStar(ctx, p.w * 0.72 * pulseScale);
        } else {
          const flutterY = 0.25 + Math.abs(Math.cos(p.tilt)) * 0.75;
          ctx.scale(1, flutterY);
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }

      if (aliveCount > 0 || particles.length > 0) {
        rafId = window.requestAnimationFrame(frame);
      }
    };

    rafId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(rafId);
      timers.forEach((id) => window.clearTimeout(id));
      ro.disconnect();
    };
  }, [grade]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="upgrade-confetti-canvas"
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
    />
  );
};
