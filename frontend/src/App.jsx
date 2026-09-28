import React, { useState, useEffect } from 'react';

// =========================================================================
// MOCK DATA CỐ ĐỊNH CHỈ DÙNG ĐỂ HIỂN THỊ KHUNG GIAO DIỆN FRONTEND
// =========================================================================
const MOCK_PRODUCTS = [
  { id: '1', sku: 'SKU-BIA-SG-SPEC', name: 'Bia Sài Gòn Special Lon 330ml', pack: '24 lon / thùng (4 lốc x 6 lon)', unit: 'Lon', price: 15000, status: 'Có sẵn' },
  { id: '2', sku: 'SKU-CHOCOPIE-OR', name: 'Bánh Chocopie Orion Hộp 12 Cái', pack: '8 hộp / thùng', unit: 'Hộp', price: 55000, status: 'Có sẵn' },
  { id: '3', sku: 'SKU-LAVIE-500', name: 'Nước khoáng thiên nhiên Lavie Chai 500ml', pack: '24 chai / thùng', unit: 'Chai', price: 6000, status: 'Có sẵn' },
  { id: '4', sku: 'SKU-STING-DAU', name: 'Nước tăng lực Sting Dâu Chai 330ml', pack: '24 chai / thùng', unit: 'Chai', price: 10000, status: 'Có sẵn' },
  { id: '5', sku: 'SKU-SUA-VNM-180', name: 'Sữa tươi tiệt trùng Vinamilk Có đường 180ml', pack: '48 hộp / thùng (12 lốc x 4 hộp)', unit: 'Hộp', price: 8500, status: 'Có sẵn' },
];

const MOCK_ACCOUNTS = [
  { fullName: 'Quản Trị Viên Hệ Thống', username: 'admin', password: 'admin123', email: 'admin@quanlykho.vn', phone: '0912345678', role: 'admin', createdAt: '01/01/2026' },
  { fullName: 'Nhân Viên Bán Hàng POS', username: 'staff', password: 'staff123', email: 'staff@quanlykho.vn', phone: '0987654321', role: 'staff', createdAt: '15/02/2026' },
  { fullName: 'Công ty TNHH Thương mại Tuấn Phương (Đại lý cấp 1)', username: 'customer', password: 'customer123', email: 'tuanphuong@daily.vn', phone: '0933445566', role: 'customer', createdAt: '20/03/2026' }
];

function App({
  orderHistory = [],
  staffPendingOrders = [],
  adminStats = { totalAgencies: 0, totalOrders: 0, monthlyRevenue: 0, pendingLimitRequests: 0 },
  onLoginSubmit = (data) => console.log('[Backend API] Login:', data),
  onRegisterSubmit = (data) => console.log('[Backend API] Register:', data),
  onChangePassSubmit = (data) => console.log('[Backend API] Change Pass:', data),
  onSubmitOrder = (cart) => console.log('[Backend API] Submit Order:', cart),
}) {
  // -------------------------------------------------------------------------
  // STATE CỦA HỆ THỐNG
  // -------------------------------------------------------------------------
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [screen, setScreen] = useState(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? 'dashboard' : 'login';
  });

  const [currentRole, setCurrentRole] = useState(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved).role : 'customer';
  });

  const [activeTab, setActiveTab] = useState('main');
  const [hoveredBlock, setHoveredBlock] = useState(null);

  // STATE POP-UP THÔNG BÁO (MODAL ALERT)
  const [popup, setPopup] = useState({
    show: false,
    title: '',
    message: '',
    type: 'success', // 'success' | 'error' | 'info'
    onConfirm: null
  });

  // STATE DỮ LIỆU FORM ĐĂNG KÝ
  const [regForm, setRegForm] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });

  // STATE BẬT/TẮT HIỂN THỊ MẬT KHẨU
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);
  const [showRegConfirmPass, setShowRegConfirmPass] = useState(false);
  const [showProfCurrentPass, setShowProfCurrentPass] = useState(false);
  const [showProfNewPass, setShowProfNewPass] = useState(false);
  const [showProfConfirmPass, setShowProfConfirmPass] = useState(false);

  const [resetStep, setResetStep] = useState(1);
  const [showForgotInProfile, setShowForgotInProfile] = useState(false);

  // =========================================================================
  // XỬ LÝ LẮNG NGHE ĐĂNG XUẤT CHO TAB PHỤ (HẾT PHIÊN ĐĂNG NHẬP)
  // =========================================================================
  useEffect(() => {
    const authChannel = new BroadcastChannel('auth_logout_channel');

    // Hàm kích hoạt Pop-up HẾT PHIÊN ĐĂNG NHẬP dành riêng cho Tab phụ
    const triggerOtherTabLogoutPopup = () => {
      setUser(null);
      setScreen('login');
      setPopup({
        show: true,
        title: 'Hết phiên đăng nhập',
        message: 'Tài khoản của bạn vừa được đăng xuất từ một tab làm việc hoặc thiết bị khác!',
        type: 'info',
        onConfirm: () => setPopup({ show: false, title: '', message: '', type: 'info', onConfirm: null })
      });
    };

    // 1. Nhận tín hiệu qua BroadcastChannel
    authChannel.onmessage = (event) => {
      if (event.data && event.data.type === 'LOGOUT_EVENT') {
        triggerOtherTabLogoutPopup();
      }
    };

    // 2. Nhận tín hiệu qua Storage Event (Dự phòng)
    const handleStorageChange = (event) => {
      if (event.key === 'auth_user' && event.newValue === null) {
        triggerOtherTabLogoutPopup();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      authChannel.close();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // =========================================================================
  // XỬ LÝ ĐĂNG XUẤT CHO TAB BẤM ĐĂNG XUẤT (ĐÃ ĐĂNG XUẤT THÀNH CÔNG)
  // =========================================================================
  const handleLogout = () => {
    // 1. Xoá phiên đăng nhập hiện tại
    setUser(null);
    localStorage.removeItem('auth_user');

    // 2. Gửi thông điệp báo cho TẤT CẢ các tab khác
    try {
      const authChannel = new BroadcastChannel('auth_logout_channel');
      authChannel.postMessage({ type: 'LOGOUT_EVENT', timestamp: Date.now() });
      authChannel.close();
    } catch (e) {
      console.log('BroadcastChannel error:', e);
    }

    // 3. Hiển thị Pop-up "ĐÃ ĐĂNG XUẤT THÀNH CÔNG" cho tab bấm Đăng xuất
    setScreen('login');
    setPopup({
      show: true,
      title: 'Đăng xuất thành công',
      message: 'Tài khoản của bạn đã được đăng xuất an toàn khỏi hệ thống tập trung!',
      type: 'info',
      onConfirm: () => setPopup({ show: false, title: '', message: '', type: 'info', onConfirm: null })
    });
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    onLoginSubmit({});

    const loggedUser = MOCK_ACCOUNTS.find(a => a.role === currentRole) || MOCK_ACCOUNTS[2];
    setUser(loggedUser);
    localStorage.setItem('auth_user', JSON.stringify(loggedUser));
    setScreen('dashboard');
  };

  const handleRegisterSubmit = (e) => {
    e.preventDefault();

    if (!regForm.fullName || !regForm.username || !regForm.email || !regForm.phone || !regForm.password || !regForm.confirmPassword) {
      setPopup({
        show: true,
        title: 'Đăng ký không thành công',
        message: 'Vui lòng điền đầy đủ tất cả các trường thông tin bắt buộc!',
        type: 'error',
        onConfirm: () => setPopup({ ...popup, show: false })
      });
      return;
    }

    if (regForm.password !== regForm.confirmPassword) {
      setPopup({
        show: true,
        title: 'Mật khẩu không trùng khớp',
        message: 'Xác nhận mật khẩu không giống với mật khẩu đã nhập. Vui lòng kiểm tra lại!',
        type: 'error',
        onConfirm: () => setPopup({ ...popup, show: false })
      });
      return;
    }

    const newCustomerUser = {
      fullName: regForm.fullName,
      username: regForm.username,
      password: regForm.password,
      email: regForm.email,
      phone: regForm.phone,
      role: 'customer',
      createdAt: new Date().toLocaleDateString('vi-VN')
    };

    onRegisterSubmit(newCustomerUser);

    setPopup({
      show: true,
      title: '🎉 Tạo tài khoản thành công!',
      message: `Chúc mừng đại lý "${regForm.fullName}" đã đăng ký tài khoản thành công. Hệ thống tự động chuyển bạn đến Cổng Đặt Hàng Đại Lý!`,
      type: 'success',
      onConfirm: () => {
        setPopup({ ...popup, show: false });
        setUser(newCustomerUser);
        setCurrentRole('customer');
        localStorage.setItem('auth_user', JSON.stringify(newCustomerUser));
        setScreen('dashboard');
        setRegForm({ fullName: '', username: '', email: '', phone: '', password: '', confirmPassword: '' });
      }
    });
  };

  const handleRoleChange = (role) => {
    setCurrentRole(role);
    if (user) {
      const updatedUser = { ...user, role };
      setUser(updatedUser);
      localStorage.setItem('auth_user', JSON.stringify(updatedUser));
    }
  };

  // COMPONENT POP-UP MODAL HIỂN THỊ TOÀN CỤC
  const NotificationModal = () => {
    if (!popup.show) return null;

    const isSuccess = popup.type === 'success';
    const isError = popup.type === 'error';

    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modalBox}>
          <div style={{
            ...styles.modalHeaderIcon,
            backgroundColor: isSuccess ? '#dcfce7' : isError ? '#fee2e2' : '#e0f2fe',
            color: isSuccess ? '#166534' : isError ? '#991b1b' : '#075985'
          }}>
            {isSuccess ? '✅' : isError ? '⚠️' : 'ℹ️'}
          </div>

          <h3 style={{ margin: '10px 0 8px 0', color: '#1e293b', fontSize: '18px', fontWeight: 'bold' }}>
            {popup.title}
          </h3>

          <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '13px', lineHeight: '1.5' }}>
            {popup.message}
          </p>

          <button
            type="button"
            onClick={popup.onConfirm || (() => setPopup({ ...popup, show: false }))}
            style={{
              ...styles.modalBtn,
              backgroundColor: isSuccess ? '#2563eb' : isError ? '#ef4444' : '#1E2A78',
            }}
          >
            ĐÃ HIỂU & TIẾP TỤC
          </button>
        </div>
      </div>
    );
  };

  const TogglePassBtn = ({ isVisible, onToggle }) => (
    <button type="button" onClick={onToggle} style={styles.eyeBtn} title={isVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
      {isVisible ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E2A78" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      )}
    </button>
  );

  // LAYOUT DASHBOARD OMS PRO
  const OMSDashboardLayout = ({ children }) => {
    const roleActive = user?.role || currentRole;

    return (
      <div style={styles.omsContainer}>
        <aside style={styles.omsSidebar}>
          <div>
            <div style={styles.omsSidebarHeader}>PHÂN HỆ {roleActive.toUpperCase()}</div>
            <div style={styles.omsNavList}>
              {roleActive === 'customer' && (
                <>
                  <div style={{ ...styles.omsNavItem, ...styles.omsNavItemActive, ...(hoveredBlock === 'nav-c1' ? styles.elevatedBlockDark : {}) }} onMouseEnter={() => setHoveredBlock('nav-c1')} onMouseLeave={() => setHoveredBlock(null)}>
                    <span>🛒</span> Cổng Đặt hàng Đại lý
                  </div>
                  <div style={{ ...styles.omsNavItem, ...(hoveredBlock === 'nav-c2' ? styles.elevatedBlockDark : {}) }} onMouseEnter={() => setHoveredBlock('nav-c2')} onMouseLeave={() => setHoveredBlock(null)}>
                    <span>📜</span> Tra cứu Công nợ
                  </div>
                </>
              )}

              {roleActive === 'staff' && (
                <>
                  <div style={{ ...styles.omsNavItem, ...styles.omsNavItemActive, ...(hoveredBlock === 'nav-s1' ? styles.elevatedBlockDark : {}) }} onMouseEnter={() => setHoveredBlock('nav-s1')} onMouseLeave={() => setHoveredBlock(null)}>
                    <span>⚡</span> Bán hàng & Xuất kho (POS)
                  </div>
                  <div style={{ ...styles.omsNavItem, ...(hoveredBlock === 'nav-s2' ? styles.elevatedBlockDark : {}) }} onMouseEnter={() => setHoveredBlock('nav-s2')} onMouseLeave={() => setHoveredBlock(null)}>
                    <span>📋</span> Tiếp nhận & Kiểm đơn
                  </div>
                  <div style={{ ...styles.omsNavItem, ...(hoveredBlock === 'nav-s3' ? styles.elevatedBlockDark : {}) }} onMouseEnter={() => setHoveredBlock('nav-s3')} onMouseLeave={() => setHoveredBlock(null)}>
                    <span>📦</span> Kiểm kê Tồn kho
                  </div>
                </>
              )}

              {roleActive === 'admin' && (
                <>
                  <div style={{ ...styles.omsNavItem, ...styles.omsNavItemActive, ...(hoveredBlock === 'nav-a1' ? styles.elevatedBlockDark : {}) }} onMouseEnter={() => setHoveredBlock('nav-a1')} onMouseLeave={() => setHoveredBlock(null)}>
                    <span>📊</span> Tổng quan Quản trị
                  </div>
                  <div style={{ ...styles.omsNavItem, ...(hoveredBlock === 'nav-a2' ? styles.elevatedBlockDark : {}) }} onMouseEnter={() => setHoveredBlock('nav-a2')} onMouseLeave={() => setHoveredBlock(null)}>
                    <span>🏢</span> Quản lý Hệ thống Đại lý
                  </div>
                  <div style={{ ...styles.omsNavItem, ...(hoveredBlock === 'nav-a3' ? styles.elevatedBlockDark : {}) }} onMouseEnter={() => setHoveredBlock('nav-a3')} onMouseLeave={() => setHoveredBlock(null)}>
                    <span>💳</span> Duyệt Hạn mức Tín dụng
                  </div>
                  <div style={{ ...styles.omsNavItem, ...(hoveredBlock === 'nav-a4' ? styles.elevatedBlockDark : {}) }} onMouseEnter={() => setHoveredBlock('nav-a4')} onMouseLeave={() => setHoveredBlock(null)}>
                    <span>📈</span> Báo cáo Doanh thu & Kho
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={styles.omsSidebarFooter}>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Vai trò: <strong style={{ color: '#fff' }}>{roleActive.toUpperCase()}</strong>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                ...styles.omsLogoutBtn,
                ...(hoveredBlock === 'sidebar-logout' ? styles.elevatedBtnDarkRed : {}),
              }}
              onMouseEnter={() => setHoveredBlock('sidebar-logout')}
              onMouseLeave={() => setHoveredBlock(null)}
            >
              🚪 Đăng xuất tập trung
            </button>
          </div>
        </aside>

        <div style={styles.omsMainArea}>
          <header style={styles.omsHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={styles.omsLogoSquare}>O</div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>OMS Pro</h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Hệ thống Quản lý Bán hàng & Kho</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={styles.omsRoleSelectWrapper}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>🔍 Xem Giao Diện:</span>
                <select
                  value={roleActive}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  style={styles.omsRoleSelect}
                >
                  <option value="customer">Đại lý (Customer)</option>
                  <option value="staff">Nhân viên (Staff)</option>
                  <option value="admin">Quản trị (Admin)</option>
                </select>
              </div>

              <div
                onClick={() => setScreen('profile')}
                style={{
                  ...styles.omsUserAvatarPill,
                  ...(hoveredBlock === 'header-profile' ? styles.elevatedCardLight : {}),
                }}
                onMouseEnter={() => setHoveredBlock('header-profile')}
                onMouseLeave={() => setHoveredBlock(null)}
                title="Xem Hồ sơ cá nhân"
              >
                <div style={styles.omsAvatarIcon}>{(user?.username || roleActive).charAt(0).toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}>{user?.fullName || 'Demo Account'}</div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>{roleActive}</div>
                </div>
              </div>
            </div>
          </header>

          <div
            style={{
              ...styles.omsBanner,
              ...(hoveredBlock === 'oms-banner' ? styles.elevatedCard : {}),
            }}
            onMouseEnter={() => setHoveredBlock('oms-banner')}
            onMouseLeave={() => setHoveredBlock(null)}
          >
            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 'bold' }}>
                {roleActive === 'admin' ? "Bảng Điều Khiển Quản Trị Hệ Thống (ADMIN)" : roleActive === 'staff' ? "Phân Hệ Xử Lý Bán Hàng & Kho (STAFF)" : "Cổng Đặt Hàng Trực Tuyến Đại Lý (CUSTOMER)"}
              </h2>
              <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>
                {roleActive === 'admin' ? "Quản lý toàn bộ chi nhánh, hạn mức đại lý & kho hàng" : roleActive === 'staff' ? "Phân hệ kiểm duyệt đơn, kiểm kê kho & quầy POS" : user?.fullName || "Công ty TNHH Thương mại Tuấn Phương (Đại lý cấp 1)"}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '24px', textAlign: 'right' }}>
              {roleActive === 'customer' && (
                <>
                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8 }}>HẠN MỨC TÍN DỤNG</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>0 đ</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8 }}>KHẢ DỤNG CÒN LẠI</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#86efac' }}>0 đ</div>
                  </div>
                </>
              )}
              {roleActive === 'staff' && (
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8 }}>ĐƠN CHỜ XỬ LÝ</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fde047' }}>0 Đơn hàng</div>
                </div>
              )}
              {roleActive === 'admin' && (
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8 }}>TỔNG DOANH THU THÁNG</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#86efac' }}>0 đ</div>
                </div>
              )}
            </div>
          </div>

          <main style={styles.omsContentBody}>{children}</main>
        </div>
      </div>
    );
  };

  // =========================================================================
  // HAM RENDER NOI DUNG CHINH THEO SCREEN
  // =========================================================================
  const renderMainContent = () => {
    // 1. MAN HINH DASHBOARD
    if (screen === 'dashboard') {
      const roleActive = user?.role || currentRole;

      return (
        <OMSDashboardLayout>
          {roleActive === 'customer' && (
            <>
              <div style={styles.omsTabRow}>
                <button type="button" onClick={() => setActiveTab('main')} style={{ ...styles.omsTabBtn, ...(activeTab === 'main' ? styles.omsTabBtnActive : {}) }}>🛒 Đặt hàng trực tuyến</button>
                <button type="button" onClick={() => setActiveTab('history')} style={{ ...styles.omsTabBtn, ...(activeTab === 'history' ? styles.omsTabBtnActive : {}) }}>📜 Lịch sử đơn hàng của tôi ({orderHistory.length})</button>
              </div>

              {activeTab === 'main' ? (
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '3 1 500px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '16px' }}>
                    {MOCK_PRODUCTS.map((prod, idx) => (
                      <div key={prod.id} style={{ ...styles.omsProdCard, ...(hoveredBlock === `prod-${idx}` ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock(`prod-${idx}`)} onMouseLeave={() => setHoveredBlock(null)}>
                        <div style={styles.omsProdSku}>{prod.sku}</div>
                        <h4 style={styles.omsProdTitle}>{prod.name}</h4>
                        <p style={styles.omsProdPack}>{prod.pack}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px 0', fontSize: '12px' }}>
                          <span style={{ color: '#64748b' }}>ĐVT: <strong>{prod.unit}</strong></span>
                          <span style={styles.omsStatusBadge}>{prod.status}</span>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#2563eb', marginBottom: '12px' }}>{prod.price.toLocaleString('vi-VN')} đ</div>
                        <div style={styles.omsQtyBox}>
                          <button type="button" style={styles.omsQtyBtn}>-</button>
                          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>0</span>
                          <button type="button" style={{ ...styles.omsQtyBtn, backgroundColor: '#2563eb', color: '#fff' }}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ flex: '1 1 280px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', transition: 'all 0.3s ease', ...(hoveredBlock === 'cart-box' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('cart-box')} onMouseLeave={() => setHoveredBlock(null)}>
                    <h3 style={{ margin: '0 0 15px 0', fontSize: '15px', color: '#1e293b' }}>🛒 Giỏ Hàng Đại Lý</h3>
                    <p style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '30px 0' }}>Giỏ hàng của bạn đang trống.</p>
                    <button type="button" onClick={() => onSubmitOrder({ demo: 'cart_data' })} style={{ width: '100%', padding: '12px', marginTop: '15px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '25px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s ease', ...(hoveredBlock === 'btn-submit-cart' ? styles.elevatedBtnBlue : {}) }} onMouseEnter={() => setHoveredBlock('btn-submit-cart')} onMouseLeave={() => setHoveredBlock(null)}>GỬI ĐƠN HÀNG NGAY</button>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '40px 20px', textAlign: 'center', transition: 'all 0.3s ease', ...(hoveredBlock === 'hist-box' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('hist-box')} onMouseLeave={() => setHoveredBlock(null)}>
                  <div style={{ maxWidth: '400px', margin: '0 auto' }}>
                    <div style={{ fontSize: '48px', marginBottom: '10px' }}>📦</div>
                    <h3 style={{ color: '#1e293b', margin: '0 0 8px 0', fontSize: '16px' }}>Chưa Có Lịch Sử Đơn Hàng</h3>
                    <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Hiện tại chưa có dữ liệu đơn hàng. Backend sẽ cập nhật dữ liệu lịch sử đặt hàng vào đây.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {roleActive === 'staff' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
                <div style={{ ...styles.staffStatCard, ...(hoveredBlock === 's-stat-1' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('s-stat-1')} onMouseLeave={() => setHoveredBlock(null)}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Đơn hàng chờ kiểm duyệt</span>
                  <h3 style={{ margin: '5px 0', fontSize: '22px', color: '#d97706' }}>0 Đơn</h3>
                </div>
                <div style={{ ...styles.staffStatCard, ...(hoveredBlock === 's-stat-2' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('s-stat-2')} onMouseLeave={() => setHoveredBlock(null)}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Đơn đang đóng gói kho</span>
                  <h3 style={{ margin: '5px 0', fontSize: '22px', color: '#2563eb' }}>0 Đơn</h3>
                </div>
                <div style={{ ...styles.staffStatCard, ...(hoveredBlock === 's-stat-3' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('s-stat-3')} onMouseLeave={() => setHoveredBlock(null)}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Đã xuất kho hôm nay</span>
                  <h3 style={{ margin: '5px 0', fontSize: '22px', color: '#059669' }}>0 Đơn</h3>
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '30px 20px', textAlign: 'center', transition: 'all 0.3s ease', ...(hoveredBlock === 's-list-box' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('s-list-box')} onMouseLeave={() => setHoveredBlock(null)}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#1e293b' }}>📋 Danh Sách Đơn Hàng Cần Xử Lý (Nhân Viên)</h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>Hiện tại chưa có đơn hàng nào cần tiếp nhận hoặc xử lý.</p>
              </div>
            </div>
          )}

          {roleActive === 'admin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                <div style={{ ...styles.adminStatCard, ...(hoveredBlock === 'a-stat-1' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('a-stat-1')} onMouseLeave={() => setHoveredBlock(null)}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>TỔNG ĐẠI LÝ</span>
                  <h2 style={{ margin: '4px 0', color: '#1e293b' }}>0</h2>
                </div>
                <div style={{ ...styles.adminStatCard, ...(hoveredBlock === 'a-stat-2' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('a-stat-2')} onMouseLeave={() => setHoveredBlock(null)}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>ĐƠN HÀNG TOÀN HỆ THỐNG</span>
                  <h2 style={{ margin: '4px 0', color: '#2563eb' }}>0</h2>
                </div>
                <div style={{ ...styles.adminStatCard, ...(hoveredBlock === 'a-stat-3' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('a-stat-3')} onMouseLeave={() => setHoveredBlock(null)}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>DOANH THU THÁNG NÀY</span>
                  <h2 style={{ margin: '4px 0', color: '#059669' }}>0 đ</h2>
                </div>
                <div style={{ ...styles.adminStatCard, borderLeft: '4px solid #d97706', ...(hoveredBlock === 'a-stat-4' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('a-stat-4')} onMouseLeave={() => setHoveredBlock(null)}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>YÊU CẦU CẤP HẠN MỨC</span>
                  <h2 style={{ margin: '4px 0', color: '#d97706' }}>0 Yêu cầu</h2>
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '30px 20px', textAlign: 'center', transition: 'all 0.3s ease', ...(hoveredBlock === 'a-main-box' ? styles.elevatedCardLight : {}) }} onMouseEnter={() => setHoveredBlock('a-main-box')} onMouseLeave={() => setHoveredBlock(null)}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#1e293b' }}>👑 Trung Tâm Quản Lý & Điều Phối Hạn Mức Tín Dụng</h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>Khu vực hiển thị danh sách đại lý và yêu cầu điều chỉnh hạn mức. Đang đợi API Backend kết nối.</p>
              </div>
            </div>
          )}
        </OMSDashboardLayout>
      );
    }

    // 2. MAN HINH PROFILE
    if (screen === 'profile') {
      return (
        <div style={{ minHeight: '100vh', width: '100vw', backgroundColor: '#1C2758', padding: '40px 20px', fontFamily: 'Arial, sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '850px', width: '100%' }}>
            <button
              type="button"
              onClick={() => setScreen('dashboard')}
              style={{ marginBottom: '20px', padding: '8px 18px', borderRadius: '20px', border: 'none', backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ← Quay lại Dashboard
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              <div
                style={{
                  backgroundColor: '#ffffff',
                  padding: '25px',
                  borderRadius: '20px',
                  textAlign: 'center',
                  transition: 'all 0.3s ease',
                  ...(hoveredBlock === 'prof-left' ? styles.elevatedCardLight : {}),
                }}
                onMouseEnter={() => setHoveredBlock('prof-left')}
                onMouseLeave={() => setHoveredBlock(null)}
              >
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#2563eb', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 15px auto', fontWeight: 'bold' }}>
                  {(user?.username || 'D').charAt(0).toUpperCase()}
                </div>
                <h3>{user?.fullName || 'Demo User Account'}</h3>
                <p style={{ color: '#64748b' }}>@{user?.username || 'demouser'}</p>
                <div style={{ textAlign: 'left', borderTop: '1px solid #f1f5f9', paddingTop: '15px', fontSize: '12px', color: '#334155' }}>
                  <p>📧 <strong>Email:</strong> {user?.email || 'demo@quanlykho.vn'}</p>
                  <p>📱 <strong>SĐT:</strong> {user?.phone || '0912345678'}</p>
                  <p>🎭 <strong>Vai trò:</strong> {user?.role || 'customer'}</p>
                  <p>📅 <strong>Ngày tham gia:</strong> {user?.createdAt || '01/01/2026'}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    marginTop: '20px',
                    padding: '12px',
                    borderRadius: '25px',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    ...(hoveredBlock === 'prof-logout' ? styles.elevatedBtnDarkRed : {}),
                  }}
                  onMouseEnter={() => setHoveredBlock('prof-logout')}
                  onMouseLeave={() => setHoveredBlock(null)}
                >
                  🚪 ĐĂNG XUẤT TẬP TRUNG
                </button>
              </div>

              <div
                style={{
                  backgroundColor: '#ffffff',
                  padding: '25px',
                  borderRadius: '20px',
                  transition: 'all 0.3s ease',
                  ...(hoveredBlock === 'prof-right' ? styles.elevatedCardLight : {}),
                }}
                onMouseEnter={() => setHoveredBlock('prof-right')}
                onMouseLeave={() => setHoveredBlock(null)}
              >
                {!showForgotInProfile ? (
                  <div>
                    <h3 style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>🔒 Thay Đổi Mật Khẩu</h3>
                    <form onSubmit={(e) => { e.preventDefault(); onChangePassSubmit({}); }}>
                      <div style={{ position: 'relative', marginBottom: '12px' }}>
                        <input type={showProfCurrentPass ? "text" : "password"} placeholder="Mật khẩu hiện tại" style={styles.profileInput} />
                        <TogglePassBtn isVisible={showProfCurrentPass} onToggle={() => setShowProfCurrentPass(!showProfCurrentPass)} />
                      </div>
                      <div style={{ position: 'relative', marginBottom: '12px' }}>
                        <input type={showProfNewPass ? "text" : "password"} placeholder="Mật khẩu mới" style={styles.profileInput} />
                        <TogglePassBtn isVisible={showProfNewPass} onToggle={() => setShowProfNewPass(!showProfNewPass)} />
                      </div>
                      <div style={{ position: 'relative', marginBottom: '15px' }}>
                        <input type={showProfConfirmPass ? "text" : "password"} placeholder="Xác nhận mật khẩu mới" style={styles.profileInput} />
                        <TogglePassBtn isVisible={showProfConfirmPass} onToggle={() => setShowProfConfirmPass(!showProfConfirmPass)} />
                      </div>
                      <button
                        type="submit"
                        style={{
                          ...styles.actionBtn,
                          ...(hoveredBlock === 'btn-chgpass' ? styles.elevatedBtnNavy : {}),
                        }}
                        onMouseEnter={() => setHoveredBlock('btn-chgpass')}
                        onMouseLeave={() => setHoveredBlock(null)}
                      >
                        CẬP NHẬT MẬT KHẨU
                      </button>
                    </form>
                    <div style={{ textAlign: 'center', marginTop: '15px' }}>
                      <span onClick={() => { setShowForgotInProfile(true); setResetStep(1); }} style={{ fontSize: '12px', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>
                        Quên mật khẩu? Khôi phục qua OTP
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 style={{ color: '#ef4444', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>🔑 Khôi Phục Mật Khẩu qua OTP</h3>
                    {resetStep === 1 && (
                      <form onSubmit={(e) => { e.preventDefault(); setResetStep(2); }}>
                        <input type="text" placeholder="Email hoặc SĐT" style={styles.profileInput} />
                        <button type="submit" style={{ ...styles.actionBtn, backgroundColor: '#ef4444', marginTop: '12px' }}>GỬI MÃ OTP</button>
                      </form>
                    )}
                    {resetStep === 2 && (
                      <form onSubmit={(e) => { e.preventDefault(); setResetStep(3); }}>
                        <p style={{ fontSize: '12px' }}>Mã OTP mẫu: <strong>123456</strong></p>
                        <input type="text" placeholder="Mã OTP" style={{ ...styles.profileInput, textAlign: 'center', letterSpacing: '4px' }} />
                        <button type="submit" style={{ ...styles.actionBtn, backgroundColor: '#059669', marginTop: '12px' }}>XÁC NHẬN OTP</button>
                      </form>
                    )}
                    {resetStep === 3 && (
                      <form onSubmit={(e) => { e.preventDefault(); setShowForgotInProfile(false); }}>
                        <input type="password" placeholder="Mật khẩu mới" style={styles.profileInput} />
                        <button type="submit" style={{ ...styles.actionBtn, marginTop: '12px' }}>HOÀN TẤT ĐẶT MẬT KHẨU</button>
                      </form>
                    )}
                    <div style={{ textAlign: 'center', marginTop: '15px' }}>
                      <span onClick={() => setShowForgotInProfile(false)} style={{ fontSize: '12px', cursor: 'pointer' }}>← Quay lại</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 3. MAN HINH DANG NHAP / DANG KY / ABOUT / CONTACT (MÃ NGUỒN CŨ BAN ĐẦU)
    return (
      <div style={styles.outerContainerFullWidth}>
        <div style={styles.leftPanelFullWidth}>
          <div style={styles.brand}>
            <div style={styles.logoIcon}>
              <div style={styles.logoSquare1}></div>
              <div style={styles.logoSquare2}></div>
            </div>
            <div style={styles.brandText}>
              <strong>QUẢN LÝ KHO HÀNG</strong>
              <span>OMS PRO UI TEMPLATE</span>
            </div>
          </div>

          {/* FORM ĐĂNG NHẬP */}
          {screen === 'login' && (
            <form onSubmit={handleLoginSubmit} style={styles.formContainerResponsive}>
              <div style={styles.avatarCircle}>👤</div>
              <h3 style={styles.formTitle}>ĐĂNG NHẬP HỆ THỐNG</h3>

              <div
                style={{
                  ...styles.inputWrapper,
                  ...(hoveredBlock === 'inp-user' ? styles.elevatedInput3D : {}),
                }}
                onMouseEnter={() => setHoveredBlock('inp-user')}
                onMouseLeave={() => setHoveredBlock(null)}
              >
                <input type="text" placeholder="USERNAME" style={styles.input} />
              </div>

              <div
                style={{
                  ...styles.inputWrapper,
                  ...(hoveredBlock === 'inp-pass' ? styles.elevatedInput3D : {}),
                }}
                onMouseEnter={() => setHoveredBlock('inp-pass')}
                onMouseLeave={() => setHoveredBlock(null)}
              >
                <input type={showLoginPass ? "text" : "password"} placeholder="MẬT KHẨU" style={styles.inputWithEye} />
                <TogglePassBtn isVisible={showLoginPass} onToggle={() => setShowLoginPass(!showLoginPass)} />
              </div>

              <div style={styles.quickAccountContainer}>
                <button
                  type="submit"
                  style={{
                    ...styles.quickAccountCard,
                    ...(hoveredBlock === 'quick-demo' ? styles.elevatedBtnBlue : {}),
                  }}
                  onMouseEnter={() => setHoveredBlock('quick-demo')}
                  onMouseLeave={() => setHoveredBlock(null)}
                >
                  🚀 DÙNG TÀI KHOẢN MẪU & VÀO DASHBOARD
                </button>
              </div>

              <button
                type="submit"
                style={{
                  ...styles.actionBtn,
                  ...(hoveredBlock === 'btn-login' ? styles.elevatedBtnNavy : {}),
                }}
                onMouseEnter={() => setHoveredBlock('btn-login')}
                onMouseLeave={() => setHoveredBlock(null)}
              >
                ĐĂNG NHẬP
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '12px', marginTop: '8px' }}>
                <span onClick={() => setScreen('register')} style={styles.linkText}>+ Tạo tài khoản</span>
                <span onClick={() => setScreen('forgot')} style={styles.linkText}>Quên mật khẩu?</span>
              </div>
            </form>
          )}

          {/* FORM ĐĂNG KÝ */}
          {screen === 'register' && (
            <form onSubmit={handleRegisterSubmit} style={styles.formContainerResponsive}>
              <h3 style={styles.formTitle}>ĐĂNG KÝ TÀI KHOẢN MỚI</h3>

              <div style={{ ...styles.inputWrapper, ...(hoveredBlock === 'reg-fullname' ? styles.elevatedInput3D : {}) }} onMouseEnter={() => setHoveredBlock('reg-fullname')} onMouseLeave={() => setHoveredBlock(null)}>
                <input
                  type="text"
                  placeholder="HỌ VÀ TÊN"
                  value={regForm.fullName}
                  onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                  style={styles.inputSmall}
                />
              </div>

              <div style={{ ...styles.inputWrapper, ...(hoveredBlock === 'reg-username' ? styles.elevatedInput3D : {}) }} onMouseEnter={() => setHoveredBlock('reg-username')} onMouseLeave={() => setHoveredBlock(null)}>
                <input
                  type="text"
                  placeholder="USERNAME"
                  value={regForm.username}
                  onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                  style={styles.inputSmall}
                />
              </div>

              <div style={{ ...styles.inputWrapper, ...(hoveredBlock === 'reg-email' ? styles.elevatedInput3D : {}) }} onMouseEnter={() => setHoveredBlock('reg-email')} onMouseLeave={() => setHoveredBlock(null)}>
                <input
                  type="email"
                  placeholder="EMAIL CÁ NHÂN"
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                  style={styles.inputSmall}
                />
              </div>

              <div style={{ ...styles.inputWrapper, ...(hoveredBlock === 'reg-phone' ? styles.elevatedInput3D : {}) }} onMouseEnter={() => setHoveredBlock('reg-phone')} onMouseLeave={() => setHoveredBlock(null)}>
                <input
                  type="text"
                  placeholder="SỐ ĐIỆN THOẠI"
                  value={regForm.phone}
                  onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                  style={styles.inputSmall}
                />
              </div>

              <div style={{ ...styles.inputWrapper, ...(hoveredBlock === 'reg-pass' ? styles.elevatedInput3D : {}) }} onMouseEnter={() => setHoveredBlock('reg-pass')} onMouseLeave={() => setHoveredBlock(null)}>
                <input
                  type={showRegPass ? "text" : "password"}
                  placeholder="MẬT KHẨU"
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  style={styles.inputSmallWithEye}
                />
                <TogglePassBtn isVisible={showRegPass} onToggle={() => setShowRegPass(!showRegPass)} />
              </div>

              <div style={{ ...styles.inputWrapper, ...(hoveredBlock === 'reg-confirm-pass' ? styles.elevatedInput3D : {}) }} onMouseEnter={() => setHoveredBlock('reg-confirm-pass')} onMouseLeave={() => setHoveredBlock(null)}>
                <input
                  type={showRegConfirmPass ? "text" : "password"}
                  placeholder="XÁC NHẬN MẬT KHẨU"
                  value={regForm.confirmPassword}
                  onChange={(e) => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                  style={styles.inputSmallWithEye}
                />
                <TogglePassBtn isVisible={showRegConfirmPass} onToggle={() => setShowRegConfirmPass(!showRegConfirmPass)} />
              </div>

              <button
                type="submit"
                style={{
                  ...styles.actionBtn,
                  marginTop: '12px',
                  ...(hoveredBlock === 'btn-reg-submit' ? styles.elevatedBtnNavy : {}),
                }}
                onMouseEnter={() => setHoveredBlock('btn-reg-submit')}
                onMouseLeave={() => setHoveredBlock(null)}
              >
                TẠO TÀI KHOẢN
              </button>
              <span onClick={() => setScreen('login')} style={{ ...styles.linkText, marginTop: '10px' }}>← Đã có tài khoản? Đăng nhập</span>
            </form>
          )}

          {screen === 'forgot' && (
            <form onSubmit={(e) => { e.preventDefault(); setScreen('login'); }} style={styles.formContainerResponsive}>
              <h3 style={styles.formTitle}>KHÔI PHỤC MẬT KHẨU</h3>
              <input type="email" placeholder="ENTER YOUR EMAIL" style={styles.input} />
              <button type="submit" style={{ ...styles.actionBtn, marginTop: '12px' }}>SEND RESET LINK</button>
              <span onClick={() => setScreen('login')} style={{ ...styles.linkText, marginTop: '10px' }}>Quay lại Đăng nhập</span>
            </form>
          )}

          <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
            OMS Pro v1.0 • Pure UI Template
          </div>
        </div>

        {/* BÊN PHẢI GIAO DIỆN CỦ BAN ĐẦU */}
        <div style={styles.rightPanelFullWidth}>
          <div style={styles.navHeader}>
            <span
              onClick={() => setScreen(screen === 'about' ? 'login' : 'about')}
              style={{
                ...styles.navLink,
                ...(hoveredBlock === 'nav-about' ? styles.elevatedText : {}),
              }}
              onMouseEnter={() => setHoveredBlock('nav-about')}
              onMouseLeave={() => setHoveredBlock(null)}
            >
              ABOUT
            </span>
            <span
              onClick={() => setScreen(screen === 'contact' ? 'login' : 'contact')}
              style={{
                ...styles.navLink,
                ...(hoveredBlock === 'nav-contact' ? styles.elevatedText : {}),
              }}
              onMouseEnter={() => setHoveredBlock('nav-contact')}
              onMouseLeave={() => setHoveredBlock(null)}
            >
              CONTACT
            </span>

            <button
              type="button"
              onClick={() => setScreen('register')}
              style={{
                ...styles.signInPillBtn,
                ...(hoveredBlock === 'btn-signup-pill' ? styles.elevatedBtnPill : {}),
              }}
              onMouseEnter={() => setHoveredBlock('btn-signup-pill')}
              onMouseLeave={() => setHoveredBlock(null)}
            >
              SIGN UP
            </button>
          </div>

          <div style={styles.centerContainer}>
            {screen === 'about' ? (
              <div style={styles.glassCardCenter}>
                <div style={styles.sloganTagCenter}>SLOGAN</div>
                <h2 style={styles.sloganTitleCenter}>"Tối Ưu Vận Hành - Bứt Phá Doanh Thu"</h2>
                <p style={styles.welcomeDescCenter}>Hệ thống Quản lý Kho & Bán hàng OMS Pro chuẩn hóa quy trình xuất nhập kho.</p>
              </div>
            ) : screen === 'contact' ? (
              <div style={styles.glassCardCenter}>
                <div style={styles.sloganTagCenter}>THÔNG TIN NHÓM PHÁT TRIỂN</div>
                <h2 style={styles.sloganTitleCenter}>Nhóm TTCS-K13C4-N4</h2>
                <p style={styles.welcomeDescCenter}>Đồ án Thực tập cơ sở: Website Quản lý Kho & Bán hàng.</p>
              </div>
            ) : (
              <div
                style={{
                  ...styles.welcomeContentCenter,
                  ...(hoveredBlock === 'welcome-box' ? styles.elevatedCard : {}),
                }}
                onMouseEnter={() => setHoveredBlock('welcome-box')}
                onMouseLeave={() => setHoveredBlock(null)}
              >
                <h1 style={styles.welcomeTitleCenter}>Welcome.</h1>
                <p style={styles.welcomeDescCenter}>Hệ thống Quản lý Kho hàng & Bán hàng OMS Pro tối ưu cho doanh nghiệp.</p>

                <div style={styles.webImageMockupCenter}>
                  <div style={styles.mockupHeader}>
                    <span style={{ ...styles.mockupDot, backgroundColor: '#ff5f56' }}></span>
                    <span style={{ ...styles.mockupDot, backgroundColor: '#ffbd2e' }}></span>
                    <span style={{ ...styles.mockupDot, backgroundColor: '#27c93f' }}></span>
                    <span style={styles.mockupTitle}>Dashboard OMS Pro UI</span>
                  </div>
                  <div style={styles.mockupBody}>
                    <div style={styles.mockupBar}>📦 Tồn kho: 0 SP</div>
                    <div style={styles.mockupBar}>🛒 Đơn hàng hôm nay: 0</div>
                    <div style={styles.mockupBar}>💰 Doanh thu: 0đ</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // =========================================================================
  // MAIN RETURN WRAPPER
  // =========================================================================
  return (
    <>
      <NotificationModal />
      {renderMainContent()}
    </>
  );
}

// =========================================================================
// BỘ STYLES GIAO DIỆN CŨ VÀ NỔI KHỐI 3D SẮC NÉT
// =========================================================================
const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    backdropFilter: 'blur(5px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  modalBox: {
    width: '90%',
    maxWidth: '380px',
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    padding: '24px',
    textAlign: 'center',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
  },
  modalHeaderIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '26px',
    margin: '0 auto 12px auto',
  },
  modalBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '25px',
    color: '#ffffff',
    border: 'none',
    fontWeight: 'bold',
    fontSize: '13px',
    cursor: 'pointer',
    boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
  },

  omsContainer: { display: 'flex', width: '100vw', minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: "'Inter', sans-serif" },
  omsSidebar: { width: '240px', backgroundColor: '#0b132b', color: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px 15px', boxSizing: 'border-box', flexShrink: 0, zIndex: 10, boxShadow: '4px 0 20px rgba(0,0,0,0.25)' },
  omsSidebarHeader: { fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', color: '#64748b', marginBottom: '15px', paddingLeft: '10px' },
  omsNavList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  omsNavItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', fontSize: '13px', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.25s ease' },
  omsNavItemActive: { backgroundColor: '#2563eb', color: '#ffffff', fontWeight: 'bold', boxShadow: '0 6px 14px rgba(0, 0, 0, 0.4)' },
  omsSidebarFooter: { borderTop: '1px solid #1e293b', paddingTop: '15px' },
  omsLogoutBtn: { width: '100%', padding: '10px', marginTop: '12px', backgroundColor: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', transition: 'all 0.3s ease' },
  omsMainArea: { flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'hidden' },
  omsHeader: { height: '60px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 25px' },
  omsLogoSquare: { width: '32px', height: '32px', backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px' },
  omsRoleSelectWrapper: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f1f5f9', padding: '4px 12px', borderRadius: '20px', border: '1px solid #cbd5e1' },
  omsRoleSelect: { border: 'none', backgroundColor: 'transparent', fontWeight: 'bold', fontSize: '12px', color: '#1e293b', outline: 'none', cursor: 'pointer' },
  omsUserAvatarPill: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '4px 10px', borderRadius: '20px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', transition: 'all 0.3s ease' },
  omsAvatarIcon: { width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  omsBanner: { backgroundColor: '#2563eb', color: '#ffffff', padding: '20px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', margin: '15px 25px 0 25px', borderRadius: '16px', boxShadow: '0 8px 20px rgba(0, 0, 0, 0.2)', transition: 'all 0.3s ease' },
  omsContentBody: { padding: '25px', flex: 1 },
  omsTabRow: { display: 'flex', gap: '12px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' },
  omsTabBtn: { padding: '10px 16px', backgroundColor: 'transparent', border: 'none', borderBottom: '3px solid transparent', fontSize: '13px', fontWeight: '600', color: '#64748b', cursor: 'pointer' },
  omsTabBtnActive: { borderBottomColor: '#2563eb', color: '#2563eb' },
  omsProdCard: { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'all 0.3s ease' },
  omsProdSku: { fontSize: '10px', fontWeight: 'bold', color: '#64748b', fontFamily: 'monospace' },
  omsProdTitle: { margin: '6px 0', fontSize: '14px', color: '#0f172a', fontWeight: 'bold', lineHeight: '1.3' },
  omsProdPack: { margin: 0, fontSize: '11px', color: '#94a3b8' },
  omsStatusBadge: { backgroundColor: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold' },
  omsQtyBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderRadius: '8px', padding: '4px', border: '1px solid #e2e8f0' },
  omsQtyBtn: { width: '28px', height: '28px', border: 'none', backgroundColor: '#e2e8f0', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' },
  staffStatCard: { backgroundColor: '#ffffff', padding: '15px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.3s ease' },
  adminStatCard: { backgroundColor: '#ffffff', padding: '15px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.3s ease' },

  outerContainerFullWidth: { width: '100vw', minHeight: '100vh', display: 'flex', flexWrap: 'wrap', fontFamily: "'Inter', sans-serif", margin: 0, padding: 0, backgroundColor: '#ffffff', overflowX: 'hidden' },
  leftPanelFullWidth: { flex: '1 1 380px', padding: 'min(4vw, 40px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: '#ffffff', minHeight: '100vh', boxSizing: 'border-box' },
  rightPanelFullWidth: { flex: '2 1 450px', background: 'radial-gradient(circle at 80% 20%, #FBEFD5 0%, #3B72A4 45%, #182C61 90%)', padding: 'min(4vw, 40px)', display: 'flex', flexDirection: 'column', color: '#ffffff', minHeight: '100vh', boxSizing: 'border-box' },
  brand: { display: 'flex', alignItems: 'center', gap: '12px' },
  logoIcon: { position: 'relative', width: '28px', height: '28px' },
  logoSquare1: { position: 'absolute', width: '18px', height: '18px', backgroundColor: '#1E2A78', borderRadius: '4px', top: 0, left: 0 },
  logoSquare2: { position: 'absolute', width: '18px', height: '18px', border: '2px solid #1E2A78', borderRadius: '4px', bottom: 0, right: 0 },
  brandText: { display: 'flex', flexDirection: 'column', fontSize: '11px', color: '#1E2A78', textTransform: 'uppercase' },
  formContainerResponsive: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '380px', margin: '20px auto' },
  formTitle: { color: '#1E2A78', fontSize: '16px', margin: '0 0 6px 0', fontWeight: 'bold' },
  quickAccountContainer: { width: '100%', marginTop: '4px', marginBottom: '12px' },
  quickAccountCard: { width: '100%', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '20px', padding: '10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s ease' },
  avatarCircle: { width: '50px', height: '50px', borderRadius: '50%', border: '2px solid #1E2A78', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '10px', fontSize: '20px' },

  inputWrapper: { width: '100%', position: 'relative', marginBottom: '10px', borderRadius: '30px', transition: 'all 0.3s ease' },
  input: { width: '100%', padding: '12px 18px', borderRadius: '30px', border: '1.5px solid #1E2A78', outline: 'none', fontSize: '12px', boxSizing: 'border-box' },
  inputWithEye: { width: '100%', padding: '12px 46px 12px 18px', borderRadius: '30px', border: '1.5px solid #1E2A78', outline: 'none', fontSize: '12px', boxSizing: 'border-box' },
  inputSmall: { width: '100%', padding: '10px 18px', borderRadius: '30px', border: '1.5px solid #1E2A78', outline: 'none', fontSize: '12px', boxSizing: 'border-box' },
  inputSmallWithEye: { width: '100%', padding: '10px 46px 10px 18px', borderRadius: '30px', border: '1.5px solid #1E2A78', outline: 'none', fontSize: '12px', boxSizing: 'border-box' },
  profileInput: { width: '100%', padding: '12px 46px 12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', boxSizing: 'border-box' },
  eyeBtn: { position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' },
  actionBtn: { width: '100%', padding: '13px', borderRadius: '30px', backgroundColor: '#1E2A78', color: '#ffffff', border: 'none', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', transition: 'all 0.3s ease' },
  linkText: { cursor: 'pointer', color: '#1E2A78', fontWeight: '500', fontSize: '12px' },
  navHeader: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '24px', width: '100%' },
  navLink: { color: 'rgba(255, 255, 255, 0.85)', textDecoration: 'none', fontSize: '12px', letterSpacing: '1px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.3s ease' },
  signInPillBtn: { backgroundColor: '#182C61', color: '#ffffff', border: 'none', padding: '8px 24px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s ease' },
  centerContainer: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', margin: '20px 0' },
  glassCardCenter: { maxWidth: '460px', width: '100%', padding: '30px', borderRadius: '24px', backgroundColor: 'rgba(255, 255, 255, 0.12)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.2)', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)', textAlign: 'center' },
  welcomeContentCenter: { maxWidth: '480px', width: '100%', padding: '24px', borderRadius: '20px', textAlign: 'center', transition: 'all 0.3s ease' },
  welcomeTitleCenter: { fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: '800', margin: '0 0 8px 0', textAlign: 'center' },
  sloganTagCenter: { fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px', color: '#FBEFD5', marginBottom: '10px', textAlign: 'center' },
  sloganTitleCenter: { fontSize: '22px', fontWeight: '700', margin: '0 0 14px 0', color: '#ffffff', textAlign: 'center' },
  welcomeDescCenter: { fontSize: '13px', lineHeight: '1.6', opacity: 0.95, marginBottom: '16px', textAlign: 'center' },
  webImageMockupCenter: { backgroundColor: 'rgba(15, 23, 42, 0.8)', borderRadius: '12px', padding: '14px', border: '1px solid rgba(255, 255, 255, 0.15)', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', width: '100%', boxSizing: 'border-box', textAlign: 'left' },
  mockupHeader: { display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '8px', marginBottom: '10px' },
  mockupDot: { width: '9px', height: '9px', borderRadius: '50%' },
  mockupTitle: { fontSize: '11px', color: '#cbd5e1', marginLeft: '8px', fontWeight: '500' },
  mockupBody: { display: 'flex', flexDirection: 'column', gap: '6px' },
  mockupBar: { backgroundColor: 'rgba(255, 255, 255, 0.08)', padding: '7px 10px', borderRadius: '6px', fontSize: '12px', color: '#f8fafc' },

  elevatedInput3D: { transform: 'translateY(-3px)', boxShadow: '0 8px 18px rgba(0, 0, 0, 0.15)' },
  elevatedBtnNavy: { transform: 'translateY(-3px)', backgroundColor: '#16205e', boxShadow: '0 10px 22px rgba(0, 0, 0, 0.35)' },
  elevatedBtnBlue: { transform: 'translateY(-3px)', backgroundColor: '#1d4ed8', boxShadow: '0 10px 22px rgba(0, 0, 0, 0.35)' },
  elevatedBtnDarkRed: { transform: 'translateY(-3px)', backgroundColor: '#dc2626', boxShadow: '0 10px 20px rgba(0, 0, 0, 0.45)' },
  elevatedBlockDark: { transform: 'translateY(-3px)', backgroundColor: '#1e293b', boxShadow: '0 8px 18px rgba(0, 0, 0, 0.4)' },
  elevatedCardLight: { transform: 'translateY(-4px)', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.12)' },
  elevatedCard: { transform: 'translateY(-5px) scale(1.01)', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)' },
  elevatedBtnPill: { transform: 'translateY(-4px)', backgroundColor: '#0f1a3a', boxShadow: '0 10px 20px rgba(0, 0, 0, 0.4)' },
  elevatedText: { transform: 'translateY(-2px)', color: '#ffffff', textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)' },
};

export default App;