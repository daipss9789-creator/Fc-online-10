import type { MatchHighlightEvent } from './rules';
import type { LineGroup } from './tacticsAndTeamColor';
import type { FormationCode, PlayerStats } from './types';

export type GlxhTacticalPosture = 'defend' | 'balanced' | 'attack';
export type GlxhOnlineMatchKind = 'ranked' | 'room' | 'challenge' | 'snapshot';

export interface GlxhOnlinePlayerSnapshot {
  slotIndex: number;
  roleLabel: string;
  lineGroup: LineGroup;
  jerseyNumber: number;
  shortName: string;
  seasonLabel: string;
  isNaturalFit: boolean;
  ovr: number;
  stats: PlayerStats;
}

export interface GlxhOnlineTeamSnapshot {
  clientId: string;
  managerId: string;
  managerName: string;
  elo: number;
  formation: FormationCode;
  teamOvr: number;
  coachId: string;
  coachName: string;
  coachBonusOvr: number;
  deviceLabel?: string;
  players: GlxhOnlinePlayerSnapshot[];
}

export interface GlxhOnlineManagerPresence {
  clientId: string;
  managerId: string;
  managerName: string;
  elo: number;
  teamOvr: number;
  formation: FormationCode;
  coachName: string;
  deviceLabel: string;
  status: 'idle' | 'queue' | 'room' | 'in_match';
  inQueueSince?: number;
  roomCode?: string;
  matchId?: string;
  lastSeenMs: number;
}

export interface GlxhChallengeInvite {
  inviteId: string;
  fromClientId: string;
  fromManagerName: string;
  fromElo: number;
  fromTeamOvr: number;
  fromFormation: FormationCode;
  toClientId: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface GlxhRoomInfo {
  roomCode: string;
  hostClientId: string;
  hostName: string;
  hostOvr: number;
  hostElo: number;
  hostFormation: FormationCode;
  guestClientId?: string;
  guestName?: string;
  status: 'waiting' | 'active' | 'finished';
  matchId?: string;
  createdAtMs: number;
}

export interface GlxhLiveEmote {
  id: string;
  senderClientId: string;
  senderName: string;
  side: 'home' | 'away';
  text: string;
  createdAtMs: number;
}

export interface GlxhWireCirclePlayer {
  id: string;
  side: 'home' | 'away';
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
  stamina: number;
  touchCount: number;
  passesCompleted: number;
  shotsTaken: number;
  goalsScored: number;
  tacklesWon: number;
  savesMade: number;
}

export interface GlxhLiveMatchWireState {
  matchId: string;
  matchKind: GlxhOnlineMatchKind;
  seq: number;
  serverTimeMs: number;
  homeClientId: string;
  awayClientId: string;
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
  simElapsedSec: number;
  minute: number;
  finished: boolean;
  forfeitBySide?: 'home' | 'away';
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
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    carrierId: string | null;
    lastTouchSide: 'home' | 'away';
    flightTargetPlayerId: string | null;
  };
  trails: Array<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    side: 'home' | 'away';
    kind: 'pass' | 'through' | 'shot';
    ttl: number;
  }>;
  highlights: MatchHighlightEvent[];
  goalBannerSec: number;
  goalBannerText: string | null;
  lastActionText: string;
  players: GlxhWireCirclePlayer[];
  emotes: GlxhLiveEmote[];
}

export interface GlxhClubSnapshotDirectoryEntry {
  ownerId: string;
  managerName: string;
  elo: number;
  squadOvr: number;
  formation: FormationCode;
  coachName: string;
  deviceLabel: string;
  isOnlineNow: boolean;
  clientId?: string;
}

export interface GlxhLobbyStatusPayload {
  onlineCount: number;
  queueCount: number;
  inQueue: boolean;
  onlineManagers: GlxhOnlineManagerPresence[];
  hubClubs: GlxhClubSnapshotDirectoryEntry[];
  pendingInvites: GlxhChallengeInvite[];
  activeRoom: GlxhRoomInfo | null;
  activeMatch: GlxhLiveMatchWireState | null;
}

export type GlxhWsClientMessage =
  | {
      type: 'register';
      clientId: string;
      team: GlxhOnlineTeamSnapshot;
    }
  | {
      type: 'heartbeat';
      clientId: string;
      team?: GlxhOnlineTeamSnapshot;
    }
  | {
      type: 'subscribe_match';
      clientId: string;
      matchId: string;
    }
  | {
      type: 'set_tactic';
      clientId: string;
      matchId: string;
      tactic: GlxhTacticalPosture;
    }
  | {
      type: 'send_emote';
      clientId: string;
      matchId: string;
      text: string;
    };

export type GlxhWsServerMessage =
  | {
      type: 'lobby_update';
      onlineCount: number;
      queueCount: number;
      onlineManagers: GlxhOnlineManagerPresence[];
      pendingInvites: GlxhChallengeInvite[];
    }
  | {
      type: 'challenge_invite';
      invite: GlxhChallengeInvite;
    }
  | {
      type: 'challenge_declined';
      inviteId: string;
      byManagerName: string;
    }
  | {
      type: 'match_started';
      match: GlxhLiveMatchWireState;
    }
  | {
      type: 'match_frame';
      match: GlxhLiveMatchWireState;
    }
  | {
      type: 'match_finished';
      match: GlxhLiveMatchWireState;
    };
