import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Users, Plus, Printer, Download } from 'lucide-react';
import { exportToCsv, formatINR } from '../types';
import type { AppBootstrapData, LangMode } from '../types';

interface PaymentsAndPartiesViewProps {
  mode: 'payments' | 'parties';
  data: AppBootstrapData;
  lang: LangMode;
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
}

export const PaymentsAndPartiesView: React.FC<PaymentsAndPartiesViewProps> = ({
  mode,
  data,
  lang,
  apiRequest,
  onRefresh,
}) => {
  const isViewer = data.user.role === 'viewer';

  // Payment Form State
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<
    | 'FARMER_PAYMENT'
    | 'CUSTOMER_COLLECTION'
    | 'EXPENSE_PAYMENT'
    | 'ADVANCE_PAID'
    | 'ADVANCE_RECEIVED'
    | 'REFUND'
  >('FARMER_PAYMENT');
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [partyName, setPartyName] = useState<string>('');
  const [partyMobile, setPartyMobile] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [payMode, setPayMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE'>('UPI');
  const [accountId, setAccountId] = useState<string>('acc_bank_sbi');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  // Party Directory Form State
  const [newPartyType, setNewPartyType] = useState<'farmer' | 'customer' | 'supplier' | 'both'>(
    'farmer'
  );
  const [newPartyName, setNewPartyName] = useState<string>('');
  const [newPartyMobile, setNewPartyMobile] = useState<string>('');
  const [newPartyVillage, setNewPartyVillage] = useState<string>('');
  const [newPartyGst, setNewPartyGst] = useState<string>('');
  const [newPartyOpeningBal, setNewPartyOpeningBal] = useState<string>('0');

  // Search & Selected Party Statement
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeLedgerPartyId, setActiveLedgerPartyId] = useState<string>(
    data.parties[0]?.id || ''
  );
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const direction: 'OUTFLOW' | 'INFLOW' =
    category === 'CUSTOMER_COLLECTION' || category === 'ADVANCE_RECEIVED'
      ? 'INFLOW'
      : 'OUTFLOW';

  // UPI strictly requires a BANK account (never a cashbox)
  const eligibleAccounts = useMemo(() => {
    if (payMode === 'CASH') {
      return data.accounts.filter((a) => a.type === 'CASH');
    }
    return data.accounts.filter((a) => a.type === 'BANK');
  }, [data.accounts, payMode]);

  useEffect(() => {
    if (eligibleAccounts.length > 0 && !eligibleAccounts.some((a) => a.id === accountId)) {
      setAccountId(eligibleAccounts[0].id);
    }
  }, [eligibleAccounts, accountId]);

  // Open documents for multi-document allocation
  const openDocuments = useMemo(() => {
    if (category === 'FARMER_PAYMENT') {
      return data.purchases
        .filter(
          (p) =>
            p.status === 'POSTED' &&
            p.balance_amount > 0 &&
            (!selectedPartyId || p.party_id === selectedPartyId)
        )
        .map((p) => ({
          docType: 'purchase' as const,
          docId: p.id,
          docNumber: p.purchase_number,
          date: p.date,
          partyName: p.farmer_name,
          total: p.purchase_amount,
          balance: p.balance_amount,
        }));
    }
    if (category === 'CUSTOMER_COLLECTION') {
      return data.sales
        .filter(
          (s) =>
            s.status === 'POSTED' &&
            s.balance_amount > 0 &&
            (!selectedPartyId || s.party_id === selectedPartyId)
        )
        .map((s) => ({
          docType: 'sale' as const,
          docId: s.id,
          docNumber: s.invoice_number,
          date: s.date,
          partyName: s.customer_name,
          total: s.sale_amount,
          balance: s.balance_amount,
        }));
    }
    if (category === 'EXPENSE_PAYMENT') {
      return data.expenses
        .filter((e) => e.status === 'POSTED' && e.balance_amount > 0)
        .map((e) => ({
          docType: 'expense' as const,
          docId: e.id,
          docNumber: e.expense_number,
          date: e.date,
          partyName: e.payee_name,
          total: e.amount,
          balance: e.balance_amount,
        }));
    }
    return [];
  }, [category, selectedPartyId, data.purchases, data.sales, data.expenses]);

  const handleAutoAllocate = (totalInputAmt: number) => {
    let remaining = totalInputAmt;
    const nextAlloc: Record<string, string> = {};
    for (const doc of openDocuments) {
      if (remaining <= 0) break;
      const alloc = Math.min(remaining, doc.balance);
      nextAlloc[doc.docId] = String(Math.round(alloc * 100) / 100);
      remaining -= alloc;
    }
    setAllocations(nextAlloc);
  };

  const handlePostPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const numAmt = Number(amount || 0);
    if (numAmt <= 0 || !partyName.trim()) {
      setFeedback({
        type: 'error',
        message: 'Party name and positive payment amount are required.',
      });
      return;
    }

    const allocList = openDocuments
      .map((doc) => ({
        docType: doc.docType,
        docId: doc.docId,
        docNumber: doc.docNumber,
        amount: Number(allocations[doc.docId] || 0),
      }))
      .filter((a) => a.amount > 0);

    try {
      const res = await apiRequest<{ ok: boolean; paymentNumber: string }>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: `pay_${payDate}_${partyName.trim()}_${numAmt}_${Date.now()}`,
          date: payDate,
          direction,
          category,
          partyId: selectedPartyId || undefined,
          partyName: partyName.trim(),
          partyMobile: partyMobile.trim(),
          amount: numAmt,
          mode: payMode,
          accountId,
          referenceNumber,
          allocations: allocList,
          notes,
        }),
      });

      setAmount('');
      setReferenceNumber('');
      setNotes('');
      setAllocations({});
      await onRefresh();
      setFeedback({
        type: 'success',
        message: `Posted ${res.paymentNumber} (${formatINR(
          numAmt
        )}). Linked documents updated without duplicating purchases or sales.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!newPartyName.trim() || !newPartyMobile.trim()) {
      setFeedback({ type: 'error', message: 'Name and mobile number are required.' });
      return;
    }
    try {
      const res = await apiRequest<{ ok: boolean; id: string }>('/api/parties', {
        method: 'POST',
        body: JSON.stringify({
          type: newPartyType,
          name: newPartyName,
          mobile: newPartyMobile,
          villageOrCity: newPartyVillage,
          gstOrPan: newPartyGst,
          openingBalance: Number(newPartyOpeningBal || 0),
        }),
      });
      setNewPartyName('');
      setNewPartyMobile('');
      setNewPartyVillage('');
      setNewPartyGst('');
      setNewPartyOpeningBal('0');
      await onRefresh();
      setActiveLedgerPartyId(res.id);
      setFeedback({
        type: 'success',
        message: 'Saved party to directory.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Compute Party Summary & Full Running Ledger Statement
  const partySummaries = useMemo(() => {
    return data.parties.map((party) => {
      const partyPurchases = data.purchases.filter(
        (p) =>
          p.status === 'POSTED' &&
          (p.party_id === party.id || p.farmer_mobile === party.mobile)
      );
      const partySales = data.sales.filter(
        (s) =>
          s.status === 'POSTED' &&
          (s.party_id === party.id || s.customer_mobile === party.mobile)
      );
      const partyPayments = data.payments.filter(
        (pay) =>
          pay.status === 'POSTED' &&
          (pay.party_id === party.id ||
            pay.party_mobile === party.mobile ||
            pay.party_name.toLowerCase() === party.name.toLowerCase())
      );

      const totalPurchased = partyPurchases.reduce((s, p) => s + p.purchase_amount, 0);
      const totalSold = partySales.reduce((s, sale) => s + sale.sale_amount, 0);
      const totalOutflowPaid = partyPayments
        .filter((p) => p.direction === 'OUTFLOW')
        .reduce((s, p) => s + p.amount, 0);
      const totalInflowRecd = partyPayments
        .filter((p) => p.direction === 'INFLOW')
        .reduce((s, p) => s + p.amount, 0);

      const payableToFarmer = Math.max(
        0,
        (party.type === 'farmer' || party.type === 'supplier' ? party.opening_balance : 0) +
          totalPurchased -
          totalOutflowPaid
      );
      const receivableFromCustomer = Math.max(
        0,
        (party.type === 'customer' ? party.opening_balance : 0) + totalSold - totalInflowRecd
      );

      return {
        party,
        totalPurchased,
        totalSold,
        totalOutflowPaid,
        totalInflowRecd,
        payableToFarmer,
        receivableFromCustomer,
        purchases: partyPurchases,
        sales: partySales,
        payments: partyPayments,
      };
    });
  }, [data.parties, data.purchases, data.sales, data.payments]);

  const activePartySummary = useMemo(
    () =>
      partySummaries.find((ps) => ps.party.id === activeLedgerPartyId) || partySummaries[0],
    [partySummaries, activeLedgerPartyId]
  );

  const filteredPayments = useMemo(() => {
    if (!searchQuery.trim()) return data.payments;
    const q = searchQuery.toLowerCase();
    return data.payments.filter(
      (p) =>
        p.payment_number.toLowerCase().includes(q) ||
        (p.party_name || '').toLowerCase().includes(q) ||
        (p.party_mobile || '').includes(q) ||
        (p.reference_number || '').toLowerCase().includes(q)
    );
  }, [data.payments, searchQuery]);

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

      {mode === 'payments' ? (
        <>
          {/* Payment & Collection Entry Form */}
          {!isViewer && (
            <form
              onSubmit={handlePostPayment}
              className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-700" />
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {lang === 'mr'
                        ? 'पेमेंट व वसुली नोंद (Payments, Collections & Multi-Bill Allocation)'
                        : 'Payments, Collections, Advances & Multi-Document Allocation'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Independent payment ledger: paying a farmer or collecting from a customer
                      never duplicates purchase or sales revenue.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="pay-cat" className="block text-xs font-medium text-slate-700 mb-1">
                    Transaction Type
                  </label>
                  <select
                    id="pay-cat"
                    value={category}
                    onChange={(e) =>
                      setCategory(
                        e.target.value as
                          | 'FARMER_PAYMENT'
                          | 'CUSTOMER_COLLECTION'
                          | 'EXPENSE_PAYMENT'
                          | 'ADVANCE_PAID'
                          | 'ADVANCE_RECEIVED'
                          | 'REFUND'
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold min-h-[44px]"
                  >
                    <option value="FARMER_PAYMENT">Pay Farmer (Outflow)</option>
                    <option value="CUSTOMER_COLLECTION">Collect from Customer (Inflow)</option>
                    <option value="EXPENSE_PAYMENT">Pay Pending Expense / Rent (Outflow)</option>
                    <option value="ADVANCE_PAID">Advance Paid to Farmer/Supplier</option>
                    <option value="ADVANCE_RECEIVED">Advance Received from Customer</option>
                    <option value="REFUND">Refund / Return Settlement</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="pay-party" className="block text-xs font-medium text-slate-700 mb-1">
                    Select Party from Directory
                  </label>
                  <select
                    id="pay-party"
                    value={selectedPartyId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setSelectedPartyId(pid);
                      const found = data.parties.find((p) => p.id === pid);
                      if (found) {
                        setPartyName(found.name);
                        setPartyMobile(found.mobile);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium min-h-[44px]"
                  >
                    <option value="">-- Select or Type Below --</option>
                    {data.parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.mobile}) — {p.type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pay-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Party / Payee Name *
                  </label>
                  <input
                    id="pay-name"
                    type="text"
                    required
                    placeholder="Farmer / Customer / Landlord"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[44px]"
                  />
                </div>

                <div>
                  <label htmlFor="pay-mobile" className="block text-xs font-medium text-slate-700 mb-1">
                    Mobile Number
                  </label>
                  <input
                    id="pay-mobile"
                    type="tel"
                    placeholder="10-digit mobile"
                    value={partyMobile}
                    onChange={(e) => setPartyMobile(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label htmlFor="pay-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Date
                  </label>
                  <input
                    id="pay-date"
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="pay-amt" className="block text-xs font-medium text-slate-700 mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    id="pay-amt"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      handleAutoAllocate(Number(e.target.value || 0));
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-bold min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="pay-mode" className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Mode
                  </label>
                  <select
                    id="pay-mode"
                    value={payMode}
                    onChange={(e) =>
                      setPayMode(e.target.value as 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE')
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold min-h-[42px]"
                  >
                    <option value="UPI">UPI (Linked to Bank Account)</option>
                    <option value="CASH">Cash (Physical Cashbox)</option>
                    <option value="BANK_TRANSFER">Bank NEFT / RTGS / IMPS</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="pay-acc" className="block text-xs font-medium text-slate-700 mb-1">
                    {payMode === 'CASH' ? 'Cashbox Account' : 'Linked Bank Account'}
                  </label>
                  <select
                    id="pay-acc"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium min-h-[42px]"
                  >
                    {eligibleAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatINR(a.current_balance)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pay-ref" className="block text-xs font-medium text-slate-700 mb-1">
                    UTR / Cheque / Voucher #
                  </label>
                  <input
                    id="pay-ref"
                    type="text"
                    placeholder="UTR / Ref #"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono min-h-[42px]"
                  />
                </div>
              </div>

              {/* Multi-Document Allocation Table */}
              {openDocuments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700">
                    Allocate Payment Across Open Documents (Supports Partial & Split Allocations):
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="py-2 px-3 text-left">Doc #</th>
                          <th className="py-2 px-3 text-left">Party / Date</th>
                          <th className="py-2 px-3 text-right">Pending Balance</th>
                          <th className="py-2 px-3 text-right">Allocate Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono">
                        {openDocuments.map((doc) => (
                          <tr key={doc.docId}>
                            <td className="py-2 px-3 font-bold text-slate-900">{doc.docNumber}</td>
                            <td className="py-2 px-3 font-sans">
                              {doc.partyName} · {doc.date}
                            </td>
                            <td className="py-2 px-3 text-right text-amber-700">
                              {formatINR(doc.balance)}
                            </td>
                            <td className="py-2 px-3 text-right w-40">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={doc.balance}
                                aria-label={`Allocate to ${doc.docNumber}`}
                                value={allocations[doc.docId] || ''}
                                onChange={(e) =>
                                  setAllocations((prev) => ({
                                    ...prev,
                                    [doc.docId]: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right font-mono text-xs"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {direction === 'OUTFLOW'
                      ? 'Post Outflow Payment'
                      : 'Post Inflow Collection'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Payment & Collection Ledger */}
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'mr'
                    ? 'पेमेंट व वसुली रजिस्टर (Payments & Collections Ledger)'
                    : 'Payments & Collections Register'}
                </h2>
              </div>
              <input
                type="search"
                placeholder="Search payment #, party name, mobile, UTR..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs w-full sm:w-72"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-semibold">Voucher # / Date</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Category & Direction</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Party Name</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Mode & Account</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No payment records match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((pay) => {
                      const acc = data.accounts.find((a) => a.id === pay.account_id);
                      return (
                        <tr key={pay.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono">
                            <div className="font-bold text-slate-900">{pay.payment_number}</div>
                            <div className="text-[11px] text-slate-500">
                              {pay.date} · {pay.status}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{pay.category}</div>
                            <div className="text-[11px] text-slate-500">
                              {pay.direction} · {pay.notes}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">
                              {pay.party_name || '—'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {pay.party_mobile || ''}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">
                              {pay.mode} · {acc?.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              Ref: {pay.reference_number || '—'}
                            </div>
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                              pay.direction === 'INFLOW' ? 'text-emerald-700' : 'text-slate-900'
                            }`}
                          >
                            {pay.direction === 'INFLOW' ? '+' : '−'}
                            {formatINR(pay.amount)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Mode === 'parties': Farmer, Supplier & Customer Directory + Printable Party Ledger Statement */
        <div className="space-y-6">
          {!isViewer && (
            <form
              onSubmit={handleCreateParty}
              className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                <Users className="w-4 h-4 text-emerald-700" />
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'mr'
                    ? 'नवीन शेतकरी / व्यापारी / ग्राहक जोडा (Add Farmer, Supplier or Customer)'
                    : 'Add Farmer, Supplier or Customer to Directory'}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <div>
                  <label htmlFor="pty-type" className="block text-xs font-medium text-slate-700 mb-1">
                    Party Type
                  </label>
                  <select
                    id="pty-type"
                    value={newPartyType}
                    onChange={(e) =>
                      setNewPartyType(
                        e.target.value as 'farmer' | 'customer' | 'supplier' | 'both'
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold min-h-[42px]"
                  >
                    <option value="farmer">Farmer (शेतकरी)</option>
                    <option value="customer">Customer / Factory (ग्राहक / कारखाना)</option>
                    <option value="supplier">Trader / Supplier (व्यापारी)</option>
                    <option value="both">Both Farmer & Customer</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="pty-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    id="pty-name"
                    type="text"
                    required
                    placeholder="Party Name"
                    value={newPartyName}
                    onChange={(e) => setNewPartyName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="pty-mob" className="block text-xs font-medium text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    id="pty-mob"
                    type="tel"
                    required
                    placeholder="10-digit mobile"
                    value={newPartyMobile}
                    onChange={(e) => setNewPartyMobile(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="pty-vil" className="block text-xs font-medium text-slate-700 mb-1">
                    Village / City
                  </label>
                  <input
                    id="pty-vil"
                    type="text"
                    placeholder="Village or MIDC"
                    value={newPartyVillage}
                    onChange={(e) => setNewPartyVillage(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs min-h-[42px]"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 min-h-[42px]"
                  >
                    Save Party
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Directory & Detailed Party Statement Split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Party Directory ({partySummaries.length})
                </h3>
                <input
                  type="search"
                  placeholder="Search by name, mobile, village..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                />
              </div>
              <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
                {partySummaries
                  .filter(
                    (ps) =>
                      !searchQuery.trim() ||
                      ps.party.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      ps.party.mobile.includes(searchQuery) ||
                      (ps.party.village_or_city || '')
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase())
                  )
                  .map((ps) => (
                    <button
                      key={ps.party.id}
                      type="button"
                      onClick={() => setActiveLedgerPartyId(ps.party.id)}
                      className={`w-full text-left px-4 py-3.5 transition-colors flex items-center justify-between ${
                        activePartySummary?.party.id === ps.party.id
                          ? 'bg-emerald-50/80'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-900">{ps.party.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {ps.party.type.toUpperCase()} · {ps.party.mobile} ·{' '}
                          {ps.party.village_or_city || '—'}
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs">
                        {ps.payableToFarmer > 0 && (
                          <div className="font-bold text-amber-700">
                            Pay: {formatINR(ps.payableToFarmer)}
                          </div>
                        )}
                        {ps.receivableFromCustomer > 0 && (
                          <div className="font-bold text-blue-700">
                            Rec: {formatINR(ps.receivableFromCustomer)}
                          </div>
                        )}
                        {ps.payableToFarmer === 0 && ps.receivableFromCustomer === 0 && (
                          <div className="text-slate-400">Settled</div>
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            {/* Selected Party Ledger Statement */}
            <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 overflow-hidden">
              {activePartySummary ? (
                <div>
                  <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Party Ledger Statement: {activePartySummary.party.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Mobile: {activePartySummary.party.mobile} ·{' '}
                        {activePartySummary.party.village_or_city || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Statement</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          exportToCsv(`Ledger_${activePartySummary.party.name}`, [
                            ...activePartySummary.purchases.map((p) => ({
                              Date: p.date,
                              Type: 'PURCHASE',
                              Document: p.purchase_number,
                              Amount: p.purchase_amount,
                              Paid: p.paid_amount,
                              Balance: p.balance_amount,
                            })),
                            ...activePartySummary.sales.map((s) => ({
                              Date: s.date,
                              Type: 'SALE',
                              Document: s.invoice_number,
                              Amount: s.sale_amount,
                              Paid: s.received_amount,
                              Balance: s.balance_amount,
                            })),
                            ...activePartySummary.payments.map((pay) => ({
                              Date: pay.date,
                              Type: pay.category,
                              Document: pay.payment_number,
                              Amount: pay.amount,
                              Paid: pay.amount,
                              Balance: 0,
                            })),
                          ])
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CSV</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 font-mono text-xs">
                    <div>
                      <div className="text-slate-500 font-sans">Total Purchases</div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {formatINR(activePartySummary.totalPurchased)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-sans">Total Paid Out</div>
                      <div className="font-bold text-emerald-700 mt-0.5">
                        {formatINR(activePartySummary.totalOutflowPaid)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-sans">Total Sales</div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {formatINR(activePartySummary.totalSold)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-sans">Net Balance Due</div>
                      <div className="font-bold text-amber-700 mt-0.5">
                        {formatINR(
                          activePartySummary.payableToFarmer ||
                            activePartySummary.receivableFromCustomer
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4 text-left font-semibold">Date</th>
                          <th className="py-2.5 px-4 text-left font-semibold">Ref #</th>
                          <th className="py-2.5 px-4 text-left font-semibold">Particulars</th>
                          <th className="py-2.5 px-4 text-right font-semibold">Bill Amount</th>
                          <th className="py-2.5 px-4 text-right font-semibold">Payment / Collection</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {activePartySummary.purchases.map((p) => (
                          <tr key={p.id}>
                            <td className="py-2.5 px-4">{p.date}</td>
                            <td className="py-2.5 px-4 font-bold">{p.purchase_number}</td>
                            <td className="py-2.5 px-4 font-sans">
                              Purchase ({p.payable_weight_kg} kg payable)
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              {formatINR(p.purchase_amount)}
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-400">—</td>
                          </tr>
                        ))}
                        {activePartySummary.sales.map((s) => (
                          <tr key={s.id}>
                            <td className="py-2.5 px-4">{s.date}</td>
                            <td className="py-2.5 px-4 font-bold">{s.invoice_number}</td>
                            <td className="py-2.5 px-4 font-sans">
                              Sale ({s.billable_kg} kg billable)
                            </td>
                            <td className="py-2.5 px-4 text-right">{formatINR(s.sale_amount)}</td>
                            <td className="py-2.5 px-4 text-right text-slate-400">—</td>
                          </tr>
                        ))}
                        {activePartySummary.payments.map((pay) => (
                          <tr key={pay.id} className="bg-emerald-50/30">
                            <td className="py-2.5 px-4">{pay.date}</td>
                            <td className="py-2.5 px-4 font-bold">{pay.payment_number}</td>
                            <td className="py-2.5 px-4 font-sans">
                              {pay.category} ({pay.mode} · {pay.reference_number || 'Direct'})
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-400">—</td>
                            <td className="py-2.5 px-4 text-right font-bold text-emerald-700">
                              {formatINR(pay.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  Select or create a party to view their ledger statement.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
