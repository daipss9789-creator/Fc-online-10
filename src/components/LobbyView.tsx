import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PLAYER_TEMPLATE_MAP, PLAYER_TEMPLATES, SEASON_CARD_ARTWORK } from '../game/catalog';
import {
  DAILY_CHECKIN_REWARDS,
  FcMatchMode,
  HEAD_COACH_CATALOG,
  INITIAL_CLUB_INBOX,
  LOBBY_GIFT_CODES,
  STAR_PASS_PREMIUM_COST_FC,
  STAR_PASS_TIERS,
  SimulatedMatchResult,
  calculateManagerLevelStatus,
  calculateSquadSummary,
  claimClubInboxMessages,
  claimDailyCheckIn,
  claimLobbyMissionReward,
  claimStarPassTierReward,
  createStarterProfile,
  evaluateLobbyMissions,
  formatBpCompact,
  getMarketPriceBp,
  getRankTierForScore,
  getUnclaimedReachedMilestones,
  isSerializedSeason,
  redeemGiftCode,
  simulateFcOnlineMatch,
  unlockPremiumStarPass,
} from '../game/rules';
import { gameSound } from '../game/sound';
import { buildFormationLineup, evaluateSquadTeamColors } from '../game/tacticsAndTeamColor';
import {
  ActiveTab,
  GlobalServerRules,
  ManagerProfile,
  OwnedCard,
  SeasonCode,
  VipLevelStatus,
} from '../game/types';
import { forceSaveManagerAccount } from '../firebase';
import { ClubCrestSvg, FcOnlineTriangleMark, SeasonBadgeSvg } from './Emblems';
import { FcoIcon, FcoIconId } from './FcoIcons';
import { PlayerCardView } from './PlayerCardView';
import { ApkInstallModal } from './ApkInstallModal';
import { GlxhPitchModal } from './GlxhPitchModal';
import stadiumTunnelBgUrl from '../assets/images/title_stadium_bg_1792941105384.jpg';

interface LobbyViewProps {
  profile: ManagerProfile;
  vipStatus: VipLevelStatus;
  totalUnopenedPacks: number;
  muted: boolean;
  isAdmin?: boolean;
  gmSessionUnlocked?: boolean;
  serverRules?: GlobalServerRules;
  forceLandscape?: boolean;
  onToggleLandscapeMode?: () => void;
  onReturnToMasterAdmin?: () => void;
  onToggleMute: () => void;
  onOpenAuthModal: () => void;
  onPauseGame: () => void;
  onReturnToTitle: () => void;
  onUpdateProfile: (updater: (prev: ManagerProfile) => ManagerProfile) => void;
  onNavigateTab: (tab: ActiveTab) => void;
  onSelectForUpgrade: (cardUid: string) => void;
  onOpenLockerRoom: (cardUid: string) => void;
  onGoToMarketPlayer: (templateId?: string) => void;
}

type NewGenModalId =
  | null
  | 'match_result'
  | 'inbox'
  | 'star_pass'
  | 'missions'
  | 'watchlist'
  | 'head_coach'
  | 'club_hub'
  | 'events_hub'
  | 'settings'
  | 'apk_install';

interface StoredMatchSummary {
  id: string;
  modeLabel: string;
  opponentName: string;
  userGoals: number;
  opponentGoals: number;
  outcome: 'WIN' | 'DRAW' | 'LOSS';
  eloDelta: number;
  mvpName: string;
}

interface PersistedNewGenLobbyState {
  elo: number;
  wins: number;
  draws: number;
  losses: number;
  managerXp: number;
  starPassXp: number;
  starPassPremium: boolean;
  claimedStarPassKeys: string[];
  claimedInboxIds: string[];
  selectedCoachId: string;
  watchlistTemplateIds: string[];
  redeemedCodes: string[];
  claimedDaysCount: number;
  lastCheckInDate: string | null;
  claimedMissionIds: string[];
  recentMatches: StoredMatchSummary[];
}

const REFERENCE_STADIUM_SCENE_URL = stadiumTunnelBgUrl;
const SALARY_CAP = 385;
const ALL_SEASONS = Object.keys(SEASON_CARD_ARTWORK) as SeasonCode[];
const DEFAULT_WATCHLIST_IDS = [
  'le_cr7',
  'le_messi',
  'le_pele',
  'ip_ronaldo',
  'le_lecongvinh',
  'ip_quanghai',
  'ucl26_mbappe',
  'ucl26_yamal',
];

function createDefaultLobbyState(): PersistedNewGenLobbyState {
  return {
    elo: 2050, // Thế Giới 1 starting rank
    wins: 14,
    draws: 3,
    losses: 4,
    managerXp: 7350, // Lv. 25
    starPassXp: 150, // Unlocks Tier 1 & Tier 2 right away
    starPassPremium: false,
    claimedStarPassKeys: [],
    claimedInboxIds: [],
    selectedCoachId: 'hc_ancelotti',
    watchlistTemplateIds: DEFAULT_WATCHLIST_IDS,
    redeemedCodes: [],
    claimedDaysCount: 0,
    lastCheckInDate: null,
    claimedMissionIds: [],
    recentMatches: [],
  };
}

function loadNewGenLobbyState(profile: ManagerProfile): PersistedNewGenLobbyState {
  const fallback = createDefaultLobbyState();
  const baseElo = typeof profile.elo === 'number' ? profile.elo : fallback.elo;
  const baseWins = typeof profile.wins === 'number' ? profile.wins : fallback.wins;
  const baseDraws = typeof profile.draws === 'number' ? profile.draws : fallback.draws;
  const baseLosses = typeof profile.losses === 'number' ? profile.losses : fallback.losses;
  const baseXp = typeof profile.managerXp === 'number' ? profile.managerXp : fallback.managerXp;

  try {
    const raw = window.localStorage.getItem(`fco_newgen_lobby_v2_${profile.id}`);
    if (!raw) {
      return {
        ...fallback,
        elo: baseElo,
        wins: baseWins,
        draws: baseDraws,
        losses: baseLosses,
        managerXp: baseXp,
      };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedNewGenLobbyState>;
    return {
      elo: typeof profile.elo === 'number' ? profile.elo : (typeof parsed.elo === 'number' ? parsed.elo : baseElo),
      wins: typeof profile.wins === 'number' ? profile.wins : (typeof parsed.wins === 'number' ? parsed.wins : baseWins),
      draws: typeof profile.draws === 'number' ? profile.draws : (typeof parsed.draws === 'number' ? parsed.draws : baseDraws),
      losses: typeof profile.losses === 'number' ? profile.losses : (typeof parsed.losses === 'number' ? parsed.losses : baseLosses),
      managerXp:
        typeof profile.managerXp === 'number'
          ? profile.managerXp
          : typeof parsed.managerXp === 'number'
          ? parsed.managerXp
          : baseXp,
      starPassXp: typeof parsed.starPassXp === 'number' ? parsed.starPassXp : fallback.starPassXp,
      starPassPremium: Boolean(parsed.starPassPremium),
      claimedStarPassKeys: Array.isArray(parsed.claimedStarPassKeys)
        ? parsed.claimedStarPassKeys
        : [],
      claimedInboxIds: Array.isArray(parsed.claimedInboxIds) ? parsed.claimedInboxIds : [],
      selectedCoachId:
        typeof parsed.selectedCoachId === 'string'
          ? parsed.selectedCoachId
          : fallback.selectedCoachId,
      watchlistTemplateIds:
        Array.isArray(parsed.watchlistTemplateIds) && parsed.watchlistTemplateIds.length > 0
          ? parsed.watchlistTemplateIds
          : fallback.watchlistTemplateIds,
      redeemedCodes: Array.isArray(parsed.redeemedCodes) ? parsed.redeemedCodes : [],
      claimedDaysCount:
        typeof parsed.claimedDaysCount === 'number' ? parsed.claimedDaysCount : 0,
      lastCheckInDate:
        typeof parsed.lastCheckInDate === 'string' ? parsed.lastCheckInDate : null,
      claimedMissionIds: Array.isArray(parsed.claimedMissionIds) ? parsed.claimedMissionIds : [],
      recentMatches: Array.isArray(parsed.recentMatches) ? parsed.recentMatches.slice(0, 8) : [],
    };
  } catch {
    return {
      ...fallback,
      elo: baseElo,
      wins: baseWins,
      draws: baseDraws,
      losses: baseLosses,
      managerXp: baseXp,
    };
  }
}

function saveNewGenLobbyState(profileId: string, state: PersistedNewGenLobbyState): void {
  try {
    window.localStorage.setItem(`fco_newgen_lobby_v2_${profileId}`, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Full-bleed Night Stadium Backdrop with clean offscreen reconstruction
 * (zero legacy FO4 blue bars or right-hand button artifacts).
 */
const LobbyStadiumStage: React.FC<{ dimmedForLineup: boolean }> = ({ dimmedForLineup }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cleanPlateRef = useRef<HTMLCanvasElement | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const drawToViewport = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      const plate = cleanPlateRef.current;
      if (!container || !canvas || !plate) return;

      const rect = container.getBoundingClientRect();
      const vw = Math.max(1, Math.round(rect.width));
      const vh = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) {
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.clearRect(0, 0, vw, vh);

      if (plate.width > 0 && plate.height > 0) {
        const sw = plate.width;
        const sh = plate.height;
        const scale = Math.max(vw / sw, vh / sh);
        const drawW = sw * scale;
        const drawH = sh * scale;
        const dx = -(drawW - vw) * 0.52;
        const dy = -(drawH - vh) * 0.45;
        ctx.drawImage(plate, dx, dy, drawW, drawH);
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, vh);
        bgGrad.addColorStop(0, '#070b14');
        bgGrad.addColorStop(0.55, '#0c1829');
        bgGrad.addColorStop(1, '#081b12');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, vw, vh);
      }

      // EA SPORTS FC Online Night Stadium Spotlight & Turf Horizon Accent
      const spotX = vw * 0.72;
      const spotY = vh * 0.56;
      const spotGrad = ctx.createRadialGradient(spotX, spotY, 10, spotX, spotY, Math.max(vw, vh) * 0.48);
      spotGrad.addColorStop(0, 'rgba(163, 230, 53, 0.22)');
      spotGrad.addColorStop(0.35, 'rgba(34, 197, 94, 0.10)');
      spotGrad.addColorStop(1, 'rgba(5, 8, 15, 0)');
      ctx.fillStyle = spotGrad;
      ctx.fillRect(0, 0, vw, vh);

      // Subtle stadium pitch perspective arc on bottom right pedestal
      ctx.save();
      ctx.strokeStyle = 'rgba(163, 230, 53, 0.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(spotX, vh * 0.86, vw * 0.28, vh * 0.13, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Authentic FC Online New-Gen Left & Perimeter Carbon Scrims so left Mode Cards and Top/Bottom Bars have WCAG AA contrast
      const leftGrad = ctx.createLinearGradient(0, 0, Math.min(580, vw * 0.52), 0);
      leftGrad.addColorStop(0, 'rgba(6, 9, 15, 0.90)');
      leftGrad.addColorStop(0.65, 'rgba(6, 9, 15, 0.62)');
      leftGrad.addColorStop(1, 'rgba(6, 9, 15, 0)');
      ctx.fillStyle = leftGrad;
      ctx.fillRect(0, 0, Math.min(580, vw * 0.52), vh);

      const topGrad = ctx.createLinearGradient(0, 0, 0, 96);
      topGrad.addColorStop(0, 'rgba(5, 8, 14, 0.88)');
      topGrad.addColorStop(1, 'rgba(5, 8, 14, 0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, vw, 96);

      const botGrad = ctx.createLinearGradient(0, vh - 110, 0, vh);
      botGrad.addColorStop(0, 'rgba(5, 8, 14, 0)');
      botGrad.addColorStop(1, 'rgba(5, 8, 14, 0.90)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, vh - 110, vw, 110);
    };

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      const sw = img.naturalWidth || 1280;
      const sh = img.naturalHeight || 720;
      const off = document.createElement('canvas');
      off.width = sw;
      off.height = sh;
      const octx = off.getContext('2d');
      if (!octx) return;

      octx.drawImage(img, 0, 0, sw, sh);
      cleanPlateRef.current = off;
      drawToViewport();
    };
    img.onerror = () => {
      if (!cancelled) {
        setImageError(false);
        const fallback = document.createElement('canvas');
        fallback.width = 0;
        fallback.height = 0;
        cleanPlateRef.current = fallback;
        drawToViewport();
      }
    };
    img.src = REFERENCE_STADIUM_SCENE_URL;

    const ro = new ResizeObserver(() => drawToViewport());
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, []);

  if (imageError) {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#090d16] via-[#121c2e] to-[#0f381c]"
      />
    );
  }

  return (
    <div ref={containerRef} aria-hidden="true" className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="w-full h-full block" />
      {dimmedForLineup && <div className="absolute inset-0 bg-[#060911]/65 transition-opacity" />}
    </div>
  );
};

export const LobbyView: React.FC<LobbyViewProps> = ({
  profile,
  vipStatus,
  totalUnopenedPacks,
  muted,
  isAdmin = false,
  gmSessionUnlocked = false,
  serverRules,
  forceLandscape = false,
  onToggleLandscapeMode,
  onReturnToMasterAdmin,
  onToggleMute,
  onOpenAuthModal,
  onPauseGame,
  onReturnToTitle,
  onUpdateProfile,
  onNavigateTab,
  onSelectForUpgrade,
  onOpenLockerRoom,
  onGoToMarketPlayer,
}) => {
  const [lobbyState, setLobbyState] = useState<PersistedNewGenLobbyState>(() =>
    loadNewGenLobbyState(profile)
  );
  const [activeModal, setActiveModal] = useState<NewGenModalId>(null);
  const [stageView, setStageView] = useState<'stadium_stars' | 'club_captains'>('stadium_stars');
  const [missionsSubTab, setMissionsSubTab] = useState<'daily' | 'star_pass'>('daily');
  const [eventsSubTab, setEventsSubTab] = useState<'checkin' | 'giftcode' | 'seasons'>('checkin');
  const [lastMatch, setLastMatch] = useState<SimulatedMatchResult | null>(null);
  const [giftInput, setGiftInput] = useState('');
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [modalFeedback, setModalFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setLobbyState(loadNewGenLobbyState(profile));
  }, [profile.id]);

  useEffect(() => {
    setLobbyState((prev) => {
      const nextElo = typeof profile.elo === 'number' ? profile.elo : prev.elo;
      const nextWins = typeof profile.wins === 'number' ? profile.wins : prev.wins;
      const nextDraws = typeof profile.draws === 'number' ? profile.draws : prev.draws;
      const nextLosses = typeof profile.losses === 'number' ? profile.losses : prev.losses;
      const nextXp = typeof profile.managerXp === 'number' ? profile.managerXp : prev.managerXp;
      if (
        prev.elo === nextElo &&
        prev.wins === nextWins &&
        prev.draws === nextDraws &&
        prev.losses === nextLosses &&
        prev.managerXp === nextXp
      ) {
        return prev;
      }
      const synced: PersistedNewGenLobbyState = {
        ...prev,
        elo: nextElo,
        wins: nextWins,
        draws: nextDraws,
        losses: nextLosses,
        managerXp: nextXp,
      };
      saveNewGenLobbyState(profile.id, synced);
      return synced;
    });
  }, [profile.id, profile.elo, profile.wins, profile.draws, profile.losses, profile.managerXp]);

  const persistState = (next: PersistedNewGenLobbyState) => {
    setLobbyState(next);
    saveNewGenLobbyState(profile.id, next);
  };

  const squadSummary = useMemo(() => calculateSquadSummary(profile.cards), [profile.cards]);

  const activeLineup = useMemo(
    () =>
      buildFormationLineup(
        profile.cards,
        profile.formation ?? '4-3-3',
        profile.lineupSlotUids
      ),
    [profile.cards, profile.formation, profile.lineupSlotUids]
  );

  const teamColorEval = useMemo(
    () =>
      evaluateSquadTeamColors(
        activeLineup.slots.map((s) => s.card),
        profile.activeTeamColorId ?? 'auto'
      ),
    [activeLineup.slots, profile.activeTeamColorId]
  );

  const topThreeCaptains: OwnedCard[] = useMemo(() => {
    return [...activeLineup.slots.map((s) => s.card)]
      .sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp)
      .slice(0, 3);
  }, [activeLineup.slots]);

  const captainCard = topThreeCaptains[0] ?? profile.cards[0] ?? null;
  const captainTpl = captainCard ? PLAYER_TEMPLATE_MAP[captainCard.templateId] : null;
  const headerClubCode =
    captainTpl && captainTpl.clubCode !== 'ICONS' && captainTpl.clubCode !== 'ICON'
      ? captainTpl.clubCode
      : 'RMA';

  const activeCoach = useMemo(
    () =>
      HEAD_COACH_CATALOG.find((c) => c.id === lobbyState.selectedCoachId) ??
      HEAD_COACH_CATALOG[0],
    [lobbyState.selectedCoachId]
  );

  const managerLv = useMemo(
    () => calculateManagerLevelStatus(lobbyState.managerXp),
    [lobbyState.managerXp]
  );
  const rankTier = useMemo(() => getRankTierForScore(lobbyState.elo), [lobbyState.elo]);

  const missions = useMemo(
    () => evaluateLobbyMissions(profile, lobbyState.claimedMissionIds),
    [profile, lobbyState.claimedMissionIds]
  );
  const claimableMissionCount = useMemo(
    () => missions.filter((m) => m.completed && !m.claimed).length,
    [missions]
  );

  const unreadInboxCount = useMemo(
    () => INITIAL_CLUB_INBOX.filter((m) => !lobbyState.claimedInboxIds.includes(m.id)).length,
    [lobbyState.claimedInboxIds]
  );

  const claimableStarPassCount = useMemo(() => {
    let count = 0;
    for (const t of STAR_PASS_TIERS) {
      if (lobbyState.starPassXp >= t.requiredXp) {
        if (!lobbyState.claimedStarPassKeys.includes(`sp_${t.tier}_free`)) count++;
        if (
          lobbyState.starPassPremium &&
          !lobbyState.claimedStarPassKeys.includes(`sp_${t.tier}_premium`)
        ) {
          count++;
        }
      }
    }
    return count;
  }, [lobbyState.starPassXp, lobbyState.claimedStarPassKeys, lobbyState.starPassPremium]);

  const currentStarPassTier = useMemo(() => {
    let reached = 1;
    for (const t of STAR_PASS_TIERS) {
      if (lobbyState.starPassXp >= t.requiredXp) reached = t.tier;
    }
    return reached;
  }, [lobbyState.starPassXp]);

  const todayKey = getTodayKey();
  const canCheckInToday = lobbyState.lastCheckInDate !== todayKey;

  const openModal = (id: NewGenModalId) => {
    gameSound.playClick(1.06);
    setModalFeedback(null);
    setActiveModal(id);
  };

  const closeModal = () => {
    gameSound.playClick(0.92);
    setModalFeedback(null);
    setActiveModal(null);
  };

  // ================= 100% FC ONLINE NEW-GEN ACTION HANDLERS =================

  const [glxhLiveSessionKey, setGlxhLiveSessionKey] = useState<number | null>(null);

  const commitSimulatedMatchResult = (
    sim: SimulatedMatchResult,
    showResultModal: boolean = true
  ) => {
    const nextWins = lobbyState.wins + (sim.outcome === 'WIN' ? 1 : 0);
    const nextDraws = lobbyState.draws + (sim.outcome === 'DRAW' ? 1 : 0);
    const nextLosses = lobbyState.losses + (sim.outcome === 'LOSS' ? 1 : 0);
    const nextManagerXp = lobbyState.managerXp + sim.managerXpEarned;

    onUpdateProfile((prev) => ({
      ...prev,
      bp: Math.min(5_000_000_000_000_000, prev.bp + sim.bpEarned),
      starPoints: (prev.starPoints ?? 0) + sim.starPointsEarned,
      elo: sim.eloAfter,
      wins: nextWins,
      draws: nextDraws,
      losses: nextLosses,
      managerXp: nextManagerXp,
      squadOvr: teamColorEval.boostedAvgOvr,
    }));

    const summaryItem: StoredMatchSummary = {
      id: sim.id,
      modeLabel: sim.modeLabel,
      opponentName: sim.opponentName,
      userGoals: sim.userGoals,
      opponentGoals: sim.opponentGoals,
      outcome: sim.outcome,
      eloDelta: sim.eloDelta,
      mvpName: sim.mvpName,
    };

    const nextLobby: PersistedNewGenLobbyState = {
      ...lobbyState,
      elo: sim.eloAfter,
      wins: nextWins,
      draws: nextDraws,
      losses: nextLosses,
      managerXp: nextManagerXp,
      starPassXp: lobbyState.starPassXp + sim.starPassXpEarned,
      recentMatches: [summaryItem, ...lobbyState.recentMatches].slice(0, 8),
    };
    persistState(nextLobby);
    setLastMatch(sim);
    setModalFeedback(null);
    if (showResultModal) {
      setActiveModal('match_result');
    }
  };

  const handlePlayMatch = (mode: FcMatchMode) => {
    gameSound.playWalkoutStage('reveal');
    if (mode === 'glxh_manager') {
      setActiveModal(null);
      setModalFeedback(null);
      setGlxhLiveSessionKey((k) => (k ?? 0) + 1);
      return;
    }

    const sim = simulateFcOnlineMatch({
      profile,
      squadOvr: teamColorEval.boostedAvgOvr,
      coachId: activeCoach.id,
      currentElo: lobbyState.elo,
      mode,
      serverRules,
    });
    commitSimulatedMatchResult(sim, true);
  };

  const handleClaimInbox = (mailIds: string[]) => {
    const res = claimClubInboxMessages(profile, mailIds, lobbyState.claimedInboxIds);
    if (!res.ok) {
      gameSound.playClick(0.78);
      setModalFeedback({ ok: false, text: res.summaryText });
      return;
    }
    gameSound.playUpgradeOutcome(true);
    const prevClaimed = lobbyState.claimedInboxIds;
    const nextLobby: PersistedNewGenLobbyState = {
      ...lobbyState,
      claimedInboxIds: [...prevClaimed, ...res.claimedNowIds],
    };
    persistState(nextLobby);
    onUpdateProfile((prev) => claimClubInboxMessages(prev, mailIds, prevClaimed).nextProfile);
    setModalFeedback({ ok: true, text: res.summaryText });
  };

  const handleUnlockStarPassPremium = () => {
    const res = unlockPremiumStarPass(profile, lobbyState.starPassPremium);
    if (!res.ok) {
      gameSound.playClick(0.78);
      setModalFeedback({ ok: false, text: res.error ?? 'Không thể mở khóa Star Pass Vượt Trội.' });
      return;
    }
    gameSound.playUpgradeOutcome(true);
    const wasPrem = lobbyState.starPassPremium;
    persistState({ ...lobbyState, starPassPremium: true });
    onUpdateProfile((prev) => unlockPremiumStarPass(prev, wasPrem).nextProfile);
    setModalFeedback({
      ok: true,
      text: 'Đã mở khóa Thẻ Ngôi Sao Vượt Trội (Premium)! Bạn có thể nhận toàn bộ mốc quà Vượt Trội.',
    });
  };

  const handleClaimStarPass = (tier: number, track: 'free' | 'premium') => {
    const res = claimStarPassTierReward({
      profile,
      tier,
      track,
      starPassXp: lobbyState.starPassXp,
      isPremiumUnlocked: lobbyState.starPassPremium,
      claimedKeys: lobbyState.claimedStarPassKeys,
    });
    if (!res.ok) {
      gameSound.playClick(0.78);
      setModalFeedback({ ok: false, text: res.error ?? 'Không thể nhận mốc Star Pass.' });
      return;
    }
    gameSound.playUpgradeOutcome(true);
    const prevKeys = lobbyState.claimedStarPassKeys;
    const spXpSnap = lobbyState.starPassXp;
    const premSnap = lobbyState.starPassPremium;
    persistState({
      ...lobbyState,
      claimedStarPassKeys: [...prevKeys, res.claimKey],
    });
    onUpdateProfile(
      (prev) =>
        claimStarPassTierReward({
          profile: prev,
          tier,
          track,
          starPassXp: spXpSnap,
          isPremiumUnlocked: premSnap,
          claimedKeys: prevKeys,
        }).nextProfile
    );
    setModalFeedback({
      ok: true,
      text: `Nhận thành công Cấp ${tier} (${track === 'premium' ? 'Vượt Trội' : 'Miễn Phí'}): ${res.rewardText}!`,
    });
  };

  const handleClaimMission = (missionId: string) => {
    const res = claimLobbyMissionReward(profile, missionId, lobbyState.claimedMissionIds);
    if (!res.ok) {
      gameSound.playClick(0.78);
      setModalFeedback({ ok: false, text: res.error ?? 'Chưa thể nhận thưởng nhiệm vụ.' });
      return;
    }
    gameSound.playUpgradeOutcome(true);
    const prevIds = lobbyState.claimedMissionIds;
    persistState({
      ...lobbyState,
      starPassXp: lobbyState.starPassXp + 90,
      claimedMissionIds: [...prevIds, missionId],
    });
    onUpdateProfile((prev) => claimLobbyMissionReward(prev, missionId, prevIds).nextProfile);
    setModalFeedback({
      ok: true,
      text: `Hoàn thành nhiệm vụ: +${res.rewardText} & +90 Star Pass XP!`,
    });
  };

  const handleSelectCoach = (coachId: string) => {
    gameSound.playClick(1.1);
    persistState({ ...lobbyState, selectedCoachId: coachId });
    const picked = HEAD_COACH_CATALOG.find((c) => c.id === coachId);
    if (picked) {
      setModalFeedback({
        ok: true,
        text: `Đã bổ nhiệm HLV Trưởng ${picked.name} (${picked.buffSummary})!`,
      });
    }
  };

  const handleToggleWatchlist = (templateId: string) => {
    gameSound.playClick(1.04);
    const exists = lobbyState.watchlistTemplateIds.includes(templateId);
    const nextIds = exists
      ? lobbyState.watchlistTemplateIds.filter((id) => id !== templateId)
      : [templateId, ...lobbyState.watchlistTemplateIds].slice(0, 16);
    persistState({ ...lobbyState, watchlistTemplateIds: nextIds });
  };

  const handleRedeemCode = (codeToUse?: string) => {
    const targetCode = codeToUse ?? giftInput;
    const res = redeemGiftCode(profile, targetCode, lobbyState.redeemedCodes);
    if (!res.ok) {
      gameSound.playClick(0.75);
      setModalFeedback({ ok: false, text: res.error ?? 'Không thể nhận Gift Code.' });
      return;
    }
    gameSound.playUpgradeOutcome(true);
    const prevCodes = lobbyState.redeemedCodes;
    persistState({
      ...lobbyState,
      redeemedCodes: [...prevCodes, res.normalizedCode],
    });
    onUpdateProfile((prev) => redeemGiftCode(prev, targetCode, prevCodes).nextProfile);
    setGiftInput('');
    setModalFeedback({
      ok: true,
      text: `Nhập mã ${res.normalizedCode} thành công: Nhận ${res.rewardText}!`,
    });
  };

  const handleDailyCheckIn = () => {
    const res = claimDailyCheckIn(
      profile,
      lobbyState.claimedDaysCount,
      lobbyState.lastCheckInDate,
      todayKey
    );
    if (!res.ok) {
      gameSound.playClick(0.75);
      setModalFeedback({ ok: false, text: res.error ?? 'Đã điểm danh hôm nay.' });
      return;
    }
    gameSound.playUpgradeOutcome(true);
    const prevCount = lobbyState.claimedDaysCount;
    const prevDate = lobbyState.lastCheckInDate;
    persistState({
      ...lobbyState,
      claimedDaysCount: res.nextClaimedDaysCount,
      lastCheckInDate: todayKey,
      starPassXp: lobbyState.starPassXp + 60,
    });
    onUpdateProfile(
      (prev) => claimDailyCheckIn(prev, prevCount, prevDate, todayKey).nextProfile
    );
    setModalFeedback({
      ok: true,
      text: `Điểm danh Ngày ${res.dayClaimed} thành công: +${res.rewardText} & +60 Star Pass XP!`,
    });
  };

  const watchlistTemplates = useMemo(() => {
    return lobbyState.watchlistTemplateIds
      .map((id) => PLAYER_TEMPLATE_MAP[id])
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
  }, [lobbyState.watchlistTemplateIds]);

  const watchlistCandidateResults = useMemo(() => {
    const q = watchlistSearch.trim().toLowerCase();
    if (!q) return PLAYER_TEMPLATES.slice(0, 6);
    return PLAYER_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.seasonLabel.toLowerCase().includes(q) ||
        t.clubName.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [watchlistSearch]);

  const bottomClientMenu: Array<{
    id: string;
    label: string;
    icon: FcoIconId;
    hotkey: string;
    accent?: boolean;
    count?: number;
    onClick: () => void;
  }> = [
    {
      id: 'squad',
      label: 'Đội bóng',
      icon: 'squad',
      hotkey: 'F1',
      accent: true,
      onClick: () => {
        gameSound.playClick(1.08);
        onNavigateTab('squad');
      },
    },
    {
      id: 'upgrade',
      label: 'Nâng cấp',
      icon: 'upgrade',
      hotkey: 'F2',
      onClick: () => {
        gameSound.playClick(1.08);
        onNavigateTab('upgrade');
      },
    },
    {
      id: 'market',
      label: 'TTCN',
      icon: 'market',
      hotkey: 'F3',
      onClick: () => {
        gameSound.playClick(1.08);
        onGoToMarketPlayer(undefined);
      },
    },
    {
      id: 'vault',
      label: 'Vật phẩm',
      icon: 'vault',
      hotkey: 'F4',
      count: totalUnopenedPacks,
      onClick: () => {
        gameSound.playClick(1.08);
        onNavigateTab('vault');
      },
    },
    {
      id: 'shop',
      label: 'Shop',
      icon: 'shop',
      hotkey: 'F5',
      onClick: () => {
        gameSound.playClick(1.08);
        onNavigateTab('shop');
      },
    },
    {
      id: 'foosball',
      label: 'Bi Lắc 10K',
      icon: 'foosball',
      hotkey: 'F6',
      count:
        (profile.foosballLoops ?? 0) +
        getUnclaimedReachedMilestones(profile.foosballSpins, profile.claimedMilestones).length,
      onClick: () => {
        gameSound.playClick(1.08);
        onNavigateTab('foosball');
      },
    },
    {
      id: 'club',
      label: 'CLB & BXH',
      icon: 'club',
      hotkey: 'F7',
      onClick: () => openModal('club_hub'),
    },
    {
      id: 'locker',
      label: 'Thay đồ',
      icon: 'locker',
      hotkey: 'F8',
      onClick: () => {
        gameSound.playClick(1.06);
        onNavigateTab('locker');
      },
    },
    {
      id: 'missions_center',
      label: 'Nhiệm vụ',
      icon: 'missions',
      hotkey: 'M',
      count: claimableMissionCount + claimableStarPassCount,
      onClick: () => {
        setMissionsSubTab('daily');
        openModal('missions');
      },
    },
    {
      id: 'events',
      label: 'Sự kiện',
      icon: 'events',
      hotkey: 'E',
      count: canCheckInToday ? 1 : 0,
      onClick: () => {
        setEventsSubTab('checkin');
        openModal('events_hub');
      },
    },
    {
      id: 'watchlist',
      label: 'Theo dõi',
      icon: 'watchlist',
      hotkey: 'W',
      count: watchlistTemplates.length,
      onClick: () => openModal('watchlist'),
    },
  ];

  return (
    <div
      data-testid="fco-pc-lobby"
      className="relative w-full h-full overflow-hidden select-none flex flex-col justify-between bg-[#070b12]"
    >
      {/* Full-Bleed Stadium Backdrop (Zero Scroll, Zero Legacy FO4 Blue Bars) */}
      <LobbyStadiumStage dimmedForLineup={stageView === 'club_captains'} />

      {/* ZONE 1: AUTHENTIC EA SPORTS FC™ ONLINE PC CLIENT TOP BAR */}
      <header
        aria-label="Thanh thông tin Huấn luyện viên FC Online Thế Hệ Mới"
        className="relative z-20 shrink-0 w-full fco-pc-topbar px-2.5 sm:px-5 py-1.5"
      >
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-2">
          {/* Left Identity Cluster: FC Triangle Emblem + Club Crest + Lv.XP + Manager + Rank + Squad OVR */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 min-w-0 max-w-[46%] sm:max-w-[42%] lg:max-w-none">
            {/* EA SPORTS FC™ ONLINE Triangle Mark */}
            <div className="flex items-center gap-1.5 sm:gap-2 pr-1.5 sm:pr-2.5 border-r border-white/10 shrink-0">
              <FcOnlineTriangleMark className="w-5 h-4 sm:w-7 sm:h-6 shrink-0" />
              <div className="leading-none">
                <div className="hidden sm:block text-[8px] font-bold tracking-[0.2em] text-[#a3e635] uppercase">
                  EA SPORTS
                </div>
                <span
                  className="text-sm sm:text-lg font-black italic tracking-tight text-white whitespace-nowrap"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  FC <span className="text-[#a3e635]">ONLINE</span>
                </span>
              </div>
            </div>

            {/* Club Crest + Manager Level */}
            <button
              type="button"
              onClick={() => openModal('club_hub')}
              aria-label={`Hồ sơ CLB ${profile.managerName}`}
              className="flex items-center gap-1.5 sm:gap-2 group cursor-pointer min-w-0 min-h-[34px]"
            >
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-sm bg-[#111827] border border-[#a3e635]/45 p-0.5 sm:p-1 flex items-center justify-center shrink-0 group-hover:border-[#a3e635] transition-colors">
                <ClubCrestSvg clubCode={headerClubCode} className="w-full h-full" />
              </div>

              <div className="min-w-0 text-left">
                <div className="flex items-center gap-1 sm:gap-2">
                  <span className="text-[10px] sm:text-xs font-mono font-extrabold text-[#a3e635] tabular-nums shrink-0">
                    Lv.{managerLv.level}
                  </span>
                  <span className="text-[11px] sm:text-sm font-bold text-white group-hover:text-[#a3e635] truncate transition-colors">
                    {profile.managerName}
                  </span>
                  <span
                    className="hidden lg:inline text-[11px] font-bold tabular-nums whitespace-nowrap"
                    style={{ color: rankTier.accentHex }}
                  >
                    · {rankTier.name} ({lobbyState.elo} ĐXH)
                  </span>
                </div>

                {/* Manager XP Progress Bar + Unboxed Club Telemetry */}
                <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-400 tabular-nums">
                  <div className="hidden min-[440px]:block w-10 sm:w-16 h-1 bg-slate-800 rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full bg-[#a3e635]"
                      style={{ width: `${managerLv.progressPercent}%` }}
                    />
                  </div>
                  <span className="whitespace-nowrap">OVR {teamColorEval.boostedAvgOvr}</span>
                  <span className="hidden lg:inline whitespace-nowrap">
                    · Lương {activeLineup.totalSalary}/{SALARY_CAP}
                  </span>
                  <span className="hidden xl:inline text-emerald-300 whitespace-nowrap">
                    · CLB {formatBpCompact(squadSummary.squadValue)}
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* Right Currencies & Authentic FC Online PC Utility Bar */}
          <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar fco-touch-scroll">
            <div className="ml-auto flex w-max items-center gap-1 sm:gap-1.5 tabular-nums">
            {/* BP Balance */}
            <button
              type="button"
              data-testid="lobby-bp-display"
              onClick={() => onGoToMarketPlayer(undefined)}
              className="fco-pc-currency-pill min-h-[34px] flex items-center px-2.5 py-1 rounded-sm hover:border-[#a3e635]/50 text-[11px] sm:text-xs font-extrabold text-white cursor-pointer whitespace-nowrap transition-colors"
            >
              <span className="text-[#a3e635] mr-1 font-mono text-[10px]">BP</span>
              <span>{formatBpCompact(profile.bp).replace('.', ',')}</span>
            </button>

            {/* Điểm Sao / Tarpoi */}
            <button
              type="button"
              onClick={() => onNavigateTab('shop')}
              aria-label="Mở Shop Điểm Sao Tarpoi"
              className="hidden md:flex items-center gap-1 fco-pc-currency-pill min-h-[34px] px-2.5 py-1 rounded-sm hover:border-amber-400/50 text-xs font-bold text-amber-300 cursor-pointer whitespace-nowrap transition-colors"
            >
              <span className="text-amber-200/80 text-[10px]">TARPOI</span>
              <strong className="font-mono">
                {(profile.starPoints ?? 0).toLocaleString('vi-VN')}
              </strong>
            </button>

            {/* FC + Đặc Quyền SVIP */}
            <button
              type="button"
              onClick={() => onNavigateTab('vip')}
              aria-label={`Số dư ${profile.fc} FC · SVIP ${vipStatus.level}`}
              className="fco-pc-currency-pill min-h-[34px] flex items-center gap-1 px-2.5 py-1 rounded-sm hover:border-amber-400/50 text-[11px] sm:text-xs font-bold text-amber-400 cursor-pointer whitespace-nowrap transition-colors"
            >
              <span className="font-mono">{profile.fc.toLocaleString('vi-VN')} FC</span>
              <span className="text-[10px] text-slate-300 hidden sm:inline">
                · SVIP {vipStatus.level}
              </span>
            </button>

            {/* Hộp Thư CLB (Inbox) */}
            <button
              type="button"
              data-testid="lobby-btn-inbox"
              aria-label={`Hộp thư CLB (${unreadInboxCount} thư mới)`}
              onClick={() => openModal('inbox')}
              className="relative min-h-[34px] px-2.5 rounded-sm bg-[#121a2a] hover:bg-[#1a263d] border border-white/12 flex items-center gap-1 text-[11px] sm:text-xs font-bold text-slate-100 cursor-pointer whitespace-nowrap"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-3.5 h-3.5 text-[#a3e635]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </svg>
              <span className="hidden lg:inline">Hộp thư</span>
              {unreadInboxCount > 0 && (
                <span className="font-mono text-[10px] font-extrabold text-[#a3e635]">
                  ({unreadInboxCount})
                </span>
              )}
            </button>

            {/* Star Pass Shortcut */}
            <button
              type="button"
              data-testid="lobby-btn-starpass"
              aria-label="Thẻ Ngôi Sao Star Pass FC Online"
              onClick={() => openModal('star_pass')}
              className="relative min-h-[34px] px-2.5 rounded-sm bg-[#132016] hover:bg-[#1a2e1f] border border-[#a3e635]/45 flex items-center gap-1 text-[11px] sm:text-xs font-extrabold text-[#a3e635] cursor-pointer whitespace-nowrap"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                <path d="M12 2l2.9 6.1L22 9.2l-5 4.8 1.2 6.9L12 17.7 5.8 20.9 7 14 2 9.2l7.1-1.1L12 2z" />
              </svg>
              <span className="hidden sm:inline">Star Pass</span>
            </button>

            {/* Admin Game Control Shortcut — Strictly Visible Only to Admin Accounts */}
            {(isAdmin || gmSessionUnlocked) && (
              <button
                type="button"
                data-testid="lobby-btn-gm-console"
                onClick={() => {
                  gameSound.playClick(1.1);
                  if (!isAdmin && onReturnToMasterAdmin) {
                    onReturnToMasterAdmin();
                  } else {
                    onNavigateTab('admin');
                  }
                }}
                className="min-h-[34px] px-2.5 rounded-sm bg-amber-400 hover:bg-amber-300 flex items-center gap-1 text-[11px] sm:text-xs font-extrabold text-slate-950 cursor-pointer whitespace-nowrap"
              >
                <span>{isAdmin ? 'Kiểm Soát' : 'Về GM'}</span>
              </button>
            )}

            {/* Landscape 90° Quick Switcher */}
            {onToggleLandscapeMode && (
              <button
                type="button"
                data-testid="lobby-btn-landscape"
                onClick={onToggleLandscapeMode}
                title="Chuyển chế độ Màn Hình Ngang 90° cho điện thoại"
                className={`min-h-[34px] px-2.5 rounded-sm border text-[11px] font-black cursor-pointer whitespace-nowrap transition-colors ${
                  forceLandscape
                    ? 'bg-[#a3e635] text-slate-950 border-[#bef264]'
                    : 'bg-[#121a2a] hover:bg-[#1a263d] text-slate-200 border-white/15'
                }`}
              >
                Ngang
              </button>
            )}

            {/* Install APK / Android App */}
            <button
              type="button"
              data-testid="lobby-btn-apk-install"
              aria-label="Cài đặt APK & App Android FC Online"
              onClick={() => openModal('apk_install')}
              className="min-h-[34px] px-2.5 rounded-sm bg-emerald-950/90 hover:bg-emerald-900 border border-[#a3e635]/50 flex items-center gap-1 text-[11px] sm:text-xs font-black text-[#a3e635] cursor-pointer whitespace-nowrap shadow-sm"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1523-.5676.416.416 0 00-.5676.1523l-2.0223 3.503C15.5802 8.4116 13.8443 8.125 12 8.125s-3.5802.2866-5.1366.8299L4.8411 5.4519a.416.416 0 00-.5676-.1523.416.416 0 00-.1523.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.75h24c-.3432-4.0911-2.6889-7.5633-6.1185-9.4286" />
              </svg>
              <span className="hidden sm:inline">APK</span>
            </button>

            {/* Settings / Account / Audio */}
            <button
              type="button"
              data-testid="lobby-btn-settings"
              aria-label="Cài đặt hệ thống & Tài khoản HLV"
              onClick={() => openModal('settings')}
              className="w-9 h-9 rounded-sm bg-[#121a2a] hover:bg-[#1a263d] border border-white/12 flex items-center justify-center text-slate-200 cursor-pointer shrink-0"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            </div>
          </div>
        </div>
      </header>

      {/* Active Global Server Buffs & Admin Broadcast Bar — Usable by All Players Across Devices */}
      {serverRules &&
        (serverRules.guaranteedUpgrade100 ||
          serverRules.upgradeRateMultiplier > 1 ||
          serverRules.zeroMarketTax ||
          serverRules.matchRewardMultiplier > 1 ||
          Boolean(serverRules.serverAnnouncement)) && (
          <div
            data-testid="lobby-gm-announcement"
            className="relative z-20 shrink-0 w-full bg-[#0a160e]/94 border-b border-[#a3e635]/40 px-2.5 sm:px-6 py-1"
          >
            <div className="max-w-[1440px] mx-auto flex items-center gap-2 text-[11px] sm:text-xs tabular-nums overflow-x-auto no-scrollbar">
              <strong className="text-[#a3e635] shrink-0 whitespace-nowrap">SỰ KIỆN MÁY CHỦ:</strong>
              {serverRules.guaranteedUpgrade100 && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('upgrade')}
                  className="text-amber-300 hover:text-amber-200 font-bold underline underline-offset-2 cursor-pointer whitespace-nowrap shrink-0"
                >
                  100% Đập thẻ thành công
                </button>
              )}
              {!serverRules.guaranteedUpgrade100 && serverRules.upgradeRateMultiplier > 1 && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('upgrade')}
                  className="text-amber-300 hover:text-amber-200 font-bold underline underline-offset-2 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Tỉ lệ đập thẻ x{serverRules.upgradeRateMultiplier}
                </button>
              )}
              {serverRules.zeroMarketTax && (
                <button
                  type="button"
                  onClick={() => onGoToMarketPlayer(undefined)}
                  className="text-emerald-300 hover:text-emerald-200 font-bold underline underline-offset-2 cursor-pointer whitespace-nowrap shrink-0"
                >
                  · Miễn 100% thuế TTCN (0%)
                </button>
              )}
              {serverRules.matchRewardMultiplier > 1 && (
                <span className="text-sky-300 font-bold whitespace-nowrap shrink-0">
                  · Thưởng BP ĐXH x{serverRules.matchRewardMultiplier}
                </span>
              )}
              {serverRules.serverAnnouncement && (
                <span className="text-white font-semibold truncate min-w-0">
                  · {serverRules.serverAnnouncement}
                </span>
              )}
            </div>
          </div>
        )}

      {/* ZONE 2: MAIN 100% FC ONLINE PC WIDESCREEN PLAYABLE STAGE (Stacks on narrow mobile portrait, sleek 2-pane on landscape/desktop) */}
      <div className="relative z-10 flex-1 min-h-0 max-w-[1440px] w-full mx-auto px-2.5 sm:px-5 py-2 sm:py-3 flex flex-col sm:flex-row items-stretch justify-between gap-2.5 sm:gap-5 overflow-y-auto lg:overflow-hidden fco-touch-scroll pointer-events-auto">
        {/* LEFT COLUMN: AUTHENTIC FC ONLINE PC MATCHMAKING & SPECIAL MODES HUB */}
        <div className="w-full sm:w-[345px] md:w-[385px] lg:w-[415px] shrink-0 flex flex-col justify-start lg:justify-between gap-2 sm:gap-2.5 sm:max-h-full sm:overflow-y-auto no-scrollbar fco-touch-scroll">
          {/* Primary Card: TRẬN ĐẤU CHÍNH THỨC (Ranked 1vs1 & Giả Lập Xếp Hạng GLXH) */}
          <section
            aria-label="Trận đấu chính thức FC Online"
            className="fco-pc-panel-glow fco-pc-mode-tile rounded-lg p-2.5 sm:p-4 flex flex-col gap-1.5 sm:gap-2.5 relative overflow-hidden shrink-0 border-l-4 border-l-[#a3e635]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[9px] sm:text-[11px] font-bold tracking-wider text-[#a3e635] truncate">
                  TRẬN ĐẤU CHÍNH THỨC · MÙA 2026
                </div>
                <h2
                  className="text-base sm:text-[26px] font-extrabold italic text-white leading-none mt-0.5 truncate"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  ĐẤU XẾP HẠNG &amp; GLXH
                </h2>
              </div>

              <div className="text-right tabular-nums shrink-0">
                <div
                  className="text-[11px] sm:text-sm font-extrabold"
                  style={{ color: rankTier.accentHex }}
                >
                  {rankTier.name}
                </div>
                <div className="text-[10px] sm:text-xs font-mono text-slate-300">
                  {lobbyState.elo} ĐXH · {lobbyState.wins}T-{lobbyState.draws}H-{lobbyState.losses}B
                </div>
              </div>
            </div>

            {/* Active Tactical Formation & Head Coach Synergy */}
            <div className="rounded-sm bg-[#060a13] border border-white/10 px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] sm:text-xs">
              <div className="min-w-0">
                <div className="text-slate-300 truncate">
                  Sơ đồ <strong className="text-white">{activeLineup.formation.code}</strong> · HLV{' '}
                  <strong className="text-amber-300">{activeCoach.name}</strong>
                </div>
                <div className="hidden lg:block text-[11px] text-emerald-300 truncate">
                  {activeCoach.buffSummary}
                </div>
              </div>
              <button
                type="button"
                data-testid="lobby-btn-coach"
                onClick={() => openModal('head_coach')}
                className="min-h-[30px] px-2.5 py-1 rounded-sm bg-slate-800 hover:bg-slate-700 text-[10px] sm:text-[11px] font-bold text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
              >
                Đổi HLV
              </button>
            </div>

            {/* Primary Matchmaking CTAs (FC Online PC Angled Lime Style) */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <button
                type="button"
                data-testid="lobby-play-ranked"
                onClick={() => handlePlayMatch('ranked_1v1')}
                className="fco-pc-btn-primary fco-pc-tab-skew min-h-[38px] sm:min-h-[44px] py-2 px-2 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_6px_20px_rgba(163,230,53,0.3)] transition-all cursor-pointer whitespace-nowrap active:scale-95 flex items-center justify-center gap-1"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                <FcoIcon name="match" className="w-3 h-3 shrink-0" />
                <span>Xếp Hạng 1vs1</span>
                <span className="hidden lg:inline font-mono text-[10px] bg-slate-950/20 px-1 rounded font-black">[ENTER]</span>
              </button>
              <button
                type="button"
                data-testid="lobby-play-glxh"
                onClick={() => handlePlayMatch('glxh_manager')}
                className="fco-pc-btn-slate fco-pc-tab-skew min-h-[38px] sm:min-h-[44px] py-2 px-2 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap active:scale-95 flex items-center justify-center gap-1"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                <FcoIcon name="glxh" className="w-3.5 h-3.5 text-[#a3e635] shrink-0" />
                <span>Giả Lập GLXH</span>
                <span className="hidden lg:inline font-mono text-[10px] bg-white/10 px-1 rounded font-black">[SPACE]</span>
              </button>
            </div>
          </section>

          {/* Secondary Card: CHẾ ĐỘ ĐẶC BIỆT (Volta Live 4v4 + SVIP + Giftcode) */}
          <section
            aria-label="Chế độ chơi đặc biệt và Star Pass"
            className="flex flex-col gap-1.5 sm:gap-2 rounded-lg fco-pc-panel fco-pc-mode-tile p-2.5 sm:p-3.5 relative overflow-hidden shrink-0"
          >
            <div className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
              <span className="font-bold text-slate-200 tracking-wide whitespace-nowrap">
                CHẾ ĐỘ ĐẶC BIỆT
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] text-[#a3e635] tabular-nums whitespace-nowrap">
                Star Pass Lv.{currentStarPassTier}/{STAR_PASS_TIERS.length} · {lobbyState.starPassXp} XP
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                data-testid="lobby-play-volta"
                onClick={() => handlePlayMatch('volta_4v4')}
                className="min-h-[42px] p-1.5 sm:p-2 rounded-sm bg-[#101829] hover:bg-[#18243c] border border-sky-400/35 text-left transition-colors cursor-pointer"
              >
                <div className="text-[9px] sm:text-[10px] font-bold text-sky-300 truncate">VOLTA LIVE</div>
                <div className="text-[11px] sm:text-xs font-extrabold text-white mt-0.5 whitespace-nowrap truncate">
                  Đá 4vs4 Phố
                </div>
              </button>

              <button
                type="button"
                data-testid="lobby-btn-svip"
                onClick={() => onNavigateTab('vip')}
                className="min-h-[42px] p-1.5 sm:p-2 rounded-sm bg-[#101829] hover:bg-[#18243c] border border-amber-400/35 text-left transition-colors cursor-pointer"
              >
                <div className="text-[9px] sm:text-[10px] font-bold text-amber-300 truncate">SVIP {vipStatus.level}</div>
                <div className="text-[11px] sm:text-xs font-extrabold text-white mt-0.5 whitespace-nowrap truncate">
                  Lương &amp; Thuế
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEventsSubTab('giftcode');
                  openModal('events_hub');
                }}
                className="min-h-[42px] p-1.5 sm:p-2 rounded-sm bg-[#101829] hover:bg-[#18243c] border border-emerald-400/35 text-left transition-colors cursor-pointer"
              >
                <div className="text-[9px] sm:text-[10px] font-bold text-emerald-300 truncate">GIFTCODE</div>
                <div className="text-[11px] sm:text-xs font-extrabold text-white mt-0.5 whitespace-nowrap truncate">
                  Nhập Mã Quà
                </div>
              </button>
            </div>

            {/* Compact Quick Access Row: BXH Thật & Điểm Danh 7 Ngày */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/8 text-[10px] sm:text-xs">
              <button
                type="button"
                onClick={() => {
                  setEventsSubTab('checkin');
                  openModal('events_hub');
                }}
                className="text-amber-300 hover:text-amber-200 font-semibold cursor-pointer whitespace-nowrap truncate py-0.5"
              >
                {canCheckInToday ? 'Điểm danh 7 ngày (Có quà) →' : 'Đã điểm danh hôm nay →'}
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('leaderboard')}
                className="text-slate-300 hover:text-white font-semibold cursor-pointer whitespace-nowrap shrink-0 py-0.5"
              >
                BXH Máy Chủ →
              </button>
            </div>
          </section>
        </div>

        {/* RIGHT / CENTER SHOWCASE: Broadcast Floating Captain Pedestal (Zero Overlap on 390px Landscape, Desktop Centered Pedestal) */}
        <div className="w-full sm:flex-1 flex flex-col justify-start lg:justify-end items-center sm:items-end gap-1.5 min-w-0 sm:max-h-full sm:overflow-y-auto no-scrollbar fco-touch-scroll pb-1 sm:pb-0">
          {stageView === 'stadium_stars' && captainCard && (
            <div className="pointer-events-auto sm:mt-auto shrink-0 flex flex-row lg:flex-col items-center gap-2 lg:gap-1.5 px-2.5 lg:px-4 py-1.5 lg:py-3 rounded-lg bg-[#060a13]/92 border border-[#a3e635]/40 shadow-[0_18px_42px_rgba(0,0,0,0.9)] animate-fadeIn">
              {/* Compact Landscape Card (< lg) */}
              <div className="block lg:hidden shrink-0">
                <PlayerCardView
                  card={captainCard}
                  size="sm"
                  showStats={false}
                  showValue={false}
                  bonusOvr={teamColorEval.cardBonusMap[captainCard.uid]?.bonusOvr ?? 0}
                  onClick={() => onSelectForUpgrade(captainCard.uid)}
                />
              </div>

              {/* Desktop Captain Header & Full Card (>= lg) */}
              <div className="hidden lg:flex items-center gap-2 text-xs tabular-nums whitespace-nowrap">
                <span
                  className="font-black uppercase tracking-wider text-[#a3e635]"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  ĐỘI TRƯỞNG CLB
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-white font-mono font-bold">
                  OVR {captainCard.ovr + (teamColorEval.cardBonusMap[captainCard.uid]?.bonusOvr ?? 0)}
                </span>
              </div>
              <div className="hidden lg:block">
                <PlayerCardView
                  card={captainCard}
                  size="md"
                  showStats={false}
                  showValue
                  bonusOvr={teamColorEval.cardBonusMap[captainCard.uid]?.bonusOvr ?? 0}
                  onClick={() => onSelectForUpgrade(captainCard.uid)}
                />
              </div>

              {/* Captain Actions Column on Mobile Landscape/Portrait, Row on Desktop */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-1 lg:gap-1.5 pt-0.5 min-w-[108px] lg:min-w-0">
                <div className="lg:hidden pb-0.5 border-b border-white/10">
                  <div
                    className="text-[10px] font-black uppercase tracking-wider text-[#a3e635] leading-tight"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    ĐỘI TRƯỞNG CLB
                  </div>
                  <div className="text-[11px] font-mono font-bold text-white tabular-nums leading-tight">
                    OVR {captainCard.ovr + (teamColorEval.cardBonusMap[captainCard.uid]?.bonusOvr ?? 0)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    gameSound.playClick(1.08);
                    onSelectForUpgrade(captainCard.uid);
                  }}
                  className="min-h-[28px] lg:min-h-[32px] px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-sm bg-[#16233b] hover:bg-[#203254] text-[11px] lg:text-xs font-black text-slate-100 hover:text-white border border-[#a3e635]/40 transition-colors cursor-pointer flex items-center justify-center gap-1 active:scale-95 whitespace-nowrap"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  <span className="hidden lg:inline text-[#a3e635] font-mono">[F2]</span>
                  <span>Nâng cấp</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    gameSound.playClick(1.06);
                    onOpenLockerRoom(captainCard.uid);
                  }}
                  className="min-h-[28px] lg:min-h-[32px] px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-sm bg-[#16233b] hover:bg-[#203254] text-[11px] lg:text-xs font-black text-slate-100 hover:text-white border border-white/10 transition-colors cursor-pointer flex items-center justify-center gap-1 active:scale-95 whitespace-nowrap"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  <span className="hidden lg:inline text-amber-300 font-mono">[F8]</span>
                  <span>Thay đồ</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    gameSound.playClick(1.08);
                    onGoToMarketPlayer(captainCard.templateId);
                  }}
                  className="min-h-[28px] lg:min-h-[32px] px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-sm bg-[#16233b] hover:bg-[#203254] text-[11px] lg:text-xs font-black text-slate-100 hover:text-white border border-white/10 transition-colors cursor-pointer flex items-center justify-center gap-1 active:scale-95 whitespace-nowrap"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  <span className="hidden lg:inline text-sky-300 font-mono">[F3]</span>
                  <span>TTCN</span>
                </button>
              </div>
            </div>
          )}

          {stageView === 'club_captains' && (
            <div className="w-full shrink-0 flex items-center justify-start sm:justify-end gap-2 sm:gap-4 pointer-events-auto py-1 overflow-x-auto no-scrollbar fco-touch-scroll">
              {topThreeCaptains.map((c, idx) => (
                <div key={c.uid} className="shrink-0 flex flex-col items-center gap-1.5">
                  <PlayerCardView
                    card={c}
                    size="sm"
                    showStats={false}
                    showValue
                    badgeNote={idx === 0 ? 'ĐỘI TRƯỞNG CLB' : `SIÊU SAO #${idx + 1}`}
                    bonusOvr={teamColorEval.cardBonusMap[c.uid]?.bonusOvr ?? 0}
                    onClick={() => onSelectForUpgrade(c.uid)}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectForUpgrade(c.uid)}
                      className="min-h-[30px] px-2 py-0.5 rounded-sm bg-black/80 hover:bg-black text-[10px] font-bold text-[#a3e635] border border-[#a3e635]/40 cursor-pointer active:scale-95 whitespace-nowrap"
                    >
                      Nâng cấp
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenLockerRoom(c.uid)}
                      className="min-h-[30px] px-2 py-0.5 rounded-sm bg-black/80 hover:bg-black text-[10px] font-bold text-amber-300 border border-amber-400/30 cursor-pointer active:scale-95 whitespace-nowrap"
                    >
                      Thay đồ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Clean Segmented Stage Switcher (Bottom-Right above Dock) */}
          <div className="pointer-events-auto shrink-0 inline-flex items-center gap-1 p-1 rounded-sm bg-[#090d15]/95 border border-white/15 shadow-lg">
            <button
              type="button"
              onClick={() => {
                gameSound.playClick();
                setStageView('stadium_stars');
              }}
              className={`min-h-[32px] px-2.5 py-1 rounded-sm text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                stageView === 'stadium_stars'
                  ? 'bg-[#a3e635] text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Sân Vận Động
            </button>
            <button
              type="button"
              data-testid="lobby-stage-captains"
              onClick={() => {
                gameSound.playClick();
                setStageView('club_captains');
              }}
              className={`min-h-[32px] px-2.5 py-1 rounded-sm text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                stageView === 'club_captains'
                  ? 'bg-[#a3e635] text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Top 3 Đội Hình
            </button>
          </div>
        </div>
      </div>

      {/* ZONE 3: AUTHENTIC EA SPORTS FC™ ONLINE 100% BOTTOM CLIENT DOCK (Vector Icons, Full 11 Items Fit at 1440px) */}
      <nav
        aria-label="Thanh điều hướng chính FC Online PC"
        data-testid="lobby-bottom-dock"
        className="relative z-20 shrink-0 w-full fco-pc-dock px-2 sm:px-4 pt-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))]"
      >
        <div className="max-w-[1440px] mx-auto flex items-center justify-start lg:justify-between gap-1.5 lg:gap-1 overflow-x-auto no-scrollbar fco-touch-scroll py-0.5">
          {bottomClientMenu.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.hotkey ? `${item.label} [${item.hotkey}]` : item.label}
              data-testid={`lobby-dock-${item.id}`}
              onClick={item.onClick}
              className={`fco-pc-nav-btn min-h-[36px] sm:min-h-[38px] px-2.5 lg:px-2 xl:px-2.5 py-1.5 rounded-sm text-xs lg:text-[12px] font-black uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 lg:gap-1 shadow-sm active:scale-95 ${
                item.accent
                  ? 'fco-pc-btn-primary fco-pc-tab-skew text-slate-950 font-black shadow-[0_0_16px_rgba(163,230,53,0.35)]'
                  : 'bg-[#0f1728] hover:bg-[#1a253c] text-slate-100 hover:text-white border border-white/10 hover:border-[#a3e635]/60 hover:shadow-[0_0_14px_rgba(163,230,53,0.18)]'
              }`}
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              <FcoIcon name={item.icon} className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] sm:text-xs tracking-wide">{item.label}</span>
              {item.hotkey && (
                <span
                  className={`hidden 2xl:inline-block font-mono text-[10px] font-black px-1 py-0.2 rounded tabular-nums ${
                    item.accent
                      ? 'bg-slate-950/20 text-slate-950 border border-slate-950/30'
                      : 'bg-black/50 text-[#a3e635] border border-[#a3e635]/35'
                  }`}
                >
                  [{item.hotkey}]
                </span>
              )}
              {item.count !== undefined && item.count > 0 && (
                <span
                  className={`font-mono text-[10px] font-black px-1 py-0.2 rounded tabular-nums ${
                    item.accent
                      ? 'bg-slate-950/20 text-slate-950'
                      : 'bg-[#a3e635]/20 text-[#a3e635] border border-[#a3e635]/40'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* FC Online PC Status Bar (hidden on compact mobile landscape heights so dock remains sleek) */}
        <div className="fco-short-hide hidden sm:flex max-w-[1440px] mx-auto mt-1 pt-1 border-t border-white/5 items-center justify-between text-[10px] font-mono text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#a3e635] tracking-wider">EA SPORTS FC™ ONLINE PC</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">MÙA 2026</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-300 font-sans">[ESC] MENU CHÍNH · CHƠI MƯỢT TRÊN ĐIỆN THOẠI</span>
          </div>
        </div>
      </nav>

      {/* ================= PORTALED FC ONLINE NEW-GEN MODALS ================= */}
      {activeModal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cửa sổ tính năng Sảnh Chính FC Online"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
            className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-4 bg-black/82"
          >
            <div className="w-full max-w-2xl max-h-[90%] overflow-y-auto rounded-xl bg-[#0a101d] border border-[#a3e635]/45 p-4 sm:p-6 shadow-2xl text-slate-100 space-y-4">
              {modalFeedback && (
                <div
                  role="status"
                  data-testid="lobby-modal-feedback"
                  className={`rounded-lg px-4 py-2.5 text-xs font-semibold border ${
                    modalFeedback.ok
                      ? 'bg-emerald-950/90 border-emerald-400/50 text-emerald-200'
                      : 'bg-rose-950/90 border-rose-400/50 text-rose-200'
                  }`}
                >
                  {modalFeedback.text}
                </div>
              )}

              {/* 1. MATCH RESULT MODAL (1vs1 / GLXH / Volta Live) */}
              {activeModal === 'match_result' && lastMatch && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <div className="text-xs font-bold text-[#a3e635] tracking-wider">
                        KẾT QUẢ {lastMatch.modeLabel.toUpperCase()}
                      </div>
                      <h3
                        className="text-2xl sm:text-3xl font-extrabold italic text-white"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        {lastMatch.outcome === 'WIN'
                          ? 'CHIẾN THẮNG THUYẾT PHỤC!'
                          : lastMatch.outcome === 'DRAW'
                          ? 'CHIA ĐIỂM KỊCH TÍNH!'
                          : 'THẤT BẠI ĐÁNG TIẾC · QUYẾT TÂM PHỤC THÙ!'}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>

                  {/* Scoreboard */}
                  <div className="rounded-lg bg-[#060a12] border border-white/10 p-4 grid grid-cols-3 items-center text-center tabular-nums">
                    <div>
                      <div className="text-xs text-slate-400">ĐỘI NHÀ</div>
                      <div className="text-sm sm:text-base font-extrabold text-[#a3e635] mt-0.5 truncate">
                        {profile.managerName}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        OVR {teamColorEval.boostedAvgOvr}
                      </div>
                    </div>

                    <div>
                      <div
                        className="text-4xl sm:text-5xl font-extrabold text-white tracking-wider"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                        data-testid="match-scoreline"
                      >
                        {lastMatch.userGoals} - {lastMatch.opponentGoals}
                      </div>
                      <div className="text-[11px] font-mono text-amber-300 mt-1">
                        MVP: {lastMatch.mvpName}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-400">ĐỘI KHÁCH</div>
                      <div className="text-sm sm:text-base font-extrabold text-white mt-0.5 truncate">
                        {lastMatch.opponentName}
                      </div>
                      <div className="text-[11px] text-slate-400">OVR {lastMatch.opponentOvr}</div>
                    </div>
                  </div>

                  {/* Match Highlights & Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg bg-[#060a12] border border-white/10 p-3 space-y-1.5">
                      <div className="font-bold text-slate-300">DIỄN BIẾN BÀN THẮNG</div>
                      {lastMatch.highlights.length === 0 ? (
                        <div className="text-slate-500">Hòa 0-0 chặt chẽ suốt 90 phút.</div>
                      ) : (
                        lastMatch.highlights.map((h, i) => (
                          <div key={i} className="flex items-center justify-between tabular-nums">
                            <span className={h.isUserGoal ? 'text-[#a3e635] font-semibold' : 'text-rose-300'}>
                              {h.minute}&apos; · {h.scorerName} ({h.seasonLabel})
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {h.isUserGoal ? 'CLB của bạn' : 'Đối thủ'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="rounded-lg bg-[#060a12] border border-white/10 p-3 space-y-1.5 tabular-nums">
                      <div className="font-bold text-slate-300">THỐNG KÊ &amp; PHẦN THƯỞNG TRẬN</div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Kiểm soát bóng · Sút trúng đích</span>
                        <strong className="text-white">
                          {lastMatch.possessionPercent}% · {lastMatch.shotsOnTarget} cú sút
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Điểm Xếp Hạng (ĐXH)</span>
                        <strong
                          className={
                            lastMatch.eloDelta >= 0 ? 'text-[#a3e635]' : 'text-rose-400'
                          }
                        >
                          {lastMatch.eloAfter} ({lastMatch.eloDelta >= 0 ? '+' : ''}
                          {lastMatch.eloDelta})
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Thưởng trận đấu</span>
                        <strong className="text-emerald-300">
                          +{formatBpCompact(lastMatch.bpEarned)} · +{lastMatch.starPointsEarned}{' '}
                          Tarpoi
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Kinh nghiệm HLV &amp; Star Pass</span>
                        <strong className="text-amber-300">
                          +{lastMatch.managerXpEarned} XP · +{lastMatch.starPassXpEarned} SP XP
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePlayMatch(lastMatch.mode)}
                      className="px-5 py-2 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer"
                    >
                      Đá Tiếp Trận Nữa
                    </button>
                  </div>
                </>
              )}

              {/* 2. CLUB INBOX MODAL (HỘP THƯ CLB) */}
              {activeModal === 'inbox' && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <div className="text-xs font-bold text-[#a3e635] tracking-wider">
                        HỘP THƯ CÂU LẠC BỘ · GARENA FC ONLINE
                      </div>
                      <h3
                        className="text-2xl sm:text-3xl font-extrabold italic text-white"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        NHẬN VẬT PHẨM ĐÍNH KÈM ({unreadInboxCount}/{INITIAL_CLUB_INBOX.length})
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {INITIAL_CLUB_INBOX.map((mail) => {
                      const claimed = lobbyState.claimedInboxIds.includes(mail.id);
                      return (
                        <div
                          key={mail.id}
                          className="rounded-lg bg-[#060a12] border border-white/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="text-[11px] text-slate-400">{mail.sender}</div>
                            <div className="text-sm font-bold text-white mt-0.5">{mail.title}</div>
                            <div className="text-xs text-[#a3e635] font-semibold mt-0.5">
                              {mail.rewardText}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={claimed}
                            onClick={() => handleClaimInbox([mail.id])}
                            className={`px-4 py-2 rounded text-xs font-extrabold whitespace-nowrap shrink-0 ${
                              claimed
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-[#a3e635] hover:bg-[#bef264] text-slate-950 cursor-pointer'
                            }`}
                          >
                            {claimed ? 'Đã nhận' : 'Nhận quà'}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end pt-2 border-t border-white/10">
                    <button
                      type="button"
                      data-testid="inbox-claim-all"
                      disabled={unreadInboxCount === 0}
                      onClick={() => handleClaimInbox(INITIAL_CLUB_INBOX.map((m) => m.id))}
                      className={`px-5 py-2.5 rounded text-xs font-extrabold ${
                        unreadInboxCount > 0
                          ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Nhận tất cả thư ({unreadInboxCount})
                    </button>
                  </div>
                </>
              )}

              {/* 3. STAR PASS MODAL (THẺ NGÔI SAO FC ONLINE) */}
              {(activeModal === 'star_pass' ||
                (activeModal === 'missions' && missionsSubTab === 'star_pass')) && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <div className="text-xs font-bold text-[#a3e635] tracking-wider">
                        THẺ NGÔI SAO MÙA GIẢI · STAR PASS FC ONLINE
                      </div>
                      <h3
                        className="text-2xl sm:text-3xl font-extrabold italic text-white"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        CẤP {currentStarPassTier}/{STAR_PASS_TIERS.length} · {lobbyState.starPassXp}{' '}
                        STAR PASS XP
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>

                  {activeModal === 'missions' && (
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-[#060a12] border border-white/10 w-fit">
                      <button
                        type="button"
                        onClick={() => setMissionsSubTab('daily')}
                        className="px-3 py-1.5 rounded text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
                      >
                        Nhiệm Vụ HLV
                      </button>
                      <button
                        type="button"
                        onClick={() => setMissionsSubTab('star_pass')}
                        className="px-3 py-1.5 rounded text-xs font-extrabold bg-[#a3e635] text-slate-950 cursor-pointer"
                      >
                        Star Pass
                      </button>
                    </div>
                  )}

                  {/* Premium Unlock Banner */}
                  <div className="rounded-lg bg-[#060a12] border border-amber-400/35 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-amber-300">
                        Nhánh Star Pass Vượt Trội (Premium) · Đặc Quyền Gói LE 135–140 &amp; IPRM
                      </div>
                      <div className="text-xs text-slate-400">
                        {lobbyState.starPassPremium
                          ? 'Đã kích hoạt Vượt Trội — nhận trọn bộ cả 2 nhánh quà!'
                          : `Mở khóa bằng ${STAR_PASS_PREMIUM_COST_FC} FC để nhận thêm Gói Legendary Eternal & Infinite Prime.`}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="starpass-unlock-premium"
                      disabled={lobbyState.starPassPremium}
                      onClick={handleUnlockStarPassPremium}
                      className={`px-4 py-2 rounded text-xs font-extrabold whitespace-nowrap shrink-0 ${
                        lobbyState.starPassPremium
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-400/40 cursor-default'
                          : 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer'
                      }`}
                    >
                      {lobbyState.starPassPremium
                        ? 'Đã Mở Vượt Trội'
                        : `Mở Vượt Trội (${STAR_PASS_PREMIUM_COST_FC} FC)`}
                    </button>
                  </div>

                  {/* Star Pass Tiers List */}
                  <div className="space-y-2">
                    {STAR_PASS_TIERS.map((t) => {
                      const unlocked = lobbyState.starPassXp >= t.requiredXp;
                      const freeClaimed = lobbyState.claimedStarPassKeys.includes(
                        `sp_${t.tier}_free`
                      );
                      const premClaimed = lobbyState.claimedStarPassKeys.includes(
                        `sp_${t.tier}_premium`
                      );
                      return (
                        <div
                          key={t.tier}
                          className="rounded-lg bg-[#060a12] border border-white/10 p-3 grid grid-cols-1 sm:grid-cols-12 items-center gap-2.5 text-xs"
                        >
                          <div className="sm:col-span-2 font-mono">
                            <div className="font-extrabold text-white">CẤP {t.tier}</div>
                            <div className="text-[11px] text-slate-400">{t.requiredXp} XP</div>
                          </div>

                          <div className="sm:col-span-5 flex items-center justify-between gap-2 rounded bg-[#0c1322] p-2 border border-white/6">
                            <div className="min-w-0">
                              <div className="text-[10px] text-slate-400">MIỄN PHÍ</div>
                              <div className="font-semibold text-slate-100 truncate">
                                {t.freeLabel}
                              </div>
                            </div>
                            <button
                              type="button"
                              data-testid={`starpass-claim-free-${t.tier}`}
                              disabled={!unlocked || freeClaimed}
                              onClick={() => handleClaimStarPass(t.tier, 'free')}
                              className={`px-2.5 py-1 rounded text-[11px] font-bold shrink-0 ${
                                freeClaimed
                                  ? 'bg-slate-800 text-slate-500'
                                  : unlocked
                                  ? 'bg-[#a3e635] text-slate-950 cursor-pointer'
                                  : 'bg-slate-900 text-slate-500'
                              }`}
                            >
                              {freeClaimed ? 'Đã nhận' : unlocked ? 'Nhận' : 'Khóa'}
                            </button>
                          </div>

                          <div className="sm:col-span-5 flex items-center justify-between gap-2 rounded bg-[#141109] p-2 border border-amber-400/25">
                            <div className="min-w-0">
                              <div className="text-[10px] text-amber-300">VƯỢT TRỘI</div>
                              <div className="font-semibold text-amber-100 truncate">
                                {t.premiumLabel}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={!unlocked || !lobbyState.starPassPremium || premClaimed}
                              onClick={() => handleClaimStarPass(t.tier, 'premium')}
                              className={`px-2.5 py-1 rounded text-[11px] font-bold shrink-0 ${
                                premClaimed
                                  ? 'bg-slate-800 text-slate-500'
                                  : unlocked && lobbyState.starPassPremium
                                  ? 'bg-amber-400 text-slate-950 cursor-pointer'
                                  : 'bg-slate-900 text-slate-500'
                              }`}
                            >
                              {premClaimed
                                ? 'Đã nhận'
                                : unlocked && lobbyState.starPassPremium
                                ? 'Nhận'
                                : 'Khóa'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* 4. MISSIONS CENTER MODAL (TRUNG TÂM NHIỆM VỤ) */}
              {activeModal === 'missions' && missionsSubTab === 'daily' && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <div className="text-xs font-bold text-[#a3e635] tracking-wider">
                        TRUNG TÂM NHIỆM VỤ HUẤN LUYỆN VIÊN
                      </div>
                      <h3
                        className="text-2xl sm:text-3xl font-extrabold italic text-white"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        NHIỆM VỤ NGÀY &amp; TÍCH ĐIỂM STAR PASS
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#060a12] border border-white/10 w-fit">
                    <button
                      type="button"
                      onClick={() => setMissionsSubTab('daily')}
                      className="px-3 py-1.5 rounded text-xs font-extrabold bg-[#a3e635] text-slate-950 cursor-pointer"
                    >
                      Nhiệm Vụ HLV
                    </button>
                    <button
                      type="button"
                      onClick={() => setMissionsSubTab('star_pass')}
                      className="px-3 py-1.5 rounded text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
                    >
                      Star Pass (Cấp {currentStarPassTier})
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {missions.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-lg bg-[#060a12] border border-white/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{m.title}</div>
                          <div className="text-xs text-slate-400 tabular-nums mt-0.5">
                            Tiến độ: <strong className="text-sky-300">{m.progressLabel}</strong> ·
                            Thưởng: <strong className="text-[#a3e635]">{m.rewardText}</strong> + 90
                            SP XP
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!m.completed || m.claimed}
                          onClick={() => handleClaimMission(m.id)}
                          className={`px-4 py-2 rounded text-xs font-extrabold whitespace-nowrap shrink-0 ${
                            m.claimed
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : m.completed
                              ? 'bg-[#a3e635] hover:bg-[#bef264] text-slate-950 cursor-pointer'
                              : 'bg-slate-900 border border-white/10 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {m.claimed
                            ? 'Đã nhận thưởng'
                            : m.completed
                            ? 'Nhận thưởng ngay'
                            : 'Chưa hoàn thành'}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* 5. WATCHLIST MODAL (THEO DÕI CẦU THỦ TTCN) */}
              {activeModal === 'watchlist' && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <div className="text-xs font-bold text-[#a3e635] tracking-wider">
                        DANH SÁCH THEO DÕI THỊ TRƯỜNG CHUYỂN NHƯỢNG
                      </div>
                      <h3
                        className="text-2xl sm:text-3xl font-extrabold italic text-white"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        THEO DÕI GIÁ CẦU THỦ (+1 / +5 / +8)
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>

                  {/* Quick Add Search */}
                  <div className="space-y-2">
                    <label htmlFor="watchlist-search-input" className="text-xs text-slate-400">
                      Tìm thêm siêu sao để ghim vào Sổ Theo Dõi TTCN:
                    </label>
                    <input
                      id="watchlist-search-input"
                      type="text"
                      value={watchlistSearch}
                      onChange={(e) => setWatchlistSearch(e.target.value)}
                      placeholder="Nhập tên cầu thủ, mùa giải (LE, IPRM, 26UCL, 26VB)..."
                      className="w-full px-3.5 py-2 rounded bg-[#060a12] border border-white/15 text-xs text-white focus:outline-none focus:border-[#a3e635]"
                    />
                    {watchlistSearch.trim().length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {watchlistCandidateResults.map((cand) => {
                          const pinned = lobbyState.watchlistTemplateIds.includes(cand.id);
                          return (
                            <button
                              key={cand.id}
                              type="button"
                              onClick={() => handleToggleWatchlist(cand.id)}
                              className="px-3 py-2 rounded bg-[#0c1322] hover:bg-[#131e36] border border-white/10 flex items-center justify-between text-xs cursor-pointer"
                            >
                              <span className="truncate font-semibold text-white">
                                {cand.name} ({cand.seasonLabel} · OVR {cand.baseOvr})
                              </span>
                              <span className="text-[#a3e635] font-bold ml-2 shrink-0">
                                {pinned ? 'Bỏ ghim' : '+ Theo dõi'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Pinned Watchlist Table */}
                  <div className="space-y-2">
                    {watchlistTemplates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="rounded-lg bg-[#060a12] border border-white/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <SeasonBadgeSvg season={tpl.season} className="w-8 h-5 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate">
                              {tpl.name} · {tpl.position} · OVR {tpl.baseOvr}
                            </div>
                            <div className="text-[11px] text-slate-400 tabular-nums truncate">
                              +1: {formatBpCompact(getMarketPriceBp(tpl.id, 1))} · +5:{' '}
                              {formatBpCompact(getMarketPriceBp(tpl.id, 5))} · +8:{' '}
                              <span className="text-amber-300">
                                {formatBpCompact(getMarketPriceBp(tpl.id, 8))}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              closeModal();
                              onGoToMarketPlayer(tpl.id);
                            }}
                            className="px-3 py-1.5 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold cursor-pointer whitespace-nowrap"
                          >
                            Mua trên TTCN →
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleWatchlist(tpl.id)}
                            className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            Bỏ
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* 6. HEAD COACH MODAL (HUẤN LUYỆN VIÊN TRƯỞNG FC ONLINE) */}
              {activeModal === 'head_coach' && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <div className="text-xs font-bold text-[#a3e635] tracking-wider">
                        BAN HUẤN LUYỆN CÂU LẠC BỘ · KỸ NĂNG HLV TRƯỞNG
                      </div>
                      <h3
                        className="text-2xl sm:text-3xl font-extrabold italic text-white"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        CHỌN HLV TRƯỞNG CỘNG CHỈ SỐ CHIẾN THUẬT
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {HEAD_COACH_CATALOG.map((c) => {
                      const active = c.id === activeCoach.id;
                      return (
                        <div
                          key={c.id}
                          className={`rounded-lg p-3.5 border flex flex-col justify-between gap-2.5 ${
                            active
                              ? 'bg-[#111e14] border-[#a3e635]'
                              : 'bg-[#060a12] border-white/10'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-extrabold text-white">{c.name}</span>
                              <span className="text-[11px] text-slate-400">{c.nationality}</span>
                            </div>
                            <div className="text-xs text-slate-300 mt-1">{c.philosophy}</div>
                            <div className="text-[11px] font-semibold text-[#a3e635] mt-1">
                              {c.buffSummary}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSelectCoach(c.id)}
                            className={`w-full py-1.5 rounded text-xs font-extrabold cursor-pointer ${
                              active
                                ? 'bg-slate-800 text-[#a3e635]'
                                : 'bg-[#a3e635] hover:bg-[#bef264] text-slate-950'
                            }`}
                          >
                            {active ? 'Đang Dẫn Dắt CLB' : 'Bổ Nhiệm HLV Trưởng'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* 7. CLUB HUB & MATCH HISTORY MODAL (CLB & BXH) */}
              {activeModal === 'club_hub' && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <div className="text-xs font-bold text-[#a3e635] tracking-wider">
                        PHÒNG TRUYỀN THỐNG CÂU LẠC BỘ &amp; LỊCH SỬ ĐẤU
                      </div>
                      <h3
                        className="text-2xl sm:text-3xl font-extrabold italic text-white"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        {profile.managerName.toUpperCase()} · {rankTier.name.toUpperCase()}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                    <div className="sm:col-span-5 flex justify-center">
                      {captainCard && (
                        <PlayerCardView
                          card={captainCard}
                          size="md"
                          showStats={false}
                          showValue
                          badgeNote="ĐỘI TRƯỞNG CLB"
                          bonusOvr={teamColorEval.cardBonusMap[captainCard.uid]?.bonusOvr ?? 0}
                        />
                      )}
                    </div>

                    <div className="sm:col-span-7 space-y-3">
                      <div className="grid grid-cols-2 gap-2 tabular-nums text-xs">
                        <div className="rounded bg-[#060a12] border border-white/10 p-3">
                          <div className="text-slate-400">CẤP HLV · OVR ĐỘI</div>
                          <div className="text-xl font-extrabold text-[#a3e635] font-mono mt-0.5">
                            Lv.{managerLv.level} · OVR {teamColorEval.boostedAvgOvr}
                          </div>
                        </div>
                        <div className="rounded bg-[#060a12] border border-white/10 p-3">
                          <div className="text-slate-400">THÀNH TÍCH MÙA GIẢI</div>
                          <div className="text-xl font-extrabold text-white font-mono mt-0.5">
                            {lobbyState.wins}T - {lobbyState.draws}H - {lobbyState.losses}B
                          </div>
                        </div>
                        <div className="rounded bg-[#060a12] border border-white/10 p-3 col-span-2">
                          <div className="text-slate-400">TỔNG GIÁ TRỊ ĐỘI HÌNH CLB</div>
                          <div className="text-lg font-extrabold text-emerald-300 font-mono mt-0.5">
                            {formatBpCompact(squadSummary.squadValue)}
                          </div>
                        </div>
                      </div>

                      {lobbyState.recentMatches.length > 0 && (
                        <div className="rounded bg-[#060a12] border border-white/10 p-3 space-y-1 text-xs">
                          <div className="font-bold text-slate-300">LỊCH SỬ TRẬN ĐẤU GẦN ĐÂY</div>
                          {lobbyState.recentMatches.slice(0, 3).map((rm) => (
                            <div
                              key={rm.id}
                              className="flex items-center justify-between text-[11px] tabular-nums"
                            >
                              <span className="truncate">
                                vs {rm.opponentName} ({rm.modeLabel})
                              </span>
                              <strong
                                className={
                                  rm.outcome === 'WIN'
                                    ? 'text-[#a3e635]'
                                    : rm.outcome === 'DRAW'
                                    ? 'text-amber-300'
                                    : 'text-rose-400'
                                }
                              >
                                {rm.userGoals}-{rm.opponentGoals} ({rm.eloDelta >= 0 ? '+' : ''}
                                {rm.eloDelta} ĐXH)
                              </strong>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            closeModal();
                            onNavigateTab('leaderboard');
                          }}
                          className="px-4 py-2 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer"
                        >
                          Mở Bảng Xếp Hạng Tài Khoản Thật →
                        </button>
                        <button
                          type="button"
                          onClick={() => openModal('head_coach')}
                          className="px-3.5 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs cursor-pointer"
                        >
                          HLV Trưởng ({activeCoach.name})
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 8. GARENA EVENTS HUB MODAL (ĐIỂM DANH, GIFTCODE & TRA CỨU MÙA THẺ) */}
              {activeModal === 'events_hub' && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <div className="text-xs font-bold text-[#a3e635] tracking-wider">
                        TRUNG TÂM SỰ KIỆN GARENA FC ONLINE
                      </div>
                      <h3
                        className="text-2xl sm:text-3xl font-extrabold italic text-white"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        ĐIỂM DANH 7 NGÀY · GIFTCODE · SỰ KIỆN ĐẶC BIỆT
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>

                  {/* Sub-navigation */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-[#060a12] border border-white/10">
                      <button
                        type="button"
                        onClick={() => setEventsSubTab('checkin')}
                        className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                          eventsSubTab === 'checkin'
                            ? 'bg-[#a3e635] text-slate-950 font-extrabold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Điểm Danh 7 Ngày
                      </button>
                      <button
                        type="button"
                        onClick={() => setEventsSubTab('giftcode')}
                        className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                          eventsSubTab === 'giftcode'
                            ? 'bg-[#a3e635] text-slate-950 font-extrabold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Nhập Giftcode
                      </button>
                      <button
                        type="button"
                        onClick={() => setEventsSubTab('seasons')}
                        className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                          eventsSubTab === 'seasons'
                            ? 'bg-[#a3e635] text-slate-950 font-extrabold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        11 Mùa Giải (#0001+)
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          closeModal();
                          onNavigateTab('foosball');
                        }}
                        className="px-3.5 py-1.5 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Sự Kiện Bi Lắc · Mốc 10.000Đ IPRM &amp; LE →
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          closeModal();
                          onNavigateTab('vip');
                        }}
                        className="px-3.5 py-1.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Đặc Quyền SVIP {vipStatus.level} →
                      </button>
                    </div>
                  </div>

                  {eventsSubTab === 'checkin' && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {DAILY_CHECKIN_REWARDS.map((item, idx) => {
                          const cycle =
                            lobbyState.claimedDaysCount % DAILY_CHECKIN_REWARDS.length;
                          const isDone = idx < cycle;
                          const isNext = idx === cycle && canCheckInToday;
                          return (
                            <div
                              key={item.day}
                              className={`rounded-lg p-3 border ${
                                item.day === 7 ? 'sm:col-span-2' : ''
                              } ${
                                isNext
                                  ? 'bg-[#122116] border-[#a3e635]'
                                  : isDone
                                  ? 'bg-slate-900/60 border-emerald-500/30 opacity-80'
                                  : 'bg-[#060a12] border-white/10'
                              }`}
                            >
                              <div className="flex justify-between text-xs font-bold">
                                <span className="text-amber-300">{item.title}</span>
                                <span className="text-[10px] text-slate-400">
                                  {isDone ? 'Đã nhận' : isNext ? 'Hôm nay' : 'Sắp tới'}
                                </span>
                              </div>
                              <div className="mt-1.5 text-xs font-semibold text-white">
                                {item.rewardText}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={!canCheckInToday}
                          onClick={handleDailyCheckIn}
                          className={`px-5 py-2.5 rounded text-xs font-extrabold ${
                            canCheckInToday
                              ? 'bg-[#a3e635] hover:bg-[#bef264] text-slate-950 cursor-pointer'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {canCheckInToday
                            ? 'Điểm danh nhận quà hôm nay'
                            : 'Đã hoàn tất điểm danh hôm nay'}
                        </button>
                      </div>
                    </>
                  )}

                  {eventsSubTab === 'giftcode' && (
                    <div className="space-y-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleRedeemCode();
                        }}
                        className="flex flex-col sm:flex-row gap-2"
                      >
                        <label htmlFor="newgen-gift-input" className="sr-only">
                          Nhập Giftcode FC Online
                        </label>
                        <input
                          id="newgen-gift-input"
                          type="text"
                          value={giftInput}
                          onChange={(e) => setGiftInput(e.target.value.toUpperCase())}
                          placeholder="Nhập mã Giftcode (VD: THELASTDANCE)..."
                          className="flex-1 px-3.5 py-2 rounded bg-[#060a12] border border-white/15 text-xs font-mono font-bold text-[#a3e635] focus:outline-none focus:border-[#a3e635]"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Xác nhận nhận mã
                        </button>
                      </form>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {LOBBY_GIFT_CODES.map((g) => {
                          const used = lobbyState.redeemedCodes.includes(g.code);
                          return (
                            <div
                              key={g.code}
                              className="rounded-lg bg-[#060a12] border border-white/10 p-3 flex flex-col justify-between gap-2"
                            >
                              <div>
                                <div className="flex justify-between text-xs">
                                  <strong className="font-mono text-amber-300">{g.code}</strong>
                                  <span className="text-slate-400">
                                    {used ? 'Đã nhận' : 'Đang mở'}
                                  </span>
                                </div>
                                <div className="text-xs font-bold text-white mt-0.5">{g.title}</div>
                                <div className="text-[11px] text-emerald-300 mt-0.5">
                                  {g.rewardText}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={used}
                                onClick={() => handleRedeemCode(g.code)}
                                className={`w-full py-1.5 rounded text-xs font-extrabold ${
                                  used
                                    ? 'bg-slate-800 text-slate-500'
                                    : 'bg-[#a3e635] hover:bg-[#bef264] text-slate-950 cursor-pointer'
                                }`}
                              >
                                {used ? 'Đã kích hoạt' : `Nhận ${g.code}`}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {eventsSubTab === 'seasons' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ALL_SEASONS.map((season) => {
                        const count = PLAYER_TEMPLATES.filter((t) => t.season === season).length;
                        const serialized = isSerializedSeason(season);
                        return (
                          <div
                            key={season}
                            className="rounded bg-[#060a12] border border-white/10 p-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <SeasonBadgeSvg season={season} className="w-8 h-5 shrink-0" />
                              <div className="truncate">
                                <strong className="text-white">
                                  {season} ({count})
                                </strong>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {serialized ? 'Có Số Thứ Tự #0001+ · 2 Miniface' : 'Bản quyền FC Online'}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                closeModal();
                                onGoToMarketPlayer(undefined);
                              }}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[#a3e635] font-bold shrink-0 cursor-pointer"
                            >
                              TTCN
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* 9. SETTINGS & ACCOUNT MODAL */}
              {activeModal === 'settings' && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <div className="text-xs font-bold text-[#a3e635] tracking-wider">
                        CÀI ĐẶT CLIENT &amp; ĐỒNG BỘ TÀI KHOẢN HLV
                      </div>
                      <h3
                        className="text-2xl sm:text-3xl font-extrabold italic text-white"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        HỆ THỐNG FC ONLINE PC
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    {onToggleLandscapeMode && (
                      <div className="rounded-lg bg-[#081512] border border-[#a3e635]/35 p-3.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-white">Chế Độ Màn Hình Ngang 90° (Điện Thoại)</div>
                          <div className="text-slate-400">
                            Tự động xoay toàn màn hình ngang chuẩn FC Online PC dù cầm điện thoại dọc hay ngang
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={onToggleLandscapeMode}
                          className={`px-4 py-2 rounded font-extrabold cursor-pointer whitespace-nowrap shrink-0 ${
                            forceLandscape
                              ? 'bg-[#a3e635] text-slate-950'
                              : 'bg-slate-800 text-slate-200 border border-white/15'
                          }`}
                        >
                          {forceLandscape ? 'Đang Bật Màn Ngang' : 'Bật Xoay Ngang 90°'}
                        </button>
                      </div>
                    )}

                    <div className="rounded-lg bg-[#060a12] border border-white/10 p-3.5 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-white">Âm thanh Sân vận động [M]</div>
                        <div className="text-slate-400">Hiệu ứng khán đài, mở thẻ và nâng cấp</div>
                      </div>
                      <button
                        type="button"
                        onClick={onToggleMute}
                        className={`px-4 py-2 rounded font-extrabold cursor-pointer ${
                          muted ? 'bg-slate-800 text-slate-300' : 'bg-[#a3e635] text-slate-950'
                        }`}
                      >
                        {muted ? 'Đang Tắt Âm' : 'Đang Bật Âm'}
                      </button>
                    </div>

                    <div className="rounded-lg bg-[#08151f] border border-blue-500/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span className="text-blue-400 font-extrabold">CÀI ĐẶT APK &amp; WEBAPK ANDROID</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">Mới</span>
                        </div>
                        <div className="text-slate-400">
                          Cài biểu tượng game lên màn hình chính điện thoại, mở toàn màn hình chuẩn PC &amp; tạo file .apk
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openModal('apk_install')}
                        className="px-3.5 py-2 rounded bg-gradient-to-r from-[#a3e635] to-[#16a34a] hover:from-[#bef264] hover:to-[#22c55e] text-slate-950 font-black cursor-pointer whitespace-nowrap shadow-md text-xs"
                      >
                        Mở Trình Cài Đặt APK
                      </button>
                    </div>

                    <div className="rounded-lg bg-[#060a12] border border-white/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-white">
                          HLV: {profile.managerName}
                        </div>
                        <div className="text-slate-400">
                          {profile.authMode === 'firebase'
                            ? 'Đã đồng bộ & lưu Tài Khoản Thật Cloud trực tuyến'
                            : profile.authMode === 'local'
                            ? `Tài khoản HLV thật đã lưu (${profile.usernameOrEmail ?? 'Máy chủ VN'})`
                            : 'Phiên Khách (hãy lưu thành Tài Khoản Thật để giữ đội bóng vĩnh viễn)'}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          data-testid="lobby-settings-save-btn"
                          onClick={() => {
                            gameSound.playUpgradeOutcome(true);
                            const { savedAt } = forceSaveManagerAccount(profile);
                            const timeLabel = new Date(savedAt).toLocaleTimeString('vi-VN');
                            setModalFeedback({
                              ok: true,
                              text: `Đã lưu toàn bộ đội bóng & tài khoản HLV "${profile.managerName}" lúc ${timeLabel}!`,
                            });
                          }}
                          className="px-3.5 py-2 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold cursor-pointer whitespace-nowrap"
                        >
                          Lưu Tài Khoản Ngay
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closeModal();
                            onOpenAuthModal();
                          }}
                          className="px-4 py-2 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold cursor-pointer whitespace-nowrap"
                        >
                          {profile.authMode === 'guest'
                            ? 'Lưu Thành TK Thật / Đăng Nhập'
                            : 'Quản Lý & Đổi TK Đã Lưu'}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg bg-[#140c0c] border border-rose-500/25 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-rose-300">
                          Khởi Tạo Lại CLB Sơ Cấp (Bản Chính Thức)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Đưa đội hình, tiền tệ và cấp độ về lại trạng thái ban đầu của Bản Chính Thức (cầu thủ Admin không tính số thứ tự)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const conf = window.confirm('Bạn có chắc chắn muốn đặt lại CLB này về trạng thái sơ cấp ban đầu của Bản Chính Thức không?');
                          if (!conf) return;
                          gameSound.playClick();
                          const fresh = createStarterProfile(profile.id, profile.managerName, profile.authMode, profile.usernameOrEmail);
                          onUpdateProfile(() => fresh);
                          forceSaveManagerAccount(fresh);
                          setModalFeedback({
                            ok: true,
                            text: 'Đã thiết lập lại CLB về trạng thái sơ cấp ban đầu của Bản Chính Thức!',
                          });
                        }}
                        className="px-3.5 py-2 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-xs font-extrabold cursor-pointer whitespace-nowrap"
                      >
                        Khởi Tạo Lại Về Ban Đầu
                      </button>
                    </div>

                    {(isAdmin || gmSessionUnlocked) && (
                      <div className="rounded-lg bg-[#0c1911] border border-[#a3e635]/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[#a3e635]">
                            Kiểm Soát Trò Chơi · Tài Khoản Quản Trị Viên
                          </div>
                          <div className="text-slate-300">
                            Điều chỉnh luật sự kiện toàn máy chủ, phát quà đồng loạt &amp; kiểm soát tài khoản liên thiết bị
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            closeModal();
                            if (isAdmin) {
                              onNavigateTab('admin');
                            } else if (onReturnToMasterAdmin) {
                              onReturnToMasterAdmin();
                            }
                          }}
                          className="px-4 py-2 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {isAdmin ? 'Mở Kiểm Soát Trò Chơi' : 'Về TK Quản Trị Viên'}
                        </button>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          closeModal();
                          onPauseGame();
                        }}
                        className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
                      >
                        Tạm dừng [P]
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          closeModal();
                          onReturnToTitle();
                        }}
                        className="px-4 py-2 rounded bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-200 font-semibold cursor-pointer"
                      >
                        Màn hình Chọn HLV
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

      {glxhLiveSessionKey !== null && (
        <GlxhPitchModal
          key={`glxh_${glxhLiveSessionKey}`}
          profile={profile}
          coachId={activeCoach.id}
          currentElo={lobbyState.elo}
          serverRules={serverRules}
          onCompleteMatch={(result, playAgain) => {
            if (playAgain) {
              commitSimulatedMatchResult(result, false);
              setGlxhLiveSessionKey((k) => (k ?? 0) + 1);
            } else {
              setGlxhLiveSessionKey(null);
              commitSimulatedMatchResult(result, true);
            }
          }}
          onCancel={() => {
            gameSound.playClick(0.92);
            setGlxhLiveSessionKey(null);
          }}
        />
      )}

      <ApkInstallModal isOpen={activeModal === 'apk_install'} onClose={closeModal} />
    </div>
  );
};
