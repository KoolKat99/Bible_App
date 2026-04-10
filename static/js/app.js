/* ─────────────────────────────────────────────────────────────
   Bible Reader – app.js
   ───────────────────────────────────────────────────────────── */

// ── State ─────────────────────────────────────────────────────
let currentBook    = null;
let currentChapter = null;
let chapterData    = null;   // current loaded chapter response
let bibleData      = {};     // { "Old Testament": { "Genesis": 50, ... }, ... }

// ── DOM refs ─────────────────────────────────────────────────
const readerContent = document.getElementById('readerContent');
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

// ═══════════════════════════════════════════════════════════════
//  CHAPTER LOADING & RENDERING
// ═══════════════════════════════════════════════════════════════
async function loadChapter(book, chapter) {
  currentBook = book;
  currentChapter = chapter;

  readerContent.innerHTML = '<div class="loader"><div class="loader__spinner"></div>Loading…</div>';

  try {
    const res = await fetch(`/api/chapter/${encodeURIComponent(book)}/${chapter}`);
    if (!res.ok) throw new Error('Chapter not found');
    chapterData = await res.json();
    renderChapter();
    updateNavLabel();
    highlightActiveChapter();
    document.getElementById('readerArea').scrollTop = 0;
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

  // Verses - group by heading sections
  const footnotes = [];
  let currentHeading = null;

  html += '<div class="verse-paragraph">';
  for (const v of d.verses) {
    // Section heading
    if (v.heading && v.heading !== currentHeading) {
      currentHeading = v.heading;
      html += '</div>';  // close previous paragraph
      html += `<div class="verse-section-heading">${escHtml(v.heading)}</div>`;
      html += '<div class="verse-paragraph">';
    }

    // Verse text
    let text = escHtml(v.text);
    // Replace footnote markers like (1) with superscript links
    text = text.replace(/\((\d+)\)/g, '<span class="footnote-ref" title="See footnote $1">$1</span>');

    html += `<span class="verse"><span class="verse-num">${v.verse}</span><span class="verse-text">${text}</span> </span>`;

    // Collect footnotes
    if (v.footnotes && v.footnotes.length) {
      footnotes.push(...v.footnotes);
    }
  }
  html += '</div>';  // close last paragraph

  // Footnotes section
  if (footnotes.length) {
    html += '<div class="footnotes-section">';
    html += '<div class="footnotes-title">Footnotes</div>';
    for (const fn of footnotes) {
      html += `<div class="footnote-item">${escHtml(fn)}</div>`;
    }
    html += '</div>';
  }

  // Navigation buttons
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
  if (chapterData && chapterData.prev) {
    loadChapter(chapterData.prev.book, chapterData.prev.chapter);
  }
});
document.getElementById('btnNext').addEventListener('click', () => {
  if (chapterData && chapterData.next) {
    loadChapter(chapterData.next.book, chapterData.next.chapter);
  }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === 'ArrowRight' && chapterData && chapterData.next) {
    loadChapter(chapterData.next.book, chapterData.next.chapter);
  }
  if (e.key === 'ArrowLeft' && chapterData && chapterData.prev) {
    loadChapter(chapterData.prev.book, chapterData.prev.chapter);
  }
});

// ═══════════════════════════════════════════════════════════════
//  BOOKMARKS
// ═══════════════════════════════════════════════════════════════
let bookmarks = [];

async function loadBookmarks() {
  const res = await fetch('/api/bookmarks');
  bookmarks = await res.json();
  renderBookmarkList();
}

function renderBookmarkList() {
  const el = document.getElementById('bookmarkList');
  if (!bookmarks.length) {
    el.innerHTML = '<div class="empty-msg">No bookmarks yet.<br>Tap 🔖 to save a chapter.</div>';
    return;
  }
  el.innerHTML = bookmarks.map(b => `
    <div class="list-card" id="bm-${b.id}">
      <div class="card-top">
        <span class="color-dot" style="background:${escHtml(b.color)}"></span>
        <span class="card-label" onclick="loadChapter('${escAttr(b.book)}', ${b.chapter})">${escHtml(b.label)}</span>
        <div class="card-actions">
          <button class="card-action-btn" onclick="deleteBookmark(${b.id})" title="Delete">✕</button>
        </div>
      </div>
      <div class="card-meta">${escHtml(b.book)} ${b.chapter} · ${fmtDate(b.created)}</div>
    </div>
  `).join('');
}

document.getElementById('btnAddBookmark').addEventListener('click', () => {
  if (!currentBook) return;
  document.getElementById('bmLabel').value = `${currentBook} ${currentChapter}`;
  document.getElementById('bookmarkModal').classList.add('open');
  setTimeout(() => document.getElementById('bmLabel').focus(), 50);
});
document.getElementById('bmCancel').addEventListener('click', () => {
  document.getElementById('bookmarkModal').classList.remove('open');
});
document.getElementById('bmSave').addEventListener('click', async () => {
  if (!currentBook) return;
  const label = document.getElementById('bmLabel').value.trim() || `${currentBook} ${currentChapter}`;
  const res = await fetch('/api/bookmarks', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ book: currentBook, chapter: currentChapter, label })
  });
  const bm = await res.json();
  bookmarks.push(bm);
  renderBookmarkList();
  document.getElementById('bookmarkModal').classList.remove('open');
});

async function deleteBookmark(id) {
  await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
  bookmarks = bookmarks.filter(b => b.id !== id);
  renderBookmarkList();
}

// ═══════════════════════════════════════════════════════════════
//  NOTES
// ═══════════════════════════════════════════════════════════════
let notes = [];

async function loadNotes() {
  const res = await fetch('/api/notes');
  notes = await res.json();
  renderNoteList();
}

function renderNoteList() {
  const el = document.getElementById('noteList');
  if (!notes.length) {
    el.innerHTML = '<div class="empty-msg">No notes yet.<br>Tap ✏️ to add a note.</div>';
    return;
  }
  el.innerHTML = notes.map(n => `
    <div class="list-card">
      <div class="card-top">
        <span class="card-label" onclick="loadChapter('${escAttr(n.book)}', ${n.chapter})">${escHtml(n.book)} ${n.chapter}</span>
        <div class="card-actions">
          <button class="card-action-btn" onclick="openEditNote(${n.id})" title="Edit">✎</button>
          <button class="card-action-btn" onclick="deleteNote(${n.id})" title="Delete">✕</button>
        </div>
      </div>
      <div class="card-text">${escHtml(n.text)}</div>
      <div class="card-meta">${fmtDate(n.created)}</div>
    </div>
  `).join('');
}

document.getElementById('btnAddNote').addEventListener('click', () => {
  if (!currentBook) return;
  document.getElementById('noteText').value = '';
  document.getElementById('noteModal').classList.add('open');
  setTimeout(() => document.getElementById('noteText').focus(), 50);
});
document.getElementById('noteCancel').addEventListener('click', () => {
  document.getElementById('noteModal').classList.remove('open');
});
document.getElementById('noteSave').addEventListener('click', async () => {
  if (!currentBook) return;
  const text = document.getElementById('noteText').value.trim();
  if (!text) return;
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ book: currentBook, chapter: currentChapter, text })
  });
  const n = await res.json();
  notes.push(n);
  renderNoteList();
  document.getElementById('noteModal').classList.remove('open');
});

function openEditNote(id) {
  const n = notes.find(n => n.id === id);
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
  await fetch(`/api/notes/${id}`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ text })
  });
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
//  BIBLE TREE (Sidebar)
// ═══════════════════════════════════════════════════════════════
async function loadBibleTree() {
  const res = await fetch('/api/bible-structure');
  bibleData = await res.json();
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

      // If only 1 chapter, clicking the book name loads it directly
      if (numChapters === 1) {
        header.addEventListener('click', () => loadChapter(book, 1));
      } else {
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
      }

      item.appendChild(header);
      item.appendChild(grid);
      tree.appendChild(item);
    }
  }
}

function highlightActiveChapter() {
  // Update book headers
  document.querySelectorAll('.book-header').forEach(h => h.classList.remove('active-book'));
  document.querySelectorAll('.ch-btn').forEach(b => b.classList.remove('active'));

  document.querySelectorAll('.book-item').forEach(item => {
    if (item.dataset.book === currentBook) {
      item.querySelector('.book-header').classList.add('active-book');
      // Open the chapter grid
      item.querySelector('.book-header').classList.add('open');
      const grid = item.querySelector('.chapter-grid');
      if (grid) grid.classList.add('open');
      // Highlight specific chapter button
      grid && grid.querySelectorAll('.ch-btn').forEach(btn => {
        if (parseInt(btn.textContent) === currentChapter) btn.classList.add('active');
      });
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
    if (Object.keys(fBooks).length) {
      filtered[testament] = fBooks;
    }
  }
  buildTree(Object.keys(filtered).length ? filtered : bibleData);

  // Auto-open matching books
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

// Close modals on background click
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => {
    if (e.target === bg) bg.classList.remove('open');
  });
});

// ── Init ───────────────────────────────────────────────────────
(async function init() {
  await Promise.all([loadBibleTree(), loadBookmarks(), loadNotes()]);
  // Load Genesis 1 by default
  loadChapter('Genesis', 1);
})();
