import { $ } from "signaloits";

import { loadShader } from "./common";
import type { Context } from "./context";
import { createTexture } from "./texture";

const outlineTextureFormat: GPUTextureFormat = "rgba8unorm";

type TextureSize = () => readonly [number, number];

export const createOutliner = ({
  context,
  textureSize,
  sceneTexture,
}: {
  context: Context;
  textureSize: TextureSize;
  sceneTexture: () => GPUTexture;
}) => {
  const { device, devicePixelRatio, format, sampleCount } = context;
  const shader = loadShader(new URL("./outliner.wgsl", import.meta.url));

  const outlineTexture = $(() =>
    createTexture(device, {
      size: [...textureSize()],
      sampleCount,
      format: outlineTextureFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  );

  const resolvedOutlineTexture = $(() =>
    createTexture(device, {
      size: [...textureSize()],
      format: outlineTextureFormat,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }),
  );

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {},
      },
    ],
  });

  const outlineSampler = device.createSampler({
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  });

  const pipeline = $(() => {
    const code = shader();
    if (code === undefined) return undefined;
    const module = device.createShaderModule({ code });
    return device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: { module, entryPoint: "vertex" },
      fragment: {
        module,
        entryPoint: "fragment",
        constants: { ["device_pixel_ratio"]: devicePixelRatio },
        targets: [{ format }],
      },
    });
  });

  const bindGroup = $(() =>
    device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: sceneTexture().createView() },
        { binding: 1, resource: resolvedOutlineTexture().createView() },
        { binding: 2, resource: outlineSampler },
      ],
    }),
  );

  const attachment = (): GPURenderPassColorAttachment => ({
    view: outlineTexture().createView(),
    resolveTarget: resolvedOutlineTexture().createView(),
    clearValue: [0, 0, 0, 0],
    loadOp: "clear",
    storeOp: "discard",
  });

  const render = (encoder: GPUCommandEncoder) => {
    const pipeline_ = pipeline();
    if (!pipeline_) return;
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline_);
    pass.setBindGroup(0, bindGroup());
    pass.draw(3);
    pass.end();
  };

  return {
    attachment,
    render,
  };
};
