import { defer, effect, signal, untrack } from "signaloits";

export const createBuffer = (
  device: GPUDevice,
  descriptor: GPUBufferDescriptor,
): GPUBuffer => {
  const buffer = device.createBuffer(descriptor);
  defer(() => buffer.destroy());
  return buffer;
};

export const createDataBuffer = (
  device: GPUDevice,
  usage: GPUBufferUsageFlags,
  data: ArrayBufferView,
) => {
  const buffer = createBuffer(device, {
    size: (data.byteLength + 3) & ~3,
    usage: usage | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Uint8Array(buffer.getMappedRange()).set(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  );
  buffer.unmap();
  return buffer;
};

export const createResizableBuffer = (
  device: GPUDevice,
  usage: GPUBufferUsageFlags,
  initialSize: number,
) => {
  let size = Math.max(4, (initialSize + 3) & ~3);
  const [buffer, setBuffer] = signal(createBuffer(device, { size, usage }));
  const [requiredSize, setRequiredSize] = signal(size);

  effect(() => {
    const required = requiredSize();
    if (required <= size) return;

    let next = size;
    while (next < required) next *= 2;

    untrack(buffer).destroy();
    setBuffer(createBuffer(device, { size: next, usage }));
    size = next;
  });

  const ensureSize = (required: number) => {
    const aligned = Math.max(4, (required + 3) & ~3);
    if (aligned > size) setRequiredSize(aligned);
  };

  return {
    buffer,
    ensureSize,
  };
};
