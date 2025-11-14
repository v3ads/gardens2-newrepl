"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Home,
  Building,
  ArrowLeft,
} from "lucide-react";

interface FamilyUnits {
  total_family_units: number;
  family_vacancy_loss: number;
  family_actual_mrr: number;
  family_market_potential: number;
}

interface TierSegment {
  tier: "basic" | "upgraded" | "premium" | "unknown";
  units: number;
  occupied_units: number;
  vacant_units: number;
  actual_mrr: number;
  market_potential: number;
  vacancy_loss: number;
}

interface FinancialMetrics {
  actual_mrr: number;
  market_potential: number;
  vacancy_loss: number;
  arpu: number;
  occupied_units: number;
  total_units: number;
  vacant_units: number;
  snapshot_date: string;
  guardrails_pass: boolean;
  guardrail_errors: string[];
  family_units?: FamilyUnits;
  tier_breakdown?: TierSegment[];
}

export default function FinancialAnalyticsPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<FinancialMetrics>({
    actual_mrr: 0,
    market_potential: 0,
    vacancy_loss: 0,
    arpu: 0,
    occupied_units: 0,
    total_units: 0,
    vacant_units: 0,
    snapshot_date: "",
    guardrails_pass: true,
    guardrail_errors: [],
    family_units: undefined,
    tier_breakdown: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/analytics/financial");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const freshData = await res.json();

      if (!freshData.success || !freshData.metrics) {
        throw new Error(
          freshData.error || "Failed to load financial analytics",
        );
      }

      const m = freshData.metrics;

      const family_units: FamilyUnits | undefined =
        m.family_units || m.familyUnits
          ? {
              total_family_units:
                m.family_units?.total_family_units ??
                m.familyUnits?.totalFamilyUnits ??
                0,
              family_vacancy_loss:
                m.family_units?.family_vacancy_loss ??
                m.familyUnits?.familyVacancyLoss ??
                0,
              family_actual_mrr:
                m.family_units?.family_actual_mrr ??
                m.familyUnits?.familyActualMRR ??
                0,
              family_market_potential:
                m.family_units?.family_market_potential ??
                m.familyUnits?.familyMarketPotential ??
                0,
            }
          : undefined;

      // Tier breakdown: support both camelCase and snake_case
      const tier_breakdown_raw = m.tier_breakdown || m.tierBreakdown || [];

      const tier_breakdown: TierSegment[] = (tier_breakdown_raw || []).map(
        (t: any) => ({
          tier: t.tier ?? "unknown",
          units: t.units ?? 0,
          occupied_units: t.occupiedUnits ?? t.occupied_units ?? 0,
          vacant_units: t.vacantUnits ?? t.vacant_units ?? 0,
          actual_mrr: t.actualMRR ?? t.actual_mrr ?? 0,
          market_potential: t.marketPotential ?? t.market_potential ?? 0,
          vacancy_loss: t.vacancyLoss ?? t.vacancy_loss ?? 0,
        }),
      );

      setMetrics({
        actual_mrr: m.actualMRR ?? m.actual_mrr ?? 0,
        market_potential: m.marketPotential ?? m.market_potential ?? 0,
        vacancy_loss: m.vacancyLoss ?? m.vacancy_loss ?? 0,
        arpu: m.arpu ?? 0,
        occupied_units: m.occupiedUnits ?? m.occupied_units ?? 0,
        total_units: m.totalUnits ?? m.total_units ?? 0,
        vacant_units: m.vacantUnits ?? m.vacant_units ?? 0,
        snapshot_date: m.snapshotDate ?? m.snapshot_date ?? "",
        guardrails_pass: m.guardrailsPass ?? m.guardrails_pass ?? true,
        guardrail_errors: m.guardrailErrors ?? m.guardrail_errors ?? [],
        family_units,
        tier_breakdown,
      });
    } catch (err: any) {
      console.error("[FINANCIAL_PAGE] Error fetching metrics:", err);
      setError(err?.message || "Failed to load financial analytics metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();

    // Auto-refresh every 5 minutes
    const interval = setInterval(
      () => {
        fetchMetrics();
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Financial Analytics</h1>
                <p className="text-sm text-muted-foreground">
                  Loading revenue and vacancy insights…
                </p>
              </div>
            </div>
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-green-500" />
            <p className="text-sm text-muted-foreground">
              Calculating MRR, market potential, and vacancy loss…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Financial Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Unable to load financial metrics.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => fetchMetrics()}>
            Retry
          </Button>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const family = metrics.family_units;

  const hasTierBreakdown =
    (metrics.tier_breakdown?.length || 0) > 0 &&
    (metrics.tier_breakdown || []).some((t) => t.units > 0);

  return (
    <div className="space-y-6">
      {/* Header + Back */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Financial Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Monthly recurring revenue, market potential, and vacancy loss
                for Cynthia Gardens.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!metrics.guardrails_pass && (
              <Badge
                variant="destructive"
                className="flex items-center space-x-1"
              >
                <AlertTriangle className="h-3 w-3" />
                <span>Validation Issues</span>
              </Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              className="flex items-center space-x-2"
              onClick={() => router.push("/analytics")}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Analytics</span>
              <span className="sm:hidden">Back</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Guardrail warnings */}
      {!metrics.guardrails_pass && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-2">
              Data validation issues detected:
            </div>
            <ul className="list-disc pl-4 space-y-1">
              {(metrics.guardrail_errors || []).map((err, idx) => (
                <li key={idx} className="text-sm">
                  {err}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="bg-emerald-950/40 border-emerald-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm text-emerald-200">
              <span>Actual MRR</span>
              <TrendingUp className="h-4 w-4" />
            </CardTitle>
            <CardDescription className="text-xs text-emerald-300/80">
              Current monthly recurring rent collected
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-100">
              {formatCurrency(metrics.actual_mrr)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-sky-950/40 border-sky-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm text-sky-200">
              <span>Market Potential</span>
              <Home className="h-4 w-4" />
            </CardTitle>
            <CardDescription className="text-xs text-sky-300/80">
              Rent if all eligible units were at target rates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-100">
              {formatCurrency(metrics.market_potential)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-rose-950/40 border-rose-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm text-rose-200">
              <span>Vacancy Loss</span>
              <AlertTriangle className="h-4 w-4" />
            </CardTitle>
            <CardDescription className="text-xs text-rose-300/80">
              Rent we’re missing because units are vacant or under-utilized
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-100">
              {formatCurrency(metrics.vacancy_loss)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-950/40 border-purple-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm text-purple-200">
              <span>ARPU</span>
              <Building className="h-4 w-4" />
            </CardTitle>
            <CardDescription className="text-xs text-purple-300/80">
              Average monthly rent per occupied unit
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-100">
              {formatCurrency(metrics.arpu)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Family Units block (if present) */}
      {family && family.total_family_units > 0 && (
        <Card className="border-amber-500/40 bg-amber-950/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-100">
              <Home className="h-5 w-5 text-amber-300" />
              Family Units – Opportunity Cost
            </CardTitle>
            <CardDescription className="text-xs text-amber-200/80">
              These units are always treated as occupied by business rule. This
              panel shows the monthly revenue we choose to give up to keep them
              as family units.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-amber-200/80 text-xs">Family Units</div>
                <div className="text-lg font-semibold text-amber-100">
                  {family.total_family_units}
                </div>
              </div>
              <div>
                <div className="text-amber-200/80 text-xs">
                  Actual Family MRR
                </div>
                <div className="text-lg font-semibold text-amber-100">
                  {formatCurrency(family.family_actual_mrr)}
                </div>
              </div>
              <div>
                <div className="text-amber-200/80 text-xs">
                  Market Potential
                </div>
                <div className="text-lg font-semibold text-amber-100">
                  {formatCurrency(family.family_market_potential)}
                </div>
              </div>
              <div>
                <div className="text-amber-200/80 text-xs">
                  Monthly Opportunity Cost
                </div>
                <div className="text-lg font-semibold text-amber-100">
                  {formatCurrency(family.family_vacancy_loss)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier Breakdown (basic / upgraded / premium / unknown) */}
      {hasTierBreakdown && (
        <Card className="bg-muted/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <span>Revenue by Tier</span>
            </CardTitle>
            <CardDescription className="text-xs">
              How different unit tiers contribute to MRR, market potential, and
              vacancy loss.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="py-2 pr-3 text-left">Tier</th>
                    <th className="py-2 px-3 text-right">Units</th>
                    <th className="py-2 px-3 text-right">Occupied</th>
                    <th className="py-2 px-3 text-right">Vacant</th>
                    <th className="py-2 px-3 text-right">Actual MRR</th>
                    <th className="py-2 px-3 text-right">Market Potential</th>
                    <th className="py-2 pl-3 text-right">Vacancy Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics.tier_breakdown || []).map((tier) => {
                    const label =
                      tier.tier === "basic"
                        ? "Basic"
                        : tier.tier === "upgraded"
                          ? "Upgraded"
                          : tier.tier === "premium"
                            ? "Premium"
                            : "Unknown";
                    const rowBg =
                      tier.tier === "basic"
                        ? "bg-emerald-500/5"
                        : tier.tier === "upgraded"
                          ? "bg-sky-500/5"
                          : tier.tier === "premium"
                            ? "bg-purple-500/5"
                            : "bg-muted/10";

                    return (
                      <tr
                        key={tier.tier}
                        className={`${rowBg} border-b border-border/40`}
                      >
                        <td className="py-2 pr-3 font-medium">{label}</td>
                        <td className="py-2 px-3 text-right">{tier.units}</td>
                        <td className="py-2 px-3 text-right">
                          {tier.occupied_units}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {tier.vacant_units}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {formatCurrency(tier.actual_mrr)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {formatCurrency(tier.market_potential)}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          {formatCurrency(tier.vacancy_loss)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formula footnote */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="font-medium text-foreground mb-3">
              Metric Definitions:
            </div>

            <div>
              <span className="font-medium text-emerald-700">Actual MRR</span>{" "}
              is the monthly rent being collected from all occupied,
              rent-bearing units.
            </div>

            <div>
              <span className="font-medium text-sky-700">Market Potential</span>{" "}
              is the total rent we could collect if all eligible units were
              leased at target market rates.
            </div>

            <div>
              <span className="font-medium text-orange-700">Vacancy Loss</span>{" "}
              is the amount of monthly rent we are missing because some units
              are vacant or under-utilized.
            </div>

            <div>
              <span className="font-medium text-purple-700">
                ARPU (Average Revenue Per Unit)
              </span>{" "}
              is the average monthly rent paid by each occupied unit.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
