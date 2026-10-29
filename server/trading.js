import { allocationList, allocationSummary, allocationRequest } from './allocations.js';
import { randomUUID } from 'node:crypto';

// A discovery catalogue, not a list of broker-approved or currently tradable assets.
const assets = [
  {symbol:'AAPL',name:'Apple',assetClass:'stock'},
  {symbol:'MSFT',name:'Microsoft',assetClass:'stock'},
  {symbol:'NVDA',name:'NVIDIA',assetClass:'stock'},
  {symbol:'AMZN',name:'Amazon',assetClass:'stock'},
  {symbol:'TSLA',name:'Tesla',assetClass:'stock'},
  {symbol:'BTCUSD',name:'Bitcoin / USD',assetClass:'crypto'},
  {symbol:'ETHUSD',name:'Ethereum / USD',assetClass:'crypto'},
  {symbol:'SOLUSD',name:'Solana / USD',assetClass:'crypto'}
];
const reject=(status,message)=>{throw Object.assign(new Error(message),{status});};
const draftView=row=>({id:row.id,symbol:row.symbol,assetClass:row.asset_class,side:row.side,
  sizing:row.sizing,size:row.size,orderType:'market',status:'draft',createdAt:row.created_at});

export function tradingRequest({db,actor,path,method,body,headers}) {
  const list=()=>db.prepare('SELECT * FROM order_drafts WHERE user_id=? ORDER BY rowid DESC LIMIT 100').all(actor.id).map(draftView);
  if(method==='GET' && path==='/api/trading') {
    return {status:200,data:{
      brokerage:{status:'not_connected',canSubmitOrders:false,buyingPower:null,settledCash:null,
        message:'A brokerage account and verified funding are required before placing orders.'},
      recordedAllocations:allocationList(db,actor.id),allocationSummary:allocationSummary(db,actor.id),recordedAllocationsEnabled:true,
      assets,assetsAreIndicative:true,quotesAvailable:false,positions:[],orders:[],drafts:list()
    }};
  }
  if(path.startsWith('/api/trading/allocations')) return allocationRequest({db,actor,path,method,body,headers,assets});
  // Never turn a manually edited cash ledger into broker buying power.
  // Live order execution must use provider-owned accounts, quotes, funds and positions.
  if(method==='POST' && path==='/api/trading/orders') {
    reject(409,'Trading is not connected. No order was placed and no funds were moved.');
  }
  if(method==='POST' && path==='/api/trading/drafts') {
    if(actor.role!=='user') reject(403,'Use a customer account to prepare investment drafts.');
    const asset=assets.find(asset=>asset.symbol===body.symbol);
    if(!asset) reject(400,'Choose an asset from the investment catalogue.');
    if(!['buy','sell'].includes(body.side)) reject(400,'Choose buy or sell.');
    if(body.orderType!=='market') reject(400,'Only market-order drafts are supported.');
    if(!['notional','quantity'].includes(body.sizing) || (body.side==='sell' && body.sizing!=='quantity')) reject(400,'Sell drafts must specify units. Buy drafts may specify USD or units.');
    const precision=body.sizing==='notional'?2:8;
    if(typeof body.size!=='string' || !new RegExp(`^\\d{1,9}(\\.\\d{1,${precision}})?$`).test(body.size)) reject(400,`Enter a positive size with at most ${precision} decimal places.`);
    const [whole,fraction='']=body.size.split('.');
    const units=BigInt(whole+fraction.padEnd(precision,'0'));
    if(units<=0n || units>100000000n*10n**BigInt(precision)) reject(400,'Size must be positive and no greater than 100,000,000.');
    const size=body.sizing==='notional'?`${BigInt(whole)}.${fraction.padEnd(2,'0')}`:`${BigInt(whole)}${fraction.replace(/0+$/,'')?'.'+fraction.replace(/0+$/,''):''}`;
    const key=headers['idempotency-key'];
    if(typeof key!=='string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(key)) reject(400,'A valid request identifier is required.');
    const existing=db.prepare('SELECT * FROM order_drafts WHERE user_id=? AND request_key=?').get(actor.id,key);
    if(existing) {
      if(existing.symbol!==asset.symbol || existing.side!==body.side || existing.sizing!==body.sizing || existing.size!==size) reject(409,'The request identifier was already used for another draft.');
      return {status:200,data:{draft:draftView(existing)}};
    }
    if(db.prepare('SELECT count(*) AS count FROM order_drafts WHERE user_id=?').get(actor.id).count>=100) reject(409,'You can keep up to 100 drafts. Discard an old draft before saving another.');
    const draft={id:randomUUID(),user_id:actor.id,symbol:asset.symbol,asset_class:asset.assetClass,side:body.side,sizing:body.sizing,size,request_key:key,created_at:new Date().toISOString()};
    db.prepare('INSERT INTO order_drafts VALUES (?,?,?,?,?,?,?,?,?)').run(...Object.values(draft));
    return {status:201,data:{draft:draftView(draft)}};
  }
  const match=/^\/api\/trading\/drafts\/([a-f0-9-]{36})\/discard$/.exec(path);
  if(method==='POST' && match) {
    const result=db.prepare('DELETE FROM order_drafts WHERE id=? AND user_id=?').run(match[1],actor.id);
    if(!result.changes) reject(404,'Draft not found.');
    return {status:200,data:{ok:true}};
  }
  reject(404,'Not found.');
}
