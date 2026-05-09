"use client";

import Link from "next/link";
import type { Route } from "next";
import { UserButton } from "@clerk/nextjs";
import { useRef, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calendar,
  Check,
  History as HistoryIcon,
  LayoutDashboard,
  Link2,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasClerkPublishableKey } from "@/lib/auth/clerk-env";
import { allTools } from "@/lib/ai/tool-registry";
import { planDefinitions } from "@/lib/subscription";

const signInRoute = "/sign-in" as Route;
const signUpRoute = "/sign-up" as Route;
const dashboardRoute = "/dashboard" as Route;

const ACCENT = "#6C3FF5";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

function AnimatedSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-48px" });
  return (
    <motion.div
      ref={ref}
      variants={stagger}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Wide editorial shell — uses horizontal space like a real marketing site, not a skinny column */
function Shell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`mx-auto w-full max-w-[1600px] px-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
}) {
  const hasDesc = description != null && description !== "";
  return (
    <div className="mb-12 grid gap-6 lg:mb-16 lg:grid-cols-12 lg:items-end lg:gap-x-10 lg:gap-y-0">
      <div className={`text-left ${hasDesc ? "lg:col-span-5" : "lg:col-span-12 lg:max-w-3xl"}`}>
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-600">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      </div>
      {hasDesc ? (
        <div className="text-left text-base leading-relaxed text-slate-600 lg:col-span-6 lg:col-start-7">
          {description}
        </div>
      ) : null}
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
    >
      {children}
    </a>
  );
}

function Navbar({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <Shell className="flex h-14 items-center justify-between gap-4 sm:h-16">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
              style={{ background: ACCENT }}
            >
              A
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">Artivaa AI</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <NavLink href="#product">Product</NavLink>
            <NavLink href="#tools">AI tools</NavLink>
            <NavLink href="#integrations">Integrations</NavLink>
            <NavLink href="#pricing">Pricing</NavLink>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {isAuthenticated ? (
            <>
              <Button asChild size="sm" className="rounded-lg font-semibold shadow-sm" style={{ background: ACCENT }}>
                <Link href={dashboardRoute} className="text-white hover:opacity-95">
                  Dashboard
                </Link>
              </Button>
              {hasClerkPublishableKey && <UserButton afterSignOutUrl="/" />}
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="font-medium text-slate-600">
                <Link href={signInRoute}>Log in</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="rounded-lg font-semibold shadow-sm shadow-violet-200/80"
                style={{ background: ACCENT }}
              >
                <Link href={signUpRoute} className="text-white hover:opacity-95">
                  Get started
                </Link>
              </Button>
            </>
          )}
        </div>
      </Shell>
    </header>
  );
}

/** Decorative dashboard preview aligned with real sidebar labels */
function ProductPreview() {
  const sidebar = [
    { icon: LayoutDashboard, label: "Dashboard", active: false },
    { icon: Calendar, label: "Meetings", active: true },
    { icon: BarChart3, label: "Reports", active: false },
    { icon: Check, label: "Action Items", active: false },
    { icon: HistoryIcon, label: "History", active: false },
    { icon: Link2, label: "Integrations", active: false },
    { icon: Sparkles, label: "Tools", active: false },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_24px_80px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/5">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/90 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
        </div>
        <div className="mx-auto flex max-w-[220px] flex-1 items-center rounded-md border border-slate-200/80 bg-white px-3 py-1 text-[11px] text-slate-400">
          artivaa.ai/dashboard/meetings
        </div>
      </div>
      <div className="flex min-h-[280px] bg-[#f8f9fb] sm:min-h-[320px]">
        <aside className="hidden w-[148px] shrink-0 border-r border-slate-200/80 bg-white py-3 pl-2 pr-1 sm:block">
          {sidebar.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={`mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                active ? "bg-violet-50 text-violet-700" : "text-slate-500"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2} />
              <span className="truncate">{label}</span>
            </div>
          ))}
        </aside>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { k: "This month", v: "—", c: "text-slate-800" },
              { k: "Summaries", v: "AI", c: "text-emerald-600" },
              { k: "Actions", v: "Sync", c: "text-amber-600" },
              { k: "Tools", v: "4", c: "text-violet-600" },
            ].map((x) => (
              <div key={x.k} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{x.k}</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${x.c}`}>{x.v}</p>
              </div>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  Google Meet
                </span>
                <span className="text-[10px] text-slate-400">Today · 3:00 PM</span>
              </div>
              <p className="text-sm font-semibold text-slate-800">Weekly planning</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Summary · Key decisions · Action items ready to save
              </p>
              <div
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold text-white"
                style={{ background: ACCENT }}
              >
                <Bot className="h-3.5 w-3.5" />
                AI summary & actions
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tools</p>
              <ul className="mt-3 space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                  Meeting Summarizer
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Email · Document · Tasks
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const WORKPLACE_ICONS: Record<string, string> = {
  "Google Meet": "videocam",
  "Microsoft Teams": "groups",
  Zoom: "video_call",
  Slack: "chat",
  Notion: "article",
  Jira: "bug_report",
  Gmail: "mail",
  "Google Calendar": "calendar_month",
};

export function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const primaryRoute = isAuthenticated ? dashboardRoute : signUpRoute;
  const freePlan = planDefinitions.free;
  const proPlan = planDefinitions.pro;
  const elitePlan = planDefinitions.elite;

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 antialiased">
      <Navbar isAuthenticated={isAuthenticated} />

      <main className="pt-14 sm:pt-16">
        {/* Hero — asymmetric grid + bleed so it doesn’t feel like a centered card */}
        <section className="relative overflow-hidden border-b border-slate-200/60 bg-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.55]"
            style={{
              backgroundImage: `radial-gradient(ellipse 120% 80% at 0% 0%, rgba(108,63,245,0.11) 0%, transparent 55%),
                radial-gradient(ellipse 90% 70% at 100% 15%, rgba(99,102,241,0.08) 0%, transparent 50%),
                radial-gradient(ellipse 60% 40% at 70% 100%, rgba(139,92,246,0.06) 0%, transparent 45%)`,
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.45]"
            style={{
              backgroundImage: `linear-gradient(to right, rgb(148 163 184 / 0.06) 1px, transparent 1px),
                linear-gradient(to bottom, rgb(148 163 184 / 0.06) 1px, transparent 1px)`,
              backgroundSize: "44px 44px",
              maskImage: "linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
            }}
          />
          <Shell className="relative grid items-center gap-12 py-14 lg:grid-cols-12 lg:gap-10 lg:py-[4.5rem] xl:gap-14">
            <motion.div variants={stagger} initial="hidden" animate="visible" className="text-left lg:col-span-5 xl:col-span-5">
              <motion.p
                variants={fadeUp}
                className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
              >
                <Zap className="h-3.5 w-3.5 text-violet-600" />
                Meetings + AI tools in one workspace
              </motion.p>
              <motion.h1
                variants={fadeUp}
                className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]"
              >
                From live meetings to{" "}
                <span className="bg-gradient-to-r from-violet-600 to-violet-500 bg-clip-text text-transparent">
                  summaries
                </span>
                , tasks, and follow-ups
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-5 max-w-none text-base leading-relaxed text-slate-600 sm:max-w-xl sm:text-lg lg:max-w-lg">
                Artivaa captures your meetings, runs structured AI summaries, extracts action items, and gives you four
                productivity tools—Email, Document Analyzer, Task Generator, and Meeting Summarizer—with optional sharing
                to Slack, Gmail, Notion, and Jira.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-xl px-7 text-base font-semibold shadow-lg shadow-violet-300/40"
                  style={{ background: ACCENT }}
                >
                  <Link href={primaryRoute} className="text-white hover:opacity-95">
                    {isAuthenticated ? "Open app" : "Create free account"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-12 rounded-xl border-slate-200 px-6 font-semibold">
                  <a href="#tools">Explore tools</a>
                </Button>
              </motion.div>
              <motion.ul variants={fadeUp} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                  {freePlan.limits.meetingsPerMonth} meeting previews / month on Free
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                  Unlimited AI tools on Free
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                  No credit card to start
                </li>
              </motion.ul>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="relative mt-12 min-w-0 lg:col-span-7 lg:mt-0 xl:col-span-7"
            >
              <div
                className="pointer-events-none absolute -right-8 -top-10 hidden h-64 w-64 rounded-full bg-violet-400/20 blur-3xl lg:block xl:-right-4 xl:h-80 xl:w-80"
                aria-hidden
              />
              <div className="relative translate-x-0 lg:translate-x-2 xl:translate-x-6 2xl:translate-x-10">
                <ProductPreview />
              </div>
            </motion.div>
          </Shell>

          {/* Integrations strip — edge-to-edge row, not a centered cluster */}
          <div className="border-t border-slate-100 bg-slate-50/90 py-10 lg:py-12">
            <Shell className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
              <p className="max-w-[220px] text-left text-xs font-semibold uppercase leading-snug tracking-widest text-slate-500">
                Connects with tools you already use
              </p>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-x-6 gap-y-6 sm:gap-x-8 lg:justify-end xl:justify-between xl:gap-x-4">
                {Object.entries(WORKPLACE_ICONS).map(([name, icon]) => (
                  <div key={name} className="flex flex-col gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/90 bg-white shadow-sm sm:h-12 sm:w-12">
                      <span className="material-symbols-outlined text-[20px] text-slate-700 sm:text-[22px]">{icon}</span>
                    </div>
                    <span className="max-w-[92px] text-[10px] font-medium leading-tight text-slate-500 sm:text-[11px]">{name}</span>
                  </div>
                ))}
              </div>
            </Shell>
          </div>
        </section>

        {/* Product pillars */}
        <section id="product" className="scroll-mt-20 border-b border-slate-200/60 bg-[#fafafa] py-16 lg:py-24">
          <Shell>
            <AnimatedSection>
              <motion.div variants={fadeUp}>
                <SectionHeader
                  eyebrow="Product"
                  title="Built around how you actually work"
                  description="Calendar-linked meetings, structured AI summaries, a dedicated action-items workflow, run history on Pro and Elite, and shared workspaces when your team needs one source of truth."
                />
              </motion.div>
              <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
                {[
                  {
                    title: "Meetings & assistant",
                    desc: "Schedule and join from Google Calendar, capture transcripts, and generate structured summaries with decisions and risks.",
                    icon: Calendar,
                  },
                  {
                    title: "Action pipeline",
                    desc: "Promote AI suggestions into trackable action items, assign owners and dates, and keep them scoped to your workspace.",
                    icon: Check,
                  },
                  {
                    title: "Team-ready",
                    desc: "Elite unlocks shared workspaces, invites, and role-aware access so leadership and ICs stay aligned.",
                    icon: Users,
                  },
                ].map(({ title, desc, icon: Icon }) => (
                  <motion.div
                    key={title}
                    variants={fadeUp}
                    className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm ring-1 ring-slate-900/5"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>
          </Shell>
        </section>

        {/* AI Tools — from registry */}
        <section id="tools" className="scroll-mt-20 border-b border-slate-200/60 bg-white py-16 lg:py-24">
          <Shell>
            <AnimatedSection>
              <motion.div variants={fadeUp}>
                <SectionHeader
                  eyebrow="AI tools"
                  title="Four tools, one workspace shell"
                  description="Same navigation, history, and sharing patterns across Meeting Summarizer, Email Generator, Document Analyzer, and Task Generator—so nothing feels like a separate product bolted on."
                />
              </motion.div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-12 lg:gap-6">
                {allTools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <motion.div
                      key={tool.slug}
                      variants={fadeUp}
                      className="group flex gap-4 rounded-2xl border border-slate-200/90 bg-[#fafafa] p-5 transition-colors hover:border-violet-200 hover:bg-white sm:p-6 lg:col-span-6"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
                        <Icon className="h-6 w-6 text-violet-600" strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900">{tool.name}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{tool.description}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </AnimatedSection>
          </Shell>
        </section>

        {/* How it works */}
        <section id="features" className="scroll-mt-20 border-b border-slate-200/60 bg-[#fafafa] py-16 lg:py-24">
          <Shell>
            <AnimatedSection>
              <motion.div variants={fadeUp}>
                <SectionHeader
                  eyebrow="Workflow"
                  title="Capture → understand → ship"
                  description="A straight line from conversation to structured output—without bouncing between five different AI tabs."
                />
              </motion.div>
              <div className="grid gap-10 border-t border-slate-200/80 pt-12 md:grid-cols-3 md:gap-8 lg:gap-12 lg:pt-14">
                {[
                  {
                    step: "01",
                    title: "Connect & meet",
                    body: "Link calendar and conferencing flows. Join or upload audio where supported; transcripts feed the same summary pipeline.",
                  },
                  {
                    step: "02",
                    title: "Summarize with structure",
                    body: "Get summaries, key points, decisions, and risks—not a wall of text. Tune sharing targets per integration.",
                  },
                  {
                    step: "03",
                    title: "Act & automate",
                    body: "Save action items, run the task and email tools on supporting plans, and revisit past runs from History.",
                  },
                ].map((s, i) => (
                  <motion.div key={s.step} variants={fadeUp} className={`relative text-left ${i < 2 ? "md:border-r md:border-slate-200/80 md:pr-8" : ""}`}>
                    <span className="text-xs font-bold tabular-nums text-violet-600">{s.step}</span>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>
          </Shell>
        </section>

        {/* Integrations */}
        <section id="integrations" className="scroll-mt-20 border-b border-slate-200/60 bg-white py-16 lg:py-24">
          <Shell>
            <AnimatedSection>
              <motion.div variants={fadeUp}>
                <SectionHeader
                  eyebrow="Integrations"
                  title="Share outcomes where your team lives"
                  description={
                    <>
                      Push summaries and action items to{" "}
                      <strong className="font-medium text-slate-800">Slack</strong>,{" "}
                      <strong className="font-medium text-slate-800">Gmail</strong>,{" "}
                      <strong className="font-medium text-slate-800">Notion</strong>, and{" "}
                      <strong className="font-medium text-slate-800">Jira</strong>
                      —wired from your dashboard after sign-in.
                    </>
                  }
                />
              </motion.div>
              <motion.div variants={fadeUp} className="flex flex-wrap justify-start gap-3 lg:justify-end">
                {[
                  { name: "Slack", icon: "chat", color: "#4A154B" },
                  { name: "Gmail", icon: "mail", color: "#EA4335" },
                  { name: "Notion", icon: "article", color: "#111" },
                  { name: "Jira", icon: "bug_report", color: "#0052CC" },
                ].map((x) => (
                  <div
                    key={x.name}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-5 py-3 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[22px]" style={{ color: x.color }}>
                      {x.icon}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{x.name}</span>
                  </div>
                ))}
              </motion.div>
              <motion.div variants={fadeUp} className="mt-10 flex justify-start lg:justify-end">
                <Button asChild variant="outline" className="rounded-xl border-slate-200 font-semibold">
                  <Link href={isAuthenticated ? dashboardRoute : signUpRoute}>
                    {isAuthenticated ? "Manage integrations" : "Sign up to connect"}
                  </Link>
                </Button>
              </motion.div>
            </AnimatedSection>
          </Shell>
        </section>

        {/* Value props — honest, no fabricated quotes */}
        <section className="border-b border-slate-200/60 bg-[#fafafa] py-16 lg:py-20">
          <Shell>
            <AnimatedSection>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { title: "Single workspace", desc: "Meetings, tools, billing, and settings without tab sprawl." },
                  { title: "INR-first pricing", desc: "Transparent plans with clear meeting limits as you scale." },
                  { title: "History on Pro+", desc: "Revisit AI tool runs when your plan includes History." },
                  { title: "Workspace controls", desc: "Elite adds shared workspaces and member roles." },
                ].map((x) => (
                  <motion.div key={x.title} variants={fadeUp} className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
                    <h3 className="font-semibold text-slate-900">{x.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{x.desc}</p>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>
          </Shell>
        </section>

        {/* Pricing — aligned with planDefinitions */}
        <section id="pricing" className="scroll-mt-20 border-b border-slate-200/60 bg-white py-16 lg:py-24">
          <Shell>
            <AnimatedSection>
              <motion.div variants={fadeUp}>
                <SectionHeader
                  eyebrow="Pricing"
                  title="Plans that mirror what you unlock in-app"
                  description="Start on Free with full access to the AI tools; upgrade when you want the meeting bot, transcription, history, and higher meeting limits."
                />
              </motion.div>
              <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
                {[
                  {
                    name: freePlan.name,
                    price: freePlan.price,
                    period: "forever",
                    features: freePlan.features,
                    highlight: false,
                  },
                  {
                    name: proPlan.name,
                    price: proPlan.price,
                    period: "per month",
                    features: proPlan.features,
                    highlight: true,
                  },
                  {
                    name: elitePlan.name,
                    price: elitePlan.price,
                    period: "per month",
                    features: elitePlan.features,
                    highlight: false,
                  },
                ].map((plan) => (
                  <motion.div
                    key={plan.name}
                    variants={fadeUp}
                    className={`relative flex flex-col rounded-2xl border p-8 shadow-sm ${
                      plan.highlight
                        ? "border-violet-300 bg-gradient-to-b from-violet-50/80 to-white ring-2 ring-violet-500/20"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    {plan.highlight && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                        {proPlan.badge}
                      </span>
                    )}
                    <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-semibold tracking-tight text-slate-900">
                        {plan.price === 0 ? "₹0" : `₹${plan.price}`}
                      </span>
                      <span className="text-sm text-slate-500">/{plan.period}</span>
                    </div>
                    <ul className="mt-8 flex flex-1 flex-col gap-3">
                      {plan.features.map((f) => (
                        <li key={f} className="flex gap-2 text-sm text-slate-600">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" strokeWidth={2.5} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      asChild
                      className={`mt-8 h-11 w-full rounded-xl font-semibold ${
                        plan.highlight ? "text-white shadow-md shadow-violet-300/50" : ""
                      }`}
                      variant={plan.highlight ? "default" : "outline"}
                      style={plan.highlight ? { background: ACCENT } : undefined}
                    >
                      <Link href={signUpRoute}>{plan.price === 0 ? "Start free" : `Choose ${plan.name}`}</Link>
                    </Button>
                  </motion.div>
                ))}
              </div>
              <motion.p variants={fadeUp} className="mt-8 text-left text-xs text-slate-500 lg:text-right">
                Trial users get Elite-level access for a limited time. See billing in-app for current offers.
              </motion.p>
            </AnimatedSection>
          </Shell>
        </section>

        {/* CTA */}
        <section className="bg-white py-16 lg:py-20">
          <Shell>
            <AnimatedSection>
              <motion.div
                variants={fadeUp}
                className="overflow-hidden rounded-2xl px-8 py-12 text-white sm:px-12 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:py-14"
                style={{
                  background: `linear-gradient(135deg, ${ACCENT} 0%, #5b21b6 100%)`,
                }}
              >
                <div className="max-w-xl text-left">
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Ready to shorten the gap from talk to done?
                  </h2>
                  <p className="mt-4 text-base text-white/85">
                    Create an account, connect your calendar where supported, and open the tools that fit your workflow.
                  </p>
                </div>
                <div className="mt-8 flex shrink-0 flex-col gap-3 sm:flex-row lg:mt-0">
                  <Button asChild size="lg" className="h-12 rounded-xl bg-white px-8 font-semibold text-violet-700 hover:bg-slate-50">
                    <Link href={primaryRoute}>{isAuthenticated ? "Go to dashboard" : "Get started free"}</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 rounded-xl border-white/40 bg-white/10 px-8 font-semibold text-white hover:bg-white/15"
                  >
                    <Link href={signInRoute}>Log in</Link>
                  </Button>
                </div>
              </motion.div>
            </AnimatedSection>
          </Shell>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 text-slate-300">
        <Shell className="py-12">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: ACCENT }}>
                  A
                </div>
                <span className="font-semibold text-white">Artivaa AI</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
                Meeting intelligence and AI tools for teams that want structured output—not another generic chatbot.
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <a href="#product" className="text-slate-400 hover:text-white">
                    Overview
                  </a>
                </li>
                <li>
                  <a href="#tools" className="text-slate-400 hover:text-white">
                    AI tools
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="text-slate-400 hover:text-white">
                    Pricing
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Account</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <Link href={signInRoute} className="text-slate-400 hover:text-white">
                    Log in
                  </Link>
                </li>
                <li>
                  <Link href={signUpRoute} className="text-slate-400 hover:text-white">
                    Sign up
                  </Link>
                </li>
                <li>
                  <Link href={dashboardRoute} className="text-slate-400 hover:text-white">
                    Dashboard
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-slate-800 pt-8 text-xs text-slate-500 sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} Artivaa AI. All rights reserved.</p>
          </div>
        </Shell>
      </footer>
    </div>
  );
}
