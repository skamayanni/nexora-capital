"use strict";
const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
const byId = id => document.getElementById(id);
let selected = null;
let pending = null;
let loading = false;
function report(error) { byId('adminError').textContent = error.message; byId('adminStatus').textContent=''; }
function clearReport() { byId('adminError').textContent=''; byId('adminStatus').textContent=''; }
function cells(body, values) {
    const row = document.createElement('tr');
    values.forEach(value => { const cell=document.createElement('td'); cell.textContent=String(value);row.append(cell); });
    body.append(row); return row;
}
async function loadUsers() {
    const data=await apiRequest('/api/admin/users?q='+encodeURIComponent(byId('userSearch').value));
    const body=byId('userRows');body.replaceChildren();
    for(const user of data.users) {
        const row=cells(body,[`${user.firstName} ${user.lastName}`,user.email,`${user.status} / ${user.role}`,money(user.balance)]);
        const cell=document.createElement('td'), button=document.createElement('button');
        button.textContent='Manage';button.type='button';button.addEventListener('click',()=>selectUser(user.id));cell.append(button);row.append(cell);
    }
    if(!data.users.length) cells(body,['No accounts found.']);
}
function cancelAdjustment() {
    pending=null;
    byId('confirmAdjustment').textContent='Confirm adjustment';
    byId('adjustmentSummary').hidden=true;
    byId('confirmAdjustment').hidden=true;
    byId('cancelAdjustment').hidden=true;
    byId('reviewAdjustment').hidden=false;
    for(const field of byId('adjustBalance').querySelectorAll('input,select,textarea')) field.disabled=false;
}
function renderSelected(data) {
    selected=data;
    byId('selectedAccount').hidden=false;
    byId('accountHeading').textContent=`${data.user.firstName} ${data.user.lastName} · ${data.user.email}`;
    byId('selectedBalance').textContent=money(data.portfolio.cashBalance);
    byId('selectedAllocationSummary').textContent=`Allocated (purchase not verified): ${money(data.portfolio.allocatedBalance || 0)} · Total recorded balance: ${money(data.portfolio.totalRecordedBalance ?? data.portfolio.cashBalance)}`;
    const allocationRows=byId('adminAllocationRows');allocationRows.replaceChildren();
    for(const allocation of data.recordedAllocations || []) cells(allocationRows,[`${allocation.name} (${allocation.symbol})`,money(allocation.amount),new Date(allocation.createdAt).toLocaleString(),`${allocation.status==='released'?'Released':'Recorded'} — purchase not verified`]);
    if(!data.recordedAllocations?.length) cells(allocationRows,['No recorded allocations.']);
    const form=byId('editProfile');
    for(const key of ['firstName','lastName','email','status']) form.elements[key].value=data.user[key];
    for(const field of form.elements) field.disabled=data.user.role==='admin';
    for(const field of byId('adjustBalance').elements) field.disabled=data.user.role==='admin' || data.user.status!=='active';
    const ledger=byId('ledgerRows');ledger.replaceChildren();
    for(const entry of data.transactions) cells(ledger,[new Date(entry.date).toLocaleString(),entry.type,money(entry.total),money(entry.balanceAfter),entry.description,entry.actorId]);
    if(!data.transactions.length) cells(ledger,['No balance adjustments.']);
    const audit=byId('auditRows');audit.replaceChildren();
    for(const entry of data.audit || []) cells(audit,[new Date(entry.created_at).toLocaleString(),entry.actor_id,entry.action,entry.details]);
    if(!data.audit?.length) cells(audit,['No administrative actions yet.']);
}
async function selectUser(id) {
    if(loading) return;
    loading=true;clearReport();cancelAdjustment();
    byId('selectedAccount').hidden=true;
    try { renderSelected(await apiRequest('/api/admin/users/'+id)); }
    catch(error) {report(error);}
    finally {loading=false;}
}
byId('adminLogout').addEventListener('click',logoutUser);
byId('searchForm').addEventListener('submit',async event=>{event.preventDefault();clearReport();try{await loadUsers();}catch(error){report(error);}});
byId('refreshAccount').addEventListener('click',()=>selectUser(selected.user.id));
byId('editProfile').addEventListener('submit',async event=>{
    event.preventDefault();if(loading) return;clearReport();loading=true;
    const button=event.currentTarget.querySelector('button');button.disabled=true;
    try {
        const body=Object.fromEntries(new FormData(event.currentTarget));body.version=selected.user.version;
        await apiRequest('/api/admin/users/'+selected.user.id,{method:'PATCH',body});
        cancelAdjustment();
        renderSelected(await apiRequest('/api/admin/users/'+selected.user.id));
        await loadUsers();byId('adminStatus').textContent='Profile saved.';
    } catch(error) {report(error);} finally {loading=false;button.disabled=false;}
});
byId('adjustBalance').addEventListener('submit',event=>{
    event.preventDefault();if(loading || pending) return;clearReport();
    const body=Object.fromEntries(new FormData(event.currentTarget));
    if(!body.reason.trim()) {report(new Error('Enter a reason for the adjustment.'));return;}
    pending={id:selected.user.id,body,key:crypto.randomUUID()};
    byId('adjustmentSummary').textContent=`${body.direction==='credit'?'Credit':'Debit'} ${money(Number(body.amount))} for ${selected.user.email}. Reason: ${body.reason}. Confirm to record this adjustment.`;
    byId('adjustmentSummary').hidden=false;
    byId('confirmAdjustment').hidden=false;byId('cancelAdjustment').hidden=false;byId('reviewAdjustment').hidden=true;
    for(const field of event.currentTarget.querySelectorAll('input,select,textarea')) field.disabled=true;
});
byId('cancelAdjustment').addEventListener('click',cancelAdjustment);
byId('confirmAdjustment').addEventListener('click',async()=>{
    if(!pending || loading) return;loading=true;clearReport();
    for(const button of document.querySelectorAll('button')) button.disabled=true;
    try {
        await apiRequest('/api/admin/users/'+pending.id+'/adjustments',{method:'POST',body:pending.body,headers:{'Idempotency-Key':pending.key}});
        cancelAdjustment();byId('adjustBalance').reset();
        renderSelected(await apiRequest('/api/admin/users/'+selected.user.id));
        await loadUsers();byId('adminStatus').textContent='Balance adjustment recorded.';
    } catch(error) {
        // Retain the same identifier on a failed/uncertain response so Retry cannot double-apply.
        report(error);byId('confirmAdjustment').textContent='Retry adjustment';
    } finally {
        loading=false;
        for(const button of document.querySelectorAll('button')) button.disabled=false;
        if(selected?.user.role==='admin') for(const field of byId('editProfile').elements) field.disabled=true;
        if(selected && (selected.user.role==='admin' || selected.user.status!=='active')) for(const field of byId('adjustBalance').elements) field.disabled=true;
    }
});
(async()=>{
    try {
        const session=await requireSession();
        if(session.user.role!=='admin') {report(new Error('Administrator access required.'));return;}
        await loadUsers();byId('adminContent').hidden=false;
    } catch(error) {if(error.status!==401) report(error);}
})();
