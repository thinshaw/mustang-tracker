// Pure logic for Mustang Tracker — no DOM, no network, no Supabase.
//
// This lives apart from index.html for one reason: it is the code most likely
// to quietly do the wrong thing (mishear a name, mis-parse a score, drop a
// student on import), and it is the code where a quiet mistake lands in a real
// kid's grade. Keeping it pure means it can be tested for real, and the app
// imports these exact functions — not a copy that drifts.

/* ---------------------------------------------------------------- names --- */

/** "Marcus Davis" -> { first_name: "Marcus", last_name: "Davis" }
 *  "Marcus"       -> { first_name: "Marcus", last_name: null }
 *  Last name is optional: roster entry by voice or CSV is often first-name only. */
export function splitName(raw) {
  const parts = String(raw || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!parts.length) return null;
  const first_name = parts.shift();
  return { first_name, last_name: parts.join(' ') || null };
}

/** How a student is shown everywhere. Mirrors the generated column in Postgres
 *  (migration 0002) so the UI and the database never disagree. */
export function displayName(s) {
  const last = (s.last_name || '').trim();
  return last ? `${s.first_name} ${last[0]}.` : s.first_name;
}

/* ------------------------------------------------------------------ csv --- */

/** Split one CSV line into fields, honouring double quotes.
 *
 *  A naive split(',') is wrong here and wrong in a way that would silently
 *  mangle a real roster: FACTS and Excel both export names as a single QUOTED
 *  field — "Davis, Marcus" — and splitting on the comma inside the quotes turns
 *  one student into two broken ones. */
export function splitCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }   // escaped ""
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field.trim()); field = '';
    } else field += ch;
  }
  out.push(field.trim());
  return out;
}

/** Parse a roster CSV. Accepts, in practice, everything a teacher is likely to
 *  hand us:
 *      First,Last          -> "First Last"
 *      First               -> "First"
 *      "Last, First"       -> "First Last"   (quoted single column — FACTS/Excel)
 *      Last, First         -> "First Last"   (when a header says so)
 *  A header row is skipped. */
export function parseCsvNames(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const names = [];

  let lastFirst = false;   // does this file put the last name first?

  lines.forEach((line, idx) => {
    const cols = splitCsvLine(line);
    if (!cols[0]) return;

    if (idx === 0) {
      const h0 = cols[0].toLowerCase();
      const h1 = (cols[1] || '').toLowerCase();
      const isHeader = /^(first|first[_ ]?name|student|name|last|last[_ ]?name)$/i.test(cols[0]);
      if (isHeader) {
        if (/^last/.test(h0) && /^first/.test(h1)) lastFirst = true;
        return;                                   // header consumed
      }
    }

    // Single field that itself contains a comma => "Last, First".
    if (cols.length === 1 && cols[0].includes(',')) {
      const [last, first] = cols[0].split(',').map(s => s.trim());
      if (first) { names.push(`${first} ${last}`); return; }
      names.push(last);
      return;
    }

    if (cols.length > 1 && cols[1]) {
      names.push(lastFirst ? `${cols[1]} ${cols[0]}` : `${cols[0]} ${cols[1]}`);
    } else {
      names.push(cols[0]);
    }
  });

  return names;
}

/** Build the FACTS-bound CSV. Graded cells export their score; a status cell
 *  exports the status in caps; a cell that was never touched exports empty —
 *  an ungraded assignment is not a zero, and must not look like one. */
export function toCsv({ students, assignments, cells, statuses }) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const expects = code => !!statuses.find(s => s.code === code)?.expects_score;
  let csv = ['Student', ...assignments.map(a => a.name)].map(q).join(',') + '\n';
  students.forEach(s => {
    const row = [displayName(s)];
    assignments.forEach(a => {
      const c = cells.get(`${s.id}|${a.id}`);
      if (!c) row.push('');
      else if (expects(c.status)) row.push(c.score ?? '');
      else row.push(c.status.toUpperCase());
    });
    csv += row.map(q).join(',') + '\n';
  });
  return csv;
}

/* ---------------------------------------------------------------- voice --- */

const WORD_NUMS = {
  'one hundred': 100, hundred: 100, ninety: 90, eighty: 80, seventy: 70,
  sixty: 60, fifty: 50, forty: 40, thirty: 30, twenty: 20, ten: 10, zero: 0,
};
const ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

/** Pull a score out of an utterance: "78", "seventy eight", "got a 92". */
export function parseScore(lower) {
  const digits = String(lower).match(/\b(\d{1,3})\b/);
  if (digits) return Math.min(100, Number(digits[1]));
  for (const [w, v] of Object.entries(WORD_NUMS)) {
    const m = String(lower).match(new RegExp(`\\b${w}\\b(?:[ -](one|two|three|four|five|six|seven|eight|nine))?`));
    if (m) return Math.min(100, v + (ONES[m[1]] || 0));
  }
  return null;
}

/** Which non-scoring status (if any) the utterance names. Driven off the
 *  statuses table, so a status Traci adds later is recognised by its own name
 *  with no code change; the synonyms are extra help for the four we ship. */
export function detectStatus(lower, statuses) {
  const synonyms = {
    absent: /\babsent\b|\bwas out\b|\bnot here\b/,
    missing: /\bmissing\b|\bdidn'?t turn\b|\bno work\b|\bnothing\b/,
    makeup: /\bmake ?up\b/,
  };
  for (const st of statuses) {
    if (st.expects_score) continue;
    const re = synonyms[st.code] || new RegExp(`\\b${st.code}\\b`);
    if (re.test(String(lower))) return st.code;
  }
  return null;
}

const NOISE = /\b(absent|missing|makeup|make up|late|excused|retake|got|scored|a|an|is|was|out|here|no|work|nothing)\b/gi;

/** Strip scores and filler out of a chunk, leaving the name. */
export function nameToken(chunk) {
  return String(chunk).replace(/\d+/g, '').replace(NOISE, '').replace(/\s+/g, ' ').trim();
}

/** Match a spoken name against the real roster.
 *
 *  Returns { student } on a confident single match, { ambiguous: [...] } when
 *  two kids share a first name and the utterance didn't disambiguate, and
 *  { student: null } when nothing matched. It NEVER guesses between two
 *  students — an unresolved name goes back to Traci to tap, which is the whole
 *  point of review-before-apply. */
export function matchStudent(token, students) {
  const t = String(token || '').toLowerCase().trim();
  if (!t) return { student: null, ambiguous: null };

  const hits = students.filter(s => {
    const first = s.first_name.toLowerCase();
    return t === first || t.startsWith(first + ' ') || first.startsWith(t) || t.startsWith(first);
  });

  if (!hits.length) return { student: null, ambiguous: null };
  if (hits.length === 1) return { student: hits[0], ambiguous: null };

  // Collision: try to break the tie on a spoken last initial ("Josh G").
  const byInitial = hits.filter(s => {
    if (!s.last_name) return false;
    const li = s.last_name[0].toLowerCase();
    return new RegExp(`\\b${li}\\b`).test(t) || t.includes(' ' + li);
  });
  if (byInitial.length === 1) return { student: byInitial[0], ambiguous: null };

  return { student: null, ambiguous: hits };
}

/** Split a dictated line into chunks, one per student.
 *  Kept for the typed path and for tests; parseGrades no longer relies on it. */
export function chunkUtterance(raw) {
  return String(raw || '').split(/,|\band\b|\.|;/i).map(c => c.trim()).filter(Boolean);
}

/* ---------------------------------------------------------------------------
   THE PARSE
   ---------------------------------------------------------------------------
   Speech recognition returns NO PUNCTUATION. Say "Marcus 88 Kayla absent Josh
   missing Emma 39" and the Web Speech API hands back exactly that — one
   unbroken string with not a comma in it. Any parser that splits on commas
   therefore sees a single chunk, takes the first name and the first
   score/status it trips over, and silently throws the rest away. Worse, it can
   attach the WRONG value to the one name it found — marking Marcus "missing"
   when he actually got an 88.

   So we don't split on punctuation. We scan the words and let the ROSTER NAMES
   themselves mark the boundaries: every recognised name opens a new grade, and
   the score or status that follows attaches to it. Commas, when they exist, are
   just whitespace. One code path for typed and dictated alike.
--------------------------------------------------------------------------- */

const TENS = { ninety: 90, eighty: 80, seventy: 70, sixty: 60, fifty: 50, forty: 40, thirty: 30, twenty: 20 };

function tokenize(raw) {
  return String(raw || '')
    .replace(/[.,;!?]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => ({ t, l: t.toLowerCase() }));
}

/** A number starting at i: "88", "seventy", "seventy eight", "one hundred". */
function matchNumberAt(tk, i) {
  const w = tk[i]?.l;
  if (!w) return null;

  if (/^\d{1,3}$/.test(w)) return { value: Math.min(100, Number(w)), len: 1 };

  if ((w === 'one' || w === 'a') && tk[i + 1]?.l === 'hundred') return { value: 100, len: 2 };
  if (w === 'hundred') return { value: 100, len: 1 };
  if (w === 'zero') return { value: 0, len: 1 };

  if (TENS[w] != null) {
    const next = tk[i + 1]?.l;
    if (ONES[next] != null) return { value: TENS[w] + ONES[next], len: 2 };
    return { value: TENS[w], len: 1 };
  }
  if (w === 'ten') return { value: 10, len: 1 };
  return null;
}

/** A status starting at i. Phrases are matched longest-first so "make up" wins
 *  over a bare "up", and a status Traci adds later matches on its own name. */
function matchStatusAt(tk, i, statuses) {
  const phrases = [];
  const synonyms = {
    absent: ['absent', 'was out', 'not here', 'wasn\'t here'],
    missing: ['missing', "didn't turn it in", "didn't turn it in", 'no work', 'nothing', 'never turned it in'],
    makeup: ['makeup', 'make up', 'making it up'],
  };
  for (const st of statuses) {
    if (st.expects_score) continue;                    // 'done' is not spoken
    for (const p of (synonyms[st.code] || [])) phrases.push({ code: st.code, words: p.split(' ') });
    phrases.push({ code: st.code, words: [st.code] }); // the status's own name
  }
  phrases.sort((a, b) => b.words.length - a.words.length);

  for (const p of phrases) {
    if (p.words.every((w, k) => tk[i + k]?.l === w)) return { code: p.code, len: p.words.length };
  }
  return null;
}

/** A roster name starting at i. Consumes a following last initial or last name
 *  when one is there, so "Josh G" resolves and the "G" isn't left as noise. */
function matchNameAt(tk, i, students) {
  const w = tk[i]?.l;
  if (!w) return null;

  let hits = students.filter(s => s.first_name.toLowerCase() === w);
  if (!hits.length) hits = students.filter(s => {
    const f = s.first_name.toLowerCase();
    return w.length > 2 && (w === f + "'s" || (f.startsWith(w) && w.length >= f.length - 1));
  });
  if (!hits.length) return null;

  const next = tk[i + 1]?.l;
  if (next) {
    const narrowed = hits.filter(s => s.last_name &&
      (next === s.last_name.toLowerCase() || next === s.last_name[0].toLowerCase()));
    // Only consume the next token if it actually disambiguates or confirms.
    if (narrowed.length === 1 && (hits.length > 1 || next.length === 1 || next === narrowed[0].last_name.toLowerCase())) {
      return { students: narrowed, len: 2 };
    }
  }
  return { students: hits, len: 1 };
}

export function parseGrades(raw, students, statuses) {
  const tk = tokenize(raw);
  const defaultStatus = (statuses.find(s => s.expects_score) || statuses[0])?.code;
  const expects = code => !!statuses.find(s => s.code === code)?.expects_score;
  const said = (a, b) => tk.slice(a, b).map(x => x.t).join(' ');

  const entries = [];
  let cur = null;
  let spanStart = 0;                 // first token not yet accounted for

  const close = () => { if (cur) { entries.push(cur); spanStart = cur.end; cur = null; } };

  for (let i = 0; i < tk.length;) {
    const nm = matchNameAt(tk, i, students);
    if (nm) {
      close();
      cur = { students: nm.students, score: null, status: null, start: i, end: i + nm.len };
      i += nm.len;
      continue;
    }

    const st = matchStatusAt(tk, i, statuses);
    if (st) {
      if (cur && cur.status == null && cur.score == null) {
        cur.status = st.code; cur.end = i + st.len;
      } else {
        // A status with nobody to pin it on — or a second one for the same kid.
        const from = cur ? (close(), spanStart) : spanStart;
        entries.push({ orphan: true, status: st.code, score: null, start: from, end: i + st.len });
        spanStart = i + st.len;
      }
      i += st.len;
      continue;
    }

    const num = matchNumberAt(tk, i);
    if (num) {
      if (cur && cur.score == null && cur.status == null) {
        cur.score = num.value; cur.end = i + num.len;
      } else {
        const from = cur ? (close(), spanStart) : spanStart;
        entries.push({ orphan: true, score: num.value, status: null, start: from, end: i + num.len });
        spanStart = i + num.len;
      }
      i += num.len;
      continue;
    }

    i++;   // filler — "got", "a", "she", "apply that"
  }
  close();

  return entries.map(e => {
    const heard = said(e.start, e.end).trim();

    if (e.orphan) {
      return { heard, ok: false, ambiguous: null, reason: 'no-student', score: e.score, status: e.status };
    }
    if (e.students.length > 1) {
      return { heard, ok: false, ambiguous: e.students, reason: 'ambiguous', score: e.score, status: e.status };
    }
    if (e.score == null && e.status == null) {
      return { heard, ok: false, ambiguous: null, reason: 'no-value', student: e.students[0], score: null, status: null };
    }

    const finalStatus = e.status || defaultStatus;
    return {
      heard, ok: true, student: e.students[0],
      status: finalStatus,
      score: expects(finalStatus) ? e.score : null,
    };
  }).filter(p => p.heard.length > 0);
}

/** Names dictated for the roster: "add Avery Brooks, Marcus Davis". */
export function parseRosterNames(raw) {
  return String(raw || '')
    .split(/,|\band\b|;|\n/i)
    .map(s => s.replace(/\b(add|student|students|please)\b/gi, '').replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 1);
}
