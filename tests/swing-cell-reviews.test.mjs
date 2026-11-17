import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const manifest = read('src/music/swing-cell-reviews.json');
const audit = read('evidence/satin-doll-swing-cells.json');
const sourceEntries = read('dist/data/openbook-melodies.json').entries;
const entry = Object.values(sourceEntries).find(item => item.id === 'openbook-satin-doll-laurent');
const review = manifest.entries[0];
const expectedCells = [0, 8, 32, 40, 65, 66, 69, 70, 80, 82, 84, 86, 96, 104];
const tuple = (note, index) => ({index, pitch: note.pitch, start: note.start, duration: note.duration});
const overlaps = q => entry.notes.flatMap((note, index) =>
  note.start < q + 1 && note.start + note.duration > q ? [tuple(note, index)] : []);
const edges = q => [...new Set(entry.notes.flatMap(note => [note.start, note.start + note.duration])
  .filter(time => q < time && time < q + 1).map(time => time - q))].sort();

// A review is valid only against the exact written source event identities.
function validate(candidate) {
  assert.equal(candidate.melodyId, entry.id);
  assert.equal(candidate.sourceSha256, audit.source.sha256);
  assert.deepEqual(candidate.cells.map(cell => cell.start), expectedCells);
  for (const cell of candidate.cells) {
    assert.equal(cell.sourceSplit, 0.75);
    assert.deepEqual(cell.notes, overlaps(cell.start));
    assert.deepEqual(edges(cell.start), [0.75]);
  }
}

test('review pins the exact source and complete set of three-quarter split cells', () => {
  assert.equal(manifest.entries.length, 1);
  assert.equal(review.sourceSha256, 'bc81849b766df62a5825a53c4bd70437877f1a1e69dbb6a3aa417ca9a1e722f5');
  assert.equal(entry.notes.length, 97);
  assert.equal(entry.totalBeats, 128);
  validate(review);
  assert.deepEqual(Array.from({length: 128}, (_, q) => q).filter(q => edges(q).includes(0.75)), expectedCells);
  assert.equal(audit.counts.unreviewedThreeQuarterSplitCells, 0);
  assert.equal(audit.counts.ordinaryHalfSplitCells, 43);
  assert.equal(audit.compiler.normalAndDiagnosticMidiEventsIdentical, true);
  assert.equal(audit.compiler.committedSourceNotesEqualFreshCompiler, true);
  const midi = fs.readFileSync(new URL(audit.sourceMidi.path, root));
  assert.equal(crypto.createHash('sha256').update(midi).digest('hex'), audit.sourceMidi.sha256);
});

test('every source tuple is supported by literal source durations and independent matching-pitch eighths', () => {
  for (const cell of review.cells) {
    const proof = audit.cells.find(row => row.start === cell.start);
    assert.deepEqual(proof.compiledMergedEvents, cell.notes);
    assert(proof.sourceLiteralLine.includes(cell.sourceNotation));
    assert.deepEqual(proof.compiledWrittenSegments.map(n => [n.start, n.duration, n.sourceLine]),
      [[cell.start, 0.75, cell.sourceLine], [cell.start + 0.75, 0.25, cell.sourceLine]]);
    assert.deepEqual(proof.witness.notes.map(n => n.pitch), cell.notes.map(n => n.pitch));
    assert.deepEqual(proof.witness.notes.map(n => [n.start - proof.witness.withinMeasure, n.duration, n.writtenType, n.dots]),
      [[0, 0.5, 'eighth', 0], [0.5, 0.5, 'eighth', 0]]);
    assert.equal(proof.targetSplit, 0.67);
    assert.equal(proof.witness.writtenMeasureNumber, audit.witness.performedSourceMeasureNumbers[Math.floor(cell.start / 4)]);
  }
  assert.equal(audit.witness.performedSourceMeasureNumbers.length, 32);
  assert.equal(audit.source.explicitSwingMark, false);
  assert.equal(audit.witness.explicitSwingMark, false);
});

test('tied figures pin their single existing attack instead of inventing a new onset', () => {
  const tied = review.cells.filter(cell => cell.notes[0].start < cell.start);
  assert.deepEqual(tied.map(cell => cell.start), [82, 86]);
  for (const cell of tied) {
    assert.equal(cell.sourceNotation, 'a~ a8. b16');
    assert.equal(cell.notes[0].start, cell.start - 0.5);
    assert.equal(cell.notes[0].duration, 1.25);
    assert.equal(cell.notes[0].pitch, 69);
    assert.equal(cell.notes[1].pitch, 71);
    assert.equal(entry.notes.some(note => note.start === cell.start), false);
  }
  assert.equal(audit.counts.tiedFirstSegments, tied.length);
  assert.equal(audit.counts.ordinaryPairs, review.cells.length - tied.length);
});

test('the data pins reject changed pitches, source durations, identities and unreviewed dotted cells', () => {
  const mutate = fn => { const changed = structuredClone(review); fn(changed); assert.throws(() => validate(changed)); };
  mutate(row => { row.sourceSha256 = 'wrong-source'; });
  mutate(row => { row.cells[0].notes[0].pitch++; });
  mutate(row => { row.cells[0].notes[0].duration = 0.5; });
  mutate(row => { row.cells[0].notes[0].index++; });
  mutate(row => { row.cells[0].start = 1; });
  mutate(row => { row.cells[0].sourceSplit = 0.5; });
});
