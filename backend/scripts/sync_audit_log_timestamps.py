import sqlite3
import re

conn = sqlite3.connect('sales_warehouse.db')
c = conn.cursor()
c.execute("SELECT id, created_at, action, change_summary FROM audit_logs WHERE action IN ('LOGIN', 'LOGOUT')")
rows = c.fetchall()
print(f"Found {len(rows)} LOGIN/LOGOUT rows")

updated = 0
for row_id, created_at, action, change_summary in rows:
    if change_summary:
        m = re.search(r'(\d{2}):(\d{2}):(\d{2})\s+ng\S+\s+(\d{2})/(\d{2})/(\d{4})', change_summary)
        if m:
            hh, mm, ss, d, mth, y = m.groups()
            new_dt_str = f"{y}-{mth}-{d} {hh}:{mm}:{ss}"
            c.execute("UPDATE audit_logs SET created_at = ? WHERE id = ?", (new_dt_str, row_id))
            updated += 1
            print(f"Updated row {row_id}: old={created_at} -> new={new_dt_str}")

conn.commit()
conn.close()
print(f"Done updated {updated} rows!")
