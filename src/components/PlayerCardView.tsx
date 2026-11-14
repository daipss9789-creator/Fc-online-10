import React, { useEffect, useState } from 'react';
import { PLAYER_TEMPLATE_MAP, SEASON_CARD_ARTWORK } from '../game/catalog';
import { formatBpCompact, formatCardSerial, isSerializedSeason } from '../game/rules';
import { OwnedCard, PositionCode, SeasonCode } from '../game/types';
import { ClubCrestSvg, NationFlagSvg, SeasonBadgeSvg } from './Emblems';
import { PlayerMiniface } from './PlayerMiniface';
import { TraitBadges } from './TraitBadges';

interface PlayerCardViewProps {
  card: OwnedCard;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  selected?: boolean;
  onClick?: () => void;
  showValue?: boolean;
  showStats?: boolean;
  badgeNote?: string;
  forcedPose?: 'auto' | 1 | 2;
  customMinifaceUrlOverride?: string | null;
  bonusOvr?: number;
}

interface SeasonCardTheme {
  fallbackGradient: string;
  border: string;
  accentText: string;
  lightUpperChamber: boolean;
  lightLowerBanner: boolean;
  nameColor: string;
  metaColor: string;
  lowerScrim?: string;
}

const SEASON_STYLES: Record<SeasonCode, SeasonCardTheme> = {
  INFINITY_PRIME: {
    fallbackGradient: 'linear-gradient(175deg, #FBF3E4 0%, #E7D2B0 68%, #991B1B 74%, #5C0505 100%)',
    border: '#F59E0B',
    accentText: '#FDE68A',
    lightUpperChamber: true,
    lightLowerBanner: false,
    nameColor: '#FFF3CA',
    metaColor: '#FEF3C7',
    lowerScrim:
      'linear-gradient(180deg, rgba(20,4,4,0) 73%, rgba(36,6,6,0.44) 81%, rgba(20,4,4,0.66) 100%)',
  },
  LE: {
    fallbackGradient: 'linear-gradient(175deg, #291D0E 0%, #78350F 66%, #FEF3C7 73%, #FDE68A 100%)',
    border: '#F59E0B',
    accentText: '#FDE68A',
    lightUpperChamber: false,
    lightLowerBanner: true,
    nameColor: '#1C1917',
    metaColor: '#292524',
  },
  '26UCL': {
    fallbackGradient: 'linear-gradient(155deg, #082F49 0%, #1D4ED8 52%, #050914 100%)',
    border: '#38BDF8',
    accentText: '#7DD3FC',
    lightUpperChamber: false,
    lightLowerBanner: false,
    nameColor: '#FFFFFF',
    metaColor: '#E0F2FE',
    lowerScrim:
      'linear-gradient(180deg, rgba(3,8,23,0) 64%, rgba(3,8,23,0.48) 76%, rgba(3,8,23,0.72) 100%)',
  },
  ICON_TM: {
    fallbackGradient: 'linear-gradient(175deg, #FAF8F2 0%, #E6DEC8 68%, #EFECE4 100%)',
    border: '#D97706',
    accentText: '#FDE68A',
    lightUpperChamber: true,
    lightLowerBanner: true,
    nameColor: '#1C1917',
    metaColor: '#292524',
  },
  '26TOTY': {
    fallbackGradient: 'linear-gradient(155deg, #1E3A8A 0%, #1D4ED8 48%, #090D16 100%)',
    border: '#FACC15',
    accentText: '#FEF08A',
    lightUpperChamber: false,
    lightLowerBanner: false,
    nameColor: '#FEF9C3',
    metaColor: '#E2E8F0',
    lowerScrim:
      'linear-gradient(180deg, rgba(5,9,20,0) 64%, rgba(5,9,20,0.48) 76%, rgba(5,9,20,0.72) 100%)',
  },
  '26TOTS': {
    fallbackGradient: 'linear-gradient(155deg, #064E3B 0%, #047857 48%, #090D16 100%)',
    border: '#34D399',
    accentText: '#A7F3D0',
    lightUpperChamber: false,
    lightLowerBanner: false,
    nameColor: '#FFFFFF',
    metaColor: '#D1FAE5',
    lowerScrim:
      'linear-gradient(180deg, rgba(4,12,18,0) 64%, rgba(4,12,18,0.48) 76%, rgba(4,12,18,0.72) 100%)',
  },
  '26VB': {
    fallbackGradient: 'linear-gradient(175deg, #991B1B 0%, #7F1D1D 68%, #F8FAFC 72%, #E2E8F0 100%)',
    border: '#EF4444',
    accentText: '#FDE047',
    lightUpperChamber: false,
    lightLowerBanner: true,
    nameColor: '#111827',
    metaColor: '#1E293B',
  },
  BDO: {
    fallbackGradient: 'linear-gradient(155deg, #713F12 0%, #A16207 48%, #0F172A 100%)',
    border: '#F59E0B',
    accentText: '#FDE68A',
    lightUpperChamber: false,
    lightLowerBanner: false,
    nameColor: '#FEF3C7',
    metaColor: '#FDE68A',
    lowerScrim:
      'linear-gradient(180deg, rgba(9,7,5,0) 64%, rgba(9,7,5,0.48) 76%, rgba(9,7,5,0.74) 100%)',
  },
  UP: {
    fallbackGradient: 'linear-gradient(175deg, #0F293A 0%, #115E59 66%, #ECFDF5 73%, #CCFBF1 100%)',
    border: '#2DD4BF',
    accentText: '#5EEAD4',
    lightUpperChamber: false,
    lightLowerBanner: true,
    nameColor: '#111827',
    metaColor: '#1E293B',
  },
  '25UCL': {
    fallbackGradient: 'linear-gradient(155deg, #0C4A6E 0%, #1E293B 50%, #090D16 100%)',
    border: '#38BDF8',
    accentText: '#BAE6FD',
    lightUpperChamber: false,
    lightLowerBanner: false,
    nameColor: '#FFFFFF',
    metaColor: '#E0F2FE',
    lowerScrim:
      'linear-gradient(180deg, rgba(4,8,20,0) 64%, rgba(4,8,20,0.48) 76%, rgba(4,8,20,0.72) 100%)',
  },
  CU: {
    fallbackGradient: 'linear-gradient(155deg, #312E81 0%, #4338CA 48%, #090D16 100%)',
    border: '#818CF8',
    accentText: '#C7D2FE',
    lightUpperChamber: false,
    lightLowerBanner: false,
    nameColor: '#FFFFFF',
    metaColor: '#E0E7FF',
    lowerScrim:
      'linear-gradient(180deg, rgba(8,8,26,0) 64%, rgba(8,8,26,0.52) 76%, rgba(8,8,26,0.78) 100%)',
  },
};

export function getPositionColorHex(pos: PositionCode, onLightBg: boolean = false): string {
  if (pos === 'ST' || pos === 'CF' || pos === 'LW' || pos === 'RW') {
    return onLightBg ? '#BE123C' : '#FB3758';
  }
  if (pos === 'CAM' || pos === 'CM' || pos === 'CDM') {
    return onLightBg ? '#047857' : '#18E06F';
  }
  if (pos === 'GK') {
    return onLightBg ? '#B45309' : '#FFB800';
  }
  return onLightBg ? '#1D4ED8' : '#2E90FA';
}

/**
 * Authentic FC Online Enhancement Grade Badges (+1 through +13):
 * +1: Slate · +2~+4: Bronze · +5~+7: Silver · +8~+10: Gold · +11~+13: Prismatic Diamond
 */
export function getGradeBadgeStyle(grade: number): {
  bg: string;
  text: string;
  border: string;
  shadow?: string;
} {
  if (grade >= 11) {
    return {
      bg: 'linear-gradient(135deg, #FFD6E8 0%, #FEF08A 28%, #FFFFFF 52%, #7DD3FC 78%, #38BDF8 100%)',
      text: '#0F172A',
      border: '#E0F2FE',
      shadow: '0 0 10px rgba(125,211,252,0.55)',
    };
  }
  if (grade >= 8) {
    return {
      bg: 'linear-gradient(135deg, #FEF9C3 0%, #FACC15 48%, #CA8A04 100%)',
      text: '#18181B',
      border: '#FEF08A',
      shadow: '0 0 8px rgba(250,204,21,0.45)',
    };
  }
  if (grade >= 5) {
    return {
      bg: 'linear-gradient(135deg, #F8FAFC 0%, #CBD5E1 52%, #64748B 100%)',
      text: '#0F172A',
      border: '#F1F5F9',
    };
  }
  if (grade >= 2) {
    return {
      bg: 'linear-gradient(135deg, #FED7AA 0%, #D97706 52%, #9A3412 100%)',
      text: '#1C1917',
      border: '#FDBA74',
    };
  }
  return {
    bg: 'linear-gradient(135deg, #475569 0%, #1E293B 100%)',
    text: '#F8FAFC',
    border: '#94A3B8',
  };
}

function getStatValueColor(val: number): string {
  if (val >= 135) return 'text-sky-300';
  if (val >= 128) return 'text-amber-300';
  if (val >= 120) return 'text-emerald-300';
  return 'text-slate-200';
}

export const PlayerCardView: React.FC<PlayerCardViewProps> = ({
  card,
  size = 'md',
  selected = false,
  onClick,
  showValue = true,
  showStats = false,
  badgeNote,
  forcedPose = 'auto',
  customMinifaceUrlOverride,
  bonusOvr = 0,
}) => {
  const [artFailed, setArtFailed] = useState(false);
  const tpl = PLAYER_TEMPLATE_MAP[card.templateId];

  useEffect(() => {
    setArtFailed(false);
  }, [tpl?.season]);

  if (!tpl) return null;

  const theme = SEASON_STYLES[tpl.season];
  const gradeStyle = getGradeBadgeStyle(card.grade);
  const posColor =
    tpl.season === '26VB' &&
    (tpl.position === 'ST' ||
      tpl.position === 'CF' ||
      tpl.position === 'LW' ||
      tpl.position === 'RW')
      ? '#FDE047'
      : getPositionColorHex(tpl.position, theme.lightUpperChamber);
  const effectiveBonusOvr = Math.max(0, Math.round(bonusOvr));
  const displayOvr = card.ovr + effectiveBonusOvr;
  const statBoost = card.ovr - tpl.baseOvr + effectiveBonusOvr;
  const artworkUrl = SEASON_CARD_ARTWORK[tpl.season];
  const isGk = tpl.position === 'GK';
  const phaseDelaySec = ((tpl.jerseyNumber * 3 + card.grade) % 6) * 0.72;

  const activeCustomMiniface =
    customMinifaceUrlOverride === null
      ? undefined
      : customMinifaceUrlOverride ?? card.customMinifaceUrl;
  const effectivePrimaryMiniface = activeCustomMiniface ?? tpl.minifaceUrl;
  const effectiveAltMiniface = activeCustomMiniface ? undefined : tpl.altMinifaceUrl;
  const formattedSerial = isSerializedSeason(tpl.season)
    ? formatCardSerial(card.serialNumber)
    : '';

  // Exact 5:8 (210x336) FC Online shield body dimensions so the 340x400 PNG frame
  // fills 100% of the card slot while protruding 3D wings extend cleanly outside.
  const shieldDims = {
    sm: 'w-[120px] h-[192px]',
    md: 'w-[165px] h-[264px]',
    lg: 'w-[210px] h-[336px]',
    xl: 'w-[255px] h-[408px]',
  }[size];

  const outerWidth = {
    sm: 'w-[120px]',
    md: 'w-[165px]',
    lg: 'w-[210px]',
    xl: 'w-[255px]',
  }[size];

  const isHeroCard = size === 'lg' || size === 'xl';

  // Further enlarged FC Online PC cutout miniface scale (~82–83% of shield width)
  // framed heroically inside the upper chamber above the 75% nameplate banner
  const minifaceDims = {
    sm: 'w-[98px] h-[98px]',
    md: 'w-[136px] h-[136px]',
    lg: 'w-[174px] h-[174px]',
    xl: 'w-[212px] h-[212px]',
  }[size];

  const ovrFont = {
    sm: 'text-[22px]',
    md: 'text-[30px]',
    lg: 'text-[37px]',
    xl: 'text-[45px]',
  }[size];

  const posFont = {
    sm: 'text-[11px]',
    md: 'text-[13px]',
    lg: 'text-[15px]',
    xl: 'text-[18px]',
  }[size];

  const statItems = [
    { label: isGk ? 'ĐỔ' : 'TĐ', val: tpl.stats.pac + statBoost },
    { label: isGk ? 'BẮT' : 'SÚT', val: tpl.stats.sho + statBoost },
    { label: isGk ? 'PHÁT' : 'CHY', val: tpl.stats.pas + statBoost },
    { label: isGk ? 'PHẢN' : 'RÊ', val: tpl.stats.dri + statBoost },
    { label: isGk ? 'TĐ' : 'THỦ', val: tpl.stats.def + statBoost },
    { label: isGk ? 'VTRÍ' : 'THỂ', val: tpl.stats.phy + statBoost },
  ];

  const ovrTextStyle: React.CSSProperties = theme.lightUpperChamber
    ? {
        fontFamily: "'Barlow Condensed', sans-serif",
        color: '#141414',
        textShadow: '0 1px 2px rgba(255,255,255,0.92), 0 0 6px rgba(255,255,255,0.7)',
      }
    : {
        fontFamily: "'Barlow Condensed', sans-serif",
        color: '#FFFFFF',
        textShadow: '0 2px 5px rgba(0,0,0,0.95)',
      };

  const posTextStyle: React.CSSProperties = theme.lightUpperChamber
    ? {
        fontFamily: "'Barlow Condensed', sans-serif",
        color: posColor,
        textShadow: '0 1px 1px rgba(255,255,255,0.9)',
      }
    : {
        fontFamily: "'Barlow Condensed', sans-serif",
        color: posColor,
        textShadow: '0 1px 4px rgba(0,0,0,0.95)',
      };

  const nameTextStyle: React.CSSProperties = theme.lightLowerBanner
    ? {
        fontFamily: "'Barlow Condensed', sans-serif",
        color: theme.nameColor,
        textShadow: '0 1px 1px rgba(255,255,255,0.85)',
      }
    : {
        fontFamily: "'Barlow Condensed', sans-serif",
        color: theme.nameColor,
        textShadow: '0 1px 2px rgba(0,0,0,0.98), 0 0 6px rgba(0,0,0,0.88)',
      };

  const hasFooterPanel =
    (showValue && size !== 'sm') || (showStats && (size === 'lg' || size === 'xl'));

  const InnerContent = (
    <div
      data-season={tpl.season}
      className={`relative flex flex-col items-center select-none transition-transform duration-150 ${outerWidth} ${
        selected ? '-translate-y-1' : ''
      } ${onClick ? 'cursor-pointer hover:-translate-y-1' : ''}`}
    >
      {/* 5:8 Authentic FC Online Shield Stage */}
      <div
        className={`relative ${shieldDims} rounded-xl ${
          selected
            ? 'ring-2 ring-amber-400 shadow-[0_14px_30px_rgba(245,158,11,0.42)]'
            : ''
        }`}
        style={
          artFailed
            ? {
                background: theme.fallbackGradient,
                border: `2px solid ${selected ? '#FBBF24' : theme.border}`,
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.65)',
              }
            : undefined
        }
      >
        {/* Full-Scale 340x400 Transparent PNG Mapped 1:1 onto 210x336 Shield Body */}
        {!artFailed && (
          <img
            src={artworkUrl}
            alt={`Mùa ${tpl.seasonLabel}`}
            referrerPolicy="no-referrer"
            onError={() => setArtFailed(true)}
            style={{
              width: '161.9%',
              height: '119.05%',
              left: '-30.95%',
              top: '-9.52%',
              maxWidth: 'none',
            }}
            className={`absolute pointer-events-none select-none ${
              isHeroCard ? 'drop-shadow-[0_12px_20px_rgba(0,0,0,0.78)]' : ''
            }`}
          />
        )}

        {/* Measured Lower-Banner Contrast Scrim (preserves 100% of upper chamber artwork) */}
        <div
          className="absolute inset-x-[4.5%] inset-y-[3.5%] rounded-[12px] overflow-hidden pointer-events-none"
          style={theme.lowerScrim ? { background: theme.lowerScrim } : undefined}
        >
          {isHeroCard &&
            (tpl.season === 'INFINITY_PRIME' ||
              tpl.season === 'ICON_TM' ||
              tpl.season === 'LE') &&
            effectiveAltMiniface &&
            forcedPose === 'auto' && (
              <div
                aria-hidden="true"
                className="absolute inset-y-0 w-1/2 iprm-holo-sweep pointer-events-none"
                style={{
                  animationDelay: `-${phaseDelaySec.toFixed(2)}s`,
                  background:
                    'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(254,240,138,0.22) 45%, rgba(255,255,255,0.34) 55%, rgba(255,255,255,0) 100%)',
                }}
              />
            )}
        </div>

        {badgeNote && (
          <div className="absolute -top-2 right-1.5 z-30 px-2 py-0.5 text-[10px] font-bold rounded bg-amber-400 text-slate-950 shadow whitespace-nowrap">
            {badgeNote}
          </div>
        )}

        {/* TOP-LEFT RAIL: OVR, Position, Nationality Flag, Official Club Crest */}
        <div className="absolute z-20 left-[8.5%] top-[8.5%] flex flex-col items-center leading-none">
          <div className="relative flex items-start">
            <span
              className={`font-extrabold tabular-nums tracking-tight ${ovrFont}`}
              style={
                effectiveBonusOvr > 0 && !theme.lightUpperChamber
                  ? { ...ovrTextStyle, color: '#BEF264' }
                  : ovrTextStyle
              }
            >
              {displayOvr}
            </span>
            {effectiveBonusOvr > 0 && (
              <span className="ml-0.5 px-1 py-0.5 rounded bg-emerald-500 text-slate-950 text-[9px] font-extrabold tabular-nums leading-none shadow">
                +{effectiveBonusOvr}
              </span>
            )}
          </div>
          <span className={`font-bold tracking-wide mt-0.5 ${posFont}`} style={posTextStyle}>
            {tpl.position}
          </span>
          <div
            className={`mt-1.5 flex flex-col items-center ${
              size === 'sm' ? 'gap-1' : 'gap-1.5'
            }`}
          >
            <NationFlagSvg
              code={tpl.nationalityCode}
              className={
                size === 'sm'
                  ? 'w-4 h-3 rounded-[1px] shadow'
                  : size === 'xl'
                  ? 'w-6 h-4 rounded-[2px] shadow'
                  : 'w-5 h-3.5 rounded-[2px] shadow'
              }
            />
            <ClubCrestSvg
              clubCode={tpl.clubCode}
              className={
                size === 'sm'
                  ? 'w-4 h-4'
                  : size === 'xl'
                  ? 'w-6 h-6'
                  : 'w-5 h-5'
              }
            />
          </div>
        </div>

        {/* TOP-RIGHT SEASON EMBLEM, LENTICULAR / LOCKER TAG & SERIAL NUMBER (IPRM / LE ONLY) */}
        <div className="absolute z-20 right-[8.5%] top-[9%] flex flex-col items-end">
          <SeasonBadgeSvg
            season={tpl.season}
            className={
              size === 'sm'
                ? 'w-6 h-4'
                : size === 'xl'
                ? 'w-9 h-6 drop-shadow'
                : 'w-7 h-5'
            }
          />
          {activeCustomMiniface && size !== 'sm' ? (
            <span
              className={`mt-0.5 text-[9px] font-bold tracking-wider whitespace-nowrap ${
                theme.lightUpperChamber
                  ? 'text-red-900'
                  : 'text-sky-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]'
              }`}
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              MF THAY ĐỒ
            </span>
          ) : effectiveAltMiniface && size !== 'sm' ? (
            <span
              className={`mt-0.5 text-[9px] font-bold tracking-wider whitespace-nowrap ${
                theme.lightUpperChamber
                  ? 'text-amber-900'
                  : 'text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]'
              }`}
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              2MF
            </span>
          ) : null}

          {formattedSerial && (
            <span
              data-testid="card-serial-badge"
              className={`mt-0.5 rounded px-1.5 py-[1.5px] font-mono font-black tabular-nums tracking-wider whitespace-nowrap leading-none border shadow-md ${
                size === 'sm'
                  ? 'text-[8.5px]'
                  : size === 'xl'
                  ? 'text-[11px] px-2 py-0.5'
                  : 'text-[9.5px]'
              }`}
              style={{
                background: 'linear-gradient(135deg, #18140e 0%, #2e200e 45%, #422f12 70%, #16120b 100%)',
                color: '#FEF08A',
                borderColor: 'rgba(250, 204, 21, 0.85)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.85), inset 0 1px 0 rgba(254, 240, 138, 0.35)',
                textShadow: '0 1px 2px rgba(0,0,0,0.95)',
              }}
            >
              NO.{formattedSerial}
            </span>
          )}
        </div>

        {/* PLAYER ACTION CUTOUT MINIFACE (Enlarged Heroic Scale Anchored Above the Nameplate Banner) */}
        <div className="absolute z-10 right-[1.5%] bottom-[25.5%] pointer-events-none">
          <PlayerMiniface
            imageUrl={effectivePrimaryMiniface}
            altImageUrl={effectiveAltMiniface}
            auraColor={theme.border}
            phaseDelaySec={phaseDelaySec}
            forcedPose={forcedPose}
            alt={tpl.name}
            spec={tpl.miniface}
            jerseyNumber={tpl.jerseyNumber}
            className={minifaceDims}
            elevatedShadow={isHeroCard}
          />
        </div>

        {/* LOWER NAMEPLATE BANNER (75% -> 92.8% of Shield Height) */}
        <div className="absolute z-20 inset-x-[8.5%] top-[74.8%] bottom-[7.2%] flex flex-col justify-between">
          {/* Name + Enhancement Grade (+1 ~ +13) */}
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              {size !== 'sm' && (
                <SeasonBadgeSvg
                  season={tpl.season}
                  className={size === 'xl' ? 'w-6 h-4 shrink-0' : 'w-5 h-3.5 shrink-0'}
                />
              )}
              <span
                className={`font-bold truncate leading-none ${
                  size === 'sm'
                    ? 'text-[12px]'
                    : size === 'md'
                    ? 'text-[14px]'
                    : size === 'lg'
                    ? 'text-[16px]'
                    : 'text-[19px]'
                }`}
                style={nameTextStyle}
              >
                {size === 'sm' || size === 'md' ? tpl.shortName : tpl.name}
              </span>
            </div>

            <span
              className={`shrink-0 rounded font-extrabold tabular-nums leading-none ${
                size === 'sm'
                  ? 'text-[10px] px-1 py-0.5'
                  : size === 'xl'
                  ? 'text-xs px-2 py-0.5'
                  : 'text-[11px] px-1.5 py-0.5'
              }`}
              style={{
                background: gradeStyle.bg,
                color: gradeStyle.text,
                border: `1px solid ${gradeStyle.border}`,
                boxShadow: gradeStyle.shadow,
              }}
            >
              +{card.grade}
            </span>
          </div>

          {/* Salary Hexagon & Weak-Preferred Foot */}
          <div
            className={`flex items-center justify-between tabular-nums leading-none px-[7.5%] ${
              size === 'sm' ? 'text-[9.5px]' : size === 'xl' ? 'text-xs' : 'text-[10.5px]'
            }`}
            style={{
              color: theme.metaColor,
              textShadow: theme.lightLowerBanner
                ? 'none'
                : '0 1px 2px rgba(0,0,0,0.98), 0 0 5px rgba(0,0,0,0.85)',
            }}
          >
            <span className="inline-flex items-center gap-1 font-semibold">
              <svg
                viewBox="0 0 16 16"
                className={size === 'sm' ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'}
                aria-hidden="true"
              >
                <polygon
                  points="8,1 14.5,4.5 14.5,11.5 8,15 1.5,11.5 1.5,4.5"
                  fill={theme.lightLowerBanner ? '#292524' : '#0F172A'}
                  stroke={theme.border}
                  strokeWidth="1.4"
                />
              </svg>
              <span>{size === 'sm' ? tpl.salary : `Lương ${tpl.salary}`}</span>
            </span>
            <span className="font-mono font-semibold">
              {size === 'sm'
                ? `${tpl.weakFoot}-${tpl.preferredFoot}`
                : `Chân ${tpl.weakFoot}-${tpl.preferredFoot}`}
            </span>
          </div>
        </div>
      </div>

      {/* Detachable Readout Footer Below Shield (Preserves Exact 5:8 Card Proportions) */}
      {hasFooterPanel && (
        <div className="w-full mt-2 px-1 text-center space-y-1.5">
          {showValue && (
            <div
              className="text-xs font-bold font-mono tabular-nums truncate"
              style={{ color: theme.accentText }}
            >
              {formatBpCompact(card.valueBp)}
            </div>
          )}

          {showStats && (size === 'lg' || size === 'xl') && (
            <div className="rounded-lg bg-slate-950/90 border border-white/10 px-2.5 py-2 text-left">
              <div className="grid grid-cols-3 gap-x-2.5 gap-y-1 text-xs tabular-nums">
                {statItems.map((st) => (
                  <div key={st.label} className="flex items-center justify-between">
                    <span className="text-slate-400 text-[10.5px]">{st.label}</span>
                    <span className={`font-bold font-mono ${getStatValueColor(st.val)}`}>
                      {st.val}
                    </span>
                  </div>
                ))}
              </div>
              {size === 'xl' && tpl.goldTraits && tpl.goldTraits.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div className="text-[10px] font-bold tracking-wider text-amber-300/90 mb-1">
                    CHỈ SỐ ẨN FC ONLINE ({tpl.goldTraits.length})
                  </div>
                  <TraitBadges traits={tpl.goldTraits} variant="compact" maxItems={5} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${tpl.name} mùa ${tpl.seasonLabel} cộng ${card.grade} OVR ${card.ovr}${
          formattedSerial ? ` số thứ tự ${formattedSerial}` : ''
        }`}
        className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl"
      >
        {InnerContent}
      </button>
    );
  }

  return InnerContent;
};
