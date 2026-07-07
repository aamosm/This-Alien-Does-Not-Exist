/* ============================================================
   PRNG (Mulberry32)
   Study/Source: Mulberry32 algorithm by Tommy Ettinger (2017). 
   Constant 0x6D2B79F5 is a Weyl sequence increment derived from 
   the golden ratio to ensure strict uniform distribution.
   ============================================================ */
function mulberry32(a) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

/* ============================================================
   Sub-seed Generator
   Study/Source: Knuth's Multiplicative Hash. 
   Constant 2654435761 is the closest prime to 2^32 / phi 
   (the golden ratio prime). Used for avalanche mixing of strings.
   ============================================================ */
function subSeed(masterSeed, salt) {
    let h = (masterSeed ^ 0) >>> 0;
    for (let i = 0; i < salt.length; i++) {
        h = Math.imul(h ^ salt.charCodeAt(i), 2654435761) >>> 0;
    }
    return h >>> 0;
}

/* ============================================================
   Math Utilities
   ============================================================ */
function lerp(a, b, t) { 
    return a + (b - a) * t; 
}

/* ============================================================
   GLSL Sine Hash
   Study/Source: Classic GLSL pseudo-random generator (W.J.J. Rey, 1998). 
   Multiplier 43758.5453 is a highly irrational scalar designed 
   to severely alias the sine wave and break its periodicity.
   ============================================================ */
function hash11(n) {
    n = Math.sin(n) * 43758.5453;
    return n - Math.floor(n);
}

/* ============================================================
   1D Value Noise
   ============================================================ */
function noise1D(x) {
    const i = Math.floor(x);
    const f = x - i;
    const a = hash11(i);
    const b = hash11(i + 1);
    const u = f * f * (3 - 2 * f);
    return a * (1 - u) + b * u;
}

/* ============================================================
   Genome Generation Functions
   ============================================================ */
function rollEyeCount(rng) {
    const r = rng();
    if (r < 0.95) return 2;
    if (r < 0.99) return 4;
    return 6 + Math.floor(rng() * 3);
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
    if (r < 0.05) return 0;
    if (r < 0.75) return 2;
    if (r < 0.95) return 1;
    return 3;
}

function generateGenome(seed) {
    const skRng = mulberry32(subSeed(seed, "traits-skeleton"));
    const limbRng = mulberry32(subSeed(seed, "traits-limbs"));
    const headRng = mulberry32(subSeed(seed, "traits-head"));
    const skinRng = mulberry32(subSeed(seed, "traits-skin"));

    const skew = (rng, p) => Math.pow(rng(), p);

    return {
        mass: lerp(500, 50000, skew(skRng, 2.2)),
        bodyLength: lerp(0.8, 3.5, skRng()),
        bodyWidth: lerp(0.3, 2.2, skRng()),
        neckLength: lerp(0, 2.5, skew(skRng, 1.6)),
        tailLength: lerp(0, 4.0, skew(skRng, 1.4)),
        spineCurve: lerp(-0.8, 0.8, skRng()),
        bodyTaper: lerp(0.5, 1.5, skRng()),
        limbPairs: rollLimbPairs(limbRng),
        limbSegments: Math.floor(lerp(2, 5, limbRng())),
        legLength: lerp(0.2, 3.0, skew(limbRng, 1.5)),
        footSpread: lerp(0.5, 3.5, limbRng()),
        stance: limbRng(),
        headSize: lerp(0.2, 2.0, headRng()),
        eyeCount: rollEyeCount(headRng),
        hornCount: rollHornCount(headRng),
        skinHue: skinRng(),
        skinBrightness: skinRng(),
        skinPattern: skinRng(),
    };
}

/* ============================================================
   Skeleton Construction: Spine
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

        const taper = 1 - Math.pow(t, genome.bodyTaper) * 0.75;
        const rNoise = noise1D(t * 4 + phase + 50) * 2 - 1;
        const r = Math.max(baseRadius * 0.25, baseRadius * taper * (1 + rNoise * 0.25));

        nodes.push({ x, y, r });
    }
    return nodes;
}

/* ============================================================
   Skeleton Construction: Tail
   ============================================================ */
function buildTail(genome, formRng, lastNode) {
    if (genome.tailLength < 0.15) return [];
    const sizeScale = Math.pow(genome.mass / 5000, 0.28);
    const segs = 2 + Math.round(genome.tailLength * 2);
    const segLen = 30 * genome.tailLength * sizeScale;
    let x = lastNode.x, y = lastNode.y, r = lastNode.r * 0.7;
    let angle = Math.PI / 2 + (formRng() - 0.5) * 0.6;
    const nodes = [];
    for (let i = 0; i < segs; i++) {
        angle += (formRng() - 0.5) * 0.5;
        x += Math.cos(angle) * segLen * 0.2 + (formRng() - 0.5) * 4 * sizeScale;
        y += segLen;
        r *= 0.85;
        nodes.push({ x, y, r: Math.max(2, r) });
    }
    return nodes;
}

/* ============================================================
   Skeleton Construction: Head
   ============================================================ */
function buildHead(genome, formRng, spine) {
    const bodyTop = spine[0];
    const headR = bodyTop.r * (1 + genome.headSize * 1.2);
    const neckLen = (10 + genome.neckLength * 40) * Math.pow(genome.mass / 5000, 0.25);
    const hx = bodyTop.x, hy = bodyTop.y - neckLen;

    const bones = [
        { ax: hx, ay: hy, bx: bodyTop.x, by: bodyTop.y, r1: headR * 0.55, r2: bodyTop.r },
        { ax: hx, ay: hy - headR * 0.3, bx: hx, by: hy + headR * 0.3, r1: headR, r2: headR }
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

/* ============================================================
   Eye Genome — own sub-seeded stream, same pattern as skeleton/
   limbs/skin. Adding new eye traits later never touches other
   systems' rng sequences.
   ============================================================ */
function generateEyeGenome(seed, eyeCount) {
    const rng = mulberry32(subSeed(seed, "traits-eyes"));
    const skew = (p) => Math.pow(rng(), p);

    return {
        eyeCount,
        clusterRadius: lerp(0.18, 0.8, rng()),
        clusterRotation: lerp(-0.55, 0.55, skew(1.4)) * Math.PI, // mostly forward-facing, wide rotations rare
        symmetry: lerp(0.35, 1.0, skew(0.6)),
        eyeRadius: lerp(0.05, 0.22, rng()),
        eyeRadiusVariation: lerp(0, 0.45, rng()),
        irisRadius: lerp(0.5, 0.9, rng()),
        pupilRadius: lerp(0.22, 0.6, rng()),
        pupilShape: rng(),          // 0 = round, 1 = vertical slit — continuous, not two presets
        eyelidTop: lerp(0, 0.4, skew(1.6)),
        eyelidBottom: lerp(0, 0.28, skew(1.9)),
        socketDepth: rng(),
        eyeSpacing: lerp(0.55, 1.7, rng()),
        eyeBulge: rng(),
        eyeColor: rng(),
        irisPattern: rng(),
        highlightStrength: lerp(0.25, 1.0, rng()),
        scleraVisible: rng() > 0.22,
        // Deterministic phase for per-eye jitter, decoded via noise1D at
        // render time. Keeps position/render code a pure function of the
        // genome — no extra rng() calls needed outside this function.
        layoutSeed: rng() * 1000,
    };
}

/* ============================================================
   Eye Layout — pure function of (eyeGenome, headCenter, headR).
   Evenly-spaced points across an arc centered on the face-forward
   angle are ALREADY mirror-symmetric by construction. So `symmetry`
   doesn't blend between two layouts — it directly scales how much
   per-eye noise is allowed to break that symmetry. 1.0 = perfect
   row/ring, lower = organic scatter.
   ============================================================ */
function computeEyePositions(eyeGenome, headCenter, headR) {
    const n = eyeGenome.eyeCount;
    const positions = [];
    if (n === 0) return positions;

    const faceAngle = -Math.PI / 2 + eyeGenome.clusterRotation;
    const arcSpan = n > 1 ? Math.min(Math.PI * 1.7, (n - 1) * 0.4 * eyeGenome.eyeSpacing) : 0;
    const startAngle = faceAngle - arcSpan / 2;
    const step = n > 1 ? arcSpan / (n - 1) : 0;
    const phase = eyeGenome.layoutSeed;
    const jitterAmt = 1 - eyeGenome.symmetry;

    for (let i = 0; i < n; i++) {
        const symmetricAngle = startAngle + i * step;
        const angle = symmetricAngle + (noise1D(i * 12.9 + phase) - 0.5) * jitterAmt * 0.7;

        const sizeJitter = 1 + (noise1D(i * 5.3 + phase + 80) - 0.5) * 2 * eyeGenome.eyeRadiusVariation;
        const eyeR = Math.max(1.5, eyeGenome.eyeRadius * headR * sizeJitter);

        const radiusJitter = 1 + (noise1D(i * 7.7 + phase + 40) - 0.5) * 0.3 * jitterAmt;
        const rawR = eyeGenome.clusterRadius * headR * radiusJitter;
        const r = Math.min(rawR, headR - eyeR * 0.6); // keep eye edge inside the head silhouette

        positions.push({
            x: headCenter.x + Math.cos(angle) * r,
            y: headCenter.y + Math.sin(angle) * r * 0.85,
            radius: eyeR
        });
    }
    return positions;
}

/* ============================================================
   Eye Rendering — layered: socket shadow -> sclera -> iris (with
   continuous streak pattern) -> pupil (round-to-slit) -> bulge
   rim-light -> specular highlight -> eyelid overlap.
   ============================================================ */
function drawEyes(ctx, eyeGenome, head, skinColorRGB) {
    if (eyeGenome.eyeCount === 0) return;
    const positions = computeEyePositions(eyeGenome, head.headCenter, head.headR);
    const [sR, sG, sB] = skinColorRGB;
    const [eR, eG, eB] = hslToRgb(eyeGenome.eyeColor * 360, 60, 45);

    for (const eye of positions) {
        const { x, y, radius } = eye;

        // Socket shadow
        if (eyeGenome.socketDepth > 0.05) {
            ctx.save();
            ctx.globalAlpha = eyeGenome.socketDepth * 0.5;
            ctx.fillStyle = "rgb(0,0,0)";
            ctx.beginPath();
            ctx.ellipse(x, y + radius * 0.15, radius * 1.35, radius * 1.25, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Sclera
        const irisR = eyeGenome.scleraVisible ? radius * eyeGenome.irisRadius : radius * 0.98;
        if (eyeGenome.scleraVisible) {
            ctx.fillStyle = `rgb(${Math.min(255, sR + 70)}, ${Math.min(255, sG + 65)}, ${Math.min(255, sB + 60)})`;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Iris
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, irisR, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = `rgb(${eR | 0}, ${eG | 0}, ${eB | 0})`;
        ctx.fillRect(x - irisR, y - irisR, irisR * 2, irisR * 2);

        const streakCount = Math.round(2 + eyeGenome.irisPattern * 10);
        ctx.globalAlpha = 0.25 + eyeGenome.irisPattern * 0.35;
        ctx.strokeStyle = `rgb(${Math.max(0, eR - 60)}, ${Math.max(0, eG - 60)}, ${Math.max(0, eB - 60)})`;
        ctx.lineWidth = Math.max(0.6, irisR * 0.12);
        for (let s = 0; s < streakCount; s++) {
            const a = (s / streakCount) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * irisR, y + Math.sin(a) * irisR);
            ctx.stroke();
        }
        ctx.restore();

        // Pupil 
        const pupilR = irisR * eyeGenome.pupilRadius;
        const squashX = lerp(1, 0.22, eyeGenome.pupilShape);
        ctx.fillStyle = "rgb(8,8,10)";
        ctx.beginPath();
        ctx.ellipse(x, y, pupilR * squashX, pupilR, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bulge rim-light
        if (eyeGenome.eyeBulge > 0.3) {
            ctx.save();
            ctx.globalAlpha = (eyeGenome.eyeBulge - 0.3) * 0.5;
            ctx.strokeStyle = "rgb(255,255,255)";
            ctx.lineWidth = Math.max(0.8, radius * 0.08);
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.92, Math.PI * 1.1, Math.PI * 1.9);
            ctx.stroke();
            ctx.restore();
        }


        ctx.save();
        ctx.globalAlpha = eyeGenome.highlightStrength;
        ctx.fillStyle = "rgb(255,255,255)";
        ctx.beginPath();
        ctx.arc(x - pupilR * 0.4, y - pupilR * 0.4, Math.max(0.8, pupilR * 0.3), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Eyelids 
        ctx.save();
        ctx.fillStyle = `rgb(${sR | 0}, ${sG | 0}, ${sB | 0})`;
        if (eyeGenome.eyelidTop > 0.02) {
            const h = radius * 2 * eyeGenome.eyelidTop;
            ctx.fillRect(x - radius * 1.05, y - radius * 1.05, radius * 2.1, h);
        }
        if (eyeGenome.eyelidBottom > 0.02) {
            const h = radius * 2 * eyeGenome.eyelidBottom;
            ctx.fillRect(x - radius * 1.05, y + radius * 1.05 - h, radius * 2.1, h);
        }
        ctx.restore();
    }
}

/* ============================================================
   Skeleton Construction: Limbs
   ============================================================ */
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

            let spreadX = genome.footSpread * (0.10 + formRng() * 0.30);
            let dirY = 0.28 + genome.stance * 0.34;

            const maxReach = 0.85; 
            const mag = Math.hypot(spreadX, dirY);
            if (mag > maxReach) {
                spreadX = spreadX / mag * maxReach;
                dirY = dirY / mag * maxReach;
            }

            const forwardBias = (formRng() - 0.5) * legLenPx * 0.25;
            const heightJitter = (noise1D(p * 10 + side * 5 + formRng() * 100) - 0.5) * legLenPx * 0.25;

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
   Inverse Kinematics (FABRIK)
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
   Spatial Boundaries & Fitting
   ============================================================ */
function computeBounds(bones) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let b of bones) {
        const r = Math.max(b.r1, b.r2);
        if (b.ax - r < minX) minX = b.ax - r;
        if (b.ax + r > maxX) maxX = b.ax + r;
        if (b.ay - r < minY) minY = b.ay - r;
        if (b.ay + r > maxY) maxY = b.ay + r;
        
        if (b.bx - r < minX) minX = b.bx - r;
        if (b.bx + r > maxX) maxX = b.bx + r;
        if (b.by - r < minY) minY = b.by - r;
        if (b.by + r > maxY) maxY = b.by + r;
    }
    return { minX, minY, maxX, maxY };
}

function fitToBounds(bones, head, targetW, targetH, padding) {
    const bounds = computeBounds(bones);
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const scale = Math.min((targetW - padding * 2) / (w || 1), (targetH - padding * 2) / (h || 1));
    
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    
    const dx = targetW / 2 - cx * scale;
    const dy = targetH / 2 - cy * scale;
    
    for (let b of bones) {
        b.ax = b.ax * scale + dx;
        b.ay = b.ay * scale + dy;
        b.bx = b.bx * scale + dx;
        b.by = b.by * scale + dy;
        b.r1 *= scale;
        b.r2 *= scale;
    }
    
    head.headCenter.x = head.headCenter.x * scale + dx;
    head.headCenter.y = head.headCenter.y * scale + dy;
    head.headR *= scale;
    
    return scale;
}

/* ============================================================
   Signed Distance Fields (SDF)
   ============================================================ */
function sdUnevenCapsule(px, py, ax, ay, bx, by, r1, r2) {
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.sqrt(dx * dx + dy * dy);
    
    if (L === 0) {
        const dpx = px - ax, dpy = py - ay;
        return Math.sqrt(dpx * dpx + dpy * dpy) - Math.max(r1, r2);
    }
    
    if (L <= Math.abs(r1 - r2)) {
        if (r1 > r2) {
            const dpx = px - ax, dpy = py - ay;
            return Math.sqrt(dpx * dpx + dpy * dpy) - r1;
        } else {
            const dpx = px - bx, dpy = py - by;
            return Math.sqrt(dpx * dpx + dpy * dpy) - r2;
        }
    }

    const dirX = dx / L;
    const dirY = dy / L;
    
    const tx = px - ax;
    const ty = py - ay;
    
    const y = tx * dirX + ty * dirY; 
    const x = Math.abs(tx * -dirY + ty * dirX); 
    
    const sinT = (r1 - r2) / L;
    const cosT = Math.sqrt(Math.max(0.0, 1.0 - sinT * sinT));
    
    const proj = y * cosT - x * sinT;
    
    if (proj <= 0.0) {
        return Math.sqrt(x * x + y * y) - r1;
    }
    if (proj >= L * cosT) {
        const yL = y - L;
        return Math.sqrt(x * x + yL * yL) - r2;
    }
    
    return x * cosT + y * sinT - r1;
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
   Material & Color Generators
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
   Creature Classification
   ============================================================ */
function classifyCreature(genome) {
    const facts = {};
    const legRatio = genome.legLength / genome.bodyLength;
    const isHeavy = genome.mass > 20000;
    const isLegless = genome.limbPairs === 0;

    if (isLegless && genome.tailLength > 1.5) facts.locomotion = "Serpentine";
    else if (isHeavy && legRatio < 1.0) facts.locomotion = "Graviportal";
    else if (legRatio > 1.6 && genome.mass < 8000) facts.locomotion = "Cursorial";
    else if (genome.limbPairs >= 3) facts.locomotion = "Crawler";
    else facts.locomotion = "Generalist";

    if (genome.mass < 2000) facts.size = "Small";
    else if (genome.mass < 10000) facts.size = "Medium";
    else if (genome.mass < 30000) facts.size = "Large";
    else facts.size = "Massive";

    if (genome.hornCount >= 2 && genome.mass > 10000) facts.diet = "Herbivore";
    else if (genome.eyeCount >= 4) facts.diet = "Carnivore";
    else facts.diet = "Omnivore";

    const temperaments = ["Docile", "Territorial", "Skittish", "Curious", "Aggressive", "Solitary"];
    const idx = Math.floor(((genome.stance + genome.skinPattern) / 2) * temperaments.length) % temperaments.length;
    facts.temperament = temperaments[idx];

    return facts;
}


function generateAlien(seed) {
    const genome = generateGenome(seed);
    const facts = classifyCreature(genome);
    const eyes = generateEyeGenome(seed, genome.eyeCount);
    
    const formRngSpine = mulberry32(subSeed(seed, "form-spine"));
    const formRngTail = mulberry32(subSeed(seed, "form-tail"));
    const formRngHead = mulberry32(subSeed(seed, "form-head"));
    const formRngLimbs = mulberry32(subSeed(seed, "form-limbs"));

    const spine = buildSpine(genome, formRngSpine, 0, 0);
    const tail = buildTail(genome, formRngTail, spine[spine.length - 1]);
    const head = buildHead(genome, formRngHead, spine);
    const limbBones = buildLimbs(genome, formRngLimbs, spine);

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
    
    const globalFormRng = mulberry32(subSeed(seed, "form-global"));
    const baseThickness = allBones.length > 0 ? allBones[0].r1 : 10;
    
    return {
        seed: seed,
        genome: genome,
        facts: facts,
        eyes: eyes,
        geometry: {
            spine: spineBones,
            tail: tailBones,
            limbs: limbBones,
            head: head,
            allBones: allBones
        },
        materials: {
            baseColorRGB: computeSkinColor(genome),
            smoothingK: baseThickness * (0.5 + globalFormRng() * 0.3)
        }
    };
}


if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        generateAlien, 
        evaluateField, 
        fitToBounds, 
        computeBounds,
        generateEyeGenome,
        computeEyePositions,
        drawEyes
    };
}