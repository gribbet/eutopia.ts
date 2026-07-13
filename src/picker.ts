import { $ } from "signlets";

import { createBuffer } from "./buffer";
import type { Context } from "./context";
import { lonLatFromMercator } from "./math";
import type { Vec2, Vec3 } from "./model";
import { createTexture } from "./texture";

export type Picker = ReturnType<typeof createPicker>;

export type PickResult = {
  position: Vec3;
  id: number;
};

export const createPicker = (
  context: Pick<Context, "device" | "size" | "devicePixelRatio">,
) => {
  const readStride = 256;
  const xyReadOffset = 0;
  const zReadOffset = readStride;
  const idReadOffset = readStride * 2;

  const { device, size, devicePixelRatio } = context;
  const textureSize = $(() => {
    const [width, height] = size();
    return [width * devicePixelRatio, height * devicePixelRatio] as const;
  });

  const xyTexture = $(() =>
    createTexture(device, {
      size: [...textureSize()],
      format: "rg32uint",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    }),
  );

  const zTexture = $(() =>
    createTexture(device, {
      size: [...textureSize()],
      format: "r32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    }),
  );

  const idTexture = $(() =>
    createTexture(device, {
      size: [...textureSize()],
      format: "r32uint",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
    }),
  );

  const depthTexture = $(() =>
    createTexture(device, {
      size: [...textureSize()],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  );

  const xyView = () => xyTexture().createView();
  const zView = () => zTexture().createView();
  const idView = () => idTexture().createView();
  const depthView = () => depthTexture().createView();

  const readBuffer = createBuffer(device, {
    size: readStride * 3,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  let pending:
    | {
        xy: Vec2;
        promise: Promise<PickResult>;
        resolve: (result: PickResult) => void;
      }
    | undefined;

  const pick = async (xy: Vec2) => {
    while (pending) {
      if (vec2Equal(pending.xy, xy)) return pending.promise;
      await pending.promise;
    }
    const { promise, resolve } = Promise.withResolvers<PickResult>();
    pending = { xy, promise, resolve };
    return promise;
  };

  const encode = (
    encoder: GPUCommandEncoder,
    render: (_: GPURenderPassEncoder) => void,
  ) => {
    if (!pending || reading) return;
    const [x, y] = pending.xy;
    const [width, height] = size();
    const maxX = Math.max(0, Math.floor(width * devicePixelRatio) - 1);
    const maxY = Math.max(0, Math.floor(height * devicePixelRatio) - 1);
    const ox = Math.min(Math.max(0, Math.floor(x * devicePixelRatio)), maxX);
    const oy = Math.min(Math.max(0, Math.floor(y * devicePixelRatio)), maxY);

    const origin: [number, number, number] = [ox, oy, 0];
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: xyView(),
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: zView(),
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: idView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthView(),
        depthLoadOp: "clear",
        depthStoreOp: "discard",
        depthClearValue: 1.0,
      },
    });

    pass.setScissorRect(ox, oy, 1, 1);
    render(pass);
    pass.end();

    encoder.copyTextureToBuffer(
      { texture: xyTexture(), origin },
      { buffer: readBuffer, offset: xyReadOffset, bytesPerRow: readStride },
      [1, 1, 1],
    );
    encoder.copyTextureToBuffer(
      { texture: zTexture(), origin },
      { buffer: readBuffer, offset: zReadOffset, bytesPerRow: readStride },
      [1, 1, 1],
    );
    encoder.copyTextureToBuffer(
      { texture: idTexture(), origin },
      { buffer: readBuffer, offset: idReadOffset, bytesPerRow: readStride },
      [1, 1, 1],
    );
  };

  const read = async () => {
    await readBuffer.mapAsync(GPUMapMode.READ);

    const [x = 0, y = 0] = new Uint32Array(
      readBuffer.getMappedRange(xyReadOffset, 8),
    );
    const [z = 0] = new Float32Array(readBuffer.getMappedRange(zReadOffset, 4));
    const [id = 0xffffffff] = new Uint32Array(
      readBuffer.getMappedRange(idReadOffset, 4),
    );

    const [lon, lat] = lonLatFromMercator(x, y);

    readBuffer.unmap();

    const position: Vec3 = [lon, lat, z];

    return { position, id };
  };

  let reading = false;
  const postFrame = async () => {
    if (!pending || reading) return;
    reading = true;
    const result = await read();
    reading = false;
    pending.resolve(result);
    pending = undefined;
  };

  return {
    pick,
    encode,
    postFrame,
  };
};

const vec2Equal = ([x1, y1]: Vec2, [x2, y2]: Vec2) => x1 === x2 && y1 === y2;
