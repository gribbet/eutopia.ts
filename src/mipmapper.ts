import { $ } from "signaloits";

import { loadShader } from "./common";

export const createMipmapper = (device: GPUDevice) => {
  const shader = loadShader(new URL("./mipmapper.wgsl", import.meta.url));

  const module = $(() => {
    const code = shader();
    if (code === undefined) return;
    return device.createShaderModule({ code });
  });

  const pipeline = $(() => {
    const module_ = module();
    if (!module_) return;
    return device.createRenderPipeline({
      layout: "auto",
      vertex: { module: module_, entryPoint: "vertex" },
      fragment: {
        module: module_,
        entryPoint: "fragment",
        targets: [{ format: "rgba8unorm" }],
      },
    });
  });

  const sampler = device.createSampler({
    minFilter: "linear",
    magFilter: "linear",
  });

  const generate = (
    encoder: GPUCommandEncoder,
    texture: GPUTexture,
    layer: number,
    firstMip: number,
  ) => {
    if (firstMip >= texture.mipLevelCount) return;

    const pipeline_ = pipeline();
    if (!pipeline_) return;

    const view = (level: number) =>
      texture.createView({
        dimension: "2d",
        baseArrayLayer: layer,
        arrayLayerCount: 1,
        baseMipLevel: level,
        mipLevelCount: 1,
      });

    for (let mip = firstMip; mip < texture.mipLevelCount; mip++) {
      const bindGroup = device.createBindGroup({
        layout: pipeline_.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: view(mip - 1) },
          { binding: 1, resource: sampler },
        ],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { view: view(mip), loadOp: "clear", storeOp: "store" },
        ],
      });
      pass.setPipeline(pipeline_);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
  };

  const ready = () => pipeline() !== undefined;

  return { generate, ready };
};
