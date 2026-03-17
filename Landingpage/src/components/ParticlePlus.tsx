import { useRef, useEffect, useCallback } from 'react';

type Phase = 'WAIT' | 'GATHER' | 'PULSE' | 'EXPLODE' | 'DONE';

interface Particle {
  spawnX: number; spawnY: number; spawnZ: number;
  hx: number; hy: number; hz: number;
  x: number; y: number; z: number;
  evx: number; evy: number; evz: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  delay: number;
}

interface ParticlePlusProps {
  className?: string;
  onIntroComplete?: () => void;
}

export function ParticlePlus({ className = '', onIntroComplete }: ParticlePlusProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const phaseRef = useRef<Phase>('WAIT');
  const phaseTimeRef = useRef(0);
  const calledCompleteRef = useRef(false);
  const centerRef = useRef({ cx: 0, cy: 0 });

  const PARTICLE_COUNT = 500;
  const PLUS_ARM_LEN = 120;
  const PLUS_ARM_WIDTH = 70;
  const FOCAL_LENGTH = 600;

  // ── Timing choreography ──
  const WAIT_DURATION = 0.5;     // "ANKI" visible, no particles yet
  const GATHER_DURATION = 2.0;   // particles drift in slowly, text splits
  const PULSE_DURATION = 0.25;   // brief brightness flash, flows into explode
  const EXPLODE_DURATION = 0.8;  // slower, more dramatic explosion

  // Gap between AN and KI when fully split
  const TEXT_GAP_FINAL = PLUS_ARM_LEN * 2 + 40;

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

      const baseAlpha = 0.4 + Math.random() * 0.5;

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
        delay: Math.random() * 0.5, // spread delays across longer gather
      });
    }
    particlesRef.current = particles;
    phaseRef.current = 'WAIT';
    phaseTimeRef.current = 0;
    timeRef.current = 0;
    calledCompleteRef.current = false;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dW = 0, dH = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      dW = rect.width; dH = rect.height;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles(rect.width, rect.height);
    };

    resize();
    window.addEventListener('resize', resize);

    let lastT = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      if (!dW || !dH) { animRef.current = requestAnimationFrame(animate); return; }

      timeRef.current += dt;
      phaseTimeRef.current += dt;

      const pt = phaseTimeRef.current;

      // Phase transitions
      if (phaseRef.current === 'WAIT' && pt >= WAIT_DURATION) {
        phaseRef.current = 'GATHER'; phaseTimeRef.current = 0;
      } else if (phaseRef.current === 'GATHER' && pt >= GATHER_DURATION) {
        phaseRef.current = 'PULSE'; phaseTimeRef.current = 0;
      } else if (phaseRef.current === 'PULSE' && pt >= PULSE_DURATION) {
        phaseRef.current = 'EXPLODE'; phaseTimeRef.current = 0;
        if (!calledCompleteRef.current) {
          calledCompleteRef.current = true;
          onIntroComplete?.();
        }
      } else if (phaseRef.current === 'EXPLODE' && pt >= EXPLODE_DURATION) {
        phaseRef.current = 'DONE'; phaseTimeRef.current = 0;
      }

      if (phaseRef.current === 'DONE') {
        ctx.clearRect(0, 0, dW, dH);
        return;
      }

      ctx.clearRect(0, 0, dW, dH);

      const { cx, cy } = centerRef.current;
      const phase = phaseRef.current;
      const cpt = phaseTimeRef.current;
      const t = timeRef.current;

      // ── Draw "AN  KI" text on canvas ──
      const fontSize = Math.min(dW * 0.14, 180);
      ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';

      const anWidth = ctx.measureText('AN').width;

      // Text animation: together during WAIT, splits during GATHER, fades during EXPLODE
      let splitProgress = 0;
      let textAlpha = 0;

      if (phase === 'WAIT') {
        // Text fades in and sits still
        const fadeIn = Math.min(1, cpt / 0.3); // fade in over 0.3s
        splitProgress = 0;
        textAlpha = 0.6 * fadeIn;
      } else if (phase === 'GATHER') {
        // Start splitting after 0.4s, ease out over rest of gather
        const splitDelay = 0.4;
        const splitDuration = GATHER_DURATION - splitDelay;
        const rawProg = Math.max(0, (cpt - splitDelay) / splitDuration);
        splitProgress = 1 - Math.pow(1 - Math.min(rawProg, 1), 3); // ease-out cubic
        // Gradually dim as it splits: 0.6 → 0.12
        textAlpha = 0.6 - splitProgress * 0.48;
      } else if (phase === 'PULSE') {
        splitProgress = 1;
        textAlpha = 0.12;
      } else if (phase === 'EXPLODE') {
        splitProgress = 1;
        const prog = cpt / EXPLODE_DURATION;
        textAlpha = 0.12 * Math.max(0, 1 - prog * 2.5);
      }

      if (textAlpha > 0.005) {
        const halfGap = (splitProgress * TEXT_GAP_FINAL) / 2;
        const anX = cx - halfGap - anWidth;
        const kiX = cx + halfGap;

        ctx.fillStyle = `rgba(255,255,255,${textAlpha})`;
        ctx.fillText('AN', anX, cy);
        ctx.fillText('KI', kiX, cy);
      }

      // ── Draw particles (not during WAIT) ──
      if (phase === 'WAIT') {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      const particles = particlesRef.current;

      // Pulse multiplier — during PULSE, particles brighten and scale up briefly
      let pulseBrightness = 1;
      let pulseScale = 1;
      if (phase === 'PULSE') {
        // Quick bell curve: ramp up then down over PULSE_DURATION
        const pp = cpt / PULSE_DURATION;
        const bell = Math.sin(pp * Math.PI); // 0 → 1 → 0
        pulseBrightness = 1 + bell * 0.6; // up to 1.6x brightness
        pulseScale = 1 + bell * 0.15;     // subtle size boost
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (phase === 'GATHER') {
          const prog = Math.max(0, Math.min(1, (cpt - p.delay) / (GATHER_DURATION - p.delay)));
          // Smooth ease: slow start, gentle arrival (no abrupt stop)
          const ease = prog < 0.5
            ? 2 * prog * prog                    // ease-in first half
            : 1 - Math.pow(-2 * prog + 2, 3) / 2; // ease-out second half
          p.x = p.spawnX + (p.hx - p.spawnX) * ease;
          p.y = p.spawnY + (p.hy - p.spawnY) * ease;
          p.z = p.spawnZ + (p.hz - p.spawnZ) * ease;
          p.alpha = p.baseAlpha * ease;

        } else if (phase === 'PULSE') {
          // Gentle float + glow — particles barely move, just breathe
          const fx = Math.sin(t * 2 + i * 0.4) * 2;
          const fy = Math.cos(t * 1.6 + i * 0.6) * 2;
          p.x += (p.hx + fx - p.x) * 0.2;
          p.y += (p.hy + fy - p.y) * 0.2;
          p.z += (p.hz - p.z) * 0.2;
          p.alpha += (p.baseAlpha * pulseBrightness - p.alpha) * 0.3;

        } else if (phase === 'EXPLODE') {
          const prog = cpt / EXPLODE_DURATION;
          // Smooth ease-out for explosion (not linear)
          const ease = 1 - Math.pow(1 - prog, 2.5);
          p.x = p.hx + p.evx * ease;
          p.y = p.hy + p.evy * ease;
          p.z = p.hz + p.evz * ease;
          // Fade out with a gentle curve
          p.alpha = p.baseAlpha * Math.max(0, 1 - Math.pow(prog, 0.7) * 1.5);
        }

        const scale = FOCAL_LENGTH / (FOCAL_LENGTH + p.z);
        const sx = dW / 2 + (p.x - dW / 2) * scale;
        const sy = dH / 2 + (p.y - dH / 2) * scale;
        const ss = p.size * scale * pulseScale;

        if (p.alpha < 0.008) continue;

        // Main particle
        ctx.beginPath();
        ctx.arc(sx, sy, ss, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(10,132,255,${Math.min(p.alpha, 1)})`;
        ctx.fill();

        // Glow halo
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
      window.removeEventListener('resize', resize);
    };
  }, [initParticles, onIntroComplete]);

  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
    </div>
  );
}
