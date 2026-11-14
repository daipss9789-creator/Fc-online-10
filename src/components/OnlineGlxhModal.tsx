import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { extractGlxhTeamSnapshot } from '../game/glxhMatchEngine';
import { glxhOnlineClient } from '../game/glxhOnlineClient';
import type {
  GlxhChallengeInvite,
  GlxhClubSnapshotDirectoryEntry,
  GlxhLiveMatchWireState,
  GlxhOnlineManagerPresence,
  GlxhRoomInfo,
} from '../game/glxhOnlineTypes';
import { getRankTierForScore, HEAD_COACH_CATALOG } from '../game/rules';
import { gameSound } from '../game/sound';
import { ManagerProfile } from '../game/types';

interface OnlineGlxhModalProps {
  profile: ManagerProfile;
  coachId: string;
  currentElo: number;
  onMatchReady: (match: GlxhLiveMatchWireState) => void;
  onClose: () => void;
}

type ArenaTab = 'ranked' | 'room' | 'managers';

export const OnlineGlxhModal: React.FC<OnlineGlxhModalProps> = ({
  profile,
  coachId,
  currentElo,
  onMatchReady,
  onClose,
}) => {
  const myTeamSnapshot = useMemo(
    () =>
      extractGlxhTeamSnapshot(
        { ...profile, elo: currentElo },
        coachId,
        glxhOnlineClient.getClientId()
      ),
    [profile, coachId, currentElo]
  );
  const rankTier = useMemo(() => getRankTierForScore(currentElo), [currentElo]);
  const activeCoach = useMemo(
    () => HEAD_COACH_CATALOG.find((c) => c.id === coachId) ?? HEAD_COACH_CATALOG[0],
    [coachId]
  );

  const [tab, setTab] = useState<ArenaTab>('ranked');
  const [wsConnected, setWsConnected] = useState<boolean>(() => glxhOnlineClient.getConnected());
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [inQueue, setInQueue] = useState<boolean>(false);
  const [queueSeconds, setQueueSeconds] = useState<number>(0);
  const [onlineManagers, setOnlineManagers] = useState<GlxhOnlineManagerPresence[]>([]);
  const [hubClubs, setHubClubs] = useState<GlxhClubSnapshotDirectoryEntry[]>([]);
  const [pendingInvites, setPendingInvites] = useState<GlxhChallengeInvite[]>([]);
  const [activeRoom, setActiveRoom] = useState<GlxhRoomInfo | null>(null);
  const [roomInput, setRoomInput] = useState<string>('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [sentInviteIds, setSentInviteIds] = useState<Record<string, boolean>>({});
  const [busyAction, setBusyAction] = useState<boolean>(false);

  const launchedMatchIdRef = useRef<string | null>(null);

  const triggerMatchOnce = (match: GlxhLiveMatchWireState) => {
    if (!match || !match.matchId) return;
    if (launchedMatchIdRef.current === match.matchId) return;
    launchedMatchIdRef.current = match.matchId;
    gameSound.playWalkoutStage('reveal');
    onMatchReady(match);
  };

  useEffect(() => {
    let disposed = false;

    const unsubConn = glxhOnlineClient.subscribeConnection((conn) => {
      if (!disposed) setWsConnected(conn);
    });

    const unsubMsg = glxhOnlineClient.subscribeMessages((msg) => {
      if (disposed) return;
      if (msg.type === 'lobby_update') {
        setOnlineCount(msg.onlineCount);
        setQueueCount(msg.queueCount);
        setOnlineManagers(msg.onlineManagers);
        setPendingInvites(msg.pendingInvites);
      } else if (msg.type === 'challenge_invite') {
        setPendingInvites((prev) => [
          msg.invite,
          ...prev.filter((i) => i.inviteId !== msg.invite.inviteId),
        ]);
        gameSound.playClick(1.15);
      } else if (msg.type === 'challenge_declined') {
        setFeedback({
          ok: false,
          text: `${msg.byManagerName} hiện chưa thể nhận lời mời đấu lúc này.`,
        });
      } else if (msg.type === 'match_started') {
        triggerMatchOnce(msg.match);
      }
    });

    const refreshLobby = async () => {
      const payload = await glxhOnlineClient.syncPresence(myTeamSnapshot);
      if (disposed || !payload) return;
      setOnlineCount(payload.onlineCount);
      setQueueCount(payload.queueCount);
      setInQueue(payload.inQueue);
      setOnlineManagers(payload.onlineManagers);
      setHubClubs(payload.hubClubs);
      setPendingInvites(payload.pendingInvites);
      if (payload.activeRoom && payload.activeRoom.status === 'waiting') {
        setActiveRoom(payload.activeRoom);
      }
      if (payload.activeMatch && !payload.activeMatch.finished) {
        triggerMatchOnce(payload.activeMatch);
      }
    };

    refreshLobby();
    const pollTimer = window.setInterval(async () => {
      const payload = await glxhOnlineClient.fetchLobbyStatus();
      if (disposed || !payload) return;
      setOnlineCount(payload.onlineCount);
      setQueueCount(payload.queueCount);
      setInQueue(payload.inQueue);
      setOnlineManagers(payload.onlineManagers);
      setHubClubs(payload.hubClubs);
      setPendingInvites(payload.pendingInvites);
      if (payload.activeMatch && !payload.activeMatch.finished) {
        triggerMatchOnce(payload.activeMatch);
      }
    }, 1500);

    return () => {
      disposed = true;
      unsubConn();
      unsubMsg();
      window.clearInterval(pollTimer);
      glxhOnlineClient.leaveQueue().catch(() => {});
    };
  }, [myTeamSnapshot]);

  useEffect(() => {
    if (!inQueue) {
      setQueueSeconds(0);
      return;
    }
    const id = window.setInterval(() => {
      setQueueSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [inQueue]);

  const handleJoinQueue = async () => {
    gameSound.playClick(1.1);
    setBusyAction(true);
    setFeedback(null);
    const res = await glxhOnlineClient.joinQueue(myTeamSnapshot);
    setBusyAction(false);
    if (!res.ok) {
      setFeedback({ ok: false, text: res.error || 'Không thể vào hàng chờ ghép trận.' });
      return;
    }
    if (res.status === 'matched' && res.match) {
      triggerMatchOnce(res.match);
      return;
    }
    setInQueue(true);
    if (typeof res.queueCount === 'number') setQueueCount(res.queueCount);
  };

  const handleLeaveQueue = async () => {
    gameSound.playClick(0.9);
    setInQueue(false);
    await glxhOnlineClient.leaveQueue();
  };

  const handleCreateRoom = async () => {
    gameSound.playClick(1.08);
    setBusyAction(true);
    setFeedback(null);
    const res = await glxhOnlineClient.createRoom(myTeamSnapshot);
    setBusyAction(false);
    if (!res.ok || !res.room) {
      setFeedback({ ok: false, text: res.error || 'Không thể tạo phòng đấu.' });
      return;
    }
    setActiveRoom(res.room);
    setFeedback({
      ok: true,
      text: `Đã tạo phòng ${res.room.roomCode}. Gửi mã này cho HLV khác nhập để đá ngay!`,
    });
  };

  const handleJoinRoom = async () => {
    const code = roomInput.trim();
    if (!code) {
      setFeedback({ ok: false, text: 'Vui lòng nhập mã phòng 6 số để tham gia.' });
      return;
    }
    gameSound.playClick(1.08);
    setBusyAction(true);
    setFeedback(null);
    const res = await glxhOnlineClient.joinRoom(code, myTeamSnapshot);
    setBusyAction(false);
    if (!res.ok) {
      setFeedback({ ok: false, text: res.error || 'Không thể vào phòng đấu.' });
      return;
    }
    if (res.match) {
      triggerMatchOnce(res.match);
    }
  };

  const handleChallengeOnlineManager = async (target: GlxhOnlineManagerPresence) => {
    gameSound.playClick(1.08);
    setFeedback(null);
    const res = await glxhOnlineClient.sendChallenge(target.clientId, myTeamSnapshot);
    if (!res.ok) {
      setFeedback({ ok: false, text: res.error || 'Không thể gửi lời mời thách đấu.' });
      return;
    }
    setSentInviteIds((prev) => ({ ...prev, [target.clientId]: true }));
    setFeedback({
      ok: true,
      text: `Đã gửi lời mời đấu Live tới ${target.managerName}. Chờ đối thủ chấp nhận...`,
    });
  };

  const handleRespondInvite = async (inviteId: string, accept: boolean) => {
    gameSound.playClick(accept ? 1.12 : 0.9);
    setPendingInvites((prev) => prev.filter((i) => i.inviteId !== inviteId));
    const res = await glxhOnlineClient.respondChallenge(inviteId, accept, myTeamSnapshot);
    if (accept && res.ok && res.match) {
      triggerMatchOnce(res.match);
    } else if (accept && !res.ok) {
      setFeedback({ ok: false, text: res.error || 'Lời mời thách đấu không còn khả dụng.' });
    }
  };

  const handleChallengeHubSnapshot = async (club: GlxhClubSnapshotDirectoryEntry) => {
    gameSound.playClick(1.08);
    setBusyAction(true);
    setFeedback(null);
    const res = await glxhOnlineClient.challengeHubClubSnapshot(club.ownerId, myTeamSnapshot);
    setBusyAction(false);
    if (!res.ok || !res.match) {
      setFeedback({ ok: false, text: res.error || 'Không thể khởi tạo trận đấu với CLB này.' });
      return;
    }
    triggerMatchOnce(res.match);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const myClientId = glxhOnlineClient.getClientId();
  const visibleHubClubs = hubClubs.filter((c) => c.ownerId !== profile.id);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Phòng Chờ Giả Lập Xếp Hạng Online PvP"
      data-testid="online-glxh-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleLeaveQueue();
          onClose();
        }
      }}
      className="fixed inset-0 z-[97] flex items-center justify-center p-2.5 sm:p-4 bg-black/85"
    >
      <div className="w-full max-w-3xl max-h-[92%] overflow-y-auto rounded-xl bg-[#080e1b] border border-[#a3e635]/45 shadow-[0_24px_70px_rgba(0,0,0,0.95)] p-3.5 sm:p-5 text-slate-100 space-y-3.5 fco-touch-scroll">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold tracking-wider text-[#a3e635]">
              <span>GIẢ LẬP XẾP HẠNG ONLINE · PvP THỰC TẾ</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-400/35 text-emerald-300 font-mono text-[10px]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    wsConnected ? 'bg-[#a3e635]' : 'bg-amber-400'
                  }`}
                />
                {onlineCount} HLV Online
              </span>
            </div>
            <h2
              className="text-xl sm:text-3xl font-black italic text-white leading-tight mt-0.5"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              ĐẤU TRƯỜNG GLXH TRỰC TUYẾN
            </h2>
          </div>

          <button
            type="button"
            data-testid="online-glxh-close"
            onClick={() => {
              handleLeaveQueue();
              onClose();
            }}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer shrink-0"
          >
            Đóng
          </button>
        </div>

        {/* Incoming P2P Challenge Banner */}
        {pendingInvites.length > 0 && (
          <div
            data-testid="glxh-incoming-invite"
            className="rounded-lg bg-amber-950/60 border border-amber-400/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
          >
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                Lời mời thách đấu Online trực tiếp!
              </div>
              <div className="text-sm font-bold text-white mt-0.5">
                {pendingInvites[0].fromManagerName} (OVR {pendingInvites[0].fromTeamOvr} ·{' '}
                {pendingInvites[0].fromFormation} · {pendingInvites[0].fromElo} ĐXH) muốn đá GLXH
                với bạn
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="glxh-accept-invite-btn"
                onClick={() => handleRespondInvite(pendingInvites[0].inviteId, true)}
                className="px-3.5 py-1.5 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 text-xs font-black cursor-pointer"
              >
                Chấp Nhận Đá Ngay
              </button>
              <button
                type="button"
                onClick={() => handleRespondInvite(pendingInvites[0].inviteId, false)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Từ chối
              </button>
            </div>
          </div>
        )}

        {/* Your Active Starting XI Telemetry Strip */}
        <div className="rounded-lg bg-[#050912] border border-white/10 p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded bg-[#a3e635]/15 border border-[#a3e635]/50 flex items-center justify-center font-black text-[#a3e635] shrink-0">
              {myTeamSnapshot.teamOvr}
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-white truncate">
                {myTeamSnapshot.managerName}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Sơ đồ <strong className="text-slate-200">{myTeamSnapshot.formation}</strong> · HLV{' '}
                <strong className="text-amber-300">{activeCoach.name}</strong>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="font-extrabold" style={{ color: rankTier.accentHex }}>
              {rankTier.name}
            </div>
            <div className="text-[11px] font-mono text-slate-300">{currentElo} ĐXH</div>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            role="status"
            data-testid="glxh-arena-feedback"
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold border ${
              feedback.ok
                ? 'bg-emerald-950/80 border-emerald-400/45 text-emerald-200'
                : 'bg-rose-950/80 border-rose-400/45 text-rose-200'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Mode Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#050912] border border-white/10">
          <button
            type="button"
            data-testid="glxh-tab-ranked"
            onClick={() => {
              gameSound.playClick();
              setTab('ranked');
            }}
            className={`py-2 px-2 rounded text-xs font-extrabold cursor-pointer transition-colors ${
              tab === 'ranked'
                ? 'bg-[#a3e635] text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            Ghép Trận Ranked
          </button>
          <button
            type="button"
            data-testid="glxh-tab-room"
            onClick={() => {
              gameSound.playClick();
              setTab('room');
            }}
            className={`py-2 px-2 rounded text-xs font-extrabold cursor-pointer transition-colors ${
              tab === 'room'
                ? 'bg-[#a3e635] text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            Phòng Đấu / Mã Phòng
          </button>
          <button
            type="button"
            data-testid="glxh-tab-managers"
            onClick={() => {
              gameSound.playClick();
              setTab('managers');
            }}
            className={`py-2 px-2 rounded text-xs font-extrabold cursor-pointer transition-colors ${
              tab === 'managers'
                ? 'bg-[#a3e635] text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            HLV Online ({onlineManagers.length})
          </button>
        </div>

        {/* TAB 1: AUTO RANKED MATCHMAKING */}
        {tab === 'ranked' && (
          <div className="space-y-3">
            <div className="rounded-lg bg-[#050912] border border-[#a3e635]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm sm:text-base font-extrabold text-white">
                  Đấu Xếp Hạng GLXH 1vs1 Thời Gian Thực
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ghép cặp trực tiếp với HLV khác trên máy chủ. Cả hai cùng xem sân 2D đồng bộ và
                  điều chỉnh chiến thuật trực tiếp (Phòng ngự / Cân bằng / Tấn công) trong trận!
                </p>
                <div className="text-[11px] font-mono text-slate-300">
                  Đang tìm trận trên máy chủ: <strong className="text-[#a3e635]">{queueCount}</strong>{' '}
                  HLV
                </div>
              </div>

              <div className="shrink-0">
                {!inQueue ? (
                  <button
                    type="button"
                    data-testid="glxh-find-online-btn"
                    disabled={busyAction}
                    onClick={handleJoinQueue}
                    className="w-full sm:w-auto px-5 py-3 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-black text-sm uppercase tracking-wider shadow-[0_6px_22px_rgba(163,230,53,0.35)] cursor-pointer whitespace-nowrap"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    Tìm Trận GLXH Online
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <div
                      data-testid="glxh-searching-indicator"
                      className="px-3.5 py-2.5 rounded bg-emerald-950 border border-[#a3e635]/50 text-[#a3e635] font-mono text-xs font-bold flex items-center gap-2"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-[#a3e635] animate-ping" />
                      <span>Đang ghép... {formatTimer(queueSeconds)}</span>
                    </div>
                    <button
                      type="button"
                      data-testid="glxh-cancel-queue-btn"
                      onClick={handleLeaveQueue}
                      className="px-3 py-2.5 rounded bg-rose-950 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-xs font-bold cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Live Online Quick Challenge Row */}
            {onlineManagers.length > 0 && (
              <div className="rounded-lg bg-[#050912] border border-white/10 p-3 space-y-2">
                <div className="text-xs font-bold text-slate-300">
                  HLV Đang Online · Mời Đấu Ngay ({onlineManagers.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {onlineManagers.slice(0, 4).map((mgr) => (
                    <div
                      key={mgr.clientId}
                      className="rounded bg-[#0b1324] border border-white/10 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{mgr.managerName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          OVR {mgr.teamOvr} · {mgr.formation} · {mgr.elo} ĐXH
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={sentInviteIds[mgr.clientId] || mgr.status === 'in_match'}
                        onClick={() => handleChallengeOnlineManager(mgr)}
                        className="px-2.5 py-1.5 rounded bg-[#a3e635] hover:bg-[#bef264] disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold text-[11px] cursor-pointer shrink-0"
                      >
                        {mgr.status === 'in_match'
                          ? 'Đang đá'
                          : sentInviteIds[mgr.clientId]
                          ? 'Đã mời'
                          : 'Thách Đấu'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ROOM CODE PVP */}
        {tab === 'room' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Create Room */}
            <div className="rounded-lg bg-[#050912] border border-white/10 p-4 space-y-3">
              <div>
                <div className="text-sm font-extrabold text-white">Tạo Phòng Giao Hữu / So Tài</div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Lấy mã phòng 6 số để bạn bè nhập và thi đấu trực tiếp 2 máy cùng lúc.
                </p>
              </div>

              <button
                type="button"
                data-testid="glxh-create-room-btn"
                disabled={busyAction}
                onClick={handleCreateRoom}
                className="w-full py-2.5 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer"
              >
                {activeRoom ? 'Tạo Mã Phòng Mới' : 'Tạo Phòng Đấu Ngay'}
              </button>

              {activeRoom && (
                <div className="rounded bg-emerald-950/50 border border-[#a3e635]/50 p-3 text-center space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    Mã phòng đang chờ đối thủ
                  </div>
                  <div
                    data-testid="glxh-room-code"
                    className="text-2xl font-mono font-black tracking-[0.25em] text-white select-all"
                  >
                    {activeRoom.roomCode}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Giữ cửa sổ này mở — trận đấu sẽ tự bắt đầu khi bạn của bạn vào phòng!
                  </div>
                </div>
              )}
            </div>

            {/* Join Room */}
            <div className="rounded-lg bg-[#050912] border border-white/10 p-4 space-y-3">
              <div>
                <div className="text-sm font-extrabold text-white">Tham Gia Phòng Bằng Mã</div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Nhập mã phòng 6 số do HLV đối thủ gửi cho bạn để vào sân cùng nhau.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  data-testid="glxh-join-room-input"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  placeholder="Nhập mã phòng (VD: 482910)"
                  maxLength={12}
                  className="flex-1 min-w-0 px-3 py-2 rounded bg-[#0c1425] border border-white/15 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-[#a3e635]"
                />
                <button
                  type="button"
                  data-testid="glxh-join-room-btn"
                  disabled={busyAction}
                  onClick={handleJoinRoom}
                  className="px-4 py-2 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs cursor-pointer shrink-0"
                >
                  Vào Phòng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ONLINE MANAGERS & REAL CLUB SNAPSHOTS */}
        {tab === 'managers' && (
          <div className="space-y-3">
            <div className="rounded-lg bg-[#050912] border border-white/10 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#a3e635]">
                <span>HLV ĐANG TRỰC TUYẾN ({onlineManagers.length})</span>
                <span className="text-[11px] font-normal text-slate-400">
                  Mời đấu trực tiếp thời gian thực
                </span>
              </div>

              {onlineManagers.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">
                  Hiện chưa có HLV khác đang mở sảnh GLXH. Bạn có thể mở tab/trình duyệt thứ 2 hoặc
                  chọn đấu với đội hình CLB thật trên máy chủ bên dưới.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto fco-touch-scroll">
                  {onlineManagers
                    .filter((m) => m.clientId !== myClientId)
                    .map((mgr) => (
                      <div
                        key={mgr.clientId}
                        className="rounded bg-[#0b1324] border border-white/10 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#a3e635]" />
                            <strong className="text-white truncate">{mgr.managerName}</strong>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              {mgr.deviceLabel}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            OVR {mgr.teamOvr} · {mgr.formation} · {mgr.elo} ĐXH ·{' '}
                            {mgr.status === 'queue'
                              ? 'Đang tìm trận'
                              : mgr.status === 'in_match'
                              ? 'Đang thi đấu'
                              : 'Sẵn sàng'}
                          </div>
                        </div>

                        <button
                          type="button"
                          data-testid={`glxh-challenge-btn-${mgr.clientId}`}
                          disabled={sentInviteIds[mgr.clientId] || mgr.status === 'in_match'}
                          onClick={() => handleChallengeOnlineManager(mgr)}
                          className="px-3 py-1.5 rounded bg-[#a3e635] hover:bg-[#bef264] disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black text-xs cursor-pointer shrink-0"
                        >
                          {mgr.status === 'in_match'
                            ? 'Đang đá'
                            : sentInviteIds[mgr.clientId]
                            ? 'Đã mời'
                            : 'Mời Đấu Live'}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {visibleHubClubs.length > 0 && (
              <div className="rounded-lg bg-[#050912] border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-sky-300">
                  <span>ĐỘI HÌNH CLB THẬT TRÊN MÁY CHỦ ({visibleHubClubs.length})</span>
                  <span className="text-[11px] font-normal text-slate-400">
                    Đá ngay với đội hình đã lưu của HLV khác
                  </span>
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto fco-touch-scroll">
                  {visibleHubClubs.slice(0, 8).map((club) => (
                    <div
                      key={club.ownerId}
                      className="rounded bg-[#0b1324] border border-white/10 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{club.managerName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          OVR {club.squadOvr} · {club.formation} · {club.elo} ĐXH
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid={`glxh-snapshot-btn-${club.ownerId}`}
                        disabled={busyAction}
                        onClick={() => handleChallengeHubSnapshot(club)}
                        className="px-3 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs cursor-pointer shrink-0"
                      >
                        Đấu Đội Hình Này
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
