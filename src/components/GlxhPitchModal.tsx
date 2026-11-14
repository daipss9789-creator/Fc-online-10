import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GLXH_PITCH_HEIGHT,
  GLXH_PITCH_WIDTH,
  GlxhMatchState,
  buildSimulatedMatchResultFromGlxh,
  computeGlxhPossessionPercent,
  createGlxhMatchState,
  fastForwardGlxhMatch,
  stepGlxhSimulation,
} from '../game/glxhMatchEngine';
import { SimulatedMatchResult, formatBpCompact } from '../game/rules';
import { gameSound } from '../game/sound';
import { GlobalServerRules, ManagerProfile } from '../game/types';

interface GlxhPitchModalProps {
  profile: ManagerProfile;
  coachId: string;
  currentElo: number;
  serverRules?: GlobalServerRules;
  onCompleteMatch: (result: SimulatedMatchResult, playAgain?: boolean) => void;
  onCancel: () => void;
}

type SimSpeed = 1 | 2 | 4;

export const GlxhPitchModal: React.FC<GlxhPitchModalProps> = ({
  profile,
  coachId,
  currentElo,
  serverRules,
  onCompleteMatch,
  onCancel,
}) => {
  const stateRef = useRef<GlxhMatchState | null>(null);
  if (!stateRef.current) {
    stateRef.current = createGlxhMatchState({
      profile,
      coachId,
      currentElo,
    });
  }

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const speedRef = useRef<SimSpeed>(2);
  const pausedRef = useRef<boolean>(false);
  const prevGoalCountRef = useRef<number>(0);

  const [speed, setSpeed] = useState<SimSpeed>(2);
  const [paused, setPaused] = useState<boolean>(false);
  const [, setRenderTick] = useState<number>(0);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // 60fps simulation & canvas draw loop
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();
    let hudAccumulator = 0;

    const drawPitch = (st: GlxhMatchState) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      const padX = Math.max(10, w * 0.025);
      const padY = Math.max(8, h * 0.04);
      const fieldW = w - padX * 2;
      const fieldH = h - padY * 2;
      const sx = (px: number) => padX + (px / GLXH_PITCH_WIDTH) * fieldW;
      const sy = (py: number) => padY + (py / GLXH_PITCH_HEIGHT) * fieldH;

      // Dark outer perimeter turf
      ctx.fillStyle = '#07140d';
      ctx.fillRect(0, 0, w, h);

      // Mowed grass vertical stripes
      const stripeCount = 12;
      const stripeW = fieldW / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#114226' : '#144d2c';
        ctx.fillRect(padX + i * stripeW, padY, stripeW + 0.5, fieldH);
      }

      // Pitch lines
      ctx.strokeStyle = 'rgba(255,255,255,0.48)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(padX, padY, fieldW, fieldH);

      // Halfway line & center circle
      const midX = sx(50);
      const midY = sy(32);
      ctx.beginPath();
      ctx.moveTo(midX, padY);
      ctx.lineTo(midX, padY + fieldH);
      ctx.stroke();

      const centerR = (9.15 / GLXH_PITCH_WIDTH) * fieldW;
      ctx.beginPath();
      ctx.arc(midX, midY, centerR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(midX, midY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Penalty areas & 6-yard boxes
      const penW = (16.5 / GLXH_PITCH_WIDTH) * fieldW;
      const penH = (40.3 / GLXH_PITCH_HEIGHT) * fieldH;
      const penY = midY - penH / 2;
      ctx.strokeRect(padX, penY, penW, penH);
      ctx.strokeRect(padX + fieldW - penW, penY, penW, penH);

      const sixW = (5.5 / GLXH_PITCH_WIDTH) * fieldW;
      const sixH = (18.3 / GLXH_PITCH_HEIGHT) * fieldH;
      const sixY = midY - sixH / 2;
      ctx.strokeRect(padX, sixY, sixW, sixH);
      ctx.strokeRect(padX + fieldW - sixW, sixY, sixW, sixH);

      // Goals
      const gTop = sy(26.2);
      const gBot = sy(37.8);
      const gDepth = Math.max(5, padX * 0.6);
      ctx.strokeStyle = '#a3e635';
      ctx.lineWidth = 2;
      ctx.strokeRect(padX - gDepth, gTop, gDepth, gBot - gTop);
      ctx.strokeStyle = '#f43f5e';
      ctx.strokeRect(padX + fieldW, gTop, gDepth, gBot - gTop);

      // Pass / Shot Vector Trails
      for (const tr of st.trails) {
        ctx.save();
        ctx.globalAlpha = Math.max(0.08, tr.ttl * 0.72);
        ctx.strokeStyle =
          tr.kind === 'shot'
            ? '#fde047'
            : tr.side === 'home'
            ? '#a3e635'
            : '#fb7185';
        ctx.lineWidth = tr.kind === 'shot' ? 2.4 : 1.6;
        if (tr.kind === 'through') {
          ctx.setLineDash([4, 3]);
        }
        ctx.beginPath();
        ctx.moveTo(sx(tr.fromX), sy(tr.fromY));
        ctx.lineTo(sx(tr.toX), sy(tr.toY));
        ctx.stroke();
        ctx.restore();
      }

      // Draw 22 tactical circles
      const circleR = clampRadius(fieldW, fieldH);
      const showLabels = fieldW >= 340;

      for (const p of st.players) {
        const px = sx(p.x);
        const py = sy(p.y);
        const isCarrier = st.ball.carrierId === p.id;
        const isTarget = st.ball.flight?.targetPlayerId === p.id;

        if (isCarrier) {
          ctx.beginPath();
          ctx.arc(px, py, circleR + 4.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (isTarget) {
          ctx.beginPath();
          ctx.arc(px, py, circleR + 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(163, 230, 53, 0.55)';
          ctx.lineWidth = 1.3;
          ctx.stroke();
        }

        // Circle fill
        ctx.beginPath();
        ctx.arc(px, py, circleR, 0, Math.PI * 2);
        if (p.side === 'home') {
          ctx.fillStyle = p.lineGroup === 'GK' ? '#0ea5e9' : '#84cc16';
          ctx.strokeStyle = '#052e16';
        } else {
          ctx.fillStyle = p.lineGroup === 'GK' ? '#f59e0b' : '#e11d48';
          ctx.strokeStyle = '#4c0519';
        }
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Stamina arc around upper edge
        const stamRatio = Math.max(0.1, (p.stamina - 40) / 60);
        ctx.beginPath();
        ctx.arc(
          px,
          py,
          circleR + 1.4,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * stamRatio
        );
        ctx.strokeStyle =
          p.side === 'home' ? 'rgba(217,249,157,0.85)' : 'rgba(254,205,211,0.85)';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        // Jersey number inside circle
        ctx.fillStyle = p.side === 'home' ? '#052e16' : '#ffffff';
        ctx.font = `900 ${Math.max(8, Math.round(circleR * 0.92))}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(p.jerseyNumber), px, py + 0.5);

        // Short name tag for carrier or when pitch has room
        if (showLabels && (isCarrier || p.lineGroup === 'ATT')) {
          ctx.font = `700 ${Math.max(8, Math.round(circleR * 0.72))}px Inter, sans-serif`;
          const textW = ctx.measureText(p.shortName).width;
          ctx.fillStyle = 'rgba(5, 10, 20, 0.76)';
          ctx.fillRect(px - textW / 2 - 3, py + circleR + 2, textW + 6, 11);
          ctx.fillStyle = isCarrier ? '#fde047' : '#e2e8f0';
          ctx.fillText(p.shortName, px, py + circleR + 7.5);
        }
      }

      // Draw ball
      const bx = sx(st.ball.x);
      const by = sy(st.ball.y);
      ctx.beginPath();
      ctx.arc(bx + 1.5, by + 2, 4.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(bx, by, 4.3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.restore();
    };

    const tick = (now: number) => {
      const elapsedSec = Math.min(0.05, Math.max(0.005, (now - lastTs) / 1000));
      lastTs = now;
      const st = stateRef.current;
      if (st) {
        if (!pausedRef.current && !st.finished) {
          // 1x = 1.5x real time (~90s for full 90'), 2x = 3x, 4x = 6x (~22s)
          const mult = speedRef.current === 1 ? 1.5 : speedRef.current === 2 ? 3.0 : 6.0;
          const totalStep = elapsedSec * mult;
          const subSteps = Math.max(1, Math.ceil(totalStep / 0.04));
          const subDt = totalStep / subSteps;
          for (let i = 0; i < subSteps; i++) {
            stepGlxhSimulation(st, subDt);
          }

          if (st.highlights.length > prevGoalCountRef.current) {
            const latest = st.highlights[st.highlights.length - 1];
            prevGoalCountRef.current = st.highlights.length;
            gameSound.playUpgradeOutcome(latest.isUserGoal);
          }
        }

        drawPitch(st);

        hudAccumulator += elapsedSec;
        if (hudAccumulator >= 0.1 || st.finished) {
          hudAccumulator = 0;
          setRenderTick((t) => t + 1);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const st = stateRef.current!;
  const possHome = computeGlxhPossessionPercent(st);
  const possAway = 100 - possHome;
  const simPreview = st.finished
    ? buildSimulatedMatchResultFromGlxh({
        state: st,
        profile,
        coachId,
        serverRules,
      })
    : null;

  const handleFastForward = () => {
    gameSound.playClick(1.1);
    fastForwardGlxhMatch(st);
    if (st.highlights.length > prevGoalCountRef.current) {
      prevGoalCountRef.current = st.highlights.length;
    }
    const won = st.homeGoals >= st.awayGoals;
    gameSound.playUpgradeOutcome(won);
    setPaused(false);
    setRenderTick((t) => t + 1);
  };

  const handleFinishAndClaim = (playAgain: boolean = false) => {
    if (!st.finished) {
      fastForwardGlxhMatch(st);
    }
    const result = buildSimulatedMatchResultFromGlxh({
      state: st,
      profile,
      coachId,
      serverRules,
    });
    gameSound.playUpgradeOutcome(result.outcome !== 'LOSS');
    onCompleteMatch(result, playAgain);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mô phỏng chiến thuật 2D Giả Lập Xếp Hạng GLXH"
      data-testid="glxh-pitch-modal"
      className="fixed inset-0 z-[98] flex items-center justify-center p-1.5 sm:p-3 bg-black/88"
    >
      <div className="w-full max-w-5xl max-h-full flex flex-col rounded-xl bg-[#090f1d] border border-[#a3e635]/45 shadow-[0_24px_60px_rgba(0,0,0,0.95)] overflow-hidden text-slate-100">
        {/* Top Broadcast Scoreboard */}
        <div className="shrink-0 bg-[#050912] border-b border-white/10 px-2.5 sm:px-4 py-1.5 sm:py-2 flex flex-wrap items-center justify-between gap-2">
          {/* Home Team */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full bg-[#84cc16] ring-2 ring-[#a3e635]/50 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-extrabold text-[#a3e635] truncate">
                {st.homeName}
              </div>
              <div className="text-[10px] text-slate-400 font-mono truncate">
                OVR {st.homeOvr} · {st.homeFormation} · {st.homeCoachName}
              </div>
            </div>
          </div>

          {/* Center Clock & Scoreline */}
          <div className="flex items-center gap-2.5 sm:gap-4 tabular-nums">
            <div
              className="px-2 py-0.5 rounded bg-slate-900 border border-white/15 font-mono text-xs sm:text-sm font-extrabold text-[#a3e635]"
              data-testid="glxh-match-minute"
            >
              {st.finished ? 'FT' : `${String(st.minute).padStart(2, '0')}'`}
            </div>
            <div
              className="text-xl sm:text-3xl font-black tracking-wider text-white"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              data-testid="glxh-live-score"
            >
              {st.homeGoals} - {st.awayGoals}
            </div>
          </div>

          {/* Away Team & Controls */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="text-right min-w-0 hidden sm:block">
              <div className="text-xs sm:text-sm font-extrabold text-rose-400 truncate">
                {st.awayName}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                OVR {st.awayOvr} · {st.awayFormation}
              </div>
            </div>
            <span className="w-3 h-3 rounded-full bg-rose-600 ring-2 ring-rose-400/50 shrink-0 hidden sm:inline-block" />

            <div className="flex items-center gap-1 shrink-0">
              {!st.finished && (
                <>
                  {([1, 2, 4] as SimSpeed[]).map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => {
                        gameSound.playClick(1.05);
                        setSpeed(spd);
                      }}
                      className={`px-2 py-1 rounded text-[10px] sm:text-xs font-bold cursor-pointer ${
                        speed === spd
                          ? 'bg-[#a3e635] text-slate-950'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] sm:text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    {paused ? 'Tiếp' : 'Tạm dừng'}
                  </button>
                  <button
                    type="button"
                    data-testid="glxh-fast-forward"
                    onClick={handleFastForward}
                    className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] sm:text-xs font-extrabold cursor-pointer whitespace-nowrap"
                  >
                    Kết thúc nhanh
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onCancel}
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-white/10 text-[10px] sm:text-xs text-slate-300 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>

        {/* Main 2D Pitch Canvas + Live Tactical Telemetry */}
        <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-12 gap-2 p-1.5 sm:p-3 overflow-y-auto fco-touch-scroll items-center">
          {/* Pitch Canvas (Left/Main 8 cols) */}
          <div className="sm:col-span-8 flex items-center justify-center min-h-0">
            <div className="relative rounded-lg overflow-hidden border border-emerald-500/35 bg-[#07140d] w-[min(100%,calc((100dvh-116px)*1.5625))] aspect-[100/64]">
              <canvas
                ref={canvasRef}
                data-testid="glxh-pitch-canvas"
                className="w-full h-full block"
              />
              {st.goalBannerText && (
                <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none px-3">
                  <div className="px-4 py-1.5 rounded-full bg-amber-400 text-slate-950 font-black text-xs sm:text-sm tracking-wide shadow-[0_0_24px_rgba(251,191,36,0.85)] animate-bounce">
                    {st.goalBannerText}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right 4 cols: Live Stats, Commentary & Full-Time Rewards */}
          <div className="sm:col-span-4 flex flex-col justify-between gap-2 min-h-0">
            <div className="space-y-2">
              {/* Commentary */}
              <div className="rounded-lg bg-[#050912] border border-white/10 p-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#a3e635]">
                  Bình luận trực tiếp AI
                </div>
                <div className="text-xs font-semibold text-white mt-0.5 leading-snug">
                  {st.lastActionText}
                </div>
              </div>

              {/* Possession & Match Metrics */}
              <div className="rounded-lg bg-[#050912] border border-white/10 p-2 space-y-1.5 text-[11px] tabular-nums">
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span className="text-[#a3e635]">{possHome}%</span>
                    <span className="text-slate-400 text-[10px]">KIỂM SOÁT BÓNG</span>
                    <span className="text-rose-400">{possAway}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-rose-600/80 overflow-hidden">
                    <div
                      className="h-full bg-[#a3e635] transition-all duration-150"
                      style={{ width: `${possHome}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 text-center pt-1 border-t border-white/5">
                  <strong className="text-[#a3e635]">
                    {st.homeShots} ({st.homeShotsOnTarget})
                  </strong>
                  <span className="text-slate-400 text-[10px]">Sút (Trúng)</span>
                  <strong className="text-rose-400">
                    {st.awayShots} ({st.awayShotsOnTarget})
                  </strong>
                </div>

                <div className="grid grid-cols-3 text-center">
                  <strong className="text-[#a3e635]">{st.homePassesCompleted}</strong>
                  <span className="text-slate-400 text-[10px]">Chuyền chuẩn</span>
                  <strong className="text-rose-400">{st.awayPassesCompleted}</strong>
                </div>

                <div className="grid grid-cols-3 text-center">
                  <strong className="text-[#a3e635]">{st.homeTacklesWon}</strong>
                  <span className="text-slate-400 text-[10px]">Cắt bóng</span>
                  <strong className="text-rose-400">{st.awayTacklesWon}</strong>
                </div>
              </div>

              {/* Scorers Feed */}
              <div className="rounded-lg bg-[#050912] border border-white/10 p-2 max-h-28 overflow-y-auto fco-touch-scroll">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Diễn biến bàn thắng
                </div>
                {st.highlights.length === 0 ? (
                  <div className="text-[11px] text-slate-500">Chưa có bàn thắng được ghi.</div>
                ) : (
                  <div className="space-y-1 text-[11px] tabular-nums">
                    {st.highlights.map((h, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <span
                          className={
                            h.isUserGoal ? 'text-[#a3e635] font-bold' : 'text-rose-400 font-bold'
                          }
                        >
                          {h.minute}&apos; · {h.scorerName} ({h.seasonLabel})
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {h.isUserGoal ? 'Nhà' : 'Khách'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Full-time Summary & Claim CTAs */}
            {simPreview && (
              <div className="rounded-lg bg-emerald-950/50 border border-[#a3e635]/50 p-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-extrabold tabular-nums">
                  <span
                    className={
                      simPreview.outcome === 'WIN'
                        ? 'text-[#a3e635]'
                        : simPreview.outcome === 'DRAW'
                        ? 'text-amber-300'
                        : 'text-rose-400'
                    }
                  >
                    {simPreview.outcome === 'WIN'
                      ? 'CHIẾN THẮNG!'
                      : simPreview.outcome === 'DRAW'
                      ? 'HÒA KỊCH TÍNH!'
                      : 'THẤT BẠI'}
                  </span>
                  <span className="text-white">
                    +{formatBpCompact(simPreview.bpEarned)} · +{simPreview.starPointsEarned} Tarpoi
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    data-testid="glxh-claim-result"
                    onClick={() => handleFinishAndClaim(false)}
                    className="py-2 px-2.5 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-black text-xs cursor-pointer whitespace-nowrap"
                  >
                    Nhận Thưởng &amp; Xem
                  </button>
                  <button
                    type="button"
                    data-testid="glxh-play-again"
                    onClick={() => handleFinishAndClaim(true)}
                    className="py-2 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer whitespace-nowrap"
                  >
                    Đá Trận Mới
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

function clampRadius(fieldW: number, fieldH: number): number {
  const byDim = Math.min(fieldW, fieldH) * 0.036;
  return Math.max(7.5, Math.min(13.5, byDim));
}
