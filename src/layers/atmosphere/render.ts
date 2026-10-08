import { $ } from "signaloits";
import type { Signal } from "signaloits";

import { loadShaders } from "../../common";
import type { Context } from "../../context";
import { createLayerRenderer } from "../common";

export const createRenderPipeline = ({
  context,
  sun,
  sky,
}: {
  context: Context;
  sun: Signal<GPUBuffer>;
  sky: GPUTexture;
}) => {
  const { device } = context;

  const skyShader = loadShaders(
    new URL("./common.wgsl", import.meta.url),
    new URL("./sky.wgsl", import.meta.url),
  );
  const lightingShader = loadShaders(
    new URL("./common.wgsl", import.meta.url),
    new URL("./lighting.wgsl", import.meta.url),
  );

  const sampler = device.createSampler({
    addressModeU: "repeat",
    minFilter: "linear",
    magFilter: "linear",
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      },
    ],
  });

  const bindGroup = $(() =>
    device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: sun() } },
        { binding: 2, resource: sky.createView() },
        { binding: 3, resource: sampler },
      ],
    }),
  );

  const { render: renderSky } = createLayerRenderer({
    context,
    shader: skyShader,
    bindGroupLayout,
    depth: true,
    depthWrite: false,
    bindGroup,
    draw: pass => pass.draw(3),
  });

  const { render: renderDayNight } = createLayerRenderer({
    context,
    shader: lightingShader,
    bindGroupLayout,
    depth: false,
    depthWrite: false,
    bindGroup,
    draw: pass => pass.draw(3),
  });

  return (pass: GPURenderPassEncoder) => {
    renderSky(pass);
    renderDayNight(pass);
  };
};
