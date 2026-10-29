import { createProxyHandler } from '../deployment/proxy.js';
export default createProxyHandler({backendOrigin:process.env.BACKEND_ORIGIN});
