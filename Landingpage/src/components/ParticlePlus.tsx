import { useRef, useEffect, useCallback } from 'react';

// GATHER → star shape, MORPH → star→plus, HOLD → breathe, EXPLODE → burst, DRIFT → ambient
type Phase = 'GATHER' | 'MORPH' | 'HOLD' | 'EXPLODE' | 'DRIFT';

interface Particle {
  spawnX: number; spawnY: number; spawnZ: number;
  // Star position (Anki logo shape)
  starX: number; starY: number; starZ: number;
  // Plus position
  plusX: number; plusY: number; plusZ: number;
  // Current
  x: number; y: number; z: number;
  // Explosion
  evx: number; evy: number; evz: number;
  // Visual
  size: number;
  alpha: number;
  baseAlpha: number;
  delay: number;
}

interface ParticlePlusProps {
  className?: string;
  onIntroComplete?: () => void;
}

// Generate point on a 4-pointed star (Anki logo shape)
function starPoint(cx: number, cy: number, outerR: number, innerR: number): [number, number] {
  const angle = Math.random() * Math.PI * 2;
  // 4-pointed star: radius oscillates between outer and inner
  const starFactor = Math.cos(angle * 2); // creates 4 points
  const r = innerR + (outerR - innerR) * Math.abs(starFactor);
  // Add some thickness
  const spread = 8 + Math.random() * 12;
  const offsetAngle = angle + (Math.random() - 0.5) * 0.3;
  return [
    cx + Math.cos(offsetAngle) * r + (Math.random() - 0.5) * spread,
    cy + Math.sin(offsetAngle) * r + (Math.random() - 0.5) * spread,
  ];
}

// Generate point on a "+" shape — tight, sharp distribution
function plusPoint(cx: number, cy: number, armLen: number, armWidth: number): [number, number] {
  let px: number, py: number;
  if (Math.random() < 0.5) {
    // Vertical arm
    px = (Math.random() - 0.5) * armWidth;
    py = (Math.random() - 0.5) * armLen * 2;
  } else {
    // Horizontal arm
    px = (Math.random() - 0.5) * armLen * 2;
    py = (Math.random() - 0.5) * armWidth;
  }
  return [cx + px, cy + py];
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

  const PARTICLE_COUNT = 450;
  const PLUS_ARM_LEN = 100;
  const PLUS_ARM_WIDTH = 24; // tighter for sharper shape
  const STAR_OUTER = 110;
  const STAR_INNER = 35;
  const FOCAL_LENGTH = 600;

  // Phase durations
  const GATHER_DURATION = 1.2;
  const MORPH_DURATION = 0.8;
  const HOLD_DURATION = 0.5;
  const EXPLODE_DURATION = 0.5;

  const initParticles = useCallback((w: number, h: number) => {
    const particles: Particle[] = [];
    const cx = w / 2;
    const cy = h / 2;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const [starX, starY] = starPoint(cx, cy, STAR_OUTER, STAR_INNER);
      const [plusX, plusY] = plusPoint(cx, cy, PLUS_ARM_LEN, PLUS_ARM_WIDTH);
      const pz = (Math.random() - 0.5) * 30;

      // Spawn from random edges
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnDist = 350 + Math.random() * 250;
      const spawnX = cx + Math.cos(spawnAngle) * spawnDist;
      const spawnY = cy + Math.sin(spawnAngle) * spawnDist;
      const spawnZ = (Math.random() - 0.5) * 150;

      // Explosion velocity — outward from plus position
      const dx = plusX - cx;
      const dy = plusY - cy;
      const explodeAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.6;
      const explodeSpeed = 150 + Math.random() * 300;

      const baseAlpha = 0.4 + Math.random() * 0.5;

      particles.push({
        spawnX, spawnY, spawnZ,
        starX, starY, starZ: pz,
        plusX, plusY, plusZ: pz,
        x: spawnX, y: spawnY, z: spawnZ,
        evx: Math.cos(explodeAngle) * explodeSpeed,
        evy: Math.sin(explodeAngle) * explodeSpeed,
        evz: (Math.random() - 0.5) * 100,
        size: 1 + Math.random() * 1.8,
        alpha: 0,
        baseAlpha,
        delay: Math.random() * 0.4,
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

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
    };
    const onEnter = () => { mouseRef.current.inside = true; };
    const onLeave = () => { mouseRef.current.inside = false; };
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseenter', onEnter);
    canvas.addEventListener('mouseleave', onLeave);

    let lastT = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      if (!dW || !dH) { animRef.current = requestAnimationFrame(animate); return; }

      timeRef.current += dt;
      phaseTimeRef.current += dt;

      const pt = phaseTimeRef.current;

      // Phase transitions
      if (phaseRef.current === 'GATHER' && pt >= GATHER_DURATION) {
        phaseRef.current = 'MORPH'; phaseTimeRef.current = 0;
      } else if (phaseRef.current === 'MORPH' && pt >= MORPH_DURATION) {
        phaseRef.current = 'HOLD'; phaseTimeRef.current = 0;
      } else if (phaseRef.current === 'HOLD' && pt >= HOLD_DURATION) {
        phaseRef.current = 'EXPLODE'; phaseTimeRef.current = 0;
        // Fire callback immediately when explosion starts
        if (!calledCompleteRef.current) {
          calledCompleteRef.current = true;
          onIntroComplete?.();
        }
      } else if (phaseRef.current === 'EXPLODE' && pt >= EXPLODE_DURATION) {
        phaseRef.current = 'DRIFT'; phaseTimeRef.current = 0;
      }

      ctx.clearRect(0, 0, dW, dH);

      const particles = particlesRef.current;
      const phase = phaseRef.current;
      const cpt = phaseTimeRef.current;
      const t = timeRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const isHovered = mouseRef.current.inside;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (phase === 'GATHER') {
          // Fly in → star shape
          const prog = Math.max(0, Math.min(1, (cpt - p.delay) / (GATHER_DURATION - p.delay)));
          const ease = 1 - Math.pow(1 - prog, 3);
          p.x = p.spawnX + (p.starX - p.spawnX) * ease;
          p.y = p.spawnY + (p.starY - p.spawnY) * ease;
          p.z = p.spawnZ + (p.starZ - p.spawnZ) * ease;
          p.alpha = p.baseAlpha * ease;

        } else if (phase === 'MORPH') {
          // Star → Plus morph
          const prog = cpt / MORPH_DURATION;
          const ease = prog < 0.5
            ? 4 * prog * prog * prog  // easeInCubic first half
            : 1 - Math.pow(-2 * prog + 2, 3) / 2; // easeOutCubic second half
          p.x = p.starX + (p.plusX - p.starX) * ease;
          p.y = p.starY + (p.plusY - p.starY) * ease;
          p.z = p.starZ + (p.plusZ - p.starZ) * ease;
          p.alpha = p.baseAlpha;

        } else if (phase === 'HOLD') {
          // Tight float at plus
          const fx = Math.sin(t * 1.5 + i * 0.3) * 1.5;
          const fy = Math.cos(t * 1.2 + i * 0.5) * 1.5;
          p.x += (p.plusX + fx - p.x) * 0.15;
          p.y += (p.plusY + fy - p.y) * 0.15;
          p.z += (p.plusZ - p.z) * 0.15;
          p.alpha += (p.baseAlpha - p.alpha) * 0.15;

        } else if (phase === 'EXPLODE') {
          const prog = cpt / EXPLODE_DURATION;
          const ease = 1 - Math.pow(1 - prog, 2);
          p.x = p.plusX + p.evx * ease;
          p.y = p.plusY + p.evy * ease;
          p.z = p.plusZ + p.evz * ease;
          // Keep some particles visible (don't fully fade)
          p.alpha = p.baseAlpha * Math.max(0.08, 1 - prog * 1.2);

        } else {
          // DRIFT — ambient floating particles
          const fx = Math.sin(t * 0.3 + i * 0.15) * 4;
          const fy = Math.cos(t * 0.25 + i * 0.3) * 4;
          const driftX = p.plusX + p.evx * 0.7 + fx;
          const driftY = p.plusY + p.evy * 0.7 + fy;
          const driftZ = p.plusZ + p.evz * 0.5;

          p.x += (driftX - p.x) * 0.015;
          p.y += (driftY - p.y) * 0.015;
          p.z += (driftZ - p.z) * 0.015;

          // Subtle ambient glow
          const targetA = p.baseAlpha * 0.1;
          p.alpha += (targetA - p.alpha) * 0.02;

          // Mouse push
          if (isHovered) {
            const ddx = p.x - mx;
            const ddy = p.y - my;
            const dist = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dist < 100) {
              const force = (1 - dist / 100) * 30;
              const a = Math.atan2(ddy, ddx);
              p.x += Math.cos(a) * force * dt * 3;
              p.y += Math.sin(a) * force * dt * 3;
              p.alpha = Math.min(p.baseAlpha * 0.25, p.alpha + 0.015);
            }
          }
        }

        // 3D projection
        const scale = FOCAL_LENGTH / (FOCAL_LENGTH + p.z);
        const sx = dW / 2 + (p.x - dW / 2) * scale;
        const sy = dH / 2 + (p.y - dH / 2) * scale;
        const ss = p.size * scale;

        if (p.alpha < 0.008) continue;

        // Particle
        ctx.beginPath();
        ctx.arc(sx, sy, ss, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(10,132,255,${p.alpha})`;
        ctx.fill();

        // Glow
        if (ss > 1.5 && p.alpha > 0.04) {
          ctx.beginPath();
          ctx.arc(sx, sy, ss * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(10,132,255,${p.alpha * 0.08})`;
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
      canvas.removeEventListener('mouseenter', onEnter);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [initParticles, onIntroComplete]);

  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
    </div>
  );
}
