// node --test test/
//
// These tests guard the places where a quiet bug ends up in a real kid's grade.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  splitName, displayName, parseCsvNames, splitCsvLine, toCsv,
  parseScore, detectStatus, nameToken, matchStudent,
  parseGrades, parseRosterNames,
} from '../lib.js';

const STATUSES = [
  { code: 'done', label: 'Graded', is_owed: false, expects_score: true },
  { code: 'missing', label: 'Missing', is_owed: true, expects_score: false },
  { code: 'absent', label: 'Absent', is_owed: true, expects_score: false },
  { code: 'makeup', label: 'Makeup pending', is_owed: true, expects_score: false },
];

const ROSTER = [
  { id: 's1', first_name: 'Marcus', last_name: 'Davis' },
  { id: 's2', first_name: 'Kayla', last_name: 'Fields' },
  { id: 's3', first_name: 'Josh', last_name: 'Grant' },
  { id: 's4', first_name: 'Emma', last_name: 'Hayes' },
];

/* ---------------------------------------------------------------- names --- */

test('splitName keeps the last name optional', () => {
  assert.deepEqual(splitName('Marcus Davis'), { first_name: 'Marcus', last_name: 'Davis' });
  assert.deepEqual(splitName('Marcus'), { first_name: 'Marcus', last_name: null });
  assert.deepEqual(splitName('  Mary  Beth  Cline '), { first_name: 'Mary', last_name: 'Beth Cline' });
  assert.equal(splitName('   '), null);
});

test('displayName omits the initial when there is no last name', () => {
  assert.equal(displayName({ first_name: 'Marcus', last_name: 'Davis' }), 'Marcus D.');
  assert.equal(displayName({ first_name: 'Marcus', last_name: null }), 'Marcus');
  assert.equal(displayName({ first_name: 'Marcus', last_name: '' }), 'Marcus');
});

/* ------------------------------------------------------------------ csv --- */

test('parseCsvNames handles headers, one column, two columns', () => {
  assert.deepEqual(parseCsvNames('First,Last\nMarcus,Davis\nKayla,Fields'), ['Marcus Davis', 'Kayla Fields']);
  assert.deepEqual(parseCsvNames('Marcus\nKayla\nJosh'), ['Marcus', 'Kayla', 'Josh']);
  assert.deepEqual(parseCsvNames('Student\nMarcus,Davis'), ['Marcus Davis']);
  assert.deepEqual(parseCsvNames(''), []);
});

test('splitCsvLine respects quotes — a comma inside quotes is not a separator', () => {
  assert.deepEqual(splitCsvLine('Marcus,Davis'), ['Marcus', 'Davis']);
  assert.deepEqual(splitCsvLine('"Davis, Marcus"'), ['Davis, Marcus']);
  assert.deepEqual(splitCsvLine('"Davis, Marcus",7th'), ['Davis, Marcus', '7th']);
  assert.deepEqual(splitCsvLine('"O""Brien",Kayla'), ['O"Brien', 'Kayla']);
});

test('parseCsvNames survives the FACTS-style "Last, First" export', () => {
  // This is the case that would have silently split one student into two.
  assert.deepEqual(parseCsvNames('Name\n"Davis, Marcus"\n"Fields, Kayla"'),
    ['Marcus Davis', 'Kayla Fields']);
});

test('parseCsvNames honours a Last,First header ordering', () => {
  assert.deepEqual(parseCsvNames('Last,First\nDavis,Marcus\nFields,Kayla'),
    ['Marcus Davis', 'Kayla Fields']);
});

test('parseCsvNames keeps an apostrophe name intact', () => {
  assert.deepEqual(parseCsvNames('First,Last\nSean,"O\'Brien"'), ["Sean O'Brien"]);
});

test('parseCsvNames does not eat a real student named like a header', () => {
  // "Name" as a header is skipped, but a lone first name is never treated as one
  // unless it is literally in row 0.
  assert.deepEqual(parseCsvNames('Marcus\nName'), ['Marcus', 'Name']);
});

test('toCsv: ungraded is blank, not zero', () => {
  const students = [{ id: 's1', first_name: 'Marcus', last_name: 'Davis' }];
  const assignments = [{ id: 'a1', name: 'HW 1' }, { id: 'a2', name: 'HW 2' }, { id: 'a3', name: 'HW 3' }];
  const cells = new Map([
    ['s1|a1', { status: 'done', score: 88 }],
    ['s1|a2', { status: 'missing', score: null }],
    // a3 deliberately absent from the map — never entered
  ]);
  const csv = toCsv({ students, assignments, cells, statuses: STATUSES });
  const [header, row] = csv.trim().split('\n');
  assert.equal(header, '"Student","HW 1","HW 2","HW 3"');
  assert.equal(row, '"Marcus D.","88","MISSING",""');
});

/* ---------------------------------------------------------------- voice --- */

test('parseScore reads digits and spoken numbers', () => {
  assert.equal(parseScore('marcus 78'), 78);
  assert.equal(parseScore('emma got a 92'), 92);
  assert.equal(parseScore('liam seventy'), 70);
  assert.equal(parseScore('grace seventy eight'), 78);
  assert.equal(parseScore('tyler one hundred'), 100);
  assert.equal(parseScore('diego ninety nine'), 99);
  assert.equal(parseScore('sofia zero'), 0);
  assert.equal(parseScore('kayla absent'), null);
});

test('parseScore never exceeds 100', () => {
  assert.equal(parseScore('marcus 250'), 100);
});

test('detectStatus recognises the shipped four and their synonyms', () => {
  assert.equal(detectStatus('kayla absent', STATUSES), 'absent');
  assert.equal(detectStatus('kayla was out', STATUSES), 'absent');
  assert.equal(detectStatus('josh missing', STATUSES), 'missing');
  assert.equal(detectStatus("josh didn't turn it in", STATUSES), 'missing');
  assert.equal(detectStatus('emma makeup', STATUSES), 'makeup');
  assert.equal(detectStatus('emma make up', STATUSES), 'makeup');
  assert.equal(detectStatus('marcus 78', STATUSES), null);
});

test('detectStatus picks up a status Traci adds later, with no code change', () => {
  const withLate = [...STATUSES, { code: 'late', label: 'Late', is_owed: true, expects_score: false }];
  assert.equal(detectStatus('marcus late', withLate), 'late');
  assert.equal(detectStatus('marcus 78', withLate), null);
});

test('matchStudent resolves a clean first name', () => {
  assert.equal(matchStudent('marcus', ROSTER).student.id, 's1');
  assert.equal(matchStudent('Kayla', ROSTER).student.id, 's2');
});

test('matchStudent returns nothing for an unknown name — it never guesses', () => {
  const r = matchStudent('bartholomew', ROSTER);
  assert.equal(r.student, null);
  assert.equal(r.ambiguous, null);
});

test('matchStudent flags a first-name collision instead of picking one', () => {
  const twoJoshes = [...ROSTER, { id: 's5', first_name: 'Josh', last_name: 'Pike' }];
  const r = matchStudent('josh', twoJoshes);
  assert.equal(r.student, null, 'must not silently choose a Josh');
  assert.deepEqual(r.ambiguous.map(s => s.id), ['s3', 's5']);
});

test('matchStudent breaks a collision on a spoken last initial', () => {
  const twoJoshes = [...ROSTER, { id: 's5', first_name: 'Josh', last_name: 'Pike' }];
  assert.equal(matchStudent('josh g', twoJoshes).student.id, 's3');
  assert.equal(matchStudent('josh p', twoJoshes).student.id, 's5');
});

test('nameToken strips scores and filler', () => {
  assert.equal(nameToken('Marcus 78'), 'Marcus');
  assert.equal(nameToken('Emma got a 92'), 'Emma');
  assert.equal(nameToken('Kayla was absent'), 'Kayla');
});

/* ------------------------------------------------------- the whole parse --- */

/* Speech recognition returns NO punctuation. These are the cases that matter
   most, because they are what the live mic actually produces. */

test('parseGrades: DICTATED with no punctuation at all', () => {
  const out = parseGrades('Marcus 88 Kayla absent Josh missing Emma 39', ROSTER, STATUSES);
  assert.equal(out.length, 4, 'must find all four, not just the first');
  assert.deepEqual(out.map(p => [p.student?.first_name, p.status, p.score]), [
    ['Marcus', 'done', 88],
    ['Kayla', 'absent', null],
    ['Josh', 'missing', null],
    ['Emma', 'done', 39],
  ]);
});

test('parseGrades: dictated and typed produce identical results', () => {
  const dictated = parseGrades('Marcus 88 Kayla absent Josh missing Emma 39', ROSTER, STATUSES);
  const typed = parseGrades('Marcus 88, Kayla absent, Josh missing, Emma 39', ROSTER, STATUSES);
  const shape = o => o.map(p => [p.student?.id, p.status, p.score, p.ok]);
  assert.deepEqual(shape(dictated), shape(typed));
});

test('parseGrades: a score must never leak onto the next student', () => {
  // The old parser collapsed this into one row and put "missing" on Marcus,
  // wiping his 88. That is the bug this whole rewrite exists to prevent.
  const out = parseGrades('Marcus 88 Kayla absent', ROSTER, STATUSES);
  assert.equal(out[0].student.first_name, 'Marcus');
  assert.equal(out[0].score, 88);
  assert.equal(out[0].status, 'done');
  assert.equal(out[1].student.first_name, 'Kayla');
  assert.equal(out[1].status, 'absent');
  assert.equal(out[1].score, null);
});

test('parseGrades: dictated spoken numbers and filler words', () => {
  const out = parseGrades('Marcus got a seventy eight Emma one hundred', ROSTER, STATUSES);
  assert.deepEqual(out.map(p => [p.student.first_name, p.score]), [['Marcus', 78], ['Emma', 100]]);
});

test('parseGrades: dictated, an unknown name is still flagged not swallowed', () => {
  const out = parseGrades('Marcus 88 Bartholomew 50', ROSTER, STATUSES);
  assert.equal(out[0].ok, true);
  assert.equal(out[0].score, 88, "Marcus keeps his own score");
  assert.equal(out[1].ok, false);
  assert.equal(out[1].reason, 'no-student');
});

test('parseGrades: dictated, a collision still refuses to guess', () => {
  const twoJoshes = [...ROSTER, { id: 's5', first_name: 'Josh', last_name: 'Pike' }];
  const out = parseGrades('Josh 90 Emma 70', twoJoshes, STATUSES);
  assert.equal(out[0].ok, false);
  assert.equal(out[0].reason, 'ambiguous');
  assert.equal(out[1].student.first_name, 'Emma');
});

test('parseGrades: dictated, last initial disambiguates mid-stream', () => {
  const twoJoshes = [...ROSTER, { id: 's5', first_name: 'Josh', last_name: 'Pike' }];
  const out = parseGrades('Josh G 90 Josh P 70', twoJoshes, STATUSES);
  assert.deepEqual(out.map(p => [p.student.id, p.score]), [['s3', 90], ['s5', 70]]);
});

test('parseGrades: a name with no score or status is flagged, not defaulted', () => {
  const out = parseGrades('Marcus', ROSTER, STATUSES);
  assert.equal(out[0].ok, false);
  assert.equal(out[0].reason, 'no-value');
});

test('parseGrades: trailing voice noise is ignored', () => {
  const out = parseGrades('Marcus 88 Kayla absent apply that', ROSTER, STATUSES);
  assert.equal(out.length, 2);
  assert.equal(out.every(p => p.ok), true);
});

test('parseGrades handles the canonical utterance', () => {
  const out = parseGrades('Marcus 78, Kayla absent, Josh missing, Emma 92', ROSTER, STATUSES);
  assert.equal(out.length, 4);

  assert.equal(out[0].ok, true);
  assert.equal(out[0].student.id, 's1');
  assert.equal(out[0].status, 'done');
  assert.equal(out[0].score, 78);

  assert.equal(out[1].ok, true);
  assert.equal(out[1].student.id, 's2');
  assert.equal(out[1].status, 'absent');
  assert.equal(out[1].score, null, 'an absent student must never carry a score');

  assert.equal(out[2].status, 'missing');
  assert.equal(out[2].score, null);

  assert.equal(out[3].status, 'done');
  assert.equal(out[3].score, 92);
});

test('parseGrades: a status always wins over a stray number', () => {
  // "Kayla absent" said right after a score must not inherit the score.
  const out = parseGrades('Kayla was absent on the 4th', ROSTER, STATUSES);
  assert.equal(out[0].status, 'absent');
  assert.equal(out[0].score, null);
});

test('parseGrades flags an unknown name rather than dropping it silently', () => {
  const out = parseGrades('Marcus 78, Bartholomew 90', ROSTER, STATUSES);
  assert.equal(out[0].ok, true);
  assert.equal(out[1].ok, false, 'unmatched name must surface for review');
  assert.equal(out[1].heard.trim(), 'Bartholomew 90');
});

test('parseGrades never returns an applicable row without a student', () => {
  const out = parseGrades('uh, hmm, 78', ROSTER, STATUSES);
  assert.equal(out.every(p => !p.ok || p.student), true);
});

test('parseRosterNames pulls clean names out of dictation', () => {
  assert.deepEqual(
    parseRosterNames('add Avery Brooks, Marcus Davis and Kayla Fields'),
    ['Avery Brooks', 'Marcus Davis', 'Kayla Fields']);
  assert.deepEqual(parseRosterNames('Josh'), ['Josh']);
  assert.deepEqual(parseRosterNames(''), []);
});
