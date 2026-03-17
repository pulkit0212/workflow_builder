"use client";

import Link from "next/link";
import type { Route } from "next";
import { UserButton } from "@clerk/nextjs";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  Briefcase,
  Building2,
  CheckCircle2,
  FileSearch2,
  Layers3,
  Mail,
  PlayCircle,
  Sparkles,
  Users,
  Workflow
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { allTools } from "@/lib/ai/tool-registry";
import { hasClerkPublishableKey } from "@/lib/auth/clerk-env";

const signInRoute = "/sign-in" as Route;
const signUpRoute = "/sign-up" as Route;
const dashboardRoute = "/dashboard" as Route;
const dashboardToolsRoute = "/dashboard/tools" as Route;
const meetingSummarizerRoute = "/dashboard/tools/meeting-summarizer" as Route;

type MarketingNavItem =
  | {
      label: string;
      href: `#${string}`;
      kind: "anchor";
    }
  | {
      label: string;
      href: Route;
      kind: "route";
    };

const navItems: MarketingNavItem[] = [
  { label: "Features", href: "#features", kind: "anchor" },
  { label: "Tools", href: "#tools", kind: "anchor" },
  { label: "Pricing", href: "#pricing", kind: "anchor" },
  { label: "Docs", href: dashboardToolsRoute, kind: "route" }
];

const trustedCompanies = ["Northstar", "Polygon", "Arcwell", "Cascade", "Aptly", "Lattice"];

const features = [
  {
    icon: BrainCircuit,
    title: "AI Meeting Summaries",
    description: "Capture fast, structured summaries with key decisions and follow-up actions."
  },
  {
    icon: Mail,
    title: "Smart Email Generation",
    description: "Draft polished replies, follow-ups, and outbound emails from simple context."
  },
  {
    icon: FileSearch2,
    title: "Document Intelligence",
    description: "Extract useful insights from proposals, briefs, notes, and supporting files."
  },
  {
    icon: Workflow,
    title: "AI Task Planning",
    description: "Turn unstructured updates into task lists, owners, and next-step workflows."
  }
] as const;

const steps = [
  {
    title: "Choose a tool",
    description: "Start with the workflow that matches the job to be done."
  },
  {
    title: "Provide input",
    description: "Paste transcripts, prompts, or documents and keep the process lightweight."
  },
  {
    title: "Get AI results instantly",
    description: "Receive structured outputs built for execution rather than generic text blobs."
  }
] as const;

const useCases = [
  { title: "Founders", icon: Briefcase, description: "Compress meetings, investor updates, and planning into action-ready summaries." },
  { title: "Freelancers", icon: Sparkles, description: "Move from notes to deliverables faster without manual cleanup." },
  { title: "Consultants", icon: Layers3, description: "Package calls, documents, and recommendations into client-ready outputs." },
  { title: "Recruiters", icon: Users, description: "Summarize interviews, outreach threads, and hiring signals with less admin work." },
  { title: "Product teams", icon: Building2, description: "Convert syncs, specs, and customer feedback into aligned next steps." }
] as const;

type PricingPlan = {
  name: string;
  price: string;
  description: string;
  features: string[];
  featured: boolean;
};

const pricing: PricingPlan[] = [
  {
    name: "Free",
    price: "$0",
    description: "For exploring AI workflows and lightweight personal usage.",
    features: ["1 workspace", "Basic summaries", "History access"],
    featured: false
  },
  {
    name: "Pro",
    price: "$29",
    description: "For operators and knowledge workers automating daily execution.",
    features: ["Advanced usage", "Priority processing", "Longer workflow history"],
    featured: true
  },
  {
    name: "Business",
    price: "$99",
    description: "For teams standardizing AI workflows across functions.",
    features: ["Shared workspaces", "Admin controls", "Usage visibility"],
    featured: false
  }
];

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 }
};

function SectionHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">{eyebrow}</p>
      <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      <p className="text-base leading-8 text-slate-400">{description}</p>
    </div>
  );
}

function StatusBadge({ label, available }: { label: string; available: boolean }) {
  return (
    <span
      className={
        available
          ? "rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300"
          : "rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300"
      }
    >
      {label}
    </span>
  );
}

function PreviewPanel() {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
      className="relative mx-auto w-full max-w-[640px]"
    >
      <div className="absolute -left-12 top-10 h-40 w-40 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="absolute -right-8 bottom-8 h-44 w-44 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-3 shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="rounded-[1.6rem] border border-white/10 bg-[#07111f] p-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-medium text-white">Workflow Command Center</p>
              <p className="mt-1 text-sm text-slate-400">Meeting Summarizer active</p>
            </div>
            <StatusBadge label="Live" available />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-300">Transcript Input</p>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">1,284 chars</p>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    "Q2 planning review with product and growth teams...",
                    "Decision: ship onboarding experiment first...",
                    "Action: Maya to finalize messaging by Friday..."
                  ].map((line) => (
                    <div key={line} className="h-4 rounded-full bg-white/8">
                      <div className="h-4 rounded-full bg-gradient-to-r from-cyan-400/50 to-transparent" style={{ width: `${40 + line.length % 55}%` }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-slate-400">Summary Quality</p>
                  <p className="mt-3 text-3xl font-semibold text-white">94%</p>
                  <p className="mt-2 text-sm text-emerald-300">Structured output ready</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-slate-400">Actions Extracted</p>
                  <p className="mt-3 text-3xl font-semibold text-white">7</p>
                  <p className="mt-2 text-sm text-cyan-300">Owners and deadlines mapped</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl border border-cyan-400/15 bg-cyan-400/8 p-4">
                <p className="text-sm font-medium text-white">Executive Summary</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  The team aligned on onboarding optimization, narrowed the launch sequence, and assigned owners for messaging, analytics, and QA.
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-medium text-white">Action Items</p>
                <div className="mt-3 space-y-3">
                  {[
                    "Finalize landing page messaging",
                    "Ship analytics dashboard update",
                    "Review onboarding QA checklist"
                  ].map((item, index) => (
                    <div key={item} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <p className="text-sm text-slate-200">{item}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">Owner {index + 1}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

type LandingPageProps = {
  isAuthenticated: boolean;
};

export function LandingPage({ isAuthenticated }: LandingPageProps) {
  const primaryHeroRoute = isAuthenticated ? dashboardRoute : signUpRoute;
  const primaryHeroLabel = isAuthenticated ? "Open Dashboard" : "Start Free";
  const ctaPrimaryRoute = isAuthenticated ? dashboardRoute : signUpRoute;
  const ctaPrimaryLabel = isAuthenticated ? "Go to Dashboard" : "Get Started Free";

  return (
    <main className="min-h-screen bg-[#030712] text-white">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-12%] top-0 h-[32rem] w-[32rem] rounded-full bg-cyan-500/14 blur-[150px]" />
        <div className="absolute right-[-8%] top-24 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/12 blur-[140px]" />
        <div className="absolute inset-x-0 top-0 h-[720px] bg-[linear-gradient(to_bottom,rgba(15,23,42,0.28),transparent)]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1440px] px-6 py-4 lg:px-10">
          <div className="flex items-center justify-between gap-6">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-bold text-slate-950">
                AI
              </span>
              <span>
                <span className="block text-sm font-semibold uppercase tracking-[0.28em] text-white">Workflow Builder</span>
                <span className="block text-xs text-slate-400">AI productivity platform</span>
              </span>
            </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => (
              item.kind === "route" ? (
                <Link key={item.label} href={item.href} className="text-sm text-slate-300 transition hover:text-white">
                  {item.label}
                </Link>
              ) : (
                <a key={item.label} href={item.href} className="text-sm text-slate-300 transition hover:text-white">
                  {item.label}
                </a>
              )
            ))}
          </nav>
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <Button asChild className="bg-white text-slate-950 shadow-none hover:bg-cyan-100">
                    <Link href={dashboardRoute}>Dashboard</Link>
                  </Button>
                  {hasClerkPublishableKey ? <UserButton afterSignOutUrl="/" /> : null}
                </>
              ) : (
                <>
                  <Button asChild variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">
                    <Link href={signInRoute}>Sign in</Link>
                  </Button>
                  <Button
                    asChild
                    className="bg-white text-slate-950 shadow-none hover:bg-cyan-100"
                  >
                    <Link href={signUpRoute}>Get Started</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
          <nav className="no-scrollbar mt-4 flex gap-3 overflow-x-auto md:hidden">
            {navItems.map((item) => (
              item.kind === "route" ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  {item.label}
                </a>
              )
            ))}
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden px-6 pb-24 pt-14 sm:pt-20 lg:px-10 lg:pb-32">
        <div className="mx-auto grid w-full max-w-[1440px] gap-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(540px,0.95fr)] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-3 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
              <Sparkles className="h-4 w-4" />
              Modern AI workflow operating system
            </div>
            <div className="space-y-6">
              <h1 className="max-w-5xl font-display text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl xl:text-7xl">
                Turn Meetings, Emails, and Documents Into Actionable Workflows with AI
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-400">
                AI Workflow Builder helps professionals compress busywork into structured outputs, from meeting recaps and follow-up emails to document intelligence and task planning.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className="bg-white text-slate-950 hover:bg-cyan-100">
                <Link href={primaryHeroRoute}>
                  {primaryHeroLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              >
                <Link href={meetingSummarizerRoute}>
                  <PlayCircle className="h-4 w-4" />
                  Watch Demo
                </Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                "Structured AI outputs",
                "Shared workflow history",
                "Built for professional teams"
              ].map((item) => (
                <div key={item} className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-cyan-300" />
                    <span>{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
          <PreviewPanel />
        </div>
      </section>

      <section className="border-y border-white/8 bg-white/[0.02] px-6 py-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Trusted by teams building faster operations</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {trustedCompanies.map((company) => (
              <div key={company} className="rounded-full border border-white/8 bg-white/5 px-5 py-3 text-center text-sm font-medium text-slate-300">
                {company}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="px-6 py-24 lg:px-10">
        <div className="mx-auto w-full max-w-[1440px] space-y-12">
          <SectionHeading
            eyebrow="Features"
            title="Purpose-built AI layers for everyday execution"
            description="The platform is designed to produce useful business outputs instead of generic raw text, with clean structure and consistent workflows across tools."
          />
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.55, ease: "easeOut", delay: index * 0.06 }}
                className="group rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:border-cyan-400/25 hover:bg-white/[0.06]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/12 text-cyan-300">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="tools" className="px-6 py-24 lg:px-10">
        <div className="mx-auto w-full max-w-[1440px] space-y-12">
          <SectionHeading
            eyebrow="Tools"
            title="A growing stack of focused AI workflow modules"
            description="Launch with Meeting Summarizer today and expand into adjacent workflows without changing the overall product model."
          />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {allTools.map((tool, index) => {
              const available = tool.status === "available";

              return (
                <motion.div
                  key={tool.slug}
                  variants={fadeInUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.55, ease: "easeOut", delay: index * 0.05 }}
                  className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/8 text-slate-100">
                      <tool.icon className="h-6 w-6" />
                    </div>
                    <StatusBadge label={available ? "Available" : "Coming Soon"} available={available} />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-white">{tool.name}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{tool.description}</p>
                  <Button
                    asChild
                    variant="ghost"
                    className="mt-6 px-0 text-white hover:bg-transparent hover:text-cyan-300"
                  >
                    <Link href={tool.route as Route}>
                      {available ? "Open tool" : "Preview module"}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="px-6 py-24 lg:px-10">
        <div className="mx-auto grid w-full max-w-[1440px] gap-10 xl:grid-cols-[0.85fr_1.15fr]">
          <SectionHeading
            eyebrow="How It Works"
            title="From raw input to useful output in three steps"
            description="The workflow stays simple for end users while the platform handles summarization, structure, and repeatability in the background."
          />
          <div className="grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.08 }}
                className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-6"
              >
                <div className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">0{index + 1}</div>
                <h3 className="mt-5 text-xl font-semibold text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-10">
        <div className="mx-auto w-full max-w-[1440px] space-y-12">
          <SectionHeading
            eyebrow="Use Cases"
            title="Built for professionals who need leverage, not just AI novelty"
            description="AI Workflow Builder fits teams and solo operators who spend too much time turning conversations and documents into next steps."
          />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
            {useCases.map((useCase, index) => (
              <motion.div
                key={useCase.title}
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.05 }}
                className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"
              >
                <useCase.icon className="h-6 w-6 text-cyan-300" />
                <h3 className="mt-5 text-lg font-semibold text-white">{useCase.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{useCase.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="px-6 py-24 lg:px-10">
        <div className="mx-auto w-full max-w-[1440px] space-y-12">
          <SectionHeading
            eyebrow="Pricing"
            title="Simple pricing for teams adopting AI workflows"
            description="Start with a lightweight free tier and expand into professional and team usage as the workflow volume grows."
          />
          <div className="grid gap-6 xl:grid-cols-3">
            {pricing.map((plan, index) => (
              <motion.div
                key={plan.name}
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.55, ease: "easeOut", delay: index * 0.06 }}
                className={
                  plan.featured
                    ? "rounded-[2rem] border border-cyan-400/30 bg-gradient-to-b from-cyan-400/10 to-white/[0.03] p-6 shadow-[0_20px_80px_rgba(6,182,212,0.12)]"
                    : "rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"
                }
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold text-white">{plan.name}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-400">{plan.description}</p>
                  </div>
                  {plan.featured ? <StatusBadge label="Popular" available /> : null}
                </div>
                <div className="mt-8 text-5xl font-semibold text-white">
                  {plan.price}
                  <span className="ml-2 text-base font-normal text-slate-500">/mo</span>
                </div>
                <div className="mt-8 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-slate-300">
                      {feature}
                    </div>
                  ))}
                </div>
                <Button
                  asChild
                  size="lg"
                  className={
                    plan.featured
                      ? "mt-8 w-full bg-white text-slate-950 hover:bg-cyan-100"
                      : "mt-8 w-full border border-white/12 bg-white/5 text-white hover:bg-white/10"
                  }
                >
                  <Link href={signUpRoute}>{plan.name === "Business" ? "Talk to Sales" : "Start Free"}</Link>
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-10">
        <div className="mx-auto w-full max-w-[1440px]">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.45 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-8 py-12 sm:px-10 lg:px-14 lg:py-16"
          >
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Start now</p>
                <h2 className="max-w-3xl font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Replace manual busywork with AI workflows your team can actually use.
                </h2>
                <p className="max-w-2xl text-base leading-8 text-slate-300">
                  Launch Meeting Summarizer today and expand into email, documents, and task planning from the same platform.
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Button asChild size="lg" className="bg-white text-slate-950 hover:bg-cyan-100">
                  <Link href={ctaPrimaryRoute}>
                    {ctaPrimaryLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                {isAuthenticated ? (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  >
                    <Link href={dashboardToolsRoute}>Browse Tools</Link>
                  </Button>
                ) : (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  >
                    <Link href={signInRoute}>Sign In</Link>
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-white/8 px-6 py-12 lg:px-10" id="footer">
        <div className="mx-auto grid w-full max-w-[1440px] gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-bold text-slate-950">
                AI
              </span>
              <span className="text-sm font-semibold uppercase tracking-[0.24em] text-white">Workflow Builder</span>
            </Link>
            <p className="max-w-sm text-sm leading-7 text-slate-400">
              A modern AI productivity platform for turning meetings, emails, and documents into structured workflows.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Product</p>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <a href="#features" className="block transition hover:text-white">Features</a>
              <a href="#tools" className="block transition hover:text-white">Tools</a>
              <a href="#pricing" className="block transition hover:text-white">Pricing</a>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Company</p>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <Link href={signInRoute} className="block transition hover:text-white">Sign In</Link>
              <Link href={signUpRoute} className="block transition hover:text-white">Get Started</Link>
              <Link href={dashboardRoute} className="block transition hover:text-white">Platform</Link>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Social</p>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <span className="block">X / Twitter</span>
              <span className="block">LinkedIn</span>
              <span className="block">GitHub</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
