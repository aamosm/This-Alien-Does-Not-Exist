function mulberry32(seed){
    return function(){
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Geometry generators
function genSpine(rng, segments = 8) {
    const points = [];
  
    let x = 400, y = 150 + rng() * 40;
    let angle = Math.PI / 2;
    for (let i = 0; i < segments; i++) {
        points.push({ x, y });
        angle += (rng() - 0.5) * 0.6;
        x += Math.cos(angle) * 35;
        y += Math.sin(angle) * 35;
    }
    return points;
}

function radiusAt(i, total, rng, maxR) {
    const t = i / (total - 1);
    const bell = Math.sin(t * Math.PI); // 0 at ends, 1 in middle
    return 12 + bell * maxR * (0.6 + rng() * 0.4);
}

function genLimb(rng, originX, originY, baseAngle) {
    const limb = [];
    let x = originX, y = originY;
    let angle = baseAngle + (rng() - 0.5) * 0.5;
    const segments = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < segments; i++) {
        limb.push({ x, y, r: 8 + rng() * 8 * (1 - i / segments) });
        angle += (rng() - 0.5) * 0.4;
        x += Math.cos(angle) * 26;
        y += Math.sin(angle) * 26;
    }
    return limb;
}

// SDF Functions
function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
}

function fieldAt(px, py, circles) {
    let d = Infinity;
    for (const c of circles) {
        const dist = Math.hypot(px - c.x, py - c.y) - c.r;
        d = smin(d, dist, 30); 
    }
    return d;
}


const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

function generateNew() {
    const rawSeed = Math.floor(Math.random() * 4294967296);
    renderCreature(rawSeed);
}

function renderCreature(seedValue) {
    const startTime = performance.now();
    const rng = mulberry32(seedValue);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

  
    const spineSegments = 7 + Math.floor(rng() * 3);
    const spine = genSpine(rng, spineSegments);
    const circles = [];

    // Build main body
    for (let i = 0; i < spine.length; i++) {
        circles.push({
            x: spine[i].x,
            y: spine[i].y,
            r: radiusAt(i, spine.length, rng, 45)
        });
    }

    // Build limbs
    const numLimbs = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < numLimbs; i++) {
        const attachIdx = 2 + Math.floor(rng() * (spine.length - 4));
        const side = rng() < 0.5 ? -1 : 1;
        const baseAngle = side * (Math.PI / 2) + (rng() - 0.5) * 0.6;
        const limb = genLimb(rng, spine[attachIdx].x, spine[attachIdx].y, baseAngle);
        circles.push(...limb);
    }

    // Generate procedural colors for the creature
    const baseR = 60 + rng() * 150;
    const baseG = 60 + rng() * 150;
    const baseB = 60 + rng() * 150;


    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const maxBlendMargin = 40;

    for (const c of circles) {
        minX = Math.min(minX, c.x - c.r - maxBlendMargin);
        minY = Math.min(minY, c.y - c.r - maxBlendMargin);
        maxX = Math.max(maxX, c.x + c.r + maxBlendMargin);
        maxY = Math.max(maxY, c.y + c.r + maxBlendMargin);
    }


    minX = Math.max(0, Math.floor(minX));
    minY = Math.max(0, Math.floor(minY));
    maxX = Math.min(canvas.width, Math.ceil(maxX));
    maxY = Math.min(canvas.height, Math.ceil(maxY));

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

   
    if (boxWidth <= 0 || boxHeight <= 0) {
        generateNew(); 
        return;
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = boxWidth;
    offscreen.height = boxHeight;
    const offCtx = offscreen.getContext('2d');
    const imgData = offCtx.createImageData(boxWidth, boxHeight);
    const data = imgData.data;

    const eps = 1.0; 

    for (let py = 0; py < boxHeight; py++) {
        for (let px = 0; px < boxWidth; px++) {
            
            const x = minX + px;
            const y = minY + py;

         
            const d = fieldAt(x, y, circles);

   
            const alpha = Math.max(0, Math.min(1, 0.5 - d));
            
            if (alpha > 0) {
                const idx = (py * boxWidth + px) * 4;
                const dx = fieldAt(x + eps, y, circles) - d;
                const dy = fieldAt(x, y + eps, circles) - d;
                
         
                const nz = 1.2;
                
   
                const nLen = Math.hypot(dx, dy, nz);
                const nx = dx / (nLen || 1);
                const ny = dy / (nLen || 1);
                const normZ = nz / (nLen || 1);

                const lx = -0.55;
                const ly = -0.55;
                const lz = 0.62;


                const dot = Math.max(0, nx * lx + ny * ly + normZ * lz);
                const ambient = 0.25;
                const diffuse = dot * 0.75;
                
    
                const viewZ = 1.0;
                const halfX = lx;
                const halfY = ly;
                const halfZ = lz + viewZ;
                const hLen = Math.hypot(halfX, halfY, halfZ);
                const specDot = Math.max(0, nx * (halfX/hLen) + ny * (halfY/hLen) + normZ * (halfZ/hLen));
                const specular = Math.pow(specDot, 16.0) * 0.3;

                const intensity = ambient + diffuse;

        
                data[idx] = Math.min(255, baseR * intensity + specular * 255);     // R
                data[idx+1] = Math.min(255, baseG * intensity + specular * 255);   // G
                data[idx+2] = Math.min(255, baseB * intensity + specular * 255);   // B
                data[idx+3] = alpha * 255;                                         // A
            }
        }
    }


    offCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(offscreen, minX, minY);


    const renderTime = (performance.now() - startTime).toFixed(1);
    
    document.getElementById("ui-seed").innerText = seedValue;
    document.getElementById("ui-segments").innerText = spineSegments;
    document.getElementById("ui-limbs").innerText = numLimbs;
    document.getElementById("ui-bbox").innerText = `${boxWidth}x${boxHeight} px`;
    document.getElementById("ui-time").innerText = `${renderTime} ms`;
}

// Run once on load
window.onload = () => generateNew();