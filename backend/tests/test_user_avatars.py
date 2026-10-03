import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient
import app.models as _registered_models
from app.core.database import SessionLocal, Base, engine
from app.models.auth import User
from app.core.security import tao_token_truy_cap
from main import app

# Đảm bảo tất cả bảng bao gồm user_avatars được tạo trước khi kiểm thử
Base.metadata.create_all(bind=engine)

client = TestClient(app)


def create_test_image(width: int = 600, height: int = 400, format: str = "JPEG", color=(100, 150, 200)) -> bytes:
    """Tạo file ảnh mẫu trong bộ nhớ để phục vụ kiểm thử."""
    img = Image.new("RGB", (width, height), color=color)
    buffer = io.BytesIO()
    img.save(buffer, format=format)
    return buffer.getvalue()


@pytest.fixture
def auth_headers():
    """Tạo header xác thực với token của user admin mẫu."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "admin").first()
        if not user:
            pytest.skip("Chưa có tài khoản admin trong CSDL để chạy test.")
        token = tao_token_truy_cap(du_lieu={"sub": str(user.id), "user_id": user.id, "username": user.username, "token_version": user.token_version})
        return {"Authorization": f"Bearer {token}"}, user.id
    finally:
        db.close()


def test_upload_avatar_valid_jpeg(auth_headers):
    """Kiểm tra tải lên ảnh JPEG hợp lệ (SCRUM-364, SCRUM-365)."""
    headers, user_id = auth_headers
    img_bytes = create_test_image(format="JPEG")

    files = {"file": ("test_avatar.jpg", img_bytes, "image/jpeg")}
    response = client.post("/api/v1/user-avatars/upload", headers=headers, files=files)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["user_id"] == user_id
    assert "avatar" in data["data"]["avatar_url"]
    assert "thumbnail" in data["data"]["thumbnail_url"]
    assert data["data"]["content_type"] == "image/jpeg"
    assert data["data"]["width"] == 500
    assert data["data"]["height"] == 500


def test_upload_avatar_valid_png(auth_headers):
    """Kiểm tra tải lên ảnh PNG hợp lệ (SCRUM-364, SCRUM-365)."""
    headers, user_id = auth_headers
    img_bytes = create_test_image(format="PNG")

    files = {"file": ("test_avatar.png", img_bytes, "image/png")}
    response = client.post("/api/v1/user-avatars/upload", headers=headers, files=files)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["content_type"] == "image/png"


def test_square_crop_and_thumbnail_generation(auth_headers):
    """Kiểm tra xử lý cắt vuông (1:1) từ ảnh chữ nhật và tạo thumbnail 128x128 (SCRUM-362)."""
    headers, user_id = auth_headers
    # Tạo ảnh chữ nhật 800x400 (tỉ lệ 2:1)
    rect_img = create_test_image(width=800, height=400, format="JPEG")

    files = {"file": ("rect.jpg", rect_img, "image/jpeg")}
    res_upload = client.post("/api/v1/user-avatars/upload", headers=headers, files=files)
    assert res_upload.status_code == 200

    # Kiểm tra kích thước file avatar chuẩn tải về
    res_avatar = client.get(f"/api/v1/user-avatars/{user_id}/avatar")
    assert res_avatar.status_code == 200
    assert res_avatar.headers["content-type"] in ["image/jpeg", "image/png"]
    with Image.open(io.BytesIO(res_avatar.content)) as img:
        assert img.size == (500, 500)  # Đã cắt vuông và resize 500x500

    # Kiểm tra kích thước thumbnail tải về
    res_thumb = client.get(f"/api/v1/user-avatars/{user_id}/thumbnail")
    assert res_thumb.status_code == 200
    with Image.open(io.BytesIO(res_thumb.content)) as thumb_img:
        assert thumb_img.size == (128, 128)  # Đã tạo thumbnail 128x128


def test_avatar_exceed_size_limit_rejected(auth_headers):
    """Kiểm tra từ chối file vượt quá 2MB với HTTP 400 (SCRUM-365)."""
    headers, _ = auth_headers
    # Tạo nội dung giả lập vượt quá 2MB (2MB + 10KB)
    large_bytes = b"0" * (2 * 1024 * 1024 + 10240)

    files = {"file": ("large_image.jpg", large_bytes, "image/jpeg")}
    response = client.post("/api/v1/user-avatars/upload", headers=headers, files=files)

    assert response.status_code == 400
    assert "Dung lượng ảnh vượt quá giới hạn 2MB" in response.json()["detail"]


def test_avatar_invalid_format_rejected(auth_headers):
    """Kiểm tra từ chối định dạng file không phải JPG/PNG (SCRUM-365)."""
    headers, _ = auth_headers

    # 1. File văn bản giả dạng ảnh
    files = {"file": ("document.txt", b"Day la van ban khong phai anh", "text/plain")}
    res_txt = client.post("/api/v1/user-avatars/upload", headers=headers, files=files)
    assert res_txt.status_code == 400
    assert "Chỉ chấp nhận định dạng JPG hoặc PNG" in res_txt.json()["detail"]

    # 2. File ảnh GIF
    gif_img = Image.new("P", (100, 100))
    gif_buffer = io.BytesIO()
    gif_img.save(gif_buffer, format="GIF")
    files_gif = {"file": ("image.gif", gif_buffer.getvalue(), "image/gif")}
    res_gif = client.post("/api/v1/user-avatars/upload", headers=headers, files=files_gif)
    assert res_gif.status_code == 400
    assert "Chỉ chấp nhận định dạng JPG hoặc PNG" in res_gif.json()["detail"]


def test_get_my_avatar_and_delete(auth_headers):
    """Kiểm tra lấy metadata và xóa ảnh đại diện (SCRUM-364)."""
    headers, user_id = auth_headers
    img_bytes = create_test_image(format="JPEG")

    # Upload trước
    client.post("/api/v1/user-avatars/upload", headers=headers, files={"file": ("av.jpg", img_bytes, "image/jpeg")})

    # Lấy thông tin /me
    res_me = client.get("/api/v1/user-avatars/me", headers=headers)
    assert res_me.status_code == 200
    assert res_me.json()["user_id"] == user_id

    # Xóa ảnh
    res_del = client.delete("/api/v1/user-avatars/me", headers=headers)
    assert res_del.status_code == 200
    assert res_del.json()["success"] is True

    # Kiểm tra sau khi xóa thì truy vấn trả về 404
    res_after = client.get(f"/api/v1/user-avatars/{user_id}/avatar")
    assert res_after.status_code == 404


def test_upload_unauthenticated_rejected():
    """Kiểm tra bảo mật: Từ chối yêu cầu không đăng nhập với HTTP 401."""
    img_bytes = create_test_image()
    files = {"file": ("avatar.jpg", img_bytes, "image/jpeg")}
    response = client.post("/api/v1/user-avatars/upload", files=files)
    assert response.status_code in [401, 403]


def test_upload_avatar_by_user_id(auth_headers):
    """Kiểm tra tải lên ảnh đại diện theo user_id qua endpoint POST /{user_id}/upload."""
    headers, user_id = auth_headers
    img_bytes = create_test_image(format="JPEG")
    files = {"file": ("avatar_admin.jpg", img_bytes, "image/jpeg")}
    response = client.post(f"/api/v1/user-avatars/{user_id}/upload", headers=headers, files=files)
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"]["user_id"] == user_id


def test_upload_avatar_rejected_formats(auth_headers):
    """Kiểm tra chặt chẽ: Từ chối tất cả định dạng không phải JPG/PNG (.webp, .bmp, .svg, .exe)."""
    headers, _ = auth_headers

    bad_files = [
        ("avatar.webp", b"RIFF....WEBPVP8", "image/webp"),
        ("avatar.bmp", b"BM....", "image/bmp"),
        ("vector.svg", b"<svg></svg>", "image/svg+xml"),
        ("script.exe", b"MZ....", "application/x-msdownload"),
    ]

    for fname, data, mime in bad_files:
        files = {"file": (fname, data, mime)}
        res = client.post("/api/v1/user-avatars/upload", headers=headers, files=files)
        assert res.status_code == 400
        assert "Chỉ chấp nhận định dạng JPG hoặc PNG" in res.json()["detail"]


def test_upload_avatar_empty_file_rejected(auth_headers):
    """Kiểm tra từ chối file rỗng 0 bytes."""
    headers, _ = auth_headers
    files = {"file": ("empty.jpg", b"", "image/jpeg")}
    res = client.post("/api/v1/user-avatars/upload", headers=headers, files=files)
    assert res.status_code == 400

