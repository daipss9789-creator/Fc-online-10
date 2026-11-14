import React, { useState } from 'react';
import { PACK_CATALOG } from '../game/catalog';
import { PackId } from '../game/types';
import { SeasonBadgeSvg } from './Emblems';

interface PackArtworkProps {
  packId: PackId;
  quantity?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const PackArtwork: React.FC<PackArtworkProps> = ({
  packId,
  quantity,
  size = 'md',
}) => {
  const pack = PACK_CATALOG[packId];
  const [imgFailed, setImgFailed] = useState(false);

  const sizeClasses = {
    sm: 'w-28 h-36',
    md: 'w-40 h-56',
    lg: 'w-56 h-76',
  }[size];

  return (
    <div
      className={`relative rounded-xl overflow-hidden select-none shrink-0 ${sizeClasses}`}
      style={{
        border: `2px solid ${pack.accentHex}`,
        boxShadow: `0 16px 36px rgba(0,0,0,0.65), 0 0 22px ${pack.accentHex}33`,
        background: `radial-gradient(circle at 50% 42%, ${pack.accentHex}52 0%, #0f172a 64%, #050811 100%)`,
      }}
    >
      {!imgFailed ? (
        <img
          src={pack.imageUrl}
          alt={pack.name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-contain scale-[1.24] drop-shadow-[0_10px_18px_rgba(0,0,0,0.85)]"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 50% 35%, ${pack.accentHex}55, #090d16 78%)`,
          }}
        >
          <svg viewBox="0 0 64 64" className="w-16 h-16 opacity-80" aria-hidden="true">
            <polygon
              points="32,6 56,18 56,46 32,58 8,46 8,18"
              fill="none"
              stroke={pack.accentHex}
              strokeWidth="3"
            />
          </svg>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/55" />

      {/* Top Season Emblem Bar */}
      <div className="relative z-10 p-2.5 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <SeasonBadgeSvg season={pack.seasonCode} className="w-8 h-5 drop-shadow" />
        </div>

        {typeof quantity === 'number' && (
          <span className="px-2 py-0.5 rounded bg-slate-950/90 border border-white/20 text-xs font-bold text-amber-300 tabular-nums">
            x{quantity}
          </span>
        )}
      </div>

      {/* Center Metallic Crest Accent */}
      <div className="relative z-10 mt-3 flex flex-col items-center px-2 text-center">
        <span
          className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider shadow"
          style={{
            backgroundColor: pack.accentHex,
            color: '#090D16',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {pack.seasonBadge}
        </span>
      </div>

      {/* Bottom Pack Title & OVR Floor */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-3 text-left">
        <div
          className="text-[11px] font-semibold tracking-wider tabular-nums"
          style={{ color: pack.secondaryHex }}
        >
          OVR {pack.minOvr}–{pack.maxOvr}
        </div>
        <div
          className="text-base font-bold leading-tight text-white mt-0.5 line-clamp-2"
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          {pack.name}
        </div>
      </div>
    </div>
  );
};
