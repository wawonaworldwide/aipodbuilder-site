import { resourcePaths, resourceGET } from '../../lib/resource-route';
export const getStaticPaths = () => resourcePaths('/apps/', '.md', 'slug');
export const GET = resourceGET;
