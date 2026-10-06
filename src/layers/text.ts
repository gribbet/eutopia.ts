import type { Properties } from "signaloits";
import { effect, map, resolve, signal } from "signaloits";

import { createLatest, createLayer, createLayerType } from "../common";
import type { Vec3, Vec4 } from "../model";
import { type PickHandlers } from "../pick-registry";
import { billboard } from "./billboard";
import type { CommonLayerProps } from "./common";
import { createTextImage } from "./text-image";

export type TextEntry = PickHandlers & {
  text: string;
  position: Vec3;
  size: number;
  font: string;
  fontSize: number;
  color?: Vec4;
  minScale: number;
  maxScale: number;
};

export type TextProps = CommonLayerProps & {
  entries: readonly Properties<TextEntry>[];
};

export const text = createLayerType<TextProps>(
  (context, { entries, ...props }) => {
    const billboards = map(entries, entry => {
      const [image, setImage] = signal<string>("");
      const { text, font, fontSize, ...rest } = resolve(entry);
      const createTextImage_ = createLatest(createTextImage);
      effect(() => {
        void createTextImage_({
          text: resolve(text),
          font: resolve(font),
          fontSize: resolve(fontSize),
        }).then(_ => _ !== undefined && setImage(_));
      });

      return { ...rest, image };
    });

    return createLayer(context, billboard({ billboards, ...props }));
  },
);
