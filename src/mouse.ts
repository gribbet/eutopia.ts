import { defer, resolve, signal as createSignal } from "signaloits";
import type { MaybeSignal } from "signaloits";

import { pickFlat } from "./math";
import type { Vec2, View } from "./model";
import type { PickEvent, PickRegistry } from "./pick-registry";
import type { PickResult } from "./picker";

type Gesture = {
  targetId: number;
  start: Vec2;
  button: number;
  dragging: boolean;
  draggable: boolean;
  flatAltitude?: number;
};

const hasMoved = ({ start: [startX, startY] }: Gesture, { x, y }: PickEvent) =>
  (x - startX) ** 2 + (y - startY) ** 2 > 3 ** 2;

export const createMouse = ({
  element,
  pickRegistry,
  pick,
  view,
}: {
  element: HTMLElement;
  pickRegistry: PickRegistry;
  pick: (xy: Vec2) => Promise<PickResult>;
  view: MaybeSignal<View>;
}) => {
  const [isDragging, setIsDragging] = createSignal(false);
  const abortController = new AbortController();
  const { signal } = abortController;
  let gesture: Gesture | undefined;
  let pendingMove: Vec2 | undefined;
  let processingMove = false;

  const pointerPosition = (event: PointerEvent): Vec2 => {
    const { left, top } = element.getBoundingClientRect();
    return [event.clientX - left, event.clientY - top];
  };

  const readPickEvent = async ([x, y]: Vec2): Promise<PickEvent> => ({
    ...(await pick([x, y])),
    x,
    y,
  });

  const drag = (gesture: Gesture, picked: PickEvent) => {
    if (!gesture.draggable) return;
    if (!gesture.dragging) {
      if (!hasMoved(gesture, picked)) return;
      gesture.dragging = true;
      pickRegistry.onDragStart(picked, gesture.targetId);
    }
    pickRegistry.onDrag(picked, gesture.targetId);

    if (gesture.flatAltitude === undefined) return;
    const { x, y } = picked;
    const { width, height } = element.getBoundingClientRect();
    const position = pickFlat(x, y, gesture.flatAltitude, resolve(view), [
      width,
      height,
    ]);
    if (position)
      pickRegistry.onDragFlat({ ...picked, position }, gesture.targetId);
  };

  const onPointerMove = async (event: PointerEvent) => {
    if (!event.isPrimary) return;
    pendingMove = pointerPosition(event);
    if (processingMove) return;
    processingMove = true;
    try {
      while (pendingMove) {
        const xy = pendingMove;
        const currentGesture = gesture;
        pendingMove = undefined;
        const picked = await readPickEvent(xy);
        if (picked.id) pickRegistry.onMouseMove(picked);
        if (currentGesture && gesture === currentGesture)
          drag(currentGesture, picked);
      }
    } finally {
      processingMove = false;
    }
  };

  const onPointerDown = async (event: PointerEvent) => {
    if (!event.isPrimary) return;
    const start = pointerPosition(event);
    const { pointerId, button } = event;
    element.setPointerCapture(pointerId);
    setIsDragging(true);
    const picked = await readPickEvent(start);
    if (!picked.id) {
      endGesture();
      return;
    }

    const hasFlatDrag = pickRegistry.hasHandler(picked.id, "onDragFlat");
    const draggable =
      button === 0 &&
      (hasFlatDrag ||
        pickRegistry.hasHandler(picked.id, "onDrag") ||
        pickRegistry.hasHandler(picked.id, "onDragStart"));
    gesture = {
      targetId: picked.id,
      start,
      button,
      dragging: false,
      draggable,
      flatAltitude: hasFlatDrag ? picked.position[2] : undefined,
    };
    setIsDragging(gesture.draggable);
    pickRegistry.onMouseDown(picked);
  };

  const endGesture = () => {
    const previous = gesture;
    gesture = undefined;
    pendingMove = undefined;
    setIsDragging(false);
    return previous;
  };

  const onPointerUp = async (event: PointerEvent, cancelled = false) => {
    if (!event.isPrimary) return;
    const picked = await readPickEvent(pointerPosition(event));
    const gesture = endGesture();
    if (!cancelled && picked.id) pickRegistry.onMouseUp(picked);
    if (!gesture) return;

    if (gesture.dragging) pickRegistry.onDragEnd(picked, gesture.targetId);
    else if (
      !cancelled &&
      !hasMoved(gesture, picked) &&
      picked.id === gesture.targetId
    ) {
      if (gesture.button === 0) pickRegistry.onClick(picked, gesture.targetId);
      if (gesture.button === 2)
        pickRegistry.onRightClick(picked, gesture.targetId);
    }
  };

  element.addEventListener("pointerdown", event => void onPointerDown(event), {
    signal,
  });
  element.addEventListener("pointermove", event => void onPointerMove(event), {
    signal,
  });
  element.addEventListener("pointerup", event => void onPointerUp(event), {
    signal,
  });
  element.addEventListener(
    "pointercancel",
    event => void onPointerUp(event, true),
    {
      signal,
    },
  );
  element.addEventListener("contextmenu", event => event.preventDefault(), {
    signal,
  });

  defer(() => {
    abortController.abort();
    gesture = undefined;
    pendingMove = undefined;
  });

  return { isDragging };
};
