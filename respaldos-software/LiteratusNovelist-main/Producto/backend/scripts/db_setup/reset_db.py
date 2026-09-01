import environ
import psycopg2
from pathlib import Path
import os

env = environ.Env()
environ.Env.read_env(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env'))

db_url = env('DATABASE_URL')
# Formato: postgres://usuario:password@host:port/dbname

# Pyscopg2 connection
conn = psycopg2.connect(db_url)
conn.autocommit = True
cursor = conn.cursor()

try:
    print("Dropping public schema...")
    cursor.execute("DROP SCHEMA public CASCADE;")
    print("Recreating public schema...")
    cursor.execute("CREATE SCHEMA public;")
    print("Granting permissions...")
    cursor.execute("GRANT ALL ON SCHEMA public TO postgres;")
    cursor.execute("GRANT ALL ON SCHEMA public TO public;")
    print("Database reset successfully.")
except Exception as e:
    print(f"Error reseting database: {e}")
finally:
    cursor.close()
    conn.close()
