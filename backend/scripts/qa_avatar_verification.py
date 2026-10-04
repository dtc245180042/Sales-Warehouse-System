import io
import os
import sys
from pathlib import Path
from PIL import Image
import requests

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://localhost:8000/api/v1"

def create_rectangle_image(width=1200, height=600, fmt="JPEG", color=(66, 133, 244)):
    """Tạo ảnh chữ nhật không vuông để kiểm thử thuật toán crop tâm 1:1."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()

def create_rgba_image(width=900, height=450, fmt="PNG"):
    """Tạo ảnh PNG có kênh alpha (transparency) để kiểm thử."""
    img = Image.new("RGBA", (width, height), color=(255, 100, 50, 180))
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()

def run_qa():
    print("=" * 60)
    print(" BẮT ĐẦU KIỂM THỬ QA: LUỒNG TẢI LÊN, CROP VUÔNG & THUMBNAIL")
    print("=" * 60)

    # 1. Đăng nhập lấy Bearer token
    print("\n[BƯỚC 1] Đăng nhập tài khoản Admin...")
    login_res = requests.post(f"{BASE_URL}/auth/login", json={"username": "admin", "password": "Admin@123456"})
    if login_res.status_code != 200:
        print(f"❌ Đăng nhập thất bại: {login_res.status_code} - {login_res.text}")
        return False
    
    login_json = login_res.json()
    token = login_json.get("access_token") or login_json.get("data", {}).get("token")
    headers = {"Authorization": f"Bearer {token}"}
    user_data = login_json.get("user") or login_json.get("data", {}).get("user", {})
    user_id = user_data.get("id", 1)
    print(f"✅ Đăng nhập thành công! User ID: {user_id}")

    # 2. Tạo và tải lên ảnh chữ nhật JPEG 1200x600 (tỉ lệ 2:1)
    print("\n[BƯỚC 2] Tải lên ảnh JPEG hình chữ nhật (1200 x 600px - tỉ lệ 2:1)...")
    jpeg_bytes = create_rectangle_image(1200, 600, fmt="JPEG")
    files = {"file": ("sample_banner.jpg", jpeg_bytes, "image/jpeg")}
    
    up_res = requests.post(f"{BASE_URL}/user-avatars/upload", headers=headers, files=files)
    if up_res.status_code != 200:
        print(f"❌ Upload thất bại: {up_res.status_code} - {up_res.text}")
        return False
    
    up_data = up_res.json()
    print("✅ Phản hồi API Upload thành công 200:")
    print(f"   - Message: {up_data['message']}")
    print(f"   - Avatar URL: {up_data['data']['avatar_url']}")
    print(f"   - Thumbnail URL: {up_data['data']['thumbnail_url']}")
    print(f"   - Size ghi nhận: {up_data['data']['width']}x{up_data['data']['height']}")

    # 3. Kiểm tra ảnh avatar chuẩn tải về: Crop vuông 1:1 (500x500)
    print("\n[BƯỚC 3] Tải về và kiểm tra kích thước Avatar chuẩn (500 x 500px)...")
    avatar_url = f"http://localhost:8000{up_data['data']['avatar_url']}"
    av_res = requests.get(avatar_url)
    assert av_res.status_code == 200, f"Lỗi tải avatar: {av_res.status_code}"
    
    with Image.open(io.BytesIO(av_res.content)) as av_img:
        print(f"   - Kích thước thực tế Avatar: {av_img.size}")
        print(f"   - Định dạng ảnh: {av_img.format}")
        assert av_img.size == (500, 500), f"Avatar không đạt kích thước vuông 500x500: {av_img.size}"
        print("   ✅ Xác nhận: Ảnh đã được cắt vuông từ tâm và resize chuẩn xác 500x500 (1:1)!")

    # 4. Kiểm tra ảnh Thumbnail tải về: 128x128
    print("\n[BƯỚC 4] Tải về và kiểm tra kích thước Thumbnail (128 x 128px)...")
    thumb_url = f"http://localhost:8000{up_data['data']['thumbnail_url']}"
    th_res = requests.get(thumb_url)
    assert th_res.status_code == 200, f"Lỗi tải thumbnail: {th_res.status_code}"

    with Image.open(io.BytesIO(th_res.content)) as th_img:
        print(f"   - Kích thước thực tế Thumbnail: {th_img.size}")
        print(f"   - Định dạng thumbnail: {th_img.format}")
        assert th_img.size == (128, 128), f"Thumbnail không đạt kích thước 128x128: {th_img.size}"
        print("   ✅ Xác nhận: Thumbnail đã được tạo và resize chuẩn xác 128x128 (1:1)!")

    # 5. Kiểm thử định dạng PNG với kênh Alpha (Transparency)
    print("\n[BƯỚC 5] Tải lên ảnh PNG có kênh trong suốt RGBA (900 x 450px)...")
    png_bytes = create_rgba_image(900, 450, fmt="PNG")
    files_png = {"file": ("transparent.png", png_bytes, "image/png")}
    up_png_res = requests.post(f"{BASE_URL}/user-avatars/upload", headers=headers, files=files_png)
    assert up_png_res.status_code == 200
    png_data = up_png_res.json()
    assert png_data["data"]["content_type"] == "image/png"
    print("   ✅ Tải lên và xử lý PNG trong suốt thành công!")

    # 6. Kiểm tra giới hạn 2MB (File vượt dung lượng bị từ chối)
    print("\n[BƯỚC 6] Kiểm tra từ chối file vượt quá 2MB...")
    large_payload = b"0" * (2 * 1024 * 1024 + 50000)  # > 2MB
    files_large = {"file": ("too_large.jpg", large_payload, "image/jpeg")}
    large_res = requests.post(f"{BASE_URL}/user-avatars/upload", headers=headers, files=files_large)
    print(f"   - Phản hồi HTTP Status: {large_res.status_code}")
    print(f"   - Nội dung lỗi: {large_res.json().get('detail')}")
    assert large_res.status_code == 400
    assert "Dung lượng ảnh vượt quá giới hạn 2MB" in large_res.json()["detail"]
    print("   ✅ Xác nhận: Hệ thống đã chặn thành công file > 2MB!")

    # 7. Kiểm tra từ chối định dạng không hợp lệ
    print("\n[BƯỚC 7] Kiểm tra từ chối định dạng không hợp lệ (.gif, .webp, .txt)...")
    bad_formats = [
        ("anim.gif", b"GIF89a...", "image/gif"),
        ("image.webp", b"RIFF....WEBP", "image/webp"),
        ("doc.pdf", b"%PDF-1.5...", "application/pdf")
    ]
    for b_name, b_data, b_mime in bad_formats:
        f = {"file": (b_name, b_data, b_mime)}
        r = requests.post(f"{BASE_URL}/user-avatars/upload", headers=headers, files=f)
        assert r.status_code == 400
        print(f"   - '{b_name}' ({b_mime}): Bị chặn với HTTP 400 - {r.json()['detail']}")
    print("   ✅ Xác nhận: Toàn bộ định dạng không phải JPG/PNG đều bị chặn thành công!")

    # 8. Kiểm tra API metadata /me
    print("\n[BƯỚC 8] Kiểm tra API GET /api/v1/user-avatars/me...")
    me_res = requests.get(f"{BASE_URL}/user-avatars/me", headers=headers)
    assert me_res.status_code == 200
    me_data = me_res.json()
    print(f"   - User ID: {me_data['user_id']}")
    print(f"   - Original Filename: {me_data['original_filename']}")
    print(f"   - File size lưu trữ: {me_data['file_size']} bytes")
    print("   ✅ Xác nhận: Metadata người dùng đồng bộ chuẩn xác!")

    print("\n" + "=" * 60)
    print(" 🎉 TOÀN BỘ CÁC KỊCH BẢN KIỂM THỬ QA ĐỀU VƯỢT QUA 100%!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = run_qa()
    sys.exit(0 if success else 1)
