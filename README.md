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

### Demo mode

There's no backend yet. A new league comes with five made-up friends who post
receipts, vote, and challenge you on their own, so the whole game works on one
phone. Data stays on the device (localStorage + IndexedDB). The Me tab has demo
controls to skip time forward.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173/belted/
npm test        # game rules
npm run build
```

`npm run deploy` runs the tests, builds, and publishes to the `gh-pages` branch,
which GitHub Pages serves.

## Layout

```
src/engine/   the game rules, no UI: receipts, votes, duels, belts, drops,
              ratings ledger, season + Major, trivia bank
              sim.ts is demo mode only (the made-up friends)
src/data/     storage (local for now) and the React game context
src/ui/       screens: League, Duels, Log (camera), Major, Me
tests/        rule tests
```

The engine has no browser or storage code in it, so the same rules can move to
a server when real multiplayer is added. `sim.ts` is the only file that goes
away then.
