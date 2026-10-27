import type { Gateway } from '../api/gateway.js';
import { ModelBase } from './model-base.js';

export type ModelFactory = (gateway: Gateway | null) => ModelBase;

const factories = new Map<string, ModelFactory>();

/** Registers the class used to hydrate a resource type, e.g. `'Student'` or `'UkDfe_Student'`. */
export function registerModel(resourceType: string, factory: ModelFactory): void {
  factories.set(resourceType, factory);
}

export function isModelRegistered(resourceType: string): boolean {
  return factories.has(resourceType);
}

/** Creates an empty model for a resource type, falling back to {@link ModelBase} for unknown types. */
export function instantiateModel(resourceType: string, gateway: Gateway | null): ModelBase {
  const factory = factories.get(resourceType);
  return factory ? factory(gateway) : new ModelBase(resourceType, {}, gateway);
}
