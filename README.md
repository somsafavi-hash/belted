# Belted

Fantasy league for real life. Friends compete at everything (lifting, reading,
water, runs, trivia) and every flex needs a **receipt**: a live photo or video
shot in the app. The league votes ✅ legit or 🧢 cap.

**Play it:** https://somsafavi-hash.github.io/belted/ (works best on a phone;
on iPhone tap Share → Add to Home Screen).

## What's in this version

| Feature | What it does |
|---|---|
| Receipts | Log a category and a number, prove it with the live camera (no camera roll). Friends vote within 24h. Majority cap = points lost |
| Duels | Challenge anyone: in-app trivia (scored by the app), max lift, mile, push-ups, steps, 1v1 hoops, custom. Accept or duck. Stakes 10/25/50 |
| Belts | One per category. Beat the holder in a duel (or win that category's Drop) to take it. +5 a week while you hold it |
| Drops | 1–3 day mini-competitions that rotate automatically. Top 3 get 30/20/10 |
| Ranks | Rating per category and overall, Bronze → Legend. Every change is in a ledger with a reason |
| The Major | Last 3 days of each month: top 4 by monthly points play a trivia bracket. Last place gets the punishment the league voted for |
| Recap card | A weekly image to share to the group chat |
| Safety | Report or hide a receipt, block someone, delete all your data |

### Real leagues and demo mode

**Real leagues:** start one, share the invite link in the group chat, and
friends join by tapping it and picking a name. No passwords: each phone gets
its own secret key the first time it joins. Every rule runs on the server, so a
player can't edit their phone to give themselves points, vote twice, or act as
someone else. Proof goes straight from the phone to private storage and is shown
only through links that expire after two hours.

**Moderation:** anyone can report a receipt (it disappears for them right
away; two reports from different people hide it from the whole league until
it's reviewed). The person who started the league gets a **Moderation** screen
on the Me tab to keep or remove reported receipts and remove members, and never
sees who reported. Belted has its own queue across every league at
`/#admin`, unlocked with the admin key (kept in `.admin-key`, never committed;
only its hash is deployed). Removing a receipt deletes its proof and takes back
its points.

**Demo mode:** "Try it solo" gives you five made-up friends who post, vote and
challenge you on their own, all on one phone. The Me tab can skip time forward.

## Run it

```bash
npm install
npm run api     # local API on :8787 (leagues and proof kept in memory)
npm run dev     # app on :5173/belted/, talks to the local API via .env.development.local
npm test        # game rules + API
```

`.env.development.local` should contain `VITE_API_URL=http://127.0.0.1:8787`.

`npm run deploy` runs the tests, builds, and publishes to the `gh-pages` branch,
which GitHub Pages serves.

## Layout

```
server/       the API: handler.ts (routes, sign-in, runs the engine),
              s3Store.ts (production storage), local.ts (dev server)
infra/        AWS CDK stack "belted": one private S3 bucket + one Lambda URL
src/engine/   the game rules, no UI: receipts, votes, duels, belts, drops,
              ratings ledger, season + Major, trivia bank
              sim.ts is demo mode only (the made-up friends)
src/data/     api.ts (server calls), store.ts (demo storage), game.tsx (React context)
src/ui/       screens: League, Duels, Log (camera), Major, Me
tests/        rule tests
```

The engine has no browser or storage code in it, so the phone (demo mode) and
the server (real leagues) run exactly the same rules through
`src/engine/actions.ts`.

## Deploy

```bash
cd infra && npm install
AWS_PROFILE=mysign AWS_REGION=us-east-2 npx cdk deploy   # backend
cd .. && npm run deploy                                 # app → GitHub Pages
```

`npm run deploy` reads the API address from `.env.production`.
