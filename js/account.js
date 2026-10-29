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
