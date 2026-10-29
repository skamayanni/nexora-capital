"use strict";
const el=id=>document.getElementById(id);
const usd=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
let assets=[],selectedAsset=null,pendingAllocation=null,busy=false,customer=false,summary=null;
function showError(error) {
    if(error.status===401) {window.location.replace('login.html');return;}
    el('investError').textContent=error.status===404
        ? 'The allocation service needs the latest backend deployment. Ask the administrator to deploy the update on Render.' : error.message;
}
function clearMessages() {el('investError').textContent='';el('investStatus').textContent='';}
function editable(value) {
    el('allocationFields').disabled=!value || !customer || !selectedAsset;
    for(const id of ['assetClass','assetSearch']) el(id).disabled=!value;
    for(const button of el('assetList').querySelectorAll('button')) button.disabled=!value;
}
function choose(asset,amount='') {
    selectedAsset=asset;el('assetClass').value=asset.assetClass;
    el('selectedAsset').textContent=`${asset.name} · ${asset.symbol}`;
    el('allocationAmount').value=amount;editable(true);drawAssets();
}
function drawAssets() {
    const list=el('assetList');list.replaceChildren();
    const query=el('assetSearch').value.trim().toLowerCase();
    const visible=assets.filter(asset=>asset.assetClass===el('assetClass').value && `${asset.name} ${asset.symbol}`.toLowerCase().includes(query));
    for(const asset of visible) {
        const button=document.createElement('button');button.type='button';button.className='asset-choice';
        button.setAttribute('aria-pressed',String(selectedAsset?.symbol===asset.symbol));
        const name=document.createElement('strong'),symbol=document.createElement('small');name.textContent=asset.name;symbol.textContent=asset.symbol;button.append(name,symbol);
        button.addEventListener('click',()=>{if(!busy && !pendingAllocation) choose(asset);});list.append(button);
    }
    if(!visible.length) {const note=document.createElement('p');note.textContent='No matching assets.';list.append(note);}
}
function row(body,values) {
    const tr=document.createElement('tr');
    for(const value of values) {const td=document.createElement('td');td.textContent=value;tr.append(td);}
    body.append(tr);return tr;
}
function drawAllocations(allocations) {
    const body=el('allocationRows');body.replaceChildren();
    for(const allocation of allocations) {
        const tr=row(body,[new Date(allocation.createdAt).toLocaleString(),`${allocation.name} (${allocation.symbol})`,usd(allocation.amount),'Recorded allocation — purchase not verified',allocation.status==='released'?'Released':'Recorded']);
        const td=document.createElement('td');
        if(allocation.status==='recorded') {
            const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Release allocation';
            button.addEventListener('click',async()=>{
                if(busy || pendingAllocation) return;
                if(!window.confirm(`Release ${usd(allocation.amount)} from your ${allocation.symbol} recorded allocation back to your available recorded balance? No asset will be sold and no money will be withdrawn.`)) return;
                busy=true;button.disabled=true;clearMessages();
                try {
                    const data=await apiRequest('/api/trading/allocations/'+allocation.id+'/release',{method:'POST',body:{}});
                    drawSummary(data.summary);drawAllocations(data.allocations);
                    el('investStatus').textContent=`Released ${usd(allocation.amount)} to your available recorded balance. No asset sale or withdrawal occurred.`;
                } catch(error) {showError(error);} finally {busy=false;button.disabled=false;}
            });td.append(button);
        } else {td.textContent='Released '+new Date(allocation.releasedAt).toLocaleString();}
        tr.append(td);
    }
    if(!allocations.length) {const tr=row(body,['No recorded allocations yet. Choose an asset and amount above.']);tr.firstChild.colSpan=6;}
}
function drawSummary(value) {
    summary=value;el('ledgerBalance').textContent=usd(value.availableBalance);el('allocatedBalance').textContent=usd(value.allocatedBalance);el('totalRecordedBalance').textContent=usd(value.totalRecordedBalance);
}
function drawDrafts(drafts) {
    el('legacyDrafts').hidden=!drafts.length;const body=el('draftRows');body.replaceChildren();
    for(const draft of drafts) {
        const tr=row(body,[new Date(draft.createdAt).toLocaleString(),draft.symbol,draft.sizing==='notional'?usd(Number(draft.size)):`${draft.size} units`,'Draft — no balance allocated']);
        const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Use for allocation';
        button.addEventListener('click',()=>{
            if(busy || pendingAllocation) return;
            const asset=assets.find(asset=>asset.symbol===draft.symbol);if(!asset) return;
            el('assetSearch').value='';choose(asset,draft.side==='buy' && draft.sizing==='notional'?draft.size:'');
            el('allocationAmount').focus();
            if(draft.sizing==='quantity' || draft.side!=='buy') el('investStatus').textContent='Enter a USD amount for the allocation. Units are not converted into a price.';
        });td.append(button);tr.append(td);
    }
}
async function refresh() {
    const data=await apiRequest('/api/trading');
    if(!data.recordedAllocationsEnabled) throw Object.assign(new Error('Backend update required.'),{status:404});
    assets=data.assets;drawSummary(data.allocationSummary);drawAllocations(data.recordedAllocations);drawDrafts(data.drafts);return data;
}
el('investLogout').addEventListener('click',logoutUser);
el('assetClass').addEventListener('change',drawAssets);el('assetSearch').addEventListener('input',drawAssets);
el('refreshAllocations').addEventListener('click',async()=>{
    if(busy || pendingAllocation) return;busy=true;el('refreshAllocations').disabled=true;clearMessages();
    try {await refresh();} catch(error) {showError(error);} finally {busy=false;el('refreshAllocations').disabled=false;}
});
el('allocationForm').addEventListener('submit',event=>{
    event.preventDefault();if(busy || pendingAllocation || !customer || !selectedAsset || !summary) return;clearMessages();
    const amount=el('allocationAmount').value.trim();
    if(!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount)<=0 || Number(amount)>100000000) {showError(new Error('Enter a USD amount between $0.01 and $100,000,000.00, with at most two decimal places.'));return;}
    if(Math.round(Number(amount)*100)>Math.round(summary.availableBalance*100)) {showError(new Error('Insufficient available recorded balance for this allocation.'));return;}
    pendingAllocation={key:crypto.randomUUID(),body:{symbol:selectedAsset.symbol,amount,acknowledgement:'purchase_not_verified'}};
    const details=el('reviewDetails');details.replaceChildren();
    for(const [label,value] of [['Asset',`${selectedAsset.name} (${selectedAsset.symbol})`],['Amount',usd(Number(amount))],['Available after recording',usd((Math.round(summary.availableBalance*100)-Math.round(Number(amount)*100))/100)],['Verification','Purchase not verified']]) {
        const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;details.append(dt,dd);
    }
    editable(false);el('allocationAcknowledgement').checked=false;el('allocationReview').hidden=false;el('allocationAcknowledgement').focus();
});
el('editAllocation').addEventListener('click',()=>{
    if(busy) return;pendingAllocation=null;el('confirmAllocation').textContent='Confirm recorded allocation';el('allocationReview').hidden=true;editable(true);el('allocationAmount').focus();
});
el('confirmAllocation').addEventListener('click',async()=>{
    if(busy || !pendingAllocation) return;clearMessages();
    if(!el('allocationAcknowledgement').checked) {showError(new Error('Please acknowledge that the asset purchase is not verified.'));return;}
    busy=true;el('confirmAllocation').disabled=true;el('editAllocation').disabled=true;
    try {
        const data=await apiRequest('/api/trading/allocations',{method:'POST',body:pendingAllocation.body,headers:{'Idempotency-Key':pendingAllocation.key}});
        drawSummary(data.summary);drawAllocations(data.allocations);el('confirmAllocation').textContent='Confirm recorded allocation';pendingAllocation=null;el('allocationReview').hidden=true;el('allocationAmount').value='';editable(true);
        el('investStatus').textContent=data.allocation.status==='released'
            ? 'That allocation was previously recorded and released. No new allocation was created.'
            : `Recorded ${usd(data.allocation.amount)} for ${data.allocation.symbol} — purchase not verified. Your available balance has been updated.`;
    } catch(error) {
        if(!error.status || error.status>=500) {
            pendingAllocation.uncertain=true;
            showError(new Error('The result could not be confirmed. Retry this allocation using the same button; it will not deduct the amount twice. If you reload, check your recorded allocations before starting another.'));
            el('confirmAllocation').textContent='Retry recorded allocation';
        } else {showError(error);}
    } finally {busy=false;el('confirmAllocation').disabled=false;el('editAllocation').disabled=Boolean(pendingAllocation?.uncertain);}
});
(async()=>{
    try {
        const session=await requireSession();customer=session.user.role==='user';await refresh();
        if(!customer) el('investStatus').textContent='Use a customer account to record your own allocations. Admin accounts manage customer records separately.';
        const requested=new URLSearchParams(window.location.search).get('asset'),symbol=['BTC','ETH','SOL'].includes(requested)?requested+'USD':requested;
        const asset=assets.find(asset=>asset.symbol===symbol)||assets[0];if(asset) choose(asset);
    } catch(error) {editable(false);showError(error);const body=el('allocationRows');body.replaceChildren();const tr=row(body,['Allocation records could not be loaded.']);tr.firstChild.colSpan=6;}
})();
