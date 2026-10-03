export function normalizedQuery(value) { return value.toLowerCase().replace(/\s+/g, ' ').trim(); }

// A character-to-PDF-item map lets a result span multiple text runs and lines.
export function indexText(items) {
  let text = ''; const positions = [];
  const add = (char, item, offset) => {
    for (const c of char.toLowerCase()) {
      const normalized = /\s/.test(c) ? ' ' : c;
      if (normalized === ' ' && text.endsWith(' ')) continue;
      text += normalized; positions.push({ item, offset });
    }
  };
  const runs = items.filter(item => typeof item.str === 'string');
  runs.forEach((item, i) => {
    if (i) {
      const previous = runs[i - 1], a = previous.transform, b = item.transform;
      const lineBreak = previous.hasEOL || (a && b && Math.abs(a[5] - b[5]) > Math.abs(a[3] || 1) * .5);
      const gap = a && b && b[4] - (a[4] + previous.width) > Math.abs(a[0] || 1) * .15;
      if (lineBreak || gap) add(' ', i, 0);
    }
    for (let offset = 0; offset < item.str.length; offset++) add(item.str[offset], i, offset);
  });
  return { text, positions };
}

export function findMatches(index, query) {
  query = normalizedQuery(query);
  if (!query) return [];
  const matches = [];
  for (let from = 0, start; (start = index.text.indexOf(query, from)) !== -1; from = start + query.length) {
    matches.push({ start: index.positions[start], end: index.positions[start + query.length - 1] });
  }
  return matches;
}
