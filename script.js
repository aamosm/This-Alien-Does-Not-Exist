/* ============================================================
   PRNG — canonical mulberry32
   ============================================================ */
function mulberry32(a) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Deterministically derive an independent sub-seed from a master seed + a
// label. This is how "stable gene order" actually gets enforced: instead of
// one shared rng() stream (where adding a gene shifts everything after it),
// each anatomical system gets its OWN stream. Add a "feathers" system later
// and every existing creature's skeleton/limbs/skin are completely unaffected.
function subSeed(masterSeed, salt) {
    let h = (masterSeed ^ 0) >>> 0;
    for (let i = 0; i < salt.length; i++) {
        h = Math.imul(h ^ salt.charCodeAt(i), 2654435761) >>> 0;
    }
    return h >>> 0;
}

function lerp(a, b, t) { return a + (b - a) * t; }

/* ============================================================
   Noise utilities (fixed a bug from the reference doc: noise1D
   was doing Math.floor(n) instead of Math.floor(x) — n doesn't
   exist in that scope, would've thrown ReferenceError)
   ============================================================ */
function hash11(n) {
    n = Math.sin(n) * 43758.5453;
    return n - Math.floor(n);
}
function noise1D(x) {
    const i = Math.floor(x);
    const f = x - i;
    const a = hash11(i);
    const b = hash11(i + 1);
    const u = f * f * (3 - 2 * f);
    return a * (1 - u) + b * u;
}

/* ============================================================
   GENOME — pure data, no archetypes. Each anatomical group reads
   from its own sub-seeded stream, in fixed order within that group.
   ============================================================ */
function rollEyeCount(rng) {
    const r = rng();
    if (r < 0.95) return 2;            // vast majority: two eyes
    if (r < 0.99) return 4;            // rare
    return 6 + Math.floor(rng() * 3);  // very rare, 6-8
}
function rollHornCount(rng) {
    const r = rng();
    if (r < 0.55) return 0;
    if (r < 0.85) return 2;
    if (r < 0.97) return 4;
    return 6;
}
function rollLimbPairs(rng) {
    const r = rng();
    if (r < 0.05) return 0;  // legless — rare
    if (r < 0.75) return 2;  // four legs — most common
    if (r < 0.95) return 1;  // two legs
    return 3;                // six legs — rare
}

function generateGenome(seed) {
    const skRng   = mulberry32(subSeed(seed, "traits-skeleton"));
    const limbRng = mulberry32(subSeed(seed, "traits-limbs"));
    const headRng = mulberry32(subSeed(seed, "traits-head"));
    const skinRng = mulberry32(subSeed(seed, "traits-skin"));

    const skew = (rng, p) => Math.pow(rng(), p); // p>1 biases low/common, p<1 biases high/rare

    const genome = {
        // -- skeleton --
        mass: lerp(500, 50000, skew(skRng, 2.2)),   // big creatures genuinely rare
        bodyLength: lerp(0.8, 3.5, skRng()),
        bodyWidth: lerp(0.3, 2.2, skRng()),
        neckLength: lerp(0, 2.5, skew(skRng, 1.6)),
        tailLength: lerp(0, 4.0, skew(skRng, 1.4)),
        spineCurve: lerp(-0.8, 0.8, skRng()),
        bodyTaper: lerp(0.5, 1.5, skRng()),

        // -- limbs --
        limbPairs: rollLimbPairs(limbRng),
        limbSegments: Math.floor(lerp(2, 5, limbRng())),
        legLength: lerp(0.2, 3.0, skew(limbRng, 1.5)),
        footSpread: lerp(0.5, 3.5, limbRng()),
        stance: limbRng(),

        // -- head --
        headSize: lerp(0.2, 2.0, headRng()),
        eyeCount: rollEyeCount(headRng),
        hornCount: rollHornCount(headRng),

        // -- skin --
        skinHue: skinRng(),
        skinBrightness: skinRng(),
        skinPattern: skinRng(),
    };
    return genome;
}

/* ============================================================
   SKELETON CONSTRUCTION — organic spine (bounded taper + noise
   wobble, per the "rounded not pointy" fixes), tail, head+horns
   ============================================================ */
function buildSpine(genome, formRng, startX, startY) {
    const sizeScale = Math.pow(genome.mass / 5000, 0.28);
    const totalLen = (60 + genome.bodyLength * 90) * sizeScale;
    const baseRadius = (10 + genome.bodyWidth * 22) * sizeScale;
    const segCount = 6 + Math.round(genome.bodyLength * 3);

    const curveAmp = 20 + Math.abs(genome.spineCurve) * 70;
    const curveFreq = 0.6 + formRng() * 1.0;
    const curveSign = genome.spineCurve >= 0 ? 1 : -1;
    const noiseAmp = baseRadius * (0.25 + formRng() * 0.25);
    const phase = formRng() * 100;

    const nodes = [];
    for (let i = 0; i < segCount; i++) {
        const t = i / (segCount - 1);
        const bend = Math.sin(t * Math.PI * curveFreq) * curveAmp * curveSign;
        const wobble = (noise1D(t * 6 + phase) - 0.5) * noiseAmp;

        const x = startX + bend + wobble * 0.4;
        const y = startY + t * totalLen;

        // bounded taper (never goes to 0) + noise instead of a clean bell curve
        const taper = 1 - Math.pow(t, genome.bodyTaper) * 0.75;
        const rNoise = noise1D(t * 4 + phase + 50) * 2 - 1;
        const r = Math.max(baseRadius * 0.25, baseRadius * taper * (1 + rNoise * 0.25));

        nodes.push({ x, y, r });
    }
    return nodes;
}

function buildTail(genome, formRng, lastNode) {
    if (genome.tailLength < 0.15) return []; // negligible tail: skip it entirely
    const sizeScale = Math.pow(genome.mass / 5000, 0.28); // was missing — tail wasn't scaling with body size
    const segs = 2 + Math.round(genome.tailLength * 2);
    const segLen = 30 * genome.tailLength * sizeScale;
    let x = lastNode.x, y = lastNode.y, r = lastNode.r * 0.7;
    let angle = Math.PI / 2 + (formRng() - 0.5) * 0.6;
    const nodes = [];
    for (let i = 0; i < segs; i++) {
        angle += (formRng() - 0.5) * 0.5;
        x += Math.cos(angle) * segLen * 0.2 + (formRng() - 0.5) * 4 * sizeScale;
        y += segLen;
        r *= 0.85; // was 0.72 — tapered to a hairline within a couple segments
        nodes.push({ x, y, r: Math.max(2, r) });
    }
    return nodes;
}

function buildHead(genome, formRng, spine) {
    const bodyTop = spine[0];
    const headR = bodyTop.r * (1 + genome.headSize * 1.2);
    const neckLen = (10 + genome.neckLength * 40) * Math.pow(genome.mass / 5000, 0.25);
    const hx = bodyTop.x, hy = bodyTop.y - neckLen;

    const bones = [
        { ax: hx, ay: hy, bx: bodyTop.x, by: bodyTop.y, r1: headR * 0.55, r2: bodyTop.r }, // neck
        { ax: hx, ay: hy - headR * 0.3, bx: hx, by: hy + headR * 0.3, r1: headR, r2: headR } // head blob
    ];

    for (let i = 0; i < genome.hornCount; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const angle = -Math.PI / 2 + side * (0.3 + formRng() * 0.4);
        const len = headR * (0.8 + formRng() * 0.6);
        const bx = hx + Math.cos(angle) * len;
        const by = hy + Math.sin(angle) * len - headR * 0.3;
        bones.push({ ax: hx, ay: hy - headR * 0.3, bx, by, r1: headR * 0.18, r2: headR * 0.05 });
    }

    return { bones, headCenter: { x: hx, y: hy }, headR };
}

function buildLimbs(genome, formRng, spine) {
    const bones = [];
    if (genome.limbPairs === 0) return bones;

    const bodyStart = Math.floor(spine.length * 0.15);
    const bodyEnd = Math.floor(spine.length * 0.85);

    for (let p = 0; p < genome.limbPairs; p++) {
        const t = genome.limbPairs === 1 ? 0.5 : p / (genome.limbPairs - 1);
        const idx = Math.round(lerp(bodyStart, bodyEnd, t));
        const attach = spine[idx];

        [-1, 1].forEach(side => {
            const legLenPx = (20 + genome.legLength * 55) * Math.pow(genome.mass / 5000, 0.25);
            const segCount = genome.limbSegments;
            const chain = [{ x: attach.x, y: attach.y }];
            let cx = attach.x, cy = attach.y;
            const segLen = legLenPx / segCount;
            for (let s = 0; s < segCount; s++) {
                cx += side * genome.footSpread * (segLen * 0.15);
                cy += segLen;
                chain.push({ x: cx, y: cy });
            }

            // softer, organic IK targets instead of a straight harsh reach
            let spreadX = genome.footSpread * (0.5 + formRng() * 0.4);
            let dirY = 0.6 + genome.stance * 0.8;

            // Clamp the target vector so it stays WITHIN the leg's reach.
            // Otherwise distToTarget >= totalLength almost always, and
            // solveFABRIK falls into its "fully stretched straight line"
            // branch instead of actually bending the chain — that's what
            // was producing the rigid spikes instead of jointed legs.
            const maxReach = 0.85; // fraction of legLenPx the foot may sit at
            const mag = Math.hypot(spreadX, dirY);
            if (mag > maxReach) {
                spreadX = spreadX / mag * maxReach;
                dirY = dirY / mag * maxReach;
            }

            const forwardBias = (formRng() - 0.5) * legLenPx * 0.15;
            const heightJitter = (noise1D(p * 10 + side * 5 + formRng() * 100) - 0.5) * legLenPx * 0.15;

            const targetX = attach.x + (spreadX * legLenPx + forwardBias) * side;
            const targetY = attach.y + dirY * legLenPx + heightJitter;

            solveFABRIK(chain, targetX, targetY);

            let diam = (4 + genome.bodyWidth * 7) * Math.pow(genome.mass / 5000, 0.28) * (0.5 + formRng() * 0.3);
            for (let i = 0; i < chain.length - 1; i++) {
                const nextDiam = diam * 0.72;
                bones.push({ ax: chain[i].x, ay: chain[i].y, bx: chain[i + 1].x, by: chain[i + 1].y, r1: diam, r2: nextDiam });
                diam = nextDiam;
            }
        });
    }
    return bones;
}

/* ============================================================
   FABRIK — unchanged, your version is correct
   ============================================================ */
function solveFABRIK(chain, targetX, targetY) {
    const n = chain.length;
    const lengths = [];
    let totalLength = 0;
    for (let i = 0; i < n - 1; i++) {
        const dist = Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].y - chain[i].y);
        lengths.push(dist);
        totalLength += dist;
    }
    const root = { x: chain[0].x, y: chain[0].y };
    const distToTarget = Math.hypot(targetX - root.x, targetY - root.y);

    if (distToTarget >= totalLength) {
        for (let i = 0; i < n - 1; i++) {
            const r = Math.hypot(targetX - chain[i].x, targetY - chain[i].y);
            const lambda = lengths[i] / (r || 1);
            chain[i + 1].x = (1 - lambda) * chain[i].x + lambda * targetX;
            chain[i + 1].y = (1 - lambda) * chain[i].y + lambda * targetY;
        }
    } else {
        for (let iter = 0; iter < 4; iter++) {
            chain[n - 1].x = targetX;
            chain[n - 1].y = targetY;
            for (let i = n - 2; i >= 0; i--) {
                const r = Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].y - chain[i].y);
                const lambda = lengths[i] / (r || 1);
                chain[i].x = (1 - lambda) * chain[i + 1].x + lambda * chain[i].x;
                chain[i].y = (1 - lambda) * chain[i + 1].y + lambda * chain[i].y;
            }
            chain[0].x = root.x;
            chain[0].y = root.y;
            for (let i = 0; i < n - 1; i++) {
                const r = Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].y - chain[i].y);
                const lambda = lengths[i] / (r || 1);
                chain[i + 1].x = (1 - lambda) * chain[i].x + lambda * chain[i + 1].x;
                chain[i + 1].y = (1 - lambda) * chain[i].y + lambda * chain[i + 1].y;
            }
        }
    }
}

/* ============================================================
   SDF — uneven capsule + cubic smin, unchanged except k is now
   softer (22-30 range) per the organic-shape fixes
   ============================================================ */
function sdUnevenCapsule(px, py, ax, ay, bx, by, r1, r2) {
    const h = Math.hypot(bx - ax, by - ay);
    if (h === 0) return Math.hypot(px - ax, py - ay) - r1;
    const dirX = (bx - ax) / h, dirY = (by - ay) / h;
    const tx = px - ax, ty = py - ay;
    const localY = tx * dirX + ty * dirY;
    const localX = tx * -dirY + ty * dirX;
    const pX = Math.abs(localX), pY = localY;
    const b = (r1 - r2) / h;
    const a = Math.sqrt(Math.max(0.0, 1.0 - b * b));
    const k = pX * a - pY * b;
    if (k < 0.0) return Math.hypot(pX, pY) - r1;
    if (k > a * h) return Math.hypot(pX, pY - h) - r2;
    return pX * a + pY * b - r1;
}
function sminCubic(a, b, k) {
    const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
    return b + (a - b) * h - k * h * (1.0 - h);
}
function evaluateField(px, py, bones, k) {
    if (bones.length === 0) return Infinity;
    let d = sdUnevenCapsule(px, py, bones[0].ax, bones[0].ay, bones[0].bx, bones[0].by, bones[0].r1, bones[0].r2);
    for (let i = 1; i < bones.length; i++) {
        const b = bones[i];
        const dist = sdUnevenCapsule(px, py, b.ax, b.ay, b.bx, b.by, b.r1, b.r2);
        d = sminCubic(d, dist, k);
    }
    return d;
}

/* ============================================================
   COLOR
   ============================================================ */
function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [255 * f(0), 255 * f(8), 255 * f(4)];
}
function computeSkinColor(genome) {
    const hue = genome.skinHue * 360;
    const sat = 40 + genome.skinBrightness * 20;
    const light = 30 + genome.skinBrightness * 35;
    return hslToRgb(hue, sat, light);
}

/* ============================================================
   EMERGENT CLASSIFICATION — describes what the genome produced,
   AFTER the fact. Consumes zero rng calls, pure function of
   genome, so it can never desync generation.
   ============================================================ */
function classifyCreature(genome) {
    const facts = {};
    const legRatio = genome.legLength / genome.bodyLength;
    const isHeavy = genome.mass > 20000;
    const isLegless = genome.limbPairs === 0;

    if (isLegless && genome.tailLength > 1.5) facts.locomotion = "Serpentine / Aquatic";
    else if (isHeavy && legRatio < 1.0) facts.locomotion = "Graviportal (heavy-bodied)";
    else if (legRatio > 1.6 && genome.mass < 8000) facts.locomotion = "Cursorial (built for speed)";
    else if (genome.limbPairs >= 3) facts.locomotion = "Many-limbed crawler";
    else facts.locomotion = "Generalist";

    if (genome.mass < 2000) facts.size = "Small";
    else if (genome.mass < 10000) facts.size = "Medium";
    else if (genome.mass < 30000) facts.size = "Large";
    else facts.size = "Massive";

    if (genome.hornCount >= 2 && genome.mass > 10000) facts.diet = "Herbivore";
    else if (genome.eyeCount >= 4) facts.diet = "Carnivore";
    else facts.diet = "Omnivore";

    facts.habitat = isLegless ? "Aquatic / Subsurface" : legRatio > 1.5 ? "Open terrain" : "Mixed terrain";

    const temperaments = ["Docile", "Territorial", "Skittish", "Curious", "Aggressive", "Solitary"];
    const idx = Math.floor(((genome.stance + genome.skinPattern) / 2) * temperaments.length) % temperaments.length;
    facts.temperament = temperaments[idx];

    return facts;
}

function drawEyes(ctx, genome, headCenter, headR) {
    const n = genome.eyeCount;
    for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const spread = headR * 1.1;
        const ex = headCenter.x + (t - 0.5) * spread;
        const ey = headCenter.y - headR * 0.15;
        ctx.fillStyle = "rgba(10,10,10,0.9)";
        ctx.beginPath();
        ctx.arc(ex, ey, Math.max(1.5, headR * 0.09), 0, Math.PI * 2);
        ctx.fill();
    }
}

function renderAlien(canvasId, seed) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const genome = generateGenome(seed);
    const facts = classifyCreature(genome);
    const formRng = mulberry32(subSeed(seed, "form"));

    const spine = buildSpine(genome, formRng, canvas.width / 2, 120);
    const tail = buildTail(genome, formRng, spine[spine.length - 1]);
    const head = buildHead(genome, formRng, spine);
    const limbBones = buildLimbs(genome, formRng, spine);

    const spineBones = [];
    for (let i = 0; i < spine.length - 1; i++) {
        spineBones.push({ ax: spine[i].x, ay: spine[i].y, bx: spine[i + 1].x, by: spine[i + 1].y, r1: spine[i].r, r2: spine[i + 1].r });
    }
    const tailBones = [];
    let prev = spine[spine.length - 1];
    for (const node of tail) {
        tailBones.push({ ax: prev.x, ay: prev.y, bx: node.x, by: node.y, r1: prev.r, r2: node.r });
        prev = node;
    }

    const allBones = [...spineBones, ...tailBones, ...head.bones, ...limbBones];
    const [baseR, baseG, baseB] = computeSkinColor(genome);
    const k = 22 + formRng() * 8; // softer blending, 22-30

    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const data = imgData.data;
    const eps = 1.0;

    for (let py = 0; py < canvas.height; py++) {
        for (let px = 0; px < canvas.width; px++) {
            const d = evaluateField(px, py, allBones, k);
            if (d < 1.0) {
                const idx = (py * canvas.width + px) * 4;
                const alpha = Math.max(0, Math.min(1, 1.0 - d));

                const dx = evaluateField(px + eps, py, allBones, k) - d;
                const dy = evaluateField(px, py + eps, allBones, k) - d;
                const nz = 1.5;
                const nLen = Math.hypot(dx, dy, nz);
                const nx = dx / nLen, ny = dy / nLen, normZ = nz / nLen;
                const lx = -0.5, ly = -0.5, lz = 0.8;
                const dot = Math.max(0, nx * lx + ny * ly + normZ * lz);
                const intensity = 0.25 + dot * 0.75;

                data[idx] = Math.min(255, baseR * intensity);
                data[idx + 1] = Math.min(255, baseG * intensity);
                data[idx + 2] = Math.min(255, baseB * intensity);
                data[idx + 3] = alpha * 255;
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);
    drawEyes(ctx, genome, head.headCenter, head.headR);

    return { genome, facts };
}

function generateRandom(canvasId) {
    return renderAlien(canvasId, Math.floor(Math.random() * 4294967296));
}