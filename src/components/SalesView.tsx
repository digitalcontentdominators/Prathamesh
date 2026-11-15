import React, { useEffect, useMemo, useState } from 'react';
import { Printer, RotateCcw, Send, TrendingUp, AlertTriangle } from 'lucide-react';
import { formatINR, formatKg } from '../types';
import type {
  AppBootstrapData,
  LangMode,
  SaleRecord,
  WeightUnit,
} from '../types';
import { calculateSale, quintalToKg } from '../utils/calculations';
import type { RateUnit } from '../utils/calculations';
import { ReceiptModal } from './ReceiptModal';

interface SalesViewProps {
  data: AppBootstrapData;
  lang: LangMode;
  displayUnit: WeightUnit;
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
}

export const SalesView: React.FC<SalesViewProps> = ({
  data,
  lang,
  displayUnit,
  apiRequest,
  onRefresh,
}) => {
  const isViewer = data.user.role === 'viewer';
  const isOwner = data.user.role === 'owner';
  const canViewProfit = isOwner || isViewer;

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerMobile, setCustomerMobile] = useState<string>('');
  const [customerCity, setCustomerCity] = useState<string>('');
  const [locationId, setLocationId] = useState<string>(
    data.user.assignedLocationId || data.locations[0]?.id || 'loc_shop1'
  );
  const [commodityId, setCommodityId] = useState<string>(
    data.commodities[0]?.id || 'comm_soybean'
  );
  const [vehicleNumber, setVehicleNumber] = useState<string>('');

  const [entryWeightUnit, setEntryWeightUnit] = useState<WeightUnit>('kg');
  const [dispatchedInputVal, setDispatchedInputVal] = useState<string>('500');
  const [billableInputVal, setBillableInputVal] = useState<string>('500');
  const [weightDiffExplanation, setWeightDiffExplanation] = useState<string>('');

  const [sellingRateValue, setSellingRateValue] = useState<string>('5200');
  const [sellingRateUnit, setSellingRateUnit] = useState<RateUnit>('per_quintal');
  const [immediateCollectionAmount, setImmediateCollectionAmount] = useState<string>('0');
  const [collectionMode, setCollectionMode] = useState<
    'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE'
  >('BANK_TRANSFER');
  const [collectionAccountId, setCollectionAccountId] = useState<string>('acc_bank_hdfc');
  const [collectionReference, setCollectionReference] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [receiptSale, setReceiptSale] = useState<SaleRecord | null>(null);
  const [lastPostedInvoiceNumber, setLastPostedInvoiceNumber] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [historySearch, setHistorySearch] = useState<string>('');

  const currentStockRow = useMemo(
    () =>
      data.stockBalances.find(
        (sb) => sb.location_id === locationId && sb.commodity_id === commodityId
      ),
    [data.stockBalances, locationId, commodityId]
  );

  const dispatchedKg = useMemo(() => {
    const n = Number(dispatchedInputVal || 0);
    return entryWeightUnit === 'quintal' ? quintalToKg(n) : n;
  }, [dispatchedInputVal, entryWeightUnit]);

  const billableKg = useMemo(() => {
    const n = Number(billableInputVal || 0);
    return entryWeightUnit === 'quintal' ? quintalToKg(n) : n;
  }, [billableInputVal, entryWeightUnit]);

  const calc = useMemo(
    () =>
      calculateSale({
        dispatchedKg,
        billableKg,
        sellingRateValue: Number(sellingRateValue || 0),
        sellingRateUnit,
        immediateCollectionAmount: Number(immediateCollectionAmount || 0),
        currentLocationAvgCostPerKg: currentStockRow?.avg_cost_per_kg || 0,
        currentLocationStockKg: currentStockRow?.qty_kg || 0,
      }),
    [
      dispatchedKg,
      billableKg,
      sellingRateValue,
      sellingRateUnit,
      immediateCollectionAmount,
      currentStockRow,
    ]
  );

  const eligibleAccounts = useMemo(() => {
    if (collectionMode === 'CASH') {
      return data.accounts.filter((a) => a.type === 'CASH');
    }
    return data.accounts.filter((a) => a.type === 'BANK');
  }, [data.accounts, collectionMode]);

  useEffect(() => {
    if (
      eligibleAccounts.length > 0 &&
      !eligibleAccounts.some((a) => a.id === collectionAccountId)
    ) {
      setCollectionAccountId(eligibleAccounts[0].id);
    }
  }, [eligibleAccounts, collectionAccountId]);

  const customerParties = useMemo(
    () => data.parties.filter((p) => p.type === 'customer' || p.type === 'both'),
    [data.parties]
  );

  const handlePostSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!customerName.trim() || !customerMobile.trim()) {
      setFeedback({
        type: 'error',
        message: 'Customer / Factory name and mobile number are required.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `sal_${date}_${customerMobile.trim()}_${calc.dispatchedKg}_${calc.saleAmount}`;
      const res = await apiRequest<{ ok: boolean; invoiceNumber: string }>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          date,
          dueDate,
          status: 'POSTED',
          partyId: selectedPartyId || undefined,
          customerName: customerName.trim(),
          customerMobile: customerMobile.trim(),
          customerCity: customerCity.trim(),
          locationId,
          commodityId,
          vehicleNumber,
          dispatchedKg,
          billableKg,
          weightDiffExplanation,
          sellingRateValue: Number(sellingRateValue || 0),
          sellingRateUnit,
          immediateCollectionAmount: Number(immediateCollectionAmount || 0),
          collectionMode,
          collectionAccountId,
          collectionReference,
          remarks,
        }),
      });

      setCustomerName('');
      setCustomerMobile('');
      setCustomerCity('');
      setSelectedPartyId('');
      setVehicleNumber('');
      setWeightDiffExplanation('');
      setImmediateCollectionAmount('0');
      setCollectionReference('');
      setRemarks('');
      await onRefresh();
      setLastPostedInvoiceNumber(res.invoiceNumber);

      setFeedback({
        type: 'success',
        message: `Posted Sales Invoice ${res.invoiceNumber}: Dispatched ${calc.dispatchedKg} kg, Revenue ${formatINR(
          calc.saleAmount
        )}${canViewProfit ? `, Gross Profit ${formatINR(calc.grossProfit)}` : ''}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverseSale = async (id: string) => {
    if (!reversalReason.trim()) return;
    try {
      await apiRequest(`/api/sales/${id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reversalReason }),
      });
      setReversingId(null);
      setReversalReason('');
      await onRefresh();
      setFeedback({
        type: 'success',
        message: 'Sales invoice reversed and dispatched stock restored to location inventory.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const filteredSales = useMemo(
    () =>
      data.sales.filter((s) => {
        if (!historySearch.trim()) return true;
        const q = historySearch.toLowerCase();
        return (
          s.invoice_number.toLowerCase().includes(q) ||
          s.customer_name.toLowerCase().includes(q) ||
          s.customer_mobile.includes(q) ||
          (s.vehicle_number || '').toLowerCase().includes(q)
        );
      }),
    [data.sales, historySearch]
  );

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="alert"
          className={`rounded-xl p-4 text-xs font-medium border flex flex-wrap items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span>{feedback.message}</span>
          <div className="flex items-center gap-3">
            {feedback.type === 'success' && lastPostedInvoiceNumber && (
              <button
                type="button"
                onClick={() => {
                  const found = data.sales.find(
                    (s) => s.invoice_number === lastPostedInvoiceNumber
                  );
                  if (found) setReceiptSale(found);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-white font-semibold hover:bg-emerald-900"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>View / Download / Share Invoice</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="underline font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!isViewer && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <form
            onSubmit={handlePostSale}
            className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {lang === 'mr'
                    ? 'ग्राहक / कारखाना विक्री नोंद (Customer & Factory Sales Entry)'
                    : 'Customer & Factory Dispatch Sales Entry'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Physical dispatch reduces stock; billable weight calculates sales revenue.
                </p>
              </div>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setEntryWeightUnit('kg')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
                    entryWeightUnit === 'kg' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  kg
                </button>
                <button
                  type="button"
                  onClick={() => setEntryWeightUnit('quintal')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
                    entryWeightUnit === 'quintal'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Quintal (100 kg)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label htmlFor="sal-date" className="block text-xs font-medium text-slate-700 mb-1">
                  Dispatch Date
                </label>
                <input
                  id="sal-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[42px]"
                />
              </div>
              <div>
                <label htmlFor="sal-due" className="block text-xs font-medium text-slate-700 mb-1">
                  Payment Due Date
                </label>
                <input
                  id="sal-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[42px]"
                />
              </div>
              <div>
                <label htmlFor="sal-loc" className="block text-xs font-medium text-slate-700 mb-1">
                  Dispatch Location
                </label>
                <select
                  id="sal-loc"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium min-h-[42px]"
                >
                  {data.locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {lang === 'mr' ? loc.name_mr : loc.name_en}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sal-comm" className="block text-xs font-medium text-slate-700 mb-1">
                  Commodity
                </label>
                <select
                  id="sal-comm"
                  value={commodityId}
                  onChange={(e) => setCommodityId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold min-h-[42px]"
                >
                  {data.commodities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_en} ({c.name_mr})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Available Stock Banner for Selected Location & Commodity */}
            <div
              className={`rounded-xl p-3.5 border text-xs flex flex-wrap items-center justify-between gap-2 ${
                calc.hasSufficientStock
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              <div>
                Available Stock at{' '}
                <strong>{data.locations.find((l) => l.id === locationId)?.name_en}</strong>:{' '}
                <strong className="font-mono">
                  {formatKg(currentStockRow?.qty_kg || 0, displayUnit)}
                </strong>
              </div>
              <div className="font-mono">
                Carrying Avg Cost:{' '}
                <strong>{formatINR(currentStockRow?.avg_cost_per_kg || 0)}/kg</strong> (
                {formatINR((currentStockRow?.avg_cost_per_kg || 0) * 100)}/Qtl)
              </div>
            </div>

            {/* Customer / Factory Selection */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div>
                <label htmlFor="sal-cust-select" className="block text-xs font-medium text-slate-600 mb-1">
                  Select Customer / Factory from Directory (or enter new below):
                </label>
                <select
                  id="sal-cust-select"
                  value={selectedPartyId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setSelectedPartyId(pid);
                    const found = data.parties.find((p) => p.id === pid);
                    if (found) {
                      setCustomerName(found.name);
                      setCustomerMobile(found.mobile);
                      setCustomerCity(found.village_or_city || '');
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium min-h-[40px]"
                >
                  <option value="">-- New Customer / Factory Entry --</option>
                  {customerParties.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name} · {cp.mobile} ({cp.village_or_city || 'City'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="sal-cust-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Customer / Factory Name *
                  </label>
                  <input
                    id="sal-cust-name"
                    type="text"
                    required
                    placeholder="e.g. Kalyani Agro Solvent Ltd"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[42px]"
                  />
                </div>
                <div>
                  <label htmlFor="sal-cust-mobile" className="block text-xs font-medium text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    id="sal-cust-mobile"
                    type="tel"
                    inputMode="numeric"
                    required
                    placeholder="10-digit mobile"
                    value={customerMobile}
                    onChange={(e) => setCustomerMobile(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono min-h-[42px]"
                  />
                </div>
                <div>
                  <label htmlFor="sal-cust-city" className="block text-xs font-medium text-slate-700 mb-1">
                    City / MIDC Location
                  </label>
                  <input
                    id="sal-cust-city"
                    type="text"
                    placeholder="e.g. Latur MIDC"
                    value={customerCity}
                    onChange={(e) => setCustomerCity(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[42px]"
                  />
                </div>
              </div>
            </div>

            {/* Dispatched Weight vs Billable Weight & Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label htmlFor="sal-disp-wt" className="block text-xs font-medium text-slate-700 mb-1">
                  Dispatched Wt ({entryWeightUnit}) *
                </label>
                <input
                  id="sal-disp-wt"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={dispatchedInputVal}
                  onChange={(e) => setDispatchedInputVal(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono font-bold min-h-[44px]"
                />
                <span className="text-[11px] text-slate-500">Reduces physical stock</span>
              </div>

              <div>
                <label htmlFor="sal-bill-wt" className="block text-xs font-medium text-slate-700 mb-1">
                  Billable Wt ({entryWeightUnit}) *
                </label>
                <input
                  id="sal-bill-wt"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={billableInputVal}
                  onChange={(e) => setBillableInputVal(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono font-bold min-h-[44px]"
                />
                <span className="text-[11px] text-slate-500">Calculates sales revenue</span>
              </div>

              <div>
                <label htmlFor="sal-rate" className="block text-xs font-medium text-slate-700 mb-1">
                  Selling Rate *
                </label>
                <input
                  id="sal-rate"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={sellingRateValue}
                  onChange={(e) => setSellingRateValue(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono font-bold min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="sal-rate-unit" className="block text-xs font-medium text-slate-700 mb-1">
                  Rate Unit
                </label>
                <select
                  id="sal-rate-unit"
                  value={sellingRateUnit}
                  onChange={(e) => setSellingRateUnit(e.target.value as RateUnit)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium min-h-[44px]"
                >
                  <option value="per_quintal">Per Quintal (₹/100kg)</option>
                  <option value="per_kg">Per Kg (₹/kg)</option>
                </select>
              </div>
            </div>

            {calc.requiresWeightDiffExplanation && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Weight Difference Detected: Dispatched ({calc.dispatchedKg} kg) vs Billable (
                    {calc.billableKg} kg) = {calc.weightDifferenceKg} kg
                  </span>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Explain difference (e.g. Factory lab moisture deduction of 8 kg on kanta slip) *"
                  value={weightDiffExplanation}
                  onChange={(e) => setWeightDiffExplanation(e.target.value)}
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
            )}

            {/* Immediate Collection & Vehicle Details */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label htmlFor="sal-recd" className="block text-xs font-medium text-slate-700 mb-1">
                  Amount Received Now (₹)
                </label>
                <input
                  id="sal-recd"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={immediateCollectionAmount}
                  onChange={(e) => setImmediateCollectionAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-bold"
                />
                <button
                  type="button"
                  onClick={() => setImmediateCollectionAmount(String(calc.saleAmount))}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline mt-1"
                >
                  Full Cash Sale ({formatINR(calc.saleAmount)})
                </button>
              </div>

              <div>
                <label htmlFor="sal-col-mode" className="block text-xs font-medium text-slate-700 mb-1">
                  Collection Mode
                </label>
                <select
                  id="sal-col-mode"
                  value={collectionMode}
                  onChange={(e) =>
                    setCollectionMode(
                      e.target.value as 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE'
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium"
                >
                  <option value="BANK_TRANSFER">Bank NEFT / RTGS</option>
                  <option value="UPI">UPI (Linked to Bank)</option>
                  <option value="CASH">Cash (रोख)</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>

              <div>
                <label htmlFor="sal-col-acc" className="block text-xs font-medium text-slate-700 mb-1">
                  Deposit Account
                </label>
                <select
                  id="sal-col-acc"
                  value={collectionAccountId}
                  onChange={(e) => setCollectionAccountId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium"
                >
                  {eligibleAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="sal-vehicle" className="block text-xs font-medium text-slate-700 mb-1">
                  Dispatch Truck / Vehicle #
                </label>
                <input
                  id="sal-vehicle"
                  type="text"
                  placeholder="MH-24-AU-9090"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitting || !calc.hasSufficientStock}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 min-h-[44px]"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'Posting Sale...' : 'Post Sales Invoice & Dispatch'}</span>
              </button>
            </div>
          </form>

          {/* Live Sales Revenue, COGS & Gross Profit Sidebar */}
          <div className="rounded-2xl bg-slate-900 text-white p-5 sm:p-6 space-y-4 sticky top-20">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold">Live Revenue, COGS & Gross Profit</h3>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between text-slate-300">
                <span className="font-sans">Dispatched Wt (Stock Out):</span>
                <span className="font-bold text-white">
                  {calc.dispatchedKg} kg ({calc.dispatchedQuintal} Qtl)
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="font-sans">Billable Wt (Revenue Base):</span>
                <span className="font-bold text-emerald-400">
                  {calc.billableKg} kg ({calc.billableQuintal} Qtl)
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="font-sans">Selling Rate:</span>
                <span>
                  {formatINR(calc.sellingRatePerKg)}/kg ({formatINR(calc.sellingRatePerQuintal)}/Qtl)
                </span>
              </div>

              <div className="border-t border-slate-800 pt-2.5 flex justify-between items-baseline">
                <span className="font-sans font-semibold text-white">
                  Sales Revenue (Billable × Rate)
                </span>
                <span className="text-lg font-bold text-emerald-400">
                  {formatINR(calc.saleAmount)}
                </span>
              </div>

              {canViewProfit && (
                <>
                  <div className="flex justify-between text-slate-400">
                    <span className="font-sans">
                      Less: COGS ({calc.dispatchedKg} kg ×{' '}
                      {formatINR(currentStockRow?.avg_cost_per_kg || 0)})
                    </span>
                    <span>− {formatINR(calc.costOfGoodsSold)}</span>
                  </div>

                  <div className="border-t border-slate-800 pt-2.5 flex justify-between items-baseline">
                    <span className="font-sans font-semibold text-slate-200">
                      Estimated Gross Profit
                    </span>
                    <span
                      className={`text-base font-bold ${
                        calc.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {formatINR(calc.grossProfit)}
                    </span>
                  </div>
                </>
              )}

              <div className="border-t border-slate-800 pt-2.5 space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span className="font-sans">Received Immediately:</span>
                  <span>{formatINR(calc.immediateCollectionAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-amber-300">
                  <span className="font-sans">Balance Receivable:</span>
                  <span>{formatINR(calc.balanceReceivable)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sales Register History */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'mr' ? 'विक्री रजिस्टर (Sales & Dispatch History)' : 'Sales & Dispatch Register'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Includes dispatched kg, billable kg, weighted-average COGS, gross profit, and
              printable invoices.
            </p>
          </div>
          <input
            type="search"
            placeholder="Search invoice #, customer, mobile, vehicle..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs w-full sm:w-72"
          />
        </div>

        {/* Mobile Summary Cards (replaces wide table on mobile widths) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredSales.length === 0 ? (
            <div className="py-8 px-4 text-center text-xs text-slate-500">
              No sales invoices found.
            </div>
          ) : (
            filteredSales.map((s) => {
              const loc = data.locations.find((l) => l.id === s.location_id);
              const comm = data.commodities.find((c) => c.id === s.commodity_id);
              return (
                <div
                  key={s.id}
                  className={`p-4 space-y-2.5 ${
                    s.status === 'REVERSED' ? 'opacity-60 bg-slate-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs font-bold text-slate-900">
                        {s.invoice_number} · {s.status}
                      </div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                        {s.customer_name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {s.date} · {s.customer_mobile} · {loc?.code} · {comm?.name_en}
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div className="text-sm font-bold text-slate-900">
                        {formatINR(s.sale_amount)}
                      </div>
                      {canViewProfit && (
                        <div className="text-[11px] font-semibold text-emerald-700">
                          GP: {formatINR(s.gross_profit)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/80 font-mono">
                    <span>Disp: {formatKg(s.dispatched_kg, displayUnit)}</span>
                    <span>Bill: {formatKg(s.billable_kg, displayUnit)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-mono font-semibold text-blue-700">
                      {s.balance_amount > 0
                        ? `Receivable: ${formatINR(s.balance_amount)}`
                        : 'Collected'}
                    </span>
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReceiptSale(s)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Invoice / Share</span>
                      </button>
                      {s.status === 'POSTED' && isOwner && (
                        <button
                          type="button"
                          onClick={() => setReversingId(s.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-red-600"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reverse</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 text-left font-semibold">Invoice # / Date</th>
                <th className="py-2.5 px-4 text-left font-semibold">Customer / Factory</th>
                <th className="py-2.5 px-4 text-left font-semibold">Location & Commodity</th>
                <th className="py-2.5 px-4 text-right font-semibold">Dispatched / Billable</th>
                <th className="py-2.5 px-4 text-right font-semibold">
                  Revenue {canViewProfit ? '/ Gross Profit' : ''}
                </th>
                <th className="py-2.5 px-4 text-right font-semibold">Receivable</th>
                <th className="py-2.5 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No sales invoices found.
                  </td>
                </tr>
              ) : (
                filteredSales.map((s) => {
                  const loc = data.locations.find((l) => l.id === s.location_id);
                  const comm = data.commodities.find((c) => c.id === s.commodity_id);
                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-slate-50 ${
                        s.status === 'REVERSED' ? 'opacity-60 bg-slate-50' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-slate-900">{s.invoice_number}</div>
                        <div className="text-[11px] text-slate-500">
                          {s.date} · {s.status}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{s.customer_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {s.customer_mobile} · {s.customer_city || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{loc?.code}</div>
                        <div className="text-[11px] text-slate-500">{comm?.name_en}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div>Disp: {formatKg(s.dispatched_kg, displayUnit)}</div>
                        <div className="text-[11px] text-slate-500">
                          Bill: {formatKg(s.billable_kg, displayUnit)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="font-bold text-slate-900">{formatINR(s.sale_amount)}</div>
                        {canViewProfit && (
                          <div className="text-[11px] text-emerald-700">
                            GP: {formatINR(s.gross_profit)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="font-semibold text-blue-700">
                          {s.balance_amount > 0 ? formatINR(s.balance_amount) : 'Collected'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setReceiptSale(s)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                            aria-label={`Print invoice ${s.invoice_number}`}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {s.status === 'POSTED' && isOwner && (
                            <button
                              type="button"
                              onClick={() => setReversingId(s.id)}
                              className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                              aria-label={`Reverse invoice ${s.invoice_number}`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reversingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 border border-slate-200 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Controlled Reversal of Posted Sale
            </h3>
            <p className="text-xs text-slate-600">
              Reversing this sale restores the dispatched physical weight back to location inventory
              at its original carrying cost and reverses any immediate collection.
            </p>
            <input
              type="text"
              placeholder="Enter reversal reason *"
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReversingId(null);
                  setReversalReason('');
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleReverseSale(reversingId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptSale && (
        <ReceiptModal
          type="sale"
          sale={receiptSale}
          locations={data.locations}
          commodities={data.commodities}
          lang={lang}
          onClose={() => setReceiptSale(null)}
        />
      )}
    </div>
  );
};
