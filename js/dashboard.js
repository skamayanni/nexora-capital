"use strict";

/* Customer balances and history are fetched from the authenticated backend.
   Market prices below are illustrative only; trading is disabled. */

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
let dashboardRecordedAllocations = [];

let selectedTradeAsset = null;
let selectedTradeMode = "BUY";


// =======================================================
// STORAGE HELPERS
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
        portfolioValue: cash + investedValue + (Number(dashboardPortfolio.allocatedBalance) || 0),
        allocatedValue: Number(dashboardPortfolio.allocatedBalance) || 0,
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

async function loadDashboardAccount() {
    await requireSession();
    const data = await apiRequest('/api/account');
    dashboardUser = data.user;
    dashboardPortfolio = data.portfolio;
    dashboardTransactions = data.transactions;
    dashboardRecordedAllocations = data.recordedAllocations || [];
    return true;
}

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
        investedValue.textContent = formatMoney(totals.allocatedValue);
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
                "invest.html?asset=" +
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
                    No open positions are available.
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
    const chart = document.getElementById('portfolioChart');
    if (chart) {
        chart.hidden = true;
        chart.style.display = 'none';
        if (!document.getElementById('chartUnavailable')) {
            const note = document.createElement('p');
            note.id = 'chartUnavailable';
            note.textContent = 'Investment performance will appear after a brokerage integration is connected.';
            chart.after(note);
        }
    }
}

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
                No open positions.
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
                    No account adjustments yet.
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

function renderRecordedAllocations() {
    const body=document.getElementById('dashboardRecordedAllocations');
    if(!body) return;
    body.replaceChildren();
    const active=dashboardRecordedAllocations.filter(allocation=>allocation.status==='recorded');
    for(const allocation of active) {
        const row=document.createElement('tr');
        for(const value of [`${allocation.name} (${allocation.symbol})`,formatMoney(allocation.amount),new Date(allocation.createdAt).toLocaleDateString(),'Recorded allocation — purchase not verified']) {
            const cell=document.createElement('td');cell.textContent=value;row.append(cell);
        }
        body.append(row);
    }
    if(!active.length) {const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=4;cell.textContent='No active recorded allocations among the latest 500 records.';row.append(cell);body.append(row);}
}
function refreshDashboard() {
    renderRecordedAllocations();

    renderDashboardStats();

    renderDashboardMarkets();

    renderDashboardHoldings();

    renderRecentTransactions();

    renderPortfolioInsights();

}


// =======================================================
// TRADE MODAL
// =======================================================

function openTradeModal(symbol) {
    window.location.href = 'invest.html?asset=' + encodeURIComponent(symbol || '');
}
function initializeDashboardEvents() {
    document.getElementById('logoutButton')?.addEventListener('click', logoutUser);
}

// INITIALIZE DASHBOARD
// =======================================================

document.addEventListener("DOMContentLoaded", async () => {

    try {

        const accountLoaded = await loadDashboardAccount();

        if (!accountLoaded) {
            return;
        }

        renderDashboardUser();

        initializeDashboardEvents();

        refreshDashboard();
        document.dispatchEvent(new Event('account-ready'));
        // Refresh balances from the server when returning to the page and periodically.
        let refreshing = false;
        async function synchronizeAccount() {
            if (document.hidden || refreshing) return;
            refreshing = true;
            try {
                const data = await apiRequest('/api/account');
                dashboardUser = data.user;
                dashboardPortfolio = data.portfolio;
                dashboardTransactions = data.transactions;
                dashboardRecordedAllocations = data.recordedAllocations || [];
                renderDashboardUser();
                refreshDashboard();
                document.getElementById('accountLoadStatus')?.remove();
            } catch (error) {
                if (error.status === 401) window.location.replace('login.html');
                else showAccountLoadError('Account updates are unavailable. Displayed balances may be out of date.');
            } finally { refreshing = false; }
        }
        window.setInterval(synchronizeAccount, 15000);
        document.addEventListener('visibilitychange', synchronizeAccount);

    } catch (error) {

        if (error.status !== 401) showAccountLoadError('Unable to load your account. Please reload to try again.');
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
function showAccountLoadError(message) {
    let element = document.getElementById('accountLoadStatus');
    if (!element) {
        element = document.createElement('p');
        element.id = 'accountLoadStatus';
        element.setAttribute('role', 'alert');
        document.querySelector('main')?.prepend(element);
    }
    element.textContent = message;
}
