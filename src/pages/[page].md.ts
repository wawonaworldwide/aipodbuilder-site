import { resourcePaths, resourceGET } from '../lib/resource-route';
export const getStaticPaths = () => resourcePaths('/', '.md', 'page');
export const GET = resourceGET;
