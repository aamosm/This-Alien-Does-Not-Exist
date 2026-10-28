import { parentPort, workerData } from "node:worker_threads";
import { DiscoveryPicker, signatureOf } from "../src/discovery.js";
import { mix64 } from "../src/random.js";
let repeat = 0,
  resamples = 0,
  exhaustions = 0;
for (let session = workerData.from; session < workerData.to; session++) {
  let serial = (BigInt(session) + 1n) * 100000n;
  const picker = new DiscoveryPicker({
      entropy: () => mix64(serial++).toString(),
    }),
    seen = [];
  for (let click = 0; click < 20; click++) {
    const r = picker.next(),
      sig = signatureOf(r);
    if (seen.includes(sig)) repeat++;
    resamples += picker.lastAttempts - 1;
    seen.push(sig);
    if (seen.length > 10) seen.shift();
  }
  exhaustions += picker.exhausted;
  if ((session - workerData.from + 1) % 500 === 0)
    parentPort.postMessage({ complete: session - workerData.from + 1 });
}
parentPort.postMessage({ finished: true, repeat, resamples, exhaustions });
