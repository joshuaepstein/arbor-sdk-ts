import { PositionBusinessRole, Query, ResourceType, type BusinessRole, type Position } from '../src/index.js';
import { api, dump } from './bootstrap.js';

// Pick a business role and a position. In practice, search the results for the right ones.
const [businessRole] = await api.query<BusinessRole>(new Query(ResourceType.BUSINESS_ROLE));
const [position] = await api.query<Position>(new Query(ResourceType.POSITION));
if (!businessRole || !position) throw new Error('Need at least one BusinessRole and one Position');

// Connect position to role
const positionBusinessRole = new PositionBusinessRole();
positionBusinessRole.setPosition(position);
positionBusinessRole.setBusinessRole(businessRole);
await positionBusinessRole.save();

const br = await api.retrieve(ResourceType.POSITION_BUSINESS_ROLE, positionBusinessRole.getResourceId()!);
dump(br);
