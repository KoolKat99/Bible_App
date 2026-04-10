import os
import time
import re
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
import requests
from dotenv import load_dotenv

# --- Pydantic Models ---

class Verse(BaseModel):
    reference: str
    chapter: int
    verse: int
    text: str
    heading: Optional[str] = None
    footnotes: List[str] = []
    prev_verse: Optional[str] = None
    next_verse: Optional[str] = None
    prev_chapter: Optional[str] = None
    next_chapter: Optional[str] = None

class Book(BaseModel):
    name: str
    verses: List[Verse]

class Bible(BaseModel):
    books: List[Book]

# --- Constants & Setup ---

EXTRACTED_PATH = "./data/ESV_Bible.json"
load_dotenv()
API_KEY = os.getenv("API_KEY")
API_URL = os.getenv("API_URL", "https://api.esv.org/v3/passage/text/")

# Standard 66 books of the ESV Bible and their chapter counts
BIBLE_BOOKS = {
    "Genesis": 50, "Exodus": 40, "Leviticus": 27, "Numbers": 36, "Deuteronomy": 34,
    "Joshua": 24, "Judges": 21, "Ruth": 4, "1 Samuel": 31, "2 Samuel": 24,
    "1 Kings": 22, "2 Kings": 25, "1 Chronicles": 29, "2 Chronicles": 36,
    "Ezra": 10, "Nehemiah": 13, "Esther": 10, "Job": 42, "Psalms": 150,
    "Proverbs": 31, "Ecclesiastes": 12, "Song of Solomon": 8, "Isaiah": 66,
    "Jeremiah": 52, "Lamentations": 5, "Ezekiel": 48, "Daniel": 12, "Hosea": 14,
    "Joel": 3, "Amos": 9, "Obadiah": 1, "Jonah": 4, "Micah": 7, "Nahum": 3,
    "Habakkuk": 3, "Zephaniah": 3, "Haggai": 2, "Zechariah": 14, "Malachi": 4,
    "Matthew": 28, "Mark": 16, "Luke": 24, "John": 21, "Acts": 28, "Romans": 16,
    "1 Corinthians": 16, "2 Corinthians": 13, "Galatians": 6, "Ephesians": 6,
    "Philippians": 4, "Colossians": 4, "1 Thessalonians": 5, "2 Thessalonians": 3,
    "1 Timothy": 6, "2 Timothy": 4, "Titus": 3, "Philemon": 1, "Hebrews": 13,
    "James": 5, "1 Peter": 5, "2 Peter": 3, "1 John": 5, "2 John": 1, "3 John": 1,
    "Jude": 1, "Revelation": 22
}

# Pre-compute all chapters to easily link prev/next chapters
ALL_CHAPTERS_REF = [f"{b} {c}" for b, count in BIBLE_BOOKS.items() for c in range(1, count + 1)]

def get_prev_next_chapter(book_name: str, chap_num: int):
    """Calculates the prev/next chapter strings across the entire canonical layout."""
    ref = f"{book_name} {chap_num}"
    try:
        idx = ALL_CHAPTERS_REF.index(ref)
        prev_c = ALL_CHAPTERS_REF[idx - 1] if idx > 0 else None
        next_c = ALL_CHAPTERS_REF[idx + 1] if idx < len(ALL_CHAPTERS_REF) - 1 else None
        return prev_c, next_c
    except ValueError:
        return None, None

def get_chapter_chunks(total_chapters: int) -> List[tuple]:
    """
    Groups chapters into safe, rate-limit friendly chunks. 
    Caps at 14 chapters (~380 verses) to guarantee we never hit the 500 verse limit,
    while utilizing the min(500 verses, half of a book) directive.
    """
    half_book = max(1, total_chapters // 2)
    chunk_size = min(14, half_book)
    
    chunks = []
    for i in range(1, total_chapters + 1, chunk_size):
        end = min(total_chapters, i + chunk_size - 1)
        chunks.append((i, end))
    return chunks

def fetch_with_backoff(url: str, headers: dict, params: dict, max_retries: int = 5):
    """Makes a request with exponential backoff for 429 Too Many Requests errors."""
    for attempt in range(max_retries):
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 429:
            sleep_time = 2 ** attempt  # 1, 2, 4, 8, 16 seconds
            print(f"    Rate limit hit. Retrying in {sleep_time} seconds...")
            time.sleep(sleep_time)
            continue
            
        response.raise_for_status()
        return response.json()
        
    raise Exception("Max retries exceeded for API request.")

def main():
    if not API_KEY:
        print("Error: API_KEY not found in .env file.")
        return

    headers = {'Authorization': f'Token {API_KEY}'}
    books_data = []

    print("Starting Bible extraction from ESV API...")

    for book_name, total_chapters in BIBLE_BOOKS.items():
        print(f"Scraping {book_name}...")
        verses_data = []
        
        # Segment book into chunks to minimize API requests
        chunks = get_chapter_chunks(total_chapters)
        
        for start_ch, end_ch in chunks:
            # Format query (e.g., "Genesis 1-14" or "Obadiah 1")
            query = f"{book_name} {start_ch}-{end_ch}" if start_ch != end_ch else f"{book_name} {start_ch}"
            
            params = {
                'q': query,
                'include-passage-references': 'true',
                'include-verse-numbers': 'true',
                'include-first-verse-numbers': 'true',
                'include-footnotes': 'true',
                'include-footnote-body': 'true',
                'include-headings': 'true',
                'include-selahs': 'true',
                'include-short-copyright': 'false',
                'include-copyright': 'false',
                'include-passage-horizontal-lines': 'false',
                'include-heading-horizontal-lines': 'false',
                'indent-using': 'space',
                'indent-paragraphs': 4,
            }

            try:
                data = fetch_with_backoff(API_URL, headers, params)
                
                if 'passages' in data and len(data['passages']) > 0:
                    passage_text = data['passages'][0]
                    
                    # 1. Separate Main Text from Footnotes Body
                    parts = re.split(r'\n\s*Footnotes\s*\n', passage_text)
                    main_text = parts[0].lstrip()
                    footnotes_text = parts[1] if len(parts) > 1 else ""

                    # 2. Extract Footnotes Dictionary
                    footnotes_dict = {}
                    if footnotes_text:
                        fn_matches = re.finditer(r'(\(\d+\))\s+(.*?)(?=\n\(\d+\)\s+|$)', footnotes_text, re.DOTALL)
                        for m in fn_matches:
                            footnotes_dict[m.group(1)] = m.group(2).strip()

                    # 3. Strip the main API response passage header
                    # The API header usually looks like "Genesis 1:1–14:24\n\n"
                    # We chop off the first line assuming it's the reference header
                    main_text = main_text.split('\n\n', 1)[-1].lstrip()

                    # 4. Split by verse markers: e.g., "  [1] "
                    text_chunks = re.split(r'(?:^|\s+)\[(\d+)\]\s+', main_text)
                    
                    # Any text before the first verse marker is the starting heading
                    current_heading = text_chunks[0].strip() if text_chunks[0].strip() else None
                    
                    current_chapter = start_ch
                    prev_v_num = 0

                    # 5. Iterate over extracted verses
                    for i in range(1, len(text_chunks), 2):
                        v_num = int(text_chunks[i])
                        v_content = text_chunks[i+1]
                        
                        # Chapter Boundary Detection: If verse drops (31 -> 1), increment chapter
                        if v_num < prev_v_num:
                            current_chapter += 1
                        prev_v_num = v_num
                        
                        prev_chap, next_chap = get_prev_next_chapter(book_name, current_chapter)
                        
                        # Separate the verse text from the *next* heading.
                        # Paragraphs starting with space belong to verse, flush-left belong to heading.
                        sub_chunks = re.split(r'\n{2,}', v_content)
                        v_text_blocks = [sub_chunks[0]]
                        heading_blocks = []
                        
                        for block in sub_chunks[1:]:
                            if not block.strip(): continue
                            clean_block = block.lstrip('\n\r')
                            
                            if clean_block.startswith(' ') or clean_block.startswith('\t'):
                                v_text_blocks.append(block)
                            else:
                                heading_blocks.append(block.strip())
                        
                        v_text = '\n\n'.join(v_text_blocks).strip()
                        next_heading = '\n\n'.join(heading_blocks).strip() if heading_blocks else None

                        # Match active footnotes in this specific verse
                        verse_fns = []
                        for fn_mark in re.findall(r'\(\d+\)', v_text):
                            if fn_mark in footnotes_dict:
                                verse_fns.append(f"{fn_mark} {footnotes_dict[fn_mark]}")

                        verses_data.append(Verse(
                            reference=f"{book_name} {current_chapter}:{v_num}",
                            chapter=current_chapter,
                            verse=v_num,
                            text=v_text,
                            heading=current_heading,
                            footnotes=verse_fns,
                            prev_chapter=prev_chap,
                            next_chapter=next_chap
                            # prev_verse and next_verse will be linked later
                        ))
                        
                        # The next heading becomes the active heading for the subsequent verse
                        current_heading = next_heading if next_heading else None

                # Sleep slightly to remain friendly to the API
                time.sleep(0.5)

            except Exception as e:
                print(f"    Failed to process {query}: {e}")
                return

        books_data.append(Book(name=book_name, verses=verses_data))

    # Compile the preliminary Bible model
    bible = Bible(books=books_data)

    # 6. Link Prev/Next Verses mathematically
    # Flatten the verses to link adjacent items across chapters and books seamlessly
    all_verses = [verse for book in bible.books for verse in book.verses]
        
    for i, verse in enumerate(all_verses):
        if i > 0:
            verse.prev_verse = all_verses[i-1].reference
        if i < len(all_verses) - 1:
            verse.next_verse = all_verses[i+1].reference

    # 7. Export to JSON
    output_path = Path(EXTRACTED_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        # exclude_none ensures clean JSON where null fields are omitted
        f.write(bible.model_dump_json(indent=2, exclude_none=True))
        
    print(f"Extraction complete. Successfully structured {len(all_verses)} verses into {EXTRACTED_PATH}.")

if __name__ == "__main__":
    main()