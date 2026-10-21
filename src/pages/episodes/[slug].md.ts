import { resourcePaths, resourceGET } from '../../lib/resource-route';
export const getStaticPaths = () => resourcePaths('/episodes/', '.md', 'slug');
export const GET = resourceGET;
