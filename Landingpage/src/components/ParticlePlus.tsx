import { useRef, useEffect, useCallback } from 'react';

interface Particle {
  // Home position (forms the "+")
  hx: number; hy: number; hz: number;
  // Current position
  x: number; y: number; z: number;
  // Velocity (for explosion)
  vx: number; vy: number; vz: number;
  // Scattered target
  sx: number; sy: number; sz: number;
  // Visual
  size: number;
  alpha: number;
  baseAlpha: number;
}

export function ParticlePlus({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, inside: false });
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  const PARTICLE_COUNT = 280;
  const PLUS_SIZE = 120; // half-extent of the "+" arms
  const ARM_WIDTH = 32;  // thickness of each arm
  const SCATTER_RADIUS = 300;
  const FOCAL_LENGTH = 600;

  const initParticles = useCallback((w: number, h: number) => {
    const particles: Particle[] = [];
    const cx = w / 2;
    const cy = h / 2;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Generate point on a "+" shape
      let px: number, py: number;
      if (Math.random() < 0.5) {
        // Vertical arm
        px = (Math.random() - 0.5) * ARM_WIDTH;
        py = (Math.random() - 0.5) * PLUS_SIZE * 2;
      } else {
        // Horizontal arm
        px = (Math.random() - 0.5) * PLUS_SIZE * 2;
        py = (Math.random() - 0.5) * ARM_WIDTH;
      }

      const pz = (Math.random() - 0.5) * 40; // slight depth

      // Scattered position — random sphere
      const angle = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = SCATTER_RADIUS * (0.4 + Math.random() * 0.6);
      const sx = Math.sin(phi) * Math.cos(angle) * r;
      const sy = Math.sin(phi) * Math.sin(angle) * r;
      const sz = Math.cos(phi) * r * 0.5;

      const baseAlpha = 0.3 + Math.random() * 0.5;

      particles.push({
        hx: cx + px, hy: cy + py, hz: pz,
        x: cx + px, y: cy + py, z: pz,
        vx: 0, vy: 0, vz: 0,
        sx: cx + sx, sy: cy + sy, sz,
        size: 1.2 + Math.random() * 1.8,
        alpha: baseAlpha,
        baseAlpha,
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
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

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }

      const w = rect.width;
      const h = rect.height;
      timeRef.current += 0.01;

      ctx.clearRect(0, 0, w, h);

      const particles = particlesRef.current;
      const isHovered = mouseRef.current.inside;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Float animation when in "+" shape
        const floatX = Math.sin(timeRef.current * 0.8 + i * 0.3) * 1.5;
        const floatY = Math.cos(timeRef.current * 0.6 + i * 0.5) * 1.5;

        let targetX: number, targetY: number, targetZ: number;

        if (isHovered) {
          // Mouse proximity push
          const dx = p.x - mx;
          const dy = p.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const pushRadius = 150;

          if (dist < pushRadius) {
            const force = (1 - dist / pushRadius) * 80;
            const angle = Math.atan2(dy, dx);
            targetX = p.hx + Math.cos(angle) * force + floatX;
            targetY = p.hy + Math.sin(angle) * force + floatY;
            targetZ = p.hz + (1 - dist / pushRadius) * 60;
          } else {
            targetX = p.hx + floatX;
            targetY = p.hy + floatY;
            targetZ = p.hz;
          }
        } else {
          targetX = p.hx + floatX;
          targetY = p.hy + floatY;
          targetZ = p.hz;
        }

        // Smooth interpolation
        const lerp = 0.08;
        p.x += (targetX - p.x) * lerp;
        p.y += (targetY - p.y) * lerp;
        p.z += (targetZ - p.z) * lerp;

        // 3D perspective projection
        const scale = FOCAL_LENGTH / (FOCAL_LENGTH + p.z);
        const screenX = w / 2 + (p.x - w / 2) * scale;
        const screenY = h / 2 + (p.y - h / 2) * scale;
        const screenSize = p.size * scale;

        // Depth-based alpha
        const depthAlpha = Math.max(0.15, Math.min(1, scale));
        p.alpha += (p.baseAlpha * depthAlpha - p.alpha) * 0.1;

        // Draw particle
        ctx.beginPath();
        ctx.arc(screenX, screenY, screenSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(10, 132, 255, ${p.alpha})`;
        ctx.fill();

        // Subtle glow for larger particles
        if (p.size > 2) {
          ctx.beginPath();
          ctx.arc(screenX, screenY, screenSize * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(10, 132, 255, ${p.alpha * 0.12})`;
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
  }, [initParticles]);

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
