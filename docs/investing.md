# Recorded customer allocations

The customer has selected **recorded allocations**, not simulated purchases or brokerage execution. Customers choose a stock or cryptocurrency and record an exact USD amount themselves. Administrator approval is not required. Every allocation is labelled **Recorded allocation — purchase not verified**. Neither purchase, custody, ownership, units, market value nor investment returns are claimed.

## Customer workflow

1. Open `invest.html` from the customer dashboard or Markets.
2. Choose a stock or cryptocurrency and enter an amount in USD.
3. Review the asset, exact amount and available balance after the proposed allocation.
4. Explicitly acknowledge that asset purchase/ownership have not been verified and confirm the allocation.
5. The server atomically deducts the amount from the available recorded balance, creates the allocation, and writes an immutable ledger event and audit entry.
6. The allocation appears on Invest, Portfolio and Overview with its asset, USD amount, date and verification label. The administrator can view the same record and history.

The total recorded balance equals the available recorded balance plus active recorded allocations. For example, allocating $165.01 from a recorded balance of $1,000.00 leaves $834.99 available and $165.01 allocated; the total remains $1,000.00. This is internal bookkeeping, not movement to an exchange or proof of receipt/custody of real money. Administrative debits can only deduct available recorded balance, not allocated amounts. The total account limit includes active allocations.

Customers can release an allocation back to the available recorded balance. Release returns the original amount exactly once, without a sale, profit, fee or withdrawal. The allocation record remains visible as released, and the immutable release event remains in history. Customers cannot release other customers' allocations. A suspended account cannot create or release allocations until reactivated.

## Accounting and safeguards

All amounts are stored in integer cents. Creation, available-balance changes, event links, and audit records commit in a single SQLite transaction. Concurrent requests cannot overdraw. Creation requires an idempotency key scoped to the customer; repeating the same request returns the original record. A conflicting reuse is rejected. Releases are intrinsically idempotent by allocation ID, so an uncertain response can be retried without returning the amount twice.

If the browser cannot confirm a creation response, it retains the request identifier and offers Retry. It prevents editing that uncertain request into a new one until a definitive response is received. After a page reload, customers should check allocation history before starting another record. All authorization, acknowledgement, amount and availability checks are enforced on the server as well as in the UI.

Allocation records cannot be edited or deleted through the API. Their identifying financial fields and ledger/event/audit rows have database immutability triggers. As with the existing ledger, the database owner can still alter the database/schema; these controls are not tamper-proof external custody verification.

## API

Every endpoint uses the existing HttpOnly session cookie. Mutations require the exact configured Origin and a valid CSRF token.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/trading` | Own allocation summary, allocation history, catalogue and legacy drafts; real quotes/orders remain unavailable |
| `POST /api/trading/allocations` | Customer only; JSON `symbol`, decimal-string `amount`, `acknowledgement: purchase_not_verified`; requires `Idempotency-Key` |
| `POST /api/trading/allocations/:id/release` | Owning customer only; releases the original amount once and retains history |
| `GET /api/account` | Available/allocated/total recorded balances, own allocation history and ledger events |
| `GET /api/admin/users/:id` | Admin access to that customer's balances, allocation history and audit events |
| `POST /api/trading/orders` | Rejects actual trading because no execution provider is connected |

The record status is `recorded` or `released`. Verification remains `purchase_not_verified` in both cases. The catalogue associates records with asset names/symbols only and contains no live prices. Allocation endpoints accept USD amounts, not fictional stock/coin quantities. Invest and Portfolio show the latest 500 allocation records; totals include all active allocations.

## Existing drafts and data

Earlier order drafts remain in the database without deductions or automatic conversion. The Invest page places them under “Previous order drafts.” Customers can use a prior USD buy draft to prefill an allocation, then review and confirm it separately. Unit-sized or sell drafts require a new USD amount because no exchange quote is fabricated. Legacy draft endpoints remain available for compatibility. Admin accounts must use a separate customer login to create their own allocations.

The additive version 3 schema creates `recorded_allocations` and `allocation_events`; it preserves users, passwords, sessions, ledger entries, audit records and prior drafts. No balances change during migration. Existing balances change only when customers explicitly confirm an allocation or release. Migration and persistence are covered by tests.

## Deployment

The existing Vercel site deploys from `main`; the Render backend deploys from `feat/server-accounts-admin` with automatic application deploys disabled. Publish the update to both branches, then:

1. Follow the established backup procedure for the persistent database. Do not delete, reseed, recreate or detach the disk.
2. On Render, open **nexora-capital-backend → Manual Deploy → Deploy latest commit**. Keep the current environment variables and disk. Wait for **Live**.
3. Wait for Vercel's latest production deployment to show **Ready**.
4. Sign in as a customer and refresh `https://nexoracapitalinc.vercel.app/invest.html`.
5. Verify an allocation is clearly labelled and that the exact amount moves between available and allocated. Check Portfolio, Overview, customer history and the admin view. A release must restore only the original amount and retain its history.

The page detects an older backend and requests a Render update rather than pretending the allocation succeeded. The agent has no Render deployment credentials, so GitHub publication does not establish backend deployment success.

## Real assets

Recorded allocations work without connecting a brokerage, because they do not execute a trade. Actual asset purchases or assertions of ownership still require a real execution/custody process and supporting evidence. Payment processing, stock/crypto execution, verified holdings and investment returns remain outside this feature. Do not relabel these records as verified purchases merely because an amount was deducted internally.
