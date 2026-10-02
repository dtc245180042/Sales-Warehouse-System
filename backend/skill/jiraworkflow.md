🗂️ Jira Workflow – Quản lý Công việc
Dự án: Hệ thống Bán hàng & Kho (OMS) — K13C4 · T9/2026

🗂️ Hướng dẫn Quản lý Công việc với Jira
Dự án: OMS K13C4 · Tech Stack: React + TypeScript / Python FastAPI / MySQL

Mục lục
•	[Cấu hình dự án ban đầu](#1-cấu-hình-dự-án-ban-đầu)
•	[Hệ thống phân cấp Issue](#2-hệ-thống-phân-cấp-issue)
•	[Component – Phân chia theo Stack](#3-component--phân-chia-theo-stack)
•	[Label – Gắn nhãn thông minh](#4-label--gắn-nhãn-thông-minh)
•	[Cách tạo Story đúng chuẩn](#5-cách-tạo-story-đúng-chuẩn)
•	[Cách tách Task từ Story](#6-cách-tách-task-từ-story)
•	[Quy trình Sprint (Scrum Workflow)](#7-quy-trình-sprint-scrum-workflow)
•	[Cột Board & Trạng thái Issue](#8-cột-board--trạng-thái-issue)
•	[Quy tắc phân công (Assignment Rules)](#9-quy-tắc-phân-công-assignment-rules)
•	[Luồng làm việc hàng ngày](#10-luồng-làm-việc-hàng-ngày)
•	[Những lỗi thường gặp cần tránh](#11-những-lỗi-thường-gặp-cần-tránh)

1. Cấu hình dự án ban đầu
Thông tin dự án
Project Name  : OMS-K13C4
Project Key   : OMS
Project Type  : Scrum
Sprint length : 1 tuần
Cài đặt Story Points
•	Đơn vị: Story Point (theo Fibonacci: 1, 2, 3, 5, 8)
•	Story > 8 point → bắt buộc chẻ nhỏ (như DoD quy định)
•	Sub-task không cần story point — chỉ cần estimate giờ

2. Hệ thống phân cấp Issue
Epic  (Tính năng lớn, cả sprint hoặc nhiều sprint)
  └── Story  (1 user story = 1 nhu cầu nghiệp vụ)
        ├── Task      (công việc kỹ thuật trong story)
        ├── Sub-task  (bước nhỏ trong Task)
        └── Bug       (lỗi phát hiện khi test)
Mô tả từng loại
Loại	Ai tạo	Khi nào	Ví dụ
**Epic**	Team Lead / PO	Đầu dự án	`EP-01 Quản lý sản phẩm & bảng giá`
**Story**	PO / Team Lead	Sprint Planning	`S2-03 Nhân viên tạo danh mục SKU`
**Task**	Developer	Sau khi nhận Story	`[BE] API GET /products`, `[FE] Màn hình danh sách sản phẩm`
**Bug**	Tester / Dev	Khi phát hiện lỗi	`[BUG] Tồn kho bị âm khi 2 user cùng đặt`
**Sub-task**	Developer	Task quá phức tạp	`Viết unit test cho ProductService`


3. Component – Phân chia theo Stack
Component trong Jira = nhãn kỹ thuật để phân loại task theo stack.
Đây là cách chính để tránh lộn xộn giữa FE và BE.
Tạo các Component sau trong Jira (Settings → Components):
Component	Màu đề xuất	Ai nhận
`Frontend`	🔵 Xanh dương	Dev Frontend (React/TS)
`Backend`	🟢 Xanh lá	Dev Backend (Python/FastAPI)
`Database`	🟠 Cam	Dev Backend (schema, migration)
`DevOps`	⚫ Xám	Team Lead / người phụ DevOps
`Testing`	🟣 Tím	Tester hoặc Dev tự test
`Design`	🩷 Hồng	Dev FE hoặc người làm UI/UX

Cách gắn Component vào Task
Task: API tạo đơn hàng
  → Component: Backend
  → Assignee: Nguyễn Văn A (dev Python)
 
Task: Màn hình tạo đơn hàng  
  → Component: Frontend
  → Assignee: Trần Thị B (dev React)
 
Task: Tạo bảng orders trong DB
  → Component: Database
  → Assignee: Nguyễn Văn A (dev Python)

4. Label – Gắn nhãn thông minh
Labels giúp lọc nhanh và báo cáo theo nhiều chiều.
Bộ Label chuẩn cho dự án OMS
Nhóm	Label	Ý nghĩa
**Ưu tiên kỹ thuật**	`critical-path`	Phải xong trước, task khác phụ thuộc
	`tech-debt`	Nợ kỹ thuật cần trả sau
	`performance`	Liên quan đến hiệu năng
	`security`	Liên quan đến bảo mật, phân quyền
**Loại công việc**	`api`	Viết API endpoint
	`ui`	Viết giao diện
	`unit-test`	Viết unit test
	`migration`	Tạo/sửa migration DB
	`refactor`	Tái cấu trúc code
**Trạng thái đặc biệt**	`blocked`	Đang bị chặn, chờ người khác
	`needs-review`	Cần review trước khi tiếp tục
	`waiting-po`	Chờ PO xác nhận nghiệp vụ


5. Cách tạo Story đúng chuẩn
Template Story
Title: [S{sprint}-{số}] {Tên ngắn gọn}
Ví dụ: [S2-03] Nhân viên tạo danh mục SKU với quy đổi đơn vị
 
--- DESCRIPTION ---
 
**User Story**
Là [vai trò], tôi muốn [hành động], để [giá trị].
 
**Acceptance Criteria** (tiêu chí chấp nhận)
✅ AC1: [mô tả điều kiện cụ thể, kiểm chứng được]
✅ AC2: ...
✅ AC3: ...
 
**Out of Scope** (không làm trong story này)
❌ ...
 
**Design / Mockup**
[Link Figma hoặc đính kèm ảnh]
 
**API liên quan** (nếu biết trước)
- POST /api/v1/products
- GET  /api/v1/products
 
**Ghi chú kỹ thuật**
[Các điểm cần chú ý, ràng buộc nghiệp vụ]
Ví dụ thực tế
Title: [S2-03] Nhân viên tạo SKU với đơn vị tính và quy đổi
 
User Story:
Là Nhân viên quản lý sản phẩm, tôi muốn tạo SKU mới kèm đơn vị tính
(thùng/lốc/lon) và tỷ lệ quy đổi, để hệ thống tự hiểu 1 thùng = bao nhiêu lon.
 
Acceptance Criteria:
✅ AC1: Form tạo SKU có trường: mã, tên, nhóm hàng, đơn vị cơ sở, đơn vị bán
✅ AC2: Mỗi đơn vị bán phải khai báo tỷ lệ quy đổi về đơn vị cơ sở
✅ AC3: Mã SKU không được trùng — hệ thống báo lỗi rõ ràng nếu trùng
✅ AC4: Tất cả tồn kho lưu theo đơn vị cơ sở, hiển thị theo đơn vị bán
 
Story Points: 5
Sprint: 2
Epic: EP-01 Quản lý sản phẩm & bảng giá

6. Cách tách Task từ Story
Đây là bước quan trọng nhất để tránh lộn xộn.
1 Story = nhiều Task, mỗi Task chỉ do 1 người làm.
Quy tắc tách Task
Story [S2-03]: Nhân viên tạo SKU
        │
        ├── Task [BE] Thiết kế bảng products & product_units trong DB
        │     Component: Database  |  Assignee: Dev A
        │
        ├── Task [BE] API POST /api/v1/products – tạo SKU
        │     Component: Backend   |  Assignee: Dev A
        │
        ├── Task [BE] API GET /api/v1/products – danh sách + lọc
        │     Component: Backend   |  Assignee: Dev A
        │
        ├── Task [FE] Màn hình danh sách sản phẩm
        │     Component: Frontend  |  Assignee: Dev B
        │
        ├── Task [FE] Form tạo / chỉnh sửa SKU
        │     Component: Frontend  |  Assignee: Dev B
        │
        └── Task [TEST] Viết unit test ProductService
              Component: Testing   |  Assignee: Dev A
Tiêu đề Task chuẩn
[BE] {Mô tả kỹ thuật ngắn gọn}
[FE] {Mô tả kỹ thuật ngắn gọn}
[DB] {Mô tả schema/migration}
[TEST] {Viết test cho gì}
[DEVOPS] {Mô tả}
 
Ví dụ:
✅ [BE] API POST /api/v1/orders – tạo đơn hàng mới
✅ [FE] Component OrderForm – form nhập đơn hàng
✅ [DB] Migration tạo bảng orders và order_lines
✅ [TEST] Unit test OrderService.create_order()
 
❌ Làm phần đơn hàng
❌ Backend order
❌ Fix lỗi

7. Quy trình Sprint (Scrum Workflow)
┌─────────────────────────────────────────────────────┐
│                   SPRINT PLANNING                    │
│  PO + Team Lead: chọn story từ Backlog vào Sprint   │
│  Dev: tách story → task, estimate giờ               │
│  Kết quả: Sprint Board đầy đủ task, rõ assignee     │
└──────────────────────┬──────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  DAILY STANDUP  │  (15 phút mỗi sáng)
              │  Xem board Jira │
              │  Cập nhật status│
              └────────┬────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                 DEVELOPMENT WEEK                     │
│  Dev: kéo task → "In Progress" khi bắt đầu         │
│  Dev: kéo task → "In Review" khi mở PR             │
│  Dev: kéo task → "Done" sau khi PR được merge      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│               SPRINT REVIEW / DEMO                  │
│  Demo story đã Done trên staging                   │
│  PO nghiệm thu từng Acceptance Criteria             │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                SPRINT RETROSPECTIVE                  │
│  Đội nhìn lại: cái gì tốt, cái gì cần cải thiện   │
│  Velocity thực tế = tổng point story Done           │
└─────────────────────────────────────────────────────┘

8. Cột Board & Trạng thái Issue
Cấu hình Board Columns
┌──────────┬──────────────┬─────────────┬───────────┬──────────┐
│ BACKLOG  │  TO DO       │ IN PROGRESS │ IN REVIEW │   DONE   │
│          │              │             │           │          │
│ Story    │ Task đã      │ Task đang   │ PR đã mở, │ PR merge │
│ chưa vào │ được assign  │ được làm    │ chờ review│ CI xanh  │
│ sprint   │              │             │           │          │
└──────────┴──────────────┴─────────────┴───────────┴──────────┘
Quy tắc di chuyển task trên board
Hành động	Kéo sang cột
Bắt đầu làm task	`TO DO` → `IN PROGRESS`
Đẩy code, mở PR	`IN PROGRESS` → `IN REVIEW`
PR bị request changes	`IN REVIEW` → `IN PROGRESS`
PR được approve + merge	`IN REVIEW` → `DONE`
Phát hiện bị blocked	Gắn label `blocked`, comment lý do

Nguyên tắc vàng: Mỗi người chỉ có tối đa 2 task "In Progress" cùng lúc.
Hoàn thành task cũ trước khi nhận task mới.

9. Quy tắc phân công (Assignment Rules)
Nguyên tắc phân chia
1 Story = 2 nhóm task song song (nếu đủ người):
  └── Dev Backend  → làm task [BE] + [DB]  trước
  └── Dev Frontend → làm task [FE]  sau khi có API
 
Không bao giờ để 1 người làm cả BE lẫn FE của cùng 1 story
→ mất đi lợi ích của code review chéo
Ví dụ phân công cho story [S4-01] Tạo đơn hàng
Task	Component	Assignee	Phụ thuộc
`[DB]` Migration bảng orders	Database	Dev A	—
`[BE]` API tạo đơn + kiểm tồn	Backend	Dev A	Sau DB
`[BE]` API GET danh sách đơn	Backend	Dev A	Sau DB
`[FE]` Form tạo đơn hàng	Frontend	Dev B	Sau khi có API mock
`[FE]` Danh sách đơn hàng	Frontend	Dev B	Sau khi có API thật
`[TEST]` Unit test OrderService	Testing	Dev A	Cùng lúc với BE

Khi task phụ thuộc nhau
Trong Jira: Dùng tính năng "Link Issues"
  Task [FE] Form tạo đơn   →  "is blocked by"  →  Task [BE] API tạo đơn
 
Trong thực tế:
  Dev FE có thể bắt đầu với mock data / contract API đã định trước
  Không cần chờ BE xong mới bắt đầu

10. Luồng làm việc hàng ngày
Sáng (Daily Standup – 15 phút)
Mỗi người trả lời 3 câu, nhìn vào board Jira:
 
1. "Hôm qua tôi đã làm gì?"
   → Kéo task đã xong sang "Done" (nếu chưa kéo)
 
2. "Hôm nay tôi sẽ làm gì?"
   → Kéo task sang "In Progress"
 
3. "Tôi đang bị blocked bởi cái gì?"
   → Gắn label "blocked", tag người liên quan trong comment
Trong ngày
Bắt đầu task
  → Kéo sang "In Progress"
  → Tạo nhánh Git theo convention: feature/scrum-<id>-<tên-ngắn> (Tham khảo chi tiết tại `gitflow.md`)
  → AI Agent tuân thủ nguyên tắc: CHỈ THÊM MỚI file tính năng, không sửa code dùng chung (Xem `AGENTS.md`)
 
Đang làm
  → Log work (Time Tracking) nếu cần estimate velocity
  → Comment vào task nếu có phát hiện / quyết định kỹ thuật quan trọng
 
Mở PR
  → Kéo task sang "In Review"
  → Paste link PR vào comment của task trong Jira
 
PR được merge
  → Kéo task sang "Done"
  → Nếu đây là task cuối của Story → kéo Story sang "Done"
Cuối ngày
Trước 5:30 PM:
  → Cập nhật % hoàn thành (hoặc comment tiến độ) vào task đang làm
  → Gắn "blocked" nếu đang chờ ai đó
  → Ping reviewer nếu PR đã mở > 1 ngày chưa có review

11. Những lỗi thường gặp cần tránh
❌ Lỗi #1: Task quá chung chung
❌ Xấu:
  Task: "Làm phần đơn hàng"
  → Không rõ làm gì, ai làm, khi nào xong
 
✅ Tốt:
  Task: "[BE] API POST /api/v1/orders – tạo đơn, kiểm tồn và hạn mức"
  Task: "[FE] Màn hình OrderForm – nhập sản phẩm, số lượng, ghi chú"
❌ Lỗi #2: Không tách task theo stack
❌ Xấu:
  Story "Tạo đơn hàng" → assign toàn bộ cho 1 người
  → Người kia không có việc, người này ôm đồm
 
✅ Tốt:
  Story "Tạo đơn hàng" → tách thành 5–6 task
  → Dev A: BE + DB  |  Dev B: FE  |  cả 2 chạy song song
❌ Lỗi #3: Quên cập nhật board
❌ Xấu:
  Task vẫn ở "To Do" nhưng đã làm xong 2 ngày
  → Team Lead không biết tiến độ thật, Sprint Review lộn xộn
 
✅ Tốt:
  Kéo task ngay khi bắt đầu, ngay khi mở PR, ngay khi merge
❌ Lỗi #4: Bug không có thông tin tái hiện
❌ Xấu:
  Bug: "Lỗi tồn kho"
 
✅ Tốt:
  Bug: "[BUG-S5] Tồn kho âm khi 2 user đặt cùng lúc trên SKU sắp hết"
  
  Mô tả:
  - Môi trường: staging
  - Bước tái hiện: 
    1. Mở 2 tab, cùng vào trang tạo đơn
    2. Cùng thêm 10 lon (tồn thực tế: 10)
    3. Cùng bấm "Xác nhận đơn" trong vòng 1 giây
  - Kết quả thực tế: Cả 2 đơn đều thành công, tồn = -10
  - Kết quả mong đợi: Đơn thứ 2 phải bị từ chối với lỗi tồn không đủ
  - Component: Backend
  - Severity: Critical
  - Link PR liên quan: (nếu có)
❌ Lỗi #5: Story không có Acceptance Criteria rõ ràng
❌ Xấu:
  Story: "Làm chức năng đăng nhập"
  → Dev không biết "xong" là như thế nào
 
✅ Tốt:
  Story: "Nhân viên đăng nhập bằng email và mật khẩu"
  AC1: Đăng nhập đúng → nhận access token 15 phút + refresh token 7 ngày
  AC2: Sai mật khẩu → thông báo "Sai tên đăng nhập hoặc mật khẩu" (không nói rõ sai cái nào)
  AC3: Sai ≥ 5 lần → khoá tài khoản 30 phút
  AC4: Token hết hạn → tự làm mới bằng refresh token, không logout

Tóm tắt – Bộ quy tắc 1 trang
CẤU TRÚC:
  Epic → Story → Task ([BE]/[FE]/[DB]/[TEST]) → Sub-task
 
ĐẶT TÊN TASK:
  [BE] API {method} {endpoint} – {mô tả ngắn}
  [FE] Màn hình / Component {tên} – {mô tả ngắn}
  [DB] Migration {mô tả thay đổi schema}
  [BUG] {Mô tả lỗi rõ, kèm môi trường}
 
COMPONENT:
  Mỗi task GẮN 1 component: Frontend / Backend / Database / Testing
 
PHÂN CÔNG:
  1 story → 2 người làm song song (BE + FE)
  Tối đa 2 task "In Progress" mỗi người
 
BOARD:
  To Do → In Progress (khi bắt đầu)
         → In Review  (khi mở PR)
         → Done       (khi PR merge + CI xanh)
 
DAILY:
  Mỗi sáng cập nhật board trước standup
  Blocked? → gắn label + comment ngay, đừng im lặng

Áp dụng từ Sprint 1. Mọi góp ý: comment vào issue `OMS-PROCESS` trên Jira.
