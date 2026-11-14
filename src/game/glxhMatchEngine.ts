import { PLAYER_TEMPLATE_MAP } from './catalog';
import {
  FcMatchMode,
  HEAD_COACH_CATALOG,
  MatchHighlightEvent,
  SimulatedMatchResult,
  applyLobbyRewardBundle,
} from './rules';
import {
  AssignedFormationSlot,
  FORMATION_CATALOG,
  FormationSlotSpec,
  LineGroup,
  buildFormationLineup,
  evaluateSquadTeamColors,
} from './tacticsAndTeamColor';
import {
  GlxhLiveEmote,
  GlxhLiveMatchWireState,
  GlxhOnlineMatchKind,
  GlxhOnlinePlayerSnapshot,
  GlxhOnlineTeamSnapshot,
  GlxhTacticalPosture,
} from './glxhOnlineTypes';
import {
  FormationCode,
  GlobalServerRules,
  ManagerProfile,
  OwnedCard,
  PlayerStats,
} from './types';

export const GLXH_PITCH_WIDTH = 100;
export const GLXH_PITCH_HEIGHT = 64;
export const GLXH_GOAL_Y_MIN = 26.2;
export const GLXH_GOAL_Y_MAX = 37.8;
export const GLXH_TOTAL_MATCH_MINUTES = 90;
export const GLXH_SIM_SECONDS_PER_MATCH = 135; // 1.5 sim-seconds per match minute

export type GlxhSide = 'home' | 'away';

export interface GlxhCirclePlayer {
  id: string;
  side: GlxhSide;
  slotIndex: number;
  roleLabel: string;
  lineGroup: LineGroup;
  jerseyNumber: number;
  shortName: string;
  seasonLabel: string;
  isNaturalFit: boolean;
  ovr: number;
  stats: PlayerStats;
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeAnchorX: number;
  homeAnchorY: number;
  stamina: number; // 45..100
  touchCount: number;
  passesCompleted: number;
  shotsTaken: number;
  goalsScored: number;
  tacklesWon: number;
  savesMade: number;
  decisionCooldown: number;
  tackleGraceCooldown: number;
}

export interface GlxhBallFlight {
  kind: 'pass' | 'through' | 'shot';
  fromSide: GlxhSide;
  passerId: string;
  targetPlayerId?: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  elapsed: number;
  duration: number;
  passSkill: number;
  shotSkill: number;
}

export interface GlxhTrailSegment {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  side: GlxhSide;
  kind: 'pass' | 'through' | 'shot';
  ttl: number; // fades 1 -> 0
}

export interface GlxhMatchState {
  id: string;
  homeName: string;
  awayName: string;
  homeOvr: number;
  awayOvr: number;
  homeElo: number;
  awayElo: number;
  homeFormation: FormationCode;
  awayFormation: FormationCode;
  homeCoachName: string;
  awayCoachName: string;
  homeTactic: GlxhTacticalPosture;
  awayTactic: GlxhTacticalPosture;
  forfeitBySide?: GlxhSide;
  currentElo: number;
  simElapsedSec: number;
  minute: number;
  finished: boolean;
  homeGoals: number;
  awayGoals: number;
  homePossessionTicks: number;
  awayPossessionTicks: number;
  homeShots: number;
  homeShotsOnTarget: number;
  awayShots: number;
  awayShotsOnTarget: number;
  homePassesCompleted: number;
  awayPassesCompleted: number;
  homeTacklesWon: number;
  awayTacklesWon: number;
  players: GlxhCirclePlayer[];
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    carrierId: string | null;
    lastTouchSide: GlxhSide;
    lastTouchPlayerId: string | null;
    flight: GlxhBallFlight | null;
    pickupLockSec: number;
  };
  trails: GlxhTrailSegment[];
  highlights: MatchHighlightEvent[];
  goalBannerSec: number;
  goalBannerText: string | null;
  lastActionText: string;
  homeShotCooldownSec: number;
  awayShotCooldownSec: number;
  rngState: number;
}

const OPPONENT_CLUB_POOL = [
  'CLB Hà Nội Galácticos',
  'Sài Gòn Pressing FC',
  'Đà Nẵng Challengers',
  'Hải Phòng RedStorm',
  'Thủ Đô United VN',
  'Rồng Vàng Legends',
  'Bình Dương Titans',
  'Nam Định Royal FC',
];

const AWAY_STAR_ROSTER: Array<{
  roleLabel: string;
  lineGroup: LineGroup;
  jerseyNumber: number;
  shortName: string;
  seasonLabel: string;
}> = [
  { roleLabel: 'LW', lineGroup: 'ATT', jerseyNumber: 7, shortName: 'Vini Jr.', seasonLabel: '26UCL' },
  { roleLabel: 'ST', lineGroup: 'ATT', jerseyNumber: 9, shortName: 'K. Mbappé', seasonLabel: '26TOTY' },
  { roleLabel: 'RW', lineGroup: 'ATT', jerseyNumber: 11, shortName: 'M. Salah', seasonLabel: '26TOTS' },
  { roleLabel: 'LCM', lineGroup: 'MID', jerseyNumber: 10, shortName: 'R. Gullit', seasonLabel: 'LE' },
  { roleLabel: 'CM', lineGroup: 'MID', jerseyNumber: 8, shortName: 'J. Bellingham', seasonLabel: '26UCL' },
  { roleLabel: 'RCM', lineGroup: 'MID', jerseyNumber: 16, shortName: 'Rodri', seasonLabel: 'BDO' },
  { roleLabel: 'LB', lineGroup: 'DEF', jerseyNumber: 19, shortName: 'T. Hernández', seasonLabel: 'CU' },
  { roleLabel: 'LCB', lineGroup: 'DEF', jerseyNumber: 4, shortName: 'V. van Dijk', seasonLabel: '26TOTY' },
  { roleLabel: 'RCB', lineGroup: 'DEF', jerseyNumber: 3, shortName: 'P. Maldini', seasonLabel: 'ICON TM' },
  { roleLabel: 'RB', lineGroup: 'DEF', jerseyNumber: 2, shortName: 'A. Hakimi', seasonLabel: '25UCL' },
  { roleLabel: 'GK', lineGroup: 'GK', jerseyNumber: 1, shortName: 'T. Courtois', seasonLabel: '26TOTY' },
];

function nextRng(state: GlxhMatchState): number {
  let x = state.rngState | 0;
  if (x === 0) x = 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rngState = x;
  return (x >>> 0) / 4294967296;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / lenSq, 0, 1);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/**
 * Computes normalized (home attacks Left -> Right) base anchor (x: 0..100, y: 0..64)
 * for any tactical slot in the 22 FC Online formations.
 */
export function computeTacticalAnchorForSlot(
  slot: FormationSlotSpec,
  side: GlxhSide
): { x: number; y: number } {
  const role = slot.roleLabel.toUpperCase();
  let x = 44;
  let y = 32;

  if (slot.lineGroup === 'GK' || role === 'GK') {
    x = 5.5;
    y = 32;
  } else if (slot.lineGroup === 'DEF') {
    x = role.includes('WB') ? 26 : 20.5;
    if (role === 'LB' || role === 'LWB') y = 11;
    else if (role === 'RB' || role === 'RWB') y = 53;
    else if (role === 'LCB') y = 24;
    else if (role === 'RCB') y = 40;
    else y = 32;
  } else if (slot.lineGroup === 'MID') {
    if (role.includes('DM')) x = 35;
    else if (role.includes('AM')) x = 57;
    else x = 46;

    if (role === 'LM' || role === 'LAM') y = 13;
    else if (role === 'RM' || role === 'RAM') y = 51;
    else if (role === 'LCM' || role === 'LDM') y = 23.5;
    else if (role === 'RCM' || role === 'RDM') y = 40.5;
    else y = 32;
  } else {
    // ATT
    if (role === 'LW' || role === 'LF' || role === 'LAM') {
      x = 69;
      y = 14;
    } else if (role === 'RW' || role === 'RF' || role === 'RAM') {
      x = 69;
      y = 50;
    } else if (role === 'LS') {
      x = 74;
      y = 24.5;
    } else if (role === 'RS') {
      x = 74;
      y = 39.5;
    } else if (role === 'CF') {
      x = 66;
      y = 32;
    } else {
      x = 76;
      y = 32;
    }
  }

  if (side === 'away') {
    return {
      x: GLXH_PITCH_WIDTH - x,
      y: GLXH_PITCH_HEIGHT - y,
    };
  }
  return { x, y };
}

function buildEffectiveCardStats(
  assigned: AssignedFormationSlot,
  teamColorBonus: number,
  coachBonus: number
): { ovr: number; stats: PlayerStats } {
  const tpl = PLAYER_TEMPLATE_MAP[assigned.card.templateId];
  const baseStats: PlayerStats = tpl
    ? tpl.stats
    : { pac: 112, sho: 112, pas: 112, dri: 112, def: 108, phy: 110 };
  const baseOvr = tpl ? tpl.baseOvr : assigned.card.ovr;
  const gradeDelta = assigned.card.ovr - baseOvr;
  const fitPenalty = assigned.isNaturalFit ? 0 : -4;
  const totalDelta = gradeDelta + teamColorBonus + coachBonus + fitPenalty;
  const clampStat = (v: number) => clamp(Math.round(v + totalDelta), 65, 195);

  return {
    ovr: clamp(assigned.card.ovr + teamColorBonus + coachBonus + fitPenalty, 70, 195),
    stats: {
      pac: clampStat(baseStats.pac),
      sho: clampStat(baseStats.sho),
      pas: clampStat(baseStats.pas),
      dri: clampStat(baseStats.dri),
      def: clampStat(baseStats.def),
      phy: clampStat(baseStats.phy),
    },
  };
}

function buildFallbackSyntheticPlayer(
  side: GlxhSide,
  slotIndex: number,
  roleLabel: string,
  lineGroup: LineGroup,
  targetOvr: number
): GlxhCirclePlayer {
  const meta = AWAY_STAR_ROSTER[slotIndex] ?? AWAY_STAR_ROSTER[0];
  const spec: FormationSlotSpec = {
    slotIndex,
    roleLabel,
    naturalPos: lineGroup === 'GK' ? 'GK' : lineGroup === 'DEF' ? 'CB' : lineGroup === 'MID' ? 'CM' : 'ST',
    lineGroup,
    rowIndex: lineGroup === 'GK' ? 3 : lineGroup === 'DEF' ? 2 : lineGroup === 'MID' ? 1 : 0,
  };
  const anchor = computeTacticalAnchorForSlot(spec, side);
  const jitter = ((slotIndex * 7) % 5) - 2;
  const ovr = clamp(Math.round(targetOvr + jitter), 95, 185);
  const stats: PlayerStats =
    lineGroup === 'GK'
      ? { pac: ovr - 22, sho: ovr - 35, pas: ovr - 8, dri: ovr - 18, def: ovr + 3, phy: ovr }
      : lineGroup === 'DEF'
      ? { pac: ovr - 3, sho: ovr - 18, pas: ovr - 5, dri: ovr - 8, def: ovr + 4, phy: ovr + 3 }
      : lineGroup === 'MID'
      ? { pac: ovr - 1, sho: ovr - 4, pas: ovr + 4, dri: ovr + 2, def: ovr - 4, phy: ovr - 1 }
      : { pac: ovr + 4, sho: ovr + 5, pas: ovr - 3, dri: ovr + 3, def: ovr - 28, phy: ovr - 2 };

  return {
    id: `${side}_${slotIndex}`,
    side,
    slotIndex,
    roleLabel,
    lineGroup,
    jerseyNumber: meta.jerseyNumber,
    shortName: meta.shortName,
    seasonLabel: meta.seasonLabel,
    isNaturalFit: true,
    ovr,
    stats,
    x: anchor.x,
    y: anchor.y,
    vx: 0,
    vy: 0,
    homeAnchorX: anchor.x,
    homeAnchorY: anchor.y,
    stamina: 100,
    touchCount: 0,
    passesCompleted: 0,
    shotsTaken: 0,
    goalsScored: 0,
    tacklesWon: 0,
    savesMade: 0,
    decisionCooldown: 0,
    tackleGraceCooldown: 0,
  };
}

function buildGlxhPlayersFromSnapshot(
  side: GlxhSide,
  snapshot: GlxhOnlineTeamSnapshot
): GlxhCirclePlayer[] {
  const formSpec = FORMATION_CATALOG[snapshot.formation] ?? FORMATION_CATALOG['4-3-3'];
  const players: GlxhCirclePlayer[] = [];

  for (let i = 0; i < formSpec.slots.length; i++) {
    const slotSpec = formSpec.slots[i];
    const snapPlayer = snapshot.players[i];
    const anchor = computeTacticalAnchorForSlot(slotSpec, side);
    if (snapPlayer) {
      players.push({
        id: `${side}_${i}`,
        side,
        slotIndex: i,
        roleLabel: snapPlayer.roleLabel || slotSpec.roleLabel,
        lineGroup: snapPlayer.lineGroup || slotSpec.lineGroup,
        jerseyNumber: clamp(Math.round(snapPlayer.jerseyNumber || i + 1), 1, 99),
        shortName: String(snapPlayer.shortName || `Cầu thủ ${i + 1}`).slice(0, 24),
        seasonLabel: String(snapPlayer.seasonLabel || '26UCL').slice(0, 12),
        isNaturalFit: Boolean(snapPlayer.isNaturalFit),
        ovr: clamp(Math.round(snapPlayer.ovr || snapshot.teamOvr), 70, 195),
        stats: {
          pac: clamp(Math.round(snapPlayer.stats?.pac ?? 112), 60, 195),
          sho: clamp(Math.round(snapPlayer.stats?.sho ?? 110), 60, 195),
          pas: clamp(Math.round(snapPlayer.stats?.pas ?? 112), 60, 195),
          dri: clamp(Math.round(snapPlayer.stats?.dri ?? 112), 60, 195),
          def: clamp(Math.round(snapPlayer.stats?.def ?? 106), 60, 195),
          phy: clamp(Math.round(snapPlayer.stats?.phy ?? 110), 60, 195),
        },
        x: anchor.x,
        y: anchor.y,
        vx: 0,
        vy: 0,
        homeAnchorX: anchor.x,
        homeAnchorY: anchor.y,
        stamina: 100,
        touchCount: 0,
        passesCompleted: 0,
        shotsTaken: 0,
        goalsScored: 0,
        tacklesWon: 0,
        savesMade: 0,
        decisionCooldown: 0,
        tackleGraceCooldown: 0,
      });
    } else {
      players.push(
        buildFallbackSyntheticPlayer(
          side,
          i,
          slotSpec.roleLabel,
          slotSpec.lineGroup,
          snapshot.teamOvr
        )
      );
    }
  }
  return players;
}

export function extractGlxhTeamSnapshot(
  profile: ManagerProfile,
  coachId: string = 'hc_ancelotti',
  clientId: string = profile.id
): GlxhOnlineTeamSnapshot {
  const coach = HEAD_COACH_CATALOG.find((c) => c.id === coachId) ?? HEAD_COACH_CATALOG[0];
  const formation: FormationCode =
    profile.formation && FORMATION_CATALOG[profile.formation]
      ? profile.formation
      : '4-3-3';
  const lineup = buildFormationLineup(
    Array.isArray(profile.cards) ? profile.cards : [],
    formation,
    profile.lineupSlotUids
  );
  const starterCards = lineup.slots.map((s) => s.card);
  const teamColorEval = evaluateSquadTeamColors(
    starterCards,
    profile.activeTeamColorId ?? 'auto'
  );
  const teamOvr = Math.max(95, teamColorEval.boostedAvgOvr + coach.tacticalBonusOvr);

  const players: GlxhOnlinePlayerSnapshot[] = lineup.formation.slots.map((slotSpec, i) => {
    const assigned = lineup.slots[i];
    if (assigned) {
      const tpl = PLAYER_TEMPLATE_MAP[assigned.card.templateId];
      const tcBonus = teamColorEval.cardBonusMap[assigned.card.uid]?.bonusOvr ?? 0;
      const effective = buildEffectiveCardStats(assigned, tcBonus, coach.tacticalBonusOvr);
      return {
        slotIndex: i,
        roleLabel: slotSpec.roleLabel,
        lineGroup: slotSpec.lineGroup,
        jerseyNumber: tpl ? tpl.jerseyNumber : i + 1,
        shortName: tpl ? tpl.shortName : `Cầu thủ ${i + 1}`,
        seasonLabel: tpl ? tpl.seasonLabel : '26UCL',
        isNaturalFit: assigned.isNaturalFit,
        ovr: effective.ovr,
        stats: effective.stats,
      };
    }
    const fb = buildFallbackSyntheticPlayer('home', i, slotSpec.roleLabel, slotSpec.lineGroup, teamOvr);
    return {
      slotIndex: i,
      roleLabel: fb.roleLabel,
      lineGroup: fb.lineGroup,
      jerseyNumber: fb.jerseyNumber,
      shortName: fb.shortName,
      seasonLabel: fb.seasonLabel,
      isNaturalFit: true,
      ovr: fb.ovr,
      stats: fb.stats,
    };
  });

  return {
    clientId,
    managerId: profile.id,
    managerName: (profile.managerName || 'HLV FC Online').trim().slice(0, 32) || 'HLV FC Online',
    elo: clamp(Math.round(profile.elo ?? 2050), 1000, 10_000),
    formation: lineup.formation.code,
    teamOvr,
    coachId: coach.id,
    coachName: coach.name,
    coachBonusOvr: coach.tacticalBonusOvr,
    deviceLabel: profile.deviceLabel,
    players,
  };
}

export function sanitizeGlxhOnlineTeamSnapshot(
  raw: unknown,
  fallbackClientId: string = 'anon_client'
): GlxhOnlineTeamSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawFormation = typeof obj.formation === 'string' ? (obj.formation as FormationCode) : '4-3-3';
  const formation: FormationCode = FORMATION_CATALOG[rawFormation] ? rawFormation : '4-3-3';
  const formSpec = FORMATION_CATALOG[formation];
  const rawPlayers = Array.isArray(obj.players) ? obj.players : [];
  const teamOvr = clamp(Math.round(Number(obj.teamOvr) || 128), 80, 195);

  const players: GlxhOnlinePlayerSnapshot[] = formSpec.slots.map((slotSpec, idx) => {
    const item =
      rawPlayers[idx] && typeof rawPlayers[idx] === 'object'
        ? (rawPlayers[idx] as Record<string, unknown>)
        : {};
    const statsObj =
      item.stats && typeof item.stats === 'object'
        ? (item.stats as Record<string, unknown>)
        : {};
    const ovr = clamp(Math.round(Number(item.ovr) || teamOvr), 70, 195);
    return {
      slotIndex: idx,
      roleLabel: slotSpec.roleLabel,
      lineGroup: slotSpec.lineGroup,
      jerseyNumber: clamp(Math.round(Number(item.jerseyNumber) || idx + 1), 1, 99),
      shortName:
        typeof item.shortName === 'string' && item.shortName.trim()
          ? item.shortName.trim().slice(0, 24)
          : `Cầu thủ ${idx + 1}`,
      seasonLabel:
        typeof item.seasonLabel === 'string' && item.seasonLabel.trim()
          ? item.seasonLabel.trim().slice(0, 12)
          : '26UCL',
      isNaturalFit: item.isNaturalFit !== false,
      ovr,
      stats: {
        pac: clamp(Math.round(Number(statsObj.pac) || ovr), 60, 195),
        sho: clamp(Math.round(Number(statsObj.sho) || ovr), 60, 195),
        pas: clamp(Math.round(Number(statsObj.pas) || ovr), 60, 195),
        dri: clamp(Math.round(Number(statsObj.dri) || ovr), 60, 195),
        def: clamp(Math.round(Number(statsObj.def) || ovr), 60, 195),
        phy: clamp(Math.round(Number(statsObj.phy) || ovr), 60, 195),
      },
    };
  });

  const avgPlayerOvr = Math.round(
    players.reduce((s, p) => s + p.ovr, 0) / Math.max(1, players.length)
  );

  return {
    clientId:
      typeof obj.clientId === 'string' && obj.clientId.trim()
        ? obj.clientId.trim().slice(0, 120)
        : fallbackClientId,
    managerId:
      typeof obj.managerId === 'string' && obj.managerId.trim()
        ? obj.managerId.trim().slice(0, 128)
        : fallbackClientId,
    managerName:
      typeof obj.managerName === 'string' && obj.managerName.trim()
        ? obj.managerName.trim().slice(0, 32)
        : 'HLV FC Online',
    elo: clamp(Math.round(Number(obj.elo) || 2050), 1000, 10_000),
    formation,
    teamOvr: clamp(avgPlayerOvr, 80, 195),
    coachId: typeof obj.coachId === 'string' ? obj.coachId.slice(0, 40) : 'hc_ancelotti',
    coachName:
      typeof obj.coachName === 'string' && obj.coachName.trim()
        ? obj.coachName.trim().slice(0, 40)
        : 'Carlo Ancelotti',
    coachBonusOvr: clamp(Math.round(Number(obj.coachBonusOvr) || 2), 0, 10),
    deviceLabel: typeof obj.deviceLabel === 'string' ? obj.deviceLabel.slice(0, 40) : undefined,
    players,
  };
}

export function extractGlxhTeamSnapshotFromRawProfile(
  rawProfile: Record<string, unknown>,
  fallbackOwnerId: string
): GlxhOnlineTeamSnapshot {
  const cards = Array.isArray(rawProfile.cards)
    ? (rawProfile.cards as OwnedCard[])
    : [];
  const rawFormation =
    typeof rawProfile.formation === 'string' && FORMATION_CATALOG[rawProfile.formation as FormationCode]
      ? (rawProfile.formation as FormationCode)
      : '4-3-3';
  const profileLike: ManagerProfile = {
    id: typeof rawProfile.id === 'string' ? rawProfile.id : fallbackOwnerId,
    managerName:
      typeof rawProfile.managerName === 'string' && rawProfile.managerName.trim()
        ? rawProfile.managerName.trim()
        : 'HLV CLB',
    fc: 0,
    bp: 0,
    vipPoints: 0,
    vipLevel: 1,
    foosballLoops: 0,
    foosballSpins: 0,
    foosballJackpotFc: 100,
    packs: {
      iprm_pack: 0,
      le_pack: 0,
      ucl_26: 0,
      vb_26: 0,
      icon_tm: 0,
      toty_26: 0,
      tots_26: 0,
      bdo_pack: 0,
      up_pack: 0,
      ucl_25: 0,
      cu_fodder: 0,
    },
    claimedMilestones: [],
    claimedVipRewards: [],
    cards,
    formation: rawFormation,
    activeTeamColorId:
      typeof rawProfile.activeTeamColorId === 'string' ? rawProfile.activeTeamColorId : 'auto',
    lineupSlotUids: Array.isArray(rawProfile.lineupSlotUids)
      ? (rawProfile.lineupSlotUids.filter((u) => typeof u === 'string') as string[])
      : undefined,
    elo: typeof rawProfile.elo === 'number' ? rawProfile.elo : 2050,
    deviceLabel:
      typeof rawProfile.deviceLabel === 'string' ? rawProfile.deviceLabel : undefined,
    authMode: 'local',
  };
  return extractGlxhTeamSnapshot(profileLike, 'hc_ancelotti', fallbackOwnerId);
}

export function createGlxhMatchState(params: {
  profile: ManagerProfile;
  coachId?: string;
  currentElo: number;
  seed?: number;
  opponentOvrOverride?: number;
  opponentNameOverride?: string;
  matchId?: string;
  homeTeamSnapshot?: GlxhOnlineTeamSnapshot;
  awayTeamSnapshot?: GlxhOnlineTeamSnapshot;
}): GlxhMatchState {
  const {
    profile,
    coachId,
    currentElo,
    seed,
    opponentOvrOverride,
    opponentNameOverride,
    matchId,
    homeTeamSnapshot,
    awayTeamSnapshot,
  } = params;

  const homeSnap = homeTeamSnapshot ?? extractGlxhTeamSnapshot(profile, coachId ?? 'hc_ancelotti');

  const rawSeed =
    typeof seed === 'number' && Number.isFinite(seed)
      ? Math.floor(seed) || 1337
      : Math.floor(Date.now() ^ (currentElo * 997) ^ (profile.cards.length * 131));

  const state: GlxhMatchState = {
    id: matchId || `glxh_${Date.now()}_${Math.abs(rawSeed) % 100000}`,
    homeName: homeSnap.managerName,
    awayName: awayTeamSnapshot ? awayTeamSnapshot.managerName : '',
    homeOvr: homeSnap.teamOvr,
    awayOvr: awayTeamSnapshot ? awayTeamSnapshot.teamOvr : 130,
    homeElo: homeSnap.elo,
    awayElo: awayTeamSnapshot ? awayTeamSnapshot.elo : currentElo,
    homeFormation: homeSnap.formation,
    awayFormation: awayTeamSnapshot ? awayTeamSnapshot.formation : '4-3-3',
    homeCoachName: homeSnap.coachName,
    awayCoachName: awayTeamSnapshot ? awayTeamSnapshot.coachName : 'HLV AI Pro',
    homeTactic: 'balanced',
    awayTactic: 'balanced',
    currentElo,
    simElapsedSec: 0,
    minute: 0,
    finished: false,
    homeGoals: 0,
    awayGoals: 0,
    homePossessionTicks: 1,
    awayPossessionTicks: 1,
    homeShots: 0,
    homeShotsOnTarget: 0,
    awayShots: 0,
    awayShotsOnTarget: 0,
    homePassesCompleted: 0,
    awayPassesCompleted: 0,
    homeTacklesWon: 0,
    awayTacklesWon: 0,
    players: [],
    ball: {
      x: 50,
      y: 32,
      vx: 0,
      vy: 0,
      carrierId: null,
      lastTouchSide: 'home',
      lastTouchPlayerId: null,
      flight: null,
      pickupLockSec: 0,
    },
    trails: [],
    highlights: [],
    goalBannerSec: 0,
    goalBannerText: null,
    lastActionText: awayTeamSnapshot
      ? `Khai cuộc Online PvP: ${homeSnap.managerName} vs ${awayTeamSnapshot.managerName}!`
      : 'Trọng tài nổi hồi còi khai cuộc trận Giả Lập Xếp Hạng!',
    homeShotCooldownSec: 0,
    awayShotCooldownSec: 0,
    rngState: rawSeed === 0 ? 424242 : rawSeed,
  };

  // Build Home 11 players from home snapshot
  const homePlayers: GlxhCirclePlayer[] = buildGlxhPlayersFromSnapshot('home', homeSnap);

  // Build Away 11 players from real PvP opponent snapshot if present, otherwise fallback synthetic pool
  let awayPlayers: GlxhCirclePlayer[];
  if (awayTeamSnapshot) {
    awayPlayers = buildGlxhPlayersFromSnapshot('away', awayTeamSnapshot);
  } else {
    const oppIndex = Math.floor(nextRng(state) * OPPONENT_CLUB_POOL.length);
    state.awayName = opponentNameOverride ?? OPPONENT_CLUB_POOL[oppIndex];
    const baseOppOvr = clamp(Math.round(127 + (currentElo - 1800) / 105), 118, 146);
    const oppOvr =
      typeof opponentOvrOverride === 'number'
        ? clamp(Math.round(opponentOvrOverride), 85, 185)
        : baseOppOvr + Math.floor(nextRng(state) * 3) - 1;
    state.awayOvr = oppOvr;
    awayPlayers = AWAY_STAR_ROSTER.map((meta, idx) =>
      buildFallbackSyntheticPlayer('away', idx, meta.roleLabel, meta.lineGroup, oppOvr)
    );
  }

  state.players = [...homePlayers, ...awayPlayers];
  setupKickoffPositions(state, 'home');
  return state;
}

function setupKickoffPositions(state: GlxhMatchState, kickoffSide: GlxhSide): void {
  state.ball.flight = null;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.x = 50;
  state.ball.y = 32;
  state.ball.pickupLockSec = 0;

  let kicker: GlxhCirclePlayer | null = null;

  for (const p of state.players) {
    // Keep everyone on their own half for kickoff
    const halfClampedX =
      p.side === 'home'
        ? Math.min(47, p.homeAnchorX * 0.88)
        : Math.max(53, 100 - (100 - p.homeAnchorX) * 0.88);
    p.x = halfClampedX;
    p.y = p.homeAnchorY;
    p.vx = 0;
    p.vy = 0;
    p.decisionCooldown = 0.08;
    p.tackleGraceCooldown = 0.25;

    if (p.side === kickoffSide) {
      if (!kicker || p.lineGroup === 'ATT' || (p.lineGroup === 'MID' && kicker.lineGroup !== 'ATT')) {
        if (p.roleLabel === 'ST' || p.roleLabel === 'LS' || p.roleLabel === 'CF') {
          kicker = p;
        } else if (!kicker) {
          kicker = p;
        }
      }
    }
  }

  if (kicker) {
    kicker.x = kickoffSide === 'home' ? 48.8 : 51.2;
    kicker.y = 32;
    state.ball.carrierId = kicker.id;
    state.ball.lastTouchSide = kickoffSide;
    state.ball.lastTouchPlayerId = kicker.id;
    kicker.touchCount += 1;
  }
}

function findPlayerById(state: GlxhMatchState, id: string | null): GlxhCirclePlayer | undefined {
  if (!id) return undefined;
  return state.players.find((p) => p.id === id);
}

function getOpponentGoalX(side: GlxhSide): number {
  return side === 'home' ? GLXH_PITCH_WIDTH : 0;
}

function chooseSmartActionForCarrier(state: GlxhMatchState, carrier: GlxhCirclePlayer): void {
  const attackDir = carrier.side === 'home' ? 1 : -1;
  const oppGoalX = getOpponentGoalX(carrier.side);
  const oppGoalY = GLXH_PITCH_HEIGHT / 2;

  const teammates = state.players.filter((p) => p.side === carrier.side && p.id !== carrier.id);
  const opponents = state.players.filter((p) => p.side !== carrier.side);
  const oppGk = opponents.find((p) => p.lineGroup === 'GK');

  const distToGoal = dist(carrier.x, carrier.y, oppGoalX, oppGoalY);

  // Nearest opponent pressure distance
  let nearestOppDist = 99;
  for (const opp of opponents) {
    const d = dist(carrier.x, carrier.y, opp.x, opp.y);
    if (d < nearestOppDist) nearestOppDist = d;
  }

  // 1. Evaluate Shooting Decision (smarter players build inside the box & only shoot cleanly in high-xG lanes)
  const sideTactic: GlxhTacticalPosture =
    carrier.side === 'home' ? state.homeTactic : state.awayTactic;
  const tacticShootMod = sideTactic === 'attack' ? 0.08 : sideTactic === 'defend' ? -0.06 : 0;
  const effectiveSho = carrier.stats.sho * (0.78 + 0.22 * (carrier.stamina / 100));
  const maxShootRange =
    (carrier.lineGroup === 'ATT' ? 23 + (effectiveSho - 115) * 0.06 : 20.5) +
    (sideTactic === 'attack' ? 2.5 : sideTactic === 'defend' ? -1.5 : 0);
  const yPenalty = Math.abs(carrier.y - oppGoalY);
  const teamShotCooldown =
    carrier.side === 'home' ? state.homeShotCooldownSec : state.awayShotCooldownSec;

  if (
    teamShotCooldown <= 0 &&
    carrier.lineGroup !== 'GK' &&
    distToGoal <= clamp(maxShootRange, 18.5, 28) &&
    yPenalty <= 14.5
  ) {
    let blockers = 0;
    for (const opp of opponents) {
      if (opp.lineGroup === 'GK') continue;
      const dSeg = pointToSegmentDistance(opp.x, opp.y, carrier.x, carrier.y, oppGoalX, oppGoalY);
      if (dSeg < 2.6 && (opp.x - carrier.x) * attackDir > 0) {
        blockers += 1;
      }
    }

    const shotOpenness = clamp(1 - blockers * 0.36, 0.1, 1);
    const shotScore =
      (27 - distToGoal) * 2.6 +
      (effectiveSho - 110) * 0.5 +
      (14 - yPenalty) * 1.35 -
      blockers * 19 +
      (sideTactic === 'attack' ? 6 : sideTactic === 'defend' ? -4 : 0);

    const mustShoot = distToGoal < 12.2 && yPenalty < 7.5 && blockers === 0;
    if (
      mustShoot ||
      (shotScore > 36 && nextRng(state) < clamp(0.42 * shotOpenness + 0.14 + tacticShootMod, 0.05, 0.85))
    ) {
      // Launch shot toward optimal corner away from opponent GK
      const gkY = oppGk ? oppGk.y : oppGoalY;
      const aimCorner = gkY >= oppGoalY ? GLXH_GOAL_Y_MIN + 1.5 : GLXH_GOAL_Y_MAX - 1.5;
      const accuracySpread = clamp((175 - effectiveSho) * 0.08 + blockers * 1.4, 1.8, 7.2);
      const targetY = clamp(
        aimCorner + (nextRng(state) - 0.5) * accuracySpread,
        GLXH_GOAL_Y_MIN - 3.0,
        GLXH_GOAL_Y_MAX + 3.0
      );
      const flightDist = Math.max(4, dist(carrier.x, carrier.y, oppGoalX, targetY));
      const shotSpeed = 48 + clamp((effectiveSho - 110) * 0.25, 0, 18);

      carrier.shotsTaken += 1;
      if (carrier.side === 'home') {
        state.homeShots += 1;
        state.homeShotCooldownSec = 6.8;
      } else {
        state.awayShots += 1;
        state.awayShotCooldownSec = 6.8;
      }

      state.ball.carrierId = null;
      state.ball.flight = {
        kind: 'shot',
        fromSide: carrier.side,
        passerId: carrier.id,
        startX: carrier.x,
        startY: carrier.y,
        targetX: oppGoalX,
        targetY,
        elapsed: 0,
        duration: clamp(flightDist / shotSpeed, 0.22, 0.78),
        passSkill: carrier.stats.pas,
        shotSkill: effectiveSho,
      };
      state.trails.push({
        fromX: carrier.x,
        fromY: carrier.y,
        toX: oppGoalX,
        toY: targetY,
        side: carrier.side,
        kind: 'shot',
        ttl: 1,
      });
      state.lastActionText = `${carrier.shortName} (${carrier.seasonLabel}) tung cú dứt điểm uy lực!`;
      return;
    }
  }

  // 2. Evaluate Best Pass vs Through-Ball Target (weighted by PAS & receiver PAC + space)
  const effectivePas = carrier.stats.pas * (0.8 + 0.2 * (carrier.stamina / 100));
  const effectiveDri = carrier.stats.dri * (0.8 + 0.2 * (carrier.stamina / 100));

  let bestMate: GlxhCirclePlayer | null = null;
  let bestPassScore = -999;
  let bestTargetX = carrier.x;
  let bestTargetY = carrier.y;
  let bestKind: 'pass' | 'through' = 'pass';

  for (const mate of teammates) {
    if (mate.lineGroup === 'GK' && (carrier.x - oppGoalX) * attackDir > -48) {
      // Avoid passing back to GK when already in attacking half
      continue;
    }
    const progress = (mate.x - carrier.x) * attackDir;
    const passDist = dist(carrier.x, carrier.y, mate.x, mate.y);
    if (passDist < 5 || passDist > 56) continue;

    // Lead point for through balls if teammate is attacking forward
    const isForwardRun = progress > 4 && mate.lineGroup !== 'GK';
    const leadAmount = isForwardRun ? clamp((mate.stats.pac - 95) * 0.14 + 3.5, 3, 10.5) : 0;
    const tx = clamp(mate.x + attackDir * leadAmount, 5, GLXH_PITCH_WIDTH - 5);
    const ty = clamp(mate.y, 4, GLXH_PITCH_HEIGHT - 4);

    // Openness around target
    let minMateOppDist = 99;
    let laneDanger = 0;
    for (const opp of opponents) {
      const dm = dist(tx, ty, opp.x, opp.y);
      if (dm < minMateOppDist) minMateOppDist = dm;
      const segD = pointToSegmentDistance(opp.x, opp.y, carrier.x, carrier.y, tx, ty);
      if (segD < 3.6) {
        laneDanger += (3.6 - segD) * 11;
      }
    }

    // Smarter passers (high PAS) identify safer lanes and reward forward runs
    const visionBonus = clamp((effectivePas - 110) * 0.22, 0, 14);
    const score =
      progress * 1.45 +
      clamp(minMateOppDist, 0, 14) * 2.1 -
      laneDanger * clamp(1.15 - visionBonus * 0.03, 0.6, 1.15) -
      (passDist > 34 ? (passDist - 34) * 0.7 : 0) +
      (mate.lineGroup === 'ATT' ? 7 : mate.lineGroup === 'MID' ? 3 : 0);

    if (score > bestPassScore) {
      bestPassScore = score;
      bestMate = mate;
      bestTargetX = tx;
      bestTargetY = ty;
      bestKind = isForwardRun && leadAmount >= 4 ? 'through' : 'pass';
    }
  }

  // Decide between passing and dribbling (high DRI prefers carrying into space when unpressed)
  const dribbleHoldBias =
    carrier.lineGroup === 'GK'
      ? -35
      : clamp((effectiveDri - 115) * 0.45, -6, 16) + (nearestOppDist > 8.5 ? 14 : -14);

  const shouldPass =
    bestMate !== null &&
    (carrier.lineGroup === 'GK' ||
      nearestOppDist < 6.2 ||
      bestPassScore > dribbleHoldBias + (nextRng(state) * 10 - 3));

  if (shouldPass && bestMate) {
    const flightDist = Math.max(4, dist(carrier.x, carrier.y, bestTargetX, bestTargetY));
    const passSpeed = 34 + clamp((effectivePas - 110) * 0.18, 0, 12);
    const inaccuracy = clamp((165 - effectivePas) * 0.035, 0.3, 2.5);
    const finalX = clamp(bestTargetX + (nextRng(state) - 0.5) * inaccuracy, 4, GLXH_PITCH_WIDTH - 4);
    const finalY = clamp(bestTargetY + (nextRng(state) - 0.5) * inaccuracy, 4, GLXH_PITCH_HEIGHT - 4);

    state.ball.carrierId = null;
    state.ball.flight = {
      kind: bestKind,
      fromSide: carrier.side,
      passerId: carrier.id,
      targetPlayerId: bestMate.id,
      startX: carrier.x,
      startY: carrier.y,
      targetX: finalX,
      targetY: finalY,
      elapsed: 0,
      duration: clamp(flightDist / passSpeed, 0.18, 1.05),
      passSkill: effectivePas,
      shotSkill: carrier.stats.sho,
    };
    state.trails.push({
      fromX: carrier.x,
      fromY: carrier.y,
      toX: finalX,
      toY: finalY,
      side: carrier.side,
      kind: bestKind,
      ttl: 0.9,
    });

    if (bestKind === 'through') {
      state.lastActionText = `${carrier.shortName} chọc khe thông minh cho ${bestMate.shortName} băng lên!`;
    } else {
      state.lastActionText = `${carrier.shortName} luân chuyển bóng sang ${bestMate.shortName}.`;
    }
    carrier.decisionCooldown = 0.25;
  } else {
    // Continue smart dribble
    carrier.decisionCooldown = 0.24;
  }
}

function resolveShotArrival(state: GlxhMatchState, flight: GlxhBallFlight): void {
  const shooter = findPlayerById(state, flight.passerId);
  const defendingSide: GlxhSide = flight.fromSide === 'home' ? 'away' : 'home';
  const oppGk = state.players.find((p) => p.side === defendingSide && p.lineGroup === 'GK');
  const onTarget =
    flight.targetY >= GLXH_GOAL_Y_MIN && flight.targetY <= GLXH_GOAL_Y_MAX;

  if (onTarget) {
    if (flight.fromSide === 'home') state.homeShotsOnTarget += 1;
    else state.awayShotsOnTarget += 1;
  }

  if (!onTarget) {
    // Goal kick to defending GK
    if (oppGk) {
      state.ball.carrierId = oppGk.id;
      state.ball.x = oppGk.x;
      state.ball.y = oppGk.y;
      oppGk.decisionCooldown = 0.25;
    }
    state.ball.lastTouchSide = defendingSide;
    state.lastActionText = `${shooter?.shortName ?? 'Tiền đạo'} sút chệch cột dọc trong gang tấc!`;
    return;
  }

  // Evaluate GK save vs Shot power/placement & distance-based xG
  const shotDist = dist(flight.startX, flight.startY, flight.targetX, flight.targetY);
  const gkRating = oppGk
    ? oppGk.stats.def * 0.45 + oppGk.ovr * 0.55 - Math.abs(oppGk.y - flight.targetY) * 1.25
    : 110;
  const shotQuality = flight.shotSkill * 0.65 + (shooter?.ovr ?? 120) * 0.35;
  const edge = (shotQuality - gkRating) * 0.0085;
  const boxBonus = shotDist < 15 ? 0.06 : shotDist > 22 ? -0.05 : 0;
  const goalProbability = clamp(0.17 + boxBonus + edge, 0.06, 0.36);

  if (nextRng(state) < goalProbability) {
    // GOAL!
    if (flight.fromSide === 'home') state.homeGoals += 1;
    else state.awayGoals += 1;
    if (shooter) shooter.goalsScored += 1;

    const minute = clamp(Math.ceil((state.simElapsedSec / GLXH_SIM_SECONDS_PER_MATCH) * 90), 1, 90);
    const scorerName = shooter?.shortName ?? 'Siêu Sao';
    const seasonLabel = shooter?.seasonLabel ?? '26UCL';
    state.highlights.push({
      minute,
      scorerName,
      seasonLabel,
      isUserGoal: flight.fromSide === 'home',
      scorerSide: flight.fromSide,
    });

    const teamTag = flight.fromSide === 'home' ? state.homeName : state.awayName;
    state.goalBannerSec = 2.4;
    state.goalBannerText = `VÀOOO! ${scorerName} (${minute}') · ${state.homeGoals} - ${state.awayGoals}`;
    state.lastActionText = `BÀN THẮNG! ${scorerName} (${seasonLabel}) ghi bàn cho ${teamTag} ở phút ${minute}'!`;
    setupKickoffPositions(state, defendingSide);
  } else {
    // Saved by GK!
    if (oppGk) {
      oppGk.savesMade += 1;
      oppGk.touchCount += 1;
      state.ball.carrierId = oppGk.id;
      state.ball.x = oppGk.x;
      state.ball.y = oppGk.y;
      oppGk.decisionCooldown = 0.3;
    }
    state.ball.lastTouchSide = defendingSide;
    state.lastActionText = `Thủ môn ${oppGk?.shortName ?? 'GK'} bay người cản phá xuất thần!`;
  }
}

export function stepGlxhSimulation(state: GlxhMatchState, dtSec: number): void {
  if (state.finished) return;
  const dt = clamp(dtSec, 0.005, 0.1);

  state.simElapsedSec = Math.min(GLXH_SIM_SECONDS_PER_MATCH, state.simElapsedSec + dt);
  state.minute = Math.min(
    GLXH_TOTAL_MATCH_MINUTES,
    Math.floor((state.simElapsedSec / GLXH_SIM_SECONDS_PER_MATCH) * GLXH_TOTAL_MATCH_MINUTES)
  );

  if (state.goalBannerSec > 0) {
    state.goalBannerSec = Math.max(0, state.goalBannerSec - dt);
    if (state.goalBannerSec === 0) state.goalBannerText = null;
  }

  // Decay visual pass/shot trails
  for (let i = state.trails.length - 1; i >= 0; i--) {
    state.trails[i].ttl -= dt * 1.45;
    if (state.trails[i].ttl <= 0) {
      state.trails.splice(i, 1);
    }
  }

  if (state.ball.pickupLockSec > 0) {
    state.ball.pickupLockSec = Math.max(0, state.ball.pickupLockSec - dt);
  }
  if (state.homeShotCooldownSec > 0) {
    state.homeShotCooldownSec = Math.max(0, state.homeShotCooldownSec - dt);
  }
  if (state.awayShotCooldownSec > 0) {
    state.awayShotCooldownSec = Math.max(0, state.awayShotCooldownSec - dt);
  }

  // Identify closest defenders per side to ball for smart pressing (scaled by live tactic!)
  const findTopPressers = (side: GlxhSide, count: number): Set<string> => {
    const candidates = state.players
      .filter((p) => p.side === side && p.lineGroup !== 'GK')
      .map((p) => ({
        id: p.id,
        d: dist(p.x, p.y, state.ball.x, state.ball.y),
      }))
      .sort((a, b) => a.d - b.d);
    return new Set(candidates.slice(0, count).map((c) => c.id));
  };

  const carrier = findPlayerById(state, state.ball.carrierId);
  const possessionSide: GlxhSide | null = carrier
    ? carrier.side
    : state.ball.flight
    ? state.ball.flight.fromSide
    : null;

  if (possessionSide === 'home') state.homePossessionTicks += 1;
  else if (possessionSide === 'away') state.awayPossessionTicks += 1;

  const homePresserCount =
    state.homeTactic === 'attack' ? 3 : state.homeTactic === 'defend' ? 1 : 2;
  const awayPresserCount =
    state.awayTactic === 'attack' ? 3 : state.awayTactic === 'defend' ? 1 : 2;
  const homePressers =
    possessionSide !== 'home' ? findTopPressers('home', homePresserCount) : new Set<string>();
  const awayPressers =
    possessionSide !== 'away' ? findTopPressers('away', awayPresserCount) : new Set<string>();

  // Handle flying ball (pass, through-ball, shot)
  if (state.ball.flight) {
    const fl = state.ball.flight;
    fl.elapsed += dt;
    const progress = clamp(fl.elapsed / Math.max(0.05, fl.duration), 0, 1);
    state.ball.x = fl.startX + (fl.targetX - fl.startX) * progress;
    state.ball.y = fl.startY + (fl.targetY - fl.startY) * progress;

    // Check interception / block by opponent defenders during mid-flight
    let intercepted = false;
    if (progress > 0.16 && progress < 0.94) {
      for (const opp of state.players) {
        if (opp.side === fl.fromSide) continue;
        if (fl.kind !== 'shot' && opp.lineGroup === 'GK') continue;
        const dBall = dist(opp.x, opp.y, state.ball.x, state.ball.y);
        const interceptRadius = fl.kind === 'shot' ? 1.85 : 2.15;
        if (dBall <= interceptRadius) {
          const defPower = opp.stats.def * 0.55 + opp.stats.pac * 0.25 + opp.ovr * 0.2;
          const offPower = (fl.kind === 'shot' ? fl.shotSkill : fl.passSkill) * 0.92;
          const chance = clamp(0.32 + (defPower - offPower) * 0.012, 0.12, 0.72);
          if (nextRng(state) < chance) {
            state.ball.flight = null;
            state.ball.carrierId = opp.id;
            state.ball.lastTouchSide = opp.side;
            state.ball.lastTouchPlayerId = opp.id;
            opp.tacklesWon += 1;
            opp.touchCount += 1;
            opp.decisionCooldown = 0.22;
            opp.tackleGraceCooldown = 0.35;
            if (opp.side === 'home') state.homeTacklesWon += 1;
            else state.awayTacklesWon += 1;
            state.lastActionText =
              fl.kind === 'shot'
                ? `${opp.shortName} lăn xả chặn đứng cú sút!`
                : `${opp.shortName} đọc tình huống cắt bóng chuẩn xác!`;
            intercepted = true;
            break;
          }
        }
      }
    }

    if (!intercepted && progress >= 1) {
      const completedFlight = fl;
      state.ball.flight = null;
      if (completedFlight.kind === 'shot') {
        resolveShotArrival(state, completedFlight);
      } else {
        // Find intended receiver or closest teammate near target
        const receiver =
          findPlayerById(state, completedFlight.targetPlayerId ?? null) ??
          state.players
            .filter((p) => p.side === completedFlight.fromSide)
            .sort(
              (a, b) =>
                dist(a.x, a.y, completedFlight.targetX, completedFlight.targetY) -
                dist(b.x, b.y, completedFlight.targetX, completedFlight.targetY)
            )[0];

        if (
          receiver &&
          dist(receiver.x, receiver.y, completedFlight.targetX, completedFlight.targetY) < 9.5
        ) {
          state.ball.carrierId = receiver.id;
          state.ball.x = receiver.x;
          state.ball.y = receiver.y;
          state.ball.lastTouchSide = receiver.side;
          state.ball.lastTouchPlayerId = receiver.id;
          receiver.touchCount += 1;
          receiver.decisionCooldown = 0.16;

          const passer = findPlayerById(state, completedFlight.passerId);
          if (passer) passer.passesCompleted += 1;
          if (completedFlight.fromSide === 'home') state.homePassesCompleted += 1;
          else state.awayPassesCompleted += 1;
        } else {
          // Loose ball near arrival
          state.ball.x = completedFlight.targetX;
          state.ball.y = completedFlight.targetY;
          state.ball.vx = 0;
          state.ball.vy = 0;
        }
      }
    }
  } else if (carrier) {
    // Carrier controls ball & executes AI decisions
    const attackDir = carrier.side === 'home' ? 1 : -1;
    carrier.decisionCooldown = Math.max(0, carrier.decisionCooldown - dt);
    if (carrier.decisionCooldown <= 0) {
      chooseSmartActionForCarrier(state, carrier);
    }

    // Update ball attached to carrier if still carrying
    if (state.ball.carrierId === carrier.id) {
      const speedNorm = Math.hypot(carrier.vx, carrier.vy);
      const dirX = speedNorm > 0.5 ? carrier.vx / speedNorm : attackDir;
      const dirY = speedNorm > 0.5 ? carrier.vy / speedNorm : 0;
      state.ball.x = clamp(carrier.x + dirX * 1.35, 1.5, GLXH_PITCH_WIDTH - 1.5);
      state.ball.y = clamp(carrier.y + dirY * 1.35, 1.5, GLXH_PITCH_HEIGHT - 1.5);

      // Check tackle duel from opposing players
      if (carrier.tackleGraceCooldown <= 0) {
        for (const opp of state.players) {
          if (opp.side === carrier.side || opp.tackleGraceCooldown > 0) continue;
          const dOpp = dist(opp.x, opp.y, carrier.x, carrier.y);
          if (dOpp < 2.2) {
            const defScore =
              opp.stats.def * 0.45 + opp.stats.phy * 0.35 + opp.ovr * 0.2;
            const driScore =
              carrier.stats.dri * 0.5 + carrier.stats.phy * 0.25 + carrier.stats.pac * 0.25;
            const stealChance = clamp(0.26 + (defScore - driScore) * 0.012, 0.08, 0.72);
            if (nextRng(state) < stealChance) {
              carrier.tackleGraceCooldown = 0.65;
              opp.tackleGraceCooldown = 0.4;
              opp.tacklesWon += 1;
              opp.touchCount += 1;
              opp.decisionCooldown = 0.2;
              if (opp.side === 'home') state.homeTacklesWon += 1;
              else state.awayTacklesWon += 1;
              state.ball.carrierId = opp.id;
              state.ball.lastTouchSide = opp.side;
              state.ball.lastTouchPlayerId = opp.id;
              state.lastActionText = `${opp.shortName} tranh chấp khôn ngoan đoạt bóng từ ${carrier.shortName}!`;
              break;
            } else {
              // Carrier skipped past the challenge!
              opp.tackleGraceCooldown = 0.55;
              carrier.tackleGraceCooldown = 0.32;
            }
          }
        }
      }
    }
  } else {
    // Loose ball physics + nearest pickup
    state.ball.x = clamp(state.ball.x + state.ball.vx * dt, 2, GLXH_PITCH_WIDTH - 2);
    state.ball.y = clamp(state.ball.y + state.ball.vy * dt, 2, GLXH_PITCH_HEIGHT - 2);
    state.ball.vx *= 0.92;
    state.ball.vy *= 0.92;

    if (state.ball.pickupLockSec <= 0) {
      let bestPickup: GlxhCirclePlayer | null = null;
      let bestScore = Infinity;
      for (const p of state.players) {
        const d = dist(p.x, p.y, state.ball.x, state.ball.y);
        if (d < 2.4) {
          const score = d - (p.stats.pac + p.stats.dri) * 0.004;
          if (score < bestScore) {
            bestScore = score;
            bestPickup = p;
          }
        }
      }
      if (bestPickup) {
        state.ball.carrierId = bestPickup.id;
        state.ball.lastTouchSide = bestPickup.side;
        state.ball.lastTouchPlayerId = bestPickup.id;
        bestPickup.touchCount += 1;
        bestPickup.decisionCooldown = 0.14;
      }
    }
  }

  // Move all 22 circle players with tactical intelligence + stat-based speed
  const ballShiftX = state.ball.x - 50;
  for (const p of state.players) {
    p.tackleGraceCooldown = Math.max(0, p.tackleGraceCooldown - dt);
    const attackDir = p.side === 'home' ? 1 : -1;
    const oppGoalX = getOpponentGoalX(p.side);
    const oppGoalY = GLXH_PITCH_HEIGHT / 2;
    const isTeamInPoss = possessionSide === p.side;
    const isCarrier = state.ball.carrierId === p.id;
    const isPresser =
      (p.side === 'home' && homePressers.has(p.id)) ||
      (p.side === 'away' && awayPressers.has(p.id));
    const isReceivingFlight =
      state.ball.flight !== null && state.ball.flight.targetPlayerId === p.id;

    let targetX = p.homeAnchorX;
    let targetY = p.homeAnchorY;

    if (p.lineGroup === 'GK') {
      targetX = p.side === 'home' ? 5.2 : GLXH_PITCH_WIDTH - 5.2;
      targetY = clamp(state.ball.y, GLXH_GOAL_Y_MIN + 0.8, GLXH_GOAL_Y_MAX - 0.8);
      if (isCarrier) {
        targetX = p.side === 'home' ? 7.5 : GLXH_PITCH_WIDTH - 7.5;
      }
    } else if (isCarrier) {
      // Dribble toward opponent goal while steering away from nearest defender
      let avoidX = 0;
      let avoidY = 0;
      for (const opp of state.players) {
        if (opp.side === p.side) continue;
        const dOpp = dist(p.x, p.y, opp.x, opp.y);
        if (dOpp < 10 && dOpp > 0.01) {
          const weight = (10 - dOpp) / 10;
          avoidX += ((p.x - opp.x) / dOpp) * weight * 11;
          avoidY += ((p.y - opp.y) / dOpp) * weight * 14;
        }
      }
      targetX = clamp(p.x + attackDir * 14 + avoidX, 8, GLXH_PITCH_WIDTH - 8);
      targetY = clamp(
        p.y + (oppGoalY - p.y) * 0.25 + avoidY,
        6,
        GLXH_PITCH_HEIGHT - 6
      );
    } else if (isReceivingFlight && state.ball.flight) {
      targetX = state.ball.flight.targetX;
      targetY = state.ball.flight.targetY;
    } else if (!state.ball.carrierId && !state.ball.flight && dist(p.x, p.y, state.ball.x, state.ball.y) < 16) {
      // Chase loose ball
      targetX = state.ball.x;
      targetY = state.ball.y;
    } else if (isPresser && !isTeamInPoss) {
      // Close down ball carrier / ball
      targetX = state.ball.x - attackDir * 0.6;
      targetY = state.ball.y;
    } else {
      // Smart tactical shape + off-ball movement (affected live by manager's tactical posture)
      const sideTactic: GlxhTacticalPosture =
        p.side === 'home' ? state.homeTactic : state.awayTactic;
      const tacticLineOffset =
        sideTactic === 'attack'
          ? attackDir * 7.5
          : sideTactic === 'defend'
          ? -attackDir * 7.5
          : 0;
      const shapeShiftX =
        ballShiftX * 0.42 +
        (isTeamInPoss ? attackDir * 8.5 : -attackDir * 7.5) +
        tacticLineOffset;
      const shapeShiftY = (state.ball.y - 32) * 0.28;
      targetX = clamp(p.homeAnchorX + shapeShiftX, 10, GLXH_PITCH_WIDTH - 10);
      targetY = clamp(p.homeAnchorY + shapeShiftY, 5, GLXH_PITCH_HEIGHT - 5);

      if (isTeamInPoss && p.lineGroup === 'ATT') {
        // Intelligent attacking runs into space
        const extraRun = sideTactic === 'attack' ? 3.5 : sideTactic === 'defend' ? -3.0 : 0;
        targetX = clamp(targetX + attackDir * (8.5 + extraRun), 15, GLXH_PITCH_WIDTH - 8.5);
      } else if (!isTeamInPoss && p.lineGroup === 'DEF') {
        // Defenders tuck tighter horizontally and stay goal-side
        targetY = p.homeAnchorY + (state.ball.y - 32) * 0.42;
      }
    }

    const dx = targetX - p.x;
    const dy = targetY - p.y;
    const dTarget = Math.hypot(dx, dy);

    // Base pace scaled by player PAC stat and current stamina
    const staminaFactor = 0.72 + 0.28 * (p.stamina / 100);
    const maxSpeed =
      (10.5 + clamp((p.stats.pac - 100) * 0.14, -2, 8.5)) *
      staminaFactor *
      (isCarrier ? 0.92 : 1);

    if (dTarget > 0.35) {
      const desiredVx = (dx / dTarget) * Math.min(maxSpeed, dTarget * 4.5);
      const desiredVy = (dy / dTarget) * Math.min(maxSpeed, dTarget * 4.5);
      p.vx += (desiredVx - p.vx) * Math.min(1, dt * 8.5);
      p.vy += (desiredVy - p.vy) * Math.min(1, dt * 8.5);
    } else {
      p.vx *= 0.8;
      p.vy *= 0.8;
    }

    p.x = clamp(p.x + p.vx * dt, 2.5, GLXH_PITCH_WIDTH - 2.5);
    p.y = clamp(p.y + p.vy * dt, 2.5, GLXH_PITCH_HEIGHT - 2.5);

    // Mild stamina drain weighted by PHY
    const drainRate = 0.25 * clamp(1.25 - (p.stats.phy - 110) * 0.008, 0.55, 1.35);
    p.stamina = Math.max(48, p.stamina - drainRate * dt);
  }

  // Soft player-to-player spacing separation so circles never overlap completely
  for (let i = 0; i < state.players.length; i++) {
    for (let j = i + 1; j < state.players.length; j++) {
      const a = state.players[i];
      const b = state.players[j];
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > 0.001 && d < 2.65) {
        const push = (2.65 - d) * 0.35;
        const nx = (a.x - b.x) / d;
        const ny = (a.y - b.y) / d;
        a.x = clamp(a.x + nx * push, 2.5, GLXH_PITCH_WIDTH - 2.5);
        a.y = clamp(a.y + ny * push, 2.5, GLXH_PITCH_HEIGHT - 2.5);
        b.x = clamp(b.x - nx * push, 2.5, GLXH_PITCH_WIDTH - 2.5);
        b.y = clamp(b.y - ny * push, 2.5, GLXH_PITCH_HEIGHT - 2.5);
      }
    }
  }

  if (state.simElapsedSec >= GLXH_SIM_SECONDS_PER_MATCH) {
    state.finished = true;
    state.minute = 90;
    state.lastActionText = `HẾT GIỜ! Chung cuộc ${state.homeName} ${state.homeGoals} - ${state.awayGoals} ${state.awayName}.`;
  }
}

export function fastForwardGlxhMatch(
  state: GlxhMatchState,
  maxTicks: number = 4000
): GlxhMatchState {
  let ticks = 0;
  while (!state.finished && ticks < maxTicks) {
    stepGlxhSimulation(state, 0.05);
    ticks++;
  }
  return state;
}

export function computeGlxhPossessionPercent(state: GlxhMatchState): number {
  const total = state.homePossessionTicks + state.awayPossessionTicks;
  if (total <= 0) return 50;
  return clamp(Math.round((state.homePossessionTicks / total) * 100), 25, 78);
}

export function buildSimulatedMatchResultFromGlxh(params: {
  state: GlxhMatchState;
  profile: ManagerProfile;
  coachId?: string;
  serverRules?: GlobalServerRules;
}): SimulatedMatchResult {
  const { state, profile, serverRules } = params;
  const userGoals = state.homeGoals;
  const opponentGoals = state.awayGoals;
  const outcome: 'WIN' | 'DRAW' | 'LOSS' =
    userGoals > opponentGoals ? 'WIN' : userGoals === opponentGoals ? 'DRAW' : 'LOSS';

  const eloDelta = outcome === 'WIN' ? 28 : outcome === 'DRAW' ? 6 : -12;
  const eloAfter = Math.max(1000, state.currentElo + eloDelta);

  const matchMult = serverRules?.matchRewardMultiplier ?? 1;
  const bpEarned =
    (outcome === 'WIN'
      ? 9_000_000_000_000
      : outcome === 'DRAW'
      ? 5_500_000_000_000
      : 3_500_000_000_000) * matchMult;
  const starPointsEarned = (outcome === 'WIN' ? 120 : outcome === 'DRAW' ? 80 : 50) * matchMult;
  const managerXpEarned = outcome === 'WIN' ? 260 : outcome === 'DRAW' ? 180 : 120;
  const starPassXpEarned = outcome === 'WIN' ? 150 : outcome === 'DRAW' ? 110 : 80;

  // Pick MVP based on goals, shots, passes, tackles, saves
  const mvpSide: GlxhSide = outcome === 'LOSS' ? 'away' : 'home';
  const mvpCandidate = state.players
    .filter((p) => p.side === mvpSide)
    .sort((a, b) => {
      const scoreA =
        a.goalsScored * 40 + a.passesCompleted * 1.4 + a.tacklesWon * 5 + a.savesMade * 12 + a.ovr * 0.2;
      const scoreB =
        b.goalsScored * 40 + b.passesCompleted * 1.4 + b.tacklesWon * 5 + b.savesMade * 12 + b.ovr * 0.2;
      return scoreB - scoreA;
    })[0];

  const rewardedProfile = applyLobbyRewardBundle(profile, {
    bp: bpEarned,
    starPoints: starPointsEarned,
  });

  const nextProfile: ManagerProfile = {
    ...rewardedProfile,
    elo: eloAfter,
    wins: Math.min(1_000_000, (profile.wins ?? 14) + (outcome === 'WIN' ? 1 : 0)),
    draws: Math.min(1_000_000, (profile.draws ?? 3) + (outcome === 'DRAW' ? 1 : 0)),
    losses: Math.min(1_000_000, (profile.losses ?? 4) + (outcome === 'LOSS' ? 1 : 0)),
    managerXp: Math.min(100_000_000, (profile.managerXp ?? 7_350) + managerXpEarned),
    squadOvr: Math.max(50, Math.min(260, Math.round(state.homeOvr))),
  };

  return {
    id: state.id,
    mode: 'glxh_manager' as FcMatchMode,
    modeLabel: 'Giả Lập Xếp Hạng (GLXH · 2D)',
    opponentName: state.awayName,
    opponentOvr: state.awayOvr,
    userGoals,
    opponentGoals,
    outcome,
    possessionPercent: computeGlxhPossessionPercent(state),
    shotsOnTarget: state.homeShotsOnTarget,
    opponentShots: state.awayShots,
    mvpName: mvpCandidate ? mvpCandidate.shortName : 'Đội Trưởng CLB',
    highlights: [...state.highlights],
    eloBefore: state.currentElo,
    eloAfter,
    eloDelta,
    bpEarned,
    starPointsEarned,
    managerXpEarned,
    starPassXpEarned,
    playedAt: Date.now(),
    nextProfile,
  };
}

export function serializeGlxhLiveFrame(params: {
  state: GlxhMatchState;
  matchKind: GlxhOnlineMatchKind;
  seq: number;
  homeClientId: string;
  awayClientId: string;
  emotes?: GlxhLiveEmote[];
}): GlxhLiveMatchWireState {
  const { state, matchKind, seq, homeClientId, awayClientId, emotes = [] } = params;
  return {
    matchId: state.id,
    matchKind,
    seq,
    serverTimeMs: Date.now(),
    homeClientId,
    awayClientId,
    homeName: state.homeName,
    awayName: state.awayName,
    homeOvr: state.homeOvr,
    awayOvr: state.awayOvr,
    homeElo: state.homeElo,
    awayElo: state.awayElo,
    homeFormation: state.homeFormation,
    awayFormation: state.awayFormation,
    homeCoachName: state.homeCoachName,
    awayCoachName: state.awayCoachName,
    homeTactic: state.homeTactic,
    awayTactic: state.awayTactic,
    simElapsedSec: state.simElapsedSec,
    minute: state.minute,
    finished: state.finished,
    ...(state.forfeitBySide ? { forfeitBySide: state.forfeitBySide } : {}),
    homeGoals: state.homeGoals,
    awayGoals: state.awayGoals,
    homePossessionTicks: state.homePossessionTicks,
    awayPossessionTicks: state.awayPossessionTicks,
    homeShots: state.homeShots,
    homeShotsOnTarget: state.homeShotsOnTarget,
    awayShots: state.awayShots,
    awayShotsOnTarget: state.awayShotsOnTarget,
    homePassesCompleted: state.homePassesCompleted,
    awayPassesCompleted: state.awayPassesCompleted,
    homeTacklesWon: state.homeTacklesWon,
    awayTacklesWon: state.awayTacklesWon,
    ball: {
      x: Number(state.ball.x.toFixed(2)),
      y: Number(state.ball.y.toFixed(2)),
      vx: Number(state.ball.vx.toFixed(2)),
      vy: Number(state.ball.vy.toFixed(2)),
      carrierId: state.ball.carrierId,
      lastTouchSide: state.ball.lastTouchSide,
      flightTargetPlayerId: state.ball.flight?.targetPlayerId ?? null,
    },
    trails: state.trails.slice(-6).map((tr) => ({
      fromX: Number(tr.fromX.toFixed(2)),
      fromY: Number(tr.fromY.toFixed(2)),
      toX: Number(tr.toX.toFixed(2)),
      toY: Number(tr.toY.toFixed(2)),
      side: tr.side,
      kind: tr.kind,
      ttl: Number(tr.ttl.toFixed(2)),
    })),
    highlights: state.highlights.map((h) => ({ ...h })),
    goalBannerSec: state.goalBannerSec,
    goalBannerText: state.goalBannerText,
    lastActionText: state.lastActionText,
    players: state.players.map((p) => ({
      id: p.id,
      side: p.side,
      slotIndex: p.slotIndex,
      roleLabel: p.roleLabel,
      lineGroup: p.lineGroup,
      jerseyNumber: p.jerseyNumber,
      shortName: p.shortName,
      seasonLabel: p.seasonLabel,
      isNaturalFit: p.isNaturalFit,
      ovr: p.ovr,
      stats: p.stats,
      x: Number(p.x.toFixed(2)),
      y: Number(p.y.toFixed(2)),
      vx: Number(p.vx.toFixed(2)),
      vy: Number(p.vy.toFixed(2)),
      stamina: Number(p.stamina.toFixed(1)),
      touchCount: p.touchCount,
      passesCompleted: p.passesCompleted,
      shotsTaken: p.shotsTaken,
      goalsScored: p.goalsScored,
      tacklesWon: p.tacklesWon,
      savesMade: p.savesMade,
    })),
    emotes: emotes.slice(-5),
  };
}

export function buildOnlineMatchResultForSide(params: {
  frame: GlxhLiveMatchWireState;
  mySide: GlxhSide;
  profile: ManagerProfile;
  currentElo: number;
  serverRules?: GlobalServerRules;
}): SimulatedMatchResult {
  const { frame, mySide, profile, currentElo, serverRules } = params;
  const userGoals = mySide === 'home' ? frame.homeGoals : frame.awayGoals;
  const opponentGoals = mySide === 'home' ? frame.awayGoals : frame.homeGoals;
  const opponentName = mySide === 'home' ? frame.awayName : frame.homeName;
  const opponentOvr = mySide === 'home' ? frame.awayOvr : frame.homeOvr;
  const opponentElo = mySide === 'home' ? frame.awayElo : frame.homeElo;

  const outcome: 'WIN' | 'DRAW' | 'LOSS' =
    userGoals > opponentGoals ? 'WIN' : userGoals === opponentGoals ? 'DRAW' : 'LOSS';

  const eloDiffBonus = clamp(Math.round((opponentElo - currentElo) / 65), -6, 10);
  const isRealPvp = frame.matchKind !== 'snapshot';
  const pvpBonus = isRealPvp ? 4 : 0;
  const eloDelta =
    outcome === 'WIN'
      ? Math.max(16, 28 + eloDiffBonus + pvpBonus)
      : outcome === 'DRAW'
      ? Math.max(2, 6 + Math.round(eloDiffBonus * 0.5) + (isRealPvp ? 2 : 0))
      : Math.min(-6, -12 + Math.round(eloDiffBonus * 0.4));
  const eloAfter = Math.max(1000, currentElo + eloDelta);

  const matchMult = serverRules?.matchRewardMultiplier ?? 1;
  const liveBonusMult = isRealPvp ? 1.25 : 1.0;
  const bpEarned = Math.round(
    (outcome === 'WIN'
      ? 9_000_000_000_000
      : outcome === 'DRAW'
      ? 5_500_000_000_000
      : 3_500_000_000_000) *
      matchMult *
      liveBonusMult
  );
  const starPointsEarned = Math.round(
    (outcome === 'WIN' ? 120 : outcome === 'DRAW' ? 80 : 50) * matchMult * liveBonusMult
  );
  const managerXpEarned =
    (outcome === 'WIN' ? 280 : outcome === 'DRAW' ? 200 : 140) + (isRealPvp ? 40 : 0);
  const starPassXpEarned =
    (outcome === 'WIN' ? 170 : outcome === 'DRAW' ? 120 : 90) + (isRealPvp ? 30 : 0);

  const totalPoss = frame.homePossessionTicks + frame.awayPossessionTicks;
  const homePossPct =
    totalPoss <= 0 ? 50 : clamp(Math.round((frame.homePossessionTicks / totalPoss) * 100), 25, 78);
  const myPossPct = mySide === 'home' ? homePossPct : 100 - homePossPct;

  const mvpSide: GlxhSide = outcome === 'LOSS' ? (mySide === 'home' ? 'away' : 'home') : mySide;
  const mvpCandidate = frame.players
    .filter((p) => p.side === mvpSide)
    .sort((a, b) => {
      const scoreA =
        a.goalsScored * 40 + a.passesCompleted * 1.4 + a.tacklesWon * 5 + a.savesMade * 12 + a.ovr * 0.2;
      const scoreB =
        b.goalsScored * 40 + b.passesCompleted * 1.4 + b.tacklesWon * 5 + b.savesMade * 12 + b.ovr * 0.2;
      return scoreB - scoreA;
    })[0];

  const myHighlights: MatchHighlightEvent[] = frame.highlights.map((h) => {
    const goalSide: GlxhSide = h.scorerSide ?? (h.isUserGoal ? 'home' : 'away');
    return {
      minute: h.minute,
      scorerName: h.scorerName,
      seasonLabel: h.seasonLabel,
      scorerSide: goalSide,
      isUserGoal: goalSide === mySide,
    };
  });

  const rewardedProfile = applyLobbyRewardBundle(profile, {
    bp: bpEarned,
    starPoints: starPointsEarned,
  });
  const myOvr = mySide === 'home' ? frame.homeOvr : frame.awayOvr;

  const nextProfile: ManagerProfile = {
    ...rewardedProfile,
    elo: eloAfter,
    wins: Math.min(1_000_000, (profile.wins ?? 14) + (outcome === 'WIN' ? 1 : 0)),
    draws: Math.min(1_000_000, (profile.draws ?? 3) + (outcome === 'DRAW' ? 1 : 0)),
    losses: Math.min(1_000_000, (profile.losses ?? 4) + (outcome === 'LOSS' ? 1 : 0)),
    managerXp: Math.min(100_000_000, (profile.managerXp ?? 7_350) + managerXpEarned),
    squadOvr: Math.max(50, Math.min(260, Math.round(myOvr))),
  };

  return {
    id: frame.matchId,
    mode: 'glxh_manager',
    modeLabel:
      frame.matchKind === 'room'
        ? 'GLXH Online · Phòng Đấu PvP'
        : frame.matchKind === 'challenge'
        ? 'GLXH Online · Thách Đấu Trực Tiếp'
        : frame.matchKind === 'snapshot'
        ? 'GLXH · Đối Đầu CLB Server'
        : 'Giả Lập Xếp Hạng Online PvP',
    opponentName,
    opponentOvr,
    userGoals,
    opponentGoals,
    outcome,
    possessionPercent: myPossPct,
    shotsOnTarget: mySide === 'home' ? frame.homeShotsOnTarget : frame.awayShotsOnTarget,
    opponentShots: mySide === 'home' ? frame.awayShots : frame.homeShots,
    mvpName: mvpCandidate ? mvpCandidate.shortName : 'Đội Trưởng CLB',
    highlights: myHighlights,
    eloBefore: currentElo,
    eloAfter,
    eloDelta,
    bpEarned,
    starPointsEarned,
    managerXpEarned,
    starPassXpEarned,
    playedAt: Date.now(),
    nextProfile,
  };
}
