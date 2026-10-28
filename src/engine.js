import { generateGrammar } from "./grammar.js";
import { normalizeSeed, piLength } from "./pi.js";
import { piRecord } from "./pi-render.js";
import { legacyRecord } from "../legacy/adapter.js";
import { shapeSignature } from "./geometry.js";
import { combatProfile } from "./combat.js";
import { observe } from "./observations.js";
export function generate(input, { generatorVersion = 2 } = {}) {
  const version = Number(generatorVersion),
    seed = normalizeSeed(input, version);
  if (version === 1) {
    const r = legacyRecord(seed);
    r.generatorVersion = 1;
    r.identity.generatorVersion = 1;
    r.kind = "alien";
    r.combat = combatProfile(r);
    return r;
  }
  const m = piLength(seed);
  if (m) {
    const r = piRecord(seed, m);
    r.combat = combatProfile(r);
    return r;
  }
  const record = generateGrammar(seed);
  record.shapeSignature = shapeSignature(record.geometry);
  record.claims = observe(record);
  record.combat = combatProfile(record);
  return record;
}
export function catalogueRecord(record) {
  return {
    identity: record.identity,
    generatorVersion: record.generatorVersion,
    schemaVersion: record.schemaVersion,
    kind: record.kind,
    phenotype: record.phenotype,
    pi: record.pi ?? null,
    measurements: record.measurements,
    combat: record.combat ?? combatProfile(record),
    shapeSignature: record.shapeSignature ?? null,
    materials: record.materials,
    ecology: record.ecology,
    environment: record.environment,
    behavior: record.behavior,
    motifs: record.motifs ?? [],
    diagnostics: record.diagnostics,
  };
}