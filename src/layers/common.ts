import { $, resolve } from "signaloits";
import type { Properties, Signal } from "signaloits";

import { loadShader, viewLayout } from "../common";
import type { Context } from "../context";

export type CommonLayerProps = {
  depth?: boolean;
  depthWrite?: boolean;
  polygonOffset?: number;
};

export const createLayerRenderer = ({
  context,
  shader,
  topology = "triangle-list",
  bindGroupLayout,
  buffers,
  constants,
  depth,
  depthWrite,
  polygonOffset,
  bindGroup,
  draw,
}: {
  context: Context;
  shader: Signal<string | undefined>;
  topology?: GPUPrimitiveTopology;
  bindGroupLayout: GPUBindGroupLayout;
  buffers?: GPUVertexBufferLayout[];
  constants?: Record<string, GPUPipelineConstantValue>;
  bindGroup: () => GPUBindGroup;
  draw: (pass: GPURenderPassEncoder) => void;
} & Properties<CommonLayerProps>) => {
  const { device, format, sampleCount } = context;

  const commonShader = loadShader(new URL("./common.wgsl", import.meta.url));

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [viewLayout(device), bindGroupLayout],
  });

  const alphaBlend: GPUBlendState = {
    color: {
      srcFactor: "src-alpha",
      dstFactor: "one-minus-src-alpha",
    },
    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
  };

  const depthStencil = $((): GPUDepthStencilState => {
    const depthEnabled = resolve(depth) ?? true;
    return {
      format: "depth24plus" as const,
      depthWriteEnabled: resolve(depthWrite) ?? depthEnabled,
      depthCompare: depthEnabled ? "less" : "always",
      depthBias: resolve(polygonOffset) ?? 0,
    };
  });

  const module = $(() => {
    const commonCode = commonShader();
    const code = shader();
    if (commonCode === undefined || code === undefined) return undefined;
    return device.createShaderModule({ code: commonCode + code });
  });

  const pipeline = $(() => {
    const module_ = module();
    if (!module_) return undefined;
    return device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: module_, entryPoint: "vertex", buffers },
      primitive: { topology },
      depthStencil: depthStencil(),
      fragment: {
        module: module_,
        entryPoint: "render",
        constants,
        targets: [
          {
            format,
            blend: alphaBlend,
          },
          {
            format: "rgba8unorm",
            blend: alphaBlend,
          },
        ],
      },
      multisample: { count: sampleCount },
    });
  });

  const pickPipeline = $(() => {
    const module_ = module();
    if (!module_) return;
    return device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: module_, entryPoint: "vertex", buffers },
      primitive: { topology },
      depthStencil: { ...depthStencil(), depthWriteEnabled: true },
      fragment: {
        module: module_,
        entryPoint: "pick",
        targets: [
          { format: "rg32uint" },
          { format: "r32float" },
          { format: "r32uint" },
        ],
      },
      multisample: { count: 1 },
    });
  });

  const execute =
    (pipeline: Signal<GPURenderPipeline | undefined>) =>
    (pass: GPURenderPassEncoder) => {
      const pipeline_ = pipeline();
      if (!pipeline_) return;
      pass.setPipeline(pipeline_);
      pass.setBindGroup(1, bindGroup());
      draw(pass);
    };

  const render = execute(pipeline);
  const pick = execute(pickPipeline);

  return { render, pick };
};
