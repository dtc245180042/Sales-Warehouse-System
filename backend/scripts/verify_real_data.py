import urllib.request
import json
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# 1. Login as accountant
login_data = json.dumps({"username": "accountant", "password": "Accountant@1234"}).encode("utf-8")
req = urllib.request.Request("http://127.0.0.1:8000/api/v1/auth/login", data=login_data, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode("utf-8"))["access_token"]

headers = {"Authorization": f"Bearer {token}"}

# 2. Check S7-03 Agency Debt Aging Report
req_debt = urllib.request.Request("http://127.0.0.1:8000/api/v1/agency-debt-reports", headers=headers)
with urllib.request.urlopen(req_debt) as resp:
    data = json.loads(resp.read().decode("utf-8"))
    print("=== SỔ CÔNG NỢ ĐẠI LÝ (S7-03) ===")
    print("Tổng số đại lý phát sinh nợ:", data["total"])
    s = data["summary"]
    print(f"Tổng Phải Thu   : {s['total_receivable']:>15,d} VNĐ")
    print(f"Tổng Đã Thu     : {s['total_paid']:>15,d} VNĐ")
    print(f"Tổng Còn Nợ     : {s['total_debt']:>15,d} VNĐ")
    print(f"Nợ 0-30 ngày    : {s['total_debt_0_30']:>15,d} VNĐ")
    print(f"Nợ 31-60 ngày   : {s['total_debt_31_60']:>15,d} VNĐ")
    print(f"Nợ 61-90 ngày   : {s['total_debt_61_90']:>15,d} VNĐ")
    print(f"Nợ >90 ngày     : {s['total_debt_over_90']:>15,d} VNĐ")
    print(f"NỢ QUÁ HẠN      : {s['total_overdue_debt']:>15,d} VNĐ ({s['overdue_customers_count']} đại lý quá hạn)")

    print("\nChi tiết 5 đại lý đầu tiên:")
    for itm in data["items"][:5]:
        status_txt = f"Quá hạn {itm['max_overdue_days']} ngày" if itm["is_overdue"] else "Trong hạn"
        print(f"  [{itm['customer_code']}] {itm['customer_name']:<30} | Nợ: {itm['total_debt']:>12,d}đ | Quá hạn: {itm['overdue_debt']:>12,d}đ | {status_txt}")

# 3. Check Credit Notes
req_cn = urllib.request.Request("http://127.0.0.1:8000/api/v1/credit-notes", headers=headers)
with urllib.request.urlopen(req_cn) as resp:
    cns = json.loads(resp.read().decode("utf-8"))
    print("\n=== CHỨNG TỪ GIẢM NỢ (CREDIT NOTES) ===")
    print("Tổng số chứng từ đã lập:", len(cns))
    for cn in cns:
        print(f"  {cn['id']}: Phiếu trả {cn['return_order_id']} -> Hóa đơn {cn['invoice_id']} | Giảm {cn['adjustment_amount']:,}đ | Đại lý: {cn['customer_name']}")

# 4. Check Invoices
req_inv = urllib.request.Request("http://127.0.0.1:8000/api/v1/invoices", headers=headers)
with urllib.request.urlopen(req_inv) as resp:
    invs = json.loads(resp.read().decode("utf-8"))
    print("\n=== HÓA ĐƠN BÁN HÀNG (INVOICES) ===")
    print("Tổng số hóa đơn:", len(invs))
    for inv in invs[:5]:
        print(f"  {inv['id']}: {inv['customer_name']} | Tổng: {inv['total_amount']:,}đ | Còn nợ: {inv['remaining_amount']:,}đ | Trạng thái: {inv['status']}")

# 5. Check Payments
req_pm = urllib.request.Request("http://127.0.0.1:8000/api/v1/payments", headers=headers)
with urllib.request.urlopen(req_pm) as resp:
    pms = json.loads(resp.read().decode("utf-8"))
    print("\n=== PHIẾU THU TIỀN (PAYMENTS) ===")
    print("Tổng số phiếu thu:", len(pms))
    for pm in pms:
        print(f"  {pm['id']}: Thu {pm['amount']:,}đ từ {pm['customer_name']} | Hình thức: {pm['payment_method']} | Ngày thu: {pm['payment_date'][:10]}")
