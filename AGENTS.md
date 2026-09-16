# AGENTS.md

This file governs how AI agents (and human contributors) work on this repository. Read the full **Codebase Overview** below before making any change so you don't need to re-scan the repository. Keep the overview up to date.

---

## Working Protocol

### Branching & PRs
- **Always** create or work on a dedicated branch — never commit directly to `main`.
- Branch naming follows the repo convention: `feat/<scope>/<thing>`, `fix/<scope>/<thing>`, `docs/<scope>/<thing>`, `design/<scope>/<thing>`, `refactor/<scope>/<thing>`, `test/<thing>`.
- Ask the user before creating a PR if they haven't explicitly asked for one, except when the user has already requested PRs as part of the task — then create them.
- When creating a PR:
  - Push the branch to `origin`.
  - Create the PR against `main` using `gh`.
  - Write a **detailed description** that states exactly what is changed, file by file where useful, why it was changed, and any testing performed.
  - Keep the title focused and conventional (e.g. `fix(calendar): drag-drop reordering`).
- **If a PR for this work already exists**, do not open a duplicate. Update the existing PR instead:
  - Update the PR description to reflect the latest state of the branch.
  - Update the title if the scope/meaning of the change has changed.

### Committing
- **Commit after each logical point** of work, not in one giant blob at the end. A "logical point" is one atomic change (a single fix, a single feature, a single refactor, a single doc update).
- Use conventional commit messages matching the repo style:
  - `feat(scope): description`
  - `fix(scope): description`
  - `refactor(scope): description`
  - `docs(scope): description`
  - `style(scope): description`
  - `test(scope): description`
- Scopes seen in this repo: `design`, `strike`, `notifications`, `calendar`, `sync`, `time-budget`, `schema`, `map-editor`, `defense`, `ui`.
- Never commit unless the user has asked you to, unless the user explicitly asked you to commit as part of a task (e.g. "commit after each point").

### Multiple Fixes / Features
- When the user asks for **multiple** independent fixes/features, implement them **one at a time**:
  1. Complete point N fully (implement + tests).
  2. Commit it.
  3. Push and update/create the PR.
  4. Move to point N+1.
- If the requested work changes behavior, write or update **tests** for it. Tests live in `tests/` and run with `bun run test` (Vitest).

### Verification
- Run **all affected tests** before committing: `bun run test` (or `bun run test:watch` during development).
- There is no `typecheck` script despite CONTRIBUTING.md mentioning it; verify TypeScript correctness via the build (`bun run build`) or an editor if needed.
- Build check: `bun run build`.

### Git Identity Rules
- The account used to commit must have a **name and GitHub username that end with "slop"** (e.g. `9slop`, `7slop`, `numslop`, `myslop`).
- Before committing, verify the git identity:
  ```bash
  git config user.name
  git config user.email
  gh api user --jq '.login'
  ```
- If the configured identity does **not** end in "slop", ask the user which `*slop` account to use before committing or pushing. Do not silently switch.
- The current expected identity is `9slop`.

### Documentation / Codebase Overview
- This AGENTS.md contains the architecture overview. **When you change something structural** (new route, new table, new module, renamed file, new env var), update the relevant section of the overview in this file so future agents don't have to re-scan the repo.
- Keep README/CONTRIBUTING in sync only if your change makes them visibly wrong (note: CONTRIBUTING.md is known to be stale — non-atomic fixes to it should be handled separately).

---

## Codebase Overview

### Stack

| Layer | Technology |
|---|---|
| UI framework | SolidJS (`solid-js` ^1.9.15), JSX |
| Meta-framework | SolidStart (`@solidjs/start` ^1.3.2) + Vinxi (Nitro-backed `.output/`) |
| Router | `@solidjs/router` ^1.0.0 |
| Language | TypeScript ^5.7 strict, ESM |
| Runtime / PM | **Bun** (v1.1+) — but dev server runs under Node via `scripts/dev.mjs` |
| Backend / DB | **Supabase** (`@supabase/supabase-js` ^2.116.0) + PostgreSQL + custom HMAC-JWT auth |
| 3D games | Babylon.js (`@babylonjs/core` ^9.26.0) — "Waifu Strike" |
| Testing | **Vitest** ^5, happy-dom, `@solidjs/testing-library`, `@testing-library/jest-dom` |
| Icons | `unplugin-icons` + Phosphor Icons |
| i18n | Nested JSON dictionaries in `src/locales/` (`en.json`, `ja.json`), `t()` key helper |
| Version / License | 2.0.0 / MIT (with AI-training restriction — see below) |

### Commands

| Command | What it does |
|---|---|
| `bun install` | Install deps |
| `bun run dev` | Dev server (Node/Vinxi; sets WAIFU_EDITOR=0) |
| `bun run dev:edit` | Dev server with map editor enabled (`WAIFU_EDITOR=1`) |
| `bun run build` | Production build (`vinxi build`) |
| `bun run start` | Run production build |
| `bun run test` | Run Vitest suite (`vitest run`) |
| `bun run test:watch` | Watch mode |
| `bun run map:export` | Convert Kyoto map → `.wsmap` (`bun scripts/convert-kyoto-map.ts`) |

> `bun run typecheck` / `bun run test:unit` do **not exist** (leftovers in CONTRIBUTING.md). Use `bun run build` + `bun run test`.

### Directory Map

```
app.config.ts          SolidStart/Vite config (unplugin-icons, chunk size warnings)
scripts/dev.mjs        Dev launcher (Node); --edit flag sets WAIFU_EDITOR=1
supabase/schema.sql    Single source of truth for the database schema (+ RLS + RPCs + view)
src/app.tsx            Root shell: nav, theme, modals, notification scheduler
src/entry-client.tsx   Client entry
src/entry-server.tsx   Server entry
src/routes/            Route definitions + server API routes (see below)
src/components/        ~32 .tsx UI components (WaifuAvatar, Calendar*, Editor*, RPG, etc.)
src/lib/               Shared + client logic
  store.ts              Central reactive Solid store (~2600 lines) + all cloud sync + localStorage persistence (waifu_space_data_v1_acct_<userId>)
  personality.ts        5 archetypes + dialogue engine (Tsundere/Kuudere/Yandere/Deredere/Dandere)
  i18n.ts, timebudget.ts, ical.ts, calendar-*.ts
  cloudcrypt.ts         AES-256-GCM E2E encryption for time-budget/calendar sync
  economy.ts, requirements/, llm.ts, intents.ts
  server/               Server-only logic
  strike/               Babylon.js Strike game engine
src/locales/           en.json + ja.json (keep both in sync when adding keys)
src/styles/            themes.css, style.css, waifu.css, calendar.css, settings.css, rpg.css, timebudget.css, strike.css, editor.css
tests/                 setup.ts + components/ + lib/ + server/ test suites
```

### Routes / Pages

| Path | File | Purpose |
|---|---|---|
| `/` | `src/routes/index.tsx` | Companion stage (avatar, dialogue) |
| `/calendar` | `calendar.tsx` | Calendar planner |
| `/minigames` | `minigames.tsx` | RPG hub / minigame launcher |
| `/timebudget` | `timebudget.tsx` | Time-budget planner (E2E-encrypted) |
| `/profile` | `profile.tsx` | User profile / showcase |
| `/settings` | `settings.tsx` | Settings studio |
| `/rpg` | `rpg.tsx` | Redirects to `/minigames` |

### Server API Routes (`src/routes/api/`)

| Route | Purpose |
|---|---|
| `auth/login.ts`, `auth/register.ts`, `auth/me.ts` | Custom HMAC-JWT auth (not Supabase Auth) |
| `defense/start.ts`, `defense/complete-wave.ts` | Tower-defense server-authoritative scoring |
| `gacha/roll.ts` | Gacha draws |
| `strike/config.ts`, `stats.ts`, `map-save.ts`, `edit-mode.ts` | Strike game config/stats/map editor |
| `sync/progress.ts` | Plaintext cosmetic + economy sync (server-rejects client reward fields) |
| `timebudget/sync.ts` | E2E-encrypted blob sync |
| `holidays.ts`, `leaderboard.ts`, `profile.ts` | Misc data endpoints |
| `upload/avatar.ts` | Avatar upload |

### Auth Model
- **Custom**, not Supabase Auth: HMAC-SHA256 signed `ws_<base64json>.<sig>` tokens, bcrypt passwords, `ws_session` cookie (7-day, SameSite=Lax).
- Falls back to an **in-memory local user store** (not persisted across restarts, seeded demo user `AkariFan`/`waifu123`) when Supabase env vars are missing.
- Server is authoritative for coins/bond/defense results. Calendar and time-budget data are E2E-encrypted client-side and stored as opaque blobs.
- **DM/Presence/Call RPCs (`schema-dm-functions.sql`) are SECURITY DEFINER and EXECUTE-granted to `service_role` ONLY** (migration `restrict_dm_rpc_execute_to_service_role`). Their `auth.uid() IS NOT NULL` guards are a no-op for the anon role (`auth.uid()` is NULL), so any anon/authenticated grant would reopen full IDOR. DM routes therefore require `SUPABASE_SERVICE_ROLE_KEY`; `resolveDmContext` returns 503 when it is absent. Do not re-grant these RPCs to anon/authenticated.

### State & Persistence
- One big reactive store in `src/lib/store.ts` (settings, waifu config, calendar events, RPG/economy state) persisted to `localStorage`.
- Cloud sync writes to Supabase tables through server routes (service-role or anon fallback, `isSupabaseConfigured()` guards, graceful no-op when unconfigured).

### Testing Layout
- Vitest config in `vitest.config.ts` (happy-dom, globals, `tests/setup.ts`).
- `tests/lib/` — unit tests for store logic, personality, i18n, crypto, economy.
- `tests/server/` — route/API tests.
- `tests/components/` — component tests (`.test.tsx`).
- `bunfig.toml` points Bun's native `bun test` at `tests/lib` — prefer `bun run test` (Vitest).

---

## Supabase & Database Rules

- **Single source of truth** for schema: `supabase/schema.sql`. All DDL is documented there.
- **Always use the Supabase MCP tools** when making database changes (inspect tables first, apply migrations, check advisories):
  - `supabase_list_tables` / `supabase_execute_sql` to inspect current structure before changing anything.
  - `supabase_apply_migration` to apply DDL (never raw `execute_sql` for DDL).
  - `supabase_generate_typescript_types` after schema changes if client types can be derived.
  - `supabase_get_advisors` (security + performance) after DDL to catch missing RLS policies.
- **Never drop a table, database, schema, column, or any existing data.** No destructive operations. If you think a destructive change is needed, stop and ask the user first.
- **Write migrations** for every schema change. Keep `supabase/schema.sql` in sync with the migrations so it continues to describe the full current schema.
- Schema highlights you must preserve:
  - `public.profiles` — users (id UUID PK, username unique, email, avatar_url, bio).
  - `public.user_progress` — coins ≥0, bond_exp, bond_level, waifu config, appearance/settings JSONB, claimed_milestones, defense stats, goblins_defeated, calendar_overrides/synced_at.
  - `public.user_inventory` — cosmetics, unique `(user_id, item_id)`.
  - `public.user_showcase` — up to 6 featured items, PK `(user_id, slot_index)`.
  - `public.calendar_items` — events/tasks/birthdays, PK `(user_id, item_id)`, recurrence types none/daily/weekly/monthly/weekdays.
  - `public.time_budget_sync` — E2E-encrypted blob (salt, iv, ciphertext, version), keyed by user_id.
  - `public.action_logs` — audit/anti-cheat, service-role managed.
  - SECURITY DEFINER RPCs: `sync_calendar_items`, `sync_showcase_items`, `save_time_budget_blob`, `get_time_budget_blob`.
  - View `leaderboard_view` with `security_invoker = true`.
- RLS is enabled on all 7 tables — keep new tables/columns covered by RLS and ownership checks. Calendar + time_budget_sync must stay private to owner.

### Env / Config
- Keys: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, `JWT_SECRET`, `APP_URL`.
- `.env.local` additionally holds dev-only secrets (`VITE_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_ACCESS_TOKEN` — a Management API PAT, `GIPHY_API_KEY`).
- Env loading quirk: dev runs under Node, `load-env.ts` manually parses `.env`/`.env.local`; already-set env vars win. Never log or commit secrets.

---

## AI/ML Restriction (LICENSE)

The LICENSE restricts using the code with AI/ML/LLM systems **unless** the user/entity name ends in `slop` (e.g. `9slop`, `7slop`, `numslop`). Agent-assisted development using an identity ending in `slop` (like `9slop`) is permitted. Do not run this codebase with non-`slop` identities.