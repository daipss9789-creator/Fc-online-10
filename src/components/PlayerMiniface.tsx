import React, { useEffect, useId, useState } from 'react';
import { PlayerMinifaceSpec } from '../game/types';

interface PlayerMinifaceProps {
  imageUrl?: string;
  altImageUrl?: string;
  auraColor?: string;
  phaseDelaySec?: number;
  forcedPose?: 'auto' | 1 | 2;
  alt?: string;
  spec: PlayerMinifaceSpec;
  jerseyNumber: number;
  className?: string;
  elevatedShadow?: boolean;
}

/**
 * Renders the authentic background-free (RGBA transparent PNG) FC Online player
 * half-body action cutout miniface proportioned to sit cleanly inside the card's
 * upper portrait chamber with a smooth waist fade into the horizontal nameplate.
 */
export const PlayerMiniface: React.FC<PlayerMinifaceProps> = ({
  imageUrl,
  altImageUrl,
  phaseDelaySec = 0,
  forcedPose = 'auto',
  alt = 'Cầu thủ FC Online',
  spec,
  jerseyNumber,
  className = 'w-24 h-24',
  elevatedShadow = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [altImgFailed, setAltImgFailed] = useState(false);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    setImgFailed(false);
    setAltImgFailed(false);
  }, [imageUrl, altImageUrl]);

  const maskId = `mfMask_${uid}`;
  const kitClipId = `mfKit_${uid}`;
  const skinGradId = `mfSkin_${uid}`;

  const hasDualAnimated = Boolean(
    imageUrl && altImageUrl && !imgFailed && !altImgFailed
  );

  if (hasDualAnimated && imageUrl && altImageUrl) {
    const delayStyle =
      forcedPose === 'auto' && phaseDelaySec > 0
        ? { animationDelay: `-${phaseDelaySec.toFixed(2)}s` }
        : undefined;

    return (
      <div
        data-testid="dual-animated-miniface"
        className={`relative select-none pointer-events-none flex items-end justify-center overflow-hidden ${className}`}
        style={{
          WebkitMaskImage:
            'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 86%, rgba(0,0,0,0) 100%)',
          maskImage:
            'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 86%, rgba(0,0,0,0) 100%)',
        }}
      >
        <img
          data-pose="1"
          src={imageUrl}
          alt={`${alt} - Miniface 1`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          style={delayStyle}
          className={`absolute inset-0 w-full h-full object-contain object-bottom ${
            elevatedShadow ? 'drop-shadow-[0_4px_9px_rgba(0,0,0,0.65)]' : ''
          } transition-all duration-300 ${
            forcedPose === 'auto'
              ? 'iprm-pose-primary'
              : forcedPose === 1
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-95'
          }`}
        />
        <img
          data-pose="2"
          src={altImageUrl}
          alt={`${alt} - Miniface 2`}
          referrerPolicy="no-referrer"
          onError={() => setAltImgFailed(true)}
          style={delayStyle}
          className={`absolute inset-0 w-full h-full object-contain object-bottom ${
            elevatedShadow ? 'drop-shadow-[0_4px_10px_rgba(180,83,9,0.45)]' : ''
          } transition-all duration-300 ${
            forcedPose === 'auto'
              ? 'iprm-pose-alt'
              : forcedPose === 2
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-95'
          }`}
        />
      </div>
    );
  }

  const effectiveSingleUrl =
    !imgFailed && imageUrl ? imageUrl : !altImgFailed && altImageUrl ? altImageUrl : undefined;

  if (effectiveSingleUrl) {
    return (
      <div
        data-testid="action-pose-miniface"
        className={`relative select-none pointer-events-none flex items-end justify-center overflow-hidden ${className}`}
        style={{
          WebkitMaskImage:
            'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 86%, rgba(0,0,0,0) 100%)',
          maskImage:
            'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 86%, rgba(0,0,0,0) 100%)',
        }}
      >
        <img
          src={effectiveSingleUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => {
            if (effectiveSingleUrl === imageUrl) setImgFailed(true);
            else setAltImgFailed(true);
          }}
          className={`relative z-10 w-full h-full object-contain object-bottom ${
            elevatedShadow ? 'drop-shadow-[0_4px_9px_rgba(0,0,0,0.72)]' : ''
          }`}
        />
      </div>
    );
  }

  return (
    <svg viewBox="0 0 120 128" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={skinGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={spec.skinHex} />
          <stop offset="100%" stopColor="#3B2314" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={`${maskId}_grad`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="80%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <mask id={maskId}>
          <rect x="0" y="0" width="120" height="128" fill={`url(#${maskId}_grad)`} />
        </mask>
        <clipPath id={kitClipId}>
          <path d="M16 126 C18 86 33 70 60 70 C87 70 102 86 104 126 Z" />
        </clipPath>
      </defs>
      <g mask={`url(#${maskId})`}>
        <g clipPath={`url(#${kitClipId})`}>
          <rect x="14" y="68" width="92" height="60" fill={spec.kitPrimary} />
          {spec.kitPattern === 'stripes' && (
            <g fill={spec.kitSecondary}>
              <rect x="28" y="68" width="11" height="60" />
              <rect x="54" y="68" width="12" height="60" />
              <rect x="81" y="68" width="11" height="60" />
            </g>
          )}
          {spec.kitPattern === 'halves' && (
            <rect x="60" y="68" width="46" height="60" fill={spec.kitSecondary} />
          )}
        </g>
        <rect x="51" y="55" width="18" height="20" rx="6" fill={spec.skinHex} />
        <ellipse cx="60" cy="40" rx="20" ry="23" fill={spec.skinHex} />
        <path
          d="M40 32 C41 16 79 16 80 32 C73 24 47 24 40 32 Z"
          fill={spec.hairHex}
        />
        <text
          x="45"
          y="108"
          textAnchor="middle"
          fill={spec.kitTrim}
          fontFamily="'Barlow Condensed', sans-serif"
          fontWeight="800"
          fontSize="18"
        >
          {jerseyNumber}
        </text>
      </g>
    </svg>
  );
};
