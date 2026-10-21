import { resourcePaths, resourceGET } from '../../../lib/resource-route';
export const getStaticPaths = () => resourcePaths('/skills/', '/SKILL.md');
export const GET = resourceGET;
