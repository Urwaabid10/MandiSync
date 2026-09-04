/**
 * Munshi Accounting Utility Functions
 *
 * All formulas implement zero-safe COALESCE defaults and non-negative
 * bounds to prevent invalid financial calculations.
 */

// ---------------------------------------------------------------------------
// Input shape for settlement calculations
// ---------------------------------------------------------------------------
export interface SettlementInput {
  kacchi_bikri: number;
  gattu_count: number;
  peti_count: number;
  gaadi_rent: number;
  hospitality_cost: number;
  num_labors?: number;
}

// ---------------------------------------------------------------------------
// Result of Munshi calculation
// ---------------------------------------------------------------------------
export interface SettlementResult {
  kacchi_bikri: number;
  labor_fee: number;
  gross_commission: number;
  pakhta_bikri: number;
  market_fee: number;
  net_commission: number;
  gaadi_rent: number;
  hospitality_cost: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed piece-rate per gattu (large container) */
const GATTU_LABOR_RATE = 20;

/** Fixed piece-rate per peti (small container) */
const PETI_LABOR_RATE = 8;

/** Arthi commission rate (6%) */
const COMMISSION_RATE = 0.06;

/** Market fee per container (Rs. 2) */
const MARKET_FEE_PER_CONTAINER = 2;

// ---------------------------------------------------------------------------
// Individual formula functions
// ---------------------------------------------------------------------------

/**
 * labor_fee = (gattu_count * 20) + (peti_count * 8)
 * Fixed piece-rate per container type.
 */
export function calculateLaborFee(
  gattuCount: number | null | undefined,
  petiCount: number | null | undefined
): number {
  const gattu = gattuCount ?? 0;
  const peti = petiCount ?? 0;
  return gattu * GATTU_LABOR_RATE + peti * PETI_LABOR_RATE;
}

/**
 * gross_commission = kacchi_bikri * 0.06
 * 6% Arthi commission on raw sale amount.
 */
export function calculateGrossCommission(
  kacchiBikri: number | null | undefined
): number {
  const bikri = kacchiBikri ?? 0;
  return bikri * COMMISSION_RATE;
}

/**
 * pakhta_bikri = MAX(0, kacchi_bikri - (gross_commission + labor_fee + gaadi_rent))
 * Net Farmer Payout -- guaranteed non-negative.
 */
export function calculatePakhtaBikri(
  kacchiBikri: number | null | undefined,
  grossCommission: number,
  laborFee: number,
  gaadiRent: number | null | undefined
): number {
  const bikri = kacchiBikri ?? 0;
  const rent = gaadiRent ?? 0;
  return Math.max(0, bikri - (grossCommission + laborFee + rent));
}

/**
 * market_fee = (gattu_count + peti_count) * 2
 * Rs. 2 per container regardless of type.
 */
export function calculateMarketFee(
  gattuCount: number | null | undefined,
  petiCount: number | null | undefined
): number {
  const gattu = gattuCount ?? 0;
  const peti = petiCount ?? 0;
  return (gattu + peti) * MARKET_FEE_PER_CONTAINER;
}

/**
 * net_commission = gross_commission - (hospitality_cost + market_fee)
 * Net commission retained by the Arthi after expenses.
 */
export function calculateNetCommission(
  grossCommission: number,
  hospitalityCost: number | null | undefined,
  marketFee: number
): number {
  const hospitality = hospitalityCost ?? 0;
  return grossCommission - (hospitality + marketFee);
}

// ---------------------------------------------------------------------------
// Full settlement computation (single entry point)
// ---------------------------------------------------------------------------

/**
 * Computes all Munshi settlement fields from raw input values.
 * All nullable/undefined inputs are coerced to 0.
 */
export function computeSettlement(input: SettlementInput): SettlementResult {
  const kacchi_bikri = input.kacchi_bikri ?? 0;
  const gaadi_rent = input.gaadi_rent ?? 0;
  const hospitality_cost = input.hospitality_cost ?? 0;

  const labor_fee = calculateLaborFee(input.gattu_count, input.peti_count);
  const gross_commission = calculateGrossCommission(kacchi_bikri);
  const pakhta_bikri = calculatePakhtaBikri(
    kacchi_bikri,
    gross_commission,
    labor_fee,
    gaadi_rent
  );
  const market_fee = calculateMarketFee(input.gattu_count, input.peti_count);
  const net_commission = calculateNetCommission(
    gross_commission,
    hospitality_cost,
    market_fee
  );

  return {
    kacchi_bikri,
    labor_fee,
    gross_commission,
    pakhta_bikri,
    market_fee,
    net_commission,
    gaadi_rent,
    hospitality_cost,
  };
}

// ---------------------------------------------------------------------------
// Monthly shop expense computation
// ---------------------------------------------------------------------------

export interface MonthlyExpenseInput {
  rent_amount: number | null | undefined;
  electricity_bill: number | null | undefined;
  munshi_salary: number | null | undefined;
  other_allowances: number | null | undefined;
}

/**
 * total_monthly_expense = rent + electricity + munshi_salary + other_allowances
 * All fields zero-safe via COALESCE.
 */
export function computeMonthlyExpense(input: MonthlyExpenseInput): number {
  return (
    (input.rent_amount ?? 0) +
    (input.electricity_bill ?? 0) +
    (input.munshi_salary ?? 0) +
    (input.other_allowances ?? 0)
  );
}
