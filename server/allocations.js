import { randomUUID } from 'node:crypto';
import { atomic } from './store.js';
export const ALLOCATION_LABEL='Recorded allocation — purchase not verified';
const reject=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function allocationList(db,userId) {
  return db.prepare('SELECT * FROM recorded_allocations WHERE user_id=? ORDER BY rowid DESC LIMIT 500').all(userId).map(row=>({
    id:row.id,symbol:row.symbol,name:row.asset_name,assetClass:row.asset_class,amount:row.amount_cents/100,
    currency:'USD',status:row.released_at?'released':'recorded',verificationStatus:'purchase_not_verified',
    label:row.released_at?'Released recorded allocation — no asset sale':ALLOCATION_LABEL,
    createdAt:row.created_at,releasedAt:row.released_at
  }));
}
export function allocationSummary(db,userId) {
  const row=db.prepare('SELECT balance_cents FROM users WHERE id=?').get(userId);
  const allocated=db.prepare('SELECT coalesce(sum(amount_cents),0) AS cents FROM recorded_allocations WHERE user_id=? AND released_at IS NULL').get(userId).cents;
  return {availableBalance:row.balance_cents/100,allocatedBalance:allocated/100,totalRecordedBalance:(row.balance_cents+allocated)/100,currency:'USD'};
}
export function allocationRequest({db,actor,path,method,body,headers,assets}) {
  if(actor.role!=='user') reject(403,'Recorded allocations require a customer account.');
  const result=allocation=>({status:200,data:{allocation,summary:allocationSummary(db,actor.id),allocations:allocationList(db,actor.id)}});
  if(method==='POST' && path==='/api/trading/allocations') {
    const asset=assets.find(asset=>asset.symbol===body.symbol);
    if(!asset) reject(400,'Choose a supported stock or cryptocurrency.');
    if(typeof body.amount!=='string' || !/^\d{1,9}(\.\d{1,2})?$/.test(body.amount)) reject(400,'Enter a USD amount with at most two decimal places.');
    const [whole,fraction='']=body.amount.split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    if(cents<=0 || cents>10000000000) reject(400,'Amount must be between $0.01 and $100,000,000.00.');
    if(body.acknowledgement!=='purchase_not_verified') reject(400,'Acknowledge that this records an allocation without verifying an asset purchase.');
    const key=headers['idempotency-key'];
    if(typeof key!=='string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(key)) reject(400,'A valid request identifier is required.');
    const id=atomic(db,()=>{
      const existing=db.prepare('SELECT * FROM recorded_allocations WHERE user_id=? AND request_key=?').get(actor.id,key);
      if(existing) {
        if(existing.symbol!==asset.symbol || existing.amount_cents!==cents) reject(409,'This request identifier was already used for another allocation.');
        return existing.id;
      }
      const user=db.prepare('SELECT * FROM users WHERE id=?').get(actor.id);
      if(user.balance_cents<cents) reject(409,'Insufficient available recorded balance for this allocation.');
      const id=randomUUID(),date=new Date().toISOString(),balance=user.balance_cents-cents,ledgerId=randomUUID();
      db.prepare('INSERT INTO recorded_allocations VALUES (?,?,?,?,?,?,?,?,?,NULL)').run(id,actor.id,asset.symbol,asset.name,asset.assetClass,cents,key,date,'purchase_not_verified');
      db.prepare('UPDATE users SET balance_cents=?,version=version+1 WHERE id=?').run(balance,actor.id);
      db.prepare('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?)').run(ledgerId,actor.id,actor.id,-cents,balance,`${ALLOCATION_LABEL}: ${asset.symbol}`,'allocation:'+id,date);
      db.prepare('INSERT INTO allocation_events VALUES (?,?,?)').run(ledgerId,id,'ALLOCATION');
      db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').run(randomUUID(),actor.id,actor.id,'ALLOCATION_RECORDED',JSON.stringify({allocationId:id,symbol:asset.symbol,amountCents:cents,balanceAfterCents:balance,purchaseVerified:false}),date);
      return id;
    });
    return result(allocationList(db,actor.id).find(row=>row.id===id) || allocationById(db,id));
  }
  const match=/^\/api\/trading\/allocations\/([a-f0-9-]{36})\/release$/.exec(path);
  if(method==='POST' && match) {
    const id=match[1];
    atomic(db,()=>{
      const row=db.prepare('SELECT * FROM recorded_allocations WHERE id=? AND user_id=?').get(id,actor.id);
      if(!row) reject(404,'Allocation not found.');
      if(row.released_at) return;
      const user=db.prepare('SELECT balance_cents FROM users WHERE id=?').get(actor.id);
      const balance=user.balance_cents+row.amount_cents;
      if(balance>100000000000) reject(409,'Balance limit exceeded. Contact your administrator.');
      const date=new Date().toISOString(),ledgerId=randomUUID();
      db.prepare('UPDATE recorded_allocations SET released_at=? WHERE id=?').run(date,id);
      db.prepare('UPDATE users SET balance_cents=?,version=version+1 WHERE id=?').run(balance,actor.id);
      db.prepare('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?)').run(ledgerId,actor.id,actor.id,row.amount_cents,balance,`Released recorded allocation: ${row.symbol} — no asset sale`,'release:'+id,date);
      db.prepare('INSERT INTO allocation_events VALUES (?,?,?)').run(ledgerId,id,'RELEASE');
      db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').run(randomUUID(),actor.id,actor.id,'ALLOCATION_RELEASED',JSON.stringify({allocationId:id,amountCents:row.amount_cents,balanceAfterCents:balance}),date);
    });
    return result(allocationById(db,id));
  }
  reject(404,'Not found.');
}
function allocationById(db,id) {
  // Used only after ownership has already been checked above, including idempotent retries.
  const item=db.prepare('SELECT * FROM recorded_allocations WHERE id=?').get(id);
  return {id:item.id,symbol:item.symbol,name:item.asset_name,assetClass:item.asset_class,amount:item.amount_cents/100,currency:'USD',status:item.released_at?'released':'recorded',verificationStatus:'purchase_not_verified',label:item.released_at?'Released recorded allocation — no asset sale':ALLOCATION_LABEL,createdAt:item.created_at,releasedAt:item.released_at};
}
