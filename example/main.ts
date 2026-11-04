import {
  $,
  atmosphere,
  createControl,
  createDevice,
  createWorld,
  fill,
  line,
  map,
  now,
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

    const time = $(() => new Date(performance.timeOrigin + now() * 10000));

    const itemCount = 100;
const shapes = "■ ◆ ● ▰ ⬢".split(" ");
    const textPalette: Vec4[] = [
      [0.25, 0.82, 1.0, 1.0],
      [0.42, 0.62, 1.0, 1.0],
      [0.76, 0.55, 1.0, 1.0],
    ];
    const randomShape = () =>
      shapes[Math.floor(Math.random() * shapes.length)] ?? "■";
    const randomTextColor = () =>
      textPalette[Math.floor(Math.random() * textPalette.length)] ??
      textPalette[0]!;
    const seededRandom = (seed: number) => {
      const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return value - Math.floor(value);
    };
    const [items, setItems] = signal(
      Array.from({ length: itemCount }, () => {
        const longitude = Math.random() * 360 - 180;
        const latitude = (Math.asin(Math.random() * 2 - 1) * 180) / Math.PI;
        return {
          id: Math.random().toString(),
          position: [longitude, latitude, 20000] as Vec3,
          shape: randomShape(),
          color: randomTextColor(),
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
          shape: randomShape(),
          color: randomTextColor(),
          test: false,
        },
      ]);
      setTimeout(() => {
        setItems(items().filter(i => i.id !== id));
      }, 50000);
    };

    const cubeMesh = createCubeMesh();
    const trailCount = 10;
    const trailPointCount = 100;
    const trailPaths = Array.from({ length: trailCount }, (_, trailIndex) => {
      const seed = trailIndex * 10;
      const centerLongitude = seededRandom(seed + 1) * 360 - 180;
      const centerLatitude = seededRandom(seed + 2) * 60 - 30;
      const radiusLongitude = 20 + seededRandom(seed + 3) * 30;
      const radiusLatitude = 10 + seededRandom(seed + 4) * 17;
      const rotation = seededRandom(seed + 5) * Math.PI * 2;
      const baseAltitude = 180000 + seededRandom(seed + 6) * 240000;
      const altitudeVariation = 40000 + seededRandom(seed + 7) * 60000;
      return Array.from({ length: trailPointCount }, (_, pointIndex) => {
        const t = pointIndex / (trailPointCount - 1);
        const angle = t * Math.PI * 2;
        const x = Math.cos(angle) * radiusLongitude;
        const y = Math.sin(angle) * radiusLatitude;
        const longitude =
          centerLongitude + x * Math.cos(rotation) - y * Math.sin(rotation);
        const latitude =
          centerLatitude + x * Math.sin(rotation) + y * Math.cos(rotation);
        const altitude =
          baseAltitude + Math.sin(angle + rotation) * altitudeVariation;
        return {
          t,
          position: [longitude, latitude, altitude] as const,
        };
      });
    });

    const trailSpeed = 0.00000012;
    const trailCycle = Math.PI * 1.2;
    const visibleTrailLength = 0.32;
    const animatedTrails = $(() => {
      const phase = time().getTime() * trailSpeed;
      return trailPaths.map((path, lineIndex) => {
        const progress = (phase / trailCycle + lineIndex / trailCount) % 1;
        return path.map(({ t, position }) => {
          const age = (progress - t + 1) % 1;
          const opacity =
            age <= visibleTrailLength ? 1 - age / visibleTrailLength : 0;
          return {
            position,
            color: [0.75, 0.25, 1.0, opacity] as const,
            width: 90000 * opacity,
            maxWidthPixels: 10 * opacity,
          };
        });
      });
    });

    const onTerrainClick = ({ position }: PickEvent) => appendItem(position);

    const textEntries = map(
      items,
      item => {
        const targetColor = $((): Vec4 =>
          item().test ? [1.0, 0.35, 0.35, 1.0] : item().color,
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
          text: item().shape,
          position,
          size: 100000,
          font: "sans-serif",
          fontSize: 100,
          color,
          outline,
          minScale: 0.5,
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

    const cubeCount = 10;
    const cubeInstances = Array.from({ length: cubeCount }, (_, i) => {
      const longitude = ((i * 137.508) % 360) - 180;
      const latitude =
        (Math.asin(2 * ((i + 0.5) / cubeCount) - 1) * 180) / Math.PI;
      const [axisX, axisY, axisZ] = [
        Math.sin(i * 2.4),
        Math.cos(i * 1.7),
        Math.sin(i * 0.9 + 1),
      ];
      const axisLength = Math.hypot(axisX, axisY, axisZ);
      const orientation = $<Vec4>(() => {
        const angle = time().getTime() * 0.0000005 + i * 0.37;
        const halfAngle = angle / 2;
        const sine = Math.sin(halfAngle) / axisLength;
        return [axisX * sine, axisY * sine, axisZ * sine, Math.cos(halfAngle)];
      });
      return {
        position: [longitude, latitude, 100000] as Vec3,
        scale: 10000,
        minScalePixels: 12,
        maxScalePixels: 48,
        orientation,
        outline,
      };
    });

    const auroraSegments = 64;
    const auroraIndices = Array.from({ length: auroraSegments }, (_, i) => {
      const start = i * 2;
      return [start, start + 1, start + 2, start + 1, start + 3, start + 2];
    }).flat();
    const auroraVertices = $(() => {
      const phase = time().getTime() * 0.00000004;
      return Array.from({ length: auroraSegments + 1 }, (_, i) => {
        const t = i / auroraSegments;
        const longitude = -165 + t * 330;
        const wave =
          Math.sin(t * Math.PI * 2 + phase) * 8 +
          Math.sin(t * Math.PI * 6 - phase * 1.3) * 3;
        const centerLatitude = 65 + wave;
        const width = 3 + Math.sin(t * Math.PI) * 5;
        const opacity = Math.sin(t * Math.PI) * 0.55;
        const altitude = 280000 + Math.sin(t * Math.PI * 4 + phase) * 40000;
        return [
          {
            position: [longitude, centerLatitude - width, altitude] as Vec3,
            color: [0.15, 0.85, 1.0, opacity * 0.35] as Vec4,
          },
          {
            position: [longitude, centerLatitude + width, altitude] as Vec3,
            color: [0.7, 0.3, 1.0, opacity] as Vec4,
          },
        ];
      }).flat();
    });

    const layers = $(() => [
      terrain({ imageryUrl, elevationUrl, onClick: onTerrainClick }),
      atmosphere({ time }),
      text({ entries: textEntries, polygonOffset: -1000 }),
      line({ vertices: animatedTrails }),
      object({
        mesh: cubeMesh,
        instances: cubeInstances,
      }),
      fill({
        vertices: auroraVertices,
        indices: auroraIndices,
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
      color: [0.25, 0.82, 1.0, 1],
    },
    {
      corners: [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
      normal: [-1, 0, 0],
      color: [0.25, 0.55, 0.9, 1],
    },
    {
      corners: [
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1],
      ],
      normal: [0, 1, 0],
      color: [0.76, 0.55, 1.0, 1],
    },
    {
      corners: [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
      normal: [0, -1, 0],
      color: [0.52, 0.38, 0.85, 1],
    },
    {
      corners: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
      normal: [0, 0, 1],
      color: [0.42, 0.62, 1.0, 1],
    },
    {
      corners: [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
      ],
      normal: [0, 0, -1],
      color: [0.55, 0.9, 1.0, 1],
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
