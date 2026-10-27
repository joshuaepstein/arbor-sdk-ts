import type { ModelBase } from '../model/model-base.js';

/** One entry from a resource's changelog (PHP: `Arbor\ChangeLog\Change`). */
export class Change<T extends ModelBase = ModelBase> {
  constructor(
    public changedResource: T,
    public changeType: string,
    public changedFromRevision: number,
    public changedToRevision: number,
  ) {}

  getChangedResource(): T {
    return this.changedResource;
  }
  getChangeType(): string {
    return this.changeType;
  }
  getChangedFromRevision(): number {
    return this.changedFromRevision;
  }
  getChangedToRevision(): number {
    return this.changedToRevision;
  }
}
