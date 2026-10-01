# ShotListr

## Stack

Next.js 16 (App Router, Server Actions, Turbopack) · TypeScript · Tailwind CSS 4 ·
Prisma 7 + SQLite (`better-sqlite3` driver adapter) · Vitest. Node ≥ 22.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

   (`postinstall` runs `prisma generate`. If npm reports blocked install scripts, run
   `npm approve-scripts better-sqlite3 prisma @prisma/engines` and `npm rebuild`.)

2. Create `.env` from the example:

   ```bash
   cp .env.example .env
   ```

3. Create the database:

   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. Run it:

   ```bash
   npm run dev
   ```

   Open <http://localhost:8000> and sign up.

## Accounts

Sign up with a username, email and password (bcrypt-hashed). Logging in with either username or
email creates a 30-day session stored in the database and referenced by an HttpOnly cookie.
"My Shotlists" and "New Shotlist" require login and send you back there afterwards.

## Shotlists

"My Shotlists" lists your saved shotlists as cards — title and when it was last saved — most
recently saved first; click one to open it, or its × to delete it (you're asked to confirm). A shotlist needs a title before it can be saved (you're
asked for one if it's blank). Leaving a shotlist with unsaved changes through the nav or Log out
asks whether to save first; closing or reloading the tab shows the browser's own warning.

"Create new shotlist +" opens a spreadsheet that starts with one empty scene row and one shot
row. To insert a scene or shot, hover the left end of any line between rows (or above the first /
below the last), left of the scene numbers; the Insert Scene / Insert Shot pop-up appears beside
the table. A scene added at the end takes the next whole number. Anywhere else you choose:
make it a subscene (12.1, 12.2, 12.1.1, 12.0.1…), or give it the next number and renumber the
scenes after it either up to the first gap or all the way to the end.
Shots are lettered within their scene: 12A, 12B, 12.1A. Click a scene number to type a different
one — it's refused if another scene has it, otherwise the scene (with its shots) moves into number
order. Int./Ext., Time,
Framing and Angle suggest standard values but accept anything. Save stores it to your account.

Hover a row to reveal its ⠿ grip and × button. Drag the grip to move the row — a scene moves
together with its shots and drops between scenes — or focus the grip and press ↑/↓. Deleting a
scene that has shots asks whether to delete them too or keep them under the scene above, and if
scenes come after it, whether to leave a gap or renumber them down — up to the first gap or all
of them. Only choices that would do something different are shown. Dragging a scene
renumbers it for where it lands, the same way as inserting.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload on port 8000 |
| `npm run build` / `npm start` | Production build / serve on port 8000 |
| `npm run check` | Lint + typecheck + unit tests |
| `npm test` | Vitest unit tests (`tests/`) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run db:migrate` | Create/apply a Prisma migration after editing `prisma/schema.prisma` |
| `npm run db:studio` | Browse the SQLite database in Prisma Studio |

## Project layout

```
prisma/            schema + migrations
src/app/           routes (App Router) and server actions (src/app/actions)
src/components/    UI components
src/lib/           db client and shared helpers
tests/             Vitest unit tests for the pure helpers in src/lib
```

See `CLAUDE.md` for conventions.
