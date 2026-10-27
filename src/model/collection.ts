import type { ModelBase } from './model-base.js';

/** An array of models, as returned by queries and collection properties (PHP: `Arbor\Model\Collection`). */
export class Collection<T extends ModelBase = ModelBase> extends Array<T> {
  static override get [Symbol.species]() {
    return Array;
  }

  /** Builds a collection from any iterable of models. */
  static fromModels<T extends ModelBase>(items: Iterable<T>): Collection<T> {
    const c = new Collection<T>();
    for (const item of items) c.push(item);
    return c;
  }

  add(model: T): this {
    this.push(model);
    return this;
  }

  /** A plain-array copy (PHP: `ArrayObject::getArrayCopy()`). */
  getArrayCopy(): T[] {
    return [...this];
  }
}
