// PRNG
function mulberry32(a) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function subSeed(masterSeed, salt) {
    let h = (masterSeed ^ 0) >>> 0;
    for (let i = 0; i < salt.length; i++) {
        h = Math.imul(h ^ salt.charCodeAt(i), 2654435761) >>> 0;
    }
    return h >>> 0;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function weightedChoice(rng, choices) {
    let totalWeight = 0;
    for (let i = 0; i < choices.length; i++) totalWeight += choices[i][0];
    let r = rng() * totalWeight;
    for (let i = 0; i < choices.length; i++) {
        r -= choices[i][0];
        if (r <= 0) return choices[i][1];
    }
    return choices[choices.length - 1][1];
}

// Trace Recorder
function makeTracedRng(rawRng, trace) {
    return function (label) {
        const v = rawRng();
        const idx = trace.values.length;
        trace.values.push(v);
        if (label) trace.labels[label] = idx;
        return v;
    };
}

function traceGet(trace, label) {
    const idx = trace.labels[label];
    return idx === undefined ? 0 : trace.values[idx];
}

function hash21(x, y) {
    let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
}

function noise2D(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const v00 = hash21(ix, iy), v10 = hash21(ix + 1, iy);
    const v01 = hash21(ix, iy + 1), v11 = hash21(ix + 1, iy + 1);
    const vx0 = lerp(v00, v10, ux), vx1 = lerp(v01, v11, ux);
    return lerp(vx0, vx1, uy);
}

function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [255 * f(0), 255 * f(8), 255 * f(4)];
}

// Body Plan
const BodyPlanConfigs = {
    Vertebrate: { thoraxRatio: 0.30, pelvisRatio: 0.75, segmentCount: 6, allowsLimbs: true },
    Quadruped: { thoraxRatio: 0.32, pelvisRatio: 0.72, segmentCount: 7, allowsLimbs: true },
    Biped: { thoraxRatio: 0.22, pelvisRatio: 0.62, segmentCount: 5, allowsLimbs: true },
    Winged: { thoraxRatio: 0.48, pelvisRatio: 0.80, segmentCount: 6, allowsLimbs: true },
    Tripod: { thoraxRatio: 0.30, pelvisRatio: 0.85, segmentCount: 5, allowsLimbs: true },
    Insectoid: { thoraxRatio: 0.35, pelvisRatio: 0.55, segmentCount: 3, allowsLimbs: true },
    Arachnoid: { thoraxRatio: 0.55, pelvisRatio: 0.55, segmentCount: 2, allowsLimbs: true },
    Arthropod: { thoraxRatio: 0.40, pelvisRatio: 0.90, segmentCount: 3, allowsLimbs: true },
    Cephalopod: { thoraxRatio: 0.8, pelvisRatio: 1.0, segmentCount: 2, allowsLimbs: true },
    Serpentine: { thoraxRatio: 0.15, pelvisRatio: 0.9, segmentCount: 14, allowsLimbs: false },
    Radial: { thoraxRatio: 0.5, pelvisRatio: 0.5, segmentCount: 1, allowsLimbs: true }
};

// Primitives
class Primitive {
    constructor(type, op = 'smooth_add', k = 5) { this.type = type; this.op = op; this.k = k; }
    evaluate(px, py) { return Infinity; }
    bounds() { return { minX: 0, minY: 0, maxX: 0, maxY: 0 }; }
    translate(dx, dy) {}
    scale(s) { this.k *= s; }
    squeezeAxis(axis, factor, center) {}
}

class Sphere extends Primitive {
    constructor(x, y, r, op, k) { super('sphere', op, k); this.x = x; this.y = y; this.r = r; }
    evaluate(px, py) { return Math.hypot(px - this.x, py - this.y) - this.r; }
    bounds() { return { minX: this.x - this.r, minY: this.y - this.r, maxX: this.x + this.r, maxY: this.y + this.r }; }
    translate(dx, dy) { this.x += dx; this.y += dy; }
    scale(s) { super.scale(s); this.x *= s; this.y *= s; this.r *= s; }
    squeezeAxis(axis, factor, center) {
        if (axis === 'x') this.x = center + (this.x - center) * factor;
        else this.y = center + (this.y - center) * factor;
    }
}

class Capsule extends Primitive {
    constructor(ax, ay, bx, by, r1, r2, op, k) { super('capsule', op, k); this.ax = ax; this.ay = ay; this.bx = bx; this.by = by; this.r1 = r1; this.r2 = r2; }
    evaluate(px, py) {
        const dx = this.bx - this.ax, dy = this.by - this.ay;
        const L = Math.sqrt(dx * dx + dy * dy);
        if (L === 0) return Math.hypot(px - this.ax, py - this.ay) - Math.max(this.r1, this.r2);
        if (L <= Math.abs(this.r1 - this.r2)) return this.r1 > this.r2 ? Math.hypot(px - this.ax, py - this.ay) - this.r1 : Math.hypot(px - this.bx, py - this.by) - this.r2;
        const dirX = dx / L, dirY = dy / L;
        const tx = px - this.ax, ty = py - this.ay;
        const y = tx * dirX + ty * dirY; const x = Math.abs(tx * -dirY + ty * dirX);
        const sinT = (this.r1 - this.r2) / L; const cosT = Math.sqrt(Math.max(0.0, 1.0 - sinT * sinT));
        const proj = y * cosT - x * sinT;
        if (proj <= 0.0) return Math.hypot(x, y) - this.r1;
        if (proj >= L * cosT) return Math.hypot(x, y - L) - this.r2;
        return x * cosT + y * sinT - this.r1;
    }
    bounds() {
        const r = Math.max(this.r1, this.r2);
        return { minX: Math.min(this.ax - r, this.bx - r), minY: Math.min(this.ay - r, this.by - r), maxX: Math.max(this.ax + r, this.bx + r), maxY: Math.max(this.ay + r, this.by + r) };
    }
    translate(dx, dy) { this.ax += dx; this.ay += dy; this.bx += dx; this.by += dy; }
    scale(s) { super.scale(s); this.ax *= s; this.ay *= s; this.bx *= s; this.by *= s; this.r1 *= s; this.r2 *= s; }
    squeezeAxis(axis, factor, center) {
        if (axis === 'x') { this.ax = center + (this.ax - center) * factor; this.bx = center + (this.bx - center) * factor; }
        else { this.ay = center + (this.ay - center) * factor; this.by = center + (this.by - center) * factor; }
    }
}

class Ellipsoid extends Primitive {
    constructor(x, y, rx, ry, angle, op, k) { super('ellipsoid', op, k); this.x = x; this.y = y; this.rx = rx; this.ry = ry; this.angle = angle; }
    evaluate(px, py) {
        const dx = px - this.x, dy = py - this.y;
        const cosA = Math.cos(-this.angle), sinA = Math.sin(-this.angle);
        const lx = dx * cosA - dy * sinA, ly = dx * sinA + dy * cosA;
        return (Math.hypot(lx / this.rx, ly / this.ry) - 1.0) * Math.min(this.rx, this.ry);
    }
    bounds() {
        const maxR = Math.max(this.rx, this.ry);
        return { minX: this.x - maxR, minY: this.y - maxR, maxX: this.x + maxR, maxY: this.y + maxR };
    }
    translate(dx, dy) { this.x += dx; this.y += dy; }
    scale(s) { super.scale(s); this.x *= s; this.y *= s; this.rx *= s; this.ry *= s; }
    squeezeAxis(axis, factor, center) {
        if (axis === 'x') this.x = center + (this.x - center) * factor;
        else this.y = center + (this.y - center) * factor;
    }
}

function sminExp(a, b, k) {
    const h = Math.max(k, 0.0001);
    const m = Math.min(a, b);
    return m - h * Math.log(Math.exp((m - a) / h) + Math.exp((m - b) / h));
}

function evaluateField(px, py, primitives) {
    let d = Infinity;
    for (let p of primitives) {
        let pd = p.evaluate(px, py);
        if (d === Infinity) {
            d = (p.op === 'subtract') ? -pd : pd;
        } else {
            if (p.op === 'add') d = Math.min(d, pd);
            else if (p.op === 'smooth_add') d = sminExp(d, pd, p.k);
            else if (p.op === 'subtract') d = Math.max(d, -pd);
        }
    }
    return d;
}

function marchToSurface(primitives, originX, originY, angle, maxR) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let lo = 0, hi = maxR;
    let hiVal = evaluateField(originX + dx * hi, originY + dy * hi, primitives);
    let guard = 0;
    while (hiVal < 0 && guard < 12) {
        hi *= 2;
        hiVal = evaluateField(originX + dx * hi, originY + dy * hi, primitives);
        guard++;
    }
    for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        const d = evaluateField(originX + dx * mid, originY + dy * mid, primitives);
        if (d < 0) lo = mid; else hi = mid;
    }
    const r = (lo + hi) / 2;
    return { x: originX + dx * r, y: originY + dy * r, dirX: dx, dirY: dy };
}

// Creature Context
class CreatureContext {
    constructor(seed) {
        this.seed = seed;
        this.genome = {};

        this.primitives = [];
        this.sockets = {};

        this.geometry = {
            allBones: this.primitives,
            eyePositions: [],
            head: {},
            torsoBodyPrimitives: [],
            posture: {}
        };
        this.materials = {};
        this.eyes = {};
        this.facts = {};
        this.featureData = {};

        this.trace = { values: [], labels: {}, derived: {} };
        this.registry = {};
    }

    registerSocket(name, x, y, dirX = 0, dirY = 1, radius = 0) {
        this.sockets[name] = { x, y, dirX, dirY, radius };
    }

    getSocket(name) {
        return this.sockets[name];
    }

    sampleBoundary(startX, startY, dirX, dirY, maxSteps = 20) {
        let px = startX, py = startY;
        for (let i = 0; i < maxSteps; i++) {
            let d = evaluateField(px, py, this.primitives);
            if (Math.abs(d) < 1.0) break;
            px -= dirX * d * 0.8; py -= dirY * d * 0.8;
        }
        return { x: px, y: py };
    }
}


function generateGenome(seed, trace) {
    const rawRng = mulberry32(subSeed(seed, "genome"));
    const rng = makeTracedRng(rawRng, trace);
    const skew = (p, label) => Math.pow(rng(label), p);

    const genome = {};
    genome.mass = lerp(500, 50000, skew(2.2, 'genome.mass'));
    genome.bodyPlan = weightedChoice(() => rng('genome.bodyPlan'), [
        [0.25, "Quadruped"], [0.20, "Biped"], [0.15, "Serpentine"],
        [0.15, "Insectoid"], [0.10, "Arachnoid"], [0.05, "Tripod"],
        [0.05, "Cephalopod"], [0.05, "Radial"], [0.05, "Winged"]
    ]);
    genome.bodyLength = lerp(0.8, 3.5, rng('genome.bodyLength'));
    genome.bodyWidth = lerp(0.3, 2.2, rng('genome.bodyWidth'));
    genome.limbPairsRaw = rng('genome.limbPairsRaw');
    genome.legLengthRaw = skew(1.5, 'genome.legLengthRaw');
    genome.stanceRaw = rng('genome.stanceRaw');
    genome.headSize = lerp(0.4, 2.0, rng('genome.headSize'));
    genome.headWidth = lerp(0.4, 2.0, rng('genome.headWidth'));
    genome.snoutLengthRaw = skew(1.5, 'genome.snoutLengthRaw');
    genome.jawDepthRaw = rng('genome.jawDepthRaw');
    genome.chinTaper = lerp(0.2, 1.2, rng('genome.chinTaper'));
    genome.headTilt = lerp(-0.4, 0.4, rng('genome.headTilt'));
    genome.neckLengthRaw = skew(1.6, 'genome.neckLengthRaw');
    genome.eyeCount = weightedChoice(() => rng('genome.eyeCount'), [[0.06, 0], [0.09, 1], [0.62, 2], [0.14, 3], [0.09, 4]]);
    genome.mouthType = weightedChoice(() => rng('genome.mouthType'), [[0.3, "Jaw"], [0.25, "Mandibles"], [0.2, "Beak"], [0.15, "Proboscis"], [0.1, "Filter"]]);
    genome.tailLength = lerp(0, 4.0, skew(1.4, 'genome.tailLength'));
    genome.tailType = weightedChoice(() => rng('genome.tailType'), [[0.5, "Whip"], [0.2, "Club"], [0.2, "Paddle"], [0.1, "Forked"]]);
    genome.spineCurve = lerp(-0.8, 0.8, rng('genome.spineCurve'));
    genome.skinHue = rng('genome.skinHue');
    genome.skinBrightness = rng('genome.skinBrightness');
    genome.skinPattern = rng('genome.skinPattern');
    genome.patternStyle = rng('genome.patternStyle');
    genome.patternContrast = lerp(0.25, 0.85, rng('genome.patternContrast'));
    genome.paletteScheme = weightedChoice(() => rng('genome.paletteScheme'), [[0.3, "complementary"], [0.3, "analogous"], [0.25, "triadic"], [0.15, "monochrome"]]);
    genome.accentHueOffset = rng('genome.accentHueOffset');
    genome.asymmetry = Math.pow(rng('genome.asymmetry'), 2.5);
    genome.asymmetryBias = rng('genome.asymmetryBias') < 0.5 ? -1 : 1;

    return genome;
}

function applyCorrelations(genome, seed, trace) {
    const rawRng = mulberry32(subSeed(seed, "ecology"));
    const rng = makeTracedRng(rawRng, trace);
    genome.niche = weightedChoice(() => rng('ecology.niche'), [[0.45, "Predator"], [0.40, "Prey"], [0.15, "FilterFeeder"]]);

    if (genome.niche === "Predator") {
        genome.jawDepthRaw = lerp(genome.jawDepthRaw, 1.0, 0.6);
        genome.neckLengthRaw = lerp(genome.neckLengthRaw, 0.5, 0.4);
        genome.legLengthRaw = lerp(genome.legLengthRaw, 1.0, 0.3);
        genome.eyePlacement = "Forward";
        genome.pupilType = "slit";
    } else if (genome.niche === "Prey") {
        genome.eyePlacement = "Panoramic";
        genome.pupilType = "horizontal";
        genome.snoutLengthRaw = lerp(genome.snoutLengthRaw, 1.0, 0.5);
    } else {
        genome.eyePlacement = "Wide";
        genome.pupilType = "round";
        genome.jawDepthRaw *= 0.3;
    }
    return genome;
}

function applyConstraints(genome) {
    const massN = clamp((genome.mass - 500) / (50000 - 500), 0, 1);
    const bodyScale = Math.pow(genome.mass / 5000, 0.28);

    // posture scalar
    genome.posture = weightedChoice(() => (genome.stanceRaw + massN * 0.35) % 1, [
        [0.20, "upright"],
        [0.20, "forward_lean"],
        [0.18, "arched"],
        [0.14, "slouched"],
        [0.14, "curved"],
        [0.08, "coiled"],
        [0.06, "reared"]
    ]);

    // head-body coherence
    const headMassLimit = 1.0 + massN * 1.35;
    genome.headSize = Math.min(genome.headSize, headMassLimit);
    genome.headWidth = clamp(genome.headWidth, 0.5, 1.8);

    // base derived dims
    genome.jawDepth = lerp(0.2, 1.5, genome.jawDepthRaw);
    genome.snoutLength = lerp(0.1, 2.8, genome.snoutLengthRaw);
    genome.neckLength = lerp(0, 2.5, genome.neckLengthRaw);

    const headScaleProxy = genome.headSize * genome.headWidth;
    const bodyBulkProxy = (genome.bodyWidth * 0.65 + genome.bodyLength * 0.35);

    // large heads require thicker/shorter neck
    const neckThicknessBase = lerp(0.45, 1.4, massN) * lerp(0.9, 1.25, clamp((headScaleProxy - 0.7) / 1.6, 0, 1));
    genome.neckThickness = neckThicknessBase;
    if (headScaleProxy > 1.7) genome.neckLength *= lerp(1.0, 0.72, clamp((headScaleProxy - 1.7) / 1.0, 0, 1));

    // limb scaling coherence
    const stance = lerp(0.35, 0.95, genome.stanceRaw);
    genome.legLength = (26 + genome.legLengthRaw * 72) * bodyScale * lerp(0.82, 1.22, stance) * lerp(0.88, 1.12, clamp(genome.bodyLength / 3.5, 0, 1));
    genome.legThickness = (3.2 + genome.bodyWidth * 6.3) * Math.pow(genome.mass / 5000, 0.42) * lerp(0.86, 1.22, massN);
    genome.jointRadius = genome.legThickness * lerp(0.50, 0.85, clamp(bodyBulkProxy / 3.8, 0, 1));

    // socket outwardization amount
    genome.socketOutward = (5 + genome.bodyWidth * 6) * bodyScale * lerp(0.85, 1.35, massN);
    genome.limbRootOffset = genome.legThickness * lerp(0.5, 1.0, massN);

    // shoulder widening from big heads
    genome.shoulderWidthScale = 1 + clamp((headScaleProxy - 1.25) * 0.28, 0, 0.35);

    // tail constraints coherent with body
    const bodyLenProxy = (60 + genome.bodyLength * 90) * bodyScale;
    const maxTailLenProxy = bodyLenProxy * lerp(0.55, 1.15, clamp(genome.bodyLength / 3.5, 0, 1));
    const rawTailPx = genome.tailLength * 25 * bodyScale * (3 + Math.round(genome.tailLength * 3));
    if (rawTailPx > maxTailLenProxy) {
        const shrink = maxTailLenProxy / (rawTailPx || 1);
        genome.tailLength *= clamp(shrink, 0.55, 1.0);
    }
    genome.tailBaseThickness = (6 + genome.bodyWidth * 8) * bodyScale * lerp(0.8, 1.35, clamp(genome.tailLength / 3.0, 0, 1));
    genome.tailSegmentFactor = clamp(0.8 + genome.tailLength * 0.22, 0.8, 1.5);

    if (genome.mass > 30000) genome.legLength *= 0.86;
    if (genome.bodyPlan === "Cephalopod") {
        genome.neckLength = 0;
        genome.tailLength = 0;
    }
    if (genome.bodyPlan === "Serpentine") {
        genome.bodyLength = Math.max(genome.bodyLength, 2.5);
    }

    return genome;
}

class CreatureModule {
    constructor(ctx, rng) {
        this.ctx = ctx;
        this.genome = ctx.genome;

        const trace = ctx.trace;
        const className = this.constructor.name;
        const instanceId = (ctx._moduleInstanceCounter = (ctx._moduleInstanceCounter || 0) + 1);
        let drawCount = 0;
        this.rng = () => {
            const v = rng();
            const idx = trace.values.length;
            trace.values.push(v);
            trace.labels[`morphology.${className}#${instanceId}.draw${drawCount++}`] = idx;
            return v;
        };

        this.primitives = [];
        this.worldX = 0;
        this.worldY = 0;
        this.dirX = 0;
        this.dirY = 1;
    }
    build(x = 0, y = 0, dirX = 0, dirY = 1) {
        this.worldX = x; this.worldY = y;
        this.dirX = dirX; this.dirY = dirY;
        this.generate();
        this.ctx.primitives.push(...this.primitives);
    }
    attach(childModule, socketName) {
        const sock = this.ctx.getSocket(socketName);
        if (sock) childModule.build(sock.x, sock.y, sock.dirX, sock.dirY);
    }
    registerLocalSocket(name, offsetX, offsetY, dirX = 0, dirY = 1, radius = 0) {
        this.ctx.registerSocket(name, this.worldX + offsetX, this.worldY + offsetY, dirX, dirY, radius);
    }
    generate() { /* Virtual */ }
}


function postureParams(genome, sizeScale) {
    const p = genome.posture;
    let spineLean = 0, archAmp = 0, yCompression = 1, shoulderShiftY = 0, hipShiftY = 0, tailBaseAngle = Math.PI / 2;
    if (p === "upright") { spineLean = 0.0; archAmp = 0.08; yCompression = 1.0; tailBaseAngle = Math.PI / 2; }
    else if (p === "forward_lean") { spineLean = -0.32; archAmp = 0.06; yCompression = 0.96; shoulderShiftY = -6 * sizeScale; tailBaseAngle = Math.PI * 0.62; }
    else if (p === "arched") { spineLean = -0.08; archAmp = 0.28; yCompression = 0.97; tailBaseAngle = Math.PI * 0.7; }
    else if (p === "slouched") { spineLean = 0.12; archAmp = 0.12; yCompression = 0.92; shoulderShiftY = 4 * sizeScale; hipShiftY = 3 * sizeScale; tailBaseAngle = Math.PI * 0.76; }
    else if (p === "curved") { spineLean = 0.22; archAmp = 0.22; yCompression = 0.95; tailBaseAngle = Math.PI * 0.86; }
    else if (p === "coiled") { spineLean = 0.35; archAmp = 0.36; yCompression = 0.86; shoulderShiftY = 5 * sizeScale; hipShiftY = -3 * sizeScale; tailBaseAngle = Math.PI; }
    else if (p === "reared") { spineLean = -0.18; archAmp = 0.18; yCompression = 1.03; shoulderShiftY = -8 * sizeScale; hipShiftY = 4 * sizeScale; tailBaseAngle = Math.PI * 0.6; }

    return { spineLean, archAmp, yCompression, shoulderShiftY, hipShiftY, tailBaseAngle };
}

function pushSocketOutward(ctx, socketName, centerX, centerY, extraOut, minDelta) {
    const s = ctx.getSocket(socketName);
    if (!s) return;
    const vx = s.x - centerX, vy = s.y - centerY;
    const L = Math.hypot(vx, vy) || 1;
    const ux = vx / L, uy = vy / L;
    const local = evaluateField(s.x, s.y, ctx.geometry.torsoBodyPrimitives);
    const need = local < -minDelta ? (-local + minDelta) : minDelta * 0.35;
    const d = need + extraOut;
    s.x += ux * d; s.y += uy * d;
    s.dirX = ux; s.dirY = uy;
}

class TorsoVertebrate extends CreatureModule {
    generate() {
        const conf = BodyPlanConfigs[this.genome.bodyPlan] || BodyPlanConfigs.Vertebrate;
        const sizeScale = Math.pow(this.genome.mass / 5000, 0.28);
        const baseR = (10 + this.genome.bodyWidth * 22) * sizeScale;
        const totalLen = (60 + this.genome.bodyLength * 90) * sizeScale;
        const posture = postureParams(this.genome, sizeScale);
        this.ctx.geometry.posture = posture;

        this.registerLocalSocket('neck', 0, 0, 0, -1);
        let px = this.worldX, py = this.worldY, pr = baseR * 0.5;
        const bowAmount = this.genome.spineCurve * 40 * sizeScale;
        const leanDx = posture.spineLean * totalLen * 0.22;

        for (let i = 0; i <= conf.segmentCount; i++) {
            const t = i / conf.segmentCount;
            const arch = Math.sin(t * Math.PI) * posture.archAmp * totalLen * 0.16;
            const nx = this.worldX + Math.sin(t * Math.PI) * bowAmount + leanDx * t + arch;
            const ny = this.worldY + t * totalLen * posture.yCompression + Math.sin(t * Math.PI * 2) * totalLen * 0.015 * posture.archAmp;

            let rMult = 1.0;
            if (t < conf.thoraxRatio) rMult = lerp(0.4, 1.4, smoothstep(0, conf.thoraxRatio, t));
            else if (t < conf.pelvisRatio) rMult = lerp(1.4, 0.9, smoothstep(conf.thoraxRatio, conf.pelvisRatio, t));
            else rMult = lerp(0.9, 1.3, smoothstep(conf.pelvisRatio, 1.0, t));

            if (i <= 1) rMult *= this.genome.shoulderWidthScale;
            const nr = Math.max(baseR * 0.2, baseR * rMult * (1 - smoothstep(0.9, 1.0, t) * 0.6));
            if (i > 0) {
                const c = new Capsule(px, py, nx, ny, pr, nr, 'smooth_add', Math.max(pr, nr) * 0.5);
                this.primitives.push(c);
                this.ctx.geometry.torsoBodyPrimitives.push(c);
            }

            if (i === 1) {
                this.registerLocalSocket('shoulder_L', nx - this.worldX - nr * 1.15, ny - this.worldY + posture.shoulderShiftY, -1, 0);
                this.registerLocalSocket('shoulder_R', nx - this.worldX + nr * 1.15, ny - this.worldY + posture.shoulderShiftY, 1, 0);
            }
            if (i === conf.segmentCount - 1) {
                this.registerLocalSocket('hip_L', nx - this.worldX - nr * 1.05, ny - this.worldY + posture.hipShiftY, -1, 0);
                this.registerLocalSocket('hip_R', nx - this.worldX + nr * 1.05, ny - this.worldY + posture.hipShiftY, 1, 0);
            }
            if (i === Math.floor(conf.segmentCount / 2)) {
                this.registerLocalSocket('mid_L', nx - this.worldX - nr * 1.08, ny - this.worldY, -1, 0);
                this.registerLocalSocket('mid_R', nx - this.worldX + nr * 1.08, ny - this.worldY, 1, 0);
            }
            px = nx; py = ny; pr = nr;
        }
        this.registerLocalSocket('tailBase', px - this.worldX, py - this.worldY, Math.cos(posture.tailBaseAngle), Math.sin(posture.tailBaseAngle));

        const bodyCenter = { x: this.worldX + leanDx * 0.5, y: this.worldY + totalLen * 0.5 * posture.yCompression };
        const out = this.genome.socketOutward;
        const minDelta = Math.max(2.5, this.genome.legThickness * 0.26);

        ['shoulder_L', 'shoulder_R', 'hip_L', 'hip_R', 'mid_L', 'mid_R'].forEach(n => {
            pushSocketOutward(this.ctx, n, bodyCenter.x, bodyCenter.y, out * (n.includes('shoulder') ? 0.65 : 0.5), minDelta);
        });
    }
}

class TorsoArthropod extends CreatureModule {
    generate() {
        const conf = BodyPlanConfigs[this.genome.bodyPlan] || BodyPlanConfigs.Arthropod;
        const sizeScale = Math.pow(this.genome.mass / 5000, 0.28);
        const posture = postureParams(this.genome, sizeScale);
        const r = (15 + this.genome.bodyWidth * 25) * sizeScale;
        const headR = r * 1.15;

        const p0 = new Ellipsoid(this.worldX, this.worldY, headR * this.genome.shoulderWidthScale, headR * 0.85, posture.spineLean * 0.2, 'smooth_add', r * 0.1);
        this.primitives.push(p0); this.ctx.geometry.torsoBodyPrimitives.push(p0);

        const hasWaist = conf.segmentCount >= 3;
        if (hasWaist) {
            const p1 = new Ellipsoid(this.worldX + posture.spineLean * r * 0.5, this.worldY + r * 1.6, r * 0.52, r * 0.45, 0, 'smooth_add', r * 0.15);
            this.primitives.push(p1); this.ctx.geometry.torsoBodyPrimitives.push(p1);
        }
        const abdomenY = this.worldY + r * (hasWaist ? 3.2 : 2.4);
        const abdomenLen = r * (1.5 + conf.thoraxRatio * 0.8);
        const p2 = new Ellipsoid(this.worldX + posture.spineLean * r * 0.8, abdomenY, r * 1.25, abdomenLen, posture.archAmp * 0.3, 'smooth_add', r * 0.15);
        this.primitives.push(p2); this.ctx.geometry.torsoBodyPrimitives.push(p2);

        this.registerLocalSocket('neck', 0, -headR * 0.9, 0, -1);
        this.registerLocalSocket('shoulder_L', -r * 1.25 * this.genome.shoulderWidthScale, 0 + posture.shoulderShiftY * 0.3, -1, 0);
        this.registerLocalSocket('shoulder_R', r * 1.25 * this.genome.shoulderWidthScale, 0 + posture.shoulderShiftY * 0.3, 1, 0);
        this.registerLocalSocket('mid_L', -r * 1.15, r * 1.4, -1, 0);
        this.registerLocalSocket('mid_R', r * 1.15, r * 1.4, 1, 0);
        this.registerLocalSocket('hip_L', -r * 1.05, r * (hasWaist ? 2.6 : 2.0) + posture.hipShiftY * 0.3, -1, 0);
        this.registerLocalSocket('hip_R', r * 1.05, r * (hasWaist ? 2.6 : 2.0) + posture.hipShiftY * 0.3, 1, 0);
        this.registerLocalSocket('rear_L', -r * 0.9, r * (hasWaist ? 3.4 : 2.8), -1, 0);
        this.registerLocalSocket('rear_R', r * 0.9, r * (hasWaist ? 3.4 : 2.8), 1, 0);
        this.registerLocalSocket('tailBase', posture.spineLean * r * 0.9, abdomenY - this.worldY + abdomenLen * 0.85, Math.cos(posture.tailBaseAngle), Math.sin(posture.tailBaseAngle));

        const bodyCenter = { x: this.worldX, y: this.worldY + r * 1.9 };
        const out = this.genome.socketOutward * 0.65;
        const minDelta = Math.max(2.2, this.genome.legThickness * 0.24);
        ['shoulder_L', 'shoulder_R', 'mid_L', 'mid_R', 'hip_L', 'hip_R', 'rear_L', 'rear_R'].forEach(n => {
            pushSocketOutward(this.ctx, n, bodyCenter.x, bodyCenter.y, out, minDelta);
        });
    }
}

class TorsoCephalopod extends CreatureModule {
    generate() {
        const sizeScale = Math.pow(this.genome.mass / 5000, 0.28);
        const posture = postureParams(this.genome, sizeScale);
        const r = (25 + this.genome.bodyWidth * 30) * sizeScale;
        const p = new Ellipsoid(this.worldX, this.worldY - r, r * 1.2, r * 1.8, posture.spineLean * 0.2, 'smooth_add', r * 0.5);
        this.primitives.push(p); this.ctx.geometry.torsoBodyPrimitives.push(p);

        this.registerLocalSocket('neck', 0, r * 0.5, 0, 1);
        for (let i = 0; i < 8; i++) {
            const spread = lerp(-0.9, 0.9, i / 7);
            const dx = Math.sin(spread), dy = Math.cos(spread);
            const n = `limb_${i}`;
            this.registerLocalSocket(n, dx * r * 0.95, r * 0.75, dx, dy);
            pushSocketOutward(this.ctx, n, this.worldX, this.worldY - r * 0.3, this.genome.socketOutward * 0.35, Math.max(1.8, this.genome.legThickness * 0.2));
        }
    }
}

class TorsoRadial extends CreatureModule {
    generate() {
        const sizeScale = Math.pow(this.genome.mass / 5000, 0.28);
        const posture = postureParams(this.genome, sizeScale);
        const r = (15 + this.genome.bodyWidth * 25) * sizeScale;
        const p = new Ellipsoid(this.worldX, this.worldY, r, r * 0.5, posture.spineLean * 0.15, 'smooth_add', r * 0.2);
        this.primitives.push(p); this.ctx.geometry.torsoBodyPrimitives.push(p);

        this.registerLocalSocket('neck', 0, 0, 0, -1);
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const n = `limb_${i}`;
            this.registerLocalSocket(n, Math.cos(angle) * r * 1.05, Math.sin(angle) * r * 1.05, Math.cos(angle), Math.sin(angle));
            pushSocketOutward(this.ctx, n, this.worldX, this.worldY, this.genome.socketOutward * 0.28, Math.max(1.8, this.genome.legThickness * 0.2));
        }
    }
}

const HEAD_REGION_MIDLINE = { forehead: -0.35, crown: -1.3, rear: Math.PI };
const HEAD_REGION_LATERAL = { temple: 0.55, side: 1.05, cheek: 1.55, jawLine: 2.0 };

function buildHeadAttachmentRegions(ctx, localPrimitives, cx, cy, forwardAngle, maxR) {
    const regions = {};
    for (const name in HEAD_REGION_MIDLINE) {
        regions[name] = marchToSurface(localPrimitives, cx, cy, forwardAngle + HEAD_REGION_MIDLINE[name], maxR);
    }
    for (const name in HEAD_REGION_LATERAL) {
        const mag = HEAD_REGION_LATERAL[name];
        regions[name + '_L'] = marchToSurface(localPrimitives, cx, cy, forwardAngle - mag, maxR);
        regions[name + '_R'] = marchToSurface(localPrimitives, cx, cy, forwardAngle + mag, maxR);
    }
    ctx.geometry.head.attachmentRegions = regions;
    for (const name in regions) {
        const r = regions[name];
        ctx.registerSocket('region_' + name, r.x, r.y, r.dirX, r.dirY, 0);
    }
    return regions;
}

// Eye Clusters
const EYE_CLUSTER_STYLES = {
    1: ['Forehead', 'SideMounted'],
    2: ['Horizontal', 'Diagonal', 'Vertical', 'OffsetBilateral', 'UnevenBilateral', 'BrokenSymmetry', 'Arc'],
    3: ['Triangle', 'Arc', 'BrokenSymmetry'],
    4: ['Diamond', 'Crown', 'Arc']
};

class EyeClusterGenerator {
    static generate(ctx, count, craniumR) {
        if (count === 0) return { style: 'None', eyes: [] };
        const rng = mulberry32(subSeed(ctx.seed, 'eyeCluster'));
        const styles = EYE_CLUSTER_STYLES[count] || EYE_CLUSTER_STYLES[2];
        const style = styles[Math.floor(rng() * styles.length)];

        const headScale = clamp(craniumR / 45, 0.45, 2.2);
        const baseSpread = lerp(0.24, 0.62, clamp((headScale - 0.45) / 1.75, 0, 1));
        const countBoost = lerp(1.0, 1.45, clamp((count - 1) / 3, 0, 1));
        const spread = baseSpread * countBoost * lerp(0.9, 1.2, rng());

        const eyes = [];
        const push = (offset, sizeMult = 1, region = null, regionJitter = 0) => eyes.push({ angleOffset: offset, sizeMult, region, regionJitter });
        const span = (n) => (n <= 1 ? 0.5 : 1 / (n - 1));

        const regionPool = count >= 3
            ? ['forehead', 'temple', 'side', 'cheek']
            : ['forehead', 'temple', 'upperCheek'];

        switch (style) {
            case 'Forehead':
                push(0, 1.0, 'forehead', 0.16);
                break;
            case 'SideMounted':
                push((rng() < 0.5 ? -1 : 1) * spread * 1.35, 1.0, 'side', 0.24);
                break;
            case 'Horizontal':
                for (let i = 0; i < count; i++) push(lerp(-spread, spread, i * span(count)), 1, i % 2 ? 'temple' : 'forehead', 0.22);
                break;
            case 'Vertical':
                for (let i = 0; i < count; i++) push(lerp(-spread * 1.3, spread * 0.4, i * span(count)), 1, 'forehead', 0.2);
                break;
            case 'Diagonal':
                for (let i = 0; i < count; i++) push(lerp(-spread, spread, i * span(count)) * (1 + i * 0.12), 1, i % 2 ? 'temple' : 'forehead', 0.24);
                break;
            case 'OffsetBilateral':
                push(-spread * 1.0, 1, 'temple', 0.22); push(spread * 0.68, 1, 'forehead', 0.2);
                break;
            case 'UnevenBilateral':
                push(-spread, 0.88, 'temple', 0.2); push(spread, 1.2, 'forehead', 0.2);
                break;
            case 'BrokenSymmetry':
                for (let i = 0; i < count; i++) push((rng() - 0.5) * spread * 2.5, lerp(0.72, 1.2, rng()), regionPool[i % regionPool.length], 0.28);
                break;
            case 'Arc':
                for (let i = 0; i < count; i++) push(lerp(-spread * 1.5, spread * 1.5, i * span(count)), 1, i < 2 ? 'temple' : 'side', 0.26);
                break;
            case 'Triangle':
                push(0, 1.1, 'forehead', 0.16); push(-spread * 1.2, 0.96, 'temple', 0.24); push(spread * 1.2, 0.96, 'side', 0.24);
                break;
            case 'Diamond':
                push(0, 1.12, 'forehead', 0.15); push(-spread * 1.3, 1, 'temple', 0.22); push(spread * 1.3, 1, 'side', 0.22); push(Math.PI * 0.18, 0.9, 'cheek', 0.16);
                break;
            case 'Crown':
                for (let i = 0; i < count; i++) push(lerp(-spread * 1.7, spread * 1.7, i * span(count)) - 0.25, 1, 'crown', 0.2);
                break;
            default:
                for (let i = 0; i < count; i++) push(lerp(-spread, spread, i * span(count)), 1, 'forehead', 0.2);
        }

        return { style, eyes, spread };
    }
}

class HeadModule extends CreatureModule {
    generate() {
        const sizeScale = Math.pow(this.genome.mass / 5000, 0.25);
        const craniumR = (10 + this.genome.bodyWidth * 22) * sizeScale * this.genome.headSize * this.genome.headWidth;
        const neckLen = (10 + this.genome.neckLength * 40) * sizeScale;
        const neckThick = clamp(this.genome.neckThickness * sizeScale * 10, craniumR * 0.22, craniumR * 0.72);

        const posture = this.ctx.geometry.posture || {};
        const postureTilt = (posture.spineLean || 0) * 0.25;
        const tilt = this.genome.headTilt * Math.PI * 0.6 + postureTilt;

        const craniumX = this.worldX + Math.sin(tilt) * neckLen * 0.4;
        const craniumY = this.worldY - Math.cos(tilt) * neckLen;
        this.primitives.push(new Capsule(this.worldX, this.worldY, craniumX, craniumY, neckThick * 0.58, craniumR * 0.98, 'smooth_add', craniumR * 0.6));
        this.primitives.push(new Sphere(craniumX, craniumY, craniumR, 'smooth_add', craniumR * 0.5));

        const snoutL = craniumR * this.genome.snoutLength * 1.5;
        const snoutX = craniumX + Math.sin(tilt) * snoutL;
        const snoutY = craniumY + Math.cos(tilt) * snoutL + craniumR * 0.2;
        this.primitives.push(new Capsule(craniumX, craniumY, snoutX, snoutY, craniumR * 0.85, craniumR * this.genome.chinTaper, 'smooth_add', craniumR * 0.5));

        const jawL = craniumR * this.genome.jawDepth * 1.3;
        const jawX = craniumX + Math.sin(tilt - 0.2) * jawL;
        const jawY = craniumY + Math.cos(tilt - 0.2) * jawL + craniumR * 0.5;
        this.primitives.push(new Capsule(craniumX, craniumY, jawX, jawY, craniumR * 0.75, craniumR * this.genome.chinTaper * 0.6, 'smooth_add', craniumR * 0.5));

        const forwardAngle = Math.PI / 2 - tilt;
        const projectMaxR = craniumR * 2 + Math.max(snoutL, jawL) * 1.3;

        const cluster = EyeClusterGenerator.generate(this.ctx, this.genome.eyeCount, craniumR);
        const baseEyeR = craniumR * lerp(0.34, 0.16, smoothstep(1, 4, cluster.eyes.length));
        const regions = buildHeadAttachmentRegions(this.ctx, this.primitives, craniumX, craniumY, forwardAngle, projectMaxR);

        const eyeSpreadFromHead = lerp(0.12, 0.36, clamp((craniumR - 14) / 52, 0, 1));

        cluster.eyes.forEach((eye, i) => {
            let worldAngle = forwardAngle + eye.angleOffset;
            if (eye.region && regions) {
                // deterministic wrap-around by region target and slight jitter
                let target = null;
                if (eye.region === 'forehead') target = regions.forehead;
                else if (eye.region === 'crown') target = regions.crown;
                else if (eye.region === 'temple') target = (i % 2 === 0 ? regions.temple_L : regions.temple_R);
                else if (eye.region === 'side') target = (i % 2 === 0 ? regions.side_L : regions.side_R);
                else if (eye.region === 'cheek' || eye.region === 'upperCheek') target = (i % 2 === 0 ? regions.cheek_L : regions.cheek_R);

                if (target) {
                    const a = Math.atan2(target.y - craniumY, target.x - craniumX);
                    const jitter = (i - (cluster.eyes.length - 1) * 0.5) * eyeSpreadFromHead * 0.22 + (eye.regionJitter || 0) * ((i % 2 === 0) ? -0.22 : 0.22);
                    worldAngle = a + jitter;
                }
            }

            const p = marchToSurface(this.primitives, craniumX, craniumY, worldAngle, projectMaxR);

            const localOff = eye.angleOffset;
            const lateralSign = Math.sign(localOff);
            const asymMult = 1 + lateralSign * this.genome.asymmetryBias * this.genome.asymmetry * 0.25;
            const centerComp = (lateralSign === 0) ? 1 : asymMult;
            const r = baseEyeR * eye.sizeMult * centerComp;

            this.primitives.push(new Sphere(p.x, p.y, r, 'subtract', 0));
            this.registerLocalSocket('eye_' + i, p.x - this.worldX, p.y - this.worldY, p.dirX, p.dirY, r);
        });

        this.ctx.eyeClusterStyle = cluster.style;
        this.registerLocalSocket('mouth', snoutX - this.worldX, snoutY - this.worldY, 0, 1);

        this.ctx.geometry.head.headCenter = { x: craniumX + Math.sin(tilt) * snoutL * 0.25, y: lerp(craniumY, snoutY, 0.4) };
        this.ctx.geometry.head.headR = craniumR * 1.1;
        this.ctx.geometry.head.neckThicknessPx = neckThick;
    }
}

class LimbModule extends CreatureModule {
    constructor(ctx, rng, side) { super(ctx, rng); this.side = side; }
    generate() {
        const genome = this.genome;

        const asymmetryMod = 1 + this.side * genome.asymmetryBias * genome.asymmetry * 0.12;
        const legLenPx = genome.legLength * asymmetryMod;
        const baseDiam = genome.legThickness * lerp(0.94, 1.06, clamp(genome.bodyWidth / 2.2, 0, 1));
        const jointRad = genome.jointRadius * lerp(0.9, 1.1, clamp(genome.bodyLength / 3.5, 0, 1));

        const dLen = Math.hypot(this.dirX, this.dirY) || 1;
        const ndx = this.dirX / dLen, ndy = this.dirY / dLen;

        const radiating = genome.bodyPlan === "Radial" || genome.bodyPlan === "Cephalopod";

        const marginPx = genome.limbRootOffset + baseDiam * 0.55;
        const originX = this.worldX + ndx * marginPx;
        const originY = this.worldY + ndy * marginPx;

        const stance = lerp(0.32, 1.0, genome.stanceRaw) * lerp(0.86, 1.24, clamp(genome.bodyWidth / 2.2, 0, 1));
        let targetX, targetY;
        if (radiating) {
            targetX = originX + ndx * legLenPx;
            targetY = originY + ndy * legLenPx;
        } else {
            targetX = originX + ndx * legLenPx * 0.45 + this.side * legLenPx * stance * 0.62;
            targetY = originY + legLenPx * 0.88;
        }

        const chain = [{ x: originX, y: originY }];
        let cx = originX, cy = originY;
        for (let s = 0; s < 3; s++) {
            cx += (ndx * 0.28 + this.side * 0.72) * (legLenPx / 3);
            cy += (radiating ? ndy : 1) * (legLenPx / 3);
            chain.push({ x: cx, y: cy });
        }

        const lengths = []; let totalLen = 0;
        for (let i = 0; i < chain.length - 1; i++) {
            const dist = Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].y - chain[i].y);
            lengths.push(dist); totalLen += dist;
        }

        if (Math.hypot(targetX - originX, targetY - originY) < totalLen) {
            for (let iter = 0; iter < 4; iter++) {
                chain[chain.length - 1].x = targetX; chain[chain.length - 1].y = targetY;
                for (let i = chain.length - 2; i >= 0; i--) {
                    const r = Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].y - chain[i].y);
                    const lambda = lengths[i] / (r || 1);
                    chain[i].x = (1 - lambda) * chain[i + 1].x + lambda * chain[i].x;
                    chain[i].y = (1 - lambda) * chain[i + 1].y + lambda * chain[i].y;
                }
                chain[0].x = originX; chain[0].y = originY;
                for (let i = 0; i < chain.length - 1; i++) {
                    const r = Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].y - chain[i].y);
                    const lambda = lengths[i] / (r || 1);
                    chain[i + 1].x = (1 - lambda) * chain[i].x + lambda * chain[i + 1].x;
                    chain[i + 1].y = (1 - lambda) * chain[i].y + lambda * chain[i + 1].y;
                }
            }
        }

        this.primitives.push(new Capsule(this.worldX, this.worldY, originX, originY, baseDiam * 1.2, baseDiam * 1.04, 'smooth_add', baseDiam * 0.28));

        const profile = [1.0, 0.78, 0.53, 0.36];
        for (let i = 0; i < chain.length - 1; i++) {
            const r1 = baseDiam * profile[i], r2 = baseDiam * profile[i + 1];
            this.primitives.push(new Capsule(chain[i].x, chain[i].y, chain[i + 1].x, chain[i + 1].y, r1, r2, 'smooth_add', jointRad * 0.16));
            if (i < chain.length - 2) {
                this.primitives.push(new Sphere(chain[i + 1].x, chain[i + 1].y, jointRad * profile[i + 1] * 0.8, 'smooth_add', jointRad * 0.1));
            }
        }
        const foot = chain[chain.length - 1];
        const footR = baseDiam * profile[profile.length - 1];
        this.primitives.push(new Sphere(foot.x, foot.y, footR * 1.28, 'smooth_add', footR * 0.3));
    }
}

class TailModule extends CreatureModule {
    generate() {
        const genome = this.genome;
        if (genome.tailLength < 0.12) return;

        const sizeScale = Math.pow(genome.mass / 5000, 0.28);
        const segs = clamp(Math.round((3 + Math.round(genome.tailLength * 3)) * genome.tailSegmentFactor), 3, 10);
        const segLen = 24 * genome.tailLength * sizeScale;
        const baseFromGenome = Math.max(genome.tailBaseThickness, (7 + genome.bodyWidth * 9) * sizeScale);
        let px = this.worldX, py = this.worldY, pr = baseFromGenome;

        const posture = this.ctx.geometry.posture || { tailBaseAngle: Math.PI / 2 };
        let angle = posture.tailBaseAngle + (this.rng() - 0.5) * 0.4;

        for (let i = 0; i < segs - 1; i++) {
            const t = i / (segs - 1);
            angle += (this.rng() - 0.5) * 0.42;
            const nx = px + Math.cos(angle) * segLen, ny = py + Math.sin(angle) * segLen;
            const taper = Math.pow(1 - t, 0.54);
            const nr = Math.max(2.1, pr * taper);
            this.primitives.push(new Capsule(px, py, nx, ny, pr, nr, 'smooth_add', Math.max(pr, nr) * 0.2));
            px = nx; py = ny; pr = nr;
        }

        const t = (segs - 1) / segs;
        angle += (this.rng() - 0.5) * 0.42;
        const tipR = Math.max(1.9, pr * Math.pow(1 - t, 0.54));
        const nx = px + Math.cos(angle) * segLen, ny = py + Math.sin(angle) * segLen;

        if (genome.tailType === "Club") {
            this.primitives.push(new Capsule(px, py, nx, ny, pr * 0.8, pr * 1.5, 'smooth_add', pr * 0.3));
            this.primitives.push(new Sphere(nx, ny, pr * 1.6, 'smooth_add', pr * 0.4));
        } else if (genome.tailType === "Paddle") {
            this.primitives.push(new Ellipsoid(nx, ny, pr * 1.85, segLen * 0.58, angle + Math.PI / 2, 'smooth_add', pr * 0.3));
        } else if (genome.tailType === "Forked") {
            const branch = 0.35;
            for (const dir of [-1, 1]) {
                const fa = angle + dir * branch;
                const fx = px + Math.cos(fa) * segLen, fy = py + Math.sin(fa) * segLen;
                this.primitives.push(new Capsule(px, py, fx, fy, pr * 0.66, tipR * 0.62, 'smooth_add', pr * 0.2));
            }
        } else {
            this.primitives.push(new Capsule(px, py, nx, ny, pr, tipR, 'smooth_add', Math.max(pr, tipR) * 0.2));
        }
    }
}


class VertebrateGrammar {
    static execute(ctx, rng) {
        const torso = new TorsoVertebrate(ctx, rng);
        torso.build(0, 0);

        const head = new HeadModule(ctx, rng);
        torso.attach(head, 'neck');

        const tail = new TailModule(ctx, rng);
        if (ctx.getSocket('tailBase')) torso.attach(tail, 'tailBase');

        const conf = BodyPlanConfigs[ctx.genome.bodyPlan] || BodyPlanConfigs.Vertebrate;
        if (!conf.allowsLimbs) return;

        let pairs = Math.floor(ctx.genome.limbPairsRaw * 3) + 1;
        if (ctx.genome.bodyPlan === "Biped" || ctx.genome.bodyPlan === "Quadruped" || ctx.genome.bodyPlan === "Winged") pairs = 2;
        if (ctx.genome.bodyPlan === "Tripod") pairs = 1;

        if (pairs >= 1) { torso.attach(new LimbModule(ctx, rng, -1), 'shoulder_L'); torso.attach(new LimbModule(ctx, rng, 1), 'shoulder_R'); }
        if (pairs >= 2 && ctx.genome.bodyPlan !== "Tripod") { torso.attach(new LimbModule(ctx, rng, -1), 'hip_L'); torso.attach(new LimbModule(ctx, rng, 1), 'hip_R'); }
        else if (ctx.genome.bodyPlan === "Tripod") { torso.attach(new LimbModule(ctx, rng, 0), 'tailBase'); }
        if (pairs >= 3) { torso.attach(new LimbModule(ctx, rng, -1), 'mid_L'); torso.attach(new LimbModule(ctx, rng, 1), 'mid_R'); }
    }
}

class ArthropodGrammar {
    static execute(ctx, rng) {
        const torso = new TorsoArthropod(ctx, rng);
        torso.build(0, 0);
        const head = new HeadModule(ctx, rng);
        torso.attach(head, 'neck');

        torso.attach(new LimbModule(ctx, rng, -1), 'shoulder_L'); torso.attach(new LimbModule(ctx, rng, 1), 'shoulder_R');
        torso.attach(new LimbModule(ctx, rng, -1), 'mid_L'); torso.attach(new LimbModule(ctx, rng, 1), 'mid_R');
        torso.attach(new LimbModule(ctx, rng, -1), 'hip_L'); torso.attach(new LimbModule(ctx, rng, 1), 'hip_R');
        if (ctx.genome.bodyPlan === "Arachnoid") {
            torso.attach(new LimbModule(ctx, rng, -1), 'rear_L'); torso.attach(new LimbModule(ctx, rng, 1), 'rear_R');
        }
    }
}

class CephalopodGrammar {
    static execute(ctx, rng) {
        const torso = new TorsoCephalopod(ctx, rng);
        torso.build(0, 0);
        const head = new HeadModule(ctx, rng);
        torso.attach(head, 'neck');

        for (let i = 0; i < 8; i++) {
            torso.attach(new LimbModule(ctx, rng, i % 2 === 0 ? -1 : 1), `limb_${i}`);
        }
    }
}

class RadialGrammar {
    static execute(ctx, rng) {
        const torso = new TorsoRadial(ctx, rng);
        torso.build(0, 0);
        const head = new HeadModule(ctx, rng);
        torso.attach(head, 'neck');

        let arms = Math.floor(ctx.genome.limbPairsRaw * 3) + 3;
        arms = clamp(arms, 3, 6);
        for (let i = 0; i < arms; i++) {
            torso.attach(new LimbModule(ctx, rng, i % 2 === 0 ? -1 : 1), `limb_${i}`);
        }
    }
}

const GrammarRegistry = {
    Vertebrate: VertebrateGrammar,
    Quadruped: VertebrateGrammar,
    Biped: VertebrateGrammar,
    Winged: VertebrateGrammar,
    Tripod: VertebrateGrammar,
    Serpentine: VertebrateGrammar,
    Arthropod: ArthropodGrammar,
    Insectoid: ArthropodGrammar,
    Arachnoid: ArthropodGrammar,
    Cephalopod: CephalopodGrammar,
    Radial: RadialGrammar
};

// Feature Generators
class EyeGenerator {
    static generate(ctx) {
        const genome = ctx.genome;
        const eyeSocketNames = Object.keys(ctx.sockets).filter(name => name.startsWith('eye_'));
        const eyes = eyeSocketNames.map(name => {
            const sock = ctx.getSocket(name);
            return { x: sock.x, y: sock.y, radius: sock.radius, dirX: sock.dirX, dirY: sock.dirY };
        });
        ctx.geometry.eyePositions = eyes;
        ctx.eyes = {
            eyeCount: eyes.length, scleraVisible: eyes.length > 0, irisRadius: 0.7, pupilRadius: 0.4,
            pupilType: genome.pupilType, eyelidTop: 0.2, eyelidBottom: 0.2,
            socketDepth: 0.6, highlightStrength: 0.8, irisPattern: 0.5
        };
    }
}

class MaterialGenerator {
    static generate(ctx) {
        const genome = ctx.genome;
        const baseHue = genome.skinHue * 360;
        const scheme = genome.paletteScheme;
        let accentHue = baseHue + (scheme === "complementary" ? 180 : scheme === "analogous" ? 32 : 120);
        const sat = 38 + genome.skinBrightness * 32, light = 28 + genome.skinBrightness * 34;

        ctx.materials = {
            baseColorRGB: hslToRgb(baseHue, sat, light),
            accentColorRGB: hslToRgb(accentHue, Math.min(88, sat + 18), Math.max(18, light - 12)),
            highlightColorRGB: hslToRgb(baseHue, Math.max(20, sat - 18), Math.min(88, light + 30)),
            eyeColorRGB: hslToRgb(accentHue + 15, 60, 50),
            patternScaleMultiplier: 0.05 * Math.pow(5000 / genome.mass, 0.2) * lerp(1.3, 0.7, Math.min(1, genome.bodyWidth / 2.2))
        };
    }
}


function computeRawBounds(ctx) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let p of ctx.geometry.allBones) {
        if (p.op === 'subtract') continue;
        const b = p.bounds();
        minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX);
        minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY);
    }
    for (let e of ctx.geometry.eyePositions) {
        minX = Math.min(minX, e.x - e.radius);
        maxX = Math.max(maxX, e.x + e.radius);
        minY = Math.min(minY, e.y - e.radius);
        maxY = Math.max(maxY, e.y + e.radius);
    }
    if (minX === Infinity) { minX = minY = 0; maxX = maxY = 1; }
    return { minX, minY, maxX, maxY };
}

function clampCreatureExtent(ctx, maxAspect = 3.2) {
    const b = computeRawBounds(ctx);
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    if (w <= 0 || h <= 0) return;

    let axis = null, factor = 1, center = 0;
    if (w / h > maxAspect) { axis = 'x'; factor = (h * maxAspect) / w; center = (b.minX + b.maxX) / 2; }
    else if (h / w > maxAspect) { axis = 'y'; factor = (w * maxAspect) / h; center = (b.minY + b.maxY) / 2; }
    if (!axis) return;

    for (const p of ctx.geometry.allBones) p.squeezeAxis(axis, factor, center);
    for (const e of ctx.geometry.eyePositions) {
        if (axis === 'x') e.x = center + (e.x - center) * factor;
        else e.y = center + (e.y - center) * factor;
    }
    if (ctx.geometry.head.headCenter) {
        const hc = ctx.geometry.head.headCenter;
        if (axis === 'x') hc.x = center + (hc.x - center) * factor;
        else hc.y = center + (hc.y - center) * factor;
    }
}

function fitToBounds(ctx, targetW, targetH, padding) {
    clampCreatureExtent(ctx);
    const { minX, minY, maxX, maxY } = computeRawBounds(ctx);

    const w = maxX - minX, h = maxY - minY;
    const scale = Math.min((targetW - padding * 2) / (w || 1), (targetH - padding * 2) / (h || 1));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const dx = targetW / 2 - cx * scale, dy = targetH / 2 - cy * scale;

    for (let p of ctx.geometry.allBones) { p.scale(scale); p.translate(dx, dy); }
    for (let e of ctx.geometry.eyePositions) { e.x = e.x * scale + dx; e.y = e.y * scale + dy; e.radius *= scale; }

    if (ctx.geometry.head.headCenter) {
        ctx.geometry.head.headCenter.x = ctx.geometry.head.headCenter.x * scale + dx;
        ctx.geometry.head.headCenter.y = ctx.geometry.head.headCenter.y * scale + dy;
        ctx.geometry.head.headR *= scale;
    }

    if (ctx.materials && ctx.materials.patternScaleMultiplier) {
        ctx.materials.patternScaleMultiplier /= scale;
    }
}

function classifyCreature(genome) {
    return {
        bodyPlan: genome.bodyPlan,
        size: genome.mass > 20000 ? "Massive" : genome.mass < 5000 ? "Small" : "Medium",
        diet: genome.niche === "Predator" ? "Carnivore" : genome.niche === "Prey" ? "Herbivore" : "Filter Feeder",
        vision: genome.eyePlacement + " Vision",
        locomotion: genome.bodyPlan === "Serpentine" ? "Slithering" : "Walking",
        temperament: genome.niche === "Predator" ? "Aggressive" : "Skittish"
    };
}


function correctSocketVisibility(ctx) {
    const names = Object.keys(ctx.sockets).filter(n =>
        n.startsWith('shoulder_') || n.startsWith('hip_') || n.startsWith('mid_') || n.startsWith('rear_') || n.startsWith('limb_')
    );
    if (!names.length || !ctx.geometry.torsoBodyPrimitives.length) return;

    let cx = 0, cy = 0, count = 0;
    for (const p of ctx.geometry.torsoBodyPrimitives) {
        const b = p.bounds();
        cx += (b.minX + b.maxX) * 0.5;
        cy += (b.minY + b.maxY) * 0.5;
        count++;
    }
    cx /= (count || 1); cy /= (count || 1);

    const minDelta = Math.max(2.2, ctx.genome.legThickness * 0.24);
    for (const n of names) {
        pushSocketOutward(ctx, n, cx, cy, ctx.genome.socketOutward * 0.2, minDelta);
    }

    for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
            const a = ctx.getSocket(names[i]), b = ctx.getSocket(names[j]);
            if (!a || !b) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1;
            const minD = Math.max(6, ctx.genome.legThickness * 0.8);
            if (d < minD) {
                const ux = dx / d, uy = dy / d;
                const push = (minD - d) * 0.5;
                a.x -= ux * push; a.y -= uy * push;
                b.x += ux * push; b.y += uy * push;
            }
        }
    }
}

function correctHeadNeckTailRatios(ctx) {
    const g = ctx.genome;
    if (!ctx.geometry.head.headR) return;
    const headR = ctx.geometry.head.headR;
    const neckMin = headR * 0.16;
    if (g.neckThickness * 10 < neckMin) {
        g.neckThickness = neckMin / 10;
    }
    const massN = clamp((g.mass - 500) / (50000 - 500), 0, 1);
    const maxTail = lerp(2.2, 3.4, clamp(g.bodyLength / 3.5, 0, 1));
    g.tailLength = Math.min(g.tailLength, maxTail * lerp(0.9, 1.1, massN));
    if (g.tailLength > 2.2) g.tailBaseThickness = Math.max(g.tailBaseThickness, g.legThickness * 1.05);
}

function correctEyeOverlap(ctx) {
    const eyes = ctx.geometry.eyePositions;
    if (!eyes || eyes.length < 2) return;
    for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < eyes.length; i++) {
            for (let j = i + 1; j < eyes.length; j++) {
                const a = eyes[i], b = eyes[j];
                const dx = b.x - a.x, dy = b.y - a.y;
                const d = Math.hypot(dx, dy) || 1;
                const minD = (a.radius + b.radius) * 0.72;
                if (d < minD) {
                    const ux = dx / d, uy = dy / d;
                    const push = (minD - d) * 0.5;
                    a.x -= ux * push; a.y -= uy * push;
                    b.x += ux * push; b.y += uy * push;
                }
            }
        }
    }
}

function validateAndCorrect(ctx) {
    correctHeadNeckTailRatios(ctx);
    correctSocketVisibility(ctx);
    correctEyeOverlap(ctx);
}


function buildDerivedRegistry(ctx) {
    const t = ctx.trace;
    const g = (label) => traceGet(t, label);

    const curiosity = g('genome.stanceRaw') + g('genome.headTilt') + g('genome.accentHueOffset');
    const watchfulness = g('genome.jawDepthRaw') + g('genome.chinTaper');
    const objectInterest = g('genome.patternContrast') + g('genome.asymmetry') + g('genome.neckLengthRaw');

    t.derived.curiosity = curiosity;
    t.derived.watchfulness = watchfulness;
    t.derived.objectInterest = objectInterest;

    const physicalKeys = [
        'genome.mass', 'genome.bodyLength', 'genome.bodyWidth', 'genome.limbPairsRaw',
        'genome.legLengthRaw', 'genome.stanceRaw', 'genome.headSize', 'genome.headWidth',
        'genome.snoutLengthRaw', 'genome.jawDepthRaw', 'genome.chinTaper', 'genome.headTilt',
        'genome.neckLengthRaw', 'genome.tailLength', 'genome.spineCurve'
    ];
    const physicalVector = physicalKeys.map(g);

    let weightedSum = 0, weightTotal = 0;
    physicalVector.forEach((v, i) => { const w = i + 1; weightedSum += v * w; weightTotal += w; });
    const physicalSignature = weightedSum / weightTotal;

    t.derived.physicalKeys = physicalKeys;
    t.derived.physicalVector = physicalVector;
    t.derived.physicalSignature = physicalSignature;

    ctx.registry = {
        curiosity: Number(curiosity.toFixed(4)),
        watchfulness: Number(watchfulness.toFixed(4)),
        objectInterest: Number(objectInterest.toFixed(4)),
        physicalSignature: Number(physicalSignature.toFixed(6))
    };
}


function generateAlien(seed) {
    const ctx = new CreatureContext(seed);

    ctx.genome = generateGenome(seed, ctx.trace);
    ctx.genome = applyCorrelations(ctx.genome, seed, ctx.trace);
    ctx.genome = applyConstraints(ctx.genome);

    const rng = mulberry32(subSeed(seed, "morphology"));
    const grammar = GrammarRegistry[ctx.genome.bodyPlan] || GrammarRegistry.Vertebrate;
    grammar.execute(ctx, rng);

    EyeGenerator.generate(ctx);
    MaterialGenerator.generate(ctx);

    validateAndCorrect(ctx);

    ctx.facts = classifyCreature(ctx.genome);
    buildDerivedRegistry(ctx);

    return ctx;
}

const AlienEngine = {
    generate: generateAlien,
    evaluateField,
    fitToBounds,
    noise2D,
    classifyCreature,
    traceGet
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlienEngine;
    module.exports.generateAlien = generateAlien;
} else if (typeof window !== 'undefined') {
    window.AlienEngine = AlienEngine;
}