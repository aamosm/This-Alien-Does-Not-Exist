    export function createHumanAlien(seed) {
        const alien = {
            seed: seed,
            genome: {
                mass: 15000,
                bodyPlan: 'Biped',
                bodyLength: 1.5,
                bodyWidth: 0.5,
                limbPairsRaw: 0.5,
                legLengthRaw: 0.78,
                stanceRaw: 0.42,
                headSize: 1.0,
                headWidth: 1.0,
                snoutLengthRaw: 0.08,
                jawDepthRaw: 0.22,
                chinTaper: 0.45,
                headTilt: 0.0,
                neckLengthRaw: 0.34,
                eyeCount: 2,
                mouthType: 'Jaw',
                tailLength: 0.0,
                tailType: 'None',
                spineCurve: -0.15, 
                skinHue: 0.05,
                skinBrightness: 0.8,
                skinPattern: 0.1,
                patternStyle: 0.5,
                patternContrast: 0.0,
                paletteScheme: 'monochrome',
                accentHueOffset: 0.0,
                asymmetry: 0.05,
                asymmetryBias: 1,
                pupilType: 'round',
                niche: 'Omnivore',
                eyePlacement: 'Forward',
                posture: 'upright',
                jawDepth: 0.38,
                snoutLength: 0.22,
                neckLength: 0.95,
                neckThickness: 0.92,
                legLength: 66,
                legThickness: 9.8,
                jointRadius: 5.2,
                socketOutward: 11,
                limbRootOffset: 4.8,
                shoulderWidthScale: 1.06,
                tailBaseThickness: 0,
                tailSegmentFactor: 0.8
            },
            eyeClusterStyle: "Horizontal",
            registry: {
                curiosity: 2.65,
                watchfulness: 0.45,
                objectInterest: 2.35,
                physicalSignature: 0.4875
            },
            facts: {
                bodyPlan: "Biped",
                size: "Medium",
                diet: "Omnivore",
                vision: "Forward Vision",
                locomotion: "Walking",
                temperament: "Skittish"
            },
            geometry: { allBones: [], eyePositions: [], head: {} },
            materials: {
                baseColorRGB: [224, 172, 148],
                accentColorRGB: [210, 160, 138],
                highlightColorRGB: [255, 220, 200],
                eyeColorRGB: [80, 120, 200],
                patternScaleMultiplier: 0.05
            },
            eyes: {
                eyeCount: 2, scleraVisible: true, irisRadius: 0.45, pupilRadius: 0.35,
                pupilType: "round", eyelidTop: 0.25, eyelidBottom: 0.25,
                socketDepth: 0.3, highlightStrength: 0.8, irisPattern: 0.3
            },
            trace: { derived: {
                physicalVector: [0.29, 0.26, 0.11, 0.50, 0.78, 0.42, 0.38, 0.37, 0.08, 0.22, 0.45, 0.50, 0.34, 0.00, 0.41],
                physicalKeys: [
                    'genome.mass', 'genome.bodyLength', 'genome.bodyWidth', 'genome.limbPairsRaw',
                    'genome.legLengthRaw', 'genome.stanceRaw', 'genome.headSize', 'genome.headWidth',
                    'genome.snoutLengthRaw', 'genome.jawDepthRaw', 'genome.chinTaper', 'genome.headTilt',
                    'genome.neckLengthRaw', 'genome.tailLength', 'genome.spineCurve'
                ]
            } }
        };

        alien.physicalVector = Array.from(alien.trace.derived.physicalVector);
        if (typeof RegistryEngine !== "undefined" && RegistryEngine.buildBehaviourVector) {
          alien.behaviourVector = RegistryEngine.buildBehaviourVector(alien);
        } else {
          alien.behaviourVector = { keys: ['curiosity','watchfulness','objectInterest'], vector: [alien.registry.curiosity, alien.registry.watchfulness, alien.registry.objectInterest] };
        }

        const h = alien.geometry;

        function mkCap(ax, ay, bx, by, r1, r2, op='smooth_add', k=4) {
            return {
                op, k,
                evaluate(px, py) {
                    const dx = bx - ax, dy = by - ay;
                    const L = Math.sqrt(dx * dx + dy * dy);
                    if (L === 0) return Math.hypot(px - ax, py - ay) - Math.max(r1, r2);
                    if (L <= Math.abs(r1 - r2)) return r1 > r2 ? Math.hypot(px - ax, py - ay) - r1 : Math.hypot(px - bx, py - by) - r2;
                    const dirX = dx / L, dirY = dy / L;
                    const tx = px - ax, ty = py - ay;
                    const y = tx * dirX + ty * dirY; const x = Math.abs(tx * -dirY + ty * dirX); 
                    const sinT = (r1 - r2) / L; const cosT = Math.sqrt(Math.max(0.0, 1.0 - sinT * sinT));
                    const proj = y * cosT - x * sinT;
                    if (proj <= 0.0) return Math.hypot(x, y) - r1;
                    if (proj >= L * cosT) return Math.hypot(x, y - L) - r2;
                    return x * cosT + y * sinT - r1;
                },
                bounds() { const r = Math.max(r1, r2); return { minX: Math.min(ax - r, bx - r), minY: Math.min(ay - r, by - r), maxX: Math.max(ax + r, bx + r), maxY: Math.max(ay + r, by + r) }; },
                translate(dx, dy) { ax += dx; ay += dy; bx += dx; by += dy; },
                scale(s) { ax *= s; ay *= s; bx *= s; by *= s; r1 *= s; r2 *= s; k *= s; },
                squeezeAxis(axis, factor, center) {
                    if (axis === 'x') { ax = center + (ax - center) * factor; bx = center + (bx - center) * factor; }
                    else { ay = center + (ay - center) * factor; by = center + (by - center) * factor; }
                }
            };
        }

        function mkSph(x, y, r, op='smooth_add', k=4) {
            return {
                op, k,
                evaluate(px, py) { return Math.hypot(px - x, py - y) - r; },
                bounds() { return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r }; },
                translate(dx, dy) { x += dx; y += dy; },
                scale(s) { x *= s; y *= s; r *= s; k *= s; },
                squeezeAxis(axis, factor, center) {
                    if (axis === 'x') x = center + (x - center) * factor;
                    else y = center + (y - center) * factor;
                }
            };
        }

        h.allBones.push(mkCap(0, 10, 0, 35, 14, 11, 'smooth_add', 8));
        h.allBones.push(mkCap(0, 35, 0, 45, 11, 13, 'smooth_add', 6));

        h.allBones.push(mkCap(0, 10, 0, -5, 5, 5, 'smooth_add', 4));
        h.allBones.push(mkSph(0, -15, 11, 'smooth_add', 4)); 
        h.allBones.push(mkCap(0, -15, 0, -5, 11, 7, 'smooth_add', 4)); 

        h.head.headCenter = { x: 0, y: -12 };
        h.head.headR = 11;

        const eyeR = 2.2;
        h.eyePositions.push({ x: -4, y: -13, radius: eyeR });
        h.eyePositions.push({ x: 4, y: -13, radius: eyeR });
        h.allBones.push(mkSph(-4, -13, eyeR * 1.3, 'subtract', 0));
        h.allBones.push(mkSph(4, -13, eyeR * 1.3, 'subtract', 0));

        h.allBones.push(mkCap(-14, 12, -22, 30, 4.5, 3.5, 'smooth_add', 3));
        h.allBones.push(mkCap(14, 12, 22, 30, 4.5, 3.5, 'smooth_add', 3));
        h.allBones.push(mkCap(-22, 30, -26, 50, 3.5, 2.5, 'smooth_add', 3));
        h.allBones.push(mkCap(22, 30, 26, 50, 3.5, 2.5, 'smooth_add', 3));

        h.allBones.push(mkCap(-6, 42, -9, 75, 6, 4.5, 'smooth_add', 4));
        h.allBones.push(mkCap(6, 42, 9, 75, 6, 4.5, 'smooth_add', 4));
        h.allBones.push(mkCap(-9, 75, -9, 110, 4.5, 3, 'smooth_add', 4));
        h.allBones.push(mkCap(9, 75, 9, 110, 4.5, 3, 'smooth_add', 4));
        
        h.allBones.push(mkCap(-9, 110, -14, 113, 3, 2, 'smooth_add', 2));
        h.allBones.push(mkCap(9, 110, 14, 113, 3, 2, 'smooth_add', 2));

        return alien;
    }

