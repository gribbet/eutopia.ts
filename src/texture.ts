import { defer } from "signaloits";

export const createTexture = (
  device: GPUDevice,
  descriptor: GPUTextureDescriptor,
): GPUTexture => {
  const texture = device.createTexture(descriptor);
  defer(() => texture.destroy());
  return texture;
};
