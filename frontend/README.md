# Artivaa Frontend

Next.js 15 web application — the UI layer for the Artivaa AI Meeting Platform.

## What's in Here

- Dashboard with personal and workspace modes
- Meeting detail pages with AI summaries, transcripts, and action items
- Calendar integrations (Google, Teams, Outlook)
- Workspace management (members, invites, move requests)
- Settings, billing, and integrations pages
- Clerk authentication
- Drizzle ORM + PostgreSQL for data

---

## Prerequisites

- Node.js 18+
- PostgreSQL database (local or hosted)
- Clerk account — [clerk.com](https://clerk.com)
- Google Cloud project (for Calendar API + Gemini AI)
- Microsoft Azure app (for Teams/Outlook Calendar — optional)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/artivaa

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
CLERK_WEBHOOK_SECRET=whsec_...

# Google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback/google

# Microsoft (optional — for Teams/Outlook calendar)
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/calendar/callback/microsoft

# Gemini AI
GOOGLE_GEMINI_API_KEY=...

# OpenAI (for Whisper transcription)
OPENAI_API_KEY=sk-...

# Backend Express API
NEXT_PUBLIC_API_URL=http://localhost:3001

# Razorpay (billing)
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=...

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set up the database

```bash
# Push schema to database
npm run db:push

# Or generate and run migrations
npm run db:generate
npm run db:migrate
```

### 4. Run the development server

```bash
npm run dev
```

App runs at: `http://localhost:3000`

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type check |
| `npm run db:push` | Push schema changes to DB |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run pending migrations |
| `npm test` | Run tests (single run) |
| `npm run test:watch` | Run tests in watch mode |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/              # Sign in / Sign up pages
│   ├── api/                 # Next.js API routes (proxies to Express backend)
│   ├── dashboard/           # All dashboard pages
│   │   ├── page.tsx         # Dashboard home (personal + workspace mode)
│   │   ├── meetings/        # Meetings list + detail
│   │   ├── action-items/    # Action items page
│   │   ├── reports/         # Reports page
│   │   ├── integrations/    # Integrations page
│   │   ├── settings/        # Settings page
│   │   ├── billing/         # Billing page
│   │   └── workspace/       # Workspace management page
│   └── invite/[token]/      # Invite accept page
├── components/
│   └── layout/              # Sidebar, header, account components
├── contexts/
│   └── workspace-context.tsx # Workspace switcher context
├── features/                # Feature-specific components and logic
│   ├── meetings/
│   ├── workspaces/
│   ├── integrations/
│   └── tools/
├── hooks/                   # Custom React hooks
├── lib/                     # Utilities, API clients, auth helpers
└── db/
    └── schema/              # Drizzle ORM schema definitions
```

---

## Key Features

### Workspace Mode
The app supports personal mode and workspace mode. Switch between them using the workspace switcher in the sidebar. The URL `?workspace=<id>` is the source of truth for the active workspace.

### Calendar Integration
Connect Google Calendar, Microsoft Teams, or Outlook Calendar from the Integrations page. Connected calendars show meetings on the Dashboard and Meetings page.

### Bot Setup (for recording meetings)
```bash
npm run setup:bot          # Install Playwright + Whisper
npm run setup:bot-profile  # Set up browser profile for bot login
```

---

## Database

Uses PostgreSQL with Drizzle ORM. Schema files are in `src/db/schema/`. Migration files are in `drizzle/`.

To reset and repush schema:
```bash
npm run db:push
```
