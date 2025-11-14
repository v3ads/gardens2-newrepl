import { prisma } from "./prisma";
import { UnifiedAnalytics } from "./unified-analytics";
import { classifyUnit } from "./unit-classification";

interface FinancialMetrics {
  actualMRR: number;
  marketPotential: number;
  vacancyLoss: number;
  arpu: number;
  occupiedUnits: number;
  totalUnits: number;
  vacantUnits: number;
  snapshotDate: string;
  guardrailsPass: boolean;
  guardrailErrors: string[];
  // Family units data (excluded from standard metrics)
  familyUnits?: {
    totalFamilyUnits: number;
    occupiedFamilyUnits: number;
    vacantFamilyUnits: number;
    familyVacancyLoss: number;
    familyActualMRR: number;
    familyMarketPotential: number;
  };
  // New: segmentation by student vs non-student
  studentBreakdown?: {
    student: {
      units: number;
      occupiedUnits: number;
      vacantUnits: number;
      actualMRR: number;
      marketPotential: number;
      vacancyLoss: number;
    };
    nonStudent: {
      units: number;
      occupiedUnits: number;
      vacantUnits: number;
      actualMRR: number;
      marketPotential: number;
      vacancyLoss: number;
    };
  };
  // New: segmentation by model tier
  tierBreakdown?: {
    tier: "basic" | "upgraded" | "premium" | "unknown";
    units: number;
    occupiedUnits: number;
    vacantUnits: number;
    actualMRR: number;
    marketPotential: number;
    vacancyLoss: number;
  }[];
}

// Internal shape for unit-level financial segmentation
interface FinancialUnitRow {
  unit: string;
  tenantStatus: string;
  monthlyRent: number;
  marketRent: number;
  isVacant: boolean;
  isStudentUnit: boolean;
  isFamily: boolean;
  primaryClassification: "market" | "family" | "special_contract";
  isAnalyticsExcluded: boolean;
  modelTier: "basic" | "upgraded" | "premium" | "unknown";
}

export class FinancialAnalytics {
  /**
   * Main entry point used by /api/analytics/financial
   *
   * Core metrics (MRR, market potential, vacancy loss, ARPU, unit counts)
   * are sourced directly from UnifiedAnalytics to preserve existing behavior.
   * Additional segmentation (student vs non-student, tier breakdown) is
   * computed from masterCsvData + classification and attached without
   * altering the main metrics.
   */
  public static async getFinancialMetrics(): Promise<FinancialMetrics> {
    console.log(
      "[FINANCIAL_ANALYTICS] Starting financial metrics computation...",
    );

    // 1) Use UnifiedAnalytics as source of truth for core metrics
    const analytics = await UnifiedAnalytics.getAnalyticsMetrics({
      excludeFamilyUnits: false,
    });

    // snapshotDate from UnifiedAnalytics is a Date, we normalize to ISO string
    const snapshotDateStr =
      analytics.snapshotDate instanceof Date
        ? analytics.snapshotDate.toISOString()
        : String(analytics.snapshotDate);

    const metrics: FinancialMetrics = {
      actualMRR: analytics.actualMRR,
      marketPotential: analytics.marketPotential,
      vacancyLoss: analytics.vacancyLoss,
      arpu: analytics.arpu,
      occupiedUnits: analytics.occupiedUnits,
      totalUnits: analytics.totalUnits,
      vacantUnits: analytics.vacantUnits,
      snapshotDate: snapshotDateStr,
      guardrailsPass: true,
      guardrailErrors: [],
      familyUnits: analytics.familyUnits
        ? {
            totalFamilyUnits: analytics.familyUnits.totalFamilyUnits,
            occupiedFamilyUnits: analytics.familyUnits.occupiedFamilyUnits,
            vacantFamilyUnits: analytics.familyUnits.vacantFamilyUnits,
            familyVacancyLoss: analytics.familyUnits.familyVacancyLoss,
            familyActualMRR: analytics.familyUnits.familyActualMRR,
            familyMarketPotential: analytics.familyUnits.familyMarketPotential,
          }
        : undefined,
    };

    // 2) Compute classification-aware segmentation for deeper insights
    const unitRows = await this.buildFinancialUnitRows();

    metrics.studentBreakdown = this.computeStudentBreakdown(unitRows);
    metrics.tierBreakdown = this.computeTierBreakdown(unitRows);

    // 3) Run simple guardrails to detect obvious anomalies
    this.applyGuardrails(metrics, unitRows);

    console.log("[FINANCIAL_ANALYTICS] ✅ Financial metrics computed:", {
      actualMRR: metrics.actualMRR,
      marketPotential: metrics.marketPotential,
      vacancyLoss: metrics.vacancyLoss,
      arpu: metrics.arpu,
      totalUnits: metrics.totalUnits,
      occupiedUnits: metrics.occupiedUnits,
      vacantUnits: metrics.vacantUnits,
      guardrailsPass: metrics.guardrailsPass,
    });

    return metrics;
  }

  /**
   * Build a normalized per-unit view from masterCsvData using the same
   * vacancy selection rules as UnifiedAnalytics:
   * - Multiple rows per unit possible (status transitions)
   * - We select a single "best" row per unit based on status priority:
   *   Future > Notice > Current > Vacant > Unknown
   * - Unit is vacant ONLY if ALL rows are "Vacant" (no active/future leases)
   * - Family units are ALWAYS considered occupied in financial views
   */
  private static async buildFinancialUnitRows(): Promise<FinancialUnitRow[]> {
    console.log(
      "[FINANCIAL_ANALYTICS] Loading master CSV data for segmentation...",
    );

    const masterData = await prisma.masterCsvData.findMany({
      select: {
        unit: true,
        tenantStatus: true,
        monthlyRent: true,
        marketRent: true,
        unitType: true,
        unitCategory: true,
        tenantType: true,
        daysVacant: true,
      },
    });

    if (!masterData || masterData.length === 0) {
      console.warn(
        "[FINANCIAL_ANALYTICS] No master CSV data found in database",
      );
      return [];
    }

    // Group rows by unit code
    const unitGroups = new Map<string, typeof masterData>();

    for (const record of masterData) {
      if (!unitGroups.has(record.unit)) {
        unitGroups.set(record.unit, []);
      }
      unitGroups.get(record.unit)!.push(record);
    }

    // Status priority: Future/Notice/Current > Vacant > Unknown
    const getStatusPriority = (status: string | null | undefined): number => {
      const s = (status || "").toLowerCase().trim();
      if (s.startsWith("future")) return 4;
      if (s.startsWith("notice")) return 3;
      if (s.startsWith("current")) return 2;
      if (s.startsWith("vacant")) return 1;
      return 0;
    };

    const units: FinancialUnitRow[] = [];

    for (const [unitCode, records] of unitGroups.entries()) {
      // Determine vacancy across all rows for this unit
      const statuses = records.map((r) => (r.tenantStatus || "").toLowerCase());
      const hasVacant = statuses.some((s) => s.startsWith("vacant"));
      const hasNonVacant = statuses.some(
        (s) => s.length > 0 && !s.startsWith("vacant"),
      );

      // SMART vacancy: Vacant only if all rows show Vacant
      let isVacant = hasVacant && !hasNonVacant;

      // Select the "best" row based on status priority
      const selectedRecord = records.reduce((best, current) => {
        const bestPriority = getStatusPriority(best.tenantStatus);
        const currentPriority = getStatusPriority(current.tenantStatus);
        return currentPriority > bestPriority ? current : best;
      });

      // Apply centralized classification
      const classification = classifyUnit({
        unitCode,
        unitType: selectedRecord.unitType,
        marketRent: selectedRecord.marketRent,
        monthlyRent: selectedRecord.monthlyRent,
      });

      // Business rule: Family units are ALWAYS considered occupied
      if (classification.isFamily) {
        isVacant = false;
      }

      const monthlyRent = selectedRecord.monthlyRent || 0;
      const marketRent = selectedRecord.marketRent || 0;

      units.push({
        unit: unitCode,
        tenantStatus: selectedRecord.tenantStatus || "",
        monthlyRent,
        marketRent,
        isVacant,
        isStudentUnit: classification.isStudentUnit,
        isFamily: classification.isFamily,
        primaryClassification: classification.primaryClassification,
        isAnalyticsExcluded: classification.isAnalyticsExcluded,
        modelTier: classification.modelTier,
      });
    }

    console.log(
      "[FINANCIAL_ANALYTICS] Built financial unit rows:",
      units.length,
      "units",
    );

    return units;
  }

  /**
   * Compute student vs non-student breakdown from unit rows.
   * Only includes units that are:
   * - primaryClassification = 'market'
   * - not analytics-excluded
   */
  private static computeStudentBreakdown(
    units: FinancialUnitRow[],
  ): FinancialMetrics["studentBreakdown"] {
    if (!units || units.length === 0) return undefined;

    const eligible = units.filter(
      (u) => u.primaryClassification === "market" && !u.isAnalyticsExcluded,
    );

    const studentUnits = eligible.filter((u) => u.isStudentUnit);
    const nonStudentUnits = eligible.filter((u) => !u.isStudentUnit);

    const aggregate = (subset: FinancialUnitRow[]) => {
      const unitsCount = subset.length;
      const occupied = subset.filter((u) => !u.isVacant).length;
      const vacant = subset.filter((u) => u.isVacant).length;

      const actualMRR = subset
        .filter((u) => !u.isVacant)
        .reduce((sum, u) => sum + u.monthlyRent, 0);

      const marketPotential = subset.reduce((sum, u) => sum + u.marketRent, 0);

      const vacancyLoss =
        marketPotential -
        subset
          .filter((u) => !u.isVacant)
          .reduce((sum, u) => sum + u.marketRent, 0);

      return {
        units: unitsCount,
        occupiedUnits: occupied,
        vacantUnits: vacant,
        actualMRR,
        marketPotential,
        vacancyLoss,
      };
    };

    return {
      student: aggregate(studentUnits),
      nonStudent: aggregate(nonStudentUnits),
    };
  }

  /**
   * Compute segmentation by model tier for market units.
   * Only includes units that are:
   * - primaryClassification = 'market'
   * - not analytics-excluded
   */
  private static computeTierBreakdown(
    units: FinancialUnitRow[],
  ): FinancialMetrics["tierBreakdown"] {
    if (!units || units.length === 0) return undefined;

    const eligible = units.filter(
      (u) => u.primaryClassification === "market" && !u.isAnalyticsExcluded,
    );

    const tiers: ("basic" | "upgraded" | "premium" | "unknown")[] = [
      "basic",
      "upgraded",
      "premium",
      "unknown",
    ];

    const results = tiers.map((tier) => {
      const subset = eligible.filter((u) => u.modelTier === tier);
      const unitsCount = subset.length;
      const occupied = subset.filter((u) => !u.isVacant).length;
      const vacant = subset.filter((u) => u.isVacant).length;

      const actualMRR = subset
        .filter((u) => !u.isVacant)
        .reduce((sum, u) => sum + u.monthlyRent, 0);

      const marketPotential = subset.reduce((sum, u) => sum + u.marketRent, 0);

      const vacancyLoss =
        marketPotential -
        subset
          .filter((u) => !u.isVacant)
          .reduce((sum, u) => sum + u.marketRent, 0);

      return {
        tier,
        units: unitsCount,
        occupiedUnits: occupied,
        vacantUnits: vacant,
        actualMRR,
        marketPotential,
        vacancyLoss,
      };
    });

    return results;
  }

  /**
   * Simple guardrails to catch obvious anomalies.
   * We intentionally keep these lightweight and do NOT try to override
   * UnifiedAnalytics; they are just sanity checks.
   */
  private static applyGuardrails(
    metrics: FinancialMetrics,
    units: FinancialUnitRow[],
  ) {
    const errors: string[] = [];

    // Guardrail 1: total units should match unique units from rows
    const uniqueUnits = new Set(units.map((u) => u.unit));
    if (metrics.totalUnits !== uniqueUnits.size) {
      errors.push(
        `Total units mismatch: metrics.totalUnits=${metrics.totalUnits} vs unique units=${uniqueUnits.size}`,
      );
    }

    // Guardrail 2: totalUnits should equal occupied + vacant from metric
    if (metrics.totalUnits !== metrics.occupiedUnits + metrics.vacantUnits) {
      errors.push(
        `Unit count mismatch: total=${metrics.totalUnits}, occupied=${metrics.occupiedUnits}, vacant=${metrics.vacantUnits}`,
      );
    }

    // Guardrail 3: basic non-negative checks
    if (metrics.actualMRR < 0) {
      errors.push("actualMRR is negative");
    }
    if (metrics.marketPotential < 0) {
      errors.push("marketPotential is negative");
    }
    if (metrics.vacancyLoss < 0) {
      errors.push("vacancyLoss is negative");
    }

    metrics.guardrailsPass = errors.length === 0;
    metrics.guardrailErrors = errors;

    if (metrics.guardrailsPass) {
      console.log("[FINANCIAL_ANALYTICS] ✅ All guardrails passed");
    } else {
      console.log("[FINANCIAL_ANALYTICS] ⚠️ Guardrail failures:", errors);
    }
  }
}
