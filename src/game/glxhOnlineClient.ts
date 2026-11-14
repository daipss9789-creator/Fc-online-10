import type {
  GlxhChallengeInvite,
  GlxhLiveMatchWireState,
  GlxhLobbyStatusPayload,
  GlxhOnlineTeamSnapshot,
  GlxhRoomInfo,
  GlxhTacticalPosture,
  GlxhWsClientMessage,
  GlxhWsServerMessage,
} from './glxhOnlineTypes';

const CLIENT_ID_STORAGE_KEY = 'fco_glxh_online_tab_client_id_v1';

export function getOrCreateGlxhClientId(): string {
  if (typeof window === 'undefined') return 'ssr_client';
  try {
    const existing = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing && existing.length >= 6) return existing;
    const created = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

type ServerMessageHandler = (msg: GlxhWsServerMessage) => void;

class GlxhOnlineClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private latestTeam: GlxhOnlineTeamSnapshot | null = null;
  private listeners = new Set<ServerMessageHandler>();
  private connListeners = new Set<(connected: boolean) => void>();
  private isConnected = false;
  private reconnectDelayMs = 800;

  getClientId(): string {
    return getOrCreateGlxhClientId();
  }

  getConnected(): boolean {
    return this.isConnected;
  }

  subscribeMessages(handler: ServerMessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  subscribeConnection(handler: (connected: boolean) => void): () => void {
    this.connListeners.add(handler);
    handler(this.isConnected);
    return () => {
      this.connListeners.delete(handler);
    };
  }

  private setConnected(val: boolean): void {
    if (this.isConnected === val) return;
    this.isConnected = val;
    for (const cb of this.connListeners) {
      cb(val);
    }
  }

  ensureConnected(team: GlxhOnlineTeamSnapshot): void {
    if (typeof window === 'undefined') return;
    this.latestTeam = { ...team, clientId: this.getClientId() };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWs({
        type: 'register',
        clientId: this.getClientId(),
        team: this.latestTeam,
      });
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.openSocket();
  }

  private openSocket(): void {
    if (typeof window === 'undefined') return;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/glxh`;

    try {
      const sock = new WebSocket(wsUrl);
      this.ws = sock;

      sock.onopen = () => {
        if (this.ws !== sock) return;
        this.reconnectDelayMs = 800;
        this.setConnected(true);
        if (this.latestTeam) {
          this.sendWs({
            type: 'register',
            clientId: this.getClientId(),
            team: this.latestTeam,
          });
        }
        if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = window.setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendWs({
              type: 'heartbeat',
              clientId: this.getClientId(),
              team: this.latestTeam ?? undefined,
            });
          }
        }, 12_000);
      };

      sock.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as GlxhWsServerMessage;
          if (!parsed || typeof parsed.type !== 'string') return;
          for (const cb of this.listeners) {
            cb(parsed);
          }
        } catch {
          // Ignore invalid JSON frames
        }
      };

      sock.onerror = () => {
        // Handled cleanly onclose
      };

      sock.onclose = () => {
        if (this.ws === sock) {
          this.ws = null;
        }
        if (this.heartbeatTimer !== null) {
          window.clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        this.setConnected(false);
        if (this.latestTeam && this.reconnectTimer === null) {
          const delay = this.reconnectDelayMs;
          this.reconnectDelayMs = Math.min(6000, Math.round(this.reconnectDelayMs * 1.4));
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            if (this.latestTeam) this.openSocket();
          }, delay);
        }
      };
    } catch {
      this.setConnected(false);
    }
  }

  sendWs(msg: GlxhWsClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  subscribeMatchWs(matchId: string): void {
    this.sendWs({
      type: 'subscribe_match',
      clientId: this.getClientId(),
      matchId,
    });
  }

  async syncPresence(team: GlxhOnlineTeamSnapshot): Promise<GlxhLobbyStatusPayload | null> {
    const clientId = this.getClientId();
    this.ensureConnected(team);
    try {
      const resp = await fetch('/api/glxh/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId, team: { ...team, clientId } }),
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      if (!json.ok) return null;
      return json as GlxhLobbyStatusPayload;
    } catch {
      return null;
    }
  }

  async fetchLobbyStatus(): Promise<GlxhLobbyStatusPayload | null> {
    const clientId = encodeURIComponent(this.getClientId());
    try {
      const resp = await fetch(`/api/glxh/lobby?clientId=${clientId}`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      if (!json.ok) return null;
      return json as GlxhLobbyStatusPayload;
    } catch {
      return null;
    }
  }

  async joinQueue(team: GlxhOnlineTeamSnapshot): Promise<{
    ok: boolean;
    status?: 'queued' | 'matched';
    match?: GlxhLiveMatchWireState;
    queueCount?: number;
    error?: string;
  }> {
    const clientId = this.getClientId();
    this.ensureConnected(team);
    try {
      const resp = await fetch('/api/glxh/queue/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId, team: { ...team, clientId } }),
      });
      return await resp.json();
    } catch {
      return { ok: false, error: 'Không thể kết nối máy chủ ghép trận.' };
    }
  }

  async leaveQueue(): Promise<void> {
    const clientId = this.getClientId();
    try {
      await fetch('/api/glxh/queue/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId }),
      });
    } catch {
      // Best effort
    }
  }

  async createRoom(team: GlxhOnlineTeamSnapshot): Promise<{
    ok: boolean;
    room?: GlxhRoomInfo;
    error?: string;
  }> {
    const clientId = this.getClientId();
    this.ensureConnected(team);
    try {
      const resp = await fetch('/api/glxh/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId, team: { ...team, clientId } }),
      });
      return await resp.json();
    } catch {
      return { ok: false, error: 'Không thể tạo phòng đấu lúc này.' };
    }
  }

  async joinRoom(
    roomCode: string,
    team: GlxhOnlineTeamSnapshot
  ): Promise<{
    ok: boolean;
    room?: GlxhRoomInfo;
    match?: GlxhLiveMatchWireState;
    error?: string;
  }> {
    const clientId = this.getClientId();
    this.ensureConnected(team);
    try {
      const resp = await fetch('/api/glxh/room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId, roomCode: roomCode.trim(), team: { ...team, clientId } }),
      });
      return await resp.json();
    } catch {
      return { ok: false, error: 'Không thể vào phòng đấu lúc này.' };
    }
  }

  async sendChallenge(
    targetClientId: string,
    team: GlxhOnlineTeamSnapshot
  ): Promise<{ ok: boolean; invite?: GlxhChallengeInvite; error?: string }> {
    const clientId = this.getClientId();
    this.ensureConnected(team);
    try {
      const resp = await fetch('/api/glxh/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId, targetClientId, team: { ...team, clientId } }),
      });
      return await resp.json();
    } catch {
      return { ok: false, error: 'Không thể gửi lời mời thách đấu.' };
    }
  }

  async respondChallenge(
    inviteId: string,
    accept: boolean,
    team: GlxhOnlineTeamSnapshot
  ): Promise<{ ok: boolean; accepted?: boolean; match?: GlxhLiveMatchWireState; error?: string }> {
    const clientId = this.getClientId();
    this.ensureConnected(team);
    try {
      const resp = await fetch('/api/glxh/challenge/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId, inviteId, accept, team: { ...team, clientId } }),
      });
      return await resp.json();
    } catch {
      return { ok: false, error: 'Không thể phản hồi lời mời.' };
    }
  }

  async challengeHubClubSnapshot(
    targetOwnerId: string,
    team: GlxhOnlineTeamSnapshot
  ): Promise<{ ok: boolean; match?: GlxhLiveMatchWireState; error?: string }> {
    const clientId = this.getClientId();
    this.ensureConnected(team);
    try {
      const resp = await fetch('/api/glxh/challenge/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId, targetOwnerId, team: { ...team, clientId } }),
      });
      return await resp.json();
    } catch {
      return { ok: false, error: 'Không thể thách đấu đội hình CLB này.' };
    }
  }

  async fetchMatchFrame(matchId: string): Promise<GlxhLiveMatchWireState | null> {
    try {
      const resp = await fetch(`/api/glxh/match/${encodeURIComponent(matchId)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      return json.ok && json.match ? (json.match as GlxhLiveMatchWireState) : null;
    } catch {
      return null;
    }
  }

  async setMatchTactic(matchId: string, tactic: GlxhTacticalPosture): Promise<void> {
    const clientId = this.getClientId();
    const sentViaWs = this.sendWs({
      type: 'set_tactic',
      clientId,
      matchId,
      tactic,
    });
    if (!sentViaWs) {
      await fetch(`/api/glxh/match/${encodeURIComponent(matchId)}/tactic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId, tactic }),
      }).catch(() => {});
    }
  }

  async sendMatchEmote(matchId: string, text: string): Promise<void> {
    const clientId = this.getClientId();
    const sentViaWs = this.sendWs({
      type: 'send_emote',
      clientId,
      matchId,
      text,
    });
    if (!sentViaWs) {
      await fetch(`/api/glxh/match/${encodeURIComponent(matchId)}/emote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId, text }),
      }).catch(() => {});
    }
  }

  async forfeitMatch(matchId: string): Promise<GlxhLiveMatchWireState | null> {
    const clientId = this.getClientId();
    try {
      const resp = await fetch(`/api/glxh/match/${encodeURIComponent(matchId)}/forfeit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ clientId }),
      });
      const json = await resp.json();
      return json.ok && json.match ? (json.match as GlxhLiveMatchWireState) : null;
    } catch {
      return null;
    }
  }
}

export const glxhOnlineClient = new GlxhOnlineClient();
