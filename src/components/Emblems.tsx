import React, { useEffect, useState } from 'react';
import { CLUB_LICENSE_REGISTRY, SEASON_BADGE_ARTWORK } from '../game/catalog';
import { SeasonCode } from '../game/types';

/**
 * Authentic EA SPORTS FC™ ONLINE Geometric Triangle Emblem
 * Features chamfered volt-lime (#a3e635) shell with angled F & C interior geometry.
 */
export const FcOnlineTriangleMark: React.FC<{ className?: string }> = ({
  className = 'w-8 h-7',
}) => {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `fcoTriVolt_${uid}`;
  return (
    <svg viewBox="0 0 64 56" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#D9F99D" />
          <stop offset="50%" stopColor="#A3E635" />
          <stop offset="100%" stopColor="#65A30D" />
        </linearGradient>
      </defs>
      {/* Outer Volt-Green Triangle Frame */}
      <polygon
        points="4,4 60,4 32,52"
        fill="#0A101C"
        stroke={`url(#${gradId})`}
        strokeWidth="4.2"
        strokeLinejoin="round"
      />
      {/* Stylized Geometric Angular 'F' (White) */}
      <polygon points="15,11 32,11 29.5,16.5 21,16.5 19.5,20 27,20 25,25 17.5,25 15.5,31.5 11.5,24.5" fill="#F8FAFC" />
      {/* Stylized Geometric Angular 'C' (Volt Green) */}
      <polygon points="34,11 50,11 45,17 37.5,17 34.5,24.5 39,31 43,31 39.5,37.5 31.5,33 29.5,24" fill={`url(#${gradId})`} />
    </svg>
  );
};

export const TitleCrestLockup: React.FC = () => (
  <div className="flex items-center gap-3.5 sm:gap-5 select-none">
    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gradient-to-br from-[#131d31] via-[#090e18] to-[#04070d] border-2 border-[#a3e635]/65 shadow-[0_10px_28px_rgba(163,230,53,0.28)] flex flex-col items-center justify-center shrink-0 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[#a3e635]/15 to-transparent pointer-events-none"
      />
      <FcOnlineTriangleMark className="w-11 h-10 sm:w-14 sm:h-12 drop-shadow-[0_2px_8px_rgba(163,230,53,0.45)]" />
      <span
        className="text-[9px] sm:text-[10px] font-black italic tracking-[0.22em] text-white leading-none -mt-0.5"
        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        ONLINE
      </span>
    </div>
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-[11px] sm:text-xs font-extrabold tracking-[0.18em] text-[#a3e635] uppercase">
        <span>EA SPORTS FC™</span>
        <span className="text-slate-500">·</span>
        <span className="text-amber-300 truncate">LE (135–140) · IPRM · 26VB · 165 CLB</span>
      </div>
      <h1
        className="text-4xl sm:text-6xl font-black italic tracking-tight text-white leading-[0.95] mt-0.5"
        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        FC ONLINE <span className="text-[#a3e635]">VN</span>
      </h1>
    </div>
  </div>
);

/**
 * Authentic FC Online Season Badge using official season icon PNGs (/seasons/*.png)
 * with resilient SVG fallback.
 */
export const SeasonBadgeSvg: React.FC<{
  season: SeasonCode;
  className?: string;
}> = ({ season, className = 'w-7 h-5' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [season]);

  const badgeUrl = SEASON_BADGE_ARTWORK[season];
  if (badgeUrl && !imgFailed) {
    return (
      <img
        src={badgeUrl}
        alt={`Mùa ${season}`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${className} object-contain select-none`}
      />
    );
  }

  switch (season) {
    case 'INFINITY_PRIME':
      return (
        <svg viewBox="0 0 62 32" className={className} aria-label="Mùa Infinite Prime">
          <path
            d="M3 10 L13 5 L31 2 L49 5 L59 10 L53 26 L31 30 L9 26 Z"
            fill="#991B1B"
            stroke="#FDE68A"
            strokeWidth="2"
          />
          <text
            x="31"
            y="21.5"
            textAnchor="middle"
            fill="#FFF3CA"
            fontSize="13"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            ∞ IP
          </text>
        </svg>
      );

    case 'LE':
      return (
        <svg viewBox="0 0 60 32" className={className} aria-label="Mùa Legendary Eternal">
          <path
            d="M4 9 L14 4 L30 2 L46 4 L56 9 L51 26 L30 30 L9 26 Z"
            fill="#451A03"
            stroke="#FBBF24"
            strokeWidth="2"
          />
          <text
            x="30"
            y="21"
            textAnchor="middle"
            fill="#FDE68A"
            fontSize="12.5"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            LE
          </text>
        </svg>
      );

    case '26UCL':
      return (
        <svg viewBox="0 0 62 32" className={className} aria-label="Mùa 26UCL">
          <path
            d="M6 4 H56 L60 16 L54 28 H8 L2 16 Z"
            fill="#082F49"
            stroke="#38BDF8"
            strokeWidth="2"
          />
          <text
            x="31"
            y="21"
            textAnchor="middle"
            fill="#E0F2FE"
            fontSize="11"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            26UCL
          </text>
        </svg>
      );

    case 'ICON_TM':
      return (
        <svg viewBox="0 0 56 32" className={className} aria-label="Mùa ICON The Moment">
          <path
            d="M4 10 L16 6 L28 2 L40 6 L52 10 L47 25 L28 30 L9 25 Z"
            fill="#D97706"
            stroke="#FEF3C7"
            strokeWidth="1.5"
          />
          <text
            x="28"
            y="21"
            textAnchor="middle"
            fill="#291503"
            fontSize="11.5"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            TM
          </text>
        </svg>
      );

    case '26TOTY':
      return (
        <svg viewBox="0 0 60 32" className={className} aria-label="Mùa 26TOTY">
          <path
            d="M6 5 H54 L58 16 L52 28 H8 L2 16 Z"
            fill="#1E3A8A"
            stroke="#FACC15"
            strokeWidth="2"
          />
          <text
            x="30"
            y="21"
            textAnchor="middle"
            fill="#FEF08A"
            fontSize="11.5"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            26TY
          </text>
        </svg>
      );

    case '26TOTS':
      return (
        <svg viewBox="0 0 60 32" className={className} aria-label="Mùa 26TOTS">
          <path
            d="M5 6 L30 2 L55 6 L52 27 L30 30 L8 27 Z"
            fill="#064E3B"
            stroke="#FBBF24"
            strokeWidth="2"
          />
          <text
            x="30"
            y="21"
            textAnchor="middle"
            fill="#A7F3D0"
            fontSize="11.5"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            26TS
          </text>
        </svg>
      );

    case '26VB':
      return (
        <svg viewBox="0 0 60 32" className={className} aria-label="Mùa 26 Vietnam Best">
          <path
            d="M5 6 L30 2 L55 6 L52 27 L30 30 L8 27 Z"
            fill="#991B1B"
            stroke="#FACC15"
            strokeWidth="2"
          />
          <text
            x="30"
            y="21"
            textAnchor="middle"
            fill="#FEF08A"
            fontSize="11.5"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            26VB
          </text>
        </svg>
      );

    case 'BDO':
      return (
        <svg viewBox="0 0 56 32" className={className} aria-label="Mùa Ballon d'Or">
          <rect
            x="3"
            y="4"
            width="50"
            height="24"
            rx="5"
            fill="#1C1917"
            stroke="#F59E0B"
            strokeWidth="2"
          />
          <circle cx="14" cy="16" r="6" fill="#FBBF24" />
          <text
            x="35"
            y="21"
            textAnchor="middle"
            fill="#FDE68A"
            fontSize="11.5"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            BDO
          </text>
        </svg>
      );

    case 'UP':
      return (
        <svg viewBox="0 0 58 32" className={className} aria-label="Mùa Unsung Players">
          <path
            d="M6 5 H52 L56 16 L50 28 H8 L2 16 Z"
            fill="#115E59"
            stroke="#5EEAD4"
            strokeWidth="2"
          />
          <text
            x="29"
            y="21"
            textAnchor="middle"
            fill="#CCFBF1"
            fontSize="12.5"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            UP
          </text>
        </svg>
      );

    case '25UCL':
      return (
        <svg viewBox="0 0 60 32" className={className} aria-label="Mùa 25UCL">
          <path
            d="M7 4 H53 L57 16 L51 28 H9 L3 16 Z"
            fill="#0F172A"
            stroke="#38BDF8"
            strokeWidth="2"
          />
          <text
            x="30"
            y="21"
            textAnchor="middle"
            fill="#E0F2FE"
            fontSize="11"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            25UCL
          </text>
        </svg>
      );

    case 'CU':
    default:
      return (
        <svg viewBox="0 0 52 32" className={className} aria-label="Mùa CU">
          <path
            d="M8 4 H44 L49 16 L43 28 H9 L3 16 Z"
            fill="#881337"
            stroke="#E2E8F0"
            strokeWidth="2"
          />
          <text
            x="26"
            y="21"
            textAnchor="middle"
            fill="#F8FAFC"
            fontSize="12"
            fontWeight="800"
            fontFamily="'Barlow Condensed', sans-serif"
          >
            CU
          </text>
        </svg>
      );
  }
};

export const NationFlagSvg: React.FC<{ code: string; className?: string }> = ({
  code,
  className = 'w-8 h-5',
}) => {
  switch (code) {
    case 'VN':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Việt Nam">
          <rect width="36" height="24" rx="2" fill="#DA251D" />
          <polygon
            points="18,4.6 19.75,10 25.4,10 20.85,13.3 22.6,18.7 18,15.35 13.4,18.7 15.15,13.3 10.6,10 16.25,10"
            fill="#FFFF00"
          />
        </svg>
      );
    case 'BR':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Brazil">
          <rect width="36" height="24" rx="2" fill="#15803D" />
          <polygon points="18,3 33,12 18,21 3,12" fill="#FACC15" />
          <circle cx="18" cy="12" r="5" fill="#1D4ED8" />
        </svg>
      );
    case 'FR':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Pháp">
          <rect width="12" height="24" fill="#1D4ED8" />
          <rect x="12" width="12" height="24" fill="#F8FAFC" />
          <rect x="24" width="12" height="24" fill="#DC2626" />
        </svg>
      );
    case 'AR':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Argentina">
          <rect width="36" height="8" fill="#38BDF8" />
          <rect y="8" width="36" height="8" fill="#F8FAFC" />
          <rect y="16" width="36" height="8" fill="#38BDF8" />
          <circle cx="18" cy="12" r="2.6" fill="#F59E0B" />
        </svg>
      );
    case 'PT':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Bồ Đào Nha">
          <rect width="14" height="24" fill="#15803D" />
          <rect x="14" width="22" height="24" fill="#DC2626" />
          <circle cx="14" cy="12" r="4.2" fill="#FACC15" />
        </svg>
      );
    case 'EN':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Anh">
          <rect width="36" height="24" fill="#F8FAFC" />
          <rect x="15" width="6" height="24" fill="#DC2626" />
          <rect y="9" width="36" height="6" fill="#DC2626" />
        </svg>
      );
    case 'NIR':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Bắc Ireland">
          <rect width="36" height="24" fill="#F8FAFC" />
          <rect x="15.5" width="5" height="24" fill="#DC2626" />
          <rect y="9.5" width="36" height="5" fill="#DC2626" />
          <polygon
            points="18,7.5 19.6,10.2 22.6,10.2 21.1,12 22.6,13.8 19.6,13.8 18,16.5 16.4,13.8 13.4,13.8 14.9,12 13.4,10.2 16.4,10.2"
            fill="#F8FAFC"
            stroke="#DC2626"
            strokeWidth="0.6"
          />
          <circle cx="18" cy="6.2" r="1.4" fill="#F59E0B" />
        </svg>
      );
    case 'NL':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Hà Lan">
          <rect width="36" height="8" fill="#DC2626" />
          <rect y="8" width="36" height="8" fill="#F8FAFC" />
          <rect y="16" width="36" height="8" fill="#1D4ED8" />
        </svg>
      );
    case 'IT':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Ý">
          <rect width="12" height="24" fill="#16A34A" />
          <rect x="12" width="12" height="24" fill="#F8FAFC" />
          <rect x="24" width="12" height="24" fill="#DC2626" />
        </svg>
      );
    case 'DE':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Đức">
          <rect width="36" height="8" fill="#111827" />
          <rect y="8" width="36" height="8" fill="#DC2626" />
          <rect y="16" width="36" height="8" fill="#FACC15" />
        </svg>
      );
    case 'ES':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Tây Ban Nha">
          <rect width="36" height="6" fill="#DC2626" />
          <rect y="6" width="36" height="12" fill="#FACC15" />
          <rect y="18" width="36" height="6" fill="#DC2626" />
        </svg>
      );
    case 'BE':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Bỉ">
          <rect width="12" height="24" fill="#111827" />
          <rect x="12" width="12" height="24" fill="#FACC15" />
          <rect x="24" width="12" height="24" fill="#DC2626" />
        </svg>
      );
    case 'NO':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Na Uy">
          <rect width="36" height="24" fill="#DC2626" />
          <rect x="10" width="6" height="24" fill="#F8FAFC" />
          <rect y="9" width="36" height="6" fill="#F8FAFC" />
          <rect x="11.5" width="3" height="24" fill="#1D4ED8" />
          <rect y="10.5" width="36" height="3" fill="#1D4ED8" />
        </svg>
      );
    case 'KR':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Hàn Quốc">
          <rect width="36" height="24" fill="#F8FAFC" />
          <circle cx="18" cy="12" r="5.5" fill="#DC2626" />
          <path d="M12.5 12 A5.5 5.5 0 0 0 23.5 12 Z" fill="#1D4ED8" />
        </svg>
      );
    case 'UA':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Ukraina">
          <rect width="36" height="12" fill="#2563EB" />
          <rect y="12" width="36" height="12" fill="#FACC15" />
        </svg>
      );
    case 'EG':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Ai Cập">
          <rect width="36" height="8" fill="#DC2626" />
          <rect y="8" width="36" height="8" fill="#F8FAFC" />
          <rect y="16" width="36" height="8" fill="#111827" />
          <circle cx="18" cy="12" r="2.2" fill="#D97706" />
        </svg>
      );
    case 'UY':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Uruguay">
          <rect width="36" height="24" fill="#F8FAFC" />
          <rect y="4" width="36" height="3" fill="#2563EB" />
          <rect y="10" width="36" height="3" fill="#2563EB" />
          <rect y="16" width="36" height="3" fill="#2563EB" />
          <rect width="13" height="11" fill="#F8FAFC" />
          <circle cx="6.5" cy="5.5" r="3" fill="#F59E0B" />
        </svg>
      );
    case 'HR':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Croatia">
          <rect width="36" height="8" fill="#DC2626" />
          <rect y="8" width="36" height="8" fill="#F8FAFC" />
          <rect y="16" width="36" height="8" fill="#1D4ED8" />
          <rect x="15" y="7" width="6" height="8" rx="1" fill="#DC2626" stroke="#F8FAFC" strokeWidth="1" />
        </svg>
      );
    case 'MA':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Ma-rốc">
          <rect width="36" height="24" fill="#B91C1C" />
          <polygon
            points="18,6 20,13 26,13 21,16.5 23,22 18,18.5 13,22 15,16.5 10,13 16,13"
            fill="none"
            stroke="#15803D"
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'WL':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Xứ Wales">
          <rect width="36" height="12" fill="#F8FAFC" />
          <rect y="12" width="36" height="12" fill="#15803D" />
          <path d="M9 15 L14 8 L22 9 L27 6 L25 14 L28 18 L12 18 Z" fill="#DC2626" />
        </svg>
      );
    case 'CM':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Cameroon">
          <rect width="12" height="24" fill="#15803D" />
          <rect x="12" width="12" height="24" fill="#DC2626" />
          <rect x="24" width="12" height="24" fill="#FACC15" />
          <circle cx="18" cy="12" r="2.6" fill="#FACC15" />
        </svg>
      );
    case 'CI':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Bờ Biển Ngà">
          <rect width="12" height="24" fill="#F97316" />
          <rect x="12" width="12" height="24" fill="#F8FAFC" />
          <rect x="24" width="12" height="24" fill="#16A34A" />
        </svg>
      );
    case 'SE':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Thụy Điển">
          <rect width="36" height="24" fill="#0284C7" />
          <rect x="10" width="5" height="24" fill="#FACC15" />
          <rect y="9.5" width="36" height="5" fill="#FACC15" />
        </svg>
      );
    case 'CZ':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Cộng Hòa Séc">
          <rect width="36" height="12" fill="#F8FAFC" />
          <rect y="12" width="36" height="12" fill="#DC2626" />
          <polygon points="0,0 18,12 0,24" fill="#1D4ED8" />
        </svg>
      );
    case 'PL':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Ba Lan">
          <rect width="36" height="12" fill="#F8FAFC" />
          <rect y="12" width="36" height="12" fill="#DC2626" />
        </svg>
      );
    case 'GE':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Gruzia">
          <rect width="36" height="24" fill="#F8FAFC" />
          <rect x="15.5" width="5" height="24" fill="#DC2626" />
          <rect y="9.5" width="36" height="5" fill="#DC2626" />
          <circle cx="8" cy="5" r="1.8" fill="#DC2626" />
          <circle cx="28" cy="5" r="1.8" fill="#DC2626" />
          <circle cx="8" cy="19" r="1.8" fill="#DC2626" />
          <circle cx="28" cy="19" r="1.8" fill="#DC2626" />
        </svg>
      );
    case 'DZ':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Algérie">
          <rect width="18" height="24" fill="#15803D" />
          <rect x="18" width="18" height="24" fill="#F8FAFC" />
          <circle cx="18" cy="12" r="5" fill="#DC2626" />
          <circle cx="19.5" cy="12" r="4" fill="#F8FAFC" />
        </svg>
      );
    case 'EC':
    case 'CO':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label={code === 'EC' ? 'Ecuador' : 'Colombia'}>
          <rect width="36" height="12" fill="#FACC15" />
          <rect y="12" width="36" height="6" fill="#1D4ED8" />
          <rect y="18" width="36" height="6" fill="#DC2626" />
        </svg>
      );
    case 'AT':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Áo">
          <rect width="36" height="8" fill="#DC2626" />
          <rect y="8" width="36" height="8" fill="#F8FAFC" />
          <rect y="16" width="36" height="8" fill="#DC2626" />
        </svg>
      );
    case 'CA':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Canada">
          <rect width="9" height="24" fill="#DC2626" />
          <rect x="9" width="18" height="24" fill="#F8FAFC" />
          <rect x="27" width="9" height="24" fill="#DC2626" />
          <polygon points="18,6 21,12 24,11 21,16 15,16 12,11 15,12" fill="#DC2626" />
        </svg>
      );
    case 'TR':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Thổ Nhĩ Kỳ">
          <rect width="36" height="24" fill="#DC2626" />
          <circle cx="15" cy="12" r="5.5" fill="#F8FAFC" />
          <circle cx="16.8" cy="12" r="4.4" fill="#DC2626" />
          <circle cx="22.5" cy="12" r="1.8" fill="#F8FAFC" />
        </svg>
      );
    case 'NG':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Nigeria">
          <rect width="12" height="24" fill="#15803D" />
          <rect x="12" width="12" height="24" fill="#F8FAFC" />
          <rect x="24" width="12" height="24" fill="#15803D" />
        </svg>
      );
    case 'DK':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Đan Mạch">
          <rect width="36" height="24" fill="#DC2626" />
          <rect x="10" width="4" height="24" fill="#F8FAFC" />
          <rect y="10" width="36" height="4" fill="#F8FAFC" />
        </svg>
      );
    case 'CH':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Thụy Sĩ">
          <rect width="36" height="24" fill="#DC2626" />
          <rect x="15" y="5" width="6" height="14" fill="#F8FAFC" />
          <rect x="11" y="9" width="14" height="6" fill="#F8FAFC" />
        </svg>
      );
    case 'HU':
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label="Hungary">
          <rect width="36" height="8" fill="#CE2939" />
          <rect y="8" width="36" height="8" fill="#F8FAFC" />
          <rect y="16" width="36" height="8" fill="#477050" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 36 24" className={className} aria-label={code}>
          <rect width="36" height="24" rx="2" fill="#1E293B" stroke="#94A3B8" strokeWidth="1.5" />
          <text
            x="18"
            y="15.5"
            textAnchor="middle"
            fill="#F8FAFC"
            fontSize="10"
            fontWeight="700"
            fontFamily="sans-serif"
          >
            {code}
          </text>
        </svg>
      );
  }
};

export const ClubCrestSvg: React.FC<{ clubCode: string; className?: string }> = ({
  clubCode,
  className = 'w-8 h-9',
}) => {
  const [logoFailed, setLogoFailed] = useState(false);
  const rawUid = React.useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    setLogoFailed(false);
  }, [clubCode]);

  const clubInfo = CLUB_LICENSE_REGISTRY[clubCode];

  if (clubCode === 'ICONS') {
    const outerGoldId = `fcoIconsOuterGold_${rawUid}`;
    const ivoryBgId = `fcoIconsIvory_${rawUid}`;
    return (
      <svg
        viewBox="0 0 64 72"
        className={`${className} drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)] select-none`}
        aria-label={clubInfo?.officialName ?? 'FC Online ICONs'}
      >
        <defs>
          <linearGradient id={outerGoldId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEF9C3" />
            <stop offset="35%" stopColor="#FACC15" />
            <stop offset="70%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>
          <linearGradient id={ivoryBgId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#292116" />
            <stop offset="55%" stopColor="#1C150D" />
            <stop offset="100%" stopColor="#3B2812" />
          </linearGradient>
        </defs>
        {/* Outer Crowned Shield */}
        <path
          d="M32 3 L58 13 V37 C58 53 47 64 32 69 C17 64 6 53 6 37 V13 Z"
          fill={`url(#${ivoryBgId})`}
          stroke={`url(#${outerGoldId})`}
          strokeWidth="3.8"
        />
        <path
          d="M32 8 L53 16.5 V36.5 C53 49.5 43.8 58.8 32 63.2 C20.2 58.8 11 49.5 11 36.5 V16.5 Z"
          fill="none"
          stroke="#FDE68A"
          strokeOpacity="0.6"
          strokeWidth="1.3"
        />
        {/* Top Championship Star */}
        <polygon
          points="32,10.5 34.1,15 39,15.6 35.4,18.9 36.4,23.7 32,21.3 27.6,23.7 28.6,18.9 25,15.6 29.9,15"
          fill="#FDE047"
        />
        {/* Twin Golden Laurel Wreaths */}
        <path
          d="M21 43 C15.5 38 15 28 20.5 21.5"
          fill="none"
          stroke={`url(#${outerGoldId})`}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M43 43 C48.5 38 49 28 43.5 21.5"
          fill="none"
          stroke={`url(#${outerGoldId})`}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        {/* Classic Golden Football Globe */}
        <circle
          cx="32"
          cy="32.5"
          r="9.2"
          fill={`url(#${outerGoldId})`}
          stroke="#FEF9C3"
          strokeWidth="1.1"
        />
        <path
          d="M24 30.5 Q32 26.5 40 30.5 M24.5 35.5 Q32 39 39.5 35.5 M32 23.5 V41.5"
          fill="none"
          stroke="#451A03"
          strokeWidth="1.3"
        />
        {/* Bottom ICONS Plaque */}
        <rect
          x="12"
          y="45.5"
          width="40"
          height="12"
          rx="3"
          fill={`url(#${outerGoldId})`}
        />
        <text
          x="32"
          y="54.3"
          textAnchor="middle"
          fill="#1C1308"
          fontSize="10.2"
          fontWeight="900"
          letterSpacing="0.6"
          fontFamily="'Barlow Condensed', sans-serif"
        >
          ICONS
        </text>
      </svg>
    );
  }

  if (clubInfo?.logoUrl && !logoFailed) {
    return (
      <img
        src={clubInfo.logoUrl}
        alt={clubInfo.officialName}
        referrerPolicy="no-referrer"
        onError={() => setLogoFailed(true)}
        className={`${className} object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] select-none`}
      />
    );
  }

  const bg = clubInfo?.primaryHex ?? '#1E293B';
  const border = clubInfo?.borderHex ?? '#94A3B8';
  const text = clubInfo?.textHex ?? '#F8FAFC';
  const short = clubInfo?.shortCode ?? clubCode.slice(0, 3).toUpperCase();

  return (
    <svg viewBox="0 0 40 46" className={className} aria-label={clubInfo?.officialName ?? clubCode}>
      <path
        d="M20 2 L37 9 V24 C37 34 29 41 20 44 C11 41 3 34 3 24 V9 Z"
        fill={bg}
        stroke={border}
        strokeWidth="3"
      />
      <text
        x="20"
        y="27"
        textAnchor="middle"
        fill={text}
        fontSize="11"
        fontWeight="800"
        fontFamily="'Barlow Condensed', sans-serif"
      >
        {short}
      </text>
    </svg>
  );
};
