from flask import Flask, render_template, jsonify, request, abort
import json
import os
from datetime import datetime

app = Flask(__name__)
app.json.sort_keys = False

# ── Config ──────────────────────────────────────────────────────────────────
DATA_DIR = "data"
BOOKMARKS_FILE = os.path.join(DATA_DIR, "bookmarks.json")
NOTES_FILE = os.path.join(DATA_DIR, "notes.json")
HIGHLIGHTS_FILE = os.path.join(DATA_DIR, "highlights.json")
BIBLE_JSON = os.path.join("static", "data", "ESV_Bible.json")

os.makedirs(DATA_DIR, exist_ok=True)

# ── Load Bible data once at startup ─────────────────────────────────────────
with open(BIBLE_JSON, encoding="utf-8") as f:
    BIBLE_DATA = json.load(f)

# Build lookup structures
BOOK_INDEX = {}          # { "Genesis": { chapters: {1: [verses], 2: [verses]} } }
BOOK_NAMES = []          # ordered list of book names
OT_BOOKS = set()
NT_BOOKS = set()

_OT_NAMES = {
    "Genesis","Exodus","Leviticus","Numbers","Deuteronomy",
    "Joshua","Judges","Ruth","1 Samuel","2 Samuel",
    "1 Kings","2 Kings","1 Chronicles","2 Chronicles",
    "Ezra","Nehemiah","Esther","Job","Psalms",
    "Proverbs","Ecclesiastes","Song of Solomon","Isaiah",
    "Jeremiah","Lamentations","Ezekiel","Daniel","Hosea",
    "Joel","Amos","Obadiah","Jonah","Micah","Nahum",
    "Habakkuk","Zephaniah","Haggai","Zechariah","Malachi"
}

for book in BIBLE_DATA["books"]:
    name = book["name"]
    BOOK_NAMES.append(name)
    chapters = {}
    for v in book["verses"]:
        ch = v["chapter"]
        chapters.setdefault(ch, []).append(v)
    BOOK_INDEX[name] = {"chapters": chapters}
    if name in _OT_NAMES:
        OT_BOOKS.add(name)
    else:
        NT_BOOKS.add(name)


def _load(path):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return []

def _save(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ── Routes ───────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


# ── Bible API ────────────────────────────────────────────────────────────────
@app.route("/api/bible-structure")
def bible_structure():
    """Return { "Old Testament": {"Genesis": 50, ...}, "New Testament": {...} }"""
    structure = {"Old Testament": {}, "New Testament": {}}
    for name in BOOK_NAMES:
        num_chapters = len(BOOK_INDEX[name]["chapters"])
        if name in OT_BOOKS:
            structure["Old Testament"][name] = num_chapters
        else:
            structure["New Testament"][name] = num_chapters
    return jsonify(structure)


@app.route("/api/chapter/<book>/<int:chapter>")
def get_chapter(book, chapter):
    """Return verses for a specific book and chapter."""
    if book not in BOOK_INDEX:
        abort(404, description=f"Book '{book}' not found")
    chapters = BOOK_INDEX[book]["chapters"]
    if chapter not in chapters:
        abort(404, description=f"Chapter {chapter} not found in {book}")
    verses = chapters[chapter]
    num_chapters = len(chapters)

    # Determine prev/next chapter navigation
    prev_ch = None
    next_ch = None
    if chapter > 1:
        prev_ch = {"book": book, "chapter": chapter - 1}
    else:
        idx = BOOK_NAMES.index(book)
        if idx > 0:
            prev_book = BOOK_NAMES[idx - 1]
            prev_ch = {"book": prev_book, "chapter": len(BOOK_INDEX[prev_book]["chapters"])}

    if chapter < num_chapters:
        next_ch = {"book": book, "chapter": chapter + 1}
    else:
        idx = BOOK_NAMES.index(book)
        if idx < len(BOOK_NAMES) - 1:
            next_book = BOOK_NAMES[idx + 1]
            next_ch = {"book": next_book, "chapter": 1}

    return jsonify({
        "book": book,
        "chapter": chapter,
        "total_chapters": num_chapters,
        "verses": verses,
        "prev": prev_ch,
        "next": next_ch
    })


# ── Bookmarks ────────────────────────────────────────────────────────────────
@app.route("/api/bookmarks", methods=["GET"])
def get_bookmarks():
    return jsonify(_load(BOOKMARKS_FILE))

@app.route("/api/bookmarks", methods=["POST"])
def add_bookmark():
    data = request.json
    bookmarks = _load(BOOKMARKS_FILE)
    bookmark = {
        "id": len(bookmarks) + 1,
        "book": data["book"],
        "chapter": data["chapter"],
        "verse_start": data.get("verse_start"),
        "verse_end": data.get("verse_end"),
        "label": data.get("label", f"{data['book']} {data['chapter']}"),
        "color": data.get("color", "#ff385c"),
        "created": datetime.now().isoformat()
    }
    bookmarks.append(bookmark)
    _save(BOOKMARKS_FILE, bookmarks)
    return jsonify(bookmark), 201

@app.route("/api/bookmarks/<int:bid>", methods=["DELETE"])
def delete_bookmark(bid):
    bookmarks = [b for b in _load(BOOKMARKS_FILE) if b["id"] != bid]
    _save(BOOKMARKS_FILE, bookmarks)
    return jsonify({"ok": True})


# ── Notes ────────────────────────────────────────────────────────────────────
@app.route("/api/notes", methods=["GET"])
def get_notes():
    return jsonify(_load(NOTES_FILE))

@app.route("/api/notes", methods=["POST"])
def add_note():
    data = request.json
    notes = _load(NOTES_FILE)
    note = {
        "id": len(notes) + 1,
        "book": data["book"],
        "chapter": data["chapter"],
        "verse_start": data.get("verse_start"),
        "verse_end": data.get("verse_end"),
        "text": data["text"],
        "created": datetime.now().isoformat()
    }
    notes.append(note)
    _save(NOTES_FILE, notes)
    return jsonify(note), 201

@app.route("/api/notes/<int:nid>", methods=["DELETE"])
def delete_note(nid):
    notes = [n for n in _load(NOTES_FILE) if n["id"] != nid]
    _save(NOTES_FILE, notes)
    return jsonify({"ok": True})

@app.route("/api/notes/<int:nid>", methods=["PUT"])
def update_note(nid):
    data = request.json
    notes = _load(NOTES_FILE)
    for n in notes:
        if n["id"] == nid:
            n["text"] = data.get("text", n["text"])
    _save(NOTES_FILE, notes)
    return jsonify({"ok": True})


# ── Highlights ───────────────────────────────────────────────────────────────
@app.route("/api/highlights", methods=["GET"])
def get_highlights():
    return jsonify(_load(HIGHLIGHTS_FILE))

@app.route("/api/highlights", methods=["POST"])
def add_highlight():
    data = request.json
    highlights = _load(HIGHLIGHTS_FILE)
    highlight = {
        "id": len(highlights) + 1,
        "book": data["book"],
        "chapter": data["chapter"],
        "verse_start": data["verse_start"],
        "verse_end": data.get("verse_end", data["verse_start"]),
        "color": data.get("color", "#fff3cd"),
        "created": datetime.now().isoformat()
    }
    highlights.append(highlight)
    _save(HIGHLIGHTS_FILE, highlights)
    return jsonify(highlight), 201

@app.route("/api/highlights/<int:hid>", methods=["DELETE"])
def delete_highlight(hid):
    highlights = [h for h in _load(HIGHLIGHTS_FILE) if h["id"] != hid]
    _save(HIGHLIGHTS_FILE, highlights)
    return jsonify({"ok": True})


if __name__ == "__main__":
    print("\n📖  Bible Reader running at http://localhost:8080\n")
    app.run(host="127.0.0.1", port=8080, debug=True)
