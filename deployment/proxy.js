import http from 'node:http';
import https from 'node:https';

// Keep authentication on the site's own origin. The database stays on the backend host.
export function createProxyHandler({ backendOrigin, allowLocalHttp = false } = {}) {
  return (req,res) => {
    const sendError=(status,error)=>{
      if(res.headersSent) {res.end();return;}
      res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({error}));
    };
    let backend;
    try {
      backend=new URL(backendOrigin);
      if(backend.username || backend.password || backend.pathname!=='/' || backend.search || backend.hash) throw new Error();
      const local=allowLocalHttp && backend.protocol==='http:' && ['127.0.0.1','localhost'].includes(backend.hostname);
      if(backend.protocol!=='https:' && !local) throw new Error();
    } catch {sendError(503,'The account backend is not configured. Contact the site administrator.');return;}
    const incoming=new URL(req.url,'https://frontend.invalid');
    if(!incoming.pathname.startsWith('/api/')) {sendError(404,'Not found.');return;}
    if(!['GET','POST','PATCH','HEAD'].includes(req.method)) {sendError(405,'Method not allowed.');return;}
    const target=new URL(incoming.pathname+incoming.search,backend);
    const headers={};
    for(const name of ['accept','content-type','cookie','origin','x-csrf-token','idempotency-key']) {
      if(req.headers[name]!==undefined) headers[name]=req.headers[name];
    }
    // Vercel may supply a parsed body; ordinary Node requests remain streams.
    let body;
    if(req.body!==undefined && req.method!=='GET' && req.method!=='HEAD') {
      body=Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));
      if(body.length>16384) {sendError(413,'Request is too large.');return;}
      headers['content-length']=body.length;
    } else if(req.headers['content-length']!==undefined) {
      if(Number(req.headers['content-length'])>16384) {sendError(413,'Request is too large.');return;}
      headers['content-length']=req.headers['content-length'];
    }
    const upstream=(target.protocol==='https:'?https:http).request(target,{method:req.method,headers},response=>{
      const responseHeaders={'Cache-Control':'no-store'};
      for(const name of ['content-type','set-cookie','retry-after','x-content-type-options','referrer-policy','x-frame-options']) {
        if(response.headers[name]!==undefined) responseHeaders[name]=response.headers[name];
      }
      res.writeHead(response.statusCode||502,responseHeaders);
      response.on('error',()=>res.end());
      response.pipe(res);
    });
    upstream.setTimeout(15000,()=>upstream.destroy(new Error('Backend timeout')));
    upstream.on('error',()=>sendError(502,'The account service is temporarily unavailable. Please try again.'));
    req.on('aborted',()=>upstream.destroy());
    req.on('error',()=>upstream.destroy());
    if(body!==undefined) upstream.end(body);
    else req.pipe(upstream);
  };
}
