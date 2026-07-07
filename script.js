/*
 * PRNG Seed Management
 * Mulberry32 pseudorandom number generator
 */
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

/*
 * Allometric Normalization Coefficients
 * Source: Allometry and Biomechanics: Limb Bones in Adult Ungulates (McMahon, 1975)
 * https://pdodds.w3.uvm.edu/files/papers/others/1975/mcmahon1975b.pdf
 */
const ARCHETYPES = {
    "Cursorial": { asl: 1.8, asd: 0.8, all: 2.5, ald: 0.9 },
    "Graviportal": { asl: 1.2, asd: 1.6, all: 1.0, ald: 2.2 },
    "Scansorial": { asl: 1.5, asd: 1.0, all: 2.0, ald: 1.4 },
    "Aquatic": { asl: 2.2, asd: 1.4, all: 0.6, ald: 0.8 }
};

function generateGenome(seedValue, archetypeKey) {
    const rng = mulberry32(seedValue);
    const baseMass = 2000 + rng() * 13000;
    const arch = ARCHETYPES[archetypeKey] || ARCHETYPES["Cursorial"];
    
    function perturb(val) {
        return val * (0.95 + rng() * 0.10);
    }
    
    /*
     * Elastic Similarity Model
     * Length scales to M^0.25, Diameter scales to M^0.375
     */
    const spineLength = perturb(arch.asl) * Math.pow(baseMass, 0.25);
    const spineDiameter = perturb(arch.asd) * Math.pow(baseMass, 0.375);
    const limbLength = perturb(arch.all) * Math.pow(baseMass, 0.25);
    const limbDiameter = perturb(arch.ald) * Math.pow(baseMass, 0.375);


    const spineCount = 5 + Math.floor(rng() * 6); // 5 to 10 nodes
    const frontAttach = 1 + Math.floor(rng() * 3); // Node 1, 2, or 3
    const rearAttach = spineCount - 2 - Math.floor(rng() * 2); // Dynamic rear positioning
    
    const legSegments = 2 + Math.floor(rng() * 3); // 2 to 4 segments per leg
    const shoulderWidth = 20 + rng() * 60; // Narrow to wide stances
    const legSpreadX = 1.2 + rng() * 2.5; // Horizontal target spread
    

    const legDirY = -0.5 + rng() * 2.0; 

    return {
        rng: rng,
        mass: baseMass,
        sl: spineLength,
        sd: spineDiameter,
        ll: limbLength,
        ld: limbDiameter,
        spineCount: spineCount,
        frontAttach: frontAttach,
        rearAttach: rearAttach,
        legSegments: legSegments,
        shoulderWidth: shoulderWidth,
        legSpreadX: legSpreadX,
        legDirY: legDirY
    };
}

/*
 * Forward And Backward Reaching Inverse Kinematics (FABRIK)
 * Source: FABRIK.pdf (Andreas Aristidou)
 */
function solveFABRIK(chain, targetX, targetY) {
    const n = chain.length;
    const lengths = [];
    let totalLength = 0;
    
    for (let i = 0; i < n - 1; i++) {
        const dist = Math.hypot(chain[i+1].x - chain[i].x, chain[i+1].y - chain[i].y);
        lengths.push(dist);
        totalLength += dist;
    }

    const root = { x: chain[0].x, y: chain[0].y };
    const distToTarget = Math.hypot(targetX - root.x, targetY - root.y);

    if (distToTarget >= totalLength) {
        for (let i = 0; i < n - 1; i++) {
            const r = Math.hypot(targetX - chain[i].x, targetY - chain[i].y);
            const lambda = lengths[i] / (r || 1);
            chain[i+1].x = (1 - lambda) * chain[i].x + lambda * targetX;
            chain[i+1].y = (1 - lambda) * chain[i].y + lambda * targetY;
        }
    } else {
        for (let iter = 0; iter < 4; iter++) {
            chain[n-1].x = targetX;
            chain[n-1].y = targetY;
            for (let i = n - 2; i >= 0; i--) {
                const r = Math.hypot(chain[i+1].x - chain[i].x, chain[i+1].y - chain[i].y);
                const lambda = lengths[i] / (r || 1);
                chain[i].x = (1 - lambda) * chain[i+1].x + lambda * chain[i].x;
                chain[i].y = (1 - lambda) * chain[i+1].y + lambda * chain[i].y;
            }
            
            chain[0].x = root.x;
            chain[0].y = root.y;
            for (let i = 0; i < n - 1; i++) {
                const r = Math.hypot(chain[i+1].x - chain[i].x, chain[i+1].y - chain[i].y);
                const lambda = lengths[i] / (r || 1);
                chain[i+1].x = (1 - lambda) * chain[i].x + lambda * chain[i+1].x;
                chain[i+1].y = (1 - lambda) * chain[i].y + lambda * chain[i+1].y;
            }
        }
    }
}


function sdUnevenCapsule(px, py, ax, ay, bx, by, r1, r2) {
    const h = Math.hypot(bx - ax, by - ay);
    if (h === 0) return Math.hypot(px - ax, py - ay) - r1;
    
    const dirX = (bx - ax) / h;
    const dirY = (by - ay) / h;
    const tx = px - ax;
    const ty = py - ay;
    
    const localY = tx * dirX + ty * dirY;
    const localX = tx * -dirY + ty * dirX;
    
    const pX = Math.abs(localX);
    const pY = localY;
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

function evaluateField(px, py, bones) {
    if (bones.length === 0) return Infinity;

    let bone = bones[0];
    let d = sdUnevenCapsule(px, py, bone.ax, bone.ay, bone.bx, bone.by, bone.r1, bone.r2);

    for (let i = 1; i < bones.length; i++) {
        bone = bones[i];
        const dist = sdUnevenCapsule(px, py, bone.ax, bone.ay, bone.bx, bone.by, bone.r1, bone.r2);
        d = sminCubic(d, dist, 12.0);
    }

    return d;
}

function buildRig(genome, startX, startY) {
    const bones = [];
    const spineNodes = [];
    let cx = startX, cy = startY;
    let currentRadius = genome.sd * 0.5;
    
    for (let i = 0; i < genome.spineCount; i++) {
        spineNodes.push({ x: cx, y: cy, r: currentRadius });
        
  
        cx += (genome.rng() - 0.5) * 20;
        cy += genome.sl;
        
   
        currentRadius *= 0.85 + genome.rng() * 0.3;
    }
    
    for (let i = 0; i < spineNodes.length - 1; i++) {
        bones.push({
            ax: spineNodes[i].x, ay: spineNodes[i].y,
            bx: spineNodes[i+1].x, by: spineNodes[i+1].y,
            r1: spineNodes[i].r, r2: spineNodes[i+1].r
        });
    }

   
    const attachPoint = spineNodes[Math.min(genome.frontAttach, spineNodes.length - 1)];
    const lowerAttachPoint = spineNodes[Math.max(0, Math.min(genome.rearAttach, spineNodes.length - 1))];

    function addLimbPair(attach, length, diam) {
        if (!attach) return;
        
        [-1, 1].forEach(side => {
            const limbChain = [{ x: attach.x, y: attach.y }];
            
    
            const segLength = length / genome.legSegments;
            let currentX = attach.x;
            let currentY = attach.y;

            for (let s = 1; s <= genome.legSegments; s++) {
                currentX += (genome.shoulderWidth / genome.legSegments) * side;
                currentY += segLength;
                limbChain.push({ x: currentX, y: currentY });
            }
          
  
            const targetX = attach.x + length * genome.legSpreadX * side;
            const targetY = attach.y + length * genome.legDirY;
            
            solveFABRIK(limbChain, targetX, targetY);
            
            let currentDiam = diam;
            for (let i = 0; i < limbChain.length - 1; i++) {
                const nextDiam = currentDiam * 0.7; 
                bones.push({
                    ax: limbChain[i].x, ay: limbChain[i].y,
                    bx: limbChain[i+1].x, by: limbChain[i+1].y,
                    r1: currentDiam, r2: nextDiam
                });
                currentDiam = nextDiam;
            }
        });
    }

    addLimbPair(attachPoint, genome.ll, genome.ld);
    addLimbPair(lowerAttachPoint, genome.ll, genome.ld);
    
    return bones;
}

function renderAlien(canvasId, seed, archetypeKey) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    const genome = generateGenome(seed, archetypeKey);
    const bones = buildRig(genome, canvas.width / 2, 150);
    
    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const data = imgData.data;

    for (let py = 0; py < canvas.height; py++) {
        for (let px = 0; px < canvas.width; px++) {
            const d = evaluateField(px, py, bones);
            
            if (d < 1.0) {
                const idx = (py * canvas.width + px) * 4;
                const alpha = Math.max(0, Math.min(1, 1.0 - d));
                
                /*
                 * Analytical Gradient Extraction
                 */
                const eps = 1.0;
                const dx = evaluateField(px + eps, py, bones) - d;
                const dy = evaluateField(px, py + eps, bones) - d;
                
                const nz = 1.5;
                const nLen = Math.hypot(dx, dy, nz);
                const nx = dx / nLen;
                const ny = dy / nLen;
                const normZ = nz / nLen;
                
                const lx = -0.5, ly = -0.5, lz = 0.8;
                const dot = Math.max(0, nx * lx + ny * ly + normZ * lz);
                
                const intensity = 0.2 + dot * 0.8;
                
                data[idx] = Math.min(255, 45 * intensity);
                data[idx + 1] = Math.min(255, 120 * intensity);
                data[idx + 2] = Math.min(255, 75 * intensity);
                data[idx + 3] = alpha * 255;
            }
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
}