import { $ } from "signaloits";

import type { Context } from "./context";
import { createOutliner } from "./outliner";
import { createTexture } from "./texture";

type Renderer = (pass: GPURenderPassEncoder) => void;

export const createRenderer = (context: Context) => {
  const { device, textureSize, format, sampleCount } = context;

  const renderTexture = $(() =>
    createTexture(device, {
      size: [...textureSize()],
      sampleCount,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  );

  const depthTexture = $(() =>
    createTexture(device, {
      size: [...textureSize()],
      sampleCount,
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  );

  const renderView = () => renderTexture().createView();
  const depthView = () => depthTexture().createView();

  const outliner = createOutliner({ context, textureSize });

  const render = (encoder: GPUCommandEncoder, draw: Renderer) => {
    const canvasView = context.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderView(),
          resolveTarget: canvasView,
          loadOp: "clear",
          storeOp: "discard",
        },
        outliner.attachment(),
      ],
      depthStencilAttachment: {
        view: depthView(),
        depthLoadOp: "clear",
        depthStoreOp: "discard",
        depthClearValue: 1.0,
      },
    });

    draw(pass);
    pass.end();

    outliner.render(encoder);
  };

  return {
    render,
  };
};
