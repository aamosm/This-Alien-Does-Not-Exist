import { generate, catalogueRecord } from "./engine.js";
import { solveQuery } from "./inverse.js";
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "solve") {
      const result = await solveQuery(data.query, {
        onProgress: (progress) =>
          self.postMessage({ type: "progress", ...progress }),
      });
      self.postMessage(result);
      return;
    }
    if (
      data.type !== "import" ||
      !Array.isArray(data.identities) ||
      data.identities.length > 10000
    )
      throw new Error("Unsupported task.");
    const records = [];
    for (let i = 0; i < data.identities.length; i++) {
      records.push(
        catalogueRecord(
          generate(data.identities[i].seed, {
            generatorVersion: data.identities[i].generatorVersion,
          }),
        ),
      );
      if (i % 100 === 99) await new Promise((r) => setTimeout(r, 0));
    }
    self.postMessage({ records });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
