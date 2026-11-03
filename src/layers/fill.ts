import { $, effect, resolve } from "signaloits";

import { createLayerType, loadShader } from "../common";
import { createImageTexture } from "../image-texture";
import type { Vec2, Vec3, Vec4 } from "../model";
import type { PickHandlers } from "../pick-registry";
import { array, buffer, position, struct, u32, vec2f, vec4f } from "../storage";
import { createLayerRenderer } from "./common";
import type { CommonLayerProps } from "./common";

export type Vertex = {
  position: Vec3;
  color?: Vec4;
  uv?: Vec2;
};

export type FillProps = PickHandlers &
  CommonLayerProps & {
    vertices: readonly Vertex[];
    indices: readonly number[];
    image?: string;
  };

export const fill = createLayerType<FillProps>(
  (context, { vertices, indices, image, outline, ...props }) => {
    const { device, pickRegistry } = context;

    const storage = buffer(
      array(
        struct({
          position: position(),
          color: vec4f(),
          uv: vec2f(),
          pickId: u32(),
          outline: vec4f(),
        }),
      ),
      device,
      {
        usage: GPUBufferUsage.STORAGE,
        initialCapacity: 1024,
      },
    );
    const imageTexture = createImageTexture({ device, image, label: "fill" });
    const indexStorage = buffer(array(u32()), device, {
      usage: GPUBufferUsage.INDEX,
      initialCapacity: 1024,
    });

    const shader = loadShader(new URL("./fill.wgsl", import.meta.url));

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { viewDimension: "2d" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });

    const sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    const bindGroup = $(() =>
      device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: storage.buffer() } },
          { binding: 1, resource: imageTexture().createView() },
          { binding: 2, resource: sampler },
        ],
      }),
    );

    const { render, pick } = createLayerRenderer({
      context,
      bindGroupLayout,
      shader,
      ...props,
      bindGroup,
      draw: pass => {
        if (indexCount === 0) return;
        pass.setIndexBuffer(indexStorage.buffer(), "uint32");
        pass.drawIndexed(indexCount);
      },
    });

    const pickId = pickRegistry.allocate(props);

    let indexCount = 0;

    effect(() => {
      const _vertices = resolve(vertices);
      const _indices = resolve(indices);
      const _outline = resolve(outline) ?? [0, 0, 0, 0];
      indexCount = _indices.length;

      storage.value.resize(_vertices.length);
      storage.value.items.forEach((item, i) => {
        const v = _vertices[i];
        if (!v) return;
        item.position = v.position;
        item.color = v.color ?? [1, 1, 1, 1];
        item.uv = v.uv ?? [0, 0];
        item.pickId = pickId();
        item.outline = _outline;
      });

      indexStorage.value.resize(_indices.length);
      _indices.forEach((v, i) => {
        indexStorage.value.items[i] = v;
      });
    });

    const update = () => {
      storage.flush();
      indexStorage.flush();
    };

    return {
      update,
      render,
      pick,
    };
  },
);
