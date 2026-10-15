import { loadImage } from "./image-load";
import { createMipmapper } from "./mipmapper";

export type TextureImage = {
  image: ImageBitmap;
  origin?: [x: number, y: number];
  size: [width: number, height: number];
};

export const loadTextureImage = async (
  url: string,
  signal?: AbortSignal,
): Promise<TextureImage> => {
  const image = await loadImage(url, signal);
  const { width, height } = image;
  return { image, size: [width, height] };
};

export type TextureLoader = ReturnType<typeof createTextureLoader>;

export const createTextureLoader = ({ device }: { device: GPUDevice }) => {
  const mipmapper = createMipmapper(device);
  type Load = {
    texture: GPUTexture;
    source: TextureImage;
    mipLevel: number;
    generateMipmaps: boolean;
    layer: number;
    complete: (error?: unknown) => void;
  };
  const loads: Load[] = [];

  const load = async (
    texture: GPUTexture,
    source: TextureImage,
    mipLevel = 0,
    layer = 0,
    generateMipmaps = false,
    signal?: AbortSignal,
  ) => {
    signal?.throwIfAborted();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const entry: Load = {
      texture,
      source,
      mipLevel,
      layer,
      generateMipmaps,
      complete: (error?: unknown) => {
        if (error === undefined) resolve();
        else reject(error);
      },
    };
    const cancel = () => {
      const index = loads.indexOf(entry);
      if (index >= 0) loads.splice(index, 1);
      entry.complete(signal?.reason);
    };
    loads.push(entry);
    signal?.addEventListener("abort", cancel, { once: true });
    return promise;
  };

  const upload = (entry: Load, encoder: GPUCommandEncoder) => {
    try {
      const { texture, source, mipLevel, layer, generateMipmaps } = entry;
      const { image, origin, size } = source;
      device.queue.copyExternalImageToTexture(
        { source: image, origin },
        { texture, mipLevel, origin: { z: layer } },
        size,
      );
      if (generateMipmaps)
        mipmapper.generate(encoder, texture, layer, mipLevel + 1);
      entry.complete();
    } catch (error) {
      entry.complete(error);
    }
  };

  const update = (encoder: GPUCommandEncoder) => {
    if (!mipmapper.ready()) return;
    loads.splice(0, 16).forEach(entry => upload(entry, encoder));
  };

  return { load, update };
};
