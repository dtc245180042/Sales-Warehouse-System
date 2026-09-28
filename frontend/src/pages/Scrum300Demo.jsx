import { useAuth } from '../context/useAuth';

export default function Scrum300Demo() {
  const {
    user,
    loading,
    setLoading,
    selectWarehouse,
    updateRole,
    login,
    logout,
    availableWarehouses,
  } = useAuth();

  // Hàm mô phỏng tải lại dữ liệu trong 2.5 giây để kiểm tra Skeleton Loader
  const handleSimulateLoading = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 2500);
  };

  return (
    <div style={{ maxWidth: '880px', margin: '40px auto', padding: '0 20px', textAlign: 'left' }}>
      {/* Header giới thiệu */}
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <h1 style={{ color: '#2563eb', fontSize: '2.5rem', marginBottom: '8px' }}>
          Hệ Thống Quản Lý Bán Hàng & Kho
        </h1>
        <p style={{ color: 'var(--text)', fontSize: '16px' }}>
          Nhiệm vụ <strong>[SCRUM-300]</strong>: Hiển thị tên người dùng, vai trò và kho/địa bàn đang làm việc.
        </p>
      </div>

      {/* Bảng điều khiển thử nghiệm các kịch bản SCRUM-300 */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          backgroundColor: 'var(--social-bg)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            🧪 Bảng Thử Nghiệm Kịch Bản (Edge Cases Tester)
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--text)' }}>
            Dành cho QA / Giảng viên kiểm thử
          </span>
        </div>

        <p style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '20px' }}>
          Bấm các nút dưới đây để xem thanh Navbar (góc trên bên phải) phản ứng tức thời với từng trường hợp:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          {/* Kịch bản 1: Bình thường */}
          <button
            type="button"
            onClick={() => {
              setLoading(false);
              login({
                id: 'usr_001',
                name: 'Nguyễn Văn An',
                role: 'Quản lý kho',
                warehouse: 'Kho Tổng Hà Nội',
              });
            }}
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid #93c5fd',
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            ✅ 1. Bình thường (Đầy đủ thông tin)
            <div style={{ fontWeight: 400, fontSize: '11px', marginTop: '4px', color: '#3b82f6' }}>
              Tên: Nguyễn Văn An | Vai trò: Quản lý kho | Kho Tổng Hà Nội
            </div>
          </button>

          {/* Kịch bản 2: Chưa chọn kho/địa bàn */}
          <button
            type="button"
            onClick={() => {
              setLoading(false);
              if (!user) {
                login({
                  id: 'usr_001',
                  name: 'Trần Thị Bích',
                  role: 'Nhân viên bán hàng',
                  warehouse: null,
                });
              } else {
                selectWarehouse(null);
              }
            }}
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid #fde68a',
              backgroundColor: '#fffbeb',
              color: '#b45309',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            ⚠️ 2. Chưa chọn kho/địa bàn
            <div style={{ fontWeight: 400, fontSize: '11px', marginTop: '4px', color: '#d97706' }}>
              Hiển thị nhãn cảnh báo vàng: "Chưa chọn kho/địa bàn"
            </div>
          </button>

          {/* Kịch bản 3: Đang tải dữ liệu (Skeleton loader) */}
          <button
            type="button"
            onClick={handleSimulateLoading}
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid #c7d2fe',
              backgroundColor: '#eef2ff',
              color: '#4338ca',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            ⏳ 3. Đang tải dữ liệu (Skeleton Shimmer)
            <div style={{ fontWeight: 400, fontSize: '11px', marginTop: '4px', color: '#6366f1' }}>
              Hiệu ứng tải placeholder trong 2.5 giây
            </div>
          </button>

          {/* Kịch bản 4: Dữ liệu trống / Chưa đăng nhập */}
          <button
            type="button"
            onClick={() => {
              setLoading(false);
              logout();
            }}
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid #fecaca',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            🚫 4. Dữ liệu trống / Chưa đăng nhập
            <div style={{ fontWeight: 400, fontSize: '11px', marginTop: '4px', color: '#ef4444' }}>
              Kiểm tra null/undefined, hiển thị "Khách" an toàn
            </div>
          </button>
        </div>

        {/* Khu vực chọn nhanh kho và đổi vai trò */}
        {user && !loading && (
          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px dashed var(--border)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="select-warehouse-test" style={{ fontSize: '13px', fontWeight: 600 }}>
                🏢 Đổi kho nhanh:
              </label>
              <select
                id="select-warehouse-test"
                value={user.warehouse || ''}
                onChange={(e) => selectWarehouse(e.target.value || null)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--text-h)',
                  fontSize: '13px',
                }}
              >
                <option value="">-- Chưa chọn kho --</option>
                {availableWarehouses.map((wh) => (
                  <option key={wh} value={wh}>
                    {wh}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>🎭 Đổi vai trò:</span>
              {['Quản lý kho', 'Nhân viên bán hàng', 'Quản trị viên'].map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => updateRole(role)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    border: user.role === role ? '1px solid var(--accent)' : '1px solid var(--border)',
                    backgroundColor: user.role === role ? 'var(--accent-bg)' : 'transparent',
                    color: user.role === role ? 'var(--accent)' : 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Thông tin mô tả yêu cầu SCRUM-300 */}
      <div style={{ marginTop: '28px', fontSize: '13px', color: 'var(--text)', lineHeight: '1.6' }}>
        <h3 style={{ fontSize: '15px', color: 'var(--text-h)', marginBottom: '8px' }}>
          📋 Checklist kiểm tra nhiệm vụ [SCRUM-300]:
        </h3>
        <ul style={{ paddingLeft: '20px', margin: 0 }}>
          <li>
            <strong>Tên người dùng:</strong> Hiển thị rõ họ tên tại Header kèm avatar ký tự viết tắt.
          </li>
          <li>
            <strong>Vai trò:</strong> Hiển thị badge màu tương ứng (Quản lý kho, Bán hàng, Admin).
          </li>
          <li>
            <strong>Kho/địa bàn:</strong> Hiển thị rõ tên kho khi đã chọn; hiển thị nhãn cảnh báo nổi bật khi chưa chọn kho.
          </li>
          <li>
            <strong>Edge cases:</strong> Skeleton loading khi tải dữ liệu, kiểm tra an toàn null/undefined tránh crash trang.
          </li>
        </ul>
      </div>
    </div>
  );
}