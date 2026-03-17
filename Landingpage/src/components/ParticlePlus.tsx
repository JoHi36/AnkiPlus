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
  // Cached font metrics (set once after first sizeCanvas)
  const fontCacheRef = useRef({ font: '', subFont: '', anWidth: 0, fontSize: 0 });

  const PARTICLE_COUNT = 400; // reduced from 500 — less GPU work
  const PLUS_ARM_LEN = 120;
  const PLUS_ARM_WIDTH = 70;
  const FOCAL_LENGTH = 600;

  // ── Snappy timeline — gather flows into quick explosion ──
  const EXPLODE_TIME = 1.8;    // explosion begins
  const COMPLETE_TIME = 1.8;   // crossfade starts immediately with explosion
  const TOTAL_DURATION = 2.5;  // explosion lasts only 0.7s, particles vanish fast

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
      // All particles arrive well before explosion (0.3→1.5s)
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

      // Cache font metrics
      const fontSize = Math.min(w * 0.14, 180);
      const font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      const subFontSize = Math.max(14, fontSize * 0.12);
      const subFont = `300 ${subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      ctx.font = font;
      const anWidth = ctx.measureText('AN').width;
      fontCacheRef.current = { font, subFont, anWidth, fontSize };

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
      const { font, subFont, anWidth, fontSize } = fontCacheRef.current;

      // ── TEXT (use cached font) ──
      ctx.font = font;
      ctx.textBaseline = 'middle';

      const fadeIn = Math.min(1, t / 0.3);
      const splitRaw = Math.max(0, Math.min(1, (t - 0.4) / 1.2));
      const splitProgress = splitRaw * splitRaw * (3 - 2 * splitRaw);

      // Dark → light: starts dim (0.15), brightens as split happens (up to 0.7)
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
        ctx.fillText('AN', anX, cy);
        ctx.fillText('KI', kiX, cy);

        // ── Subtitle "Flashcards" below — fades in early, out with text ──
        const subAlpha = fadeIn * Math.min(0.3, brightening * 0.4) * explosionFade;
        if (subAlpha > 0.005) {
          ctx.font = subFont;
          ctx.textAlign = 'center';
          ctx.globalAlpha = subAlpha;
          ctx.fillStyle = '#fff';
          ctx.fillText('Flashcards', cx, cy + fontSize * 0.55);
          ctx.textAlign = 'start'; // reset
        }

        ctx.font = font; // restore main font
        ctx.globalAlpha = 1;
      }

      // ── PARTICLES — optimized rendering ──
      const particles = particlesRef.current;
      const halfW = dW / 2;
      const halfH = dH / 2;
      const explodeDur = TOTAL_DURATION - EXPLODE_TIME;

      // Pre-approach energy: float amplitude grows as we near explosion
      const approachEnergy = Math.max(0, Math.min(1, (t - 1.0) / (EXPLODE_TIME - 1.0)));

      // Use globalAlpha instead of per-particle rgba string parsing
      ctx.fillStyle = 'rgb(10,132,255)';

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        const gatherRaw = Math.max(0, Math.min(1, (t - p.arriveStart) / p.arriveDur));
        if (gatherRaw <= 0) continue; // not started yet — skip entirely

        const gather = gatherRaw * gatherRaw * (3 - 2 * gatherRaw);

        const explodeRaw = Math.max(0, (t - EXPLODE_TIME) / explodeDur);
        // Linear movement — no ease-out plateau where particles "hang"
        const explode = Math.min(explodeRaw, 1);

        // Float amplitude grows from 3→8px as explosion approaches (energy buildup)
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
          // Alpha tracks movement — invisible by the time particles slow
          alpha = p.baseAlpha * Math.max(0, 1 - explodeRaw * 2);
        }

        if (alpha < 0.008) continue;

        const scale = FOCAL_LENGTH / (FOCAL_LENGTH + pz);
        const sx = halfW + (px - halfW) * scale;
        const sy = halfH + (py - halfH) * scale;
        const ss = p.size * scale;

        // Skip off-screen particles
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
