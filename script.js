function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

const ARCHETYPES = [
    {
        name: "Cursorial", tagline: "Agile Runner",
        spineStepMult: 1.3, spineThickMult: 0.8,
        limbStepMult: 1.7, limbThickMult: 0.7,
        limbCountRange: [4, 6], hueRange: [25, 55],
        dietPool: ["Carnivore", "Omnivore"],
        habitat: "Open Plains",
        temperamentPool: ["Skittish", "Territorial", "Pack-hunting"]
    },
    {
        name: "Graviportal", tagline: "Heavy Bruiser",
        spineStepMult: 1.0, spineThickMult: 1.6,
        limbStepMult: 0.85, limbThickMult: 2.0,
        limbCountRange: [4, 4], hueRange: [15, 35],
        dietPool: ["Herbivore", "Omnivore"],
        habitat: "Highland Terrain",
        temperamentPool: ["Docile", "Territorial", "Slow to anger"]
    },
    {
        name: "Scansorial", tagline: "Climber",
        spineStepMult: 1.1, spineThickMult: 1.0,
        limbStepMult: 1.3, limbThickMult: 1.0,
        limbCountRange: [4, 8], hueRange: [90, 150],
        dietPool: ["Omnivore", "Frugivore"],
        habitat: "Canopy / Cliffside",
        temperamentPool: ["Curious", "Cautious", "Social"]
    },
    {
        name: "Aquatic", tagline: "Swimmer",
        spineStepMult: 1.8, spineThickMult: 1.3,
        limbStepMult: 0.5, limbThickMult: 0.8,
        limbCountRange: [0, 2], hueRange: [190, 230],
        dietPool: ["Filter-feeder", "Carnivore"],
        habitat: "Subsurface Ocean",
        temperamentPool: ["Solitary", "Migratory", "Docile"]
    }
];

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// ---- Geometry generators, now archetype-aware ----
function genSpine(rng, segments, stepMult) {
    const points = [];
    let x = 400, y = 150 + rng() * 40;
    let angle = Math.PI / 2;
    const step = 35 * stepMult;
    for (let i = 0; i < segments; i++) {
        points.push({ x, y });
        angle += (rng() - 0.5) * 1.1;
        x += Math.cos(angle) * step;
        y += Math.sin(angle) * step;
    }
    return points;
}

function radiusAt(i, total, rng, maxR, thickMult) {
    const t = i / (total - 1);
    const bell = Math.sin(t * Math.PI);
    const noise = (rng() - 0.5) * 6;
    return (10 + bell * maxR + noise) * thickMult;
}

function genLimb(rng, originX, originY, baseAngle, stepMult, thickMult) {
    const limb = [];
    let x = originX, y = originY;
    let angle = baseAngle + (rng() - 0.5) * 0.5;
    const segments = 3 + Math.floor(rng() * 2);
    const step = 26 * stepMult;
    for (let i = 0; i < segments; i++) {
        limb.push({ x, y, r: (8 + rng() * 8 * (1 - i / segments)) * thickMult });
        angle += (rng() - 0.5) * 0.4;
        x += Math.cos(angle) * step;
        y += Math.sin(angle) * step;
    }
    return limb;
}

function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
}
function fieldAt(px, py, circles) {
    let d = Infinity;
    for (const c of circles) {
        const dist = Math.hypot(px - c.x, py - c.y) - c.r;
        d = smin(d, dist, 45);
    }
    return d;
}

function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [255 * f(0), 255 * f(8), 255 * f(4)];
}

function classifySize(area) {
    if (area < 15000) return "Small";
    if (area < 35000) return "Medium";
    if (area < 60000) return "Large";
    return "Massive";
}

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

function generateNew() {
    renderCreature(Math.floor(Math.random() * 4294967296));
}

function renderCreature(seedValue) {
    const startTime = performance.now();
    const rng = mulberry32(seedValue);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const archetype = pick(rng, ARCHETYPES);

    const spineSegments = 5 + Math.floor(rng() * 8);
    const spine = genSpine(rng, spineSegments, archetype.spineStepMult);
    const circles = [];

    for (let i = 0; i < spine.length; i++) {
        circles.push({
            x: spine[i].x, y: spine[i].y,
            r: radiusAt(i, spine.length, rng, 45, archetype.spineThickMult)
        });
    }

    const [minLimbs, maxLimbs] = archetype.limbCountRange;
    const numLimbs = minLimbs + Math.floor(rng() * (maxLimbs - minLimbs + 1));

    for (let i = 0; i < numLimbs; i++) {
        const attachIdx = 2 + Math.floor(rng() * Math.max(1, spine.length - 4));
        const side = rng() < 0.5 ? -1 : 1;
        const baseAngle = side * (Math.PI / 2) + (rng() - 0.5) * 0.6;
        circles.push(...genLimb(rng, spine[attachIdx].x, spine[attachIdx].y, baseAngle,
            archetype.limbStepMult, archetype.limbThickMult));
    }

    const [hueMin, hueMax] = archetype.hueRange;
    const hue = hueMin + rng() * (hueMax - hueMin);
    const [baseR, baseG, baseB] = hslToRgb(hue, 45 + rng() * 25, 45 + rng() * 15);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const margin = 40;
    for (const c of circles) {
        minX = Math.min(minX, c.x - c.r - margin);
        minY = Math.min(minY, c.y - c.r - margin);
        maxX = Math.max(maxX, c.x + c.r + margin);
        maxY = Math.max(maxY, c.y + c.r + margin);
    }
    minX = Math.max(0, Math.floor(minX));
    minY = Math.max(0, Math.floor(minY));
    maxX = Math.min(canvas.width, Math.ceil(maxX));
    maxY = Math.min(canvas.height, Math.ceil(maxY));
    const boxWidth = maxX - minX, boxHeight = maxY - minY;
    if (boxWidth <= 0 || boxHeight <= 0) { generateNew(); return; }

    // Facts that will be derived
    const sizeClass = classifySize(boxWidth * boxHeight);
    const diet = pick(rng, archetype.dietPool);
    const temperament = pick(rng, archetype.temperamentPool);

    const offscreen = document.createElement('canvas');
    offscreen.width = boxWidth; offscreen.height = boxHeight;
    const offCtx = offscreen.getContext('2d');
    const imgData = offCtx.createImageData(boxWidth, boxHeight);
    const data = imgData.data;
    const eps = 1.0;

    for (let py = 0; py < boxHeight; py++) {
        for (let px = 0; px < boxWidth; px++) {
            const x = minX + px, y = minY + py;
            const d = fieldAt(x, y, circles);
            const alpha = Math.max(0, Math.min(1, 0.5 - d));
            if (alpha > 0) {
                const idx = (py * boxWidth + px) * 4;
                const dx = fieldAt(x + eps, y, circles) - d;
                const dy = fieldAt(x, y + eps, circles) - d;
                const nz = 1.2;
                const nLen = Math.hypot(dx, dy, nz);
                const nx = dx / (nLen || 1), ny = dy / (nLen || 1), normZ = nz / (nLen || 1);
                const lx = -0.55, ly = -0.55, lz = 0.62;
                const dot = Math.max(0, nx * lx + ny * ly + normZ * lz);
                const intensity = 0.25 + dot * 0.75;
                const halfLen = Math.hypot(lx, ly, lz + 1.0);
                const specDot = Math.max(0, nx * (lx / halfLen) + ny * (ly / halfLen) + normZ * ((lz + 1.0) / halfLen));
                const specular = Math.pow(specDot, 16.0) * 0.3;

                data[idx] = Math.min(255, baseR * intensity + specular * 255);
                data[idx + 1] = Math.min(255, baseG * intensity + specular * 255);
                data[idx + 2] = Math.min(255, baseB * intensity + specular * 255);
                data[idx + 3] = alpha * 255;
            }
        }
    }

    offCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(offscreen, minX, minY);

    document.getElementById("ui-seed").innerText = seedValue;
    document.getElementById("ui-segments").innerText = spineSegments;
    document.getElementById("ui-limbs").innerText = numLimbs;
    document.getElementById("ui-bbox").innerText = `${boxWidth}x${boxHeight} px`;
    document.getElementById("ui-time").innerText = `${(performance.now() - startTime).toFixed(1)} ms`;
    document.getElementById("ui-archetype").innerText = `${archetype.name} — ${archetype.tagline}`;
    document.getElementById("ui-size").innerText = sizeClass;
    document.getElementById("ui-diet").innerText = diet;
    document.getElementById("ui-habitat").innerText = archetype.habitat;
    document.getElementById("ui-temperament").innerText = temperament;
}

window.onload = () => generateNew();