"use strict";
const accountMoney=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
document.getElementById('accountLogout').addEventListener('click',logoutUser);
(async()=>{
    try {
        await requireSession();
        const data=await apiRequest('/api/account');
        const user=data.user;
        if(document.getElementById('profileDetails')) {
            document.getElementById('profileName').textContent=`${user.firstName} ${user.lastName}`;
            document.getElementById('profileEmail').textContent=user.email;
            document.getElementById('profileCreated').textContent='Joined '+new Date(user.createdAt).toLocaleDateString();
            document.getElementById('profileStatus').textContent='Status: '+user.status;
            document.getElementById('profileDetails').hidden=false;
            document.getElementById('adminLink').hidden=user.role!=='admin';
        }
        if(document.getElementById('accountBalance')) document.getElementById('accountBalance').textContent=accountMoney(data.portfolio.cashBalance);
        if(document.getElementById('accountAllocated')) document.getElementById('accountAllocated').textContent=accountMoney(data.portfolio.allocatedBalance || 0);
        if(document.getElementById('accountTotal')) document.getElementById('accountTotal').textContent=accountMoney(data.portfolio.totalRecordedBalance ?? data.portfolio.cashBalance);
        const allocations=document.getElementById('portfolioAllocations');
        if(allocations) {
            for(const allocation of data.recordedAllocations || []) {
                const row=document.createElement('tr');
                for(const value of [`${allocation.name} (${allocation.symbol})`,accountMoney(allocation.amount),new Date(allocation.createdAt).toLocaleString(),'Recorded allocation — purchase not verified',allocation.status==='released'?'Released':'Recorded']) {
                    const cell=document.createElement('td');cell.textContent=value;row.append(cell);
                }
                allocations.append(row);
            }
            if(!data.recordedAllocations?.length) {const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=5;cell.textContent='No recorded allocations yet.';row.append(cell);allocations.append(row);}
        }
        const history=document.getElementById('accountHistory');
        if(history) {
            for(const entry of data.transactions) {
                const row=document.createElement('tr');
                for(const value of [new Date(entry.date).toLocaleString(),entry.type,accountMoney(entry.total),accountMoney(entry.balanceAfter),entry.description]) {
                    const cell=document.createElement('td');cell.textContent=value;row.append(cell);
                }
                history.append(row);
            }
            if(!data.transactions.length) {const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=5;cell.textContent='No account adjustments yet.';row.append(cell);history.append(row);}
        }
    } catch(error) {if(error.status!==401) document.getElementById('accountError').textContent=error.message;}
})();
