import React, { useMemo, useState } from 'react';
import {
  formatBpCompact,
  getRankTierForScore,
  sortLeaderboard,
} from '../game/rules';
import { gameSound } from '../game/sound';
import { LeaderboardCategory, LeaderboardRow } from '../game/types';

interface LeaderboardViewProps {
  rows: LeaderboardRow[];
  onOpenAuthModal: () => void;
  onRefreshLeaderboard?: () => Promise<void> | void;
  isGuest: boolean;
}

type AccountFilter = 'all' | 'cloud' | 'registered' | 'guest';

const BOARD_TABS: Array<{
  id: LeaderboardCategory;
  label: string;
  subtitle: string;
  accentClass: string;
}> = [
  {
    id: 'ranked',
    label: 'BXH Đấu Xếp Hạng (ĐXH)',
    subtitle: 'Xếp hạng điểm Elo 1vs1 & GLXH, bậc hạng và tỉ lệ thắng liên thiết bị',
    accentClass: 'bg-[#a3e635] text-slate-950',
  },
  {
    id: 'squadOvr',
    label: 'BXH OVR Đội Hình',
    subtitle: 'Xếp hạng chỉ số OVR đội hình chính (kèm Team Color) & Cấp độ HLV',
    accentClass: 'bg-cyan-400 text-slate-950',
  },
  {
    id: 'squadValue',
    label: 'BXH Giá Trị CLB (BP)',
    subtitle: 'Xếp hạng tổng giá trị đội hình tính bằng BP của mọi CLB trên máy chủ',
    accentClass: 'bg-emerald-400 text-slate-950',
  },
  {
    id: 'vip',
    label: 'BXH Hội Viên SVIP',
    subtitle: 'Xếp hạng cấp độ Hội viên SVIP (0–20) và tổng điểm tích lũy SVIP',
    accentClass: 'bg-amber-400 text-slate-950',
  },
  {
    id: 'bestOvr',
    label: 'BXH Siêu Sao OVR Cao Nhất',
    subtitle: 'Xếp hạng thẻ cầu thủ đơn lẻ có chỉ số OVR và cấp cộng cao nhất',
    accentClass: 'bg-sky-400 text-slate-950',
  },
];

function getWinRatePercent(row: LeaderboardRow): {
  wins: number;
  draws: number;
  losses: number;
  total: number;
  winRate: number;
} {
  const wins = row.wins ?? 14;
  const draws = row.draws ?? 3;
  const losses = row.losses ?? 4;
  const total = Math.max(0, wins + draws + losses);
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  return { wins, draws, losses, total, winRate };
}

function formatAccountKind(row: LeaderboardRow): string {
  if (row.accountType === 'cloud') return 'Tài khoản Cloud Google';
  if (row.accountType === 'registered') return 'Tài khoản HLV Máy chủ';
  return 'Thiết bị trực tuyến';
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  rows,
  onOpenAuthModal,
  onRefreshLeaderboard,
  isGuest,
}) => {
  const [category, setCategory] = useState<LeaderboardCategory>('ranked');
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [syncing, setSyncing] = useState<boolean>(false);

  const activeBoardMeta = useMemo(
    () => BOARD_TABS.find((b) => b.id === category) ?? BOARD_TABS[0],
    [category]
  );

  // Full sorted ranking on the active category (used to compute true server rank numbers before search/filter)
  const fullCategoryRanked = useMemo(
    () => sortLeaderboard(rows, category),
    [rows, category]
  );

  const rankIndexByOwner = useMemo(() => {
    const map = new Map<string, number>();
    fullCategoryRanked.forEach((r, idx) => {
      map.set(r.ownerId, idx + 1);
    });
    return map;
  }, [fullCategoryRanked]);

  const currentUserEntry = useMemo(() => {
    const found = fullCategoryRanked.find((r) => r.isCurrentUser);
    if (!found) return null;
    return {
      row: found,
      rank: rankIndexByOwner.get(found.ownerId) ?? 1,
    };
  }, [fullCategoryRanked, rankIndexByOwner]);

  const displayedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return fullCategoryRanked.filter((row) => {
      if (accountFilter !== 'all' && (row.accountType ?? 'guest') !== accountFilter) {
        return false;
      }
      if (!q) return true;
      return `${row.managerName} ${row.deviceLabel ?? ''} ${row.bestCardName} ${row.bestCardSeason}`
        .toLowerCase()
        .includes(q);
    });
  }, [fullCategoryRanked, accountFilter, searchQuery]);

  const counts = useMemo(() => {
    let cloud = 0;
    let registered = 0;
    let guest = 0;
    const devices = new Set<string>();
    for (const r of rows) {
      if (r.accountType === 'cloud') cloud++;
      else if (r.accountType === 'registered') registered++;
      else guest++;
      devices.add(`${r.ownerId}_${r.deviceLabel ?? 'web'}`);
    }
    return {
      total: rows.length,
      cloud,
      registered,
      guest,
      deviceSessions: devices.size,
    };
  }, [rows]);

  const topThreeRows = useMemo(
    () => fullCategoryRanked.slice(0, 3),
    [fullCategoryRanked]
  );

  const handleManualRefresh = async () => {
    if (!onRefreshLeaderboard || syncing) return;
    gameSound.playClick(1.08);
    setSyncing(true);
    try {
      await onRefreshLeaderboard();
    } finally {
      window.setTimeout(() => setSyncing(false), 350);
    }
  };

  const renderPrimaryMetricSummary = (row: LeaderboardRow): string => {
    if (category === 'ranked') {
      const elo = row.elo ?? 2050;
      const tier = getRankTierForScore(elo);
      return `${tier.name} · ${elo.toLocaleString('vi-VN')} ĐXH`;
    }
    if (category === 'squadOvr') {
      return `OVR ${row.squadOvr ?? 130} · HLV Lv.${row.managerLevel ?? 25}`;
    }
    if (category === 'squadValue') {
      return formatBpCompact(row.squadValue);
    }
    if (category === 'vip') {
      return `SVIP ${row.vipLevel} · ${row.vipPoints.toLocaleString('vi-VN')} điểm`;
    }
    return `OVR ${row.bestCardOvr} · ${row.bestCardName} (+${row.bestCardGrade})`;
  };

  return (
    <div className="space-y-5" data-testid="real-leaderboard-view">
      {/* Header & Cross-Device Telemetry */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 border-b border-white/10 pb-3.5 sm:pb-4">
        <div className="space-y-1">
          <div className="text-xs font-bold tracking-wider text-[#a3e635]">
            EA SPORTS FC™ ONLINE PC · HỆ THỐNG XẾP HẠNG LIÊN THIẾT BỊ &amp; ĐA TÀI KHOẢN
          </div>
          <h2
            className="text-3xl font-extrabold italic tracking-wide text-white"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {activeBoardMeta.label.toUpperCase()}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-400 tabular-nums">
            <span>{activeBoardMeta.subtitle}</span>
            <span aria-hidden="true">·</span>
            <strong className="text-white">
              Tổng TK &amp; Thiết bị: {counts.total}
            </strong>
            <span aria-hidden="true">·</span>
            <span>Cloud: {counts.cloud}</span>
            <span aria-hidden="true">·</span>
            <span>Đã đăng ký: {counts.registered}</span>
            <span aria-hidden="true">·</span>
            <span>Thiết bị trực tuyến: {counts.guest}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onRefreshLeaderboard && (
            <button
              type="button"
              data-testid="leaderboard-sync-btn"
              onClick={handleManualRefresh}
              disabled={syncing}
              className="px-3.5 py-2 rounded-lg bg-[#111c14] hover:bg-[#18291d] border border-[#a3e635]/45 text-xs font-extrabold text-[#a3e635] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {syncing ? 'Đang đồng bộ...' : 'Đồng Bộ Mọi Thiết Bị'}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              gameSound.playClick();
              onOpenAuthModal();
            }}
            className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {isGuest ? 'Lưu Đội Khách Thành TK Thật' : 'Đổi / Quản Lý Tài Khoản'}
          </button>
        </div>
      </div>

      {/* 5 Leaderboard Category Segmented Bar */}
      <div
        role="tablist"
        aria-label="Chọn hạng mục bảng xếp hạng"
        className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-2 rounded-xl fco-pc-panel"
      >
        {BOARD_TABS.map((tab) => {
          const active = category === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`lb-tab-${tab.id}`}
              onClick={() => {
                gameSound.playClick();
                setCategory(tab.id);
              }}
              className={`fco-pc-tab-skew px-3 py-2.5 rounded-sm text-xs font-black transition-all cursor-pointer whitespace-nowrap truncate uppercase tracking-wider ${
                active
                  ? 'fco-pc-btn-primary'
                  : 'fco-pc-btn-slate'
              }`}
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Top 3 Cross-Device Leaders Podium Strip */}
      {topThreeRows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 tabular-nums">
          {topThreeRows.map((row, idx) => {
            const rank = idx + 1;
            const elo = row.elo ?? 2050;
            const rankTier = getRankTierForScore(elo);
            const borderClass =
              rank === 1
                ? 'fco-pc-panel-glow border-amber-400/80 shadow-[0_0_28px_rgba(245,158,11,0.28)]'
                : rank === 2
                ? 'fco-pc-panel border-slate-300/50 shadow-[0_0_20px_rgba(203,213,225,0.18)]'
                : 'fco-pc-panel border-amber-700/50 shadow-[0_0_20px_rgba(180,83,9,0.15)]';
            const rankAccent =
              rank === 1
                ? 'fco-text-gold'
                : rank === 2
                ? 'fco-text-silver'
                : 'text-amber-500';

            return (
              <div
                key={`podium_${row.ownerId}`}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-2.5 transition-all ${borderClass}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`text-xs font-black font-mono uppercase tracking-wider ${rankAccent}`}>
                      TOP #{rank} TOÀN MÁY CHỦ
                    </div>
                    <div className="text-base font-bold text-white truncate mt-0.5">
                      {row.managerName}
                      {row.isCurrentUser && (
                        <span className="text-xs font-bold text-[#a3e635]">
                          {' '}
                          (BẠN)
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-xs font-black font-mono shrink-0 px-2 py-0.5 rounded bg-black/60 border border-white/10"
                    style={{ color: rankTier.accentHex }}
                  >
                    {rankTier.shortCode}
                  </span>
                </div>

                <div className="text-sm font-black font-mono text-white truncate tracking-wide">
                  {renderPrimaryMetricSummary(row)}
                </div>

                <div className="text-[11px] text-slate-400 truncate">
                  {formatAccountKind(row)}
                  {row.deviceLabel ? ` · ${row.deviceLabel}` : ''}
                  {` · OVR ${row.squadOvr ?? 130}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Current Active Account Standing + Account Type Filter & Search Bar */}
      <div className="rounded-xl fco-pc-panel p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
        <div className="text-xs text-slate-300 tabular-nums">
          {currentUserEntry ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-400">Vị trí của bạn trên {activeBoardMeta.label}:</span>
              <strong className="text-[#a3e635] font-mono text-sm font-black">
                Hạng #{currentUserEntry.rank} / {fullCategoryRanked.length}
              </strong>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <strong className="text-white">{currentUserEntry.row.managerName}</strong>
              {currentUserEntry.row.deviceLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-400">{currentUserEntry.row.deviceLabel}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono text-amber-300">
                {renderPrimaryMetricSummary(currentUserEntry.row)}
              </span>
            </div>
          ) : (
            <span>Đang đồng bộ thứ hạng tài khoản hiện tại...</span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#060a13] border border-white/10">
            {(
              [
                { id: 'all', label: `Tất cả (${counts.total})` },
                { id: 'cloud', label: `Cloud (${counts.cloud})` },
                { id: 'registered', label: `TK Đăng Ký (${counts.registered})` },
                { id: 'guest', label: `Thiết Bị (${counts.guest})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  gameSound.playClick(0.95);
                  setAccountFilter(f.id);
                }}
                className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer whitespace-nowrap tabular-nums ${
                  accountFilter === f.id
                    ? 'bg-white text-slate-950 font-extrabold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm HLV, thiết bị, cầu thủ..."
            aria-label="Tìm kiếm tài khoản hoặc thiết bị trên bảng xếp hạng"
            className="w-full sm:w-56 px-3 py-1.5 rounded-lg bg-[#060a13] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#a3e635]"
          />
        </div>
      </div>

      {/* Main Cross-Device Ranking Table */}
      <div className="rounded-xl bg-[#0d1424] border border-white/10 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-xs font-semibold text-slate-400">
              <th className="py-3.5 px-4 w-16">Hạng</th>
              <th className="py-3.5 px-4">Tài Khoản HLV &amp; Thiết Bị</th>
              <th className="py-3.5 px-4">Đấu Xếp Hạng (ĐXH)</th>
              <th className="py-3.5 px-4">OVR Đội Hình &amp; Cấp HLV</th>
              <th className="py-3.5 px-4">Giá Trị CLB (BP)</th>
              <th className="py-3.5 px-4">Hội Viên SVIP</th>
              <th className="py-3.5 px-4">Siêu Sao Cao Nhất</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm">
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 px-4 text-center text-xs text-slate-400">
                  Không tìm thấy tài khoản hoặc thiết bị phù hợp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => {
                const rank = rankIndexByOwner.get(row.ownerId) ?? 1;
                const elo = row.elo ?? 2050;
                const rankTier = getRankTierForScore(elo);
                const record = getWinRatePercent(row);
                const squadOvr = row.squadOvr ?? 130;
                const managerLevel = row.managerLevel ?? 25;

                const rankColor =
                  rank === 1
                    ? 'text-amber-400 font-extrabold text-lg'
                    : rank === 2
                    ? 'text-slate-200 font-bold text-base'
                    : rank === 3
                    ? 'text-amber-600 font-bold text-base'
                    : 'text-slate-400 font-mono';

                return (
                  <tr
                    key={row.ownerId}
                    className={
                      row.isCurrentUser
                        ? 'bg-[#a3e635]/10'
                        : 'hover:bg-white/[0.02]'
                    }
                  >
                    <td className={`py-3.5 px-4 tabular-nums ${rankColor}`}>
                      #{rank}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">
                        <span>{row.managerName}</span>
                        {row.isCurrentUser && (
                          <span className="ml-2 text-xs font-semibold text-[#a3e635]">
                            · Đang đăng nhập
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                        <span>{formatAccountKind(row)}</span>
                        {row.deviceLabel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-300">{row.deviceLabel}</span>
                          </>
                        )}
                      </div>
                    </td>

                    <td
                      className={`py-3.5 px-4 tabular-nums ${
                        category === 'ranked' ? 'font-bold text-white' : 'text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="font-bold"
                          style={{ color: rankTier.accentHex }}
                        >
                          {rankTier.name}
                        </span>
                        <span className="font-mono text-xs text-slate-300">
                          · {elo.toLocaleString('vi-VN')} ĐXH
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs font-mono text-slate-400">
                        {record.wins}T - {record.draws}H - {record.losses}B ({record.winRate}%)
                      </div>
                    </td>

                    <td
                      className={`py-3.5 px-4 font-mono tabular-nums ${
                        category === 'squadOvr'
                          ? 'text-cyan-300 font-bold'
                          : 'text-slate-200'
                      }`}
                    >
                      <div>OVR {squadOvr}</div>
                      <div className="text-xs text-slate-400">HLV Lv.{managerLevel}</div>
                    </td>

                    <td
                      className={`py-3.5 px-4 font-mono tabular-nums ${
                        category === 'squadValue'
                          ? 'text-emerald-400 font-bold'
                          : 'text-slate-200'
                      }`}
                    >
                      {formatBpCompact(row.squadValue)}
                    </td>

                    <td
                      className={`py-3.5 px-4 tabular-nums ${
                        category === 'vip' ? 'text-amber-400 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <div>SVIP {row.vipLevel}</div>
                      <div className="text-xs font-mono text-slate-400">
                        {row.vipPoints.toLocaleString('vi-VN')} điểm
                      </div>
                    </td>

                    <td
                      className={`py-3.5 px-4 tabular-nums ${
                        category === 'bestOvr' ? 'text-sky-300 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <div>
                        OVR {row.bestCardOvr} · {row.bestCardName}
                      </div>
                      <div className="text-xs font-mono text-slate-400">
                        {row.bestCardSeason} +{row.bestCardGrade}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
