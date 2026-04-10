/* ─────────────────────────────────────────────────────────────
   Bible Reader – app.js
   ───────────────────────────────────────────────────────────── */

// ── State ─────────────────────────────────────────────────────
let currentBook    = null;
let currentChapter = null;
let chapterData    = null;
let bibleData      = {};
let selectedVerses = new Set();   // verse numbers currently selected

// ── DOM refs ─────────────────────────────────────────────────
const readerContent = document.getElementById('readerContent');
const readerArea    = document.getElementById('readerArea');
const navLabel      = document.getElementById('navLabel');

// ── Tab switching ─────────────────────────────────────────────
document.querySelectorAll('.sidebar-tabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── Helpers ────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) {
  return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function getSelectedRange() {
  if (!selectedVerses.size) return null;
  const sorted = [...selectedVerses].sort((a, b) => a - b);
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

function verseRangeLabel(book, chapter, vs, ve) {
  if (vs && ve && vs !== ve) return `${book} ${chapter}:${vs}–${ve}`;
  if (vs) return `${book} ${chapter}:${vs}`;
  return `${book} ${chapter}`;
}

// ═══════════════════════════════════════════════════════════════
//  CHAPTER LOADING & RENDERING
// ═══════════════════════════════════════════════════════════════
async function loadChapter(book, chapter) {
  currentBook = book;
  currentChapter = chapter;
  selectedVerses.clear();

  readerContent.innerHTML = '<div class="loader"><div class="loader__spinner"></div>Loading…</div>';

  try {
    const res = await fetch(`/api/chapter/${encodeURIComponent(book)}/${chapter}`);
    if (!res.ok) throw new Error('Chapter not found');
    chapterData = await res.json();
    renderChapter();
    updateNavLabel();
    highlightActiveChapter();
    readerArea.scrollTop = 0;
  } catch (e) {
    readerContent.innerHTML = `<div class="reader-welcome"><h2>Error</h2><p>${escHtml(e.message)}</p></div>`;
  }
}

function renderChapter() {
  const d = chapterData;
  let html = '';

  // Chapter header
  html += '<div class="chapter-header">';
  html += `<div class="chapter-book-name">${escHtml(d.book)}</div>`;
  html += `<div class="chapter-title">Chapter ${d.chapter}</div>`;
  html += '</div>';

  // Verses
  const footnotes = [];
  let currentHeading = null;

  html += '<div class="verse-paragraph">';
  for (const v of d.verses) {
    if (v.heading && v.heading !== currentHeading) {
      currentHeading = v.heading;
      html += '</div>';
      html += `<div class="verse-section-heading">${escHtml(v.heading)}</div>`;
      html += '<div class="verse-paragraph">';
    }

    let text = escHtml(v.text);
    text = text.replace(/\((\d+)\)/g, '<span class="footnote-ref" title="See footnote $1">$1</span>');

    // Check if this verse has a highlight
    const hlColor = getVerseHighlightColor(v.verse);
    const hlStyle = hlColor ? ` highlighted" style="background:${hlColor}` : '';

    html += `<span class="verse${hlStyle}" data-verse="${v.verse}"><span class="verse-num">${v.verse}</span><span class="verse-text">${text}</span> </span>`;

    if (v.footnotes && v.footnotes.length) {
      footnotes.push(...v.footnotes);
    }
  }
  html += '</div>';

  // Footnotes
  if (footnotes.length) {
    html += '<div class="footnotes-section">';
    html += '<div class="footnotes-title">Footnotes</div>';
    for (const fn of footnotes) {
      html += `<div class="footnote-item">${escHtml(fn)}</div>`;
    }
    html += '</div>';
  }

  // Navigation
  html += '<div class="chapter-nav">';
  if (d.prev) {
    html += `<button class="chapter-nav-btn" onclick="loadChapter('${escAttr(d.prev.book)}', ${d.prev.chapter})">‹ ${escHtml(d.prev.book)} ${d.prev.chapter}</button>`;
  } else {
    html += '<div></div>';
  }
  if (d.next) {
    html += `<button class="chapter-nav-btn" onclick="loadChapter('${escAttr(d.next.book)}', ${d.next.chapter})">${escHtml(d.next.book)} ${d.next.chapter} ›</button>`;
  } else {
    html += '<div></div>';
  }
  html += '</div>';

  readerContent.innerHTML = html;

  // Attach verse click handlers
  readerContent.querySelectorAll('.verse[data-verse]').forEach(el => {
    el.addEventListener('click', (e) => {
      // Don't select if clicking a footnote ref
      if (e.target.classList.contains('footnote-ref')) return;
      e.preventDefault();
      const vn = parseInt(el.dataset.verse);
      if (e.shiftKey && selectedVerses.size > 0) {
        // Range select
        const sorted = [...selectedVerses].sort((a, b) => a - b);
        const anchor = sorted[0];
        selectedVerses.clear();
        const lo = Math.min(anchor, vn), hi = Math.max(anchor, vn);
        for (let i = lo; i <= hi; i++) selectedVerses.add(i);
      } else if (e.metaKey || e.ctrlKey) {
        // Toggle single verse
        if (selectedVerses.has(vn)) selectedVerses.delete(vn);
        else selectedVerses.add(vn);
      } else {
        // Single select / deselect
        if (selectedVerses.size === 1 && selectedVerses.has(vn)) {
          selectedVerses.clear();
        } else {
          selectedVerses.clear();
          selectedVerses.add(vn);
        }
      }
      updateVerseSelectionUI();
    });
  });
}

function updateVerseSelectionUI() {
  // Update selected class on verse elements
  readerContent.querySelectorAll('.verse[data-verse]').forEach(el => {
    const vn = parseInt(el.dataset.verse);
    el.classList.toggle('selected', selectedVerses.has(vn));
  });

  // Show/hide selection bar
  let bar = readerContent.querySelector('.verse-selection-bar');
  if (selectedVerses.size > 0) {
    const range = getSelectedRange();
    const label = selectedVerses.size === 1
      ? `Verse ${range.start}`
      : `Verses ${range.start}–${range.end}`;
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'verse-selection-bar';
      // Insert before chapter-nav
      const nav = readerContent.querySelector('.chapter-nav');
      if (nav) readerContent.insertBefore(bar, nav);
      else readerContent.appendChild(bar);
    }
    bar.innerHTML = `
      <span class="sel-label">${label} selected</span>
      <button onclick="openBookmarkForSelection()">🔖 Bookmark</button>
      <button onclick="openNoteForSelection()">✏️ Note</button>
      <button onclick="openHighlightForSelection()">🖍️ Highlight</button>
      <button class="sel-clear" onclick="clearSelection()" title="Clear selection">✕</button>
    `;
  } else if (bar) {
    bar.remove();
  }
}

function clearSelection() {
  selectedVerses.clear();
  updateVerseSelectionUI();
}

function getVerseHighlightColor(verseNum) {
  if (!currentBook || !currentChapter) return null;
  for (const h of highlights) {
    if (h.book === currentBook && h.chapter === currentChapter &&
        verseNum >= h.verse_start && verseNum <= h.verse_end) {
      return h.color;
    }
  }
  return null;
}

function updateNavLabel() {
  if (currentBook && currentChapter) {
    navLabel.textContent = `${currentBook} ${currentChapter}`;
  } else {
    navLabel.textContent = 'Select a book';
  }
}

// ── Navigation ────────────────────────────────────────────────
document.getElementById('btnPrev').addEventListener('click', () => {
  if (chapterData && chapterData.prev) loadChapter(chapterData.prev.book, chapterData.prev.chapter);
});
document.getElementById('btnNext').addEventListener('click', () => {
  if (chapterData && chapterData.next) loadChapter(chapterData.next.book, chapterData.next.chapter);
});

document.addEventListener('keydown', (e) => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === 'ArrowRight' && chapterData && chapterData.next) loadChapter(chapterData.next.book, chapterData.next.chapter);
  if (e.key === 'ArrowLeft'  && chapterData && chapterData.prev) loadChapter(chapterData.prev.book, chapterData.prev.chapter);
  if (e.key === 'Escape') clearSelection();
});

// ═══════════════════════════════════════════════════════════════
//  BOOKMARKS (with verse-level support)
// ═══════════════════════════════════════════════════════════════
let bookmarks = [];

async function loadBookmarks() {
  bookmarks = await (await fetch('/api/bookmarks')).json();
  renderBookmarkList();
}

function renderBookmarkList() {
  const el = document.getElementById('bookmarkList');
  if (!bookmarks.length) {
    el.innerHTML = '<div class="empty-msg">No bookmarks yet.<br>Select verses or tap 🔖 to bookmark.</div>';
    return;
  }
  el.innerHTML = bookmarks.map(b => {
    const loc = verseRangeLabel(b.book, b.chapter, b.verse_start, b.verse_end);
    return `
    <div class="list-card is-entering" id="bm-${b.id}">
      <div class="card-top">
        <span class="color-dot" style="background:${escHtml(b.color)}"></span>
        <span class="card-label" onclick="loadChapter('${escAttr(b.book)}', ${b.chapter})">${escHtml(b.label)}</span>
        <div class="card-actions">
          <button class="card-action-btn" onclick="deleteBookmark(${b.id})" title="Delete">✕</button>
        </div>
      </div>
      <div class="card-meta">${escHtml(loc)} · ${fmtDate(b.created)}</div>
    </div>`;
  }).join('');
}

function openBookmarkModal(verseStart, verseEnd) {
  if (!currentBook) return;
  const label = verseRangeLabel(currentBook, currentChapter, verseStart, verseEnd);
  document.getElementById('bmLabel').value = label;
  document.getElementById('bmContext').textContent = label;
  document.getElementById('bookmarkModal').classList.add('open');
  document.getElementById('bookmarkModal')._verseStart = verseStart || null;
  document.getElementById('bookmarkModal')._verseEnd = verseEnd || null;
  setTimeout(() => document.getElementById('bmLabel').focus(), 50);
}

function openBookmarkForSelection() {
  const range = getSelectedRange();
  if (range) openBookmarkModal(range.start, range.end);
  else openBookmarkModal(null, null);
}

document.getElementById('btnAddBookmark').addEventListener('click', () => {
  if (!currentBook) return;
  const range = getSelectedRange();
  if (range) openBookmarkModal(range.start, range.end);
  else openBookmarkModal(null, null);
});
document.getElementById('bmCancel').addEventListener('click', () => {
  document.getElementById('bookmarkModal').classList.remove('open');
});
document.getElementById('bmSave').addEventListener('click', async () => {
  if (!currentBook) return;
  const modal = document.getElementById('bookmarkModal');
  const vs = modal._verseStart, ve = modal._verseEnd;
  const label = document.getElementById('bmLabel').value.trim() ||
    verseRangeLabel(currentBook, currentChapter, vs, ve);
  const body = { book: currentBook, chapter: currentChapter, label };
  if (vs) { body.verse_start = vs; body.verse_end = ve || vs; }
  const bm = await (await fetch('/api/bookmarks', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  })).json();
  bookmarks.push(bm);
  renderBookmarkList();
  modal.classList.remove('open');
  clearSelection();
});

async function deleteBookmark(id) {
  await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
  bookmarks = bookmarks.filter(b => b.id !== id);
  renderBookmarkList();
}

// ═══════════════════════════════════════════════════════════════
//  NOTES (with verse-level support)
// ═══════════════════════════════════════════════════════════════
let notes = [];

async function loadNotes() {
  notes = await (await fetch('/api/notes')).json();
  renderNoteList();
}

function renderNoteList() {
  const el = document.getElementById('noteList');
  if (!notes.length) {
    el.innerHTML = '<div class="empty-msg">No notes yet.<br>Select verses or tap ✏️ to add a note.</div>';
    return;
  }
  el.innerHTML = notes.map(n => {
    const loc = verseRangeLabel(n.book, n.chapter, n.verse_start, n.verse_end);
    return `
    <div class="list-card is-entering">
      <div class="card-top">
        <span class="card-label" onclick="loadChapter('${escAttr(n.book)}', ${n.chapter})">${escHtml(loc)}</span>
        <div class="card-actions">
          <button class="card-action-btn" onclick="openEditNote(${n.id})" title="Edit">✎</button>
          <button class="card-action-btn" onclick="deleteNote(${n.id})" title="Delete">✕</button>
        </div>
      </div>
      <div class="card-text">${escHtml(n.text)}</div>
      <div class="card-meta">${fmtDate(n.created)}</div>
    </div>`;
  }).join('');
}

function openNoteModal(verseStart, verseEnd) {
  if (!currentBook) return;
  const label = verseRangeLabel(currentBook, currentChapter, verseStart, verseEnd);
  document.getElementById('noteContext').textContent = label;
  document.getElementById('noteText').value = '';
  document.getElementById('noteModal').classList.add('open');
  document.getElementById('noteModal')._verseStart = verseStart || null;
  document.getElementById('noteModal')._verseEnd = verseEnd || null;
  setTimeout(() => document.getElementById('noteText').focus(), 50);
}

function openNoteForSelection() {
  const range = getSelectedRange();
  if (range) openNoteModal(range.start, range.end);
  else openNoteModal(null, null);
}

document.getElementById('btnAddNote').addEventListener('click', () => {
  if (!currentBook) return;
  const range = getSelectedRange();
  if (range) openNoteModal(range.start, range.end);
  else openNoteModal(null, null);
});
document.getElementById('noteCancel').addEventListener('click', () => {
  document.getElementById('noteModal').classList.remove('open');
});
document.getElementById('noteSave').addEventListener('click', async () => {
  if (!currentBook) return;
  const modal = document.getElementById('noteModal');
  const text = document.getElementById('noteText').value.trim();
  if (!text) return;
  const vs = modal._verseStart, ve = modal._verseEnd;
  const body = { book: currentBook, chapter: currentChapter, text };
  if (vs) { body.verse_start = vs; body.verse_end = ve || vs; }
  const n = await (await fetch('/api/notes', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  })).json();
  notes.push(n);
  renderNoteList();
  modal.classList.remove('open');
  clearSelection();
});

function openEditNote(id) {
  const n = notes.find(x => x.id === id);
  if (!n) return;
  document.getElementById('enText').value = n.text;
  document.getElementById('enId').value = id;
  document.getElementById('editNoteModal').classList.add('open');
  setTimeout(() => document.getElementById('enText').focus(), 50);
}
document.getElementById('enCancel').addEventListener('click', () => {
  document.getElementById('editNoteModal').classList.remove('open');
});
document.getElementById('enSave').addEventListener('click', async () => {
  const id = parseInt(document.getElementById('enId').value, 10);
  const text = document.getElementById('enText').value.trim();
  if (!text) return;
  await fetch(`/api/notes/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
  notes = notes.map(n => n.id === id ? { ...n, text } : n);
  renderNoteList();
  document.getElementById('editNoteModal').classList.remove('open');
});

async function deleteNote(id) {
  await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  notes = notes.filter(n => n.id !== id);
  renderNoteList();
}

// ═══════════════════════════════════════════════════════════════
//  HIGHLIGHTS
// ═══════════════════════════════════════════════════════════════
let highlights = [];
let selectedHighlightColor = '#fff3cd';

async function loadHighlights() {
  highlights = await (await fetch('/api/highlights')).json();
  renderHighlightList();
}

function renderHighlightList() {
  const el = document.getElementById('highlightList');
  if (!highlights.length) {
    el.innerHTML = '<div class="empty-msg">No highlights yet.<br>Select verses and tap 🖍️ to highlight.</div>';
    return;
  }
  el.innerHTML = highlights.map(h => {
    const loc = verseRangeLabel(h.book, h.chapter, h.verse_start, h.verse_end);
    return `
    <div class="list-card is-entering">
      <div class="card-top">
        <div class="highlight-color-bar" style="background:${escHtml(h.color)}"></div>
        <span class="card-label" onclick="loadChapter('${escAttr(h.book)}', ${h.chapter})">${escHtml(loc)}</span>
        <div class="card-actions">
          <button class="card-action-btn" onclick="deleteHighlight(${h.id})" title="Remove">✕</button>
        </div>
      </div>
      <div class="card-meta">${fmtDate(h.created)}</div>
    </div>`;
  }).join('');
}

function openHighlightModal(verseStart, verseEnd) {
  if (!currentBook || !verseStart) return;
  const label = verseRangeLabel(currentBook, currentChapter, verseStart, verseEnd);
  document.getElementById('hlContext').textContent = label;
  document.getElementById('highlightModal').classList.add('open');
  document.getElementById('highlightModal')._verseStart = verseStart;
  document.getElementById('highlightModal')._verseEnd = verseEnd || verseStart;
  // Reset color selection
  selectedHighlightColor = '#fff3cd';
  document.querySelectorAll('#hlColorPicker .color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === selectedHighlightColor);
  });
}

function openHighlightForSelection() {
  const range = getSelectedRange();
  if (range) openHighlightModal(range.start, range.end);
}

document.getElementById('btnAddHighlight').addEventListener('click', () => {
  const range = getSelectedRange();
  if (!range) return;
  openHighlightModal(range.start, range.end);
});

// Color swatch selection
document.querySelectorAll('#hlColorPicker .color-swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    selectedHighlightColor = swatch.dataset.color;
    document.querySelectorAll('#hlColorPicker .color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
  });
});

document.getElementById('hlCancel').addEventListener('click', () => {
  document.getElementById('highlightModal').classList.remove('open');
});
document.getElementById('hlSave').addEventListener('click', async () => {
  if (!currentBook) return;
  const modal = document.getElementById('highlightModal');
  const vs = modal._verseStart, ve = modal._verseEnd;
  const h = await (await fetch('/api/highlights', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ book: currentBook, chapter: currentChapter, verse_start: vs, verse_end: ve, color: selectedHighlightColor })
  })).json();
  highlights.push(h);
  renderHighlightList();
  modal.classList.remove('open');
  clearSelection();
  renderChapter(); // re-render to show highlights
});

async function deleteHighlight(id) {
  await fetch(`/api/highlights/${id}`, { method: 'DELETE' });
  highlights = highlights.filter(h => h.id !== id);
  renderHighlightList();
  if (chapterData) renderChapter(); // re-render to remove highlight colors
}

// ═══════════════════════════════════════════════════════════════
//  BIBLE TREE (Sidebar)
// ═══════════════════════════════════════════════════════════════
async function loadBibleTree() {
  bibleData = await (await fetch('/api/bible-structure')).json();
  buildTree(bibleData);
}

function buildTree(data) {
  const tree = document.getElementById('bibleTree');
  tree.innerHTML = '';
  for (const [testament, books] of Object.entries(data)) {
    const label = document.createElement('div');
    label.className = 'testament-label';
    label.textContent = testament;
    tree.appendChild(label);

    for (const [book, numChapters] of Object.entries(books)) {
      const item = document.createElement('div');
      item.className = 'book-item';
      item.dataset.book = book;

      const header = document.createElement('div');
      header.className = 'book-header';
      if (book === currentBook) header.classList.add('active-book');
      header.innerHTML = `<span>${escHtml(book)}</span><span class="book-arrow">›</span>`;

      const grid = document.createElement('div');
      grid.className = 'chapter-grid';

      // Always create chapter buttons, even for single-chapter books
      for (let ch = 1; ch <= numChapters; ch++) {
        const btn = document.createElement('button');
        btn.className = 'ch-btn';
        if (book === currentBook && ch === currentChapter) btn.classList.add('active');
        btn.textContent = ch;
        btn.title = `${book} ${ch}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          loadChapter(book, ch);
        });
        grid.appendChild(btn);
      }

      header.addEventListener('click', () => {
        // Close other open books
        document.querySelectorAll('.book-header.open').forEach(h => {
          if (h !== header) {
            h.classList.remove('open');
            h.nextElementSibling.classList.remove('open');
          }
        });
        const isOpen = header.classList.toggle('open');
        grid.classList.toggle('open', isOpen);
      });

      item.appendChild(header);
      item.appendChild(grid);
      tree.appendChild(item);
    }
  }
}

function highlightActiveChapter() {
  document.querySelectorAll('.book-header').forEach(h => h.classList.remove('active-book'));
  document.querySelectorAll('.ch-btn').forEach(b => b.classList.remove('active'));

  document.querySelectorAll('.book-item').forEach(item => {
    if (item.dataset.book === currentBook) {
      item.querySelector('.book-header').classList.add('active-book');
      item.querySelector('.book-header').classList.add('open');
      const grid = item.querySelector('.chapter-grid');
      if (grid) {
        grid.classList.add('open');
        grid.querySelectorAll('.ch-btn').forEach(btn => {
          if (parseInt(btn.textContent) === currentChapter) btn.classList.add('active');
        });
      }
    }
  });
}

// Search filter
document.getElementById('bookSearch').addEventListener('input', function() {
  const q = this.value.trim().toLowerCase();
  if (!q) { buildTree(bibleData); return; }

  const filtered = {};
  for (const [testament, books] of Object.entries(bibleData)) {
    const fBooks = {};
    for (const [book, chapters] of Object.entries(books)) {
      if (book.toLowerCase().includes(q)) fBooks[book] = chapters;
    }
    if (Object.keys(fBooks).length) filtered[testament] = fBooks;
  }
  buildTree(Object.keys(filtered).length ? filtered : bibleData);

  if (q) {
    setTimeout(() => {
      document.querySelectorAll('.book-header').forEach(h => {
        const span = h.querySelector('span');
        if (span && span.textContent.toLowerCase().includes(q)) {
          h.classList.add('open');
          if (h.nextElementSibling) h.nextElementSibling.classList.add('open');
        }
      });
    }, 10);
  }
});

// ═══════════════════════════════════════════════════════════════
//  MODAL CLOSE & INIT
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => {
    if (e.target === bg) bg.classList.remove('open');
  });
});

(async function init() {
  await Promise.all([loadBibleTree(), loadBookmarks(), loadNotes(), loadHighlights()]);
  loadChapter('Genesis', 1);
})();
