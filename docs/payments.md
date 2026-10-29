# Payment integration requirements

## Confirmed scope

- Operating country: United States.
- Customer ledger and account currency: USD.
- Intended investments: both stocks and cryptocurrency, through an approved brokerage/custody arrangement.
- Intended funding methods: bank transfer and cryptocurrency, with cryptocurrency converted/settled into USD before crediting the USD account ledger. No customer cryptocurrency balances are planned.
- No provider accounts have been opened yet; provider selection assistance is requested.
- Account management and audited manual adjustments already exist.
- No payment provider, bank account, wallet address, live deposit endpoint, or withdrawal endpoint is configured. Manual balance adjustments remain separate from confirmed deposits.

## Decisions needed before provider-specific implementation

1. Approved business provider accounts for bank transfers and cryptocurrency payments, with acceptance of this investment business model. Do not assume a generic merchant account supports funding investment accounts or custody.
2. Whether bank transfers use ACH, wire transfer, or both, according to provider capabilities.
3. Which cryptocurrency assets/networks the USD-conversion provider supports, and whether it can settle USD directly to the designated bank/brokerage arrangement for this business model. The customer has selected conversion to USD; do not create crypto-denominated balances.
4. For cryptocurrency: supported assets/networks and provider handling of confirmations, underpayment, overpayment, wrong-network payments, fees, expiry and refunds. Never generate a placeholder deposit address.
5. Brokerage/custody provider for actual investments. Payment acceptance alone does not implement investment execution or asset custody.

Use provider sandboxes first. Store credentials through secure deployment configuration after providers are chosen; never put them in source code or chat. Provider documentation determines whether credentials must be available to the local SDK or can use a supported outbound authentication binding.

## Required payment behavior

Create each funding request on the server for the authenticated customer. Store the provider reference, internal customer ID, requested amount/currency, funding method and lifecycle state. Use idempotency for request creation and settlement processing. Return only the provider-issued checkout URL or verified transfer instructions assigned to that funding request.

The browser success screen, uploaded receipt, transaction hash supplied by the customer, and an admin button cannot establish settlement. Verify signed provider events against the raw request body, validate the receiving account and amount/currency, and reconcile them with the provider's authoritative payment record. Store provider event IDs with uniqueness constraints so retries cannot credit twice. Associate payments through server-owned references rather than an email or customer ID from the browser.

Track initiated, pending, settled, failed and reversed outcomes according to the provider's actual lifecycle. Pending funds must not appear as settled or withdrawable. ACH availability and return risk require the provider's settlement/availability policy; receiving an initial event is not proof of final settlement. For cryptocurrency converted to USD, credit the authoritative USD settlement amount under an explicit fee policy, not a browser-supplied price estimate.

A confirmed settlement must atomically produce the payment state change and an attributable ledger event. Provider deposits, manual admin adjustments, reversals, fees and withdrawals need distinct ledger types and an accounting reconciliation model. Correct reversals with compensating entries, preserving original history. Do not relabel existing manual credits as provider-verified deposits.

Withdrawal implementation is a separate flow requiring verified beneficiary details, authorization, availability checks, durable balance reservations, idempotent provider submission and release/settlement handling. It must never use the existing admin debit endpoint as evidence that money was sent.

## Implementation boundary

Existing server endpoints support accounts, manual administrative adjustments and explicitly unverified recorded allocations. Internal allocation deductions do not establish receipt of funds, execution or ownership. Selecting a provider is a prerequisite to implementing and testing its checkout/transfer instructions, signed webhook verification, settlement handling and real payments. The current build must not accept real customer funds until these capabilities and operational controls are implemented and verified.

## Provider selection status

The following are evaluation candidates, not confirmed integrations, current eligibility findings, or instructions to open accounts before approval:

| Candidate | Role to investigate | Questions that must be confirmed |
| --- | --- | --- |
| Alpaca Broker API | Embedded brokerage/customer accounts and permitted ACH/wire funding | Supported investments, US business/customer eligibility, required regulatory/business arrangement, custody and funding options |
| Circle Mint | Business USDC-to-USD settlement route | Business approval, accepted networks, redemption/settlement arrangement, whether this investment funding use case is allowed; this is not a general Bitcoin payment checkout |
| BitPay | Alternative merchant crypto-payment route with fiat settlement | Whether investment-account funding is permitted at all, accepted assets/networks, USD settlement and refund policies; do not assume generic merchant eligibility |

Official starting points: https://docs.alpaca.markets/docs/about-broker-api , https://www.circle.com/mint , https://www.bitpay.com/business . Provider terms and fees have not been verified against current official documentation: the environment's network policy denied those destinations during research. Specific documentation domains have been proposed in the environment configuration draft; saving the draft does not itself apply network access. Do not treat this shortlist as a current availability guarantee.

Choose the investment/custody arrangement first. A merchant payment gateway alone does not provide brokerage accounts or authorize investment-account funding. The customer has confirmed both stocks and cryptocurrency. Alpaca Broker API is the first candidate to evaluate for this combined product; support, eligibility, custody, crypto-to-USD funding rules and any separate agreements must be verified with the provider. Verify provider approval for that business model before selecting a payment integration or coding a live flow. No provider has been selected or approved yet.

## Intended customer flow

1. Register a platform account, then complete the brokerage/provider-required identity verification before funding or trading is enabled.
2. Link the customer to a provider-held account with server-owned identifiers and an explicit onboarding status.
3. Offer the provider-approved bank transfer method and, only if approved, a crypto funding route that converts to USD. Keep settlement pending until the authoritative provider status allows funds to become available.
4. Display recorded balance, settled funds, reserved funds and buying power separately. Manual administrative adjustments must not automatically create provider buying power.
5. Place stock/crypto orders through the approved execution provider using available buying power; persist provider orders, fills and positions. Investment holdings may be crypto-denominated even though funding settlement and the cash ledger use USD.
6. Use verified provider events and reconciliation to update the account. Show order/settlement failures explicitly and do not synthesize profits or fill data.

The existing single cash-balance field is an administrative ledger foundation. Provider integration must add these distinct states and reconcile them; it must not simply connect the current admin credit endpoint to an order button.
