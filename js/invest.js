"use strict";
const el=id=>document.getElementById(id);
const usd=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
let assets=[], selectedAsset=null, pendingDraft=null, busy=false, customer=false;
function showError(error) {
    if(error.status===401) {window.location.replace('login.html');return;}
    el('investError').textContent=error.status===404
        ? 'The investment service needs the latest backend deployment. Ask the administrator to deploy the update on Render.'
        : error.message;
}
function clearMessages() {el('investError').textContent='';el('investStatus').textContent='';}
function sizeControls() {
    const selling=el('orderSide').value==='sell';
    if(selling) el('orderSizing').value='quantity';
    el('orderSizing').disabled=selling;
    el('sizeLabel').textContent=el('orderSizing').value==='notional'?'Amount (USD)':'Quantity (units)';
    el('orderSize').placeholder=el('orderSizing').value==='notional'?'0.00':'0.00000000';
}
function editable(value) {
    el('draftFields').disabled=!value || !customer || !selectedAsset;
    el('assetClass').disabled=!value;el('assetSearch').disabled=!value;
    for(const button of el('assetList').querySelectorAll('button')) button.disabled=!value;
    sizeControls();
}
function drawAssets() {
    const list=el('assetList');list.replaceChildren();
    const query=el('assetSearch').value.trim().toLowerCase();
    const visible=assets.filter(asset=>asset.assetClass===el('assetClass').value && `${asset.name} ${asset.symbol}`.toLowerCase().includes(query));
    for(const asset of visible) {
        const button=document.createElement('button');button.type='button';button.className='asset-choice';
        button.setAttribute('aria-pressed',String(selectedAsset?.symbol===asset.symbol));
        const name=document.createElement('strong'),symbol=document.createElement('small');
        name.textContent=asset.name;symbol.textContent=asset.symbol;button.append(name,symbol);
        button.addEventListener('click',()=>{
            if(busy || pendingDraft) return;
            selectedAsset=asset;el('selectedAsset').textContent=`${asset.name} · ${asset.symbol}`;
            el('orderSize').value='';editable(true);drawAssets();
        });
        list.append(button);
    }
    if(!visible.length) {const note=document.createElement('p');note.textContent='No matching assets in this example catalogue.';list.append(note);}
}
function drawDrafts(drafts) {
    const body=el('draftRows');body.replaceChildren();
    for(const draft of drafts) {
        const row=document.createElement('tr');
        for(const value of [new Date(draft.createdAt).toLocaleString(),draft.symbol,draft.side==='buy'?'Buy':'Sell',draft.sizing==='notional'?usd(Number(draft.size)):`${draft.size} units`,'Draft — not placed']) {
            const td=document.createElement('td');td.textContent=value;row.append(td);
        }
        const td=document.createElement('td'),button=document.createElement('button');
        button.type='button';button.className='secondary';button.textContent='Discard draft';
        button.addEventListener('click',async()=>{
            if(busy) return;busy=true;button.disabled=true;clearMessages();
            try {
                await apiRequest('/api/trading/drafts/'+draft.id+'/discard',{method:'POST',body:{}});
                el('investStatus').textContent='Draft discarded. No investment or balance was changed.';
                await refreshDrafts();
            } catch(error) {showError(error);} finally {busy=false;button.disabled=false;}
        });
        td.append(button);row.append(td);body.append(row);
    }
    if(!drafts.length) {const row=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='No saved drafts. Prepare an order above to save your first draft.';row.append(td);body.append(row);}
}
async function refreshDrafts() {
    const data=await apiRequest('/api/trading');
    drawDrafts(data.drafts);
    return data;
}
el('investLogout').addEventListener('click',logoutUser);
el('assetClass').addEventListener('change',drawAssets);
el('assetSearch').addEventListener('input',drawAssets);
el('orderSide').addEventListener('change',sizeControls);
el('orderSizing').addEventListener('change',sizeControls);
el('refreshDrafts').addEventListener('click',async()=>{
    if(busy) return;clearMessages();el('refreshDrafts').disabled=true;
    try {await refreshDrafts();} catch(error) {showError(error);} finally {el('refreshDrafts').disabled=false;}
});
el('orderDraftForm').addEventListener('submit',event=>{
    event.preventDefault();if(busy || pendingDraft || !customer || !selectedAsset) return;clearMessages();
    const sizing=el('orderSizing').value, size=el('orderSize').value.trim(), precision=sizing==='notional'?2:8;
    if(!new RegExp(`^\\d{1,9}(\\.\\d{1,${precision}})?$`).test(size) || Number(size)<=0 || Number(size)>100000000) {
        showError(new Error(`Enter a positive size up to 100,000,000, with at most ${precision} decimal places.`));return;
    }
    pendingDraft={key:crypto.randomUUID(),body:{symbol:selectedAsset.symbol,side:el('orderSide').value,sizing,size,orderType:'market'}};
    const details=el('reviewDetails');details.replaceChildren();
    const values=[['Asset',`${selectedAsset.name} (${selectedAsset.symbol})`],['Action',pendingDraft.body.side==='buy'?'Buy':'Sell'],['Size',sizing==='notional'?usd(Number(size)):`${size} units`],['Order type','Market draft'],['Quote / fees','Unavailable'],['Submission status','Not placed']];
    for(const [label,value] of values) {const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;details.append(dt,dd);}
    editable(false);el('draftReview').hidden=false;el('saveDraft').focus();
});
el('editDraft').addEventListener('click',()=>{
    if(busy) return;pendingDraft=null;el('draftReview').hidden=true;editable(true);el('orderSize').focus();
});
el('saveDraft').addEventListener('click',async()=>{
    if(busy || !pendingDraft) return;busy=true;clearMessages();
    el('saveDraft').disabled=true;el('editDraft').disabled=true;
    try {
        await apiRequest('/api/trading/drafts',{method:'POST',body:pendingDraft.body,headers:{'Idempotency-Key':pendingDraft.key}});
        pendingDraft=null;el('draftReview').hidden=true;el('orderSize').value='';editable(true);
        el('investStatus').textContent='Draft saved. No order was placed and no funds were moved.';
        try {await refreshDrafts();} catch(error) {showError(new Error('Draft saved, but history could not refresh. Use Refresh drafts.'));}
    } catch(error) {showError(error);} finally {busy=false;el('saveDraft').disabled=false;el('editDraft').disabled=false;}
});
(async()=>{
    try {
        const session=await requireSession();customer=session.user.role==='user';
        const account=await apiRequest('/api/account');el('ledgerBalance').textContent=usd(account.portfolio.cashBalance);
        const data=await refreshDrafts();assets=data.assets;
        if(!customer) el('investStatus').textContent='Sign in with a customer account to prepare drafts. Administrator accounts cannot place customer orders.';
        const requested=new URLSearchParams(window.location.search).get('asset');
        const symbol=['BTC','ETH','SOL'].includes(requested)?requested+'USD':requested;
        selectedAsset=assets.find(asset=>asset.symbol===symbol)||assets[0]||null;
        if(selectedAsset) {
            el('assetClass').value=selectedAsset.assetClass;
            el('selectedAsset').textContent=`${selectedAsset.name} · ${selectedAsset.symbol}`;
        }
        if(requested && !assets.some(asset=>asset.symbol===symbol)) el('investStatus').textContent='That asset is not in the current draft catalogue. Choose one of the available examples.';
        drawAssets();editable(true);
    } catch(error) {
        editable(false);
        showError(error);
        el('draftRows').replaceChildren();
        const row=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='Draft history could not be loaded.';row.append(td);el('draftRows').append(row);
    }
})();
