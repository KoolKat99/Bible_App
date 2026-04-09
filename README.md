# 📖 Bible Viewer

A local Flask app for reading a Bible PDF with bookmarks, comments, and chapter navigation.

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Put your Bible PDF in this folder, named bible.pdf
#    (or set the env var: export BIBLE_PDF=/path/to/your/bible.pdf)

# 3. Run
python app.py

# 4. Open http://localhost:5000
```

## Features

| Feature | Details |
|---|---|
| **PDF Viewer** | Rendered via PDF.js — crisp at any zoom level |
| **Zoom** | − / + buttons in the toolbar, or adjust in 20% steps |
| **Page Navigation** | Arrows, direct page input, or keyboard arrow keys |
| **Bookmarks** | Add with custom label + colour; stored in `data/bookmarks.json` |
| **Comments** | Add notes per page; shown as coloured pins on the PDF; stored in `data/comments.json` |
| **Chapter Search** | Sidebar lists all 66 books + chapters; type to filter |
| **Direct Chapter Jump** | Populate `CHAPTER_PAGES` in `static/app.js` to enable one-click chapter navigation |

## Enabling Direct Chapter Navigation

If you know which PDF page each Bible chapter starts on, open `static/app.js` and populate the `CHAPTER_PAGES` object:

```js
const CHAPTER_PAGES = {
  "Genesis 1":   1,
  "Genesis 2":   2,
  "Exodus 1":   51,
  // … and so on
};
```

A helper script to auto-detect chapter pages from a text-based PDF is possible using `pdfplumber` — ask Claude to generate one if needed.

## File Structure

```
bible-viewer/
├── app.py               ← Flask server
├── requirements.txt
├── bible.pdf            ← YOUR PDF goes here
├── data/
│   ├── bookmarks.json   ← auto-created
│   └── comments.json    ← auto-created
├── templates/
│   └── index.html
└── static/
    ├── style.css
    └── app.js
```
