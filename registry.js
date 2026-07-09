const DEFAULT_WEIGHTS = Object.freeze({
    EUCLIDEAN_WEIGHT: 0.65,
    COSINE_WEIGHT: 0.35,

    PHYSICAL_WEIGHT: 0.70,
    BEHAVIOURAL_WEIGHT: 0.30
});

const EUCLIDEAN_WEIGHT = DEFAULT_WEIGHTS.EUCLIDEAN_WEIGHT;
const COSINE_WEIGHT = DEFAULT_WEIGHTS.COSINE_WEIGHT;
const PHYSICAL_WEIGHT = DEFAULT_WEIGHTS.PHYSICAL_WEIGHT;
const BEHAVIOURAL_WEIGHT = DEFAULT_WEIGHTS.BEHAVIOURAL_WEIGHT;

// Thresholds
const DEFAULT_THRESHOLDS = Object.freeze({
    UNUSUAL_Z_THRESHOLD: 1.5,
    RARITY_Z_CAP: 3
});

const UNUSUAL_Z_THRESHOLD = DEFAULT_THRESHOLDS.UNUSUAL_Z_THRESHOLD;
const RARITY_Z_CAP = DEFAULT_THRESHOLDS.RARITY_Z_CAP;

const DEFAULT_CLUSTER_CONFIG = Object.freeze({
    CLUSTER_BUCKETS_PER_DIM: 4,
    CLUSTER_COUNT: 16
});

const CLUSTER_BUCKETS_PER_DIM = DEFAULT_CLUSTER_CONFIG.CLUSTER_BUCKETS_PER_DIM;
const CLUSTER_COUNT = DEFAULT_CLUSTER_CONFIG.CLUSTER_COUNT;

const PHYSICAL_WEIGHT_SCHEME = 'uniform';

const CANONICAL_BEHAVIOUR_KEYS = Object.freeze([
    'curiosity',
    'watchfulness',
    'objectInterest'
]);

const BEHAVIOUR_RANGES = {
    curiosity: 3,
    watchfulness: 2,
    objectInterest: 3
};

function legacyIndexWeights(length) {
    const w = new Array(length);
    for (let i = 0; i < length; i++) w[i] = i + 1;
    return w;
}

function uniformWeights(length) {
    return new Array(length).fill(1);
}

function physicalWeights(length) {
    return PHYSICAL_WEIGHT_SCHEME === 'index'
        ? legacyIndexWeights(length)
        : uniformWeights(length);
}

function warn(msg) {
    if (typeof console !== 'undefined' && console.warn) {
        console.warn('[RegistryEngine] ' + msg);
    }
}

function isNonEmptyVector(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (ArrayBuffer.isView(v)) return v.length > 0;
    return false;
}

function isValidDatabase(database) {
    if (!Array.isArray(database)) {
        warn('database is not an array; received: ' + typeof database);
        return false;
    }

    // duplicate seed warning
    const seen = new Set();
    for (const e of database) {
        if (!e || e.seed === undefined || e.seed === null) continue;
        if (seen.has(e.seed)) {
            warn('duplicate seed detected in database: ' + e.seed + '. Reverse-search may be unstable.');
            break;
        }
        seen.add(e.seed);
    }
    return true;
}

function isValidEntry(entry, context) {
    if (!entry || typeof entry !== 'object') {
        warn((context || 'entry') + ': entry is missing or not an object.');
        return false;
    }
    if (entry.seed === undefined || entry.seed === null) {
        warn((context || 'entry') + ': missing "seed".');
        return false;
    }
    if (!isNonEmptyVector(entry.physicalVector)) {
        warn('seed ' + entry.seed + ': missing or empty "physicalVector".');
        return false;
    }
    const bv = entry.behaviourVector;
    const behaviourOk = bv && (isNonEmptyVector(bv.vector) || isNonEmptyVector(bv));
    if (!behaviourOk) {
        warn('seed ' + entry.seed + ': missing or empty "behaviourVector".');
        return false;
    }
    if (!entry.registry || typeof entry.registry !== 'object') {
        warn('seed ' + entry.seed + ': missing "registry".');
        return false;
    }
    return true;
}

function toArray(vec) {
    if (vec == null) return [];
    return Array.isArray(vec) ? vec : Array.from(vec);
}

function mean(arr) {
    return arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
}

function stddev(arr, m) {
    const mu = m === undefined ? mean(arr) : m;
    const variance = arr.reduce((s, v) => s + (v - mu) * (v - mu), 0) / (arr.length || 1);
    return Math.sqrt(variance);
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function squash(distance) {
    return 1 / (1 + distance);
}

function weightedNormalizedEuclidean(a, b, weights) {
    let num = 0, denom = 0;
    for (let i = 0; i < a.length; i++) {
        const w = weights[i];
        const d = a[i] - b[i];
        num += w * d * d;
        denom += w;
    }
    return Math.sqrt(num / (denom || 1));
}

function cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function mixHash(seedInt, value) {
    let h = (seedInt ^ 0) >>> 0;
    h = Math.imul(h ^ value, 2654435761) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    return h >>> 0;
}

function hashVector(vec) {
    let h = 0x811c9dc5;
    for (let i = 0; i < vec.length; i++) {
        const q = Math.round(vec[i] * 100000);
        h = mixHash(h, (q ^ (i * 97)) >>> 0);
    }
    return h >>> 0;
}


function buildPhysicalVector(alien) {
    const derived = alien && alien.trace && alien.trace.derived;
    const vec = (derived && derived.physicalVector) || [];
    if (!derived) {
        warn('buildPhysicalVector: alien.trace.derived is missing; returning empty vector.');
    }
    return Float32Array.from(vec);
}

function behaviourKeysFor(registry) {
    
    const keys = Object.keys(registry || {}).filter(k => k !== 'physicalSignature');
    const canonicalPresent = CANONICAL_BEHAVIOUR_KEYS.filter(k => keys.includes(k));
    const extras = keys.filter(k => !CANONICAL_BEHAVIOUR_KEYS.includes(k)).sort();
    return canonicalPresent.concat(extras);
}

function buildBehaviourVector(alien) {
    const registry = (alien && alien.registry) || {};
    const keys = behaviourKeysFor(registry);
    if (!alien || !alien.registry) {
        warn('buildBehaviourVector: alien.registry is missing; returning empty vector.');
    }
    return { keys, vector: keys.map(k => registry[k]) };
}


function computePhysicalDistance(a, b) {
    const va = toArray(a), vb = toArray(b);
    if (va.length === 0 || vb.length === 0 || va.length !== vb.length) {
        warn('computePhysicalDistance: vectors missing or length mismatch (' +
            va.length + ' vs ' + vb.length + ').');
        return Infinity;
    }
    const weights = physicalWeights(va.length);
    return weightedNormalizedEuclidean(va, vb, weights);
}


function normalizeBehaviourInput(x) {
    if (!x) return { keys: [], vector: [] };
    if (x.keys && x.vector) return { keys: x.keys.slice(), vector: toArray(x.vector) };
    const v = toArray(x);
    return { keys: v.map((_, i) => 'dim' + i), vector: v };
}

function alignBehaviourVectors(a, b) {
    const na = normalizeBehaviourInput(a);
    const nb = normalizeBehaviourInput(b);
    if (!isNonEmptyVector(na.vector) || !isNonEmptyVector(nb.vector)) return null;

    const union = [];
    const seen = new Set();
    na.keys.forEach(k => { if (!seen.has(k)) { seen.add(k); union.push(k); } });
    nb.keys.forEach(k => { if (!seen.has(k)) { seen.add(k); union.push(k); } });

    const mapA = {};
    const mapB = {};
    na.keys.forEach((k, i) => { mapA[k] = na.vector[i]; });
    nb.keys.forEach((k, i) => { mapB[k] = nb.vector[i]; });

    const va = [], vb = [];
    for (const k of union) {
        if (mapA[k] === undefined || mapB[k] === undefined) continue; // compare only shared dims
        va.push(mapA[k]);
        vb.push(mapB[k]);
    }
    if (va.length === 0 || vb.length === 0) return null;
    return { keys: union.filter(k => mapA[k] !== undefined && mapB[k] !== undefined), va, vb };
}


function computeBehaviourDistance(a, b) {
    const aligned = alignBehaviourVectors(a, b);
    if (!aligned) {
        warn('computeBehaviourDistance: vectors missing or no shared aligned dimensions.');
        return Infinity;
    }

    const { keys, va, vb } = aligned;
    const na = new Array(va.length);
    const nb = new Array(vb.length);

    for (let i = 0; i < va.length; i++) {
        const range = BEHAVIOUR_RANGES[keys[i]] || 1;
        na[i] = va[i] / range;
        nb[i] = vb[i] / range;
    }

    const weights = na.map(() => 1);
    return weightedNormalizedEuclidean(na, nb, weights);
}

function computeSimilarity(a, b) {
    if (!isValidEntry(a, 'computeSimilarity(a)') || !isValidEntry(b, 'computeSimilarity(b)')) {
        return { physical: 0, behavioural: 0, overall: 0 };
    }

    const pa = toArray(a.physicalVector), pb = toArray(b.physicalVector);
    const physicalDist = computePhysicalDistance(pa, pb);
    const physicalEuclideanSim = squash(physicalDist);
    const physicalCosineSim = clamp((cosineSimilarity(pa, pb) + 1) / 2, 0, 1);
    const physical = EUCLIDEAN_WEIGHT * physicalEuclideanSim + COSINE_WEIGHT * physicalCosineSim;

    const aligned = alignBehaviourVectors(a.behaviourVector, b.behaviourVector);
    if (!aligned) return { physical, behavioural: 0, overall: PHYSICAL_WEIGHT * physical };

    const behaviourDist = computeBehaviourDistance(a.behaviourVector, b.behaviourVector);
    const behaviourEuclideanSim = squash(behaviourDist);
    const behaviourCosineSim = clamp((cosineSimilarity(aligned.va, aligned.vb) + 1) / 2, 0, 1);
    const behavioural = EUCLIDEAN_WEIGHT * behaviourEuclideanSim + COSINE_WEIGHT * behaviourCosineSim;

    const overall = PHYSICAL_WEIGHT * physical + BEHAVIOURAL_WEIGHT * behavioural;
    return { physical, behavioural, overall };
}

function entryFor(seed, database) {
    if (!isValidDatabase(database)) return undefined;
    return database.find(e => e && e.seed === seed);
}

function others(seed, database) {
    if (!isValidDatabase(database)) return [];
    return database.filter(e => e && e.seed !== seed);
}

function findClosestPhysical(seed, database) {
    if (!isValidDatabase(database)) return null;
    const target = entryFor(seed, database);
    if (!target || !isValidEntry(target, 'findClosestPhysical(target)')) return null;

    let best = null, bestDist = Infinity;
    for (const entry of others(seed, database)) {
        if (!isValidEntry(entry, 'findClosestPhysical(candidate)')) continue;
        const d = computePhysicalDistance(target.physicalVector, entry.physicalVector);
        if (d < bestDist) { bestDist = d; best = entry; }
    }
    return best ? best.seed : null;
}

function findClosestBehaviour(seed, database) {
    if (!isValidDatabase(database)) return null;
    const target = entryFor(seed, database);
    if (!target || !isValidEntry(target, 'findClosestBehaviour(target)')) return null;

    let best = null, bestDist = Infinity;
    for (const entry of others(seed, database)) {
        if (!isValidEntry(entry, 'findClosestBehaviour(candidate)')) continue;
        const d = computeBehaviourDistance(target.behaviourVector, entry.behaviourVector);
        if (d < bestDist) { bestDist = d; best = entry; }
    }
    return best ? best.seed : null;
}

function findClosestOverall(seed, database) {
    if (!isValidDatabase(database)) return null;
    const target = entryFor(seed, database);
    if (!target || !isValidEntry(target, 'findClosestOverall(target)')) return null;

    let best = null, bestScore = -Infinity;
    for (const entry of others(seed, database)) {
        if (!isValidEntry(entry, 'findClosestOverall(candidate)')) continue;
        const s = computeSimilarity(target, entry).overall;
        if (s > bestScore) { bestScore = s; best = entry; }
    }
    return best ? best.seed : null;
}

function findTopMatches(seed, database, n) {
    if (!isValidDatabase(database)) return [];
    const target = entryFor(seed, database);
    if (!target || !isValidEntry(target, 'findTopMatches(target)')) return [];

    const scored = others(seed, database)
        .filter(entry => isValidEntry(entry, 'findTopMatches(candidate)'))
        .map(entry => ({
            seed: entry.seed,
            overall: computeSimilarity(target, entry).overall
        }));
    scored.sort((x, y) => y.overall - x.overall);
    return scored.slice(0, n).map(s => s.seed);
}

const PHYSICAL_KEY_LABELS = {
    'genome.mass': 'Similar mass',
    'genome.bodyLength': 'Similar body length',
    'genome.bodyWidth': 'Similar body width',
    'genome.limbPairsRaw': 'Similar limb count',
    'genome.legLengthRaw': 'Similar leg length',
    'genome.stanceRaw': 'Similar stance',
    'genome.headSize': 'Similar head size',
    'genome.headWidth': 'Similar head width',
    'genome.snoutLengthRaw': 'Similar snout length',
    'genome.jawDepthRaw': 'Similar jaw depth',
    'genome.chinTaper': 'Similar chin taper',
    'genome.headTilt': 'Similar head tilt',
    'genome.neckLengthRaw': 'Similar neck length',
    'genome.tailLength': 'Similar tail length',
    'genome.spineCurve': 'Similar spine curvature'
};

function resolvePhysical(x) {
    if (x && x.trace && x.trace.derived) {
        return { keys: x.trace.derived.physicalKeys, vector: x.trace.derived.physicalVector };
    }
    return { keys: (x && x.physicalKeys) || null, vector: (x && x.physicalVector) || x };
}

function labelFor(key, index) {
    return PHYSICAL_KEY_LABELS[key] || `Similar trait #${index}`;
}

function computeSharedTraits(a, b) {
    const ra = resolvePhysical(a), rb = resolvePhysical(b);
    const va = toArray(ra.vector), vb = toArray(rb.vector);
    if (va.length === 0 || vb.length === 0 || va.length !== vb.length) {
        warn('computeSharedTraits: vectors missing or length mismatch (' +
            va.length + ' vs ' + vb.length + ').');
        return [];
    }
    const keys = ra.keys || rb.keys || va.map((_, i) => `dim${i}`);

    const diffs = va.map((v, i) => Math.abs(v - vb[i]));
    const sortedIdx = diffs.map((d, i) => i).sort((i, j) => diffs[i] - diffs[j]);
    const keepCount = Math.max(1, Math.ceil(sortedIdx.length * 0.25));
    const sharedIdx = sortedIdx.slice(0, keepCount);

    return sharedIdx
        .sort((i, j) => i - j)
        .map(i => labelFor(keys[i], i));
}

function dimensionStats(database, excludeSeed) {
    if (!isValidDatabase(database) || database.length === 0) return [];

    const validEntries = database
        .filter(e => e && isNonEmptyVector(e.physicalVector))
        .filter(e => excludeSeed === undefined || e.seed !== excludeSeed);

    if (validEntries.length === 0) {
        warn('dimensionStats: no entries with a usable physicalVector.');
        return [];
    }

    const dims = toArray(validEntries[0].physicalVector).length;
    const usable = validEntries.filter(e => {
        const len = toArray(e.physicalVector).length;
        const ok = len === dims;
        if (!ok) {
            warn('dimensionStats: seed ' + e.seed + ' has physicalVector length ' +
                len + ', expected ' + dims + '; excluded from statistics.');
        }
        return ok;
    });

    const stats = [];
    for (let d = 0; d < dims; d++) {
        const col = usable.map(e => toArray(e.physicalVector)[d]);
        const m = mean(col);
        const sd = stddev(col, m);
        stats.push({ mean: m, sd: sd });
    }
    return stats;
}

function zScoresFor(alienVector, stats) {
    const v = toArray(alienVector);
    return v.map((val, i) => {
        const sd = stats[i] ? stats[i].sd : 0;
        if (!sd) return 0;
        return (val - stats[i].mean) / sd;
    });
}

function computeUniqueTraits(alien, database) {
    const resolved = resolvePhysical(alien);
    if (!isNonEmptyVector(resolved.vector)) {
        warn('computeUniqueTraits: alien has no usable physical vector.');
        return [];
    }
    const keys = resolved.keys || toArray(resolved.vector).map((_, i) => `dim${i}`);
    const seed = alien && alien.seed;
    const stats = dimensionStats(database, seed);
    if (stats.length === 0) return [];
    const zScores = zScoresFor(resolved.vector, stats);

    const unusual = [];
    zScores.forEach((z, i) => {
        if (Math.abs(z) >= UNUSUAL_Z_THRESHOLD) {
            const direction = z > 0 ? 'high' : 'low';
            const base = (PHYSICAL_KEY_LABELS[keys[i]] || `trait #${i}`).replace(/^Similar /, '');
            unusual.push(`Unusually ${direction} ${base}`);
        }
    });
    return unusual;
}

function computeRarity(alien, database) {
    const resolved = resolvePhysical(alien);
    if (!isNonEmptyVector(resolved.vector)) {
        warn('computeRarity: alien has no usable physical vector.');
        return null;
    }
    const seed = alien && alien.seed;
    const stats = dimensionStats(database, seed);
    if (stats.length === 0) return null;
    const zScores = zScoresFor(resolved.vector, stats);
    const avgAbsZ = mean(zScores.map(z => Math.abs(z)));
    return Number(clamp(avgAbsZ / RARITY_Z_CAP, 0, 1).toFixed(4));
}

function computeCluster(seed, database) {
    const target = entryFor(seed, database);
    if (!target || !isNonEmptyVector(target.physicalVector)) {
        warn('computeCluster: seed ' + seed + ' not found or has no physicalVector.');
        return null;
    }
    const vec = toArray(target.physicalVector);
    let h = 0x9e3779b9;

    for (let i = 0; i < vec.length; i++) {
        const v = vec[i];
        const vn = clamp(v, 0, 1); 
        const bucket = clamp(Math.floor(vn * CLUSTER_BUCKETS_PER_DIM), 0, CLUSTER_BUCKETS_PER_DIM - 1);
        h = mixHash(h, (bucket ^ (i * 131)) >>> 0);
    }
    return h % CLUSTER_COUNT;
}

function buildFingerprint(alien) {
    const physical = toArray(buildPhysicalVector(alien));
    const behaviour = buildBehaviourVector(alien).vector;
    const combined = physical.concat(behaviour);
    const h = hashVector(combined);
    return 'REG-' + h.toString(36).toUpperCase().padStart(7, '0');
}

function findClosestByMetric(seed, database, metricName) {
    if (metricName === 'physical') return findClosestPhysical(seed, database);
    if (metricName === 'overall') return findClosestOverall(seed, database);
    if (metricName === 'behaviour' || metricName === 'behavioural') {
        return findClosestBehaviour(seed, database);
    }

    if (!isValidDatabase(database)) return null;
    const target = entryFor(seed, database);
    if (!target) return null;
    const targetVal = target.registry ? target.registry[metricName] : undefined;
    if (targetVal === undefined) {
        warn('findClosestByMetric: metric "' + metricName + '" not found on seed ' + seed + '.');
        return null;
    }

    let best = null, bestDiff = Infinity;
    for (const entry of others(seed, database)) {
        const val = entry.registry ? entry.registry[metricName] : undefined;
        if (val === undefined) continue;
        const diff = Math.abs(val - targetVal);
        if (diff < bestDiff) { bestDiff = diff; best = entry; }
    }
    return best ? best.seed : null;
}

function eyeStyleObservation(style) {
    const s = style || 'Unknown';
    if (s === 'Triangle') return 'Central elevated visual cluster.';
    if (s === 'Arc') return 'Distributed visual sensors maximize frontal coverage.';
    if (s === 'BrokenSymmetry') return 'Visual organs exhibit significant developmental asymmetry.';
    if (s === 'Crown') return 'Pericranial visual placement increases superior field sampling.';
    if (s === 'SideMounted') return 'Lateral visual placement expands side-field coverage.';
    if (s === 'Forehead') return 'Compact frontal visual concentration.';
    if (s === 'UnevenBilateral') return 'Bilateral visual system with unequal organ scaling.';
    if (s === 'OffsetBilateral') return 'Bilateral visual system with anterior-posterior offset.';
    if (s === 'Horizontal') return 'Horizontally distributed ocular arrangement.';
    if (s === 'Vertical') return 'Vertical ocular stacking along frontal axis.';
    if (s === 'Diagonal') return 'Diagonal ocular alignment across cranial surface.';
    if (s === 'Diamond') return 'Quad-node visual geometry with central emphasis.';
    return 'Visual cluster style not classified.';
}

function postureObservation(posture) {
    if (posture === 'upright') return 'Motion reconstruction indicates persistent upright spinal orientation.';
    if (posture === 'forward_lean') return 'Motion reconstruction indicates persistent forward body inclination.';
    if (posture === 'arched') return 'Spinal curvature remains elevated during locomotion.';
    if (posture === 'slouched') return 'Thoracic axis exhibits sustained downward-set carriage.';
    if (posture === 'curved') return 'Primary body axis follows a continuous lateral curvature.';
    if (posture === 'coiled') return 'Axial posture remains compact with coiled load distribution.';
    if (posture === 'reared') return 'Anterior body mass is maintained in elevated reared stance.';
    return 'Posture signature not classified.';
}

function tailObservation(g) {
    const tailLen = g && g.tailLength !== undefined ? g.tailLength : 0;
    const type = g && g.tailType ? g.tailType : 'Unknown';
    if (tailLen < 0.15) return 'Caudal extension absent or vestigial.';
    if (tailLen < 0.9) return `Short caudal extension with ${type.toLowerCase()} morphology.`;
    if (tailLen < 2.0) return `Moderate caudal extension with ${type.toLowerCase()} morphology.`;
    return `Elongated caudal extension with ${type.toLowerCase()} morphology.`;
}

function summarizeMorphologyObservations(alien) {
    if (!alien || typeof alien !== 'object') return [];
    const out = [];

    if (alien.eyeClusterStyle) out.push(eyeStyleObservation(alien.eyeClusterStyle));
    if (alien.genome && alien.genome.posture) out.push(postureObservation(alien.genome.posture));
    if (alien.genome) out.push(tailObservation(alien.genome));


    if (alien.genome) {
        const hs = alien.genome.headSize || 0;
        const hw = alien.genome.headWidth || 0;
        const nt = alien.genome.neckThickness || 0;
        if (hs * hw > 1.8 && nt >= 0.9) out.push('Cranial mass is supported by reinforced cervical architecture.');
        else if (hs * hw > 1.8 && nt < 0.9) out.push('Cranial-to-cervical proportion is high with limited neck reinforcement.');
    }

    return out;
}

// Public API
const RegistryEngine = {
    buildPhysicalVector,
    buildBehaviourVector,
    computePhysicalDistance,
    computeBehaviourDistance,
    computeSimilarity,
    findClosestPhysical,
    findClosestBehaviour,
    findClosestOverall,
    findTopMatches,
    computeSharedTraits,
    computeUniqueTraits,
    computeRarity,
    computeCluster,
    buildFingerprint,
    findClosestByMetric,
    summarizeMorphologyObservations
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RegistryEngine;
} else if (typeof window !== 'undefined') {
    window.RegistryEngine = RegistryEngine;
}