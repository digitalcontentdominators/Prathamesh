import type {
  AppBootstrapData,
  EnvMode,
  FinancialAccount,
  LocationItem,
  PurchaseRecord,
  SaleRecord,
  StockBalanceRow,
  UserProfile,
} from '../types';
import {
  applyStockAddition,
  applyStockReduction,
  applyStockTransfer,
  calculatePurchase,
  calculateSale,
  getCuttingRulePercent,
  round2,
  round6,
  validatePaymentAllocations,
} from './calculations';

const STORAGE_PREFIX = 'saisamarth_static_db_v1_';

function createInitialStore(envMode: EnvMode): AppBootstrapData {
  const isDemo = envMode === 'demo';
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const locations: LocationItem[] = [
    { id: 'loc_shop1', code: 'SHOP-1', name_en: 'Shop 1 — Main Market Yard', name_mr: 'दुकान १ — मुख्य मार्केट यार्ड', type: 'shop', address: 'Main Market Yard, Gala 12' },
    { id: 'loc_shop2', code: 'SHOP-2', name_en: 'Shop 2 — Mondha Naka', name_mr: 'दुकान २ — मोंढा नाका', type: 'shop', address: 'Mondha Naka Corner, Gala 4' },
    { id: 'loc_shop3', code: 'SHOP-3', name_en: 'Shop 3 — Station Road', name_mr: 'दुकान ३ — स्टेशन रोड', type: 'shop', address: 'Station Road APMC Gate' },
    { id: 'loc_shop4', code: 'SHOP-4', name_en: 'Shop 4 — MIDC Phata', name_mr: 'दुकान ४ — एमआयडीसी फाटा', type: 'shop', address: 'MIDC Highway Phata' },
    { id: 'loc_godown', code: 'GODOWN-1', name_en: 'Central Godown (Warehouse)', name_mr: 'मुख्य गोदाम (वेअरहाऊस)', type: 'godown', address: 'Plot 44, Industrial Warehouse Zone' },
  ];

  const commodities = [
    {
      id: 'comm_soybean',
      code: 'SOYBEAN',
      name_en: 'Soybean',
      name_mr: 'सोयाबीन',
      default_cutting_rule: 'RULE_10G_PER_KG' as const,
      custom_cutting_percent: 1.0,
      cutting_impact: 'settlement_only' as const,
      default_rate_per_quintal: 4600,
    },
    {
      id: 'comm_wheat',
      code: 'WHEAT',
      name_en: 'Wheat (Lokwan)',
      name_mr: 'गहू (लोकवन)',
      default_cutting_rule: 'RULE_10G_PER_KG' as const,
      custom_cutting_percent: 1.0,
      cutting_impact: 'settlement_only' as const,
      default_rate_per_quintal: 2850,
    },
    {
      id: 'comm_jowar',
      code: 'JOWAR',
      name_en: 'Jowar (Maldandi)',
      name_mr: 'ज्वारी (मालदांडी)',
      default_cutting_rule: 'RULE_2KG_PER_100KG' as const,
      custom_cutting_percent: 2.0,
      cutting_impact: 'settlement_only' as const,
      default_rate_per_quintal: 3400,
    },
    {
      id: 'comm_tamarind',
      code: 'TAMARIND',
      name_en: 'Tamarind (Dry)',
      name_mr: 'चिंच (कोरडी)',
      default_cutting_rule: 'RULE_2KG_PER_100KG' as const,
      custom_cutting_percent: 2.0,
      cutting_impact: 'both' as const,
      default_rate_per_quintal: 7200,
    },
  ];

  const accounts: FinancialAccount[] = [
    {
      id: 'acc_cash_shop1',
      name: 'Main Market Shop Cashbox (गल्ला १)',
      type: 'CASH',
      bank_name: null,
      account_number: null,
      upi_id: null,
      supports_upi: 0,
      location_id: 'loc_shop1',
      opening_balance: isDemo ? 250000 : 100000,
      current_balance: isDemo ? 205070 : 100000,
    },
    {
      id: 'acc_cash_godown',
      name: 'Godown & Secondary Cashbox (गल्ला २)',
      type: 'CASH',
      bank_name: null,
      account_number: null,
      upi_id: null,
      supports_upi: 0,
      location_id: 'loc_godown',
      opening_balance: isDemo ? 120000 : 50000,
      current_balance: isDemo ? 120000 : 50000,
    },
    {
      id: 'acc_bank_sbi',
      name: 'SBI Current A/c - 4092 (UPI Linked)',
      type: 'BANK',
      bank_name: 'State Bank of India',
      account_number: 'XXXX4092',
      upi_id: 'saisamarth.sbi@okaxis',
      supports_upi: 1,
      location_id: null,
      opening_balance: isDemo ? 850000 : 500000,
      current_balance: isDemo ? 777300 : 500000,
    },
    {
      id: 'acc_bank_hdfc',
      name: 'HDFC Vyapar A/c - 8821 (UPI Linked)',
      type: 'BANK',
      bank_name: 'HDFC Bank',
      account_number: 'XXXX8821',
      upi_id: 'saisamarth.hdfc@okhdfcbank',
      supports_upi: 1,
      location_id: null,
      opening_balance: isDemo ? 420000 : 250000,
      current_balance: isDemo ? 451088 : 250000,
    },
  ];

  const stockBalances: StockBalanceRow[] = [];
  for (const loc of locations) {
    for (const comm of commodities) {
      stockBalances.push({
        location_id: loc.id,
        commodity_id: comm.id,
        qty_kg: 0,
        total_value: 0,
        avg_cost_per_kg: 0,
        updated_at: today,
      });
    }
  }

  if (isDemo) {
    const s1 = stockBalances.find(
      (b) => b.location_id === 'loc_shop1' && b.commodity_id === 'comm_soybean'
    );
    if (s1) {
      s1.qty_kg = 500;
      s1.total_value = 22800;
      s1.avg_cost_per_kg = 45.6;
    }
    const s2 = stockBalances.find(
      (b) => b.location_id === 'loc_shop2' && b.commodity_id === 'comm_wheat'
    );
    if (s2) {
      s2.qty_kg = 1495;
      s2.total_value = 42180;
      s2.avg_cost_per_kg = 28.214047;
    }
    const sg = stockBalances.find(
      (b) => b.location_id === 'loc_godown' && b.commodity_id === 'comm_soybean'
    );
    if (sg) {
      sg.qty_kg = 1000;
      sg.total_value = 45600;
      sg.avg_cost_per_kg = 45.6;
    }
  }

  return {
    envMode,
    user: {
      id: 'usr_owner',
      username: 'owner',
      fullName: 'Proprietor — Sai Samarth Trading',
      role: 'owner',
      assignedLocationId: null,
    },
    settings: {
      business_name: 'Sai Samarth Trading Company',
      business_tagline: 'Agricultural Commodity Merchants & Commission Agents',
      business_city: 'Market Yard, Maharashtra',
      cutting_rule_confirmed: isDemo ? '1' : '0',
      default_cutting_rule: 'RULE_10G_PER_KG',
      rent_monthly_amount: '40000',
      rent_premises_confirmed: isDemo ? '1' : '0',
      rent_premises_scope: 'ALL_PREMISES_COMBINED (4 Shops + 1 Central Godown)',
      rent_payee_name: 'Shri Deshmukh Commercial Complex & Godown Trust',
      opening_setup_completed: isDemo ? '1' : '0',
      opening_setup_date: '2025-05-01',
    },
    locations,
    commodities,
    accounts,
    parties: isDemo
      ? [
          {
            id: 'pty_farmer_1',
            name: 'Balasaheb Shinde',
            mobile: '9822011223',
            village_or_city: 'Shirur Kasar',
            type: 'farmer',
            gst_or_pan: '',
            opening_balance: 0,
            notes: 'Regular Soybean & Jowar farmer',
            created_at: yesterday,
          },
          {
            id: 'pty_farmer_2',
            name: 'Mahadev Pawar',
            mobile: '9423188990',
            village_or_city: 'Georai',
            type: 'farmer',
            gst_or_pan: '',
            opening_balance: 0,
            notes: 'Wheat & Tamarind cultivator',
            created_at: yesterday,
          },
          {
            id: 'pty_cust_1',
            name: 'Kalyani Agro Solvent Extractions Pvt Ltd',
            mobile: '9890144556',
            village_or_city: 'Latur MIDC',
            type: 'customer',
            gst_or_pan: '27AABCK9912L1Z4',
            opening_balance: 0,
            notes: 'Soybean factory buyer',
            created_at: yesterday,
          },
        ]
      : [],
    stockBalances,
    purchases: isDemo
      ? [
          {
            id: 'pur_demo_2',
            purchase_number: 'PUR-2026-0002',
            idempotency_key: null,
            date: yesterday,
            status: 'POSTED',
            party_id: 'pty_farmer_2',
            farmer_name: 'Mahadev Pawar',
            farmer_mobile: '9423188990',
            farmer_village: 'Georai',
            location_id: 'loc_shop2',
            commodity_id: 'comm_wheat',
            weighing_mode: 'direct',
            gross_weight_kg: 1500,
            tare_weight_kg: 0,
            material_input_kg: 1500,
            cutting_rule_applied: 'RULE_10G_PER_KG',
            deductions_json: JSON.stringify([
              { type: 'cutting', label: 'Business Cutting (10g/kg = 1%)', mode: 'percent', value: 1, deductionKg: 15, impact: 'settlement_only', percentageBaseText: '1% of 1500 kg pre-deduction commodity weight = 15 kg' },
              { type: 'dust', label: 'Sieved Dust Removed', mode: 'kg', value: 5, deductionKg: 5, impact: 'both', percentageBaseText: '5 kg fixed (0.333% of 1500 kg pre-deduction commodity weight)' },
            ]),
            payable_deductions_kg: 20,
            physical_deductions_kg: 5,
            payable_weight_kg: 1480,
            physical_stock_received_kg: 1495,
            rate_value: 2850,
            rate_unit: 'per_quintal',
            rate_per_kg: 28.5,
            purchase_amount: 42180,
            landed_expense_amount: 0,
            total_carrying_value: 42180,
            immediate_payment_amount: 42180,
            paid_amount: 42180,
            balance_amount: 0,
            payment_mode: 'CASH',
            payment_account_id: 'acc_cash_shop1',
            payment_reference: 'CASH-SLIP-22',
            vehicle_number: 'MH-20-CT-1180',
            weighbridge_slip_ref: 'WB-4419',
            weighbridge_photo_data: null,
            remarks: 'Clean Lokwan wheat bags',
            created_by: 'owner',
            created_at: yesterday,
            posted_at: yesterday,
            reversed_at: null,
            reversed_by: null,
            reversal_reason: null,
          },
          {
            id: 'pur_demo_1',
            purchase_number: 'PUR-2026-0001',
            idempotency_key: null,
            date: yesterday,
            status: 'POSTED',
            party_id: 'pty_farmer_1',
            farmer_name: 'Balasaheb Shinde',
            farmer_mobile: '9822011223',
            farmer_village: 'Shirur Kasar',
            location_id: 'loc_shop1',
            commodity_id: 'comm_soybean',
            weighing_mode: 'weighbridge',
            gross_weight_kg: 3100,
            tare_weight_kg: 600,
            material_input_kg: 2500,
            cutting_rule_applied: 'RULE_10G_PER_KG',
            deductions_json: JSON.stringify([
              { type: 'cutting', label: 'Business Cutting (10g/kg = 1%)', mode: 'percent', value: 1, deductionKg: 25, impact: 'settlement_only', percentageBaseText: '1% of 2500 kg pre-deduction commodity weight = 25 kg' },
              { type: 'moisture', label: 'Moisture Deduction (1%)', mode: 'percent', value: 1, deductionKg: 25, impact: 'settlement_only', percentageBaseText: '1% of 2500 kg pre-deduction commodity weight = 25 kg' },
            ]),
            payable_deductions_kg: 50,
            physical_deductions_kg: 0,
            payable_weight_kg: 2450,
            physical_stock_received_kg: 2500,
            rate_value: 4600,
            rate_unit: 'per_quintal',
            rate_per_kg: 46,
            purchase_amount: 112700,
            landed_expense_amount: 1300,
            total_carrying_value: 114000,
            immediate_payment_amount: 72700,
            paid_amount: 72700,
            balance_amount: 40000,
            payment_mode: 'UPI',
            payment_account_id: 'acc_bank_sbi',
            payment_reference: 'UPI/419283746192',
            vehicle_number: 'MH-23-AB-4412',
            weighbridge_slip_ref: 'WB-8821',
            weighbridge_photo_data: null,
            remarks: '25 Quintal trolley load',
            created_by: 'owner',
            created_at: yesterday,
            posted_at: yesterday,
            reversed_at: null,
            reversed_by: null,
            reversal_reason: null,
          },
        ]
      : [],
    sales: isDemo
      ? [
          {
            id: 'sal_demo_1',
            invoice_number: 'INV-2026-0001',
            idempotency_key: null,
            date: today,
            due_date: nextWeek,
            status: 'POSTED',
            party_id: 'pty_cust_1',
            customer_name: 'Kalyani Agro Solvent Extractions Pvt Ltd',
            customer_mobile: '9890144556',
            customer_city: 'Latur MIDC',
            location_id: 'loc_godown',
            commodity_id: 'comm_soybean',
            vehicle_number: 'MH-24-AU-9090',
            dispatched_kg: 1000,
            billable_kg: 992,
            weight_diff_kg: -8,
            weight_diff_explanation: 'Factory weighbridge moisture & transit allowance of 8 kg',
            selling_rate_value: 5150,
            selling_rate_unit: 'per_quintal',
            selling_rate_per_kg: 51.5,
            sale_amount: 51088,
            avg_cost_per_kg_at_sale: 45.6,
            cogs_amount: 45600,
            gross_profit: 5488,
            immediate_collection_amount: 31088,
            received_amount: 31088,
            balance_amount: 20000,
            collection_mode: 'BANK_TRANSFER',
            collection_account_id: 'acc_bank_hdfc',
            collection_reference: 'NEFT-KALYANI-881',
            remarks: 'Dispatched from Central Godown',
            created_by: 'owner',
            created_at: today,
            posted_at: today,
            reversed_at: null,
            reversed_by: null,
            reversal_reason: null,
          },
        ]
      : [],
    payments: isDemo
      ? [
          {
            id: 'pay_demo_1',
            payment_number: 'PAY-2026-0001',
            date: yesterday,
            direction: 'OUTFLOW',
            category: 'FARMER_PAYMENT',
            party_id: 'pty_farmer_1',
            party_name: 'Balasaheb Shinde',
            party_mobile: '9822011223',
            amount: 72700,
            mode: 'UPI',
            account_id: 'acc_bank_sbi',
            reference_number: 'UPI/419283746192',
            linked_purchase_id: 'pur_demo_1',
            linked_sale_id: null,
            linked_expense_id: null,
            allocations_json: '[]',
            notes: 'Immediate part payment via UPI',
            status: 'POSTED',
            created_by: 'owner',
            created_at: yesterday,
          },
        ]
      : [],
    expenses: isDemo
      ? [
          {
            id: 'exp_demo_1',
            expense_number: 'EXP-2026-0001',
            date: yesterday,
            status: 'POSTED',
            category: 'HAMALI',
            classification: 'landed_cost',
            amount: 1300,
            paid_amount: 1300,
            balance_amount: 0,
            payment_status: 'PAID',
            location_id: 'loc_shop1',
            is_shared_premises: 0,
            commodity_id: 'comm_soybean',
            linked_purchase_id: 'pur_demo_1',
            linked_sale_id: null,
            payee_name: 'Market Yard Hamal Toli',
            bill_reference: 'HML-102',
            bill_attachment_data: null,
            recurring_month_key: null,
            notes: 'Inbound unloading & stacking hamali capitalized into Soybean inventory',
            created_by: 'owner',
            created_at: yesterday,
          },
          {
            id: 'exp_demo_2',
            expense_number: 'EXP-2026-0002',
            date: today,
            status: 'POSTED',
            category: 'LOADING_UNLOADING',
            classification: 'operating_expense',
            amount: 1450,
            paid_amount: 1450,
            balance_amount: 0,
            payment_status: 'PAID',
            location_id: 'loc_godown',
            is_shared_premises: 0,
            commodity_id: null,
            linked_purchase_id: null,
            linked_sale_id: null,
            payee_name: 'Godown Mathadi Gang',
            bill_reference: 'HML-119',
            bill_attachment_data: null,
            recurring_month_key: null,
            notes: 'Outbound truck loading charges for factory dispatch',
            created_by: 'owner',
            created_at: today,
          },
        ]
      : [],
    stockMovements: [],
    users: [
      { id: 'usr_owner', username: 'owner', full_name: 'Proprietor — Sai Samarth Trading', role: 'owner', assigned_location_id: null, active: 1, created_at: yesterday },
      { id: 'usr_staff1', username: 'staff', full_name: 'Shop 1 Billing Clerk', role: 'staff', assigned_location_id: 'loc_shop1', active: 1, created_at: yesterday },
      { id: 'usr_viewer', username: 'viewer', full_name: 'Accountant / Auditor (View Only)', role: 'viewer', assigned_location_id: null, active: 1, created_at: yesterday },
    ],
    auditLogs: [],
  };
}

function loadStore(env: EnvMode): AppBootstrapData {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + env);
    if (raw) return JSON.parse(raw) as AppBootstrapData;
  } catch {
    // ignore
  }
  const initial = createInitialStore(env);
  saveStore(env, initial);
  return initial;
}

function saveStore(env: EnvMode, store: AppBootstrapData): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + env, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export async function handleLocalApiFallback<T>(
  path: string,
  options: RequestInit,
  env: EnvMode
): Promise<T> {
  const store = loadStore(env);
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(String(options.body)) : {};

  if (path.startsWith('/api/bootstrap')) {
    return store as unknown as T;
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const found = store.users.find((u) => u.username === body.username) || store.users[0];
    const user: UserProfile = {
      id: found.id,
      username: found.username,
      fullName: found.full_name,
      role: found.role,
      assignedLocationId: found.assigned_location_id,
    };
    store.user = user;
    saveStore(env, store);
    return { token: `token_${found.username}_local`, user } as unknown as T;
  }

  if (path === '/api/settings/confirm-cutting-rule' && method === 'POST') {
    store.settings.cutting_rule_confirmed = '1';
    store.settings.default_cutting_rule = body.defaultRule || 'RULE_10G_PER_KG';
    saveStore(env, store);
    return { ok: true } as unknown as T;
  }

  if (path === '/api/settings/confirm-rent-template' && method === 'POST') {
    store.settings.rent_monthly_amount = String(body.monthlyAmount || 40000);
    store.settings.rent_premises_confirmed = '1';
    store.settings.rent_premises_scope = body.premisesScope;
    store.settings.rent_payee_name = body.payeeName;
    saveStore(env, store);
    return { ok: true } as unknown as T;
  }

  if (path === '/api/settings/opening-setup' && method === 'POST') {
    if (store.settings.opening_setup_completed === '1') {
      throw new Error('Opening setup has already been completed and locked.');
    }
    store.settings.opening_setup_completed = '1';
    store.settings.opening_setup_date = body.openingDate || new Date().toISOString().slice(0, 10);
    saveStore(env, store);
    return { ok: true } as unknown as T;
  }

  if (path === '/api/accounts/transfer' && method === 'POST') {
    const amount = round2(Number(body.amount || 0));
    const fromAcc = store.accounts.find((a) => a.id === body.fromAccountId);
    const toAcc = store.accounts.find((a) => a.id === body.toAccountId);
    if (!fromAcc || !toAcc || fromAcc.id === toAcc.id || amount <= 0) {
      throw new Error('Select two distinct accounts and a positive transfer amount.');
    }
    fromAcc.current_balance = round2(fromAcc.current_balance - amount);
    toAcc.current_balance = round2(toAcc.current_balance + amount);
    const transferNumber = `CTR-${Date.now().toString().slice(-4)}`;
    saveStore(env, store);
    return { ok: true, transferNumber } as unknown as T;
  }

  if (path === '/api/purchases' && method === 'POST') {
    const calc = calculatePurchase({
      weighingMode: body.weighingMode,
      directWeightKg: Number(body.directWeightKg || 0),
      grossWeightKg: Number(body.grossWeightKg || 0),
      tareWeightKg: Number(body.tareWeightKg || 0),
      deductions: body.deductions || [],
      rateValue: Number(body.rateValue || 0),
      rateUnit: body.rateUnit || 'per_quintal',
      immediatePaymentAmount: Number(body.immediatePaymentAmount || 0),
      landedExpenseAmount: Number(body.landedExpenseAmount || 0),
    });
    if (calc.validationErrors.length > 0) {
      throw new Error(calc.validationErrors[0]);
    }
    const purchaseNumber = `PUR-2026-000${store.purchases.length + 1}`;
    const nowIso = new Date().toISOString();
    const newPur: PurchaseRecord = {
      id: body.id || `pur_${Date.now()}`,
      purchase_number: purchaseNumber,
      idempotency_key: body.idempotencyKey || null,
      date: body.date,
      status: body.status || 'POSTED',
      party_id: body.partyId || 'pty_local',
      farmer_name: body.farmerName,
      farmer_mobile: body.farmerMobile,
      farmer_village: body.farmerVillage || '',
      location_id: body.locationId,
      commodity_id: body.commodityId,
      weighing_mode: body.weighingMode,
      gross_weight_kg: Number(body.grossWeightKg || 0),
      tare_weight_kg: Number(body.tareWeightKg || 0),
      material_input_kg: calc.materialInputKg,
      cutting_rule_applied: body.cuttingRuleApplied || 'RULE_10G_PER_KG',
      deductions_json: JSON.stringify(calc.deductionLines),
      payable_deductions_kg: calc.payableDeductionsKg,
      physical_deductions_kg: calc.physicalDeductionsKg,
      payable_weight_kg: calc.payableWeightKg,
      physical_stock_received_kg: calc.physicalStockReceivedKg,
      rate_value: Number(body.rateValue || 0),
      rate_unit: body.rateUnit || 'per_quintal',
      rate_per_kg: calc.ratePerKg,
      purchase_amount: calc.purchaseAmount,
      landed_expense_amount: calc.landedExpenseAmount,
      total_carrying_value: calc.totalInventoryCarryingValue,
      immediate_payment_amount: calc.immediatePaymentAmount,
      paid_amount: calc.immediatePaymentAmount,
      balance_amount: calc.remainingFarmerBalance,
      payment_mode: body.paymentMode || 'UPI',
      payment_account_id: body.paymentAccountId || 'acc_bank_sbi',
      payment_reference: body.paymentReference || '',
      vehicle_number: body.vehicleNumber || '',
      weighbridge_slip_ref: body.weighbridgeSlipRef || '',
      weighbridge_photo_data: null,
      remarks: body.remarks || '',
      created_by: store.user.username,
      created_at: nowIso,
      posted_at: body.status === 'POSTED' ? nowIso : null,
      reversed_at: null,
      reversed_by: null,
      reversal_reason: null,
    };
    store.purchases.unshift(newPur);
    if (newPur.status === 'POSTED') {
      const sb = store.stockBalances.find(
        (b) => b.location_id === newPur.location_id && b.commodity_id === newPur.commodity_id
      );
      if (sb) {
        const next = applyStockAddition(
          { qtyKg: sb.qty_kg, totalValue: sb.total_value, avgCostPerKg: sb.avg_cost_per_kg },
          calc.physicalStockReceivedKg,
          calc.totalInventoryCarryingValue
        );
        sb.qty_kg = next.qtyKg;
        sb.total_value = next.totalValue;
        sb.avg_cost_per_kg = next.avgCostPerKg;
      }
      if (calc.immediatePaymentAmount > 0) {
        const acc = store.accounts.find((a) => a.id === body.paymentAccountId);
        if (acc) acc.current_balance = round2(acc.current_balance - calc.immediatePaymentAmount);
      }
    }
    saveStore(env, store);
    return { ok: true, id: newPur.id, purchaseNumber, status: newPur.status } as unknown as T;
  }

  if (path === '/api/sales' && method === 'POST') {
    const sb = store.stockBalances.find(
      (b) => b.location_id === body.locationId && b.commodity_id === body.commodityId
    );
    const calc = calculateSale({
      dispatchedKg: Number(body.dispatchedKg || 0),
      billableKg: Number(body.billableKg || 0),
      sellingRateValue: Number(body.sellingRateValue || 0),
      sellingRateUnit: body.sellingRateUnit || 'per_quintal',
      immediateCollectionAmount: Number(body.immediateCollectionAmount || 0),
      currentLocationAvgCostPerKg: sb?.avg_cost_per_kg || 0,
      currentLocationStockKg: sb?.qty_kg || 0,
    });
    if (!calc.hasSufficientStock) {
      throw new Error('Insufficient stock at dispatch location.');
    }
    const invoiceNumber = `INV-2026-000${store.sales.length + 1}`;
    const nowIso = new Date().toISOString();
    const newSale: SaleRecord = {
      id: `sal_${Date.now()}`,
      invoice_number: invoiceNumber,
      idempotency_key: body.idempotencyKey || null,
      date: body.date,
      due_date: body.dueDate || null,
      status: 'POSTED',
      party_id: body.partyId || 'pty_cust_local',
      customer_name: body.customerName,
      customer_mobile: body.customerMobile,
      customer_city: body.customerCity || '',
      location_id: body.locationId,
      commodity_id: body.commodityId,
      vehicle_number: body.vehicleNumber || '',
      dispatched_kg: calc.dispatchedKg,
      billable_kg: calc.billableKg,
      weight_diff_kg: calc.weightDifferenceKg,
      weight_diff_explanation: body.weightDiffExplanation || '',
      selling_rate_value: Number(body.sellingRateValue || 0),
      selling_rate_unit: body.sellingRateUnit || 'per_quintal',
      selling_rate_per_kg: calc.sellingRatePerKg,
      sale_amount: calc.saleAmount,
      avg_cost_per_kg_at_sale: round6(sb?.avg_cost_per_kg || 0),
      cogs_amount: calc.costOfGoodsSold,
      gross_profit: calc.grossProfit,
      immediate_collection_amount: calc.immediateCollectionAmount,
      received_amount: calc.immediateCollectionAmount,
      balance_amount: calc.balanceReceivable,
      collection_mode: body.collectionMode || 'BANK_TRANSFER',
      collection_account_id: body.collectionAccountId || 'acc_bank_hdfc',
      collection_reference: body.collectionReference || '',
      remarks: body.remarks || '',
      created_by: store.user.username,
      created_at: nowIso,
      posted_at: nowIso,
      reversed_at: null,
      reversed_by: null,
      reversal_reason: null,
    };
    store.sales.unshift(newSale);
    if (sb) {
      const { nextState } = applyStockReduction(
        { qtyKg: sb.qty_kg, totalValue: sb.total_value, avgCostPerKg: sb.avg_cost_per_kg },
        calc.dispatchedKg
      );
      sb.qty_kg = nextState.qtyKg;
      sb.total_value = nextState.totalValue;
      sb.avg_cost_per_kg = nextState.avgCostPerKg;
    }
    if (calc.immediateCollectionAmount > 0) {
      const acc = store.accounts.find((a) => a.id === body.collectionAccountId);
      if (acc) acc.current_balance = round2(acc.current_balance + calc.immediateCollectionAmount);
    }
    saveStore(env, store);
    return { ok: true, id: newSale.id, invoiceNumber } as unknown as T;
  }

  if (path === '/api/stock/transfers' && method === 'POST') {
    const fromSb = store.stockBalances.find(
      (b) => b.location_id === body.fromLocationId && b.commodity_id === body.commodityId
    );
    const toSb = store.stockBalances.find(
      (b) => b.location_id === body.toLocationId && b.commodity_id === body.commodityId
    );
    if (!fromSb || !toSb) throw new Error('Invalid stock transfer locations.');
    const res = applyStockTransfer(
      { qtyKg: fromSb.qty_kg, totalValue: fromSb.total_value, avgCostPerKg: fromSb.avg_cost_per_kg },
      { qtyKg: toSb.qty_kg, totalValue: toSb.total_value, avgCostPerKg: toSb.avg_cost_per_kg },
      Number(body.qtyKg || 0)
    );
    fromSb.qty_kg = res.nextSource.qtyKg;
    fromSb.total_value = res.nextSource.totalValue;
    fromSb.avg_cost_per_kg = res.nextSource.avgCostPerKg;
    toSb.qty_kg = res.nextDestination.qtyKg;
    toSb.total_value = res.nextDestination.totalValue;
    toSb.avg_cost_per_kg = res.nextDestination.avgCostPerKg;
    const transferNumber = `TRF-2026-000${store.stockMovements.length + 1}`;
    saveStore(env, store);
    return { ok: true, transferNumber, transferredValue: res.transferredCarryingValue } as unknown as T;
  }

  if (path === '/api/payments' && method === 'POST') {
    const amount = round2(Number(body.amount || 0));
    const allocCheck = validatePaymentAllocations({
      paymentAmount: amount,
      allocations: body.allocations || [],
    });
    if (!allocCheck.valid) throw new Error(allocCheck.errors[0] || 'Invalid allocations');
    const paymentNumber = `PAY-2026-000${store.payments.length + 1}`;
    store.payments.unshift({
      id: `pay_${Date.now()}`,
      payment_number: paymentNumber,
      date: body.date,
      direction: body.direction,
      category: body.category,
      party_id: body.partyId || null,
      party_name: body.partyName,
      party_mobile: body.partyMobile || '',
      amount,
      mode: body.mode,
      account_id: body.accountId,
      reference_number: body.referenceNo || '',
      linked_purchase_id: null,
      linked_sale_id: null,
      linked_expense_id: null,
      allocations_json: JSON.stringify(body.allocations || []),
      notes: body.notes || '',
      status: 'POSTED',
      created_by: store.user.username,
      created_at: new Date().toISOString(),
    });
    const acc = store.accounts.find((a) => a.id === body.accountId);
    if (acc) {
      acc.current_balance = round2(
        acc.current_balance + (body.direction === 'INFLOW' ? amount : -amount)
      );
    }
    saveStore(env, store);
    return { ok: true, paymentNumber } as unknown as T;
  }

  if (path === '/api/expenses/generate-rent' && method === 'POST') {
    const monthKey = body.monthKey;
    if (store.expenses.some((e) => e.recurring_month_key === monthKey && e.status === 'POSTED')) {
      throw new Error(`Monthly rent obligation for ${monthKey} already exists.`);
    }
    const amount = round2(Number(store.settings.rent_monthly_amount || 40000));
    const expenseNumber = `EXP-2026-000${store.expenses.length + 1}`;
    store.expenses.unshift({
      id: `exp_${Date.now()}`,
      expense_number: expenseNumber,
      date: `${monthKey}-01`,
      status: 'POSTED',
      category: 'RENT',
      classification: 'operating_expense',
      amount,
      paid_amount: 0,
      balance_amount: amount,
      payment_status: 'UNPAID',
      location_id: null,
      is_shared_premises: 1,
      commodity_id: null,
      linked_purchase_id: null,
      linked_sale_id: null,
      payee_name: store.settings.rent_payee_name,
      bill_reference: `RENT-${monthKey}`,
      bill_attachment_data: null,
      recurring_month_key: monthKey,
      notes: `Monthly recurring rent obligation (${store.settings.rent_premises_scope})`,
      created_by: store.user.username,
      created_at: new Date().toISOString(),
    });
    saveStore(env, store);
    return { ok: true, expenseNumber } as unknown as T;
  }

  if (path === '/api/expenses' && method === 'POST') {
    const amount = round2(Number(body.amount || 0));
    const paidNow = round2(Number(body.paidNowAmount || 0));
    const expenseNumber = `EXP-2026-000${store.expenses.length + 1}`;
    store.expenses.unshift({
      id: `exp_${Date.now()}`,
      expense_number: expenseNumber,
      date: body.date,
      status: 'POSTED',
      category: body.category,
      classification: body.classification || 'operating_expense',
      amount,
      paid_amount: paidNow,
      balance_amount: round2(amount - paidNow),
      payment_status: paidNow >= amount ? 'PAID' : paidNow > 0 ? 'PARTIAL' : 'UNPAID',
      location_id: body.locationId || null,
      is_shared_premises: body.isSharedPremises ? 1 : 0,
      commodity_id: body.commodityId || null,
      linked_purchase_id: null,
      linked_sale_id: null,
      payee_name: body.payeeName,
      bill_reference: body.billReference || '',
      bill_attachment_data: null,
      recurring_month_key: null,
      notes: body.notes || '',
      created_by: store.user.username,
      created_at: new Date().toISOString(),
    });
    saveStore(env, store);
    return { ok: true, expenseNumber } as unknown as T;
  }

  if (path === '/api/settings/commodities' && method === 'POST') {
    const id = `comm_${String(body.code).toLowerCase()}`;
    store.commodities.push({
      id,
      code: String(body.code).toUpperCase(),
      name_en: body.nameEn,
      name_mr: body.nameMr || body.nameEn,
      default_cutting_rule: body.defaultCuttingRule || 'RULE_10G_PER_KG',
      custom_cutting_percent: getCuttingRulePercent(body.defaultCuttingRule || 'RULE_10G_PER_KG', 1),
      cutting_impact: body.cuttingImpact || 'settlement_only',
      default_rate_per_quintal: Number(body.defaultRatePerQuintal || 0),
    });
    saveStore(env, store);
    return { ok: true, id } as unknown as T;
  }

  if (path === '/api/backup/export') {
    return store as unknown as T;
  }

  if (path === '/api/backup/restore' && method === 'POST') {
    saveStore(env, body as AppBootstrapData);
    return { ok: true } as unknown as T;
  }

  return { ok: true } as unknown as T;
}
