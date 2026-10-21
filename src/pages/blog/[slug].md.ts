import { resourcePaths, resourceGET } from '../../lib/resource-route';
export const getStaticPaths = () => resourcePaths('/blog/', '.md', 'slug');
export const GET = resourceGET;
