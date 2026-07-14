# Mustang Tracker

A class tracker for **Mrs. H** — junior high math at Fellowship Academy.
*It's a great day to be a Mustang!*

**Live mockup:** https://thinshaw.github.io/mustang-tracker/

## What it does

Not a grading tool — a *tracking* tool. The hard part isn't scoring the math,
it's keeping up with missing work, absences, makeup work, and knowing which
topics need re-teaching. Each student × assignment is one score + one status
(done / missing / absent / makeup), and every view derives from that.

| View | What it's for |
|---|---|
| **Gradebook grid** | The only place data is entered. Tap a cell, set score + status. |
| **Speak Grades** | Dictate *"Marcus 78, Kayla absent, Josh missing"*. Always shows a review step before anything is written. |
| **Who Owes What** | Auto-generated missing / absent / makeup list. No separate upkeep. |
| **Re-teach Radar** | Class average per topic, weakest first. Flags anything under 70%. |
| **Send to FACTS** | CSV export to avoid double entry into the school's SIS. |

## Status

`index.html` is a **mockup** — self-contained HTML/CSS/vanilla JS with fictional
seed data, held in memory. It's the approved design, not the real app yet.

Build order and the decisions behind it live in [CLAUDE.md](CLAUDE.md). Next up:
back the grid with Supabase so a browser wipe can't cost Traci a term of grades.

## Running it

It's one file with no build step:

```
open index.html
```

Voice entry needs a secure origin — use the GitHub Pages URL above, not `file://`.

## Data & privacy

All roster data in this repo is **fictional**. Real student names and grades
never get committed — they live in Supabase behind row-level security.
