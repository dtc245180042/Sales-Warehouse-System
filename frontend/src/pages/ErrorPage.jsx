import React from 'react';

export default function ErrorPage({
  statusCode = 404,
  title = 'Không Tìm Thấy Trang Yêu Cầu',
  message = 'Trang bạn đang truy cập không tồn tại hoặc đã được di chuyển sang địa chỉ khác.',
  onAction,
  actionLabel = 'Quay lại Bảng điều khiển',
}) {
  return (
    <div
      className="card"
      style={{
        textAlign: 'center',
        padding: '60px 24px',
        maxWidth: '680px',
        margin: '40px auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          backgroundColor: statusCode === 403 ? '#fee2e2' : '#f1f5f9',
          color: statusCode === 403 ? '#dc2626' : '#64748b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          fontWeight: 800,
        }}
      >
        {statusCode === 403 ? '🚫' : '⚠️'}
      </div>

      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: statusCode === 403 ? '#dc2626' : '#64748b', letterSpacing: '1px' }}>
          MÃ LỖI {statusCode}
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>{title}</h2>
        <p style={{ color: '#64748b', fontSize: '14px', marginTop: '8px', lineHeight: 1.6, maxWidth: '520px' }}>
          {message}
        </p>
      </div>

      {onAction && (
        <div style={{ marginTop: '12px' }}>
          <button type="button" className="btn btn-primary" onClick={onAction}>
            ← {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
