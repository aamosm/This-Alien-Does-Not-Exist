function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function genSpine(rng, segments = 8) {
    const points = [];

    let x = 300;
    let y = 100 + rng() * 20;
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
    const bell = Math.sin(t * Math.PI);

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
        d = smin(d, dist, 25);
    }

    return d;
}

function genLimb(rng, x, y, angle) {
    const limb = [];

    let cx = x;
    let cy = y;
    let a = angle + (rng() - 0.5) * 0.5;

    const segments = 3 + Math.floor(rng() * 2);

    for (let i = 0; i < segments; i++) {
        limb.push({
            x: cx,
            y: cy,
            r: 6 + rng() * 6 * (1 - i / segments)
        });

        a += (rng() - 0.5) * 0.4;

        cx += Math.cos(a) * 22;
        cy += Math.sin(a) * 22;
    }

    return limb;
}

const rng = mulberry32(Math.floor(Math.random() * 4294967296));

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const spine = genSpine(rng);

const circles = [];

for (let i = 0; i < spine.length; i++) {
    circles.push({
        x: spine[i].x,
        y: spine[i].y,
        r: radiusAt(i, spine.length, rng, 40)
    });
}

const limbCount = 2 + Math.floor(rng() * 3);

for (let i = 0; i < limbCount; i++) {
    const attach = 2 + Math.floor(rng() * (spine.length - 4));
    const side = rng() < 0.5 ? -1 : 1;
    const angle = side * Math.PI / 2 + (rng() - 0.5) * 0.6;

    const limb = genLimb(
        rng,
        spine[attach].x,
        spine[attach].y,
        angle
    );

    for (const part of limb) {
        circles.push(part);
    }
}

ctx.fillStyle = "black";

for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
        if (fieldAt(x, y, circles) < 0) {
            ctx.fillRect(x, y, 1, 1);
        }
    }
}

ctx.strokeStyle = "red";
ctx.lineWidth = 2;

ctx.beginPath();
ctx.moveTo(spine[0].x, spine[0].y);

for (let i = 1; i < spine.length; i++) {
    ctx.lineTo(spine[i].x, spine[i].y);
}

ctx.stroke();

ctx.fillStyle = "blue";

for (const p of spine) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
}