import type { Properties } from "signaloits";
import { $, defer, effect, map, resolve, signal } from "signaloits";

import {
  createLatest,
  createLayerType,
  type Layer,
  type LayerDescriptor,
  type LayerFactory,
} from "./common";
import type { Context } from "./context";

export type ContainerProperties = {
  layers: readonly LayerDescriptor[];
};

type Cell = {
  key: object;
  create: () => Layer | Promise<Layer>;
  update: (properties: object) => void;
};

const createCell = <P>(
  context: Context,
  factory: LayerFactory<P>,
  initial: Properties<P>,
): Cell => {
  const [getProps, setProps] = signal(initial);
  const reactiveProps = {} as Properties<P>;
  for (const key in initial)
    Object.defineProperty(reactiveProps, key, {
      get: () => getProps()[key as keyof Properties<P>],
      enumerable: true,
    });
  return {
    key: factory,
    create: () => factory(context, reactiveProps),
    update: properties => setProps(properties as Properties<P>),
  };
};

export const createContainerLayer = (
  context: Context,
  { layers }: Properties<ContainerProperties>,
): Layer => {
  const groups = new Map<object, Cell[]>();

  defer(() => groups.clear());

  const stableList = $(() => {
    const next = resolve(layers);
    const nextGroups = new Map<object, Cell[]>();

    const result = next.map(descriptor =>
      descriptor((factory, properties) => {
        let group = groups.get(factory);
        let cell = group?.shift();

        if (cell) cell.update(properties);
        else cell = createCell(context, factory, properties);

        group = nextGroups.get(cell.key) ?? [];
        group.push(cell);
        nextGroups.set(cell.key, group);
        return cell;
      }),
    );

    groups.clear();
    for (const [key, cells] of nextGroups) groups.set(key, cells);
    return result;
  });

  const [active, setActive] = signal<Layer[]>([]);

  const activate = createLatest((list: readonly (Layer | Promise<Layer>)[]) =>
    Promise.all(list.map(_ => Promise.resolve(_))),
  );

  const items = map(stableList, _ => _().create());

  effect(() => {
    void activate(items()).then(_ => _ !== undefined && setActive(_));
  });

  const compute = (pass: GPUComputePassEncoder) =>
    active().forEach(_ => _.compute?.(pass));

  const update = (encoder: GPUCommandEncoder) =>
    active().forEach(_ => _.update?.(encoder));

  const render = (pass: GPURenderPassEncoder) =>
    active().forEach(_ => _.render(pass));

  const pick = (pass: GPURenderPassEncoder) =>
    active().forEach(_ => _.pick?.(pass));

  const postFrame = () => active().forEach(_ => _.postFrame?.());

  return {
    compute,
    update,
    render,
    pick,
    postFrame,
  };
};

export const container =
  createLayerType<ContainerProperties>(createContainerLayer);
