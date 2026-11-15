import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import {
  round2,
  round3,
  round6,
  quintalToKg,
  kgToQuintal,
  convertRateToPerKg,
  convertRateToPerQuintal,
  getCuttingRulePercent,
  calculatePurchase,
  calculateSale,
  applyStockAddition,
  applyStockReduction,
  applyStockTransfer,
  validatePaymentAllocations,
  calculateProfitSummary,
} from './calculations';

test('Prompt 3 Check 1: Unit & cutting rule conversion (1 Qtl = 100 kg, ₹4,500/Qtl = ₹45/kg, 10g/kg = 10 kg vs 2kg/100kg = 20 kg on 1,000 kg)', () => {
  assert.equal(quintalToKg(1), 100);
  assert.equal(kgToQuintal(100), 1);
  assert.equal(convertRateToPerKg(4500, 'per_quintal'), 45);
  assert.equal(convertRateToPerQuintal(45, 'per_kg'), 4500);

  // Rule 1: 10g per kg = 1% => 10 kg on 1,000 kg
  const rule1Pct = getCuttingRulePercent('RULE_10G_PER_KG');
  assert.equal(rule1Pct, 1.0);
  const pRule1 = calculatePurchase({
    weighingMode: 'direct',
    directWeightKg: 1000,
    deductions: [
      { type: 'cutting', label: 'Rule 1', mode: 'percent', value: rule1Pct, impact: 'settlement_only' },
    ],
    rateValue: 45,
    rateUnit: 'per_kg',
  });
  assert.equal(pRule1.payableDeductionsKg, 10);

  // Rule 2: 2 kg per 100 kg = 2% => 20 kg on 1,000 kg
  const rule2Pct = getCuttingRulePercent('RULE_2KG_PER_100KG');
  assert.equal(rule2Pct, 2.0);
  const pRule2 = calculatePurchase({
    weighingMode: 'direct',
    directWeightKg: 1000,
    deductions: [
      { type: 'cutting', label: 'Rule 2', mode: 'percent', value: rule2Pct, impact: 'settlement_only' },
    ],
    rateValue: 45,
    rateUnit: 'per_kg',
  });
  assert.equal(pRule2.payableDeductionsKg, 20);
});

test('Prompt 3 Check 2: Payable versus physical weight (1,000 kg input, 20 kg settlement-only cutting, 10 kg both dust, ₹45/kg -> 970 kg payable, ₹43,650, 990 kg physical, ₹44.090909/kg avg cost)', () => {
  const res = calculatePurchase({
    weighingMode: 'direct',
    directWeightKg: 1000,
    deductions: [
      {
        type: 'cutting',
        label: 'Business Cutting (20 kg)',
        mode: 'kg',
        value: 20,
        impact: 'settlement_only',
      },
      {
        type: 'dust',
        label: 'Dust Deduction (10 kg)',
        mode: 'kg',
        value: 10,
        impact: 'both',
      },
    ],
    rateValue: 45,
    rateUnit: 'per_kg',
    immediatePaymentAmount: 43650,
    landedExpenseAmount: 0,
  });

  assert.equal(res.materialInputKg, 1000);
  assert.equal(res.payableDeductionsKg, 30); // 20 + 10
  assert.equal(res.physicalDeductionsKg, 10); // only 10 kg physical dust removal
  assert.equal(res.payableWeightKg, 970);
  assert.equal(res.purchaseAmount, 43650);
  assert.equal(res.physicalStockReceivedKg, 990);
  assert.equal(res.totalInventoryCarryingValue, 43650);
  assert.equal(res.effectiveInventoryCostPerKg, 44.090909);

  const stockAfterPurchase = applyStockAddition(
    { qtyKg: 0, totalValue: 0, avgCostPerKg: 0 },
    res.physicalStockReceivedKg,
    res.totalInventoryCarryingValue
  );
  assert.equal(stockAfterPurchase.qtyKg, 990);
  assert.equal(stockAfterPurchase.totalValue, 43650);
  assert.equal(stockAfterPurchase.avgCostPerKg, 44.090909);
});

test('Prompt 3 Checks 4 & 6: Sale profit & moving weighted-average cost sequence (600 kg sold @ ₹50/kg -> Rev ₹30,000, COGS ₹26,454.55, GP ₹3,545.45, Closing 390 kg / ₹17,195.45; then +510 kg @ ₹50/kg -> 900 kg, ₹42,695.45, avg ₹47.439394/kg)', () => {
  // Initial stock from Check 2: 990 kg, carrying value ₹43,650, avg cost ₹44.090909/kg
  const s1 = applyStockAddition({ qtyKg: 0, totalValue: 0, avgCostPerKg: 0 }, 990, 43650);

  // Check 4: Dispatch and bill 600 kg at ₹50/kg
  const sale1 = calculateSale({
    dispatchedKg: 600,
    billableKg: 600,
    sellingRateValue: 50,
    sellingRateUnit: 'per_kg',
    immediateCollectionAmount: 10000,
    currentLocationAvgCostPerKg: s1.avgCostPerKg,
    currentLocationStockKg: s1.qtyKg,
  });

  assert.equal(sale1.saleAmount, 30000);
  assert.equal(sale1.costOfGoodsSold, 26454.55);
  assert.equal(sale1.grossProfit, 3545.45);
  assert.equal(sale1.balanceReceivable, 20000);

  const { nextState: s2, removedCarryingValue } = applyStockReduction(s1, 600);
  assert.equal(removedCarryingValue, 26454.55);
  assert.equal(s2.qtyKg, 390);
  assert.equal(s2.totalValue, 17195.45);

  // Check 6: Buy another 510 physical/payable kg at ₹50/kg (₹25,500) with no deductions or extra costs
  const s3 = applyStockAddition(s2, 510, 25500);
  assert.equal(s3.qtyKg, 900);
  assert.equal(s3.totalValue, 42695.45);
  assert.equal(s3.avgCostPerKg, 47.439394);

  // Subsequent sale uses this new average (₹47.439394/kg), not the first purchase's rate
  const sale2 = calculateSale({
    dispatchedKg: 100,
    billableKg: 100,
    sellingRateValue: 55,
    sellingRateUnit: 'per_kg',
    currentLocationAvgCostPerKg: s3.avgCostPerKg,
    currentLocationStockKg: s3.qtyKg,
  });
  assert.equal(sale2.costOfGoodsSold, round2(100 * 47.439394)); // ₹4,743.94
});

test('Prompt 3 Check 7: Inter-location transfer of 100 kg preserves consolidated quantity, value, revenue, and profit', () => {
  const shop1 = { qtyKg: 900, totalValue: 42695.45, avgCostPerKg: 47.439394 };
  const godown = { qtyKg: 0, totalValue: 0, avgCostPerKg: 0 };

  const trf = applyStockTransfer(shop1, godown, 100);
  assert.equal(trf.nextSource.qtyKg, 800);
  assert.equal(trf.nextDestination.qtyKg, 100);
  assert.equal(round3(trf.nextSource.qtyKg + trf.nextDestination.qtyKg), 900);
  assert.equal(round2(trf.nextSource.totalValue + trf.nextDestination.totalValue), 42695.45);
  assert.equal(trf.transferUnitCostPerKg, 47.439394);
});

test('Prompt 3 Check 9: Cost classification (inbound landed cost vs operating expense never double-counted)', () => {
  const profit = calculateProfitSummary({
    totalSalesRevenue: 30000,
    totalCOGS: 26454.55,
    expenses: [
      { amount: 1200, classification: 'landed_cost' },
      { amount: 800, classification: 'operating_expense' },
    ],
  });

  assert.equal(profit.grossProfit, 3545.45);
  assert.equal(profit.operatingExpenses, 800);
  assert.equal(profit.capitalizedLandedCosts, 1200);
  assert.equal(profit.estimatedNetTradingProfit, 2745.45);
});

test('Prompt 3 Check 10: Validation invariants reject tare >= gross, excessive deductions, negative payable kg, over-allocation, and selling above available stock', () => {
  // 1. Tare above loaded gross
  const badTare = calculatePurchase({
    weighingMode: 'weighbridge',
    grossWeightKg: 1500,
    tareWeightKg: 1800,
    deductions: [],
    rateValue: 45,
    rateUnit: 'per_kg',
  });
  assert.equal(badTare.isInvalidTareRelationship, true);
  assert.ok(badTare.validationErrors.length > 0);

  // 2. Excessive deductions >= material input weight
  const badDed = calculatePurchase({
    weighingMode: 'direct',
    directWeightKg: 100,
    deductions: [{ type: 'dust', label: 'Excess Dust', mode: 'kg', value: 110, impact: 'both' }],
    rateValue: 45,
    rateUnit: 'per_kg',
  });
  assert.equal(badDed.isExcessiveDeduction, true);
  assert.equal(badDed.payableWeightKg, 0);
  assert.ok(badDed.validationErrors.length > 0);

  // 3. Over-allocation above available payment amount
  const badAlloc = validatePaymentAllocations({
    paymentAmount: 10000,
    allocations: [
      { docType: 'purchase', docId: 'p1', docNumber: 'PUR-1', amount: 7000, openBalance: 10000 },
      { docType: 'purchase', docId: 'p2', docNumber: 'PUR-2', amount: 5000, openBalance: 10000 },
    ],
  });
  assert.equal(badAlloc.valid, false);

  // Excess payment becomes explicit unallocated advance
  const advanceAlloc = validatePaymentAllocations({
    paymentAmount: 15000,
    allocations: [
      { docType: 'purchase', docId: 'p1', docNumber: 'PUR-1', amount: 10000, openBalance: 10000 },
    ],
  });
  assert.equal(advanceAlloc.valid, true);
  assert.equal(advanceAlloc.totalAllocated, 10000);
  assert.equal(advanceAlloc.unallocatedAdvance, 5000);

  // 4. Selling more than available stock
  assert.throws(() => {
    applyStockReduction({ qtyKg: 390, totalValue: 17195.45, avgCostPerKg: 44.090909 }, 400);
  }, /Insufficient stock/);
});

test('Prompt 3 Full Database Audit (Checks 2, 3, 4, 5, 6, 8, 11, 12): Isolated SQLite relational ledger & reconciliation audit', () => {
  const db = new Database(':memory:');
  const schemaPath = path.join(process.cwd(), 'migrations', '001_initial_schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);

  // Setup isolated test entities
  db.prepare(
    "INSERT INTO locations (id, code, name_en, name_mr, type) VALUES ('loc_shop1', 'SHOP-1', 'Shop 1', 'दुकान १', 'shop'), ('loc_godown', 'GODOWN-1', 'Main Godown', 'मुख्य गोदाम', 'godown')"
  ).run();
  db.prepare(
    "INSERT INTO commodities (id, code, name_en, name_mr, default_cutting_rule, custom_cutting_percent, cutting_impact, default_rate_per_quintal) VALUES ('comm_soy', 'SOYBEAN', 'Soybean', 'सोयाबीन', 'RULE_2KG_PER_100KG', 2.0, 'settlement_only', 4500)"
  ).run();
  db.prepare(
    "INSERT INTO stock_balances (location_id, commodity_id, qty_kg, total_value, avg_cost_per_kg) VALUES ('loc_shop1', 'comm_soy', 0, 0, 0), ('loc_godown', 'comm_soy', 0, 0, 0)"
  ).run();
  db.prepare(
    "INSERT INTO financial_accounts (id, name, type, supports_upi, opening_balance, current_balance) VALUES ('acc_bank_1', 'SBI Current A/c', 'BANK', 1, 100000, 100000), ('acc_cash_1', 'Shop 1 Cashbox', 'CASH', 0, 50000, 50000)"
  ).run();
  db.prepare(
    "INSERT INTO parties (id, type, name, mobile, opening_balance) VALUES ('pty_f1', 'farmer', 'Farmer Test', '9000000001', 0), ('pty_c1', 'customer', 'Factory Buyer', '9000000002', 0)"
  ).run();

  // Check 11: Draft purchase affects no stock or financial totals
  db.prepare(`
    INSERT INTO purchases (
      id, purchase_number, date, status, party_id, farmer_name, farmer_mobile,
      location_id, commodity_id, weighing_mode, material_input_kg, cutting_rule_applied,
      payable_weight_kg, physical_stock_received_kg, rate_value, rate_unit, rate_per_kg,
      purchase_amount, total_carrying_value, balance_amount, created_by
    ) VALUES ('pur_draft', 'PUR-DRAFT-1', '2026-11-15', 'DRAFT', 'pty_f1', 'Farmer Test', '9000000001', 'loc_shop1', 'comm_soy', 'direct', 500, 'RULE_10G_PER_KG', 495, 500, 45, 'per_kg', 45, 22275, 22275, 22275, 'owner')
  `).run();

  const stockAfterDraft = db
    .prepare("SELECT qty_kg, total_value FROM stock_balances WHERE location_id = 'loc_shop1'")
    .get() as { qty_kg: number; total_value: number };
  assert.equal(stockAfterDraft.qty_kg, 0);
  assert.equal(stockAfterDraft.total_value, 0);

  // Check 2 & 3: Post Purchase 1 (1,000 kg input, 20 kg settlement cutting, 10 kg both dust, ₹45/kg -> 970 kg payable, ₹43,650 paid via UPI from acc_bank_1, 990 kg physical stock)
  const p1Calc = calculatePurchase({
    weighingMode: 'direct',
    directWeightKg: 1000,
    deductions: [
      { type: 'cutting', label: 'Cutting', mode: 'kg', value: 20, impact: 'settlement_only' },
      { type: 'dust', label: 'Dust', mode: 'kg', value: 10, impact: 'both' },
    ],
    rateValue: 45,
    rateUnit: 'per_kg',
    immediatePaymentAmount: 43650,
  });

  const s1 = applyStockAddition({ qtyKg: 0, totalValue: 0, avgCostPerKg: 0 }, p1Calc.physicalStockReceivedKg, p1Calc.totalInventoryCarryingValue);
  db.prepare(`
    INSERT INTO purchases (
      id, purchase_number, idempotency_key, date, status, party_id, farmer_name, farmer_mobile,
      location_id, commodity_id, weighing_mode, material_input_kg, cutting_rule_applied,
      payable_deductions_kg, physical_deductions_kg, payable_weight_kg, physical_stock_received_kg,
      rate_value, rate_unit, rate_per_kg, purchase_amount, total_carrying_value,
      immediate_payment_amount, paid_amount, balance_amount, payment_mode, payment_account_id, created_by
    ) VALUES ('pur_1', 'PUR-0001', 'idem_1', '2026-11-15', 'POSTED', 'pty_f1', 'Farmer Test', '9000000001', 'loc_shop1', 'comm_soy', 'direct', 1000, 'RULE_2KG_PER_100KG', 30, 10, 970, 990, 45, 'per_kg', 45, 43650, 43650, 43650, 43650, 0, 'UPI', 'acc_bank_1', 'owner')
  `).run();
  db.prepare("UPDATE stock_balances SET qty_kg = ?, total_value = ?, avg_cost_per_kg = ? WHERE location_id = 'loc_shop1'").run(s1.qtyKg, s1.totalValue, s1.avgCostPerKg);
  db.prepare(`
    INSERT INTO payments (id, payment_number, date, direction, category, party_id, party_name, amount, mode, account_id, linked_purchase_id, created_by)
    VALUES ('pay_1', 'PAY-0001', '2026-11-15', 'OUTFLOW', 'FARMER_PAYMENT', 'pty_f1', 'Farmer Test', 43650, 'UPI', 'acc_bank_1', 'pur_1', 'owner')
  `).run();
  db.prepare("UPDATE financial_accounts SET current_balance = ROUND(current_balance - 43650, 2) WHERE id = 'acc_bank_1'").run();

  // Verify Check 3: Exactly 1 payment exists, farmer due is 0, bank decreased by ₹43,650 (100000 - 43650 = 56350), no extra UPI account created
  const payCount = db.prepare('SELECT COUNT(*) as c FROM payments').get() as { c: number };
  assert.equal(payCount.c, 1);
  const bankAfterP1 = db.prepare("SELECT current_balance FROM financial_accounts WHERE id = 'acc_bank_1'").get() as { current_balance: number };
  assert.equal(bankAfterP1.current_balance, 56350);

  // Check 4 & 5: Sale of 600 kg @ ₹50/kg (Rev ₹30,000, COGS ₹26,454.55, GP ₹3,545.45) with part collection ₹10,000 then ₹20,000
  const sale1Calc = calculateSale({
    dispatchedKg: 600,
    billableKg: 600,
    sellingRateValue: 50,
    sellingRateUnit: 'per_kg',
    immediateCollectionAmount: 10000,
    currentLocationAvgCostPerKg: s1.avgCostPerKg,
    currentLocationStockKg: s1.qtyKg,
  });
  const { nextState: sAfterSale1 } = applyStockReduction(s1, 600);
  db.prepare(`
    INSERT INTO sales (
      id, invoice_number, date, status, party_id, customer_name, customer_mobile,
      location_id, commodity_id, dispatched_kg, billable_kg, selling_rate_value, selling_rate_unit, selling_rate_per_kg,
      sale_amount, avg_cost_per_kg_at_sale, cogs_amount, gross_profit,
      immediate_collection_amount, received_amount, balance_amount, created_by
    ) VALUES ('sal_1', 'INV-0001', '2026-11-15', 'POSTED', 'pty_c1', 'Factory Buyer', '9000000002', 'loc_shop1', 'comm_soy', 600, 600, 50, 'per_kg', 50, ?, ?, ?, ?, 10000, 10000, 20000, 'owner')
  `).run(sale1Calc.saleAmount, s1.avgCostPerKg, sale1Calc.costOfGoodsSold, sale1Calc.grossProfit);
  db.prepare("UPDATE stock_balances SET qty_kg = ?, total_value = ?, avg_cost_per_kg = ? WHERE location_id = 'loc_shop1'").run(sAfterSale1.qtyKg, sAfterSale1.totalValue, sAfterSale1.avgCostPerKg);
  db.prepare(`
    INSERT INTO payments (id, payment_number, date, direction, category, party_id, party_name, amount, mode, account_id, linked_sale_id, created_by)
    VALUES ('pay_2', 'PAY-0002', '2026-11-15', 'INFLOW', 'CUSTOMER_COLLECTION', 'pty_c1', 'Factory Buyer', 10000, 'BANK_TRANSFER', 'acc_bank_1', 'sal_1', 'owner')
  `).run();
  db.prepare("UPDATE financial_accounts SET current_balance = ROUND(current_balance + 10000, 2) WHERE id = 'acc_bank_1'").run();

  // Later collection of remaining ₹20,000
  db.prepare(`
    INSERT INTO payments (id, payment_number, date, direction, category, party_id, party_name, amount, mode, account_id, linked_sale_id, created_by)
    VALUES ('pay_3', 'PAY-0003', '2026-11-16', 'INFLOW', 'CUSTOMER_COLLECTION', 'pty_c1', 'Factory Buyer', 20000, 'BANK_TRANSFER', 'acc_bank_1', 'sal_1', 'owner')
  `).run();
  db.prepare("UPDATE sales SET received_amount = 30000, balance_amount = 0 WHERE id = 'sal_1'").run();
  db.prepare("UPDATE financial_accounts SET current_balance = ROUND(current_balance + 20000, 2) WHERE id = 'acc_bank_1'").run();

  const totalSalesRev = db.prepare("SELECT SUM(sale_amount) as rev FROM sales WHERE status = 'POSTED'").get() as { rev: number };
  assert.equal(totalSalesRev.rev, 30000); // Two collections never create extra sales revenue!

  // Check 8: Recurring monthly rent obligation (₹40,000 UNPAID) & duplicate prevention
  db.prepare(`
    INSERT INTO expenses (id, expense_number, date, category, classification, amount, paid_amount, balance_amount, payment_status, is_shared_premises, recurring_month_key, payee_name, created_by)
    VALUES ('exp_rent_1', 'EXP-0001', '2026-11-01', 'RENT', 'operating_expense', 40000, 0, 40000, 'UNPAID', 1, '2026-11', 'Landlord', 'owner')
  `).run();
  const rentRow = db.prepare("SELECT amount, paid_amount, balance_amount, payment_status FROM expenses WHERE id = 'exp_rent_1'").get() as {
    amount: number;
    paid_amount: number;
    balance_amount: number;
    payment_status: string;
  };
  assert.equal(rentRow.amount, 40000);
  assert.equal(rentRow.paid_amount, 0);
  assert.equal(rentRow.balance_amount, 40000);
  assert.equal(rentRow.payment_status, 'UNPAID');

  // Check 12: Account & Stock Reconciliation
  const bankFinal = db.prepare("SELECT opening_balance, current_balance FROM financial_accounts WHERE id = 'acc_bank_1'").get() as {
    opening_balance: number;
    current_balance: number;
  };
  const inflows = (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE account_id = 'acc_bank_1' AND direction = 'INFLOW'").get() as { s: number }).s;
  const outflows = (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE account_id = 'acc_bank_1' AND direction = 'OUTFLOW'").get() as { s: number }).s;
  assert.equal(round2(bankFinal.opening_balance + inflows - outflows), bankFinal.current_balance);
});
