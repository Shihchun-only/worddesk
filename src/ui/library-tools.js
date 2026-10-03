const entrySearch = new Map();
const collapsedParts = new Map();
function bindLibraryTools(entry) {
  const toolbar = $('#word-detail .entry-toolbar'), content = detailScroller();
  if (!toolbar || !entry) return;
  const key = word().id + ':' + entry.source;
  const tools = document.createElement('div'); tools.className = 'entry-tools';
  tools.innerHTML = '<input id="sense-search" placeholder="搜索本词条释义或例句" aria-label="搜索本词条释义或例句"><button id="jump-selected">跳到已选释义</button><button id="fold-senses">折叠词性</button>' + (selectionDraft ? '<button id="preview-selection">预览复习内容</button>' : '') + (entry.previousExtraction ? '<button id="compare-extraction">对照更新</button>' : '');
  toolbar.append(tools);
  let group, groupIndex = -1;
  for (const node of [...content.children]) {
    if (node.matches('.pos-heading')) {
      groupIndex++; group = document.createElement('details'); group.className = 'sense-group'; group.dataset.groupIndex = groupIndex;
      group.open = !collapsedParts.get(key)?.has(groupIndex);
      const summary = document.createElement('summary'); summary.setAttribute('translate', 'no'); summary.textContent = node.textContent;
      node.before(group); group.append(summary); node.remove();
      group.addEventListener('toggle', () => {
        const set = collapsedParts.get(key) || new Set();
        group.open ? set.delete(+group.dataset.groupIndex) : set.add(+group.dataset.groupIndex); collapsedParts.set(key, set);
      });
    } else if (node.matches('.dictionary-sense') && group) group.append(node);
  }
  const filter = $('#sense-search'); filter.value = entrySearch.get(key) || '';
  function search() {
    const query = filter.value.trim().toLowerCase(); entrySearch.set(key, filter.value);
    for (const sense of content.querySelectorAll('.dictionary-sense')) {
      sense.hidden = !!query && !sense.textContent.toLowerCase().includes(query);
    }
    for (const group of content.querySelectorAll('.sense-group')) {
      group.hidden = ![...group.querySelectorAll('.dictionary-sense')].some(s => !s.hidden);
      if (query && !group.hidden) group.open = true;
    }
    let empty = content.querySelector('.sense-search-empty');
    if (!empty) { empty = document.createElement('p'); empty.className = 'sense-search-empty muted'; empty.textContent = '没有匹配的释义或例句'; content.prepend(empty); }
    empty.hidden = !query || !!content.querySelector('.dictionary-sense:not([hidden])');
  }
  filter.oninput = search; search();
  $('#fold-senses').onclick = event => {
    const groups = [...content.querySelectorAll('.sense-group')], close = groups.some(g => g.open);
    groups.forEach(g => g.open = !close); event.target.textContent = close ? '展开词性' : '折叠词性';
  };
  let selectedIndex = -1;
  $('#jump-selected').onclick = () => {
    filter.value = ''; search();
    const indices = entry.senses.map((sense, i) => (selectionDraft?.bySource[entry.source]?.[i].selected ?? sense.selected) ? i : -1).filter(i => i >= 0);
    if (!indices.length) { toast('尚未选择复习释义'); return; }
    selectedIndex = (selectedIndex + 1) % indices.length;
    const target = content.querySelector(`[data-sense-index="${indices[selectedIndex]}"]`);
    target.closest('.sense-group').open = true; target.scrollIntoView({ block: 'start' });
  };
  if ($('#preview-selection')) $('#preview-selection').onclick = previewSelection;
  if ($('#compare-extraction')) $('#compare-extraction').onclick = () => compareExtraction(entry);
  if (entry.quality) {
    const summary = document.createElement('p'); summary.className = 'extraction-quality';
    summary.innerHTML = '<span>提取数量（不代表完整性）</span> <strong translate="no">' + (entry.quality.previous == null ? '—' : entry.quality.previous) + ' → ' + entry.quality.current + '</strong>' + (entry.quality.needsReview ? ' <span>数量减少，请核查</span>' : '');
    content.prepend(summary);
  }
}
function previewSelection() {
  const preview = structuredClone(word());
  for (const [source, values] of Object.entries(selectionDraft.bySource)) {
    preview.entries[source].senses.forEach((sense, i) => { Object.assign(sense, { selected: values[i].selected, includeChinese: values[i].includeChinese }); sense.examples.forEach((example, j) => example.selected = values[i].examples[j]); });
  }
  const target = $('#selection-preview-content');
  target.innerHTML = selectedSources(preview).map(source => sensesHTML(preview.entries[source], true)).join('') || '<p>尚未选择复习释义</p>';
  target.querySelectorAll('button,textarea').forEach(el => el.remove());
  if (preview.notes) { const notes = document.createElement('p'); notes.setAttribute('translate', 'no'); notes.textContent = preview.notes; target.append(notes); }
  $('#selection-preview').showModal();
}
function compareExtraction(entry) {
  const list = senses => senses.map(s => `<section><p translate="no">${esc(s.pos)} · ${esc(s.number)}</p><p translate="no">${esc(s.editedDefinition ?? s.definition)}</p><p translate="no">${esc(s.editedTranslation ?? s.translation)}</p></section>`).join('');
  $('#extraction-comparison').innerHTML = '<div><h3>上次内容（含个人修改）</h3>' + list(entry.previousExtraction.senses) + '</div><div><h3>本次内容</h3>' + list(entry.senses) + '</div>';
  $('#compare-dialog').showModal();
}
