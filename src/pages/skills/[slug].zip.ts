import { resourcePaths, resourceGET } from '../../lib/resource-route';
export const getStaticPaths = () => resourcePaths('/skills/', '.zip');
export const GET = resourceGET;
