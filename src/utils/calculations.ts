export type WeightUnit = 'kg' | 'quintal';
export type RateUnit = 'per_kg' | 'per_quintal';
export type CuttingRuleCode = 'RULE_10G_PER_KG' | 'RULE_2KG_PER_100KG' | 'CUSTOM';
export type DeductionMode = 'kg' | 'percent';
export type DeductionImpact = 'settlement_only' | 'both' | 'physical_only';
export type ExpenseClassification = 'operating_expense' | 'landed_cost';

export interface DeductionLineInput {
  type: 'cutting' | 'moisture' | 'dust' | 'other';
  label: string;
  mode: DeductionMode;
  value: number; // Either kg or percentage (0-100)
  impact: DeductionImpact;
  moistureReadingPercent?: number; // Informational meter reading kept separate from weight deduction
}

export interface CalculatedDeductionLine extends DeductionLineInput {
  deductionKg: number;
  percentageOfGross: number;
  percentageBaseText: string;
  reducesPayable: boolean;
  reducesPhysicalStock: boolean;
}

export interface PurchaseCalculationInput {
  weighingMode: 'direct' | 'weighbridge';
  directWeightKg?: number;
  grossWeightKg?: number;
  tareWeightKg?: number;
  deductions: DeductionLineInput[];
  rateValue: number;
  rateUnit: RateUnit;
  immediatePaymentAmount?: number;
  landedExpenseAmount?: number; // Inbound transport/hamali capitalized into inventory
}

export interface PurchaseCalculationResult {
  materialInputKg: number;
  materialInputQuintal: number;
  deductionLines: CalculatedDeductionLine[];
  payableDeductionsKg: number;
  physicalDeductionsKg: number;
  payableWeightKg: number;
  payableWeightQuintal: number;
  physicalStockReceivedKg: number;
  physicalStockReceivedQuintal: number;
  ratePerKg: number;
  ratePerQuintal: number;
  purchaseAmount: number;
  landedExpenseAmount: number;
  totalInventoryCarryingValue: number;
  effectiveInventoryCostPerKg: number;
  immediatePaymentAmount: number;
  remainingFarmerBalance: number;
  settlementVsPhysicalDiffKg: number;
  isInvalidTareRelationship: boolean;
  isExcessiveDeduction: boolean;
  validationErrors: string[];
}

export interface SaleCalculationInput {
  dispatchedKg: number;
  billableKg: number;
  sellingRateValue: number;
  sellingRateUnit: RateUnit;
  immediateCollectionAmount?: number;
  currentLocationAvgCostPerKg: number;
  currentLocationStockKg: number;
}

export interface SaleCalculationResult {
  dispatchedKg: number;
  dispatchedQuintal: number;
  billableKg: number;
  billableQuintal: number;
  weightDifferenceKg: number;
  requiresWeightDiffExplanation: boolean;
  sellingRatePerKg: number;
  sellingRatePerQuintal: number;
  saleAmount: number;
  costOfGoodsSold: number;
  grossProfit: number;
  immediateCollectionAmount: number;
  balanceReceivable: number;
  remainingStockKg: number;
  hasSufficientStock: boolean;
}

export interface StockValuationState {
  qtyKg: number;
  totalValue: number;
  avgCostPerKg: number;
}

export interface PaymentAllocationCheckInput {
  paymentAmount: number;
  allocations: Array<{
    docType: 'purchase' | 'sale' | 'expense';
    docId: string;
    docNumber: string;
    amount: number;
    openBalance?: number;
  }>;
}

export interface PaymentAllocationCheckResult {
  valid: boolean;
  totalAllocated: number;
  unallocatedAdvance: number;
  errors: string[];
}

/**
 * Exact decimal rounding helpers:
 * - round2: INR monetary totals (2 decimals)
 * - round3: Weights in kg (3 decimals)
 * - round4: Quintal display (4 decimals)
 * - round6: Internal unit rates & moving weighted-average cost per kg (6 decimals)
 */
export function round2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function round3(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 1000) / 1000;
}

export function round4(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
}

export function round6(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 1000000) / 1000000;
}

export function quintalToKg(quintals: number): number {
  return round3(quintals * 100);
}

export function kgToQuintal(kg: number): number {
  return round4(kg / 100);
}

export function convertRateToPerKg(rateValue: number, rateUnit: RateUnit): number {
  if (rateUnit === 'per_quintal') {
    return round6(rateValue / 100);
  }
  return round6(rateValue);
}

export function convertRateToPerQuintal(rateValue: number, rateUnit: RateUnit): number {
  if (rateUnit === 'per_kg') {
    return round2(rateValue * 100);
  }
  return round2(rateValue);
}

/**
 * Returns the exact percentage for the two owner-specified cutting rules:
 * 1. RULE_10G_PER_KG: 10 grams per kg = 1% (1.0 kg per 100 kg)
 * 2. RULE_2KG_PER_100KG: 2 kg per 100 kg = 2% (2.0 kg per 100 kg)
 * Never silently equates them.
 */
export function getCuttingRulePercent(rule: CuttingRuleCode, customPercent = 0): number {
  if (rule === 'RULE_10G_PER_KG') return 1.0;
  if (rule === 'RULE_2KG_PER_100KG') return 2.0;
  return Math.max(0, round3(customPercent));
}

export function getCuttingRuleDescription(rule: CuttingRuleCode, customPercent = 0): {
  en: string;
  mr: string;
  percent: number;
} {
  if (rule === 'RULE_10G_PER_KG') {
    return {
      en: 'Rule 1: 10 grams per kg (1.0% = 1 kg per 100 kg)',
      mr: 'नियम १: १० ग्रॅम प्रति किलो (१.०% = १ किलो प्रति क्विंटल)',
      percent: 1.0,
    };
  }
  if (rule === 'RULE_2KG_PER_100KG') {
    return {
      en: 'Rule 2: 2 kg per 100 kg / quintal (2.0% = 20g/kg)',
      mr: 'नियम २: २ किलो प्रति १०० किलो / क्विंटल (२.०%)',
      percent: 2.0,
    };
  }
  return {
    en: `Custom Override (${customPercent}% of gross material weight)`,
    mr: `विशेष सूट/कपात (${customPercent}% एकूण मालावर)`,
    percent: customPercent,
  };
}

/**
 * Calculates purchase settlement weight, physical stock weight, total payable amount,
 * and remaining farmer balance, plus strict validation invariants.
 */
export function calculatePurchase(input: PurchaseCalculationInput): PurchaseCalculationResult {
  const validationErrors: string[] = [];
  let materialInputKg = 0;
  let isInvalidTareRelationship = false;

  if (input.weighingMode === 'weighbridge') {
    const gross = Number(input.grossWeightKg ?? 0);
    const tare = Number(input.tareWeightKg ?? 0);
    if (gross < 0 || tare < 0) {
      validationErrors.push('Gross and tare weights cannot be negative.');
    }
    if (tare >= gross && gross > 0) {
      isInvalidTareRelationship = true;
      validationErrors.push(
        `Invalid weighbridge weights: Empty tare (${tare} kg) cannot be greater than or equal to loaded gross (${gross} kg).`
      );
    }
    materialInputKg = isInvalidTareRelationship ? 0 : round3(Math.max(0, gross - tare));
  } else {
    const direct = Number(input.directWeightKg ?? 0);
    if (direct < 0) {
      validationErrors.push('Direct material weight cannot be negative.');
    }
    materialInputKg = round3(Math.max(0, direct));
  }

  // Prevent entering the same core deduction type (cutting, moisture, dust) in both kg and % simultaneously
  const seenCoreTypes = new Map<string, DeductionMode>();
  for (const d of input.deductions) {
    if (d.type !== 'other' && (d.value || 0) > 0) {
      const prevMode = seenCoreTypes.get(d.type);
      if (prevMode && prevMode !== d.mode) {
        validationErrors.push(
          `Duplicate '${d.type}' deduction entered in both ${prevMode} and ${d.mode}. Use one unit per deduction type.`
        );
      }
      seenCoreTypes.set(d.type, d.mode);
    }
  }

  const deductionLines: CalculatedDeductionLine[] = input.deductions.map((d) => {
    const cleanVal = Math.max(0, d.value || 0);
    let deductionKg = 0;
    let percentageOfGross = 0;

    if (d.mode === 'percent') {
      percentageOfGross = round3(cleanVal);
      deductionKg = round3((materialInputKg * percentageOfGross) / 100);
    } else {
      deductionKg = round3(cleanVal);
      percentageOfGross = materialInputKg > 0 ? round3((deductionKg / materialInputKg) * 100) : 0;
    }

    const percentageBaseText =
      d.mode === 'percent'
        ? `${percentageOfGross}% of ${materialInputKg} kg pre-deduction commodity weight = ${deductionKg} kg`
        : `${deductionKg} kg fixed (${percentageOfGross}% of ${materialInputKg} kg pre-deduction commodity weight)`;

    return {
      ...d,
      value: cleanVal,
      deductionKg,
      percentageOfGross,
      percentageBaseText,
      reducesPayable: d.impact === 'settlement_only' || d.impact === 'both',
      reducesPhysicalStock: d.impact === 'physical_only' || d.impact === 'both',
    };
  });

  const payableDeductionsKg = round3(
    deductionLines.filter((d) => d.reducesPayable).reduce((sum, d) => sum + d.deductionKg, 0)
  );
  const physicalDeductionsKg = round3(
    deductionLines.filter((d) => d.reducesPhysicalStock).reduce((sum, d) => sum + d.deductionKg, 0)
  );

  let isExcessiveDeduction = false;
  if (
    materialInputKg > 0 &&
    (payableDeductionsKg >= materialInputKg || physicalDeductionsKg >= materialInputKg)
  ) {
    isExcessiveDeduction = true;
    validationErrors.push(
      `Deductions (${Math.max(
        payableDeductionsKg,
        physicalDeductionsKg
      )} kg) cannot equal or exceed pre-deduction commodity weight (${materialInputKg} kg).`
    );
  }

  const rawPayableWeight = round3(materialInputKg - payableDeductionsKg);
  const rawPhysicalWeight = round3(materialInputKg - physicalDeductionsKg);

  const payableWeightKg = Math.max(0, rawPayableWeight);
  const physicalStockReceivedKg = Math.max(0, rawPhysicalWeight);

  const ratePerKg = convertRateToPerKg(Math.max(0, input.rateValue || 0), input.rateUnit);
  const ratePerQuintal = convertRateToPerQuintal(Math.max(0, input.rateValue || 0), input.rateUnit);

  const purchaseAmount = round2(payableWeightKg * ratePerKg);
  const landedExpenseAmount = round2(Math.max(0, input.landedExpenseAmount ?? 0));
  const totalInventoryCarryingValue = round2(purchaseAmount + landedExpenseAmount);
  const effectiveInventoryCostPerKg =
    physicalStockReceivedKg > 0 ? round6(totalInventoryCarryingValue / physicalStockReceivedKg) : 0;

  const immediatePaymentAmount = round2(Math.max(0, input.immediatePaymentAmount ?? 0));
  const remainingFarmerBalance = round2(purchaseAmount - immediatePaymentAmount);

  return {
    materialInputKg,
    materialInputQuintal: kgToQuintal(materialInputKg),
    deductionLines,
    payableDeductionsKg,
    physicalDeductionsKg,
    payableWeightKg,
    payableWeightQuintal: kgToQuintal(payableWeightKg),
    physicalStockReceivedKg,
    physicalStockReceivedQuintal: kgToQuintal(physicalStockReceivedKg),
    ratePerKg,
    ratePerQuintal,
    purchaseAmount,
    landedExpenseAmount,
    totalInventoryCarryingValue,
    effectiveInventoryCostPerKg,
    immediatePaymentAmount,
    remainingFarmerBalance,
    settlementVsPhysicalDiffKg: round3(physicalStockReceivedKg - payableWeightKg),
    isInvalidTareRelationship,
    isExcessiveDeduction,
    validationErrors,
  };
}

/**
 * Calculates sales dispatch, billable revenue, weighted-average COGS, and gross profit.
 */
export function calculateSale(input: SaleCalculationInput): SaleCalculationResult {
  const dispatchedKg = round3(Math.max(0, input.dispatchedKg || 0));
  const billableKg = round3(Math.max(0, input.billableKg || 0));
  const weightDifferenceKg = round3(billableKg - dispatchedKg);
  const requiresWeightDiffExplanation = Math.abs(weightDifferenceKg) > 0.001;

  const sellingRatePerKg = convertRateToPerKg(
    Math.max(0, input.sellingRateValue || 0),
    input.sellingRateUnit
  );
  const sellingRatePerQuintal = convertRateToPerQuintal(
    Math.max(0, input.sellingRateValue || 0),
    input.sellingRateUnit
  );

  const saleAmount = round2(billableKg * sellingRatePerKg);
  const avgCost = Math.max(0, input.currentLocationAvgCostPerKg || 0);
  const costOfGoodsSold = round2(dispatchedKg * avgCost);
  const grossProfit = round2(saleAmount - costOfGoodsSold);

  const immediateCollectionAmount = round2(Math.max(0, input.immediateCollectionAmount ?? 0));
  const balanceReceivable = round2(saleAmount - immediateCollectionAmount);

  const availableKg = round3(input.currentLocationStockKg || 0);
  const hasSufficientStock = dispatchedKg <= availableKg + 0.0001;
  const remainingStockKg = round3(Math.max(0, availableKg - dispatchedKg));

  return {
    dispatchedKg,
    dispatchedQuintal: kgToQuintal(dispatchedKg),
    billableKg,
    billableQuintal: kgToQuintal(billableKg),
    weightDifferenceKg,
    requiresWeightDiffExplanation,
    sellingRatePerKg,
    sellingRatePerQuintal,
    saleAmount,
    costOfGoodsSold,
    grossProfit,
    immediateCollectionAmount,
    balanceReceivable,
    remainingStockKg,
    hasSufficientStock,
  };
}

/**
 * Updates moving weighted-average stock state when adding stock (purchase, opening stock, inbound transfer).
 * Uses high-precision internal costing (round6) while rounding carrying value display to 2 decimals.
 */
export function applyStockAddition(
  current: StockValuationState,
  addedKg: number,
  addedCarryingValue: number
): StockValuationState {
  const cleanAddedKg = round3(Math.max(0, addedKg));
  const cleanAddedVal = round2(Math.max(0, addedCarryingValue));
  const newQtyKg = round3(current.qtyKg + cleanAddedKg);
  const newTotalValue = round2(current.totalValue + cleanAddedVal);

  // Preserve higher internal precision for weighted-average cost per kg
  const exactPriorValue =
    current.qtyKg > 0 && current.avgCostPerKg > 0
      ? current.qtyKg * current.avgCostPerKg
      : current.totalValue;
  const exactNewValue = exactPriorValue + cleanAddedVal;
  const newAvgCostPerKg = newQtyKg > 0 ? round6(exactNewValue / newQtyKg) : 0;

  return {
    qtyKg: newQtyKg,
    totalValue: newTotalValue,
    avgCostPerKg: newAvgCostPerKg,
  };
}

/**
 * Updates moving weighted-average stock state when removing stock (sale dispatch, outbound transfer, loss).
 */
export function applyStockReduction(
  current: StockValuationState,
  removedKg: number
): {
  nextState: StockValuationState;
  removedCarryingValue: number;
} {
  const cleanRemovedKg = round3(Math.max(0, removedKg));
  if (cleanRemovedKg > current.qtyKg + 0.001) {
    throw new Error(
      `Insufficient stock: requested ${cleanRemovedKg} kg, available ${current.qtyKg} kg`
    );
  }
  const newQtyKg = round3(Math.max(0, current.qtyKg - cleanRemovedKg));
  const removedCarryingValue =
    newQtyKg === 0 ? round2(current.totalValue) : round2(cleanRemovedKg * current.avgCostPerKg);
  const newTotalValue = round2(Math.max(0, current.totalValue - removedCarryingValue));
  const newAvgCostPerKg = newQtyKg > 0 ? current.avgCostPerKg : 0;

  return {
    nextState: {
      qtyKg: newQtyKg,
      totalValue: newTotalValue,
      avgCostPerKg: newAvgCostPerKg,
    },
    removedCarryingValue,
  };
}

/**
 * Transfers stock from source location to destination location preserving carrying cost,
 * with zero sales revenue and zero profit generated.
 */
export function applyStockTransfer(
  source: StockValuationState,
  destination: StockValuationState,
  transferKg: number
): {
  nextSource: StockValuationState;
  nextDestination: StockValuationState;
  transferredCarryingValue: number;
  transferUnitCostPerKg: number;
} {
  const { nextState: nextSource, removedCarryingValue } = applyStockReduction(source, transferKg);
  const nextDestination = applyStockAddition(destination, transferKg, removedCarryingValue);
  return {
    nextSource,
    nextDestination,
    transferredCarryingValue: removedCarryingValue,
    transferUnitCostPerKg: source.avgCostPerKg,
  };
}

/**
 * Validates payment allocations to prevent over-allocation above the payment amount
 * or above any target document's open balance. Excess unallocated payment becomes an explicit advance.
 */
export function validatePaymentAllocations(
  input: PaymentAllocationCheckInput
): PaymentAllocationCheckResult {
  const errors: string[] = [];
  const payAmt = round2(Math.max(0, input.paymentAmount || 0));
  if (payAmt <= 0) {
    errors.push('Payment amount must be greater than zero.');
  }

  let totalAllocated = 0;
  for (const alloc of input.allocations) {
    const a = round2(Number(alloc.amount || 0));
    if (a < 0) {
      errors.push(`Negative allocation (${a}) is not allowed on ${alloc.docNumber}.`);
    }
    if (typeof alloc.openBalance === 'number' && a > round2(alloc.openBalance) + 0.009) {
      errors.push(
        `Allocation of ₹${a} exceeds open balance of ₹${round2(alloc.openBalance)} on ${
          alloc.docNumber
        }.`
      );
    }
    totalAllocated = round2(totalAllocated + a);
  }

  if (totalAllocated > payAmt + 0.009) {
    errors.push(
      `Total allocated amount (₹${totalAllocated}) exceeds available payment amount (₹${payAmt}). Over-allocation is prevented.`
    );
  }

  const unallocatedAdvance = round2(Math.max(0, payAmt - totalAllocated));

  return {
    valid: errors.length === 0,
    totalAllocated,
    unallocatedAdvance,
    errors,
  };
}

/**
 * Calculates overall trading profit ensuring expenses classified as 'landed_cost'
 * are NOT double-counted in operating expenses.
 */
export function calculateProfitSummary(params: {
  totalSalesRevenue: number;
  totalCOGS: number;
  expenses: Array<{ amount: number; classification: ExpenseClassification }>;
}): {
  grossProfit: number;
  operatingExpenses: number;
  capitalizedLandedCosts: number;
  estimatedNetTradingProfit: number;
} {
  const grossProfit = round2(params.totalSalesRevenue - params.totalCOGS);
  const operatingExpenses = round2(
    params.expenses
      .filter((e) => e.classification === 'operating_expense')
      .reduce((sum, e) => sum + e.amount, 0)
  );
  const capitalizedLandedCosts = round2(
    params.expenses
      .filter((e) => e.classification === 'landed_cost')
      .reduce((sum, e) => sum + e.amount, 0)
  );
  const estimatedNetTradingProfit = round2(grossProfit - operatingExpenses);

  return {
    grossProfit,
    operatingExpenses,
    capitalizedLandedCosts,
    estimatedNetTradingProfit,
  };
}
