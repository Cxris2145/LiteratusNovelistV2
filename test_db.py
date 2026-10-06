import sqlite3
import json

conn = sqlite3.connect('respaldos-software/LiteratusNovelist-main/Producto/backend/db.sqlite3')
c = conn.cursor()
c.execute("SELECT content_html FROM library_chapter WHERE content_html LIKE '%<img%' LIMIT 1")
row = c.fetchone()
if row:
    html = row[0]
    print(html[:1000]) # just show first 1000 chars of the matched html
else:
    print("No images found in chapters.")
