import { tileTextureLayers } from "./configuration";

export const createDevice = async () => {
  const { gpu } = navigator;
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter found");

  return await adapter.requestDevice({
    requiredLimits: { maxTextureArrayLayers: tileTextureLayers },
  });
};
