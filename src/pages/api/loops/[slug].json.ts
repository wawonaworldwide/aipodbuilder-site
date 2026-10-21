import { resourcePaths, resourceGET } from '../../../lib/resource-route';
export const getStaticPaths = () => resourcePaths('/api/loops/', '.json');
export const GET = resourceGET;
