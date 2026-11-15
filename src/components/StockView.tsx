import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Scale, SlidersHorizontal } from 'lucide-react';
import { formatINR, formatKg } from '../types';
import type { AppBootstrapData, LangMode, WeightUnit } from '../types';

interface StockViewProps {
  data: AppBootstrapData;
  lang: LangMode;
  displayUnit: WeightUnit;
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
}

export const StockView: React.FC<StockViewProps> = ({
  data,
  lang,
  displayUnit,
  apiRequest,
  onRefresh,
}) => {
  const isViewer = data.user.role === 'viewer';

  // Location Transfer State
  const [trfDate, setTrfDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [fromLocationId, setFromLocationId] = useState<string>('loc_shop1');
  const [toLocationId, setToLocationId] = useState<string>('loc_godown');
  const [trfCommodityId, setTrfCommodityId] = useState<string>('comm_soybean');
  const [transferKg, setTransferKg] = useState<string>('250');
  const [trfVehicle, setTrfVehicle] = useState<string>('');
  const [trfNotes, setTrfNotes] = useState<string>('');

  // Opening Stock / Return / Loss / Physical Adjustment State
  const [adjDate, setAdjDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [movementType, setMovementType] = useState<
    'OPENING' | 'RETURN_IN' | 'RETURN_OUT' | 'LOSS' | 'ADJUSTMENT'
  >('OPENING');
  const [adjLocationId, setAdjLocationId] = useState<string>('loc_shop1');
  const [adjCommodityId, setAdjCommodityId] = useState<string>('comm_soybean');
  const [adjQtyKg, setAdjQtyKg] = useState<string>('500');
  const [adjCostPerKg, setAdjCostPerKg] = useState<string>('45');
  const [adjNotes, setAdjNotes] = useState<string>('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const sourceStock = useMemo(
    () =>
      data.stockBalances.find(
        (sb) => sb.location_id === fromLocationId && sb.commodity_id === trfCommodityId
      ),
    [data.stockBalances, fromLocationId, trfCommodityId]
  );

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiRequest('/api/stock/transfer', {
        method: 'POST',
        body: JSON.stringify({
          date: trfDate,
          fromLocationId,
          toLocationId,
          commodityId: trfCommodityId,
          transferKg: Number(transferKg || 0),
          vehicleNumber: trfVehicle,
          notes: trfNotes,
        }),
      });
      setTransferKg('');
      setTrfVehicle('');
      setTrfNotes('');
      await onRefresh();
      setFeedback({
        type: 'success',
        message: `Transferred ${transferKg} kg at carrying cost (${formatINR(
          sourceStock?.avg_cost_per_kg || 0
        )}/kg). Zero sales or artificial profit booked.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiRequest('/api/stock/opening-or-adjust', {
        method: 'POST',
        body: JSON.stringify({
          date: adjDate,
          movementType,
          locationId: adjLocationId,
          commodityId: adjCommodityId,
          qtyKg: Number(adjQtyKg || 0),
          unitCostPerKg: Number(adjCostPerKg || 0),
          notes: adjNotes,
        }),
      });
      setAdjQtyKg('');
      setAdjNotes('');
      await onRefresh();
      setFeedback({
        type: 'success',
        message: `Recorded ${movementType} stock movement successfully.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Consolidated Commodity Totals across all 4 Shops + 1 Godown
  const commodityTotals = useMemo(() => {
    return data.commodities.map((c) => {
      const rows = data.stockBalances.filter((sb) => sb.commodity_id === c.id);
      const totalKg = rows.reduce((s, r) => s + r.qty_kg, 0);
      const totalVal = rows.reduce((s, r) => s + r.total_value, 0);
      const weightedAvg = totalKg > 0 ? totalVal / totalKg : 0;
      return {
        commodity: c,
        totalKg,
        totalVal,
        weightedAvg,
      };
    });
  }, [data.commodities, data.stockBalances]);

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

      {/* Consolidated Stock Summary Cards by Commodity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {commodityTotals.map(({ commodity, totalKg, totalVal, weightedAvg }) => (
          <div
            key={commodity.id}
            className="rounded-2xl bg-white p-5 border border-slate-200 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900">{commodity.name_en}</div>
                <div className="text-xs text-slate-500">{commodity.name_mr}</div>
              </div>
              <Scale className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="mt-3 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {formatKg(totalKg, displayUnit)}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 font-mono">
              <span>Val: {formatINR(totalVal)}</span>
              <span>Avg: {formatINR(weightedAvg)}/kg</span>
            </div>
          </div>
        ))}
      </div>

      {/* Location-by-Location Matrix (4 Shops + 1 Central Godown) */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">
            {lang === 'mr'
              ? '४ दुकाने व १ गोदाम निहाय स्टॉक तक्ता (Location-wise Stock & Moving Weighted-Average Valuation)'
              : 'Stock Matrix Across 4 Shops & 1 Central Godown'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Each shop and godown maintains its own perpetual moving weighted-average cost per kg.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 text-left font-semibold">Location</th>
                {data.commodities.map((c) => (
                  <th key={c.id} className="py-2.5 px-4 text-right font-semibold">
                    {c.name_en} ({c.name_mr})
                  </th>
                ))}
                <th className="py-2.5 px-4 text-right font-semibold">Location Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.locations.map((loc) => {
                const locRows = data.stockBalances.filter((sb) => sb.location_id === loc.id);
                const locTotalValue = locRows.reduce((s, r) => s + r.total_value, 0);
                return (
                  <tr key={loc.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {lang === 'mr' ? loc.name_mr : loc.name_en}
                      </div>
                      <div className="text-[11px] text-slate-500">{loc.address}</div>
                    </td>
                    {data.commodities.map((c) => {
                      const sb = locRows.find((r) => r.commodity_id === c.id);
                      const qty = sb?.qty_kg || 0;
                      const val = sb?.total_value || 0;
                      const avg = sb?.avg_cost_per_kg || 0;
                      return (
                        <td key={c.id} className="py-3 px-4 text-right font-mono tabular-nums">
                          <div className={qty > 0 ? 'font-bold text-slate-900' : 'text-slate-400'}>
                            {formatKg(qty, displayUnit)}
                          </div>
                          {qty > 0 && (
                            <div className="text-[11px] text-slate-500">
                              {formatINR(val)} (@{formatINR(avg)}/kg)
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                      {formatINR(locTotalValue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfer Between Locations & Opening Stock / Loss / Return Adjustments */}
      {!isViewer && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form A: Stock Transfer Between Shops & Godown */}
          <form
            onSubmit={handleTransfer}
            className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
              <ArrowRightLeft className="w-4 h-4 text-emerald-700" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {lang === 'mr'
                    ? 'दुकान ते गोदाम माल ट्रान्सफर (Location Stock Transfer)'
                    : 'Inter-Location Stock Transfer (Preserves Cost)'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Transfers carry over exact weighted-average cost per kg without creating sales or
                  profit.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="trf-from" className="block text-xs font-medium text-slate-700 mb-1">
                  From Source Location
                </label>
                <select
                  id="trf-from"
                  value={fromLocationId}
                  onChange={(e) => setFromLocationId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium min-h-[42px]"
                >
                  {data.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="trf-to" className="block text-xs font-medium text-slate-700 mb-1">
                  To Destination Location
                </label>
                <select
                  id="trf-to"
                  value={toLocationId}
                  onChange={(e) => setToLocationId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium min-h-[42px]"
                >
                  {data.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="trf-comm" className="block text-xs font-medium text-slate-700 mb-1">
                  Commodity
                </label>
                <select
                  id="trf-comm"
                  value={trfCommodityId}
                  onChange={(e) => setTrfCommodityId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold min-h-[42px]"
                >
                  {data.commodities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_en} ({c.name_mr})
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-slate-500 mt-1 font-mono">
                  Available: {sourceStock?.qty_kg || 0} kg @{' '}
                  {formatINR(sourceStock?.avg_cost_per_kg || 0)}/kg
                </div>
              </div>

              <div>
                <label htmlFor="trf-kg" className="block text-xs font-medium text-slate-700 mb-1">
                  Quantity to Transfer (kg) *
                </label>
                <input
                  id="trf-kg"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  required
                  value={transferKg}
                  onChange={(e) => setTransferKg(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono font-bold min-h-[42px]"
                />
              </div>

              <div>
                <label htmlFor="trf-veh" className="block text-xs font-medium text-slate-700 mb-1">
                  Tempo / Vehicle #
                </label>
                <input
                  id="trf-veh"
                  type="text"
                  placeholder="MH-23-G-7711"
                  value={trfVehicle}
                  onChange={(e) => setTrfVehicle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[40px]"
                />
              </div>

              <div>
                <label htmlFor="trf-date" className="block text-xs font-medium text-slate-700 mb-1">
                  Transfer Date
                </label>
                <input
                  id="trf-date"
                  type="date"
                  value={trfDate}
                  onChange={(e) => setTrfDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[40px]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-700 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 min-h-[44px]"
            >
              {lang === 'mr' ? 'स्टॉक ट्रान्सफर पोस्ट करा' : 'Post Location Stock Transfer'}
            </button>
          </form>

          {/* Form B: Opening Stock, Returns, Actual Losses, Adjustments */}
          <form
            onSubmit={handleStockAdjustment}
            className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
              <SlidersHorizontal className="w-4 h-4 text-slate-700" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {lang === 'mr'
                    ? 'ओपनिंग स्टॉक, घट, परतावा किंवा दुरुस्ती (Opening Stock, Returns & Losses)'
                    : 'Opening Stock, Returns, Actual Losses & Adjustments'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Record initial opening inventory, dryage/rodent loss, or physical stock audit
                  adjustments.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="adj-type" className="block text-xs font-medium text-slate-700 mb-1">
                  Movement Type
                </label>
                <select
                  id="adj-type"
                  value={movementType}
                  onChange={(e) =>
                    setMovementType(
                      e.target.value as
                        | 'OPENING'
                        | 'RETURN_IN'
                        | 'RETURN_OUT'
                        | 'LOSS'
                        | 'ADJUSTMENT'
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold min-h-[42px]"
                >
                  <option value="OPENING">Opening Stock (+ Add Inventory)</option>
                  <option value="LOSS">Actual Physical Loss / Dryage (− Reduce)</option>
                  <option value="RETURN_IN">Customer Sales Return In (+ Add)</option>
                  <option value="RETURN_OUT">Purchase Return to Supplier (− Reduce)</option>
                  <option value="ADJUSTMENT">Audit Adjustment (+ / −)</option>
                </select>
              </div>

              <div>
                <label htmlFor="adj-loc" className="block text-xs font-medium text-slate-700 mb-1">
                  Location
                </label>
                <select
                  id="adj-loc"
                  value={adjLocationId}
                  onChange={(e) => setAdjLocationId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium min-h-[42px]"
                >
                  {data.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="adj-comm" className="block text-xs font-medium text-slate-700 mb-1">
                  Commodity
                </label>
                <select
                  id="adj-comm"
                  value={adjCommodityId}
                  onChange={(e) => setAdjCommodityId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold min-h-[42px]"
                >
                  {data.commodities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_en} ({c.name_mr})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="adj-kg" className="block text-xs font-medium text-slate-700 mb-1">
                  Quantity (kg) *
                </label>
                <input
                  id="adj-kg"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  required
                  value={adjQtyKg}
                  onChange={(e) => setAdjQtyKg(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono font-bold min-h-[42px]"
                />
              </div>

              <div>
                <label htmlFor="adj-cost" className="block text-xs font-medium text-slate-700 mb-1">
                  Carrying Cost / kg (₹)
                </label>
                <input
                  id="adj-cost"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={adjCostPerKg}
                  onChange={(e) => setAdjCostPerKg(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[40px]"
                />
              </div>

              <div>
                <label htmlFor="adj-notes" className="block text-xs font-medium text-slate-700 mb-1">
                  Reason / Audit Note
                </label>
                <input
                  id="adj-notes"
                  type="text"
                  placeholder="e.g. Initial godown count"
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs min-h-[40px]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 min-h-[44px]"
            >
              {lang === 'mr' ? 'स्टॉक नोंद सेव्ह करा' : 'Post Stock Movement'}
            </button>
          </form>
        </div>
      )}

      {/* Perpetual Stock Movement Ledger */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">
            {lang === 'mr'
              ? 'स्टॉक हालचाल रजिस्टर (Perpetual Inventory Movement Ledger)'
              : 'Perpetual Stock Movement & Valuation Ledger'}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 text-left font-semibold">Movement # / Date</th>
                <th className="py-2.5 px-4 text-left font-semibold">Type & Ref</th>
                <th className="py-2.5 px-4 text-left font-semibold">Location & Commodity</th>
                <th className="py-2.5 px-4 text-right font-semibold">Qty Change</th>
                <th className="py-2.5 px-4 text-right font-semibold">Value Change</th>
                <th className="py-2.5 px-4 text-right font-semibold">Resulting Stock & Avg Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.stockMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No stock movements recorded yet.
                  </td>
                </tr>
              ) : (
                data.stockMovements.map((m) => {
                  const loc = data.locations.find((l) => l.id === m.location_id);
                  const comm = data.commodities.find((c) => c.id === m.commodity_id);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-slate-900">{m.movement_number}</div>
                        <div className="text-[11px] text-slate-500">{m.date}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {m.movement_type} · {m.reference_doc_number || 'Direct'}
                        </div>
                        <div className="text-[11px] text-slate-500">{m.notes}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{loc?.code}</div>
                        <div className="text-[11px] text-slate-500">{comm?.name_en}</div>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                          m.qty_change_kg >= 0 ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {m.qty_change_kg >= 0 ? `+${m.qty_change_kg}` : m.qty_change_kg} kg
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                        {formatINR(m.value_change)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="font-bold text-slate-900">
                          {formatKg(m.resulting_qty_kg, displayUnit)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatINR(m.resulting_value)} (@{formatINR(m.resulting_avg_cost_per_kg)}
                          /kg)
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
    </div>
  );
};
