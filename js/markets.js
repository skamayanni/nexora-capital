"use strict";


// ================================================
// NEXORA CAPITAL — MARKETS PAGE
// ================================================

let activeMarketCategory = "all";
let marketSearchQuery = "";
let marketSortOption = "default";


// ================================================
// CATEGORY LABELS
// ================================================

const MARKET_CATEGORY_LABELS = {
    crypto: "Crypto",
    stocks: "Stocks",
    energy: "Oil & Gas",
    petroleum: "Petroleum"
};


// ================================================
// RENDER MARKET COUNTS
// ================================================

function renderMarketCounts() {
    const counts = {
        crypto: NEXORA_MARKETS.filter(
            asset => asset.category === "crypto"
        ).length,

        stocks: NEXORA_MARKETS.filter(
            asset => asset.category === "stocks"
        ).length,

        energy: NEXORA_MARKETS.filter(
            asset => asset.category === "energy"
        ).length,

        petroleum: NEXORA_MARKETS.filter(
            asset => asset.category === "petroleum"
        ).length
    };

    document.getElementById("cryptoAssetCount").textContent =
        `${counts.crypto} assets`;

    document.getElementById("stocksAssetCount").textContent =
        `${counts.stocks} assets`;

    document.getElementById("energyAssetCount").textContent =
        `${counts.energy + counts.petroleum} assets`;
}


// ================================================
// FILTER AND SORT MARKET DATA
// ================================================

function getFilteredMarketAssets() {
    let assets = [...NEXORA_MARKETS];

    // Category filter
    if (activeMarketCategory !== "all") {
        assets = assets.filter(
            asset => asset.category === activeMarketCategory
        );
    }

    // Search filter
    if (marketSearchQuery) {
        const query = marketSearchQuery.toLowerCase();

        assets = assets.filter(asset => {
            return (
                asset.name.toLowerCase().includes(query) ||
                asset.symbol.toLowerCase().includes(query) ||
                asset.category.toLowerCase().includes(query)
            );
        });
    }

    // Sorting
    switch (marketSortOption) {
        case "name-asc":
            assets.sort((a, b) => a.name.localeCompare(b.name));
            break;

        case "price-high":
            assets.sort((a, b) => b.price - a.price);
            break;

        case "price-low":
            assets.sort((a, b) => a.price - b.price);
            break;

        case "change-high":
            assets.sort((a, b) => b.change - a.change);
            break;

        case "change-low":
            assets.sort((a, b) => a.change - b.change);
            break;
    }

    return assets;
}


// ================================================
// RENDER MARKETS TABLE
// ================================================

function renderMarketsTable() {
    const tableBody = document.getElementById("marketsTableBody");

    const emptyState = document.getElementById("marketEmptyState");

    const resultCount = document.getElementById("marketResultsCount");

    const assets = getFilteredMarketAssets();

    if (!assets.length) {
        tableBody.innerHTML = "";

        emptyState.hidden = false;

        resultCount.textContent = "No matching assets";

        return;
    }

    emptyState.hidden = true;

    tableBody.innerHTML = assets.map(asset => {
        const changeClass = asset.change >= 0
            ? "positive"
            : "negative";

        const changeSign = asset.change > 0 ? "+" : "";

        const holding = getAssetHolding(asset.symbol);

        const positionQuantity = holding
            ? holding.quantity
            : 0;

        const positionValue = holding
            ? getHoldingValue(holding)
            : 0;

        return `
            <tr>

                <td>
                    <div class="table-asset">

                        <span class="asset-icon ${asset.iconClass}">
                            <i class="${asset.icon}"></i>
                        </span>

                        <span>
                            <strong>
                                ${escapeDashboardHTML(asset.name)}
                            </strong>

                            <small>
                                ${escapeDashboardHTML(asset.symbol)}
                            </small>
                        </span>

                    </div>
                </td>

                <td>
                    <span class="market-category-label">
                        ${MARKET_CATEGORY_LABELS[asset.category]}
                    </span>
                </td>

                <td>
                    <strong>${formatMoney(asset.price)}</strong>
                </td>

                <td>
                    <span class="market-change ${changeClass}">
                        ${changeSign}${asset.change.toFixed(2)}%
                    </span>
                </td>

                <td>
                    <div class="market-position-cell">

                        <strong>
                            ${formatQuantity(positionQuantity)}
                        </strong>

                        <small>
                            ${formatMoney(positionValue)}
                        </small>

                    </div>
                </td>

                <td>
                    <button
                        type="button"
                        class="small-action-button"
                        data-market-buy="${escapeDashboardHTML(asset.symbol)}"
                    >
                        Record allocation
                    </button>
                </td>

            </tr>
        `;
    }).join("");

    resultCount.textContent =
        `Showing ${assets.length} of ${NEXORA_MARKETS.length} illustrative assets`;

    // Attach the simulated trading modal to each asset.
    tableBody.querySelectorAll("[data-market-buy]").forEach(button => {
        button.addEventListener("click", () => {
            openTradeModal(button.dataset.marketBuy, "BUY");
        });
    });
}


// ================================================
// CATEGORY FILTER EVENTS
// ================================================

function initializeMarketFilters() {
    const filterButtons = document.querySelectorAll(
        "#marketFilters [data-category]"
    );

    filterButtons.forEach(button => {
        button.addEventListener("click", () => {
            activeMarketCategory = button.dataset.category;

            filterButtons.forEach(item => {
                item.classList.toggle(
                    "active",
                    item === button
                );
            });

            renderMarketsTable();
        });
    });
}


// ================================================
// SEARCH AND SORT EVENTS
// ================================================

function initializeMarketSearch() {
    const searchInput = document.getElementById("marketSearch");

    const sortSelect = document.getElementById("marketSort");

    searchInput.addEventListener("input", event => {
        marketSearchQuery = event.target.value.trim();

        renderMarketsTable();
    });

    sortSelect.addEventListener("change", event => {
        marketSortOption = event.target.value;

        renderMarketsTable();
    });

    document.getElementById("clearMarketFilters").addEventListener(
        "click",
        () => {
            activeMarketCategory = "all";
            marketSearchQuery = "";
            marketSortOption = "default";

            searchInput.value = "";
            sortSelect.value = "default";

            document.querySelectorAll(
                "#marketFilters [data-category]"
            ).forEach(button => {
                button.classList.toggle(
                    "active",
                    button.dataset.category === "all"
                );
            });

            renderMarketsTable();
        }
    );
}


// ================================================
// MARKETS PAGE INITIALIZATION
// ================================================

document.addEventListener("account-ready", () => {
    /*
    dashboard.js initializes the logged-in account,
    portfolio, demo prices, and trade modal.
    */

    if (!dashboardUser || !dashboardPortfolio) {
        return;
    }

    renderDashboardUser();

    renderMarketCounts();

    initializeMarketFilters();

    initializeMarketSearch();

    renderMarketsTable();

    /*
    Refresh the market position column after each
    simulated purchase or sale.
    */

    const originalRefreshDashboard = refreshDashboard;

    refreshDashboard = function () {
        originalRefreshDashboard();

        renderMarketsTable();
    };
});
