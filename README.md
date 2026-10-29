# Nexora Capital

A Node.js backend now serves the existing frontend and stores accounts, profiles, sessions, recorded USD balances, and administrative history in SQLite. New registrations start with **zero balance, no investments, and no history**. Browser localStorage accounts are not imported or trusted.

## Hosting on Vercel

Your public site is https://nexoracapitalinc.vercel.app/. Follow the [Vercel + Render deployment guide](docs/deployment.md) to run the frontend on Vercel and the database-backed API on a persistent Render service. The configuration files are prepared; no live deployment has been performed.

## Run locally

Requires **Node.js 24.x**, including its built-in `node:sqlite` module. There are no external runtime packages to install.

```sh
cd /workspace/nexora-capital
npm start
```

The server listens on `127.0.0.1:3000` by default. Open the site through this backend, rather than a static server or `file://`. `npm run dev` enables Node's file watcher. `npm test` runs the backend integration tests using temporary databases; it never changes the application database.

The database defaults to `.data/nexora.sqlite`, an ignored, private local directory. Data persists across server restarts. Production hosting must provide a persistent disk; an ephemeral deployment filesystem will lose accounts. Keep the SQLite database and its WAL consistent when backing up: use SQLite's backup mechanism or stop the service before copying the database. Store backups encrypted and test restoration. SQLite is intended here for one application instance on one host, not multiple replicas sharing a file.

## Create the first administrator

There is no default administrator or password, public signup cannot create admins, and admins cannot credit their own accounts. On the server, use a unique password supplied through a protected process environment:

```sh
export ADMIN_EMAIL='you@example.com'
export ADMIN_FIRST_NAME='Your'
export ADMIN_LAST_NAME='Name'
read -rsp 'Admin password (12–128 characters): ' ADMIN_PASSWORD
printf '\n'
export ADMIN_PASSWORD
npm run create-admin
unset ADMIN_PASSWORD
```

The CLI uses the same `DATABASE_PATH` as the app. It refuses to promote or overwrite an existing email. Login through `login.html`; administrators land on `admin.html`. Keep administrator credentials private. No admin is automatically seeded by running tests or starting the app.

## Customer and administrator workflows

- Registration and login use server validation, salted scrypt password hashes, eight-hour server sessions, HttpOnly SameSite cookies, CSRF protection, same-origin writes, and basic login throttling. Session tokens are stored hashed in the database.
- Customers can view their own profile, balance, portfolio status, and adjustment history. An unrelated customer's records are never returned by the customer API. The overview refreshes from the server every 15 seconds while visible; other account pages refresh on navigation/reload.
- Administrators can search accounts, edit customer names and emails, suspend/reactivate accounts, and review balance history and audit records. Email changes and suspensions revoke customer sessions. Concurrent profile edits require a reload rather than silently overwriting changes. Administrator records cannot be edited through this dashboard.
- Credit/debit adjustments require an amount, reason/external reference, and a review/confirm step. Amounts use integer USD cents. Database transactions prevent overdraw; an idempotency identifier prevents a retried request being applied twice. A failed or uncertain response retains its identifier for Retry. Do not cancel and create a new request until you have checked history for the original adjustment.
- Balance updates, the ledger record, and the audit event commit together. Entries cannot be edited or deleted through the API or ordinary database statements; correct mistakes with a new, explained adjustment. Each entry records the administrator, customer, amount, resulting balance, timestamp, and reason. A database owner can still alter the schema/file, so this is not tamper-proof external auditing.
- Public frontend demo data is not migrated. Existing locally stored demo accounts must register again. Synthetic trading and payment flows are disabled for authenticated accounts. Sample market prices are explicitly illustrative.

## Configuration

Set these in the process environment; `.env.example` documents defaults but files are **not loaded automatically**.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `3000` | HTTP port |
| `PUBLIC_ORIGIN` | `http://127.0.0.1:3000` | Exact browser origin, including port; all writes must match |
| `DATABASE_PATH` | `.data/nexora.sqlite` | Persistent database path, relative to the working directory or absolute |
| `NODE_ENV` | unset | Set `production` for Secure cookies and HTTPS enforcement |

For another local port, change **both** `PORT` and `PUBLIC_ORIGIN`. Use one consistent hostname; `localhost` and `127.0.0.1` are different origins. For hosting behind an HTTPS reverse proxy, set `NODE_ENV=production` and the actual HTTPS `PUBLIC_ORIGIN`; the app refuses a production HTTP origin. Bind externally only when required by your hosting platform. The backend does not trust forwarded IP headers; configure additional login protection at the reverse proxy for production traffic. Serve only through the Node server: it restricts static files to public HTML and asset directories, keeping server code and databases private.

## API

All mutations accept JSON and require an exact matching `Origin`. Authenticated mutations also require `X-CSRF-Token` from login or `GET /api/session`. Authentication uses the session cookie, never an account ID supplied by the browser.

| Method and path | Access | Result |
| --- | --- | --- |
| `POST /api/register` | Public | New zero-balance customer and session (`firstName`, `lastName`, `email`, `password`) |
| `POST /api/login` | Public | Session (`email`, `password`) |
| `GET /api/session` | Signed in | Current user and CSRF token |
| `POST /api/logout` | Signed in | Revoke current session |
| `GET /api/account` | Signed in | Own profile, balance, and full adjustment history |
| `GET /api/admin/users?q=...` | Admin | Up to 200 matching accounts |
| `GET /api/admin/users/:id` | Admin | Profile, ledger, latest 200 audit events |
| `PATCH /api/admin/users/:id` | Admin | Edit `firstName`, `lastName`, `email`, `status`, with current integer `version` |
| `POST /api/admin/users/:id/adjustments` | Admin | Adjust using decimal-string `amount`, `direction` (`credit`/`debit`), and `reason`; requires unique `Idempotency-Key` header |
| `GET /api/health` | Public | Process readiness |

## Real-money scope

This is a working **account-management and administrative ledger foundation**, not a complete money-handling or investment platform. A credit is an internal adjustment; it does not receive, settle, safeguard, or verify customer funds. No deposits, withdrawals, trading execution, real holdings, or investment returns are connected. The confirmed operating context is the United States with USD account balances. Intended funding methods are bank transfer and cryptocurrency; provider selection remains pending, and cryptocurrency payments must convert/settle to USD before crediting customer balances. The intended investments are both stocks and cryptocurrency. No provider accounts are currently available.

Before accepting customer money, the next implementation needs approved bank-transfer and cryptocurrency payment providers, plus the brokerage/custody arrangement for investments. See [Payment integration requirements](docs/payments.md). That integration must verify signed webhooks, track settlement states, reconcile ledger entries to provider records, and handle refunds/reversals without editing history. Production launch also needs administrator MFA and recovery, appropriate account verification, operational access controls, reviewed deployment security, and tested backups. Regulatory and custody requirements depend on the jurisdiction and business model. Do not treat this development build as ready to accept real funds.

## Validation

`npm test` covers fresh accounts, authorization, CSRF/origin protection, hashed passwords, logout, exact-money arithmetic, negative-balance rejection, idempotency, simultaneous debit attempts, profile conflicts, suspension, email-change session revocation, persistence, ledger reconciliation, private-file access, and authentication throttling. Headless Chromium validation additionally exercised registration, admin/customer separation, credit/debit confirmation, profile editing, customer-visible history, market browsing with trading disabled, and suspension on desktop/mobile layouts.
