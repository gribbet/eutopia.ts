import { effect, resolve, signal } from "signaloits";
import type { MaybeSignal, Signal } from "signaloits";

import { createTexture } from "./texture";
import { loadTextureImage } from "./texture-loader";

const whiteImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=";

export const createImageTexture = ({
  device,
  image,
  label,
}: {
  device: GPUDevice;
  image: MaybeSignal<string | undefined>;
  label: string;
}): Signal<GPUTexture> => {
  const texture = createTexture(device, {
    size: [1, 1],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const [imageTexture, setImageTexture] = signal(texture);

  const loadImage = async (url: string) => {
    try {
      const {
        image: source,
        size: [width, height],
      } = await loadTextureImage(url);
      const nextTexture = createTexture(device, {
        size: [width, height],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      device.queue.copyExternalImageToTexture({ source }, { texture: nextTexture }, [
        width,
        height,
      ]);
      setImageTexture(nextTexture);
    } catch (error) {
      console.warn(`Failed to load ${label} image`, error);
    }
  };

  effect(() => void loadImage(resolve(image) ?? whiteImage));
  return imageTexture;
};
