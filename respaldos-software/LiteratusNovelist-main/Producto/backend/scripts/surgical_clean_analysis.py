import json
import re
from bs4 import BeautifulSoup

def main():
    with open('backup_chapters_pre_cleaning.json', 'r', encoding='utf-8') as f:
        chapters = json.load(f)

    print(f"Loaded {len(chapters)} chapters from backup.")

    leaf_elements = []
    titles_with_elejandria = []

    for ch in chapters:
        # 1. Title check
        if 'elejandria' in ch['title'].lower():
            titles_with_elejandria.append((ch['book_title'], ch['order'], ch['title']))

        # 2. Content check
        html = ch['content_html']
        if 'elejandria' not in html.lower():
            continue

        soup = BeautifulSoup(html, 'html.parser')
        for el in soup.find_all(True):
            text = el.get_text()
            if 'elejandria' in text.lower():
                # Check if children also have it, we want the most specific/leaf container
                child_has = any('elejandria' in c.get_text().lower() for c in el.find_all(True))
                if not child_has:
                    leaf_elements.append({
                        'book': ch['book_title'],
                        'order': ch['order'],
                        'tag': el.name,
                        'html': str(el),
                        'text': text.strip()
                    })

    print(f"Total chapter titles with elejandria: {len(titles_with_elejandria)}")
    print(f"Total leaf text elements with elejandria: {len(leaf_elements)}")

    print("\n--- ALL LEAF TEXT ELEMENTS ---")
    for i, el in enumerate(leaf_elements, 1):
        print(f"{i}. Book: {el['book']} (Ch {el['order']})")
        print(f"   Tag: <{el['tag']}>")
        print(f"   HTML: {repr(el['html'])}")
        print("-" * 50)

    print("\n--- ALL 83 CHAPTER TITLES ---")
    for i, t in enumerate(titles_with_elejandria, 1):
        print(f"{i}. Book: {t[0]} (Ch {t[1]}) -> Title: {repr(t[2])}")

if __name__ == '__main__':
    main()
