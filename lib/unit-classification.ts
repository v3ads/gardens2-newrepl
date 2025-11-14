// Centralized unit classification logic for Cynthia Gardens
// This module does NOT modify database state by itself. It provides
// pure functions and constants that other services can use.

export type PrimaryClassification = "market" | "family" | "special_contract";

export type ModelTier = "basic" | "upgraded" | "premium" | "unknown";

export interface UnitClassificationInput {
  // Canonical unit code, e.g. "115", "704", "114 - A"
  unitCode: string;
  // Optional descriptive fields from master CSV / AppFolio
  unitType?: string | null;
  marketRent?: number | null;
  monthlyRent?: number | null;
}

export interface UnitClassification {
  unitCode: string;

  // Core business classification
  primaryClassification: PrimaryClassification;

  // Flags for analytics and pricing systems
  isRentIQExcluded: boolean;
  isAnalyticsExcluded: boolean;
  isStudentUnit: boolean;

  // Physical / product attributes
  isFurnished: boolean;
  modelTier: ModelTier;

  // Convenience flag that mirrors primaryClassification === 'family'
  isFamily: boolean;
}

/**
 * Family units are special, hard-coded business cases:
 * - Always counted in total unit count (182 units)
 * - Treated as always occupied for occupancy views
 * - Excluded from RentIQ pricing pool
 * - Opportunity cost tracked separately (market vs actual)
 *
 * These values are sourced from:
 * - lib/unified-analytics.ts
 * - lib/occupancy-analytics.ts
 * - lib/rentiq-analytics-advanced.DEPRECATED.ts
 */
export const FAMILY_UNIT_CODES: string[] = ["115", "116", "202", "313", "318"];

/**
 * Units explicitly excluded from RentIQ pricing, as defined in:
 * - lib/rentiq-analytics.ts (EXCLUDED_UNITS)
 *
 * These units may or may not be family units, but management has
 * chosen to keep them out of the RentIQ pricing pool.
 */
export const RENTIQ_EXCLUDED_UNIT_CODES: string[] = [
  "704",
  "111",
  "312",
  "410",
  "510",
  "902",
  "311",
];

/**
 * Determine whether a unit is a student unit based on its code.
 *
 * Business rule:
 * - Student units have " - A" or " - B" suffix in the Unit field.
 *   Example: "114 - A", "114 - B"
 */
export function isStudentUnitCode(unitCode: string): boolean {
  const code = (unitCode || "").trim();
  return code.endsWith(" - A") || code.endsWith(" - B");
}

/**
 * Determine furnishing status from unit type.
 *
 * Rules:
 * - " - Furnished" => furnished
 * - "UnFurnished" / "Unfurnished" => unfurnished
 * - We avoid naive "includes('Furnished')" to prevent
 *   misclassifying "UnFurnished" as furnished.
 */
export function deriveFurnishing(unitTypeRaw: string | null | undefined): {
  isFurnished: boolean;
} {
  const unitType = (unitTypeRaw || "").trim().toLowerCase();

  // Most explicit and safe: look for " - furnished"
  if (unitType.includes(" - furnished")) {
    return { isFurnished: true };
  }

  // Handle known variants of "Unfurnished"
  if (unitType.includes("unfurnished")) {
    return { isFurnished: false };
  }

  // Fallback: if we see "furnished" at all, but not "unfurnished"
  if (unitType.includes("furnished") && !unitType.includes("unfurnished")) {
    return { isFurnished: true };
  }

  // Default: treat as unfurnished if unknown
  return { isFurnished: false };
}

/**
 * Derive model tier based on market rent and furnishing status.
 *
 * Business guidance (may evolve, but centralized here):
 * - Unfurnished:
 *   - ~1990–2000      => basic
 *   - ~2020–2120      => upgraded
 *   - >= 2220         => premium
 * - Furnished:
 *   - ~2240           => basic
 *   - mid band (e.g. ~2370, if present) => upgraded
 *   - >= 2570         => premium
 *
 * Student + family units are not used for tier-based pricing decisions,
 * but we still compute a tier for informational purposes where useful.
 */
export function deriveModelTier(
  marketRentRaw: number | null | undefined,
  isFurnished: boolean,
  opts?: { isStudentUnit?: boolean; isFamily?: boolean },
): ModelTier {
  const marketRent =
    marketRentRaw !== null && marketRentRaw !== undefined
      ? Number(marketRentRaw)
      : NaN;

  const isStudent = !!opts?.isStudentUnit;
  const isFamily = !!opts?.isFamily;

  if (!Number.isFinite(marketRent)) {
    return "unknown";
  }

  // We still compute a tier for student/family in case it is useful in
  // descriptive analytics, but pricing logic can choose to ignore it.
  if (!isFurnished) {
    if (marketRent <= 2000) return "basic";
    if (marketRent <= 2120) return "upgraded";
    return "premium";
  } else {
    if (marketRent <= 2240) return "basic";
    if (marketRent < 2570) return "upgraded";
    return "premium";
  }
}

/**
 * Main classification function.
 *
 * Given a unit's basic attributes from master CSV / AppFolio,
 * returns the normalized classification object that other
 * analytics and pricing modules can rely on.
 */
export function classifyUnit(
  input: UnitClassificationInput,
): UnitClassification {
  const unitCode = (input.unitCode || "").trim();

  // Core identity flags based on hard-coded business rules
  const isFamily = FAMILY_UNIT_CODES.includes(unitCode);
  const isStudentUnit = isStudentUnitCode(unitCode);
  const isRentIQExcludedByList = RENTIQ_EXCLUDED_UNIT_CODES.includes(unitCode);

  // Furnishing & rent-derived characteristics
  const { isFurnished } = deriveFurnishing(input.unitType);
  const marketRent =
    input.marketRent !== null && input.marketRent !== undefined
      ? Number(input.marketRent)
      : input.monthlyRent !== null && input.monthlyRent !== undefined
        ? Number(input.monthlyRent)
        : null;

  const modelTier = deriveModelTier(marketRent, isFurnished, {
    isStudentUnit,
    isFamily,
  });

  // Primary classification
  let primaryClassification: PrimaryClassification = "market";
  if (isFamily) {
    primaryClassification = "family";
  }

  // Analytics exclusion: currently no units are globally excluded from analytics.
  // This flag is reserved for future use (e.g. truly anomalous test units).
  const isAnalyticsExcluded = false;

  // RentIQ exclusion logic:
  // - Family units: ALWAYS excluded from RentIQ
  // - Explicit EXCLUDED_UNITS list: ALWAYS excluded
  // - Student units: you chose to exclude ALL student units from RentIQ
  const isRentIQExcluded =
    isFamily || isRentIQExcludedByList || isStudentUnit || isAnalyticsExcluded;

  return {
    unitCode,
    primaryClassification,
    isRentIQExcluded,
    isAnalyticsExcluded,
    isStudentUnit,
    isFurnished,
    modelTier,
    isFamily,
  };
}
