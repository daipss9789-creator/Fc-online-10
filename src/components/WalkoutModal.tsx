import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GENERATED_ASSETS,
  PACK_CATALOG,
  PLAYER_TEMPLATE_MAP,
  SEASON_CARD_ARTWORK,
} from '../game/catalog';
import { formatBpCompact, formatCardSerial, isSerializedSeason } from '../game/rules';
import { gameSound } from '../game/sound';
import { OwnedCard, PackId, SeasonCode } from '../game/types';
import { ClubCrestSvg, NationFlagSvg, SeasonBadgeSvg } from './Emblems';
import { PackArtwork } from './PackArtwork';
import { PlayerCardView } from './PlayerCardView';
import { TraitBadges } from './TraitBadges';
import { UpgradeConfettiCanvas } from './UpgradeConfettiCanvas';

type TunnelPhase =
  | 'staging'
  | 'pack_rip'
  | 'nationality'
  | 'position'
  | 'club'
  | 'reveal';

export type WalkoutInitialMode = 'staging' | 'open_one' | 'open_multi' | 'open_all';

interface WalkoutModalProps {
  packId: PackId;
  availableCount: number;
  initialMode?: WalkoutInitialMode;
  multiCount?: number;
  onOpenOne: (packId: PackId) => OwnedCard | null;
  onOpenMulti?: (packId: PackId, count: number) => OwnedCard[];
  onOpenAll: (packId: PackId) => OwnedCard[];
  onClose: () => void;
}

function getSeasonFlareColor(season: SeasonCode | undefined, fallback: string): string {
  switch (season) {
    case 'LE':
      return '#f59e0b';
    case 'INFINITY_PRIME':
      return '#fde047';
    case 'ICON_TM':
      return '#fef3c7';
    case '26VB':
      return '#fb7185';
    case '26UCL':
      return '#38bdf8';
    case '26TOTY':
      return '#60a5fa';
    case 'UP':
      return '#2dd4bf';
    default:
      return fallback;
  }
}

export const WalkoutModal: React.FC<WalkoutModalProps> = ({
  packId,
  availableCount,
  initialMode = 'staging',
  multiCount = 5,
  onOpenOne,
  onOpenMulti,
  onOpenAll,
  onClose,
}) => {
  const pack = PACK_CATALOG[packId];
  const [phase, setPhase] = useState<TunnelPhase>('staging');
  const [pulledCards, setPulledCards] = useState<OwnedCard[]>([]);
  const [featuredCard, setFeaturedCard] = useState<OwnedCard | null>(null);
  const [flippedUids, setFlippedUids] = useState<Record<string, boolean>>({});
  const [ripSlashed, setRipSlashed] = useState(false);
  const [bgFailed, setBgFailed] = useState(false);

  const autoStartedRef = useRef(false);
  const ripTimersRef = useRef<number[]>([]);
  const featuredCardRef = useRef<OwnedCard | null>(null);
  const pulledCardsRef = useRef<OwnedCard[]>([]);

  const clearRipTimers = () => {
    ripTimersRef.current.forEach((id) => window.clearTimeout(id));
    ripTimersRef.current = [];
  };

  useEffect(() => {
    return () => clearRipTimers();
  }, []);

  const triggerInteractivePackRip = () => {
    if (ripSlashed) return;
    clearRipTimers();
    setRipSlashed(true);
    gameSound.playPackTear();
    ripTimersRef.current = [
      window.setTimeout(() => {
        gameSound.playWalkoutStage('flag');
        setPhase('nationality');
      }, 680),
    ];
  };

  const triggerRevealPhase = () => {
    clearRipTimers();
    const card = featuredCardRef.current;
    const tpl = card ? PLAYER_TEMPLATE_MAP[card.templateId] : undefined;
    gameSound.playCardRevealCelebration({
      ovr: card?.ovr ?? 120,
      season: tpl?.season,
      isBatch: pulledCardsRef.current.length > 1,
    });
    setPhase('reveal');
  };

  const launchSequenceWithCards = (cards: OwnedCard[]) => {
    if (cards.length === 0) return;
    clearRipTimers();
    const sorted = [...cards].sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp);
    const best = sorted[0];
    pulledCardsRef.current = sorted;
    featuredCardRef.current = best;
    setPulledCards(sorted);
    setFeaturedCard(best);
    // In multi-pack PC flip board, best pull starts face-up and remaining cards can be flipped 1-by-1 or all at once
    setFlippedUids(sorted.length === 1 ? { [best.uid]: true } : { [best.uid]: true });
    setRipSlashed(false);
    gameSound.playWalkoutStage('entry');
    setPhase('pack_rip');
  };

  const handleStartSingleOpen = () => {
    const card = onOpenOne(packId);
    if (!card) return;
    launchSequenceWithCards([card]);
  };

  const handleStartMultiOpen = (countToOpen: number) => {
    const safeCount = Math.max(1, countToOpen);
    if (onOpenMulti) {
      const cards = onOpenMulti(packId, safeCount);
      launchSequenceWithCards(cards);
      return;
    }
    const cards = onOpenAll(packId);
    launchSequenceWithCards(cards);
  };

  const handleStartOpenAll = () => {
    const cards = onOpenAll(packId);
    launchSequenceWithCards(cards);
  };

  // Support 1-click PC Vault launch ('open_one', 'open_multi', 'open_all') with StrictMode guard
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (initialMode === 'open_one') {
      autoStartedRef.current = true;
      handleStartSingleOpen();
    } else if (initialMode === 'open_multi') {
      autoStartedRef.current = true;
      handleStartMultiOpen(multiCount);
    } else if (initialMode === 'open_all') {
      autoStartedRef.current = true;
      handleStartOpenAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);

  // Automatic tunnel progression: pack_rip (auto slash at 580ms) -> nationality -> position -> club -> reveal
  useEffect(() => {
    if (phase === 'staging' || phase === 'reveal') return;

    if (phase === 'pack_rip') {
      const autoCutTimer = window.setTimeout(() => {
        triggerInteractivePackRip();
      }, 580);
      return () => window.clearTimeout(autoCutTimer);
    }

    const durations: Record<Exclude<TunnelPhase, 'staging' | 'pack_rip' | 'reveal'>, number> = {
      nationality: 1250,
      position: 1250,
      club: 1350,
    };

    const nextMap: Record<Exclude<TunnelPhase, 'staging' | 'pack_rip' | 'reveal'>, TunnelPhase> = {
      nationality: 'position',
      position: 'club',
      club: 'reveal',
    };

    const timer = window.setTimeout(() => {
      const next = nextMap[phase];
      if (next === 'reveal') {
        triggerRevealPhase();
        return;
      }
      setPhase(next);
      if (next === 'nationality') gameSound.playWalkoutStage('flag');
      if (next === 'position') gameSound.playWalkoutStage('position');
      if (next === 'club') gameSound.playWalkoutStage('club');
    }, durations[phase]);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Space / Escape keyboard shortcuts matching FC Online PC
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (phase === 'pack_rip') {
          e.preventDefault();
          if (!ripSlashed) {
            triggerInteractivePackRip();
          } else {
            clearRipTimers();
            gameSound.playWalkoutStage('flag');
            setPhase('nationality');
          }
        } else if (phase !== 'staging' && phase !== 'reveal') {
          e.preventDefault();
          triggerRevealPhase();
        } else if (phase === 'reveal' && pulledCards.length > 1) {
          e.preventDefault();
          handleFlipAllCards();
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        clearRipTimers();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ripSlashed, pulledCards, onClose]);

  const handleSkipToReveal = () => {
    triggerRevealPhase();
  };

  const handleFlipSingleCard = (card: OwnedCard) => {
    const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
    if (
      card.ovr >= 123 ||
      tpl?.season === 'LE' ||
      tpl?.season === 'INFINITY_PRIME' ||
      tpl?.season === 'ICON_TM'
    ) {
      gameSound.playCardRevealCelebration({
        ovr: card.ovr,
        season: tpl?.season,
      });
    } else {
      gameSound.playClick(1.15);
      gameSound.triggerCardObtainVibration(card.ovr, tpl?.season);
    }
    setFlippedUids((prev) => ({ ...prev, [card.uid]: true }));
    featuredCardRef.current = card;
    setFeaturedCard(card);
  };

  const handleFlipAllCards = () => {
    const topCard = pulledCards.reduce<OwnedCard | null>(
      (best, cur) => (!best || cur.ovr > best.ovr ? cur : best),
      featuredCardRef.current
    );
    const topTpl = topCard ? PLAYER_TEMPLATE_MAP[topCard.templateId] : undefined;
    gameSound.playCardRevealCelebration({
      ovr: topCard?.ovr ?? 120,
      season: topTpl?.season,
      isBatch: true,
    });
    const allMap: Record<string, boolean> = {};
    for (const c of pulledCards) {
      allMap[c.uid] = true;
    }
    setFlippedUids(allMap);
  };

  const featuredTemplate = featuredCard
    ? PLAYER_TEMPLATE_MAP[featuredCard.templateId]
    : null;
  const isLegendWalkout = featuredTemplate?.clubCode === 'ICONS';
  const flareColor = getSeasonFlareColor(featuredTemplate?.season, pack.accentHex);

  const tunnelZoomScale = {
    staging: 'scale(1)',
    pack_rip: 'scale(1.06)',
    nationality: 'scale(1.12)',
    position: 'scale(1.18)',
    club: 'scale(1.24)',
    reveal: 'scale(1.06)',
  }[phase];

  const totalBatchValue = useMemo(
    () => pulledCards.reduce((sum, c) => sum + c.valueBp, 0),
    [pulledCards]
  );

  const unflippedCount = useMemo(
    () => pulledCards.filter((c) => !flippedUids[c.uid]).length,
    [pulledCards, flippedUids]
  );

  const nextBatchSize = Math.min(5, availableCount);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đường hầm mở thẻ FC Online PC"
      data-testid="pc-walkout-modal"
      className="fixed inset-0 z-[100] flex flex-col justify-between overflow-hidden bg-[#04070f]"
    >
      {/* Stadium Tunnel Perspective Background + Season Flare */}
      <div
        className="absolute inset-0 transition-transform duration-700 ease-out pointer-events-none"
        style={{ transform: tunnelZoomScale }}
      >
        {!bgFailed && (
          <img
            src={GENERATED_ASSETS.stadiumTunnelBg}
            alt="Đường hầm sân vận động FC Online"
            referrerPolicy="no-referrer"
            onError={() => setBgFailed(true)}
            className="w-full h-full object-cover opacity-55"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 42%, ${flareColor}42 0%, rgba(4,7,15,0.88) 66%, #04070f 100%)`,
          }}
        />
      </div>

      {/* Volumetric Stadium Spotlight Beams (Tinted by Season Tier) */}
      {phase !== 'staging' && (
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="fco-beam-left absolute -top-24 left-[18%] w-44 h-[135%] origin-top opacity-45"
            style={{
              background: `linear-gradient(180deg, ${flareColor}66 0%, ${flareColor}14 55%, transparent 100%)`,
              clipPath: 'polygon(35% 0%, 65% 0%, 100% 100%, 0% 100%)',
            }}
          />
          <div
            className="fco-beam-right absolute -top-24 right-[18%] w-44 h-[135%] origin-top opacity-45"
            style={{
              background: `linear-gradient(180deg, ${flareColor}66 0%, ${flareColor}14 55%, transparent 100%)`,
              clipPath: 'polygon(35% 0%, 65% 0%, 100% 100%, 0% 100%)',
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-32 opacity-50"
            style={{
              background: `radial-gradient(ellipse at 50% 100%, ${flareColor}48 0%, transparent 72%)`,
            }}
          />
        </div>
      )}

      {/* Full-Stage Opening Metallic Stadium Tunnel Blast Doors */}
      {phase === 'pack_rip' && (
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none z-20">
          <div className="fco-tunnel-door-left absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#03060d] via-[#0a1222] to-[#132036] border-r-2 border-[#a3e635]/45 opacity-90" />
          <div className="fco-tunnel-door-right absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[#03060d] via-[#0a1222] to-[#132036] border-l-2 border-[#a3e635]/45 opacity-90" />
        </div>
      )}

      {/* Top FC Online PC Walkout Bar */}
      <div className="relative z-10 flex items-center justify-between px-5 sm:px-6 py-3 border-b border-white/10 bg-[#070b14]/95">
        <div className="flex items-center gap-2.5 text-xs sm:text-sm min-w-0">
          <span
            className="font-bold tracking-wider text-[#a3e635] shrink-0"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            FC ONLINE PC · MỞ THẺ 100%
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-slate-100 font-semibold truncate">{pack.name}</span>
          <span aria-hidden="true" className="hidden sm:inline text-slate-600">·</span>
          <span className="hidden sm:inline text-slate-400 tabular-nums shrink-0">
            Kho còn: {availableCount} gói
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {phase !== 'staging' && phase !== 'reveal' && (
            <button
              type="button"
              data-testid="walkout-skip-btn"
              onClick={handleSkipToReveal}
              className="px-3.5 py-1.5 rounded-md bg-[#a3e635] hover:bg-[#bef264] text-slate-950 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap"
            >
              Bỏ qua hoạt ảnh [SPACE]
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              gameSound.playClick(0.9);
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-white/15 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            Đóng [ESC]
          </button>
        </div>
      </div>

      {/* Center Tunnel Stage */}
      <div className="relative z-10 flex-1 flex flex-col items-center px-3 sm:px-6 py-2.5 sm:py-4 overflow-y-auto">
        <div className="my-auto w-full flex flex-col items-center">
        {/* PHASE 0: STAGING */}
        {phase === 'staging' && (
          <div className="flex flex-col items-center text-center max-w-lg">
            <div className="mb-2 text-xs font-extrabold tracking-widest text-[#a3e635]">
              BUỒNG XÉ GÓI &amp; WALKOUT CHUẨN FC ONLINE BẢN PC
            </div>

            <div className="my-3 transition-transform duration-200 hover:scale-105">
              <PackArtwork packId={packId} quantity={availableCount} size="lg" />
            </div>

            <p className="mt-2 text-sm text-slate-300 max-w-md leading-relaxed">
              {pack.subtitle}. Hiệu ứng xé vỏ gói thẻ phát pháo sáng theo mùa giải và mở đường hầm{' '}
              <strong className="text-white">Quốc tịch · Vị trí · CLB / ICONs</strong>.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {availableCount >= 1 ? (
                <>
                  <button
                    type="button"
                    onClick={handleStartSingleOpen}
                    className="px-6 py-3 rounded-md bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-sm tracking-wide shadow-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Mở 1 gói
                  </button>

                  {availableCount >= 2 && (
                    <button
                      type="button"
                      onClick={() => handleStartMultiOpen(nextBatchSize)}
                      className="px-6 py-3 rounded-md bg-sky-400 hover:bg-sky-300 text-slate-950 font-extrabold text-sm tracking-wide shadow-lg transition-colors cursor-pointer whitespace-nowrap tabular-nums"
                    >
                      Mở nhanh x{nextBatchSize} gói
                    </button>
                  )}

                  {availableCount >= 2 && (
                    <button
                      type="button"
                      onClick={handleStartOpenAll}
                      className="px-6 py-3 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm tracking-wide shadow-lg transition-colors cursor-pointer whitespace-nowrap tabular-nums"
                    >
                      Mở tất cả ({availableCount} gói)
                    </button>
                  )}
                </>
              ) : (
                <div className="text-sm text-slate-400">
                  Bạn đã mở hết gói thẻ loại này trong kho.
                </div>
              )}
            </div>
          </div>
        )}

        {/* PHASE 1: INTERACTIVE PC FOIL PACK RIP & SEASON FLARE */}
        {phase === 'pack_rip' && (
          <div
            data-testid="walkout-stage-pack-rip"
            data-ripped={ripSlashed ? 'true' : 'false'}
            className="relative w-full max-w-2xl flex flex-col items-center text-center fco-walkout-slam py-2"
          >
            <div className="text-xs font-extrabold tracking-widest text-amber-300 mb-3 relative z-10">
              {ripSlashed
                ? `BÙNG NỔ PHÁO SÁNG MÙA ${featuredTemplate?.seasonLabel ?? pack.seasonBadge}!`
                : `PHÁO SÁNG MÙA ${featuredTemplate?.seasonLabel ?? pack.seasonBadge} ĐANG KÍCH HOẠT!`}
            </div>

            <div className="relative flex items-center justify-center z-10">
              {ripSlashed && (
                <div
                  aria-hidden="true"
                  className="fco-pack-erupt absolute -inset-12 rounded-full pointer-events-none"
                  style={{
                    background: `radial-gradient(circle, #ffffff 0%, ${flareColor}cc 36%, transparent 72%)`,
                  }}
                />
              )}

              <button
                type="button"
                onClick={() => {
                  if (!ripSlashed) {
                    triggerInteractivePackRip();
                  } else {
                    clearRipTimers();
                    gameSound.playWalkoutStage('flag');
                    setPhase('nationality');
                  }
                }}
                aria-label="Xé vỏ gói thẻ ngay"
                className={`group relative p-4 rounded-2xl bg-slate-950/90 border-2 transition-transform duration-150 hover:scale-105 cursor-pointer ${
                  ripSlashed ? 'scale-105' : 'fco-pack-hover'
                }`}
                style={{
                  borderColor: flareColor,
                  boxShadow: `0 0 ${ripSlashed ? 95 : 65}px ${flareColor}80`,
                }}
              >
                <div
                  aria-hidden="true"
                  className={`absolute inset-x-4 top-2 h-5 rounded-t-md border-b-2 pointer-events-none z-20 ${
                    ripSlashed ? 'fco-foil-tear-away' : 'opacity-85'
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${flareColor}dd 0%, #0f172a 82%)`,
                    borderColor: '#ffffffdd',
                  }}
                />

                <div
                  aria-hidden="true"
                  className={`absolute inset-x-1 top-7 h-1.5 rounded-full z-30 pointer-events-none ${
                    ripSlashed ? 'fco-slash-laser' : 'fco-laser-pulse'
                  }`}
                  style={{
                    background: `linear-gradient(90deg, transparent, #ffffff, ${flareColor}, #ffffff, transparent)`,
                    boxShadow: `0 0 22px #ffffff, 0 0 36px ${flareColor}`,
                  }}
                />

                <PackArtwork packId={packId} quantity={pulledCards.length} size="lg" />
              </button>
            </div>

            <div
              className="mt-4 text-3xl sm:text-4xl font-bold italic tracking-wide text-white relative z-10"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {ripSlashed
                ? 'ĐANG MỞ CỔNG ĐƯỜNG HÀM SIÊU SAO!'
                : 'NHẤN VÀO GÓI THẺ ĐỂ XÉ VỎ BỌC!'}
            </div>
            <p className="mt-1 text-xs text-slate-300 relative z-10">
              Nhấn trực tiếp vào gói thẻ hoặc phím <strong className="text-[#a3e635]">[SPACE]</strong> để xé nhanh
            </p>
          </div>
        )}

        {/* PHASE 2: NATIONALITY (QUỐC TỊCH) */}
        {phase === 'nationality' && featuredTemplate && (
          <div
            data-testid="walkout-stage-nationality"
            className="relative w-full max-w-3xl flex flex-col items-center text-center fco-walkout-slam py-2"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center text-[9rem] sm:text-[13rem] font-black italic text-white/[0.04] select-none pointer-events-none"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {featuredTemplate.nationalityCode}
            </div>
            <div
              aria-hidden="true"
              className="fco-laser-pulse w-72 sm:w-96 h-0.5 mb-4"
              style={{
                background: `linear-gradient(90deg, transparent, ${flareColor}, #ffffff, ${flareColor}, transparent)`,
              }}
            />
            <div className="text-xs font-extrabold tracking-widest text-[#a3e635] mb-3 uppercase">
              WALKOUT ĐƯỜNG HẦM 1 / 3 · QUỐC TỊCH CẦU THỦ
            </div>
            <div
              className="p-5 sm:p-6 rounded-xl bg-slate-950/95 border-2 shadow-2xl relative z-10"
              style={{
                borderColor: flareColor,
                boxShadow: `0 0 50px ${flareColor}44`,
              }}
            >
              <NationFlagSvg
                code={featuredTemplate.nationalityCode}
                className="w-44 h-28 rounded shadow-lg"
              />
            </div>
            <div
              className="mt-4 text-5xl sm:text-6xl font-bold italic text-white tracking-wide relative z-10"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {featuredTemplate.nationalityName}
            </div>
          </div>
        )}

        {/* PHASE 3: POSITION (VỊ TRÍ) */}
        {phase === 'position' && featuredTemplate && (
          <div
            data-testid="walkout-stage-position"
            className="relative w-full max-w-3xl flex flex-col items-center text-center fco-walkout-slam py-2"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center text-[10rem] sm:text-[14rem] font-black italic text-[#a3e635]/[0.06] select-none pointer-events-none"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {featuredTemplate.position}
            </div>
            <div className="text-xs font-extrabold tracking-widest text-amber-300 mb-3 uppercase">
              WALKOUT ĐƯỜNG HẦM 2 / 3 · VỊ TRÍ THI ĐẤU
            </div>
            <div
              className="px-14 py-7 rounded-xl bg-slate-950/95 border-2 border-[#a3e635] shadow-2xl text-7xl sm:text-8xl font-bold italic text-[#a3e635] tracking-tight relative z-10"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                boxShadow: `0 0 55px rgba(163,230,53,0.45)`,
              }}
            >
              {featuredTemplate.position}
            </div>
            <div className="mt-4 text-base text-slate-200 font-semibold relative z-10">
              {featuredTemplate.nationalityName} · {featuredTemplate.position} · Mùa {featuredTemplate.seasonLabel}
            </div>
          </div>
        )}

        {/* PHASE 4: CLUB OR ICONS SHIELD */}
        {phase === 'club' && featuredTemplate && (
          <div
            data-testid="walkout-stage-club"
            className="relative w-full max-w-3xl flex flex-col items-center text-center fco-walkout-slam py-2"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center text-[7rem] sm:text-[10rem] font-black italic text-amber-300/[0.05] select-none pointer-events-none"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {featuredTemplate.seasonLabel}
            </div>
            <div className="text-xs font-extrabold tracking-widest text-amber-300 mb-4 uppercase">
              {isLegendWalkout
                ? 'WALKOUT ĐƯỜNG HẦM 3 / 3 · LOGO MÙA THẺ & HUYỀN THOẠI ICONS'
                : 'WALKOUT ĐƯỜNG HẦM 3 / 3 · CÂU LẠC BỘ CHỦ QUẢN'}
            </div>

            {isLegendWalkout ? (
              <div className="px-8 py-6 rounded-2xl bg-slate-950/95 border-2 border-amber-400/75 shadow-[0_0_55px_rgba(245,158,11,0.45)] flex items-center justify-center gap-6 relative z-10">
                <div className="flex flex-col items-center gap-2">
                  <div className="relative w-24 h-28 flex items-center justify-center">
                    <img
                      src={SEASON_CARD_ARTWORK[featuredTemplate.season]}
                      alt={featuredTemplate.seasonLabel}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.85)]"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <SeasonBadgeSvg
                        season={featuredTemplate.season}
                        className="w-11 h-8 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]"
                      />
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-amber-300 tracking-wider">
                    MÙA {featuredTemplate.seasonLabel}
                  </span>
                </div>

                <div className="h-20 w-px bg-amber-400/30" />

                <div className="flex flex-col items-center gap-2">
                  <ClubCrestSvg clubCode="ICONS" className="w-28 h-28" />
                  <span className="text-[11px] font-bold text-amber-200 tracking-wider">
                    FC ONLINE ICONS
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="p-6 rounded-2xl bg-slate-950/95 border-2 shadow-2xl relative z-10"
                style={{
                  borderColor: flareColor,
                  boxShadow: `0 0 50px ${flareColor}48`,
                }}
              >
                <ClubCrestSvg clubCode={featuredTemplate.clubCode} className="w-32 h-36" />
              </div>
            )}

            <div
              className="mt-5 text-5xl font-bold italic text-white tracking-wide relative z-10"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {isLegendWalkout
                ? `${featuredTemplate.seasonLabel} · FC Online ICONs`
                : featuredTemplate.clubName}
            </div>
          </div>
        )}

        {/* PHASE 5: FULL FC ONLINE PC CARD REVEAL & INTERACTIVE MULTI-CARD FLIP BOARD */}
        {phase === 'reveal' && featuredCard && featuredTemplate && (
          <div
            data-testid="walkout-stage-reveal"
            className="relative w-full max-w-6xl flex flex-col items-center fco-walkout-slam"
          >
            <div
              aria-hidden="true"
              className="fco-impact-flash fixed inset-0 pointer-events-none z-20"
              style={{
                background: `radial-gradient(circle at 50% 45%, ${flareColor}70 0%, transparent 65%)`,
              }}
            />
            {(featuredCard.ovr >= 94 ||
              isLegendWalkout ||
              featuredTemplate.season === 'INFINITY_PRIME' ||
              featuredTemplate.season === 'ICON_TM') && (
              <UpgradeConfettiCanvas
                key={`walkout_${featuredCard.uid}`}
                grade={isLegendWalkout ? 12 : 9}
              />
            )}

            <div className="relative z-30 text-xs font-extrabold tracking-widest text-[#a3e635] mb-1.5 tabular-nums text-center">
              {pulledCards.length > 1
                ? `KẾT QUẢ MỞ ${pulledCards.length} GÓI THẺ · TỔNG GIÁ TRỊ +${formatBpCompact(totalBatchValue)}`
                : 'WALKOUT THÀNH CÔNG · SIÊU SAO GIA NHẬP ĐỘI HÌNH!'}
            </div>

            {isSerializedSeason(featuredTemplate.season) &&
              formatCardSerial(featuredCard.serialNumber) && (
                <div
                  data-testid="walkout-serial-reveal"
                  className="relative z-30 mb-2 px-4 py-1 rounded-md bg-amber-950/90 border border-amber-400/70 text-xs font-mono font-extrabold text-amber-200 tracking-wider shadow-lg tabular-nums"
                >
                  SỐ THỨ TỰ THẺ ĐỘC BẢN ({featuredTemplate.seasonLabel}):{' '}
                  <span className="text-amber-300">
                    NO.{formatCardSerial(featuredCard.serialNumber)}
                  </span>
                </div>
              )}

            {/* Spotlight Featured Card + Pedestal Shockwave + Player Details */}
            <div className="relative z-30 flex flex-row items-center justify-center gap-3.5 sm:gap-5 my-1">
              <div className="relative flex items-center justify-center">
                <div
                  aria-hidden="true"
                  className="fco-shockwave-ring absolute inset-0 rounded-full border-2 pointer-events-none"
                  style={{ borderColor: flareColor }}
                />
                <PlayerCardView
                  card={featuredCard}
                  size={pulledCards.length > 1 ? 'md' : 'lg'}
                  showStats
                  showValue
                  badgeNote={
                    pulledCards.length > 1 ? 'BEST PULL' : 'CHIÊU MỘ THÀNH CÔNG'
                  }
                />
              </div>

              <div className="rounded-xl bg-[#090f1d]/95 border border-white/12 p-3 sm:p-4 max-w-xs sm:max-w-sm space-y-2 text-left">
                <div className="flex items-center gap-2">
                  <SeasonBadgeSvg season={featuredTemplate.season} className="w-6 h-4 shrink-0" />
                  <span className="text-lg font-bold text-white">{featuredTemplate.name}</span>
                </div>
                <div className="text-xs text-slate-300 flex flex-wrap items-center gap-1.5 tabular-nums">
                  <span className="font-bold text-[#a3e635]">
                    {featuredTemplate.position} · OVR {featuredCard.ovr}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Lương {featuredTemplate.salary}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <ClubCrestSvg clubCode={featuredTemplate.clubCode} className="w-3.5 h-3.5" />
                    {featuredTemplate.clubName}
                  </span>
                </div>
                <div className="text-xs text-slate-400 tabular-nums">
                  Giá trị TTCN:{' '}
                  <strong className="font-mono text-emerald-400">
                    {formatBpCompact(featuredCard.valueBp)}
                  </strong>
                </div>
                {featuredTemplate.goldTraits && featuredTemplate.goldTraits.length > 0 && (
                  <div className="pt-1.5 border-t border-white/10">
                    <TraitBadges
                      traits={featuredTemplate.goldTraits}
                      variant="compact"
                      maxItems={5}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* FC ONLINE PC MULTI-CARD INTERACTIVE FLIP BOARD */}
            {pulledCards.length > 1 && (
              <div
                data-testid="multi-pack-flip-board"
                className="relative z-30 mt-4 w-full fco-pc-panel rounded-xl p-4 shadow-2xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-white/10">
                  <div className="text-xs font-black text-slate-200 tabular-nums uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    BÀN LẬT THẺ NHIỀU GÓI BẢN PC ({pulledCards.length - unflippedCount}/
                    {pulledCards.length} THẺ ĐÃ MỞ)
                  </div>
                  <div className="flex items-center gap-2.5">
                    {unflippedCount > 0 && (
                      <button
                        type="button"
                        data-testid="flip-all-cards-btn"
                        onClick={handleFlipAllCards}
                        className="px-4 py-1.5 rounded fco-pc-btn-gold text-xs cursor-pointer whitespace-nowrap tabular-nums"
                      >
                        Lật tất cả ({unflippedCount} thẻ)
                      </button>
                    )}
                    <span className="text-xs font-mono font-black text-emerald-400 tabular-nums">
                      Tổng: +{formatBpCompact(totalBatchValue)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-3 max-h-64 overflow-y-auto p-1">
                  {pulledCards.map((c, idx) => {
                    const tpl = PLAYER_TEMPLATE_MAP[c.templateId];
                    const isFlipped = Boolean(flippedUids[c.uid]);
                    const isBest = idx === 0;

                    if (isFlipped) {
                      return (
                        <div
                          key={c.uid}
                          className="fco-card-flip-3d transition-transform duration-200 hover:-translate-y-1"
                        >
                          <PlayerCardView
                            card={c}
                            size="sm"
                            showValue
                            selected={featuredCard.uid === c.uid}
                            badgeNote={isBest ? 'BEST PULL' : undefined}
                            onClick={() => setFeaturedCard(c)}
                          />
                        </div>
                      );
                    }

                    return (
                      <button
                        key={c.uid}
                        type="button"
                        onClick={() => handleFlipSingleCard(c)}
                        aria-label={`Lật thẻ gói số ${idx + 1}`}
                        className="w-[122px] h-[186px] rounded-xl fco-pc-panel-glow border-2 border-amber-400/60 hover:border-[#a3e635] flex flex-col items-center justify-between p-3 text-center transition-all duration-150 hover:scale-105 cursor-pointer shadow-lg"
                      >
                        <span className="text-[10px] font-black text-amber-300 tracking-wider uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                          FC ONLINE PC
                        </span>
                        <div className="relative w-16 h-20 flex items-center justify-center">
                          {tpl && (
                            <img
                              src={SEASON_CARD_ARTWORK[tpl.season]}
                              alt={tpl.seasonLabel}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain opacity-90 drop-shadow"
                            />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <SeasonBadgeSvg
                              season={tpl?.season ?? pack.seasonCode}
                              className="w-8 h-6"
                            />
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded fco-pc-btn-primary text-[10px] whitespace-nowrap">
                          LẬT THẺ
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reveal Bottom Action Bar */}
            <div className="relative z-30 mt-4 flex flex-wrap items-center justify-center gap-2.5">
              {availableCount >= 1 && (
                <button
                  type="button"
                  onClick={handleStartSingleOpen}
                  className="px-5 py-2.5 rounded fco-pc-btn-primary text-xs sm:text-sm cursor-pointer whitespace-nowrap tabular-nums"
                >
                  Mở tiếp 1 gói (Còn {availableCount})
                </button>
              )}
              {availableCount >= 2 && (
                <button
                  type="button"
                  onClick={() => handleStartMultiOpen(nextBatchSize)}
                  className="px-5 py-2.5 rounded fco-pc-btn-gold text-xs sm:text-sm cursor-pointer whitespace-nowrap tabular-nums"
                >
                  Mở tiếp x{nextBatchSize} gói
                </button>
              )}
              {availableCount >= 2 && (
                <button
                  type="button"
                  onClick={handleStartOpenAll}
                  className="px-5 py-2.5 rounded fco-pc-btn-gold text-xs sm:text-sm cursor-pointer whitespace-nowrap tabular-nums"
                >
                  Mở tất cả ({availableCount})
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded fco-pc-btn-slate text-white text-xs sm:text-sm cursor-pointer whitespace-nowrap"
              >
                Xác nhận &amp; Về Kho Vật Phẩm [ESC]
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Bottom FC Online PC Walkout Step Bar */}
      {phase !== 'staging' && (
        <div className="relative z-10 px-6 py-2.5 bg-[#070b14]/95 border-t border-white/10 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
          <span className={phase === 'pack_rip' ? 'text-amber-300 font-bold' : ''}>
            01. Xé vỏ gói thẻ
          </span>
          <span aria-hidden="true">→</span>
          <span className={phase === 'nationality' ? 'text-[#a3e635] font-bold' : ''}>
            02. Quốc tịch
          </span>
          <span aria-hidden="true">→</span>
          <span className={phase === 'position' ? 'text-[#a3e635] font-bold' : ''}>
            03. Vị trí
          </span>
          <span aria-hidden="true">→</span>
          <span className={phase === 'club' ? 'text-amber-400 font-bold' : ''}>
            {isLegendWalkout ? '04. Mùa thẻ & ICONs' : '04. Câu lạc bộ'}
          </span>
          <span aria-hidden="true">→</span>
          <span className={phase === 'reveal' ? 'text-[#a3e635] font-bold' : ''}>
            05. Lộ diện &amp; Lật thẻ
          </span>
        </div>
      )}
    </div>,
    document.body
  );
};
