import { renderSkin } from "./skin-render.js";
self.onmessage = async ({ data }) => {
  try {
    if (typeof OffscreenCanvas === "undefined") {
      self.postMessage({ type: "fallback" });
      return;
    }
    const canvas = new OffscreenCanvas(data.size, data.size),
      ctx = canvas.getContext("2d");
    if (!ctx) {
      self.postMessage({ type: "fallback" });
      return;
    }
    const stats = await renderSkin(ctx, data.record, data.size, data.size);
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ type: "image", bitmap, stats }, [bitmap]);
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
