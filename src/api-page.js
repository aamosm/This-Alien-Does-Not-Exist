import { request, requestFromURL } from "./api.js";
const output = document.querySelector("pre");
async function run(payload) {
  try {
    return { ok: true, result: await request(payload) };
  } catch (e) {
    return { ok: false, error: { name: e.name, message: e.message } };
  }
}
if (location.search) {
  try {
    const response = await run(requestFromURL(location.href));
    output.textContent = JSON.stringify(response, null, 2);
  } catch (e) {
    output.textContent = JSON.stringify(
      { ok: false, error: { name: e.name, message: e.message } },
      null,
      2,
    );
  }
}
addEventListener("message", async (event) => {
  if (
    event.data?.type !== "alien:request" ||
    typeof event.data.id !== "string" ||
    event.data.id.length > 128
  )
    return;
  const response = await run(event.data.request);
  event.source?.postMessage(
    { type: "alien:response", id: event.data.id, ...response },
    event.origin === "null" ? "*" : event.origin,
  );
});
