import React, { useState } from 'react';
import {
  Settings,
  ShieldCheck,
  Database,
  BookOpen,
  Download,
  Upload,
  Plus,
  Users,
  CheckCircle2,
  ArrowRightLeft,
  Lock,
  Share2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { PUBLIC_SHARE_URL } from '../App';
import { formatINR } from '../types';
import type { AppBootstrapData, EnvMode, LangMode, UserRole } from '../types';
import type { CuttingRuleCode, DeductionImpact } from '../utils/calculations';

interface SettingsAndGuideViewProps {
  data: AppBootstrapData;
  lang: LangMode;
  envMode: EnvMode;
  onEnvChange: (env: EnvMode) => void;
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
}

export const SettingsAndGuideView: React.FC<SettingsAndGuideViewProps> = ({
  data,
  lang,
  envMode,
  onEnvChange,
  apiRequest,
  onRefresh,
}) => {
  const isOwner = data.user.role === 'owner';

  // Add Commodity Form
  const [commCode, setCommCode] = useState('');
  const [commNameEn, setCommNameEn] = useState('');
  const [commNameMr, setCommNameMr] = useState('');
  const [commRule, setCommRule] = useState<CuttingRuleCode>('RULE_10G_PER_KG');
  const [commImpact, setCommImpact] = useState<DeductionImpact>('settlement_only');
  const [commRate, setCommRate] = useState('4500');

  // Add Account Form
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<'CASH' | 'BANK'>('BANK');
  const [accBankName, setAccBankName] = useState('');
  const [accUpiId, setAccUpiId] = useState('');
  const [accOpenBal, setAccOpenBal] = useState('0');

  // Add User Form
  const [usrUsername, setUsrUsername] = useState('');
  const [usrFullName, setUsrFullName] = useState('');
  const [usrPassword, setUsrPassword] = useState('');
  const [usrRole, setUsrRole] = useState<UserRole>('staff');
  const [usrLocationId, setUsrLocationId] = useState<string>('loc_shop1');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(PUBLIC_SHARE_URL);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 3000);
    } catch {
      // ignore
    }
  };

  // Guided Opening Setup State
  const openingSetupCompleted = data.settings.opening_setup_completed === '1';
  const [openingDate, setOpeningDate] = useState<string>(
    data.settings.opening_setup_date || new Date().toISOString().slice(0, 10)
  );
  const [openingLocationId, setOpeningLocationId] = useState<string>('loc_godown');
  const [openingCommodityId, setOpeningCommodityId] = useState<string>('comm_soybean');
  const [openingQtyKg, setOpeningQtyKg] = useState<string>('0');
  const [openingRatePerQuintal, setOpeningRatePerQuintal] = useState<string>('4500');

  // Own-Account Contra Transfer State (Cashbox <-> Bank)
  const [contraFromId, setContraFromId] = useState<string>('acc_bank_sbi');
  const [contraToId, setContraToId] = useState<string>('acc_cash_shop1');
  const [contraAmount, setContraAmount] = useState<string>('');
  const [contraNotes, setContraNotes] = useState<string>('Cash withdrawal for shop farmer payments');

  const handleCompleteOpeningSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const qty = Number(openingQtyKg || 0);
      const ratePerKg = Number(openingRatePerQuintal || 0) / 100;
      await apiRequest('/api/settings/opening-setup', {
        method: 'POST',
        body: JSON.stringify({
          openingDate,
          defaultCuttingRule: data.settings.default_cutting_rule || 'RULE_10G_PER_KG',
          rentMonthlyAmount: Number(data.settings.rent_monthly_amount || 40000),
          rentPremisesScope:
            data.settings.rent_premises_scope ||
            'ALL_PREMISES_COMBINED (4 Shops + 1 Central Godown)',
          openingStock:
            qty > 0
              ? [
                  {
                    locationId: openingLocationId,
                    commodityId: openingCommodityId,
                    qtyKg: qty,
                    avgCostPerKg: ratePerKg,
                  },
                ]
              : [],
        }),
      });
      await onRefresh();
      setFeedback({
        type: 'success',
        message: `Guided Opening Setup completed and locked as of ${openingDate}. Duplicate opening imports are now prevented.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleContraTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ ok: boolean; transferNumber: string }>(
        '/api/accounts/transfer',
        {
          method: 'POST',
          body: JSON.stringify({
            date: new Date().toISOString().slice(0, 10),
            fromAccountId: contraFromId,
            toAccountId: contraToId,
            amount: Number(contraNotes ? contraAmount : contraAmount),
            notes: contraNotes,
          }),
        }
      );
      setContraAmount('');
      await onRefresh();
      setFeedback({
        type: 'success',
        message: `Completed Own-Account Contra Transfer ${res.transferNumber}. Account balances updated without affecting sales revenue, expenses, or trading profit.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleAddCommodity = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiRequest('/api/settings/commodities', {
        method: 'POST',
        body: JSON.stringify({
          code: commCode,
          nameEn: commNameEn,
          nameMr: commNameMr || commNameEn,
          defaultCuttingRule: commRule,
          cuttingImpact: commImpact,
          defaultRatePerQuintal: Number(commRate || 0),
        }),
      });
      setCommCode('');
      setCommNameEn('');
      setCommNameMr('');
      await onRefresh();
      setFeedback({ type: 'success', message: 'Commodity saved and initialized across all 4 shops and 1 godown.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiRequest('/api/settings/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: accName,
          type: accType,
          bankName: accBankName,
          upiId: accUpiId,
          supportsUpi: accType === 'BANK' && Boolean(accUpiId),
          openingBalance: Number(accOpenBal || 0),
        }),
      });
      setAccName('');
      setAccBankName('');
      setAccUpiId('');
      setAccOpenBal('0');
      await onRefresh();
      setFeedback({ type: 'success', message: 'Financial account added.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiRequest('/api/settings/users', {
        method: 'POST',
        body: JSON.stringify({
          username: usrUsername,
          fullName: usrFullName,
          password: usrPassword || 'saisamarth123',
          role: usrRole,
          assignedLocationId: usrRole === 'staff' ? usrLocationId : null,
        }),
      });
      setUsrUsername('');
      setUsrFullName('');
      setUsrPassword('');
      await onRefresh();
      setFeedback({ type: 'success', message: 'User account and role permissions saved.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const dump = await apiRequest<Record<string, unknown>>('/api/backup/export');
      const blob = new Blob([JSON.stringify(dump, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SaiSamarth_Backup_${envMode}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback({
        type: 'success',
        message: `Downloaded complete JSON database backup for ${envMode.toUpperCase()} environment.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await apiRequest('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      await onRefresh();
      setFeedback({
        type: 'success',
        message: 'Database backup restored successfully.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

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

      {/* Live Shareable Link & Netlify Hosting Card */}
      <div className="rounded-2xl bg-emerald-950 text-white border border-emerald-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-base font-bold text-amber-300">
              <Share2 className="w-5 h-5" />
              <span>Public Live Shareable Link & Netlify Ready Build</span>
            </div>
            <p className="text-xs text-emerald-100/90 max-w-2xl">
              Share this live link directly with the owner, shop clerks, or accountant on mobile or
              desktop. The project also includes <code>netlify.toml</code>,{' '}
              <code>public/_redirects</code>, and an automatic browser-storage database fallback so
              it runs seamlessly when deployed to Netlify.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyShareUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-emerald-950 hover:bg-amber-300 transition-colors"
            >
              <Copy className="w-4 h-4" />
              <span>{copiedUrl ? 'Copied Live URL!' : 'Copy Public Share Link'}</span>
            </button>
            <a
              href={PUBLIC_SHARE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700 bg-emerald-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Live Link</span>
            </a>
          </div>
        </div>

        <div className="rounded-xl bg-emerald-900/70 border border-emerald-800 px-3.5 py-2.5 font-mono text-xs text-amber-200 break-all">
          {PUBLIC_SHARE_URL}
        </div>
      </div>

      {/* Environment Isolation Card (Demo vs Real Business Environment) */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Database className="w-5 h-5 text-emerald-700" />
            <span>
              {lang === 'mr'
                ? 'डेमो आणि प्रत्यक्ष व्यवसाय डेटाबेस विभाजन (Demo vs Real Business Environment)'
                : 'Isolated Database Environments: Demo vs Real Business'}
            </span>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl">
            Demo transactions are stored in <code>data/saisamarth_demo.db</code> and Real Business
            transactions are stored in <code>data/saisamarth_real.db</code>. Sample transactions are
            physically isolated and never mix into Real Business reports.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => onEnvChange('demo')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              envMode === 'demo'
                ? 'bg-amber-600 text-white'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Demo Environment (Sample Data)
          </button>
          <button
            type="button"
            onClick={() => onEnvChange('real')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              envMode === 'real'
                ? 'bg-emerald-700 text-white'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Real Business (Clean Production DB)
          </button>
        </div>
      </div>

      {/* Guided Opening Setup + Own-Account Contra Transfer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Guided Opening Setup Card */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              {openingSetupCompleted ? (
                <Lock className="w-4 h-4 text-emerald-700" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-amber-600" />
              )}
              <h3 className="text-sm font-bold text-slate-900">
                Guided Opening Setup (Opening Date & Duplicate-Import Lock)
              </h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                openingSetupCompleted
                  ? 'bg-emerald-100 text-emerald-900'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {openingSetupCompleted
                ? `LOCKED (${data.settings.opening_setup_date || 'Completed'})`
                : 'READY FOR OPENING SETUP'}
            </span>
          </div>

          <p className="text-xs text-slate-600">
            Configure the reviewed business opening date, confirm default cutting rule & ₹40,000
            monthly rent scope, and optionally seed initial opening stock before live trading. Once
            locked, duplicate opening balance imports are automatically rejected.
          </p>

          {!openingSetupCompleted && isOwner ? (
            <form onSubmit={handleCompleteOpeningSetup} className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Reviewed Opening Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Initial Opening Stock Location
                  </label>
                  <select
                    value={openingLocationId}
                    onChange={(e) => setOpeningLocationId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                  >
                    {data.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name_en}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Optional Opening Qty (kg)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={openingQtyKg}
                    onChange={(e) => setOpeningQtyKg(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Opening Carrying Cost (₹/Qtl)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={openingRatePerQuintal}
                    onChange={(e) => setOpeningRatePerQuintal(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm & Lock Opening Setup</span>
              </button>
            </form>
          ) : (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 font-mono">
              Opening Setup Locked on{' '}
              <strong>{data.settings.opening_setup_date || '2025-05-01'}</strong> · Cutting Rule:{' '}
              <strong>{data.settings.default_cutting_rule}</strong> · Rent Template:{' '}
              <strong>{formatINR(Number(data.settings.rent_monthly_amount || 40000))}/mo</strong>
            </div>
          )}
        </div>

        {/* Own-Account Contra Transfer Card */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <ArrowRightLeft className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Own-Account Contra Transfer (Cashbox ↔ Bank Account)
            </h3>
          </div>
          <p className="text-xs text-slate-600">
            Withdraw bank cash to a shop cashbox or deposit shop cash into the bank. Contra
            transfers update both account balances atomically without creating sales revenue or
            operating expenses.
          </p>
          {isOwner && (
            <form onSubmit={handleContraTransfer} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    From Account
                  </label>
                  <select
                    value={contraFromId}
                    onChange={(e) => setContraFromId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                  >
                    {data.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatINR(a.current_balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    To Account
                  </label>
                  <select
                    value={contraToId}
                    onChange={(e) => setContraToId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                  >
                    {data.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatINR(a.current_balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Transfer Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 50000"
                    value={contraAmount}
                    onChange={(e) => setContraAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono font-bold"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  type="text"
                  value={contraNotes}
                  onChange={(e) => setContraNotes(e.target.value)}
                  placeholder="Particulars / Reference"
                  className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Post Contra Transfer</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Commodities & Cutting Rules + Financial Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <Settings className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Commodities & Default Cutting Rules ({data.commodities.length})
            </h3>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {data.commodities.map((c) => (
              <div key={c.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900">
                    {c.name_en} ({c.name_mr})
                  </span>
                  <div className="text-[11px] text-slate-500">
                    Rule: {c.default_cutting_rule} ({c.custom_cutting_percent}%) · Impact:{' '}
                    {c.cutting_impact}
                  </div>
                </div>
                <div className="font-mono font-semibold text-slate-800">
                  {formatINR(c.default_rate_per_quintal)}/Qtl
                </div>
              </div>
            ))}
          </div>

          {isOwner && (
            <form onSubmit={handleAddCommodity} className="pt-3 border-t border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-700">Add / Update Commodity:</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Code (e.g. TUR)"
                  value={commCode}
                  onChange={(e) => setCommCode(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  placeholder="English Name (e.g. Tur Dal)"
                  value={commNameEn}
                  onChange={(e) => setCommNameEn(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
                />
                <input
                  type="text"
                  placeholder="Marathi Name (e.g. तूर)"
                  value={commNameMr}
                  onChange={(e) => setCommNameMr(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
                />
                <select
                  value={commRule}
                  onChange={(e) => setCommRule(e.target.value as CuttingRuleCode)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                >
                  <option value="RULE_10G_PER_KG">Rule 1: 10g/kg (1%)</option>
                  <option value="RULE_2KG_PER_100KG">Rule 2: 2kg/100kg (2%)</option>
                </select>
                <select
                  value={commImpact}
                  onChange={(e) => setCommImpact(e.target.value as DeductionImpact)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                >
                  <option value="settlement_only">Settlement Only</option>
                  <option value="both">Both Settlement & Stock</option>
                </select>
                <input
                  type="number"
                  placeholder="Default Rate/Qtl"
                  value={commRate}
                  onChange={(e) => setCommRate(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Commodity</span>
              </button>
            </form>
          )}
        </div>

        {/* Cashboxes & Bank / UPI Accounts */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Cashboxes & UPI-Linked Bank Accounts
            </h3>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {data.accounts.map((acc) => (
              <div key={acc.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900">{acc.name}</span>
                  <div className="text-[11px] text-slate-500">
                    {acc.type} {acc.upi_id ? `· UPI: ${acc.upi_id}` : ''}
                  </div>
                </div>
                <div className="font-mono font-bold text-slate-900">
                  {formatINR(acc.current_balance)}
                </div>
              </div>
            ))}
          </div>

          {isOwner && (
            <form onSubmit={handleAddAccount} className="pt-3 border-t border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-700">
                Add New Cashbox or Bank Account:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Account Name"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
                />
                <select
                  value={accType}
                  onChange={(e) => setAccType(e.target.value as 'CASH' | 'BANK')}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold"
                >
                  <option value="BANK">Bank Account (Supports UPI/NEFT)</option>
                  <option value="CASH">Physical Shop Cashbox</option>
                </select>
                {accType === 'BANK' && (
                  <>
                    <input
                      type="text"
                      placeholder="Bank Name (e.g. Bank of Maharashtra)"
                      value={accBankName}
                      onChange={(e) => setAccBankName(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Linked UPI ID (e.g. saisamarth@mahb)"
                      value={accUpiId}
                      onChange={(e) => setAccUpiId(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                    />
                  </>
                )}
                <input
                  type="number"
                  placeholder="Opening Balance (₹)"
                  value={accOpenBal}
                  onChange={(e) => setAccOpenBal(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Financial Account</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Users & Role-Based Permissions + Database Backup/Restore */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <Users className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Users & Server-Side Permissions (Owner / Staff / Viewer)
            </h3>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {data.users.map((u) => (
              <div key={u.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900">{u.full_name}</span> (
                  <span className="font-mono">{u.username}</span>)
                  <div className="text-[11px] text-slate-500">
                    Role: <strong>{u.role.toUpperCase()}</strong>
                    {u.assigned_location_id ? ` · Location: ${u.assigned_location_id}` : ' · All Locations'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {isOwner && (
            <form onSubmit={handleAddUser} className="pt-3 border-t border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-700">Create / Update User:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Username (e.g. shop2staff)"
                  value={usrUsername}
                  onChange={(e) => setUsrUsername(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={usrFullName}
                  onChange={(e) => setUsrFullName(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={usrPassword}
                  onChange={(e) => setUsrPassword(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
                />
                <select
                  value={usrRole}
                  onChange={(e) => setUsrRole(e.target.value as UserRole)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold"
                >
                  <option value="staff">Staff (Authorized Entry & Assigned Shop)</option>
                  <option value="viewer">Viewer (Read-Only Auditor)</option>
                  <option value="owner">Owner (Full Access & Reversals)</option>
                </select>
                {usrRole === 'staff' && (
                  <select
                    value={usrLocationId}
                    onChange={(e) => setUsrLocationId(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs sm:col-span-2"
                  >
                    {data.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        Assigned Location: {l.name_en}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save User</span>
              </button>
            </form>
          )}
        </div>

        {/* Backup & Restore + Immutable Audit Log */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <Database className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Database Backup, Restore & Immutable Audit History
            </h3>
          </div>

          {isOwner && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <Download className="w-4 h-4" />
                <span>Export Full JSON Backup ({envMode.toUpperCase()})</span>
              </button>

              <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
                <Upload className="w-4 h-4 text-slate-600" />
                <span>Restore Backup File</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreBackup}
                  className="hidden"
                />
              </label>
            </div>
          )}

          <div className="text-xs font-bold text-slate-700 pt-2">
            Recent Server Audit Trail ({data.auditLogs.length} entries):
          </div>
          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto text-xs border border-slate-200 rounded-xl p-2 bg-slate-50">
            {data.auditLogs.length === 0 ? (
              <div className="p-4 text-center text-slate-500">No audit entries yet.</div>
            ) : (
              data.auditLogs.slice(0, 12).map((log) => (
                <div key={log.id} className="py-2 px-2">
                  <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                    <span>
                      {log.action} · {log.username} ({log.role})
                    </span>
                    <span>{log.timestamp}</span>
                  </div>
                  <div className="text-slate-800 font-medium mt-0.5">{log.summary}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Simple Owner Guide, Setup Instructions, Database Migrations & Reliability Documentation */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
          <BookOpen className="w-5 h-5 text-emerald-700" />
          <h2 className="text-base font-bold text-slate-900">
            Sai Samarth Trading Company — Owner Guide, Setup, Migrations & Backup Procedure
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700 leading-relaxed">
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-900">1. Daily Owner & Staff Operating Guide</h4>
            <p>
              <strong>Step 1 (Confirm Business Rules):</strong> Switch to the{' '}
              <strong>Real Business</strong> environment at the top when ready to begin live trading.
              Confirm your default Business Cutting Rule (Rule 1: 10g/kg = 1% vs Rule 2: 2kg/100kg =
              2%) and your ₹40,000 monthly rent premises scope.
            </p>
            <p>
              <strong>Step 2 (Purchasing from Farmers):</strong> Open <strong>Purchases</strong>.
              Enter either Weighbridge Gross & Tare or Direct Weight in kg or Quintals (1 Qtl = 100
              kg). Commercial cutting defaults to <em>Settlement Only</em> so farmer payment is
              reduced while full physical bags received enter shop/godown stock. Use{' '}
              <strong>Save Draft → Review → Post</strong>.
            </p>
            <p>
              <strong>Step 3 (Transfers & Factory Sales):</strong> Transfer loads from any of the 4
              Shops to the Central Godown under <strong>Stock</strong>—transfers carry over the
              moving weighted-average cost per kg without creating artificial profit. When selling
              under <strong>Sales</strong>, enter both <em>Dispatched Weight</em> (reduces stock)
              and <em>Billable Weight</em> (calculates revenue).
            </p>
          </div>

          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-900">
              2. Setup, Migrations, Backup/Restore & Scope Disclosure
            </h4>
            <p>
              <strong>Setup & SQLite Migrations:</strong> The application runs an Express + SQLite
              WAL server (<code>server.ts</code>) applying{' '}
              <code>migrations/001_initial_schema.sql</code> automatically on startup to two isolated
              database files: <code>data/saisamarth_demo.db</code> (Demo) and{' '}
              <code>data/saisamarth_real.db</code> (Real Business). Run <code>npm run dev</code> for
              development, <code>npm test</code> for unit tests, and <code>npm run build && npm start</code>{' '}
              for production.
            </p>
            <p>
              <strong>Backup & Restore Procedure:</strong> Click{' '}
              <strong>Export Full JSON Backup</strong> above at the end of each trading day to save a
              complete snapshot of all tables to your phone or computer, or copy the SQLite files in{' '}
              <code>/data/</code>. Use <strong>Restore Backup File</strong> to restore any snapshot.
            </p>
            <p>
              <strong>Transparency on Scope:</strong> Unfinished purchase drafts are persisted locally
              in the browser and as server drafts so nothing is lost on refresh. Final posting
              requires live server connectivity to prevent conflicting simultaneous stock sales.
              Automated SMS/WhatsApp gateway dispatch and live hardware serial weighbridge RS-232
              auto-capture are not connected; receipts and statements can be printed or saved as
              PDF/HTML/CSV directly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
