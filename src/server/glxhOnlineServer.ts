import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  GlxhMatchState,
  createGlxhMatchState,
  extractGlxhTeamSnapshotFromRawProfile,
  sanitizeGlxhOnlineTeamSnapshot,
  serializeGlxhLiveFrame,
  stepGlxhSimulation,
} from '../game/glxhMatchEngine';
import type {
  GlxhChallengeInvite,
  GlxhClubSnapshotDirectoryEntry,
  GlxhLiveEmote,
  GlxhLiveMatchWireState,
  GlxhOnlineManagerPresence,
  GlxhOnlineMatchKind,
  GlxhOnlineTeamSnapshot,
  GlxhRoomInfo,
  GlxhTacticalPosture,
  GlxhWsClientMessage,
  GlxhWsServerMessage,
} from '../game/glxhOnlineTypes';
import { createStarterProfile } from '../game/rules';
import { FORMATION_CATALOG } from '../game/tacticsAndTeamColor';
import type { FormationCode } from '../game/types';

export interface HubAccountSnapshotSource {
  summaryKey: string;
  ownerId: string;
  isBanned: boolean;
  deviceLabel?: string;
  updatedAtMs: number;
  leaderboardRow: Record<string, unknown>;
  profile: Record<string, unknown>;
}

interface ConnectedClientEntry {
  presence: GlxhOnlineManagerPresence;
  team: GlxhOnlineTeamSnapshot;
  sockets: Set<WebSocket>;
}

interface InternalRoom {
  roomCode: string;
  hostClientId: string;
  hostTeam: GlxhOnlineTeamSnapshot;
  guestClientId?: string;
  guestTeam?: GlxhOnlineTeamSnapshot;
  status: 'waiting' | 'active' | 'finished';
  matchId?: string;
  createdAtMs: number;
}

interface ServerLiveMatch {
  matchId: string;
  matchKind: GlxhOnlineMatchKind;
  homeClientId: string;
  awayClientId: string;
  state: GlxhMatchState;
  seq: number;
  emotes: GlxhLiveEmote[];
  tickCount: number;
  createdAtMs: number;
  finishedAtMs?: number;
  intervalHandle: NodeJS.Timeout | null;
}

const VALID_TACTICS = new Set<GlxhTacticalPosture>(['defend', 'balanced', 'attack']);
const ONLINE_SIM_RATE = 2.8; // 135 sim-sec / 2.8 ~= 48 seconds for a full 90' online match
const SIM_TICK_MS = 50;

function safeStr(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, maxLen);
}

function generateRoomCode(existing: Map<string, InternalRoom>): string {
  for (let i = 0; i < 20; i++) {
    const code = String(100000 + crypto.randomInt(0, 900000));
    if (!existing.has(code)) return code;
  }
  return `FCO${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export function attachGlxhOnlineServer(params: {
  app: Express;
  httpServer: http.Server;
  getHubAccounts: () => Record<string, HubAccountSnapshotSource>;
}): void {
  const { app, httpServer, getHubAccounts } = params;

  const clients = new Map<string, ConnectedClientEntry>();
  const matchmakingQueue: Array<{ clientId: string; enqueuedAtMs: number }> = [];
  const rooms = new Map<string, InternalRoom>();
  const invites = new Map<string, GlxhChallengeInvite>();
  const matches = new Map<string, ServerLiveMatch>();
  const dummyProfile = createStarterProfile('glxh_server', 'HLV Máy Chủ', 'local');

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const parsed = new URL(req.url || '/', 'http://localhost');
      if (parsed.pathname !== '/ws/glxh') {
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch {
      // Ignore malformed upgrade URLs
    }
  });

  function sendToClient(clientId: string, msg: GlxhWsServerMessage): void {
    const entry = clients.get(clientId);
    if (!entry || entry.sockets.size === 0) return;
    const payload = JSON.stringify(msg);
    for (const sock of entry.sockets) {
      if (sock.readyState === WebSocket.OPEN) {
        try {
          sock.send(payload);
        } catch {
          // Ignore broken socket write
        }
      }
    }
  }

  function listOnlinePresences(excludeClientId?: string): GlxhOnlineManagerPresence[] {
    const list: GlxhOnlineManagerPresence[] = [];
    for (const c of clients.values()) {
      if (excludeClientId && c.presence.clientId === excludeClientId) continue;
      list.push(c.presence);
    }
    return list.sort((a, b) => b.lastSeenMs - a.lastSeenMs).slice(0, 60);
  }

  function listPendingInvitesFor(clientId: string): GlxhChallengeInvite[] {
    const now = Date.now();
    const res: GlxhChallengeInvite[] = [];
    for (const inv of invites.values()) {
      if (inv.toClientId === clientId && inv.expiresAtMs > now) {
        res.push(inv);
      }
    }
    return res.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  function broadcastLobbyUpdate(): void {
    for (const client of clients.values()) {
      sendToClient(client.presence.clientId, {
        type: 'lobby_update',
        onlineCount: clients.size,
        queueCount: matchmakingQueue.length,
        onlineManagers: listOnlinePresences(client.presence.clientId),
        pendingInvites: listPendingInvitesFor(client.presence.clientId),
      });
    }
  }

  function buildWireFrame(m: ServerLiveMatch): GlxhLiveMatchWireState {
    return serializeGlxhLiveFrame({
      state: m.state,
      matchKind: m.matchKind,
      seq: m.seq,
      homeClientId: m.homeClientId,
      awayClientId: m.awayClientId,
      emotes: m.emotes,
    });
  }

  function startServerLiveMatch(opts: {
    matchKind: GlxhOnlineMatchKind;
    homeClientId: string;
    homeTeam: GlxhOnlineTeamSnapshot;
    awayClientId: string;
    awayTeam: GlxhOnlineTeamSnapshot;
  }): ServerLiveMatch {
    const matchId = `glxh_pvp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const seed = crypto.randomInt(10000, 99999999);
    const state = createGlxhMatchState({
      profile: dummyProfile,
      currentElo: opts.homeTeam.elo,
      seed,
      matchId,
      homeTeamSnapshot: opts.homeTeam,
      awayTeamSnapshot: opts.awayTeam,
    });

    const live: ServerLiveMatch = {
      matchId,
      matchKind: opts.matchKind,
      homeClientId: opts.homeClientId,
      awayClientId: opts.awayClientId,
      state,
      seq: 1,
      emotes: [],
      tickCount: 0,
      createdAtMs: Date.now(),
      intervalHandle: null,
    };

    // Remove both players from queue if present
    for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
      if (
        matchmakingQueue[i].clientId === opts.homeClientId ||
        matchmakingQueue[i].clientId === opts.awayClientId
      ) {
        matchmakingQueue.splice(i, 1);
      }
    }

    const homeClient = clients.get(opts.homeClientId);
    if (homeClient) {
      homeClient.presence.status = 'in_match';
      homeClient.presence.matchId = matchId;
      homeClient.presence.lastSeenMs = Date.now();
    }
    const awayClient = clients.get(opts.awayClientId);
    if (awayClient) {
      awayClient.presence.status = 'in_match';
      awayClient.presence.matchId = matchId;
      awayClient.presence.lastSeenMs = Date.now();
    }

    matches.set(matchId, live);

    const initialFrame = buildWireFrame(live);
    sendToClient(opts.homeClientId, { type: 'match_started', match: initialFrame });
    if (!opts.awayClientId.startsWith('snapshot_')) {
      sendToClient(opts.awayClientId, { type: 'match_started', match: initialFrame });
    }

    live.intervalHandle = setInterval(() => {
      if (live.state.finished) {
        if (live.intervalHandle) {
          clearInterval(live.intervalHandle);
          live.intervalHandle = null;
        }
        return;
      }

      const prevGoals = live.state.homeGoals + live.state.awayGoals;
      const totalDt = (SIM_TICK_MS / 1000) * ONLINE_SIM_RATE;
      stepGlxhSimulation(live.state, totalDt * 0.5);
      stepGlxhSimulation(live.state, totalDt * 0.5);
      live.tickCount += 1;

      const curGoals = live.state.homeGoals + live.state.awayGoals;
      const scored = curGoals > prevGoals;

      if (live.state.finished) {
        live.finishedAtMs = Date.now();
        live.seq += 1;
        const finalFrame = buildWireFrame(live);
        sendToClient(live.homeClientId, { type: 'match_finished', match: finalFrame });
        if (!live.awayClientId.startsWith('snapshot_')) {
          sendToClient(live.awayClientId, { type: 'match_finished', match: finalFrame });
        }
        const hc = clients.get(live.homeClientId);
        if (hc && hc.presence.matchId === live.matchId) {
          hc.presence.status = 'idle';
          hc.presence.matchId = undefined;
        }
        const ac = clients.get(live.awayClientId);
        if (ac && ac.presence.matchId === live.matchId) {
          ac.presence.status = 'idle';
          ac.presence.matchId = undefined;
        }
        if (live.intervalHandle) {
          clearInterval(live.intervalHandle);
          live.intervalHandle = null;
        }
        broadcastLobbyUpdate();
        return;
      }

      // Broadcast at ~12.5 Hz or immediately when a goal occurs
      if (scored || live.tickCount % 2 === 0) {
        live.seq += 1;
        const frame = buildWireFrame(live);
        sendToClient(live.homeClientId, { type: 'match_frame', match: frame });
        if (!live.awayClientId.startsWith('snapshot_')) {
          sendToClient(live.awayClientId, { type: 'match_frame', match: frame });
        }
      }
    }, SIM_TICK_MS);

    broadcastLobbyUpdate();
    return live;
  }

  function upsertClient(team: GlxhOnlineTeamSnapshot, ws?: WebSocket): ConnectedClientEntry {
    const now = Date.now();
    const existing = clients.get(team.clientId);
    if (existing) {
      existing.team = team;
      existing.presence.managerId = team.managerId;
      existing.presence.managerName = team.managerName;
      existing.presence.elo = team.elo;
      existing.presence.teamOvr = team.teamOvr;
      existing.presence.formation = team.formation;
      existing.presence.coachName = team.coachName;
      existing.presence.deviceLabel = team.deviceLabel || existing.presence.deviceLabel || 'Web';
      existing.presence.lastSeenMs = now;
      if (ws) existing.sockets.add(ws);
      return existing;
    }

    const entry: ConnectedClientEntry = {
      presence: {
        clientId: team.clientId,
        managerId: team.managerId,
        managerName: team.managerName,
        elo: team.elo,
        teamOvr: team.teamOvr,
        formation: team.formation,
        coachName: team.coachName,
        deviceLabel: team.deviceLabel || 'Web',
        status: 'idle',
        lastSeenMs: now,
      },
      team,
      sockets: ws ? new Set([ws]) : new Set(),
    };
    clients.set(team.clientId, entry);
    return entry;
  }

  function applyTacticChange(
    matchId: string,
    clientId: string,
    tactic: GlxhTacticalPosture
  ): GlxhLiveMatchWireState | null {
    const live = matches.get(matchId);
    if (!live || live.state.finished || !VALID_TACTICS.has(tactic)) return null;
    if (live.homeClientId === clientId) {
      live.state.homeTactic = tactic;
      live.state.lastActionText = `${live.state.homeName} điều chỉnh chiến thuật: ${
        tactic === 'attack' ? 'Tấn Công Tổng Lực' : tactic === 'defend' ? 'Phòng Ngự Phản Công' : 'Cân Bằng'
      }!`;
    } else if (live.awayClientId === clientId) {
      live.state.awayTactic = tactic;
      live.state.lastActionText = `${live.state.awayName} điều chỉnh chiến thuật: ${
        tactic === 'attack' ? 'Tấn Công Tổng Lực' : tactic === 'defend' ? 'Phòng Ngự Phản Công' : 'Cân Bằng'
      }!`;
    } else {
      return null;
    }
    live.seq += 1;
    const frame = buildWireFrame(live);
    sendToClient(live.homeClientId, { type: 'match_frame', match: frame });
    if (!live.awayClientId.startsWith('snapshot_')) {
      sendToClient(live.awayClientId, { type: 'match_frame', match: frame });
    }
    return frame;
  }

  function appendMatchEmote(
    matchId: string,
    clientId: string,
    rawText: string
  ): GlxhLiveMatchWireState | null {
    const live = matches.get(matchId);
    if (!live) return null;
    const text = safeStr(rawText, 48);
    if (!text) return null;
    let side: 'home' | 'away' | null = null;
    let senderName = '';
    if (live.homeClientId === clientId) {
      side = 'home';
      senderName = live.state.homeName;
    } else if (live.awayClientId === clientId) {
      side = 'away';
      senderName = live.state.awayName;
    }
    if (!side) return null;

    live.emotes = [
      ...live.emotes.slice(-6),
      {
        id: `em_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        senderClientId: clientId,
        senderName,
        side,
        text,
        createdAtMs: Date.now(),
      },
    ];
    live.seq += 1;
    const frame = buildWireFrame(live);
    sendToClient(live.homeClientId, { type: 'match_frame', match: frame });
    if (!live.awayClientId.startsWith('snapshot_')) {
      sendToClient(live.awayClientId, { type: 'match_frame', match: frame });
    }
    return frame;
  }

  function buildHubClubsDirectory(): GlxhClubSnapshotDirectoryEntry[] {
    const accounts = getHubAccounts();
    const onlineByManagerId = new Map<string, GlxhOnlineManagerPresence>();
    for (const c of clients.values()) {
      onlineByManagerId.set(c.presence.managerId, c.presence);
    }

    return Object.values(accounts)
      .filter((acc) => !acc.isBanned && acc.profile && Array.isArray(acc.profile.cards))
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      .slice(0, 30)
      .map((acc) => {
        const rawForm =
          typeof acc.profile.formation === 'string' &&
          FORMATION_CATALOG[acc.profile.formation as FormationCode]
            ? (acc.profile.formation as FormationCode)
            : '4-3-3';
        const onlineMatch = onlineByManagerId.get(acc.ownerId);
        return {
          ownerId: acc.ownerId,
          managerName:
            safeStr(acc.profile.managerName, 32) ||
            safeStr(acc.leaderboardRow?.managerName, 32) ||
            'HLV FC Online',
          elo: Number(acc.profile.elo ?? acc.leaderboardRow?.elo ?? 2050),
          squadOvr: Number(acc.profile.squadOvr ?? acc.leaderboardRow?.squadOvr ?? 130),
          formation: rawForm,
          coachName: 'Carlo Ancelotti',
          deviceLabel: acc.deviceLabel || 'Server Hub',
          isOnlineNow: Boolean(onlineMatch),
          clientId: onlineMatch?.clientId,
        };
      });
  }

  // Periodic garbage collection for stale idle clients, expired invites, finished matches
  setInterval(() => {
    const now = Date.now();
    let changed = false;

    for (const [cid, entry] of clients.entries()) {
      const hasOpenSocket = Array.from(entry.sockets).some((s) => s.readyState === WebSocket.OPEN);
      if (!hasOpenSocket && now - entry.presence.lastSeenMs > 30_000) {
        clients.delete(cid);
        for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
          if (matchmakingQueue[i].clientId === cid) matchmakingQueue.splice(i, 1);
        }
        changed = true;
      }
    }

    for (const [invId, inv] of invites.entries()) {
      if (inv.expiresAtMs <= now) {
        invites.delete(invId);
        changed = true;
      }
    }

    for (const [code, rm] of rooms.entries()) {
      if (rm.status === 'waiting' && now - rm.createdAtMs > 10 * 60_000) {
        rooms.delete(code);
      } else if (rm.status !== 'waiting' && now - rm.createdAtMs > 20 * 60_000) {
        rooms.delete(code);
      }
    }

    for (const [mid, m] of matches.entries()) {
      if (m.finishedAtMs && now - m.finishedAtMs > 5 * 60_000) {
        if (m.intervalHandle) clearInterval(m.intervalHandle);
        matches.delete(mid);
      }
    }

    if (changed) {
      broadcastLobbyUpdate();
    }
  }, 5_000);

  // WebSocket Connection Handler
  wss.on('connection', (ws) => {
    let boundClientId: string | null = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as GlxhWsClientMessage;
        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === 'register' || msg.type === 'heartbeat') {
          const cid = safeStr(msg.clientId, 120);
          if (!cid) return;
          boundClientId = cid;
          if (msg.team) {
            const snap = sanitizeGlxhOnlineTeamSnapshot(msg.team, cid);
            if (snap) {
              upsertClient({ ...snap, clientId: cid }, ws);
            }
          } else {
            const existing = clients.get(cid);
            if (existing) {
              existing.sockets.add(ws);
              existing.presence.lastSeenMs = Date.now();
            }
          }
          if (msg.type === 'register') {
            sendToClient(cid, {
              type: 'lobby_update',
              onlineCount: clients.size,
              queueCount: matchmakingQueue.length,
              onlineManagers: listOnlinePresences(cid),
              pendingInvites: listPendingInvitesFor(cid),
            });
            broadcastLobbyUpdate();
          }
          return;
        }

        if (msg.type === 'subscribe_match') {
          const cid = safeStr(msg.clientId, 120);
          const mid = safeStr(msg.matchId, 120);
          const existing = clients.get(cid);
          if (existing) existing.sockets.add(ws);
          const live = matches.get(mid);
          if (live) {
            const frame = buildWireFrame(live);
            ws.send(
              JSON.stringify({
                type: live.state.finished ? 'match_finished' : 'match_frame',
                match: frame,
              } satisfies GlxhWsServerMessage)
            );
          }
          return;
        }

        if (msg.type === 'set_tactic') {
          const cid = safeStr(msg.clientId, 120);
          const mid = safeStr(msg.matchId, 120);
          applyTacticChange(mid, cid, msg.tactic);
          return;
        }

        if (msg.type === 'send_emote') {
          const cid = safeStr(msg.clientId, 120);
          const mid = safeStr(msg.matchId, 120);
          appendMatchEmote(mid, cid, msg.text);
        }
      } catch {
        // Ignore malformed WS message
      }
    });

    ws.on('close', () => {
      if (boundClientId) {
        const entry = clients.get(boundClientId);
        if (entry) {
          entry.sockets.delete(ws);
        }
      }
    });
  });

  // Disable caching for all GLXH endpoints
  app.use('/api/glxh', (_req: Request, res: Response, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
  });

  app.post('/api/glxh/presence', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    const snap = sanitizeGlxhOnlineTeamSnapshot(body.team, clientId);
    if (!clientId || !snap) {
      res.status(400).json({ ok: false, error: 'Thiếu dữ liệu đội hình HLV.' });
      return;
    }
    const entry = upsertClient({ ...snap, clientId });
    const activeMatch =
      entry.presence.matchId && matches.get(entry.presence.matchId)
        ? buildWireFrame(matches.get(entry.presence.matchId)!)
        : null;
    const activeRoom =
      entry.presence.roomCode && rooms.get(entry.presence.roomCode)
        ? toRoomInfo(rooms.get(entry.presence.roomCode)!)
        : null;

    res.json({
      ok: true,
      onlineCount: clients.size,
      queueCount: matchmakingQueue.length,
      inQueue: matchmakingQueue.some((q) => q.clientId === clientId),
      onlineManagers: listOnlinePresences(clientId),
      hubClubs: buildHubClubsDirectory(),
      pendingInvites: listPendingInvitesFor(clientId),
      activeRoom,
      activeMatch,
    });
  });

  app.get('/api/glxh/lobby', (req: Request, res: Response) => {
    const clientId = safeStr(req.query.clientId, 120);
    const entry = clientId ? clients.get(clientId) : undefined;
    if (entry) {
      entry.presence.lastSeenMs = Date.now();
    }
    const activeMatch =
      entry?.presence.matchId && matches.get(entry.presence.matchId)
        ? buildWireFrame(matches.get(entry.presence.matchId)!)
        : null;
    const activeRoom =
      entry?.presence.roomCode && rooms.get(entry.presence.roomCode)
        ? toRoomInfo(rooms.get(entry.presence.roomCode)!)
        : null;

    res.json({
      ok: true,
      onlineCount: clients.size,
      queueCount: matchmakingQueue.length,
      inQueue: clientId ? matchmakingQueue.some((q) => q.clientId === clientId) : false,
      onlineManagers: listOnlinePresences(clientId || undefined),
      hubClubs: buildHubClubsDirectory(),
      pendingInvites: clientId ? listPendingInvitesFor(clientId) : [],
      activeRoom,
      activeMatch,
    });
  });

  app.post('/api/glxh/queue/join', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    const snap = sanitizeGlxhOnlineTeamSnapshot(body.team, clientId);
    if (!clientId || !snap) {
      res.status(400).json({ ok: false, error: 'Thiếu dữ liệu đội hình để ghép trận Online.' });
      return;
    }

    const entry = upsertClient({ ...snap, clientId });

    // If already in an unfinished match, return it
    if (entry.presence.matchId) {
      const existingMatch = matches.get(entry.presence.matchId);
      if (existingMatch && !existingMatch.state.finished) {
        res.json({
          ok: true,
          status: 'matched',
          match: buildWireFrame(existingMatch),
          queueCount: matchmakingQueue.length,
        });
        return;
      }
    }

    // Look for a waiting opponent in queue (different clientId & active recently)
    let matchedOpponentIdx = -1;
    const now = Date.now();
    for (let i = 0; i < matchmakingQueue.length; i++) {
      const cand = matchmakingQueue[i];
      if (cand.clientId === clientId) continue;
      const candClient = clients.get(cand.clientId);
      if (candClient && now - candClient.presence.lastSeenMs < 25_000) {
        matchedOpponentIdx = i;
        break;
      }
    }

    if (matchedOpponentIdx >= 0) {
      const [oppQueueItem] = matchmakingQueue.splice(matchedOpponentIdx, 1);
      const oppEntry = clients.get(oppQueueItem.clientId)!;
      const live = startServerLiveMatch({
        matchKind: 'ranked',
        homeClientId: oppEntry.presence.clientId,
        homeTeam: oppEntry.team,
        awayClientId: entry.presence.clientId,
        awayTeam: entry.team,
      });
      res.json({
        ok: true,
        status: 'matched',
        match: buildWireFrame(live),
        queueCount: matchmakingQueue.length,
      });
      return;
    }

    if (!matchmakingQueue.some((q) => q.clientId === clientId)) {
      matchmakingQueue.push({ clientId, enqueuedAtMs: now });
    }
    entry.presence.status = 'queue';
    entry.presence.inQueueSince = now;
    broadcastLobbyUpdate();

    res.json({
      ok: true,
      status: 'queued',
      queueCount: matchmakingQueue.length,
      onlineCount: clients.size,
    });
  });

  app.post('/api/glxh/queue/leave', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
      if (matchmakingQueue[i].clientId === clientId) {
        matchmakingQueue.splice(i, 1);
      }
    }
    const entry = clients.get(clientId);
    if (entry && entry.presence.status === 'queue') {
      entry.presence.status = 'idle';
      entry.presence.inQueueSince = undefined;
    }
    broadcastLobbyUpdate();
    res.json({ ok: true, queueCount: matchmakingQueue.length });
  });

  app.post('/api/glxh/room/create', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    const snap = sanitizeGlxhOnlineTeamSnapshot(body.team, clientId);
    if (!clientId || !snap) {
      res.status(400).json({ ok: false, error: 'Thiếu dữ liệu đội hình để tạo phòng.' });
      return;
    }
    const entry = upsertClient({ ...snap, clientId });
    // Close any previous waiting room hosted by this client
    for (const [code, rm] of rooms.entries()) {
      if (rm.hostClientId === clientId && rm.status === 'waiting') {
        rooms.delete(code);
      }
    }
    const roomCode = generateRoomCode(rooms);
    const room: InternalRoom = {
      roomCode,
      hostClientId: clientId,
      hostTeam: entry.team,
      status: 'waiting',
      createdAtMs: Date.now(),
    };
    rooms.set(roomCode, room);
    entry.presence.status = 'room';
    entry.presence.roomCode = roomCode;
    broadcastLobbyUpdate();

    res.json({ ok: true, room: toRoomInfo(room) });
  });

  app.post('/api/glxh/room/join', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    const roomCode = safeStr(body.roomCode, 16).toUpperCase();
    const snap = sanitizeGlxhOnlineTeamSnapshot(body.team, clientId);
    if (!clientId || !roomCode || !snap) {
      res.status(400).json({ ok: false, error: 'Vui lòng nhập mã phòng hợp lệ.' });
      return;
    }
    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, error: `Không tìm thấy phòng đấu mã "${roomCode}".` });
      return;
    }
    if (room.status !== 'waiting') {
      res.status(409).json({ ok: false, error: 'Phòng đấu này đã bắt đầu hoặc kết thúc.' });
      return;
    }
    if (room.hostClientId === clientId) {
      res.status(400).json({ ok: false, error: 'Bạn đang là chủ phòng này. Hãy gửi mã phòng cho bạn bè!' });
      return;
    }

    const guestEntry = upsertClient({ ...snap, clientId });
    const hostEntry = clients.get(room.hostClientId);
    const hostTeam = hostEntry?.team ?? room.hostTeam;

    const live = startServerLiveMatch({
      matchKind: 'room',
      homeClientId: room.hostClientId,
      homeTeam: hostTeam,
      awayClientId: clientId,
      awayTeam: guestEntry.team,
    });

    room.guestClientId = clientId;
    room.guestTeam = guestEntry.team;
    room.status = 'active';
    room.matchId = live.matchId;

    res.json({
      ok: true,
      room: toRoomInfo(room),
      match: buildWireFrame(live),
    });
  });

  app.post('/api/glxh/challenge', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    const targetClientId = safeStr(body.targetClientId, 120);
    const snap = sanitizeGlxhOnlineTeamSnapshot(body.team, clientId);
    if (!clientId || !targetClientId || !snap) {
      res.status(400).json({ ok: false, error: 'Thiếu thông tin thách đấu.' });
      return;
    }
    if (clientId === targetClientId) {
      res.status(400).json({ ok: false, error: 'Không thể tự thách đấu chính mình.' });
      return;
    }
    const target = clients.get(targetClientId);
    if (!target) {
      res.status(404).json({ ok: false, error: 'HLV đối thủ hiện không còn trực tuyến.' });
      return;
    }
    const fromEntry = upsertClient({ ...snap, clientId });
    const invite: GlxhChallengeInvite = {
      inviteId: `inv_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      fromClientId: clientId,
      fromManagerName: fromEntry.team.managerName,
      fromElo: fromEntry.team.elo,
      fromTeamOvr: fromEntry.team.teamOvr,
      fromFormation: fromEntry.team.formation,
      toClientId: targetClientId,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 45_000,
    };
    invites.set(invite.inviteId, invite);
    sendToClient(targetClientId, { type: 'challenge_invite', invite });
    broadcastLobbyUpdate();
    res.json({ ok: true, invite });
  });

  app.post('/api/glxh/challenge/respond', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    const inviteId = safeStr(body.inviteId, 120);
    const accept = Boolean(body.accept);
    const invite = invites.get(inviteId);
    if (!invite || invite.toClientId !== clientId) {
      res.status(404).json({ ok: false, error: 'Lời mời thách đấu đã hết hạn.' });
      return;
    }
    invites.delete(inviteId);

    const challenger = clients.get(invite.fromClientId);
    if (!accept) {
      const target = clients.get(clientId);
      sendToClient(invite.fromClientId, {
        type: 'challenge_declined',
        inviteId,
        byManagerName: target?.team.managerName ?? 'HLV Đối Thủ',
      });
      broadcastLobbyUpdate();
      res.json({ ok: true, accepted: false });
      return;
    }

    const snap = body.team ? sanitizeGlxhOnlineTeamSnapshot(body.team, clientId) : null;
    const target = snap ? upsertClient({ ...snap, clientId }) : clients.get(clientId);
    if (!challenger || !target) {
      res.status(404).json({ ok: false, error: 'Một trong hai HLV đã rời sảnh.' });
      return;
    }

    const live = startServerLiveMatch({
      matchKind: 'challenge',
      homeClientId: challenger.presence.clientId,
      homeTeam: challenger.team,
      awayClientId: target.presence.clientId,
      awayTeam: target.team,
    });

    res.json({
      ok: true,
      accepted: true,
      match: buildWireFrame(live),
    });
  });

  app.post('/api/glxh/challenge/snapshot', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    const targetOwnerId = safeStr(body.targetOwnerId, 128);
    const snap = sanitizeGlxhOnlineTeamSnapshot(body.team, clientId);
    if (!clientId || !targetOwnerId || !snap) {
      res.status(400).json({ ok: false, error: 'Thiếu thông tin đội hình.' });
      return;
    }
    const hubAcc = Object.values(getHubAccounts()).find((a) => a.ownerId === targetOwnerId);
    if (!hubAcc || !hubAcc.profile) {
      res.status(404).json({ ok: false, error: 'Không tìm thấy đội hình CLB này trên máy chủ.' });
      return;
    }
    const homeEntry = upsertClient({ ...snap, clientId });
    const awayTeam = extractGlxhTeamSnapshotFromRawProfile(hubAcc.profile, targetOwnerId);
    const live = startServerLiveMatch({
      matchKind: 'snapshot',
      homeClientId: clientId,
      homeTeam: homeEntry.team,
      awayClientId: `snapshot_${targetOwnerId}`,
      awayTeam,
    });
    res.json({ ok: true, match: buildWireFrame(live) });
  });

  app.get('/api/glxh/match/:matchId', (req: Request, res: Response) => {
    const matchId = safeStr(req.params.matchId, 120);
    const live = matches.get(matchId);
    if (!live) {
      res.status(404).json({ ok: false, error: 'Không tìm thấy phòng trận đấu.' });
      return;
    }
    res.json({ ok: true, match: buildWireFrame(live) });
  });

  app.post('/api/glxh/match/:matchId/tactic', (req: Request, res: Response) => {
    const matchId = safeStr(req.params.matchId, 120);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    const tactic = body.tactic as GlxhTacticalPosture;
    const frame = applyTacticChange(matchId, clientId, tactic);
    if (!frame) {
      res.status(400).json({ ok: false, error: 'Không thể cập nhật chiến thuật.' });
      return;
    }
    res.json({ ok: true, match: frame });
  });

  app.post('/api/glxh/match/:matchId/emote', (req: Request, res: Response) => {
    const matchId = safeStr(req.params.matchId, 120);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    const text = safeStr(body.text, 48);
    const frame = appendMatchEmote(matchId, clientId, text);
    if (!frame) {
      res.status(400).json({ ok: false, error: 'Không thể gửi tương tác.' });
      return;
    }
    res.json({ ok: true, match: frame });
  });

  app.post('/api/glxh/match/:matchId/forfeit', (req: Request, res: Response) => {
    const matchId = safeStr(req.params.matchId, 120);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = safeStr(body.clientId, 120);
    const live = matches.get(matchId);
    if (!live || live.state.finished) {
      res.status(404).json({ ok: false, error: 'Trận đấu đã kết thúc.' });
      return;
    }

    let forfeitSide: 'home' | 'away' | null = null;
    if (live.homeClientId === clientId) forfeitSide = 'home';
    else if (live.awayClientId === clientId) forfeitSide = 'away';
    if (!forfeitSide) {
      res.status(403).json({ ok: false, error: 'Bạn không thuộc trận đấu này.' });
      return;
    }

    live.state.finished = true;
    live.state.minute = 90;
    live.state.forfeitBySide = forfeitSide;
    if (forfeitSide === 'home') {
      live.state.awayGoals = Math.max(live.state.awayGoals, live.state.homeGoals + 3);
      live.state.lastActionText = `${live.state.homeName} đã rời trận — ${live.state.awayName} xử thắng kỹ thuật!`;
    } else {
      live.state.homeGoals = Math.max(live.state.homeGoals, live.state.awayGoals + 3);
      live.state.lastActionText = `${live.state.awayName} đã rời trận — ${live.state.homeName} xử thắng kỹ thuật!`;
    }
    live.finishedAtMs = Date.now();
    live.seq += 1;
    if (live.intervalHandle) {
      clearInterval(live.intervalHandle);
      live.intervalHandle = null;
    }

    const finalFrame = buildWireFrame(live);
    sendToClient(live.homeClientId, { type: 'match_finished', match: finalFrame });
    if (!live.awayClientId.startsWith('snapshot_')) {
      sendToClient(live.awayClientId, { type: 'match_finished', match: finalFrame });
    }

    const hc = clients.get(live.homeClientId);
    if (hc && hc.presence.matchId === live.matchId) {
      hc.presence.status = 'idle';
      hc.presence.matchId = undefined;
    }
    const ac = clients.get(live.awayClientId);
    if (ac && ac.presence.matchId === live.matchId) {
      ac.presence.status = 'idle';
      ac.presence.matchId = undefined;
    }

    broadcastLobbyUpdate();
    res.json({ ok: true, match: finalFrame });
  });
}

function toRoomInfo(r: InternalRoom): GlxhRoomInfo {
  return {
    roomCode: r.roomCode,
    hostClientId: r.hostClientId,
    hostName: r.hostTeam.managerName,
    hostOvr: r.hostTeam.teamOvr,
    hostElo: r.hostTeam.elo,
    hostFormation: r.hostTeam.formation,
    guestClientId: r.guestClientId,
    guestName: r.guestTeam?.managerName,
    status: r.status,
    matchId: r.matchId,
    createdAtMs: r.createdAtMs,
  };
}
