import io
import re
import secrets
from typing import List, Tuple, Dict, Any, Optional, Set
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.security import bam_mat_khau
from app.models.auth import User, Role, UserRole
from app.schemas.user_import import (
    UserImportRow,
    UserImportPreviewResponse,
    UserImportSummaryResponse,
    CreatedUserInfo,
    RowErrorInfo,
)

# Danh sách vai trò hợp lệ trong hệ thống
VALID_ROLES = [r.value for r in UserRole]
ROLE_LOOKUP_MAP = {r.value.lower(): r.value for r in UserRole}
# Hỗ trợ thêm các alias phổ biến
ROLE_LOOKUP_MAP.update({
    "admin": "Admin",
    "customer": "Customer",
    "khách hàng": "Customer",
    "sales rep": "Sales Rep",
    "sales representative": "Sales Rep",
    "kinh doanh": "Sales Rep",
    "nhân viên kinh doanh": "Sales Rep",
    "sales manager": "Sales Manager",
    "quản lý kinh doanh": "Sales Manager",
    "trưởng phòng kinh doanh": "Sales Manager",
    "warehouse": "Warehouse",
    "kho": "Warehouse",
    "nhân viên kho": "Warehouse",
    "wh manager": "WH Manager",
    "warehouse manager": "WH Manager",
    "quản lý kho": "WH Manager",
    "trưởng kho": "WH Manager",
    "accountant": "Accountant",
    "kế toán": "Accountant",
})

WAREHOUSE_ROLES = {
    UserRole.WAREHOUSE.value.lower(),
    UserRole.WH_MANAGER.value.lower(),
    "warehouse",
    "wh_manager",
    "wh manager",
    "kho",
    "quản lý kho",
    "nhân viên kho",
}

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_.-]{3,50}$")
PHONE_REGEX = re.compile(r"^(\+84|0)[0-9]{8,10}$")

HEADER_ALIASES = {
    "username": [
        "tên đăng nhập", "ten dang nhap", "tên tài khoản", "tai khoan", "username", "user name"
    ],
    "email": [
        "email", "địa chỉ email", "dia chi email", "thư điện tử", "thu dien tu", "hòm thư"
    ],
    "full_name": [
        "họ và tên", "ho va ten", "họ tên", "ho ten", "tên", "ten", "full_name", "fullname", "name"
    ],
    "role": [
        "vai trò", "vai tro", "chức vụ", "chuc vu", "nhóm quyền", "role"
    ],
    "phone_number": [
        "số điện thoại", "so dien thoai", "sđt", "sdt", "điện thoại", "phone_number", "phone"
    ],
    "assigned_warehouse": [
        "kho / địa bàn phụ trách", "kho/địa bàn phụ trách", "kho phụ trách", "kho phu trach",
        "địa bàn phụ trách", "dia ban phu trach", "kho", "địa bàn", "dia ban",
        "assigned_warehouse", "warehouse", "territory"
    ],
    "password": [
        "mật khẩu", "mat khau", "password", "pass"
    ],
}


class UserImportService:
    """Service xử lý nhập người dùng hàng loạt từ tệp Excel theo SC-209."""

    @staticmethod
    def generate_template_excel() -> io.BytesIO:
        """Tạo file Excel mẫu (.xlsx) chuẩn nghiệp vụ hoàn toàn bằng Tiếng Việt."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "DanhSachNguoiDung"

        # Định dạng styles
        header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
        data_font = Font(name="Segoe UI", size=10)
        border_thin = Border(
            left=Side(style="thin", color="CBD5E1"),
            right=Side(style="thin", color="CBD5E1"),
            top=Side(style="thin", color="CBD5E1"),
            bottom=Side(style="thin", color="CBD5E1"),
        )

        headers = [
            ("Tên đăng nhập", "Tùy chọn. Nếu để trống, hệ thống sẽ tự động dùng Email làm Tên đăng nhập."),
            ("Email*", "Bắt buộc. Định dạng email hợp lệ và là duy nhất toàn hệ thống."),
            ("Họ và tên*", "Bắt buộc. Họ và tên đầy đủ của nhân sự."),
            ("Vai trò*", "Bắt buộc: Sales Rep, Sales Manager, Admin, Warehouse, WH Manager, Accountant, Customer."),
            ("Số điện thoại", "Tùy chọn. Số điện thoại di động (9-11 số)."),
            ("Kho / Địa bàn phụ trách", "Bắt buộc nếu vai trò thuộc Kho (Warehouse, WH Manager) hoặc Kinh doanh (Sales Rep, Sales Manager)."),
            ("Mật khẩu", "Tùy chọn. Nếu để trống, hệ thống sẽ tự động cấp mật khẩu tạm ngẫu nhiên."),
        ]

        # Ghi header bằng Tiếng Việt
        for col_idx, (col_name, _) in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col_idx, value=col_name.replace("*", ""))
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = border_thin

        # Dữ liệu mẫu minh họa (kèm trường hợp để trống Tên đăng nhập để tự lấy Email)
        sample_rows = [
            ("sales_hn_01", "sales.hn01@company.vn", "Nguyễn Văn An", "Sales Rep", "0912345678", "Địa bàn Miền Bắc", "Password@123"),
            ("", "binh.tran@company.vn", "Trần Thị Bình", "Sales Rep", "0987654321", "Địa bàn Miền Trung", ""),
            ("sales_lead_sg", "lead.sg@company.vn", "Lê Hoàng Cường", "Sales Manager", "0903123456", "Địa bàn Miền Nam", "Manager@2026"),
            ("kho_bacninh_01", "kho.bn01@company.vn", "Phạm Quốc Dũng", "Warehouse", "0934567890", "Kho Tổng Bắc Ninh", ""),
            ("", "ketoan01@company.vn", "Vũ Mai Hoa", "Accountant", "0978901234", "", "Ketoan@2026!"),
        ]

        for row_idx, row_data in enumerate(sample_rows, start=2):
            for col_idx, val in enumerate(row_data, start=1):
                cell = ws.cell(row=row_idx, column=col_idx, value=val)
                cell.font = data_font
                cell.border = border_thin
                cell.alignment = Alignment(vertical="center")

        # Tự căn chỉnh chiều rộng cột
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val_str = str(cell.value or "")
                if len(val_str) > max_len:
                    max_len = len(val_str)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 18)

        # Tạo Sheet 2: Hướng dẫn chi tiết
        ws_guide = wb.create_sheet(title="HuongDan")
        guide_header_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
        guide_header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")

        ws_guide.cell(row=1, column=1, value="Cột").font = guide_header_font
        ws_guide.cell(row=1, column=1).fill = guide_header_fill
        ws_guide.cell(row=1, column=2, value="Bắt buộc").font = guide_header_font
        ws_guide.cell(row=1, column=2).fill = guide_header_fill
        ws_guide.cell(row=1, column=3, value="Mô tả & Quy định").font = guide_header_font
        ws_guide.cell(row=1, column=3).fill = guide_header_fill

        guide_data = [
            ("Tên đăng nhập", "Không", "Tùy chọn (3-50 ký tự). Nếu để trống, hệ thống sẽ tự động dùng Email làm Tên đăng nhập."),
            ("Email", "Có", "Email đúng định dạng (vd: user@example.com). Phải là duy nhất toàn hệ thống."),
            ("Họ và tên", "Có", "Họ và tên đầy đủ của nhân sự."),
            ("Vai trò", "Có", "Thuộc 1 trong các vai trò: Sales Rep, Sales Manager, Admin, Warehouse, WH Manager, Accountant, Customer."),
            ("Số điện thoại", "Không", "Số điện thoại di động Việt Nam từ 9 - 11 chữ số (bắt đầu bằng 0 hoặc +84)."),
            ("Kho / Địa bàn phụ trách", "Có điều kiện", "Bắt buộc điền nếu vai trò là Kho (Warehouse, WH Manager) hoặc Kinh doanh (Sales Rep, Sales Manager)."),
            ("Mật khẩu", "Không", "Tối thiểu 6 ký tự. Nếu để trống, hệ thống sẽ cấp mật khẩu tạm ngẫu nhiên."),
        ]

        for r_idx, (c1, c2, c3) in enumerate(guide_data, start=2):
            c_a = ws_guide.cell(row=r_idx, column=1, value=c1)
            c_b = ws_guide.cell(row=r_idx, column=2, value=c2)
            c_c = ws_guide.cell(row=r_idx, column=3, value=c3)
            for c in (c_a, c_b, c_c):
                c.font = data_font
                c.border = border_thin
                c.alignment = Alignment(vertical="center")

        ws_guide.column_dimensions["A"].width = 25
        ws_guide.column_dimensions["B"].width = 15
        ws_guide.column_dimensions["C"].width = 85

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output

    @classmethod
    def _map_headers(cls, header_row: List[str]) -> Dict[str, int]:
        """Ánh xạ tên cột từ file Excel sang trường chuẩn của hệ thống."""
        mapping: Dict[str, int] = {}
        for col_idx, col_val in enumerate(header_row):
            if not col_val:
                continue
            normalized_val = str(col_val).strip().lower()
            for field, aliases in HEADER_ALIASES.items():
                if field not in mapping and normalized_val in aliases:
                    mapping[field] = col_idx
                    break
        return mapping

    @classmethod
    def parse_and_validate_excel(
        cls,
        file_bytes: bytes,
        filename: str,
        db: Session
    ) -> UserImportPreviewResponse:
        """Đọc và kiểm tra hợp lệ từng dòng của tệp Excel trước khi nhập dữ liệu."""
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        except Exception as e:
            raise ValueError(f"Không thể đọc tệp Excel. Vui lòng kiểm tra định dạng tệp (.xlsx): {str(e)}")

        ws = wb.active
        if not ws:
            raise ValueError("Tệp Excel không chứa trang tính (sheet) nào.")

        rows_iter = ws.iter_rows(values_only=True)
        try:
            header_row = next(rows_iter)
        except StopIteration:
            raise ValueError("Tệp Excel rỗng, không có dữ liệu tiêu đề.")

        header_strings = [str(c).strip() if c is not None else "" for c in header_row]
        mapping = cls._map_headers(header_strings)

        # Kiểm tra các cột bắt buộc tối thiểu (email và vai trò)
        missing_required_headers = []
        for req_col in ["email", "role"]:
            if req_col not in mapping:
                missing_required_headers.append(req_col)

        if missing_required_headers:
            raise ValueError(
                f"Tệp Excel thiếu các cột bắt buộc: {', '.join(missing_required_headers)}. "
                "Vui lòng tải tệp mẫu chuẩn để sử dụng."
            )

        # Tập hợp theo dõi để bắt trùng lặp ngay trong file
        seen_usernames_in_file: Dict[str, int] = {}  # username_lower -> first_row_index
        seen_emails_in_file: Dict[str, int] = {}     # email_lower -> first_row_index

        # Tập hợp lấy trước từ CSDL để kiểm tra nhanh trùng lặp
        existing_users = db.query(User.username, User.email).all()
        db_usernames: Set[str] = {u.username.lower() for u in existing_users if u.username}
        db_emails: Set[str] = {u.email.lower() for u in existing_users if u.email}

        validated_rows: List[UserImportRow] = []

        row_index = 1  # header là dòng 1
        for row in rows_iter:
            row_index += 1
            if not any(row):
                # Bỏ qua dòng hoàn toàn trống
                continue

            def get_cell_val(field: str) -> Optional[str]:
                idx = mapping.get(field)
                if idx is not None and idx < len(row):
                    val = row[idx]
                    if val is not None:
                        val_str = str(val).strip()
                        return val_str if val_str else None
                return None

            raw_username = get_cell_val("username")
            raw_email = get_cell_val("email")
            raw_full_name = get_cell_val("full_name")
            raw_role = get_cell_val("role")
            raw_phone = get_cell_val("phone_number")
            raw_warehouse = get_cell_val("assigned_warehouse")
            raw_password = get_cell_val("password")

            errors: List[str] = []

            # 1. Kiểm tra & Tự động lấy Email làm username nếu để trống
            uname_clean = raw_username.strip() if raw_username else None
            auto_from_email = False
            if not uname_clean and raw_email:
                uname_clean = raw_email.strip().lower()
                auto_from_email = True
                raw_username = uname_clean

            if not uname_clean:
                errors.append("Tên đăng nhập không được để trống (hoặc cần điền Email để hệ thống tự cấp).")
            else:
                if not auto_from_email and not USERNAME_REGEX.match(uname_clean):
                    errors.append("Tên đăng nhập không hợp lệ (từ 3-50 ký tự, chỉ gồm chữ cái, số, _, -, .).")
                else:
                    uname_lower = uname_clean.lower()
                    if uname_lower in seen_usernames_in_file:
                        errors.append(f"Tên đăng nhập bị trùng với dòng {seen_usernames_in_file[uname_lower]} trong cùng tệp.")
                    elif uname_lower in db_usernames:
                        errors.append(f"Tên đăng nhập '{uname_clean}' đã tồn tại trong hệ thống.")
                    else:
                        seen_usernames_in_file[uname_lower] = row_index

            # 2. Kiểm tra email
            if not raw_email:
                errors.append("Email không được để trống.")
            else:
                email_clean = raw_email.strip().lower()
                if not EMAIL_REGEX.match(email_clean):
                    errors.append(f"Định dạng email '{raw_email}' không hợp lệ.")
                else:
                    if email_clean in seen_emails_in_file:
                        errors.append(f"Email bị trùng với dòng {seen_emails_in_file[email_clean]} trong cùng tệp.")
                    elif email_clean in db_emails:
                        errors.append(f"Email '{email_clean}' đã được đăng ký trong hệ thống.")
                    else:
                        seen_emails_in_file[email_clean] = row_index

            # 3. Kiểm tra họ tên
            if not raw_full_name:
                errors.append("Họ và tên không được để trống.")

            # 4. Kiểm tra vai trò (Role)
            standardized_role: Optional[str] = None
            if not raw_role:
                errors.append("Vai trò không được để trống.")
            else:
                role_clean = raw_role.strip().lower()
                if role_clean in ROLE_LOOKUP_MAP:
                    standardized_role = ROLE_LOOKUP_MAP[role_clean]
                else:
                    valid_roles_str = ", ".join(VALID_ROLES)
                    errors.append(f"Vai trò '{raw_role}' không hợp lệ. Cho phép: {valid_roles_str}.")

            # 5. Ràng buộc vai trò kho (SCRUM-206)
            if standardized_role:
                is_warehouse_role = standardized_role.lower() in WAREHOUSE_ROLES
                if is_warehouse_role and not raw_warehouse:
                    errors.append("Người dùng thuộc vai trò Kho bắt buộc phải gán Kho phụ trách.")

            # 6. Kiểm tra số điện thoại (tùy chọn)
            if raw_phone:
                phone_clean = raw_phone.replace(" ", "").replace("-", "")
                if not PHONE_REGEX.match(phone_clean):
                    errors.append(f"Số điện thoại '{raw_phone}' không đúng định dạng (9-11 chữ số).")

            # 7. Kiểm tra mật khẩu (tùy chọn)
            if raw_password and len(raw_password) < 6:
                errors.append("Mật khẩu phải có độ dài tối thiểu 6 ký tự.")

            is_valid = len(errors) == 0

            validated_rows.append(
                UserImportRow(
                    row_index=row_index,
                    username=raw_username,
                    email=raw_email.lower() if raw_email else None,
                    full_name=raw_full_name,
                    phone_number=raw_phone,
                    role=standardized_role or raw_role,
                    assigned_warehouse=raw_warehouse,
                    password=raw_password,
                    is_valid=is_valid,
                    errors=errors,
                )
            )

        valid_count = sum(1 for r in validated_rows if r.is_valid)
        invalid_count = len(validated_rows) - valid_count

        return UserImportPreviewResponse(
            filename=filename,
            total_rows=len(validated_rows),
            valid_count=valid_count,
            invalid_count=invalid_count,
            rows=validated_rows,
        )

    @classmethod
    def execute_partial_import(
        cls,
        file_bytes: bytes,
        filename: str,
        db: Session
    ) -> UserImportSummaryResponse:
        """Thực hiện partial import: Bỏ qua dòng lỗi, lưu dòng hợp lệ vào CSDL và tạo báo cáo tổng kết."""
        preview = cls.parse_and_validate_excel(file_bytes=file_bytes, filename=filename, db=db)

        created_users: List[CreatedUserInfo] = []
        row_errors: List[RowErrorInfo] = []

        # Lưu thông tin lỗi cho các dòng không hợp lệ
        for r in preview.rows:
            if not r.is_valid:
                row_errors.append(
                    RowErrorInfo(
                        row_index=r.row_index,
                        username=r.username,
                        email=r.email,
                        errors=r.errors,
                    )
                )

        # Lấy danh sách Role từ DB để gán quan hệ Many-to-Many nếu có
        all_roles = db.query(Role).all()
        roles_by_name = {role.name.upper(): role for role in all_roles}

        # Xử lý các dòng hợp lệ
        valid_rows = [r for r in preview.rows if r.is_valid]

        for r in valid_rows:
            try:
                # Tạo mật khẩu khởi tạo
                temp_password: Optional[str] = None
                must_change = False
                if r.password:
                    raw_pw = r.password
                else:
                    temp_password = f"Temp@{secrets.token_hex(4)}1"
                    raw_pw = temp_password
                    must_change = True

                new_user = User(
                    username=r.username.strip(),
                    email=r.email.strip().lower(),
                    full_name=r.full_name.strip() if r.full_name else None,
                    phone_number=r.phone_number.strip() if r.phone_number else None,
                    role=r.role,
                    assigned_warehouse=r.assigned_warehouse.strip() if r.assigned_warehouse else None,
                    hashed_password=bam_mat_khau(raw_pw),
                    must_change_password=must_change,
                    is_active=True,
                    token_version=1,
                )

                # Gán Role quan hệ nếu tìm thấy Role tương ứng
                if r.role:
                    role_key = r.role.upper()
                    if role_key in roles_by_name:
                        new_user.roles.append(roles_by_name[role_key])

                db.add(new_user)
                db.flush()  # Sinh ID ngay lập tức

                created_users.append(
                    CreatedUserInfo(
                        id=new_user.id,
                        username=new_user.username,
                        email=new_user.email,
                        role=new_user.role,
                        full_name=new_user.full_name,
                        temporary_password=temp_password,
                    )
                )
            except Exception as ex:
                # Nếu có lỗi bất ngờ khi thêm bản ghi (vd: xung đột đồng thời)
                db.rollback()
                row_errors.append(
                    RowErrorInfo(
                        row_index=r.row_index,
                        username=r.username,
                        email=r.email,
                        errors=[f"Lỗi khi lưu vào cơ sở dữ liệu: {str(ex)}"],
                    )
                )

        # Commit toàn bộ các bản ghi thành công
        if created_users:
            try:
                db.commit()
            except Exception as ex:
                db.rollback()
                raise ValueError(f"Không thể hoàn tất giao dịch lưu dữ liệu: {str(ex)}")

        success_count = len(created_users)
        failed_count = len(row_errors)
        total_processed = success_count + failed_count

        msg = (
            f"Đã hoàn thành nhập dữ liệu! "
            f"Tạo thành công: {success_count}/{total_processed} người dùng. "
            f"Bỏ qua: {failed_count} dòng lỗi."
        )

        return UserImportSummaryResponse(
            total_processed=total_processed,
            success_count=success_count,
            failed_count=failed_count,
            created_users=created_users,
            row_errors=row_errors,
            message=msg,
        )
