import { defer, signal } from "signaloits";

import { mipLevelCount, tileTextureLayers } from "./configuration";
import type { Context } from "./context";
import { createMipmaps } from "./image-process";
import { createLru } from "./lru";
import { createTexture } from "./texture";

export const createTextureGroup = ({
  context,
  layers = tileTextureLayers,
  load,
  onLoad,
  onEvict,
}: {
  context: Context;
  layers?: number;
  load: (
    key: string,
    signal: AbortSignal,
  ) => Promise<ImageBitmap | readonly ImageBitmap[]>;
  onLoad?: (key: string, index: number, width: number, height: number) => void;
  onEvict?: (key: string, index: number) => void;
}) => {
  const { device, textureLoader } = context;

  const createGroupTexture = (width: number, height: number) =>
    createTexture(device, {
      size: [width, height, layers],
      format: "rgba8unorm",
      mipLevelCount: Math.min(
        mipLevelCount,
        Math.floor(Math.log2(Math.max(width, height))) + 1,
      ),
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const [texture, setTexture] = signal<GPUTexture>(createGroupTexture(8, 8));

  const available = new Set(Array.from({ length: layers }, (_, i) => i));

  const acquire = () => {
    const { done, value } = available.values().next();
    if (done) return undefined;
    available.delete(value);
    return value;
  };

  const release = (index: number) => available.add(index);

  type Entry = {
    index?: number;
    cancel?: () => void;
    failed?: boolean;
  };
  const mapping = createLru<string, Entry>({
    maxSize: layers,
    onEvict: (key, { index, cancel }) => {
      cancel?.();
      if (index === undefined) return;
      if (!cancel) release(index);
      onEvict?.(key, index);
    },
  });

  const reset = (width: number, height: number) => {
    mapping.clear();
    setTexture(createGroupTexture(width, height));
  };

  const ensureSize = (w: number, h: number) => {
    const { width, height } = texture();
    if (w > width || h > height) {
      reset(Math.max(w, width), Math.max(h, height));
      return true;
    }
    return false;
  };

  const normalizeImages = async (
    source: ImageBitmap | readonly ImageBitmap[],
  ) => {
    const levels = texture().mipLevelCount;
    const images = isImageBitmapArray(source)
      ? source.slice(0, levels)
      : await createMipmaps(source, levels);

    const last = images[images.length - 1];
    if (last && images.length < levels) {
      const remaining = await createMipmaps(last, levels - images.length + 1);
      return [...images, ...remaining.slice(1)];
    }

    return images;
  };

  const doLoad = async (key: string, index: number, signal: AbortSignal) => {
    try {
      const source = await load(key, signal);
      const first = isImageBitmapArray(source) ? source[0] : source;
      if (!first) throw new Error(`Texture loader returned no images: ${key}`);

      const { width, height } = first;

      if (ensureSize(width, height)) {
        release(index);
        return;
      }

      const images = await normalizeImages(source);
      signal.throwIfAborted();

      await Promise.all(
        images.map((_, mip) =>
          textureLoader.load(texture(), _, mip, index, signal),
        ),
      );
      signal.throwIfAborted();

      mapping.set(key, { index });

      onLoad?.(key, index, width, height);
    } catch (error) {
      release(index);
      if (signal.aborted) return;

      mapping.set(key, { failed: true });
      console.warn("Failed to load texture", error);
    }
  };

  const ensure = (keys: readonly string[]) => {
    keys = keys.slice(0, layers);
    const current = new Set(keys);
    mapping
      .entries()
      .filter(([key]) => !current.has(key))
      .forEach(([, { cancel }]) => cancel?.());
    keys.forEach(ensureOne);
  };

  const ensureOne = (key: string) => {
    const current = mapping.get(key);
    if (current?.failed) return;
    if (current?.index !== undefined) return mapping.set(key, current);

    const index = acquire();
    if (index === undefined) {
      mapping.set(key, { index });
      return;
    }

    const abortController = new AbortController();
    const { signal } = abortController;
    const cancel = () => {
      abortController.abort();
      mapping.delete(key);
    };

    mapping.set(key, { index, cancel });

    void doLoad(key, index, signal);
  };

  defer(() => {
    mapping.clear();
  });

  return {
    ensure,
    texture,
  };
};

const isImageBitmapArray = (
  source: ImageBitmap | readonly ImageBitmap[],
): source is readonly ImageBitmap[] => Array.isArray(source);
