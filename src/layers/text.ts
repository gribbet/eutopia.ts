import {
  effect,
  map,
  type Properties,
  properties,
  resolve,
  signal,
} from "signaloits";

import { createLayer, createLayerType } from "../common";
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
  entries: Properties<TextEntry>[];
};

export const text = createLayerType<TextProps>(
  (context, { entries, ...props }) => {
    const billboards = map(entries, entry => {
      const [image, setImage] = signal<string>("");
      const { text, font, fontSize, ...rest } = properties(entry);
      effect(() => {
        const textValue = resolve(text);
        if (!textValue) return;

        void createTextImage({
          text: textValue,
          font: resolve(font),
          fontSize: resolve(fontSize),
        }).then(setImage);
      });

      return { ...rest, image };
    });

    return createLayer(context, billboard({ billboards, ...props }));
  },
);
