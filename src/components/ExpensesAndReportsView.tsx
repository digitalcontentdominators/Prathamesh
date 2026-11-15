import React, { useMemo, useState } from 'react';
import {
  Building2,
  AlertTriangle,
  CheckCircle2,
  Download,
  Printer,
  Calendar,
} from 'lucide-react';
import { exportToCsv, formatINR, formatKg } from '../types';
import type { AppBootstrapData, LangMode, WeightUnit } from '../types';
import { calculateProfitSummary } from '../utils/calculations';
import type { ExpenseClassification } from '../utils/calculations';

interface ExpensesAndReportsViewProps {
  mode: 'expenses' | 'reports';
  data: AppBootstrapData;
  lang: LangMode;
  displayUnit: WeightUnit;
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
}

export const ExpensesAndReportsView: React.FC<ExpensesAndReportsViewProps> = ({
  mode,
  data,
  lang,
  displayUnit,
  apiRequest,
  onRefresh,
}) => {
  const isViewer = data.user.role === 'viewer';
  const isOwner = data.user.role === 'owner';
  const canViewProfit = isOwner || isViewer;

  const rentConfirmed = data.settings.rent_premises_confirmed === '1';
  const [rentTemplateAmount, setRentTemplateAmount] = useState<string>(
    data.settings.rent_monthly_amount || '40000'
  );
  const [rentScope, setRentScope] = useState<string>(
    data.settings.rent_premises_scope || 'ALL_PREMISES_COMBINED (4 Shops + 1 Central Godown)'
  );
  const [rentPayee, setRentPayee] = useState<string>(
    data.settings.rent_payee_name || 'Shri Deshmukh Commercial Complex & Godown Trust'
  );
  const [rentMonthKey, setRentMonthKey] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );

  // Expense Form State
  const [expDate, setExpDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [expCategory, setExpCategory] = useState<
    | 'TRANSPORTATION'
    | 'HAMALI'
    | 'LOADING_UNLOADING'
    | 'RENT'
    | 'ELECTRICITY'
    | 'WEIGHBRIDGE_FEE'
    | 'PACKAGING'
    | 'OTHER'
  >('TRANSPORTATION');
  const [classification, setClassification] =
    useState<ExpenseClassification>('operating_expense');
  const [expAmount, setExpAmount] = useState<string>('');
  const [paidNowAmount, setPaidNowAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE'>(
    'CASH'
  );
  const [paymentAccountId, setPaymentAccountId] = useState<string>('acc_cash_shop1');
  const [locationId, setLocationId] = useState<string>('loc_shop1');
  const [isSharedPremises, setIsSharedPremises] = useState<boolean>(false);
  const [commodityId, setCommodityId] = useState<string>('comm_soybean');
  const [payeeName, setPayeeName] = useState<string>('');
  const [billReference, setBillReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Reports Filter State
  const [reportTab, setReportTab] = useState<
    'trading_pl' | 'purchase_reg' | 'sales_reg' | 'stock_val' | 'cashbook' | 'expense_reg'
  >(canViewProfit ? 'trading_pl' : 'purchase_reg');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const handleConfirmRentTemplate = async () => {
    setFeedback(null);
    try {
      await apiRequest('/api/settings/confirm-rent-template', {
        method: 'POST',
        body: JSON.stringify({
          monthlyAmount: Number(rentTemplateAmount || 40000),
          premisesScope: rentScope,
          payeeName: rentPayee,
        }),
      });
      await onRefresh();
      setFeedback({
        type: 'success',
        message: `Owner confirmed recurring monthly rent template of ${formatINR(
          Number(rentTemplateAmount || 40000)
        )} (${rentScope}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleGenerateMonthlyRent = async () => {
    setFeedback(null);
    try {
      const res = await apiRequest<{ ok: boolean; expenseNumber: string }>(
        '/api/expenses/generate-rent',
        {
          method: 'POST',
          body: JSON.stringify({ monthKey: rentMonthKey }),
        }
      );
      await onRefresh();
      setFeedback({
        type: 'success',
        message: `Generated UNPAID monthly rent obligation ${res.expenseNumber} for ${rentMonthKey}. Record actual payment separately in Payments when paid.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handlePostExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!payeeName.trim() || Number(expAmount || 0) <= 0) {
      setFeedback({ type: 'error', message: 'Payee name and positive amount are required.' });
      return;
    }

    try {
      const res = await apiRequest<{ ok: boolean; expenseNumber: string }>('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: `exp_${expDate}_${payeeName.trim()}_${expAmount}_${Date.now()}`,
          date: expDate,
          category: expCategory,
          classification,
          amount: Number(expAmount || 0),
          paidNowAmount: Number(paidNowAmount || 0),
          paymentMode,
          paymentAccountId,
          locationId: isSharedPremises ? null : locationId,
          isSharedPremises,
          commodityId: classification === 'landed_cost' ? commodityId : null,
          payeeName: payeeName.trim(),
          billReference,
          notes,
        }),
      });
      setExpAmount('');
      setPaidNowAmount('');
      setPayeeName('');
      setBillReference('');
      setNotes('');
      await onRefresh();
      setFeedback({
        type: 'success',
        message: `Recorded Expense ${res.expenseNumber} (${
          classification === 'landed_cost'
            ? 'Capitalized as Landed Inventory Cost — excluded from Operating Expenses'
            : 'Operating Expense'
        }).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const tradingSummary = useMemo(() => {
    const activePurchases = data.purchases.filter((p) => p.status === 'POSTED');
    const activeSales = data.sales.filter((s) => s.status === 'POSTED');
    const activeExpenses = data.expenses.filter((e) => e.status === 'POSTED');

    const totalPurchases = activePurchases.reduce((s, p) => s + p.purchase_amount, 0);
    const totalSalesRevenue = activeSales.reduce((s, sale) => s + sale.sale_amount, 0);
    const totalCOGS = activeSales.reduce((s, sale) => s + sale.cogs_amount, 0);
    const closingStockValue = data.stockBalances.reduce((s, b) => s + b.total_value, 0);
    const closingStockKg = data.stockBalances.reduce((s, b) => s + b.qty_kg, 0);

    const profit = calculateProfitSummary({
      totalSalesRevenue,
      totalCOGS,
      expenses: activeExpenses.map((e) => ({
        amount: e.amount,
        classification: e.classification,
      })),
    });

    return {
      totalPurchases,
      totalSalesRevenue,
      totalCOGS,
      closingStockValue,
      closingStockKg,
      ...profit,
    };
  }, [data.purchases, data.sales, data.expenses, data.stockBalances]);

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="alert"
          className={`rounded-xl p-4 text-xs font-medium border flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline ml-4 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {mode === 'expenses' ? (
        <>
          {/* Recurring Monthly Rent Template (₹40,000) & Owner Confirmation Card */}
          <div
            className={`rounded-2xl p-5 border space-y-4 ${
              !rentConfirmed
                ? 'bg-amber-50 border-amber-300'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  {!rentConfirmed ? (
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  )}
                  <span>
                    {lang === 'mr'
                      ? 'मासिक भाडे टेंपलेट (₹४०,०००) व दुकान/गोदाम व्याप्ती पुष्टी'
                      : 'Recurring Monthly Rent Template (₹40,000) & Premises Scope Confirmation'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  The stated monthly rent is ₹40,000. Confirm whether this covers all 4 shops and 1
                  godown combined or specific premises. Generating a monthly obligation marks it
                  UNPAID (never automatically marked paid) and never counts shared premises rent 5
                  times across shops.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label htmlFor="rent-amt" className="block text-xs font-medium text-slate-700 mb-1">
                  Monthly Rent Amount (₹)
                </label>
                <input
                  id="rent-amt"
                  type="number"
                  value={rentTemplateAmount}
                  onChange={(e) => setRentTemplateAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label htmlFor="rent-scope" className="block text-xs font-medium text-slate-700 mb-1">
                  Premises Covered
                </label>
                <select
                  id="rent-scope"
                  value={rentScope}
                  onChange={(e) => setRentScope(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium"
                >
                  <option value="ALL_PREMISES_COMBINED (4 Shops + 1 Central Godown)">
                    All Premises Combined (4 Shops + 1 Godown)
                  </option>
                  <option value="CENTRAL_GODOWN_ONLY">Central Godown Only</option>
                  <option value="FOUR_SHOPS_ONLY">4 Market Shops Combined Only</option>
                </select>
              </div>

              <div>
                <label htmlFor="rent-payee" className="block text-xs font-medium text-slate-700 mb-1">
                  Landlord / Payee Name
                </label>
                <input
                  id="rent-payee"
                  type="text"
                  value={rentPayee}
                  onChange={(e) => setRentPayee(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>

              <div className="flex items-end gap-2">
                {isOwner && (
                  <button
                    type="button"
                    onClick={handleConfirmRentTemplate}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap min-h-[40px]"
                  >
                    {rentConfirmed ? 'Update Template' : 'Confirm Rent Scope'}
                  </button>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-700">
                  Generate Monthly Rent Obligation (Duplicate-Protected):
                </span>
                <input
                  type="month"
                  aria-label="Rent Obligation Month"
                  value={rentMonthKey}
                  onChange={(e) => setRentMonthKey(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              {!isViewer && (
                <button
                  type="button"
                  onClick={handleGenerateMonthlyRent}
                  className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 min-h-[40px]"
                >
                  Generate {rentMonthKey} Rent Obligation (UNPAID)
                </button>
              )}
            </div>
          </div>

          {/* General Expense Entry Form */}
          {!isViewer && (
            <form
              onSubmit={handlePostExpense}
              className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                <Building2 className="w-4 h-4 text-emerald-700" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {lang === 'mr'
                      ? 'हमाली, वाहतूक, वीजबिल व इतर खर्च नोंद (Record Business Expense)'
                      : 'Record Transportation, Hamali, Loading, Electricity & Other Expenses'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Classify inbound transport/hamali as either Landed Inventory Cost or Operating
                    Expense—never counted twice.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="exp-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Expense Date
                  </label>
                  <input
                    id="exp-date"
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="exp-cat" className="block text-xs font-medium text-slate-700 mb-1">
                    Expense Category
                  </label>
                  <select
                    id="exp-cat"
                    value={expCategory}
                    onChange={(e) =>
                      setExpCategory(
                        e.target.value as
                          | 'TRANSPORTATION'
                          | 'HAMALI'
                          | 'LOADING_UNLOADING'
                          | 'RENT'
                          | 'ELECTRICITY'
                          | 'WEIGHBRIDGE_FEE'
                          | 'PACKAGING'
                          | 'OTHER'
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold min-h-[42px]"
                  >
                    <option value="TRANSPORTATION">Transportation / Freight (वाहतूक)</option>
                    <option value="HAMALI">Hamali / Mathadi Labor (हमाली)</option>
                    <option value="LOADING_UNLOADING">Loading & Unloading (भराई / उतराई)</option>
                    <option value="ELECTRICITY">Electricity Bill (वीजबिल - Actual Only)</option>
                    <option value="RENT">Shop / Godown Rent (भाडे)</option>
                    <option value="WEIGHBRIDGE_FEE">Weighbridge / Kanta Fee (काटा फी)</option>
                    <option value="PACKAGING">Gunny Bags / Sutli / Packaging (बारदाना)</option>
                    <option value="OTHER">Other Operating Expense</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="exp-class" className="block text-xs font-medium text-slate-700 mb-1">
                    Accounting Classification (Prevents Double Counting)
                  </label>
                  <select
                    id="exp-class"
                    value={classification}
                    onChange={(e) => setClassification(e.target.value as ExpenseClassification)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold min-h-[42px]"
                  >
                    <option value="operating_expense">
                      Operating Expense (Deducted from Gross Profit → Net Trading Profit)
                    </option>
                    <option value="landed_cost">
                      Landed Inventory Cost (Capitalized into Stock Value → COGS when sold)
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="exp-payee" className="block text-xs font-medium text-slate-700 mb-1">
                    Payee / Vendor Name *
                  </label>
                  <input
                    id="exp-payee"
                    type="text"
                    required
                    placeholder="e.g. MSEDCL / Hamal Toli"
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="exp-amt" className="block text-xs font-medium text-slate-700 mb-1">
                    Total Bill Amount (₹) *
                  </label>
                  <input
                    id="exp-amt"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono font-bold min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="exp-paid" className="block text-xs font-medium text-slate-700 mb-1">
                    Paid Immediately (₹)
                  </label>
                  <input
                    id="exp-paid"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="0 if unpaid obligation"
                    value={paidNowAmount}
                    onChange={(e) => setPaidNowAmount(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="exp-loc" className="block text-xs font-medium text-slate-700 mb-1">
                    Location / Shared Scope
                  </label>
                  <select
                    id="exp-loc"
                    value={isSharedPremises ? 'SHARED' : locationId}
                    onChange={(e) => {
                      if (e.target.value === 'SHARED') {
                        setIsSharedPremises(true);
                      } else {
                        setIsSharedPremises(false);
                        setLocationId(e.target.value);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium min-h-[42px]"
                  >
                    <option value="SHARED">Shared Across All Premises (Counted Once)</option>
                    {data.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                {classification === 'landed_cost' && (
                  <div>
                    <label htmlFor="exp-comm" className="block text-xs font-medium text-slate-700 mb-1">
                      Target Stock Commodity
                    </label>
                    <select
                      id="exp-comm"
                      value={commodityId}
                      onChange={(e) => setCommodityId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold min-h-[40px]"
                    >
                      {data.commodities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name_en}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="exp-acc" className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Account (if paid)
                  </label>
                  <select
                    id="exp-acc"
                    value={paymentAccountId}
                    onChange={(e) => setPaymentAccountId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs min-h-[40px]"
                  >
                    {data.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="exp-ref" className="block text-xs font-medium text-slate-700 mb-1">
                    Bill / Voucher Reference
                  </label>
                  <input
                    id="exp-ref"
                    type="text"
                    placeholder="Bill #"
                    value={billReference}
                    onChange={(e) => setBillReference(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[40px]"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 min-h-[42px]"
                  >
                    Record Expense
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Expenses Table */}
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'mr' ? 'खर्च रजिस्टर (Expenses Register)' : 'Expenses & Rent Obligations Register'}
              </h2>
            </div>
            {/* Mobile Summary Cards for Expenses */}
            <div className="md:hidden divide-y divide-slate-100">
              {data.expenses.map((e) => {
                const loc = data.locations.find((l) => l.id === e.location_id);
                return (
                  <div key={e.id} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-xs font-bold text-slate-900">
                          {e.expense_number} · {e.category}
                        </div>
                        <div className="text-sm font-bold text-slate-900">{e.payee_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {e.date} ·{' '}
                          {e.is_shared_premises
                            ? 'Shared Premises'
                            : loc?.name_en || 'General'}
                        </div>
                      </div>
                      <div className="text-right font-mono shrink-0">
                        <div className="text-sm font-bold text-slate-900">
                          {formatINR(e.amount)}
                        </div>
                        <div
                          className={`text-[11px] font-bold ${
                            e.payment_status === 'PAID'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {e.payment_status}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-semibold">Expense # / Date</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Category & Classification</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Payee & Location</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Amount</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Payment Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.expenses.map((e) => {
                    const loc = data.locations.find((l) => l.id === e.location_id);
                    return (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono">
                          <div className="font-bold text-slate-900">{e.expense_number}</div>
                          <div className="text-[11px] text-slate-500">{e.date}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{e.category}</div>
                          <div className="text-[11px] text-slate-500">
                            {e.classification === 'landed_cost'
                              ? 'Landed Inventory Cost (Capitalized)'
                              : 'Operating Expense (P&L)'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{e.payee_name}</div>
                          <div className="text-[11px] text-slate-500">
                            {e.is_shared_premises
                              ? 'Shared Premises (All 4 Shops + 1 Godown)'
                              : loc?.name_en || 'General'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {formatINR(e.amount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          <div
                            className={`font-bold ${
                              e.payment_status === 'PAID'
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {e.payment_status}
                          </div>
                          {e.balance_amount > 0 && (
                            <div className="text-[11px] text-slate-500">
                              Due: {formatINR(e.balance_amount)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Mode === 'reports': Comprehensive Business Reports, CSV Exports & Print */
        <div className="space-y-6">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
              {[
                ...(canViewProfit ? [{ id: 'trading_pl', label: 'Trading & Profit Report' }] : []),
                { id: 'purchase_reg', label: 'Purchase Register' },
                { id: 'sales_reg', label: 'Sales Register' },
                { id: 'stock_val', label: 'Stock Valuation' },
                { id: 'cashbook', label: 'Cashbook & Bank Book' },
                { id: 'expense_reg', label: 'Expense Report' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setReportTab(
                      t.id as
                        | 'trading_pl'
                        | 'purchase_reg'
                        | 'sales_reg'
                        | 'stock_val'
                        | 'cashbook'
                        | 'expense_reg'
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    reportTab === t.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (reportTab === 'purchase_reg') {
                    exportToCsv(
                      'Purchase_Register',
                      data.purchases.map((p) => ({
                        PurchaseNumber: p.purchase_number,
                        Date: p.date,
                        Status: p.status,
                        FarmerName: p.farmer_name,
                        Mobile: p.farmer_mobile,
                        MaterialInputKg: p.material_input_kg,
                        PayableKg: p.payable_weight_kg,
                        PhysicalReceivedKg: p.physical_stock_received_kg,
                        RatePerKg: p.rate_per_kg,
                        PurchaseAmount: p.purchase_amount,
                        PaidAmount: p.paid_amount,
                        BalanceDue: p.balance_amount,
                      }))
                    );
                  } else if (reportTab === 'sales_reg') {
                    exportToCsv(
                      'Sales_Register',
                      data.sales.map((s) => ({
                        InvoiceNumber: s.invoice_number,
                        Date: s.date,
                        Status: s.status,
                        CustomerName: s.customer_name,
                        DispatchedKg: s.dispatched_kg,
                        BillableKg: s.billable_kg,
                        SaleRevenue: s.sale_amount,
                        COGS: s.cogs_amount,
                        GrossProfit: s.gross_profit,
                        Received: s.received_amount,
                        BalanceReceivable: s.balance_amount,
                      }))
                    );
                  } else {
                    exportToCsv(
                      'Stock_Valuation_Report',
                      data.stockBalances.map((sb) => ({
                        Location: sb.location_id,
                        Commodity: sb.commodity_id,
                        QuantityKg: sb.qty_kg,
                        AvgCarryingCostPerKg: sb.avg_cost_per_kg,
                        TotalCarryingValue: sb.total_value,
                      }))
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV / Excel</span>
              </button>
            </div>
          </div>

          {reportTab === 'trading_pl' && (
            <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Consolidated Trading, Inventory Valuation & Profit Statement
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gross Profit = Sales Revenue − Moving Weighted-Average Cost of Goods Sold.
                  Estimated Net Trading Profit = Gross Profit − Operating Expenses.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl bg-slate-50 p-5 border border-slate-200 space-y-3 font-mono text-xs">
                  <div className="font-sans font-bold text-slate-900 text-sm pb-2 border-b border-slate-200">
                    1. Trading & Gross Profit Calculation (Accrual Basis)
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">
                      Total Sales Revenue (Billable Weight):
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatINR(tradingSummary.totalSalesRevenue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">
                      Less: Cost of Goods Sold (Perpetual Weighted-Avg):
                    </span>
                    <span className="text-amber-800">− {formatINR(tradingSummary.totalCOGS)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold">
                    <span className="font-sans text-slate-900">Gross Trading Profit:</span>
                    <span className="text-emerald-700">
                      {formatINR(tradingSummary.grossProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="font-sans text-slate-600">
                      Less: Operating Expenses (Excludes Landed Costs):
                    </span>
                    <span className="text-amber-800">
                      − {formatINR(tradingSummary.operatingExpenses)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-bold">
                    <span className="font-sans text-slate-900">Estimated Net Trading Profit:</span>
                    <span
                      className={
                        tradingSummary.estimatedNetTradingProfit >= 0
                          ? 'text-emerald-700'
                          : 'text-red-600'
                      }
                    >
                      {formatINR(tradingSummary.estimatedNetTradingProfit)}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-5 border border-slate-200 space-y-3 font-mono text-xs">
                  <div className="font-sans font-bold text-slate-900 text-sm pb-2 border-b border-slate-200">
                    2. Inventory Carrying Value & Cash Separation
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Total Purchases Recorded:</span>
                    <span className="font-bold text-slate-900">
                      {formatINR(tradingSummary.totalPurchases)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">
                      + Capitalized Inbound Landed Costs:
                    </span>
                    <span className="text-slate-800">
                      {formatINR(tradingSummary.capitalizedLandedCosts)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="font-sans text-slate-600">
                      Closing Physical Stock Across 4 Shops + 1 Godown:
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatKg(tradingSummary.closingStockKg, displayUnit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="font-sans text-slate-900">
                      Closing Stock Carrying Value (At Cost):
                    </span>
                    <span className="text-blue-700">
                      {formatINR(tradingSummary.closingStockValue)}
                    </span>
                  </div>
                  <p className="font-sans text-[11px] text-slate-500 pt-2">
                    Note: Profit is kept strictly separate from cash flow, and closing stock is
                    valued at moving weighted-average carrying cost, never expected selling price.
                  </p>
                </div>
              </div>
            </div>
          )}

          {reportTab !== 'trading_pl' && (
            <div className="rounded-2xl bg-white border border-slate-200 p-5 overflow-x-auto">
              {reportTab === 'purchase_reg' && (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-left">Purchase #</th>
                      <th className="py-2 px-3 text-left">Date</th>
                      <th className="py-2 px-3 text-left">Farmer</th>
                      <th className="py-2 px-3 text-right">Material Kg</th>
                      <th className="py-2 px-3 text-right">Payable Kg</th>
                      <th className="py-2 px-3 text-right">Physical Stock Kg</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                      <th className="py-2 px-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {data.purchases.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 px-3 font-bold">{p.purchase_number}</td>
                        <td className="py-2 px-3">{p.date}</td>
                        <td className="py-2 px-3 font-sans">{p.farmer_name}</td>
                        <td className="py-2 px-3 text-right">{p.material_input_kg} kg</td>
                        <td className="py-2 px-3 text-right">{p.payable_weight_kg} kg</td>
                        <td className="py-2 px-3 text-right font-bold text-blue-700">
                          {p.physical_stock_received_kg} kg
                        </td>
                        <td className="py-2 px-3 text-right font-bold">
                          {formatINR(p.purchase_amount)}
                        </td>
                        <td className="py-2 px-3 text-right text-amber-700">
                          {formatINR(p.balance_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {reportTab === 'sales_reg' && (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-left">Invoice #</th>
                      <th className="py-2 px-3 text-left">Date</th>
                      <th className="py-2 px-3 text-left">Customer</th>
                      <th className="py-2 px-3 text-right">Dispatched Kg</th>
                      <th className="py-2 px-3 text-right">Billable Kg</th>
                      <th className="py-2 px-3 text-right">Revenue</th>
                      <th className="py-2 px-3 text-right">COGS</th>
                      <th className="py-2 px-3 text-right">Gross Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {data.sales.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 px-3 font-bold">{s.invoice_number}</td>
                        <td className="py-2 px-3">{s.date}</td>
                        <td className="py-2 px-3 font-sans">{s.customer_name}</td>
                        <td className="py-2 px-3 text-right">{s.dispatched_kg} kg</td>
                        <td className="py-2 px-3 text-right">{s.billable_kg} kg</td>
                        <td className="py-2 px-3 text-right font-bold">
                          {formatINR(s.sale_amount)}
                        </td>
                        <td className="py-2 px-3 text-right">{formatINR(s.cogs_amount)}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">
                          {formatINR(s.gross_profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {reportTab === 'stock_val' && (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-left">Location</th>
                      <th className="py-2 px-3 text-left">Commodity</th>
                      <th className="py-2 px-3 text-right">Physical Stock (kg / Qtl)</th>
                      <th className="py-2 px-3 text-right">Moving Avg Cost / kg</th>
                      <th className="py-2 px-3 text-right">Carrying Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {data.stockBalances
                      .filter((sb) => sb.qty_kg > 0)
                      .map((sb) => (
                        <tr key={`${sb.location_id}_${sb.commodity_id}`}>
                          <td className="py-2 px-3 font-sans">
                            {data.locations.find((l) => l.id === sb.location_id)?.name_en}
                          </td>
                          <td className="py-2 px-3 font-sans">
                            {data.commodities.find((c) => c.id === sb.commodity_id)?.name_en}
                          </td>
                          <td className="py-2 px-3 text-right font-bold">
                            {formatKg(sb.qty_kg, displayUnit)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {formatINR(sb.avg_cost_per_kg)}/kg
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-700">
                            {formatINR(sb.total_value)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}

              {reportTab === 'cashbook' && (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-left">Voucher #</th>
                      <th className="py-2 px-3 text-left">Date</th>
                      <th className="py-2 px-3 text-left">Account</th>
                      <th className="py-2 px-3 text-left">Mode</th>
                      <th className="py-2 px-3 text-left">Party & Particulars</th>
                      <th className="py-2 px-3 text-right">Inflow (+)</th>
                      <th className="py-2 px-3 text-right">Outflow (−)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {data.payments.map((pay) => (
                      <tr key={pay.id}>
                        <td className="py-2 px-3 font-bold">{pay.payment_number}</td>
                        <td className="py-2 px-3">{pay.date}</td>
                        <td className="py-2 px-3 font-sans">
                          {data.accounts.find((a) => a.id === pay.account_id)?.name}
                        </td>
                        <td className="py-2 px-3">{pay.mode}</td>
                        <td className="py-2 px-3 font-sans">
                          {pay.party_name} · {pay.notes}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-700 font-bold">
                          {pay.direction === 'INFLOW' ? formatINR(pay.amount) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-900 font-bold">
                          {pay.direction === 'OUTFLOW' ? formatINR(pay.amount) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {reportTab === 'expense_reg' && (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-left">Expense #</th>
                      <th className="py-2 px-3 text-left">Date</th>
                      <th className="py-2 px-3 text-left">Category</th>
                      <th className="py-2 px-3 text-left">Classification</th>
                      <th className="py-2 px-3 text-left">Payee</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                      <th className="py-2 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {data.expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 px-3 font-bold">{e.expense_number}</td>
                        <td className="py-2 px-3">{e.date}</td>
                        <td className="py-2 px-3 font-sans">{e.category}</td>
                        <td className="py-2 px-3 font-sans">{e.classification}</td>
                        <td className="py-2 px-3 font-sans">{e.payee_name}</td>
                        <td className="py-2 px-3 text-right font-bold">{formatINR(e.amount)}</td>
                        <td className="py-2 px-3 text-right">{e.payment_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
