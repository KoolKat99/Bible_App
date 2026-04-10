/* ─────────────────────────────────────────────────────────────
   Bible Viewer – app.js
   ───────────────────────────────────────────────────────────── */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── State ─────────────────────────────────────────────────────
let pdfDoc      = null;
let currentPage = 1;
let totalPages  = 0;
let scale       = 1.2;
let renderTask  = null;

// ── DOM refs ─────────────────────────────────────────────────
const canvas       = document.getElementById('pdfCanvas');
const ctx          = canvas.getContext('2d');
const container    = document.getElementById('canvasContainer');
const pageInput    = document.getElementById('pageInput');
const pageTotal    = document.getElementById('pageTotal');
const zoomLabel    = document.getElementById('zoomLabel');
const pinTooltip   = document.getElementById('pinTooltip');

// ── PDF Load ──────────────────────────────────────────────────
async function loadPDF() {
  try {
    pdfDoc = await pdfjsLib.getDocument('/pdf').promise;
    totalPages = pdfDoc.numPages;
    pageTotal.textContent = `/ ${totalPages}`;
    renderPage(1);
  } catch (e) {
    container.innerHTML =
      `<div style="color:#e94560;padding:40px;max-width:420px;line-height:1.7;font-size:.95rem;">
        <strong>⚠️ Could not load PDF</strong><br><br>
        Make sure <code>bible.pdf</code> is in the same folder as <code>app.py</code>,
        or set the <code>BIBLE_PDF</code> environment variable to its path.<br><br>
        <em>${e.message || e}</em>
      </div>`;
  }
}

async function renderPage(num) {
  if (renderTask) { renderTask.cancel(); }
  currentPage = Math.max(1, Math.min(num, totalPages));
  pageInput.value = currentPage;

  const page    = await pdfDoc.getPage(currentPage);
  const viewport = page.getViewport({ scale });

  canvas.width  = viewport.width;
  canvas.height = viewport.height;

  renderTask = page.render({ canvasContext: ctx, viewport });
  try {
    await renderTask.promise;
  } catch (e) {
    if (e.name !== 'RenderingCancelledException') console.warn(e);
    return;
  }
  renderTask = null;

  renderPins();
  updateActiveBookmarks();
}

// ── Navigation ────────────────────────────────────────────────
document.getElementById('btnPrevPage').addEventListener('click', () => renderPage(currentPage - 1));
document.getElementById('btnNextPage').addEventListener('click', () => renderPage(currentPage + 1));

pageInput.addEventListener('change', () => {
  const v = parseInt(pageInput.value, 10);
  if (!isNaN(v)) renderPage(v);
});

// keyboard navigation
document.addEventListener('keydown', (e) => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') renderPage(currentPage + 1);
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   renderPage(currentPage - 1);
});

// ── Zoom ──────────────────────────────────────────────────────
document.getElementById('btnZoomIn').addEventListener('click', () => {
  scale = Math.min(scale + 0.2, 4); zoomLabel.textContent = Math.round(scale * 100) + '%';
  if (pdfDoc) renderPage(currentPage);
});
document.getElementById('btnZoomOut').addEventListener('click', () => {
  scale = Math.max(scale - 0.2, 0.4); zoomLabel.textContent = Math.round(scale * 100) + '%';
  if (pdfDoc) renderPage(currentPage);
});

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
    el.innerHTML = '<div class="empty-msg">No bookmarks yet.<br>Hit 🔖 to add one!</div>';
    return;
  }
  el.innerHTML = bookmarks.map(b => `
    <div class="list-card" id="bm-${b.id}">
      <div class="card-top">
        <span class="color-dot" style="background:${b.color}"></span>
        <span class="card-label" onclick="goToPage(${b.page})">${escHtml(b.label)}</span>
        <div class="card-actions">
          <button class="card-action-btn" onclick="deleteBookmark(${b.id})" title="Delete">✕</button>
        </div>
      </div>
      <div class="card-meta">Page ${b.page} · ${fmtDate(b.created)}</div>
    </div>
  `).join('');
}

function updateActiveBookmarks() {
  document.querySelectorAll('.list-card[id^="bm-"]').forEach(el => {
    el.style.borderColor = '';
  });
  bookmarks.filter(b => b.page === currentPage).forEach(b => {
    const el = document.getElementById(`bm-${b.id}`);
    if (el) el.style.borderColor = b.color;
  });
}

// Add bookmark modal
document.getElementById('btnAddBookmark').addEventListener('click', () => {
  document.getElementById('bmLabel').value = '';
  document.getElementById('bookmarkModal').classList.add('open');
  setTimeout(() => document.getElementById('bmLabel').focus(), 50);
});
document.getElementById('bmCancel').addEventListener('click', () => {
  document.getElementById('bookmarkModal').classList.remove('open');
});
document.getElementById('bmSave').addEventListener('click', async () => {
  const label = document.getElementById('bmLabel').value.trim() || `Page ${currentPage}`;
  const color = document.getElementById('bmColor').value;
  const res = await fetch('/api/bookmarks', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ page: currentPage, label, color })
  });
  const bm = await res.json();
  bookmarks.push(bm);
  renderBookmarkList();
  updateActiveBookmarks();
  document.getElementById('bookmarkModal').classList.remove('open');
});

async function deleteBookmark(id) {
  await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
  bookmarks = bookmarks.filter(b => b.id !== id);
  renderBookmarkList();
  updateActiveBookmarks();
}

// ═══════════════════════════════════════════════════════════════
//  COMMENTS
// ═══════════════════════════════════════════════════════════════
let comments = [];

async function loadComments() {
  const res = await fetch('/api/comments');
  comments = await res.json();
  renderCommentList();
}

function renderCommentList() {
  const el = document.getElementById('commentList');
  if (!comments.length) {
    el.innerHTML = '<div class="empty-msg">No comments yet.<br>Hit 💬 to add one!</div>';
    return;
  }
  el.innerHTML = comments.map(c => `
    <div class="list-card">
      <div class="card-top">
        <span class="color-dot" style="background:${c.color}"></span>
        <span class="card-label" onclick="goToPage(${c.page})">Page ${c.page}</span>
        <div class="card-actions">
          <button class="card-action-btn" onclick="openEditComment(${c.id})" title="Edit">✎</button>
          <button class="card-action-btn" onclick="deleteComment(${c.id})" title="Delete">✕</button>
        </div>
      </div>
      <div class="card-text">${escHtml(c.text)}</div>
      <div class="card-meta">${fmtDate(c.created)}</div>
    </div>
  `).join('');
}

// Add comment
document.getElementById('btnAddComment').addEventListener('click', () => {
  document.getElementById('cmText').value = '';
  document.getElementById('commentModal').classList.add('open');
  setTimeout(() => document.getElementById('cmText').focus(), 50);
});
document.getElementById('cmCancel').addEventListener('click', () => {
  document.getElementById('commentModal').classList.remove('open');
});
document.getElementById('cmSave').addEventListener('click', async () => {
  const text = document.getElementById('cmText').value.trim();
  if (!text) return;
  const color = document.getElementById('cmColor').value;
  const res = await fetch('/api/comments', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ page: currentPage, text, color })
  });
  const cm = await res.json();
  comments.push(cm);
  renderCommentList();
  renderPins();
  document.getElementById('commentModal').classList.remove('open');
});

// Edit comment
function openEditComment(id) {
  const c = comments.find(c => c.id === id);
  if (!c) return;
  document.getElementById('ecText').value = c.text;
  document.getElementById('ecId').value   = id;
  document.getElementById('editCommentModal').classList.add('open');
  setTimeout(() => document.getElementById('ecText').focus(), 50);
}
document.getElementById('ecCancel').addEventListener('click', () => {
  document.getElementById('editCommentModal').classList.remove('open');
});
document.getElementById('ecSave').addEventListener('click', async () => {
  const id   = parseInt(document.getElementById('ecId').value, 10);
  const text = document.getElementById('ecText').value.trim();
  if (!text) return;
  await fetch(`/api/comments/${id}`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ text })
  });
  comments = comments.map(c => c.id === id ? { ...c, text } : c);
  renderCommentList();
  renderPins();
  document.getElementById('editCommentModal').classList.remove('open');
});

async function deleteComment(id) {
  await fetch(`/api/comments/${id}`, { method: 'DELETE' });
  comments = comments.filter(c => c.id !== id);
  renderCommentList();
  renderPins();
}

// ── Comment pins on canvas ────────────────────────────────────
function renderPins() {
  document.querySelectorAll('.comment-pin').forEach(p => p.remove());
  const pageComments = comments.filter(c => c.page === currentPage);
  pageComments.forEach((c, i) => {
    const pin = document.createElement('div');
    pin.className = 'comment-pin';
    pin.style.backgroundColor = c.color;
    // Spread pins horizontally so they don't overlap
    pin.style.left = (18 + i * 32) + 'px';
    pin.style.top  = '8px';
    pin.dataset.id = c.id;

    pin.addEventListener('mouseenter', (e) => {
      pinTooltip.textContent = c.text;
      pinTooltip.style.display = 'block';
      pinTooltip.style.left = (e.clientX + 12) + 'px';
      pinTooltip.style.top  = (e.clientY + 12) + 'px';
    });
    pin.addEventListener('mousemove', (e) => {
      pinTooltip.style.left = (e.clientX + 12) + 'px';
      pinTooltip.style.top  = (e.clientY + 12) + 'px';
    });
    pin.addEventListener('mouseleave', () => {
      pinTooltip.style.display = 'none';
    });
    pin.addEventListener('click', () => openEditComment(c.id));
    container.appendChild(pin);
  });
}

// ═══════════════════════════════════════════════════════════════
//  BIBLE TREE (Chapter Search)
// ═══════════════════════════════════════════════════════════════
let bibleData = {};
// Chapter → page number map (populated on first use; keys: "Genesis 1", "Exodus 3", …)
// Since we don't have the actual PDF's chapter pages, we open the search bar and
// let users navigate — the chapter grid shows chapters for quick reference.
// If you know chapter→page mappings you can populate CHAPTER_PAGES below.
const CHAPTER_PAGES = {};  // e.g. { "Genesis 1": 1, "Genesis 2": 2 }

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

    for (const [book, chapters] of Object.entries(books)) {
      const item = document.createElement('div');
      item.className = 'book-item';

      const header = document.createElement('div');
      header.className = 'book-header';
      header.innerHTML = `<span>${book}</span><span class="book-arrow">›</span>`;

      const grid = document.createElement('div');
      grid.className = 'chapter-grid';

      for (let ch = 1; ch <= chapters; ch++) {
        const btn = document.createElement('button');
        btn.className = 'ch-btn';
        btn.textContent = ch;
        const key = `${book} ${ch}`;
        btn.title = key;
        btn.addEventListener('click', () => {
          if (CHAPTER_PAGES[key]) {
            goToPage(CHAPTER_PAGES[key]);
          } else {
            alert(`📖 ${key}\n\nNo page mapping found for this chapter.\n\nTo enable direct navigation, populate the CHAPTER_PAGES object in app.js with your Bible PDF's page numbers.`);
          }
        });
        grid.appendChild(btn);
      }

      header.addEventListener('click', () => {
        const isOpen = header.classList.toggle('open');
        grid.classList.toggle('open', isOpen);
      });

      item.appendChild(header);
      item.appendChild(grid);
      tree.appendChild(item);
    }
  }
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
      // Auto-open matching books
      setTimeout(() => {
        document.querySelectorAll('.book-header').forEach(h => {
          if (h.querySelector('span') && h.querySelector('span').textContent.toLowerCase().includes(q)) {
            h.classList.add('open');
            h.nextElementSibling.classList.add('open');
          }
        });
      }, 10);
    }
  }
  buildTree(Object.keys(filtered).length ? filtered : bibleData);
});

// ── Helpers ────────────────────────────────────────────────────
function goToPage(n) {
  renderPage(n);
  // Switch to PDF view if sidebar covers it on small screens
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Close modals on background click
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => {
    if (e.target === bg) bg.classList.remove('open');
  });
});

// ── Init ───────────────────────────────────────────────────────
(async function init() {
  await Promise.all([loadPDF(), loadBookmarks(), loadComments(), loadBibleTree()]);
})();
