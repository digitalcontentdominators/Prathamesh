import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  round2,
  round3,
  round4,
  round6,
  calculatePurchase,
  calculateSale,
  applyStockAddition,
  applyStockReduction,
  applyStockTransfer,
  validatePaymentAllocations,
  calculateProfitSummary,
} from './src/utils/calculations.ts';
import type {
  DeductionLineInput,
  RateUnit,
  CuttingRuleCode,
  ExpenseClassification,
} from './src/utils/calculations.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generates a valid RGBA PNG buffer of width x height with a dark slate background
 * and an emerald center emblem so PWA icons are 100% compliant without external binaries.
 */
function createSolidBrandPng(size: number, maskable = false): Buffer {
  const width = size;
  const height = size;
  const rawData = Buffer.alloc(height * (1 + width * 4));

  const center = size / 2;
  const outerRadius = maskable ? size * 0.34 : size * 0.38;
  const innerRadius = maskable ? size * 0.18 : size * 0.2;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawData[rowStart] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Dark slate #0F172A background, Emerald #10B981 emblem ring, Crisp white #F8FAFC core
      if (dist <= innerRadius) {
        rawData[px] = 248;
        rawData[px + 1] = 250;
        rawData[px + 2] = 252;
        rawData[px + 3] = 255;
      } else if (dist <= outerRadius) {
        rawData[px] = 16;
        rawData[px + 1] = 185;
        rawData[px + 2] = 129;
        rawData[px + 3] = 255;
      } else {
        rawData[px] = 15;
        rawData[px + 1] = 23;
        rawData[px + 2] = 42;
        rawData[px + 3] = 255;
      }
    }
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(combined), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(rawData);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function ensurePwaIcons() {
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const icons: Array<{ file: string; size: number; maskable: boolean }> = [
    { file: 'pwa-192x192.png', size: 192, maskable: false },
    { file: 'pwa-512x512.png', size: 512, maskable: false },
    { file: 'pwa-maskable-512x512.png', size: 512, maskable: true },
    { file: 'apple-touch-icon.png', size: 180, maskable: false },
  ];
  for (const item of icons) {
    const target = path.join(publicDir, item.file);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, createSolidBrandPng(item.size, item.maskable));
    }
  }
}

ensurePwaIcons();

// Initialize separate Demo and Real SQLite Databases
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const schemaSql = fs.readFileSync(
  path.join(__dirname, 'migrations', '001_initial_schema.sql'),
  'utf-8'
);

const dbDemo = new Database(path.join(dataDir, 'saisamarth_demo.db'));
const dbReal = new Database(path.join(dataDir, 'saisamarth_real.db'));

dbDemo.pragma('journal_mode = WAL');
dbReal.pragma('journal_mode = WAL');

dbDemo.exec(schemaSql);
dbReal.exec(schemaSql);

function hashPassword(pw: string): string {
  return crypto.createHash('sha256').update(`saisamarth_salt_${pw}`).digest('hex');
}

function seedMasterEntities(db: Database.Database, isDemo: boolean) {
  const existingLocs = db.prepare('SELECT COUNT(*) as c FROM locations').get() as { c: number };
  if (existingLocs.c > 0) return;

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO business_settings (key, value, updated_by) VALUES (?, ?, ?)'
  );
  insertSetting.run('company_name', 'Sai Samarth Trading Company', 'system');
  insertSetting.run('company_name_mr', 'साई समर्थ ट्रेडिंग कंपनी', 'system');
  // In Demo mode we still show the cutting rule banner if unconfirmed, or let owner confirm it
  insertSetting.run('cutting_rule_confirmed', isDemo ? '1' : '0', 'system');
  insertSetting.run('default_cutting_rule', 'RULE_10G_PER_KG', 'system');
  insertSetting.run('rent_monthly_amount', '40000', 'system');
  insertSetting.run('rent_premises_confirmed', isDemo ? '1' : '0', 'system');
  insertSetting.run(
    'rent_premises_scope',
    'ALL_PREMISES_COMBINED (4 Shops + 1 Central Godown)',
    'system'
  );
  insertSetting.run('rent_payee_name', 'Shri Deshmukh Commercial Complex & Godown Trust', 'system');

  // Users: Owner, Staff, Viewer
  const insertUser = db.prepare(
    'INSERT INTO users (id, username, password_hash, full_name, role, assigned_location_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertUser.run('usr_owner', 'owner', hashPassword('saisamarth123'), 'Samarth Patil (Owner)', 'owner', null);
  insertUser.run('usr_staff1', 'staff', hashPassword('staff123'), 'Ramesh Jadhav (Shop 1 & 2)', 'staff', 'loc_shop1');
  insertUser.run('usr_viewer', 'viewer', hashPassword('viewer123'), 'CA Kulkarni (Auditor / Viewer)', 'viewer', null);

  // 4 Shops and 1 Godown
  const insertLoc = db.prepare(
    'INSERT INTO locations (id, code, name_en, name_mr, type, address) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const locations = [
    ['loc_shop1', 'SHOP-1', 'Shop 1 — Main Market Yard', 'दुकान १ — मुख्य मार्केट यार्ड', 'shop', 'Gala No. 12, APMC Market Yard'],
    ['loc_shop2', 'SHOP-2', 'Shop 2 — Mondha Naka', 'दुकान २ — मोंढा नाका', 'shop', 'Plot 4, Old Mondha Road'],
    ['loc_shop3', 'SHOP-3', 'Shop 3 — Station Road', 'दुकान ३ — स्टेशन रोड', 'shop', 'Near Goods Shed, Station Road'],
    ['loc_shop4', 'SHOP-4', 'Shop 4 — MIDC Phata', 'दुकान ४ — एमआयडीसी फाटा', 'shop', 'Highway Bypass, MIDC Corner'],
    ['loc_godown', 'GODOWN-1', 'Central Godown (Warehouse)', 'मध्यवर्ती गोदाम (वेअरहाऊस)', 'godown', 'Survey 88, Ring Road Industrial Belt'],
  ];
  for (const loc of locations) {
    insertLoc.run(...loc);
  }

  // Initial 4 Commodities: Soybean, Wheat, Jowar, Tamarind
  const insertComm = db.prepare(
    'INSERT INTO commodities (id, code, name_en, name_mr, default_cutting_rule, custom_cutting_percent, cutting_impact, default_rate_per_quintal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const commodities = [
    ['comm_soybean', 'SOYBEAN', 'Soybean', 'सोयाबीन', 'RULE_10G_PER_KG', 1.0, 'settlement_only', 4600],
    ['comm_wheat', 'WHEAT', 'Wheat (Lokwan)', 'गहू (लोकवन)', 'RULE_10G_PER_KG', 1.0, 'settlement_only', 2850],
    ['comm_jowar', 'JOWAR', 'Jowar (Maldandi)', 'ज्वारी (मालदांडी)', 'RULE_2KG_PER_100KG', 2.0, 'settlement_only', 3400],
    ['comm_tamarind', 'TAMARIND', 'Tamarind (Dry)', 'चिंच (कोरडी)', 'RULE_2KG_PER_100KG', 2.0, 'settlement_only', 6800],
  ];
  for (const c of commodities) {
    insertComm.run(...c);
  }

  // Initialize zero stock balances for all location x commodity pairs
  const insertStock = db.prepare(
    'INSERT INTO stock_balances (location_id, commodity_id, qty_kg, total_value, avg_cost_per_kg) VALUES (?, ?, 0, 0, 0)'
  );
  for (const loc of locations) {
    for (const c of commodities) {
      insertStock.run(loc[0], c[0]);
    }
  }

  // Financial Accounts (Cashboxes and Bank Accounts with UPI linked to Bank Accounts)
  const insertAcc = db.prepare(
    'INSERT INTO financial_accounts (id, name, type, bank_name, account_number, upi_id, supports_upi, location_id, opening_balance, current_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const openCash1 = isDemo ? 250000 : 0;
  const openCashGodown = isDemo ? 120000 : 0;
  const openBankSbi = isDemo ? 850000 : 0;
  const openBankHdfc = isDemo ? 420000 : 0;

  insertAcc.run('acc_cash_shop1', 'Main Market Shop Cashbox (गल्ला १)', 'CASH', null, null, null, 0, 'loc_shop1', openCash1, openCash1);
  insertAcc.run('acc_cash_godown', 'Godown & Secondary Cashbox (गल्ला २)', 'CASH', null, null, null, 0, 'loc_godown', openCashGodown, openCashGodown);
  insertAcc.run('acc_bank_sbi', 'SBI Current A/c - 4092 (UPI Linked)', 'BANK', 'State Bank of India', 'XXXX4092', 'saisamarth.sbi@okaxis', 1, null, openBankSbi, openBankSbi);
  insertAcc.run('acc_bank_hdfc', 'HDFC Vyapar A/c - 8821 (UPI Linked)', 'BANK', 'HDFC Bank', 'XXXX8821', 'saisamarth.hdfc@okhdfcbank', 1, null, openBankHdfc, openBankHdfc);

  if (!isDemo) {
    // Real environment starts completely clean with zero sample parties or transactions!
    return;
  }

  // Seed realistic Demo Parties and Transactions ONLY in dbDemo
  const insertParty = db.prepare(
    'INSERT INTO parties (id, type, name, mobile, village_or_city, gst_or_pan, opening_balance, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertParty.run('pty_farmer1', 'farmer', 'Balasaheb Shinde', '9822011223', 'Shirur Kasar', '', 0, 'Regular soybean & wheat cultivator');
  insertParty.run('pty_farmer2', 'farmer', 'mahadev Pawar', '9423109876', 'Georai', '', 0, 'Brings tempo loads of Jowar & Soybean');
  insertParty.run('pty_farmer3', 'farmer', 'Santosh Kadam', '9765401122', 'Wadwani', '', 0, 'Tamarind & Soybean supplier');
  insertParty.run('pty_cust1', 'customer', 'Kalyani Agro Solvent Extractions Pvt Ltd', '9890044556', 'Latur MIDC', '27AABCK1234F1Z5', 0, 'Bulk Soybean factory buyer');
  insertParty.run('pty_cust2', 'customer', 'Deccan Roller Flour & Pulse Mills', '9823077889', 'Aurangabad MIDC', '27AADCD9876B1Z2', 0, 'Wheat & Jowar wholesale buyer');
  insertParty.run('pty_cust3', 'customer', 'Laxmi Spices & Tamarind Processors', '9921033445', 'Solapur', '27AAECL5544M1Z9', 0, 'Tamarind processor');

  // Demo Purchase 1: Balasaheb Shinde - 3000 kg gross, 500 kg tare = 2500 kg (25 Quintal) Soybean at Shop 1
  // Rule 1 cutting (1% = 25 kg) settlement_only, Moisture (1% = 25 kg) settlement_only
  // Payable = 2450 kg, Physical stock received = 2500 kg! Rate = ₹4,600/quintal (₹46/kg) => ₹1,12,700
  // Immediate UPI payment from SBI = ₹72,700, Farmer Balance Payable = ₹40,000
  // Inbound Hamali ₹1,300 capitalized as landed_cost => Total carrying value = ₹1,14,000 for 2500 kg (Avg cost = ₹45.60/kg)
  const p1Deductions: DeductionLineInput[] = [
    { type: 'cutting', label: 'Rule 1 Cutting (10g/kg = 1%)', mode: 'percent', value: 1, impact: 'settlement_only' },
    { type: 'moisture', label: 'Moisture Deduction (1%)', mode: 'percent', value: 1, impact: 'settlement_only' },
  ];
  db.prepare(`
    INSERT INTO purchases (
      id, purchase_number, idempotency_key, date, status, party_id, farmer_name, farmer_mobile, farmer_village,
      location_id, commodity_id, weighing_mode, gross_weight_kg, tare_weight_kg, material_input_kg,
      cutting_rule_applied, deductions_json, payable_deductions_kg, physical_deductions_kg,
      payable_weight_kg, physical_stock_received_kg, rate_value, rate_unit, rate_per_kg,
      purchase_amount, landed_expense_amount, total_carrying_value,
      immediate_payment_amount, paid_amount, balance_amount,
      payment_mode, payment_account_id, payment_reference,
      vehicle_number, weighbridge_slip_ref, remarks, created_by, posted_at
    ) VALUES (?, ?, ?, ?, 'POSTED', ?, ?, ?, ?, ?, ?, 'weighbridge', ?, ?, ?, 'RULE_10G_PER_KG', ?, ?, ?, ?, ?, ?, 'per_quintal', ?, ?, ?, ?, ?, ?, ?, 'UPI', 'acc_bank_sbi', 'UTR632910448', 'MH-23-AB-4412', 'WB-9921', 'Clean dry yellow soybean load', 'owner', datetime('now'))
  `).run(
    'pur_demo_1', 'PUR-2026-0001', 'idem_pur_1', '2026-11-14',
    'pty_farmer1', 'Balasaheb Shinde', '9822011223', 'Shirur Kasar',
    'loc_shop1', 'comm_soybean', 3000, 500, 2500,
    JSON.stringify(p1Deductions), 50, 0,
    2450, 2500, 4600, 46,
    112700, 1300, 114000,
    72700, 72700, 40000
  );

  // Update Shop 1 Soybean stock: 2500 kg, value 114000, avg 45.60
  db.prepare(`
    UPDATE stock_balances SET qty_kg = 2500, total_value = 114000, avg_cost_per_kg = 45.6 WHERE location_id = 'loc_shop1' AND commodity_id = 'comm_soybean'
  `).run();

  db.prepare(`
    INSERT INTO stock_movements (
      id, movement_number, date, movement_type, location_id, commodity_id,
      qty_change_kg, unit_cost_per_kg, value_change, resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
      reference_doc_id, reference_doc_number, vehicle_number, notes, created_by
    ) VALUES ('mov_demo_1', 'MOV-2026-0001', '2026-11-14', 'PURCHASE', 'loc_shop1', 'comm_soybean', 2500, 45.6, 114000, 2500, 114000, 45.6, 'pur_demo_1', 'PUR-2026-0001', 'MH-23-AB-4412', 'Physical stock received (50kg settlement-only deduction did not reduce physical bags)', 'owner')
  `).run();

  // Payment record for Purchase 1
  db.prepare(`
    INSERT INTO payments (
      id, payment_number, idempotency_key, date, direction, category,
      party_id, party_name, party_mobile, amount, mode, account_id, reference_number,
      linked_purchase_id, allocations_json, notes, created_by
    ) VALUES ('pay_demo_1', 'PAY-2026-0001', 'idem_pay_1', '2026-11-14', 'OUTFLOW', 'FARMER_PAYMENT', 'pty_farmer1', 'Balasaheb Shinde', '9822011223', 72700, 'UPI', 'acc_bank_sbi', 'UTR632910448', 'pur_demo_1', ?, 'Immediate UPI settlement on PUR-2026-0001', 'owner')
  `).run(JSON.stringify([{ docId: 'pur_demo_1', docNumber: 'PUR-2026-0001', amount: 72700 }]));

  db.prepare(`UPDATE financial_accounts SET current_balance = current_balance - 72700 WHERE id = 'acc_bank_sbi'`).run();

  // Landed cost expense record for Purchase 1 (paid in cash from Shop 1 Cashbox)
  db.prepare(`
    INSERT INTO expenses (
      id, expense_number, idempotency_key, date, category, classification,
      amount, paid_amount, balance_amount, payment_status, location_id, is_shared_premises,
      payee_name, linked_purchase_id, commodity_id, bill_reference, notes, created_by
    ) VALUES ('exp_demo_1', 'EXP-2026-0001', 'idem_exp_1', '2026-11-14', 'HAMALI', 'landed_cost', 1300, 1300, 0, 'PAID', 'loc_shop1', 0, 'Market Yard Hamal Toli #4', 'pur_demo_1', 'comm_soybean', 'HML-104', 'Inbound unloading & weighing hamali capitalized into Soybean inventory cost', 'owner')
  `).run();
  db.prepare(`UPDATE financial_accounts SET current_balance = current_balance - 1300 WHERE id = 'acc_cash_shop1'`).run();
  db.prepare(`
    INSERT INTO payments (
      id, payment_number, idempotency_key, date, direction, category,
      party_name, amount, mode, account_id, reference_number, linked_expense_id, notes, created_by
    ) VALUES ('pay_demo_2', 'PAY-2026-0002', 'idem_pay_2', '2026-11-14', 'OUTFLOW', 'EXPENSE_PAYMENT', 'Market Yard Hamal Toli #4', 1300, 'CASH', 'acc_cash_shop1', 'HML-104', 'exp_demo_1', 'Paid inbound hamali on PUR-2026-0001', 'owner')
  `).run();

  // Demo Purchase 2: Mahadev Pawar - Direct 1500 kg (15 Quintal) Wheat at Shop 2
  // Rule 1 cutting (1% = 15 kg) settlement_only, Dust sieved (5 kg) impact = 'both'
  // Payable = 1500 - 20 = 1480 kg; Physical stock received = 1500 - 5 = 1495 kg!
  // Rate = ₹2,850/quintal (₹28.50/kg) => 1480 * 28.50 = ₹42,180. Paid ₹42,180 Cash in full.
  const p2Deductions: DeductionLineInput[] = [
    { type: 'cutting', label: 'Rule 1 Cutting (10g/kg = 1%)', mode: 'percent', value: 1, impact: 'settlement_only' },
    { type: 'dust', label: 'Physical Chaff/Stones Removed', mode: 'kg', value: 5, impact: 'both' },
  ];
  const p2AvgCost = round4(42180 / 1495); // 28.214
  db.prepare(`
    INSERT INTO purchases (
      id, purchase_number, idempotency_key, date, status, party_id, farmer_name, farmer_mobile, farmer_village,
      location_id, commodity_id, weighing_mode, gross_weight_kg, tare_weight_kg, material_input_kg,
      cutting_rule_applied, deductions_json, payable_deductions_kg, physical_deductions_kg,
      payable_weight_kg, physical_stock_received_kg, rate_value, rate_unit, rate_per_kg,
      purchase_amount, landed_expense_amount, total_carrying_value,
      immediate_payment_amount, paid_amount, balance_amount,
      payment_mode, payment_account_id, payment_reference,
      vehicle_number, weighbridge_slip_ref, remarks, created_by, posted_at
    ) VALUES (?, ?, ?, ?, 'POSTED', ?, ?, ?, ?, ?, ?, 'direct', 0, 0, 1500, 'RULE_10G_PER_KG', ?, 20, 5, 1480, 1495, 2850, 'per_quintal', 28.5, 42180, 0, 42180, 42180, 42180, 0, 'CASH', 'acc_cash_shop1', 'CASH-VCH-12', 'MH-20-CT-1908', 'SHOP2-SCALE', '30 kattas of Lokwan wheat', 'owner', datetime('now'))
  `).run(
    'pur_demo_2', 'PUR-2026-0002', 'idem_pur_2', '2026-11-14',
    'pty_farmer2', 'Mahadev Pawar', '9423109876', 'Georai',
    'loc_shop2', 'comm_wheat',
    JSON.stringify(p2Deductions)
  );
  db.prepare(`
    UPDATE stock_balances SET qty_kg = 1495, total_value = 42180, avg_cost_per_kg = ? WHERE location_id = 'loc_shop2' AND commodity_id = 'comm_wheat'
  `).run(p2AvgCost);
  db.prepare(`
    INSERT INTO stock_movements (
      id, movement_number, date, movement_type, location_id, commodity_id,
      qty_change_kg, unit_cost_per_kg, value_change, resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
      reference_doc_id, reference_doc_number, vehicle_number, notes, created_by
    ) VALUES ('mov_demo_2', 'MOV-2026-0002', '2026-11-14', 'PURCHASE', 'loc_shop2', 'comm_wheat', 1495, ?, 42180, 1495, 42180, ?, 'pur_demo_2', 'PUR-2026-0002', 'MH-20-CT-1908', '1495 kg physical received after 5 kg physical dust removal', 'owner')
  `).run(p2AvgCost, p2AvgCost);
  db.prepare(`
    INSERT INTO payments (
      id, payment_number, idempotency_key, date, direction, category,
      party_id, party_name, party_mobile, amount, mode, account_id, reference_number,
      linked_purchase_id, allocations_json, notes, created_by
    ) VALUES ('pay_demo_3', 'PAY-2026-0003', 'idem_pay_3', '2026-11-14', 'OUTFLOW', 'FARMER_PAYMENT', 'pty_farmer2', 'Mahadev Pawar', '9423109876', 42180, 'CASH', 'acc_cash_shop1', 'CASH-VCH-12', 'pur_demo_2', ?, 'Full cash payment for Wheat PUR-2026-0002', 'owner')
  `).run(JSON.stringify([{ docId: 'pur_demo_2', docNumber: 'PUR-2026-0002', amount: 42180 }]));
  db.prepare(`UPDATE financial_accounts SET current_balance = current_balance - 42180 WHERE id = 'acc_cash_shop1'`).run();

  // Demo Stock Transfer: Transfer 1000 kg Soybean from Shop 1 to Central Godown preserving ₹45.60/kg carrying cost (₹45,600)
  db.prepare(`
    UPDATE stock_balances SET qty_kg = 1500, total_value = 68400, avg_cost_per_kg = 45.6 WHERE location_id = 'loc_shop1' AND commodity_id = 'comm_soybean'
  `).run();
  db.prepare(`
    UPDATE stock_balances SET qty_kg = 1000, total_value = 45600, avg_cost_per_kg = 45.6 WHERE location_id = 'loc_godown' AND commodity_id = 'comm_soybean'
  `).run();
  db.prepare(`
    INSERT INTO stock_movements (
      id, movement_number, date, movement_type, location_id, counterpart_location_id, commodity_id,
      qty_change_kg, unit_cost_per_kg, value_change, resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
      reference_doc_number, vehicle_number, notes, created_by
    ) VALUES ('mov_demo_3', 'MOV-2026-0003', '2026-11-14', 'TRANSFER_OUT', 'loc_shop1', 'loc_godown', 'comm_soybean', -1000, 45.6, -45600, 1500, 68400, 45.6, 'TRF-2026-0001', 'MH-23-G-7711', 'Internal transfer to Central Godown at carrying cost', 'owner')
  `).run();
  db.prepare(`
    INSERT INTO stock_movements (
      id, movement_number, date, movement_type, location_id, counterpart_location_id, commodity_id,
      qty_change_kg, unit_cost_per_kg, value_change, resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
      reference_doc_number, vehicle_number, notes, created_by
    ) VALUES ('mov_demo_4', 'MOV-2026-0004', '2026-11-14', 'TRANSFER_IN', 'loc_godown', 'loc_shop1', 'comm_soybean', 1000, 45.6, 45600, 1000, 45600, 45.6, 'TRF-2026-0001', 'MH-23-G-7711', 'Received from Shop 1 at carrying cost (no profit booked)', 'owner')
  `).run();

  // Demo Sale 1: Dispatch 1000 kg Soybean from Shop 1 to Kalyani Agro Solvent Extractions
  // Dispatched = 1000 kg (COGS = 1000 * 45.60 = ₹45,600), Factory Billable = 992 kg (8 kg factory lab moisture deduction)
  // Selling rate = ₹5,150/quintal (₹51.50/kg) => Revenue = 992 * 51.50 = ₹51,088
  // Gross profit = 51088 - 45600 = ₹5,488
  // Received ₹31,088 via Bank Transfer to HDFC, Balance Receivable = ₹20,000
  db.prepare(`
    INSERT INTO sales (
      id, invoice_number, idempotency_key, date, due_date, status,
      party_id, customer_name, customer_mobile, customer_city,
      location_id, commodity_id, vehicle_number,
      dispatched_kg, billable_kg, weight_diff_kg, weight_diff_explanation,
      selling_rate_value, selling_rate_unit, selling_rate_per_kg,
      sale_amount, avg_cost_per_kg_at_sale, cogs_amount, gross_profit,
      immediate_collection_amount, received_amount, balance_amount,
      collection_mode, collection_account_id, collection_reference,
      remarks, created_by, posted_at
    ) VALUES (
      'sal_demo_1', 'INV-2026-0001', 'idem_sal_1', '2026-11-15', '2026-11-22', 'POSTED',
      'pty_cust1', 'Kalyani Agro Solvent Extractions Pvt Ltd', '9890044556', 'Latur MIDC',
      'loc_shop1', 'comm_soybean', 'MH-24-AU-9090',
      1000, 992, -8, 'Factory lab moisture test deduction of 8 kg (0.8%) on kanta slip #L-442',
      5150, 'per_quintal', 51.5,
      51088, 45.6, 45600, 5488,
      31088, 31088, 20000,
      'BANK_TRANSFER', 'acc_bank_hdfc', 'NEFT-KALYANI-881',
      'Part collection received via NEFT; balance due in 7 days', 'owner', datetime('now')
    )
  `).run();

  // Update Shop 1 Soybean stock after 1000 kg sale: 500 kg remaining, value ₹22,800, avg ₹45.60/kg
  db.prepare(`
    UPDATE stock_balances SET qty_kg = 500, total_value = 22800, avg_cost_per_kg = 45.6 WHERE location_id = 'loc_shop1' AND commodity_id = 'comm_soybean'
  `).run();
  db.prepare(`
    INSERT INTO stock_movements (
      id, movement_number, date, movement_type, location_id, commodity_id,
      qty_change_kg, unit_cost_per_kg, value_change, resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
      reference_doc_id, reference_doc_number, vehicle_number, notes, created_by
    ) VALUES ('mov_demo_5', 'MOV-2026-0005', '2026-11-15', 'SALE', 'loc_shop1', 'comm_soybean', -1000, 45.6, -45600, 500, 22800, 45.6, 'sal_demo_1', 'INV-2026-0001', 'MH-24-AU-9090', 'Dispatched 1000 kg physical stock (billed 992 kg)', 'owner')
  `).run();
  db.prepare(`
    INSERT INTO payments (
      id, payment_number, idempotency_key, date, direction, category,
      party_id, party_name, party_mobile, amount, mode, account_id, reference_number,
      linked_sale_id, allocations_json, notes, created_by
    ) VALUES ('pay_demo_4', 'PAY-2026-0004', 'idem_pay_4', '2026-11-15', 'INFLOW', 'CUSTOMER_COLLECTION', 'pty_cust1', 'Kalyani Agro Solvent Extractions Pvt Ltd', '9890044556', 31088, 'BANK_TRANSFER', 'acc_bank_hdfc', 'NEFT-KALYANI-881', 'sal_demo_1', ?, 'Immediate partial NEFT collection on INV-2026-0001', 'owner')
  `).run(JSON.stringify([{ docId: 'sal_demo_1', docNumber: 'INV-2026-0001', amount: 31088 }]));
  db.prepare(`UPDATE financial_accounts SET current_balance = current_balance + 31088 WHERE id = 'acc_bank_hdfc'`).run();

  // Demo Operating Expense: Outbound tempo freight ₹1,450 (operating_expense)
  db.prepare(`
    INSERT INTO expenses (
      id, expense_number, idempotency_key, date, category, classification,
      amount, paid_amount, balance_amount, payment_status, location_id, is_shared_premises,
      payee_name, linked_sale_id, commodity_id, bill_reference, notes, created_by
    ) VALUES ('exp_demo_2', 'EXP-2026-0002', 'idem_exp_2', '2026-11-15', 'TRANSPORTATION', 'operating_expense', 1450, 1450, 0, 'PAID', 'loc_shop1', 0, 'Shree Ganesh Tempo Transport', 'sal_demo_1', 'comm_soybean', 'LR-552', 'Dispatch tempo freight for Kalyani Agro delivery', 'owner')
  `).run();
  db.prepare(`UPDATE financial_accounts SET current_balance = current_balance - 1450 WHERE id = 'acc_cash_shop1'`).run();
  db.prepare(`
    INSERT INTO payments (
      id, payment_number, idempotency_key, date, direction, category,
      party_name, amount, mode, account_id, reference_number, linked_expense_id, notes, created_by
    ) VALUES ('pay_demo_5', 'PAY-2026-0005', 'idem_pay_5', '2026-11-15', 'OUTFLOW', 'EXPENSE_PAYMENT', 'Shree Ganesh Tempo Transport', 1450, 'CASH', 'acc_cash_shop1', 'LR-552', 'exp_demo_2', 'Paid dispatch tempo freight', 'owner')
  `).run();
}

seedMasterEntities(dbDemo, true);
seedMasterEntities(dbReal, false);

// Active sessions in memory (plus deterministic tokens so page refreshes never lose session)
interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: 'owner' | 'staff' | 'viewer';
  assignedLocationId: string | null;
}

const sessions = new Map<string, SessionUser>();
// Pre-populate deterministic tokens for seamless experience
sessions.set('token_owner_default', {
  id: 'usr_owner',
  username: 'owner',
  fullName: 'Samarth Patil (Owner)',
  role: 'owner',
  assignedLocationId: null,
});
sessions.set('token_staff_default', {
  id: 'usr_staff1',
  username: 'staff',
  fullName: 'Ramesh Jadhav (Shop 1 & 2)',
  role: 'staff',
  assignedLocationId: 'loc_shop1',
});
sessions.set('token_viewer_default', {
  id: 'usr_viewer',
  username: 'viewer',
  fullName: 'CA Kulkarni (Auditor / Viewer)',
  role: 'viewer',
  assignedLocationId: null,
});

function getDbForRequest(req: Request): { db: Database.Database; envMode: 'demo' | 'real' } {
  const modeHeader = (req.headers['x-app-env'] as string) || (req.query.env as string) || 'demo';
  const envMode = modeHeader === 'real' ? 'real' : 'demo';
  return {
    db: envMode === 'real' ? dbReal : dbDemo,
    envMode,
  };
}

function getUserFromRequest(req: Request): SessionUser {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = sessions.get(token);
    if (user) return user;
  }
  return sessions.get('token_owner_default')!;
}

function requireRole(allowedRoles: Array<'owner' | 'staff' | 'viewer'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getUserFromRequest(req);
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: `Access denied: role '${user.role}' is not authorized for this action. Required: ${allowedRoles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}

function writeAudit(
  db: Database.Database,
  user: SessionUser,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  details?: unknown
) {
  db.prepare(`
    INSERT INTO audit_logs (id, username, role, action, entity_type, entity_id, summary, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user.username,
    user.role,
    action,
    entityType,
    entityId,
    summary,
    details ? JSON.stringify(details) : null
  );
}

function nextDocNumber(db: Database.Database, table: string, col: string, prefix: string): string {
  const year = new Date().getFullYear();
  const countObj = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
  const seq = String(countObj.c + 1).padStart(4, '0');
  const candidate = `${prefix}-${year}-${seq}`;
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE ${col} = ?`).get(candidate);
  if (exists) {
    return `${prefix}-${year}-${seq}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }
  return candidate;
}

const app = express();
app.use(express.json({ limit: '10mb' }));

// --- AUTH ROUTES ---
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  const { db } = getDbForRequest(req);
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const row = db
    .prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND active = 1')
    .get(username.trim()) as
    | {
        id: string;
        username: string;
        password_hash: string;
        full_name: string;
        role: 'owner' | 'staff' | 'viewer';
        assigned_location_id: string | null;
      }
    | undefined;

  if (!row || row.password_hash !== hashPassword(password)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const sessionUser: SessionUser = {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    assignedLocationId: row.assigned_location_id,
  };

  const token =
    row.username === 'owner'
      ? 'token_owner_default'
      : row.username === 'staff'
      ? 'token_staff_default'
      : row.username === 'viewer'
      ? 'token_viewer_default'
      : `tok_${crypto.randomUUID()}`;

  sessions.set(token, sessionUser);
  res.json({ token, user: sessionUser });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const user = getUserFromRequest(req);
  res.json({ user });
});

// --- BOOTSTRAP STATE ROUTE ---
app.get('/api/bootstrap', (req: Request, res: Response) => {
  const { db, envMode } = getDbForRequest(req);
  const user = getUserFromRequest(req);

  const settingsRows = db.prepare('SELECT key, value FROM business_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const settings: Record<string, string> = {};
  for (const r of settingsRows) {
    settings[r.key] = r.value;
  }

  const locations = db
    .prepare("SELECT * FROM locations WHERE active = 1 ORDER BY CASE WHEN type = 'shop' THEN 0 ELSE 1 END, code ASC")
    .all();
  const commodities = db
    .prepare(
      "SELECT * FROM commodities WHERE active = 1 ORDER BY CASE code WHEN 'SOYBEAN' THEN 1 WHEN 'WHEAT' THEN 2 WHEN 'JOWAR' THEN 3 WHEN 'TAMARIND' THEN 4 ELSE 5 END, name_en ASC"
    )
    .all();
  const accounts = db.prepare('SELECT * FROM financial_accounts WHERE active = 1 ORDER BY id').all();
  const parties = db.prepare('SELECT * FROM parties ORDER BY name').all();
  const stockBalances = db.prepare('SELECT * FROM stock_balances').all();
  const purchases = db.prepare('SELECT * FROM purchases ORDER BY created_at DESC, id DESC').all();
  const sales = db.prepare('SELECT * FROM sales ORDER BY created_at DESC, id DESC').all();
  const payments = db.prepare('SELECT * FROM payments ORDER BY date DESC, created_at DESC').all();
  const stockMovements = db
    .prepare('SELECT * FROM stock_movements ORDER BY created_at DESC, id DESC LIMIT 300')
    .all();
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY date DESC, created_at DESC').all();
  const users = db
    .prepare('SELECT id, username, full_name, role, assigned_location_id, active, created_at FROM users')
    .all();
  const auditLogs = db
    .prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100')
    .all();

  res.json({
    envMode,
    user,
    settings,
    locations,
    commodities,
    accounts,
    parties,
    stockBalances,
    purchases,
    sales,
    payments,
    stockMovements,
    expenses,
    users,
    auditLogs,
  });
});

// --- SETTINGS & OWNER CONFIRMATIONS ---
app.post('/api/settings/confirm-cutting-rule', requireRole(['owner']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { defaultRule, commodityRules } = req.body as {
    defaultRule: CuttingRuleCode;
    commodityRules?: Array<{
      commodityId: string;
      rule: CuttingRuleCode;
      customPercent?: number;
      impact?: 'settlement_only' | 'both' | 'physical_only';
    }>;
  };

  if (!defaultRule || !['RULE_10G_PER_KG', 'RULE_2KG_PER_100KG', 'CUSTOM'].includes(defaultRule)) {
    res.status(400).json({ error: 'Valid cutting rule selection is required' });
    return;
  }

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT OR REPLACE INTO business_settings (key, value, updated_at, updated_by) VALUES (?, ?, datetime("now"), ?)'
    ).run('default_cutting_rule', defaultRule, user.username);
    db.prepare(
      'INSERT OR REPLACE INTO business_settings (key, value, updated_at, updated_by) VALUES (?, ?, datetime("now"), ?)'
    ).run('cutting_rule_confirmed', '1', user.username);

    if (Array.isArray(commodityRules)) {
      const upd = db.prepare(
        'UPDATE commodities SET default_cutting_rule = ?, custom_cutting_percent = ?, cutting_impact = ? WHERE id = ?'
      );
      for (const cr of commodityRules) {
        const pct =
          cr.rule === 'RULE_10G_PER_KG'
            ? 1.0
            : cr.rule === 'RULE_2KG_PER_100KG'
            ? 2.0
            : Number(cr.customPercent || 0);
        upd.run(cr.rule, pct, cr.impact || 'settlement_only', cr.commodityId);
      }
    }

    writeAudit(
      db,
      user,
      'CONFIRM_CUTTING_RULE',
      'business_settings',
      'cutting_rule_confirmed',
      `Owner confirmed cutting rule: ${defaultRule}`,
      { defaultRule, commodityRules }
    );
  });

  tx();
  res.json({ ok: true });
});

app.post('/api/settings/confirm-rent-template', requireRole(['owner']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { monthlyAmount, premisesScope, payeeName } = req.body as {
    monthlyAmount: number;
    premisesScope: string;
    payeeName: string;
  };

  const cleanAmount = round2(Number(monthlyAmount || 40000));
  const tx = db.transaction(() => {
    const upsert = db.prepare(
      'INSERT OR REPLACE INTO business_settings (key, value, updated_at, updated_by) VALUES (?, ?, datetime("now"), ?)'
    );
    upsert.run('rent_monthly_amount', String(cleanAmount), user.username);
    upsert.run('rent_premises_scope', premisesScope || 'ALL_PREMISES_COMBINED', user.username);
    upsert.run('rent_payee_name', payeeName || 'Landlord', user.username);
    upsert.run('rent_premises_confirmed', '1', user.username);

    writeAudit(
      db,
      user,
      'CONFIRM_RENT_TEMPLATE',
      'business_settings',
      'rent_template',
      `Owner confirmed recurring monthly rent template: ₹${cleanAmount} (${premisesScope})`,
      { monthlyAmount: cleanAmount, premisesScope, payeeName }
    );
  });
  tx();
  res.json({ ok: true });
});

// Guided Opening Setup (Prompt 1 & Prompt 4: Reviewed Opening Date + Duplicate Opening Import Prevention)
app.post('/api/settings/opening-setup', requireRole(['owner']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const {
    openingDate,
    cuttingRule,
    rentMonthlyAmount,
    rentPremisesScope,
    openingStocks,
    accountBalances,
  } = req.body as {
    openingDate: string;
    cuttingRule?: CuttingRuleCode;
    rentMonthlyAmount?: number;
    rentPremisesScope?: string;
    openingStocks?: Array<{ locationId: string; commodityId: string; qtyKg: number; unitCostPerKg: number }>;
    accountBalances?: Array<{ accountId: string; openingBalance: number }>;
  };

  if (!openingDate) {
    res.status(400).json({ error: 'A reviewed opening setup date is required.' });
    return;
  }

  const alreadyLocked = db
    .prepare("SELECT value FROM business_settings WHERE key = 'opening_setup_locked'")
    .get() as { value: string } | undefined;

  if (alreadyLocked?.value === '1') {
    res.status(400).json({
      error:
        'Guided Opening Setup has already been completed and locked for this environment. Duplicate opening imports are prevented to protect ledger integrity.',
    });
    return;
  }

  try {
    db.transaction(() => {
      const upsert = db.prepare(
        'INSERT OR REPLACE INTO business_settings (key, value, updated_at, updated_by) VALUES (?, ?, datetime("now"), ?)'
      );
      upsert.run('opening_setup_date', openingDate, user.username);
      upsert.run('opening_setup_locked', '1', user.username);

      if (cuttingRule) {
        upsert.run('default_cutting_rule', cuttingRule, user.username);
        upsert.run('cutting_rule_confirmed', '1', user.username);
      }
      if (rentMonthlyAmount !== undefined) {
        upsert.run('rent_monthly_amount', String(round2(Number(rentMonthlyAmount))), user.username);
        upsert.run('rent_premises_scope', rentPremisesScope || 'ALL_PREMISES_COMBINED', user.username);
        upsert.run('rent_premises_confirmed', '1', user.username);
      }

      if (Array.isArray(accountBalances)) {
        for (const ab of accountBalances) {
          const openBal = round2(Math.max(0, Number(ab.openingBalance || 0)));
          db.prepare(
            'UPDATE financial_accounts SET opening_balance = ?, current_balance = ROUND(current_balance + (? - opening_balance), 2) WHERE id = ?'
          ).run(openBal, openBal, ab.accountId);
        }
      }

      if (Array.isArray(openingStocks)) {
        for (const os of openingStocks) {
          const cleanKg = round3(Math.max(0, Number(os.qtyKg || 0)));
          const cleanCost = round6(Math.max(0, Number(os.unitCostPerKg || 0)));
          if (cleanKg <= 0) continue;

          const curRow = db
            .prepare('SELECT qty_kg, total_value, avg_cost_per_kg FROM stock_balances WHERE location_id = ? AND commodity_id = ?')
            .get(os.locationId, os.commodityId) as
            | { qty_kg: number; total_value: number; avg_cost_per_kg: number }
            | undefined;

          const addedVal = round2(cleanKg * cleanCost);
          const nextState = applyStockAddition(
            {
              qtyKg: curRow?.qty_kg || 0,
              totalValue: curRow?.total_value || 0,
              avgCostPerKg: curRow?.avg_cost_per_kg || 0,
            },
            cleanKg,
            addedVal
          );

          db.prepare(
            'UPDATE stock_balances SET qty_kg = ?, total_value = ?, avg_cost_per_kg = ?, updated_at = datetime("now") WHERE location_id = ? AND commodity_id = ?'
          ).run(nextState.qtyKg, nextState.totalValue, nextState.avgCostPerKg, os.locationId, os.commodityId);

          const movNum = nextDocNumber(db, 'stock_movements', 'movement_number', 'MOV');
          db.prepare(`
            INSERT INTO stock_movements (
              id, movement_number, date, movement_type, location_id, commodity_id,
              qty_change_kg, unit_cost_per_kg, value_change,
              resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
              notes, created_by
            ) VALUES (?, ?, ?, 'OPENING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `mov_open_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
            movNum,
            openingDate,
            os.locationId,
            os.commodityId,
            cleanKg,
            cleanCost,
            addedVal,
            nextState.qtyKg,
            nextState.totalValue,
            nextState.avgCostPerKg,
            `Guided Opening Setup (${openingDate}) — separate from period purchases`,
            user.username
          );
        }
      }

      writeAudit(
        db,
        user,
        'COMPLETE_OPENING_SETUP',
        'business_settings',
        'opening_setup_locked',
        `Completed and locked Guided Opening Setup as of ${openingDate}`
      );
    })();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Own-Account Transfer (Cashbox <-> Bank Account without affecting revenue, expenses, or trading profit)
app.post('/api/accounts/transfer', requireRole(['owner', 'staff']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { date, fromAccountId, toAccountId, amount, referenceNumber, notes } = req.body as {
    date: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    referenceNumber?: string;
    notes?: string;
  };

  const cleanAmt = round2(Number(amount || 0));
  if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || cleanAmt <= 0) {
    res.status(400).json({ error: 'Distinct source account, destination account, and positive transfer amount are required.' });
    return;
  }

  try {
    db.transaction(() => {
      const fromAcc = db.prepare('SELECT id, name, current_balance FROM financial_accounts WHERE id = ?').get(fromAccountId) as
        | { id: string; name: string; current_balance: number }
        | undefined;
      const toAcc = db.prepare('SELECT id, name, current_balance FROM financial_accounts WHERE id = ?').get(toAccountId) as
        | { id: string; name: string; current_balance: number }
        | undefined;

      if (!fromAcc || !toAcc) throw new Error('Source or destination financial account not found.');

      db.prepare('UPDATE financial_accounts SET current_balance = ROUND(current_balance - ?, 2) WHERE id = ?').run(
        cleanAmt,
        fromAccountId
      );
      db.prepare('UPDATE financial_accounts SET current_balance = ROUND(current_balance + ?, 2) WHERE id = ?').run(
        cleanAmt,
        toAccountId
      );

      writeAudit(
        db,
        user,
        'ACCOUNT_CONTRA_TRANSFER',
        'financial_accounts',
        `${fromAccountId}->${toAccountId}`,
        `Contra transfer on ${date || new Date().toISOString().slice(0, 10)}: ₹${cleanAmt} from ${fromAcc.name} to ${toAcc.name} (${referenceNumber || 'Internal'}) — zero impact on trading profit`,
        { date, fromAccountId, toAccountId, amount: cleanAmt, referenceNumber, notes }
      );
    })();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/settings/commodities', requireRole(['owner']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { id, code, nameEn, nameMr, defaultCuttingRule, customCuttingPercent, cuttingImpact, defaultRatePerQuintal } =
    req.body as {
      id?: string;
      code: string;
      nameEn: string;
      nameMr: string;
      defaultCuttingRule: CuttingRuleCode;
      customCuttingPercent?: number;
      cuttingImpact?: 'settlement_only' | 'both' | 'physical_only';
      defaultRatePerQuintal?: number;
    };

  if (!nameEn || !code) {
    res.status(400).json({ error: 'Commodity code and English name are required' });
    return;
  }

  const pct =
    defaultCuttingRule === 'RULE_10G_PER_KG'
      ? 1.0
      : defaultCuttingRule === 'RULE_2KG_PER_100KG'
      ? 2.0
      : round3(Number(customCuttingPercent || 0));

  const tx = db.transaction(() => {
    const commId = id || `comm_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`;
    db.prepare(`
      INSERT OR REPLACE INTO commodities (
        id, code, name_en, name_mr, default_cutting_rule, custom_cutting_percent, cutting_impact, default_rate_per_quintal, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      commId,
      code.toUpperCase().trim(),
      nameEn.trim(),
      (nameMr || nameEn).trim(),
      defaultCuttingRule,
      pct,
      cuttingImpact || 'settlement_only',
      round2(Number(defaultRatePerQuintal || 0))
    );

    // Ensure stock_balances rows exist for all locations
    const locs = db.prepare('SELECT id FROM locations').all() as Array<{ id: string }>;
    const insStock = db.prepare(
      'INSERT OR IGNORE INTO stock_balances (location_id, commodity_id, qty_kg, total_value, avg_cost_per_kg) VALUES (?, ?, 0, 0, 0)'
    );
    for (const l of locs) {
      insStock.run(l.id, commId);
    }

    writeAudit(db, user, 'UPSERT_COMMODITY', 'commodities', commId, `Saved commodity ${nameEn} (${code})`);
  });

  tx();
  res.json({ ok: true });
});

app.post('/api/settings/accounts', requireRole(['owner']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { name, type, bankName, accountNumber, upiId, supportsUpi, locationId, openingBalance } = req.body as {
    name: string;
    type: 'CASH' | 'BANK';
    bankName?: string;
    accountNumber?: string;
    upiId?: string;
    supportsUpi?: boolean;
    locationId?: string;
    openingBalance?: number;
  };

  if (!name || !type) {
    res.status(400).json({ error: 'Account name and type (CASH or BANK) are required' });
    return;
  }

  const openBal = round2(Number(openingBalance || 0));
  const accId = `acc_${Date.now().toString(36)}`;
  db.prepare(`
    INSERT INTO financial_accounts (
      id, name, type, bank_name, account_number, upi_id, supports_upi, location_id, opening_balance, current_balance, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    accId,
    name.trim(),
    type,
    bankName || null,
    accountNumber || null,
    upiId || null,
    type === 'BANK' && supportsUpi ? 1 : 0,
    locationId || null,
    openBal,
    openBal
  );

  writeAudit(db, user, 'CREATE_ACCOUNT', 'financial_accounts', accId, `Created ${type} account ${name}`);
  res.json({ ok: true, id: accId });
});

app.post('/api/settings/users', requireRole(['owner']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { username, password, fullName, role, assignedLocationId } = req.body as {
    username: string;
    password?: string;
    fullName: string;
    role: 'owner' | 'staff' | 'viewer';
    assignedLocationId?: string | null;
  };

  if (!username || !fullName || !role) {
    res.status(400).json({ error: 'Username, full name, and role are required' });
    return;
  }

  const userId = `usr_${username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const pwHash = hashPassword(password || 'saisamarth123');

  db.prepare(`
    INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, assigned_location_id, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(userId, username.trim(), pwHash, fullName.trim(), role, assignedLocationId || null);

  writeAudit(db, user, 'UPSERT_USER', 'users', userId, `Saved user ${username} with role ${role}`);
  res.json({ ok: true });
});

// --- PARTIES DIRECTORY ---
app.post('/api/parties', requireRole(['owner', 'staff']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { id, type, name, mobile, villageOrCity, gstOrPan, openingBalance, notes } = req.body as {
    id?: string;
    type: 'farmer' | 'customer' | 'supplier' | 'both';
    name: string;
    mobile: string;
    villageOrCity?: string;
    gstOrPan?: string;
    openingBalance?: number;
    notes?: string;
  };

  if (!name || !mobile) {
    res.status(400).json({ error: 'Party name and mobile number are required' });
    return;
  }

  const partyId = id || `pty_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  db.prepare(`
    INSERT OR REPLACE INTO parties (id, type, name, mobile, village_or_city, gst_or_pan, opening_balance, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    partyId,
    type || 'farmer',
    name.trim(),
    mobile.trim(),
    (villageOrCity || '').trim(),
    (gstOrPan || '').trim(),
    round2(Number(openingBalance || 0)),
    (notes || '').trim()
  );

  writeAudit(db, user, 'UPSERT_PARTY', 'parties', partyId, `Saved ${type} party: ${name} (${mobile})`);
  res.json({ ok: true, id: partyId });
});

// --- PURCHASES (DRAFT -> REVIEW -> POST & CONTROLLED REVERSAL) ---
app.post('/api/purchases', requireRole(['owner', 'staff']), (req: Request, res: Response) => {
  const { db, envMode } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const body = req.body as {
    id?: string;
    purchaseNumber?: string;
    idempotencyKey?: string;
    date: string;
    status: 'DRAFT' | 'POSTED';
    partyId?: string;
    farmerName: string;
    farmerMobile: string;
    farmerVillage?: string;
    locationId: string;
    commodityId: string;
    weighingMode: 'direct' | 'weighbridge';
    directWeightKg?: number;
    grossWeightKg?: number;
    tareWeightKg?: number;
    cuttingRuleApplied: CuttingRuleCode;
    deductions: DeductionLineInput[];
    rateValue: number;
    rateUnit: RateUnit;
    landedExpenseAmount?: number;
    landedExpensePayee?: string;
    landedExpenseAccountId?: string;
    immediatePaymentAmount?: number;
    paymentMode?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
    paymentAccountId?: string;
    paymentReference?: string;
    vehicleNumber?: string;
    weighbridgeSlipRef?: string;
    weighbridgePhotoData?: string;
    remarks?: string;
  };

  if (!body.farmerName || !body.farmerMobile || !body.locationId || !body.commodityId) {
    res.status(400).json({ error: 'Farmer name, mobile, receiving location, and commodity are required.' });
    return;
  }

  // Staff location assignment check
  if (user.role === 'staff' && user.assignedLocationId && user.assignedLocationId !== body.locationId) {
    res.status(403).json({
      error: `Staff user '${user.username}' is only authorized for location ${user.assignedLocationId}.`,
    });
    return;
  }

  // Check Cutting Rule confirmation before posting first real purchase
  if (body.status === 'POSTED') {
    const confirmedRow = db
      .prepare("SELECT value FROM business_settings WHERE key = 'cutting_rule_confirmed'")
      .get() as { value: string } | undefined;
    if (!confirmedRow || confirmedRow.value !== '1') {
      res.status(400).json({
        error:
          'OWNER CONFIRMATION REQUIRED: Before posting the first purchase in the Real Business environment, the Owner must confirm the applicable Business Cutting Rule (Rule 1: 10g/kg = 1% vs Rule 2: 2kg/100kg = 2%).',
        code: 'CUTTING_RULE_UNCONFIRMED',
      });
      return;
    }
  }

  // Server-side authoritative calculation
  const calc = calculatePurchase({
    weighingMode: body.weighingMode,
    directWeightKg: Number(body.directWeightKg || 0),
    grossWeightKg: Number(body.grossWeightKg || 0),
    tareWeightKg: Number(body.tareWeightKg || 0),
    deductions: Array.isArray(body.deductions) ? body.deductions : [],
    rateValue: Number(body.rateValue || 0),
    rateUnit: body.rateUnit || 'per_quintal',
    immediatePaymentAmount: Number(body.immediatePaymentAmount || 0),
    landedExpenseAmount: Number(body.landedExpenseAmount || 0),
  });

  if (calc.validationErrors.length > 0) {
    res.status(400).json({ error: calc.validationErrors.join(' ') });
    return;
  }

  if (body.status === 'POSTED' && (calc.materialInputKg <= 0 || calc.payableWeightKg <= 0 || calc.ratePerKg <= 0)) {
    res.status(400).json({
      error: 'Material input weight, payable weight, and purchase rate must be greater than zero to post.',
    });
    return;
  }

  try {
    const result = db.transaction(() => {
      // Idempotency check
      if (body.idempotencyKey) {
        const existingByIdem = db
          .prepare('SELECT id, purchase_number, status FROM purchases WHERE idempotency_key = ?')
          .get(body.idempotencyKey) as { id: string; purchase_number: string; status: string } | undefined;
        if (existingByIdem && existingByIdem.status === 'POSTED') {
          return {
            id: existingByIdem.id,
            purchaseNumber: existingByIdem.purchase_number,
            status: existingByIdem.status,
            deduplicated: true,
          };
        }
      }

      // Ensure party exists or create farmer in directory
      let partyId = body.partyId;
      if (!partyId) {
        const foundParty = db
          .prepare('SELECT id FROM parties WHERE mobile = ?')
          .get(body.farmerMobile.trim()) as { id: string } | undefined;
        if (foundParty) {
          partyId = foundParty.id;
        } else {
          partyId = `pty_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
          db.prepare(
            'INSERT INTO parties (id, type, name, mobile, village_or_city, opening_balance) VALUES (?, ?, ?, ?, ?, 0)'
          ).run(partyId, 'farmer', body.farmerName.trim(), body.farmerMobile.trim(), (body.farmerVillage || '').trim());
        }
      }

      const purchaseId = body.id || `pur_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      const existingPur = db
        .prepare('SELECT purchase_number, status FROM purchases WHERE id = ?')
        .get(purchaseId) as { purchase_number: string; status: string } | undefined;

      if (existingPur && existingPur.status === 'POSTED') {
        throw new Error(`Purchase ${existingPur.purchase_number} is already POSTED.`);
      }

      const purchaseNumber =
        existingPur?.purchase_number ||
        body.purchaseNumber ||
        nextDocNumber(db, 'purchases', 'purchase_number', 'PUR');

      const paidAmount = body.status === 'POSTED' ? calc.immediatePaymentAmount : 0;
      const balanceAmount = body.status === 'POSTED' ? calc.remainingFarmerBalance : calc.purchaseAmount;
      const payAccountId = body.paymentAccountId || 'acc_cash_shop1';

      db.prepare(`
        INSERT OR REPLACE INTO purchases (
          id, purchase_number, idempotency_key, date, status,
          party_id, farmer_name, farmer_mobile, farmer_village,
          location_id, commodity_id, weighing_mode,
          gross_weight_kg, tare_weight_kg, material_input_kg,
          cutting_rule_applied, deductions_json,
          payable_deductions_kg, physical_deductions_kg,
          payable_weight_kg, physical_stock_received_kg,
          rate_value, rate_unit, rate_per_kg,
          purchase_amount, landed_expense_amount, total_carrying_value,
          immediate_payment_amount, paid_amount, balance_amount,
          payment_mode, payment_account_id, payment_reference,
          vehicle_number, weighbridge_slip_ref, weighbridge_photo_data, remarks,
          created_by, posted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        purchaseId,
        purchaseNumber,
        body.idempotencyKey || null,
        body.date || new Date().toISOString().slice(0, 10),
        body.status,
        partyId,
        body.farmerName.trim(),
        body.farmerMobile.trim(),
        (body.farmerVillage || '').trim(),
        body.locationId,
        body.commodityId,
        body.weighingMode,
        round3(Number(body.grossWeightKg || 0)),
        round3(Number(body.tareWeightKg || 0)),
        calc.materialInputKg,
        body.cuttingRuleApplied || 'RULE_10G_PER_KG',
        JSON.stringify(calc.deductionLines),
        calc.payableDeductionsKg,
        calc.physicalDeductionsKg,
        calc.payableWeightKg,
        calc.physicalStockReceivedKg,
        round2(Number(body.rateValue || 0)),
        body.rateUnit || 'per_quintal',
        calc.ratePerKg,
        calc.purchaseAmount,
        calc.landedExpenseAmount,
        calc.totalInventoryCarryingValue,
        calc.immediatePaymentAmount,
        paidAmount,
        balanceAmount,
        body.paymentMode || 'CASH',
        payAccountId,
        (body.paymentReference || '').trim(),
        (body.vehicleNumber || '').trim(),
        (body.weighbridgeSlipRef || '').trim(),
        body.weighbridgePhotoData || null,
        (body.remarks || '').trim(),
        user.username,
        body.status === 'POSTED' ? new Date().toISOString() : null
      );

      // Drafts NEVER affect stock, payments, or expenses
      if (body.status === 'POSTED') {
        const curStock = db
          .prepare('SELECT qty_kg, total_value, avg_cost_per_kg FROM stock_balances WHERE location_id = ? AND commodity_id = ?')
          .get(body.locationId, body.commodityId) as
          | { qty_kg: number; total_value: number; avg_cost_per_kg: number }
          | undefined;

        const nextStock = applyStockAddition(
          {
            qtyKg: curStock?.qty_kg || 0,
            totalValue: curStock?.total_value || 0,
            avgCostPerKg: curStock?.avg_cost_per_kg || 0,
          },
          calc.physicalStockReceivedKg,
          calc.totalInventoryCarryingValue
        );

        db.prepare(`
          INSERT OR REPLACE INTO stock_balances (location_id, commodity_id, qty_kg, total_value, avg_cost_per_kg, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(body.locationId, body.commodityId, nextStock.qtyKg, nextStock.totalValue, nextStock.avgCostPerKg);

        const movNum = nextDocNumber(db, 'stock_movements', 'movement_number', 'MOV');
        db.prepare(`
          INSERT INTO stock_movements (
            id, movement_number, date, movement_type, location_id, commodity_id,
            qty_change_kg, unit_cost_per_kg, value_change,
            resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
            reference_doc_id, reference_doc_number, vehicle_number, notes, created_by
          ) VALUES (?, ?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `mov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          movNum,
          body.date || new Date().toISOString().slice(0, 10),
          body.locationId,
          body.commodityId,
          calc.physicalStockReceivedKg,
          calc.effectiveInventoryCostPerKg,
          calc.totalInventoryCarryingValue,
          nextStock.qtyKg,
          nextStock.totalValue,
          nextStock.avgCostPerKg,
          purchaseId,
          purchaseNumber,
          (body.vehicleNumber || '').trim(),
          `Payable: ${calc.payableWeightKg} kg | Physical Received: ${calc.physicalStockReceivedKg} kg`,
          user.username
        );

        // Exactly ONE payment record if immediatePaymentAmount > 0
        if (calc.immediatePaymentAmount > 0) {
          const payNum = nextDocNumber(db, 'payments', 'payment_number', 'PAY');
          const payId = `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
          db.prepare(`
            INSERT INTO payments (
              id, payment_number, idempotency_key, date, direction, category,
              party_id, party_name, party_mobile, amount, mode, account_id, reference_number,
              linked_purchase_id, allocations_json, notes, created_by
            ) VALUES (?, ?, ?, ?, 'OUTFLOW', 'FARMER_PAYMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            payId,
            payNum,
            body.idempotencyKey ? `${body.idempotencyKey}_pay` : null,
            body.date || new Date().toISOString().slice(0, 10),
            partyId,
            body.farmerName.trim(),
            body.farmerMobile.trim(),
            calc.immediatePaymentAmount,
            body.paymentMode || 'CASH',
            payAccountId,
            (body.paymentReference || '').trim(),
            purchaseId,
            JSON.stringify([{ docId: purchaseId, docNumber: purchaseNumber, amount: calc.immediatePaymentAmount }]),
            `Immediate payment on purchase ${purchaseNumber}`,
            user.username
          );

          db.prepare('UPDATE financial_accounts SET current_balance = ROUND(current_balance - ?, 2) WHERE id = ?').run(
            calc.immediatePaymentAmount,
            payAccountId
          );
        }

        // If inbound landedExpenseAmount > 0, record as 'landed_cost' expense so never double-counted
        if (calc.landedExpenseAmount > 0) {
          const expNum = nextDocNumber(db, 'expenses', 'expense_number', 'EXP');
          const expId = `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
          const expAccId = body.landedExpenseAccountId || 'acc_cash_shop1';
          db.prepare(`
            INSERT INTO expenses (
              id, expense_number, date, category, classification,
              amount, paid_amount, balance_amount, payment_status,
              location_id, is_shared_premises, payee_name,
              linked_purchase_id, commodity_id, notes, created_by
            ) VALUES (?, ?, ?, 'HAMALI', 'landed_cost', ?, ?, 0, 'PAID', ?, 0, ?, ?, ?, ?, ?)
          `).run(
            expId,
            expNum,
            body.date || new Date().toISOString().slice(0, 10),
            calc.landedExpenseAmount,
            calc.landedExpenseAmount,
            body.locationId,
            (body.landedExpensePayee || 'Inbound Hamali / Transport').trim(),
            purchaseId,
            body.commodityId,
            `Capitalized into inventory on ${purchaseNumber} (Excluded from Operating Expenses)`,
            user.username
          );
          db.prepare('UPDATE financial_accounts SET current_balance = ROUND(current_balance - ?, 2) WHERE id = ?').run(
            calc.landedExpenseAmount,
            expAccId
          );
        }

        writeAudit(
          db,
          user,
          'POST_PURCHASE',
          'purchases',
          purchaseId,
          `Posted ${purchaseNumber} (${envMode}): ${calc.physicalStockReceivedKg} kg physical stock, ₹${calc.purchaseAmount} payable to ${body.farmerName}`
        );
      } else {
        writeAudit(
          db,
          user,
          'SAVE_PURCHASE_DRAFT',
          'purchases',
          purchaseId,
          `Saved draft ${purchaseNumber} for ${body.farmerName}`
        );
      }

      return { id: purchaseId, purchaseNumber, status: body.status, deduplicated: false };
    })();

    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Controlled Reversal of a Posted Purchase
app.post('/api/purchases/:id/reverse', requireRole(['owner']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { reason } = req.body as { reason?: string };

  if (!reason || reason.trim().length < 3) {
    res.status(400).json({ error: 'A reversal reason is required for audit trail integrity.' });
    return;
  }

  try {
    db.transaction(() => {
      const pur = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id) as
        | {
            id: string;
            purchase_number: string;
            status: string;
            location_id: string;
            commodity_id: string;
            physical_stock_received_kg: number;
            total_carrying_value: number;
            immediate_payment_amount: number;
            payment_account_id: string;
          }
        | undefined;

      if (!pur) throw new Error('Purchase not found');
      if (pur.status !== 'POSTED') throw new Error(`Only POSTED purchases can be reversed (current: ${pur.status})`);

      const curStock = db
        .prepare('SELECT qty_kg, total_value, avg_cost_per_kg FROM stock_balances WHERE location_id = ? AND commodity_id = ?')
        .get(pur.location_id, pur.commodity_id) as { qty_kg: number; total_value: number; avg_cost_per_kg: number };

      if (curStock.qty_kg + 0.001 < pur.physical_stock_received_kg) {
        throw new Error(
          `Cannot reverse purchase ${pur.purchase_number}: stock has already been dispatched/sold (${curStock.qty_kg} kg remaining vs ${pur.physical_stock_received_kg} kg received).`
        );
      }

      const newQty = round3(Math.max(0, curStock.qty_kg - pur.physical_stock_received_kg));
      const newVal = round2(Math.max(0, curStock.total_value - pur.total_carrying_value));
      const newAvg = newQty > 0 ? round4(newVal / newQty) : 0;

      db.prepare(
        'UPDATE stock_balances SET qty_kg = ?, total_value = ?, avg_cost_per_kg = ?, updated_at = datetime("now") WHERE location_id = ? AND commodity_id = ?'
      ).run(newQty, newVal, newAvg, pur.location_id, pur.commodity_id);

      const movNum = nextDocNumber(db, 'stock_movements', 'movement_number', 'MOV');
      db.prepare(`
        INSERT INTO stock_movements (
          id, movement_number, date, movement_type, location_id, commodity_id,
          qty_change_kg, unit_cost_per_kg, value_change,
          resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
          reference_doc_id, reference_doc_number, notes, created_by
        ) VALUES (?, ?, date('now'), 'REVERSAL', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `mov_${Date.now().toString(36)}`,
        movNum,
        pur.location_id,
        pur.commodity_id,
        -pur.physical_stock_received_kg,
        -pur.total_carrying_value,
        newQty,
        newVal,
        newAvg,
        pur.id,
        pur.purchase_number,
        `Reversal of ${pur.purchase_number}: ${reason.trim()}`,
        user.username
      );

      if (pur.immediate_payment_amount > 0 && pur.payment_account_id) {
        db.prepare('UPDATE financial_accounts SET current_balance = ROUND(current_balance + ?, 2) WHERE id = ?').run(
          pur.immediate_payment_amount,
          pur.payment_account_id
        );
        db.prepare("UPDATE payments SET status = 'REVERSED' WHERE linked_purchase_id = ?").run(pur.id);
      }

      db.prepare(
        "UPDATE purchases SET status = 'REVERSED', reversed_at = datetime('now'), reversed_by = ?, reversal_reason = ? WHERE id = ?"
      ).run(user.username, reason.trim(), pur.id);

      writeAudit(
        db,
        user,
        'REVERSE_PURCHASE',
        'purchases',
        pur.id,
        `Reversed purchase ${pur.purchase_number}: ${reason.trim()}`
      );
    })();

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- SALES (POST & CONTROLLED REVERSAL) ---
app.post('/api/sales', requireRole(['owner', 'staff']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const body = req.body as {
    id?: string;
    invoiceNumber?: string;
    idempotencyKey?: string;
    date: string;
    dueDate?: string;
    status: 'DRAFT' | 'POSTED';
    partyId?: string;
    customerName: string;
    customerMobile: string;
    customerCity?: string;
    locationId: string;
    commodityId: string;
    vehicleNumber?: string;
    dispatchedKg: number;
    billableKg: number;
    weightDiffExplanation?: string;
    sellingRateValue: number;
    sellingRateUnit: RateUnit;
    immediateCollectionAmount?: number;
    collectionMode?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
    collectionAccountId?: string;
    collectionReference?: string;
    remarks?: string;
  };

  if (!body.customerName || !body.customerMobile || !body.locationId || !body.commodityId) {
    res.status(400).json({ error: 'Customer name, mobile, dispatch location, and commodity are required.' });
    return;
  }

  if (user.role === 'staff' && user.assignedLocationId && user.assignedLocationId !== body.locationId) {
    res.status(403).json({
      error: `Staff user '${user.username}' is only authorized for location ${user.assignedLocationId}.`,
    });
    return;
  }

  try {
    const result = db.transaction(() => {
      if (body.idempotencyKey) {
        const existingByIdem = db
          .prepare('SELECT id, invoice_number, status FROM sales WHERE idempotency_key = ?')
          .get(body.idempotencyKey) as { id: string; invoice_number: string; status: string } | undefined;
        if (existingByIdem && existingByIdem.status === 'POSTED') {
          return {
            id: existingByIdem.id,
            invoiceNumber: existingByIdem.invoice_number,
            status: existingByIdem.status,
            deduplicated: true,
          };
        }
      }

      const curStock = db
        .prepare('SELECT qty_kg, total_value, avg_cost_per_kg FROM stock_balances WHERE location_id = ? AND commodity_id = ?')
        .get(body.locationId, body.commodityId) as
        | { qty_kg: number; total_value: number; avg_cost_per_kg: number }
        | undefined;

      const calc = calculateSale({
        dispatchedKg: Number(body.dispatchedKg || 0),
        billableKg: Number(body.billableKg || 0),
        sellingRateValue: Number(body.sellingRateValue || 0),
        sellingRateUnit: body.sellingRateUnit || 'per_quintal',
        immediateCollectionAmount: Number(body.immediateCollectionAmount || 0),
        currentLocationAvgCostPerKg: curStock?.avg_cost_per_kg || 0,
        currentLocationStockKg: curStock?.qty_kg || 0,
      });

      if (body.status === 'POSTED') {
        if (calc.dispatchedKg <= 0 || calc.billableKg <= 0 || calc.sellingRatePerKg <= 0) {
          throw new Error('Dispatched weight, billable weight, and selling rate must be greater than zero.');
        }
        if (!calc.hasSufficientStock) {
          throw new Error(
            `Insufficient stock at location: trying to dispatch ${calc.dispatchedKg} kg, but only ${
              curStock?.qty_kg || 0
            } kg is available.`
          );
        }
        if (calc.requiresWeightDiffExplanation && (!body.weightDiffExplanation || body.weightDiffExplanation.trim().length < 3)) {
          throw new Error(
            `Dispatched weight (${calc.dispatchedKg} kg) differs from Billable weight (${calc.billableKg} kg). Please explain the ${calc.weightDifferenceKg} kg difference.`
          );
        }
      }

      let partyId = body.partyId;
      if (!partyId) {
        const foundParty = db
          .prepare('SELECT id FROM parties WHERE mobile = ?')
          .get(body.customerMobile.trim()) as { id: string } | undefined;
        if (foundParty) {
          partyId = foundParty.id;
        } else {
          partyId = `pty_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
          db.prepare(
            'INSERT INTO parties (id, type, name, mobile, village_or_city, opening_balance) VALUES (?, ?, ?, ?, ?, 0)'
          ).run(partyId, 'customer', body.customerName.trim(), body.customerMobile.trim(), (body.customerCity || '').trim());
        }
      }

      const saleId = body.id || `sal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      const existingSale = db
        .prepare('SELECT invoice_number, status FROM sales WHERE id = ?')
        .get(saleId) as { invoice_number: string; status: string } | undefined;
      if (existingSale && existingSale.status === 'POSTED') {
        throw new Error(`Sale ${existingSale.invoice_number} is already POSTED.`);
      }

      const invoiceNumber =
        existingSale?.invoice_number ||
        body.invoiceNumber ||
        nextDocNumber(db, 'sales', 'invoice_number', 'INV');

      const colAccId = body.collectionAccountId || 'acc_bank_hdfc';
      const receivedAmount = body.status === 'POSTED' ? calc.immediateCollectionAmount : 0;
      const balanceAmount = body.status === 'POSTED' ? calc.balanceReceivable : calc.saleAmount;

      db.prepare(`
        INSERT OR REPLACE INTO sales (
          id, invoice_number, idempotency_key, date, due_date, status,
          party_id, customer_name, customer_mobile, customer_city,
          location_id, commodity_id, vehicle_number,
          dispatched_kg, billable_kg, weight_diff_kg, weight_diff_explanation,
          selling_rate_value, selling_rate_unit, selling_rate_per_kg,
          sale_amount, avg_cost_per_kg_at_sale, cogs_amount, gross_profit,
          immediate_collection_amount, received_amount, balance_amount,
          collection_mode, collection_account_id, collection_reference,
          remarks, created_by, posted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId,
        invoiceNumber,
        body.idempotencyKey || null,
        body.date || new Date().toISOString().slice(0, 10),
        body.dueDate || null,
        body.status,
        partyId,
        body.customerName.trim(),
        body.customerMobile.trim(),
        (body.customerCity || '').trim(),
        body.locationId,
        body.commodityId,
        (body.vehicleNumber || '').trim(),
        calc.dispatchedKg,
        calc.billableKg,
        calc.weightDifferenceKg,
        (body.weightDiffExplanation || '').trim(),
        round2(Number(body.sellingRateValue || 0)),
        body.sellingRateUnit || 'per_quintal',
        calc.sellingRatePerKg,
        calc.saleAmount,
        curStock?.avg_cost_per_kg || 0,
        calc.costOfGoodsSold,
        calc.grossProfit,
        calc.immediateCollectionAmount,
        receivedAmount,
        balanceAmount,
        body.collectionMode || 'BANK_TRANSFER',
        colAccId,
        (body.collectionReference || '').trim(),
        (body.remarks || '').trim(),
        user.username,
        body.status === 'POSTED' ? new Date().toISOString() : null
      );

      if (body.status === 'POSTED') {
        const { nextState, removedCarryingValue } = applyStockReduction(
          {
            qtyKg: curStock?.qty_kg || 0,
            totalValue: curStock?.total_value || 0,
            avgCostPerKg: curStock?.avg_cost_per_kg || 0,
          },
          calc.dispatchedKg
        );

        db.prepare(`
          UPDATE stock_balances SET qty_kg = ?, total_value = ?, avg_cost_per_kg = ?, updated_at = datetime('now')
          WHERE location_id = ? AND commodity_id = ?
        `).run(nextState.qtyKg, nextState.totalValue, nextState.avgCostPerKg, body.locationId, body.commodityId);

        const movNum = nextDocNumber(db, 'stock_movements', 'movement_number', 'MOV');
        db.prepare(`
          INSERT INTO stock_movements (
            id, movement_number, date, movement_type, location_id, commodity_id,
            qty_change_kg, unit_cost_per_kg, value_change,
            resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
            reference_doc_id, reference_doc_number, vehicle_number, notes, created_by
          ) VALUES (?, ?, ?, 'SALE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `mov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          movNum,
          body.date || new Date().toISOString().slice(0, 10),
          body.locationId,
          body.commodityId,
          -calc.dispatchedKg,
          curStock?.avg_cost_per_kg || 0,
          -removedCarryingValue,
          nextState.qtyKg,
          nextState.totalValue,
          nextState.avgCostPerKg,
          saleId,
          invoiceNumber,
          (body.vehicleNumber || '').trim(),
          `Dispatched ${calc.dispatchedKg} kg | Billable ${calc.billableKg} kg`,
          user.username
        );

        if (calc.immediateCollectionAmount > 0) {
          const payNum = nextDocNumber(db, 'payments', 'payment_number', 'PAY');
          const payId = `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
          db.prepare(`
            INSERT INTO payments (
              id, payment_number, idempotency_key, date, direction, category,
              party_id, party_name, party_mobile, amount, mode, account_id, reference_number,
              linked_sale_id, allocations_json, notes, created_by
            ) VALUES (?, ?, ?, ?, 'INFLOW', 'CUSTOMER_COLLECTION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            payId,
            payNum,
            body.idempotencyKey ? `${body.idempotencyKey}_col` : null,
            body.date || new Date().toISOString().slice(0, 10),
            partyId,
            body.customerName.trim(),
            body.customerMobile.trim(),
            calc.immediateCollectionAmount,
            body.collectionMode || 'BANK_TRANSFER',
            colAccId,
            (body.collectionReference || '').trim(),
            saleId,
            JSON.stringify([{ docId: saleId, docNumber: invoiceNumber, amount: calc.immediateCollectionAmount }]),
            `Immediate collection on sale ${invoiceNumber}`,
            user.username
          );

          db.prepare('UPDATE financial_accounts SET current_balance = ROUND(current_balance + ?, 2) WHERE id = ?').run(
            calc.immediateCollectionAmount,
            colAccId
          );
        }

        writeAudit(
          db,
          user,
          'POST_SALE',
          'sales',
          saleId,
          `Posted sale ${invoiceNumber}: Dispatched ${calc.dispatchedKg} kg, Billed ${calc.billableKg} kg, Revenue ₹${calc.saleAmount}, Gross Profit ₹${calc.grossProfit}`
        );
      }

      return { id: saleId, invoiceNumber, status: body.status, deduplicated: false };
    })();

    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/sales/:id/reverse', requireRole(['owner']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { reason } = req.body as { reason?: string };

  if (!reason || reason.trim().length < 3) {
    res.status(400).json({ error: 'A reversal reason is required for audit trail integrity.' });
    return;
  }

  try {
    db.transaction(() => {
      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id) as
        | {
            id: string;
            invoice_number: string;
            status: string;
            location_id: string;
            commodity_id: string;
            dispatched_kg: number;
            cogs_amount: number;
            immediate_collection_amount: number;
            collection_account_id: string;
          }
        | undefined;

      if (!sale) throw new Error('Sale not found');
      if (sale.status !== 'POSTED') throw new Error('Only POSTED sales can be reversed.');

      const curStock = db
        .prepare('SELECT qty_kg, total_value, avg_cost_per_kg FROM stock_balances WHERE location_id = ? AND commodity_id = ?')
        .get(sale.location_id, sale.commodity_id) as { qty_kg: number; total_value: number; avg_cost_per_kg: number };

      const nextStock = applyStockAddition(
        {
          qtyKg: curStock.qty_kg,
          totalValue: curStock.total_value,
          avgCostPerKg: curStock.avg_cost_per_kg,
        },
        sale.dispatched_kg,
        sale.cogs_amount
      );

      db.prepare(
        'UPDATE stock_balances SET qty_kg = ?, total_value = ?, avg_cost_per_kg = ?, updated_at = datetime("now") WHERE location_id = ? AND commodity_id = ?'
      ).run(nextStock.qtyKg, nextStock.totalValue, nextStock.avgCostPerKg, sale.location_id, sale.commodity_id);

      const movNum = nextDocNumber(db, 'stock_movements', 'movement_number', 'MOV');
      db.prepare(`
        INSERT INTO stock_movements (
          id, movement_number, date, movement_type, location_id, commodity_id,
          qty_change_kg, unit_cost_per_kg, value_change,
          resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
          reference_doc_id, reference_doc_number, notes, created_by
        ) VALUES (?, ?, date('now'), 'REVERSAL', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `mov_${Date.now().toString(36)}`,
        movNum,
        sale.location_id,
        sale.commodity_id,
        sale.dispatched_kg,
        sale.cogs_amount,
        nextStock.qtyKg,
        nextStock.totalValue,
        nextStock.avgCostPerKg,
        sale.id,
        sale.invoice_number,
        `Reversal of sale ${sale.invoice_number}: ${reason.trim()}`,
        user.username
      );

      if (sale.immediate_collection_amount > 0 && sale.collection_account_id) {
        db.prepare('UPDATE financial_accounts SET current_balance = ROUND(current_balance - ?, 2) WHERE id = ?').run(
          sale.immediate_collection_amount,
          sale.collection_account_id
        );
        db.prepare("UPDATE payments SET status = 'REVERSED' WHERE linked_sale_id = ?").run(sale.id);
      }

      db.prepare(
        "UPDATE sales SET status = 'REVERSED', reversed_at = datetime('now'), reversed_by = ?, reversal_reason = ? WHERE id = ?"
      ).run(user.username, reason.trim(), sale.id);

      writeAudit(db, user, 'REVERSE_SALE', 'sales', sale.id, `Reversed sale ${sale.invoice_number}: ${reason.trim()}`);
    })();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- PAYMENTS & MULTI-DOCUMENT ALLOCATIONS ---
app.post('/api/payments', requireRole(['owner', 'staff']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const body = req.body as {
    idempotencyKey?: string;
    date: string;
    direction: 'OUTFLOW' | 'INFLOW';
    category: 'FARMER_PAYMENT' | 'CUSTOMER_COLLECTION' | 'EXPENSE_PAYMENT' | 'ADVANCE_PAID' | 'ADVANCE_RECEIVED' | 'REFUND';
    partyId?: string;
    partyName: string;
    partyMobile?: string;
    amount: number;
    mode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
    accountId: string;
    referenceNumber?: string;
    allocations?: Array<{ docType: 'purchase' | 'sale' | 'expense'; docId: string; docNumber: string; amount: number }>;
    notes?: string;
  };

  const cleanAmount = round2(Number(body.amount || 0));
  if (cleanAmount <= 0 || !body.accountId || !body.partyName) {
    res.status(400).json({ error: 'Payment amount, party name, and financial account are required.' });
    return;
  }

  try {
    const result = db.transaction(() => {
      if (body.idempotencyKey) {
        const existing = db
          .prepare('SELECT id, payment_number FROM payments WHERE idempotency_key = ?')
          .get(body.idempotencyKey) as { id: string; payment_number: string } | undefined;
        if (existing) return { id: existing.id, paymentNumber: existing.payment_number, deduplicated: true };
      }

      // Verify UPI is linked to an actual BANK account
      const acc = db
        .prepare('SELECT id, name, type FROM financial_accounts WHERE id = ?')
        .get(body.accountId) as { id: string; name: string; type: 'CASH' | 'BANK' } | undefined;
      if (!acc) throw new Error('Selected financial account not found.');
      if (body.mode === 'UPI' && acc.type !== 'BANK') {
        throw new Error('UPI payments must be linked to an actual Bank Account, not a physical Cashbox.');
      }

      const payId = `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      const payNum = nextDocNumber(db, 'payments', 'payment_number', 'PAY');
      const rawAllocations = Array.isArray(body.allocations) ? body.allocations.filter((a) => a.amount > 0) : [];

      // Enrich allocations with current open balances from DB for server-side over-allocation check
      const enrichedAllocations = rawAllocations.map((alloc) => {
        let openBalance: number | undefined;
        if (alloc.docType === 'purchase') {
          const r = db.prepare('SELECT balance_amount FROM purchases WHERE id = ?').get(alloc.docId) as
            | { balance_amount: number }
            | undefined;
          openBalance = r?.balance_amount;
        } else if (alloc.docType === 'sale') {
          const r = db.prepare('SELECT balance_amount FROM sales WHERE id = ?').get(alloc.docId) as
            | { balance_amount: number }
            | undefined;
          openBalance = r?.balance_amount;
        } else if (alloc.docType === 'expense') {
          const r = db.prepare('SELECT balance_amount FROM expenses WHERE id = ?').get(alloc.docId) as
            | { balance_amount: number }
            | undefined;
          openBalance = r?.balance_amount;
        }
        return {
          ...alloc,
          openBalance,
        };
      });

      const allocCheck = validatePaymentAllocations({
        paymentAmount: cleanAmount,
        allocations: enrichedAllocations,
      });

      if (!allocCheck.valid) {
        throw new Error(allocCheck.errors.join(' '));
      }

      const allocations = rawAllocations;
      const finalNotes =
        allocCheck.unallocatedAdvance > 0 && allocations.length > 0
          ? `${(body.notes || '').trim()} [Includes ₹${allocCheck.unallocatedAdvance} unallocated party advance/credit]`.trim()
          : (body.notes || '').trim();

      db.prepare(`
        INSERT INTO payments (
          id, payment_number, idempotency_key, date, direction, category,
          party_id, party_name, party_mobile, amount, mode, account_id, reference_number,
          allocations_json, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payId,
        payNum,
        body.idempotencyKey || null,
        body.date || new Date().toISOString().slice(0, 10),
        body.direction,
        body.category,
        body.partyId || null,
        body.partyName.trim(),
        (body.partyMobile || '').trim(),
        cleanAmount,
        body.mode,
        body.accountId,
        (body.referenceNumber || '').trim(),
        JSON.stringify(allocations),
        finalNotes,
        user.username
      );

      // Update account balance
      if (body.direction === 'INFLOW') {
        db.prepare('UPDATE financial_accounts SET current_balance = ROUND(current_balance + ?, 2) WHERE id = ?').run(
          cleanAmount,
          body.accountId
        );
      } else {
        db.prepare('UPDATE financial_accounts SET current_balance = ROUND(current_balance - ?, 2) WHERE id = ?').run(
          cleanAmount,
          body.accountId
        );
      }

      // Apply allocations across purchases, sales, or expenses without creating duplicate sales/purchases!
      for (const alloc of allocations) {
        const allocAmt = round2(Number(alloc.amount || 0));
        if (allocAmt <= 0) continue;

        if (alloc.docType === 'purchase') {
          db.prepare(`
            UPDATE purchases
            SET paid_amount = ROUND(paid_amount + ?, 2),
                balance_amount = ROUND(MAX(0, balance_amount - ?), 2)
            WHERE id = ?
          `).run(allocAmt, allocAmt, alloc.docId);
        } else if (alloc.docType === 'sale') {
          db.prepare(`
            UPDATE sales
            SET received_amount = ROUND(received_amount + ?, 2),
                balance_amount = ROUND(MAX(0, balance_amount - ?), 2)
            WHERE id = ?
          `).run(allocAmt, allocAmt, alloc.docId);
        } else if (alloc.docType === 'expense') {
          const exp = db
            .prepare('SELECT amount, paid_amount FROM expenses WHERE id = ?')
            .get(alloc.docId) as { amount: number; paid_amount: number } | undefined;
          if (exp) {
            const newPaid = round2(exp.paid_amount + allocAmt);
            const newBal = round2(Math.max(0, exp.amount - newPaid));
            const newStatus = newBal <= 0.009 ? 'PAID' : 'PARTIAL';
            db.prepare('UPDATE expenses SET paid_amount = ?, balance_amount = ?, payment_status = ? WHERE id = ?').run(
              newPaid,
              newBal,
              newStatus,
              alloc.docId
            );
          }
        }
      }

      writeAudit(
        db,
        user,
        'POST_PAYMENT',
        'payments',
        payId,
        `Posted ${body.direction} ${payNum}: ₹${cleanAmount} (${body.mode} via ${acc.name}) for ${body.partyName}`
      );

      return { id: payId, paymentNumber: payNum, deduplicated: false };
    })();

    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- STOCK TRANSFERS & ADJUSTMENTS ---
app.post('/api/stock/transfer', requireRole(['owner', 'staff']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { date, fromLocationId, toLocationId, commodityId, transferKg, vehicleNumber, notes } = req.body as {
    date: string;
    fromLocationId: string;
    toLocationId: string;
    commodityId: string;
    transferKg: number;
    vehicleNumber?: string;
    notes?: string;
  };

  const cleanKg = round3(Number(transferKg || 0));
  if (!fromLocationId || !toLocationId || fromLocationId === toLocationId || !commodityId || cleanKg <= 0) {
    res.status(400).json({ error: 'Valid source location, destination location, commodity, and quantity (kg) are required.' });
    return;
  }

  try {
    db.transaction(() => {
      const srcRow = db
        .prepare('SELECT qty_kg, total_value, avg_cost_per_kg FROM stock_balances WHERE location_id = ? AND commodity_id = ?')
        .get(fromLocationId, commodityId) as { qty_kg: number; total_value: number; avg_cost_per_kg: number } | undefined;
      const dstRow = db
        .prepare('SELECT qty_kg, total_value, avg_cost_per_kg FROM stock_balances WHERE location_id = ? AND commodity_id = ?')
        .get(toLocationId, commodityId) as { qty_kg: number; total_value: number; avg_cost_per_kg: number } | undefined;

      const transferRes = applyStockTransfer(
        {
          qtyKg: srcRow?.qty_kg || 0,
          totalValue: srcRow?.total_value || 0,
          avgCostPerKg: srcRow?.avg_cost_per_kg || 0,
        },
        {
          qtyKg: dstRow?.qty_kg || 0,
          totalValue: dstRow?.total_value || 0,
          avgCostPerKg: dstRow?.avg_cost_per_kg || 0,
        },
        cleanKg
      );

      db.prepare(`
        UPDATE stock_balances SET qty_kg = ?, total_value = ?, avg_cost_per_kg = ?, updated_at = datetime('now')
        WHERE location_id = ? AND commodity_id = ?
      `).run(
        transferRes.nextSource.qtyKg,
        transferRes.nextSource.totalValue,
        transferRes.nextSource.avgCostPerKg,
        fromLocationId,
        commodityId
      );

      db.prepare(`
        UPDATE stock_balances SET qty_kg = ?, total_value = ?, avg_cost_per_kg = ?, updated_at = datetime('now')
        WHERE location_id = ? AND commodity_id = ?
      `).run(
        transferRes.nextDestination.qtyKg,
        transferRes.nextDestination.totalValue,
        transferRes.nextDestination.avgCostPerKg,
        toLocationId,
        commodityId
      );

      const trfRef = `TRF-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
      const movOutNum = nextDocNumber(db, 'stock_movements', 'movement_number', 'MOV');
      db.prepare(`
        INSERT INTO stock_movements (
          id, movement_number, date, movement_type, location_id, counterpart_location_id, commodity_id,
          qty_change_kg, unit_cost_per_kg, value_change,
          resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
          reference_doc_number, vehicle_number, notes, created_by
        ) VALUES (?, ?, ?, 'TRANSFER_OUT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `mov_${Date.now().toString(36)}_out`,
        movOutNum,
        date || new Date().toISOString().slice(0, 10),
        fromLocationId,
        toLocationId,
        commodityId,
        -cleanKg,
        transferRes.transferUnitCostPerKg,
        -transferRes.transferredCarryingValue,
        transferRes.nextSource.qtyKg,
        transferRes.nextSource.totalValue,
        transferRes.nextSource.avgCostPerKg,
        trfRef,
        (vehicleNumber || '').trim(),
        (notes || 'Location transfer at carrying cost').trim(),
        user.username
      );

      const movInNum = nextDocNumber(db, 'stock_movements', 'movement_number', 'MOV');
      db.prepare(`
        INSERT INTO stock_movements (
          id, movement_number, date, movement_type, location_id, counterpart_location_id, commodity_id,
          qty_change_kg, unit_cost_per_kg, value_change,
          resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
          reference_doc_number, vehicle_number, notes, created_by
        ) VALUES (?, ?, ?, 'TRANSFER_IN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `mov_${Date.now().toString(36)}_in`,
        movInNum,
        date || new Date().toISOString().slice(0, 10),
        toLocationId,
        fromLocationId,
        commodityId,
        cleanKg,
        transferRes.transferUnitCostPerKg,
        transferRes.transferredCarryingValue,
        transferRes.nextDestination.qtyKg,
        transferRes.nextDestination.totalValue,
        transferRes.nextDestination.avgCostPerKg,
        trfRef,
        (vehicleNumber || '').trim(),
        (notes || 'Location transfer received at carrying cost').trim(),
        user.username
      );

      writeAudit(
        db,
        user,
        'TRANSFER_STOCK',
        'stock_movements',
        trfRef,
        `Transferred ${cleanKg} kg of ${commodityId} from ${fromLocationId} to ${toLocationId} @ ₹${transferRes.transferUnitCostPerKg}/kg`
      );
    })();

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/stock/opening-or-adjust', requireRole(['owner', 'staff']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { date, movementType, locationId, commodityId, qtyKg, unitCostPerKg, notes } = req.body as {
    date: string;
    movementType: 'OPENING' | 'RETURN_IN' | 'RETURN_OUT' | 'LOSS' | 'ADJUSTMENT';
    locationId: string;
    commodityId: string;
    qtyKg: number;
    unitCostPerKg?: number;
    notes?: string;
  };

  const cleanKg = round3(Math.abs(Number(qtyKg || 0)));
  if (!locationId || !commodityId || cleanKg <= 0) {
    res.status(400).json({ error: 'Location, commodity, and positive quantity (kg) are required.' });
    return;
  }

  try {
    db.transaction(() => {
      const curRow = db
        .prepare('SELECT qty_kg, total_value, avg_cost_per_kg FROM stock_balances WHERE location_id = ? AND commodity_id = ?')
        .get(locationId, commodityId) as { qty_kg: number; total_value: number; avg_cost_per_kg: number } | undefined;

      const currentState = {
        qtyKg: curRow?.qty_kg || 0,
        totalValue: curRow?.total_value || 0,
        avgCostPerKg: curRow?.avg_cost_per_kg || 0,
      };

      const isAddition = movementType === 'OPENING' || movementType === 'RETURN_IN' || (movementType === 'ADJUSTMENT' && Number(qtyKg) > 0);

      let nextState = currentState;
      let signedQty = cleanKg;
      let signedVal = 0;
      let appliedCost = round4(Number(unitCostPerKg || currentState.avgCostPerKg || 0));

      if (isAddition) {
        signedVal = round2(cleanKg * appliedCost);
        nextState = applyStockAddition(currentState, cleanKg, signedVal);
      } else {
        signedQty = -cleanKg;
        const red = applyStockReduction(currentState, cleanKg);
        nextState = red.nextState;
        signedVal = -red.removedCarryingValue;
        appliedCost = currentState.avgCostPerKg;
      }

      db.prepare(`
        UPDATE stock_balances SET qty_kg = ?, total_value = ?, avg_cost_per_kg = ?, updated_at = datetime('now')
        WHERE location_id = ? AND commodity_id = ?
      `).run(nextState.qtyKg, nextState.totalValue, nextState.avgCostPerKg, locationId, commodityId);

      const movNum = nextDocNumber(db, 'stock_movements', 'movement_number', 'MOV');
      db.prepare(`
        INSERT INTO stock_movements (
          id, movement_number, date, movement_type, location_id, commodity_id,
          qty_change_kg, unit_cost_per_kg, value_change,
          resulting_qty_kg, resulting_value, resulting_avg_cost_per_kg,
          notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `mov_${Date.now().toString(36)}`,
        movNum,
        date || new Date().toISOString().slice(0, 10),
        movementType,
        locationId,
        commodityId,
        signedQty,
        appliedCost,
        signedVal,
        nextState.qtyKg,
        nextState.totalValue,
        nextState.avgCostPerKg,
        (notes || `${movementType} entry`).trim(),
        user.username
      );

      writeAudit(
        db,
        user,
        `STOCK_${movementType}`,
        'stock_movements',
        movNum,
        `${movementType}: ${signedQty} kg at ${locationId} (${commodityId})`
      );
    })();

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- EXPENSES & RECURRING MONTHLY RENT OBLIGATION ---
app.post('/api/expenses', requireRole(['owner', 'staff']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const body = req.body as {
    idempotencyKey?: string;
    date: string;
    category: 'TRANSPORTATION' | 'HAMALI' | 'LOADING_UNLOADING' | 'RENT' | 'ELECTRICITY' | 'WEIGHBRIDGE_FEE' | 'PACKAGING' | 'OTHER';
    classification: ExpenseClassification;
    amount: number;
    paidNowAmount?: number;
    paymentMode?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
    paymentAccountId?: string;
    locationId?: string | null;
    isSharedPremises?: boolean;
    commodityId?: string | null;
    payeeName: string;
    billReference?: string;
    billAttachmentData?: string;
    notes?: string;
  };

  const amount = round2(Number(body.amount || 0));
  const paidNow = round2(Math.max(0, Number(body.paidNowAmount || 0)));
  if (amount <= 0 || !body.payeeName) {
    res.status(400).json({ error: 'Expense amount and payee name are required.' });
    return;
  }

  try {
    const result = db.transaction(() => {
      if (body.idempotencyKey) {
        const existing = db
          .prepare('SELECT id, expense_number FROM expenses WHERE idempotency_key = ?')
          .get(body.idempotencyKey) as { id: string; expense_number: string } | undefined;
        if (existing) return { id: existing.id, expenseNumber: existing.expense_number, deduplicated: true };
      }

      const expId = `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      const expNum = nextDocNumber(db, 'expenses', 'expense_number', 'EXP');
      const balance = round2(Math.max(0, amount - paidNow));
      const payStatus = balance <= 0.009 ? 'PAID' : paidNow > 0 ? 'PARTIAL' : 'UNPAID';
      const classification = body.classification === 'landed_cost' ? 'landed_cost' : 'operating_expense';

      // If classified as landed_cost and a location + commodity are specified, add to inventory carrying value!
      if (classification === 'landed_cost' && body.locationId && body.commodityId) {
        const curStock = db
          .prepare('SELECT qty_kg, total_value, avg_cost_per_kg FROM stock_balances WHERE location_id = ? AND commodity_id = ?')
          .get(body.locationId, body.commodityId) as { qty_kg: number; total_value: number; avg_cost_per_kg: number } | undefined;
        if (curStock && curStock.qty_kg > 0) {
          const newVal = round2(curStock.total_value + amount);
          const newAvg = round4(newVal / curStock.qty_kg);
          db.prepare(
            'UPDATE stock_balances SET total_value = ?, avg_cost_per_kg = ?, updated_at = datetime("now") WHERE location_id = ? AND commodity_id = ?'
          ).run(newVal, newAvg, body.locationId, body.commodityId);
        }
      }

      db.prepare(`
        INSERT INTO expenses (
          id, expense_number, idempotency_key, date, category, classification,
          amount, paid_amount, balance_amount, payment_status,
          location_id, is_shared_premises, payee_name, commodity_id,
          bill_reference, bill_attachment_data, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        expId,
        expNum,
        body.idempotencyKey || null,
        body.date || new Date().toISOString().slice(0, 10),
        body.category || 'OTHER',
        classification,
        amount,
        paidNow,
        balance,
        payStatus,
        body.isSharedPremises ? null : body.locationId || null,
        body.isSharedPremises ? 1 : 0,
        body.payeeName.trim(),
        body.commodityId || null,
        (body.billReference || '').trim(),
        body.billAttachmentData || null,
        (body.notes || '').trim(),
        user.username
      );

      if (paidNow > 0) {
        const accId = body.paymentAccountId || 'acc_cash_shop1';
        const payNum = nextDocNumber(db, 'payments', 'payment_number', 'PAY');
        db.prepare(`
          INSERT INTO payments (
            id, payment_number, date, direction, category,
            party_name, amount, mode, account_id, reference_number,
            linked_expense_id, allocations_json, notes, created_by
          ) VALUES (?, ?, ?, 'OUTFLOW', 'EXPENSE_PAYMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `pay_${Date.now().toString(36)}`,
          payNum,
          body.date || new Date().toISOString().slice(0, 10),
          body.payeeName.trim(),
          paidNow,
          body.paymentMode || 'CASH',
          accId,
          (body.billReference || '').trim(),
          expId,
          JSON.stringify([{ docType: 'expense', docId: expId, docNumber: expNum, amount: paidNow }]),
          `Expense payment for ${expNum}`,
          user.username
        );

        db.prepare('UPDATE financial_accounts SET current_balance = ROUND(current_balance - ?, 2) WHERE id = ?').run(
          paidNow,
          accId
        );
      }

      writeAudit(
        db,
        user,
        'CREATE_EXPENSE',
        'expenses',
        expId,
        `Recorded ${body.category} (${classification}) ${expNum}: ₹${amount} to ${body.payeeName}`
      );

      return { id: expId, expenseNumber: expNum, deduplicated: false };
    })();

    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Generate Monthly Rent Obligation without duplicates (never auto-marks paid!)
app.post('/api/expenses/generate-rent', requireRole(['owner', 'staff']), (req: Request, res: Response) => {
  const { db } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { monthKey } = req.body as { monthKey: string }; // e.g., '2026-11'

  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    res.status(400).json({ error: 'Valid monthKey (YYYY-MM) is required.' });
    return;
  }

  const confirmedRow = db
    .prepare("SELECT value FROM business_settings WHERE key = 'rent_premises_confirmed'")
    .get() as { value: string } | undefined;
  if (!confirmedRow || confirmedRow.value !== '1') {
    res.status(400).json({
      error:
        'OWNER CONFIRMATION REQUIRED: Please confirm whether the ₹40,000 monthly rent template covers all premises combined before generating the monthly rent obligation.',
      code: 'RENT_UNCONFIRMED',
    });
    return;
  }

  const existing = db
    .prepare("SELECT id, expense_number FROM expenses WHERE category = 'RENT' AND recurring_month_key = ? AND status = 'POSTED'")
    .get(monthKey) as { id: string; expense_number: string } | undefined;

  if (existing) {
    res.status(400).json({
      error: `Monthly rent obligation for ${monthKey} already exists (${existing.expense_number}). Duplicate rent obligations are prevented.`,
    });
    return;
  }

  const amountRow = db
    .prepare("SELECT value FROM business_settings WHERE key = 'rent_monthly_amount'")
    .get() as { value: string } | undefined;
  const scopeRow = db
    .prepare("SELECT value FROM business_settings WHERE key = 'rent_premises_scope'")
    .get() as { value: string } | undefined;
  const payeeRow = db
    .prepare("SELECT value FROM business_settings WHERE key = 'rent_payee_name'")
    .get() as { value: string } | undefined;

  const rentAmount = round2(Number(amountRow?.value || 40000));
  const expId = `exp_rent_${monthKey}`;
  const expNum = nextDocNumber(db, 'expenses', 'expense_number', 'EXP');

  // Created as UNPAID obligation, shared across premises so never counted 5x across shops!
  db.prepare(`
    INSERT INTO expenses (
      id, expense_number, date, category, classification,
      amount, paid_amount, balance_amount, payment_status,
      location_id, is_shared_premises, recurring_month_key,
      payee_name, bill_reference, notes, created_by
    ) VALUES (?, ?, ?, 'RENT', 'operating_expense', ?, 0, ?, 'UNPAID', NULL, 1, ?, ?, ?, ?, ?)
  `).run(
    expId,
    expNum,
    `${monthKey}-01`,
    rentAmount,
    rentAmount,
    monthKey,
    payeeRow?.value || 'Premises Landlord',
    `RENT-${monthKey}`,
    `Monthly rent obligation for ${monthKey} (${scopeRow?.value || 'All Premises'}). Payment recorded separately.`,
    user.username
  );

  writeAudit(
    db,
    user,
    'GENERATE_RENT_OBLIGATION',
    'expenses',
    expId,
    `Generated UNPAID monthly rent obligation ${expNum} for ${monthKey}: ₹${rentAmount}`
  );

  res.json({ ok: true, id: expId, expenseNumber: expNum });
});

// --- BACKUP & RESTORE ---
app.get('/api/backup/export', requireRole(['owner']), (req: Request, res: Response) => {
  const { db, envMode } = getDbForRequest(req);
  const tables = [
    'business_settings',
    'users',
    'locations',
    'commodities',
    'financial_accounts',
    'parties',
    'stock_balances',
    'purchases',
    'sales',
    'payments',
    'stock_movements',
    'expenses',
    'audit_logs',
  ];
  const dump: Record<string, unknown[]> = {};
  for (const t of tables) {
    dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  res.json({
    company: 'Sai Samarth Trading Company',
    envMode,
    exportedAt: new Date().toISOString(),
    schemaVersion: '001_initial_schema',
    tables: dump,
  });
});

app.post('/api/backup/restore', requireRole(['owner']), (req: Request, res: Response) => {
  const { db, envMode } = getDbForRequest(req);
  const user = getUserFromRequest(req);
  const { tables } = req.body as { tables?: Record<string, Record<string, unknown>[]> };

  if (!tables || typeof tables !== 'object') {
    res.status(400).json({ error: 'Invalid backup file format: missing tables object.' });
    return;
  }

  try {
    db.transaction(() => {
      db.pragma('foreign_keys = OFF');
      const orderedTables = [
        'business_settings',
        'locations',
        'commodities',
        'financial_accounts',
        'parties',
        'stock_balances',
        'purchases',
        'sales',
        'payments',
        'stock_movements',
        'expenses',
      ];
      for (const table of orderedTables) {
        const rows = tables[table];
        if (!Array.isArray(rows)) continue;
        db.prepare(`DELETE FROM ${table}`).run();
        if (rows.length === 0) continue;
        const keys = Object.keys(rows[0]);
        const placeholders = keys.map(() => '?').join(', ');
        const stmt = db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`);
        for (const row of rows) {
          stmt.run(...keys.map((k) => row[k]));
        }
      }
      db.pragma('foreign_keys = ON');
      writeAudit(db, user, 'RESTORE_BACKUP', 'system', envMode, `Restored database backup into ${envMode} environment`);
    })();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Sai Samarth Trading Company server running on http://0.0.0.0:${port}`);
  });
}

startServer();
