function mulberry32(seed){
    return function(){
        seed |= 0 ; seed = seed + 0x6D2B79F5 | 0 ;
        let t = Math.imul(seed^seed >>> 15, 1 | seed);
        t = t + Math.imul(t^t >>> 7, 61 | t ) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function genSpine(rng, segments = 8) {
  const points = [];
  let x = 300, y = 100 + rng() * 20;
  let angle = Math.PI / 2;
  for (let i = 0; i < segments; i++) {
    points.push({ x, y });
    angle += (rng() - 0.5) * 0.6;
    x += Math.cos(angle) * 30;
    y += Math.sin(angle) * 30;
  }
  return points;
}

function radiusAt(i, total, rng, maxR) {
  const t = i / (total - 1);
  const bell = Math.sin(t * Math.PI); // 0 at ends, 1 in middle
  return 8 + bell * maxR * (0.6 + rng() * 0.4);
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function fieldAt(px, py, circles) {
  let d = Infinity;
  for (const c of circles) {
    const dist = Math.hypot(px - c.x, py - c.y) - c.r;
    d = smin(d, dist, 20); // blend softness
  }
  return d;
}