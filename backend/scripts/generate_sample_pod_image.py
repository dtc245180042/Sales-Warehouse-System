import sys
import os
from PIL import Image, ImageDraw

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
proof_dir = os.path.join(base_dir, "uploads", "delivery_proofs")
public_dir = os.path.join(base_dir, "..", "frontend", "public")
os.makedirs(proof_dir, exist_ok=True)
os.makedirs(public_dir, exist_ok=True)

width, height = 800, 1050
img = Image.new("RGB", (width, height), color=(253, 253, 252))
draw = ImageDraw.Draw(img)

# Viền ngoài
draw.rectangle([(20, 20), (width - 20, height - 20)], outline=(180, 180, 180), width=2)
draw.rectangle([(25, 25), (width - 25, height - 25)], outline=(220, 220, 220), width=1)

# Header
draw.text((40, 45), "KHOVAN PRO LOGISTICS & DISTRIBUTION SYSTEM", fill=(30, 41, 59))
draw.text((40, 65), "Chi nhanh: Kho Da Nang - So 88 Duong Truong Chinh, Q. Cam Le, Da Nang", fill=(100, 116, 139))
draw.text((40, 85), "Hotline: 1900 6868 | Email: warehouse.danang@khovanpro.vn", fill=(100, 116, 139))
draw.line([(40, 110), (width - 40, 110)], fill=(203, 213, 225), width=2)

# Title
draw.text((220, 130), "BIEN BAN GIAO NHAN HANG HOA", fill=(15, 23, 42))
draw.text((275, 155), "(PROOF OF DELIVERY - POD)", fill=(71, 85, 105))
draw.text((260, 180), "So chung tu: BBGN-20261019-002", fill=(99, 102, 241))

# Thong tin ban giao
y = 220
draw.text((40, y), "THONG TIN BAN GIAO HANG HOA:", fill=(15, 23, 42))
y += 25
draw.text((40, y), "- Ngay gio giao hang : 19/10/2026 14:30 (Dung hen)", fill=(51, 65, 85))
y += 22
draw.text((40, y), "- Don vi van chuyen  : Doi xe tai Kho Da Nang (Xe 43C-128.99)", fill=(51, 65, 85))
y += 22
draw.text((40, y), "- Nhan vien giao hang: Hoang Van Thu Kho / Tai xe Nguyen Van Luc", fill=(51, 65, 85))
y += 22
draw.text((40, y), "- Khach hang/Dai ly  : Tran Thi Mai Anh (Dai ly Nguyen Van Dai Ly)", fill=(51, 65, 85))
y += 22
draw.text((40, y), "- Dia chi nhan hang  : 128 Le Duan, P. Thach Thang, Q. Hai Chau, Da Nang", fill=(51, 65, 85))
y += 22
draw.text((40, y), "- Dien thoai lien he : 0983 224 556", fill=(51, 65, 85))
y += 35

# Bang mat hang
draw.rectangle([(40, y), (width - 40, y + 30)], fill=(241, 245, 249), outline=(203, 213, 225))
draw.text((50, y + 8), "STT", fill=(30, 41, 59))
draw.text((90, y + 8), "Ma SKU / Ten san pham", fill=(30, 41, 59))
draw.text((430, y + 8), "DVT", fill=(30, 41, 59))
draw.text((500, y + 8), "Dat", fill=(30, 41, 59))
draw.text((560, y + 8), "Thuc giao", fill=(30, 41, 59))
draw.text((660, y + 8), "Tinh trang", fill=(30, 41, 59))
y += 30

rows = [
    ("1", "SAB-SPECIAL-330 | Bia Saigon Special Sleek 330ml", "Thung", "20", "20", "Nguyen dai"),
    ("2", "VNM-SUA-180    | Sua tuoi tiet trung Vinamilk 180ml", "Thung", "15", "15", "Nguyen kien"),
    ("3", "RBL-THAI-250    | Nuoc tang luc Red Bull Thai Lan", "Thung", "10", "10", "Niem phong"),
    ("4", "ACE-HAOHAO-75   | Mi Hao Hao Tom Chua Cay Acecook", "Thung", "20", "20", "Nguyen thung"),
]

for r in rows:
    draw.rectangle([(40, y), (width - 40, y + 28)], outline=(226, 232, 240))
    draw.text((55, y + 6), r[0], fill=(71, 85, 105))
    draw.text((90, y + 6), r[1], fill=(15, 23, 42))
    draw.text((435, y + 6), r[2], fill=(71, 85, 105))
    draw.text((505, y + 6), r[3], fill=(71, 85, 105))
    draw.text((580, y + 6), r[4], fill=(16, 185, 129))
    draw.text((665, y + 6), r[5], fill=(30, 41, 59))
    y += 28

y += 25
draw.text((40, y), "XAC NHAN CUA DAI LY / NGUOI NHAN HANG:", fill=(15, 23, 42))
y += 20
draw.text((40, y), "\"Toi da kiem dem day du so luong, chung loai, bao bi nguyen ven khong mop meo.\"", fill=(71, 85, 105))

y += 60
draw.text((120, y), "DAI DIEN GIAO HANG", fill=(30, 41, 59))
draw.text((105, y + 20), "(Ky, ghi ro ho ten)", fill=(100, 116, 139))

draw.text((520, y), "DAI DIEN DAI LY NHAN HANG", fill=(30, 41, 59))
draw.text((540, y + 20), "(Ky, dong dau xac nhan)", fill=(100, 116, 139))

sig_y = y + 55
# Chu ky nguoi giao
draw.line([(120, sig_y + 20), (140, sig_y + 5), (170, sig_y + 35), (210, sig_y + 10), (250, sig_y + 25)], fill=(37, 99, 235), width=3)
draw.text((130, sig_y + 45), "Hoang Van Thu Kho", fill=(30, 41, 59))

# Moc do dai ly
draw.ellipse([(520, sig_y - 10), (670, sig_y + 70)], outline=(220, 38, 38), width=3)
draw.text((540, sig_y + 10), "DA NHAN DU HANG", fill=(220, 38, 38))
draw.text((535, sig_y + 30), "DAI LY MAI ANH - DA NANG", fill=(220, 38, 38))

# Chu ky dai ly
draw.line([(550, sig_y + 25), (580, sig_y + 5), (610, sig_y + 40), (660, sig_y + 15)], fill=(30, 58, 138), width=3)
draw.text((540, sig_y + 85), "Nguyen Van Dai Ly (Ky nhan)", fill=(15, 23, 42))

target1 = os.path.join(proof_dir, "bien_ban_ban_giao_da_ky.png")
target2 = os.path.join(public_dir, "delivery_proof_sample.png")
img.save(target1)
img.save(target2)
print("-> Da tao anh chung tu POD bien ban ban giao thanh cong:", target1, target2)
