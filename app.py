from flask import Flask, render_template, jsonify, request, send_file, abort
import json
import os
from datetime import datetime

app = Flask(__name__)

# ── Config ──────────────────────────────────────────────────────────────────
PDF_PATH = os.environ.get("BIBLE_PDF", "bible.pdf")   # drop your bible.pdf here
DATA_DIR  = "data"
BOOKMARKS_FILE = os.path.join(DATA_DIR, "bookmarks.json")
COMMENTS_FILE  = os.path.join(DATA_DIR, "comments.json")

os.makedirs(DATA_DIR, exist_ok=True)

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

@app.route("/pdf")
def serve_pdf():
    if not os.path.exists(PDF_PATH):
        abort(404, description=f"PDF not found at '{PDF_PATH}'. "
              "Set the BIBLE_PDF env-var or place bible.pdf next to app.py.")
    return send_file(PDF_PATH, mimetype="application/pdf")

# ── Bookmarks ────────────────────────────────────────────────────────────────
@app.route("/api/bookmarks", methods=["GET"])
def get_bookmarks():
    return jsonify(_load(BOOKMARKS_FILE))

@app.route("/api/bookmarks", methods=["POST"])
def add_bookmark():
    data = request.json
    bookmarks = _load(BOOKMARKS_FILE)
    bookmark = {
        "id":    len(bookmarks) + 1,
        "page":  data["page"],
        "label": data.get("label", f"Page {data['page']}"),
        "color": data.get("color", "#f59e0b"),
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

@app.route("/api/bookmarks/<int:bid>", methods=["PUT"])
def update_bookmark(bid):
    data = request.json
    bookmarks = _load(BOOKMARKS_FILE)
    for b in bookmarks:
        if b["id"] == bid:
            b["label"] = data.get("label", b["label"])
            b["color"] = data.get("color", b["color"])
    _save(BOOKMARKS_FILE, bookmarks)
    return jsonify({"ok": True})

# ── Comments ─────────────────────────────────────────────────────────────────
@app.route("/api/comments", methods=["GET"])
def get_comments():
    return jsonify(_load(COMMENTS_FILE))

@app.route("/api/comments", methods=["POST"])
def add_comment():
    data = request.json
    comments = _load(COMMENTS_FILE)
    comment = {
        "id":      len(comments) + 1,
        "page":    data["page"],
        "text":    data["text"],
        "color":   data.get("color", "#3b82f6"),
        "created": datetime.now().isoformat()
    }
    comments.append(comment)
    _save(COMMENTS_FILE, comments)
    return jsonify(comment), 201

@app.route("/api/comments/<int:cid>", methods=["DELETE"])
def delete_comment(cid):
    comments = [c for c in _load(COMMENTS_FILE) if c["id"] != cid]
    _save(COMMENTS_FILE, comments)
    return jsonify({"ok": True})

@app.route("/api/comments/<int:cid>", methods=["PUT"])
def update_comment(cid):
    data = request.json
    comments = _load(COMMENTS_FILE)
    for c in comments:
        if c["id"] == cid:
            c["text"] = data.get("text", c["text"])
    _save(COMMENTS_FILE, comments)
    return jsonify({"ok": True})

# ── Bible structure for chapter search ───────────────────────────────────────
BIBLE = {
    "Old Testament": {
        "Genesis":50,"Exodus":40,"Leviticus":27,"Numbers":36,"Deuteronomy":34,
        "Joshua":24,"Judges":21,"Ruth":4,"1 Samuel":31,"2 Samuel":24,
        "1 Kings":22,"2 Kings":25,"1 Chronicles":29,"2 Chronicles":36,
        "Ezra":10,"Nehemiah":13,"Esther":10,"Job":42,"Psalms":150,
        "Proverbs":31,"Ecclesiastes":12,"Song of Solomon":8,"Isaiah":66,
        "Jeremiah":52,"Lamentations":5,"Ezekiel":48,"Daniel":12,"Hosea":14,
        "Joel":3,"Amos":9,"Obadiah":1,"Jonah":4,"Micah":7,"Nahum":3,
        "Habakkuk":3,"Zephaniah":3,"Haggai":2,"Zechariah":14,"Malachi":4
    },
    "New Testament": {
        "Matthew":28,"Mark":16,"Luke":24,"John":21,"Acts":28,"Romans":16,
        "1 Corinthians":16,"2 Corinthians":13,"Galatians":6,"Ephesians":6,
        "Philippians":4,"Colossians":4,"1 Thessalonians":5,"2 Thessalonians":3,
        "1 Timothy":6,"2 Timothy":4,"Titus":3,"Philemon":1,"Hebrews":13,
        "James":5,"1 Peter":5,"2 Peter":3,"1 John":5,"2 John":1,
        "3 John":1,"Jude":1,"Revelation":22
    }
}

@app.route("/api/bible-structure")
def bible_structure():
    return jsonify(BIBLE)

if __name__ == "__main__":
    print("\n📖  Bible Viewer running at http://localhost:80")
    print(f"    PDF path: {os.path.abspath(PDF_PATH)}\n")
    app.run(host='127.0.0.1', port=80, debug=True)
