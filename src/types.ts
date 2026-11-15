import type {
  CuttingRuleCode,
  DeductionImpact,
  DeductionLineInput,
  ExpenseClassification,
  RateUnit,
  WeightUnit,
} from './utils/calculations';

export type EnvMode = 'demo' | 'real';
export type LangMode = 'en' | 'mr';
export type UserRole = 'owner' | 'staff' | 'viewer';

export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  assignedLocationId: string | null;
}

export interface LocationItem {
  id: string;
  code: string;
  name_en: string;
  name_mr: string;
  type: 'shop' | 'godown';
  address: string;
}

export interface CommodityItem {
  id: string;
  code: string;
  name_en: string;
  name_mr: string;
  default_cutting_rule: CuttingRuleCode;
  custom_cutting_percent: number;
  cutting_impact: DeductionImpact;
  default_rate_per_quintal: number;
}

export interface FinancialAccount {
  id: string;
  name: string;
  type: 'CASH' | 'BANK';
  bank_name: string | null;
  account_number: string | null;
  upi_id: string | null;
  supports_upi: number;
  location_id: string | null;
  opening_balance: number;
  current_balance: number;
}

export interface PartyItem {
  id: string;
  type: 'farmer' | 'customer' | 'supplier' | 'both';
  name: string;
  mobile: string;
  village_or_city: string;
  gst_or_pan: string;
  opening_balance: number;
  notes: string;
  created_at: string;
}

export interface StockBalanceRow {
  location_id: string;
  commodity_id: string;
  qty_kg: number;
  total_value: number;
  avg_cost_per_kg: number;
  updated_at: string;
}

export interface PurchaseRecord {
  id: string;
  purchase_number: string;
  idempotency_key: string | null;
  date: string;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  party_id: string;
  farmer_name: string;
  farmer_mobile: string;
  farmer_village: string;
  location_id: string;
  commodity_id: string;
  weighing_mode: 'direct' | 'weighbridge';
  gross_weight_kg: number;
  tare_weight_kg: number;
  material_input_kg: number;
  cutting_rule_applied: CuttingRuleCode;
  deductions_json: string;
  payable_deductions_kg: number;
  physical_deductions_kg: number;
  payable_weight_kg: number;
  physical_stock_received_kg: number;
  rate_value: number;
  rate_unit: RateUnit;
  rate_per_kg: number;
  purchase_amount: number;
  landed_expense_amount: number;
  total_carrying_value: number;
  immediate_payment_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_mode: string;
  payment_account_id: string;
  payment_reference: string;
  vehicle_number: string;
  weighbridge_slip_ref: string;
  weighbridge_photo_data: string | null;
  remarks: string;
  created_by: string;
  created_at: string;
  posted_at: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
}

export interface SaleRecord {
  id: string;
  invoice_number: string;
  idempotency_key: string | null;
  date: string;
  due_date: string | null;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  party_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_city: string;
  location_id: string;
  commodity_id: string;
  vehicle_number: string;
  dispatched_kg: number;
  billable_kg: number;
  weight_diff_kg: number;
  weight_diff_explanation: string;
  selling_rate_value: number;
  selling_rate_unit: RateUnit;
  selling_rate_per_kg: number;
  sale_amount: number;
  avg_cost_per_kg_at_sale: number;
  cogs_amount: number;
  gross_profit: number;
  immediate_collection_amount: number;
  received_amount: number;
  balance_amount: number;
  collection_mode: string;
  collection_account_id: string;
  collection_reference: string;
  remarks: string;
  created_by: string;
  created_at: string;
  posted_at: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
}

export interface PaymentRecord {
  id: string;
  payment_number: string;
  date: string;
  direction: 'OUTFLOW' | 'INFLOW';
  category:
    | 'FARMER_PAYMENT'
    | 'CUSTOMER_COLLECTION'
    | 'EXPENSE_PAYMENT'
    | 'ADVANCE_PAID'
    | 'ADVANCE_RECEIVED'
    | 'REFUND';
  party_id: string | null;
  party_name: string;
  party_mobile: string;
  amount: number;
  mode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
  account_id: string;
  reference_number: string;
  linked_purchase_id: string | null;
  linked_sale_id: string | null;
  linked_expense_id: string | null;
  allocations_json: string;
  notes: string;
  status: 'POSTED' | 'REVERSED';
  created_by: string;
  created_at: string;
}

export interface StockMovementRecord {
  id: string;
  movement_number: string;
  date: string;
  movement_type:
    | 'OPENING'
    | 'PURCHASE'
    | 'SALE'
    | 'TRANSFER_OUT'
    | 'TRANSFER_IN'
    | 'RETURN_IN'
    | 'RETURN_OUT'
    | 'LOSS'
    | 'ADJUSTMENT'
    | 'REVERSAL';
  location_id: string;
  counterpart_location_id: string | null;
  commodity_id: string;
  qty_change_kg: number;
  unit_cost_per_kg: number;
  value_change: number;
  resulting_qty_kg: number;
  resulting_value: number;
  resulting_avg_cost_per_kg: number;
  reference_doc_id: string | null;
  reference_doc_number: string | null;
  vehicle_number: string | null;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface ExpenseRecord {
  id: string;
  expense_number: string;
  date: string;
  category:
    | 'TRANSPORTATION'
    | 'HAMALI'
    | 'LOADING_UNLOADING'
    | 'RENT'
    | 'ELECTRICITY'
    | 'WEIGHBRIDGE_FEE'
    | 'PACKAGING'
    | 'OTHER';
  classification: ExpenseClassification;
  amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID';
  location_id: string | null;
  is_shared_premises: number;
  recurring_month_key: string | null;
  payee_name: string;
  linked_purchase_id: string | null;
  linked_sale_id: string | null;
  commodity_id: string | null;
  bill_reference: string;
  bill_attachment_data: string | null;
  notes: string;
  status: 'POSTED' | 'REVERSED';
  created_by: string;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  username: string;
  role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  details_json: string | null;
}

export interface AppBootstrapData {
  envMode: EnvMode;
  user: UserProfile;
  settings: Record<string, string>;
  locations: LocationItem[];
  commodities: CommodityItem[];
  accounts: FinancialAccount[];
  parties: PartyItem[];
  stockBalances: StockBalanceRow[];
  purchases: PurchaseRecord[];
  sales: SaleRecord[];
  payments: PaymentRecord[];
  stockMovements: StockMovementRecord[];
  expenses: ExpenseRecord[];
  users: Array<{
    id: string;
    username: string;
    full_name: string;
    role: UserRole;
    assigned_location_id: string | null;
    active: number;
    created_at: string;
  }>;
  auditLogs: AuditLogRecord[];
}

export type ActiveTab =
  | 'dashboard'
  | 'purchases'
  | 'sales'
  | 'stock'
  | 'payments'
  | 'expenses'
  | 'parties'
  | 'reports'
  | 'settings';

export function formatINR(amount: number): string {
  const num = Number(amount || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatKg(kg: number, unit: WeightUnit = 'kg'): string {
  const num = Number(kg || 0);
  if (unit === 'quintal') {
    const q = (num / 100).toFixed(2);
    return `${q} Qtl (${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg)`;
  }
  return `${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;
}

export function exportToCsv(filename: string, rows: Array<Record<string, string | number | null | undefined>>) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = r[h] ?? '';
          const escaped = String(val).replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    ),
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type {
  CuttingRuleCode,
  DeductionImpact,
  DeductionLineInput,
  ExpenseClassification,
  RateUnit,
  WeightUnit,
};

