/* ============================================================
   PRNG & CORE UTILITIES
   ============================================================ */
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

/* ============================================================
   BODY PLAN CONFIGURATIONS
   ============================================================ */
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

/* ============================================================
   PRIMITIVE SYSTEM
   ============================================================ */
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
        if (d === Infinity && p.op !== 'subtract') { d = pd; } 
        else {
            if (p.op === 'add') d = Math.min(d, pd);
            else if (p.op === 'smooth_add') d = sminExp(d, pd, p.k);
            else if (p.op === 'subtract') d = Math.max(d, -pd);
        }
    }
    return d;
}

/* ============================================================
   CREATURE CONTEXT
   ============================================================ */
class CreatureContext {
    constructor(seed) {
        this.seed = seed;
        this.genome = {};
        
        this.primitives = [];
        this.sockets = {};
        
        this.geometry = { allBones: this.primitives, eyePositions: [], head: {} };
        this.materials = {};
        this.eyes = {};
        this.facts = {};
        this.featureData = {};
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

/* ============================================================
   GENOME GENERATION & CONSTRAINT SOLVERS
   ============================================================ */
function generateGenome(seed) {
    const rng = mulberry32(subSeed(seed, "genome"));
    const skew = (p) => Math.pow(rng(), p);

    return {
        mass: lerp(500, 50000, skew(2.2)),
        bodyPlan: weightedChoice(rng, [
            [0.25, "Quadruped"], [0.20, "Biped"], [0.15, "Serpentine"],
            [0.15, "Insectoid"], [0.10, "Arachnoid"], [0.05, "Tripod"],
            [0.05, "Cephalopod"], [0.05, "Radial"], [0.05, "Winged"]
        ]),
        bodyLength: lerp(0.8, 3.5, rng()),
        bodyWidth: lerp(0.3, 2.2, rng()),
        limbPairsRaw: rng(),
        legLengthRaw: skew(1.5),
        stanceRaw: rng(),
        headSize: lerp(0.4, 2.0, rng()),
        headWidth: lerp(0.4, 2.0, rng()),
        snoutLengthRaw: skew(1.5),
        jawDepthRaw: rng(),
        chinTaper: lerp(0.2, 1.2, rng()),
        headTilt: lerp(-0.4, 0.4, rng()),
        neckLengthRaw: skew(1.6),
        eyeCount: weightedChoice(rng, [[0.07, 0], [0.10, 1], [0.83, 2]]),
        mouthType: weightedChoice(rng, [[0.3, "Jaw"], [0.25, "Mandibles"], [0.2, "Beak"], [0.15, "Proboscis"], [0.1, "Filter"]]),
        tailLength: lerp(0, 4.0, skew(1.4)),
        tailType: weightedChoice(rng, [[0.5, "Whip"], [0.2, "Club"], [0.2, "Paddle"], [0.1, "Forked"]]),
        spineCurve: lerp(-0.8, 0.8, rng()),
        skinHue: rng(),
        skinBrightness: rng(),
        skinPattern: rng(),
        patternStyle: rng(),
        patternContrast: lerp(0.25, 0.85, rng()),
        paletteScheme: weightedChoice(rng, [[0.3, "complementary"], [0.3, "analogous"], [0.25, "triadic"], [0.15, "monochrome"]]),
        accentHueOffset: rng(),
        asymmetry: Math.pow(rng(), 2.5),
        asymmetryBias: rng() < 0.5 ? -1 : 1
    };
}

function applyCorrelations(genome, seed) {
    const rng = mulberry32(subSeed(seed, "ecology"));
    genome.niche = weightedChoice(rng, [[0.45, "Predator"], [0.40, "Prey"], [0.15, "FilterFeeder"]]);

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
    const maxHeadRatio = genome.mass / 15000;
    if (genome.headSize > maxHeadRatio + 1.2) {
        genome.headSize = lerp(genome.headSize, maxHeadRatio + 1.2, 0.8);
    }
    if (genome.mass > 30000) {
        genome.legLengthRaw *= 0.5; 
    }
    if (genome.bodyPlan === "Cephalopod") {
        genome.neckLengthRaw = 0;
        genome.tailLength = 0;
    }
    if (genome.bodyPlan === "Serpentine") {
        genome.bodyLength = Math.max(genome.bodyLength, 2.5);
    }

    genome.jawDepth = lerp(0.2, 1.5, genome.jawDepthRaw);
    genome.snoutLength = lerp(0.1, 2.8, genome.snoutLengthRaw);
    genome.neckLength = lerp(0, 2.5, genome.neckLengthRaw);

    return genome;
}

/* ============================================================
   MODULE BASE CLASS
   ============================================================ */
class CreatureModule {
    constructor(ctx, rng) {
        this.ctx = ctx;
        this.genome = ctx.genome;
        this.rng = rng;
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

/* ============================================================
   ANATOMICAL MODULES
   ============================================================ */
class TorsoVertebrate extends CreatureModule {
    generate() {
        const conf = BodyPlanConfigs[this.genome.bodyPlan] || BodyPlanConfigs.Vertebrate;
        const sizeScale = Math.pow(this.genome.mass / 5000, 0.28);
        const baseR = (10 + this.genome.bodyWidth * 22) * sizeScale;
        const totalLen = (60 + this.genome.bodyLength * 90) * sizeScale;
        
        this.registerLocalSocket('neck', 0, 0, 0, -1);
        let px = this.worldX, py = this.worldY, pr = baseR * 0.5;
        const bowAmount = this.genome.spineCurve * 40 * sizeScale;
        
        for (let i = 0; i <= conf.segmentCount; i++) {
            const t = i / conf.segmentCount;
            const nx = this.worldX + Math.sin(t * Math.PI) * bowAmount;
            const ny = this.worldY + t * totalLen;
            
            let rMult = 1.0;
            if (t < conf.thoraxRatio) rMult = lerp(0.4, 1.4, smoothstep(0, conf.thoraxRatio, t));
            else if (t < conf.pelvisRatio) rMult = lerp(1.4, 0.9, smoothstep(conf.thoraxRatio, conf.pelvisRatio, t));
            else rMult = lerp(0.9, 1.3, smoothstep(conf.pelvisRatio, 1.0, t));
            
            const nr = Math.max(baseR * 0.2, baseR * rMult * (1 - smoothstep(0.9, 1.0, t) * 0.6));
            if (i > 0) this.primitives.push(new Capsule(px, py, nx, ny, pr, nr, 'smooth_add', Math.max(pr, nr) * 0.5));
            
            if (i === 1) {
                this.registerLocalSocket('shoulder_L', nx - this.worldX - nr, ny - this.worldY, -1, 0);
                this.registerLocalSocket('shoulder_R', nx - this.worldX + nr, ny - this.worldY, 1, 0);
            }
            if (i === conf.segmentCount - 1) {
                this.registerLocalSocket('hip_L', nx - this.worldX - nr, ny - this.worldY, -1, 0);
                this.registerLocalSocket('hip_R', nx - this.worldX + nr, ny - this.worldY, 1, 0);
            }
            if (i === Math.floor(conf.segmentCount / 2)) {
                this.registerLocalSocket('mid_L', nx - this.worldX - nr, ny - this.worldY, -1, 0);
                this.registerLocalSocket('mid_R', nx - this.worldX + nr, ny - this.worldY, 1, 0);
            }
            px = nx; py = ny; pr = nr;
        }
        this.registerLocalSocket('tailBase', px - this.worldX, py - this.worldY, 0, 1);
    }
}

class TorsoArthropod extends CreatureModule {
    generate() {
        const conf = BodyPlanConfigs[this.genome.bodyPlan] || BodyPlanConfigs.Arthropod;
        const sizeScale = Math.pow(this.genome.mass / 5000, 0.28);
        const r = (15 + this.genome.bodyWidth * 25) * sizeScale;
        const headR = r * 1.15;
        this.primitives.push(new Ellipsoid(this.worldX, this.worldY, headR, headR * 0.85, 0, 'smooth_add', r * 0.1));

        const hasWaist = conf.segmentCount >= 3;
        if (hasWaist) {
            this.primitives.push(new Ellipsoid(this.worldX, this.worldY + r * 1.6, r * 0.5, r * 0.45, 0, 'smooth_add', r * 0.15));
        }
        const abdomenY = this.worldY + r * (hasWaist ? 3.2 : 2.4);
        const abdomenLen = r * (1.5 + conf.thoraxRatio * 0.8);
        this.primitives.push(new Ellipsoid(this.worldX, abdomenY, r * 1.25, abdomenLen, 0, 'smooth_add', r * 0.15));

        this.registerLocalSocket('neck', 0, -headR * 0.9, 0, -1);
        this.registerLocalSocket('shoulder_L', -r * 1.15, 0, -1, 0);
        this.registerLocalSocket('shoulder_R', r * 1.15, 0, 1, 0);
        this.registerLocalSocket('mid_L', -r * 1.05, r * 1.4, -1, 0);
        this.registerLocalSocket('mid_R', r * 1.05, r * 1.4, 1, 0);
        this.registerLocalSocket('hip_L', -r * 0.95, r * (hasWaist ? 2.6 : 2.0), -1, 0);
        this.registerLocalSocket('hip_R', r * 0.95, r * (hasWaist ? 2.6 : 2.0), 1, 0);
        this.registerLocalSocket('rear_L', -r * 0.75, r * (hasWaist ? 3.4 : 2.8), -1, 0);
        this.registerLocalSocket('rear_R', r * 0.75, r * (hasWaist ? 3.4 : 2.8), 1, 0);
        this.registerLocalSocket('tailBase', 0, abdomenY - this.worldY + abdomenLen * 0.85, 0, 1);
    }
}

class TorsoCephalopod extends CreatureModule {
    generate() {
        const sizeScale = Math.pow(this.genome.mass / 5000, 0.28);
        const r = (25 + this.genome.bodyWidth * 30) * sizeScale;
        this.primitives.push(new Ellipsoid(this.worldX, this.worldY - r, r * 1.2, r * 1.8, 0, 'smooth_add', r * 0.5));
        this.registerLocalSocket('neck', 0, r * 0.5, 0, 1);
        for (let i = 0; i < 8; i++) {
            const spread = lerp(-0.9, 0.9, i / 7);
            const dx = Math.sin(spread), dy = Math.cos(spread);
            this.registerLocalSocket(`limb_${i}`, dx * r * 0.9, r * 0.7, dx, dy);
        }
    }
}

class TorsoRadial extends CreatureModule {
    generate() {
        const sizeScale = Math.pow(this.genome.mass / 5000, 0.28);
        const r = (15 + this.genome.bodyWidth * 25) * sizeScale;
        this.primitives.push(new Ellipsoid(this.worldX, this.worldY, r, r * 0.5, 0, 'smooth_add', r * 0.2));
        this.registerLocalSocket('neck', 0, 0, 0, -1);
        for(let i=0; i<6; i++) {
            const angle = (i/6) * Math.PI * 2;
            this.registerLocalSocket(`limb_${i}`, Math.cos(angle)*r, Math.sin(angle)*r, Math.cos(angle), Math.sin(angle));
        }
    }
}

class HeadModule extends CreatureModule {
    generate() {
        const sizeScale = Math.pow(this.genome.mass / 5000, 0.25);
        const craniumR = (10 + this.genome.bodyWidth * 22) * sizeScale * this.genome.headSize * this.genome.headWidth;
        const neckLen = (10 + this.genome.neckLength * 40) * sizeScale;
        
        const tilt = this.genome.headTilt * Math.PI * 0.6;
        const craniumX = this.worldX + Math.sin(tilt) * neckLen * 0.4;
        const craniumY = this.worldY - Math.cos(tilt) * neckLen;
        this.primitives.push(new Capsule(this.worldX, this.worldY, craniumX, craniumY, craniumR * 0.7, craniumR, 'smooth_add', craniumR * 0.6));
        this.primitives.push(new Sphere(craniumX, craniumY, craniumR, 'smooth_add', craniumR * 0.5));

        const snoutL = craniumR * this.genome.snoutLength * 1.5;
        const snoutX = craniumX + Math.sin(tilt) * snoutL;
        const snoutY = craniumY + Math.cos(tilt) * snoutL + craniumR * 0.2;
        this.primitives.push(new Capsule(craniumX, craniumY, snoutX, snoutY, craniumR * 0.85, craniumR * this.genome.chinTaper, 'smooth_add', craniumR * 0.5));

        const jawL = craniumR * this.genome.jawDepth * 1.3;
        const jawX = craniumX + Math.sin(tilt - 0.2) * jawL;
        const jawY = craniumY + Math.cos(tilt - 0.2) * jawL + craniumR * 0.5;
        this.primitives.push(new Capsule(craniumX, craniumY, jawX, jawY, craniumR * 0.75, craniumR * this.genome.chinTaper * 0.6, 'smooth_add', craniumR * 0.5));

        const socketX = this.genome.eyePlacement === "Forward" ? snoutL * 0.4 : craniumR * 0.2;
        const eyeY = craniumY - craniumR * 0.2;

        const outwardNormal = (cx, cy) => {
            const dx = cx - craniumX, dy = cy - craniumY;
            const len = Math.hypot(dx, dy);
            return len > 1e-6 ? { x: dx / len, y: dy / len } : { x: 0, y: -1 };
        };

        if (this.genome.eyeCount === 1) {
            const eR = craniumR * 0.32;
            const cx = craniumX, cy = eyeY;
            const n = outwardNormal(cx, cy);
            this.primitives.push(new Sphere(cx, cy, eR, 'subtract', 0));
            this.registerLocalSocket('eye_C', cx - this.worldX, cy - this.worldY, n.x, n.y, eR);
        } else if (this.genome.eyeCount === 2) {
            const eR = craniumR * 0.28;
            ['L', 'R'].forEach(side => {
                const dir = side === 'L' ? -1 : 1;
                const asymMult = 1 + dir * this.genome.asymmetryBias * this.genome.asymmetry * 0.25;
                const r = eR * asymMult;
                const cx = craniumX + dir * socketX, cy = eyeY;
                const n = outwardNormal(cx, cy);
                this.primitives.push(new Sphere(cx, cy, r, 'subtract', 0));
                this.registerLocalSocket('eye_' + side, cx - this.worldX, cy - this.worldY, n.x, n.y, r);
            });
        }

        this.registerLocalSocket('mouth', snoutX - this.worldX, snoutY - this.worldY, 0, 1);
        
        this.ctx.geometry.head.headCenter = { x: craniumX + Math.sin(tilt) * snoutL * 0.25, y: lerp(craniumY, snoutY, 0.4) };
        this.ctx.geometry.head.headR = craniumR * 1.1;
    }
}

class LimbModule extends CreatureModule {
    constructor(ctx, rng, side) { super(ctx, rng); this.side = side; }
    generate() {
        const genome = this.genome;
        const sizeScale = Math.pow(genome.mass / 5000, 0.3);

        const asymmetryMod = 1 + this.side * genome.asymmetryBias * genome.asymmetry * 0.15;
        const legLenPx = (30 + genome.legLengthRaw * 60) * sizeScale * asymmetryMod;

        const dLen = Math.hypot(this.dirX, this.dirY) || 1;
        const ndx = this.dirX / dLen, ndy = this.dirY / dLen;

        const radiating = genome.bodyPlan === "Radial" || genome.bodyPlan === "Cephalopod";

        const marginPx = (6 + genome.bodyWidth * 4) * sizeScale;
        const originX = this.worldX + ndx * marginPx;
        const originY = this.worldY + ndy * marginPx;

        const stance = lerp(0.3, 0.85, genome.stanceRaw) + (this.rng() - 0.5) * 0.1;
        let targetX, targetY;
        if (radiating) {
            targetX = originX + ndx * legLenPx;
            targetY = originY + ndy * legLenPx;
        } else {
            targetX = originX + ndx * legLenPx * 0.4 + this.side * legLenPx * stance * 0.6;
            targetY = originY + legLenPx * 0.85;
        }

        const chain = [{ x: originX, y: originY }];
        let cx = originX, cy = originY;
        for (let s = 0; s < 3; s++) {
            cx += (ndx * 0.3 + this.side * 0.7) * (legLenPx / 3);
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

        const baseDiam = (4 + genome.bodyWidth * 7) * Math.pow(genome.mass / 5000, 0.41);
        this.primitives.push(new Capsule(this.worldX, this.worldY, originX, originY, baseDiam * 1.1, baseDiam, 'smooth_add', baseDiam * 0.3));

        const profile = [1.0, 0.72, 0.42, 0.3];
        for (let i = 0; i < chain.length - 1; i++) {
            const r1 = baseDiam * profile[i], r2 = baseDiam * profile[i + 1];
            this.primitives.push(new Capsule(chain[i].x, chain[i].y, chain[i + 1].x, chain[i + 1].y, r1, r2, 'smooth_add', baseDiam * 0.12));
        }
        const foot = chain[chain.length - 1];
        const footR = baseDiam * profile[profile.length - 1];
        this.primitives.push(new Sphere(foot.x, foot.y, footR * 1.2, 'smooth_add', footR * 0.3));
    }
}

class TailModule extends CreatureModule {
    generate() {
        const genome = this.genome;
        if (genome.tailLength < 0.15) return;
        const sizeScale = Math.pow(genome.mass / 5000, 0.28);
        const segs = 3 + Math.round(genome.tailLength * 3);
        const segLen = 25 * genome.tailLength * sizeScale;

        let px = this.worldX, py = this.worldY, pr = (8 + genome.bodyWidth * 10) * sizeScale;
        let angle = Math.PI / 2 + (this.rng() - 0.5) * 0.6;

        for (let i = 0; i < segs - 1; i++) {
            const t = i / (segs - 1);
            angle += (this.rng() - 0.5) * 0.5;
            const nx = px + Math.cos(angle) * segLen, ny = py + Math.sin(angle) * segLen;
            const nr = Math.max(2, pr * Math.pow(1 - t, 0.5));
            this.primitives.push(new Capsule(px, py, nx, ny, pr, nr, 'smooth_add', Math.max(pr, nr) * 0.2));
            px = nx; py = ny; pr = nr;
        }

        const t = (segs - 1) / segs;
        angle += (this.rng() - 0.5) * 0.5;
        const tipR = Math.max(2, pr * Math.pow(1 - t, 0.5));
        const nx = px + Math.cos(angle) * segLen, ny = py + Math.sin(angle) * segLen;

        if (genome.tailType === "Club") {
            this.primitives.push(new Capsule(px, py, nx, ny, pr * 0.7, pr * 1.4, 'smooth_add', pr * 0.3));
            this.primitives.push(new Sphere(nx, ny, pr * 1.5, 'smooth_add', pr * 0.4));
        } else if (genome.tailType === "Paddle") {
            this.primitives.push(new Ellipsoid(nx, ny, pr * 1.8, segLen * 0.6, angle + Math.PI / 2, 'smooth_add', pr * 0.3));
        } else if (genome.tailType === "Forked") {
            const branch = 0.35;
            for (const dir of [-1, 1]) {
                const fa = angle + dir * branch;
                const fx = px + Math.cos(fa) * segLen, fy = py + Math.sin(fa) * segLen;
                this.primitives.push(new Capsule(px, py, fx, fy, pr * 0.6, tipR * 0.6, 'smooth_add', pr * 0.2));
            }
        } else {
            this.primitives.push(new Capsule(px, py, nx, ny, pr, tipR, 'smooth_add', Math.max(pr, tipR) * 0.2));
        }
    }
}

/* ============================================================
   TRUE GRAMMAR REGISTRY
   ============================================================ */
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
        
        for(let i=0; i<8; i++) {
            torso.attach(new LimbModule(ctx, rng, i%2===0?-1:1), `limb_${i}`);
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
        for(let i=0; i<arms; i++) {
            torso.attach(new LimbModule(ctx, rng, i%2===0?-1:1), `limb_${i}`);
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

/* ============================================================
   FEATURE GENERATORS
   ============================================================ */
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

function generateAlien(seed) {

    const ctx = new CreatureContext(seed);

    ctx.genome = generateGenome(seed);
    ctx.genome = applyCorrelations(ctx.genome, seed);
    ctx.genome = applyConstraints(ctx.genome);

    const rng = mulberry32(subSeed(seed, "morphology"));
    const grammar = GrammarRegistry[ctx.genome.bodyPlan] || GrammarRegistry.Vertebrate;
    grammar.execute(ctx, rng);
    

    EyeGenerator.generate(ctx);
    MaterialGenerator.generate(ctx);

    ctx.facts = classifyCreature(ctx.genome);

    return ctx;
}


const AlienEngine = {
    generate: generateAlien,
    evaluateField,
    fitToBounds,
    noise2D,
    classifyCreature
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlienEngine;
    module.exports.generateAlien = generateAlien;
} else if (typeof window !== 'undefined') {
    window.AlienEngine = AlienEngine;
}