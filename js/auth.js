

"use strict";

const AUTH_STORAGE_KEY = "nexora_users";
const SESSION_KEY = "nexora_current_user";
const PORTFOLIO_KEY = "nexora_portfolios";
const TRANSACTIONS_KEY = "nexora_transactions";

const STARTING_BALANCE = 25000;


/* =====================================
   STORAGE HELPERS
===================================== */

function getStoredJSON(key, fallback) {
    try {
        const value = localStorage.getItem(key);

        if (!value) {
            return fallback;
        }

        return JSON.parse(value);

    } catch (error) {
        console.error("Storage read failed:", error);
        return fallback;
    }
}


function setStoredJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}


function getUsers() {
    const users = getStoredJSON(AUTH_STORAGE_KEY, []);

    return Array.isArray(users) ? users : [];
}


function showAuthMessage(message, type = "error") {
    const element = document.getElementById("authMessage");

    if (!element) {
        return;
    }

    element.textContent = message;

    element.style.color =
        type === "success" ? "#32d6a0" : "#ff7185";
}


/* =====================================
   PASSWORD HASHING FOR THE DEMO
===================================== */

async function hashDemoPassword(password) {

    if (!window.crypto || !window.crypto.subtle) {
        throw new Error(
            "Secure browser cryptography is unavailable. " +
            "Open the project using localhost or HTTPS."
        );
    }

    const encodedPassword = new TextEncoder().encode(password);

    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        encodedPassword
    );

    return Array.from(new Uint8Array(hashBuffer))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}


/* =====================================
   DEMO ACCOUNT INITIALIZATION
===================================== */

function initializeDemoAccount(user) {

    const portfolios = getStoredJSON(PORTFOLIO_KEY, {});

    if (!portfolios[user.id]) {

        portfolios[user.id] = {
            cashBalance: STARTING_BALANCE,
            holdings: [],
            currency: "USD",
            createdAt: new Date().toISOString()
        };

        setStoredJSON(PORTFOLIO_KEY, portfolios);
    }


    const transactions = getStoredJSON(TRANSACTIONS_KEY, {});

    if (!transactions[user.id]) {

        transactions[user.id] = [];

        setStoredJSON(TRANSACTIONS_KEY, transactions);
    }

}


/* =====================================
   CURRENT DEMO SESSION
===================================== */

function getCurrentUser() {

    const userId = sessionStorage.getItem(SESSION_KEY);

    if (!userId) {
        return null;
    }

    const user = getUsers().find(item => item.id === userId);

    return user || null;
}


function setCurrentUser(user) {
    sessionStorage.setItem(SESSION_KEY, user.id);
}


function logoutDemoUser() {
    sessionStorage.removeItem(SESSION_KEY);

    window.location.href = "login.html";
}


/* =====================================
   REGISTRATION
===================================== */

async function handleRegistration(event) {

    event.preventDefault();

    const form = event.currentTarget;

    const firstName =
        document.getElementById("firstName").value.trim();

    const lastName =
        document.getElementById("lastName").value.trim();

    const email =
        document.getElementById("registerEmail").value
            .trim()
            .toLowerCase();

    const password =
        document.getElementById("registerPassword").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;


    if (!firstName || !lastName || !email) {

        showAuthMessage("Please complete all required fields.");

        return;
    }


    if (password.length < 12) {

        showAuthMessage(
            "Please use a password with at least 12 characters."
        );

        return;
    }


    if (password !== confirmPassword) {

        showAuthMessage(
            "Your passwords do not match."
        );

        return;
    }


    const users = getUsers();

    const emailExists = users.some(
        user => user.email === email
    );


    if (emailExists) {

        showAuthMessage(
            "An account with this email already exists in this browser."
        );

        return;
    }


    const submitButton =
        form.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    submitButton.textContent = "Creating demo account...";


    try {

        const passwordHash = await hashDemoPassword(password);

        const user = {

            id: crypto.randomUUID(),

            firstName,
            lastName,
            email,

            passwordHash,

            accountType: "demo",

            createdAt: new Date().toISOString()

        };


        users.push(user);

        setStoredJSON(AUTH_STORAGE_KEY, users);

        initializeDemoAccount(user);

        setCurrentUser(user);

        showAuthMessage(
            "Your demo account has been created.",
            "success"
        );


        window.location.href = "dashboard.html";


    } catch (error) {

        console.error(error);

        showAuthMessage(
            error.message || "Unable to create the demo account."
        );

    } finally {

        submitButton.disabled = false;

        submitButton.innerHTML =
            'Create demo account <i class="fa-solid fa-arrow-right"></i>';

    }

}


/* =====================================
   LOGIN
===================================== */

async function handleLogin(event) {

    event.preventDefault();

    const form = event.currentTarget;

    const email =
        document.getElementById("loginEmail").value
            .trim()
            .toLowerCase();

    const password =
        document.getElementById("loginPassword").value;


    const users = getUsers();

    const user = users.find(
        item => item.email === email
    );


    if (!user) {

        showAuthMessage(
            "Unable to log in with those details. Check your email and password."
        );

        return;
    }


    const submitButton =
        form.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    submitButton.textContent = "Signing in...";


    try {

        const passwordHash = await hashDemoPassword(password);


        if (passwordHash !== user.passwordHash) {

            showAuthMessage(
                "Unable to log in with those details. Check your email and password."
            );

            return;
        }


        initializeDemoAccount(user);

        setCurrentUser(user);

        window.location.href = "dashboard.html";


    } catch (error) {

        console.error(error);

        showAuthMessage(
            error.message || "Unable to log in."
        );

    } finally {

        submitButton.disabled = false;

        submitButton.innerHTML =
            'Log in <i class="fa-solid fa-arrow-right"></i>';

    }

}


/* =====================================
   FORM EVENT LISTENERS
===================================== */

document.addEventListener("DOMContentLoaded", () => {

    const registrationForm =
        document.getElementById("registerForm");

    if (registrationForm) {

        registrationForm.addEventListener(
            "submit",
            handleRegistration
        );

    }


    const loginForm =
        document.getElementById("loginForm");

    if (loginForm) {

        loginForm.addEventListener(
            "submit",
            handleLogin
        );

    }

});
