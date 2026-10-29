import { render } from "./render.js";
import { renderLegacy } from "../legacy/render.js";
import { renderPi, pathSDF } from "./pi-render.js";
import { viewTransform } from "./view.js";
import { ACTIONS } from "./combat-rules.js";
import { hashKey } from "./random.js";
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
export function motionPose(action, t, variant = 0) {
  t = Math.max(0, Math.min(1, t));
  const wave = Math.sin(Math.PI * t);
  const smooth = (a, b) => {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  const hit = smooth(0.12, 0.48) * (1 - smooth(0.62, 1));
  const windup = Math.sin(Math.PI * Math.min(1, t / 0.22)) * (t < 0.22 ? 1 : 0);
  const v = variant % 3;
  const pose = {
    x: 0,
    y: 0,
    angle: 0,
    sx: 1,
    sy: 1,
    limbs: wave,
    phase: t * Math.PI * (4 + v) + v,
  };
  switch (action) {
    case "strike":
      pose.x = hit * (166 + v * 12) - windup * 10;
      pose.y = -wave * (v === 1 ? 44 : 22);
      pose.angle = wave * (v === 2 ? -0.08 : 0.09);
      break;
    case "lunge":
      pose.x = hit * 225 - windup * 20;
      pose.y = -wave * (32 + v * 7);
      pose.angle = hit * 0.14;
      pose.sx = 1 + hit * 0.07;
      pose.sy = 1 - hit * 0.05;
      break;
    case "feint":
      pose.x = wave * (65 + Math.sin(t * Math.PI * 3) * 65);
      pose.y = -wave * 12;
      pose.angle = Math.sin(t * Math.PI * 3) * wave * 0.11;
      break;
    case "sweep":
      pose.x = hit * 150;
      pose.y = wave * 8;
      pose.angle = wave * (v === 1 ? -0.16 : 0.16);
      pose.sx = 1 + wave * 0.06;
      pose.sy = 1 - wave * 0.06;
      break;
    case "drain":
      pose.x = hit * 145;
      pose.y = -wave * 12;
      pose.angle = wave * 0.06;
      break;
    case "guard":
      pose.x = -wave * 12;
      pose.y = wave * 12;
      pose.sx = 1 + wave * 0.06;
      pose.sy = 1 - wave * 0.08;
      pose.limbs = wave * 0.4;
      break;
    case "focus":
      pose.y = -wave * 8;
      pose.sy = 1 + wave * 0.035;
      pose.limbs = wave * 0.35;
      break;
    case "rest":
    case "sleep":
      pose.y = wave * 14;
      pose.angle = -wave * 0.08;
      pose.sy = 1 - wave * 0.06;
      pose.limbs = wave * 0.25;
      break;
    case "recover":
      pose.sy = 1 + wave * 0.05;
      pose.sx = 1 - wave * 0.025;
      pose.y = -wave * 4;
      pose.limbs = wave * 0.4;
      break;
    case "cleanse":
      pose.angle = Math.sin(t * Math.PI * 7) * wave * 0.045;
      pose.limbs = wave;
      break;
    case "pulse":
      pose.x = -windup * 12 + hit * 18;
      pose.angle = -windup * 0.07 + hit * 0.04;
      break;
    case "venom":
      pose.x = hit * 25;
      pose.angle = wave * 0.1;
      break;
    case "lull":
      pose.y = -wave * 5;
      pose.angle = Math.sin(t * Math.PI * 4) * wave * 0.035;
      break;
    default:
      pose.limbs = 0;
  }
  return pose;
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
  canvas.height = 480;
  let cancelled = false;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const variants = records.map((r) => Number(hashKey(r.identity.seed) % 3n));
  let lastView = null;
  function draw(event = null, t = 0) {
    if (cancelled || isCancelled()) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#161616";
    ctx.fillRect(0, 0, 1000, 480);
    ctx.strokeStyle = "#ffffff0d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(48, 406);
    ctx.lineTo(952, 406);
    ctx.stroke();
    ctx.fillStyle = "#777";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("YOU", 250, 453);
    ctx.fillText("COMPUTER", 750, 453);
    const pulse = Math.sin(Math.PI * t),
      sender = event?.actor;
    const impact = t > 0.42 ? Math.sin((Math.PI * (t - 0.42)) / 0.58) : 0;
    for (let i = 0; i < 2; i++) {
      const active = i === sender,
        dir = i === 0 ? 1 : -1;
      const pose =
        event && active && !records[i].combat.absolute
          ? motionPose(event.action, t, variants[i])
          : { x: 0, y: 0, angle: 0, sx: 1, sy: 1, limbs: 0, phase: 0 };
      if (event && !active && !records[i].combat.absolute) {
        if (event.damage) {
          pose.x -= impact * 18;
          pose.angle -= impact * 0.09;
          pose.limbs = impact * 0.85;
          pose.phase = t * 18;
        } else if (event.hit === false) {
          pose.x -= impact * 22;
          pose.y += impact * 12;
          pose.angle -= impact * 0.08;
        }
      }
      if (!event && lastView?.[i]?.sleep && !records[i].combat.absolute) {
        pose.angle = -0.055;
        pose.y = 8;
        pose.sy = 0.97;
      }
      const x = (i === 0 ? 250 : 750) + dir * pose.x;
      ctx.save();
      ctx.translate(x, 405);
      ctx.scale(Math.max(0.65, 1 + pose.y / 160), 0.12);
      ctx.fillStyle = "#0005";
      ctx.beginPath();
      ctx.arc(0, 0, 88, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(x, 260 + pose.y);
      ctx.scale(dir * pose.sx, pose.sy);
      ctx.rotate(pose.angle);
      ctx.translate(-SIZE / 2, -SIZE / 2);
      drawMesh(ctx, textures[i], rigs[i], pose.phase, pose.limbs);
      ctx.restore();
    }
    if (event) {
      const origin = sender === 0 ? 250 : 750,
        dir = sender === 0 ? 1 : -1;
      ctx.save();
      ctx.globalAlpha = pulse * 0.75;
      ctx.strokeStyle = "#b7b7b7";
      ctx.fillStyle = "#c4c4c4";
      ctx.lineWidth = 2;
      if (["pulse", "venom", "lull"].includes(event.action)) {
        const travel = Math.max(0, Math.min(1, (t - 0.12) / 0.7));
        const x = origin + dir * (100 + 300 * travel);
        if (event.action === "pulse") {
          for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            ctx.arc(
              x - dir * j * 14,
              244,
              9 + j * 7,
              -Math.PI / 2,
              Math.PI / 2,
              dir < 0,
            );
            ctx.stroke();
          }
        } else if (event.action === "venom") {
          ctx.fillStyle = "#bbb497";
          for (let j = 0; j < 9; j++) {
            ctx.beginPath();
            ctx.arc(
              x + Math.sin(j * 3.2) * 23,
              240 + Math.cos(j * 2.7) * (9 + 24 * travel),
              2 + (j % 3),
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        } else {
          for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            ctx.ellipse(
              x - dir * j * 30,
              240,
              7 + j * 2,
              16 + j * 5,
              0,
              0,
              Math.PI * 2,
            );
            ctx.stroke();
          }
        }
      }
      if (event.action === "guard") {
        ctx.beginPath();
        ctx.ellipse(
          origin + dir * 80,
          260,
          26,
          95,
          0,
          dir > 0 ? -1.5 : 1.65,
          dir > 0 ? 1.5 : 4.65,
        );
        ctx.stroke();
      }
      if (event.action === "focus") {
        for (let j = 0; j < 4; j++) {
          const angle = (j * Math.PI) / 2 + t * 0.5;
          ctx.beginPath();
          ctx.arc(origin, 245, 104 - pulse * 15, angle, angle + 0.3);
          ctx.stroke();
        }
      }
      if (["rest", "sleep"].includes(event.action)) {
        ctx.font = "18px monospace";
        ctx.textAlign = "center";
        ctx.fillText("z", origin + 55 + t * 15, 150 - t * 28);
        ctx.font = "13px monospace";
        ctx.fillText("z", origin + 77 + t * 15, 128 - t * 28);
      }
      if (["recover", "cleanse", "drain"].includes(event.action)) {
        for (let j = 0; j < 5; j++) {
          const angle = j * Math.PI * 0.4;
          const radius =
            event.action === "cleanse" ? 75 + t * 65 : 120 - t * 55;
          ctx.beginPath();
          ctx.arc(
            origin + Math.cos(angle) * radius,
            245 + Math.sin(angle) * radius,
            2.5,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      ctx.restore();
      if (event.action !== "upkeep") {
        ctx.font = "15px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#bbb";
        ctx.fillText(ACTIONS[event.action].name, origin, 54);
      }
      if (t > 0.42 && (event.damage || event.hit === false)) {
        ctx.font = "20px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ddd";
        ctx.fillText(
          event.hit === false ? "miss" : "−" + event.damage,
          sender === 0 ? 750 : 250,
          105 - impact * 18,
        );
      }
      if (event.healing && t > 0.4) {
        ctx.font = "18px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#bbb";
        ctx.fillText("+" + event.healing, origin, 110 - impact * 18);
      }
    }
  }
  draw();
  return {
    draw,
    cancel() {
      cancelled = true;
    },
    async play(event) {
      lastView = event.snapshot ?? lastView;
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
          const duration =
            {
              lunge: 620,
              feint: 640,
              rest: 650,
              sleep: 450,
              focus: 580,
              lull: 650,
            }[event.action] ?? 540;
          const t = Math.min(1, (now - start) / duration);
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
