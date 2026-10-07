import type { Properties } from "signaloits";
import { map } from "signaloits";

import {
  createLayer,
  createLayerType,
  type Layer,
  type LayerDescriptor,
} from "./common";
import type { Context } from "./context";

export type ContainerProperties = {
  layers: readonly LayerDescriptor[];
};

export const createContainerLayer = (
  context: Context,
  { layers }: Properties<ContainerProperties>,
): Layer => {
  const items = map(layers, descriptor => createLayer(context, descriptor()));

  const compute = (pass: GPUComputePassEncoder) =>
    items().forEach(_ => _.compute?.(pass));

  const update = (encoder: GPUCommandEncoder) =>
    items().forEach(_ => _.update?.(encoder));

  const render = (pass: GPURenderPassEncoder) =>
    items().forEach(_ => _.render(pass));

  const pick = (pass: GPURenderPassEncoder) =>
    items().forEach(_ => _.pick?.(pass));

  const postFrame = () => items().forEach(_ => _.postFrame?.());

  return {
    compute,
    update,
    render,
    pick,
    postFrame,
  };
};

export const container =
  createLayerType<ContainerProperties>(createContainerLayer);
