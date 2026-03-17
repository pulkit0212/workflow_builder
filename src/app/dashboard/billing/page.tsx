import { SectionHeader } from "@/components/shared/section-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type PricingPlan = {
  name: string;
  price: string;
  description: string;
  features: string[];
  featured: boolean;
};

const plans: PricingPlan[] = [
  {
    name: "Free",
    price: "$0",
    description: "For exploring the workspace foundation and light AI usage.",
    features: ["1 active workspace", "Basic run history", "Community support"],
    featured: false,
  },
  {
    name: "Pro",
    price: "$29",
    description: "For individual operators using multiple workflow tools.",
    features: ["Higher usage limits", "Advanced history access", "Priority support"],
    featured: true,
  },
  {
    name: "Business",
    price: "$99",
    description: "For teams standardizing internal AI workflows.",
    features: ["Team workspaces", "Usage controls", "Shared governance"],
    featured: false,
  },
];

export default function BillingPage() {
  return (
      <div className="space-y-8">
        <SectionHeader
            eyebrow="Billing"
            title="Plans designed for scale"
            description="Placeholder pricing UI for the future subscription layer. The data model can later connect plan entitlements to usage and feature access."
        />
        <div className="grid gap-6 xl:grid-cols-3">
          {plans.map((plan) => (
              <Card
                  key={plan.name}
                  className={
                    plan.featured
                        ? "border-sky-200 bg-gradient-to-b from-sky-50 to-white p-6"
                        : "p-6"
                  }
              >
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-950">{plan.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{plan.description}</p>
                    </div>
                    {plan.featured ? <Badge variant="available">Popular</Badge> : null}
                  </div>

                  <div className="text-4xl font-semibold text-slate-950">
                    {plan.price}
                    <span className="text-base font-normal text-slate-500">/mo</span>
                  </div>

                  <div className="space-y-3">
                    {plan.features.map((feature) => (
                        <div
                            key={feature}
                            className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
                        >
                          {feature}
                        </div>
                    ))}
                  </div>
                </div>
              </Card>
          ))}
        </div>
      </div>
  );
}