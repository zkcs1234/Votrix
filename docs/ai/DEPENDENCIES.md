# Dependencies

---

## Backend Dependencies

### `express` `^5.2.1`
**Purpose:** HTTP web framework  
**Why:** Core API server. Version 5 adds built-in async error propagation — no need for `express-async-errors`.  
**Used in:** `backend/src/app.js`, all routes and middleware  
**Removable:** No — core framework

---

### `@supabase/supabase-js` `^2.106.2`
**Purpose:** Supabase client for PostgreSQL access  
**Why:** All database queries go through this client using the service role key. Bypasses RLS intentionally.  
**Used in:** `backend/src/config/database.js`, all services  
**Removable:** No — database client

---

### `jsonwebtoken` `^9.0.3`
**Purpose:** JWT sign and verify  
**Why:** Issues and validates access/refresh tokens for authentication  
**Used in:** `backend/src/utils/jwt.js`, `backend/src/middleware/auth.js`, `backend/src/websocket/ws-server.js`  
**Removable:** No — auth core

---

### `bcrypt` `^6.0.0`
**Purpose:** Password hashing  
**Why:** Securely hash and compare passwords using bcrypt  
**Used in:** `backend/src/utils/password.js`, `backend/src/services/auth.service.js`  
**Removable:** No — auth core

---

### `cookie-parser` `^1.4.7`
**Purpose:** Parse HTTP cookies in Express  
**Why:** Required to read `votrix_access`, `votrix_refresh`, and `votrix_csrf` cookies on each request  
**Used in:** `backend/src/app.js`  
**Removable:** No — cookie auth requires it

---

### `cors` `^2.8.6`
**Purpose:** CORS middleware for Express  
**Why:** Allows cross-origin requests from Vercel frontend with credentials  
**Used in:** `backend/src/app.js`  
**Configuration:** Dynamic origin checker that allows configured `CLIENT_URLS` + `*.vercel.app` previews  
**Removable:** No — required for cross-origin frontend

---

### `helmet` `^8.2.0`
**Purpose:** HTTP security headers  
**Why:** Sets secure HTTP headers (CSP, HSTS, XSS protection, etc.)  
**Used in:** `backend/src/app.js`  
**Configuration:** CSP disabled, crossOriginResourcePolicy set to `cross-origin`  
**Removable:** Not recommended — security hardening

---

### `express-rate-limit` `^8.5.2`
**Purpose:** Rate limiting middleware  
**Why:** Prevents brute force on auth endpoints, spam on email endpoints, and abuse of voting endpoints  
**Used in:** `backend/src/middleware/rateLimiter.js`  
**Removable:** Not recommended — security

---

### `cloudinary` `^2.10.0`
**Purpose:** Cloudinary SDK for image uploads  
**Why:** Handles organization logos, event banners, candidate photos, and contestant photos  
**Used in:** `backend/src/config/cloudinary.js`, `backend/src/services/upload.service.js`  
**Removable:** Only if file upload feature is removed

---

### `multer` `^2.1.1`
**Purpose:** Multipart form data / file upload middleware  
**Why:** Parses `multipart/form-data` requests to extract uploaded files before passing to Cloudinary  
**Used in:** `backend/src/middleware/upload.js`  
**Configuration:** In-memory storage (files never written to disk — streamed directly to Cloudinary)  
**Removable:** Only if file upload feature is removed

---

### `resend` `^6.12.4`
**Purpose:** Resend email API client  
**Why:** Sends all transactional emails (invitations, password resets, event notifications)  
**Used in:** `backend/src/config/resend.js`, `backend/src/services/mailer.service.js`  
**Removable:** Only if email feature is removed

---

### `dotenv` `^17.4.2`
**Purpose:** Load `.env` file into `process.env`  
**Why:** Environment variable management for local development  
**Used in:** `backend/src/config/env.js`  
**Removable:** No — required for local dev configuration

---

### `csv-parser` `^3.2.1`
**Purpose:** CSV file parsing  
**Why:** Parses CSV files for bulk voter and judge imports  
**Used in:** `backend/src/services/csv-import.service.js`, `backend/src/services/pageant-csv.service.js`  
**Removable:** Only if CSV import feature is removed

---

### `ws` `^8.13.0`
**Purpose:** WebSocket server library  
**Why:** Powers the custom realtime WebSocket server. Also polyfills `globalThis.WebSocket` for the Supabase client on Node < 22.  
**Used in:** `backend/src/websocket/ws-server.js`, `backend/src/config/database.js`  
**Removable:** Only if realtime feature is removed

---

## Backend Dev Dependencies

### `vitest` `^4.1.7`
**Purpose:** Unit test runner  
**Why:** Fast ESM-compatible test runner for the Node.js backend  
**Used in:** `backend/src/**/*.test.js` (if any)  
**Command:** `npm test`, `npm run test:coverage`

### `jest` `^29.7.0`
**Purpose:** Test framework (legacy / secondary)  
**Why:** Listed but Vitest is the primary runner  
**Note:** May be unused — Vitest is configured as the primary runner

### `supertest` `^7.0.0`
**Purpose:** HTTP integration testing  
**Why:** Test Express routes without starting a real server  
**Used in:** Integration tests

---

## Frontend Dependencies

### `react` + `react-dom` `^19.2.6`
**Purpose:** UI framework  
**Why:** Core React for building the SPA  
**Removable:** No

---

### `react-router-dom` `^7.16.0`
**Purpose:** Client-side routing  
**Why:** SPA navigation, route guards, nested layouts  
**Used in:** `frontend/src/app/router.jsx`, all pages  
**Removable:** No

---

### `axios` `^1.16.1`
**Purpose:** HTTP client  
**Why:** All API calls from frontend to backend. Configured with interceptors for CSRF, auth refresh, and error handling.  
**Used in:** `frontend/src/services/api.js`, all service files  
**Removable:** Could be replaced with `fetch` but significant refactor required

---

### `zustand` `^5.0.14`
**Purpose:** Global state management  
**Why:** Minimal boilerplate for 3 stores: auth, theme, toast  
**Used in:** `frontend/src/store/`  
**Removable:** Could use React Context but Zustand is simpler

---

### `react-hook-form` `^7.76.1`
**Purpose:** Form state management  
**Why:** Efficient controlled forms with minimal re-renders  
**Used in:** All forms throughout the app  
**Removable:** No — deeply integrated

---

### `@hookform/resolvers` `^5.4.0`
**Purpose:** Validation resolver adapters for react-hook-form  
**Why:** Connects Zod schemas to react-hook-form  
**Used in:** All form components  
**Removable:** Only if react-hook-form is removed

---

### `zod` `^4.4.3`
**Purpose:** Schema validation  
**Why:** Type-safe form validation schemas  
**Used in:** `frontend/src/schemas/auth.schemas.js` and inline in components  
**Removable:** Would need to replace validation approach

---

### `framer-motion` `^12.40.0`
**Purpose:** Animation library  
**Why:** Page transitions, modal animations, toast animations  
**Used in:** Layout components, modals, toast container  
**Removable:** Yes — remove for simpler CSS transitions but impacts UX polish

---

### `lucide-react` `^1.22.0`
**Purpose:** Icon library  
**Why:** Consistent icon set used throughout the UI  
**Used in:** All UI components and pages  
**Removable:** Would need to replace all icon usage

---

### `date-fns` `^4.4.0`
**Purpose:** Date utility library  
**Why:** Date formatting, comparison, and manipulation  
**Used in:** Event scheduling, date display throughout the app  
**Removable:** Could use `Intl` API but date-fns is more convenient

---

## Frontend Dev Dependencies

### `vite` `^8.0.12`
**Purpose:** Build tool and dev server  
**Why:** Fast HMR and ESM-native bundling  
**Removable:** No

### `@vitejs/plugin-react` `^6.0.1`
**Purpose:** React plugin for Vite  
**Why:** Enables JSX transform and HMR for React  
**Removable:** No

### `tailwindcss` `^4.3.0` + `@tailwindcss/vite` `^4.3.0`
**Purpose:** CSS utility framework  
**Why:** All styling in the app uses Tailwind utilities  
**Removable:** No — deeply integrated

### `eslint` + plugins
**Purpose:** Code linting  
**Why:** Enforce code quality and React hooks rules  
**Commands:** `npm run lint`

---

**Last Updated:** 2026-07-04
**Documentation Version:** 1.0.0
**Related Files:** `backend/package.json`, `frontend/package.json`
**Related Documentation:** `docs/ai/PROJECT_STRUCTURE.md`
