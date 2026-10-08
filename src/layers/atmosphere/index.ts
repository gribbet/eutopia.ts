import { resolve } from "signaloits";

import { createLayerType } from "../../common";
import { buffer, vec4f } from "../../storage";
import { createTexture } from "../../texture";
import { createComputePipeline } from "./compute";
import { createRenderPipeline } from "./render";
import { atmosphereSun } from "./sun";

const skySize = 128;

export type AtmosphereProps = {
  time?: number;
};

export const atmosphere = createLayerType<AtmosphereProps>(
  (context, { time }) => {
    const { device } = context;

    const sun = buffer(vec4f(), device, { usage: GPUBufferUsage.UNIFORM });

    const sky = createTexture(device, {
      size: [skySize, skySize],
      format: "rgba16float",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    const computePipeline = createComputePipeline({
      context,
      sun: sun.buffer,
      sky,
      skySize,
    });

    const render = createRenderPipeline({ context, sun: sun.buffer, sky });

    const compute = (pass: GPUComputePassEncoder) => {
      sun.value = atmosphereSun(resolve(time) ?? Date.now() / 1000);
      sun.flush();
      computePipeline(pass);
    };

    return { compute, render };
  },
);
