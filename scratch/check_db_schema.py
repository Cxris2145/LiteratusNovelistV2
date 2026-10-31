import sqlite3

c = sqlite3.connect(r'respaldos-software\LiteratusNovelist-main\Producto\backend\db.sqlite3')
cur = c.cursor()
cur.execute('PRAGMA table_info(users_profile)')
columns = [row[1] for row in cur.fetchall()]
print("Columns in users_profile:", columns)

