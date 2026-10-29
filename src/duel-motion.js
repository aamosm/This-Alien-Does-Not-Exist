import { render } from "./render.js";
import { renderLegacy } from "../legacy/render.js";
import { renderPi, pathSDF } from "./pi-render.js";
import { viewTransform } from "./view.js";
import { TERRAINS, ACTIONS } from "./combat-rules.js";
const SIZE = 320,
  GRID = 12;
export function motionRig(record, size = SIZE) {
  if (record.generatorVersion === 1) return [];
  if (record.kind === "pi-path") {
    const scale = size / 2.65,
      point = (x, y) => ({ x: size / 2 + x * scale, y: size / 2 + y * scale });
    return [
      [-0.19, -0.43, -0.43, 0.31],
      [0.19, -0.43, 0.43, 0.31],
      [-0.115, 0.21, -0.17, 1.1],
      [0.115, 0.21, 0.17, 1.1],
      [0, -0.56, 0, -0.86],
    ].map((a, i) => ({
      root: point(a[0], a[1]),
      tip: point(a[2], a[3]),
      strength: (1 - record.pi.t) ** 3,
      head: i === 4,
    }));
  }
  const framed = { ...record, framing: { scale: 0.68, x: 0, y: 0 } },
    v = viewTransform(framed, size, size),
    point = (p) => ({ x: p.x * v.scale + v.ox, y: p.y * v.scale + v.oy });
  return record.geometry.parts
    .filter(
      (p) =>
        ["leg", "arm", "tentacle", "wing", "tail", "neck"].includes(p.role) &&
        p.points?.length >= 2,
    )
    .slice(0, 12)
    .map((p) => ({
      root: point(p.points[0]),
      tip: point(p.points.at(-1)),
      strength: 1,
      head: p.role === "neck",
    }));
}
export function deformVertex(point, rig, phase, amount = 1, size = SIZE) {
  let dx = 0,
    dy = 0;
  for (const [i, bone] of rig.entries()) {
    const x = point.x - bone.root.x,
      y = point.y - bone.root.y;
    const bx = bone.tip.x - bone.root.x,
      by = bone.tip.y - bone.root.y,
      len2 = bx * bx + by * by || 1;
    const along = Math.max(0, Math.min(1, (x * bx + y * by) / len2));
    const distance = Math.hypot(point.x - bone.tip.x, point.y - bone.tip.y);
    const influence =
      Math.exp((-distance * distance) / (len2 * 0.8 + 100)) * along * along;
    const angle =
      Math.sin(phase + i * 1.9) *
      0.075 *
      amount *
      bone.strength *
      (bone.head ? 0.6 : 1);
    dx += -y * angle * influence;
    dy += x * angle * influence;
  }
  const cap = size * 0.035,
    length = Math.hypot(dx, dy),
    factor = length > cap ? cap / length : 1;
  return { x: point.x + dx * factor, y: point.y + dy * factor };
}
function triangle(ctx, image, source, target) {
  const [a, b, c] = source,
    [d, e, f] = target,
    det = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  const xx = ((e.x - d.x) * (c.y - a.y) - (f.x - d.x) * (b.y - a.y)) / det;
  const xy = ((f.x - d.x) * (b.x - a.x) - (e.x - d.x) * (c.x - a.x)) / det;
  const yx = ((e.y - d.y) * (c.y - a.y) - (f.y - d.y) * (b.y - a.y)) / det;
  const yy = ((f.y - d.y) * (b.x - a.x) - (e.y - d.y) * (c.x - a.x)) / det;
  ctx.save();
  ctx.beginPath();
  const center = { x: (d.x + e.x + f.x) / 3, y: (d.y + e.y + f.y) / 3 };

  target.forEach((p, i) => {
    const x = p.x + (p.x - center.x) * 0.06,
      y = p.y + (p.y - center.y) * 0.06;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.transform(
    xx,
    yx,
    xy,
    yy,
    d.x - xx * a.x - xy * a.y,
    d.y - yx * a.x - yy * a.y,
  );
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}
function drawMesh(ctx, image, rig, phase, amount) {
  if (!amount) {
    ctx.drawImage(image, 0, 0);
    return;
  }
  const points = [],
    warped = [];
  for (let y = 0; y <= GRID; y++)
    for (let x = 0; x <= GRID; x++) {
      const p = { x: (x * SIZE) / GRID, y: (y * SIZE) / GRID };
      points.push(p);
      warped.push(deformVertex(p, rig, phase, amount));
    }
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const a = y * (GRID + 1) + x,
        b = a + 1,
        c = a + GRID + 1,
        d = c + 1;
      for (const ids of [
        [a, b, d],
        [a, d, c],
      ])
        triangle(
          ctx,
          image,
          ids.map((i) => points[i]),
          ids.map((i) => warped[i]),
        );
    }
}
export async function createArena(
  canvas,
  records,
  environment,
  { isCancelled = () => false } = {},
) {
  const textures = [],
    rigs = records.map((r) => motionRig(r));
  for (const r of records) {
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const ctx = c.getContext("2d");
    if (r.generatorVersion === 1) {
      await renderLegacy(ctx, r.identity.seed, SIZE, SIZE, { isCancelled });
    } else if (r.kind === "pi-path") {
      await renderPi(ctx, r, SIZE, SIZE, { quick: true });
      const pixels = ctx.getImageData(0, 0, SIZE, SIZE);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++)
          if (
            pathSDF(
              (x + 0.5 - SIZE / 2) / (SIZE / 2.65),
              (y + 0.5 - SIZE / 2) / (SIZE / 2.65),
              r.pi.t,
            ) > 0
          )
            pixels.data[(y * SIZE + x) * 4 + 3] = 0;
      ctx.putImageData(pixels, 0, 0);
    } else
      render(ctx, { ...r, framing: { scale: 0.68, x: 0, y: 0 } }, SIZE, SIZE, {
        background: false,
      });
    textures.push(c);
  }
  const ctx = canvas.getContext("2d");
  canvas.width = 1000;
  canvas.height = 430;
  let cancelled = false;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function draw(event = null, t = 0) {
    if (cancelled || isCancelled()) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#111719";
    ctx.fillRect(0, 0, 1000, 430);
    const ground = ctx.createLinearGradient(0, 280, 0, 430);
    ground.addColorStop(0, "#111719");
    ground.addColorStop(1, TERRAINS[environment.terrain].color);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 270, 1000, 160);
    ctx.strokeStyle = "#ffffff0b";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      const y = 330 + i * 8;
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(450, y - 12 * Math.sin(i), 1000, y);
      ctx.stroke();
    }
    const pulse = Math.sin(Math.PI * t),
      attack =
        event &&
        ["strike", "lunge", "feint", "sweep", "drain"].includes(event.action),
      sender = event?.actor;
    for (let i = 0; i < 2; i++) {
      const active = i === sender,
        dir = i === 0 ? 1 : -1,
        shift = event
          ? active && attack
            ? dir * pulse * 90
            : !active && event.damage
              ? -dir * pulse * 9
              : 0
          : 0;
      const lift = active && attack ? pulse * 20 : 0;
      ctx.save();
      ctx.translate(i === 0 ? 240 : 760, 352);
      ctx.scale(1, 0.15);
      ctx.fillStyle = "#0006";
      ctx.beginPath();
      ctx.arc(0, 0, 95, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate((i === 0 ? 240 : 760) + shift, 220 - lift);
      ctx.scale(dir, 1);
      ctx.rotate(active && attack ? pulse * 0.035 : 0);
      ctx.translate(-SIZE / 2, -SIZE / 2);
      const amount =
        event &&
        active &&
        event.action !== "upkeep" &&
        !records[i].combat.absolute
          ? event.action === "sleep"
            ? 0.2
            : 1
          : 0;
      drawMesh(ctx, textures[i], rigs[i], t * Math.PI * 2, amount);
      ctx.restore();
    }
    if (event && ["pulse", "venom", "lull"].includes(event.action)) {
      const x = sender === 0 ? 320 + 360 * t : 680 - 360 * t;
      ctx.fillStyle = event.action === "venom" ? "#bddb91" : "#b4d8df";
      ctx.globalAlpha = pulse;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(
          x + i * 6,
          210 + Math.sin(t * 12 + i) * 14,
          2 + (i % 3),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (event && event.action !== "upkeep") {
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "#d7e3d8";
      ctx.fillText(ACTIONS[event.action].name, sender === 0 ? 240 : 760, 76);
    }
    if (event?.damage && t > 0.4) {
      ctx.font = "600 20px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "#f1ccb8";
      ctx.fillText("−" + event.damage, sender === 0 ? 760 : 240, 105 - 20 * t);
    }
  }
  draw();
  return {
    draw,
    cancel() {
      cancelled = true;
    },
    async play(event) {
      if (cancelled || event.action === "upkeep" || reduced()) {
        draw();
        return;
      }
      const start = performance.now();
      await new Promise((resolve) => {
        function frame(now) {
          if (cancelled) {
            resolve();
            return;
          }
          const t = Math.min(1, (now - start) / 480);
          draw(event, t);
          if (t < 1) requestAnimationFrame(frame);
          else {
            draw();
            resolve();
          }
        }
        requestAnimationFrame(frame);
      });
    },
  };
}