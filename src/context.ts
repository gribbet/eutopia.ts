import { defer, signal } from "signaloits";

import { tileTextureLayers } from "./configuration";
import type { Vec2 } from "./model";
import { createPickRegistry } from "./pick-registry";
import { createTextureLoader } from "./texture-loader";

export type Context = Awaited<ReturnType<typeof createContext>>;

export const createContext = async (element: HTMLCanvasElement) => {
  const sampleCount = 4;

  const { gpu } = navigator;
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter found");

  const device = await adapter.requestDevice({
    requiredLimits: { maxTextureArrayLayers: tileTextureLayers },
  });

  const devicePixelRatio = window.devicePixelRatio || 1;
  const { width, height } = element;
  const [size, setSize] = signal<Vec2>([width, height]);
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    element.width = width * devicePixelRatio;
    element.height = height * devicePixelRatio;
    setSize([width, height]);
  });
  observer.observe(element);

  const context = element.getContext("webgpu");
  if (!context) throw new Error();

  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  const textureLoader = createTextureLoader({ device });
  const pickRegistry = createPickRegistry();

  defer(() => {
    observer.disconnect();
    device.destroy();
  });

  return {
    element,
    device,
    context,
    format,
    size,
    devicePixelRatio,
    sampleCount,
    textureLoader,
    pickRegistry,
  };
};
