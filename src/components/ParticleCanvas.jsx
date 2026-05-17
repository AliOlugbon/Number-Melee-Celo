import { useEffect, useRef } from "react";

let particles = [];

export function burst(n = 80, color = "#00ef82") {
  for (let i = 0; i < n; i++)
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 1.4) * 4,
      r:  2 + Math.random() * 3,
      life: 1,
      dec:  0.007 + Math.random() * 0.01,
      color,
    });
}

export default function ParticleCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const cvs = ref.current;
    const ctx = cvs.getContext("2d");

    const resize = () => { cvs.width = innerWidth; cvs.height = innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle   = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        p.x += p.vx; p.y += p.vy; p.life -= p.dec;
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} style={{ position:"fixed",inset:0,zIndex:0,pointerEvents:"none" }} />;
}
