import { resourcePaths, resourceGET } from '../../lib/resource-route';
export const getStaticPaths = () => resourcePaths('/loops/', '.md', 'slug');
export const GET = resourceGET;
