import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Scale,
  Wallet,
  Building2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Filter,
} from 'lucide-react';
import { formatINR, formatKg } from '../types';
import type {
  AppBootstrapData,
  ActiveTab,
  LangMode,
  WeightUnit,
} from '../types';
import { calculateProfitSummary } from '../utils/calculations';

interface DashboardViewProps {
  data: AppBootstrapData;
  lang: LangMode;
  displayUnit: WeightUnit;
  onNavigate: (tab: ActiveTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  lang,
  displayUnit,
  onNavigate,
}) => {
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'month'>('all');
  const [locationFilter, setLocationFilter] = useState<string>('ALL');
  const [commodityFilter, setCommodityFilter] = useState<string>('ALL');

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthPrefix = todayStr.slice(0, 7); // YYYY-MM

  const locMap = useMemo(
    () => new Map(data.locations.map((l) => [l.id, l])),
    [data.locations]
  );
  const commMap = useMemo(
    () => new Map(data.commodities.map((c) => [c.id, c])),
    [data.commodities]
  );

  // Filter posted purchases, sales, expenses, and stock balances
  const postedPurchases = useMemo(
    () =>
      data.purchases.filter((p) => {
        if (p.status !== 'POSTED') return false;
        if (locationFilter !== 'ALL' && p.location_id !== locationFilter) return false;
        if (commodityFilter !== 'ALL' && p.commodity_id !== commodityFilter) return false;
        if (dateFilter === 'today' && p.date !== todayStr) return false;
        if (dateFilter === 'month' && !p.date.startsWith(currentMonthPrefix)) return false;
        return true;
      }),
    [data.purchases, locationFilter, commodityFilter, dateFilter, todayStr, currentMonthPrefix]
  );

  const postedSales = useMemo(
    () =>
      data.sales.filter((s) => {
        if (s.status !== 'POSTED') return false;
        if (locationFilter !== 'ALL' && s.location_id !== locationFilter) return false;
        if (commodityFilter !== 'ALL' && s.commodity_id !== commodityFilter) return false;
        if (dateFilter === 'today' && s.date !== todayStr) return false;
        if (dateFilter === 'month' && !s.date.startsWith(currentMonthPrefix)) return false;
        return true;
      }),
    [data.sales, locationFilter, commodityFilter, dateFilter, todayStr, currentMonthPrefix]
  );

  const postedExpenses = useMemo(
    () =>
      data.expenses.filter((e) => {
        if (e.status !== 'POSTED') return false;
        // Shared premises expenses (like rent) apply to business-wide view; if filtering a single shop, include only shop-specific expenses so shared rent is never multiplied across shops
        if (locationFilter !== 'ALL' && e.location_id !== locationFilter) return false;
        if (commodityFilter !== 'ALL' && e.commodity_id && e.commodity_id !== commodityFilter)
          return false;
        if (dateFilter === 'today' && e.date !== todayStr) return false;
        if (dateFilter === 'month' && !e.date.startsWith(currentMonthPrefix)) return false;
        return true;
      }),
    [data.expenses, locationFilter, commodityFilter, dateFilter, todayStr, currentMonthPrefix]
  );

  const filteredStock = useMemo(
    () =>
      data.stockBalances.filter((sb) => {
        if (locationFilter !== 'ALL' && sb.location_id !== locationFilter) return false;
        if (commodityFilter !== 'ALL' && sb.commodity_id !== commodityFilter) return false;
        return true;
      }),
    [data.stockBalances, locationFilter, commodityFilter]
  );

  const metrics = useMemo(() => {
    const todayPurchasesAmt = data.purchases
      .filter((p) => p.status === 'POSTED' && p.date === todayStr)
      .reduce((s, p) => s + p.purchase_amount, 0);
    const todaySalesAmt = data.sales
      .filter((s) => s.status === 'POSTED' && s.date === todayStr)
      .reduce((sum, s) => sum + s.sale_amount, 0);

    const totalPurchasesAmt = postedPurchases.reduce((s, p) => s + p.purchase_amount, 0);
    const totalPurchasesKg = postedPurchases.reduce((s, p) => s + p.physical_stock_received_kg, 0);

    const totalSalesRevenue = postedSales.reduce((s, sale) => s + sale.sale_amount, 0);
    const totalCOGS = postedSales.reduce((s, sale) => s + sale.cogs_amount, 0);
    const totalSalesKg = postedSales.reduce((s, sale) => s + sale.dispatched_kg, 0);

    const profitSummary = calculateProfitSummary({
      totalSalesRevenue,
      totalCOGS,
      expenses: postedExpenses.map((e) => ({
        amount: e.amount,
        classification: e.classification,
      })),
    });

    const totalStockKg = filteredStock.reduce((s, b) => s + b.qty_kg, 0);
    const totalStockCarryingValue = filteredStock.reduce((s, b) => s + b.total_value, 0);

    const farmerPayablesPending = data.purchases
      .filter((p) => p.status === 'POSTED' && p.balance_amount > 0)
      .reduce((s, p) => s + p.balance_amount, 0);

    const customerReceivablesPending = data.sales
      .filter((s) => s.status === 'POSTED' && s.balance_amount > 0)
      .reduce((s, sale) => s + sale.balance_amount, 0);

    const totalCashBalance = data.accounts
      .filter((a) => a.type === 'CASH')
      .reduce((s, a) => s + a.current_balance, 0);

    const totalBankBalance = data.accounts
      .filter((a) => a.type === 'BANK')
      .reduce((s, a) => s + a.current_balance, 0);

    return {
      todayPurchasesAmt,
      todaySalesAmt,
      totalPurchasesAmt,
      totalPurchasesKg,
      totalSalesRevenue,
      totalSalesKg,
      totalCOGS,
      ...profitSummary,
      totalStockKg,
      totalStockCarryingValue,
      farmerPayablesPending,
      customerReceivablesPending,
      totalCashBalance,
      totalBankBalance,
    };
  }, [
    data.purchases,
    data.sales,
    data.accounts,
    postedPurchases,
    postedSales,
    postedExpenses,
    filteredStock,
    todayStr,
  ]);

  const unconfirmedCutting = data.settings.cutting_rule_confirmed !== '1';
  const unconfirmedRent = data.settings.rent_premises_confirmed !== '1';

  return (
    <div className="space-y-6">
      {/* Owner Setup Confirmation Prompt Banner (if in Real environment or unconfirmed) */}
      {(unconfirmedCutting || unconfirmedRent) && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                {lang === 'mr'
                  ? 'मालकाची पुष्टी आवश्यक (Owner Setup Confirmation Pending)'
                  : 'Owner Setup Confirmation Pending Before First Real Posting'}
              </span>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              {unconfirmedCutting &&
                '1) Confirm applicable Business Cutting Rule (Rule 1: 10g/kg = 1% vs Rule 2: 2kg/100kg = 2%) before posting the first real purchase. '}
              {unconfirmedRent &&
                '2) Confirm whether the stated ₹40,000 monthly rent covers all 4 shops + 1 godown combined.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {unconfirmedCutting && (
              <button
                type="button"
                onClick={() => onNavigate('purchases')}
                className="px-3.5 py-2 rounded-lg bg-amber-900 text-white text-xs font-semibold hover:bg-amber-800 transition-colors whitespace-nowrap min-h-[40px]"
              >
                {lang === 'mr' ? 'कपात नियम निश्चित करा' : 'Confirm Cutting Rule'}
              </button>
            )}
            {unconfirmedRent && (
              <button
                type="button"
                onClick={() => onNavigate('expenses')}
                className="px-3.5 py-2 rounded-lg border border-amber-900 text-amber-900 bg-white text-xs font-semibold hover:bg-amber-100 transition-colors whitespace-nowrap min-h-[40px]"
              >
                {lang === 'mr' ? 'भाडे नियम तपासा' : 'Confirm ₹40,000 Rent Template'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick Action Bar & Filters (Dashboard is kept separate from data-entry forms) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mr-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>{lang === 'mr' ? 'फिल्टर:' : 'Filters:'}</span>
          </div>

          {/* Date Period Segmented Control */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'month', 'today'] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setDateFilter(period)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  dateFilter === period
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {period === 'all'
                  ? lang === 'mr'
                    ? 'सर्व कालावधी'
                    : 'All Time'
                  : period === 'month'
                  ? lang === 'mr'
                    ? 'चालू महिना'
                    : 'This Month'
                  : lang === 'mr'
                  ? 'आज (Today)'
                  : 'Today'}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by Location"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[38px]"
          >
            <option value="ALL">
              {lang === 'mr'
                ? 'सर्व ४ दुकाने + १ गोदाम (All Locations)'
                : 'All Locations (4 Shops + 1 Godown)'}
            </option>
            {data.locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {lang === 'mr' ? loc.name_mr : loc.name_en}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Commodity"
            value={commodityFilter}
            onChange={(e) => setCommodityFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[38px]"
          >
            <option value="ALL">
              {lang === 'mr' ? 'सर्व शेतमाल (All Commodities)' : 'All Commodities'}
            </option>
            {data.commodities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_en} ({c.name_mr})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('purchases')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900 transition-colors whitespace-nowrap min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'mr' ? 'नवीन खरेदी (New Purchase)' : 'New Purchase'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('sales')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'mr' ? 'नवीन विक्री (New Sale)' : 'New Sale'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('payments')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap min-h-[40px]"
          >
            <span>{lang === 'mr' ? 'पेमेंट / वसुली' : 'Record Payment'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('expenses')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap min-h-[40px]"
          >
            <span>{lang === 'mr' ? '+ खर्च नोंद' : 'Add Expense'}</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (2 cards per row on phones/tablets, 4 on desktop; profit gated by role) */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Purchases */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{lang === 'mr' ? 'एकूण खरेदी (Purchases)' : 'Purchases (Document Total)'}</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-700 shrink-0" />
          </div>
          <div className="mt-2 font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums whitespace-nowrap">
            {formatINR(metrics.totalPurchasesAmt)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs text-slate-500 font-mono">
            <span className="whitespace-nowrap">{formatKg(metrics.totalPurchasesKg, displayUnit)}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">Today: {formatINR(metrics.todayPurchasesAmt)}</span>
          </div>
        </div>

        {/* 2. Sales Revenue */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{lang === 'mr' ? 'एकूण विक्री (Sales)' : 'Sales (Document Total)'}</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-700 shrink-0" />
          </div>
          <div className="mt-2 font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums whitespace-nowrap">
            {formatINR(metrics.totalSalesRevenue)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs text-slate-500 font-mono">
            <span className="whitespace-nowrap">{formatKg(metrics.totalSalesKg, displayUnit)}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">Today: {formatINR(metrics.todaySalesAmt)}</span>
          </div>
        </div>

        {/* 3. Gross Profit & Estimated Net Trading Profit (Role-Gated: Owner & Viewer/Auditor only) */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {lang === 'mr'
                ? 'अंदाजित निव्वळ नफा (Net Trading Profit)'
                : 'Estimated Net Trading Profit'}
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-700 shrink-0" />
          </div>
          {data.user.role === 'owner' || data.user.role === 'viewer' ? (
            <>
              <div
                className={`mt-2 font-mono text-xl sm:text-2xl font-bold tabular-nums whitespace-nowrap ${
                  metrics.estimatedNetTradingProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {formatINR(metrics.estimatedNetTradingProfit)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs text-slate-500 font-mono">
                <span className="whitespace-nowrap">Gross: {formatINR(metrics.grossProfit)}</span>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">COGS: {formatINR(metrics.totalCOGS)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 font-mono text-base font-bold text-slate-500">
                Restricted (Owner Role)
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Profit figures are visible only to Owner / Auditor roles
              </div>
            </>
          )}
        </div>

        {/* 4. Stock Quantity & Carrying Value */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {lang === 'mr'
                ? 'शिल्लक माल व किंमत (Stock Carrying Value)'
                : 'Physical Stock & Carrying Value'}
            </span>
            <Scale className="w-4 h-4 text-slate-700 shrink-0" />
          </div>
          <div className="mt-2 font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums whitespace-nowrap">
            {displayUnit === 'quintal'
              ? `${(metrics.totalStockKg / 100).toFixed(2)} Qtl`
              : `${metrics.totalStockKg.toLocaleString('en-IN')} kg`}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs text-slate-500 font-mono">
            <span className="whitespace-nowrap">
              {metrics.totalStockKg.toLocaleString('en-IN')} kg
            </span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">
              Cost: {formatINR(metrics.totalStockCarryingValue)}
            </span>
          </div>
        </div>

        {/* 5. Farmer Payments Pending */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {lang === 'mr'
                ? 'शेतकरी देणे बाकी (Farmer Dues)'
                : 'Farmer Payments Pending'}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              {lang === 'mr' ? 'पैसे द्या' : 'Pay'}
            </button>
          </div>
          <div className="mt-2 font-mono text-xl sm:text-2xl font-bold text-amber-700 tabular-nums">
            {formatINR(metrics.farmerPayablesPending)}
          </div>
          <div className="mt-2 text-[11px] sm:text-xs text-slate-500">
            {data.purchases.filter((p) => p.status === 'POSTED' && p.balance_amount > 0).length}{' '}
            open farmer bills
          </div>
        </div>

        {/* 6. Customer Collections Pending */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {lang === 'mr'
                ? 'ग्राहक येणे बाकी (Customer Dues)'
                : 'Customer Collections Pending'}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              {lang === 'mr' ? 'वसुली करा' : 'Collect'}
            </button>
          </div>
          <div className="mt-2 font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
            {formatINR(metrics.customerReceivablesPending)}
          </div>
          <div className="mt-2 text-[11px] sm:text-xs text-slate-500">
            {data.sales.filter((s) => s.status === 'POSTED' && s.balance_amount > 0).length} open
            customer invoices
          </div>
        </div>

        {/* 7. Operating & Capitalized Expenses */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{lang === 'mr' ? 'दुकान व गोदाम खर्च (Expenses)' : 'Operating Expenses'}</span>
            <Building2 className="w-4 h-4 text-slate-600" />
          </div>
          <div className="mt-2 font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
            {formatINR(metrics.operatingExpenses)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 font-mono">
            <span>Landed (In Stock): {formatINR(metrics.capitalizedLandedCosts)}</span>
          </div>
        </div>

        {/* 8. Cashbox & Bank/UPI Balances */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {lang === 'mr' ? 'रोख गल्ला व बँक शिल्लक (Cash & Bank)' : 'Cashboxes & Bank Accounts'}
            </span>
            <Wallet className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
            {formatINR(metrics.totalCashBalance + metrics.totalBankBalance)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 font-mono">
            <span>Cash: {formatINR(metrics.totalCashBalance)}</span>
            <span aria-hidden="true">·</span>
            <span>Bank/UPI: {formatINR(metrics.totalBankBalance)}</span>
          </div>
        </div>
      </div>

      {/* Location-by-Location Stock Matrix (4 Shops + 1 Godown) & Cash/Bank Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {lang === 'mr'
                  ? 'दुकान व गोदाम निहाय शिल्लक स्टॉक (Stock by 4 Shops & 1 Godown)'
                  : 'Stock & Valuation by Location (4 Shops & 1 Central Godown)'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Valued strictly at perpetual moving weighted-average carrying cost
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap shrink-0"
            >
              {lang === 'mr' ? 'स्टॉक पहा →' : 'Manage Stock →'}
            </button>
          </div>

          {/* Mobile Summary Cards (avoids horizontal table scrolling on 360px/390px/430px phones) */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredStock.filter((s) => s.qty_kg > 0).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No positive stock balances for the current filter.
              </div>
            ) : (
              filteredStock
                .filter((s) => s.qty_kg > 0)
                .map((sb) => {
                  const loc = locMap.get(sb.location_id);
                  const comm = commMap.get(sb.commodity_id);
                  return (
                    <div
                      key={`mob_${sb.location_id}_${sb.commodity_id}`}
                      className="p-4 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {comm?.name_en} ({comm?.name_mr})
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          {lang === 'mr' ? loc?.name_mr : loc?.name_en}
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs tabular-nums">
                        <div className="font-bold text-slate-900">
                          {formatKg(sb.qty_kg, displayUnit)}
                        </div>
                        <div className="text-[11px] text-emerald-700 font-semibold">
                          {formatINR(sb.total_value)} ({formatINR(sb.avg_cost_per_kg)}/kg)
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 text-left font-semibold">Location (Shop / Godown)</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Commodity</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Stock Qty</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Avg Cost / kg</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Carrying Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStock.filter((s) => s.qty_kg > 0).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-slate-500">
                      {lang === 'mr'
                        ? 'सध्या निवडलेल्या फिल्टरमध्ये कोणताही स्टॉक शिल्लक नाही.'
                        : 'No positive stock balances for the current filter. Post a purchase or opening stock to populate inventory.'}
                    </td>
                  </tr>
                ) : (
                  filteredStock
                    .filter((s) => s.qty_kg > 0)
                    .map((sb) => {
                      const loc = locMap.get(sb.location_id);
                      const comm = commMap.get(sb.commodity_id);
                      return (
                        <tr key={`${sb.location_id}_${sb.commodity_id}`} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {lang === 'mr' ? loc?.name_mr : loc?.name_en}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {comm?.name_en} · {comm?.name_mr}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            {formatKg(sb.qty_kg, displayUnit)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                            {formatINR(sb.avg_cost_per_kg)}/kg
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                            {formatINR(sb.total_value)}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Separate Cashboxes & UPI-Linked Bank Accounts */}
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'mr' ? 'रोख गल्ला व बँक खाती' : 'Cashboxes & Bank / UPI Accounts'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cashboxes and Bank/UPI accounts are tracked separately
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {data.accounts.map((acc) => (
                <div key={acc.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">{acc.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {acc.type === 'CASH'
                        ? 'Physical Cashbox (रोख गल्ला)'
                        : `${acc.bank_name || 'Bank'} · ${
                            acc.supports_upi ? `UPI: ${acc.upi_id}` : 'NEFT/RTGS'
                          }`}
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {formatINR(acc.current_balance)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">Total Liquid Funds</span>
            <span className="font-mono font-bold text-slate-900">
              {formatINR(metrics.totalCashBalance + metrics.totalBankBalance)}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Transactions & Overdue / Pending Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'mr' ? 'अलीकडील खरेदी व विक्री व्यवहार' : 'Recent Purchases & Sales'}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              {lang === 'mr' ? 'सर्व रिपोर्ट्स →' : 'Full Registers →'}
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {postedPurchases.length === 0 && postedSales.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No posted transactions in this view yet.
              </div>
            ) : (
              [
                ...postedPurchases.slice(0, 4).map((p) => ({
                  id: p.id,
                  kind: 'PURCHASE' as const,
                  number: p.purchase_number,
                  date: p.date,
                  party: p.farmer_name,
                  commodity: commMap.get(p.commodity_id)?.name_en || '',
                  kg: p.physical_stock_received_kg,
                  amount: p.purchase_amount,
                  balance: p.balance_amount,
                })),
                ...postedSales.slice(0, 4).map((s) => ({
                  id: s.id,
                  kind: 'SALE' as const,
                  number: s.invoice_number,
                  date: s.date,
                  party: s.customer_name,
                  commodity: commMap.get(s.commodity_id)?.name_en || '',
                  kg: s.dispatched_kg,
                  amount: s.sale_amount,
                  balance: s.balance_amount,
                })),
              ]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 6)
                .map((item) => (
                  <div
                    key={`${item.kind}_${item.id}`}
                    className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-slate-900">{item.number}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-800">{item.party}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.kind} · {item.date} · {item.commodity} ·{' '}
                        <span className="font-mono">{formatKg(item.kg, displayUnit)}</span>
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-xs font-bold text-slate-900">{formatINR(item.amount)}</div>
                      <div className="text-[11px] text-slate-500">
                        {item.balance > 0 ? `Due: ${formatINR(item.balance)}` : 'Settled'}
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Pending Farmer Payables & Customer Receivables */}
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'mr'
                ? 'प्रलंबित देणी व वसुली (Pending & Overdue Balances)'
                : 'Pending Farmer Payables & Customer Collections'}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('parties')}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              {lang === 'mr' ? 'खातेवही पहा →' : 'Party Ledgers →'}
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {data.purchases.filter((p) => p.status === 'POSTED' && p.balance_amount > 0).length === 0 &&
            data.sales.filter((s) => s.status === 'POSTED' && s.balance_amount > 0).length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                All farmer and customer balances are settled.
              </div>
            ) : (
              <>
                {data.purchases
                  .filter((p) => p.status === 'POSTED' && p.balance_amount > 0)
                  .slice(0, 4)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-900">
                          {p.farmer_name} ({p.farmer_village || p.farmer_mobile})
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Farmer Payable · {p.purchase_number} · {p.date}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-xs font-bold text-amber-700">
                          {formatINR(p.balance_amount)}
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigate('payments')}
                          className="text-[11px] font-sans font-semibold text-emerald-700 hover:underline"
                        >
                          Pay Farmer →
                        </button>
                      </div>
                    </div>
                  ))}
                {data.sales
                  .filter((s) => s.status === 'POSTED' && s.balance_amount > 0)
                  .slice(0, 4)
                  .map((s) => (
                    <div
                      key={s.id}
                      className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-900">
                          {s.customer_name} ({s.customer_city || s.customer_mobile})
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Customer Receivable · {s.invoice_number} · Due: {s.due_date || s.date}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-xs font-bold text-blue-700">
                          {formatINR(s.balance_amount)}
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigate('payments')}
                          className="text-[11px] font-sans font-semibold text-emerald-700 hover:underline"
                        >
                          Collect →
                        </button>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
