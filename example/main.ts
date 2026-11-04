import {
  $,
  atmosphere,
  createControl,
  createDevice,
  createWorld,
  fill,
  line,
  map,
  object,
  root,
  signal,
  terrain,
  text,
  vec4Transition,
} from "eutopia.ts";
import type {
  Mesh,
  Vertex as MeshVertex,
  PickEvent,
  Vec2,
  Vec3,
  Vec4,
  View,
} from "eutopia.ts";

const mapboxToken =
  "pk.eyJ1IjoiZ3JhaGFtZ2liYm9ucyIsImEiOiJja3Qxb3Q5bXQwMHB2MnBwZzVyNzgyMnZ6In0.4qLjlbLm6ASuJ5v5gN6FHQ";
const imageryUrl = `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${mapboxToken}`;
const elevationUrl = `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}@2x.png?access_token=${mapboxToken}`;
const outline: Vec4 = [0, 0, 0, 1];
const emojis =
  "🌍 🗼 🐋 🌋 🛰️ 🏝️ 🐘 🦒 🌌 🏔️ 🌊 🛶 🦜 🐧 🕌 🌸 🐉 🧭 🚀 🌴 🦁 🪸 🏜️ 🎈".split(
    " ",
  );
const randomEmoji = () => emojis[Math.floor(Math.random() * emojis.length)] ?? "🌍";

const device = await createDevice();

export const createApp = () =>
  root(dispose => {
    const element = document.createElement("canvas");
    document.body.appendChild(element);

    const [view, setView] = signal<View>({
      center: [-98.5, 39.8, 0],
      distance: 12000000,
      orientation: [0, 0, 0],
      fieldOfView: 45,
    });

    const [time, setTime] = signal(0);
    const animate = (t: number) => {
      setTime(t);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    const [items, setItems] = signal(
      Array.from({ length: 100 }, () => {
        const longitude = Math.random() * 360 - 180;
        const latitude = (Math.asin(Math.random() * 2 - 1) * 180) / Math.PI;
        return {
          id: Math.random().toString(),
          position: [longitude, latitude, 20000] as Vec3,
          emoji: randomEmoji(),
          test: false,
        };
      }),
    );

    const appendItem = (position: Vec3) => {
      const id = Math.random().toString();
      setItems([
        ...items(),
        {
          id,
          position,
          emoji: randomEmoji(),
          test: false,
        },
      ]);
      setTimeout(() => {
        setItems(items().filter(i => i.id !== id));
      }, 50000);
    };

    const cubeMesh = createCubeMesh();
    const cubeSize = 1000; // 50 km half-extent
    const spin = $<Vec4>(() => {
      const a = time() * 0.0005;
      return [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
    });

    // Static global routes
    const redOrangeLine = Array.from({ length: 1000 }, (_, i) => {
      const t = i / 999;
      const lon = -157 + t * (121 - -157);
      const lat = 20 + Math.sin(t * Math.PI) * 42;
      const alt = 20000 + Math.sin(t * Math.PI * 4) * 120000 + t * 180000;
      const r = 1.0;
      const g = t < 0.5 ? 0.2 + t * 1.6 : 1.0;
      const b = t < 0.5 ? 0.2 : 0.2 + (t - 0.5) * 1.6;
      const w = 28000 + Math.sin(t * Math.PI * 6) * 14000 + 14000;
      return {
        position: [lon, lat, alt] as const,
        color: [r, g, b, 0.95] as const,
        width: w,
      };
    });

    const waypointsLine: { position: Vec3; color: Vec4; width: number }[] = [
      {
        position: [-123, 49, 150000],
        color: [0.3, 0.9, 1.0, 0.85],
        width: 60000,
      },
      {
        position: [-74, 40, 500000],
        color: [0.2, 0.8, 1.0, 0.85],
        width: 60000,
      },
      {
        position: [0, 51.5, 150000],
        color: [0.1, 0.7, 1.0, 0.85],
        width: 60000,
      },
      {
        position: [37.6, 55.7, 500000],
        color: [0.1, 0.6, 1.0, 0.85],
        width: 60000,
      },
      {
        position: [139.7, 35.7, 150000],
        color: [0.1, 0.5, 1.0, 0.85],
        width: 60000,
      },
    ];

    // Animated ring line that depends on time
    const animatedRingLine = $(() => {
      const pulse = 1600 + Math.sin(time() * 0.002) * 800;
      const centerLon = -98.5;
      const centerLat = 39.8;
      const ringRadius = 18;
      const count = 1000;
      const ringPoints = Array.from({ length: count }, (_, i) => {
        const t = (i / (count - 1)) * Math.PI * 2;
        return {
          position: [
            centerLon + Math.cos(t) * ringRadius,
            centerLat + Math.sin(t) * ringRadius,
            100000 + Math.sin(t * 3 + time() * 0.0015) * 80000,
          ] as const,
          color: [0.2, 0.9, 1.0, 0.9] as const,
          width: pulse * 22,
        };
      });
      return ringPoints;
    });

    const lineExamples = $(() => [animatedRingLine()]);

    const staticLineExamples = [redOrangeLine, waypointsLine];

    const onTerrainClick = ({ position }: PickEvent) => appendItem(position);

    const textEntries = map(
      items,
      item => {
        const targetColor = $((): Vec4 =>
          item().test ? [1.0, 0.35, 0.35, 1.0] : [1.0, 1.0, 1.0, 1.0],
        );
        const position = $(() => item().position);
        const color = vec4Transition(targetColor);
        const updatePosition = (nextPosition: Vec3) => {
          const { id } = item();
          setItems(
            items().map(entry =>
              entry.id === id ? { ...entry, position: nextPosition } : entry,
            ),
          );
        };

        return {
          text: item().emoji,
          position,
          size: 160000,
          font: "sans-serif",
          fontSize: 128,
          color,
          outline,
          minScale: 0.25,
          maxScale: 1.0,
          onClick: () => {
            const { id, test } = item();
            setItems(
              items().map(entry =>
                entry.id === id ? { ...entry, test: !test } : entry,
              ),
            );
          },
          onDrag: (event: PickEvent) => updatePosition(event.position),
        };
      },
      _ => _.id,
    );

    const layers = $(() => [
      terrain({ imageryUrl, elevationUrl, onClick: onTerrainClick }),
      atmosphere({}),
      text({ entries: textEntries, polygonOffset: -1000 }),
      line({ vertices: staticLineExamples, outline }),
      line({ vertices: lineExamples, outline }),
      object({
        mesh: cubeMesh,
        instances: [
          {
            position: [-98.5, 39.8, 100000],
            scale: cubeSize * 20,
            minScalePixels: 24,
            maxScalePixels: 96,
            orientation: spin,
            outline,
          },
        ],
      }),
      fill({
        vertices: [
          { position: [-103, 36, 300000], color: [1, 0, 0, 0.5] },
          { position: [-94, 36, 300000], color: [0, 1, 0, 0.5] },
          { position: [-94, 43, 300000], color: [0, 0, 1, 0.5] },
          { position: [-103, 43, 300000], color: [1, 1, 0, 0.5] },
        ],
        indices: [0, 1, 2, 0, 2, 3],
        depthWrite: false,
      }),
    ]);

    const world = createWorld({
      device,
      element,
      view,
      layers,
    });

    createControl({ element, world, view, setView });

    return {
      dispose,
    };
  });

const createCubeMesh = (): Mesh => {
  const faces: {
    corners: [number, number, number][];
    normal: [number, number, number];
    color: Vec4;
  }[] = [
    {
      corners: [
        [1, -1, 1],
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
      ],
      normal: [1, 0, 0],
      color: [1, 0, 0, 1],
    },
    {
      corners: [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
      normal: [-1, 0, 0],
      color: [0, 1, 1, 1],
    },
    {
      corners: [
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1],
      ],
      normal: [0, 1, 0],
      color: [0, 1, 0, 1],
    },
    {
      corners: [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
      normal: [0, -1, 0],
      color: [1, 0, 1, 1],
    },
    {
      corners: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
      normal: [0, 0, 1],
      color: [0, 0, 1, 1],
    },
    {
      corners: [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
      ],
      normal: [0, 0, -1],
      color: [1, 1, 0, 1],
    },
  ];

  const vertices: MeshVertex[] = [];
  const indices: Vec3[] = [];
  const faceUvs: Vec2[] = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ];

  faces.forEach((face, f) => {
    face.corners.forEach((corner, c) => {
      vertices.push({
        position: corner,
        color: face.color,
        uv: faceUvs[c],
        normal: face.normal,
      });
    });
    const base = f * 4;
    indices.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
  });

  return { vertices, indices };
};

createApp();
