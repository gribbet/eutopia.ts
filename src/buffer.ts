import { defer, derived, signal, untrack } from "signaloits";

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
  const [size, setSize] = signal(0);

  const ensureSize = (required: number) => {
    const aligned = Math.max(4, (required + 3) & ~3);
    let next = untrack(size);
    if (aligned <= next) return;

    if (next === 0) next = aligned;
    else while (next < aligned) next *= 2;
    setSize(next);
  };

  ensureSize(initialSize);
  const buffer = derived(() => createBuffer(device, { size: size(), usage }));

  return {
    buffer,
    ensureSize,
  };
};
