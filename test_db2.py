import sqlite3
conn = sqlite3.connect('respaldos-software/LiteratusNovelist-main/Producto/backend/db.sqlite3')
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%chapter%'")
print(c.fetchall())
