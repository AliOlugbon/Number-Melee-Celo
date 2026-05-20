// src/components/ParticleCanvas.jsx
// Decorative animated particle background. Self-contained — no store deps.

import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 40;
const SPEED          = 0.25;

function randomParticle(w, h) {
  return {
    x:  Math.random() * w,
    y:  Math.random() * h,
    r:  Math.random() * 2 + 1,
    vx: (Math.random() - 0.5) * SPEED,
    vy: (Math.random() - 0.5) * SPEED,
    a:  Math.random() * 0.4 + 0.1,
  };
}

export default function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width  = w;
    canvas.height = h;

    let particles = Array.from({ length: PARTICLE_COUNT }, () => randomParticle(w, h));
    let rafId;

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(120, 200, 255, ${p.a})`;
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      rafId = requestAnimationFrame(draw);
    }

    draw();

    function onResize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width  = w;
      canvas.height = h;
      particles = Array.from({ length: PARTICLE_COUNT }, () => randomParticle(w, h));
    }

    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" aria-hidden />;
}
