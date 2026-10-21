"use strict";

/*
=========================================================
NEXORA CAPITAL — SIMULATED INVESTMENT DASHBOARD
=========================================================

This is an educational demonstration interface.

- Market prices are illustrative.
- Sample holdings and transactions are fictional.
- No real brokerage or exchange is connected.
- All transactions are simulated and stored in the browser.
=========================================================
*/


// =======================================================
// CONFIGURATION
// =======================================================

const DASHBOARD_PORTFOLIO_KEY = "nexora_portfolios";
const DASHBOARD_TRANSACTION_KEY = "nexora_transactions";

const NEXORA_DEMO_CASH = 350000;

const NEXORA_DEMO_SEED_KEY = "nexora_demo_seeded_v1";


// These are illustrative demo prices, NOT live quotations.

const NEXORA_MARKETS = [

    {
        symbol: "NVDA",
        name: "NVIDIA",
        category: "stocks",
        price: 185,
        change: 1.65,
        icon: "fa-solid fa-microchip",
        iconClass: "nvidia"
    },

    {
        symbol: "MSFT",
        name: "Microsoft",
        category: "stocks",
        price: 510,
        change: 0.72,
        icon: "fa-brands fa-microsoft",
        iconClass: "microsoft"
    },

    {
        symbol: "AAPL",
        name: "Apple",
        category: "stocks",
        price: 245,
        change: 0.48,
        icon: "fa-brands fa-apple",
        iconClass: "apple"
    },

    {
        symbol: "AMZN",
        name: "Amazon",
        category: "stocks",
        price: 225,
        change: 1.12,
        icon: "fa-brands fa-amazon",
        iconClass: "amazon"
    },

    {
        symbol: "TSLA",
        name: "Tesla",
        category: "stocks",
        price: 245,
        change: 1.20,
        icon: "fa-solid fa-car",
        iconClass: "tesla"
    },

    {
        symbol: "BYD",
        name: "BYD Company",
        category: "stocks",
        price: 31,
        change: 0.50,
        icon: "fa-solid fa-car-side",
        iconClass: "byd"
    },

    {
        symbol: "BTC",
        name: "Bitcoin",
        category: "crypto",
        price: 67500,
        change: 1.40,
        icon: "fa-brands fa-bitcoin",
        iconClass: "bitcoin"
    },

    {
        symbol: "ETH",
        name: "Ethereum",
        category: "crypto",
        price: 3450,
        change: 0.80,
        icon: "fa-brands fa-ethereum",
        iconClass: "ethereum"
    },

    {
        symbol: "SOL",
        name: "Solana",
        category: "crypto",
        price: 152,
        change: -0.60,
        icon: "fa-solid fa-sun",
        iconClass: "solana"
    },

    {
        symbol: "WTI",
        name: "WTI Crude Oil",
        category: "energy",
        price: 78,
        change: -0.30,
        icon: "fa-solid fa-oil-well",
        iconClass: "energy"
    },

    {
        symbol: "BRENT",
        name: "Brent Crude Oil",
        category: "energy",
        price: 82,
        change: 0.40,
        icon: "fa-solid fa-gas-pump",
        iconClass: "energy"
    },

    {
        symbol: "NG",
        name: "Natural Gas",
        category: "energy",
        price: 3.2,
        change: -1.10,
        icon: "fa-solid fa-fire",
        iconClass: "petroleum"
    },

    {
        symbol: "GASOLINE",
        name: "Gasoline",
        category: "petroleum",
        price: 2.4,
        change: 0.20,
        icon: "fa-solid fa-droplet",
        iconClass: "petroleum"
    },

    {
        symbol: "DIESEL",
        name: "Diesel",
        category: "petroleum",
        price: 2.6,
        change: 0.10,
        icon: "fa-solid fa-droplet",
        iconClass: "petroleum"
    }

];


// =======================================================
// DASHBOARD STATE
// =======================================================

let dashboardUser = null;
let dashboardPortfolio = null;
let dashboardTransactions = [];

let selectedTradeAsset = null;
let selectedTradeMode = "BUY";


// =======================================================
// STORAGE HELPERS
// =======================================================

function readDashboardStorage(key, fallback) {

    try {

        const value = localStorage.getItem(key);

        if (!value) {
            return fallback;
        }

        return JSON.parse(value);

    } catch (error) {

        console.error("Unable to read demo storage:", error);

        return fallback;
    }
}


function writeDashboardStorage(key, value) {

    localStorage.setItem(key, JSON.stringify(value));

}


function saveDashboardPortfolio() {

    const portfolios = readDashboardStorage(
        DASHBOARD_PORTFOLIO_KEY,
        {}
    );

    portfolios[dashboardUser.id] = dashboardPortfolio;

    writeDashboardStorage(
        DASHBOARD_PORTFOLIO_KEY,
        portfolios
    );

}


function saveDashboardTransactions() {

    const transactions = readDashboardStorage(
        DASHBOARD_TRANSACTION_KEY,
        {}
    );

    transactions[dashboardUser.id] = dashboardTransactions;

    writeDashboardStorage(
        DASHBOARD_TRANSACTION_KEY,
        transactions
    );

}


// =======================================================
// GENERAL HELPERS
// =======================================================

function escapeDashboardHTML(value) {

    return String(value ?? "").replace(/[&<>"']/g, character => {

        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];

    });

}


function formatMoney(value) {

    return new Intl.NumberFormat("en-US", {

        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2

    }).format(Number.isFinite(Number(value)) ? Number(value) : 0);

}

/* ==========================================
   PORTFOLIO VALUE COUNTER ANIMATION
========================================== */

function animatePortfolioValue(targetValue) {
    const valueElement = document.getElementById("totalPortfolioValue");

    if (!valueElement) return;

    // Stop any animation that may already be running
    if (valueElement._counterFrame) {
        cancelAnimationFrame(valueElement._counterFrame);
    }

    const target = Number(targetValue);

    if (!Number.isFinite(target)) {
        valueElement.textContent = formatMoney(0);
        return;
    }

    const duration = 1800; // Animation duration in milliseconds
    const startTime = performance.now();
    const startValue = 0;

    valueElement.textContent = formatMoney(startValue);

    function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Smooth ease-out effect
        const easedProgress = 1 - Math.pow(1 - progress, 4);

        const currentValue =
            startValue + (target - startValue) * easedProgress;

        valueElement.textContent = formatMoney(currentValue);

        if (progress < 1) {
            valueElement._counterFrame =
                requestAnimationFrame(updateCounter);
        } else {
            // Ensure the final number is exactly correct
            valueElement.textContent = formatMoney(target);
            valueElement._counterFrame = null;
        }
    }

    valueElement._counterFrame =
        requestAnimationFrame(updateCounter);
}


function formatQuantity(value) {

    return new Intl.NumberFormat("en-US", {

        maximumFractionDigits: 8

    }).format(Number(value) || 0);

}


function getDemoAsset(symbol) {

    return NEXORA_MARKETS.find(
        asset => asset.symbol === symbol
    );

}


function getAssetHolding(symbol) {

    if (!dashboardPortfolio) {
        return undefined;
    }

    return dashboardPortfolio.holdings.find(
        holding => holding.symbol === symbol
    );

}


function getHoldingValue(holding) {

    const asset = getDemoAsset(holding.symbol);

    if (!asset) {
        return 0;
    }

    return Number(holding.quantity) * asset.price;

}


function getHoldingCost(holding) {

    return Number(holding.quantity) * Number(holding.averagePrice);

}


function getPortfolioTotals() {

    const cash = Number(dashboardPortfolio.cashBalance) || 0;

    const investedValue = dashboardPortfolio.holdings.reduce(
        (total, holding) => total + getHoldingValue(holding),
        0
    );

    const costBasis = dashboardPortfolio.holdings.reduce(
        (total, holding) => total + getHoldingCost(holding),
        0
    );

    const profitLoss = investedValue - costBasis;

    return {

        cash,
        investedValue,
        portfolioValue: cash + investedValue,
        costBasis,
        profitLoss

    };

}


// =======================================================
// HOLDING DATE HELPERS
// =======================================================

function formatHoldingPeriod(dateValue) {

    if (!dateValue) {
        return "Date unavailable";
    }

    const start = new Date(dateValue);

    if (Number.isNaN(start.getTime()) || start > new Date()) {
        return "Date unavailable";
    }

    const now = new Date();

    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();

    if (now.getDate() < start.getDate()) {
        months--;
    }

    if (months < 0) {
        years--;
        months += 12;
    }

    if (years < 0) {
        return "Date unavailable";
    }

    if (years === 0 && months === 0) {
        return "Less than 1 month";
    }

    const yearText = years > 0
        ? `${years} ${years === 1 ? "year" : "years"}`
        : "";

    const monthText = months > 0
        ? `${months} ${months === 1 ? "month" : "months"}`
        : "";

    return [yearText, monthText]
        .filter(Boolean)
        .join(", ");

}


function formatPurchaseDate(dateValue) {

    if (!dateValue) {
        return "Unavailable";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Unavailable";
    }

    return date.toLocaleDateString("en-US", {

        month: "short",
        day: "numeric",
        year: "numeric"

    });

}


// =======================================================
// DEMO PORTFOLIO SEEDING
// =======================================================

function createIllustrativePortfolio() {

    /*
    All values and dates below are fictional sample data.
    This portfolio is only created for a new empty demo account.

    The starting portfolio value is $2,500,000:
    $2,150,000 in illustrative holdings
    $350,000 in available cash
    */

    const today = new Date();

    function monthsAgo(months, day = 15) {

        const date = new Date(today);

        date.setDate(1);
        date.setMonth(date.getMonth() - months);
        date.setDate(
            Math.min(day, new Date(
                date.getFullYear(),
                date.getMonth() + 1,
                0
            ).getDate())
        );

        return date.toISOString();

    }

    const positions = [

        {
            symbol: "NVDA",
            value: 420000,
            costPerUnit: 130,
            monthsHeld: 26
        },

        {
            symbol: "MSFT",
            value: 350000,
            costPerUnit: 390,
            monthsHeld: 24
        },

        {
            symbol: "AAPL",
            value: 280000,
            costPerUnit: 190,
            monthsHeld: 22
        },

        {
            symbol: "AMZN",
            value: 250000,
            costPerUnit: 175,
            monthsHeld: 20
        },

        {
            symbol: "BTC",
            value: 300000,
            costPerUnit: 52000,
            monthsHeld: 18
        },

        // {
        //     symbol: "ETH",
        //     value: 180000,
        //     costPerUnit: 2800,
        //     monthsHeld: 16
        // },

        {
            symbol: "TSLA",
            value: 220000,
            costPerUnit: 210,
            monthsHeld: 14
        },

        {
            symbol: "WTI",
            value: 150000,
            costPerUnit: 70,
            monthsHeld: 12
        }

    ];

    const holdings = positions.map(position => {

        const asset = getDemoAsset(position.symbol);

        const quantity = position.value / asset.price;

        return {

            symbol: position.symbol,
            quantity,
            averagePrice: position.costPerUnit,
            firstPurchaseDate: monthsAgo(position.monthsHeld),
            demoSeeded: true

        };

    });

    const transactions = [];

    /*
    Sample opening purchases and a sample reinvestment story.

    These entries are illustrative activity records, not actual
    executed orders. Values are calculated consistently with
    the displayed positions where practical.
    */

    positions.forEach(position => {

        const asset = getDemoAsset(position.symbol);

        const quantity = position.value / asset.price;

        transactions.push({

            id: `demo-buy-${position.symbol}`,
            type: "BUY",
            symbol: position.symbol,
            name: asset.name,
            quantity,
            price: asset.price,
            total: position.value,
            date: monthsAgo(position.monthsHeld),
            simulated: true,
            illustrative: true,
            description: "Illustrative opening position"

        });

    });

    transactions.push({

        id: "demo-sell-tsla",
        type: "SELL",
        symbol: "TSLA",
        name: "Tesla",
        quantity: 100,
        price: 245,
        total: 24500,
        costBasisSold: 21000,
        realizedProfit: 3500,
        date: monthsAgo(5),
        simulated: true,
        illustrative: true,
        description: "Illustrative realized gain"

    });

    transactions.push({

        id: "demo-reinvest-nvda",
        type: "BUY",
        symbol: "NVDA",
        name: "NVIDIA",
        quantity: 50,
        price: 185,
        total: 9250,
        date: monthsAgo(4),
        simulated: true,
        illustrative: true,
        description: "Illustrative reinvestment"

    });

    transactions.push({

        id: "demo-reinvest-msft",
        type: "BUY",
        symbol: "MSFT",
        name: "Microsoft",
        quantity: 20,
        price: 510,
        total: 10200,
        date: monthsAgo(3),
        simulated: true,
        illustrative: true,
        description: "Illustrative reinvestment"

    });

    /*
    Keep the sample activity clearly marked as illustrative.
    The portfolio is a visual prototype, not an accounting ledger.
    */

    return {

        portfolio: {

            cashBalance: NEXORA_DEMO_CASH,
            holdings,
            currency: "USD",
            createdAt: monthsAgo(26),
            illustrative: true

        },

        transactions

    };

}


function seedEmptyDemoAccountIfNeeded() {

    const portfolios = readDashboardStorage(
        DASHBOARD_PORTFOLIO_KEY,
        {}
    );

    const transactionsByUser = readDashboardStorage(
        DASHBOARD_TRANSACTION_KEY,
        {}
    );

    const existingPortfolio = portfolios[dashboardUser.id];

    const existingTransactions =
        transactionsByUser[dashboardUser.id] || [];

    /*
    Do not replace an existing account that has positions
    or transaction history.
    */

    const hasExistingHoldings =
        existingPortfolio &&
        Array.isArray(existingPortfolio.holdings) &&
        existingPortfolio.holdings.length > 0;

    const hasExistingTransactions =
        Array.isArray(existingTransactions) &&
        existingTransactions.length > 0;

    if (hasExistingHoldings || hasExistingTransactions) {
        return false;
    }

    /*
    If the account is empty, populate the demo portfolio.
    Existing empty accounts may receive this sample portfolio.
    */

    const sample = createIllustrativePortfolio();

    portfolios[dashboardUser.id] = sample.portfolio;

    transactionsByUser[dashboardUser.id] = sample.transactions;

    writeDashboardStorage(
        DASHBOARD_PORTFOLIO_KEY,
        portfolios
    );

    writeDashboardStorage(
        DASHBOARD_TRANSACTION_KEY,
        transactionsByUser
    );

    localStorage.setItem(
        `${NEXORA_DEMO_SEED_KEY}_${dashboardUser.id}`,
        "true"
    );

    return true;

}


// =======================================================
// LOAD ACCOUNT
// =======================================================

function loadDashboardAccount() {

    if (typeof getCurrentUser !== "function") {

        console.error("getCurrentUser() was not found in auth.js.");

        window.location.href = "login.html";

        return false;
    }

    dashboardUser = getCurrentUser();

    if (!dashboardUser) {

        window.location.href = "login.html";

        return false;
    }

    /*
    Create the sample portfolio only when the current account
    has no holdings and no transactions.
    */

    seedEmptyDemoAccountIfNeeded();

    const portfolios = readDashboardStorage(
        DASHBOARD_PORTFOLIO_KEY,
        {}
    );

    const transactions = readDashboardStorage(
        DASHBOARD_TRANSACTION_KEY,
        {}
    );

    dashboardPortfolio = portfolios[dashboardUser.id];

    dashboardTransactions = transactions[dashboardUser.id] || [];

    if (!dashboardPortfolio) {

        dashboardPortfolio = {

            cashBalance: 25000,
            holdings: [],
            currency: "USD",
            createdAt: new Date().toISOString()

        };

        portfolios[dashboardUser.id] = dashboardPortfolio;

        writeDashboardStorage(
            DASHBOARD_PORTFOLIO_KEY,
            portfolios
        );

    }

    if (!Array.isArray(dashboardPortfolio.holdings)) {
        dashboardPortfolio.holdings = [];
    }

    if (!Array.isArray(dashboardTransactions)) {
        dashboardTransactions = [];
    }

    return true;

}


// =======================================================
// USER INTERFACE
// =======================================================

function renderDashboardUser() {

    const firstName = dashboardUser.firstName || "Investor";
    const lastName = dashboardUser.lastName || "";

    const fullName = `${firstName} ${lastName}`.trim();

    const welcomeName = document.getElementById("welcomeName");
    const topbarUserName = document.getElementById("topbarUserName");
    const userAvatar = document.getElementById("userAvatar");

    if (welcomeName) {
        welcomeName.textContent = firstName;
    }

    if (topbarUserName) {
        topbarUserName.textContent = fullName;
    }

    if (userAvatar) {

        userAvatar.textContent =
            `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

    }

    const dashboardDate = document.getElementById("dashboardDate");

    if (dashboardDate) {

        dashboardDate.textContent = new Intl.DateTimeFormat(
            "en-US",
            {

                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"

            }
        ).format(new Date());

    }

    const currentYear = document.getElementById("currentYear");

    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

}


// =======================================================
// DASHBOARD STATISTICS
// =======================================================

function renderDashboardStats() {

    const totals = getPortfolioTotals();

    const totalPortfolioValue =
        document.getElementById("totalPortfolioValue");

    const availableCash =
        document.getElementById("availableCash");

    const investedValue =
        document.getElementById("investedValue");

    const profitLossElement =
        document.getElementById("totalProfitLoss");

    const profitLossNote =
        document.getElementById("profitLossNote");

    // Animate the total portfolio value
    if (totalPortfolioValue) {
        animatePortfolioValue(totals.portfolioValue);
    }

    // Available cash
    if (availableCash) {
        availableCash.textContent = formatMoney(totals.cash);
    }

    // Current value of investments
    if (investedValue) {
        investedValue.textContent = formatMoney(totals.investedValue);
    }

    // Unrealized profit or loss
    if (profitLossElement) {

        profitLossElement.textContent =
            formatMoney(totals.profitLoss);

        profitLossElement.classList.toggle(
            "positive",
            totals.profitLoss > 0
        );

        profitLossElement.classList.toggle(
            "negative",
            totals.profitLoss < 0
        );
    }

    // Percentage return
    if (profitLossNote) {

        if (totals.costBasis > 0) {

            const percentage =
                (totals.profitLoss / totals.costBasis) * 100;

            profitLossNote.textContent =
                `${percentage >= 0 ? "+" : ""}${percentage.toFixed(2)}% ` +
                "illustrative unrealized return";

        } else {

            profitLossNote.textContent = "No open positions";

        }
    }
}


// =======================================================
// SELECTED ASSETS / MARKET WATCH
// =======================================================

function renderDashboardMarkets() {

    const container =
        document.getElementById("dashboardMarkets");

    if (!container) {
        return;
    }

    const featuredSymbols = [
        "NVDA",
        "MSFT",
        "BTC",
        "TSLA",
        "AAPL",
        "AMZN"
    ];

    const featuredAssets = featuredSymbols
        .map(symbol => getDemoAsset(symbol))
        .filter(Boolean);

    if (!featuredAssets.length) {

        container.innerHTML = `
            <p class="allocation-empty">
                Market demo data is currently unavailable.
            </p>
        `;

        return;
    }

    container.innerHTML = featuredAssets.map(asset => {

        const changeClass = asset.change >= 0
            ? "positive"
            : "negative";

        const changeSign = asset.change > 0
            ? "+"
            : "";

        return `

            <div class="overview-watchlist-row">

                <span class="asset-icon ${escapeDashboardHTML(asset.iconClass)}">
                    <i class="${escapeDashboardHTML(asset.icon)}"></i>
                </span>

                <div class="overview-watchlist-name">

                    <strong>
                        ${escapeDashboardHTML(asset.name)}
                    </strong>

                    <small>
                        ${escapeDashboardHTML(asset.symbol)}
                    </small>

                </div>

                <div class="overview-watchlist-price">

                    <strong>
                        ${formatMoney(asset.price)}
                    </strong>

                    <small class="${changeClass}">
                        ${changeSign}${asset.change.toFixed(2)}%
                    </small>

                </div>

                <button
                    type="button"
                    class="small-action-button"
                    data-buy-symbol="${escapeDashboardHTML(asset.symbol)}"
                >
                    View
                </button>

            </div>

        `;

    }).join("");

    container.querySelectorAll("[data-buy-symbol]").forEach(button => {

        button.addEventListener("click", () => {

            window.location.href =
                "markets.html?asset=" +
                encodeURIComponent(button.dataset.buySymbol);

        });

    });

}


// =======================================================
// INVESTMENT HOLDINGS
// =======================================================

function renderDashboardHoldings() {

    const totals = getPortfolioTotals();

    const chartValue =
        document.getElementById("chartPortfolioValue");

    const positionsCount =
        document.getElementById("openPositionsCount");

    const allocationTotal =
        document.getElementById("allocationTotal");

    if (chartValue) {

        chartValue.textContent =
            formatMoney(totals.portfolioValue);

    }

    if (positionsCount) {

        positionsCount.textContent =
            `${dashboardPortfolio.holdings.length} assets`;

    }

    if (allocationTotal) {

        allocationTotal.textContent =
            formatMoney(totals.investedValue);

    }

    renderInvestmentHoldings();

    renderPortfolioChart();

    renderAssetAllocation();

}


function renderInvestmentHoldings() {

    const tableBody =
        document.getElementById("investmentHoldingsBody");

    if (!tableBody) {
        return;
    }

    const holdings = dashboardPortfolio.holdings
        .map(holding => {

            const asset = getDemoAsset(holding.symbol);

            if (!asset) {
                return null;
            }

            const currentValue = getHoldingValue(holding);

            const costBasis = getHoldingCost(holding);

            const profitLoss = currentValue - costBasis;

            const profitPercentage = costBasis > 0
                ? (profitLoss / costBasis) * 100
                : 0;

            return {

                ...holding,
                asset,
                currentValue,
                costBasis,
                profitLoss,
                profitPercentage

            };

        })
        .filter(Boolean)
        .sort((a, b) => b.currentValue - a.currentValue);

    const totalCostBasis = holdings.reduce(
        (sum, holding) => sum + holding.costBasis,
        0
    );

    const totalCurrentValue = holdings.reduce(
        (sum, holding) => sum + holding.currentValue,
        0
    );

    const totalProfitLoss = totalCurrentValue - totalCostBasis;

    const countElement =
        document.getElementById("holdingsAssetCount");

    const costElement =
        document.getElementById("holdingsCostBasis");

    const valueElement =
        document.getElementById("holdingsCurrentValue");

    const profitElement =
        document.getElementById("holdingsProfitLoss");

    if (countElement) {
        countElement.textContent = holdings.length;
    }

    if (costElement) {
        costElement.textContent = formatMoney(totalCostBasis);
    }

    if (valueElement) {
        valueElement.textContent = formatMoney(totalCurrentValue);
    }

    if (profitElement) {

        profitElement.textContent = formatMoney(totalProfitLoss);

        profitElement.classList.toggle(
            "positive",
            totalProfitLoss > 0
        );

        profitElement.classList.toggle(
            "negative",
            totalProfitLoss < 0
        );

    }

    if (!holdings.length) {

        tableBody.innerHTML = `

            <tr>
                <td colspan="7" class="holdings-empty">
                    No open demo positions are available.
                </td>
            </tr>

        `;

        return;
    }

    tableBody.innerHTML = holdings.map(holding => {

        const profitClass = holding.profitLoss >= 0
            ? "positive"
            : "negative";

        const sign = holding.profitLoss > 0
            ? "+"
            : "";

        return `

            <tr>

                <td>

                    <div class="table-asset">

                        <span class="asset-icon ${escapeDashboardHTML(holding.asset.iconClass)}">
                            <i class="${escapeDashboardHTML(holding.asset.icon)}"></i>
                        </span>

                        <span>

                            <strong>
                                ${escapeDashboardHTML(holding.asset.name)}
                            </strong>

                            <small>
                                ${escapeDashboardHTML(holding.symbol)}
                            </small>

                        </span>

                    </div>

                </td>

                <td>
                    ${formatQuantity(holding.quantity)}
                </td>

                <td>
                    ${formatPurchaseDate(holding.firstPurchaseDate)}
                </td>

                <td>

                    <span class="holding-duration">
                        ${escapeDashboardHTML(
            formatHoldingPeriod(holding.firstPurchaseDate)
        )}
                    </span>

                </td>

                <td>
                    ${formatMoney(holding.averagePrice)}
                </td>

                <td>
                    <strong>${formatMoney(holding.currentValue)}</strong>
                </td>

                <td>

                    <strong class="${profitClass}">
                        ${sign}${formatMoney(holding.profitLoss)}
                    </strong>

                    <small class="${profitClass} holding-return">
                        ${holding.profitPercentage >= 0 ? "+" : ""}
                        ${holding.profitPercentage.toFixed(2)}%
                    </small>

                </td>

            </tr>

        `;

    }).join("");

}


// =======================================================
// ILLUSTRATIVE PORTFOLIO CHART
// =======================================================

function renderPortfolioChart() {

    const line =
        document.getElementById("portfolioChartLine");

    const area =
        document.getElementById("portfolioChartArea");

    if (!line || !area) {
        return;
    }

    const totals = getPortfolioTotals();

    /*
    This is a decorative illustrative chart, not historical
    account performance. Its final point represents the
    current portfolio snapshot.
    */

    const points = [];

    for (let i = 0; i < 24; i++) {

        const x = (i / 23) * 700;

        const trend = i * 0.65;

        const variation =
            Math.sin(i * 0.65) * 10 +
            Math.sin(i * 0.21) * 15;

        const upwardTrend = trend;

        const y = Math.max(
            35,
            Math.min(185, 155 - upwardTrend - variation)
        );

        points.push({ x, y });

    }

    points[points.length - 1].y = 75;

    const path = points.map((point, index) => {

        return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;

    }).join(" ");

    line.setAttribute("d", path);

    area.setAttribute(
        "d",
        `${path} L 700 220 L 0 220 Z`
    );

    line.setAttribute(
        "aria-label",
        `Illustrative portfolio snapshot ${formatMoney(totals.portfolioValue)}`
    );

}


// =======================================================
// ASSET ALLOCATION
// =======================================================

function renderAssetAllocation() {

    const donut =
        document.getElementById("allocationDonut");

    const legend =
        document.getElementById("allocationLegend");

    if (!donut || !legend) {
        return;
    }

    const holdings = dashboardPortfolio.holdings
        .map(holding => {

            const asset = getDemoAsset(holding.symbol);

            if (!asset) {
                return null;
            }

            return {

                ...holding,
                asset,
                value: getHoldingValue(holding)

            };

        })
        .filter(holding => holding && holding.value > 0);

    const total = holdings.reduce(
        (sum, holding) => sum + holding.value,
        0
    );

    if (total <= 0) {

        donut.style.background =
            "conic-gradient(#26343b 0deg 360deg)";

        legend.innerHTML = `
            <p class="allocation-empty">
                No open demo positions.
            </p>
        `;

        return;
    }

    const colors = [

        "#32d6a0",
        "#69b8ff",
        "#f6a623",
        "#a99bff",
        "#ff7185",
        "#e5bd70",
        "#72d6e5",
        "#b0d78a",
        "#dc91c8",
        "#a6b3bf"

    ];

    let currentAngle = 0;

    const segments = holdings.map((holding, index) => {

        const percentage = (holding.value / total) * 100;

        const start = currentAngle;

        const end = currentAngle + percentage * 3.6;

        currentAngle = end;

        return {

            ...holding,
            percentage,
            color: colors[index % colors.length],
            start,
            end

        };

    });

    const gradient = segments.map(segment => {

        return `${segment.color} ${segment.start}deg ${segment.end}deg`;

    }).join(", ");

    donut.style.background = `conic-gradient(${gradient})`;

    legend.innerHTML = segments.map(segment => `

        <div class="allocation-legend-row">

            <span
                class="allocation-legend-dot"
                style="background:${segment.color}"
            ></span>

            <div class="allocation-legend-name">

                <strong>
                    ${escapeDashboardHTML(segment.asset.name)}
                </strong>

                <small>
                    ${segment.percentage.toFixed(1)}% of invested value
                </small>

            </div>

            <div class="allocation-legend-value">

                <strong>
                    ${formatMoney(segment.value)}
                </strong>

            </div>

        </div>

    `).join("");

}


// =======================================================
// RECENT TRANSACTIONS
// =======================================================

function renderRecentTransactions() {

    const tableBody =
        document.getElementById("recentTransactions");

    if (!tableBody) {
        return;
    }

    if (!dashboardTransactions.length) {

        tableBody.innerHTML = `

            <tr>
                <td colspan="4">
                    No demo transactions yet.
                </td>
            </tr>

        `;

        return;
    }

    const recent = [...dashboardTransactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 6);

    tableBody.innerHTML = recent.map(transaction => {

        const type = String(transaction.type || "BUY").toUpperCase();

        const typeClass = type === "BUY"
            ? "badge-buy"
            : "badge-sell";

        const date = new Date(transaction.date);

        const formattedDate = Number.isNaN(date.getTime())
            ? "Date unavailable"
            : date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
            });

        const transactionTotal = Number(transaction.total) || 0;

        let detail = "";

        if (type === "SELL" && Number.isFinite(Number(transaction.realizedProfit))) {

            const realizedProfit = Number(transaction.realizedProfit);

            detail = `
                <small class="${realizedProfit >= 0 ? "positive" : "negative"}">
                    ${realizedProfit >= 0 ? "Realized gain: " : "Realized loss: "}
                    ${formatMoney(Math.abs(realizedProfit))}
                </small>
            `;

        } else if (transaction.description) {

            detail = `
                <small>${escapeDashboardHTML(transaction.description)}</small>
            `;

        }

        return `

            <tr>

                <td>

                    <strong>
                        ${escapeDashboardHTML(transaction.symbol || "Asset")}
                    </strong>

                    ${detail}

                </td>

                <td>

                    <span class="badge ${typeClass}">
                        ${escapeDashboardHTML(type)}
                    </span>

                </td>

                <td>
                    ${formatMoney(transactionTotal)}
                </td>

                <td>
                    ${formattedDate}
                </td>

            </tr>

        `;

    }).join("");

}

// =======================================================
// PORTFOLIO INSIGHTS
// =======================================================

function renderPortfolioInsights() {

    const totals = getPortfolioTotals();

    const holdings = dashboardPortfolio.holdings
        .map(holding => {

            const asset = getDemoAsset(holding.symbol);

            if (!asset) {
                return null;
            }

            const costBasis = getHoldingCost(holding);
            const currentValue = getHoldingValue(holding);

            const profitLoss = currentValue - costBasis;

            const returnPercentage = costBasis > 0
                ? (profitLoss / costBasis) * 100
                : 0;

            return {
                ...holding,
                asset,
                costBasis,
                currentValue,
                profitLoss,
                returnPercentage
            };

        })
        .filter(Boolean);

    // Best-performing holding by percentage return.

    const topHolding = holdings.length
        ? [...holdings].sort(
            (a, b) => b.returnPercentage - a.returnPercentage
        )[0]
        : null;

    const topHoldingElement =
        document.getElementById("insightTopHolding");

    const topReturnElement =
        document.getElementById("insightTopHoldingReturn");

    if (topHoldingElement) {

        topHoldingElement.textContent = topHolding
            ? topHolding.asset.symbol
            : "--";

    }

    if (topReturnElement) {

        topReturnElement.textContent = topHolding
            ? `${topHolding.returnPercentage >= 0 ? "+" : ""}${topHolding.returnPercentage.toFixed(2)}% illustrative return`
            : "No open positions";

        topReturnElement.classList.toggle(
            "positive",
            Boolean(topHolding && topHolding.returnPercentage > 0)
        );

        topReturnElement.classList.toggle(
            "negative",
            Boolean(topHolding && topHolding.returnPercentage < 0)
        );

    }

    // Realized gains from recorded simulated sales.
    // Negative values indicate a net realized demo loss.

    const realizedGains = dashboardTransactions
        .filter(transaction =>
            String(transaction.type).toUpperCase() === "SELL"
        )
        .reduce((total, transaction) => {

            if (Number.isFinite(Number(transaction.realizedProfit))) {
                return total + Number(transaction.realizedProfit);
            }

            // Older transactions may not have recorded cost basis.
            return total;

        }, 0);

    const realizedGainsElement =
        document.getElementById("insightRealizedGains");

    if (realizedGainsElement) {

        realizedGainsElement.textContent =
            formatMoney(realizedGains);

        realizedGainsElement.classList.toggle(
            "positive",
            realizedGains > 0
        );

        realizedGainsElement.classList.toggle(
            "negative",
            realizedGains < 0
        );

    }

    // Cash allocation as a percentage of the total portfolio.

    const cashPercentage = totals.portfolioValue > 0
        ? (totals.cash / totals.portfolioValue) * 100
        : 0;

    const cashAllocationElement =
        document.getElementById("insightCashAllocation");

    if (cashAllocationElement) {

        cashAllocationElement.textContent =
            `${cashPercentage.toFixed(1)}%`;

    }

    // Number of different categories represented by open holdings.

    const categories = new Set(
        holdings.map(holding => holding.asset.category)
    );

    const categoryCountElement =
        document.getElementById("insightCategoryCount");

    if (categoryCountElement) {

        categoryCountElement.textContent = categories.size;

    }

}


// =======================================================
// REFRESH DASHBOARD
// =======================================================

function refreshDashboard() {

    renderDashboardStats();

    renderDashboardMarkets();

    renderDashboardHoldings();

    renderRecentTransactions();

    renderPortfolioInsights();

}


// =======================================================
// TRADE MODAL
// =======================================================

function openTradeModal(symbol, mode = "BUY") {

    const asset = getDemoAsset(symbol);

    if (!asset) {
        return;
    }

    selectedTradeAsset = asset;

    selectedTradeMode = mode;

    const modal = document.getElementById("tradeModal");

    const title = document.getElementById("tradeTitle");
    const assetName = document.getElementById("tradeAssetName");
    const assetSymbol = document.getElementById("tradeAssetSymbol");
    const assetIcon = document.getElementById("tradeAssetIcon");
    const tradePrice = document.getElementById("tradePrice");
    const quantityInput = document.getElementById("tradeQuantity");
    const estimatedTotal = document.getElementById("tradeEstimatedTotal");
    const cashBalance = document.getElementById("tradeCashBalance");
    const tradeMessage = document.getElementById("tradeMessage");
    const buyButton = document.getElementById("tradeBuyButton");
    const sellButton = document.getElementById("tradeSellButton");
    const submitButton = document.getElementById("tradeSubmitButton");

    if (!modal) {
        return;
    }

    if (title) {

        title.textContent = mode === "BUY"
            ? "Buy demo asset"
            : "Sell demo asset";

    }

    if (assetName) {
        assetName.textContent = asset.name;
    }

    if (assetSymbol) {
        assetSymbol.textContent = asset.symbol;
    }

    if (assetIcon) {
        assetIcon.innerHTML = `<i class="${escapeDashboardHTML(asset.icon)}"></i>`;
    }

    if (tradePrice) {
        tradePrice.textContent = formatMoney(asset.price);
    }

    if (quantityInput) {

        quantityInput.value = "";

        quantityInput.max = mode === "SELL"
            ? (getAssetHolding(symbol)?.quantity || 0)
            : "";

    }

    if (estimatedTotal) {
        estimatedTotal.textContent = formatMoney(0);
    }

    if (cashBalance) {
        cashBalance.textContent =
            formatMoney(dashboardPortfolio.cashBalance);
    }

    if (tradeMessage) {
        tradeMessage.textContent = "";
        tradeMessage.style.color = "";
    }

    if (buyButton) {
        buyButton.classList.toggle("active", mode === "BUY");
    }

    if (sellButton) {
        sellButton.classList.toggle("active", mode === "SELL");
    }

    if (submitButton) {

        submitButton.disabled = false;

        submitButton.textContent = mode === "BUY"
            ? "Confirm demo purchase"
            : "Confirm demo sale";

    }

    modal.classList.add("show");

    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add("modal-open");

    if (quantityInput) {
        quantityInput.focus();
    }

}


function closeTradeModal() {

    const modal = document.getElementById("tradeModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("show");

    modal.setAttribute("aria-hidden", "true");

    document.body.classList.remove("modal-open");

    selectedTradeAsset = null;

}


function changeTradeMode(mode) {

    if (!selectedTradeAsset) {
        return;
    }

    openTradeModal(selectedTradeAsset.symbol, mode);

}


function updateTradeEstimate() {

    if (!selectedTradeAsset) {
        return;
    }

    const quantityInput =
        document.getElementById("tradeQuantity");

    const estimate =
        document.getElementById("tradeEstimatedTotal");

    if (!quantityInput || !estimate) {
        return;
    }

    const quantity = Number(quantityInput.value);

    const total = Number.isFinite(quantity) && quantity > 0
        ? quantity * selectedTradeAsset.price
        : 0;

    estimate.textContent = formatMoney(total);

}


// =======================================================
// SIMULATED BUY
// =======================================================

function executeDemoBuy(asset, quantity) {

    const total = asset.price * quantity;

    if (!Number.isFinite(total) || total <= 0) {
        throw new Error("Enter a valid quantity.");
    }

    if (total > dashboardPortfolio.cashBalance + 0.000001) {

        throw new Error(
            "Insufficient demo cash for this simulated purchase."
        );

    }

    let holding = getAssetHolding(asset.symbol);

    if (!holding) {

        holding = {

            symbol: asset.symbol,
            quantity: 0,
            averagePrice: 0,
            firstPurchaseDate: new Date().toISOString()

        };

        dashboardPortfolio.holdings.push(holding);

    }

    const previousCost =
        holding.quantity * holding.averagePrice;

    const newQuantity =
        holding.quantity + quantity;

    const newCost =
        previousCost + total;

    holding.quantity = newQuantity;

    holding.averagePrice = newCost / newQuantity;

    dashboardPortfolio.cashBalance -= total;

    dashboardTransactions.push({

        id: crypto.randomUUID(),
        type: "BUY",
        symbol: asset.symbol,
        name: asset.name,
        quantity,
        price: asset.price,
        total,
        date: new Date().toISOString(),
        simulated: true,
        illustrative: false

    });

    saveDashboardPortfolio();

    saveDashboardTransactions();

}


// =======================================================
// SIMULATED SELL
// =======================================================

function executeDemoSell(asset, quantity) {

    const holding = getAssetHolding(asset.symbol);

    if (!holding || holding.quantity <= 0) {

        throw new Error(
            "You do not have a demo position in this asset."
        );

    }

    if (quantity > holding.quantity + 0.000000001) {

        throw new Error(
            "You cannot sell more units than your demo holding."
        );

    }

    const total = asset.price * quantity;

    const costBasisSold =
        holding.averagePrice * quantity;

    const realizedProfit =
        total - costBasisSold;

    if (!Number.isFinite(total) || total <= 0) {
        throw new Error("Enter a valid quantity.");
    }

    holding.quantity -= quantity;

    dashboardPortfolio.cashBalance += total;

    if (holding.quantity < 0.000000001) {

        dashboardPortfolio.holdings =
            dashboardPortfolio.holdings.filter(
                item => item.symbol !== asset.symbol
            );

    }

    dashboardTransactions.push({

        id: crypto.randomUUID(),
        type: "SELL",
        symbol: asset.symbol,
        name: asset.name,
        quantity,
        price: asset.price,
        total,
        costBasisSold,
        realizedProfit,
        date: new Date().toISOString(),
        simulated: true,
        illustrative: false

    });

    saveDashboardPortfolio();

    saveDashboardTransactions();

}


// =======================================================
// HANDLE TRADE FORM
// =======================================================

function handleDemoTrade(event) {

    event.preventDefault();

    if (!selectedTradeAsset) {
        return;
    }

    const quantityInput =
        document.getElementById("tradeQuantity");

    const message =
        document.getElementById("tradeMessage");

    const submitButton =
        document.getElementById("tradeSubmitButton");

    if (!quantityInput || !message || !submitButton) {
        return;
    }

    const quantity = Number(quantityInput.value);

    if (!Number.isFinite(quantity) || quantity <= 0) {

        message.textContent =
            "Enter a quantity greater than zero.";

        message.style.color = "#ff7185";

        return;

    }

    try {

        if (selectedTradeMode === "BUY") {

            executeDemoBuy(
                selectedTradeAsset,
                quantity
            );

        } else {

            executeDemoSell(
                selectedTradeAsset,
                quantity
            );

        }

        message.textContent =
            selectedTradeMode === "BUY"
                ? "Simulated purchase completed."
                : "Simulated sale completed.";

        message.style.color = "#32d6a0";

        submitButton.disabled = true;

        const cashBalance =
            document.getElementById("tradeCashBalance");

        if (cashBalance) {

            cashBalance.textContent =
                formatMoney(dashboardPortfolio.cashBalance);

        }

        refreshDashboard();

        window.setTimeout(() => {

            closeTradeModal();

            submitButton.disabled = false;

        }, 900);

    } catch (error) {

        message.textContent =
            error.message || "Unable to process demo order.";

        message.style.color = "#ff7185";

    }

}


// =======================================================
// EVENT LISTENERS
// =======================================================

function initializeDashboardEvents() {

    const logoutButton =
        document.getElementById("logoutButton");

    if (logoutButton) {

        logoutButton.addEventListener("click", () => {

            if (typeof logoutDemoUser === "function") {

                logoutDemoUser();

            } else {

                sessionStorage.removeItem("nexora_current_user");

                window.location.href = "login.html";

            }

        });

    }

    const modalClose =
        document.getElementById("modalClose");

    if (modalClose) {
        modalClose.addEventListener("click", closeTradeModal);
    }

    const buyButton =
        document.getElementById("tradeBuyButton");

    if (buyButton) {

        buyButton.addEventListener("click", () => {
            changeTradeMode("BUY");
        });

    }

    const sellButton =
        document.getElementById("tradeSellButton");

    if (sellButton) {

        sellButton.addEventListener("click", () => {
            changeTradeMode("SELL");
        });

    }

    const quantityInput =
        document.getElementById("tradeQuantity");

    if (quantityInput) {

        quantityInput.addEventListener(
            "input",
            updateTradeEstimate
        );

    }

    const tradeForm =
        document.getElementById("tradeForm");

    if (tradeForm) {

        tradeForm.addEventListener(
            "submit",
            handleDemoTrade
        );

    }

    const tradeModal =
        document.getElementById("tradeModal");

    if (tradeModal) {

        tradeModal.addEventListener("click", event => {

            if (event.target.id === "tradeModal") {
                closeTradeModal();
            }

        });

    }

    document.addEventListener("keydown", event => {

        if (event.key === "Escape") {
            closeTradeModal();
        }

    });

}


// =======================================================
// INITIALIZE DASHBOARD
// =======================================================

document.addEventListener("DOMContentLoaded", () => {

    try {

        const accountLoaded = loadDashboardAccount();

        if (!accountLoaded) {
            return;
        }

        renderDashboardUser();

        initializeDashboardEvents();

        refreshDashboard();

    } catch (error) {

        console.error("Dashboard initialization failed:", error);

        const marketContainer =
            document.getElementById("dashboardMarkets");

        if (marketContainer) {

            marketContainer.innerHTML = `

                <p class="allocation-empty">
                    The market panel could not load.
                    Open the browser console for the error details.
                </p>

            `;

        }

    }

});