"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Building2, DollarSign, Wrench, LineChart } from "lucide-react";
import { useAnalytics } from "@/contexts/analytics-context";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const analyticsCategories = [
  {
    key: "occupancy",
    title: "Occupancy & Leasing",
    description:
      "Are our units filled with the right residents, and how healthy is the leasing funnel?",
    icon: Building2,
  },
  {
    key: "financial",
    title: "Financial",
    description:
      "Is monthly revenue on track, and where are we leaking dollars through vacancy or collections?",
    icon: DollarSign,
  },
  {
    key: "operations",
    title: "Operational Efficiency",
    description:
      "How fast are turns and maintenance getting done, and where are operations slowing us down?",
    icon: Wrench,
  },
  {
    key: "forecasts",
    title: "Forecasts & Insights",
    description:
      "What’s coming next if we change nothing—and where are the landmines?",
    icon: LineChart,
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

  const handleCategorySelect = (categoryKey: string) => {
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
              className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 hover:border-primary/50"
              onClick={() => handleCategorySelect(category.key)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                    <IconComponent className="h-6 w-6 text-primary" />
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
