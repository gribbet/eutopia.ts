import { defer } from "signaloits";

import { mipLevelCount } from "../../configuration";
import type { Context } from "../../context";
import { createLru } from "../../lru";
import type { Vec3 } from "../../model";
import { createTextureGroup } from "../../texture-group";
import { loadTextureImage } from "../../texture-loader";
import type { TextureImage } from "../../texture-loader";
import { fromKey, toKey } from "./common";
import type { TileMapBuffer } from "./tile-map-buffer";

export const createTileTextureGroup = ({
  context,
  map,
  urlPattern,
  initialDownsample = 0,
  maxZ = 22,
  mipmap = false,
}: {
  context: Context;
  map: TileMapBuffer;
  urlPattern: string;
  initialDownsample?: number;
  maxZ?: number;
  mipmap?: boolean;
}) => {
  const textureGroup = createTextureGroup({
    context,
    mipmap,
    load: (key, signal) => {
      const tile = fromKey(Number(key));
      return mipmap
        ? loadTileMipmaps(tile, signal)
        : loadTileImage(tile, signal);
    },
    onLoad: (key, index) => map.set(fromKey(Number(key)), index),
    onEvict: key => map.clear(fromKey(Number(key))),
  });
  const { texture } = textureGroup;
  const images = createLru<string, TextureImage>({
    maxSize: 1024,
    onEvict: (_url, { image }) => image.close(),
  });
  defer(() => images.clear());

  const tileUrl = (x: number, y: number, z: number) =>
    urlPattern
      .replace("{z}", z.toString())
      .replace("{x}", x.toString())
      .replace("{y}", y.toString());

  const loadTileImageUrl = async (url: string, signal?: AbortSignal) => {
    const cached = images.get(url);
    if (cached) return cached;

    const image = await loadTextureImage(url, signal);
    images.set(url, image);
    return image;
  };

  const loadTileImage = async ([x, y, z]: Vec3, signal?: AbortSignal) => {
    const image = await loadTileImageUrl(tileUrl(x, y, z), signal);
    return [image];
  };

  type MipSource = {
    url: string;
    crop?: { x: number; y: number; scale: number };
  };
  const computeMipSources = ([x, y, z]: Vec3): MipSource[] =>
    Array.from({ length: mipLevelCount }, (_, m) => {
      const ancestorZ = z - m;
      if (ancestorZ < 0) return [];
      if (m === 0) return [{ url: tileUrl(x, y, z) }];
      const scale = 2 ** m;
      const url = tileUrl(
        Math.floor(x / scale),
        Math.floor(y / scale),
        ancestorZ,
      );
      return [
        {
          url,
          crop: {
            x: x % scale,
            y: y % scale,
            scale,
          },
        },
      ];
    }).flat();

  const loadTileMipmaps = (tile: Vec3, signal: AbortSignal) =>
    Promise.all(
      computeMipSources(tile).map(
        async ({ url, crop }): Promise<TextureImage> => {
          const source = await loadTileImageUrl(url, signal);
          if (!crop) return source;
          const { x, y, scale } = crop;
          const { image, size } = source;
          const [imageWidth, imageHeight] = size;
          const width = imageWidth / scale;
          const height = imageHeight / scale;
          return {
            image,
            origin: [x * width, y * height],
            size: [width, height],
          };
        },
      ),
    );

  const ensure = (tiles: readonly Vec3[]) => {
    tiles = unique(
      tiles.map(_ => downsample(_, initialDownsample)).filter(_ => !!_),
    );
    textureGroup.ensure(
      descendants(tiles)
        .filter(([, , z]) => z <= maxZ)
        .map(xyz => toKey(xyz).toString()),
    );
  };

  return { ensure, texture };
};

const downsample = ([x, y, z]: Vec3, downsample: number): Vec3 | undefined => {
  if (downsample > z) return undefined;
  const k = 2 ** downsample;
  return [Math.floor(x / k), Math.floor(y / k), z - downsample];
};

const unique = (tiles: readonly Vec3[]) => [
  ...new Map(tiles.map(tile => [toKey(tile), tile])).values(),
];

const parents = (tiles: readonly Vec3[]) =>
  unique(tiles.map(_ => downsample(_, 1)).filter(_ => !!_));

const descendants: (tiles: readonly Vec3[]) => Vec3[] = tiles =>
  tiles.length > 0 ? unique([...tiles, ...descendants(parents(tiles))]) : [];
