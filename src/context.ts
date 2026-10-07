import { $, defer, signal } from "signaloits";

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
  const [size, setSize] = signal<Vec2>([0, 0]);
  const textureSize = $((): Vec2 => {
    const [width, height] = size();
    return [
      Math.max(1, Math.round(width * devicePixelRatio)),
      Math.max(1, Math.round(height * devicePixelRatio)),
    ];
  });

  const resize = ({ width, height }: { width: number; height: number }) => {
    width = Math.max(1, width);
    height = Math.max(1, height);
    setSize([width, height]);
    const [textureWidth, textureHeight] = textureSize();
    element.width = textureWidth;
    element.height = textureHeight;
  };

  resize(element.getBoundingClientRect());

  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    resize(entry.contentRect);
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
    textureSize,
    devicePixelRatio,
    sampleCount,
    textureLoader,
    pickRegistry,
  };
};
