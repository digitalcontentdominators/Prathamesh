import React, { useState } from 'react';
import { Printer, Download, Share2, X, Check } from 'lucide-react';
import { formatINR, formatKg } from '../types';
import type {
  PurchaseRecord,
  SaleRecord,
  LocationItem,
  CommodityItem,
  LangMode,
} from '../types';

interface ReceiptModalProps {
  type: 'purchase' | 'sale';
  purchase?: PurchaseRecord;
  sale?: SaleRecord;
  locations: LocationItem[];
  commodities: CommodityItem[];
  lang: LangMode;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  type,
  purchase,
  sale,
  locations,
  commodities,
  lang,
  onClose,
}) => {
  const [sharedStatus, setSharedStatus] = useState<string | null>(null);
  const locMap = new Map(locations.map((l) => [l.id, l]));
  const commMap = new Map(commodities.map((c) => [c.id, c]));

  const docNum = type === 'purchase' ? purchase?.purchase_number : sale?.invoice_number;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = () => {
    const el = document.getElementById('printable-receipt-area');
    if (!el) return;
    const htmlContent = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sai Samarth Trading Company - ${docNum}</title>
  <style>
    body { font-family: sans-serif; padding: 24px; color: #0f172a; max-width: 720px; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 13px; }
    .right { text-align: right; font-family: monospace; }
  </style>
</head>
<body>${el.innerHTML}</body>
</html>`;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docNum || 'Receipt'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShareReceipt = async () => {
    const shareText =
      type === 'purchase' && purchase
        ? `Sai Samarth Trading Co. — Purchase Slip ${purchase.purchase_number}\nFarmer: ${
            purchase.farmer_name
          }\nCommodity: ${commMap.get(purchase.commodity_id)?.name_en || ''}\nMaterial Input: ${
            purchase.material_input_kg
          } kg\nPayable Weight: ${purchase.payable_weight_kg} kg\nPhysical Stock Received: ${
            purchase.physical_stock_received_kg
          } kg\nTotal Payable: ${formatINR(purchase.purchase_amount)}\nPaid: ${formatINR(
            purchase.paid_amount
          )} | Balance Due: ${formatINR(purchase.balance_amount)}`
        : sale
        ? `Sai Samarth Trading Co. — Commercial Dispatch Slip ${sale.invoice_number}\nCustomer: ${
            sale.customer_name
          }\nCommodity: ${commMap.get(sale.commodity_id)?.name_en || ''}\nDispatched Wt: ${
            sale.dispatched_kg
          } kg | Billable Wt: ${sale.billable_kg} kg\nTotal Amount: ${formatINR(
            sale.sale_amount
          )}\nReceived: ${formatINR(sale.received_amount)} | Balance Due: ${formatINR(
            sale.balance_amount
          )}`
        : '';

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Sai Samarth Trading Co. - ${docNum}`,
          text: shareText,
        });
        setSharedStatus('Shared via device share sheet');
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setSharedStatus('Receipt summary copied to clipboard for sharing');
      }
    } catch {
      // user cancelled share sheet
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Printable Receipt"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3.5 bg-emerald-950 text-white">
          <div>
            <h3 className="text-sm sm:text-base font-bold">
              {type === 'purchase'
                ? lang === 'mr'
                  ? 'खरेदी पट्टी / काटा पावती (Purchase Settlement Slip)'
                  : 'Farmer Purchase Patti / Settlement Slip'
                : lang === 'mr'
                ? 'व्यापारी विक्री पावती / गेटपास (Commercial Dispatch Slip)'
                : 'Commercial Sales & Dispatch Receipt'}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 min-h-[40px]"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{lang === 'mr' ? 'प्रिंट / PDF' : 'Print / PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-800 min-h-[40px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'mr' ? 'डाउनलोड' : 'Download'}</span>
            </button>
            <button
              type="button"
              onClick={handleShareReceipt}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-amber-300 min-h-[40px]"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{lang === 'mr' ? 'शेअर करा' : 'Share'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-emerald-200 hover:text-white min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Close receipt modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {sharedStatus && (
          <div className="no-print bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs font-semibold text-emerald-900 flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-700" />
            <span>{sharedStatus}</span>
          </div>
        )}

        <div id="printable-receipt-area" className="p-4 sm:p-6 space-y-5 text-slate-900 text-sm">
          <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                SAI SAMARTH TRADING COMPANY
              </h2>
              <p className="text-xs font-medium text-slate-600">
                साई समर्थ ट्रेडिंग कंपनी — Agricultural Commodity Merchants
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Commercial Trading Receipt (Neutral Commercial Document — Taxes Not Configured)
              </p>
            </div>
            <div className="sm:text-right font-mono text-xs">
              <div className="font-bold text-sm text-slate-900">{docNum}</div>
              <div className="text-slate-600">
                Date: {type === 'purchase' ? purchase?.date : sale?.date}
              </div>
              <div className="text-slate-600">
                Status: {type === 'purchase' ? purchase?.status : sale?.status}
              </div>
            </div>
          </div>

          {type === 'purchase' && purchase && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <div className="text-slate-500">Farmer / Supplier (शेतकरी नाव):</div>
                  <div className="font-bold text-sm text-slate-900 mt-0.5">
                    {purchase.farmer_name}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Mobile: <span className="font-mono">{purchase.farmer_mobile}</span> · Village:{' '}
                    {purchase.farmer_village || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Receiving Location & Commodity:</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {locMap.get(purchase.location_id)?.name_en} (
                    {locMap.get(purchase.location_id)?.name_mr})
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Commodity: <strong>{commMap.get(purchase.commodity_id)?.name_en}</strong> (
                    {commMap.get(purchase.commodity_id)?.name_mr}) · Vehicle:{' '}
                    <span className="font-mono">{purchase.vehicle_number || 'Direct'}</span>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-semibold">
                        Weight & Deduction Particulars
                      </th>
                      <th className="py-2.5 px-3 text-right font-semibold">Settlement Impact</th>
                      <th className="py-2.5 px-3 text-right font-semibold">
                        Physical Stock Impact
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {purchase.weighing_mode === 'weighbridge' ? (
                      <tr>
                        <td className="py-2 px-3 font-sans">
                          Weighbridge Gross ({purchase.gross_weight_kg} kg) − Empty Tare (
                          {purchase.tare_weight_kg} kg)
                        </td>
                        <td className="py-2 px-3 text-right">
                          {formatKg(purchase.material_input_kg)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {formatKg(purchase.material_input_kg)}
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td className="py-2 px-3 font-sans">Direct Material Input Weight</td>
                        <td className="py-2 px-3 text-right">
                          {formatKg(purchase.material_input_kg)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {formatKg(purchase.material_input_kg)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-2 px-3 font-sans text-slate-600">
                        Less: Commercial & Quality Deductions ({purchase.cutting_rule_applied})
                      </td>
                      <td className="py-2 px-3 text-right text-amber-700">
                        − {formatKg(purchase.payable_deductions_kg)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600">
                        − {formatKg(purchase.physical_deductions_kg)}
                      </td>
                    </tr>
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <td className="py-2.5 px-3 font-sans">Net Resulting Weight (kg & Quintal)</td>
                      <td className="py-2.5 px-3 text-right">
                        {formatKg(purchase.payable_weight_kg, 'quintal')}
                        <div className="text-[11px] font-normal text-slate-500 font-sans">
                          Payable Settlement Weight
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatKg(purchase.physical_stock_received_kg, 'quintal')}
                        <div className="text-[11px] font-normal text-slate-500 font-sans">
                          Actual Physical Stock Received
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-emerald-950 text-white p-4 rounded-xl font-mono text-xs">
                <div>
                  <div className="text-emerald-200 font-sans">Purchase Rate</div>
                  <div className="text-sm font-bold mt-0.5">
                    {formatINR(purchase.rate_per_kg * 100)}/Qtl
                  </div>
                  <div className="text-[11px] text-emerald-300">
                    {formatINR(purchase.rate_per_kg)}/kg
                  </div>
                </div>
                <div>
                  <div className="text-emerald-200 font-sans">Total Payable Amount</div>
                  <div className="text-sm font-bold text-amber-300 mt-0.5">
                    {formatINR(purchase.purchase_amount)}
                  </div>
                </div>
                <div>
                  <div className="text-emerald-200 font-sans">
                    Paid ({purchase.payment_mode || 'CASH'})
                  </div>
                  <div className="text-sm font-bold mt-0.5">{formatINR(purchase.paid_amount)}</div>
                </div>
                <div>
                  <div className="text-emerald-200 font-sans">Farmer Balance Due</div>
                  <div className="text-sm font-bold text-amber-300 mt-0.5">
                    {formatINR(purchase.balance_amount)}
                  </div>
                </div>
              </div>
            </>
          )}

          {type === 'sale' && sale && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <div className="text-slate-500">Customer / Factory Buyer (ग्राहक / कारखाना):</div>
                  <div className="font-bold text-sm text-slate-900 mt-0.5">
                    {sale.customer_name}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Mobile: <span className="font-mono">{sale.customer_mobile}</span> · City:{' '}
                    {sale.customer_city || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Dispatch Location & Commodity:</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {locMap.get(sale.location_id)?.name_en}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Commodity: <strong>{commMap.get(sale.commodity_id)?.name_en}</strong> · Vehicle:{' '}
                    <span className="font-mono">{sale.vehicle_number || '—'}</span> · Due:{' '}
                    {sale.due_date || 'Immediate'}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-semibold">
                        Dispatch & Billing Particulars
                      </th>
                      <th className="py-2.5 px-3 text-right font-semibold">Weight (kg / Qtl)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    <tr>
                      <td className="py-2 px-3 font-sans">
                        Physical Weight Dispatched from Stock (Reduces Inventory)
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatKg(sale.dispatched_kg, 'quintal')}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                        Billable Weight Charged to Customer (Calculates Revenue)
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        {formatKg(sale.billable_kg, 'quintal')}
                      </td>
                    </tr>
                    {Math.abs(sale.weight_diff_kg) > 0.001 && (
                      <tr>
                        <td className="py-2 px-3 font-sans text-amber-800">
                          Weight Difference Explanation: {sale.weight_diff_explanation}
                        </td>
                        <td className="py-2 px-3 text-right text-amber-800">
                          {sale.weight_diff_kg > 0
                            ? `+${sale.weight_diff_kg}`
                            : sale.weight_diff_kg}{' '}
                          kg
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-emerald-950 text-white p-4 rounded-xl font-mono text-xs">
                <div>
                  <div className="text-emerald-200 font-sans">Selling Rate</div>
                  <div className="text-sm font-bold mt-0.5">
                    {formatINR(sale.selling_rate_per_kg * 100)}/Qtl
                  </div>
                  <div className="text-[11px] text-emerald-300">
                    {formatINR(sale.selling_rate_per_kg)}/kg
                  </div>
                </div>
                <div>
                  <div className="text-emerald-200 font-sans">Receipt Total</div>
                  <div className="text-sm font-bold text-amber-300 mt-0.5">
                    {formatINR(sale.sale_amount)}
                  </div>
                </div>
                <div>
                  <div className="text-emerald-200 font-sans">Amount Received</div>
                  <div className="text-sm font-bold mt-0.5">{formatINR(sale.received_amount)}</div>
                </div>
                <div>
                  <div className="text-emerald-200 font-sans">Balance Receivable</div>
                  <div className="text-sm font-bold text-amber-300 mt-0.5">
                    {formatINR(sale.balance_amount)}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="pt-6 flex items-center justify-between text-xs text-slate-500 border-t border-slate-200">
            <div>Farmer / Customer Signature</div>
            <div>For Sai Samarth Trading Company (Authorized Signatory)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
