import type { MaybeSignal } from "@gribbet/signal.ts";
import { onCleanup, resolve } from "@gribbet/signal.ts";

import { pickFlat } from "./math";
import type { Vec2, View } from "./model";
import type { PickEvent, PickRegistry } from "./pick-registry";
import type { PickResult } from "./picker";

type Gesture = {
  targetId: number;
  startX: number;
  startY: number;
  dragging: boolean;
  allowDrag: boolean;
  allowDragFlat: boolean;
  flatAltitude: number;
};

type PendingMove = {
  x: number;
  y: number;
  pointerId: number;
};

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
  const abortController = new AbortController();
  const { signal } = abortController;

  const dragThresholdSquared = 6 ** 2;
  const gestures = new Map<number, Gesture>();

  const pointerPosition = (event: { clientX: number; clientY: number }) => {
    const { left, top } = element.getBoundingClientRect();
    return [event.clientX - left, event.clientY - top] as const;
  };

  const readPickEvent = async ([x, y]: Vec2) => ({
    ...(await pick([x, y])),
    x,
    y,
  });

  const flatPickEvent = (
    gesture: Pick<Gesture, "targetId" | "flatAltitude">,
    x: number,
    y: number,
  ): PickEvent | undefined => {
    const { width, height } = element.getBoundingClientRect();
    const position = pickFlat(x, y, gesture.flatAltitude, resolve(view), [
      width,
      height,
    ]);
    if (!position) return;
    return { position, id: gesture.targetId, x, y };
  };

  const pendingMoves = new Map<number, PendingMove>();
  let processingMove = false;
  let moveFrame = 0;

  const schedulePointerMove = () => {
    if (moveFrame || processingMove) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      void processPointerMove();
    });
  };

  const processPointerMove = async () => {
    if (processingMove) return;
    processingMove = true;

    try {
      const moves = [...pendingMoves.values()];
      pendingMoves.clear();
      for (const { x, y, pointerId } of moves) {
        const picked = await readPickEvent([x, y]);
        if (picked.id) pickRegistry.onMouseMove(picked);

        const gesture = gestures.get(pointerId);
        if (!gesture) continue;

        const dx = x - gesture.startX;
        const dy = y - gesture.startY;
        const moved = dx ** 2 + dy ** 2 > dragThresholdSquared;

        if (
          !gesture.dragging &&
          moved &&
          (gesture.allowDrag || gesture.allowDragFlat)
        ) {
          gesture.dragging = true;
          if (gesture.allowDrag)
            pickRegistry.onDragStart(picked, gesture.targetId);
          else if (gesture.allowDragFlat) {
            const flatEvent = flatPickEvent(gesture, x, y);
            if (flatEvent)
              pickRegistry.onDragStart(flatEvent, gesture.targetId);
          }
        }
        if (gesture.dragging) {
          if (gesture.allowDrag) pickRegistry.onDrag(picked, gesture.targetId);
          if (gesture.allowDragFlat) {
            const flatEvent = flatPickEvent(gesture, x, y);
            if (flatEvent) pickRegistry.onDragFlat(flatEvent, gesture.targetId);
          }
        }
      }
    } finally {
      processingMove = false;
      if (pendingMoves.size) schedulePointerMove();
    }
  };

  element.addEventListener(
    "pointerdown",
    async event => {
      const [x, y] = pointerPosition(event);
      const { pointerId, button } = event;
      const picked = await readPickEvent([x, y]);
      if (!picked.id) {
        gestures.delete(pointerId);
        return;
      }

      pickRegistry.onMouseDown(picked);
      gestures.set(pointerId, {
        targetId: picked.id,
        startX: x,
        startY: y,
        dragging: false,
        allowDrag:
          button === 0 &&
          (pickRegistry.hasHandler(picked.id, "onDragStart") ||
            pickRegistry.hasHandler(picked.id, "onDrag")),
        allowDragFlat:
          button === 0 && pickRegistry.hasHandler(picked.id, "onDragFlat"),
        flatAltitude: picked.position[2],
      });
    },
    { signal },
  );

  element.addEventListener(
    "pointermove",
    event => {
      const [x, y] = pointerPosition(event);
      const { pointerId } = event;
      pendingMoves.set(pointerId, { x, y, pointerId });
      schedulePointerMove();
    },
    { signal },
  );

  const endGesture = async (event: PointerEvent) => {
    const [x, y] = pointerPosition(event);
    const { pointerId } = event;

    const picked = await readPickEvent([x, y]);
    if (picked.id) pickRegistry.onMouseUp(picked);

    const gesture = gestures.get(pointerId);
    if (!gesture) return;

    const dx = x - gesture.startX;
    const dy = y - gesture.startY;
    const moved = dx ** 2 + dy ** 2 > dragThresholdSquared;

    if (gesture.dragging) {
      if (gesture.allowDrag) pickRegistry.onDragEnd(picked, gesture.targetId);
      else if (gesture.allowDragFlat) {
        const flatEvent = flatPickEvent(gesture, x, y);
        if (flatEvent) pickRegistry.onDragEnd(flatEvent, gesture.targetId);
      }
    } else if (!moved && picked.id === gesture.targetId)
      pickRegistry.onClick(picked, gesture.targetId);

    gestures.delete(pointerId);
  };

  element.addEventListener("pointerup", endGesture, { signal });
  element.addEventListener("pointercancel", endGesture, { signal });

  onCleanup(() => {
    abortController.abort();
    pendingMoves.clear();
    if (moveFrame) cancelAnimationFrame(moveFrame);
  });
};
