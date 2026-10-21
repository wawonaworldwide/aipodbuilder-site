import { resourcePaths, resourceGET } from '../../lib/resource-route';
export const getStaticPaths = () => resourcePaths('/prompts/', '.md', 'id');
export const GET = resourceGET;
