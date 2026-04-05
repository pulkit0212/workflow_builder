"use client";

import Link from "next/link";
import type { Route } from "next";
import { UserButton } from "@clerk/nextjs";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CheckCircle2,
  CalendarDays,
  FileText,
  Mail,
  MessagesSquare,
  PlayCircle,
  ShieldCheck,
  Video,
  Sparkles,
  ZoomIn
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasClerkPublishableKey } from "@/lib/auth/clerk-env";

const signInRoute = "/sign-in" as Route;
const signUpRoute = "/sign-up" as Route;
const dashboardRoute = "/dashboard" as Route;
const meetingSummarizerRoute = "/dashboard/tools/meeting-summarizer" as Route;
const meetingsRoute = "/dashboard/meetings" as Route;

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
  { label: "Product", href: "#product", kind: "anchor" },
  { label: "Features", href: "#features", kind: "anchor" },
  { label: "Trust", href: "#trust", kind: "anchor" },
  { label: "Dashboard", href: meetingsRoute, kind: "route" }
];

const integrations = [
  {
    name: "Google Meet",
    color: "#00AC47",
    icon: "https://upload.wikimedia.org/wikipedia/commons/9/9b/Google_Meet_icon_%282020%29.svg"
  },
  {
    name: "Zoom",
    color: "#2D8CFF",
    icon: "https://cdn.worldvectorlogo.com/logos/zoom-1.svg"
  },
  {
    name: "Microsoft Teams",
    color: "#6264A7",
    icon: "https://cdn.worldvectorlogo.com/logos/microsoft-teams-1.svg"
  },
  {
    name: "Slack",
    color: "#E01E5A",
    icon: "https://cdn.worldvectorlogo.com/logos/slack-new-logo.svg"
  },
  {
    name: "Gmail",
    color: "#EA4335",
    icon: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg"
  },
  {
    name: "Google Calendar",
    color: "#4285F4",
    icon: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg"
  },
  {
    name: "Notion",
    color: "#000000",
    icon: "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png"
  },
  {
    name: "HubSpot",
    color: "#FF7A59",
    icon: "https://cdn.worldvectorlogo.com/logos/hubspot.svg"
  }
] as const;

const featureBuckets = [
  {
    title: "Capture meetings automatically",
    description: "Sync your calendar, surface the right join links, and prepare Artivaa before conversations begin.",
    items: ["Auto-detect today's meetings", "Live join context and meeting links", "Clear upcoming view for busy operators"]
  },
  {
    title: "Generate transcripts and summaries",
    description: "Turn every conversation into a clean transcript, executive recap, and key discussion points your team can trust.",
    items: ["Readable transcripts", "Concise summaries", "Structured decisions and highlights"]
  },
  {
    title: "Turn decisions into action",
    description: "Extract next steps, owners, and follow-ups so the work moves forward after the meeting ends.",
    items: ["Action items with owners", "Fast follow-up handoff", "History that stays easy to scan"]
  }
] as const;

const trustPoints = [
  { title: "Clean workspace", copy: "Bright, low-friction UI that helps teams review meetings without noise." },
  { title: "Audit-friendly outputs", copy: "Transcripts, summaries, and action items stay organized in one system." },
  { title: "Operational trust", copy: "Built to feel reliable, polished, and ready for professional workflows." }
] as const;

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
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h2>
      <p className="text-base leading-8 text-slate-600">{description}</p>
    </div>
  );
}

function MarketingLink({ item }: { item: MarketingNavItem }) {
  if (item.kind === "route") {
    return (
      <Link href={item.href} className="text-sm text-slate-600 transition hover:text-slate-950">
        {item.label}
      </Link>
    );
  }

  return (
    <a href={item.href} className="text-sm text-slate-600 transition hover:text-slate-950">
      {item.label}
    </a>
  );
}

function HeroPreview() {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      transition={{ duration: 0.8, ease: "easeOut", delay: 0.12 }}
      className="relative mx-auto w-full max-w-[680px]"
    >
      <div className="absolute -left-8 top-8 h-40 w-40 rounded-full bg-indigo-200/70 blur-3xl" />
      <div className="absolute -right-6 bottom-4 h-44 w-44 rounded-full bg-blue-200/70 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 p-3 shadow-[0_30px_90px_rgba(15,23,42,0.12)]">
        <div className="rounded-[1.6rem] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f7f9fd)] p-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <p className="text-sm font-semibold text-slate-950">Meeting intelligence overview</p>
              <p className="mt-1 text-sm text-slate-500">Capture, summarize, and follow through from one workspace</p>
            </div>
            <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              Live sync
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">Today&apos;s meetings</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">3 scheduled</p>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    ["Design review", "10:00 AM", "Upcoming"],
                    ["Customer sync", "12:30 PM", "Ready"],
                    ["Weekly ops", "4:00 PM", "Joined"]
                  ].map(([title, time, state]) => (
                    <div key={title} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-950">{title}</p>
                        <p className="text-xs text-slate-500">{time}</p>
                      </div>
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                        {state}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-4">
                  <p className="text-sm text-slate-600">Transcript coverage</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">98%</p>
                  <p className="mt-2 text-sm text-indigo-700">Clear speaker-by-speaker output</p>
                </div>
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm text-slate-600">Action items</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">12</p>
                  <p className="mt-2 text-sm text-slate-600">Decisions mapped to follow-ups</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-indigo-100 bg-[linear-gradient(180deg,#eef2ff,#ffffff)] p-4">
                <p className="text-sm font-semibold text-slate-950">Executive summary</p>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  The team aligned on launch timing, approved the onboarding test sequence, and assigned next steps across product, growth, and customer success.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <p className="text-sm font-semibold text-slate-950">Action queue</p>
                <div className="mt-3 space-y-3">
                  {[
                    ["Finalize onboarding copy", "Maya", "Friday"],
                    ["Update dashboard metrics", "Rahul", "Today"],
                    ["Share customer recap", "Ari", "Tomorrow"]
                  ].map(([task, owner, due]) => (
                    <div key={task} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-sm font-medium text-slate-900">{task}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {owner} • {due}
                      </p>
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

function IntegrationMark({ name, color, icon }: (typeof integrations)[number]) {
  return (
    <div
      className="group flex min-w-[110px] cursor-default flex-col items-center justify-center gap-2 rounded-2xl border border-[#f0f0f0] bg-white px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = "translateY(-2px)";
        event.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = "translateY(0)";
        event.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
    >
      <img
        src={icon}
        alt={name}
        className="object-contain"
        style={{ width: "40px", height: "40px", objectFit: "contain", filter: color === "#000000" ? "none" : undefined }}
        onError={(event) => {
          event.currentTarget.style.display = "none";
          const fallback = event.currentTarget.nextElementSibling as HTMLDivElement | null;
          if (fallback) {
            fallback.style.display = "flex";
          }
        }}
      />
      <div
        style={{
          display: "none",
          width: "40px",
          height: "40px",
          background: color,
          borderRadius: "8px",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 700,
          fontSize: "13px"
        }}
      >
        {name.substring(0, 2).toUpperCase()}
      </div>
      <span className="whitespace-nowrap text-center text-[12px] font-medium text-[#374151]">{name}</span>
    </div>
  );
}

type LandingPageProps = {
  isAuthenticated: boolean;
};

export function LandingPage({ isAuthenticated }: LandingPageProps) {
  const primaryHeroRoute = isAuthenticated ? dashboardRoute : signUpRoute;
  const primaryHeroLabel = isAuthenticated ? "Open dashboard" : "Start capturing meetings";

  return (
    <main className="min-h-screen overflow-hidden bg-transparent text-slate-950">
      <div className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,249,252,0.8))]" />

      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/78 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1440px] px-6 py-4 lg:px-10">
          <div className="flex items-center justify-between gap-6">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
                AR
              </span>
              <span>
                <span className="block text-sm font-semibold uppercase tracking-[0.28em] text-indigo-600">Artivaa</span>
                <span className="block text-xs text-slate-500">From meetings to meaningful work.</span>
              </span>
            </Link>

            <nav className="hidden items-center gap-8 md:flex">
              {navItems.map((item) => (
                <MarketingLink key={item.label} item={item} />
              ))}
            </nav>

            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <Button asChild>
                    <Link href={dashboardRoute}>Dashboard</Link>
                  </Button>
                  {hasClerkPublishableKey ? <UserButton afterSignOutUrl="/" /> : null}
                </>
              ) : (
                <>
                  <Button asChild variant="ghost">
                    <Link href={signInRoute}>Sign in</Link>
                  </Button>
                  <Button asChild>
                    <Link href={signUpRoute}>Get started</Link>
                  </Button>
                </>
              )}
            </div>
          </div>

          <nav className="no-scrollbar mt-4 flex gap-3 overflow-x-auto md:hidden">
            {navItems.map((item) => (
              <div key={item.label} className="shrink-0 rounded-full border border-slate-200 bg-white/90 px-4 py-2 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                <MarketingLink item={item} />
              </div>
            ))}
          </nav>
        </div>
      </header>

      <section className="px-6 pb-24 pt-16 sm:pt-20 lg:px-10 lg:pb-28">
        <div className="mx-auto grid w-full max-w-[1440px] gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(560px,0.95fr)] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-3 rounded-full border border-indigo-100 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-700 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
              <Sparkles className="h-4 w-4" />
              Artivaa
            </div>

            <div className="max-w-3xl space-y-5">
              <h1 className="text-5xl font-semibold leading-[0.98] tracking-tight text-slate-950 sm:text-6xl xl:text-[4.7rem]">
                Artivaa
                <br />
                From meetings to meaningful work.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-slate-600">
                Artivaa captures meetings, generates summaries, and turns conversations into actionable tasks.
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="h-12 px-6">
                <Link href={primaryHeroRoute}>
                  {primaryHeroLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="h-12 px-6">
                <Link href={meetingSummarizerRoute}>
                  <PlayCircle className="h-4 w-4" />
                  See how it works
                </Link>
              </Button>
            </div>

            <div className="grid gap-3 pt-2 sm:grid-cols-3">
              {[
                "Automatic meeting capture",
                "Readable transcripts and summaries",
                "Action items your team can trust"
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-full border border-slate-200/90 bg-white/92 px-4 py-3 text-sm text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                    <span>{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <HeroPreview />
        </div>
      </section>

      <section className="border-y border-white/70 bg-slate-50/80 px-6 py-10 lg:px-10">
        <div className="mx-auto w-full max-w-[1440px]">
          <p className="mb-2 text-center text-[12px] font-semibold uppercase tracking-[0.1em] text-[#6c63ff]">INTEGRATIONS</p>
          <h2 className="mb-8 text-center text-[24px] font-bold text-[#111827]">Works with the tools your team already uses</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {integrations.map((integration) => (
              <IntegrationMark key={integration.name} {...integration} />
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="px-6 py-24 lg:px-10">
        <div className="mx-auto w-full max-w-[1440px] space-y-12">
          <SectionHeading
            eyebrow="Features"
            title="One design language for the full meeting workflow"
            description="From the marketing site to the dashboard to individual meeting pages, every surface is designed to feel clear, bright, and operationally trustworthy."
          />
          <div className="grid gap-6 lg:grid-cols-3">
            {featureBuckets.map((feature, index) => (
              <motion.div
                key={feature.title}
                variants={fadeInUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, ease: "easeOut", delay: index * 0.06 }}
                className="rounded-[2rem] border border-white/80 bg-white/88 p-7 shadow-[0_20px_48px_rgba(15,23,42,0.06)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#eef2ff,#dbeafe)] text-indigo-700">
                  {index === 0 ? <CalendarCheck2 className="h-6 w-6" /> : index === 1 ? <FileText className="h-6 w-6" /> : <Mail className="h-6 w-6" />}
                </div>
                <h3 className="mt-6 text-2xl font-semibold text-slate-950">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
                <div className="mt-6 space-y-3">
                  {feature.items.map((item) => (
                    <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="product" className="bg-slate-50/80 px-6 py-24 lg:px-10">
        <div className="mx-auto grid w-full max-w-[1440px] gap-10 xl:grid-cols-[0.86fr_1.14fr] xl:items-start">
          <SectionHeading
            eyebrow="Product Preview"
            title="See meetings, transcripts, summaries, and action items in one airy workspace"
            description="The product preview mirrors the dashboard language: soft gray structure, white cards, strong hierarchy, and just enough accent color to make the important state obvious."
          />

          <div className="grid gap-6">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[2rem] border border-white/80 bg-white p-6 shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Meetings dashboard</p>
                    <p className="text-sm text-slate-500">Upcoming today and joined meetings stay visually distinct</p>
                  </div>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                    Upcoming
                  </span>
                </div>
                <div className="mt-5 space-y-4">
                  {[
                    ["Design sync", "10:00 AM", "Soft blue priority"],
                    ["Weekly ops", "1:00 PM", "Neutral joined state"]
                  ].map(([title, time, note], index) => (
                    <div
                      key={title}
                      className={
                        index === 0
                          ? "rounded-[1.5rem] border border-blue-100 bg-blue-50/60 p-4"
                          : "rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4"
                      }
                    >
                      <p className="text-sm font-semibold text-slate-950">{title}</p>
                      <p className="mt-1 text-sm text-slate-500">{time}</p>
                      <p className="mt-3 text-sm text-slate-600">{note}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/80 bg-white p-6 shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
                <p className="text-sm font-semibold text-slate-950">Transcript review</p>
                <div className="mt-5 space-y-3">
                  {[
                    "Ari: Let’s align on the onboarding release timeline.",
                    "Maya: I’ll revise the customer-facing copy by Friday.",
                    "Rahul: I can update the dashboard metrics today."
                  ].map((line) => (
                    <div key={line} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[2rem] border border-indigo-100 bg-[linear-gradient(180deg,#eef2ff,#ffffff)] p-6 shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
                <p className="text-sm font-semibold text-slate-950">Summary</p>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                  The team approved the release sequence, aligned on launch readiness, and assigned copy, analytics, and customer follow-up before the next checkpoint.
                </p>
              </div>
              <div className="rounded-[2rem] border border-white/80 bg-white p-6 shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
                <p className="text-sm font-semibold text-slate-950">Action items</p>
                <div className="mt-4 space-y-3">
                  {["Revise launch copy", "Ship metrics update", "Share customer recap"].map((item) => (
                    <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="trust" className="px-6 py-24 lg:px-10">
        <div className="mx-auto w-full max-w-[1440px] space-y-12">
          <SectionHeading
            eyebrow="Trust"
            title="Professional enough for operations, friendly enough to use every day"
            description="The experience is designed to feel premium and calm: clear hierarchy, visible states, lightweight trust cues, and polished surfaces that make the product feel dependable."
          />

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[2rem] border border-white/80 bg-white p-8 shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-indigo-600">Customer note</p>
              <p className="mt-5 text-2xl font-semibold leading-10 tracking-tight text-slate-950">
                “It finally feels like our meetings turn into visible progress instead of disappearing into notes.”
              </p>
              <div className="mt-8 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">AR</div>
                <div>
                  <p className="font-medium text-slate-950">Ariana R.</p>
                  <p className="text-sm text-slate-500">Operations Lead</p>
                </div>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="rounded-[2rem] border border-white/80 bg-white p-6 shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" />
                  <p className="text-lg font-semibold text-slate-950">Compliance-minded presentation</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Simple trust messaging, cleaner review states, and polished audit trails help the product feel ready for serious work.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {trustPoints.map((point) => (
                  <div key={point.title} className="rounded-[1.6rem] border border-white/80 bg-slate-50/90 p-5">
                    <BadgeCheck className="h-5 w-5 text-indigo-600" />
                    <p className="mt-4 font-semibold text-slate-950">{point.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{point.copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 pt-6 lg:px-10">
        <div className="mx-auto w-full max-w-[1440px]">
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="overflow-hidden rounded-[2.5rem] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,247,251,0.95))] px-8 py-12 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:px-10 lg:px-14 lg:py-16"
          >
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">Start free</p>
                <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                  Replace the dark-light mismatch with one polished AI SaaS experience.
                </h2>
                <p className="max-w-2xl text-base leading-8 text-slate-600">
                  Bring your landing page, dashboard shell, and meetings workflow into one premium light theme that feels clear, modern, and ready for daily use.
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Button asChild size="lg">
                  <Link href={primaryHeroRoute}>
                    {primaryHeroLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href={meetingsRoute}>
                    <ZoomIn className="h-4 w-4" />
                    View meetings
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
