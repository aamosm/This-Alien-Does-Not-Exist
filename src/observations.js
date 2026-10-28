export function observe(record) {
  const m = record.measurements,
    claims = [];
  function add(id, section, kind, text, fields) {
    claims.push({
      id,
      section,
      kind,
      text,
      ruleVersion: 2,
      evidence: fields.map((path) => ({
        path,
        value: path.split(".").reduce((o, k) => o?.[k], record),
      })),
    });
  }
  add(
    "anatomy",
    "Morphology",
    "Measured",
    `${m.bodyPlan} body; ${m.limbCount} limbs${m.wingCount ? ` plus ${m.wingCount} wings` : ""}.`,
    [
      "measurements.bodyPlan",
      "measurements.limbCount",
      "measurements.wingCount",
    ],
  );
  add(
    "eyes",
    "Morphology",
    "Measured",
    m.eyeCount === 0
      ? "No eyes are present in the reconstruction."
      : `${m.eyeCount} ${m.eyeCount === 1 ? "eye" : "eyes"}${m.eyeCount > 1 ? ` in a ${m.eyeStyle.toLowerCase()} arrangement` : ""}; ${m.pupil} pupils.`,
    ["measurements.eyeCount", "measurements.eyeStyle", "measurements.pupil"],
  );
  if (m.eyeCount > 1)
    add(
      "eye-variation",
      "Morphology",
      "Measured",
      m.eyeSizeVariation > 0.08
        ? `Eye radii vary by ${Math.round(m.eyeSizeVariation * 100)}% of the largest radius.`
        : "Eye radii are approximately equal.",
      ["measurements.eyeSizeVariation"],
    );
  add(
    "tail",
    "Morphology",
    "Measured",
    m.tailPresent
      ? `${m.tailType} tail${m.tailBodyRatio === null ? "." : `; its reference length is ${(m.tailBodyRatio * 100).toFixed(0)}% of the body reference length.`}`
      : "No tail is present.",
    [
      "measurements.tailPresent",
      "measurements.tailType",
      "measurements.tailBodyRatio",
    ],
  );
  if (m.limbCount > 0 && m.limbBodyRatio !== null)
    add(
      "limb-length",
      "Morphology",
      "Measured",
      `Appendage reference length is ${(m.limbBodyRatio * 100).toFixed(0)}% of body length.`,
      ["measurements.limbBodyRatio"],
    );
  if (m.mouth)
    add("mouth", "Morphology", "Measured", `${m.mouth} feeding structure.`, [
      "measurements.mouth",
    ]);
  add(
    "surface",
    "Surface",
    "Measured",
    `${m.pattern} pigmentation${m.pattern !== "Plain" && m.contrast > 0 ? ` with ${Math.round(m.contrast * 100)}% model contrast` : ""}.`,
    ["measurements.pattern", "measurements.contrast"],
  );
  if (record.identity.version === "v2") {
    add(
      "feeding",
      "Ecology",
      "Model",
      `The ecological model assigns a ${m.diet.toLowerCase()} feeding role and a ${m.strategy.toLowerCase()} strategy.`,
      ["ecology.diet", "ecology.strategy"],
    );
    add(
      "activity",
      "Ecology",
      "Model",
      `${m.activity} activity preference in the generated ${m.medium.toLowerCase()} environment.`,
      ["ecology.activity", "ecology.medium"],
    );
    add(
      "exploration",
      "Behaviour",
      "Model",
      `Model exploration score: ${record.behavior.exploration.toFixed(2)} on a 0–1 scale.`,
      ["behavior.exploration", "environment.resources"],
    );
    add(
      "caution",
      "Behaviour",
      "Model",
      `Caution is ${record.behavior.caution > 0.66 ? "high" : record.behavior.caution < 0.33 ? "low" : "moderate"}; social tendency is ${record.behavior.sociality > 0.66 ? "group-oriented" : record.behavior.sociality < 0.33 ? "solitary" : "intermediate"}.`,
      ["behavior.caution", "behavior.sociality"],
    );
  } else
    add(
      "legacy",
      "Record",
      "Measured",
      "Legacy anatomy is preserved. Unimplemented mouths and ecological telemetry are not inferred from the old labels.",
      ["identity.version"],
    );
  return claims;
}
