import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  Printer,
  RotateCcw,
  Plus,
  Trash2,
  Scale,
  Eye,
  Save,
  Send,
} from 'lucide-react';
import { formatINR, formatKg } from '../types';
import type {
  AppBootstrapData,
  LangMode,
  PurchaseRecord,
  WeightUnit,
} from '../types';
import {
  calculatePurchase,
  getCuttingRuleDescription,
  getCuttingRulePercent,
  quintalToKg,
} from '../utils/calculations';
import type {
  CuttingRuleCode,
  DeductionImpact,
  DeductionLineInput,
  RateUnit,
} from '../utils/calculations';
import { ReceiptModal } from './ReceiptModal';

interface PurchasesViewProps {
  data: AppBootstrapData;
  lang: LangMode;
  displayUnit: WeightUnit;
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
}

const LOCAL_DRAFT_KEY = 'saisamarth_unfinished_purchase_draft_v1';

export const PurchasesView: React.FC<PurchasesViewProps> = ({
  data,
  lang,
  displayUnit,
  apiRequest,
  onRefresh,
}) => {
  const isViewer = data.user.role === 'viewer';
  const isOwner = data.user.role === 'owner';
  const cuttingRuleConfirmed = data.settings.cutting_rule_confirmed === '1';

  // Owner Cutting Rule Confirmation state
  const [selectedOwnerRule, setSelectedOwnerRule] = useState<CuttingRuleCode>(
    (data.settings.default_cutting_rule as CuttingRuleCode) || 'RULE_10G_PER_KG'
  );
  const [confirmingRule, setConfirmingRule] = useState(false);

  // Form State
  const [editingDraftId, setEditingDraftId] = useState<string | undefined>(undefined);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [farmerSearch, setFarmerSearch] = useState<string>('');
  const [farmerName, setFarmerName] = useState<string>('');
  const [farmerMobile, setFarmerMobile] = useState<string>('');
  const [farmerVillage, setFarmerVillage] = useState<string>('');
  const [locationId, setLocationId] = useState<string>(
    data.user.assignedLocationId || data.locations[0]?.id || 'loc_shop1'
  );
  const [commodityId, setCommodityId] = useState<string>(
    data.commodities[0]?.id || 'comm_soybean'
  );

  // Weighing Mode & Unit Entry
  const [weighingMode, setWeighingMode] = useState<'direct' | 'weighbridge'>('weighbridge');
  const [entryWeightUnit, setEntryWeightUnit] = useState<WeightUnit>('kg');
  const [directInputVal, setDirectInputVal] = useState<string>('1000');
  const [grossInputVal, setGrossInputVal] = useState<string>('2500');
  const [tareInputVal, setTareInputVal] = useState<string>('500');

  // Cutting Rule & Deductions
  const [cuttingRuleApplied, setCuttingRuleApplied] = useState<CuttingRuleCode>(
    (data.settings.default_cutting_rule as CuttingRuleCode) || 'RULE_10G_PER_KG'
  );
  const [deductions, setDeductions] = useState<DeductionLineInput[]>([
    {
      type: 'cutting',
      label: 'Business Cutting (10g/kg = 1%)',
      mode: 'percent',
      value: 1.0,
      impact: 'settlement_only',
    },
    {
      type: 'moisture',
      label: 'Moisture Deduction',
      mode: 'percent',
      value: 0,
      moistureReadingPercent: 12.0,
      impact: 'settlement_only',
    },
    {
      type: 'dust',
      label: 'Sieved Dust / Stones Removed',
      mode: 'kg',
      value: 0,
      impact: 'both',
    },
  ]);

  // Rate & Payment
  const [rateValue, setRateValue] = useState<string>('4600');
  const [rateUnit, setRateUnit] = useState<RateUnit>('per_quintal');
  const [immediatePaymentAmount, setImmediatePaymentAmount] = useState<string>('0');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE'>('UPI');
  const [paymentAccountId, setPaymentAccountId] = useState<string>('acc_bank_sbi');
  const [paymentReference, setPaymentReference] = useState<string>('');

  // Inbound Landed Cost Expense (Optional)
  const [landedExpenseAmount, setLandedExpenseAmount] = useState<string>('0');
  const [landedExpensePayee, setLandedExpensePayee] = useState<string>('Market Yard Hamal Toli');

  // Vehicle & Weighbridge details
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [weighbridgeSlipRef, setWeighbridgeSlipRef] = useState<string>('');
  const [weighbridgePhotoData, setWeighbridgePhotoData] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // Workflow UI State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [recoveredNotice, setRecoveredNotice] = useState(false);
  const [receiptPurchase, setReceiptPurchase] = useState<PurchaseRecord | null>(null);
  const [lastPostedPurchaseNumber, setLastPostedPurchaseNumber] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [historySearch, setHistorySearch] = useState<string>('');

  // Recover unfinished draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.farmerName) {
          setFarmerName(parsed.farmerName || '');
          setFarmerMobile(parsed.farmerMobile || '');
          setFarmerVillage(parsed.farmerVillage || '');
          if (parsed.locationId) setLocationId(parsed.locationId);
          if (parsed.commodityId) setCommodityId(parsed.commodityId);
          if (parsed.weighingMode) setWeighingMode(parsed.weighingMode);
          if (parsed.directInputVal) setDirectInputVal(parsed.directInputVal);
          if (parsed.grossInputVal) setGrossInputVal(parsed.grossInputVal);
          if (parsed.tareInputVal) setTareInputVal(parsed.tareInputVal);
          if (parsed.rateValue) setRateValue(parsed.rateValue);
          if (parsed.rateUnit) setRateUnit(parsed.rateUnit);
          if (parsed.vehicleNumber) setVehicleNumber(parsed.vehicleNumber);
          setRecoveredNotice(true);
        }
      }
    } catch {
      // ignore local storage errors
    }
  }, []);

  // Persist unfinished draft changes to localStorage
  useEffect(() => {
    if (!farmerName && !farmerMobile && !vehicleNumber) return;
    try {
      localStorage.setItem(
        LOCAL_DRAFT_KEY,
        JSON.stringify({
          farmerName,
          farmerMobile,
          farmerVillage,
          locationId,
          commodityId,
          weighingMode,
          directInputVal,
          grossInputVal,
          tareInputVal,
          rateValue,
          rateUnit,
          vehicleNumber,
        })
      );
    } catch {
      // ignore
    }
  }, [
    farmerName,
    farmerMobile,
    farmerVillage,
    locationId,
    commodityId,
    weighingMode,
    directInputVal,
    grossInputVal,
    tareInputVal,
    rateValue,
    rateUnit,
    vehicleNumber,
  ]);

  // Update default cutting rule and rate when commodity changes
  const handleCommodityChange = (newCommId: string) => {
    setCommodityId(newCommId);
    const comm = data.commodities.find((c) => c.id === newCommId);
    if (comm) {
      const rule = comm.default_cutting_rule;
      setCuttingRuleApplied(rule);
      const pct = getCuttingRulePercent(rule, comm.custom_cutting_percent);
      const desc = getCuttingRuleDescription(rule, comm.custom_cutting_percent);
      setDeductions((prev) =>
        prev.map((d) =>
          d.type === 'cutting'
            ? {
                ...d,
                label: desc.en,
                mode: 'percent',
                value: pct,
                impact: comm.cutting_impact || 'settlement_only',
              }
            : d
        )
      );
      if (comm.default_rate_per_quintal > 0) {
        setRateValue(
          rateUnit === 'per_quintal'
            ? String(comm.default_rate_per_quintal)
            : String(comm.default_rate_per_quintal / 100)
        );
      }
    }
  };

  // Switch Cutting Rule preset explicitly
  const handleSelectCuttingRule = (rule: CuttingRuleCode) => {
    setCuttingRuleApplied(rule);
    const pct = getCuttingRulePercent(rule, 1.5);
    const desc = getCuttingRuleDescription(rule, pct);
    setDeductions((prev) =>
      prev.map((d) =>
        d.type === 'cutting'
          ? {
              ...d,
              label: desc.en,
              mode: 'percent',
              value: pct,
            }
          : d
      )
    );
  };

  // Convert weights to kg for live calculation
  const directKg = useMemo(() => {
    const num = Number(directInputVal || 0);
    return entryWeightUnit === 'quintal' ? quintalToKg(num) : num;
  }, [directInputVal, entryWeightUnit]);

  const grossKg = useMemo(() => {
    const num = Number(grossInputVal || 0);
    return entryWeightUnit === 'quintal' ? quintalToKg(num) : num;
  }, [grossInputVal, entryWeightUnit]);

  const tareKg = useMemo(() => {
    const num = Number(tareInputVal || 0);
    return entryWeightUnit === 'quintal' ? quintalToKg(num) : num;
  }, [tareInputVal, entryWeightUnit]);

  const calc = useMemo(
    () =>
      calculatePurchase({
        weighingMode,
        directWeightKg: directKg,
        grossWeightKg: grossKg,
        tareWeightKg: tareKg,
        deductions,
        rateValue: Number(rateValue || 0),
        rateUnit,
        immediatePaymentAmount: Number(immediatePaymentAmount || 0),
        landedExpenseAmount: Number(landedExpenseAmount || 0),
      }),
    [
      weighingMode,
      directKg,
      grossKg,
      tareKg,
      deductions,
      rateValue,
      rateUnit,
      immediatePaymentAmount,
      landedExpenseAmount,
    ]
  );

  // Filter payment accounts based on paymentMode (UPI -> strictly BANK accounts!)
  const eligibleAccounts = useMemo(() => {
    if (paymentMode === 'CASH') {
      return data.accounts.filter((a) => a.type === 'CASH');
    }
    return data.accounts.filter((a) => a.type === 'BANK');
  }, [data.accounts, paymentMode]);

  useEffect(() => {
    if (eligibleAccounts.length > 0 && !eligibleAccounts.some((a) => a.id === paymentAccountId)) {
      setPaymentAccountId(eligibleAccounts[0].id);
    }
  }, [eligibleAccounts, paymentAccountId]);

  const handleConfirmOwnerCuttingRule = async () => {
    setConfirmingRule(true);
    setFeedback(null);
    try {
      await apiRequest('/api/settings/confirm-cutting-rule', {
        method: 'POST',
        body: JSON.stringify({
          defaultRule: selectedOwnerRule,
          commodityRules: data.commodities.map((c) => ({
            commodityId: c.id,
            rule: selectedOwnerRule,
            impact: 'settlement_only',
          })),
        }),
      });
      handleSelectCuttingRule(selectedOwnerRule);
      await onRefresh();
      setFeedback({
        type: 'success',
        message: `Owner confirmed ${
          selectedOwnerRule === 'RULE_10G_PER_KG'
            ? 'Rule 1: 10 grams per kg (1%)'
            : 'Rule 2: 2 kg per 100 kg (2%)'
        } as the active default cutting rule.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setConfirmingRule(false);
    }
  };

  const handleSaveOrPost = async (targetStatus: 'DRAFT' | 'POSTED') => {
    setFeedback(null);
    if (!farmerName.trim() || !farmerMobile.trim()) {
      setFeedback({
        type: 'error',
        message: 'Farmer name and 10-digit mobile number are required.',
      });
      return;
    }
    if (calc.validationErrors.length > 0) {
      setFeedback({
        type: 'error',
        message: calc.validationErrors[0],
      });
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `pur_${targetStatus}_${date}_${farmerMobile.trim()}_${calc.materialInputKg}_${calc.purchaseAmount}_${
        editingDraftId || 'new'
      }`;
      const res = await apiRequest<{ ok: boolean; purchaseNumber: string; status: string }>(
        '/api/purchases',
        {
          method: 'POST',
          body: JSON.stringify({
            id: editingDraftId,
            idempotencyKey: targetStatus === 'POSTED' ? idempotencyKey : undefined,
            date,
            status: targetStatus,
            partyId: selectedPartyId || undefined,
            farmerName: farmerName.trim(),
            farmerMobile: farmerMobile.trim(),
            farmerVillage: farmerVillage.trim(),
            locationId,
            commodityId,
            weighingMode,
            directWeightKg: directKg,
            grossWeightKg: grossKg,
            tareWeightKg: tareKg,
            cuttingRuleApplied,
            deductions,
            rateValue: Number(rateValue || 0),
            rateUnit,
            immediatePaymentAmount: Number(immediatePaymentAmount || 0),
            paymentMode,
            paymentAccountId,
            paymentReference,
            landedExpenseAmount: Number(landedExpenseAmount || 0),
            landedExpensePayee,
            vehicleNumber,
            weighbridgeSlipRef,
            weighbridgePhotoData: weighbridgePhotoData || undefined,
            remarks,
          }),
        }
      );

      localStorage.removeItem(LOCAL_DRAFT_KEY);
      setRecoveredNotice(false);
      setReviewModalOpen(false);
      setEditingDraftId(undefined);
      setFarmerName('');
      setFarmerMobile('');
      setFarmerVillage('');
      setSelectedPartyId('');
      setImmediatePaymentAmount('0');
      setPaymentReference('');
      setVehicleNumber('');
      setWeighbridgeSlipRef('');
      setRemarks('');
      await onRefresh();
      if (targetStatus === 'POSTED') {
        setLastPostedPurchaseNumber(res.purchaseNumber);
      }

      setFeedback({
        type: 'success',
        message:
          targetStatus === 'POSTED'
            ? `Posted Purchase ${res.purchaseNumber}: +${calc.physicalStockReceivedKg} kg physical stock added & ${formatINR(
                calc.purchaseAmount
              )} recorded.`
            : `Saved Draft ${res.purchaseNumber} (Drafts do not affect stock or financial reports until posted).`,
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

  const handleLoadDraft = (draft: PurchaseRecord) => {
    setEditingDraftId(draft.id);
    setDate(draft.date);
    setSelectedPartyId(draft.party_id);
    setFarmerName(draft.farmer_name);
    setFarmerMobile(draft.farmer_mobile);
    setFarmerVillage(draft.farmer_village || '');
    setLocationId(draft.location_id);
    setCommodityId(draft.commodity_id);
    setWeighingMode(draft.weighing_mode);
    setEntryWeightUnit('kg');
    setDirectInputVal(String(draft.material_input_kg));
    setGrossInputVal(String(draft.gross_weight_kg));
    setTareInputVal(String(draft.tare_weight_kg));
    setCuttingRuleApplied(draft.cutting_rule_applied);
    try {
      const parsedDed = JSON.parse(draft.deductions_json);
      if (Array.isArray(parsedDed)) setDeductions(parsedDed);
    } catch {
      // ignore
    }
    setRateValue(String(draft.rate_value));
    setRateUnit(draft.rate_unit);
    setImmediatePaymentAmount(String(draft.immediate_payment_amount));
    setVehicleNumber(draft.vehicle_number || '');
    setWeighbridgeSlipRef(draft.weighbridge_slip_ref || '');
    setRemarks(draft.remarks || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReversePurchase = async (id: string) => {
    if (!reversalReason.trim()) return;
    try {
      await apiRequest(`/api/purchases/${id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reversalReason }),
      });
      setReversingId(null);
      setReversalReason('');
      await onRefresh();
      setFeedback({
        type: 'success',
        message: 'Purchase reversed with full stock & payment reversal and audit log.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const farmerParties = useMemo(
    () =>
      data.parties.filter(
        (p) =>
          (p.type === 'farmer' || p.type === 'supplier' || p.type === 'both') &&
          (!farmerSearch.trim() ||
            p.name.toLowerCase().includes(farmerSearch.toLowerCase()) ||
            p.mobile.includes(farmerSearch) ||
            (p.village_or_city || '').toLowerCase().includes(farmerSearch.toLowerCase()))
      ),
    [data.parties, farmerSearch]
  );

  const filteredHistory = useMemo(
    () =>
      data.purchases.filter((p) => {
        if (!historySearch.trim()) return true;
        const q = historySearch.toLowerCase();
        return (
          p.purchase_number.toLowerCase().includes(q) ||
          p.farmer_name.toLowerCase().includes(q) ||
          p.farmer_mobile.includes(q) ||
          (p.vehicle_number || '').toLowerCase().includes(q)
        );
      }),
    [data.purchases, historySearch]
  );

  return (
    <div className="space-y-6">
      {/* Owner Cutting Rule Confirmation Card (Always accessible & mandatory before first real purchase) */}
      <div
        className={`rounded-2xl p-5 border ${
          !cuttingRuleConfirmed
            ? 'bg-amber-50 border-amber-300'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              {!cuttingRuleConfirmed ? (
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              )}
              <span>
                {lang === 'mr'
                  ? 'व्यावसायिक कपात नियम (Business Cutting Rule Confirmation — 1% vs 2%)'
                  : 'Business Cutting Rule Confirmation (Rule 1: 1% vs Rule 2: 2%)'}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              The owner stated two distinct cutting rules: <strong>Rule 1</strong> is 10 grams per kg
              (<strong>1.0%</strong> = 1 kg per 100 kg), while <strong>Rule 2</strong> is 2 kg per
              100 kg (<strong>2.0%</strong>). These rules are never assumed equivalent.
              {!cuttingRuleConfirmed &&
                ' Please confirm the applicable rule before posting the first real purchase.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setSelectedOwnerRule('RULE_10G_PER_KG');
                  handleSelectCuttingRule('RULE_10G_PER_KG');
                }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  cuttingRuleApplied === 'RULE_10G_PER_KG'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                Rule 1: 10g/kg (1.0%)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedOwnerRule('RULE_2KG_PER_100KG');
                  handleSelectCuttingRule('RULE_2KG_PER_100KG');
                }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  cuttingRuleApplied === 'RULE_2KG_PER_100KG'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                Rule 2: 2kg/100kg (2.0%)
              </button>
              <button
                type="button"
                onClick={() => handleSelectCuttingRule('CUSTOM')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  cuttingRuleApplied === 'CUSTOM'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                Custom Override
              </button>
            </div>

            {isOwner && (
              <button
                type="button"
                disabled={confirmingRule}
                onClick={handleConfirmOwnerCuttingRule}
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap min-h-[40px]"
              >
                {confirmingRule
                  ? 'Confirming...'
                  : cuttingRuleConfirmed
                  ? 'Save as Business Default'
                  : 'Confirm Rule for Business'}
              </button>
            )}
          </div>
        </div>
      </div>

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
            {feedback.type === 'success' && lastPostedPurchaseNumber && (
              <button
                type="button"
                onClick={() => {
                  const found = data.purchases.find(
                    (p) => p.purchase_number === lastPostedPurchaseNumber
                  );
                  if (found) setReceiptPurchase(found);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-white font-semibold hover:bg-emerald-900"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>View / Download / Share Receipt</span>
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

      {recoveredNotice && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-900 flex items-center justify-between">
          <span>
            Unfinished purchase entry recovered automatically after page refresh.
          </span>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(LOCAL_DRAFT_KEY);
              setRecoveredNotice(false);
            }}
            className="font-semibold underline ml-3"
          >
            Clear Draft
          </button>
        </div>
      )}

      {/* Main Purchase Entry Form + Live Calculation Summary Sidebar */}
      {!isViewer && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingDraftId
                    ? lang === 'mr'
                      ? 'ड्राफ्ट खरेदी संपादित करा (Edit Purchase Draft)'
                      : 'Edit Saved Purchase Draft'
                    : lang === 'mr'
                    ? 'शेतकरी माल खरेदी नोंद (New Farmer Purchase Entry)'
                    : 'New Farmer Purchase & Weighbridge Entry'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Save Draft → Review → Post. Separate payable settlement weight from physical stock
                  received.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                  Input Unit:
                </span>
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
            </div>

            {/* Section 1: Date, Location, Commodity, Farmer */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-700">
                01. {lang === 'mr' ? 'शेतकरी, दुकान व शेतमाल माहिती' : 'Farmer, Receiving Shop/Godown & Commodity'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="pur-date" className="block text-xs font-medium text-slate-700 mb-1">
                    {lang === 'mr' ? 'तारीख (Date)' : 'Purchase Date'}
                  </label>
                  <input
                    id="pur-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                  />
                </div>

                <div>
                  <label htmlFor="pur-location" className="block text-xs font-medium text-slate-700 mb-1">
                    {lang === 'mr' ? 'दुकान / गोदाम (Receiving Location)' : 'Receiving Shop / Godown'}
                  </label>
                  <select
                    id="pur-location"
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                  >
                    {data.locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {lang === 'mr' ? loc.name_mr : loc.name_en}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pur-commodity" className="block text-xs font-medium text-slate-700 mb-1">
                    {lang === 'mr' ? 'शेतमाल (Commodity)' : 'Commodity'}
                  </label>
                  <select
                    id="pur-commodity"
                    value={commodityId}
                    onChange={(e) => handleCommodityChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                  >
                    {data.commodities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_en} ({c.name_mr})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 1-Tap Quick Commodity Selector Pills for Mobile Speed */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-500 mr-1">
                  Quick Commodity:
                </span>
                {data.commodities.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleCommodityChange(c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      commodityId === c.id
                        ? 'bg-emerald-900 border-emerald-900 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {c.name_en} ({c.name_mr})
                  </button>
                ))}
              </div>

              {/* Quick Select Existing Farmer Directory or Enter New */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label htmlFor="pur-farmer-select" className="text-xs font-medium text-slate-600">
                    {lang === 'mr'
                      ? 'नोंदणीकृत शेतकरी निवडा किंवा खाली नवीन नाव टाका:'
                      : 'Select Existing Farmer from Directory (or type new below):'}
                  </label>
                  <input
                    type="search"
                    placeholder="Filter directory by name/mobile..."
                    value={farmerSearch}
                    onChange={(e) => setFarmerSearch(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs"
                  />
                </div>
                <select
                  id="pur-farmer-select"
                  value={selectedPartyId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setSelectedPartyId(pid);
                    const found = data.parties.find((p) => p.id === pid);
                    if (found) {
                      setFarmerName(found.name);
                      setFarmerMobile(found.mobile);
                      setFarmerVillage(found.village_or_city || '');
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 min-h-[40px]"
                >
                  <option value="">-- New / Custom Farmer Entry --</option>
                  {farmerParties.map((fp) => (
                    <option key={fp.id} value={fp.id}>
                      {fp.name} · {fp.mobile} ({fp.village_or_city || 'Village'})
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="pur-farmer-name" className="block text-xs font-medium text-slate-700 mb-1">
                      {lang === 'mr' ? 'शेतकरी नाव (Farmer Name) *' : 'Farmer Full Name *'}
                    </label>
                    <input
                      id="pur-farmer-name"
                      type="text"
                      required
                      placeholder="e.g. Balasaheb Shinde"
                      value={farmerName}
                      onChange={(e) => setFarmerName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="pur-farmer-mobile" className="block text-xs font-medium text-slate-700 mb-1">
                      {lang === 'mr' ? 'मोबाईल नंबर (Mobile) *' : 'Mobile Number *'}
                    </label>
                    <input
                      id="pur-farmer-mobile"
                      type="tel"
                      inputMode="numeric"
                      required
                      placeholder="10-digit mobile"
                      value={farmerMobile}
                      onChange={(e) => setFarmerMobile(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="pur-farmer-village" className="block text-xs font-medium text-slate-700 mb-1">
                      {lang === 'mr' ? 'गाव (Village)' : 'Village / Taluka'}
                    </label>
                    <input
                      id="pur-farmer-village"
                      type="text"
                      placeholder="e.g. Shirur Kasar"
                      value={farmerVillage}
                      onChange={(e) => setFarmerVillage(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[44px]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Weighing Mode (Weighbridge Gross - Tare OR Direct Material Weight) */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-slate-700">
                  02. {lang === 'mr' ? 'वजन मोजणी (Weighing Mode)' : 'Material Weight Entry'}
                </h3>
                <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setWeighingMode('weighbridge')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      weighingMode === 'weighbridge'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lang === 'mr'
                      ? 'धर्मकाटा (Gross − Tare)'
                      : 'Weighbridge (Loaded Gross − Empty Tare)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeighingMode('direct')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      weighingMode === 'direct'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lang === 'mr' ? 'थेट वजन (Direct Weight)' : 'Direct Material Weight'}
                  </button>
                </div>
              </div>

              {weighingMode === 'weighbridge' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <label htmlFor="pur-gross" className="block text-xs font-medium text-slate-700 mb-1">
                      Loaded Vehicle Gross ({entryWeightUnit})
                    </label>
                    <input
                      id="pur-gross"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={grossInputVal}
                      onChange={(e) => setGrossInputVal(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono font-semibold min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="pur-tare" className="block text-xs font-medium text-slate-700 mb-1">
                      Empty Vehicle Tare ({entryWeightUnit})
                    </label>
                    <input
                      id="pur-tare"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={tareInputVal}
                      onChange={(e) => setTareInputVal(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono font-semibold min-h-[44px]"
                    />
                  </div>
                  <div className="flex flex-col justify-center rounded-xl bg-white p-3 border border-slate-200">
                    <span className="text-[11px] text-slate-500">Material Input Weight:</span>
                    <span className="font-mono text-base font-bold text-slate-900 mt-0.5">
                      {calc.materialInputKg} kg ({calc.materialInputQuintal} Qtl)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <label htmlFor="pur-direct-wt" className="block text-xs font-medium text-slate-700 mb-1">
                      Direct Material Weight ({entryWeightUnit})
                    </label>
                    <input
                      id="pur-direct-wt"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={directInputVal}
                      onChange={(e) => setDirectInputVal(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono font-semibold min-h-[44px]"
                    />
                  </div>
                  <div className="flex flex-col justify-center rounded-xl bg-white p-3 border border-slate-200">
                    <span className="text-[11px] text-slate-500">Converted Stored Weight (kg & Qtl):</span>
                    <span className="font-mono text-base font-bold text-slate-900 mt-0.5">
                      {calc.materialInputKg} kg ({calc.materialInputQuintal} Qtl)
                    </span>
                  </div>
                </div>
              )}

              {calc.validationErrors.length > 0 && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-800 space-y-1"
                >
                  {calc.validationErrors.map((err, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 3: Deductions (Cutting, Moisture, Dust, Other) with Settlement vs Physical Stock Separation */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-700">
                    03.{' '}
                    {lang === 'mr'
                      ? 'कपात, ओलावा व कचरा वजावट (Deductions: Settlement vs Physical Stock)'
                      : 'Cutting, Moisture, Dust & Other Deductions'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Choose whether each deduction reduces Farmer Payment Only, Physical Stock Only,
                    or Both.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDeductions((prev) => [
                      ...prev,
                      {
                        type: 'other',
                        label: 'Other Deduction / Bardana',
                        mode: 'kg',
                        value: 0,
                        impact: 'settlement_only',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Deduction Line</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {calc.deductionLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                  >
                    <div className="md:col-span-4">
                      <input
                        type="text"
                        aria-label={`Deduction ${idx + 1} label`}
                        value={line.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDeductions((prev) =>
                            prev.map((d, i) => (i === idx ? { ...d, label: val } : d))
                          );
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900"
                      />
                      <div className="text-[11px] text-slate-500 font-mono mt-1">
                        Base: {line.percentageBaseText}
                      </div>
                      {line.type === 'moisture' && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <label className="text-[11px] font-medium text-slate-600">
                            Meter Reading (%):
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min="0"
                            max="40"
                            aria-label="Moisture meter reading percentage"
                            value={deductions[idx]?.moistureReadingPercent ?? 12}
                            onChange={(e) => {
                              const mr = Number(e.target.value || 0);
                              setDeductions((prev) =>
                                prev.map((d, i) =>
                                  i === idx ? { ...d, moistureReadingPercent: mr } : d
                                )
                              );
                            }}
                            className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-mono text-right"
                          />
                          <span className="text-[10px] text-slate-400">
                            (Separate from deduction wt)
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <select
                        aria-label={`Deduction ${idx + 1} mode`}
                        value={line.mode}
                        onChange={(e) => {
                          const mode = e.target.value as 'kg' | 'percent';
                          setDeductions((prev) =>
                            prev.map((d, i) => (i === idx ? { ...d, mode } : d))
                          );
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium"
                      >
                        <option value="percent">% of Material Kg</option>
                        <option value="kg">Fixed kg</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <input
                        type="number"
                        aria-label={`Deduction ${idx + 1} value`}
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={line.value}
                        onChange={(e) => {
                          const v = Number(e.target.value || 0);
                          setDeductions((prev) =>
                            prev.map((d, i) => (i === idx ? { ...d, value: v } : d))
                          );
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-right"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <select
                        aria-label={`Deduction ${idx + 1} impact`}
                        value={line.impact}
                        onChange={(e) => {
                          const imp = e.target.value as DeductionImpact;
                          setDeductions((prev) =>
                            prev.map((d, i) => (i === idx ? { ...d, impact: imp } : d))
                          );
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800"
                      >
                        <option value="settlement_only">
                          Settlement Only (Stock Unchanged)
                        </option>
                        <option value="both">Both Settlement & Physical Stock</option>
                        <option value="physical_only">Physical Stock Loss Only</option>
                      </select>
                    </div>

                    <div className="md:col-span-1 flex justify-end">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDeductions((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1.5 text-slate-400 hover:text-red-600"
                          aria-label={`Remove deduction line ${idx + 1}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 4: Rate, Immediate Payment, and Optional Landed Expense */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-700">
                04. {lang === 'mr' ? 'भाव व शेतकरी पेमेंट (Rate & Immediate Settlement)' : 'Purchase Rate, Payment & Vehicle Details'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="pur-rate" className="block text-xs font-medium text-slate-700 mb-1">
                    {lang === 'mr' ? 'खरेदी दर (Purchase Rate) *' : 'Purchase Rate *'}
                  </label>
                  <input
                    id="pur-rate"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={rateValue}
                    onChange={(e) => setRateValue(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono font-bold min-h-[44px]"
                  />
                </div>

                <div>
                  <label htmlFor="pur-rate-unit" className="block text-xs font-medium text-slate-700 mb-1">
                    Rate Unit (Auto-Converts)
                  </label>
                  <select
                    id="pur-rate-unit"
                    value={rateUnit}
                    onChange={(e) => setRateUnit(e.target.value as RateUnit)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium min-h-[44px]"
                  >
                    <option value="per_quintal">Per Quintal (₹ / 100 kg)</option>
                    <option value="per_kg">Per Kg (₹ / kg)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-center rounded-xl bg-slate-50 p-3 border border-slate-200 font-mono text-xs">
                  <span className="text-slate-500 font-sans">Equivalent Rate:</span>
                  <span className="font-bold text-slate-900 mt-0.5">
                    {formatINR(calc.ratePerQuintal)}/Qtl = {formatINR(calc.ratePerKg)}/kg
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label htmlFor="pur-paid-now" className="block text-xs font-medium text-slate-700 mb-1">
                    Immediate Payment (₹)
                  </label>
                  <input
                    id="pur-paid-now"
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="0"
                    value={immediatePaymentAmount}
                    onChange={(e) => setImmediatePaymentAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-bold min-h-[42px]"
                  />
                  <button
                    type="button"
                    onClick={() => setImmediatePaymentAmount(String(calc.purchaseAmount))}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline mt-1"
                  >
                    Pay Full {formatINR(calc.purchaseAmount)}
                  </button>
                </div>

                <div>
                  <label htmlFor="pur-pay-mode" className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Mode
                  </label>
                  <select
                    id="pur-pay-mode"
                    value={paymentMode}
                    onChange={(e) =>
                      setPaymentMode(
                        e.target.value as 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE'
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium min-h-[42px]"
                  >
                    <option value="CASH">Cash (रोख)</option>
                    <option value="UPI">UPI (Linked to Bank)</option>
                    <option value="BANK_TRANSFER">Bank NEFT / RTGS / IMPS</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="pur-pay-acc" className="block text-xs font-medium text-slate-700 mb-1">
                    Account ({paymentMode === 'CASH' ? 'Cashbox' : 'Bank Account'})
                  </label>
                  <select
                    id="pur-pay-acc"
                    value={paymentAccountId}
                    onChange={(e) => setPaymentAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium min-h-[42px]"
                  >
                    {eligibleAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pur-pay-ref" className="block text-xs font-medium text-slate-700 mb-1">
                    UTR / Voucher Ref
                  </label>
                  <input
                    id="pur-pay-ref"
                    type="text"
                    placeholder="UTR or Slip #"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono min-h-[42px]"
                  />
                </div>
              </div>

              {/* Optional Inbound Landed Cost (Hamali / Inbound Transport) + Vehicle / Weighbridge Slip */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="pur-vehicle" className="block text-xs font-medium text-slate-700 mb-1">
                    Vehicle Number
                  </label>
                  <input
                    id="pur-vehicle"
                    type="text"
                    placeholder="MH-23-AB-4412"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[42px]"
                  />
                </div>
                <div>
                  <label htmlFor="pur-wb-ref" className="block text-xs font-medium text-slate-700 mb-1">
                    Weighbridge Slip #
                  </label>
                  <input
                    id="pur-wb-ref"
                    type="text"
                    placeholder="Kanta Slip #9921"
                    value={weighbridgeSlipRef}
                    onChange={(e) => setWeighbridgeSlipRef(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[42px]"
                  />
                </div>
                <div>
                  <label htmlFor="pur-landed-exp" className="block text-xs font-medium text-slate-700 mb-1">
                    Inbound Hamali/Freight (Landed ₹)
                  </label>
                  <input
                    id="pur-landed-exp"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={landedExpenseAmount}
                    onChange={(e) => setLandedExpenseAmount(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono min-h-[42px]"
                  />
                </div>
                <div>
                  <label htmlFor="pur-remarks" className="block text-xs font-medium text-slate-700 mb-1">
                    Remarks / Quality Note
                  </label>
                  <input
                    id="pur-remarks"
                    type="text"
                    placeholder="Bag count, quality..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs min-h-[42px]"
                  />
                </div>
              </div>
            </div>

            {/* Workflow Buttons: Save Draft -> Review & Post */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSaveOrPost('DRAFT')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px]"
              >
                <Save className="w-4 h-4 text-slate-600" />
                <span>{lang === 'mr' ? 'ड्राफ्ट सेव्ह करा (Save Draft)' : 'Save as Draft'}</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={submitting || calc.validationErrors.length > 0}
                  onClick={() => setReviewModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 shadow-xs min-h-[44px]"
                >
                  <Eye className="w-4 h-4" />
                  <span>
                    {lang === 'mr'
                      ? 'तपासा आणि फायनल पोस्ट करा (Review & Post)'
                      : 'Review & Post Purchase'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Live Calculation Summary Card */}
          <div className="rounded-2xl bg-slate-900 text-white p-5 sm:p-6 space-y-4 sticky top-20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold">
                  {lang === 'mr' ? 'तात्काळ हिशोब (Live Calculation)' : 'Live Settlement & Stock Math'}
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{cuttingRuleApplied}</span>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between text-slate-300">
                <span className="font-sans">Material Input Weight:</span>
                <span className="font-bold text-white">
                  {calc.materialInputKg} kg ({calc.materialInputQuintal} Qtl)
                </span>
              </div>
              <div className="flex justify-between text-amber-300">
                <span className="font-sans">Less: Payable Deductions:</span>
                <span>− {calc.payableDeductionsKg} kg</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span className="font-sans">Less: Physical Stock Deductions:</span>
                <span>− {calc.physicalDeductionsKg} kg</span>
              </div>

              <div className="border-t border-slate-800 pt-2.5 flex justify-between items-baseline">
                <div>
                  <div className="font-sans font-semibold text-emerald-300">
                    Payable Weight (Settlement)
                  </div>
                  <div className="font-sans text-[11px] text-slate-400">
                    material input kg − payable deductions
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-emerald-400">
                    {calc.payableWeightKg} kg
                  </div>
                  <div className="text-[11px] text-slate-400">{calc.payableWeightQuintal} Qtl</div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-2.5 flex justify-between items-baseline">
                <div>
                  <div className="font-sans font-semibold text-blue-300">
                    Actual Physical Stock Received
                  </div>
                  <div className="font-sans text-[11px] text-slate-400">
                    Added to {data.locations.find((l) => l.id === locationId)?.code} inventory
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-blue-300">
                    {calc.physicalStockReceivedKg} kg
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {calc.physicalStockReceivedQuintal} Qtl
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-1.5">
                <div className="flex justify-between text-slate-300">
                  <span className="font-sans">Rate Applied:</span>
                  <span>
                    {formatINR(calc.ratePerKg)}/kg ({formatINR(calc.ratePerQuintal)}/Qtl)
                  </span>
                </div>
                <div className="flex justify-between items-baseline text-sm font-bold text-white pt-1">
                  <span className="font-sans">Purchase Amount (Payable × Rate):</span>
                  <span className="text-lg text-emerald-400">{formatINR(calc.purchaseAmount)}</span>
                </div>
                {calc.landedExpenseAmount > 0 && (
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span className="font-sans">+ Capitalized Inbound Hamali:</span>
                    <span>{formatINR(calc.landedExpenseAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-300 pt-1">
                  <span className="font-sans">Immediate Payment ({paymentMode}):</span>
                  <span>− {formatINR(calc.immediatePaymentAmount)}</span>
                </div>
                <div className="flex justify-between items-baseline text-sm font-bold text-amber-300 pt-1 border-t border-slate-800">
                  <span className="font-sans">Remaining Farmer Balance:</span>
                  <span>{formatINR(calc.remainingFarmerBalance)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review & Confirm Modal before Final Posting */}
      {reviewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-purchase-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl space-y-4">
            <h3 id="review-purchase-title" className="text-base font-bold text-slate-900">
              {lang === 'mr'
                ? 'खरेदी नोंद तपासा व फायनल पोस्ट करा (Review Before Posting)'
                : 'Review Purchase Settlement & Stock Impact Before Posting'}
            </h3>
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Farmer:</span>
                <span className="font-bold text-slate-900">
                  {farmerName || '—'} ({farmerMobile || '—'})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Location & Commodity:</span>
                <span className="font-semibold text-slate-900">
                  {data.locations.find((l) => l.id === locationId)?.name_en} ·{' '}
                  {data.commodities.find((c) => c.id === commodityId)?.name_en}
                </span>
              </div>
              <div className="flex justify-between font-mono pt-2 border-t border-slate-200">
                <span className="font-sans text-slate-600">Material Input Weight:</span>
                <span className="font-bold">{calc.materialInputKg} kg</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="font-sans text-slate-600">Payable Weight (for Farmer Bill):</span>
                <span className="font-bold text-emerald-700">{calc.payableWeightKg} kg</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="font-sans text-slate-600">Physical Stock Added to Inventory:</span>
                <span className="font-bold text-blue-700">{calc.physicalStockReceivedKg} kg</span>
              </div>
              <div className="flex justify-between font-mono pt-2 border-t border-slate-200 text-sm">
                <span className="font-sans font-bold text-slate-900">Total Payable Amount:</span>
                <span className="font-bold text-emerald-700">{formatINR(calc.purchaseAmount)}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="font-sans text-slate-600">Immediate Payment ({paymentMode}):</span>
                <span className="font-bold">{formatINR(calc.immediatePaymentAmount)}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="font-sans text-slate-600">Farmer Balance Payable:</span>
                <span className="font-bold text-amber-700">
                  {formatINR(calc.remainingFarmerBalance)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSaveOrPost('POSTED')}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 min-h-[40px]"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Posting...' : 'Confirm & Post Purchase'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase History & Drafts Register */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'mr'
                ? 'खरेदी रजिस्टर व ड्राफ्ट यादी (Purchase History & Drafts)'
                : 'Purchase History & Saved Drafts'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any posted purchase to print the Weighbridge Patti or perform a controlled
              reversal.
            </p>
          </div>
          <input
            type="search"
            placeholder="Search purchase #, farmer, mobile, vehicle..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        {/* Mobile Searchable Summary Cards (replaces wide table on mobile widths) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredHistory.length === 0 ? (
            <div className="py-8 px-4 text-center text-xs text-slate-500">
              No purchase entries match your search.
            </div>
          ) : (
            filteredHistory.map((pur) => {
              const loc = data.locations.find((l) => l.id === pur.location_id);
              const comm = data.commodities.find((c) => c.id === pur.commodity_id);
              return (
                <div
                  key={pur.id}
                  className={`p-4 space-y-2.5 ${
                    pur.status === 'REVERSED' ? 'opacity-60 bg-slate-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs font-bold text-slate-900">
                        {pur.purchase_number} · {pur.status}
                      </div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                        {pur.farmer_name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {pur.date} · {pur.farmer_mobile} · {loc?.code} · {comm?.name_en}
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div className="text-sm font-bold text-slate-900">
                        {formatINR(pur.purchase_amount)}
                      </div>
                      <div
                        className={`text-[11px] font-semibold ${
                          pur.balance_amount > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {pur.balance_amount > 0
                          ? `Due: ${formatINR(pur.balance_amount)}`
                          : 'Paid'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/80 font-mono">
                    <span>Payable: {formatKg(pur.payable_weight_kg, displayUnit)}</span>
                    <span className="text-blue-800 font-semibold">
                      Stock: {formatKg(pur.physical_stock_received_kg, displayUnit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    {pur.status === 'DRAFT' && !isViewer && (
                      <button
                        type="button"
                        onClick={() => handleLoadDraft(pur)}
                        className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-900 text-xs font-semibold"
                      >
                        Resume Draft
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setReceiptPurchase(pur)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Receipt / Share</span>
                    </button>
                    {pur.status === 'POSTED' && isOwner && (
                      <button
                        type="button"
                        onClick={() => setReversingId(pur.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-red-600"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reverse</span>
                      </button>
                    )}
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
                <th className="py-2.5 px-4 text-left font-semibold">Purchase # / Date</th>
                <th className="py-2.5 px-4 text-left font-semibold">Farmer & Village</th>
                <th className="py-2.5 px-4 text-left font-semibold">Location & Commodity</th>
                <th className="py-2.5 px-4 text-right font-semibold">Payable Wt</th>
                <th className="py-2.5 px-4 text-right font-semibold">Physical Stock Wt</th>
                <th className="py-2.5 px-4 text-right font-semibold">Total / Balance</th>
                <th className="py-2.5 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No purchase entries match your search.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((pur) => {
                  const loc = data.locations.find((l) => l.id === pur.location_id);
                  const comm = data.commodities.find((c) => c.id === pur.commodity_id);
                  return (
                    <tr
                      key={pur.id}
                      className={`hover:bg-slate-50 ${
                        pur.status === 'REVERSED' ? 'opacity-60 bg-slate-50' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-slate-900">{pur.purchase_number}</div>
                        <div className="text-[11px] text-slate-500">
                          {pur.date} · {pur.status}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{pur.farmer_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {pur.farmer_mobile} · {pur.farmer_village || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{loc?.code}</div>
                        <div className="text-[11px] text-slate-500">
                          {comm?.name_en} ({comm?.name_mr})
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-900 tabular-nums">
                        {formatKg(pur.payable_weight_kg, displayUnit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-blue-700 tabular-nums">
                        {formatKg(pur.physical_stock_received_kg, displayUnit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="font-bold text-slate-900">
                          {formatINR(pur.purchase_amount)}
                        </div>
                        <div className="text-[11px] text-amber-700">
                          {pur.balance_amount > 0
                            ? `Bal: ${formatINR(pur.balance_amount)}`
                            : 'Paid'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {pur.status === 'DRAFT' && !isViewer && (
                            <button
                              type="button"
                              onClick={() => handleLoadDraft(pur)}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-900 font-semibold hover:bg-amber-200"
                            >
                              Resume Draft
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setReceiptPurchase(pur)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                            aria-label={`Print receipt for ${pur.purchase_number}`}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {pur.status === 'POSTED' && isOwner && (
                            <button
                              type="button"
                              onClick={() => setReversingId(pur.id)}
                              className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                              aria-label={`Reverse ${pur.purchase_number}`}
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

      {/* Controlled Reversal Modal */}
      {reversingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 border border-slate-200 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Controlled Reversal of Posted Purchase
            </h3>
            <p className="text-xs text-slate-600">
              Posted transactions are never silently deleted. Reversing this purchase will mark it
              REVERSED, deduct the received physical weight from inventory, reverse any immediate
              payment, and record an immutable audit trail entry.
            </p>
            <div>
              <label htmlFor="rev-reason" className="block text-xs font-medium text-slate-700 mb-1">
                Reversal Reason *
              </label>
              <input
                id="rev-reason"
                type="text"
                placeholder="e.g. Wrong weighbridge slip entered"
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
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
                onClick={() => handleReversePurchase(reversingId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptPurchase && (
        <ReceiptModal
          type="purchase"
          purchase={receiptPurchase}
          locations={data.locations}
          commodities={data.commodities}
          lang={lang}
          onClose={() => setReceiptPurchase(null)}
        />
      )}
    </div>
  );
};
