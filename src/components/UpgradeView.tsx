import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PLAYER_TEMPLATE_MAP } from '../game/catalog';
import {
  BP_PROTECTION_MIN_GRADE,
  EnhancementOutcome,
  MAX_CARD_GRADE,
  MAX_FODDER_COUNT,
  calculateBpProtectionCost,
  calculateEnhancementPreview,
  canUseBpProtection,
  computeCardOvr,
  computeCardValueBp,
  estimateFodderGaugeContribution,
  formatBpCompact,
} from '../game/rules';
import { gameSound } from '../game/sound';
import { GlobalServerRules, OwnedCard, PositionCode } from '../game/types';
import { ClubCrestSvg, SeasonBadgeSvg } from './Emblems';
import { PlayerCardView, getGradeBadgeStyle } from './PlayerCardView';
import { TraitBadges } from './TraitBadges';
import { UpgradeConfettiCanvas } from './UpgradeConfettiCanvas';

interface UpgradeViewProps {
  cards: OwnedCard[];
  vipLevel: number;
  bp: number;
  serverRules?: GlobalServerRules;
  preselectedTargetId?: string | null;
  onExecuteUpgrade: (
    targetUid: string,
    fodderUids: string[],
    rhythmOffset: number,
    useBpProtection: boolean
  ) => EnhancementOutcome | null;
  onQuickBuyFodderBundle: () => boolean;
  onGoToMarket?: () => void;
}

type UpgradeStep = 'select' | 'rhythm' | 'result';
type DrawerTab = 'fodders' | 'targets';
type RosterPosFilter = 'ALL' | 'FW' | 'MF' | 'DF' | 'GK';
type RosterSortMode = 'ovr_asc' | 'ovr_desc' | 'val_asc';

function getPositionBucket(pos: PositionCode): Exclude<RosterPosFilter, 'ALL'> {
  if (pos === 'GK') return 'GK';
  if (pos === 'CB' || pos === 'LB' || pos === 'RB') return 'DF';
  if (pos === 'CAM' || pos === 'CM' || pos === 'CDM') return 'MF';
  return 'FW';
}

export const UpgradeView: React.FC<UpgradeViewProps> = ({
  cards,
  vipLevel,
  bp,
  serverRules,
  preselectedTargetId,
  onExecuteUpgrade,
  onQuickBuyFodderBundle,
  onGoToMarket,
}) => {
  const upgradeableCards = useMemo(
    () =>
      [...cards]
        .filter((c) => c.grade < MAX_CARD_GRADE)
        .sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp),
    [cards]
  );

  const [step, setStep] = useState<UpgradeStep>('select');
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('fodders');
  const [drawerQuery, setDrawerQuery] = useState<string>('');
  const [posFilter, setPosFilter] = useState<RosterPosFilter>('ALL');
  const [sortMode, setSortMode] = useState<RosterSortMode>('ovr_asc');
  const [skipAnimation, setSkipAnimation] = useState<boolean>(false);
  const [targetUid, setTargetUid] = useState<string>(() => {
    if (preselectedTargetId) return preselectedTargetId;
    return upgradeableCards[0]?.uid ?? '';
  });
  const [fodderUids, setFodderUids] = useState<string[]>([]);
  const [useBpProtection, setUseBpProtection] = useState<boolean>(true);
  const [isStriking, setIsStriking] = useState(false);
  const [outcome, setOutcome] = useState<EnhancementOutcome | null>(null);
  const [strikePhase, setStrikePhase] = useState<'absorb' | 'compress' | 'climax'>('absorb');

  const strikeTimerRef = useRef<number | null>(null);
  const phaseTimersRef = useRef<number[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingStrikeArgsRef = useRef<{
    targetUid: string;
    fodderUids: string[];
    offset: number;
    useBpProtection: boolean;
  } | null>(null);

  const clearAllStrikeTimers = () => {
    if (strikeTimerRef.current !== null) {
      window.clearTimeout(strikeTimerRef.current);
      strikeTimerRef.current = null;
    }
    phaseTimersRef.current.forEach((id) => window.clearTimeout(id));
    phaseTimersRef.current = [];
  };

  useEffect(() => {
    const scrollParent = containerRef.current?.closest('.overflow-y-auto');
    if (scrollParent) {
      scrollParent.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [step]);

  useEffect(() => {
    return () => {
      clearAllStrikeTimers();
    };
  }, []);

  const lastPreselectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      preselectedTargetId &&
      preselectedTargetId !== lastPreselectedRef.current &&
      cards.some((c) => c.uid === preselectedTargetId)
    ) {
      lastPreselectedRef.current = preselectedTargetId;
      setTargetUid(preselectedTargetId);
      setFodderUids([]);
      setStep('select');
    } else if (!preselectedTargetId) {
      lastPreselectedRef.current = null;
    }
  }, [preselectedTargetId, cards]);

  useEffect(() => {
    if (!cards.some((c) => c.uid === targetUid) && upgradeableCards.length > 0) {
      setTargetUid(upgradeableCards[0].uid);
    }
  }, [cards, targetUid, upgradeableCards]);

  const targetCard = useMemo(
    () => cards.find((c) => c.uid === targetUid) ?? upgradeableCards[0] ?? null,
    [cards, targetUid, upgradeableCards]
  );

  const availableFodders = useMemo(() => {
    if (!targetCard) return [];
    return [...cards]
      .filter((c) => c.uid !== targetCard.uid)
      .sort((a, b) => a.ovr - b.ovr || a.valueBp - b.valueBp);
  }, [cards, targetCard]);

  const applyRosterFilterAndSort = (list: OwnedCard[], defaultDesc: boolean): OwnedCard[] => {
    const q = drawerQuery.trim().toLowerCase();
    const filtered = list.filter((c) => {
      const tpl = PLAYER_TEMPLATE_MAP[c.templateId];
      if (!tpl) return false;
      if (posFilter !== 'ALL' && getPositionBucket(tpl.position) !== posFilter) return false;
      if (!q) return true;
      return `${tpl.name} ${tpl.shortName} ${tpl.seasonLabel} ${tpl.position} +${c.grade}`
        .toLowerCase()
        .includes(q);
    });

    const sorted = [...filtered];
    if (sortMode === 'ovr_asc' && !defaultDesc) {
      sorted.sort((a, b) => a.ovr - b.ovr || a.valueBp - b.valueBp);
    } else if (sortMode === 'val_asc') {
      sorted.sort((a, b) => a.valueBp - b.valueBp || a.ovr - b.ovr);
    } else {
      sorted.sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp);
    }
    return sorted;
  };

  const filteredTargets = useMemo(
    () => applyRosterFilterAndSort(upgradeableCards, drawerTab === 'targets' && sortMode === 'ovr_asc' ? false : true),
    [upgradeableCards, drawerQuery, posFilter, sortMode, drawerTab]
  );

  const filteredFodders = useMemo(
    () => applyRosterFilterAndSort(availableFodders, false),
    [availableFodders, drawerQuery, posFilter, sortMode]
  );

  const selectedFodders = useMemo(
    () =>
      fodderUids
        .map((id) => cards.find((c) => c.uid === id))
        .filter((c): c is OwnedCard => Boolean(c)),
    [fodderUids, cards]
  );

  const preview = useMemo(() => {
    if (!targetCard) return null;
    return calculateEnhancementPreview(targetCard, selectedFodders, vipLevel, serverRules);
  }, [targetCard, selectedFodders, vipLevel, serverRules]);

  const highGradeCandidate = useMemo(
    () => upgradeableCards.find((c) => canUseBpProtection(c)) ?? null,
    [upgradeableCards]
  );

  const eligibleForBpProtection = targetCard ? canUseBpProtection(targetCard) : false;
  const protectionCostBp = targetCard ? calculateBpProtectionCost(targetCard) : 0;
  const canAffordProtection = bp >= protectionCostBp;
  const activeBpProtection = Boolean(
    eligibleForBpProtection && useBpProtection && canAffordProtection
  );

  // 60fps oscillating fodder & needle animation refs (decoupled from React setState)
  const fodderGliderRef = useRef<HTMLDivElement | null>(null);
  const indicatorDotRef = useRef<HTMLDivElement | null>(null);
  const rhythmOffsetRef = useRef<number>(0);

  useEffect(() => {
    if (step !== 'rhythm' || isStriking) return;

    let rafId = 0;
    const startTime = performance.now();

    const animateRhythm = (now: number) => {
      const elapsedSec = (now - startTime) / 1000;
      const offset = Math.sin(elapsedSec * 1.9);
      rhythmOffsetRef.current = offset;

      const translatePx = offset * 135;
      if (fodderGliderRef.current) {
        fodderGliderRef.current.style.transform = `translate3d(${translatePx.toFixed(1)}px, 0, 0)`;
      }
      if (indicatorDotRef.current) {
        indicatorDotRef.current.style.transform = `translate3d(${(offset * 126).toFixed(1)}px, 0, 0)`;
      }
      rafId = window.requestAnimationFrame(animateRhythm);
    };

    rafId = window.requestAnimationFrame(animateRhythm);
    return () => window.cancelAnimationFrame(rafId);
  }, [step, isStriking]);

  // PC Keyboard Shortcut in Rhythm Chamber: Space/Enter strikes, Escape backs out
  useEffect(() => {
    if (step !== 'rhythm') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === ' ' || e.key === 'Enter') && !isStriking) {
        e.preventDefault();
        startChamberStrike(rhythmOffsetRef.current, false);
      } else if (e.key === 'Escape' && !isStriking) {
        e.preventDefault();
        setStep('select');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const toggleFodder = (uid: string) => {
    gameSound.playClick();
    setFodderUids((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((item) => item !== uid);
      }
      if (prev.length >= MAX_FODDER_COUNT) {
        return prev;
      }
      return [...prev, uid];
    });
  };

  const handleAutoPickFodder = () => {
    gameSound.playClick(1.1);
    setFodderUids((prev) => {
      const next = [...prev.filter((id) => availableFodders.some((c) => c.uid === id))];
      for (const candidate of availableFodders) {
        if (next.length >= MAX_FODDER_COUNT) break;
        if (!next.includes(candidate.uid)) {
          next.push(candidate.uid);
        }
      }
      return next;
    });
  };

  const finalizeStrikeNow = () => {
    clearAllStrikeTimers();
    const args = pendingStrikeArgsRef.current;
    pendingStrikeArgsRef.current = null;
    if (!args) {
      setIsStriking(false);
      return;
    }
    const res = onExecuteUpgrade(
      args.targetUid,
      args.fodderUids,
      args.offset,
      args.useBpProtection
    );
    setIsStriking(false);
    setStrikePhase('absorb');
    if (res) {
      gameSound.playUpgradeOutcome(
        res.succeeded,
        res.succeeded && res.newGrade >= 8,
        res.updatedCard.ovr
      );
      setOutcome(res);
      setTargetUid(res.updatedCard.uid);
      setFodderUids([]);
      setStep('result');
    }
  };

  const startChamberStrike = (offsetToUse: number, forceInstant: boolean = false) => {
    if (!targetCard || selectedFodders.length < 1 || isStriking) return;
    clearAllStrikeTimers();
    pendingStrikeArgsRef.current = {
      targetUid: targetCard.uid,
      fodderUids: selectedFodders.map((f) => f.uid),
      offset: offsetToUse,
      useBpProtection: activeBpProtection,
    };

    if (forceInstant || skipAnimation) {
      finalizeStrikeNow();
      return;
    }

    setStep('rhythm');
    setIsStriking(true);
    setStrikePhase('absorb');
    gameSound.playChamberCharge();

    phaseTimersRef.current = [
      window.setTimeout(() => setStrikePhase('compress'), 880),
      window.setTimeout(() => setStrikePhase('climax'), 1820),
    ];

    strikeTimerRef.current = window.setTimeout(() => {
      finalizeStrikeNow();
    }, 2250);
  };

  if (!targetCard) {
    return (
      <div className="rounded-xl bg-[#0a101d] border border-white/10 p-8 text-center">
        <div className="text-lg font-bold text-white">
          Chưa có cầu thủ đủ điều kiện nâng cấp
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Hãy mở gói thẻ trong Kho Vật Phẩm hoặc mua cầu thủ trên TTCN để bắt đầu đập thẻ.
        </p>
      </div>
    );
  }

  const targetTemplate = PLAYER_TEMPLATE_MAP[targetCard.templateId];
  const nextGrade = Math.min(MAX_CARD_GRADE, targetCard.grade + 1);
  const currentStatBoost = targetTemplate
    ? Math.max(0, targetCard.ovr - targetTemplate.baseOvr)
    : 0;
  const projectedOvr = preview?.valid
    ? preview.projectedOvr
    : targetTemplate
    ? computeCardOvr(targetTemplate.baseOvr, nextGrade)
    : targetCard.ovr + 1;
  const projectedValueBp = preview?.valid
    ? preview.projectedValueBp
    : targetTemplate
    ? computeCardValueBp(targetTemplate.baseValueBp, nextGrade)
    : targetCard.valueBp * 2;
  const nextOvrDelta = Math.max(1, projectedOvr - targetCard.ovr);

  const currentGradeStyle = getGradeBadgeStyle(targetCard.grade);
  const nextGradeStyle = getGradeBadgeStyle(nextGrade);
  const exactGaugeBars = preview?.valid ? preview.gaugePercent / 20 : 0;

  const projectedNextCard: OwnedCard = {
    ...targetCard,
    uid: `proj_${targetCard.uid}_${nextGrade}`,
    grade: nextGrade,
    ovr: projectedOvr,
    valueBp: projectedValueBp,
  };

  const statComparisonRows = targetTemplate
    ? [
        { label: 'Tốc độ', shortLabel: 'Tốc độ', cur: targetTemplate.stats.pac + currentStatBoost },
        { label: 'Dứt điểm', shortLabel: 'Sút', cur: targetTemplate.stats.sho + currentStatBoost },
        { label: 'Chuyền bóng', shortLabel: 'Chuyền', cur: targetTemplate.stats.pas + currentStatBoost },
        { label: 'Rê bóng', shortLabel: 'Rê bóng', cur: targetTemplate.stats.dri + currentStatBoost },
        { label: 'Phòng ngự', shortLabel: 'Thủ', cur: targetTemplate.stats.def + currentStatBoost },
        { label: 'Thể lực', shortLabel: 'Thể lực', cur: targetTemplate.stats.phy + currentStatBoost },
      ]
    : [];

  return (
    <div ref={containerRef} className="space-y-1.5 pb-3" data-testid="pc-upgrade-view">
      {/* Compact FC Online PC Enhancement Header Bar */}
      <div
        className={`${
          step !== 'select' ? 'fco-short-hide ' : ''
        }rounded-xl fco-pc-panel px-3 py-1.5 sm:px-4 sm:py-1.5 flex flex-col lg:flex-row lg:items-center justify-between gap-1.5`}
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h2
            className="text-base sm:text-lg font-black italic tracking-wide text-white uppercase leading-none"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            NÂNG CẤP CẦU THỦ
          </h2>
          <span className="text-xs text-slate-400 font-semibold tabular-nums">
            +1 ~ +{MAX_CARD_GRADE} · Quỹ BP:{' '}
            <strong className="text-emerald-400 font-mono">{formatBpCompact(bp)}</strong>
          </span>
          {(serverRules?.guaranteedUpgrade100 ||
            (serverRules?.upgradeRateMultiplier && serverRules.upgradeRateMultiplier > 1)) && (
            <div
              data-testid="upgrade-gm-buff-indicator"
              className="px-2 py-0.5 rounded bg-[#122416] border border-[#a3e635]/60 text-[10px] font-extrabold text-[#a3e635]"
            >
              {serverRules?.guaranteedUpgrade100
                ? 'GM BUFF: 100% ĐẬP THẺ'
                : `GM BUFF: x${serverRules?.upgradeRateMultiplier} TỈ LỆ`}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 tabular-nums">
          <button
            type="button"
            disabled={bp < 50_000_000_000}
            onClick={() => {
              const ok = onQuickBuyFodderBundle();
              if (ok) gameSound.playClick(1.15);
            }}
            className={`fco-pc-tab-skew min-h-[34px] px-3 py-1 text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 ${
              bp >= 50_000_000_000
                ? 'fco-pc-btn-primary cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <span>Mua nhanh 5 phôi CU (50 Tỷ BP)</span>
          </button>
          {onGoToMarket && (
            <button
              type="button"
              onClick={() => {
                gameSound.playClick();
                onGoToMarket();
              }}
              className="fco-pc-tab-skew min-h-[34px] px-3 py-1 fco-pc-btn-slate text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Mua phôi trên TTCN</span>
            </button>
          )}
        </div>
      </div>

      {/* STEP 1: FC ONLINE PC ENHANCEMENT WORKSTATION */}
      {step === 'select' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-stretch">
          {/* LEFT 7 COLS: PC CHAMBER STAGE + 5-BAR GAUGE + 5 FODDER SLOTS + EXECUTION BAR */}
          <div className="lg:col-span-7 rounded-xl fco-pc-panel p-2 sm:p-2.5 flex flex-col justify-between space-y-1.5">
            <div className="space-y-1.5">
              {/* Dual-Card PC Pedestal Comparison Stage */}
              <div
                data-testid="pc-dual-card-stage"
                className="rounded-xl bg-[#050912] border border-white/12 p-2 sm:p-2.5 relative overflow-hidden"
              >
                {/* PC Stadium Spotlight Glow & Subtle Carbon Grid */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none opacity-45"
                  style={{
                    backgroundImage:
                      'radial-gradient(ellipse at 50% 18%, rgba(163,230,53,0.16) 0%, rgba(56,189,248,0.06) 42%, transparent 72%)',
                  }}
                />

                {/* Top Pedestal Strip: Player Name + Value Delta */}
                <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pb-1 mb-1.5 border-b border-white/10 text-xs tabular-nums">
                  <div className="flex items-center gap-2 min-w-0">
                    {targetTemplate && (
                      <SeasonBadgeSvg season={targetTemplate.season} className="w-6 h-4 shrink-0" />
                    )}
                    <span
                      className="text-sm sm:text-base font-black uppercase tracking-wide text-white truncate"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                    >
                      {targetTemplate?.name ?? 'Cầu thủ'}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-300 font-semibold">
                      {targetTemplate?.position ?? 'ST'}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    Giá trị dự kiến:{' '}
                    <strong className="font-mono text-emerald-400">
                      {formatBpCompact(projectedValueBp)}
                    </strong>
                  </div>
                </div>

                {/* PC Dual-Card Pedestal & Central Grade Plate Conduit */}
                <div className="relative z-10 grid grid-cols-11 gap-2 sm:gap-3 items-center">
                  {/* Left: Current Card (+N) */}
                  <div className="col-span-4 flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-300 uppercase tabular-nums">
                      <span>HIỆN TẠI</span>
                      <span
                        className="px-1.5 py-0.5 rounded font-mono text-[10px] font-black"
                        style={{
                          background: currentGradeStyle.bg,
                          color: currentGradeStyle.text,
                          border: `1px solid ${currentGradeStyle.border}`,
                        }}
                      >
                        +{targetCard.grade}
                      </span>
                    </div>
                    <PlayerCardView
                      card={targetCard}
                      size="sm"
                      showStats={false}
                      showValue
                    />
                  </div>

                  {/* Center: Authentic FC Online PC Grade Step & Success Core */}
                  <div className="col-span-3 flex flex-col items-center justify-center text-center py-2 px-1.5 sm:px-2 rounded-xl bg-gradient-to-b from-[#0d1628] to-[#070b15] border border-[#a3e635]/45 tabular-nums">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <span
                        className="px-1.5 py-0.5 rounded font-mono text-[11px] font-black"
                        style={{
                          background: currentGradeStyle.bg,
                          color: currentGradeStyle.text,
                          border: `1px solid ${currentGradeStyle.border}`,
                        }}
                      >
                        +{targetCard.grade}
                      </span>
                      <span className="text-[#a3e635] font-black text-xs">➔</span>
                      <span
                        className="px-1.5 py-0.5 rounded font-mono text-[11px] font-black"
                        style={{
                          background: nextGradeStyle.bg,
                          color: nextGradeStyle.text,
                          border: `1px solid ${nextGradeStyle.border}`,
                        }}
                      >
                        +{nextGrade}
                      </span>
                    </div>

                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      TỈ LỆ THÀNH CÔNG
                    </span>
                    <div
                      className="text-2xl sm:text-3xl font-black text-[#a3e635] leading-none my-0.5"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                    >
                      {preview?.valid ? `${preview.totalSuccessChance}%` : '0%'}
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight">
                      {preview?.valid
                        ? `Gốc ${preview.baseSuccessChance}% + SVIP ${preview.vipBonusChance}%`
                        : 'Cần nạp ít nhất 1 phôi'}
                    </div>

                    <div className="mt-1.5 pt-1 border-t border-white/10 w-full text-[11px] font-mono font-bold text-white">
                      {targetCard.ovr} ➔ <span className="text-[#a3e635] font-black">{projectedOvr}</span>
                      <span className="block text-[10px] text-emerald-400 font-sans font-extrabold">
                        +{nextOvrDelta} OVR
                      </span>
                    </div>
                  </div>

                  {/* Right: Projected Card (+N+1) */}
                  <div className="col-span-4 flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#a3e635] uppercase tabular-nums">
                      <span>DỰ KIẾN</span>
                      <span
                        className="px-1.5 py-0.5 rounded font-mono text-[10px] font-black"
                        style={{
                          background: nextGradeStyle.bg,
                          color: nextGradeStyle.text,
                          border: `1px solid ${nextGradeStyle.border}`,
                        }}
                      >
                        +{nextGrade}
                      </span>
                    </div>
                    <PlayerCardView
                      card={projectedNextCard}
                      size="sm"
                      showStats={false}
                      showValue
                    />
                  </div>
                </div>

                {/* PC Attribute Diff Table (6 Core Stats: Old -> New +Delta) */}
                <div className="relative z-10 mt-1.5 pt-1.5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-3 gap-1 text-[11px] tabular-nums">
                  {statComparisonRows.map((row) => (
                    <div
                      key={row.label}
                      className="px-2 py-0.5 rounded bg-[#09101d] border border-white/8 flex items-center justify-between gap-1"
                    >
                      <span className="text-slate-400 whitespace-nowrap">
                        <span className="sm:hidden">{row.shortLabel}</span>
                        <span className="hidden sm:inline">{row.label}</span>
                      </span>
                      <span className="font-mono font-bold shrink-0">
                        <span className="text-slate-400">{row.cur}</span>
                        <span className="text-slate-600 mx-0.5">➔</span>
                        <span className="text-white">{row.cur + nextOvrDelta}</span>{' '}
                        <span className="text-[#a3e635] text-[10px]">(+{nextOvrDelta})</span>
                      </span>
                    </div>
                  ))}
                </div>

                {targetTemplate?.goldTraits && targetTemplate.goldTraits.length > 0 && (
                  <div className="relative z-10 mt-1 pt-1 border-t border-white/8 flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-[11px] font-bold text-amber-300">Chỉ số ẩn:</span>
                    <TraitBadges
                      traits={targetTemplate.goldTraits}
                      variant="compact"
                      maxItems={5}
                    />
                  </div>
                )}
              </div>

              {/* Iconic FC Online PC 5-Bar Segmented Probability Gauge */}
              <div className="rounded-xl bg-[#050912] border border-white/10 px-2.5 py-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] sm:text-xs mb-1 tabular-nums">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-extrabold text-slate-200 tracking-wide">
                      <span className="sm:hidden">THANH NĂNG LƯỢNG (5 VẠCH)</span>
                      <span className="hidden sm:inline">THANH NĂNG LƯỢNG NÂNG CẤP (5 VẠCH PC)</span>
                    </span>
                    <span className="font-mono text-[#a3e635] font-extrabold whitespace-nowrap">
                      {exactGaugeBars.toFixed(2)} / 5.00 Vạch ({preview?.gaugePercent ?? 0}%)
                    </span>
                  </div>
                  <span className="text-amber-300 font-semibold whitespace-nowrap">
                    SVIP {vipLevel}: +{preview?.vipBonusChance ?? 0}% tỉ lệ
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((bar) => {
                    const segPct = Math.min(
                      100,
                      Math.max(0, Math.round((exactGaugeBars - (bar - 1)) * 100))
                    );
                    const isFull = segPct >= 100;
                    return (
                      <div key={bar} className="space-y-0.5">
                        <div className="relative h-2.5 rounded-sm bg-[#0b1220] border border-white/15 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-150 ${
                              exactGaugeBars >= 5
                                ? 'bg-gradient-to-r from-[#a3e635] via-[#bef264] to-amber-300'
                                : isFull
                                ? 'bg-gradient-to-r from-[#65a30d] to-[#a3e635]'
                                : 'bg-gradient-to-r from-amber-500 to-[#a3e635]'
                            }`}
                            style={{ width: `${segPct}%` }}
                          />
                          {/* Micro Quarter-Ticks like FC Online PC Gauge */}
                          <div
                            aria-hidden="true"
                            className="absolute inset-0 grid grid-cols-4 pointer-events-none"
                          >
                            <span className="border-r border-black/35" />
                            <span className="border-r border-black/35" />
                            <span className="border-r border-black/35" />
                            <span />
                          </div>
                        </div>
                        <div className="text-[9px] leading-none text-center font-mono text-slate-500 tabular-nums">
                          {bar}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 5 Portrait Material Fodder Slots (Synced 1:1 with the 5 Bars above) */}
              <div className="rounded-xl bg-[#050912] border border-white/10 px-2.5 py-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-extrabold text-slate-200 tabular-nums">
                    CẦU THỦ NGUYÊN LIỆU ({selectedFodders.length}/{MAX_FODDER_COUNT} PHÔI)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="auto-fill-fodder-btn"
                      onClick={handleAutoPickFodder}
                      disabled={availableFodders.length === 0 || selectedFodders.length >= MAX_FODDER_COUNT}
                      className="min-h-[28px] px-2.5 py-0.5 rounded bg-[#142312] border border-[#a3e635]/50 text-[11px] font-extrabold text-[#a3e635] hover:bg-[#1b3118] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      Tự động nạp phôi
                    </button>
                    {selectedFodders.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          gameSound.playClick(0.9);
                          setFodderUids([]);
                        }}
                        className="min-h-[28px] px-2 py-0.5 text-[11px] text-slate-400 hover:text-white cursor-pointer whitespace-nowrap"
                      >
                        Xóa hết
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: MAX_FODDER_COUNT }).map((_, slotIdx) => {
                    const fodder = selectedFodders[slotIdx];
                    const fTpl = fodder ? PLAYER_TEMPLATE_MAP[fodder.templateId] : null;
                    const gBadge = fodder ? getGradeBadgeStyle(fodder.grade) : null;
                    return fodder && fTpl && gBadge ? (
                      <button
                        key={fodder.uid}
                        type="button"
                        onClick={() => toggleFodder(fodder.uid)}
                        aria-label={`Bỏ chọn phôi ${fTpl.shortName}`}
                        className="group relative rounded-lg bg-[#0e192d] border border-[#a3e635]/75 p-1 flex flex-col items-center text-center hover:bg-slate-800 cursor-pointer min-h-[68px]"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-900 border border-white/25 text-[10px] leading-none flex items-center justify-center text-slate-300 group-hover:bg-rose-600 group-hover:text-white"
                        >
                          ×
                        </span>
                        <div className="w-full flex items-center justify-between gap-1 text-[10px] tabular-nums leading-none">
                          <strong className="text-[#a3e635]">{fodder.ovr}</strong>
                          <SeasonBadgeSvg season={fTpl.season} className="w-3.5 h-2.5 shrink-0" />
                        </div>
                        <img
                          src={fodder.customMinifaceUrl || fTpl.minifaceUrl}
                          alt={fTpl.shortName}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 object-contain object-bottom my-0.5"
                        />
                        <div className="w-full text-[10px] font-semibold text-white truncate leading-tight">
                          {fTpl.shortName}
                        </div>
                        <span
                          className="mt-0.5 px-1.5 rounded text-[9px] font-extrabold tabular-nums leading-tight"
                          style={{
                            background: gBadge.bg,
                            color: gBadge.text,
                            border: `1px solid ${gBadge.border}`,
                          }}
                        >
                          +{fodder.grade}
                        </span>
                      </button>
                    ) : (
                      <button
                        key={`empty_${slotIdx}`}
                        type="button"
                        onClick={() => setDrawerTab('fodders')}
                        className="min-h-[68px] rounded-lg border border-dashed border-white/15 bg-[#080e1a] hover:border-[#a3e635]/50 flex flex-col items-center justify-center text-[11px] text-slate-500 tabular-nums cursor-pointer"
                      >
                        <span className="text-sm leading-none text-slate-600 mb-0.5">+</span>
                        <span>Phôi {slotIdx + 1}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* +8 AND ABOVE BP GRADE PROTECTION SHIELD */}
              <div
                data-testid="bp-protection-panel"
                className={`rounded-xl px-2.5 py-1.5 border transition-colors ${
                  eligibleForBpProtection
                    ? activeBpProtection
                      ? 'bg-[#0c1e16] border-emerald-400/60'
                      : 'bg-[#17130a] border-amber-400/50'
                    : 'bg-[#050912] border-white/10'
                }`}
              >
                {eligibleForBpProtection ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-xs font-extrabold text-amber-300">
                        KHIÊN BẢO VỆ CẤP BẰNG BP (+{targetCard.grade} ➔ +{nextGrade})
                      </div>
                      <div className="text-[11px] text-slate-300 tabular-nums">
                        Phí bảo vệ:{' '}
                        <strong className="font-mono text-emerald-400">
                          {formatBpCompact(protectionCostBp)}
                        </strong>{' '}
                        ·{' '}
                        {canAffordProtection
                          ? `Giữ nguyên cấp +${targetCard.grade} nếu đập thất bại`
                          : 'Không đủ quỹ BP để bật bảo vệ'}
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid="bp-protection-toggle"
                      aria-pressed={activeBpProtection}
                      disabled={!canAffordProtection}
                      onClick={() => {
                        gameSound.playClick(1.1);
                        setUseBpProtection((prev) => !prev);
                      }}
                      className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 ${
                        !canAffordProtection
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : activeBpProtection
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer'
                          : 'bg-slate-800 hover:bg-slate-700 border border-amber-400/50 text-amber-300 cursor-pointer'
                      }`}
                    >
                      {!canAffordProtection
                        ? 'Thiếu BP bảo vệ'
                        : activeBpProtection
                        ? `ĐANG BẬT BẢO VỆ +${targetCard.grade}`
                        : `Bật Bảo Vệ BP (+${targetCard.grade})`}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                    <div className="text-slate-400">
                      <strong className="text-amber-300">Bảo vệ chống rớt cấp BP:</strong> Cho thẻ từ{' '}
                      <strong className="text-white">+{BP_PROTECTION_MIN_GRADE}</strong> trở lên (+8 ~ +13).{' '}
                      {targetCard.grade > 1
                        ? `Thẻ +${targetCard.grade} rớt (+1 ~ +${targetCard.grade - 1}) nếu xịt.`
                        : 'Thẻ +1 không bị rớt cấp.'}
                    </div>
                    {highGradeCandidate && (
                      <button
                        type="button"
                        onClick={() => {
                          gameSound.playClick(1.1);
                          setTargetUid(highGradeCandidate.uid);
                          setUseBpProtection(true);
                          setFodderUids((prev) =>
                            prev.filter((id) => id !== highGradeCandidate.uid)
                          );
                        }}
                        className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 font-bold text-[11px] cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Chọn thẻ +{highGradeCandidate.grade} →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* PC Primary Execution Footer */}
            <div className="pt-1.5 border-t border-white/10 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <label className="inline-flex items-center gap-2 text-slate-300 font-semibold cursor-pointer select-none min-h-[24px]">
                  <input
                    type="checkbox"
                    checked={skipAnimation}
                    onChange={(e) => setSkipAnimation(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-[#a3e635]"
                  />
                  <span>Bỏ qua hoạt ảnh đập thẻ (Nhận kết quả ngay)</span>
                </label>
                <span className="text-slate-400 tabular-nums">
                  {preview?.valid
                    ? `Tỉ lệ kích hoạt: ${preview.totalSuccessChance}%`
                    : 'Hãy nạp tối thiểu 1 phôi để bắt đầu'}
                </span>
              </div>

              <div className="grid grid-cols-12 gap-2.5">
                <button
                  type="button"
                  data-testid="pc-trigger-upgrade-btn"
                  disabled={!preview?.valid}
                  onClick={() => startChamberStrike(0.1)}
                  className={`col-span-7 fco-pc-tab-skew min-h-[44px] lg:min-h-[40px] py-1.5 px-3 font-extrabold text-xs sm:text-sm tracking-wide transition-colors whitespace-nowrap tabular-nums ${
                    preview?.valid
                      ? 'fco-pc-btn-primary cursor-pointer shadow-lg'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span>
                    {targetCard.grade >= MAX_CARD_GRADE
                      ? `ĐÃ ĐẠT TỐI ĐA +${MAX_CARD_GRADE}`
                      : `NÂNG CẤP (+${nextGrade})`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!preview?.valid}
                  onClick={() => {
                    gameSound.playClick(1.2);
                    setStep('rhythm');
                  }}
                  className={`col-span-5 fco-pc-tab-skew min-h-[44px] lg:min-h-[40px] py-1.5 px-2.5 font-bold text-xs sm:text-sm tracking-wide transition-colors whitespace-nowrap ${
                    preview?.valid
                      ? 'fco-pc-btn-gold cursor-pointer shadow-lg'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span>Canh Tâm Vàng (+5%)</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT 5 COLS: DOCKED PC ROSTER & FODDER DRAWER */}
          <div className="lg:col-span-5 rounded-xl fco-pc-panel p-2.5 sm:p-3 flex flex-col justify-between space-y-2">
            <div className="space-y-1.5">
              {/* 2-Tab Segmented Switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[#050912] border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    gameSound.playClick();
                    setDrawerTab('fodders');
                  }}
                  className={`min-h-[40px] py-2 px-2 rounded-md text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    drawerTab === 'fodders'
                      ? 'fco-pc-btn-primary'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span>Phôi Nguyên Liệu ({availableFodders.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    gameSound.playClick();
                    setDrawerTab('targets');
                  }}
                  className={`min-h-[40px] py-2 px-2 rounded-md text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    drawerTab === 'targets'
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span>Đổi Cầu Thủ ({upgradeableCards.length})</span>
                </button>
              </div>

              {/* Search + Position Filter + Sort Controls (Interactive PC Roster Toolbar) */}
              <input
                type="search"
                value={drawerQuery}
                onChange={(e) => setDrawerQuery(e.target.value)}
                placeholder={
                  drawerTab === 'fodders'
                    ? 'Tìm cầu thủ làm phôi (tên, mùa, +cấp)...'
                    : 'Tìm cầu thủ trong CLB cần đập thẻ...'
                }
                aria-label="Tìm kiếm cầu thủ trong phòng nâng cấp"
                className="w-full min-h-[40px] rounded-md bg-[#050912] border border-white/15 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#a3e635]"
              />

              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1 bg-[#050912] p-1 rounded-md border border-white/10">
                  {(['ALL', 'FW', 'MF', 'DF', 'GK'] as RosterPosFilter[]).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => {
                        gameSound.playClick(0.95);
                        setPosFilter(pos);
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        posFilter === pos
                          ? 'bg-[#a3e635] text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {pos === 'ALL' ? 'Tất cả' : pos}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-[#050912] p-1 rounded-md border border-white/10">
                  <button
                    type="button"
                    onClick={() => setSortMode('ovr_asc')}
                    className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                      sortMode === 'ovr_asc' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    OVR ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortMode('ovr_desc')}
                    className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                      sortMode === 'ovr_desc' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    OVR ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortMode('val_asc')}
                    className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                      sortMode === 'val_asc' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Giá ↑
                  </button>
                </div>
              </div>

              {/* Roster List Body */}
              {drawerTab === 'fodders' ? (
                filteredFodders.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                    <div>Không có cầu thủ phôi phù hợp bộ lọc.</div>
                    <div>Ấn &ldquo;Mua nhanh 5 phôi CU (50 Tỷ BP)&rdquo; ở trên để nạp phôi ngay!</div>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[340px] lg:max-h-[405px] overflow-y-auto fco-touch-scroll pr-1">
                    {filteredFodders.map((fCard) => {
                      const fTpl = PLAYER_TEMPLATE_MAP[fCard.templateId];
                      if (!fTpl) return null;
                      const isPicked = fodderUids.includes(fCard.uid);
                      const gBadge = getGradeBadgeStyle(fCard.grade);
                      const gaugeGain = estimateFodderGaugeContribution(targetCard.ovr, fCard.ovr);

                      return (
                        <button
                          key={`fodder_row_${fCard.uid}`}
                          type="button"
                          onClick={() => toggleFodder(fCard.uid)}
                          className={`w-full min-h-[54px] px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                            isPicked
                              ? 'bg-[#122417] border-[#a3e635] text-white'
                              : 'bg-[#060a13] border-white/8 hover:border-white/25 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={fCard.customMinifaceUrl || fTpl.minifaceUrl}
                              alt={fTpl.shortName}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded bg-slate-950 border border-white/10 object-contain object-bottom shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <SeasonBadgeSvg season={fTpl.season} className="w-5 h-3.5 shrink-0" />
                                <span className="text-xs font-bold text-white truncate">
                                  {fTpl.name}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 tabular-nums">
                                {fTpl.position} · OVR <strong className="text-white">{fCard.ovr}</strong> ·{' '}
                                {formatBpCompact(fCard.valueBp)} ·{' '}
                                <span className="text-[#a3e635] font-semibold">
                                  +{gaugeGain.bars.toFixed(2)} vạch
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 tabular-nums">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-extrabold"
                              style={{
                                background: gBadge.bg,
                                color: gBadge.text,
                                border: `1px solid ${gBadge.border}`,
                              }}
                            >
                              +{fCard.grade}
                            </span>
                            <span
                              className={`px-2 py-1 rounded text-[10px] font-extrabold ${
                                isPicked
                                  ? 'bg-[#a3e635] text-slate-950'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {isPicked ? 'ĐÃ NẠP' : 'Nạp'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="space-y-1.5 max-h-[340px] lg:max-h-[405px] overflow-y-auto fco-touch-scroll pr-1">
                  {filteredTargets.map((tCard) => {
                    const tTpl = PLAYER_TEMPLATE_MAP[tCard.templateId];
                    if (!tTpl) return null;
                    const isCurrent = tCard.uid === targetCard.uid;
                    const gBadge = getGradeBadgeStyle(tCard.grade);

                    return (
                      <button
                        key={`target_row_${tCard.uid}`}
                        type="button"
                        onClick={() => {
                          gameSound.playClick();
                          setTargetUid(tCard.uid);
                          setFodderUids((prev) => prev.filter((id) => id !== tCard.uid));
                          setDrawerTab('fodders');
                        }}
                        className={`w-full min-h-[56px] px-3 py-2 rounded-lg border flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-amber-500/15 border-amber-400 text-white'
                            : 'bg-[#060a13] border-white/8 hover:border-white/25 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={tCard.customMinifaceUrl || tTpl.minifaceUrl}
                            alt={tTpl.shortName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded bg-slate-950 border border-white/10 object-contain object-bottom shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <SeasonBadgeSvg season={tTpl.season} className="w-5 h-3.5 shrink-0" />
                              <span className="text-xs font-bold text-white truncate">
                                {tTpl.name}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 tabular-nums">
                              <ClubCrestSvg clubCode={tTpl.clubCode} className="w-3.5 h-3.5 shrink-0" />
                              <span>{tTpl.position}</span>
                              <span aria-hidden="true">·</span>
                              <span>OVR {tCard.ovr}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatBpCompact(tCard.valueBp)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 tabular-nums">
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-extrabold"
                            style={{
                              background: gBadge.bg,
                              color: gBadge.text,
                              border: `1px solid ${gBadge.border}`,
                            }}
                          >
                            +{tCard.grade}
                          </span>
                          <span className="text-[11px] font-bold text-amber-300">
                            {isCurrent ? 'Đang chọn' : 'Chọn đập'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between tabular-nums">
              <span>Tổng cầu thủ CLB: {cards.length}</span>
              <span>Giới hạn phôi mỗi lần: {MAX_FODDER_COUNT} thẻ</span>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: FC ONLINE PC ENHANCEMENT TENSION & PRECISION RHYTHM CHAMBER */}
      {step === 'rhythm' && preview && (
        <div
          data-testid="upgrade-rhythm-stage"
          data-strike-phase={isStriking ? strikePhase : 'ready'}
          className="fco-short-panel rounded-xl bg-[#050912] border border-[#a3e635]/50 px-3 sm:px-6 py-2.5 sm:py-3.5 flex flex-col items-center relative overflow-hidden shadow-2xl"
        >
          {/* Ambient Chamber Spotlight */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background: isStriking
                ? strikePhase === 'climax'
                  ? 'radial-gradient(circle at 50% 42%, rgba(250,204,21,0.34) 0%, rgba(163,230,53,0.18) 38%, rgba(5,9,18,0.96) 76%)'
                  : strikePhase === 'compress'
                  ? 'radial-gradient(circle at 50% 42%, rgba(163,230,53,0.28) 0%, rgba(56,189,248,0.14) 42%, rgba(5,9,18,0.96) 78%)'
                  : 'radial-gradient(circle at 50% 42%, rgba(56,189,248,0.22) 0%, rgba(163,230,53,0.12) 40%, rgba(5,9,18,0.96) 78%)'
                : 'radial-gradient(circle at 50% 42%, rgba(163,230,53,0.14) 0%, rgba(5,9,18,0.96) 74%)',
            }}
          />

          {isStriking && (
            <>
              <div
                aria-hidden="true"
                className="fco-chamber-orbit absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-24 w-64 h-64 sm:w-72 sm:h-72 rounded-full border-2 border-dashed border-[#a3e635]/55 pointer-events-none"
                style={{
                  boxShadow:
                    strikePhase === 'climax'
                      ? '0 0 55px rgba(250,204,21,0.55), inset 0 0 36px rgba(163,230,53,0.35)'
                      : '0 0 32px rgba(163,230,53,0.3)',
                }}
              />
              <div
                aria-hidden="true"
                className="fco-laser-pulse absolute inset-x-8 top-1/2 -translate-y-20 h-1 bg-gradient-to-r from-transparent via-[#a3e635] to-transparent pointer-events-none"
              />
              <div
                aria-hidden="true"
                className="fco-laser-pulse absolute inset-x-8 top-1/2 translate-y-10 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent pointer-events-none"
              />
              {strikePhase === 'climax' && (
                <div
                  aria-hidden="true"
                  className="fco-laser-pulse absolute inset-0 bg-gradient-to-b from-amber-300/15 via-white/20 to-[#a3e635]/15 pointer-events-none z-20"
                />
              )}
            </>
          )}

          <div className="text-center mb-1 sm:mb-1.5 relative z-20">
            <div className="text-[11px] sm:text-xs font-extrabold tracking-widest text-[#a3e635]">
              {isStriking
                ? strikePhase === 'absorb'
                  ? 'GIAI ĐOẠN 1/3 · HẤP THỤ PHÔI NGUYÊN LIỆU VÀO LÕI THẺ...'
                  : strikePhase === 'compress'
                  ? 'GIAI ĐOẠN 2/3 · MÁY ÉP THỦY LỰC KHÓA CẤP ĐỘ & KÍCH HOẠT TỈ LỆ...'
                  : 'GIAI ĐOẠN 3/3 · BÙNG NỔ NĂNG LƯỢNG · MỞ KẾT QUẢ!'
                : 'BUỒNG ĐẬP THẺ FC ONLINE PC · CANH NHỊP TÂM VÀNG (+5%)'}
            </div>
            <div className="text-xs sm:text-sm text-slate-300 mt-0.5 tabular-nums">
              {targetTemplate?.name} (+{targetCard.grade} ➔ +{preview.nextGrade}) · Tỉ lệ gốc{' '}
              <strong className="text-amber-300">{preview.totalSuccessChance}%</strong> ·{' '}
              {activeBpProtection ? (
                <strong className="text-emerald-400">
                  Khiên BP (+{targetCard.grade} · {formatBpCompact(protectionCostBp)})
                </strong>
              ) : targetCard.grade > 1 ? (
                <span className="text-rose-400 font-semibold">
                  Thất bại rớt (+1 ~ +{targetCard.grade - 1})
                </span>
              ) : (
                <span className="text-slate-300">Giữ mức +1 nếu thất bại</span>
              )}
            </div>
          </div>

          <div className="relative z-10 inline-flex items-center justify-center my-0.5">
            {isStriking && (strikePhase === 'compress' || strikePhase === 'climax') && (
              <>
                <div
                  aria-hidden="true"
                  className="fco-piston-top absolute -top-2.5 left-1/2 -translate-x-1/2 w-52 sm:w-60 h-2.5 rounded-b-lg bg-gradient-to-b from-slate-700 via-slate-800 to-[#a3e635] border-b-2 border-[#bef264] shadow-[0_6px_22px_rgba(163,230,53,0.65)] pointer-events-none z-20"
                />
                <div
                  aria-hidden="true"
                  className="fco-piston-bottom absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-52 sm:w-60 h-2.5 rounded-t-lg bg-gradient-to-t from-slate-700 via-slate-800 to-amber-400 border-t-2 border-amber-300 shadow-[0_-6px_22px_rgba(250,204,21,0.65)] pointer-events-none z-20"
                />
              </>
            )}

            <div
              data-testid="zoomed-target-card"
              data-shaking={isStriking ? 'true' : 'false'}
              className={`fco-short-chamber-card relative z-10 transition-transform duration-300 ${
                isStriking
                  ? strikePhase === 'absorb'
                    ? 'scale-[0.76] sm:scale-[0.84] lg:scale-[0.86] -my-5 sm:-my-4 lg:-my-3 drop-shadow-[0_0_28px_rgba(56,189,248,0.75)]'
                    : 'scale-[0.78] sm:scale-[0.86] lg:scale-[0.88] -my-5 sm:-my-4 lg:-my-3 fco-upgrade-shake drop-shadow-[0_0_48px_rgba(250,204,21,0.9)]'
                  : 'scale-[0.76] sm:scale-[0.84] lg:scale-[0.86] -my-5 sm:-my-4 lg:-my-3'
              }`}
            >
              <PlayerCardView
                card={targetCard}
                size="lg"
                showStats
                showValue
                badgeNote={
                  isStriking
                    ? strikePhase === 'absorb'
                      ? 'HẤP THỤ PHÔI...'
                      : strikePhase === 'compress'
                      ? 'ĐANG ÉP CẤP...'
                      : 'SẮP LỘ DIỆN!'
                    : `MỤC TIÊU +${preview.nextGrade}`
                }
              />
            </div>
          </div>

          <div className="w-full max-w-2xl mt-1 relative z-10">
            {isStriking ? (
              <div className="mb-1.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                  <span>Áp suất máy ép nâng cấp</span>
                  <span className="tabular-nums">
                    {strikePhase === 'absorb' ? '60%' : strikePhase === 'compress' ? '92%' : '100%'}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 h-2.5">
                  {[1, 2, 3, 4, 5].map((bar) => {
                    const active =
                      strikePhase === 'climax' ||
                      (strikePhase === 'compress' && bar <= 4) ||
                      (strikePhase === 'absorb' && bar <= 2);
                    return (
                      <div
                        key={bar}
                        className={`rounded-sm transition-all duration-300 ${
                          active
                            ? bar >= 4
                              ? 'bg-gradient-to-r from-amber-400 to-[#bef264] shadow-[0_0_12px_rgba(250,204,21,0.75)]'
                              : 'bg-gradient-to-r from-sky-400 to-[#a3e635] shadow-[0_0_10px_rgba(163,230,53,0.65)]'
                            : 'bg-slate-800/80 border border-white/10'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-400 mb-1">
                  <span>{selectedFodders.length} nguyên liệu nạp nhịp</span>
                  <span className="text-amber-300 font-semibold">
                    Chốt vào vùng sáng giữa để nhận +5% tỉ lệ! [Space]
                  </span>
                </div>

                <div className="relative h-3 rounded-full bg-slate-900 border border-white/15 mb-1.5 flex items-center justify-center overflow-hidden">
                  <div className="w-24 h-full bg-amber-400/25 border-x-2 border-amber-300" />
                  <div
                    ref={indicatorDotRef}
                    className="absolute w-3 h-3 rounded-full bg-[#a3e635] shadow-[0_0_12px_#a3e635]"
                  />
                </div>
              </>
            )}

            <div className="fco-short-fodder-tray relative w-full py-1 rounded-xl bg-slate-950/90 border border-white/10 overflow-hidden flex items-center justify-center min-h-[78px] sm:min-h-[90px]">
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-24 border-x border-dashed border-amber-300/60 bg-amber-400/5 pointer-events-none"
              />

              <div
                ref={fodderGliderRef}
                data-testid="oscillating-fodder-row"
                className={`flex items-center justify-center gap-2 will-change-transform ${
                  isStriking ? 'fco-fodder-converge' : ''
                }`}
              >
                {selectedFodders.map((fodder) => (
                  <div
                    key={`rhythm_${fodder.uid}`}
                    className="scale-[0.58] sm:scale-[0.66] origin-center -my-6 sm:-my-5 relative"
                  >
                    {isStriking && (
                      <div
                        aria-hidden="true"
                        className="absolute -top-8 left-1/2 -translate-x-1/2 w-2 h-16 bg-gradient-to-t from-[#a3e635] via-amber-300 to-transparent blur-[1px] pointer-events-none"
                      />
                    )}
                    <PlayerCardView card={fodder} size="sm" showValue={false} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2.5 relative z-10">
            {!isStriking ? (
              <>
                <button
                  type="button"
                  onClick={() => startChamberStrike(rhythmOffsetRef.current, false)}
                  className="fco-pc-tab-skew min-h-[44px] px-7 py-2 fco-pc-btn-primary font-extrabold text-sm sm:text-base tracking-wide shadow-lg cursor-pointer whitespace-nowrap"
                >
                  <span>Chốt nhịp &amp; Đập thẻ</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    gameSound.playClick(0.9);
                    setStep('select');
                  }}
                  className="min-h-[44px] px-5 py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-white/15 text-slate-100 font-semibold text-sm sm:text-base transition-colors cursor-pointer whitespace-nowrap"
                >
                  Quay lại bàn nâng cấp
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="skip-strike-anim-btn"
                onClick={finalizeStrikeNow}
                className="min-h-[44px] px-7 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm tracking-wide shadow-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Bỏ qua hoạt ảnh (Xem kết quả ngay)
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: FC ONLINE PC ENHANCEMENT RESULT REVEAL */}
      {step === 'result' && outcome && (() => {
        const isHighGradeCelebration = outcome.succeeded && outcome.newGrade >= 8;
        const isEliteTier = outcome.succeeded && outcome.newGrade >= 11;
        const prevPlate = getGradeBadgeStyle(outcome.previousGrade);
        const newPlate = getGradeBadgeStyle(outcome.newGrade);

        return (
          <div
            data-testid="upgrade-result-panel"
            className={`fco-short-panel rounded-xl p-4 sm:p-6 border relative overflow-hidden shadow-2xl ${
              isHighGradeCelebration
                ? isEliteTier
                  ? 'fco-pc-panel-glow border-amber-300/80'
                  : 'fco-pc-panel-glow border-[#a3e635]/80'
                : outcome.succeeded
                ? 'bg-[#091813] border-[#a3e635]/70'
                : outcome.usedBpProtection
                ? 'bg-[#0b1c15] border-emerald-400/70'
                : 'bg-[#170b10] border-rose-500/55'
            }`}
          >
            {/* Initial Transient Impact Flash */}
            <div
              aria-hidden="true"
              className="fco-impact-flash absolute inset-0 pointer-events-none z-20"
              style={{
                background: outcome.succeeded
                  ? 'radial-gradient(circle at 40% 50%, rgba(254,240,138,0.8) 0%, rgba(163,230,53,0.35) 50%, transparent 80%)'
                  : outcome.usedBpProtection
                  ? 'radial-gradient(circle at 40% 50%, rgba(52,211,153,0.65) 0%, transparent 72%)'
                  : 'radial-gradient(circle at 40% 50%, rgba(244,63,94,0.55) 0%, transparent 72%)',
              }}
            />

            {/* Shatter Fracture Overlay on Unprotected Failure */}
            {!outcome.succeeded && !outcome.usedBpProtection && (
              <svg
                viewBox="0 0 800 320"
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none z-10"
              >
                <path
                  d="M240 0 L285 95 L220 155 L295 230 L260 320 M520 0 L470 110 L540 180 L480 265 L510 320 M140 165 L260 140 L375 180"
                  stroke="#fb7185"
                  strokeWidth="2.5"
                  fill="none"
                />
              </svg>
            )}

            {/* High-Grade (+8 and above) Stadium Confetti & Pyrotechnics */}
            {isHighGradeCelebration && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none z-10"
                  style={{
                    background: isEliteTier
                      ? 'radial-gradient(circle at 38% 52%, rgba(250,204,21,0.22) 0%, rgba(251,113,133,0.12) 38%, transparent 72%)'
                      : 'radial-gradient(circle at 38% 52%, rgba(163,230,53,0.2) 0%, rgba(250,204,21,0.12) 40%, transparent 72%)',
                  }}
                />
                <UpgradeConfettiCanvas
                  key={`${outcome.updatedCard.uid}_${outcome.newGrade}_${outcome.newValueBp}`}
                  grade={outcome.newGrade}
                />
              </>
            )}

            <div className="relative z-30 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 max-w-4xl mx-auto">
              {/* Left: Slammed Result Card Showcase + Shockwave Ring */}
              <div className="fco-short-compact-card shrink-0 relative flex items-center justify-center scale-[0.76] sm:scale-100 -my-8 sm:my-0 origin-center">
                <div
                  aria-hidden="true"
                  className="fco-shockwave-ring absolute inset-2 rounded-full border-2 pointer-events-none"
                  style={{
                    borderColor: outcome.succeeded
                      ? '#a3e635'
                      : outcome.usedBpProtection
                      ? '#34d399'
                      : '#f43f5e',
                  }}
                />
                <div className="fco-walkout-slam relative">
                  <PlayerCardView card={outcome.updatedCard} size="lg" showStats showValue />
                </div>
              </div>

              {/* Right: PC Grade Transition Stamp & Continuation */}
              <div className="flex-1 min-w-0 flex flex-col items-center sm:items-start text-center sm:text-left space-y-2.5">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px] font-bold tracking-widest uppercase">
                  <span className="text-slate-400">KẾT QUẢ NÂNG CẤP CẦU THỦ</span>
                  {isHighGradeCelebration && (
                    <>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span
                        data-testid="upgrade-high-grade-celebration"
                        className={isEliteTier ? 'text-amber-300 font-black' : 'text-[#a3e635] font-black'}
                      >
                        {outcome.newGrade >= 11
                          ? `SIÊU PHẨM HUYỀN THOẠI +${outcome.newGrade}`
                          : `THĂNG CẤP ĐỈNH CAO +${outcome.newGrade}`}
                      </span>
                    </>
                  )}
                </div>

                {/* Iconic FC Online PC Grade Step Plate Slam */}
                <div className="fco-grade-slam inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg bg-slate-950/90 border border-white/15 shadow-lg tabular-nums">
                  <span
                    className="px-2.5 py-0.5 rounded font-mono text-sm font-black"
                    style={{
                      background: prevPlate.bg,
                      color: prevPlate.text,
                      border: `1px solid ${prevPlate.border}`,
                    }}
                  >
                    +{outcome.previousGrade}
                  </span>
                  <span className={outcome.succeeded ? 'text-[#a3e635] font-black' : 'text-rose-400 font-black'}>
                    ➔
                  </span>
                  <span
                    className="px-3 py-0.5 rounded font-mono text-base font-black"
                    style={{
                      background: newPlate.bg,
                      color: newPlate.text,
                      border: `1px solid ${newPlate.border}`,
                    }}
                  >
                    +{outcome.newGrade}
                  </span>
                  <span className="text-xs font-extrabold text-white">
                    {outcome.succeeded
                      ? `OVR ${outcome.updatedCard.ovr}`
                      : outcome.usedBpProtection
                      ? 'KHIÊN BP GIỮ CẤP'
                      : `OVR ${outcome.updatedCard.ovr}`}
                  </span>
                </div>

                <div
                  className={`text-2xl sm:text-4xl font-bold italic tracking-wide leading-tight ${
                    isEliteTier
                      ? 'fco-text-gold'
                      : outcome.succeeded
                      ? 'text-[#a3e635]'
                      : outcome.usedBpProtection
                      ? 'text-emerald-300'
                      : 'text-rose-400'
                  }`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {outcome.succeeded
                    ? `NÂNG CẤP THÀNH CÔNG (+${outcome.previousGrade} ➔ +${outcome.newGrade})!`
                    : outcome.usedBpProtection
                    ? `BẢO VỆ BP GIỮ NGUYÊN CẤP +${outcome.newGrade}!`
                    : outcome.previousGrade > 1
                    ? `NÂNG CẤP THẤT BẠI · RỚT VỀ +${outcome.newGrade} (TỪ +${outcome.previousGrade})`
                    : 'NÂNG CẤP THẤT BẠI · GIỮ NGUYÊN MỨC +1'}
                </div>

                <div className="grid grid-cols-2 gap-2 w-full max-w-md text-xs tabular-nums">
                  <div className="px-3 py-2 rounded-lg bg-slate-950/70 border border-white/10">
                    <div className="text-slate-400">Tỉ lệ thực tế</div>
                    <div className="font-mono font-bold text-white mt-0.5">
                      {outcome.effectiveChance.toFixed(1)}%{' '}
                      {outcome.rhythmSweetSpot && (
                        <span className="text-amber-300 text-[10px]">(Tâm Vàng +5%)</span>
                      )}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-950/70 border border-white/10">
                    <div className="text-slate-400">Giá trị thẻ hiện tại</div>
                    <div className="font-mono font-bold text-emerald-400 mt-0.5">
                      {formatBpCompact(outcome.newValueBp)}
                    </div>
                  </div>
                </div>

                {outcome.usedBpProtection && (
                  <p className="text-xs text-emerald-300 tabular-nums">
                    Đã kích hoạt Khiên Bảo Vệ BP (-{formatBpCompact(outcome.protectionCostBp)}) giữ nguyên cấp +{outcome.newGrade}.
                  </p>
                )}

                <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      gameSound.playClick();
                      setOutcome(null);
                      setStep('select');
                    }}
                    className="fco-pc-btn-primary fco-pc-tab-skew min-h-[44px] px-6 py-2 rounded-sm text-xs sm:text-sm cursor-pointer whitespace-nowrap"
                  >
                    <span>Tiếp tục đập thẻ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      gameSound.playClick(0.95);
                      setOutcome(null);
                      setDrawerTab('targets');
                      setStep('select');
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-white/15 text-xs sm:text-sm font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
                  >
                    Đổi cầu thủ khác
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
