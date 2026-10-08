import { $, signal } from "signaloits";
import type { Properties, Signal } from "signaloits";

import type { Context } from "./context";

export type Layer = {
  compute?: (pass: GPUComputePassEncoder) => void;
  update?: (encode: GPUCommandEncoder) => void;
  render: (pass: GPURenderPassEncoder) => void;
  pick?: (pass: GPURenderPassEncoder) => void;
  postFrame?: () => void;
};

export type LayerFactory<P> = (context: Context, props: Properties<P>) => Layer;

export type LayerDescriptor = <R>(
  apply: <P>(factory: LayerFactory<P>, properties: Properties<P>) => R,
) => R;

export const createLayerType =
  <P>(factory: LayerFactory<P>) =>
  (properties: Properties<P>): LayerDescriptor =>
  <R>(apply: <Q>(factory: LayerFactory<Q>, properties: Properties<Q>) => R) =>
    apply(factory, properties);

export const createLayer = (
  context: Context,
  descriptor: LayerDescriptor,
): Layer => descriptor((factory, properties) => factory(context, properties));

export const loadShader = (url: URL): Signal<string | undefined> => {
  const [code, setCode] = signal<string | undefined>(undefined);
  void fetch(url).then(async response => {
    if (!response.ok)
      throw new Error(
        `Failed to load shader "${url}": ${response.status} ${response.statusText}`,
      );
    setCode(await response.text());
  });
  return code;
};

export const loadShaders = (...urls: URL[]): Signal<string | undefined> => {
  const shaders = urls.map(loadShader);
  return $(() => {
    const codes = shaders.map(shader => shader());
    if (codes.some(code => code === undefined)) return undefined;
    return codes.join("\n");
  });
};

export const viewLayout = (device: GPUDevice) =>
  device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility:
          GPUShaderStage.VERTEX |
          GPUShaderStage.FRAGMENT |
          GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
    ],
  });

export const limit = (n: number) => {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(run: () => T | PromiseLike<T>): Promise<T> => {
    if (active >= n) await new Promise<void>(_ => queue.push(_));
    else active++;

    try {
      return await run();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
};

export const createLatest = <Arguments extends unknown[], Return>(
  fn: (...args: Arguments) => Promise<Return>,
) => {
  let token = {};
  return async (...args: Arguments): Promise<Return | undefined> => {
    const current = {};
    token = current;
    const result = await fn(...args);
    return token === current ? result : undefined;
  };
};

export const debounce = (callback: () => void, delay: number) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = undefined;
      callback();
    }, delay);
  };
};
