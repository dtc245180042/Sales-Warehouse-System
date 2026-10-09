import threading
import uuid
import sys
import os
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.database import SessionLocal, engine
from app.models.customer import Customer
from sqlalchemy import text

def demo_race_condition():
    print("======================================================================")
    print("  DEMO CHỨNG MINH RACE CONDITION VÀ BẢO VỆ CONCURRENCY TRÊN MYSQL THẬT")
    print("======================================================================")
    
    shared_code = f"DL-RACE-{uuid.uuid4().hex[:6].upper()}"
    print(f"[*] Thử nghiệm 2 luồng đồng thời cố gắng tạo đại lý cùng mã: '{shared_code}'\n")

    results = []

    def insert_worker(thread_id: int):
        db = SessionLocal()
        try:
            cust = Customer(
                id=f"CUS-DEMO-{thread_id}-{uuid.uuid4().hex[:6].upper()}",
                code=shared_code,
                name=f"Đại lý Đồng Thời #{thread_id}",
                phone=f"091100000{thread_id}",
                status="active"
            )
            db.add(cust)
            db.commit()
            print(f"  [+] Thread {thread_id}: INSERT THÀNH CÔNG -> Đã commit vào MySQL.")
            results.append(("SUCCESS", thread_id))
        except Exception as e:
            db.rollback()
            print(f"  [-] Thread {thread_id}: BỊ CHẶN BỞI RÀNG BUỘC MYSQL ({type(e).__name__}): {e} -> Rollback.")
            results.append(("BLOCKED", type(e).__name__))
        finally:
            db.close()

    t1 = threading.Thread(target=insert_worker, args=(1,))
    t2 = threading.Thread(target=insert_worker, args=(2,))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    print("\n----------------------------------------------------------------------")
    successes = [r for r in results if r[0] == "SUCCESS"]
    blocked = [r for r in results if r[0] == "BLOCKED"]
    print(f"[*] Kết quả: {len(successes)} luồng thành công, {len(blocked)} luồng bị chặn.")
    assert len(successes) == 1, "Lỗi: Không được có nhiều hơn 1 luồng thành công!"
    assert len(blocked) == 1, "Lỗi: Ràng buộc phải chặn luồng trùng lặp!"
    print("[V] XÁC NHẬN: Hệ thống chống Race Condition 100% an toàn trên MySQL thật.")
    print("======================================================================\n")

if __name__ == "__main__":
    demo_race_condition()
