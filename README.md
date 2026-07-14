# Mustang Tracker

A class tracker for **Mrs. H** — junior high math at Fellowship Academy.
*It's a great day to be a Mustang!*

**Live:** https://thinshaw.github.io/mustang-tracker/

## What it does

Not a grading tool — a *tracking* tool. The hard part isn't scoring the math,
it's keeping up with missing work, absences, makeup work, and knowing which
topics need re-teaching. Each student × assignment is one score + one status,
and every view derives from that single grid.

| View | What it's for |
|---|---|
| **Gradebook** | The only place data is entered. Tap a cell, set score + status. Saves instantly. |
| **Speak Grades** | Dictate *"Marcus 78, Kayla absent, Josh missing"*. Always shows a review step before anything is written. Unmatched names flag red; a shared first name asks you to tap the right kid. |
| **Who Owes What** | Auto-generated missing / absent / makeup list. No separate upkeep. |
| **Re-teach Radar** | Class average per topic, weakest first. Flags anything under 70%. |
| **Class Setup** | Roster by typing, by voice, or by CSV import. Assignments, topics, class periods. |
| **Send to FACTS** | CSV export, shaped to avoid double entry into the school's SIS. |

## How it's built

Static HTML/CSS/vanilla JS — no build step, no framework. Hosted on GitHub Pages.

- `index.html` — the whole app (views, rendering, Supabase calls)
- `lib.js` — the pure logic: name matching, voice parsing, CSV in/out.
  Kept separate because it's the code where a quiet bug lands in a real kid's
  grade, and keeping it pure means it can actually be tested.
- `config.js` — Supabase URL + anon key (public by design; see below)
- `supabase/migrations/` — the schema

**Data** lives in Supabase (Postgres). Sign-in is a magic link — there is no
password anywhere in this app.

### Statuses are configuration, not code

`done / missing / absent / makeup` live in a `statuses` table, not a Postgres
enum. Behaviour hangs off two flags — `is_owed` (drives Who Owes What) and
`expects_score` (drives the Re-teach Radar averages). Adding "late" or
"excused" later is one `INSERT`: the editor, the legend, the owed list and the
voice parser all pick it up with no code change.

## Tests

```
node --test 'test/*.test.mjs'
```

Covers the parts most likely to be quietly wrong: spoken-number scores, status
synonyms, first-name collisions (it must *never* guess between two Joshes),
CSV import including the FACTS-style quoted `"Last, First"` column, and the
rule that an ungraded assignment exports blank rather than as a zero.

## Data & privacy

All roster data in this repo is **fictional**. Real student names and grades
live only in Supabase, behind row-level security.

The **anon key in `config.js` is public by design** — it ships to every browser
and Supabase expects that. It is not a secret. What protects the data is RLS:
every table requires `auth.uid()` to match `classes.owner_id`, so that key on
its own reads nothing. (Verified: with 10 student rows in the table, an
anonymous read returns `[]` and an anonymous insert is rejected `42501`.)

The **service_role key bypasses RLS entirely** and must never appear in this
repo, in `config.js`, or in a browser.

## Local development

```
python3 -m http.server 8000     # http://localhost:8000
```

Voice needs a secure origin — use the live URL, not `file://`.
