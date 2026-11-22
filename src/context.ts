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
  const toTextureSize = ([width, height]: Vec2): Vec2 => [
    Math.max(1, Math.round(width * devicePixelRatio)),
    Math.max(1, Math.round(height * devicePixelRatio)),
  ];
  const textureSize = $(() => toTextureSize(size()));

  const resize = ({ width, height }: { width: number; height: number }) => {
    setSize([width, height]);
    const [textureWidth, textureHeight] = toTextureSize([width, height]);
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
