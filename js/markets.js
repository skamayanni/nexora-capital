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
                        Trade Live
                    </button>
                </td>

            </tr>
        `;
    }).join("");

    resultCount.textContent =
        `Showing ${assets.length} of ${NEXORA_MARKETS.length} live assets`;

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

document.addEventListener("DOMContentLoaded", () => {
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


/* ==========================================
NEXORA CAPITAL — DEMO PAYMENT OPTIONS
========================================== */

document.addEventListener("DOMContentLoaded", function () {
    const paymentModal = document.getElementById("paymentOptionsModal");
    const closeButton = document.getElementById("paymentModalClose");
    const paymentInstructions = document.getElementById("paymentInstructions");
    const paymentInstructionsTitle = document.getElementById("paymentInstructionsTitle");
    const paymentInstructionsDescription = document.getElementById("paymentInstructionsDescription");
    const paymentDemoConfirm = document.getElementById("paymentDemoConfirm");


    if (!paymentModal) return;

    let selectedPaymentMethod = "";

    function openPaymentOptions() {
        const assetSymbol = document.getElementById("tradeAssetSymbol");
        const quantityInput = document.getElementById("tradeQuantity");

        const symbol = assetSymbol?.textContent?.trim() || "";
        const quantity = Number(quantityInput?.value || 0);

        const asset = typeof getDemoAsset === "function"
            ? getDemoAsset(symbol)
            : null;

        const assetName = asset
            ? `${asset.name} (${asset.symbol})`
            : (symbol || "Selected asset");

        const purchaseAmount = asset && Number.isFinite(quantity) && quantity > 0
            ? asset.price * quantity
            : 0;

        document.getElementById("paymentAssetName").textContent = assetName;
        document.getElementById("paymentPurchaseAmount").textContent =
            typeof formatMoney === "function"
                ? formatMoney(purchaseAmount)
                : `$${purchaseAmount.toFixed(2)}`;

        paymentInstructions.hidden = true;
        selectedPaymentMethod = "";

        paymentModal.classList.add("active");
        paymentModal.setAttribute("aria-hidden", "false");
    }

    function closePaymentOptions() {
        paymentModal.classList.remove("active");
        paymentModal.setAttribute("aria-hidden", "true");
    }

    /*
       Intercept the existing demo purchase confirmation.
       This opens the payment choices instead of immediately
       submitting the purchase.
    */
    // Open payment options only when the user confirms the demo purchase.
    const tradeForm = document.getElementById("tradeForm");

    if (tradeForm) {
        tradeForm.addEventListener("submit", function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();

            openPaymentOptions();
        }, true);
    }


    document.querySelectorAll("[data-payment-method]").forEach(function (button) {
        button.addEventListener("click", function () {
            selectedPaymentMethod = button.dataset.paymentMethod;

            paymentInstructions.hidden = false;

            if (selectedPaymentMethod === "crypto") {
                paymentInstructionsTitle.textContent = "Cryptocurrency";
                paymentInstructionsDescription.textContent =
                    "In a live service, this section would display verified payment instructions from the payment provider. No wallet address or transfer is required in this demonstration.";
            } else {
                paymentInstructionsTitle.textContent = "Bank Transfer";
                paymentInstructionsDescription.textContent =
                    "In a live service, this section would display verified bank payment instructions from the payment provider. No bank transfer is required in this demonstration.";
            }

            paymentInstructions.scrollIntoView({
                behavior: "smooth",
                block: "nearest"
            });
        });
    });

    if (closeButton) {
        closeButton.addEventListener("click", closePaymentOptions);
    }

    paymentModal.addEventListener("click", function (event) {
        if (event.target === paymentModal) {
            closePaymentOptions();
        }
    });

    if (paymentDemoConfirm) {
        paymentDemoConfirm.addEventListener("click", function () {
            if (!selectedPaymentMethod) {
                alert("Please choose a payment method first.");
                return;
            }

            closePaymentOptions();

            alert(
                "Demo checkout complete. No payment was collected and no real transaction was made."
            );
        });
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closePaymentOptions();
        }
    });


});
