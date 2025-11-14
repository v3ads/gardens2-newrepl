"use client";

import { useRouter } from "next/navigation";

// Ensure this page is properly exported as default
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, DollarSign, Wrench, LineChart } from "lucide-react";
import { useAnalytics } from "@/contexts/analytics-context";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type AnalyticsCategoryKey =
  | "occupancy"
  | "financial"
  | "operations"
  | "forecasts";

interface AnalyticsCategory {
  key: AnalyticsCategoryKey;
  title: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  borderClass: string;
  iconWrapperClass: string;
  iconClass: string;
}

const analyticsCategories: AnalyticsCategory[] = [
  {
    key: "occupancy",
    title: "Occupancy & Leasing",
    description:
      "Are our units filled with the right residents, and how healthy is the leasing funnel?",
    icon: Building2,
    borderClass:
      "border-emerald-500/40 hover:border-emerald-300/80 hover:bg-emerald-950/40",
    iconWrapperClass: "bg-emerald-500/10 border border-emerald-500/40",
    iconClass: "text-emerald-300",
  },
  {
    key: "financial",
    title: "Financial",
    description:
      "Is monthly revenue on track, and where are we leaking dollars through vacancy or collections?",
    icon: DollarSign,
    borderClass:
      "border-lime-500/40 hover:border-lime-300/80 hover:bg-lime-950/40",
    iconWrapperClass: "bg-lime-500/10 border border-lime-500/40",
    iconClass: "text-lime-300",
  },
  {
    key: "operations",
    title: "Operational Efficiency",
    description:
      "How fast are turns and maintenance getting done, and where are operations slowing us down?",
    icon: Wrench,
    borderClass:
      "border-amber-500/40 hover:border-amber-300/80 hover:bg-amber-950/40",
    iconWrapperClass: "bg-amber-500/10 border border-amber-500/40",
    iconClass: "text-amber-300",
  },
  {
    key: "forecasts",
    title: "Forecasts & Insights",
    description:
      "What’s coming next if we change nothing—and where are the landmines?",
    icon: LineChart,
    borderClass:
      "border-sky-500/40 hover:border-sky-300/80 hover:bg-sky-950/40",
    iconWrapperClass: "bg-sky-500/10 border border-sky-500/40",
    iconClass: "text-sky-300",
  },
];

export default function AnalyticsPage() {
  const router = useRouter();
  const { setSelectedCategory } = useAnalytics();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      toast.error("You need to be signed in to view analytics.");
      router.push("/auth/signin");
      return;
    }

    setIsLoading(false);
  }, [session, status, router]);

  const handleCategorySelect = (categoryKey: AnalyticsCategoryKey) => {
    setSelectedCategory(categoryKey);
    router.push(`/analytics/${categoryKey}`);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">
          Loading your analytics dashboard…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <p className="text-muted-foreground">
          Comprehensive insights into property management performance and
          metrics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {analyticsCategories.map((category) => {
          const IconComponent = category.icon;
          return (
            <Card
              key={category.key}
              className={[
                "cursor-pointer transition-all duration-200",
                "hover:shadow-lg hover:scale-[1.02]",
                "bg-background/80 backdrop-blur-sm",
                category.borderClass,
              ].join(" ")}
              onClick={() => handleCategorySelect(category.key)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-2 rounded-lg ${category.iconWrapperClass}`}
                  >
                    <IconComponent
                      className={`h-6 w-6 ${category.iconClass}`}
                    />
                  </div>
                  <CardTitle className="text-lg">{category.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {category.description}
                </CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
