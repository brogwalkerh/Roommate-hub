# Roommate Hub

Private web app (installable PWA) for two roommates: schedule, reminders, notes,
Airbnb calendar, bills and files. Static React app on GitHub Pages; Supabase
(Postgres + RLS, Auth, Realtime, Storage, Edge Functions) for data.

## Commands

- `npm run dev`: local dev server (needs `.env.local` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)
- `npm run check`: lint (oxlint) + typecheck (tsc -b) + unit tests (vitest). Must pass before every commit.
- `npm run build`: production build into `dist/`

## Layout

```
src/
  lib/            supabase client, generated DB types, query keys, realtime hook, money, dates, errors
  auth/           AuthProvider (session), login and new-password screens
  household/      useMembers (me / roommate / byId), useHousehold (name, time zone)
  components/ui/  Button, IconButton, TextField, TextArea, SelectField, Checkbox, Dialog,
                  Toast, PageHeader, EmptyState, SectionLabel, Panel, Segmented, LoadingBlock, ErrorBlock
  components/     PersonDot, PersonChip, PersonPicker (me / roommate / both)
  layout/         AppLayout (sidebar on desktop, tab bar on phones), nav, MorePage
  features/<x>/   one folder per section: <X>Page.tsx (default export) + hooks.ts + components
  sw.ts           service worker: precache + push notifications
supabase/
  migrations/     SQL, applied in filename order
  functions/      Edge Functions (Deno)
```

## Conventions

- **Colors**: only semantic tokens (`bg-surface`, `bg-surface-2`, `text-ink`, `text-muted`, `border-line`,
  `bg-accent`, `text-accent-ink`, `bg-accent-soft`, `text-danger`, `bg-danger-soft`, `text-warn`, `bg-warn-soft`,
  `text-guest`, `bg-guest-soft`). No raw hex in components and no `dark:` variants; tokens switch themes.
  A person's own color comes from `profile.color` (inline style).
- **Data**: React Query + the typed `supabase` client. Query keys come from `qk` in `lib/queryClient.ts` and
  must start with the table's root key, e.g. `[...qk.bills, 'unpaid']`. Every hook that reads a table calls
  `useRealtime('<table>', qk.<root>)` so the roommate's changes appear live. Wrap results in `unwrap()`.
- **Errors**: show `friendlyError(err)` text, in a toast (`useToast().toast(msg, { tone: 'error' })`) for
  mutations or `<ErrorBlock>` for failed loads.
- **Money**: integer cents everywhere (`amount_cents`). Parse input with `parseDollars`, show with `formatCents`.
  Never do arithmetic on dollar floats.
- **Dates**: all-day items use `start_date`/`end_date` (date strings, end is exclusive) and timed items use
  `starts_at`/`ends_at` (ISO timestamps). Helpers in `lib/dates.ts`; parse date-only strings with
  `parseDateOnly`, never `new Date('yyyy-mm-dd')` (that's UTC midnight).
- **People**: `owner_id` / `assignee_id` of `null` means "household" / "both of you". Use `PersonPicker`
  and `PersonChip`. `useMembers()` gives `me`, `roommate`, `byId(id)`.
- **Forms**: inside `<Dialog>` with the primary button in `footer`; mark the first field `data-autofocus`. Native inputs (`type="date"`,
  `type="datetime-local"`) work best on phones.
- **Mobile first**: must work at 375px wide. Touch targets at least 40px. The tab bar covers the bottom
  ~4.5rem on phones; the layout already pads for it.
- **Copy**: plain, active voice, sentence case. Name things the way a roommate would ("Add bill", "Mark done").
- **Bills writes** go through the `save_bill` RPC (bill + shares in one transaction). Reminders are completed
  with the `complete_reminder` / `undo_complete_reminder` RPCs.
- **AI**: schedule import calls Claude only from the `parse-schedule` Edge Function (`claude-sonnet-5-5`, structured
  output, key in the `ANTHROPIC_API_KEY` secret). The browser never sees the key, and parsed events are only saved after
  the person reviews them (`features/schedule/import/`).
- **Secrets**: none in the repo. The Supabase publishable key and VAPID public key in `lib/config.ts` are
  public by design. Calendar feed URLs are write-only (the `url` column can't be selected by clients).
- **Tests**: Vitest, `*.test.ts(x)` next to the code. Pure logic (money splits, date math, parsing) must be
  tested.

## Workflow

- Every change goes on its own branch (`feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`) with a pull
  request into `main`. Never commit straight to `main`.
- The PR description says what changed, how it was tested, and includes screenshots for anything visual.
- `main` deploys to GitHub Pages on every push, so a PR is merged only after `npm run check` passes and the
  person has approved it.
