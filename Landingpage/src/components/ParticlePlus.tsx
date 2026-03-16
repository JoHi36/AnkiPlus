import { useRef, useEffect, useCallback } from 'react';

type Phase = 'GATHER' | 'HOLD' | 'EXPLODE' | 'DRIFT';

interface Particle {
  // Spawn position (random, off-screen or scattered)
  spawnX: number; spawnY: number; spawnZ: number;
  // Home position (forms the "+")
  hx: number; hy: number; hz: number;
  // Current position
  x: number; y: number; z: number;
  // Explosion velocity
  evx: number; evy: number; evz: number;
  // Visual
  size: number;
  alpha: number;
  baseAlpha: number;
  // Timing offset for staggered gather
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
  const phaseRef = useRef<Phase>('GATHER');
  const phaseTimeRef = useRef(0);
  const calledCompleteRef = useRef(false);
  const mouseRef = useRef({ x: 0, y: 0, inside: false });

  const PARTICLE_COUNT = 350;
  const PLUS_SIZE = 130;
  const ARM_WIDTH = 34;
  const FOCAL_LENGTH = 600;

  // Phase durations (seconds)
  const GATHER_DURATION = 1.4;
  const HOLD_DURATION = 0.8;
  const EXPLODE_DURATION = 0.6;

  const initParticles = useCallback((w: number, h: number) => {
    const particles: Particle[] = [];
    const cx = w / 2;
    const cy = h / 2;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Home position on "+" shape
      let px: number, py: number;
      if (Math.random() < 0.5) {
        px = (Math.random() - 0.5) * ARM_WIDTH;
        py = (Math.random() - 0.5) * PLUS_SIZE * 2;
      } else {
        px = (Math.random() - 0.5) * PLUS_SIZE * 2;
        py = (Math.random() - 0.5) * ARM_WIDTH;
      }
      const pz = (Math.random() - 0.5) * 40;

      // Spawn from random directions (edges + beyond)
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnDist = 400 + Math.random() * 300;
      const spawnX = cx + Math.cos(spawnAngle) * spawnDist;
      const spawnY = cy + Math.sin(spawnAngle) * spawnDist;
      const spawnZ = (Math.random() - 0.5) * 200;

      // Explosion velocity (outward from center)
      const explodeAngle = Math.atan2(py, px) + (Math.random() - 0.5) * 0.5;
      const explodeSpeed = 200 + Math.random() * 350;
      const evx = Math.cos(explodeAngle) * explodeSpeed;
      const evy = Math.sin(explodeAngle) * explodeSpeed;
      const evz = (Math.random() - 0.5) * 150;

      const baseAlpha = 0.35 + Math.random() * 0.5;

      particles.push({
        spawnX, spawnY, spawnZ,
        hx: cx + px, hy: cy + py, hz: pz,
        x: spawnX, y: spawnY, z: spawnZ,
        evx, evy, evz,
        size: 1.2 + Math.random() * 2,
        alpha: 0,
        baseAlpha,
        delay: Math.random() * 0.5, // stagger gather
      });
    }
    particlesRef.current = particles;
    phaseRef.current = 'GATHER';
    phaseTimeRef.current = 0;
    timeRef.current = 0;
    calledCompleteRef.current = false;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let displayW = 0;
    let displayH = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      displayW = rect.width;
      displayH = rect.height;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles(rect.width, rect.height);
    };

    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
    };
    const onMouseEnter = () => { mouseRef.current.inside = true; };
    const onMouseLeave = () => { mouseRef.current.inside = false; };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseenter', onMouseEnter);
    canvas.addEventListener('mouseleave', onMouseLeave);

    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05); // cap dt
      lastTime = now;

      const w = displayW;
      const h = displayH;
      if (!w || !h) { animRef.current = requestAnimationFrame(animate); return; }

      timeRef.current += dt;
      phaseTimeRef.current += dt;

      const phase = phaseRef.current;
      const pt = phaseTimeRef.current;

      // Phase transitions
      if (phase === 'GATHER' && pt >= GATHER_DURATION) {
        phaseRef.current = 'HOLD';
        phaseTimeRef.current = 0;
      } else if (phase === 'HOLD' && pt >= HOLD_DURATION) {
        phaseRef.current = 'EXPLODE';
        phaseTimeRef.current = 0;
      } else if (phase === 'EXPLODE' && pt >= EXPLODE_DURATION) {
        phaseRef.current = 'DRIFT';
        phaseTimeRef.current = 0;
        if (!calledCompleteRef.current) {
          calledCompleteRef.current = true;
          onIntroComplete?.();
        }
      }

      ctx.clearRect(0, 0, w, h);

      const particles = particlesRef.current;
      const currentPhase = phaseRef.current;
      const currentPt = phaseTimeRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const isHovered = mouseRef.current.inside;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (currentPhase === 'GATHER') {
          // Staggered fly-in to home position
          const progress = Math.max(0, Math.min(1, (currentPt - p.delay) / (GATHER_DURATION - p.delay)));
          const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
          p.x = p.spawnX + (p.hx - p.spawnX) * ease;
          p.y = p.spawnY + (p.hy - p.spawnY) * ease;
          p.z = p.spawnZ + (p.hz - p.spawnZ) * ease;
          p.alpha = p.baseAlpha * ease;

        } else if (currentPhase === 'HOLD') {
          // Gentle float at home
          const floatX = Math.sin(timeRef.current * 1.2 + i * 0.3) * 2;
          const floatY = Math.cos(timeRef.current * 0.9 + i * 0.5) * 2;
          p.x += (p.hx + floatX - p.x) * 0.12;
          p.y += (p.hy + floatY - p.y) * 0.12;
          p.z += (p.hz - p.z) * 0.12;
          p.alpha += (p.baseAlpha - p.alpha) * 0.1;

        } else if (currentPhase === 'EXPLODE') {
          // Fly outward with deceleration
          const progress = currentPt / EXPLODE_DURATION;
          const ease = 1 - Math.pow(1 - progress, 2); // easeOutQuad
          p.x = p.hx + p.evx * ease;
          p.y = p.hy + p.evy * ease;
          p.z = p.hz + p.evz * ease;
          // Fade out as they fly
          p.alpha = p.baseAlpha * Math.max(0, 1 - progress * 1.5);

        } else {
          // DRIFT — particles settle at scattered positions, subtle floating
          const floatX = Math.sin(timeRef.current * 0.4 + i * 0.2) * 3;
          const floatY = Math.cos(timeRef.current * 0.3 + i * 0.4) * 3;

          // Drift target: where they ended up after explosion
          const driftX = p.hx + p.evx + floatX;
          const driftY = p.hy + p.evy + floatY;
          const driftZ = p.hz + p.evz;

          p.x += (driftX - p.x) * 0.02;
          p.y += (driftY - p.y) * 0.02;
          p.z += (driftZ - p.z) * 0.02;

          // Very subtle alpha
          const targetAlpha = p.baseAlpha * 0.12;
          p.alpha += (targetAlpha - p.alpha) * 0.03;

          // Mouse interaction in drift phase
          if (isHovered) {
            const dx = p.x - mx;
            const dy = p.y - my;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 120) {
              const force = (1 - dist / 120) * 40;
              const angle = Math.atan2(dy, dx);
              p.x += Math.cos(angle) * force * dt * 4;
              p.y += Math.sin(angle) * force * dt * 4;
              p.alpha = Math.min(p.baseAlpha * 0.3, p.alpha + 0.02);
            }
          }
        }

        // 3D perspective projection
        const scale = FOCAL_LENGTH / (FOCAL_LENGTH + p.z);
        const screenX = w / 2 + (p.x - w / 2) * scale;
        const screenY = h / 2 + (p.y - h / 2) * scale;
        const screenSize = p.size * scale;

        if (p.alpha < 0.01) continue;

        // Draw particle
        ctx.beginPath();
        ctx.arc(screenX, screenY, screenSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(10, 132, 255, ${p.alpha})`;
        ctx.fill();

        // Glow on larger particles
        if (p.size > 2 && p.alpha > 0.05) {
          ctx.beginPath();
          ctx.arc(screenX, screenY, screenSize * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(10, 132, 255, ${p.alpha * 0.1})`;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseenter', onMouseEnter);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [initParticles, onIntroComplete]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
    </div>
  );
}
