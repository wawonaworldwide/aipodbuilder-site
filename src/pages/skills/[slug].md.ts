import { resourcePaths, resourceGET } from '../../lib/resource-route';
export const getStaticPaths = () => resourcePaths('/skills/', '.md', 'slug');
export const GET = resourceGET;
