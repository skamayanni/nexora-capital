"use strict";
// Credentials and balances live on the server. Only an HttpOnly session cookie is stored by the browser.
let currentAccountUser = null;
let csrfToken = null;
async function apiRequest(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(path, {
        method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? {'X-CSRF-Token': csrfToken} : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json().catch(() => ({error: 'Unable to contact the server.'}));
    if (!response.ok) {
        const error = new Error(data.error || 'Request failed.');
        error.status = response.status;
        throw error;
    }
    if (data.csrfToken) csrfToken = data.csrfToken;
    if (data.user && !path.startsWith('/api/admin/')) currentAccountUser = data.user;
    return data;
}
async function requireSession() {
    try { return await apiRequest('/api/session'); }
    catch (error) {
        if (error.status === 401) window.location.replace('login.html');
        throw error;
    }
}
function getCurrentUser() { return currentAccountUser; }
async function logoutUser() {
    try {
        await apiRequest('/api/logout', {method:'POST', body:{}});
        currentAccountUser = null;
        window.location.replace('login.html');
    } catch (error) { window.alert(error.message); }
}
function showAuthMessage(message, type = 'error') {
    const element = document.getElementById('authMessage');
    if (element) { element.textContent = message; element.style.color = type === 'success' ? '#32d6a0' : '#ff7185'; }
}
async function submitAuth(event, registration) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type=submit]');
    const label = button.textContent;
    const body = registration ? {
        firstName: form.elements.firstName.value.trim(), lastName: form.elements.lastName.value.trim(),
        email: form.elements.email.value.trim(), password: form.elements.password.value
    } : { email: document.getElementById('loginEmail').value.trim(), password: document.getElementById('loginPassword').value };
    if (registration && body.password !== form.elements.confirmPassword.value) { showAuthMessage('Your passwords do not match.'); return; }
    button.disabled = true; button.textContent = registration ? 'Creating account…' : 'Signing in…';
    showAuthMessage('');
    try {
        const data = await apiRequest(registration ? '/api/register' : '/api/login', {method:'POST',body});
        window.location.href = data.user.role === 'admin' ? 'admin.html' : 'dashboard.html';
    } catch (error) { showAuthMessage(error.message); }
    finally { button.disabled = false; button.textContent = label; }
}
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('registerForm')?.addEventListener('submit', event => submitAuth(event,true));
    document.getElementById('loginForm')?.addEventListener('submit', event => submitAuth(event,false));
});
