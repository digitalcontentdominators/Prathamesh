# Sai Samarth Trading Company — Mobile Web App Build Prompts

Paste Prompt 1 into your app builder. After it creates a working application, use Prompts 2, 3 and 4 in that order. These prompts request a real business application with persistent records. They do not assume any existing accounts, infrastructure or completed software.

## Prompt 1 — Build the complete application

Act as a senior product engineer and build a working, mobile-first business management web application for **Sai Samarth Trading Company**, an agricultural commodity trader buying from farmers and selling to factories and other customers. Make it installable as a Progressive Web App when supported. Build the application, database and working workflows, rather than returning only a plan or screen mockups.

### Business context and setup

- One business with four shops and one godown. Create editable placeholder locations: Shop 1, Shop 2, Shop 3, Shop 4 and Main Godown. Record the actual receiving/dispatch location on every stock transaction; do not automatically send everything to the godown.
- Initial editable commodities: soybean, wheat, jowar and tamarind. Rates are primarily per kg. Store quantities in kg; offer optional quintal entry/display, where 1 quintal = 100 kg. Keep the entered unit and normalized rate/weight. Support large truck loads.
- Purchases include business cutting, moisture, dust and other deductions. Farmer payments are usually immediate through cash, UPI or bank transfer, but part payments and credit must work.
- Transportation and hamali/loading/unloading charges are recorded. Purchases and sales may use a truck or tempo weighbridge.
- Rent was described as ₹40,000 monthly for shop/godown premises; electricity is separate. Show ₹40,000 as a provisional recurring rent template and require confirmation of its premises coverage. Do not invent electricity charges or historical rent payments.
- Before the first real purchase is posted, ask the owner to confirm the cutting rule: **10 grams per kg = 1% = 1 kg per 100 kg**, whereas **2 kg per 100 kg = 2% = 20 grams per kg**. Support either rule and commodity-specific overrides. Do not silently select one. Allow drafts while this setup choice is unresolved.
- Ask whether moisture/dust deductions use kg or percentages, and support both. Provide an explicit deduction base; use pre-deduction commodity weight by default. Prevent entering the same deduction in both units.
- Provide English and Marathi label support with a language switch; retain the original names and data. Label translations should be editable. Allow the owner to rename locations and choose their stock-routing preferences.
- All unresolved business choices must be visible in setup. Preserve the selected rule, percentage/base, applicable settings version and any authorized override on each posted transaction. Changing settings must not rewrite old transactions.

### Navigation and dashboard

Use bottom navigation: **Home, Purchases, Sales, Stock, More**. Keep dashboard/report screens separate from data-entry screens. Include prominent New Purchase, New Sale, Record Payment and Add Expense actions. Show dates in Indian format, INR using Indian digit grouping, and business time in Asia/Kolkata.

Home should show Today / This Month / Custom filters and location/commodity filters. Display purchase amount, sales amount, gross profit, operating expenses, estimated net trading profit, physical stock kg, stock value, farmer dues and customer dues. Add cash/bank balances from real account ledgers, recent transactions, due payments and low-stock alerts. Use precise labels: purchase/sales amounts are document totals; cash paid/received are separate measures. Show profit only to authorized roles. Do not treat customer receipts as additional sales or farmer payments as additional expenses.

### Purchase workflow

Create a fast mobile form with these sections:

1. Date, unique purchase number, receiving location, farmer/supplier search by name or mobile, quick-add party with name/mobile/village, optional vehicle number and weighbridge reference/photo.
2. One or more commodity lines. Support direct commodity weight or loaded vehicle gross minus empty vehicle tare. Loaded vehicle gross and commodity weight are different fields. For mixed loads, allocate the measured commodity total across lines and validate the sum.
3. Business cutting, moisture, dust and other deductions in kg or %, with a live breakdown. Capture moisture reading separately from moisture weight deduction; do not infer a deduction from a moisture reading without an owner-defined formula.
4. Rate per kg or per quintal, converted consistently; payable weight; commodity amount; optional explicitly entered charges/discounts; final farmer payable.
5. Payment now: none, partial or full; one or more cash/UPI/bank payments; reference; remaining balance; remarks.
6. Save Draft, Review and Post. Posting commits the purchase, stock receipt and immediate payment atomically. Allow a purchase receipt to be downloaded and shared manually using the device share interface.

**Weight and cost rules:**

- Commodity input weight = direct material weight OR loaded vehicle gross − tare.
- Payable kg = commodity input kg − sum of valid payable deductions.
- Base purchase amount = payable kg × normalized rate per kg.
- Payable weight and physically received inventory weight must be separate. Each deduction must identify whether it affects settlement only, actual material received, or both. Business cutting or moisture discounts do not automatically mean physical stock disappeared. Ask for confirmed physical received kg before posting; reconcile any physical removal with its reason. Never subtract the same loss twice.
- Farmer payable includes only actual settlement adjustments. Keep charges paid to transporters/workers separate from amounts payable to the farmer unless an explicit, traceable settlement adjustment says otherwise.
- Show a review card for input weight, each deduction, payable weight, physical stock received, amount and balance. Use decimal arithmetic and declared rounding: kg to 3 decimals, INR totals to 2 decimals, higher precision internally for rates and costing.
- Block invalid tare/gross relationships, nonpositive posted quantities/rates, negative payable weight, deductions above their base and inconsistent physical receipt reconciliation. Zero-price adjustments require a separate owner-authorized workflow.

### Sales workflow

Capture date, sale number, customer/factory name, mobile, dispatch location, commodity, vehicle number, dispatch weight, optional vehicle gross/tare, rate, invoice/receipt amount, due date, immediate receipt and remarks. Support multiple lines and credit sales. Keep material dispatched separate from customer-billable weight where customer deductions or weighbridge differences exist; require a reason and reconcile any actual stock loss. Stock issues use actual dispatched kg; revenue uses billable kg.

Offer invoice/receipt PDF and manual sharing. If taxes are not configured, use a neutral commercial receipt and show only configured amounts; do not claim a tax-compliant invoice or invent tax rates. Keep taxation as an explicit configurable extension requiring the business's confirmed settings.

### Party records and payments

Use one party directory that supports farmer/supplier/customer roles, with name, mobile, village/address, optional business details and transaction history. Allow one party to have multiple roles. Warn about possible duplicates without blocking shared phone numbers. Separate payable and receivable balances unless an owner explicitly records an adjustment.

Maintain independent payment records and payment allocations linked to purchases, sales or expenses. An immediate payment creates exactly one payment record. Support later payments, split modes, payments against several documents, advances, unallocated party credits and refunds. Prevent over-allocation; excess payment becomes an explicit advance, never a hidden negative invoice balance. Party statements must reconcile documents, allocations, reversals and opening balances.

Cash, UPI, bank transfer and RTGS are payment modes; cashboxes and bank accounts are accounts. UPI receipts go into their selected real account and must not create a second fictional UPI cash balance. Handle transfers between own accounts without recognizing revenue or expense. Recording a payment documents an external payment; do not initiate transfers or integrate payment execution by default.

### Inventory, costing and five locations

Build an append-only stock movement ledger for opening stock, purchases, sales, returns, transfers, actual losses and owner-approved adjustments. Track kg and carrying value by commodity and location, plus a consolidated view. Require opening stock quantities and values, opening bank/cash balances, and opening party dues through an owner-reviewed opening setup; opening stock must not appear as a new-period purchase.

Use perpetual moving weighted-average inventory cost per commodity and location. Each receipt updates average cost; each sale uses the cost immediately before that sale. Post events in an immutable business sequence. Prevent negative stock and race conditions with transactional stock checks. Backdated entries affecting posted stock/cost must either trigger a fully implemented chronological recalculation or be blocked after later movements with a clear correction workflow; never silently use today's average cost for an old sale.

Transfers preserve cost and change location stock only. Use dispatched/in-transit/received statuses when needed; partial receipt must leave the remainder visibly in transit. A same-day instant transfer may commit paired movements atomically. Transfers do not create business purchases, sales or profit. Purchase/sales returns must reference the original transaction and reverse the corresponding quantity and cost without breaking settled payments; record any refund separately.

Classify transaction-related transportation/hamali as either inbound landed inventory cost or an operating expense, using explicit settings/entry choices. Allocate landed cost once using a documented basis such as physical kg. Never count the same charge in both inventory and operating expenses. For later-arriving landed charges, implement consistent cost adjustment across remaining stock and sold quantities, or enforce a clearly stated posting restriction until the cost is final.

Sales revenue − cost of goods sold = gross profit. Gross profit − recognized operating expenses = estimated net trading profit. Stock value is carrying cost, not expected selling value. Cash flow and profit need separate reporting. Payments settle obligations; they do not create another expense. This is a management trading system; do not claim full statutory accounts or tax filing functionality.

### Expenses and recurring costs

Categories: rent, electricity, transportation, hamali/loading, hamali/unloading, wages, repairs and other. Capture date, category, amount, location/all-premises allocation, party/payee, linked purchase/sale if relevant, bill photo, cost classification and payment status. Expenses may be unpaid or part-paid, with payments handled through the same payment ledger.

Generate a monthly draft rent obligation from the confirmed template and prevent duplicates for a period. Do not mark it paid automatically. Record actual electricity bills manually. Expense recognition and payment date are distinct. Allocations across premises must total the original expense; consolidated reports must not multiply shared rent by five locations.

### Reports and exports

Build purchase/sales registers, daily business summary, commodity/location stock, stock movement history, transfer history, farmer/customer statements, receivable/payable aging based on due dates, payment-mode/account reports, cashbook, expenses by category, and monthly trading profit and loss with inventory reconciliation. Filter by date, party, commodity, location and payment status. Offer CSV/Excel export and readable PDF receipts/statements. Exported totals must reconcile with screens and respect role permissions.

### Reliability and data model

Use real authenticated users, a persistent relational database, server-side validation and secure server-side authorization. Owner manages settings, users, opening balances and reversals; staff enters records within assigned locations; viewer is read-only. Make sensitive profit and account access explicit. Protect receipt uploads and party contact details from public access.

Model parties, locations, commodities, units/rules with versions, purchase/sales documents and lines, deduction lines, accounts, payments and allocations, expenses, recurring templates/instances, stock movements, inventory costs, transfers/lines, returns/reversals, attachments and audit events. Use stable internal IDs and unique server-generated document numbers. Apply database constraints, decimal money/quantity types, foreign keys and indexes.

Drafts do not affect reports, stock or balances. Posted documents cannot be silently edited or deleted: use a role-checked reversal/correction workflow that checks dependent stock movements and payment allocations. Preserve original records, actor, timestamp and reasons. Transactions must prevent partially posted records. Repeated taps, retries or reconnects must not create duplicate purchases, movements or payments; use idempotency keys and appropriate uniqueness constraints. Support pagination and fast party/commodity search.

Provide a responsive PWA shell and local draft recovery on weak networks. Clearly show saved, unsaved and pending states. For initial release, require connectivity for final posting; do not promise offline multi-device posting unless conflict-safe sync is actually implemented. A new device should see the same authorized server records after login.

### Completion and handover

Provide a separate demo workspace with clearly labeled sample data, plus an empty real workspace. Do not contaminate real dashboard totals with samples. Implement real save/search/filter/export buttons and explain any service dependency that remains unconfigured. Never show a successful upload, backup, notification or payment when no underlying action occurred.

Deliver working source, migrations, environment-variable template without secrets, setup instructions, backup/restore procedure, owner quick-start guide and a list of implemented versus incomplete features. Build the critical path first: setup → purchase → stock → payment → sale → collection → dashboard. Then complete transfers, expenses, statements and reports. Use the acceptance checks in Prompt 3 before declaring completion.

## Prompt 2 — Refine the mobile experience

Review the actual application on 360 px, 390 px and 430 px widths. Make it comfortable for a trader to use on a phone in a shop or godown.

- Use warm off-white surfaces, deep green navigation and restrained amber highlights. Keep numbers clear, contrast strong and labels readable. Use red only for errors, overdue balances and negative conditions.
- Keep dashboard cards narrow enough for a phone, with at most two cards per row and one column where needed. Avoid page-wide horizontal scrolling. Long registers become searchable summary cards; detailed tables can be available on larger screens.
- Use bottom navigation and a separate, prominent New Purchase action. Keep forms in short sections: Party → Weight → Rate → Payment → Review. Show the calculation summary while entering weight and rate.
- Provide large touch targets, numeric/decimal keypads, searchable dropdowns, inline quick-add party, and recent/frequent commodities. Preserve unfinished entries when navigating or losing connection. Do not carry yesterday's weight or rate into a new purchase without the user's deliberate choice.
- Keep payable weight and physical stock weight visibly distinct. Show units next to every quantity/rate. Make pending, part-paid, paid, draft, posted and reversed states understandable without color alone.
- Use simple operational language. Put profit details behind permission checks; do not expose sensitive values in loading placeholders or exports.
- Confirm successful posting with a receipt preview and View / Download / Share actions. Sharing must use a user-initiated action. Repeated posting taps must be harmless.
- Test keyboard visibility, sticky-button placement, long Marathi labels, slow-network states, readable errors, and empty states. Verify from real rendered screens and fix overlap, clipping and awkward scrolling.

Deliver an implemented mobile refinement, a brief explanation of changes and the widths/workflows actually checked.

## Prompt 3 — Verify calculations and prevent accounting errors

Audit the implemented application using isolated test data. Inspect the database records and report totals, not only visible cards. Add focused automated tests for calculation and posting invariants. Produce pass/fail results, correct failures and rerun affected checks.

1. **Unit/cutting conversion:** 1 quintal = 100 kg. ₹4,500/quintal = ₹45/kg. Ten grams cutting per kg on 1,000 kg is 10 kg, whereas 2 kg/100 kg on 1,000 kg is 20 kg. Changing the setting affects new documents only.
2. **Payable versus physical weight:** Input 1,000 kg; business cutting 20 kg marked settlement-only; dust deduction 10 kg marked both settlement and actual physical removal; rate ₹45/kg. Expected payable weight = 970 kg; commodity amount = ₹43,650; physical receipt = 990 kg. With no extra costs, inventory carrying value is ₹43,650 and average cost is ₹44.090909… per physical kg. Review and receipt show both weights.
3. **Immediate payment:** Pay the full ₹43,650 through one bank account using UPI mode. Exactly one payment exists; farmer due is zero; the bank account decreases by ₹43,650. There is no extra UPI account balance and no duplicate purchase expense.
4. **Sale and profit:** From that stock, dispatch and bill 600 kg at ₹50/kg with no extra charges. Revenue = ₹30,000; COGS = ₹26,454.55; gross profit = ₹3,545.45; closing stock = 390 kg; carrying value = ₹17,195.45. Calculate internally with higher precision and round reports consistently.
5. **Part collection:** Receive ₹10,000 against that sale, leaving ₹20,000 receivable. Collect the remaining ₹20,000 later. Sales revenue remains ₹30,000 throughout; two collections do not create more sales.
6. **Weighted average:** After that sale, buy another 510 physical/payable kg at ₹50/kg with no deductions or additional costs. Total physical stock is 900 kg; total carrying value is ₹42,695.45 (rounded display); new average cost is approximately ₹47.439394/kg. Subsequent sale COGS uses this new average, not the first purchase's rate or the period-end rate.
7. **Transfer:** Move 100 kg between locations at current carrying cost. Consolidated quantity, value, revenue and profit remain unchanged. Dispatched stock awaiting receipt appears in transit. Partial receipts reconcile.
8. **Recurring rent:** Generate one confirmed ₹40,000 rent obligation for a month. Regenerating creates no duplicate. It remains unpaid until a payment is recorded. Paying it later reduces cash/bank and the obligation, while recognized rent expense is counted once.
9. **Cost classification:** Record one inbound freight/hamali cost as landed cost; verify capitalization/COGS allocation and ensure it is absent from operating-expense totals. Record a different delivery expense as operating cost; verify it is not also capitalized. Unpaid costs appear in the appropriate payable balance without fake cash movement.
10. **Validation and concurrency:** Reject tare above loaded gross, excessive deductions, negative payable kg, unallocated payment above available payment, and selling more than available stock. Two users competing for the last stock cannot both succeed if combined quantities exceed availability. Double tap/retry creates only one posted transaction.
11. **Corrections and access:** Drafts affect no financial/stock totals. Reversal of a posted document respects downstream stock/cost and settled payments. Backdating follows the implemented block/recalculation policy. Staff/viewers cannot bypass permissions through direct API requests, exports or attachments.
12. **Reconciliation:** Party balances equal opening dues + posted documents − allocated payments − valid credits/reversals. Closing stock equals opening + physical receipts + returns in + transfers in − dispatches − returns out − transfers out − actual losses. Every account balance equals opening balance plus real inflows minus outflows, including own-account transfers without changing profit.
13. **Device/network behavior:** Records persist across refresh and second-device login. A dropped connection never shows a false posted success. Reconnection retries are idempotent. Demo data is isolated. PDFs/exports match the filtered records, enforce access permissions and do not contain hidden data from another location.

For monetary assertions, compare rounded values within ₹0.01 and verify that the declared rounding method reconciles line totals, document totals and carrying value. Report unsupported scenarios explicitly; do not mark unimplemented features as passed.

## Prompt 4 — Prepare the usable release and owner handover

Prepare a usable release of the tested Sai Samarth Trading Company app. Use the environment's supported hosting and database stack. Never hardcode secrets, disable authentication or fabricate a live URL. If publication requires a separate authorization or credentials, complete the build and provide the exact remaining step.

Deliver:

- Installable mobile web app behavior where supported; app name, icon, manifest and safe update behavior that preserves local drafts.
- Production database migrations, required environment-variable names, server-side authorization and private attachment storage.
- Empty production records plus a separate demo environment; clearly visible company/location settings.
- Guided opening setup for cutting rule, premises, rent coverage, opening quantities/values, cash/bank balances and party dues. Require a reviewed opening date and prevent duplicate opening imports.
- A backup that includes business records, settings and necessary attachment references/files; document the schedule, destination, retention and a tested restore. Label CSV reports as exports, not full backups. If automated backups require external setup, state that honestly and supply a manual procedure.
- A simple owner guide: buy from farmer, handle deductions, pay farmer, dispatch sale, collect money, transfer stock, record expenses and review monthly profit.
- List of enabled and incomplete integrations/features. No automatic WhatsApp/SMS sending or actual bank/UPI transfers unless separately requested and implemented.
- Final verification results for the mobile widths and financial cases tested. Describe estimated trading profit accurately and do not present it as audited/tax-filed accounts.

End with a brief release summary, how the owner can access/install the app, and any genuinely unresolved dependencies.
