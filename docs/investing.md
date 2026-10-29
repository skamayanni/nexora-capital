# Customer-directed investing

The selected product model is self-directed stock and cryptocurrency orders: customers choose their own assets and order sizes, without administrator approval. An investment page is available at `invest.html`, linked from Overview, Markets, Profile, Portfolio and Transactions.

## Implemented now

Customers can browse an explicitly labelled example catalogue, choose buy or sell, prepare a market-order draft, review it, and save or discard it. Buy drafts support USD amounts or units; sell drafts use units. Quotes, fees, quantities for a USD amount, market availability, and tradability are not invented. The catalogue is not a brokerage-approved asset list.

Drafts are stored in SQLite, scoped to the signed-in customer. Retried saves use idempotency keys. Customer-provided account IDs and balances are never trusted. Admin users must use a separate customer account to prepare drafts. Each customer can keep up to 100 drafts. Saving a draft does not place, reserve, fund, buy, sell, or transfer anything. Drafts will never be submitted automatically when a provider is later connected.

The page separately displays the recorded ledger balance, unavailable brokerage buying power, saved drafts, and an empty placed-order section. Actual execution is blocked on both client and server. There are no live trading credentials, real quotes, fake fills, invented returns, or synthetic positions.

| API | Access and behavior |
| --- | --- |
| `GET /api/trading` | Signed in; catalogue, connection status, own latest drafts, no quotes/positions/orders |
| `POST /api/trading/drafts` | Customer; `symbol`, `side`, `sizing`, decimal-string `size`, `orderType: market`; CSRF and `Idempotency-Key` required |
| `POST /api/trading/drafts/:id/discard` | Customer owning that draft; CSRF required |
| `POST /api/trading/orders` | Signed in and CSRF protected; rejects execution because brokerage is not connected |

The additive database update creates `order_drafts` and advances the schema to version 2. Existing users, sessions, ledger entries, and audit records remain. Tests exercise migration from a database with existing balances/history. Back up the persistent database according to your operating procedure before upgrades; never delete or recreate the database to install this feature.

## Deploy this update

Vercel and Render are separate deployments. Vercel follows `main`; the existing Render service follows `feat/server-accounts-admin` with automatic application deployments disabled. The update must be available on both branches.

1. On Render, open `nexora-capital-backend` → **Manual Deploy → Deploy latest commit**. Confirm the selected commit is the new investing update. Keep the existing environment variables and persistent disk. A normal restart applies the additive schema update.
2. Wait for Render to show **Live** and its health check to pass.
3. Wait for the corresponding Vercel production deployment to show **Ready**.
4. Use a customer account to open `https://nexoracapitalinc.vercel.app/invest.html`. Admin accounts can view the page but cannot create customer drafts.
5. Save and discard a disposable draft; verify the recorded balance and ledger remain unchanged. Confirm Place order stays disabled.

The frontend detects an older backend and explains that a Render update is needed. Existing account/admin features continue to work during this rollout. No Render credentials are available to the agent, so a push alone does not establish a successful backend deployment.

## Still required for actual orders

No brokerage provider account is connected. Actual order placement cannot be completed until the platform has the provider's approved business arrangement, sandbox credentials, per-customer account onboarding, and the required live permissions. Keys must be entered through secure deployment configuration, never chat or source code. Account verification and trade eligibility must come from the provider.

The remaining integration must fetch authoritative tradable assets, live quotes, settled funds, buying power and holdings; validate order sizes and market rules; submit with provider idempotency; record acknowledgements, partial fills, fills, rejections and cancellations; verify signed events; and reconcile positions and cash. Administrative ledger credits must not create provider buying power. Starting with the provider's sandbox does not authorize live orders or receipt of customer funds.

The feature delivered here is order preparation with persisted drafts. It is not a functioning brokerage connection or permission to accept real funds.
