import React from 'react';

export default function Toast({ message, type = 'info', onClose }) {
  if (!message) return null;

  const bgColors = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    warning: 'bg-amber-600 text-white',
    info: 'bg-slate-800 text-white',
  };

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        maxWidth: '420px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 18px',
        borderRadius: '8px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
        backgroundColor: type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : type === 'warning' ? '#d97706' : '#1e293b',
        color: '#ffffff',
        fontSize: '14px',
        animation: 'slideIn 0.25s ease-out',
      }}
    >
      <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{icons[type] || 'ℹ'}</span>
      <div style={{ flex: 1, lineHeight: 1.4 }}>{message}</div>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.8)',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '2px',
          }}
          title="Đóng thông báo"
        >
          ✕
        </button>
      )}
    </div>
  );
}
