import { limit } from "./common";

export type Data = ["load" | "cancel", string];

const acquire = limit(8);

const onMessage = async (event: MessageEvent) => {
  const [action, url] = event.data as Data;
  if (action !== "load") return;

  const abortController = new AbortController();
  const { signal } = abortController;
  addEventListener(
    "message",
    (event: MessageEvent) => {
      const [evAction, target] = event.data as Data;
      if (evAction === "cancel" && target === url) abortController.abort();
    },
    { signal },
  );
  await acquire(async () => {
    try {
      signal.throwIfAborted();
      const response = await fetch(url, { mode: "cors", signal });
      if (!response.ok) {
        postMessage({ url });
        return;
      }
      const blob = await response.blob();
      signal.throwIfAborted();
      const image = await createImageBitmap(blob);
      try {
        signal.throwIfAborted();
        // @ts-expect-error Worker transfer-list overload is absent from the DOM types.
        postMessage({ url, image }, [image]);
      } catch (error) {
        image.close();
        throw error;
      }
    } catch {
      if (signal.aborted) return;
      postMessage({ url, image: undefined });
    } finally {
      abortController.abort();
    }
  });
};

addEventListener("message", event => void onMessage(event));
