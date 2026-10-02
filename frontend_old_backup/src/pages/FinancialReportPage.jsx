import React, { useState, useEffect } from 'react';
import { authApi } from '../api/client';
import { useAuth } from '../context';
import ErrorPage from './ErrorPage';

export default function FinancialReportPage({ onNavigateDashboard }) {
  const { user } = useAuth();
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function fetchFinancialReport() {
      setLoading(true);
      setErrorStatus(null);
      setErrorMessage('');

      try {
        const res = await authApi.getFinancialCostAndMargin();
        if (res && res.data) {
          setReportData(res.data);
        }
      } catch (err) {
        setErrorStatus(err.status || 403);
        setErrorMessage(
          err.message || 'Bạn không có quyền truy cập dữ liệu giá vốn và biên lợi nhuận.'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchFinancialReport();
  }, []);

  // Nếu bị từ chối quyền (403 Forbidden)
  if (errorStatus === 403) {
    return (
      <ErrorPage
        statusCode={403}
        title="Không Đủ Quyền Truy Cập Dữ Liệu Giá Vốn"
        message="Theo quy định bảo mật dữ liệu, thông tin giá vốn và biên lợi nhuận chỉ được cấp phép hiển thị riêng cho vai trò Quản lý kinh doanh (Sales Manager) và Quản trị viên (Admin). Tài khoản của bạn không được phép xem thông tin này."
        onAction={onNavigateDashboard}
        actionLabel="Quay lại Trang chủ của bạn"
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
            Báo Cáo Giá Vốn & Biên Lợi Nhuận
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
            Dữ liệu bảo mật cấp phòng ban - Chỉ hiển thị cho Quản lý Kinh doanh & Quản trị viên
          </p>
        </div>

        <div className="badge badge-sales-manager" style={{ padding: '6px 14px', fontSize: '13px' }}>
          🔒 Quyền hạn: {user?.role}
        </div>
      </div>

      <div className="alert alert-info" style={{ fontSize: '13px' }}>
        ℹ️ <strong>Nguyên tắc kiểm soát an ninh:</strong> Dữ liệu giá vốn nhập hàng được bảo vệ nghiêm ngặt ở
        tầng máy chủ. Toàn bộ các vai trò khác (Thủ kho, Nhân viên kinh doanh, Khách hàng, Kế toán) đều mặc
        định bị từ chối truy cập.
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Mã SKU Sản Phẩm</th>
                <th style={{ textAlign: 'right' }}>Giá Vốn Nhập Kho (VNĐ)</th>
                <th style={{ textAlign: 'right' }}>Giá Bán Sỉ Đại Lý (VNĐ)</th>
                <th style={{ textAlign: 'right' }}>Lợi Nhuận Đơn Vị (VNĐ)</th>
                <th style={{ textAlign: 'center' }}>Biên Lợi Nhuận (%)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    Đang nạp dữ liệu tài chính bảo mật...
                  </td>
                </tr>
              ) : reportData.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    Không có bản ghi dữ liệu nào.
                  </td>
                </tr>
              ) : (
                reportData.map((item, index) => {
                  const profit = item.selling_price - item.cost_price;
                  return (
                    <tr key={item.product_sku}>
                      <td style={{ color: '#64748b' }}>{index + 1}</td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{item.product_sku}</td>
                      <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                        {item.cost_price.toLocaleString('vi-VN')} đ
                      </td>
                      <td style={{ textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                        {item.selling_price.toLocaleString('vi-VN')} đ
                      </td>
                      <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>
                        +{profit.toLocaleString('vi-VN')} đ
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-active" style={{ fontSize: '13px' }}>
                          {item.profit_margin}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
