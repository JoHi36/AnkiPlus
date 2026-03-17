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
  const fontCacheRef = useRef({ font: '', fontSize: 0, anWidth: 0 });

  const PARTICLE_COUNT = 400;
  const PLUS_ARM_LEN = 120;
  const PLUS_ARM_WIDTH = 70;
  const FOCAL_LENGTH = 600;

  const EXPLODE_TIME = 1.8;
  // Fire BEFORE explosion so React re-renders during calm float phase
  const COMPLETE_TIME = 1.5;
  const TOTAL_DURATION = 2.5;

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
      const arriveStart = 0.3 + Math.random() * 0.4;
      const arriveDur = 0.7 + Math.random() * 0.4;

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
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      dimsRef.current = { w, h };
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const fontSize = Math.min(w * 0.14, 180);
      const font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      ctx.font = font;
      const anWidth = ctx.measureText('An').width;
      fontCacheRef.current = { font, fontSize, anWidth };

      return { w, h };
    };

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

      // Fire BEFORE explosion — React re-renders during calm float, not during explosion
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
      const { font, anWidth } = fontCacheRef.current;

      // ── TEXT: "An" + "ki" ──
      ctx.font = font;
      ctx.textBaseline = 'middle';

      const fadeIn = Math.min(1, t / 0.3);
      const splitRaw = Math.max(0, Math.min(1, (t - 0.4) / 1.2));
      const splitProgress = splitRaw * splitRaw * (3 - 2 * splitRaw);

      const brightening = 0.15 + splitProgress * 0.55;
      const explosionFade = t > EXPLODE_TIME
        ? Math.max(0, 1 - (t - EXPLODE_TIME) / 0.3)
        : 1;
      const textAlpha = fadeIn * brightening * explosionFade;

      if (textAlpha > 0.005) {
        const TEXT_GAP_FINAL = PLUS_ARM_LEN * 2 + 40;
        const halfGap = (splitProgress * TEXT_GAP_FINAL) / 2;
        const anX = cx - halfGap - anWidth;
        const kiX = cx + halfGap;

        ctx.globalAlpha = textAlpha;
        ctx.fillStyle = '#fff';
        ctx.fillText('An', anX, cy);
        ctx.fillText('ki', kiX, cy);
        ctx.globalAlpha = 1;
      }

      // ── PARTICLES ──
      const particles = particlesRef.current;
      const halfW = dW / 2;
      const halfH = dH / 2;
      const explodeDur = TOTAL_DURATION - EXPLODE_TIME;
      const approachEnergy = Math.max(0, Math.min(1, (t - 1.0) / (EXPLODE_TIME - 1.0)));

      ctx.fillStyle = 'rgb(10,132,255)';

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        const gatherRaw = Math.max(0, Math.min(1, (t - p.arriveStart) / p.arriveDur));
        if (gatherRaw <= 0) continue;

        const gather = gatherRaw * gatherRaw * (3 - 2 * gatherRaw);

        const explodeRaw = Math.max(0, (t - EXPLODE_TIME) / explodeDur);
        const explode = Math.min(explodeRaw, 1);

        const floatAmp = 3 + approachEnergy * 5;
        const floatX = Math.sin(t * 1.3 + i * 0.37) * floatAmp * gather;
        const floatY = Math.cos(t * 1.1 + i * 0.53) * floatAmp * gather;

        let px: number, py: number, pz: number, alpha: number;

        if (explodeRaw <= 0) {
          px = p.spawnX + (p.hx - p.spawnX) * gather + floatX;
          py = p.spawnY + (p.hy - p.spawnY) * gather + floatY;
          pz = p.spawnZ + (p.hz - p.spawnZ) * gather;
          alpha = p.baseAlpha * gather;
        } else {
          px = p.hx + floatX * (1 - explode) + p.evx * explode;
          py = p.hy + floatY * (1 - explode) + p.evy * explode;
          pz = p.hz + p.evz * explode;
          alpha = p.baseAlpha * Math.max(0, 1 - explodeRaw * 2);
        }

        if (alpha < 0.008) continue;

        const scale = FOCAL_LENGTH / (FOCAL_LENGTH + pz);
        const sx = halfW + (px - halfW) * scale;
        const sy = halfH + (py - halfH) * scale;
        const ss = p.size * scale;

        if (sx < -20 || sx > dW + 20 || sy < -20 || sy > dH + 20) continue;

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(sx, sy, ss, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
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
