# eutopia.ts

A TypeScript WebGPU library for rendering interactive worlds.

Compose a world from reactive layers for terrain, lines, fills, polygons, text,
billboards, and instanced objects. Includes view controls, picking hooks,
transitions, vector math helpers, and WGSL-backed layer assets.

## Example

```ts
import {
  $,
  atmosphere,
  createDevice,
  createWorld,
  line,
  now,
  root,
} from "eutopia.ts";
import type { Vec3, Vec4, View } from "eutopia.ts";

const element = document.createElement("canvas");
document.body.appendChild(element);

const device = await createDevice();

const view: View = {
  center: [-122.4194, 37.7749, 0],
  distance: 50_000_000,
  orientation: [0, 0, 0],
  fieldOfView: 45,
};

const color: Vec4 = [0.2, 0.8, 1, 0.65];
const grid = (position: (t: number) => Vec3) =>
  Array.from({ length: 100 }, (_, i) => ({
    position: position(i / 99),
    color,
    width: 50_000,
    minWidthPixels: 1,
    maxWidthPixels: 5,
  }));
const vertices = [
  ...Array.from({ length: 11 }, (_, i) =>
    grid(t => [-180 + 360 * t, -75 + i * 15, 10_000]),
  ),
  ...Array.from({ length: 24 }, (_, i) =>
    grid(t => [-180 + i * 15, -80 + 160 * t, 10_000]),
  ),
];

root(dispose => {
  createWorld({
    element,
    device,
    view,
    layers: [atmosphere({ time: $(() => now() * 20) }), line({ vertices })],
  });
  return { dispose };
});
```
