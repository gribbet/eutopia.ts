import { $, resolve } from "signaloits";

import { createDataBuffer } from "../../buffer";
import { createLayerType } from "../../common";
import { terrainDownsample } from "../../configuration";
import type { Vec4 } from "../../model";
import type { PickHandlers } from "../../pick-registry";
import type { CommonLayerProps } from "../common";
import { createComputePipeline } from "./compute";
import { createRenderPipeline } from "./render";
import { createTileMapBuffer } from "./tile-map-buffer";
import { createTileTextureGroup } from "./tile-texture-group";

export type TerrainProps = PickHandlers &
  CommonLayerProps & {
    imageryUrl: string;
    elevationUrl: string;
    color?: Vec4;
    saturation?: number;
  };

export const terrain = createLayerType<TerrainProps>(
  (context, { imageryUrl, elevationUrl, ...props }) => {
    const { device, pickRegistry, devicePixelRatio } = context;

    const maxTiles = 1024;
    const tilesBuffer = createDataBuffer(
      device,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      new Uint32Array(maxTiles * 8),
    );

    const countBuffer = createDataBuffer(
      device,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      new Uint32Array([0]),
    );

    const imageryMap = createTileMapBuffer(device);

    const imagery = $(() => {
      const imagery = createTileTextureGroup({
        context,
        map: imageryMap,
        urlPattern: resolve(imageryUrl),
        mipmap: true,
      });
      imagery.ensure([[0, 0, 0]]);
      return imagery;
    });

    const imageryTextures = $(() => imagery().texture());

    const elevationMap = createTileMapBuffer(device);

    const elevation = $(() =>
      createTileTextureGroup({
        context,
        map: elevationMap,
        urlPattern: resolve(elevationUrl),
        initialDownsample: terrainDownsample,
      }),
    );

    const elevationTextures = $(() => elevation().texture());

    const pickId = pickRegistry.allocate(props);

    const computePipeline = createComputePipeline({
      device,
      tilesBuffer,
      countBuffer,
      imageryMapBuffer: imageryMap.buffer,
      elevationMapBuffer: elevationMap.buffer,
      elevationTextures,
      imageryTextures,
      devicePixelRatio,
    });

    const renderPipeline = createRenderPipeline({
      context,
      tilesBuffer,
      countBuffer,
      imageryTextures,
      elevationTextures,
      pickId,
      ...props,
    });

    let skipCompute = true;
    const compute = (pass: GPUComputePassEncoder) => {
      skipCompute = !skipCompute;
      if (skipCompute) return;
      computePipeline.compute(pass);
    };

    let oddFrame = true;
    const update = (encoder: GPUCommandEncoder) => {
      oddFrame = !oddFrame;
      if (oddFrame) return;
      imageryMap.update(encoder);
      elevationMap.update(encoder);
      renderPipeline.update(encoder);
    };

    const { render, pick } = renderPipeline;

    const postFrame = () => void updateTiles();

    const updateTiles = async () => {
      if (oddFrame) return;
      const tiles = await computePipeline.read();
      if (!tiles) return;
      elevation().ensure(tiles);
      imagery().ensure(tiles);
    };

    return {
      compute,
      update,
      render,
      pick,
      postFrame,
    };
  },
);
