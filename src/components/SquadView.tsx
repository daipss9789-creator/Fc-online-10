import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PLAYER_TEMPLATES, PLAYER_TEMPLATE_MAP } from '../game/catalog';
import {
  calculateSquadSummary,
  computeCardOvr,
  computeCardValueBp,
  formatBpCompact,
  formatCardSerial,
  isSerializedSeason,
} from '../game/rules';
import { gameSound } from '../game/sound';
import {
  ALL_FORMATIONS,
  ALL_TEAM_COLORS,
  FORMATION_CATALOG,
  FormationFamily,
  LineGroup,
  TeamColorDefinition,
  buildFormationLineup,
  computePositionAffinity,
  doesCardMatchTeamColor,
  evaluateSquadTeamColors,
  swapFormationSlots,
} from '../game/tacticsAndTeamColor';
import { FormationCode, OwnedCard } from '../game/types';
import { resolveTraitMeta } from '../game/traits';
import { ClubCrestSvg, NationFlagSvg, SeasonBadgeSvg } from './Emblems';
import { PlayerCardView } from './PlayerCardView';
import { TraitBadges } from './TraitBadges';

interface SquadViewProps {
  cards: OwnedCard[];
  vipLevel: number;
  formation: FormationCode;
  activeTeamColorId: string;
  lineupSlotUids?: string[];
  onChangeFormation: (formation: FormationCode) => void;
  onChangeTeamColor: (teamColorId: string) => void;
  onChangeLineupSlots: (slotUids?: string[]) => void;
  onOptimizeForTeamColor: (teamColorId: string) => void;
  onSelectForUpgrade: (cardUid: string) => void;
  onOpenLockerRoom: (cardUid: string) => void;
  onQuickSellCard: (cardUid: string) => void;
  onGoToVault: () => void;
  onGoToMarket?: (templateId?: string) => void;
}

type SeasonFilter =
  | 'ALL'
  | 'INFINITY_PRIME'
  | 'LE'
  | '26VB'
  | '26UCL'
  | 'ICON_TM'
  | '26TOTY'
  | '26TOTS'
  | 'BDO'
  | 'UP'
  | '25UCL_CU';

type FormationFamilyTab = 'ALL' | FormationFamily;
type TeamColorTab = 'ACTIVE' | 'VN_CLUB' | 'INTL_CLUB' | 'NATION' | 'SPECIAL';

const SALARY_CAP = 385;

function getRoleBadgePalette(lineGroup: LineGroup): string {
  if (lineGroup === 'ATT') return 'bg-rose-500 text-white';
  if (lineGroup === 'MID') return 'bg-emerald-500 text-slate-950';
  if (lineGroup === 'DEF') return 'bg-sky-500 text-slate-950';
  return 'bg-amber-400 text-slate-950';
}

const FormationMiniDiagram: React.FC<{ code: FormationCode; active: boolean }> = ({
  code,
  active,
}) => {
  const def = FORMATION_CATALOG[code];
  const rowCounts = useMemo(() => {
    const map = new Map<number, { count: number; group: LineGroup }>();
    for (const s of def.slots) {
      if (s.lineGroup === 'GK') continue;
      const cur = map.get(s.rowIndex);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(s.rowIndex, { count: 1, group: s.lineGroup });
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, val]) => val);
  }, [def.slots]);

  return (
    <div
      aria-hidden="true"
      className={`w-11 h-12 rounded border flex flex-col justify-between py-1.5 px-1 shrink-0 ${
        active
          ? 'bg-[#082618] border-[#a3e635]/70'
          : 'bg-[#071911] border-emerald-500/25'
      }`}
    >
      {rowCounts.map((row, idx) => (
        <div key={idx} className="flex items-center justify-around">
          {Array.from({ length: row.count }).map((_, dIdx) => (
            <span
              key={dIdx}
              className={`w-1.5 h-1.5 rounded-full ${
                row.group === 'ATT'
                  ? 'bg-rose-400'
                  : row.group === 'MID'
                  ? 'bg-emerald-400'
                  : 'bg-sky-400'
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export const SquadView: React.FC<SquadViewProps> = ({
  cards,
  vipLevel,
  formation,
  activeTeamColorId,
  lineupSlotUids,
  onChangeFormation,
  onChangeTeamColor,
  onChangeLineupSlots,
  onOptimizeForTeamColor,
  onSelectForUpgrade,
  onOpenLockerRoom,
  onQuickSellCard,
  onGoToVault,
  onGoToMarket,
}) => {
  const [viewMode, setViewMode] = useState<'club' | 'gallery'>('club');
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('ALL');
  const [formationFamilyTab, setFormationFamilyTab] = useState<FormationFamilyTab>('ALL');
  const [teamColorTab, setTeamColorTab] = useState<TeamColorTab>('VN_CLUB');
  const [teamColorQuery, setTeamColorQuery] = useState<string>('');
  const [swapSlotIndex, setSwapSlotIndex] = useState<number | null>(null);
  const [rightBenchTab, setRightBenchTab] = useState<'bench' | 'selected'>('bench');
  const [tacticalNotice, setTacticalNotice] = useState<string | null>(null);
  const [inspectCardUid, setInspectCardUid] = useState<string | null>(null);
  const [inspectCatalogId, setInspectCatalogId] = useState<string | null>(null);
  const [posePreviewMode, setPosePreviewMode] = useState<'auto' | 1 | 2>('auto');

  const summary = useMemo(() => calculateSquadSummary(cards), [cards]);

  const lineup = useMemo(
    () => buildFormationLineup(cards, formation, lineupSlotUids),
    [cards, formation, lineupSlotUids]
  );

  const starterCards = useMemo(() => lineup.slots.map((s) => s.card), [lineup.slots]);

  const naturalFitCount = useMemo(
    () => lineup.slots.filter((s) => s.isNaturalFit).length,
    [lineup.slots]
  );

  const teamColorEval = useMemo(
    () => evaluateSquadTeamColors(starterCards, activeTeamColorId),
    [starterCards, activeTeamColorId]
  );

  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp),
    [cards]
  );

  const starterUidSet = useMemo(() => new Set(lineup.starterUids), [lineup.starterUids]);

  const benchCards = useMemo(() => {
    const subs = sortedCards.filter((c) => !starterUidSet.has(c.uid));
    if (swapSlotIndex === null) return subs.slice(0, 14);
    const targetSlot = lineup.formation.slots[swapSlotIndex];
    if (!targetSlot) return subs.slice(0, 14);
    return [...subs]
      .sort((a, b) => {
        const tplA = PLAYER_TEMPLATE_MAP[a.templateId];
        const tplB = PLAYER_TEMPLATE_MAP[b.templateId];
        const fitA = tplA ? computePositionAffinity(tplA.position, targetSlot).bonus : -200;
        const fitB = tplB ? computePositionAffinity(tplB.position, targetSlot).bonus : -200;
        return fitB + b.ovr - (fitA + a.ovr);
      })
      .slice(0, 14);
  }, [sortedCards, starterUidSet, swapSlotIndex, lineup.formation.slots]);

  const visibleFormations = useMemo(() => {
    return ALL_FORMATIONS.map((code) => FORMATION_CATALOG[code]).filter((def) =>
      formationFamilyTab === 'ALL' ? true : def.family === formationFamilyTab
    );
  }, [formationFamilyTab]);

  const teamColorCountsByCat = useMemo(() => {
    let vn = 0;
    let intl = 0;
    let nation = 0;
    let special = 0;
    for (const tc of ALL_TEAM_COLORS) {
      if (tc.category === 'VN_CLUB') vn += 1;
      else if (tc.category === 'INTL_CLUB') intl += 1;
      else if (tc.category === 'NATION') nation += 1;
      else special += 1;
    }
    return { vn, intl, nation, special };
  }, []);

  const ownedMatchCountByTc = useMemo(() => {
    const map: Record<string, { starterCount: number; clubTotal: number }> = {};
    for (const tc of ALL_TEAM_COLORS) {
      let starterCount = 0;
      let clubTotal = 0;
      for (const c of starterCards) {
        if (doesCardMatchTeamColor(c, tc, true)) starterCount += 1;
      }
      for (const c of cards) {
        if (doesCardMatchTeamColor(c, tc, true)) clubTotal += 1;
      }
      map[tc.id] = { starterCount, clubTotal };
    }
    return map;
  }, [starterCards, cards]);

  const visibleTeamColors = useMemo<TeamColorDefinition[]>(() => {
    const q = teamColorQuery.trim().toLowerCase();
    const filtered = ALL_TEAM_COLORS.filter((tc) => {
      if (teamColorTab === 'ACTIVE') {
        const counts = ownedMatchCountByTc[tc.id];
        if (!counts || (counts.starterCount < 2 && tc.id !== activeTeamColorId)) return false;
      } else if (tc.category !== teamColorTab) {
        return false;
      }
      if (!q) return true;
      return `${tc.name} ${tc.shortLabel} ${tc.subtitle} ${tc.marketKeyword}`
        .toLowerCase()
        .includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (a.id === activeTeamColorId) return -1;
      if (b.id === activeTeamColorId) return 1;
      const countA = ownedMatchCountByTc[a.id]?.clubTotal ?? 0;
      const countB = ownedMatchCountByTc[b.id]?.clubTotal ?? 0;
      if (countB !== countA) return countB - countA;
      return a.name.localeCompare(b.name, 'vi');
    });
  }, [teamColorTab, teamColorQuery, ownedMatchCountByTc, activeTeamColorId]);

  const filteredCards = useMemo(() => {
    if (seasonFilter === 'ALL') return sortedCards;
    return sortedCards.filter((c) => {
      const tpl = PLAYER_TEMPLATE_MAP[c.templateId];
      if (!tpl) return false;
      if (seasonFilter === '25UCL_CU') {
        return tpl.season === '25UCL' || tpl.season === 'CU';
      }
      return tpl.season === seasonFilter;
    });
  }, [sortedCards, seasonFilter]);

  const catalogPreviewCards = useMemo<OwnedCard[]>(() => {
    return [...PLAYER_TEMPLATES]
      .sort((a, b) => b.baseOvr - a.baseOvr || b.baseValueBp - a.baseValueBp)
      .filter((tpl) => {
        if (seasonFilter === 'ALL') return true;
        if (seasonFilter === '25UCL_CU') {
          return tpl.season === '25UCL' || tpl.season === 'CU';
        }
        return tpl.season === seasonFilter;
      })
      .map((tpl) => ({
        uid: `gallery_${tpl.id}`,
        templateId: tpl.id,
        grade: 5,
        ovr: computeCardOvr(tpl.baseOvr, 5),
        valueBp: computeCardValueBp(tpl.baseValueBp, 5),
        acquiredAt: 0,
      }));
  }, [seasonFilter]);

  const inspectedCard = useMemo<OwnedCard | null>(() => {
    if (inspectCardUid) {
      return cards.find((c) => c.uid === inspectCardUid) ?? null;
    }
    if (inspectCatalogId) {
      const tpl = PLAYER_TEMPLATE_MAP[inspectCatalogId];
      if (!tpl) return null;
      return {
        uid: `gallery_${tpl.id}`,
        templateId: tpl.id,
        grade: 5,
        ovr: computeCardOvr(tpl.baseOvr, 5),
        valueBp: computeCardValueBp(tpl.baseValueBp, 5),
        acquiredAt: 0,
      };
    }
    return null;
  }, [cards, inspectCardUid, inspectCatalogId]);

  const inspectedTemplate = inspectedCard
    ? PLAYER_TEMPLATE_MAP[inspectedCard.templateId]
    : null;
  const isCatalogInspection = Boolean(!inspectCardUid && inspectCatalogId);

  const showNotice = (msg: string) => {
    setTacticalNotice(msg);
    window.setTimeout(() => {
      setTacticalNotice((cur) => (cur === msg ? null : cur));
    }, 3200);
  };

  const handlePitchSlotClick = (slotIdx: number, clickedCard: OwnedCard) => {
    gameSound.playClick();
    if (swapSlotIndex === null) {
      setSwapSlotIndex(slotIdx);
      return;
    }
    if (swapSlotIndex === slotIdx) {
      setSwapSlotIndex(null);
      setPosePreviewMode('auto');
      setInspectCatalogId(null);
      setInspectCardUid(clickedCard.uid);
      return;
    }
    const nextSlots = swapFormationSlots(lineup.starterUids, swapSlotIndex, clickedCard.uid);
    onChangeLineupSlots(nextSlots);
    const slotA = lineup.formation.slots[swapSlotIndex]?.roleLabel ?? '';
    const slotB = lineup.formation.slots[slotIdx]?.roleLabel ?? '';
    setSwapSlotIndex(null);
    showNotice(`Đã đổi vị trí chiến thuật ${slotA} ↔ ${slotB}!`);
  };

  const handleSubstituteFromBench = (benchCard: OwnedCard) => {
    if (swapSlotIndex === null) {
      gameSound.playClick();
      setPosePreviewMode('auto');
      setInspectCatalogId(null);
      setInspectCardUid(benchCard.uid);
      return;
    }
    gameSound.playUpgradeOutcome(true);
    const nextSlots = swapFormationSlots(lineup.starterUids, swapSlotIndex, benchCard.uid);
    const roleLabel = lineup.formation.slots[swapSlotIndex]?.roleLabel ?? '';
    const tpl = PLAYER_TEMPLATE_MAP[benchCard.templateId];
    onChangeLineupSlots(nextSlots);
    setSwapSlotIndex(null);
    showNotice(`Đã tung ${tpl?.shortName ?? 'cầu thủ'} vào vị trí ${roleLabel}!`);
  };

  const primaryBadge = teamColorEval.activeBadges[0] ?? null;
  const ovrDelta = teamColorEval.boostedAvgOvr - teamColorEval.baseAvgOvr;
  const activeSwapSlot = swapSlotIndex !== null ? lineup.slots[swapSlotIndex] ?? null : null;
  const activeSwapTpl = activeSwapSlot ? PLAYER_TEMPLATE_MAP[activeSwapSlot.card.templateId] ?? null : null;

  return (
    <div className="space-y-4 sm:space-y-5 pb-6" data-testid="squad-view">
      {/* 1. Compact FC Online PC Squad & Tactical KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-lg fco-pc-panel px-3 py-2.5 sm:p-3.5 shadow-lg">
          <div className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            GIÁ TRỊ ĐỘI HÌNH CHÍNH
          </div>
          <div
            className="mt-0.5 text-lg sm:text-2xl font-black text-emerald-400 tabular-nums font-mono leading-tight"
          >
            {formatBpCompact(summary.squadValue)}
          </div>
          <div className="text-[10px] text-slate-400 tabular-nums truncate">
            Top 18 cầu thủ · SVIP {vipLevel}
          </div>
        </div>

        <div className="rounded-lg fco-pc-panel-glow px-3 py-2.5 sm:p-3.5 shadow-lg">
          <div className="text-[10px] sm:text-[11px] font-black text-[#a3e635] uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            OVR ĐỘI HÌNH &amp; TEAM COLOR
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 leading-tight">
            <span
              data-testid="squad-boosted-ovr"
              className="text-lg sm:text-2xl font-black text-[#a3e635] tabular-nums"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              OVR {teamColorEval.boostedAvgOvr}
            </span>
            {ovrDelta > 0 && (
              <span className="text-xs font-black text-emerald-300 tabular-nums">
                +{ovrDelta} TC
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 tabular-nums truncate">
            {teamColorEval.totalBoostedStarters}/11 đá chính nhận buff chỉ số
          </div>
        </div>

        <div className="rounded-lg fco-pc-panel px-3 py-2.5 sm:p-3.5 shadow-lg">
          <div className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            SƠ ĐỒ &amp; QUỸ LƯƠNG 11 CT
          </div>
          <div
            className={`mt-0.5 text-lg sm:text-2xl font-black tabular-nums leading-tight ${
              lineup.totalSalary <= SALARY_CAP ? 'text-white' : 'text-rose-400'
            }`}
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {lineup.formation.code} · {lineup.totalSalary}/{SALARY_CAP}
          </div>
          <div className="mt-1 h-1 rounded-full bg-slate-950 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                lineup.totalSalary <= SALARY_CAP ? 'bg-[#a3e635]' : 'bg-rose-500'
              }`}
              style={{
                width: `${Math.min(100, Math.round((lineup.totalSalary / SALARY_CAP) * 100))}%`,
              }}
            />
          </div>
          <div
            data-testid="squad-natural-fit-readout"
            className="mt-1 text-[10px] text-emerald-300 font-bold tabular-nums truncate"
          >
            {naturalFitCount}/{lineup.slots.length} đúng vị trí sở trường
          </div>
        </div>

        <div className="rounded-lg fco-pc-panel px-3 py-2.5 sm:p-3.5 flex flex-col justify-between shadow-lg">
          <div>
            <div className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              TEAM COLOR CHỦ ĐẠO
            </div>
            <div
              className="mt-0.5 text-base sm:text-xl font-black fco-text-gold truncate leading-tight"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {primaryBadge
                ? `${primaryBadge.teamColor.shortLabel} (Lv.${primaryBadge.tierLevel} · +${primaryBadge.ovrBonus})`
                : 'Tự động kích hoạt'}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {primaryBadge
              ? primaryBadge.teamColor.name
              : 'Chọn CLB Việt Nam hoặc Thế Giới'}
          </div>
        </div>
      </div>

      {/* 2. Authentic FC Online PC 2-Column Tactical Pitch + Docked Workbench (Immediate Top Fold!) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-stretch">
        <section
          aria-label={`Sân chiến thuật sơ đồ ${lineup.formation.code}`}
          data-testid="tactical-pitch"
          className="md:col-span-8 rounded-xl border border-emerald-400/45 fco-pitch-stripes p-2.5 sm:p-4 relative overflow-hidden flex flex-col justify-between shadow-[0_16px_40px_rgba(0,0,0,0.85)]"
        >
          {/* Authentic FC Online PC Football Pitch Markings */}
          <div
            aria-hidden="true"
            className="absolute inset-2.5 sm:inset-3.5 border border-white/20 rounded-lg pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-1/4 top-2.5 sm:top-3.5 h-16 border-b border-x border-white/20 rounded-b-md pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-[38%] top-2.5 sm:top-3.5 h-6 border-b border-x border-white/20 rounded-b pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-2.5 sm:inset-x-3.5 top-1/2 h-[1.5px] bg-white/20 pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full border border-white/20 pointer-events-none flex items-center justify-center"
          >
            <div className="w-2 h-2 rounded-full bg-white/30" />
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-x-1/4 bottom-2.5 sm:bottom-3.5 h-16 border-t border-x border-white/20 rounded-t-md pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-[38%] bottom-2.5 sm:bottom-3.5 h-6 border-t border-x border-white/20 rounded-t pointer-events-none"
          />

          {/* Compact Pitch Header Toolbar */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
            <div className="min-w-0">
              <h3
                className="text-base sm:text-xl font-black italic text-white leading-none tracking-wide"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                SÂN CHIẾN THUẬT · {lineup.formation.title.toUpperCase()}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-emerald-200/90 mt-0.5 truncate">
                {swapSlotIndex !== null
                  ? `Đang chọn ${lineup.formation.slots[swapSlotIndex]?.roleLabel}: Chạm vị trí khác / Dự bị để đổi, hoặc chạm lại để xem hồ sơ.`
                  : 'Chạm cầu thủ trên sân để đổi vị trí, thay người hoặc xem chi tiết bên phải.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  gameSound.playUpgradeOutcome(true);
                  setSwapSlotIndex(null);
                  onChangeLineupSlots(undefined);
                  showNotice(
                    `Đã tự động xếp 11 cầu thủ đúng vị trí sở trường theo sơ đồ ${formation}!`
                  );
                }}
                className="min-h-[34px] px-2.5 py-1 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-black text-[11px] uppercase tracking-wider cursor-pointer whitespace-nowrap"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                Tự xếp chuẩn
              </button>
              {swapSlotIndex !== null && (
                <button
                  type="button"
                  onClick={() => setSwapSlotIndex(null)}
                  className="min-h-[34px] px-2.5 py-1 rounded bg-slate-950/90 border border-amber-400/50 text-[11px] font-bold text-amber-300 cursor-pointer whitespace-nowrap"
                >
                  Hủy chọn
                </button>
              )}
              {tacticalNotice && (
                <span
                  role="status"
                  className="px-2.5 py-1 rounded bg-emerald-950/95 border border-emerald-400/50 text-[11px] font-semibold text-emerald-200 max-w-[260px] truncate"
                >
                  {tacticalNotice}
                </span>
              )}
            </div>
          </div>

          {/* All 11 Starters Simultaneously Visible as Authentic FC Online PC Pitch Plates */}
          <div className="relative z-10 flex-1 flex flex-col justify-evenly gap-2 py-1">
            {lineup.rows.map((row, rIdx) => (
              <div
                key={`pitch_row_${rIdx}`}
                className="flex items-center justify-around gap-1.5 sm:gap-2.5"
              >
                {row.map((assigned) => {
                  const isSlotSelected = swapSlotIndex === assigned.slot.slotIndex;
                  const bonus = teamColorEval.cardBonusMap[assigned.card.uid]?.bonusOvr ?? 0;
                  const effectiveOvr = assigned.card.ovr + bonus;
                  const tpl = PLAYER_TEMPLATE_MAP[assigned.card.templateId];

                  return (
                    <button
                      key={`slot_${assigned.slot.slotIndex}_${assigned.card.uid}`}
                      type="button"
                      data-testid={`pitch-slot-${assigned.slot.roleLabel}`}
                      onClick={() =>
                        handlePitchSlotClick(assigned.slot.slotIndex, assigned.card)
                      }
                      aria-label={`${assigned.slot.roleLabel} ${tpl?.shortName ?? ''} OVR ${effectiveOvr} cộng ${assigned.card.grade}`}
                      className={`group relative flex flex-col items-center w-[64px] sm:w-[82px] lg:w-[92px] rounded-lg border transition-all cursor-pointer select-none overflow-hidden ${
                        isSlotSelected
                          ? 'bg-[#17281a] border-amber-400 ring-2 ring-amber-400 scale-105 shadow-[0_0_20px_rgba(250,204,21,0.45)]'
                          : 'bg-[#070d19]/92 border-white/20 hover:border-[#a3e635]/80 hover:-translate-y-0.5 shadow-[0_6px_14px_rgba(0,0,0,0.65)]'
                      }`}
                    >
                      {/* Top Tactical Role & Fit Bar */}
                      <div className="w-full flex items-center justify-between gap-0.5 px-1 py-0.5 bg-black/65 border-b border-white/10">
                        <span
                          className={`px-1 py-[1px] rounded-[3px] text-[9px] sm:text-[10px] font-black tracking-wide leading-none ${getRoleBadgePalette(
                            assigned.slot.lineGroup
                          )}`}
                        >
                          {assigned.slot.roleLabel}
                        </span>
                        <span
                          className={`text-[9px] font-extrabold leading-none tabular-nums ${
                            assigned.isNaturalFit ? 'text-[#a3e635]' : 'text-amber-300'
                          }`}
                        >
                          {assigned.isNaturalFit ? '100%' : tpl?.position ?? ''}
                        </span>
                      </div>

                      {/* Middle Portrait + OVR + Grade */}
                      <div className="relative w-full h-[46px] sm:h-[58px] lg:h-[64px] flex items-end justify-end pr-0.5 bg-gradient-to-b from-[#132038] to-[#080d18]">
                        {/* Left Telemetry Column */}
                        <div className="absolute left-1 top-0.5 flex flex-col items-start leading-none z-10 tabular-nums">
                          <span
                            className="text-sm sm:text-base font-black text-white drop-shadow"
                            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                          >
                            {effectiveOvr}
                          </span>
                          <span className="mt-0.5 px-1 py-[1px] rounded-[2px] bg-amber-400 text-slate-950 text-[8px] sm:text-[9px] font-black leading-none">
                            +{assigned.card.grade}
                          </span>
                          {bonus > 0 && (
                            <span className="mt-0.5 text-[8px] font-black text-[#a3e635] leading-none">
                              +{bonus}TC
                            </span>
                          )}
                        </div>

                        <img
                          src={assigned.card.customMinifaceUrl || tpl?.minifaceUrl}
                          alt={tpl?.shortName ?? ''}
                          referrerPolicy="no-referrer"
                          className="h-[44px] sm:h-[54px] lg:h-[60px] w-[42px] sm:w-[52px] object-contain object-bottom drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]"
                        />
                      </div>

                      {/* Bottom Name & Season Plate */}
                      <div className="w-full px-1 py-0.5 bg-[#050811] border-t border-white/10 flex items-center justify-between gap-0.5">
                        {tpl && (
                          <SeasonBadgeSvg
                            season={tpl.season}
                            className="w-3.5 h-2.5 shrink-0"
                          />
                        )}
                        <span className="text-[9px] sm:text-[10px] font-bold text-white truncate flex-1 text-center">
                          {tpl?.shortName ?? ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        {/* Right 4 Cols: FC Online PC Docked Tactical Workbench (Selected Player Quick Actions + Substitution Bench) */}
        <aside className="md:col-span-4 rounded-xl fco-pc-panel p-3 sm:p-4 flex flex-col justify-between space-y-2.5">
          <div className="space-y-2.5 flex-1 min-h-0 flex flex-col">
            {/* Selected Pitch Starter Quick Inspector Strip */}
            {activeSwapSlot && activeSwapTpl && (
              <div className="rounded-lg bg-[#091524] border border-amber-400/55 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={activeSwapSlot.card.customMinifaceUrl || activeSwapTpl.minifaceUrl}
                      alt={activeSwapTpl.shortName}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded bg-slate-950 border border-white/15 object-contain object-bottom shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black leading-none">
                          {activeSwapSlot.slot.roleLabel}
                        </span>
                        <span className="text-xs font-extrabold text-white truncate">
                          {activeSwapTpl.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-300 tabular-nums mt-0.5">
                        OVR {activeSwapSlot.card.ovr} (+{activeSwapSlot.card.grade}) · Lương {activeSwapTpl.salary}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      gameSound.playClick();
                      setPosePreviewMode('auto');
                      setInspectCatalogId(null);
                      setInspectCardUid(activeSwapSlot.card.uid);
                    }}
                    className="min-h-[36px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    Chỉ số
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      gameSound.playClick();
                      onSelectForUpgrade(activeSwapSlot.card.uid);
                    }}
                    className="min-h-[36px] px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-[11px] font-black text-slate-950 cursor-pointer whitespace-nowrap"
                  >
                    Đập thẻ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      gameSound.playClick();
                      onOpenLockerRoom(activeSwapSlot.card.uid);
                    }}
                    className="min-h-[36px] px-2 py-1 rounded bg-sky-500/25 hover:bg-sky-500/35 border border-sky-400/45 text-[11px] font-bold text-sky-200 cursor-pointer whitespace-nowrap"
                  >
                    Thay đồ
                  </button>
                </div>
              </div>
            )}

            <div className="border-b border-white/10 pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRightBenchTab('bench')}
                    className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-black uppercase tracking-wide cursor-pointer ${
                      rightBenchTab === 'bench'
                        ? 'bg-[#a3e635] text-slate-950'
                        : 'bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    Dự bị ({Math.max(0, sortedCards.length - lineup.slots.length)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightBenchTab('selected')}
                    className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-black uppercase tracking-wide cursor-pointer ${
                      rightBenchTab === 'selected'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    Đá chính (11)
                  </button>
                </div>
                <span className="text-[11px] font-mono font-bold text-[#a3e635] tabular-nums">
                  {lineup.formation.code}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {swapSlotIndex !== null
                  ? `Đang chọn ${lineup.formation.slots[swapSlotIndex]?.roleLabel}: ấn dự bị bên dưới để thay vào ngay.`
                  : 'Chọn 1 vị trí trên sân bên trái để thay người hoặc mở bảng chỉ số/đập thẻ.'}
              </p>
            </div>

            {rightBenchTab === 'selected' ? (
              <div className="space-y-1.5 overflow-y-auto fco-touch-scroll max-h-[360px] sm:max-h-[420px] pr-1">
                {lineup.slots.map((slotItem) => {
                  const sTpl = PLAYER_TEMPLATE_MAP[slotItem.card.templateId];
                  if (!sTpl) return null;
                  const bonus = teamColorEval.cardBonusMap[slotItem.card.uid]?.bonusOvr ?? 0;
                  return (
                    <div
                      key={`starter_list_${slotItem.slot.slotIndex}`}
                      className="rounded-lg p-2 bg-[#060a13] border border-white/10 flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          gameSound.playClick();
                          setPosePreviewMode('auto');
                          setInspectCatalogId(null);
                          setInspectCardUid(slotItem.card.uid);
                        }}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ${getRoleBadgePalette(
                            slotItem.slot.lineGroup
                          )}`}
                        >
                          {slotItem.slot.roleLabel}
                        </span>
                        <SeasonBadgeSvg season={sTpl.season} className="w-4.5 h-3 shrink-0" />
                        <span className="text-xs font-bold text-white truncate">
                          {sTpl.shortName}
                        </span>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                        <span className="text-xs font-black text-white">
                          {slotItem.card.ovr + bonus}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            gameSound.playClick();
                            onSelectForUpgrade(slotItem.card.uid);
                          }}
                          className="min-h-[28px] px-2 rounded bg-amber-500/90 hover:bg-amber-400 text-[10px] font-black text-slate-950 cursor-pointer"
                        >
                          Đập
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : benchCards.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Hiện có 11 cầu thủ đang thi đấu chính thức. Mở thêm gói thẻ hoặc mua trên TTCN để bổ sung dự bị.
              </div>
            ) : (
              <div className="space-y-1.5 overflow-y-auto fco-touch-scroll max-h-[360px] sm:max-h-[420px] pr-1">
                {benchCards.map((sub) => {
                  const tpl = PLAYER_TEMPLATE_MAP[sub.templateId];
                  if (!tpl) return null;
                  const targetSlot =
                    swapSlotIndex !== null ? lineup.formation.slots[swapSlotIndex] : null;
                  const isFitForSelected = targetSlot
                    ? computePositionAffinity(tpl.position, targetSlot).isNaturalFit
                    : false;

                  return (
                    <button
                      key={`bench_${sub.uid}`}
                      type="button"
                      onClick={() => handleSubstituteFromBench(sub)}
                      className={`w-full min-h-[48px] rounded-lg p-2 border flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                        swapSlotIndex !== null && isFitForSelected
                          ? 'bg-[#102c1e] border-[#a3e635] shadow-[0_0_12px_rgba(163,230,53,0.18)]'
                          : 'bg-[#060a13] border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={sub.customMinifaceUrl || tpl.minifaceUrl}
                          alt={tpl.shortName}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded bg-slate-950 border border-white/10 object-contain object-bottom shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <SeasonBadgeSvg season={tpl.season} className="w-4.5 h-3 shrink-0" />
                            <span className="text-xs font-bold text-white truncate">
                              {tpl.shortName}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            <span className="text-sky-300 font-bold">{tpl.position}</span> · Lương{' '}
                            {tpl.salary} · {tpl.seasonLabel}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                        <span className="text-xs font-extrabold text-white">{sub.ovr}</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-[10px] font-bold text-amber-300">
                          +{sub.grade}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
            <span>Tổng cầu thủ CLB: <strong className="text-white">{cards.length}</strong></span>
            <span>Đúng vị trí: <strong className="text-emerald-300">{naturalFitCount}/11</strong></span>
          </div>
        </aside>
      </div>

      {/* 3. Compact 22-Formation Selector Panel */}
      <section
        aria-label="Chọn sơ đồ chiến thuật FC Online"
        data-testid="formation-selector-panel"
        className="rounded-lg fco-pc-panel p-3.5 sm:p-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-white/10 pb-2.5">
          <div>
            <h2
              className="text-lg sm:text-2xl font-black italic text-white uppercase tracking-wide"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              SƠ ĐỒ CHIẾN THUẬT CHUẨN FC ONLINE ({ALL_FORMATIONS.length} SƠ ĐỒ)
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
              Đang áp dụng: <strong className="text-[#a3e635]">{lineup.formation.title}</strong> —{' '}
              {lineup.formation.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 p-1 rounded bg-slate-950 border border-white/10 overflow-x-auto fco-touch-scroll">
              {(
                [
                  { id: 'ALL', label: `Tất cả (${ALL_FORMATIONS.length})` },
                  { id: '4B', label: '4 Hậu vệ (14)' },
                  { id: '3B', label: '3 Hậu vệ (4)' },
                  { id: '5B', label: '5 Hậu vệ (4)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    gameSound.playClick();
                    setFormationFamilyTab(tab.id);
                  }}
                  className={`fco-pc-tab-skew min-h-[32px] px-2.5 py-1 text-[11px] font-black transition-all cursor-pointer whitespace-nowrap tabular-nums uppercase ${
                    formationFamilyTab === tab.id
                      ? 'fco-pc-btn-primary'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-[220px] sm:max-h-none overflow-y-auto fco-touch-scroll pr-0.5">
          {visibleFormations.map((fDef) => {
            const isActive = fDef.code === formation;
            return (
              <button
                key={fDef.code}
                type="button"
                data-testid={`formation-btn-${fDef.code}`}
                aria-pressed={isActive}
                onClick={() => {
                  gameSound.playClick(1.06);
                  setSwapSlotIndex(null);
                  onChangeFormation(fDef.code);
                  showNotice(`Đã chuyển sang sơ đồ ${fDef.title} & tự động căn chuẩn vị trí!`);
                }}
                className={`min-h-[54px] rounded-lg p-2 border text-left flex items-center gap-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#122419] border-[#a3e635] shadow-md'
                    : 'bg-slate-950/80 border-white/10 hover:border-white/25'
                }`}
              >
                <FormationMiniDiagram code={fDef.code} active={isActive} />
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-sm sm:text-base font-extrabold leading-none tabular-nums ${
                      isActive ? 'text-[#a3e635]' : 'text-white'
                    }`}
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    {fDef.code}
                  </div>
                  <div className="text-[10px] text-slate-300 font-medium truncate mt-0.5">
                    {fDef.styleTag}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Complete FC Online Team Color Panel (CLB Việt Nam + Quốc Tế + Đội Tuyển + Cấp Cộng/Mùa) */}
      <section
        aria-label="Hệ thống Team Color FC Online"
        data-testid="team-color-panel"
        className="rounded-lg fco-pc-panel p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
          <div>
            <h2
              className="text-xl sm:text-3xl font-bold italic text-white"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              02. HỆ THỐNG TẤT CẢ TEAM COLOR ({ALL_TEAM_COLORS.length} TEAM COLOR · ĐỦ {teamColorCountsByCat.vn} CLB VIỆT NAM)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Kích hoạt cộng chỉ số OVR toàn đội theo CLB Việt Nam (LPBank V.League 1, Hạng Nhất &amp; Huyền Thoại), CLB Quốc Tế, Đội Tuyển Quốc Gia, Cấp Cộng và Mùa Thẻ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTeamColorId !== 'auto' && (
              <button
                type="button"
                onClick={() => {
                  gameSound.playUpgradeOutcome(true);
                  onOptimizeForTeamColor(activeTeamColorId);
                  showNotice('Đã tối ưu 11 cầu thủ đá chính theo Team Color đang chọn!');
                }}
                data-testid="optimize-team-color-btn"
                className="fco-pc-tab-skew px-3.5 py-2 fco-pc-btn-primary text-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Tối Ưu Đội Hình Theo Team Color</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                gameSound.playClick();
                onChangeTeamColor('auto');
                showNotice('Đã chuyển Team Color về chế độ Tự Động nhận diện!');
              }}
              className={`fco-pc-tab-skew px-3 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTeamColorId === 'auto'
                  ? 'fco-pc-btn-gold font-bold'
                  : 'fco-pc-btn-slate'
              }`}
            >
              <span>Tự Động Nhận Diện</span>
            </button>
          </div>
        </div>

        {/* Active Team Color Synergy Strip */}
        {teamColorEval.activeBadges.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {teamColorEval.activeBadges.map((b) => (
              <div
                key={`active_tc_${b.teamColor.id}`}
                className={`rounded-lg p-3 border flex items-center justify-between gap-2.5 ${
                  b.isSelectedPrimary
                    ? 'bg-[#112419] border-[#a3e635]/60'
                    : 'bg-slate-950/90 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {b.teamColor.clubCode ? (
                    <ClubCrestSvg clubCode={b.teamColor.clubCode} className="w-8 h-8 shrink-0" />
                  ) : b.teamColor.nationCode ? (
                    <NationFlagSvg
                      code={b.teamColor.nationCode}
                      className="w-8 h-5 rounded shrink-0"
                    />
                  ) : b.teamColor.seasonCode ? (
                    <SeasonBadgeSvg
                      season={b.teamColor.seasonCode}
                      className="w-8 h-5 shrink-0"
                    />
                  ) : (
                    <span className="w-8 h-8 rounded bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-xs font-extrabold text-amber-300 shrink-0">
                      +{b.teamColor.minGrade ?? 5}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {b.teamColor.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {b.teamColor.statBuffs.join(' · ')}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <div className="text-sm font-extrabold text-[#a3e635]">
                    +{b.ovrBonus} OVR
                  </div>
                  <div className="text-[10px] text-slate-300">
                    Cấp {b.tierLevel} ({b.matchedCount} CT)
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Team Color Category Tabs + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded fco-pc-panel">
            {(
              [
                { id: 'VN_CLUB', label: `CLB Việt Nam (${teamColorCountsByCat.vn})` },
                { id: 'INTL_CLUB', label: `CLB Quốc Tế (${teamColorCountsByCat.intl})` },
                { id: 'NATION', label: `Đội Tuyển QG (${teamColorCountsByCat.nation})` },
                { id: 'SPECIAL', label: `Cấp Cộng & Mùa (${teamColorCountsByCat.special})` },
                { id: 'ACTIVE', label: 'Đang Có Cầu Thủ' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  gameSound.playClick();
                  setTeamColorTab(tab.id);
                }}
                className={`fco-pc-tab-skew px-3 py-1.5 text-xs font-black transition-all cursor-pointer whitespace-nowrap tabular-nums uppercase ${
                  teamColorTab === tab.id
                    ? 'fco-pc-btn-gold'
                    : 'fco-pc-btn-slate'
                }`}
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="w-full sm:w-72 lg:w-80">
            <label htmlFor="team-color-search" className="sr-only">
              Tìm kiếm Team Color
            </label>
            <input
              id="team-color-search"
              type="search"
              value={teamColorQuery}
              onChange={(e) => setTeamColorQuery(e.target.value)}
              placeholder="Tìm CLB Việt Nam, Thế Giới, ĐTQG..."
              className="w-full rounded bg-[#060a13] border border-white/20 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#a3e635] shadow-inner"
            />
          </div>
        </div>

        {/* Team Color Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[280px] overflow-y-auto fco-touch-scroll pr-1">
          {visibleTeamColors.map((tc) => {
            const isSelected = activeTeamColorId === tc.id;
            const counts = ownedMatchCountByTc[tc.id] ?? { starterCount: 0, clubTotal: 0 };

            return (
              <button
                key={tc.id}
                type="button"
                data-testid={`tc-option-${tc.id}`}
                aria-pressed={isSelected}
                onClick={() => {
                  gameSound.playClick(1.06);
                  onOptimizeForTeamColor(tc.id);
                  showNotice(
                    `Đã kích hoạt ${tc.name} & ưu tiên cầu thủ phù hợp vào đội hình!`
                  );
                }}
                className={`rounded-lg p-3 border text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'fco-pc-panel-glow border-[#a3e635] shadow-[0_0_18px_rgba(163,230,53,0.22)]'
                    : 'fco-pc-panel border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {tc.clubCode ? (
                    <ClubCrestSvg clubCode={tc.clubCode} className="w-8 h-8 shrink-0" />
                  ) : tc.nationCode ? (
                    <NationFlagSvg
                      code={tc.nationCode}
                      className="w-8 h-5 rounded shrink-0"
                    />
                  ) : tc.seasonCode ? (
                    <SeasonBadgeSvg season={tc.seasonCode} className="w-8 h-5 shrink-0" />
                  ) : (
                    <span className="w-8 h-8 rounded bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-xs font-extrabold text-amber-300 shrink-0">
                      +{tc.minGrade ?? 5}
                    </span>
                  )}

                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{tc.name}</div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {tc.statBuffs.join(' · ')}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 tabular-nums">
                  <div className="text-xs font-extrabold text-emerald-400">
                    Tối đa +{tc.maxOvrBonus}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Sở hữu {counts.clubTotal}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 5. Full Club Player Inventory & 338-Player Miniface Collection Gallery */}
      <div className="space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  gameSound.playClick();
                  setViewMode('club');
                }}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                  viewMode === 'club'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Đội hình CLB ({cards.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  gameSound.playClick();
                  setViewMode('gallery');
                }}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                  viewMode === 'gallery'
                    ? 'bg-amber-400 text-slate-950 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Bộ Sưu Tập Miniface ({PLAYER_TEMPLATES.length} Siêu Sao)
              </button>
            </div>

            {viewMode === 'gallery' && (
              <span className="text-xs text-sky-300">
                Infinite Prime · Legendary Eternal (2MF Động) · Unsung Players (UP Tĩnh) · 26VB · 26UCL · ICON TM
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-900 border border-white/10">
            {(
              [
                { id: 'ALL', label: 'Tất cả mùa' },
                { id: 'INFINITY_PRIME', label: 'Infinite Prime' },
                { id: 'LE', label: 'LE (Legendary Eternal)' },
                { id: '26VB', label: '26VB (Vietnam Best)' },
                { id: 'UP', label: 'UP (Unsung Players)' },
                { id: '26UCL', label: '26UCL (C1 26–27)' },
                { id: 'ICON_TM', label: 'ICON TM' },
                { id: '26TOTY', label: '26TOTY' },
                { id: '26TOTS', label: '26TOTS' },
                { id: 'BDO', label: 'Ballon d’Or' },
                { id: '25UCL_CU', label: '25UCL / CU' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  gameSound.playClick();
                  setSeasonFilter(tab.id);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  seasonFilter === tab.id
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {viewMode === 'club' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredCards.map((card) => {
              const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
              const sellPrice = Math.round(card.valueBp * 0.85);
              const canSell = cards.length > 11;
              const isStarter = starterUidSet.has(card.uid);
              const bonus = isStarter
                ? teamColorEval.cardBonusMap[card.uid]?.bonusOvr ?? 0
                : 0;

              return (
                <div
                  key={`roster_${card.uid}`}
                  className="rounded-xl bg-[#0d1424] border border-white/10 p-3.5 flex flex-col items-center justify-between"
                >
                  <PlayerCardView
                    card={card}
                    size="md"
                    showValue
                    bonusOvr={bonus}
                    badgeNote={isStarter ? 'ĐÁ CHÍNH' : undefined}
                    onClick={() => {
                      gameSound.playClick();
                      setPosePreviewMode('auto');
                      setInspectCatalogId(null);
                      setInspectCardUid(card.uid);
                    }}
                  />

                  <div className="w-full mt-3 text-center text-xs text-slate-400 truncate">
                    {tpl?.nationalityName} · {tpl?.position} · {tpl?.clubName}
                  </div>

                  <div className="w-full mt-2.5 pt-2.5 border-t border-white/10 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        gameSound.playClick();
                        onSelectForUpgrade(card.uid);
                      }}
                      className="min-h-[36px] py-1.5 px-2.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Đập thẻ
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        gameSound.playClick();
                        onOpenLockerRoom(card.uid);
                      }}
                      className="min-h-[36px] py-1.5 px-2.5 rounded-md bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Thay đồ
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        gameSound.playClick();
                        setPosePreviewMode('auto');
                        setInspectCatalogId(null);
                        setInspectCardUid(card.uid);
                      }}
                      className={`${
                        canSell ? '' : 'col-span-2'
                      } min-h-[36px] py-1.5 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap`}
                    >
                      Chỉ số
                    </button>

                    {canSell && (
                      <button
                        type="button"
                        onClick={() => {
                          gameSound.playClick(0.95);
                          onQuickSellCard(card.uid);
                        }}
                        title={`Bán nhận ${formatBpCompact(sellPrice)}`}
                        className="min-h-[36px] py-1.5 px-2 rounded-md bg-slate-900 hover:bg-rose-950/70 border border-white/10 text-slate-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Bán
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            data-testid="miniface-collection-grid"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3"
          >
            {catalogPreviewCards.map((previewCard) => {
              const tpl = PLAYER_TEMPLATE_MAP[previewCard.templateId];
              return (
                <div
                  key={`catalog_${previewCard.templateId}`}
                  className="rounded-xl bg-[#0d1424] border border-white/10 p-3.5 flex flex-col items-center justify-between"
                >
                  <PlayerCardView
                    card={previewCard}
                    size="md"
                    showValue
                    onClick={() => {
                      gameSound.playClick();
                      setPosePreviewMode('auto');
                      setInspectCardUid(null);
                      setInspectCatalogId(previewCard.templateId);
                    }}
                  />

                  <div className="w-full mt-3 text-center text-xs text-slate-400 truncate">
                    {tpl?.nationalityName} · {tpl?.position} · {tpl?.clubName}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      gameSound.playClick();
                      setPosePreviewMode('auto');
                      setInspectCardUid(null);
                      setInspectCatalogId(previewCard.templateId);
                    }}
                    className="w-full min-h-[36px] mt-3 py-1.5 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {tpl?.altMinifaceUrl ? 'Xem 2 Miniface Động' : 'Xem Hồ Sơ & Miniface'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Authentic FC Online Player Attribute Inspection Modal */}
      {inspectedCard &&
        inspectedTemplate &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Hồ sơ cầu thủ ${inspectedTemplate.name}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setInspectCardUid(null);
                setInspectCatalogId(null);
              }
            }}
            className="fixed inset-0 z-[95] flex items-center justify-center p-2.5 sm:p-4 bg-black/85"
          >
            <div className="w-full max-w-4xl max-h-[92%] overflow-y-auto fco-touch-scroll rounded-xl bg-[#0b1220] border border-amber-400/40 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3.5">
              <div className="flex items-center gap-3">
                <SeasonBadgeSvg season={inspectedTemplate.season} className="w-11 h-6 shrink-0" />
                <div>
                  <h3
                    className="text-2xl sm:text-3xl font-bold italic text-white leading-none"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    {inspectedTemplate.name} (+{inspectedCard.grade})
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      <NationFlagSvg
                        code={inspectedTemplate.nationalityCode}
                        className="w-4 h-3 rounded-[1px]"
                      />
                      {inspectedTemplate.nationalityName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <ClubCrestSvg
                        clubCode={inspectedTemplate.clubCode}
                        className="w-4 h-4"
                      />
                      {inspectedTemplate.clubName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Áo số {inspectedTemplate.jerseyNumber}</span>
                    {!isCatalogInspection &&
                      isSerializedSeason(inspectedTemplate.season) &&
                      formatCardSerial(inspectedCard.serialNumber) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            data-testid="inspected-card-serial"
                            className="font-mono font-bold text-amber-300 tabular-nums"
                          >
                            Số thứ tự mở thẻ: NO.{formatCardSerial(inspectedCard.serialNumber)}
                          </span>
                        </>
                      )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setInspectCardUid(null);
                  setInspectCatalogId(null);
                }}
                className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
              >
                Đóng
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
              <div className="sm:col-span-5 flex flex-col items-center gap-3">
                <PlayerCardView
                  card={inspectedCard}
                  size="lg"
                  showStats
                  showValue
                  forcedPose={posePreviewMode}
                  bonusOvr={
                    !isCatalogInspection
                      ? teamColorEval.cardBonusMap[inspectedCard.uid]?.bonusOvr ?? 0
                      : 0
                  }
                />

                {inspectedTemplate.altMinifaceUrl && (
                  <div className="w-full rounded-lg bg-slate-950/90 border border-amber-400/35 p-2.5 space-y-2">
                    <div className="flex items-center justify-center gap-1">
                      {(
                        [
                          { id: 'auto', label: 'Chuyển động 2MF' },
                          { id: 1, label: 'Miniface 1' },
                          { id: 2, label: 'Miniface 2' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={String(opt.id)}
                          type="button"
                          onClick={() => {
                            gameSound.playClick();
                            setPosePreviewMode(opt.id);
                          }}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                            posePreviewMode === opt.id
                              ? 'bg-amber-400 text-slate-950 font-bold'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
                      <div className="flex flex-col items-center rounded bg-slate-900/90 p-1.5">
                        <img
                          src={inspectedTemplate.minifaceUrl}
                          alt={`${inspectedTemplate.name} Pose 1`}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 object-contain"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5">Pose 1</span>
                      </div>
                      <div className="flex flex-col items-center rounded bg-slate-900/90 p-1.5">
                        <img
                          src={inspectedTemplate.altMinifaceUrl}
                          alt={`${inspectedTemplate.name} Pose 2`}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 object-contain"
                        />
                        <span className="text-[10px] text-amber-300 mt-0.5">Pose 2</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="sm:col-span-7 space-y-3.5">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-slate-950/90 border border-white/10 p-3">
                    <div className="text-[11px] text-slate-400">LƯƠNG ĐỘI HÌNH</div>
                    <div className="mt-1 text-xl font-bold text-amber-400 font-mono tabular-nums">
                      {inspectedTemplate.salary}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-950/90 border border-white/10 p-3">
                    <div className="text-[11px] text-slate-400">HAI CHÂN</div>
                    <div className="mt-1 text-xl font-bold text-white font-mono tabular-nums">
                      {inspectedTemplate.weakFoot} - {inspectedTemplate.preferredFoot}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-950/90 border border-white/10 p-3">
                    <div className="text-[11px] text-slate-400">KỸ THUẬT</div>
                    <div className="mt-1 text-xl font-bold text-emerald-400 font-mono tabular-nums">
                      {inspectedTemplate.skillMoves} Sao
                    </div>
                  </div>
                </div>

                {/* Detailed 6 Stat Progress Bars */}
                <div className="rounded-lg bg-slate-950/90 border border-white/10 p-4 space-y-2.5">
                  <div className="text-xs font-semibold text-slate-300">
                    CHỈ SỐ CHI TIẾT MÙA {inspectedTemplate.seasonLabel} (ĐÃ CỘNG +{inspectedCard.grade})
                  </div>
                  {(
                    [
                      {
                        label: inspectedTemplate.position === 'GK' ? 'Đổ người' : 'Tốc độ',
                        val:
                          inspectedTemplate.stats.pac +
                          (inspectedCard.ovr - inspectedTemplate.baseOvr),
                      },
                      {
                        label: inspectedTemplate.position === 'GK' ? 'Bắt bóng' : 'Dứt điểm / Sút',
                        val:
                          inspectedTemplate.stats.sho +
                          (inspectedCard.ovr - inspectedTemplate.baseOvr),
                      },
                      {
                        label: inspectedTemplate.position === 'GK' ? 'Phát bóng' : 'Chuyền bóng',
                        val:
                          inspectedTemplate.stats.pas +
                          (inspectedCard.ovr - inspectedTemplate.baseOvr),
                      },
                      {
                        label: inspectedTemplate.position === 'GK' ? 'Phản xạ' : 'Rê bóng',
                        val:
                          inspectedTemplate.stats.dri +
                          (inspectedCard.ovr - inspectedTemplate.baseOvr),
                      },
                      {
                        label: inspectedTemplate.position === 'GK' ? 'Tốc độ GK' : 'Phòng ngự',
                        val:
                          inspectedTemplate.stats.def +
                          (inspectedCard.ovr - inspectedTemplate.baseOvr),
                      },
                      {
                        label: inspectedTemplate.position === 'GK' ? 'Chọn vị trí' : 'Thể lực / Tỳ đè',
                        val:
                          inspectedTemplate.stats.phy +
                          (inspectedCard.ovr - inspectedTemplate.baseOvr),
                      },
                    ] as const
                  ).map((row) => {
                    const pct = Math.min(100, Math.max(15, Math.round((row.val / 150) * 100)));
                    return (
                      <div key={row.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs tabular-nums">
                          <span className="text-slate-300">{row.label}</span>
                          <span
                            className={`font-mono font-bold ${
                              row.val >= 130
                                ? 'text-amber-300'
                                : row.val >= 122
                                ? 'text-emerald-300'
                                : 'text-sky-300'
                            }`}
                          >
                            {row.val}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              row.val >= 130
                                ? 'bg-amber-400'
                                : row.val >= 122
                                ? 'bg-emerald-400'
                                : 'bg-sky-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {inspectedTemplate.goldTraits && inspectedTemplate.goldTraits.length > 0 && (() => {
                  const goldCount = inspectedTemplate.goldTraits.filter(
                    (t) => resolveTraitMeta(t).tier === 'gold'
                  ).length;
                  const standardCount = inspectedTemplate.goldTraits.length - goldCount;
                  return (
                    <div
                      data-testid="inspected-player-traits"
                      className="rounded-lg bg-slate-950/90 border border-white/10 p-3.5 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-amber-300 tracking-wide">
                          CHỈ SỐ ẨN CHUẨN FC ONLINE ({inspectedTemplate.goldTraits.length})
                        </span>
                        <span className="text-[11px] text-slate-300 tabular-nums">
                          {goldCount} Chỉ số ẩn Vàng · {standardCount} Chỉ số ẩn thường
                        </span>
                      </div>
                      <TraitBadges traits={inspectedTemplate.goldTraits} variant="detailed" />
                    </div>
                  );
                })()}

                <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
                  {isCatalogInspection ? (
                    <>
                      {onGoToMarket && (
                        <button
                          type="button"
                          onClick={() => {
                            const tid = inspectedTemplate.id;
                            setInspectCatalogId(null);
                            onGoToMarket(tid);
                          }}
                          className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Mua trên TTCN (+1~+13)
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setInspectCatalogId(null);
                          onGoToVault();
                        }}
                        className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Săn tại Kho Vật Phẩm →
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const uid = inspectedCard.uid;
                          setInspectCardUid(null);
                          onOpenLockerRoom(uid);
                        }}
                        className="px-4 py-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-200 font-bold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Đổi Miniface (Phòng Thay Đồ)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const uid = inspectedCard.uid;
                          setInspectCardUid(null);
                          onSelectForUpgrade(uid);
                        }}
                        className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Đưa vào Phòng Đập Thẻ →
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
