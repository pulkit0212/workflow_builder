# Artivaa Android App — Jetpack Compose Master Plan

> **Use this doc in a new Cursor chat** to continue Android development.  
> You know Java + Kotlin. Goal: **pehle poora app web jaisa design**, phir API / bot / integrations.

---

## ⚠️ AI / Cursor agents — read this first

Before writing or changing **any** Android / Compose code:

1. **Read this file** (`artivaa-android-compose-plan.md`) — current sprint, phase, rules.
2. **Read the learning file** → [`android_compose_learning.md`](./android_compose_learning.md)  
   - Har Compose / Kotlin / Coroutine concept wahan examples ke saath hai.  
   - Naya pattern use karte waqt pehle wahan dekho; agar topic missing ho to **learning file update karo** (sirf examples + explanation, no API code in UI phase).
3. **Read UI inventory** → [`artivaa-android-app-design-spec.md`](./artivaa-android-app-design-spec.md)  
   - Saari screens, colors, fonts, web parity checklist.
4. **Web reference** → `frontend/src/app/` + `frontend/src/app/globals.css`

**Golden rule (Phase 1):** Random / ad-hoc screens mat banao. Sirf design spec ki screen list follow karo. Data = `MockData.kt` only — **no Retrofit calls** until Phase 2 starts.

---

## 1. Two-phase strategy

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1 — FULL UI (web parity, mock data)     ← YOU ARE HERE   │
│  Sprint 1–2 ✅ done → Sprint 3–7 remaining                      │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 2 — API + BOT + INTEGRATIONS                             │
│  Sprint 8+ — Retrofit, Clerk, polling, ExoPlayer, push          │
└─────────────────────────────────────────────────────────────────┘
```

| Phase | Focus | API? |
|-------|--------|------|
| **Phase 1** | Har web screen Compose mein, same colors/fonts/layout | ❌ Mock only |
| **Phase 2** | Wire real backend, bot start/stop, Clerk, integrations | ✅ Yes |

**Why:** Pehle navigation + saari screens complete → baad mein screen-by-screen API plug karna easy. Random screen banane se app inconsistent ho jati hai.

---

## 2. Product scope

### Phase 1 — All screens (mock data, web design)

| Screen group | Web route | Android screen | Phase 1 |
|--------------|-----------|----------------|---------|
| Auth | `/sign-in`, `/sign-up`, `/invite` | SignIn, SignUp, Invite | Sprint 6 |
| Dashboard | `/dashboard` | DashboardScreen | Sprint 1 ✅ (enhance in S3 — see [dashboard Cursor prompt](./artivaa-android-dashboard-cursor-prompt.md)) |
| Meetings | `/dashboard/meetings`, `/[id]` | List + Detail (3 tabs) | Sprint 2 ✅ (UI complete; API optional until S8) |
| Reports | `/dashboard/reports` | ReportsListScreen | Sprint 3 |
| Action Items | `/dashboard/action-items` | ActionItemsScreen + dialogs | Sprint 3 |
| History | `/dashboard/history`, `/[id]` | HistoryList + Detail | Sprint 4 |
| AI Tools | `/dashboard/tools/*` | Hub + 4 tools | Sprint 4 |
| Integrations | `/dashboard/integrations` | IntegrationsScreen | Sprint 5 |
| Billing | `/dashboard/billing` | BillingScreen | Sprint 5 |
| Settings | `/dashboard/settings` | SettingsScreen (6 tabs) | Sprint 5 |
| Workspace | `/dashboard/workspace` | List + Manage | Sprint 6 |
| Shared | — | EliteDialog, LockedBanner, WorkspaceSwitcher | Sprint 3–7 |

### Phase 2 — Live features (after UI complete)

| Feature | Priority | Sprint |
|---------|----------|--------|
| Clerk sign-in (real) | P0 | 8 |
| Dashboard + meetings API | P0 | 8 |
| Bot start/stop + polling | P0 | 9 |
| Action items API | P1 | 10 |
| Workspaces API | P1 | 10 |
| ExoPlayer recording | P1 | 11 |
| Push notifications | P2 | 11 |
| Calendar OAuth (Custom Tab) | P2 | 12+ |
| Billing Razorpay | P3 | Web first |

### What Android does NOT do (ever on device)
- Bot recording engine (runs server/Mac)
- BlackHole / Playwright on phone

---

## 3. Tech stack

```
Kotlin 2.x
Jetpack Compose (Material 3)
Min SDK 26  |  Target SDK 35

Phase 1:  Compose + Navigation + MockData (no Hilt/Retrofit required yet)
Phase 2:  MVVM + Hilt + Retrofit + OkHttp + kotlinx.serialization
Async:     Coroutines + Flow
Auth:      Clerk Android SDK (Phase 2)
Images:    Coil
Local:     Room (optional v1.1)
Testing:   JUnit, Compose UI Test, Turbine
```

**Learning:** Har naya topic → [`android_compose_learning.md`](./android_compose_learning.md) padho + us sprint ki screen pe apply karo.

---

## 4. Project structure

```
artivaa-android/
├── app/src/main/java/com/artivaa/
│   ├── ArtivaaApplication.kt
│   ├── MainActivity.kt
│   ├── navigation/
│   │   ├── ArtivaaNavHost.kt
│   │   └── Routes.kt              # sealed routes — ALL screens listed here first
│   ├── core/
│   │   └── design/                # Theme, colors, typography, components
│   │       ├── ArtivaaTheme.kt
│   │       ├── ArtivaaColors.kt
│   │       └── components/        # ArtivaaCard, ArtivaaButton, ...
│   ├── data/
│   │   └── mock/
│   │       └── MockData.kt        # Phase 1 ONLY data source
│   ├── feature/                   # One folder per screen group
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── meetings/
│   │   ├── reports/
│   │   ├── actionitems/
│   │   ├── history/
│   │   ├── tools/
│   │   ├── integrations/
│   │   ├── billing/
│   │   ├── settings/
│   │   └── workspace/
│   └── (Phase 2 adds: core/network, data/remote, data/repository, domain/)
```

**Phase 2 folders** add karna jab Sprint 8 shuru ho — pehle mat banao (distraction).

---

## 5. Design system (web parity)

Full tokens → [`artivaa-android-app-design-spec.md`](./artivaa-android-app-design-spec.md)

| Token | Hex |
|-------|-----|
| Primary | `#6C3FF5` |
| Primary dark | `#5B2FE0` |
| Primary light | `#EDE9FE` |
| Background | `#F8F9FA` |
| Surface | `#FFFFFF` |
| Border | `#DADCE0` |
| Text | `#202124` |
| Text secondary | `#5F6368` |
| Error | `#EA4335` |

**Fonts:** Work Sans (titles) + Inter (body) — same as web `globals.css`.

**Components (build once in Sprint 1, reuse everywhere):**
`ArtivaaCard`, `ArtivaaPrimaryButton`, `ArtivaaTopBar`, `StatusChip`, `EmptyState`, `LockedBanner`, `EliteDialog`, `PlanBadge`

---

## 6. Navigation (mobile)

**Bottom nav (5):** Home | Meetings | Reports | Tasks | More  
**Drawer / More:** History, Tools, Integrations, Workspace, Settings, Billing  
**Workspace switcher:** Drawer header bottom sheet (web `WorkspaceSwitcher` jaisa)

Har nayi screen pehle `Routes.kt` mein register karo, phir `NavHost` mein wire karo — orphan screens mat banao.

---

## 7. Mock data (Phase 1)

```kotlin
// data/mock/MockData.kt
object MockData {
    var currentPlan: Plan = Plan.PRO  // FREE | PRO | ELITE | TRIAL — UI test ke liye
    val user = User(...)
    val todayMeetings = listOf(...)
    val reports = listOf(...)
    val actionItems = listOf(...)
    val historyRuns = listOf(...)
    val workspaces = listOf(...)
}
```

**Plan switch:** `MockData.currentPlan` change karke Free locked / Pro read-only / Elite full UI verify karo.

---

## 8. Sprint plan (updated)

### ✅ Sprint 1 — Skeleton (DONE — keep as-is)

- [x] Android Studio project `Artivaa` (Empty Compose Activity)
- [x] `ArtivaaTheme` brand colors `#6C3FF5`
- [x] Bottom nav: Home | Meetings | Tasks | Settings (extend to Reports in S3)
- [x] Placeholder / shell screens
- [x] Navigation Compose setup

*Optional if already done:* Hilt + Retrofit skeleton — theek hai, lekin **Phase 1 screens mock se chalao**.

---

### ✅ Sprint 2 — Meetings (DONE — keep as-is)

- [x] Meetings list UI
- [x] Meeting detail tabs (Transcript, Summary / Overview)
- [x] Status chips + empty states
- [x] (If API wired) `GET` meetings — Phase 2 mein refine karenge

**Note:** Sprint 2 ke baad **random nayi screens mat banao**. Ab Sprint 3 se design spec ki order follow karo.

---

### Sprint 3 — Reports + Action Items (UI only, ~1 week)

**Goal:** Web ke `reports` + `action-items` pages pixel-close.

- [ ] `ReportsListScreen` — search, filters, card grid, pagination UI
- [ ] Reports **Free locked** amber banner variant (`MockData.currentPlan = FREE`)
- [ ] `ActionItemsScreen` — tabs, stats cards, table rows, bulk bar
- [ ] Action Items dialogs: NewTask, Edit, Delete, BulkStatus, BulkPriority, Export, Share
- [ ] **Pro read-only** banner + **Elite dialog** on Export/Share/Create (mock)
- [ ] **Free full-page lock** on Action Items
- [ ] Bottom nav mein **Reports** tab add karo (5 tabs complete)
- [ ] Register all routes in `Routes.kt`

**Learning topics:** `LazyColumn`, `ModalBottomSheet`, `AlertDialog` → [android_compose_learning.md §4–6](./android_compose_learning.md)

**No API** this sprint.

---

### Sprint 4 — History + AI Tools (UI only, ~1 week)

- [ ] `HistoryListScreen` — filters, run cards, Free locked variant
- [ ] `HistoryDetailScreen` — 4 tool output layouts (email, task, doc, summarizer)
- [ ] Download PDF + Share buttons → Elite dialog (mock)
- [ ] `ToolsHubScreen` — 4 module cards + Request Module card
- [ ] `EmailGeneratorScreen`, `TaskGeneratorScreen`, `DocumentAnalyzerScreen`, `MeetingSummarizerScreen`
- [ ] Shared `ToolPageShell` composable (breadcrumb, form, mock result)

**Learning topics:** `HorizontalPager` or tabs, sealed class UI states → [learning §7–8](./android_compose_learning.md)

---

### Sprint 5 — Integrations + Billing + Settings (UI only, ~1 week)

- [ ] `IntegrationsScreen` — calendar cards + productivity toggles + configure panels
- [ ] `BillingScreen` — plan cards ₹0/99/199, comparison table, payment history
- [ ] `SettingsScreen` — 6 tabs: Profile, Account, Subscription, Preferences, Integrations, Usage
- [ ] Toggle switches (purple when on), Save preferences sticky bar

**Learning topics:** `ScrollableTabRow`, `Switch`, form state → [learning §9](./android_compose_learning.md)

---

### Sprint 6 — Workspace + Auth polish (UI only, ~1 week)

- [ ] `WorkspaceListScreen` + `WorkspaceManageScreen`
- [ ] `WorkspaceSwitcherBottomSheet` — Personal / team list / Elite CTA
- [ ] `SignInScreen`, `SignUpScreen` (static UI — dark `#030712` auth bg)
- [ ] `InviteScreen`, `InviteTokenScreen` (success/error variants)
- [ ] `SplashScreen`

**Learning topics:** Navigation deep links, multiple back stack → [learning §10](./android_compose_learning.md)

---

### Sprint 7 — UI QA & parity checklist (~3–4 days)

- [ ] Har screen `Routes.kt` se reachable
- [ ] `MockData.currentPlan` = FREE, PRO, ELITE teeno test
- [ ] Empty states har list pe
- [ ] Loading shimmer placeholders
- [ ] Compare side-by-side with web (screenshots)
- [ ] Checklist from [design spec §10](./artivaa-android-app-design-spec.md)

**Phase 1 complete** = poora app web jaisa dikhe, koi API ke bina navigate ho sake.

---

### Sprint 8 — API foundation (Phase 2 start)

- [ ] Hilt DI (if not already)
- [ ] Retrofit + `ClerkAuthInterceptor`
- [ ] Base URL: `https://artivaa-backend.onrender.com` (verify `/health`)
- [ ] Real Clerk sign-in
- [ ] Dashboard `GET /api/meetings/today` (replace mock)
- [ ] Meetings list/detail real API (refine Sprint 2)

**Learning:** Retrofit + Coroutines → [learning §14–16](./android_compose_learning.md)

---

### Sprint 9 — Bot control

- [ ] `POST .../bot/start`, `POST .../bot/stop`
- [ ] Poll `GET .../status` every 3s while active
- [ ] Live status UI: waiting → capturing → completed → failed
- [ ] 503 / limit / upgrade error states

---

### Sprint 10 — Tasks + Workspaces API

- [ ] `GET/PATCH /api/action-items` + plan gates (403 handling)
- [ ] `GET /api/workspaces` + switcher
- [ ] Remove mock for these screens only

---

### Sprint 11 — Media + polish

- [ ] ExoPlayer for `GET /api/recordings/:id`
- [ ] Pull-to-refresh on lists
- [ ] Snackbar errors, offline messages
- [ ] Push notification (meeting done) — optional

---

### Sprint 12 — Beta

- [ ] Internal APK
- [ ] Crashlytics optional
- [ ] Play Store internal track optional

---

## 9. API reference (Phase 2 only)

**Base URL:** `https://artivaa-backend.onrender.com`  
**Auth:** `Authorization: Bearer <clerk_jwt>`  
**Postman:** `docs/postman/Artivaa-API.postman_collection.json`

| Screen | API |
|--------|-----|
| Dashboard | `GET /api/meetings/today` |
| Meetings | `GET /api/meetings/reports`, `GET /api/meetings/:id` |
| Bot | `POST .../bot/start`, `POST .../bot/stop`, `GET .../status` |
| Action items | `GET/PATCH /api/action-items` |
| Workspaces | `GET /api/workspaces` |
| Recording | `GET /api/recordings/:id` |

---

## 10. Clerk Android (Sprint 8)

1. Clerk dashboard → Android app, package `com.artivaa.app`
2. SHA-256: `./gradlew signingReport`
3. Token → Retrofit interceptor

---

## 11. New chat starter prompt

```
I'm building Artivaa Android (Jetpack Compose, Kotlin).

READ FIRST (mandatory):
1. documents/artivaa-android-compose-plan.md
2. documents/android_compose_learning.md
3. documents/artivaa-android-app-design-spec.md

Status: Sprint 1 & 2 DONE. Now Sprint 3 (Reports + Action Items UI, mock only).

Rules:
- No new random screens — only design spec list
- MockData.kt only — no API until Sprint 8
- Match web colors/fonts (#6C3FF5, Work Sans + Inter)
- Explain Compose concepts briefly; point to android_compose_learning.md

Continue Sprint 3 step by step.
```

---

## 12. Related docs

| File | Purpose |
|------|---------|
| [`artivaa-android-compose-plan.md`](./artivaa-android-compose-plan.md) | This file — sprints & phases |
| [`android_compose_learning.md`](./android_compose_learning.md) | **Compose / Kotlin / Coroutines learning + examples** |
| [`artivaa-android-app-design-spec.md`](./artivaa-android-app-design-spec.md) | All screens, colors, components |
| [`artivaa-plans-and-features.md`](./artivaa-plans-and-features.md) | Free/Pro/Elite UI gates |

---

## 13. Checklist

**Phase 1 (before Sprint 8):**
- [ ] Sprint 3–7 complete
- [ ] All routes in NavHost
- [ ] FREE / PRO / ELITE mock states tested
- [ ] Web parity checklist green

**Phase 2 (before beta):**
- [ ] Render API live
- [ ] Clerk Android configured
- [ ] Postman tested with token

---

**Build order:** ✅ Sprint 1–2 → Sprint 3–7 full UI → Sprint 8+ API / bot / integrations.  
**Don't skip UI phase** — random screens se app web jaisi nahi lagegi.
