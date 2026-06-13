# Artivaa — JavaScript, TypeScript, React, Next.js & Node.js (Deep Guide)

> **For:** Pulkit (Java/Kotlin/Android background)  
> **Goal:** Is guide se tum **actually** samajh paoge — sirf naam nahi, har concept line-by-line.  
> **Use with:** `artivaa-tech-learning-guide.md` (baaki topics: DB, bot, AI, deploy)

**Kaise padho:**
1. Ek chapter ek din — rush mat karo
2. Har section ke baad **browser console** ya **small file** mein code likh ke run karo
3. Artivaa repo mein wahi file dhundho jo example mein hai — real code dekho

---

## Table of contents

**Part A — JavaScript**
1. [JavaScript kya hai aur kyun](#1-javascript-kya-hai-aur-kyun)
2. [Variables, types, operators](#2-variables-types-operators)
3. [Functions — har tarah se](#3-functions--har-tarah-se)
4. [Objects & arrays](#4-objects--arrays)
5. [Classes (Java jaisa OOP)](#5-classes-java-jaisa-oop)
6. [Async JavaScript — sabse important](#6-async-javascript--sabse-important)
7. [Modules — import/export](#7-modules--importexport)
8. [Error handling & JSON](#8-error-handling--json)
9. [Browser vs Node — kya alag hai](#9-browser-vs-node--kya-alag-hai)

**Part B — TypeScript**
10. [TypeScript kyun](#10-typescript-kyun)
11. [Basic types](#11-basic-types)
12. [Interfaces & type aliases](#12-interfaces--type-aliases)
13. [Generics](#13-generics)
14. [Union, optional, narrowing](#14-union-optional-narrowing)
15. [Async typing & API contracts](#15-async-typing--api-contracts)

**Part C — React**
16. [React kya hai](#16-react-kya-hai)
17. [JSX — HTML jaisa JavaScript](#17-jsx--html-jaisa-javascript)
18. [Props & state](#18-props--state)
19. [useEffect, useCallback, useMemo](#19-useeffect-usecallback-usememo)
20. [Context & custom hooks](#20-context--custom-hooks)

**Part D — Next.js**
21. [Next.js kya solve karta hai](#21-nextjs-kya-solve-karta-hai)
22. [App Router & file structure](#22-app-router--file-structure)
23. [Server vs Client Components](#23-server-vs-client-components)
24. [Routing, layouts, loading](#24-routing-layouts-loading)
25. [Data fetching patterns in Artivaa](#25-data-fetching-patterns-in-artivaa)

**Part E — Node.js & Express**
26. [Node.js kya hai](#26-nodejs-kya-hai)
27. [npm, package.json, scripts](#27-npm-packagejson-scripts)
28. [Express request lifecycle](#28-express-request-lifecycle)
29. [Middleware — deep dive](#29-middleware--deep-dive)
30. [Real Artivaa API walkthrough](#30-real-artivaa-api-walkthrough)

**Part F — Practice**
31. [Exercises with answers](#31-exercises-with-answers)
32. [Artivaa files study order](#32-artivaa-files-study-order)

---

# Part A — JavaScript

## 1. JavaScript kya hai aur kyun

### Simple definition

**JavaScript (JS)** ek programming language hai jo pehle sirf browser mein chalti thi (websites interactive banane ke liye). Aaj **Node.js** ki wajah se server, bot, scripts — sab jagah chalti hai.

Artivaa mein:
| Layer | Language |
|-------|----------|
| Frontend UI | TypeScript → JavaScript (compile hota hai) |
| Express API | TypeScript → JavaScript |
| Meeting bot | JavaScript (legacy-bot/) |
| Transcription script | Python (exception) |

### Java/Kotlin se farq

| Concept | Java/Kotlin | JavaScript |
|---------|-------------|------------|
| Compile | `.java` → bytecode, `.kt` → bytecode | TS → JS (optional), phir browser/Node run karta hai |
| Types | Strong, static | Weak, dynamic (TS add karta hai static types) |
| `main()` | Entry point fixed | Node: file run; Browser: script load |
| Threads | Multi-thread common | **Single thread** + event loop (async se kaam hota hai) |
| Null | Kotlin `String?`, Java `@Nullable` | `null` aur `undefined` dono alag cheezein |

### Pehla program — browser console

Chrome → F12 → Console tab:

```javascript
console.log("Hello Artivaa");
const x = 10;
console.log(x * 2); // 20
```

**Node mein (terminal):**

```bash
node -e "console.log('Hello from Node')"
```

Yahi language tum Compose UI ke andar logic likhne ke liye use karoge — bas environment alag hai (browser vs Node).

---

## 2. Variables, types, operators

### `let`, `const`, `var` — teen tarah declare kar sakte ho

```javascript
let count = 0;        // badal sakta hai (reassign)
count = 1;

const API_URL = "https://artivaa-api.onrender.com";  // reassign NAHI
// API_URL = "other";  // ❌ Error

var oldStyle = 1;     // purana — avoid karo (scope bugs)
```

| Keyword | Java/Kotlin equivalent | Kab use karo |
|---------|------------------------|--------------|
| `const` | `val` | Default choice — value same rahegi |
| `let` | `var` | Value badlegi |
| `var` | old Java style | Mat use karo |

### Primitive types (built-in)

```javascript
const name = "Pulkit";           // string
const age = 28;                  // number (int/float alag nahi — sab number)
const isActive = true;           // boolean
const nothing = null;            // intentional empty
let notSet;                      // undefined — declare kiya, value nahi di
const big = 9007199254740991n;   // bigint (rare)
const sym = Symbol("id");        // symbol (rare)
```

**Important:** JavaScript mein `3.14` aur `3` dono `number` type hain. Kotlin jaisa `Int` vs `Double` alag nahi.

### Type coercion (yeh confusing hai — samajh lo)

```javascript
"5" + 1      // "51"  — string concat (number → string)
"5" - 1      // 4     — math (string → number)
0 == false   // true  — loose equality (avoid)
0 === false  // false — strict equality (hamesha === use karo)
null == undefined  // true
null === undefined // false
```

**Rule:** Hamesha `===` aur `!==` use karo, `==` mat.

### Template strings (Kotlin string templates jaisa)

```kotlin
// Kotlin
val msg = "Meeting $title status: $status"
```

```javascript
const msg = `Meeting ${title} status: ${status}`;
```

### Operators — same as Java mostly

```javascript
a + b, a - b, a * b, a / b, a % b
a && b, a || b, !a
a ?? b   // nullish coalescing — agar a null/undefined ho to b (Kotlin elvis `?:`)
a?.b     // optional chaining — agar a null/undefined to undefined (Kotlin same)
```

**Artivaa example:**

```javascript
const token = req.headers.authorization?.slice(7);  // Bearer hatao
const title = meeting.title ?? "Untitled Meeting";
```

---

## 3. Functions — har tarah se

### Normal function (Java method jaisa)

```javascript
function add(a, b) {
  return a + b;
}
```

### Arrow function (lambda jaisa — bahut common)

```javascript
const add = (a, b) => a + b;

const double = (x) => {
  return x * 2;
};

// Ek parameter ho to brackets optional
const greet = name => `Hello ${name}`;
```

**Kotlin equivalent:**

```kotlin
val add = { a: Int, b: Int -> a + b }
```

### Default parameters

```javascript
function fetchMeetings(page = 1, limit = 20) {
  // ...
}
```

### Rest parameters (...)

```javascript
function sum(...numbers) {
  return numbers.reduce((a, b) => a + b, 0);
}
sum(1, 2, 3); // 6
```

### Functions are first-class (Java 8+ jaisa)

Functions ko variable mein rakh sakte ho, argument pass kar sakte ho:

```javascript
const operations = {
  start: (id) => console.log("Start", id),
  stop: (id) => console.log("Stop", id),
};
operations.start("meeting-123");
```

**Artivaa `api-client.ts` mein:**

```typescript
export function createApiFetch(getToken) {
  return async function (path, init) {  // ← yeh returned function hai
    const token = await getToken();
    // ...
    return fetch(url, { headers });
  };
}
```

Yeh **higher-order function** hai — function return kar raha hai function.

---

## 4. Objects & arrays

### Object literal (Map / data class jaisa, lekin flexible)

```javascript
const meeting = {
  id: "abc-123",
  title: "Standup",
  status: "completed",
  transcript: null,
};

// Access
meeting.title           // dot
meeting["status"]       // bracket — dynamic key ke liye

// Add / change
meeting.recordingUrl = "https://...";
```

**Destructuring (bahut use hota hai):**

```javascript
const { id, title, status } = meeting;
// id = meeting.id, title = meeting.title, ...

const { workspaceId: _w, ...rest } = init ?? {};
// workspaceId alag nikala, baaki sab `rest` mein — Artivaa api-client mein yahi pattern
```

### Array

```javascript
const meetings = ["Standup", "Review", "Planning"];

meetings.push("Retro");        // end add
meetings.length;               // 4
meetings.map(m => m.toUpperCase());
meetings.filter(m => m !== "Review");
meetings.find(m => m === "Standup");
```

### `map`, `filter`, `reduce` — Java streams jaisa

| Java Stream | JavaScript |
|-------------|------------|
| `.stream().map()` | `.map()` |
| `.filter()` | `.filter()` |
| `.reduce()` | `.reduce()` |
| `.findFirst()` | `.find()` |
| `.forEach()` | `.forEach()` |

```javascript
const ids = meetings
  .filter(m => m.status === "completed")
  .map(m => m.id);
```

### Spread operator (...)

```javascript
const a = [1, 2];
const b = [...a, 3, 4];  // [1, 2, 3, 4]

const defaults = { page: 1, limit: 20 };
const options = { ...defaults, page: 2 };  // page override
```

**Artivaa fetch call:**

```javascript
return fetch(url, { ...fetchInit, headers });
// fetchInit ki saari properties copy + headers override
```

---

## 5. Classes (Java jaisa OOP)

JavaScript mein bhi classes hain (ES6+):

```javascript
class MeetingService {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;  // field
  }

  async start(meetingId) {
    const res = await fetch(`${this.apiUrl}/meetings/${meetingId}/bot/start`, {
      method: "POST",
    });
    return res.json();
  }
}

const service = new MeetingService("https://api.example.com");
await service.start("123");
```

| Java | JavaScript class |
|------|------------------|
| `private String id` | `#id` (private fields) ya convention `_id` |
| `extends Base` | `extends Base` |
| `@Override` | same method name in subclass |
| Interface | TypeScript `interface` (runtime pe nahi hota) |

**Artivaa mein:** Zyada tar functional style (functions + modules), kam classes — Express routes functions hain, React components functions hain.

---

## 6. Async JavaScript — sabse important

Yeh woh topic hai jahan Java developers aksar atakte hain. **Samajh lo deeply.**

### Problem: blocking vs non-blocking

Java (typical servlet):

```
Request → Thread wait for DB → Thread wait for HTTP → Response
```

Node (single thread):

```
Request → start DB query → (thread free for other requests)
         → DB returns → callback runs → Response
```

Isliye JavaScript mein **async/await** aur **Promises** har jagah hain.

### Callback (purana style)

```javascript
setTimeout(() => {
  console.log("3 seconds baad");
}, 3000);
```

### Promise — "future" jaisa

```javascript
const promise = fetch("https://api.example.com/health");

promise
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));
```

**States:**
- `pending` — chal raha hai
- `fulfilled` — success, value mila
- `rejected` — error

### async/await — sabse readable (Kotlin coroutines jaisa feel)

```javascript
async function checkHealth() {
  try {
    const response = await fetch("https://api.example.com/health");
    const data = await response.json();
    console.log(data);
    return data;
  } catch (err) {
    console.error("Failed:", err);
    throw err;
  }
}
```

| Kotlin | JavaScript |
|--------|------------|
| `suspend fun` | `async function` |
| `withContext(Dispatchers.IO)` | await fetch/db (Node handles I/O) |
| `launch { }` | call async function (no await at top level in old JS) |
| `Deferred<T>` | `Promise<T>` |

**Rule:** `await` sirf `async function` ke andar.

### Parallel vs sequential

```javascript
// Sequential — slow (ek ke baad ek)
const a = await fetchA();
const b = await fetchB();

// Parallel — fast (dono saath)
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

**Artivaa polling example (concept):**

```javascript
async function pollUntilDone(meetingId) {
  while (true) {
    const res = await clientApiFetch(`/api/meetings/${meetingId}/status`);
    const data = await res.json();
    if (data.status === "completed" || data.status === "failed") {
      return data;
    }
    await new Promise(r => setTimeout(r, 3000));  // 3 sec wait
  }
}
```

### Event loop (short mental model)

```
Call stack     →  sync code abhi chal raha
Task queue     →  setTimeout, I/O callbacks ready
Microtask queue → Promise.then / await continuations (pehle run)
```

**Matlab:** Heavy CPU loop mat chalao Node main thread pe — poora server block ho jayega. I/O (network, disk) async hai.

---

## 7. Modules — import/export

### ES Modules (Artivaa mein yeh use hota hai)

**Export:**

```javascript
// math.js
export function add(a, b) { return a + b; }
export const PI = 3.14;
export default function multiply(a, b) { return a * b; }
```

**Import:**

```javascript
import multiply, { add, PI } from "./math.js";
```

| Java/Kotlin | JS Module |
|-------------|-----------|
| `package com.artivaa.api` | folder structure + import path |
| `public class X` | `export` |
| `import com.artivaa.X` | `import { X } from "..."` |

**Artivaa:**

```typescript
import { clientApiFetch } from "@/lib/api-client";
import type { MeetingDetailResponse } from "@/features/meetings/types";
```

- `@/` = `frontend/src/` (tsconfig paths alias)
- `import type` = sirf types ke liye, compile ke baad delete ho jata hai

### CommonJS (purana Node style — bot mein kabhi dikhe)

```javascript
const express = require("express");
module.exports = { createApp };
```

Express API mostly ES modules + TypeScript compile.

---

## 8. Error handling & JSON

### try/catch/finally (Java jaisa)

```javascript
try {
  const data = JSON.parse(text);
} catch (err) {
  console.error(err.message);
} finally {
  // hamesha chalega
}
```

### JSON — web ka data format

```javascript
const obj = { id: "123", title: "Meet" };
const str = JSON.stringify(obj);     // object → string
const back = JSON.parse(str);        // string → object
```

**Artivaa `meetings/api.ts` pattern:**

```typescript
async function readJsonFromMeetingResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim().startsWith("{")) {
    throw new Error("Server returned non-JSON...");
  }
  return JSON.parse(text);
}
```

Kyunki kabhi server HTML error page bhej deta hai — direct `response.json()` crash kar sakta hai.

---

## 9. Browser vs Node — kya alag hai

| Feature | Browser | Node.js |
|---------|---------|---------|
| DOM / `document` | ✅ | ❌ |
| `window`, `localStorage` | ✅ | ❌ |
| `fetch` | ✅ (modern) | ✅ (Node 18+) |
| `fs` (files) | ❌ | ✅ |
| `process.env` | ❌ | ✅ |
| Clerk UI | ✅ | ❌ |

**Artivaa frontend** — browser APIs + React  
**Artivaa Express** — `process.env`, PostgreSQL, file uploads  
**Artivaa bot** — Playwright (browser control), ffmpeg (child process)

---

# Part B — TypeScript

## 10. TypeScript kyun

JavaScript dynamically typed hai:

```javascript
meeting.titel = "Oops";  // typo — runtime pe undefined, bug
```

TypeScript compile time pe pakad leta hai:

```typescript
meeting.title = "OK";
meeting.titel = "Oops";  // ❌ Compile error: Property 'titel' does not exist
```

**Flow:**

```
.ts / .tsx files  →  tsc (compiler)  →  .js files  →  Node / Browser runs
```

Next.js build automatically TypeScript compile karta hai.

---

## 11. Basic types

```typescript
let id: string = "abc-123";
let count: number = 0;
let active: boolean = true;
let transcript: string | null = null;   // nullable
let summary: unknown = apiResponse;     // kuch bhi ho sakta — pehle check karo

// Arrays
const ids: string[] = ["a", "b"];
const meetings: Meeting[] = [];

// Tuple (fixed length array)
type Pair = [string, number];
const p: Pair = ["page", 1];

// Enum (Java enum jaisa)
enum MeetingStatus {
  Pending = "pending",
  Recording = "recording",
  Completed = "completed",
}
```

### Type inference (compiler khud guess karta hai)

```typescript
const title = "Standup";  // inferred as string
// title = 123;  // ❌ error
```

---

## 12. Interfaces & type aliases

### Interface (Java interface jaisa — shape define karta hai)

```typescript
interface MeetingDetailRecord {
  id: string;
  title: string;
  status: MeetingStatus;
  transcript: string | null;
  recordingUrl: string | null;
}
```

### Type alias (union / complex types ke liye)

```typescript
type MeetingStatus = "pending" | "recording" | "completed" | "failed";

type TodayMeetingsResult =
  | { status: "connected"; meetings: GoogleCalendarMeeting[] }
  | { status: "auth_required"; meetings: GoogleCalendarMeeting[]; message: string }
  | { status: "not_connected"; meetings: GoogleCalendarMeeting[]; message: string };
```

Yeh **discriminated union** hai — Kotlin `sealed class` jaisa:

```kotlin
sealed class TodayMeetingsResult {
  data class Connected(val meetings: List<Meeting>) : TodayMeetingsResult()
  data class AuthRequired(val message: String, ...) : TodayMeetingsResult()
}
```

**Switch pe narrow:**

```typescript
function handle(result: TodayMeetingsResult) {
  if (result.status === "auth_required") {
    console.log(result.message);  // TS knows message exists here
  }
}
```

### Interface vs type — practical rule

- Object shape → `interface` (extend kar sakte ho)
- Union / primitive alias → `type`

---

## 13. Generics

Java: `List<String>`, Kotlin: `List<T>`

```typescript
function first<T>(items: T[]): T | undefined {
  return items[0];
}

const a = first<string>(["a", "b"]);
const b = first([1, 2]);  // inferred number

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

type MeetingListResponse = ApiResponse<MeetingDetailRecord[]>;
```

**Artivaa React hook example (concept):**

```typescript
function useFetch<T>(url: string): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  // ...
  return { data, loading };
}
```

---

## 14. Union, optional, narrowing

### Optional properties

```typescript
interface StartBotOptions {
  meetingUrl: string;
  workspaceId?: string;  // optional — ho bhi sakta hai nahi bhi
}
```

### Narrowing

```typescript
function printTranscript(t: string | null) {
  if (t === null) {
    console.log("No transcript yet");
    return;
  }
  console.log(t.length);  // TS knows t is string here
}
```

### `as` casting (kam use karo)

```typescript
const data = JSON.parse(text) as MeetingDetailResponse;
```

Sirf jab tum sure ho — warna runtime crash.

---

## 15. Async typing & API contracts

```typescript
async function getMeetingDetail(id: string): Promise<MeetingDetailResponse> {
  const res = await clientApiFetch(`/api/meetings/${id}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as MeetingDetailResponse;
}
```

**Promise chain typing:**

```typescript
clientApiFetch("/api/meetings")
  .then((res: Response) => res.json())
  .then((data: MeetingSessionListResponse) => data.meetings);
```

**Express request typing (Artivaa pattern):**

```typescript
// Custom property clerkAuth middleware add karta hai
declare global {
  namespace Express {
    interface Request {
      appUser: AppUser;
    }
  }
}
```

Ab `req.appUser.id` type-safe hai.

---

# Part C — React

## 16. React kya hai

**React** = UI library. Tum **components** likhte ho (functions), jo HTML-like output return karte hain. Data change → React automatically UI update karta hai (**re-render**).

| Android Compose | React |
|-----------------|-------|
| `@Composable fun MeetingCard()` | `function MeetingCard()` |
| `State`, `remember` | `useState` |
| `LaunchedEffect` | `useEffect` |
| `CompositionLocal` | `Context` |
| Recomposition | Re-render |

React sirf **view layer** hai — routing Next.js, API calls alag files (`features/meetings/api.ts`).

---

## 17. JSX — HTML jaisa JavaScript

`.tsx` files mein JSX:

```tsx
function StatusChip({ status }: { status: string }) {
  const color = status === "completed" ? "green" : "gray";
  return (
    <span className={`rounded px-2 py-1 bg-${color}-100`}>
      {status}
    </span>
  );
}
```

**Rules:**
1. Ek component ek `return` — usually ek root element (ya `<>...</>` fragment)
2. `className` not `class` (class JS reserved word hai)
3. `{expression}` — JavaScript embed
4. Self-closing tags: `<img />`, `<input />`

**Compile hone ke baad (roughly):**

```javascript
return React.createElement("span", { className: "..." }, status);
```

---

## 18. Props & state

### Props (parent → child, read-only)

```tsx
interface MeetingCardProps {
  title: string;
  status: string;
  onStart: () => void;
}

function MeetingCard({ title, status, onStart }: MeetingCardProps) {
  return (
    <div>
      <h3>{title}</h3>
      <button onClick={onStart}>Start Notetaker</button>
    </div>
  );
}
```

Kotlin: constructor params + callbacks.

### State (component ki apni memory)

```tsx
function MeetingDetailPage({ meetingId }: { meetingId: string }) {
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<MeetingDetailRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  // setMeeting(newData) call → component dubara render
}
```

**Important rules:**
1. State directly mutate mat karo: `meeting.title = "x"` ❌  
   Use: `setMeeting({ ...meeting, title: "x" })` ✅
2. State update **async** ho sakta hai — batch hota hai
3. Same component multiple instances → alag state

---

## 19. useEffect, useCallback, useMemo

### useEffect — side effects (API call, subscription, timer)

```tsx
useEffect(() => {
  let cancelled = false;

  async function load() {
    setLoading(true);
    try {
      const data = await getMeetingDetail(meetingId);
      if (!cancelled) setMeeting(data);
    } catch (e) {
      if (!cancelled) setError(String(e));
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  load();

  return () => {
    cancelled = true;  // cleanup — unmount pe ya meetingId change pe
  };
}, [meetingId]);  // dependency array — yeh change → effect dubara
```

| Dependency | Matlab |
|------------|--------|
| `[]` | Sirf mount pe ek baar (component load) |
| `[meetingId]` | meetingId change pe dubara |
| No array | Har render pe (usually avoid) |

**Polling pattern (Artivaa meeting detail):**

```tsx
useEffect(() => {
  if (status !== "recording" && status !== "processing") return;

  const interval = setInterval(async () => {
    const res = await clientApiFetch(`/api/meetings/${id}/status`);
    const data = await res.json();
    setStatus(data.status);
  }, 3000);

  return () => clearInterval(interval);
}, [id, status]);
```

### useCallback — function reference stable rakho

```tsx
const handleStart = useCallback(async () => {
  await startBot(meetingId);
}, [meetingId]);
```

Child ko prop pass karte ho to unnecessary re-render kam.

### useMemo — expensive calculation cache

```tsx
const sortedMeetings = useMemo(
  () => meetings.sort((a, b) => b.date.localeCompare(a.date)),
  [meetings]
);
```

---

## 20. Context & custom hooks

### Context — global state (ViewModel / singleton jaisa)

```tsx
// workspace-context.tsx (simplified)
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  return (
    <WorkspaceContext.Provider value={{ workspaceId, setWorkspaceId }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be inside Provider");
  return ctx;
}
```

Kisi bhi child component mein:

```tsx
const { workspaceId } = useWorkspace();
await clientApiFetch("/api/meetings", { workspaceId });
```

### Custom hook — logic reuse

```tsx
function useApiFetch() {
  const { getToken } = useAuth();
  return useMemo(() => createApiFetch(getToken), [getToken]);
}

// Component mein:
const apiFetch = useApiFetch();
const res = await apiFetch("/api/meetings");
```

---

# Part D — Next.js

## 21. Next.js kya solve karta hai

Plain React app mein tum khud setup karte ho:
- URL routing
- Build tool (webpack/vite)
- SSR/SEO
- API endpoints

**Next.js** yeh sab deta hai + Vercel pe one-click deploy.

Artivaa frontend = **Next.js 15 App Router** (`frontend/src/app/`).

---

## 22. App Router & file structure

```
frontend/src/app/
├── layout.tsx              # Root layout — har page wrap
├── page.tsx                # URL: /
├── dashboard/
│   ├── layout.tsx          # Dashboard shell (sidebar)
│   └── meetings/
│       ├── page.tsx        # URL: /dashboard/meetings
│       └── [id]/
│           └── page.tsx    # URL: /dashboard/meetings/abc-123
├── sign-in/[[...sign-in]]/page.tsx   # Clerk sign-in
└── api/                    # Next.js API routes (proxy/legacy)
    └── meetings/[id]/route.ts
```

| File | URL |
|------|-----|
| `app/foo/page.tsx` | `/foo` |
| `app/foo/[id]/page.tsx` | `/foo/anything` |
| `app/api/health/route.ts` | `/api/health` |

**Dynamic segment `[id]`:**

```tsx
// app/dashboard/meetings/[id]/page.tsx
export default function MeetingPage({ params }: { params: { id: string } }) {
  return <MeetingDetail meetingId={params.id} />;
}
```

---

## 23. Server vs Client Components

Next.js 13+ default = **Server Component** (file mein `"use client"` nahi hai).

| Server Component | Client Component |
|------------------|------------------|
| Server pe run, HTML bhejta hai | Browser pe run, interactive |
| DB/API direct call kar sakta (secret safe) | `useState`, `useEffect`, onClick |
| No useState/useEffect | `"use client"` top of file |
| Fast first paint | JS bundle browser ko |

**Artivaa pattern:**

```tsx
// meeting-detail.tsx — top pe:
"use client";

import { useState, useEffect } from "react";
// ... hooks, buttons, polling
```

Dashboard pages jo sirf layout hain — server component ho sakte hain.  
Koi bhi button, form, polling → **client component**.

**Rule of thumb:** Leaf interactive components ko `"use client"` do; jitna kam client bundle utna better.

---

## 24. Routing, layouts, loading

### Layout (nested UI)

```tsx
// dashboard/layout.tsx
export default function DashboardLayout({ children }) {
  return (
    <div className="flex">
      <DashboardSidebar />
      <main>{children}</main>
    </div>
  );
}
```

Har `/dashboard/*` page is layout ke andar render hoga — sidebar repeat code nahi.

### Navigation

```tsx
import Link from "next/link";
import { useRouter } from "next/navigation";

<Link href="/dashboard/meetings">Meetings</Link>

const router = useRouter();
router.push(`/dashboard/meetings/${id}`);
```

### Environment variables

```bash
# .env.local (frontend)
NEXT_PUBLIC_API_URL=https://artivaa-api.onrender.com
```

- `NEXT_PUBLIC_` prefix → browser mein visible (safe for public URLs)
- Bina prefix → sirf server (secrets)

---

## 25. Data fetching patterns in Artivaa

Artivaa **Express API** use karti hai (alag server). Next.js mostly UI.

### Pattern 1: Client-side fetch (current main pattern)

```
Browser → Clerk JWT → Express API → JSON → React state
```

Files:
- `frontend/src/lib/api-client.ts` — token + headers
- `frontend/src/features/meetings/api.ts` — meeting-specific calls
- Components — `useEffect` se load

### Pattern 2: Next.js API route as proxy (kuch routes)

```
Browser → /api/meetings/123 → Next route.ts → Express → response
```

Kabhi CORS ya legacy ke liye. Example: `frontend/src/app/api/meetings/[id]/bot/start/route.ts`

### Pattern 3: Server Component fetch (future optimization)

```tsx
// Server Component — no "use client"
async function MeetingsPage() {
  const res = await fetch(`${process.env.API_URL}/meetings`, {
    headers: { Authorization: `Bearer ${token}` },  // server-side auth tricky with Clerk
  });
  const meetings = await res.json();
  return <MeetingList initialData={meetings} />;
}
```

Clerk ke saath server fetch thoda setup mangta hai — isliye Artivaa abhi zyada client fetch use karti hai.

### Full flow — "Start Notetaker" button

```
1. User clicks button (Client Component)
2. onClick → startMeetingBot(id) in features/meetings/api.ts
3. clientApiFetch POST /api/meetings/:id/bot/start
   Headers: Authorization Bearer, x-workspace-id
4. Express clerkAuth → verify user → botClient.startBot()
5. HTTP to bot (ngrok/Oracle) POST /join
6. 202 Accepted → UI shows "recording"
7. useEffect setInterval → GET /status every 3s
8. status === completed → fetch full meeting detail → show transcript
```

---

# Part E — Node.js & Express

## 26. Node.js kya hai

**Node.js** = JavaScript runtime **browser ke bina**. Chrome ka V8 engine + APIs (file system, network, processes).

```
Java:  JVM runs .class
Node:  V8 runs .js
```

Artivaa Express API `backend/express-api/` Node pe chalti hai.

### Event-driven architecture

```javascript
const http = require("http");
const server = http.createServer((req, res) => {
  res.end("Hello");
});
server.listen(3001);
```

Express iske upar sugar layer hai.

### process object

```javascript
process.env.PORT          // environment variables
process.env.DATABASE_URL
process.cwd()             // current working directory
process.on("SIGTERM", shutdown)  // Render deploy pe graceful shutdown
```

**Artivaa `index.ts`:**

```typescript
const server = app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
```

Render jab naya deploy karta hai → SIGTERM → server close → DB pool close → clean exit.

---

## 27. npm, package.json, scripts

```json
{
  "name": "express-api",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0"
  }
}
```

| Command | Kya karta hai |
|---------|---------------|
| `npm install` | `package.json` se dependencies download → `node_modules/` |
| `npm run dev` | Development server + hot reload |
| `npm run build` | TypeScript → JavaScript in `dist/` |
| `npm start` | Production — compiled JS run |

**Java parallel:** `package.json` ≈ `build.gradle`, `npm install` ≈ Gradle sync.

### node_modules

Dependencies yahan install hoti hain — **git mein commit mat karo**. `package-lock.json` exact versions lock karta hai.

---

## 28. Express request lifecycle

### Minimal Express app

```javascript
import express from "express";

const app = express();

app.use(express.json());  // middleware — body parse

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(3001);
```

### Request object (`req`)

```typescript
req.method        // GET, POST, ...
req.path          // /api/meetings/123
req.params.id     // route :id
req.query.page    // ?page=2
req.body          // JSON body (POST)
req.headers.authorization
req.appUser       // Artivaa custom — clerkAuth se
```

### Response object (`res`)

```typescript
res.status(202).json({ status: "accepted" });
res.status(401).json({ error: "Unauthorized" });
res.send("plain text");
res.redirect(302, "/login");
```

### Router (modular routes)

```typescript
// routes/meetings.ts
export const meetingsRouter = Router();

meetingsRouter.get("/", async (req, res, next) => { ... });
meetingsRouter.post("/:id/bot/start", async (req, res, next) => { ... });

// app.ts
app.use("/api/meetings", meetingsRouter);
```

| Spring | Express |
|--------|---------|
| `@GetMapping("/meetings")` | `router.get("/", ...)` |
| `@PathVariable id` | `req.params.id` |
| `@RequestBody` | `req.body` |
| `@RequestHeader` | `req.headers` |

---

## 29. Middleware — deep dive

Middleware = `(req, res, next) => void` chain.

```
Incoming request
  ↓
helmet()           — security headers
  ↓
cors()             — Vercel origin allow
  ↓
express.json()     — body parse
  ↓
requestLogger
  ↓
clerkAuth          — JWT verify, req.appUser set
  ↓
rateLimiter
  ↓
route handler      — actual business logic
  ↓
errorHandler       — catch errors, JSON response
```

### clerkAuth (concept)

```typescript
export async function clerkAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, { secretKey: config.clerkSecretKey });
    req.appUser = await syncUserFromClerk(payload.sub);
    next();  // ← agla middleware/handler
  } catch (err) {
    next(err);  // errorHandler tak jayega
  }
}
```

**Agar `next()` call nahi kiya** → request hang.  
**Agar `res.json()` bhej diya** → response khatam, aage mat bhejo.

### Error handling

```typescript
// Route mein
throw new NotFoundError("Meeting not found");
// ya
next(new NotFoundError("Meeting not found"));

// errorHandler middleware
app.use((err, req, res, next) => {
  const status = err.statusCode ?? 500;
  res.status(status).json({ message: err.message });
});
```

Spring `@ControllerAdvice` jaisa.

---

## 30. Real Artivaa API walkthrough

### File: `backend/express-api/src/index.ts`

1. `dotenv.config()` — `.env` load
2. `createApp()` — Express setup
3. `app.listen(3001)`
4. SIGTERM/SIGINT → pool.end() → exit

### File: `backend/express-api/src/app.ts`

- Middleware order matter karta hai
- Routes mount: `/api/meetings`, `/api/workspaces`, `/api/webhooks/clerk`, etc.

### Bot start route (simplified flow)

```typescript
meetingsRouter.post("/:id/bot/start", async (req, res, next) => {
  try {
    const userId = req.appUser.id;
    const meetingId = req.params.id;

    // 1. DB se meeting fetch — user owns it?
    const meeting = await getMeetingForUser(meetingId, userId);
    if (!meeting) throw new NotFoundError("Meeting not found");

    // 2. Bot service ko HTTP call
    await botClient.startBot({
      meetingId,
      meetingUrl: meeting.meetUrl,
    });

    // 3. DB status update
    await updateMeetingStatus(meetingId, "recording");

    // 4. Client ko jaldi response — bot background mein kaam karega
    res.status(202).json({ status: "accepted" });
  } catch (err) {
    next(err);
  }
});
```

**202 Accepted** = "request accept ho gayi, abhi process chal raha hai" — polling ke liye perfect.

### bot-client.ts

```typescript
async function startBot({ meetingId, meetingUrl }) {
  const baseUrl = config.botBaseUrl;  // ngrok ya Oracle VM
  const res = await fetch(`${baseUrl}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meetingId, meetingUrl }),
  });
  if (!res.ok) throw new BotUnavailableError();
}
```

Express API bot ka **client** hai — Retrofit jaisa.

### Upload route (bot → API)

Bot recording complete → `POST /api/recordings/:id/upload` with `BOT_UPLOAD_SECRET` header → file save → `recordingUrl` DB update → frontend audio player kaam kare.

---

# Part F — Practice

## 31. Exercises with answers

### Exercise 1 — Variables & types

```javascript
// Fix the bugs:
let API_URL = "https://api.example.com"
const meeting = { id: 123, title: "Standup" }
meeting.id = "abc"
console.log(meeting.titel)
```

<details>
<summary>Answer</summary>

```javascript
const API_URL = "https://api.example.com";  // URL change nahi hoga usually
const meeting = { id: "123", title: "Standup" };  // id string if UUID
console.log(meeting.title);  // typo fix
```
</details>

### Exercise 2 — async

```javascript
async function getHealth() {
  const res = fetch("/health");  // bug?
  return res.json();
}
```

<details>
<summary>Answer</summary>

Missing `await`:
```javascript
async function getHealth() {
  const res = await fetch("/health");
  return res.json();
}
```
</details>

### Exercise 3 — TypeScript union

```typescript
type Result = { ok: true; data: string } | { ok: false; error: string };

function handle(r: Result) {
  console.log(r.data);  // fix this
}
```

<details>
<summary>Answer</summary>

```typescript
function handle(r: Result) {
  if (r.ok) {
    console.log(r.data);
  } else {
    console.error(r.error);
  }
}
```
</details>

### Exercise 4 — React

List meetings with loading state — pseudo code likho: `useState`, `useEffect`, map.

<details>
<summary>Answer</summary>

```tsx
function MeetingList() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientApiFetch("/api/meetings")
      .then(r => r.json())
      .then(data => setMeetings(data.meetings))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;
  return (
    <ul>
      {meetings.map(m => (
        <li key={m.id}>{m.title}</li>
      ))}
    </ul>
  );
}
```
</details>

### Exercise 5 — Express

`GET /api/meetings/:id` — agar meeting nahi mili to 404 JSON. Pseudo handler likho.

<details>
<summary>Answer</summary>

```typescript
router.get("/:id", async (req, res, next) => {
  try {
    const meeting = await findMeeting(req.params.id, req.appUser.id);
    if (!meeting) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ meeting });
  } catch (e) {
    next(e);
  }
});
```
</details>

---

## 32. Artivaa files study order

Padhne ka recommended order (har file 15–30 min):

| # | File | Seekho |
|---|------|--------|
| 1 | `frontend/src/lib/api-client.ts` | fetch, headers, async, env |
| 2 | `frontend/src/features/meetings/types.ts` | TypeScript interfaces |
| 3 | `frontend/src/features/meetings/api.ts` | API layer, error handling |
| 4 | `frontend/src/features/meetings/components/meeting-detail.tsx` | React hooks, polling, UI |
| 5 | `frontend/src/contexts/workspace-context.tsx` | Context pattern |
| 6 | `frontend/src/app/dashboard/meetings/[id]/page.tsx` | Next.js routing |
| 7 | `backend/express-api/src/index.ts` | Node entry, shutdown |
| 8 | `backend/express-api/src/app.ts` | Express setup |
| 9 | `backend/express-api/src/middleware/clerk-auth.ts` | Middleware |
| 10 | `backend/express-api/src/routes/meetings.ts` | Full business flow |

### Daily practice plan (4 weeks)

| Week | Focus | Daily (1 hr) |
|------|-------|--------------|
| 1 | JavaScript Part A (sections 1–9) | MD padho + 5 console exercises |
| 2 | TypeScript + React (10–20) | Small component likho |
| 3 | Next.js (21–25) | Artivaa page modify karo (label/color) |
| 4 | Node + Express (26–30) | Local API run, curl/Postman test |

---

## Quick reference card

```
JS:     const/let, =>, async/await, .map/.filter, import/export
TS:     interface, type, | union, Promise<T>, generics
React:  useState, useEffect, props, "use client"
Next:   app/page.tsx = route, layout.tsx = shell, [id] = dynamic
Node:   process.env, npm run dev, single-thread + async I/O
Express: app.use(middleware), Router, req/res, next(err)
```

---

*Last updated: May 2026 — Artivaa monorepo (`workflow_builder`)*
