# Artivaa — Plans & Features (Kis Plan Mein Kya Available Hai)

> **Source of truth:** `frontend/src/lib/subscription.ts` + `backend/express-api/src/lib/subscription.ts`  
> **Prices:** INR / month (billing page & landing page se)  
> **Last updated:** May 2026

---

## Core principle (important)

**Bot, transcription, summary, aur auto-extract sab plans pe chalta hai aur DB mein save hota hai** — taaki user baad mein Elite le to purane meetings ka data mile.

**Plan sirf UI + mutations gate karta hai:** kya dikhega, kya edit/export/share ho sakta hai.

---

## Quick summary

| Plan | Price | Best for |
|------|-------|----------|
| **Free** | ₹0 | AI tools + 7 meetings/month with full bot capture (data saved) |
| **Pro** | ₹99/mo | View backlog & history — edit/export/share on Elite |
| **Elite** | ₹199/mo | Full edit, export, share + team workspace |
| **Trial** | ₹0 (30 days) | **Elite jaisa** full access trial ke dauran |

---

## Feature matrix (✅ / ❌ / 👁 view-only)

| Feature | Free | Pro | Elite | Trial |
|---------|:----:|:---:|:-----:|:-----:|
| **Email Generator** | ✅ Unlimited | ✅ | ✅ | ✅ |
| **Task Generator** | ✅ Unlimited | ✅ | ✅ | ✅ |
| **Document Analyzer** | ✅ Unlimited | ✅ | ✅ | ✅ |
| **Meeting Summarizer** (tool) | ✅ | ✅ | ✅ | ✅ |
| **Meeting Bot (AI Notetaker)** | ✅ (7/mo) | ✅ (20/mo) | ✅ ∞ | ✅ ∞ |
| **Auto transcription** | ✅ | ✅ | ✅ | ✅ |
| **Auto AI summary** | ✅ | ✅ | ✅ | ✅ |
| **Auto-extract action items** (saved to DB) | ✅ | ✅ | ✅ | ✅ |
| **View action items in meeting detail** | ✅ 👁 | ✅ 👁 | ✅ | ✅ |
| **Task Backlog page** (`/action-items`) | ❌ | ✅ 👁 read-only | ✅ full | ✅ full |
| **Edit / create / delete action items** | ❌ | ❌ → Elite dialog | ✅ | ✅ |
| **Export / Share / Download** | ❌* | 👁 buttons → Elite dialog | ✅ | ✅ |
| **Meeting / tool History** | ❌ | ✅ 👁 | ✅ | ✅ |
| **Meetings per month** | **7** | **20** | **Unlimited** | **Unlimited** |
| **Team workspace** | ❌ | ❌ → Elite dialog | ✅ | ✅ |
| **Workspace invites** | ❌ | ❌ | ✅ | ✅ |
| **Priority support** | ❌ | ❌ | ✅ (marketing) | ✅ (marketing) |

\* Free users meeting detail mein copy-as-text/markdown kar sakte hain; PDF download / share integrations Elite.

---

## Plan-by-plan detail

### 1. Free (₹0)

**Tagline:** Full bot capture on 7 meetings/month — data saved for when you upgrade.

#### ✅ Available

- **AI Tools** (unlimited): Email, Task, Document Analyzer, Meeting Summarizer
- **Meeting Bot** — record, transcript, summary, action items **extract & save to DB**
- **Meeting detail** — transcript, summary, **auto-extracted action items (view only)**
- **Calendar connect** — Google / Microsoft
- **Meetings list** — max **7 per month**
- **Integrations page** — connect (catalog ke hisaab se)

#### ❌ Not available (upgrade prompt)

- **Task Backlog page** — blocked → *"Upgrade to Pro"*
- **History page** — blocked → *"Upgrade to Pro"*
- **Edit action items** — Elite
- **Export / Share / Download PDF** — Elite (buttons Pro pe dikhte hain, click → Elite dialog)
- **Team workspace** — Elite

---

### 2. Pro (₹99/month)

**Tagline:** View everything — edit, export, and share on Elite.

#### ✅ Everything in Free, plus:

- **20 meetings/month**
- **Task Backlog page** — **view only** (status/priority edit blocked → Elite dialog)
- **History page** — view past runs
- **Export / Share / Download buttons visible** — click → **Elite upgrade dialog**

#### ❌ Not available (Elite dialog on click)

- Create / edit / delete action items
- Export CSV, share to Slack/Jira/Gmail/Notion
- Download meeting/history PDF
- Team workspace switch / share to workspace

---

### 3. Elite (₹199/month)

**Tagline:** Unlimited meetings + full edit/export/share + team collaboration.

#### ✅ Everything in Pro, plus:

- **Unlimited meetings**
- **Full action item management** (create, edit, delete, bulk)
- **Export, share, download**
- **Team workspace** — shared meetings & action items
- **Invite members** — admin, owner, member, viewer roles

---

### 4. Trial (30 days, ₹0)

**Tagline:** Full **Elite-level** access during trial.

Same as Elite. After trial → Free (unless user purchases Pro/Elite).

---

## API enforcement

| Feature | Backend check | Error code |
|---------|---------------|------------|
| View action items (GET) | `canUseActionItems(plan)` | `403 upgrade_required` |
| Manage action items (POST/PATCH/DELETE) | `canManageActionItems(plan)` | `403 elite_required` |
| Export action items CSV | `canExportShareDownload(plan)` | `403 elite_required` |
| History / AI runs | `canUseHistory(plan)` | `403 upgrade_required` |
| Team workspace | `canUseTeamWorkspace(plan)` | `403` / `upgrade_required` |
| Meeting create quota | `enforceMeetingQuotaBeforeCreate()` | `403 limit_reached` |
| Auto-extract persist (summarizer) | **No plan gate** — always saves | — |

Frontend: `EliteRequiredDialog` for Pro users on export/share/edit; `upgrade_required` for Free on hub pages.

---

## Code reference

| File | Kya hai |
|------|---------|
| `frontend/src/lib/subscription.ts` | Plan limits + `canView*` / `canManage*` / `canExportShareDownload` |
| `frontend/src/components/shared/elite-required-dialog.tsx` | Elite upsell modal |
| `frontend/src/hooks/useSubscriptionLimits.ts` | Client-side limits from `/api/subscription` |
| `frontend/src/lib/plan-gate-errors.ts` | `upgrade_required` + `elite_required` messages |
| `backend/express-api/src/routes/action-items.ts` | View vs manage vs export gates |
| `backend/express-api/src/routes/tools.ts` | Always persist extracted action items |

---

*Plan limits badalne ke liye pehle `subscription.ts` (frontend + backend) update karo, phir billing catalog / DB check karo.*
