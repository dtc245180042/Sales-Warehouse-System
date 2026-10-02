import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  layout?: 'horizontal' | 'vertical';
}

export const LogoIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 48,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 500 500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      <defs>
        {/* Soft realistic drop shadow for the 3D circular plate */}
        <filter id="sws-plate-shadow" x="15" y="15" width="470" height="470" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#0f172a" floodOpacity="0.18" />
        </filter>

        {/* Shadow for Arrow */}
        <filter id="sws-arrow-shadow" x="100" y="30" width="350" height="300" filterUnits="userSpaceOnUse">
          <feDropShadow dx="2" dy="6" stdDeviation="6" floodColor="#000000" floodOpacity="0.25" />
        </filter>

        {/* 3D Golden Orange Arrow Gradient */}
        <linearGradient id="sws-gold-arrow" x1="160" y1="280" x2="420" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#d97706" />
          <stop offset="35%" stopColor="#f59e0b" />
          <stop offset="70%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#fef08a" />
        </linearGradient>

        {/* 3D Arrow Dark Bevel */}
        <linearGradient id="sws-gold-bevel" x1="160" y1="280" x2="420" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="60%" stopColor="#b45309" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>

        {/* Circular Light Emblem Plate Gradient (Clean light wall aesthetic) */}
        <linearGradient id="sws-plate-bg" x1="50" y1="30" x2="450" y2="470" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>

        {/* Deep Slate Navy Gradient */}
        <linearGradient id="sws-navy-stroke" x1="100" y1="50" x2="400" y2="450" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="60%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#090d16" />
        </linearGradient>
      </defs>

      {/* BASE PLATE: Clean light circular badge with subtle rim so it pops on BOTH dark & light modes */}
      <circle
        cx="250"
        cy="250"
        r="230"
        fill="url(#sws-plate-bg)"
        stroke="#cbd5e1"
        strokeWidth="3"
        filter="url(#sws-plate-shadow)"
      />

      {/* Subtle interior rim accent */}
      <circle
        cx="250"
        cy="250"
        r="222"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeOpacity="0.8"
      />

      {/* 1. SOLID INNER CIRCULAR RING (Dark Navy) - Completely seamless with no breaks */}
      <circle
        cx="250"
        cy="250"
        r="182"
        fill="none"
        stroke="url(#sws-navy-stroke)"
        strokeWidth="14"
      />

      {/* 2. CENTRAL WAREHOUSE SILHOUETTE */}
      <g>
        {/* Layer 1: Outer Gable Roof & Truss (Deep Charcoal Navy) */}
        <path
          d="M 135 240 L 250 145 L 365 240 L 348 240 L 250 160 L 152 240 Z"
          fill="#1e293b"
        />

        {/* Layer 2: Main Building Body (Navy Blue #0f172a) */}
        <path
          d="M 152 240 L 250 160 L 348 240 L 348 340 L 152 340 Z"
          fill="#0f172a"
        />

        {/* Layer 3: Stepped Roof / Warehouse Annex structures on Left */}
        <path
          d="M 130 250 L 152 232 L 152 340 L 130 340 Z"
          fill="#1e293b"
        />
        <line x1="141" y1="260" x2="141" y2="330" stroke="#334155" strokeWidth="3" strokeLinecap="round" />

        {/* Layer 4: Warehouse Inner Gable / Entrance Facade */}
        <path
          d="M 180 260 L 250 205 L 320 260 L 320 340 L 180 340 Z"
          fill="#1e293b"
        />

        {/* Layer 5: Entrance Canopy Apex Roof */}
        <polygon points="175,260 250,200 325,260 315,268 250,215 185,268" fill="#0f172a" />

        {/* 4 Crisp White Vertical Bay Door Columns (Slits) */}
        <g fill="#ffffff">
          <rect x="202" y="278" width="14" height="62" rx="3" />
          <rect x="226" y="278" width="14" height="62" rx="3" />
          <rect x="250" y="278" width="14" height="62" rx="3" />
          <rect x="274" y="278" width="14" height="62" rx="3" />
        </g>

        {/* Door Base Threshold Bar */}
        <rect x="180" y="337" width="140" height="5" fill="#0f172a" />
      </g>

      {/* 3. TECH GEAR (Right Side Roof) */}
      <g transform="translate(315, 175)">
        <circle cx="20" cy="20" r="16" fill="none" stroke="#f59e0b" strokeWidth="6" />
        <path
          d="M20 0 v8 M20 32 v8 M0 20 h8 M32 20 h8 M6 6 l6 6 M28 28 l6 6 M6 34 l6 -6 M28 12 l6 -6"
          stroke="#f59e0b"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="20" cy="20" r="6" fill="#f59e0b" />
        {/* Gear tech connecting node */}
        <circle cx="0" cy="35" r="4" fill="#0f172a" />
        <line x1="6" y1="28" x2="0" y2="35" stroke="#0f172a" strokeWidth="2.5" />
      </g>

      {/* 4. BARCODE EMBLEM (Lower Right Bay) */}
      <g transform="translate(305, 290)">
        <rect x="0" y="0" width="45" height="28" rx="4" fill="#ffffff" stroke="#0f172a" strokeWidth="2.5" />
        <line x1="7" y1="5" x2="7" y2="23" stroke="#0f172a" strokeWidth="3" />
        <line x1="13" y1="5" x2="13" y2="23" stroke="#0f172a" strokeWidth="1.5" />
        <line x1="18" y1="5" x2="18" y2="23" stroke="#0f172a" strokeWidth="4" />
        <line x1="25" y1="5" x2="25" y2="23" stroke="#0f172a" strokeWidth="2" />
        <line x1="30" y1="5" x2="30" y2="23" stroke="#0f172a" strokeWidth="1" />
        <line x1="35" y1="5" x2="35" y2="23" stroke="#0f172a" strokeWidth="3" />
      </g>

      {/* 5. 3D GOLDEN-ORANGE GROWTH ARROW (Cutting across up to top-right) */}
      <g filter="url(#sws-arrow-shadow)">
        {/* Dark Lower Bevel Edge (for 3D effect) */}
        <path
          d="M 155 308 L 225 248 L 275 278 L 398 96 L 410 108 L 280 294 L 225 264 L 163 318 Z"
          fill="url(#sws-gold-bevel)"
        />
        {/* Main Golden Orange Shaft */}
        <path
          d="M 160 300 L 228 240 L 276 270 L 392 90"
          fill="none"
          stroke="url(#sws-gold-arrow)"
          strokeWidth="20"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Arrowhead Base/Body */}
        <polygon
          points="350,85 425,70 410,145 385,115"
          fill="url(#sws-gold-arrow)"
        />
        {/* Arrowhead 3D Highlight Tip */}
        <polygon
          points="350,85 425,70 385,115"
          fill="#fef08a"
          fillOpacity="0.4"
        />
      </g>
    </svg>
  );
};

export const Logo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
  layout = 'horizontal',
}) => {
  const iconSizes = {
    sm: 36,
    md: 46,
    lg: 72,
    xl: 130,
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm font-extrabold',
    lg: 'text-lg sm:text-xl font-black',
    xl: 'text-xl sm:text-2xl font-black',
  };

  const subtextSizes = {
    sm: 'text-[9px]',
    md: 'text-[10px] font-bold',
    lg: 'text-xs font-bold',
    xl: 'text-xs sm:text-sm font-bold',
  };

  if (layout === 'vertical') {
    return (
      <div className={`flex flex-col items-center text-center select-none ${className}`}>
        {/* Circular Emblem with soft glow shadow */}
        <div className="relative mb-4 group transition-transform duration-300 hover:scale-105">
          <LogoIcon size={iconSizes[size]} />
        </div>

        {showText && (
          <div className="flex flex-col items-center">
            {/* Vietnamese Title */}
            <h1
              className={`tracking-wider uppercase text-slate-900 dark:text-white drop-shadow-sm ${textSizes[size]}`}
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Hệ Thống Kho Vận & Bán Hàng
            </h1>
            {/* Subtitle tag */}
            <span
              className={`uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400 mt-1 ${subtextSizes[size]}`}
            >
              Quản Lý Kho Hàng & POS Chuyên Nghiệp
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      <LogoIcon size={iconSizes[size]} />
      {showText && (
        <div className="flex flex-col leading-tight">
          <span
            className={`tracking-tight uppercase text-slate-900 dark:text-white ${textSizes[size]}`}
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Kho Vận & Bán Hàng
          </span>
          <span
            className={`uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400 ${subtextSizes[size]}`}
          >
            Hệ Thống Quản Lý
          </span>
        </div>
      )}
    </div>
  );
};
