import { $ } from "signaloits";
import type { Signal } from "signaloits";

import { loadShaders, viewLayout } from "../../common";
import type { Context } from "../../context";

export const createComputePipeline = ({
  context,
  sun,
  sky,
  skySize,
}: {
  context: Context;
  sun: Signal<GPUBuffer>;
  sky: GPUTexture;
  skySize: number;
}) => {
  const { device } = context;

  const shader = loadShaders(
    new URL("../common.wgsl", import.meta.url),
    new URL("./common.wgsl", import.meta.url),
    new URL("./sky.wgsl", import.meta.url),
  );

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba16float" },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [viewLayout(device), bindGroupLayout],
  });

  const bindGroup = $(() =>
    device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: sun() } },
        { binding: 1, resource: sky.createView() },
      ],
    }),
  );

  const pipeline = $(() => {
    const code = shader();
    if (code === undefined) return undefined;
    return device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: device.createShaderModule({ code }),
        entryPoint: "compute",
      },
    });
  });

  return (pass: GPUComputePassEncoder) => {
    const pipeline_ = pipeline();
    if (!pipeline_) return;
    pass.setPipeline(pipeline_);
    pass.setBindGroup(1, bindGroup());
    pass.dispatchWorkgroups(skySize / 8, skySize / 8);
  };
};
