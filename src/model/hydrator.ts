import type { Gateway } from '../api/gateway.js';
import { formatArborDate, parseArborDate } from '../util/date.js';
import { Collection } from './collection.js';
import { ModelBase } from './model-base.js';
import { instantiateModel } from './registry.js';

/** A resource as it appears in API JSON: `{ entityType, href, ...properties }`. */
export type Representation = { entityType?: string | null; href?: string; [key: string]: unknown };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Converts between API JSON and model instances (PHP: `Arbor\Model\Hydrator`). */
export class Hydrator {
  /** Fills `model` from an API representation. Related resources become model instances. */
  hydrateModel<T extends ModelBase>(model: T, representation: Record<string, unknown>): T {
    const gateway = model.getApiGateway();

    for (const [name, value] of Object.entries(representation)) {
      switch (name) {
        case 'entityType':
          model.setResourceType(value as string);
          break;
        case 'href':
          model.setResourceUrl(value as string);
          break;
        case 'displayName':
          model.setDisplayName(value as string);
          break;
        case 'userTags':
          model.setUserTags(isRecord(value) ? { ...value } : {});
          break;
        default:
          model.setProperty(name, this.hydrateValue(value, gateway));
      }
    }
    return model;
  }

  /** Creates and hydrates a model of the representation's `entityType`. */
  hydrateNew(representation: Representation, gateway: Gateway | null): ModelBase {
    const model = instantiateModel(String(representation.entityType ?? ''), gateway);
    return this.hydrateModel(model, representation);
  }

  protected hydrateValue(value: unknown, gateway: Gateway | null): unknown {
    if (isRecord(value) && typeof value.entityType === 'string') {
      if (value.entityType === 'date') return parseArborDate(String(value.date));
      return this.hydrateNew(value as Representation, gateway);
    }
    if (Array.isArray(value)) {
      // A collection property. Like the PHP SDK, only nested resources are kept.
      const collection = new Collection();
      for (const item of value) {
        if (isRecord(item) && typeof item.entityType === 'string') {
          collection.add(this.hydrateNew(item as Representation, gateway));
        }
      }
      return collection;
    }
    return value;
  }

  /**
   * Converts a model to its API representation.
   * @param abbreviate only include `entityType` and `href`
   */
  extractArray(model: ModelBase, abbreviate = false): Representation {
    const representation: Representation = { entityType: model.getResourceType() };
    const url = model.getResourceUrl();
    if (url) representation.href = url;
    if (abbreviate) return representation;

    for (const [name, value] of Object.entries(model.getProperties())) {
      if (value instanceof ModelBase) {
        representation[name] = this.extractArray(value);
      } else if (value instanceof Date) {
        representation[name] = { entityType: 'date', date: formatArborDate(value) };
      } else if (value instanceof Collection) {
        // PHP leaves empty collections out of the payload entirely.
        if (value.length > 0) representation[name] = value.map((m) => this.extractArray(m));
      } else if (isRecord(value)) {
        representation[name] = { ...value };
      } else {
        representation[name] = value;
      }
    }
    return representation;
  }
}
