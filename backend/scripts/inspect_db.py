"""Cong cu dong lenh giup Developer va AI Agent tra cuu nhanh schema CSDL thuc te.
Tranh tinh trang doan mo ten cot hoac quan he giua cac bang.

Su dung:
    python scripts/inspect_db.py            # Xem toan bo danh sach bang
    python scripts/inspect_db.py <ten_bang> # Xem chi tiet cac cot va khoa cua bang do
"""

import sys
import os

# Dam bao output utf-8 tren Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Them duong dan backend vao sys.path de import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import inspect
from app.core.database import engine


def inspect_database(target_table: str = None):
    inspector = inspect(engine)
    all_tables = inspector.get_table_names()

    if not all_tables:
        print("[!] Chua co bang nao trong co so du lieu.")
        return

    if target_table:
        if target_table not in all_tables:
            print(f"[-] Bang '{target_table}' khong ton tai trong CSDL.")
            print(f"Danh sach bang hien co: {', '.join(all_tables)}")
            return
        tables_to_show = [target_table]
    else:
        tables_to_show = all_tables
        print(f"[+] TONG SO BANG HIEN CO ({len(all_tables)}): {', '.join(all_tables)}\n")

    for tbl in tables_to_show:
        print(f"==================================================")
        print(f"TABLE: {tbl}")
        print(f"==================================================")

        pk_constraint = inspector.get_pk_constraint(tbl)
        pks = pk_constraint.get("constrained_columns", [])

        columns = inspector.get_columns(tbl)
        print("  [COLUMNS]")
        for col in columns:
            name = col["name"]
            col_type = col["type"]
            nullable = "NULL" if col.get("nullable", True) else "NOT NULL"
            pk_badge = " [PK]" if name in pks else ""
            default = f" DEFAULT {col['default']}" if col.get("default") is not None else ""
            print(f"    - {name:<25} {str(col_type):<18} {nullable:<10}{pk_badge}{default}")

        fks = inspector.get_foreign_keys(tbl)
        if fks:
            print("  [FOREIGN KEYS]")
            for fk in fks:
                constrained = ", ".join(fk["constrained_columns"])
                referred = f"{fk['referred_table']}({', '.join(fk['referred_columns'])})"
                print(f"    - ({constrained}) -> {referred}")

        indexes = inspector.get_indexes(tbl)
        if indexes:
            print("  [INDEXES]")
            for idx in indexes:
                idx_cols = ", ".join(idx["column_names"])
                unique_str = " (UNIQUE)" if idx.get("unique") else ""
                print(f"    - {idx['name']}: ({idx_cols}){unique_str}")

        print()


if __name__ == "__main__":
    table_arg = sys.argv[1] if len(sys.argv) > 1 else None
    inspect_database(table_arg)
