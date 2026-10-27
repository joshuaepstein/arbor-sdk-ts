import { ResourceType } from '../src/index.js';
import { api } from './bootstrap.js';

// Changelog entries for Students since revision 43322.
const changes = await api.getChanges(ResourceType.STUDENT, 43322);

for (const change of changes) {
  const resource = change.getChangedResource();
  console.log(`Object: ${resource.getResourceType()}, ID: ${resource.getResourceId()} has been ${change.getChangeType()}d`);
}
