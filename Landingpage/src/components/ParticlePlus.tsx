import { useRef, useEffect, useCallback } from 'react';

interface Particle {
  spawnX: number; spawnY: number; spawnZ: number;
  hx: number; hy: number; hz: number;
  x: number; y: number; z: number;
  evx: number; evy: number; evz: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  arriveStart: number;
  arriveDur: number;
}

interface ParticlePlusProps {
  className?: string;
  onIntroComplete?: () => void;
}

export function ParticlePlus({ className = '', onIntroComplete }: ParticlePlusProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const calledCompleteRef = useRef(false);
  const centerRef = useRef({ cx: 0, cy: 0 });
  const dimsRef = useRef({ w: 0, h: 0 });

  const PARTICLE_COUNT = 500;
  const PLUS_ARM_LEN = 120;
  const PLUS_ARM_WIDTH = 70;
  const FOCAL_LENGTH = 600;

  const TOTAL_DURATION = 3.8;
  const EXPLODE_TIME = 2.6;
  const COMPLETE_TIME = 2.8;

  const initParticles = useCallback((w: number, h: number) => {
    const particles: Particle[] = [];
    const cx = w / 2;
    const cy = h * 0.38;
    centerRef.current = { cx, cy };

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let px: number, py: number;
      if (Math.random() < 0.5) {
        px = (Math.random() - 0.5) * PLUS_ARM_WIDTH;
        py = (Math.random() - 0.5) * PLUS_ARM_LEN * 2;
      } else {
        px = (Math.random() - 0.5) * PLUS_ARM_LEN * 2;
        py = (Math.random() - 0.5) * PLUS_ARM_WIDTH;
      }
      const pz = (Math.random() - 0.5) * 30;

      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnDist = 350 + Math.random() * 250;

      const explodeAngle = Math.atan2(py, px) + (Math.random() - 0.5) * 0.6;
      const explodeSpeed = 200 + Math.random() * 400;

      const baseAlpha = 0.45 + Math.random() * 0.45;
      const arriveStart = 0.3 + Math.random() * 0.8;
      const arriveDur = 1.0 + Math.random() * 0.6;

      particles.push({
        spawnX: cx + Math.cos(spawnAngle) * spawnDist,
        spawnY: cy + Math.sin(spawnAngle) * spawnDist,
        spawnZ: (Math.random() - 0.5) * 150,
        hx: cx + px, hy: cy + py, hz: pz,
        x: cx + Math.cos(spawnAngle) * spawnDist,
        y: cy + Math.sin(spawnAngle) * spawnDist,
        z: (Math.random() - 0.5) * 150,
        evx: Math.cos(explodeAngle) * explodeSpeed,
        evy: Math.sin(explodeAngle) * explodeSpeed,
        evz: (Math.random() - 0.5) * 100,
        size: 1 + Math.random() * 1.8,
        alpha: 0,
        baseAlpha,
        arriveStart,
        arriveDur,
      });
    }
    particlesRef.current = particles;
    calledCompleteRef.current = false;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sizeCanvas = () => {
      // Use window dimensions directly — canvas is fixed fullscreen
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      dimsRef.current = { w, h };
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    // Defer init to next frame so layout is fully settled
    let initDone = false;
    requestAnimationFrame(() => {
      const { w, h } = sizeCanvas();
      initParticles(w, h);
      initDone = true;
    });

    const handleResize = () => {
      const { w, h } = sizeCanvas();
      initParticles(w, h);
    };
    window.addEventListener('resize', handleResize);

    let firstFrame = true;
    let originTime = 0;

    const animate = (now: number) => {
      if (!initDone) { animRef.current = requestAnimationFrame(animate); return; }

      if (firstFrame) { originTime = now; firstFrame = false; }
      const t = (now - originTime) / 1000;

      const { w: dW, h: dH } = dimsRef.current;
      if (!dW || !dH) { animRef.current = requestAnimationFrame(animate); return; }

      if (t >= COMPLETE_TIME && !calledCompleteRef.current) {
        calledCompleteRef.current = true;
        onIntroComplete?.();
      }

      if (t >= TOTAL_DURATION) {
        ctx.clearRect(0, 0, dW, dH);
        return;
      }

      ctx.clearRect(0, 0, dW, dH);

      const { cx, cy } = centerRef.current;

      // ── TEXT ──
      const fontSize = Math.min(dW * 0.14, 180);
      ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      const anWidth = ctx.measureText('AN').width;

      const fadeIn = Math.min(1, t / 0.25);
      const splitRaw = Math.max(0, Math.min(1, (t - 0.4) / 1.8));
      const splitProgress = splitRaw * splitRaw * (3 - 2 * splitRaw);
      const dimming = 0.85 - splitProgress * 0.65;
      const explosionFade = t > EXPLODE_TIME
        ? Math.max(0, 1 - (t - EXPLODE_TIME) / 0.5)
        : 1;
      const textAlpha = fadeIn * dimming * explosionFade;

      if (textAlpha > 0.005) {
        const TEXT_GAP_FINAL = PLUS_ARM_LEN * 2 + 40;
        const halfGap = (splitProgress * TEXT_GAP_FINAL) / 2;
        const anX = cx - halfGap - anWidth;
        const kiX = cx + halfGap;
        ctx.fillStyle = `rgba(255,255,255,${textAlpha})`;
        ctx.fillText('AN', anX, cy);
        ctx.fillText('KI', kiX, cy);
      }

      // ── PARTICLES ──
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        const gatherRaw = Math.max(0, Math.min(1, (t - p.arriveStart) / p.arriveDur));
        const gather = gatherRaw * gatherRaw * (3 - 2 * gatherRaw);

        const explodeRaw = Math.max(0, (t - EXPLODE_TIME) / (TOTAL_DURATION - EXPLODE_TIME));
        const explode = 1 - Math.pow(1 - Math.min(explodeRaw, 1), 2.5);

        const floatX = Math.sin(t * 1.3 + i * 0.37) * 3 * gather;
        const floatY = Math.cos(t * 1.1 + i * 0.53) * 3 * gather;

        if (explodeRaw <= 0) {
          p.x = p.spawnX + (p.hx - p.spawnX) * gather + floatX;
          p.y = p.spawnY + (p.hy - p.spawnY) * gather + floatY;
          p.z = p.spawnZ + (p.hz - p.spawnZ) * gather;
          p.alpha = p.baseAlpha * gather;
        } else {
          p.x = p.hx + floatX * (1 - explode) + p.evx * explode;
          p.y = p.hy + floatY * (1 - explode) + p.evy * explode;
          p.z = p.hz + p.evz * explode;
          p.alpha = p.baseAlpha * Math.max(0, 1 - Math.pow(explodeRaw, 0.6) * 1.4);
        }

        const scale = FOCAL_LENGTH / (FOCAL_LENGTH + p.z);
        const sx = dW / 2 + (p.x - dW / 2) * scale;
        const sy = dH / 2 + (p.y - dH / 2) * scale;
        const ss = p.size * scale;

        if (p.alpha < 0.008) continue;

        ctx.beginPath();
        ctx.arc(sx, sy, ss, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(10,132,255,${Math.min(p.alpha, 1)})`;
        ctx.fill();

        if (ss > 1.2 && p.alpha > 0.03) {
          ctx.beginPath();
          ctx.arc(sx, sy, ss * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(10,132,255,${Math.min(p.alpha * 0.1, 0.15)})`;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [initParticles, onIntroComplete]);

  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
    </div>
  );
}
