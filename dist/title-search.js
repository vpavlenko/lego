export const normalizeSearch = text =>
  text.toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');

const wordCharacter = /[\p{L}\p{N}]/u;

export function findTitleMatch(title, phrase, terms) {
  const normalized = normalizeSearch(title);
  if (normalized === phrase) return { rank: 0, ranges: [[0, normalized.length]] };

  const ranges = [];
  let wholeWords = false;
  for (let start = normalized.indexOf(phrase); start !== -1; start = normalized.indexOf(phrase, start + 1)) {
    const end = start + phrase.length;
    ranges.push([start, end]);
    if (!wordCharacter.test(normalized[start - 1] ?? '') && !wordCharacter.test(normalized[end] ?? '')) {
      wholeWords = true;
    }
  }
  if (ranges.length) return { rank: wholeWords ? 1 : 2, ranges };
  if (!terms.every(term => normalized.includes(term))) return null;

  for (const term of new Set(terms)) {
    for (let start = normalized.indexOf(term); start !== -1; start = normalized.indexOf(term, start + 1)) {
      ranges.push([start, start + term.length]);
    }
  }
  return { rank: 3, ranges };
}

export function highlightTitle(title, match, escapeHTML) {
  if (!match) return escapeHTML(title);

  const starts = [], ends = [];
  for (const { 0: character, index } of title.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const length = normalizeSearch(character).length;
    for (let i = 0; i < length; i++) {
      starts.push(index);
      ends.push(index + character.length);
    }
  }

  let html = '', cursor = 0;
  const ranges = [];
  for (const [start, end] of match.ranges.sort(([a], [b]) => a - b)) {
    const last = ranges.at(-1);
    const from = starts[start], to = ends[end - 1];
    if (last && from < last[1]) last[1] = Math.max(last[1], to);
    else ranges.push([from, to]);
  }
  for (const [start, end] of ranges) {
    html += escapeHTML(title.slice(cursor, start)) + '<mark>' + escapeHTML(title.slice(start, end)) + '</mark>';
    cursor = end;
  }
  return html + escapeHTML(title.slice(cursor));
}
