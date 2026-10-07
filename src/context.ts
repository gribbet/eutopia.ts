import { defer, signal } from "signaloits";

import type { Vec2 } from "./model";
import { createPickRegistry } from "./pick-registry";
import { createTextureLoader } from "./texture-loader";

export type Context = Awaited<ReturnType<typeof createContext>>;

export const createContext = (
  element: HTMLCanvasElement,
  device: GPUDevice,
) => {
  const sampleCount = 4;

  const context = element.getContext("webgpu");
  if (!context) throw new Error("No WebGPU");

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

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
  defer(() => observer.disconnect());

  const textureLoader = createTextureLoader({ device });
  const pickRegistry = createPickRegistry();

  return {
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
