"use client";

import Link from "next/link";
import type { Route } from "next";
import { UserButton } from "@clerk/nextjs";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Button } from "@/components/ui/button";
import { hasClerkPublishableKey } from "@/lib/auth/clerk-env";

const signInRoute = "/sign-in" as Route;
const signUpRoute = "/sign-up" as Route;
const dashboardRoute = "/dashboard" as Route;

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};
const stagger = { visible: { transition: { staggerChildren: 0.07 } } };

function AnimatedSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref} variants={stagger} initial="hidden" animate={inView ? "visible" : "hidden"} className={className}>
      {children}
    </motion.div>
  );
}

// ─── Navbar ────────────────────────────────────────────────────────────────
function Navbar({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <nav className="fixed top-0 left-0 right-0 w-full z-50 bg-white border-b border-slate-100 shadow-sm">
      <div className="flex justify-between items-center h-16 w-full px-14">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#6C3FF5] flex items-center justify-center">
              <span className="text-white text-xs font-black">A</span>
            </div>
            <span className="text-slate-900 text-base font-bold" style={{ fontFamily: "'Work Sans', sans-serif" }}>Artivaa AI</span>
          </div>
          <div className="hidden md:flex gap-7 items-center">
            {["Product", "Features", "Pricing", "Integrations"].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">
                {item}
                <span className="material-symbols-outlined text-[14px] text-slate-400">expand_more</span>
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Button asChild size="sm" className="bg-[#6C3FF5] hover:bg-[#5B2FE0] text-white font-semibold rounded-lg">
                <Link href={dashboardRoute}>Open Dashboard</Link>
              </Button>
              {hasClerkPublishableKey && <UserButton afterSignOutUrl="/" />}
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900 font-medium">
                <Link href={signInRoute}>Login</Link>
              </Button>
              <Button asChild size="sm" className="bg-[#6C3FF5] hover:bg-[#5B2FE0] text-white font-semibold rounded-lg shadow-md shadow-purple-200">
                <Link href={signUpRoute}>Try for free!</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function ProductMockup() {
  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-2xl shadow-purple-100">
      {/* Browser bar */}
      <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-400" />
        </div>
        <div className="mx-auto flex h-6 w-64 items-center rounded border border-slate-200 bg-white px-3 text-xs text-slate-400">
          app.artivaa.ai/dashboard
        </div>
      </div>
      {/* Dashboard */}
      <div className="flex bg-[#F8F9FA]">
        {/* Sidebar */}
        <div className="w-44 bg-white border-r border-slate-100 p-3">
          <div className="flex items-center gap-2 mb-4 p-2 rounded-lg bg-slate-50">
            <div className="w-6 h-6 rounded bg-[#6C3FF5] flex items-center justify-center">
              <span className="text-white text-[10px] font-black">A</span>
            </div>
            <span className="text-xs font-bold text-slate-700">Artivaa AI</span>
          </div>
          {[
            { icon: "dashboard", label: "Dashboard", active: true },
            { icon: "videocam", label: "Meetings", active: false },
            { icon: "bar_chart", label: "Reports", active: false },
            { icon: "assignment", label: "Actions", active: false },
          ].map((item) => (
            <div key={item.label}
              className={`flex items-center gap-2 px-2 py-2 rounded-r-sm text-xs mb-1 border-l-2 ${
                item.active ? "bg-[#EDE9FE] text-[#6C3FF5] border-[#6C3FF5] font-semibold" : "text-slate-400 border-transparent"
              }`}>
              <span className="material-symbols-outlined text-[14px]">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
        {/* Content */}
        <div className="flex-1 p-4">
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: "Meetings", value: "124", color: "#6C3FF5" },
              { label: "This Month", value: "32", color: "#059669" },
              { label: "Actions", value: "18", color: "#D97706" },
              { label: "Pending", value: "07", color: "#DC2626" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg p-3 border border-slate-100">
                <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { title: "Product Roadmap Sync", time: "10:00 AM", tag: "GOOGLE MEET", tagColor: "#DC2626", tagBg: "#FEF2F2" },
              { title: "Design Review", time: "1:30 PM", tag: "MS TEAMS", tagColor: "#1D4ED8", tagBg: "#EFF6FF" },
            ].map((m) => (
              <div key={m.title} className="bg-white rounded-lg p-3 border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded"
                    style={{ background: m.tagBg, color: m.tagColor }}>{m.tag}</span>
                  <span className="text-[9px] text-slate-400">{m.time}</span>
                </div>
                <p className="text-xs font-semibold text-slate-800 mb-2">{m.title}</p>
                <div className="w-full rounded-lg py-1.5 text-[9px] font-bold text-white flex items-center justify-center gap-1"
                  style={{ background: "#6C3FF5" }}>
                  <span className="material-symbols-outlined text-[10px]">smart_toy</span>
                  Start AI Notetaker
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const primaryRoute = isAuthenticated ? dashboardRoute : signUpRoute;

  return (
    <div className="min-h-screen w-full bg-white text-slate-900" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Navbar isAuthenticated={isAuthenticated} />

      {/* ── HERO — left text, right mockup ── */}
      <section className="w-full pt-16" style={{ background: "linear-gradient(180deg, #F5F3FF 0%, #FFFFFF 100%)" }}>
        <div className="w-full px-14 py-14 md:py-18">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* Left */}
            <motion.div variants={stagger} initial="hidden" animate="visible">
              <motion.h1 variants={fadeUp}
                className="text-7xl md:text-8xl font-black leading-[1.0] mb-6"
                style={{ fontFamily: "'Work Sans', sans-serif" }}>
                <span style={{ color: "#6C3FF5" }}>Meeting</span>
                <br />
                <span className="text-slate-900">Copilot</span>
              </motion.h1>
              <motion.p variants={fadeUp} className="text-slate-600 text-xl leading-relaxed mb-8 max-w-lg">
                Artivaa is your AI copilot — transforming meetings, emails, and messages into summaries, insights, and instant answers{" "}
                <span className="font-semibold text-[#6C3FF5]">on every device, wherever you work.</span>
              </motion.p>
              <motion.div variants={fadeUp} className="mb-6">
                <Button asChild size="lg"
                  className="h-14 px-10 text-lg font-bold text-white rounded-xl shadow-lg shadow-purple-200 hover:shadow-purple-300 transition-all"
                  style={{ background: "#6C3FF5" }}>
                  <Link href={primaryRoute}>Get Started for Free</Link>
                </Button>
              </motion.div>
              <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-6 text-base text-slate-500">
                {["5 free meetings / month", "No install required", "No credit card"].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#6C3FF5] text-[18px]">check_circle</span>
                    {item}
                  </span>
                ))}
              </motion.div>
            </motion.div>

            {/* Right — product mockup — bigger */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
              className="flex justify-center md:justify-end w-full">
              <div className="w-full">
                <ProductMockup />
              </div>
            </motion.div>
          </div>
        </div>

        {/* Platforms strip */}
        <div className="w-full border-t border-slate-100 bg-white py-8">
          <div className="w-full px-14">
            <p className="text-center text-sm font-semibold text-slate-400 mb-6">Use Artivaa wherever you work</p>
            <div className="flex flex-wrap justify-center gap-4">
              {[
                { name: "Google Meet", icon: "videocam", color: "#EA4335", bg: "#FEF2F2" },
                { name: "MS Teams", icon: "groups", color: "#6264A7", bg: "#EDE9FE" },
                { name: "Zoom", icon: "video_call", color: "#2D8CFF", bg: "#EFF6FF" },
                { name: "Slack", icon: "chat", color: "#E01E5A", bg: "#FFF0F3" },
                { name: "Notion", icon: "article", color: "#000000", bg: "#F8F8F8" },
                { name: "Jira", icon: "bug_report", color: "#0052CC", bg: "#EFF6FF" },
                { name: "Gmail", icon: "mail", color: "#EA4335", bg: "#FEF2F2" },
              ].map((p) => (
                <div key={p.name} className="flex flex-col items-center gap-2 w-20 cursor-default group">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm group-hover:shadow-md transition-shadow"
                    style={{ background: p.bg }}>
                    <span className="material-symbols-outlined text-[24px]" style={{ color: p.color }}>{p.icon}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium text-center">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS — 3 column like read.ai ── */}
      <section id="features" className="w-full py-20 bg-white">
        <div className="w-full px-14">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-12">
              <p className="text-sm font-semibold text-[#6C3FF5] mb-2">How Artivaa Works</p>
              <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                Turn Conversations into Action with AI
              </h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                From meeting recaps to Search Copilot, uncover the insights you need — when you need them.
              </p>
            </motion.div>

            {/* 3 column feature list — read.ai style */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t border-slate-100">
              {[
                {
                  title: "Make Meetings Work for You",
                  color: "#6C3FF5",
                  items: [
                    { label: "Capture & summarize", rest: "every meeting effortlessly" },
                    { label: "Auto-generated recaps,", rest: "action items, and highlights" },
                    { label: "Works with", rest: "Google Meet, Zoom, and Teams" },
                  ],
                },
                {
                  title: "Find Answers Instantly",
                  color: "#6C3FF5",
                  items: [
                    { label: "Search smarter", rest: "— find insights across meetings, emails, and chats in seconds" },
                    { label: "AI-powered search", rest: "across conversations, docs, and notes" },
                    { label: "Get immediate context", rest: "with citations to where information was discussed" },
                  ],
                },
                {
                  title: "Keep Everyone in the Loop",
                  color: "#6C3FF5",
                  items: [
                    { label: "Break down silos", rest: "by sharing knowledge across teams" },
                    { label: "Seamlessly share summaries", rest: "and decisions in Slack, email, or your workspace" },
                    { label: "Easily sync Artivaa", rest: "with your favorite integrations to keep your team up to date" },
                  ],
                },
              ].map((col, i) => (
                <motion.div key={col.title} variants={fadeUp}
                  className={`py-10 px-8 ${i < 2 ? "border-r border-slate-100" : ""}`}>
                  <h3 className="text-xl font-bold text-slate-900 mb-6 leading-tight" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                    {col.title}
                  </h3>
                  <ul className="space-y-4">
                    {col.items.map((item, j) => (
                      <li key={j} className="text-slate-600 text-sm leading-relaxed">
                        <span className="font-semibold" style={{ color: col.color }}>{item.label}</span>{" "}
                        {item.rest}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── AUTOMATE SECTION — left text + right product grid ── */}
      <section className="w-full py-20 border-t border-slate-100" style={{ background: "#FAFAFA" }}>
        <div className="w-full px-14">
          <AnimatedSection>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
              {/* Left */}
              <motion.div variants={fadeUp}>
                <h2 className="text-4xl font-black mb-8 leading-tight" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                  Automate summaries &amp; insights across platforms
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { title: "Meeting Notes & Playback", desc: "AI-generated notes, topics, and action items.", icon: "description" },
                    { title: "Search Copilot", desc: "Find answers across meetings, emails, and messages.", icon: "search" },
                    { title: "Meeting Assistant", desc: "Artivaa joins your meetings automatically.", icon: "smart_toy" },
                    { title: "Email Summaries", desc: "Concise summaries of key email threads.", icon: "mail" },
                  ].map((card) => (
                    <div key={card.title} className="bg-white rounded-xl p-4 border border-slate-200 hover:border-[#6C3FF5]/30 hover:shadow-sm transition-all cursor-default">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-[#6C3FF5] text-[18px]">{card.icon}</span>
                        <h4 className="text-sm font-bold text-slate-900">{card.title}</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{card.desc}</p>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Right — mini product UI */}
              <motion.div variants={fadeUp} className="relative">
                <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-xl shadow-slate-100"
                  style={{ background: "linear-gradient(135deg, #EDE9FE 0%, #F5F3FF 100%)" }}>
                  <div className="p-4 bg-white border-b border-slate-100">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded bg-[#6C3FF5] flex items-center justify-center">
                        <span className="text-white text-[9px] font-black">A</span>
                      </div>
                      <span className="text-sm font-bold text-slate-700">Artivaa Dashboard</span>
                    </div>
                    <div className="flex gap-2 mb-3">
                      {["Date", "Source", "Access"].map((f) => (
                        <span key={f} className="px-2 py-1 rounded-lg bg-slate-100 text-xs text-slate-500 font-medium">{f}</span>
                      ))}
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-400 border border-slate-200">
                      What&apos;s the status of...
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    {[
                      { title: "Product Roadmap Review", time: "5-6pm · 4 participants", status: "In Progress", statusColor: "#6C3FF5", statusBg: "#EDE9FE" },
                      { title: "Team Sync", time: "3-4pm · 12 participants", status: "Ready", statusColor: "#059669", statusBg: "#D1FAE5" },
                    ].map((item) => (
                      <div key={item.title} className="bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                          <p className="text-xs text-slate-400">{item.time}</p>
                        </div>
                        <span className="px-2 py-1 rounded-lg text-xs font-bold"
                          style={{ background: item.statusBg, color: item.statusColor }}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                    <div className="bg-[#6C3FF5] rounded-xl py-2.5 text-center text-sm font-bold text-white cursor-pointer hover:bg-[#5B2FE0] transition-colors">
                      Artivaa Dashboard
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── INTEGRATIONS ── */}
      <section id="integrations" className="w-full py-20 bg-white border-t border-slate-100">
        <div className="w-full px-14">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-10">
              <p className="text-sm font-semibold text-[#6C3FF5] mb-2">Integrations</p>
              <h2 className="text-4xl font-black mb-4" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                Works with your favorite tools
              </h2>
              <p className="text-slate-500 max-w-2xl mx-auto text-base">
                Artivaa is independent and platform-agnostic — connecting across all your tools to deliver truly unified insights.
              </p>
            </motion.div>
            <motion.div variants={fadeUp} className="flex flex-wrap justify-center gap-3 mb-8">
              {[
                { name: "Google Meet", icon: "videocam", color: "#EA4335" },
                { name: "Zoom", icon: "video_call", color: "#2D8CFF" },
                { name: "Teams", icon: "groups", color: "#6264A7" },
                { name: "Gmail", icon: "mail", color: "#EA4335" },
                { name: "Outlook", icon: "inbox", color: "#0078D4" },
                { name: "Slack", icon: "chat", color: "#E01E5A" },
                { name: "Notion", icon: "article", color: "#000000" },
                { name: "Jira", icon: "bug_report", color: "#0052CC" },
                { name: "Google Calendar", icon: "calendar_month", color: "#4285F4" },
                { name: "HubSpot", icon: "hub", color: "#FF7A59" },
                { name: "Salesforce", icon: "cloud", color: "#00A1E0" },
                { name: "Asana", icon: "task_alt", color: "#F06A6A" },
              ].map((tool) => (
                <div key={tool.name}
                  className="w-14 h-14 rounded-2xl border border-slate-200 bg-white flex items-center justify-center hover:border-[#6C3FF5]/30 hover:shadow-md transition-all cursor-default shadow-sm">
                  <span className="material-symbols-outlined text-[22px]" style={{ color: tool.color }}>{tool.icon}</span>
                </div>
              ))}
            </motion.div>
            <motion.div variants={fadeUp} className="flex justify-center gap-4">
              <Button asChild className="bg-[#6C3FF5] hover:bg-[#5B2FE0] text-white font-semibold rounded-xl px-6">
                <Link href={signUpRoute}>Connect Your Tools</Link>
              </Button>
              <Button asChild variant="ghost" className="text-[#6C3FF5] font-semibold hover:bg-purple-50">
                <a href="#features">
                  View all integrations
                  <span className="material-symbols-outlined text-[16px] ml-1">arrow_forward</span>
                </a>
              </Button>
            </motion.div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="w-full py-20 border-t border-slate-100" style={{ background: "#FAFAFA" }}>
        <div className="w-full px-14">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-10">
              <h2 className="text-4xl font-black mb-2" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                What people are saying about Artivaa AI
              </h2>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { quote: "Record and transcribe meetings automatically, improving documentation and accessibility.", name: "U.S. Chamber of Commerce" },
                { quote: "It learns me — and it's starting to think like I do.", name: "– Tony Reese, Particle41" },
                { quote: "Our favorite tool for saving hours every week.", name: "– Tiger Sisters, top 10 business podcast" },
                { quote: "If you're yearning for a personal assistant to take over pesky note-taking, Artivaa just might have the fix.", name: "– Fortune Magazine" },
                { quote: "If you don't have Artivaa AI, you're losing out.", name: "– Lauren G., Nitrogen PR" },
              ].map((t) => (
                <motion.div key={t.name} variants={fadeUp}
                  className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-[#6C3FF5]/30 hover:shadow-md transition-all">
                  <span className="text-[#6C3FF5] text-3xl font-black leading-none block mb-3">&ldquo;</span>
                  <p className="text-slate-700 text-sm leading-relaxed mb-4">{t.quote}</p>
                  <p className="text-xs text-slate-400 font-medium">{t.name}</p>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── BENEFITS ── */}
      <section className="w-full py-20 bg-white border-t border-slate-100">
        <div className="w-full px-14">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-12">
              <p className="text-sm font-semibold text-[#6C3FF5] mb-2">Benefits</p>
              <h2 className="text-4xl font-black" style={{ fontFamily: "'Work Sans', sans-serif" }}>Why choose Artivaa AI?</h2>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              {[
                { icon: "devices", title: "One assistant for everything", desc: "Works across all meeting platforms, emails, and messages." },
                { icon: "security", title: "Secure & Private", desc: "SOC II certified, and no training on your data by default." },
                { icon: "translate", title: "Multi-language support", desc: "Supports 20+ languages and always adding more." },
                { icon: "insights", title: "Data-driven insights", desc: "Summarizes and surfaces the most important details for you." },
              ].map((b) => (
                <motion.div key={b.title} variants={fadeUp} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "#EDE9FE" }}>
                    <span className="material-symbols-outlined text-[#6C3FF5] text-[20px]">{b.icon}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 mb-1">{b.title}</h4>
                    <p className="text-sm text-slate-500">{b.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="w-full py-20 border-t border-slate-100" style={{ background: "#FAFAFA" }}>
        <div className="w-full px-14">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-12">
              <p className="text-sm font-semibold text-[#6C3FF5] mb-2">Pricing</p>
              <h2 className="text-4xl font-black mb-3" style={{ fontFamily: "'Work Sans', sans-serif" }}>Simple, transparent pricing</h2>
              <p className="text-slate-500">Start free. Upgrade when your team is ready.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: "Free", price: "₹0", period: "forever", features: ["5 meetings/month", "Basic transcripts", "AI summaries", "Action items"], cta: "Get started free", highlight: false },
                { name: "Pro", price: "₹999", period: "per month", features: ["Unlimited meetings", "Full transcripts", "Gemini AI summaries", "Action items + export", "5 workspaces", "Calendar sync", "Slack & Notion"], cta: "Start Pro trial", highlight: true },
                { name: "Team", price: "₹2,999", period: "per month", features: ["Everything in Pro", "Unlimited workspaces", "Team member invites", "Role-based access", "Jira integration", "Priority support"], cta: "Start Team trial", highlight: false },
              ].map((plan) => (
                <motion.div key={plan.name} variants={fadeUp}
                  className={`rounded-2xl p-8 border relative ${plan.highlight ? "border-[#6C3FF5] shadow-xl shadow-purple-100" : "border-slate-200 bg-white"}`}
                  style={plan.highlight ? { background: "linear-gradient(135deg, #F5F3FF 0%, #FFFFFF 100%)" } : {}}>
                  {plan.highlight && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#6C3FF5] text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      Most Popular
                    </div>
                  )}
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-1" style={{ fontFamily: "'Work Sans', sans-serif" }}>{plan.name}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-slate-900">{plan.price}</span>
                      <span className="text-slate-400 text-sm">/{plan.period}</span>
                    </div>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-slate-600">
                        <span className="material-symbols-outlined text-[#6C3FF5] text-[16px]">check</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button asChild
                    className={`w-full h-11 font-semibold rounded-xl ${plan.highlight ? "text-white hover:bg-[#5B2FE0]" : "border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"}`}
                    style={plan.highlight ? { background: "#6C3FF5" } : {}}>
                    <Link href={signUpRoute}>{plan.cta}</Link>
                  </Button>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── CTA BANNER — read.ai style purple banner ── */}
      <section className="w-full py-16 bg-white border-t border-slate-100">
        <div className="w-full px-14">
          <AnimatedSection>
            <motion.div variants={fadeUp}
              className="rounded-2xl p-12 text-center text-white relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #6C3FF5 0%, #8B5CF6 100%)" }}>
              <h2 className="text-4xl font-black mb-4" style={{ fontFamily: "'Work Sans', sans-serif" }}>
                Work smarter, everywhere.
              </h2>
              <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
                Join thousands of teams who never miss an action item again.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Button asChild size="lg"
                  className="h-12 px-8 text-base font-bold bg-white text-[#6C3FF5] hover:bg-slate-50 shadow-lg rounded-xl">
                  <Link href={primaryRoute}>Try Artivaa AI for Free!</Link>
                </Button>
                <Button asChild size="lg" variant="outline"
                  className="h-12 px-8 text-base font-semibold border-white/30 text-white bg-white/10 hover:bg-white/20 rounded-xl">
                  <a href="#features">
                    Learn more
                    <span className="material-symbols-outlined text-[16px] ml-1">arrow_forward</span>
                  </a>
                </Button>
              </div>
              <p className="text-white/50 text-xs mt-4">5 free meetings/month · No install required · No credit card</p>
            </motion.div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="w-full bg-slate-900 text-white">
        <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-8 py-12 px-4 md:px-6">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[#6C3FF5] flex items-center justify-center">
                <span className="text-white text-xs font-black">A</span>
              </div>
              <span className="text-white font-bold" style={{ fontFamily: "'Work Sans', sans-serif" }}>Artivaa AI</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">The intelligent meeting assistant for modern teams.</p>
          </div>
          {[
            { title: "Product", links: ["Features", "Integrations", "Enterprise", "Security"] },
            { title: "Features", links: ["Meeting Notes", "AI Summaries", "Action Items", "Search Copilot"] },
            { title: "Company", links: ["About Us", "Blog", "Careers", "Contact"] },
            { title: "Support", links: ["Documentation", "API Reference", "Privacy Policy", "Terms"] },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="font-semibold text-sm text-slate-300 mb-4" style={{ fontFamily: "'Work Sans', sans-serif" }}>{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-slate-500 hover:text-white transition-colors text-sm">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="w-full border-t border-slate-800 py-6 px-4 md:px-6 flex justify-between items-center">
          <p className="text-sm text-slate-500">© {new Date().getFullYear()} Artivaa AI. All rights reserved.</p>
          <p className="text-sm text-slate-500">English (US)</p>
        </div>
      </footer>
    </div>
  );
}
