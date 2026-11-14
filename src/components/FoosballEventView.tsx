import React, { useState } from 'react';
import { FOOSBALL_MILESTONES, GENERATED_ASSETS, PACK_CATALOG } from '../game/catalog';
import {
  FOOSBALL_JACKPOT_STAGES,
  MAX_FOOSBALL_JACKPOT_FC,
  MIN_FOOSBALL_JACKPOT_FC,
  formatBpCompact,
  getFoosballLoopBpCost,
  getFoosballSpinCost,
  getUnclaimedReachedMilestones,
} from '../game/rules';
import { gameSound } from '../game/sound';
import { FoosballSpinReward, SeasonCode } from '../game/types';
import { FcOnlineTriangleMark, SeasonBadgeSvg } from './Emblems';

interface FoosballEventViewProps {
  fc: number;
  bp?: number;
  foosballLoops: number;
  foosballSpins: number;
  foosballJackpotFc: number;
  claimedMilestones: number[];
  onPlaySpins: (spinCount: 1 | 10 | 100) => FoosballSpinReward[];
  onUseFreeLoop: (loopCount?: number) => FoosballSpinReward[];
  onExchangeBpForLoops?: (loopsToBuy: 1 | 10 | 100) => { ok: boolean; error?: string };
  onClaimMilestone: (milestoneSpins: number) => void;
  onClaimAllMilestones: () => void;
  onGoToTopUp: () => void;
}

const GOAL_SLOTS: Array<{
  idx: number;
  label: string;
  badge: string;
  season: SeasonCode;
  color: string;
  glow: string;
}> = [
  {
    idx: 0,
    label: 'Gói BDO / UP',
    badge: 'BDO · UP',
    season: 'BDO',
    color: '#F59E0B',
    glow: 'rgba(245,158,11,0.38)',
  },
  {
    idx: 1,
    label: 'Gói 26TOTY',
    badge: '26TOTY',
    season: '26TOTY',
    color: '#60A5FA',
    glow: 'rgba(59,130,246,0.42)',
  },
  {
    idx: 2,
    label: 'ICON TM / 26UCL',
    badge: 'TM · 26UCL',
    season: 'ICON_TM',
    color: '#FACC15',
    glow: 'rgba(250,204,21,0.5)',
  },
  {
    idx: 3,
    label: '26TOTS / 26VB',
    badge: '26TOTS · 26VB',
    season: '26TOTS',
    color: '#34D399',
    glow: 'rgba(16,185,129,0.42)',
  },
  {
    idx: 4,
    label: 'Gói CU Phôi',
    badge: 'CU PHÔI',
    season: 'CU',
    color: '#FB7185',
    glow: 'rgba(251,113,133,0.38)',
  },
];

/** Authentic miniature foosball table figure SVG mounted on chrome rod */
const FoosballFigure: React.FC<{
  jerseyFill: string;
  jerseyStroke: string;
  shortsFill: string;
  isShooting: boolean;
  kickDirection: 'forward' | 'back';
}> = ({ jerseyFill, jerseyStroke, shortsFill, isShooting, kickDirection }) => (
  <svg
    viewBox="0 0 36 52"
    className={`relative z-10 w-7 h-10 sm:w-8 sm:h-12 drop-shadow-[0_4px_6px_rgba(0,0,0,0.75)] transition-transform duration-200 ${
      isShooting
        ? kickDirection === 'forward'
          ? 'scale-110 -translate-y-1 rotate-6'
          : '-rotate-12'
        : ''
    }`}
    aria-hidden="true"
  >
    {/* Plastic rod sleeve collar */}
    <rect x="3" y="21" width="30" height="4" rx="2" fill="#0F172A" opacity="0.65" />
    {/* Head */}
    <circle cx="18" cy="10" r="6" fill="#FDE68A" stroke="#0F172A" strokeWidth="1.6" />
    <path d="M12.5 8.5 Q18 3.5 23.5 8.5" fill="#1E293B" />
    {/* Jersey Torso */}
    <path d="M8 17.5 H28 L25 34 H11 Z" fill={jerseyFill} stroke={jerseyStroke} strokeWidth="1.6" />
    {/* Vertical stripe accent */}
    <rect x="16.2" y="18.5" width="3.6" height="14.5" fill={jerseyStroke} opacity="0.55" />
    {/* Foosball wedge base / boots */}
    <path d="M12 34 H24 L22.5 47 H13.5 Z" fill={shortsFill} stroke="#0F172A" strokeWidth="1.4" />
    <rect x="13" y="45" width="10" height="4" rx="1.2" fill="#F8FAFC" />
  </svg>
);

export const FoosballEventView: React.FC<FoosballEventViewProps> = ({
  fc,
  bp = 0,
  foosballLoops,
  foosballSpins,
  foosballJackpotFc,
  claimedMilestones,
  onPlaySpins,
  onUseFreeLoop,
  onExchangeBpForLoops,
  onClaimMilestone,
  onClaimAllMilestones,
  onGoToTopUp,
}) => {
  const [isShooting, setIsShooting] = useState(false);
  const [goalFlashIdx, setGoalFlashIdx] = useState<number | null>(null);
  const [targetSlotIdx, setTargetSlotIdx] = useState<number>(2);
  const [recentRewards, setRecentRewards] = useState<FoosballSpinReward[]>([]);
  const [jackpotBgFailed, setJackpotBgFailed] = useState(false);
  const [exchangeNotice, setExchangeNotice] = useState<string | null>(null);

  const claimableList = getUnclaimedReachedMilestones(foosballSpins, claimedMilestones);
  const milestone10kClaimed = claimedMilestones.includes(10000);
  const milestone10kReached = foosballSpins >= 10000;
  const milestone10kProgressPct = Math.min(100, Math.round((foosballSpins / 10000) * 100));

  const jackpotWonInLatestBatch = recentRewards.reduce(
    (sum, r) => sum + (r.jackpotWonFc ?? 0),
    0
  );
  const jackpotLogRatio =
    (Math.log10(Math.max(MIN_FOOSBALL_JACKPOT_FC, foosballJackpotFc)) -
      Math.log10(MIN_FOOSBALL_JACKPOT_FC)) /
    (Math.log10(MAX_FOOSBALL_JACKPOT_FC) - Math.log10(MIN_FOOSBALL_JACKPOT_FC));
  const jackpotProgressPct = Math.min(100, Math.max(4, Math.round(jackpotLogRatio * 100)));

  const runShootAnimation = (results: FoosballSpinReward[]) => {
    if (results.length === 0) return;
    gameSound.playFoosballKick();
    const lastHit = results[results.length - 1];
    setTargetSlotIdx(lastHit.slotIndex);
    setGoalFlashIdx(null);
    setIsShooting(true);
    window.setTimeout(() => {
      setIsShooting(false);
      setGoalFlashIdx(lastHit.slotIndex);
      setRecentRewards(results);
      window.setTimeout(() => setGoalFlashIdx(null), 1100);
    }, 340);
  };

  const handleSpinWithFc = (count: 1 | 10 | 100) => {
    const cost = getFoosballSpinCost(count);
    if (fc < cost || isShooting) return;
    const results = onPlaySpins(count);
    runShootAnimation(results);
  };

  const handleSpinFreeLoop = (count: number = 1) => {
    if (foosballLoops < count || isShooting) return;
    const results = onUseFreeLoop(count);
    if (results.length > 0) {
      runShootAnimation(results);
    }
  };

  const handleExchangeLoops = (loopsToBuy: 1 | 10 | 100) => {
    if (!onExchangeBpForLoops) return;
    const res = onExchangeBpForLoops(loopsToBuy);
    if (res.ok) {
      gameSound.playUpgradeOutcome(true);
      setExchangeNotice(`Đã đổi thành công +${loopsToBuy} Vòng Bi Lắc!`);
    } else {
      gameSound.playUpgradeOutcome(false);
      setExchangeNotice(res.error ?? 'Không đủ BP để đổi Vòng Bi Lắc.');
    }
    window.setTimeout(() => setExchangeNotice(null), 3200);
  };

  const ballTranslateX = (targetSlotIdx - 2) * 105;

  return (
    <div className="space-y-4 pb-8" data-testid="foosball-event-view">
      {/* 1. AUTHENTIC FC ONLINE WEB EVENT TOP BAR */}
      <div className="rounded-xl fco-pc-panel px-3.5 py-2.5 sm:px-5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border border-[#a3e635]/30">
        <div className="flex items-center gap-3 min-w-0">
          <FcOnlineTriangleMark className="w-7 h-6 sm:w-9 sm:h-8 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] font-black tracking-[0.2em] text-[#a3e635] uppercase">
              EA SPORTS FC™ ONLINE · SỰ KIỆN WEB CHÍNH THỨC
            </div>
            <h2
              className="text-lg sm:text-2xl font-black italic tracking-wide text-white uppercase leading-tight truncate"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              BI LẮC SIÊU CẤP · ĐẠI TIỆC MỐC QUÀ 10 → 10.000 ĐIỂM
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm tabular-nums shrink-0">
          <div className="px-3 py-1 rounded bg-[#060a13] border border-[#a3e635]/35 text-slate-200">
            Điểm Bi Lắc:{' '}
            <strong data-testid="foosball-total-points" className="text-[#a3e635] font-mono font-black">
              {foosballSpins.toLocaleString('vi-VN')} / 10.000
            </strong>
          </div>
          <div className="px-3 py-1 rounded bg-[#060a13] border border-emerald-400/35 text-slate-200">
            Vòng Bi Lắc:{' '}
            <strong className="text-emerald-300 font-mono font-black">
              {foosballLoops.toLocaleString('vi-VN')}
            </strong>
          </div>
        </div>
      </div>

      {/* 2. DUAL SHOWCASE: EXCLUSIVE 10K GRAND PRIZE + PROGRESSIVE JACKPOT VAULT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left 7 cols: Exclusive 10,000 Milestone Showcase */}
        <div
          data-testid="foosball-10k-exclusive-banner"
          className="lg:col-span-7 rounded-xl border fco-pc-panel-glow p-4 sm:p-5 flex flex-col justify-between gap-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <div className="text-[11px] font-black tracking-widest text-[#a3e635] uppercase">
                ★ PHẦN THƯỞNG ĐỘC QUYỀN MỐC 10.000 ĐIỂM BI LẮC ★
              </div>
              <div
                className="text-xl sm:text-2xl font-black italic fco-text-gold tracking-wide leading-tight"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                1 GÓI INFINITE PRIME (#001+) + 1 GÓI LEGENDARY ETERNAL (#001+) + 50 NGHÌN TỶ BP + 30.000 FC
              </div>
              <div className="flex flex-wrap items-center gap-2.5 pt-0.5 text-xs text-slate-300 tabular-nums">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-950/60 border border-amber-400/40">
                  <SeasonBadgeSvg season="INFINITY_PRIME" className="w-7 h-5" />
                  <span className="font-bold text-amber-200">x1 Gói IPRM</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-400/40">
                  <SeasonBadgeSvg season="LE" className="w-7 h-5" />
                  <span className="font-bold text-amber-200">x1 Gói LE</span>
                </div>
                <span className="font-semibold text-emerald-300">+50.000 Tỷ BP · +30.000 FC</span>
              </div>
            </div>

            <div className="shrink-0">
              {milestone10kClaimed ? (
                <div className="px-3.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-xs font-black text-emerald-300 whitespace-nowrap uppercase tracking-wider">
                  ✓ ĐÃ NHẬN MỐC 10.000Đ
                </div>
              ) : milestone10kReached ? (
                <button
                  type="button"
                  data-testid="claim-10k-exclusive-btn"
                  onClick={() => {
                    gameSound.playUpgradeOutcome(true);
                    onClaimMilestone(10000);
                  }}
                  className="fco-pc-tab-skew px-5 py-2.5 fco-pc-btn-gold text-xs sm:text-sm cursor-pointer whitespace-nowrap shadow-xl"
                >
                  <span>NHẬN GÓI IPRM &amp; LE NGAY</span>
                </button>
              ) : (
                <div className="px-3 py-2 rounded-lg bg-[#070b14] border border-white/15 text-xs text-slate-300 tabular-nums whitespace-nowrap">
                  Thiếu{' '}
                  <strong className="text-amber-300 font-mono">
                    {(10000 - foosballSpins).toLocaleString('vi-VN')}
                  </strong>{' '}
                  điểm
                </div>
              )}
            </div>
          </div>

          {/* 10k Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
              <span>Mỗi 1 lượt sút bàn Bi Lắc = +1 Điểm tích lũy</span>
              <strong className="text-[#a3e635] font-mono">
                {foosballSpins.toLocaleString('vi-VN')} / 10.000 ({milestone10kProgressPct}%)
              </strong>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-950 border border-white/15 overflow-hidden p-[1px]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#a3e635] via-amber-400 to-purple-400 transition-transform duration-200 origin-left"
                style={{ transform: `scaleX(${Math.max(0.02, milestone10kProgressPct / 100)})` }}
              />
            </div>
          </div>
        </div>

        {/* Right 5 cols: Progressive Jackpot Vault */}
        <div
          data-testid="foosball-special-jackpot"
          className="lg:col-span-5 relative rounded-xl overflow-hidden border border-amber-400/50 bg-[#120d05] p-4 sm:p-5 flex flex-col justify-between gap-3 shadow-xl"
        >
          {!jackpotBgFailed && (
            <img
              src={GENERATED_ASSETS.foosballJackpotBanner}
              alt="Két vàng Giải Đặc Biệt Bi Lắc FC Online"
              referrerPolicy="no-referrer"
              onError={() => setJackpotBgFailed(true)}
              className="absolute inset-0 w-full h-full object-cover object-right opacity-40"
            />
          )}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(105deg, rgba(9,13,22,0.96) 0%, rgba(18,13,5,0.88) 65%, rgba(9,13,22,0.75) 100%)',
            }}
          />

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-black tracking-widest text-amber-300 uppercase">
                GIẢI ĐẶC BIỆT TÍCH LŨY (100 → 1.000.000 FC)
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <div
                  data-testid="foosball-jackpot-amount"
                  className="text-3xl sm:text-4xl font-black italic text-amber-400 tabular-nums drop-shadow-[0_3px_12px_rgba(245,158,11,0.45)]"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {foosballJackpotFc.toLocaleString('vi-VN')} FC
                </div>
                <span className="text-xs text-slate-300 font-semibold">+ 1 ICON TM</span>
              </div>
            </div>

            {jackpotWonInLatestBatch > 0 && (
              <div className="rounded-lg bg-amber-500/20 border border-amber-300 px-3 py-1.5 text-right shrink-0">
                <div className="text-[10px] font-bold text-amber-200 uppercase">NỔ HŨ FC!</div>
                <div className="text-lg font-black text-amber-300 font-mono tabular-nums">
                  +{jackpotWonInLatestBatch.toLocaleString('vi-VN')} FC
                </div>
              </div>
            )}
          </div>

          <div className="relative z-10 space-y-1.5">
            <div className="h-2 w-full rounded-full bg-slate-900/90 border border-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-300 to-sky-400 transition-transform duration-200 origin-left"
                style={{ transform: `scaleX(${Math.max(0.04, jackpotProgressPct / 100)})` }}
              />
            </div>
            <div className="grid grid-cols-4 gap-1">
              {FOOSBALL_JACKPOT_STAGES.slice(0, 8).map((stageFc) => {
                const active = foosballJackpotFc >= stageFc;
                return (
                  <div
                    key={stageFc}
                    className={`rounded px-1.5 py-0.5 text-center text-[10px] font-mono tabular-nums border ${
                      active
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 font-bold'
                        : 'bg-slate-950/75 border-white/10 text-slate-500'
                    }`}
                  >
                    {stageFc >= 1000 ? `${stageFc / 1000}K` : stageFc} FC
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. AUTHENTIC FC ONLINE 3D FOOSBALL CABINET + RIGHT CONTROL DECK */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left 8 cols: Authentic FC Online Foosball Table */}
        <div
          className="lg:col-span-8 rounded-2xl p-2.5 sm:p-3.5 shadow-[0_24px_60px_rgba(0,0,0,0.85)] border-2 border-[#78350f]/80 relative flex flex-col justify-between gap-3"
          style={{
            background:
              'linear-gradient(145deg, #27150a 0%, #120b07 45%, #0a101c 100%)',
          }}
        >
          {/* Cabinet Top Header Bar with Score Pegs */}
          <div className="flex items-center justify-between px-2 pt-0.5 text-[11px] font-bold">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((p) => (
                  <span key={p} className="w-2.5 h-2 rounded-sm bg-[#a3e635] border border-black/40" />
                ))}
              </span>
              <span className="text-[#a3e635] tracking-wider uppercase font-extrabold">
                BÀN BI LẮC FC ONLINE PRO
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-300 tabular-nums">
              <span className="hidden sm:inline text-amber-300">Sút trúng khung thành nhận quà ngay</span>
              <span className="inline-flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((p) => (
                  <span key={p} className="w-2.5 h-2 rounded-sm bg-amber-400 border border-black/40" />
                ))}
              </span>
            </div>
          </div>

          {/* Inner Recessed Foosball Playing Arena */}
          <div
            className="relative rounded-xl border-4 border-[#0f172a] overflow-hidden shadow-inner flex flex-col justify-between p-3 sm:p-4 min-h-[370px]"
            style={{
              background:
                'repeating-linear-gradient(90deg, #064e3b 0px, #064e3b 36px, #043e2f 36px, #043e2f 72px)',
            }}
          >
            {/* Stadium overhead light vignette */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 35%, rgba(163,230,53,0.14) 0%, rgba(2,6,23,0.45) 75%)',
              }}
            />

            {/* TOP 5 NETTED GOAL POCKETS */}
            <div className="relative z-10">
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5">
                {GOAL_SLOTS.map((slot) => {
                  const isActive = targetSlotIdx === slot.idx && recentRewards.length > 0;
                  const isFlashing = goalFlashIdx === slot.idx;
                  return (
                    <div
                      key={slot.idx}
                      className={`relative rounded-b-xl rounded-t-md border-t-4 border-x-2 border-b-2 p-2 sm:p-2.5 text-center transition-all duration-200 overflow-hidden ${
                        isFlashing
                          ? 'border-amber-300 bg-slate-900 scale-105'
                          : isActive
                          ? 'border-[#a3e635] bg-slate-950/90'
                          : 'border-slate-300/75 bg-slate-950/80'
                      }`}
                      style={{
                        boxShadow: isFlashing ? `0 0 24px ${slot.glow}` : undefined,
                      }}
                    >
                      {/* Goal Net Pattern */}
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 opacity-20 pointer-events-none"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.5) 5px, rgba(255,255,255,0.5) 6px), repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(255,255,255,0.5) 5px, rgba(255,255,255,0.5) 6px)',
                        }}
                      />

                      <div className="relative z-10 flex flex-col items-center gap-1">
                        <SeasonBadgeSvg season={slot.season} className="w-8 h-5 sm:w-10 sm:h-6" />
                        <div
                          className="text-[11px] sm:text-xs font-black tracking-wide leading-none"
                          style={{ color: slot.color, fontFamily: "'Barlow Condensed', sans-serif" }}
                        >
                          {slot.badge}
                        </div>
                        <div className="text-[10px] text-slate-200 font-semibold truncate w-full">
                          {slot.label}
                        </div>
                      </div>

                      {isFlashing && (
                        <div className="absolute inset-x-0 bottom-0 bg-[#a3e635] text-slate-950 text-[9px] font-black tracking-widest uppercase py-0.5">
                          VÀOOO!
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PITCH MARKINGS + 3 CHROME RODS + ANIMATED FOOTBALL */}
            <div className="relative z-10 my-3 py-3 flex-1 flex flex-col justify-between min-h-[215px]">
              {/* Center Line & Center Circle & Penalty Arc */}
              <div
                aria-hidden="true"
                className="absolute inset-x-4 top-1/2 h-[2px] bg-white/30 pointer-events-none"
              />
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-2 border-white/30 pointer-events-none"
              />
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-0 -translate-x-1/2 w-48 h-10 border-x-2 border-b-2 border-white/25 rounded-b-lg pointer-events-none"
              />

              {/* ROD 1: 4 Defenders / GK (FC Online Blue) */}
              <div className="relative flex items-center justify-around px-4">
                {/* Rubber Handles Left & Right */}
                <div className="hidden sm:block absolute -left-3 w-7 h-3 rounded-r bg-slate-900 border border-slate-600 shadow" />
                <div className="hidden sm:block absolute -right-3 w-7 h-3 rounded-l bg-slate-900 border border-slate-600 shadow" />
                {/* Chrome Steel Bar */}
                <div
                  className="absolute inset-x-0 h-2 rounded-full shadow-md"
                  style={{
                    background: 'linear-gradient(180deg, #f8fafc 0%, #94a3b8 48%, #475569 100%)',
                  }}
                />
                {[0, 1, 2, 3].map((p) => (
                  <FoosballFigure
                    key={`def_${p}`}
                    jerseyFill="#2563EB"
                    jerseyStroke="#E0F2FE"
                    shortsFill="#0F172A"
                    isShooting={isShooting}
                    kickDirection="back"
                  />
                ))}
              </div>

              {/* ROD 2: 5 Midfielders (Cobalt / Cyan) */}
              <div className="relative flex items-center justify-around px-2">
                <div className="hidden sm:block absolute -left-3 w-7 h-3 rounded-r bg-slate-900 border border-slate-600 shadow" />
                <div className="hidden sm:block absolute -right-3 w-7 h-3 rounded-l bg-slate-900 border border-slate-600 shadow" />
                <div
                  className="absolute inset-x-0 h-2 rounded-full shadow-md"
                  style={{
                    background: 'linear-gradient(180deg, #f8fafc 0%, #94a3b8 48%, #475569 100%)',
                  }}
                />
                {[0, 1, 2, 3, 4].map((p) => (
                  <FoosballFigure
                    key={`mid_${p}`}
                    jerseyFill="#0D9488"
                    jerseyStroke="#CCFBF1"
                    shortsFill="#1E293B"
                    isShooting={isShooting}
                    kickDirection="back"
                  />
                ))}
              </div>

              {/* ROD 3: 3 Strikers (FC Online Volt & Gold) */}
              <div className="relative flex items-center justify-around px-8">
                <div className="hidden sm:block absolute -left-3 w-7 h-3 rounded-r bg-[#a3e635]/80 border border-black shadow" />
                <div className="hidden sm:block absolute -right-3 w-7 h-3 rounded-l bg-[#a3e635]/80 border border-black shadow" />
                <div
                  className="absolute inset-x-0 h-2 rounded-full shadow-md"
                  style={{
                    background: 'linear-gradient(180deg, #fef08a 0%, #94a3b8 50%, #475569 100%)',
                  }}
                />
                {[0, 1, 2].map((p) => (
                  <FoosballFigure
                    key={`att_${p}`}
                    jerseyFill="#A3E635"
                    jerseyStroke="#0F172A"
                    shortsFill="#090D16"
                    isShooting={isShooting}
                    kickDirection="forward"
                  />
                ))}
              </div>

              {/* Launch Circle & Classic Pentagon Football */}
              <div className="mt-2 flex justify-center items-center relative">
                <div className="w-10 h-10 rounded-full border border-dashed border-white/30 flex items-center justify-center">
                  <div
                    className="w-8 h-8 transition-transform duration-300 ease-out"
                    style={{
                      transform: isShooting
                        ? `translate3d(${ballTranslateX}px, -188px, 0) scale(0.86) rotate(260deg)`
                        : 'translate3d(0, 0, 0) scale(1) rotate(0deg)',
                    }}
                  >
                    <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_4px_12px_rgba(255,255,255,0.65)]" aria-hidden="true">
                      <circle cx="18" cy="18" r="16.5" fill="#F8FAFC" stroke="#0F172A" strokeWidth="2.2" />
                      <polygon points="18,11 23.8,15.2 21.6,22 14.4,22 12.2,15.2" fill="#0F172A" />
                      <line x1="18" y1="1.8" x2="18" y2="11" stroke="#0F172A" strokeWidth="1.5" />
                      <line x1="23.8" y1="15.2" x2="33.2" y2="12" stroke="#0F172A" strokeWidth="1.5" />
                      <line x1="12.2" y1="15.2" x2="2.8" y2="12" stroke="#0F172A" strokeWidth="1.5" />
                      <line x1="21.6" y1="22" x2="27" y2="31" stroke="#0F172A" strokeWidth="1.5" />
                      <line x1="14.4" y1="22" x2="9" y2="31" stroke="#0F172A" strokeWidth="1.5" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Kick Buttons Integrated Into Cabinet Deck */}
          <div className="grid grid-cols-3 gap-2 px-1">
            <button
              type="button"
              data-testid="foosball-spin-1-btn"
              disabled={fc < 20 || isShooting}
              onClick={() => handleSpinWithFc(1)}
              className={`fco-pc-tab-skew min-h-[44px] py-2 px-2 sm:px-3 text-xs sm:text-sm font-black transition-all whitespace-nowrap tabular-nums uppercase tracking-wide ${
                fc >= 20
                  ? 'fco-pc-btn-slate cursor-pointer'
                  : 'bg-slate-800/90 text-slate-500 cursor-not-allowed border border-white/5'
              }`}
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              <span>Sút 1 · 20 FC</span>
            </button>

            <button
              type="button"
              data-testid="foosball-spin-10-btn"
              disabled={fc < 190 || isShooting}
              onClick={() => handleSpinWithFc(10)}
              className={`fco-pc-tab-skew min-h-[44px] py-2 px-2 sm:px-3 text-xs sm:text-sm font-black transition-all whitespace-nowrap tabular-nums uppercase tracking-wide ${
                fc >= 190
                  ? 'fco-pc-btn-primary cursor-pointer'
                  : 'bg-slate-800/90 text-slate-500 cursor-not-allowed border border-white/5'
              }`}
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              <span>Sút 10 · 190 FC</span>
            </button>

            <button
              type="button"
              data-testid="foosball-spin-100-btn"
              disabled={fc < 900 || isShooting}
              onClick={() => handleSpinWithFc(100)}
              className={`fco-pc-tab-skew min-h-[44px] py-2 px-2 sm:px-3 text-xs sm:text-sm font-black transition-all whitespace-nowrap tabular-nums uppercase tracking-wide ${
                fc >= 900
                  ? 'fco-pc-btn-gold cursor-pointer'
                  : 'bg-slate-800/90 text-slate-500 cursor-not-allowed border border-white/5'
              }`}
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              <span>Sút 100 · 900 FC</span>
            </button>
          </div>
        </div>

        {/* Right 4 cols: Loop Tickets + BP Exchange + Drop Feed */}
        <div className="lg:col-span-4 rounded-2xl fco-pc-panel p-4 sm:p-5 flex flex-col justify-between gap-4 border border-white/10">
          <div className="space-y-3">
            <div>
              <h3
                className="text-xl font-black italic text-white"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                VÒNG BI LẮC &amp; ĐỔI LƯỢT BP
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Dùng Vòng Bi Lắc nhận từ mốc quà / Shop hoặc đổi BP để tăng tốc săn đủ 10.000 điểm!
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                data-testid="foosball-use-loop-1-btn"
                disabled={foosballLoops < 1 || isShooting}
                onClick={() => handleSpinFreeLoop(1)}
                className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs sm:text-sm transition-colors whitespace-nowrap tabular-nums ${
                  foosballLoops >= 1
                    ? 'bg-[#a3e635] hover:bg-[#bef264] text-slate-950 cursor-pointer font-black'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                Dùng 1 Vòng Bi Lắc (Còn {foosballLoops.toLocaleString('vi-VN')} vòng)
              </button>

              {foosballLoops >= 10 && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={foosballLoops < 10 || isShooting}
                    onClick={() => handleSpinFreeLoop(10)}
                    className="py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap tabular-nums"
                  >
                    Sút nhanh 10 Vòng
                  </button>
                  <button
                    type="button"
                    disabled={foosballLoops < 100 || isShooting}
                    onClick={() => handleSpinFreeLoop(100)}
                    className={`py-2 px-3 rounded-lg font-extrabold text-xs whitespace-nowrap tabular-nums ${
                      foosballLoops >= 100
                        ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    Sút nhanh 100 Vòng
                  </button>
                </div>
              )}
            </div>

            {onExchangeBpForLoops && (
              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300 tabular-nums">
                  <span className="font-semibold">Đổi BP lấy Vòng Bi Lắc:</span>
                  <span className="font-mono text-[#a3e635]">{formatBpCompact(bp)}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {([1, 10, 100] as const).map((cnt) => {
                    const cost = getFoosballLoopBpCost(cnt);
                    const canBuy = bp >= cost;
                    return (
                      <button
                        key={`buy_loop_${cnt}`}
                        type="button"
                        disabled={!canBuy}
                        onClick={() => handleExchangeLoops(cnt)}
                        className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap tabular-nums ${
                          canBuy
                            ? 'bg-[#111e33] hover:bg-[#192b48] border border-emerald-400/40 text-emerald-300 cursor-pointer'
                            : 'bg-slate-900 border border-white/5 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        <div>+{cnt} Vòng</div>
                        <div className="text-[10px] font-mono opacity-90">
                          {formatBpCompact(cost)}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {exchangeNotice && (
                  <div className="text-[11px] font-semibold text-amber-300">{exchangeNotice}</div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                gameSound.playClick();
                onGoToTopUp();
              }}
              className="w-full py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              Xem Đặc Quyền SVIP &amp; Nhận FC Lương Ngày →
            </button>
          </div>

          {/* Recent Drop Log */}
          <div className="flex-1 pt-3 border-t border-white/10">
            <div className="text-xs font-semibold text-slate-300 mb-2 tabular-nums">
              Bảng kết quả sút bóng gần nhất ({recentRewards.length} lượt):
            </div>

            {recentRewards.length === 0 ? (
              <div className="text-xs text-slate-500 py-5 text-center border border-dashed border-white/10 rounded-lg">
                Nhấn nút Sút 1 / 10 / 100 hoặc dùng Vòng Bi Lắc để ghi bàn nhận gói thẻ &amp; điểm!
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 text-xs">
                {recentRewards.slice(0, 15).map((rw, idx) => (
                  <div
                    key={`rw_${idx}`}
                    className={`flex items-center justify-between py-1.5 px-2.5 rounded border ${
                      rw.jackpotWonFc
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                        : 'bg-slate-900/90 border-white/5'
                    }`}
                  >
                    <span className="text-slate-100 truncate">{rw.slotLabel}</span>
                    <span className="text-[#a3e635] font-mono tabular-nums shrink-0 ml-2">
                      {rw.jackpotWonFc
                        ? `+${rw.jackpotWonFc.toLocaleString('vi-VN')} FC`
                        : `+${formatBpCompact(rw.bpEarned)}`}
                    </span>
                  </div>
                ))}
                {recentRewards.length > 15 && (
                  <div className="text-center text-[11px] text-slate-400 pt-1 tabular-nums">
                    ...và {recentRewards.length - 15} phần thưởng khác đã chuyển vào Kho Vật Phẩm!
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. UPGRADED 12-TIER FC ONLINE GIFT MILESTONES RAIL & CARDS */}
      <div className="rounded-2xl bg-[#0d1424] border border-white/12 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3
              className="text-xl sm:text-2xl font-black italic text-white"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              MỐC ĐIỂM TÍCH LŨY BI LẮC · CẬP NHẬT 12 MỐC QUÀ KÉP + FC + VÒNG BI LẮC
            </h3>
            <p className="text-xs text-slate-400">
              Tiến độ:{' '}
              <strong className="text-[#a3e635] tabular-nums">
                {foosballSpins.toLocaleString('vi-VN')} / 10.000 điểm
              </strong>{' '}
              · Mốc 10 → 7.500 thưởng gói kép, BP, FC &amp; Vòng Bi Lắc · Mốc 10.000 độc quyền{' '}
              <strong className="text-amber-300">IPRM + LE + 30.000 FC</strong>
            </p>
          </div>

          {claimableList.length > 0 && (
            <button
              type="button"
              data-testid="foosball-claim-all-milestones-btn"
              onClick={() => {
                gameSound.playUpgradeOutcome(true);
                onClaimAllMilestones();
              }}
              className="px-4 py-2 rounded-lg bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-black text-xs transition-colors cursor-pointer whitespace-nowrap tabular-nums"
            >
              Nhận tất cả ({claimableList.length} mốc)
            </button>
          )}
        </div>

        {/* Stepped Horizontal Event Milestone Rail */}
        <div className="overflow-x-auto no-scrollbar pb-1">
          <div className="min-w-[720px] px-2 pt-2 pb-1">
            <div className="relative flex items-center justify-between">
              <div className="absolute left-0 right-0 top-3.5 h-1 bg-slate-800 rounded-full" />
              <div
                className="absolute left-0 top-3.5 h-1 bg-gradient-to-r from-[#a3e635] to-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${milestone10kProgressPct}%` }}
              />
              {FOOSBALL_MILESTONES.map((ms) => {
                const reached = foosballSpins >= ms.spins;
                const claimed = claimedMilestones.includes(ms.spins);
                return (
                  <div key={`rail_${ms.spins}`} className="relative z-10 flex flex-col items-center gap-1">
                    <div
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-black font-mono tabular-nums ${
                        claimed
                          ? 'bg-emerald-500 border-emerald-300 text-slate-950'
                          : reached
                          ? 'bg-amber-400 border-amber-200 text-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.65)]'
                          : ms.spins === 10000
                          ? 'bg-[#1a1308] border-amber-400 text-amber-300'
                          : 'bg-slate-950 border-slate-700 text-slate-400'
                      }`}
                    >
                      {claimed ? '✓' : ms.spins >= 1000 ? `${ms.spins / 1000}K` : ms.spins}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 12 Milestone Gift Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {FOOSBALL_MILESTONES.map((ms) => {
            const isGrand10k = ms.spins === 10000;
            const reached = foosballSpins >= ms.spins;
            const claimed = claimedMilestones.includes(ms.spins);
            const rewardPack = ms.rewardPackId ? PACK_CATALOG[ms.rewardPackId] : null;
            const bonusPack = ms.bonusPackId ? PACK_CATALOG[ms.bonusPackId] : null;

            return (
              <div
                key={ms.spins}
                data-testid={`foosball-milestone-${ms.spins}`}
                className={`rounded-xl p-3 border flex flex-col justify-between text-center transition-colors ${
                  claimed
                    ? 'bg-slate-900/55 border-emerald-500/35 opacity-80'
                    : reached
                    ? 'bg-amber-500/15 border-amber-400'
                    : isGrand10k
                    ? 'bg-[#181209] border-amber-400/75 shadow-[0_0_24px_rgba(245,158,11,0.2)]'
                    : 'bg-slate-950/75 border-white/10'
                }`}
              >
                <div className="space-y-1.5">
                  <div
                    className={`text-xs font-black uppercase tabular-nums ${
                      isGrand10k ? 'text-[#a3e635]' : 'text-amber-300'
                    }`}
                  >
                    Mốc {ms.spins.toLocaleString('vi-VN')}Đ
                  </div>

                  {isGrand10k && (
                    <div className="text-[10px] font-black text-amber-300 tracking-wider uppercase">
                      ĐỘC QUYỀN IPRM + LE
                    </div>
                  )}

                  {/* Primary & Bonus Pack with Authentic Season Badges */}
                  {rewardPack && (
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-white">
                      <SeasonBadgeSvg season={rewardPack.seasonCode} className="w-6 h-4 shrink-0" />
                      <span className="truncate">
                        {rewardPack.seasonBadge} x{ms.rewardPackCount}
                      </span>
                    </div>
                  )}
                  {bonusPack && (
                    <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-purple-200">
                      <SeasonBadgeSvg season={bonusPack.seasonCode} className="w-5 h-3.5 shrink-0" />
                      <span className="truncate">
                        +{bonusPack.seasonBadge} x{ms.bonusPackCount}
                      </span>
                    </div>
                  )}

                  {/* BP + FC + Loops Bonuses */}
                  <div className="pt-1 border-t border-white/10 text-[11px] font-mono space-y-0.5 tabular-nums">
                    <div className="text-emerald-400 font-bold">
                      +{Math.round(ms.rewardBp / 1_000_000_000).toLocaleString('vi-VN')} Tỷ BP
                    </div>
                    {(ms.rewardFc || ms.rewardLoops) && (
                      <div className="text-[10px] text-amber-200">
                        {ms.rewardFc ? `+${ms.rewardFc.toLocaleString('vi-VN')} FC` : ''}
                        {ms.rewardFc && ms.rewardLoops ? ' · ' : ''}
                        {ms.rewardLoops ? `+${ms.rewardLoops} Vòng` : ''}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  {claimed ? (
                    <span className="text-[11px] font-bold text-emerald-400">✓ Đã nhận</span>
                  ) : reached ? (
                    <button
                      type="button"
                      onClick={() => {
                        gameSound.playUpgradeOutcome(true);
                        onClaimMilestone(ms.spins);
                      }}
                      className="w-full py-1.5 px-2 rounded-lg bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-black text-xs cursor-pointer whitespace-nowrap"
                    >
                      Nhận quà
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      Còn {(ms.spins - foosballSpins).toLocaleString('vi-VN')}đ
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
