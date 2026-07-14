# Mustang Tracker — CLAUDE.md

## What this is
A class tracker for Traci Hinshaw ("Mrs. H"), junior high math teacher at
Fellowship Academy in Kennedale, TX (private Christian school, PK-12,
Mustangs, red & blue, motto: "It's a great day to be a Mustang!").
Built by her husband Toby. The mockup in `index.html` has been shown to her;
this repo turns it into the real app.

## The problem (in her words)
"Mostly grading so many math problems with corrections and keeping up with
missing work, absences, make up work, and whether or not to re-teach a
particular topic."

Four of five pains are tracking/status problems, not grading-the-work
problems. The app is an assignment-level tracker, NOT a problem-level one:
each student x assignment = one score + one status
(done / missing / absent / makeup). Each assignment carries a topic tag.

## Core views (already in the mockup — keep them)
1. **Gradebook grid** — students x assignments, tap cell to edit score/status.
   This is the ONLY place data is entered. Everything else derives from it.
2. **Speak Grades (voice entry)** — pick assignment, dictate
   "Marcus 78, Kayla absent, Josh missing", review parsed lines, apply.
   REVIEW-BEFORE-APPLY IS NON-NEGOTIABLE: voice never writes directly to
   the gradebook. Unmatched names flag red, never guess.
3. **Who Owes What** — auto-generated missing/absent/makeup list. Zero
   separate maintenance.
4. **Re-teach Radar** — class average per topic, sorted weakest first,
   flag topics under 70%.
5. **Send to FACTS** — CSV export (phase 1), API sync (phase 2, see below).

## Non-negotiable requirements
- **Never lose her data.** She enters a term's worth of grades; a browser
  wipe or device change must not cost her anything. localStorage alone is
  NOT acceptable for the real build.
- **One URL, works on her iPad in Safari.** Primary device is an iPad.
  Add-to-Home-Screen should feel app-like (add manifest + icons).
- **Fast entry.** If entering a grade takes more taps than her paper
  gradebook, she'll stop using it.
- HTTPS required (GitHub Pages is fine) — Safari speech recognition
  only works on secure origins.

## Architecture decisions (already made — don't relitigate)
- Front-end: keep the single-file feel; splitting into a small static
  site is fine, but no build-step frameworks unless there's a real reason.
  Host on GitHub Pages (Toby's pattern: thinshaw.github.io/<repo>).
- Persistence: **Supabase** (Toby has used it before — MindTrack project).
  Postgres tables: students, assignments (with topic), cells
  (student_id, assignment_id, status, score), classes/periods.
  Simple auth (email magic link is enough — single user initially).
- Voice: Web Speech API live mic + iPad keyboard dictation into the same
  textarea as guaranteed fallback. Current parser is regex-based
  (handles digits, spoken numbers, "got a", "was absent"); acceptable
  for v1. Phase 2: route messy utterances ("everyone got 100 except
  Josh, he's missing") through the Anthropic API for parsing —
  keep the same review-before-apply UI.
- Multiple class periods: mockup shows one period (2nd Period
  Pre-Algebra); real build needs a period switcher.

## FACTS / RenWeb integration (phase 2)
- Her school uses FACTS SIS (formerly RenWeb). She dislikes it; goal is
  to avoid double entry.
- FACTS has APIs (incl. OneRoster: classes, enrollments, students,
  grading periods) BUT keys are created by the school's FACTS admin
  (System > Configuration > API Configuration) — teacher accounts can't
  self-serve. Toby/Traci need to ask the front office.
- Until/unless a key is granted: CSV export shaped for FACTS entry is
  the bridge. If granted: grade sync becomes the marquee feature.
- Do NOT scrape the FACTS teacher portal. API or CSV only.

## Roster name matching (voice)
First-name matching works until two kids share a name. Real build:
match against her actual roster, require last initial on collisions,
and let the review step disambiguate with a tap.

## Statuses — open question for Traci
Current four: done / missing / absent / makeup. She may want
"late," "excused," or "retake." Ask her before hardcoding; make the
status set a config, not an enum scattered through the code.

## Privacy
Student names + grades = sensitive. Supabase row-level security on;
no analytics; no student data in logs or commits. Seed/demo data in
this repo is fictional and should stay that way.

## Design language
Mustang red (#c8102e), navy (#16294d), bright blue (#2455a4), white.
Playful but not childish: chunky borders, offset shadows, Fredoka +
Gochi Hand. Red top-stripe on panels. Keep the motto in the header.

## Build order
1. ~~Deploy mockup to GitHub Pages~~ — DONE. thinshaw.github.io/mustang-tracker
2. ~~Supabase schema + wire the grid to it~~ — DONE. Project ref
   `habffloatnxdcqooture`. Migrations in `supabase/migrations/`.
3. ~~Auth (magic link) + period switcher~~ — DONE.
4. ~~Roster management~~ — DONE (Class Setup tab): students by typing,
   voice, or CSV import; assignments + topics; add/delete periods.
5. ~~PWA polish~~ — DONE (manifest + icons + Add to Home Screen meta).
6. Voice parser v2 via Anthropic API. NOT STARTED. The regex parser in
   `lib.js` handles digits, spoken numbers, status synonyms and
   first-name collisions; it does NOT handle "everyone got 100 except
   Josh". Keep review-before-apply when this lands.
7. FACTS: CSV shape validation with a real export from her gradebook,
   then API conversation with the school. NOT STARTED — needs a real
   FACTS export to validate against, and a key from the front office.

## Statuses — STILL OPEN with Traci
Nothing is blocked on this. The `statuses` table + the `is_owed` /
`expects_score` flags mean adding "late" or "excused" is one INSERT,
no migration and no code change. Best asked when she's holding the
app, not in the abstract.

## Testing
`node --test 'test/*.test.mjs'` — pure logic in `lib.js`. The app imports
those exact functions, so the tests cover what ships. The live mic (Web
Speech API) is NOT covered — it can't run headless. The textarea path
(iPad keyboard dictation) is the guaranteed one and IS covered.

## Keys
- anon key: in `config.js`, public by design, safe in the repo. RLS is
  what protects the data.
- service_role key: NEVER in the repo, never in the browser. It bypasses
  RLS completely.
- DB password: Toby's, in his password manager. Not needed for anything
  here — the CLI uses its own token.
