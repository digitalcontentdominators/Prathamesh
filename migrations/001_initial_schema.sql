-- Sai Samarth Trading Company - Database Schema Migration (001_initial_schema.sql)
-- Supports separate Demo and Real Business SQLite databases with strict decimal precision,
-- idempotent document posting, perpetual moving weighted-average inventory, and audit trails.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS business_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'viewer')),
  assigned_location_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_mr TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('shop', 'godown')),
  address TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS commodities (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_mr TEXT NOT NULL,
  default_cutting_rule TEXT NOT NULL CHECK (default_cutting_rule IN ('RULE_10G_PER_KG', 'RULE_2KG_PER_100KG', 'CUSTOM')),
  custom_cutting_percent REAL NOT NULL DEFAULT 0,
  cutting_impact TEXT NOT NULL DEFAULT 'settlement_only' CHECK (cutting_impact IN ('settlement_only', 'both', 'physical_only')),
  default_rate_per_quintal REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS financial_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CASH', 'BANK')),
  bank_name TEXT,
  account_number TEXT,
  upi_id TEXT,
  supports_upi INTEGER NOT NULL DEFAULT 0,
  location_id TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  current_balance REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('farmer', 'customer', 'supplier', 'both')),
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  village_or_city TEXT,
  gst_or_pan TEXT,
  opening_balance REAL NOT NULL DEFAULT 0, -- positive: payable to farmer / receivable from customer based on type
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_balances (
  location_id TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  qty_kg REAL NOT NULL DEFAULT 0,
  total_value REAL NOT NULL DEFAULT 0,
  avg_cost_per_kg REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (location_id, commodity_id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (commodity_id) REFERENCES commodities(id)
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  purchase_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT UNIQUE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
  party_id TEXT NOT NULL,
  farmer_name TEXT NOT NULL,
  farmer_mobile TEXT NOT NULL,
  farmer_village TEXT,
  location_id TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  weighing_mode TEXT NOT NULL CHECK (weighing_mode IN ('direct', 'weighbridge')),
  gross_weight_kg REAL NOT NULL DEFAULT 0,
  tare_weight_kg REAL NOT NULL DEFAULT 0,
  material_input_kg REAL NOT NULL DEFAULT 0,
  cutting_rule_applied TEXT NOT NULL,
  deductions_json TEXT NOT NULL DEFAULT '[]',
  payable_deductions_kg REAL NOT NULL DEFAULT 0,
  physical_deductions_kg REAL NOT NULL DEFAULT 0,
  payable_weight_kg REAL NOT NULL DEFAULT 0,
  physical_stock_received_kg REAL NOT NULL DEFAULT 0,
  rate_value REAL NOT NULL DEFAULT 0,
  rate_unit TEXT NOT NULL CHECK (rate_unit IN ('per_kg', 'per_quintal')),
  rate_per_kg REAL NOT NULL DEFAULT 0,
  purchase_amount REAL NOT NULL DEFAULT 0,
  landed_expense_amount REAL NOT NULL DEFAULT 0,
  total_carrying_value REAL NOT NULL DEFAULT 0,
  immediate_payment_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  balance_amount REAL NOT NULL DEFAULT 0,
  payment_mode TEXT,
  payment_account_id TEXT,
  payment_reference TEXT,
  vehicle_number TEXT,
  weighbridge_slip_ref TEXT,
  weighbridge_photo_data TEXT,
  remarks TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT,
  reversed_at TEXT,
  reversed_by TEXT,
  reversal_reason TEXT,
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (commodity_id) REFERENCES commodities(id)
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT UNIQUE,
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
  party_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_mobile TEXT NOT NULL,
  customer_city TEXT,
  location_id TEXT NOT NULL,
  commodity_id TEXT NOT NULL,
  vehicle_number TEXT,
  dispatched_kg REAL NOT NULL DEFAULT 0,
  billable_kg REAL NOT NULL DEFAULT 0,
  weight_diff_kg REAL NOT NULL DEFAULT 0,
  weight_diff_explanation TEXT,
  selling_rate_value REAL NOT NULL DEFAULT 0,
  selling_rate_unit TEXT NOT NULL CHECK (selling_rate_unit IN ('per_kg', 'per_quintal')),
  selling_rate_per_kg REAL NOT NULL DEFAULT 0,
  sale_amount REAL NOT NULL DEFAULT 0,
  avg_cost_per_kg_at_sale REAL NOT NULL DEFAULT 0,
  cogs_amount REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  immediate_collection_amount REAL NOT NULL DEFAULT 0,
  received_amount REAL NOT NULL DEFAULT 0,
  balance_amount REAL NOT NULL DEFAULT 0,
  collection_mode TEXT,
  collection_account_id TEXT,
  collection_reference TEXT,
  remarks TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT,
  reversed_at TEXT,
  reversed_by TEXT,
  reversal_reason TEXT,
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (commodity_id) REFERENCES commodities(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  payment_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT UNIQUE,
  date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('OUTFLOW', 'INFLOW')),
  category TEXT NOT NULL CHECK (category IN ('FARMER_PAYMENT', 'CUSTOMER_COLLECTION', 'EXPENSE_PAYMENT', 'ADVANCE_PAID', 'ADVANCE_RECEIVED', 'REFUND')),
  party_id TEXT,
  party_name TEXT,
  party_mobile TEXT,
  amount REAL NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE')),
  account_id TEXT NOT NULL,
  reference_number TEXT,
  linked_purchase_id TEXT,
  linked_sale_id TEXT,
  linked_expense_id TEXT,
  allocations_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'REVERSED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES financial_accounts(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  movement_number TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('OPENING', 'PURCHASE', 'SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN_IN', 'RETURN_OUT', 'LOSS', 'ADJUSTMENT', 'REVERSAL')),
  location_id TEXT NOT NULL,
  counterpart_location_id TEXT,
  commodity_id TEXT NOT NULL,
  qty_change_kg REAL NOT NULL,
  unit_cost_per_kg REAL NOT NULL DEFAULT 0,
  value_change REAL NOT NULL DEFAULT 0,
  resulting_qty_kg REAL NOT NULL DEFAULT 0,
  resulting_value REAL NOT NULL DEFAULT 0,
  resulting_avg_cost_per_kg REAL NOT NULL DEFAULT 0,
  reference_doc_id TEXT,
  reference_doc_number TEXT,
  vehicle_number TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  expense_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT UNIQUE,
  date TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('TRANSPORTATION', 'HAMALI', 'LOADING_UNLOADING', 'RENT', 'ELECTRICITY', 'WEIGHBRIDGE_FEE', 'PACKAGING', 'OTHER')),
  classification TEXT NOT NULL CHECK (classification IN ('operating_expense', 'landed_cost')),
  amount REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  balance_amount REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
  location_id TEXT, -- NULL or 'ALL_PREMISES' for shared premises expenses like monthly rent so never counted once per shop
  is_shared_premises INTEGER NOT NULL DEFAULT 0,
  recurring_month_key TEXT, -- e.g. '2026-11' for rent obligation deduplication
  payee_name TEXT NOT NULL,
  linked_purchase_id TEXT,
  linked_sale_id TEXT,
  commodity_id TEXT,
  bill_reference TEXT,
  bill_attachment_data TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'REVERSED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT
);
