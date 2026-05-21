import { useEffect, useRef } from "react";

const N = 35, SPD = 0.2;
const rnd = (n) => Math.random() * n;
const mk  = (w, h) => ({ x: rnd(w), y: rnd(h), r: rnd(1.5)+0.5, vx: (rnd(1)-0.5)*SPD, vy: (rnd(1)-0.5)*SPD, a: rnd(0.3)+0.05 });

export default function ParticleCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    let w = c.width = innerWidth, h = c.height = innerHeight;
    let ps = Array.from({ length: N }, () => mk(w, h)), raf;

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(80,140,220,${p.a})`; ctx.fill();
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      raf = requestAnimationFrame(draw);
    }
    draw();

    const onResize = () => {
      w = c.width = innerWidth; h = c.height = innerHeight;
      ps = Array.from({ length: N }, () => mk(w, h));
    };
    addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} className="particle-canvas" aria-hidden />;
}
