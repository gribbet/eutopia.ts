import { degreesToRadians } from "../../math";
import type { Vec4 } from "../../model";

export const atmosphereSun = (timestamp: number): Vec4 => {
  if (!Number.isFinite(timestamp))
    throw new RangeError("Atmosphere time must be a finite Unix timestamp");

  const days = timestamp / 86400 - 10957.5;
  const centuries = days / 36525;
  const meanLongitude = degreesToRadians((280.46 + 0.9856474 * days) % 360);
  const meanAnomaly = degreesToRadians((357.528 + 0.9856003 * days) % 360);
  const longitude =
    meanLongitude +
    degreesToRadians(1.915) * Math.sin(meanAnomaly) +
    degreesToRadians(0.02) * Math.sin(2 * meanAnomaly);
  const obliquity = degreesToRadians(23.439 - 0.0000004 * days);
  const sidereal = degreesToRadians(
    (280.46061837 +
      360.98564736629 * days +
      0.000387933 * centuries * centuries -
      (centuries * centuries * centuries) / 38710000) %
      360,
  );

  const x = Math.cos(longitude);
  const y = Math.cos(obliquity) * Math.sin(longitude);
  const z = Math.sin(obliquity) * Math.sin(longitude);
  return [
    x * Math.cos(sidereal) + y * Math.sin(sidereal),
    -x * Math.sin(sidereal) + y * Math.cos(sidereal),
    z,
    0,
  ];
};
