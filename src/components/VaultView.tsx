import React, { useMemo, useState } from 'react';
import { PACK_CATALOG, PACK_ORDER, PLAYER_TEMPLATES } from '../game/catalog';
import { formatBpCompact, isSerializedSeason } from '../game/rules';
import { gameSound } from '../game/sound';
import { OwnedCard, PackId, PackInventory } from '../game/types';
import { ClubCrestSvg, SeasonBadgeSvg } from './Emblems';
import { PackArtwork } from './PackArtwork';
import { WalkoutInitialMode, WalkoutModal } from './WalkoutModal';

interface VaultViewProps {
  packs: PackInventory;
  bp: number;
  onOpenOnePack: (packId: PackId) => OwnedCard | null;
  onOpenMultiPacks: (packId: PackId, count: number) => OwnedCard[];
  onOpenAllPacks: (packId: PackId) => OwnedCard[];
  onBuyPackWithBp: (packId: PackId, costBp: number) => void;
  onGoToShop?: () => void;
  onGoToFoosball?: () => void;
}

type VaultSubTab = 'inventory' | 'bp_exchange';

// INFINITY_PRIME (iprm_pack) & LE (le_pack) are ultra-rare and strictly excluded from BP Exchange (exclusive to Foosball 10,000 pts!)
const EXCHANGEABLE_PACK_IDS: PackId[] = PACK_ORDER.filter(
  (id) => id !== 'iprm_pack' && id !== 'le_pack'
);

const BP_SHOP_PRICES: Record<PackId, number> = {
  cu_fodder: 35_000_000_000,
  ucl_25: 70_000_000_000,
  up_pack: 95_000_000_000,
  bdo_pack: 115_000_000_000,
  vb_26: 135_000_000_000,
  tots_26: 155_000_000_000,
  toty_26: 210_000_000_000,
  ucl_26: 275_000_000_000,
  icon_tm: 320_000_000_000,
  le_pack: 430_000_000_000,
  iprm_pack: 450_000_000_000,
};

export const VaultView: React.FC<VaultViewProps> = ({
  packs,
  bp,
  onOpenOnePack,
  onOpenMultiPacks,
  onOpenAllPacks,
  onBuyPackWithBp,
  onGoToShop,
  onGoToFoosball,
}) => {
  const ownedPackIds = useMemo(
    () => PACK_ORDER.filter((id) => (packs[id] ?? 0) > 0),
    [packs]
  );

  const [subTab, setSubTab] = useState<VaultSubTab>('inventory');
  const [selectedPackId, setSelectedPackId] = useState<PackId | null>(
    () => ownedPackIds[0] ?? 'ucl_26'
  );
  const [tunnelState, setTunnelState] = useState<{
    packId: PackId;
    mode: WalkoutInitialMode;
    multiCount?: number;
  } | null>(null);

  const activePackId: PackId | null = useMemo(() => {
    if (selectedPackId && (packs[selectedPackId] ?? 0) > 0) return selectedPackId;
    return ownedPackIds[0] ?? null;
  }, [selectedPackId, packs, ownedPackIds]);

  const activePack = activePackId ? PACK_CATALOG[activePackId] : null;
  const activePackCount = activePackId ? packs[activePackId] ?? 0 : 0;
  const quickBatchCount = Math.min(5, activePackCount);

  const topPullableStars = useMemo(() => {
    if (!activePack) return [];
    const allowedSet = new Set(activePack.allowedSeasons);
    return PLAYER_TEMPLATES.filter(
      (t) =>
        allowedSet.has(t.season) &&
        t.baseOvr >= activePack.minOvr &&
        t.baseOvr <= activePack.maxOvr
    )
      .sort((a, b) => b.baseOvr - a.baseOvr || b.baseValueBp - a.baseValueBp)
      .slice(0, 6);
  }, [activePack]);

  const totalPacksCount = PACK_ORDER.reduce((sum, id) => sum + (packs[id] ?? 0), 0);

  return (
    <div className="space-y-4 pb-6" data-testid="pc-vault-view">
      {/* Compact FC Online PC Vault Header & Sub-Tabs */}
      <div className="rounded-xl fco-pc-panel px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              gameSound.playClick();
              setSubTab('inventory');
            }}
            className={`fco-pc-tab-skew min-h-[38px] px-4 py-1.5 text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap tabular-nums uppercase tracking-wide ${
              subTab === 'inventory'
                ? 'fco-pc-btn-primary'
                : 'fco-pc-btn-slate'
            }`}
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            <span>Kho Gói Thẻ ({totalPacksCount})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              gameSound.playClick();
              setSubTab('bp_exchange');
            }}
            className={`fco-pc-tab-skew min-h-[38px] px-4 py-1.5 text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap tabular-nums uppercase tracking-wide ${
              subTab === 'bp_exchange'
                ? 'fco-pc-btn-gold'
                : 'fco-pc-btn-slate'
            }`}
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            <span>Đổi Gói Thẻ Bằng BP ({EXCHANGEABLE_PACK_IDS.length} loại)</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 tabular-nums shrink-0">
          <div className="px-3 py-1.5 rounded bg-[#060a13] border border-white/10">
            Tổng gói: <strong className="text-[#a3e635] font-bold">{totalPacksCount}</strong>
          </div>
          {onGoToShop && (
            <button
              type="button"
              onClick={() => {
                gameSound.playClick();
                onGoToShop();
              }}
              className="min-h-[38px] px-3.5 py-1.5 rounded-md fco-pc-btn-gold text-xs transition-transform cursor-pointer whitespace-nowrap"
            >
              Cửa Hàng &amp; Shop Tarpoi →
            </button>
          )}
        </div>
      </div>

      {/* SUB-TAB 1: OWNED PACKS INVENTORY & PC PACK INSPECTOR */}
      {subTab === 'inventory' && (
        <>
          {ownedPackIds.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#0a101d] p-8 text-center space-y-3">
              <div className="text-lg font-bold text-white">
                Kho gói thẻ của CLB hiện đang trống
              </div>
              <p className="text-sm text-slate-400">
                Hãy nhận quà Đặc Quyền SVIP, nhập Gift Code sảnh chính hoặc đổi thêm gói thẻ mùa thật bằng BP ngay!
              </p>
              <button
                type="button"
                onClick={() => {
                  gameSound.playClick();
                  setSubTab('bp_exchange');
                }}
                className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
              >
                Đổi Gói Thẻ Bằng BP Ngay →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-stretch">
              {/* LEFT 7 COLS: OWNED PACKS INVENTORY GRID */}
              <div className="sm:col-span-7 rounded-xl fco-pc-panel p-3.5 sm:p-4">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-3 pb-2 border-b border-white/10 tabular-nums">
                  <span className="text-[#a3e635] tracking-wider uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    DANH SÁCH GÓI THẺ TRONG KHO ({ownedPackIds.length} LOẠI)
                  </span>
                  <span className="text-slate-400 text-[11px] hidden md:inline">Chọn gói để xé thẻ &amp; lật thẻ chuẩn PC</span>
                </div>

                <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-3">
                  {ownedPackIds.map((packId) => {
                    const count = packs[packId] ?? 0;
                    const pack = PACK_CATALOG[packId];
                    const isSelected = activePackId === packId;

                    return (
                      <div
                        key={packId}
                        className={`flex flex-col items-center justify-between rounded-xl p-2.5 sm:p-3 border transition-all min-w-0 ${
                          isSelected
                            ? 'bg-[#0f1d33] border-[#a3e635] shadow-[0_0_24px_rgba(163,230,53,0.22)] ring-1 ring-[#a3e635]/60'
                            : 'bg-[#060a13]/90 border-white/10 hover:border-white/30 hover:bg-[#090f1d]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            gameSound.playClick();
                            setSelectedPackId(packId);
                          }}
                          aria-label={`Chọn ${pack.name} số lượng ${count}`}
                          className="flex flex-col items-center text-center w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3e635] rounded-lg"
                        >
                          <div className="lg:hidden">
                            <PackArtwork packId={packId} quantity={count} size="sm" />
                          </div>
                          <div className="hidden lg:block">
                            <PackArtwork packId={packId} quantity={count} size="md" />
                          </div>
                          <div
                            className="mt-2 text-xs sm:text-sm font-bold text-white line-clamp-1 uppercase tracking-wide"
                            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                          >
                            {pack.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                            Số lượng: <strong className="text-amber-300 font-bold">{count}</strong> gói
                          </div>
                        </button>

                        <div className="w-full mt-2.5 pt-2.5 border-t border-white/10 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              gameSound.playClick(1.15);
                              setSelectedPackId(packId);
                              setTunnelState({ packId, mode: 'open_one' });
                            }}
                            className="flex-1 min-h-[38px] py-1.5 px-2.5 rounded fco-pc-btn-primary text-xs transition-transform cursor-pointer whitespace-nowrap"
                          >
                            Mở 1 gói
                          </button>
                          {count >= 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                gameSound.playClick(1.2);
                                setSelectedPackId(packId);
                                setTunnelState({
                                  packId,
                                  mode: 'open_multi',
                                  multiCount: Math.min(5, count),
                                });
                              }}
                              className="min-h-[38px] py-1.5 px-2.5 rounded fco-pc-btn-gold text-xs transition-transform cursor-pointer whitespace-nowrap tabular-nums"
                            >
                              x{Math.min(5, count)}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT 5 COLS: FC ONLINE PC PACK INSPECTOR & MULTI-OPEN CONSOLE */}
              {activePack && activePackId && (
                <div
                  data-testid="pc-pack-inspector"
                  className="sm:col-span-5 rounded-xl fco-pc-panel-glow p-4 sm:p-5 flex flex-col justify-between shadow-2xl relative overflow-hidden"
                >
                  <div className="absolute inset-0 fco-pack-stage-glow pointer-events-none" />

                  <div className="relative z-10">
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <SeasonBadgeSvg season={activePack.seasonCode} className="w-7 h-4.5" />
                        <span className="text-xs font-bold text-amber-300 tabular-nums tracking-wide">
                          OVR {activePack.minOvr}–{activePack.maxOvr}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-white tabular-nums">
                        Đang có: <strong className="text-[#a3e635] font-black">{activePackCount}</strong> gói
                      </span>
                    </div>

                    <div className="mt-4 flex flex-col sm:flex-row items-center gap-4 p-3 rounded-lg bg-black/40 border border-white/10">
                      <div className="shrink-0 drop-shadow-[0_8px_16px_rgba(0,0,0,0.8)]">
                        <PackArtwork
                          packId={activePackId}
                          quantity={activePackCount}
                          size="md"
                        />
                      </div>
                      <div className="min-w-0 text-center sm:text-left space-y-1.5">
                        <h3
                          className="text-2xl font-bold italic fco-text-gold leading-tight"
                          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                        >
                          {activePack.name}
                        </h3>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {activePack.subtitle}
                        </p>
                        <div className="text-[11px] text-emerald-300 font-bold tabular-nums">
                          Cấp thẻ mở ra: +{activePack.guaranteedMinGrade} ~ +{activePack.maxInitialGrade}
                          {activePack.allowedSeasons.some((s) => isSerializedSeason(s))
                            ? ' · Khắc số thứ tự độc bản #0001+'
                            : ''}
                        </div>
                      </div>
                    </div>

                    {/* Top Pullable Stars Preview Table */}
                    <div className="mt-4 pt-3.5 border-t border-white/10">
                      <div
                        className="text-[11px] font-bold tracking-wider text-[#a3e635] mb-2 uppercase"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        DANH SÁCH SIÊU SAO TÂM ĐIỂM TRONG GÓI
                      </div>
                      <div className="space-y-1.5">
                        {topPullableStars.map((tpl) => (
                          <div
                            key={`preview_${tpl.id}`}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#060a13]/80 border border-white/10 text-xs hover:border-[#a3e635]/40 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <SeasonBadgeSvg season={tpl.season} className="w-5 h-3.5 shrink-0" />
                              <ClubCrestSvg clubCode={tpl.clubCode} className="w-4 h-4 shrink-0" />
                              <span className="font-semibold text-white truncate">
                                {tpl.name}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                {tpl.position}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 tabular-nums">
                              <span className="font-mono text-[11px] text-emerald-400">
                                {formatBpCompact(tpl.baseValueBp)}
                              </span>
                              <span className="text-amber-300 font-extrabold text-xs">
                                {tpl.baseOvr}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 3 Official FC Online PC Pack Opening Actions */}
                  <div className="relative z-10 mt-5 pt-4 border-t border-white/10 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        data-testid="vault-open-one-btn"
                        disabled={activePackCount < 1}
                        onClick={() => {
                          gameSound.playClick(1.15);
                          setTunnelState({ packId: activePackId, mode: 'open_one' });
                        }}
                        className="min-h-[44px] py-2.5 px-4 rounded fco-pc-btn-primary disabled:opacity-50 text-xs sm:text-sm tracking-wider cursor-pointer whitespace-nowrap"
                      >
                        Mở ngay 1 gói
                      </button>

                      <button
                        type="button"
                        data-testid="vault-open-multi-btn"
                        disabled={activePackCount < 2}
                        onClick={() => {
                          gameSound.playClick(1.2);
                          setTunnelState({
                            packId: activePackId,
                            mode: 'open_multi',
                            multiCount: quickBatchCount,
                          });
                        }}
                        className={`min-h-[44px] py-2.5 px-4 rounded text-xs sm:text-sm tracking-wider transition-all whitespace-nowrap tabular-nums uppercase font-extrabold ${
                          activePackCount >= 2
                            ? 'fco-pc-btn-gold cursor-pointer'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                        }`}
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        Mở nhanh x{Math.max(2, quickBatchCount)} gói
                      </button>
                    </div>

                    <button
                      type="button"
                      data-testid="vault-open-all-btn"
                      disabled={activePackCount < 2}
                      onClick={() => {
                        gameSound.playClick(1.22);
                        setTunnelState({ packId: activePackId, mode: 'open_all' });
                      }}
                      className={`w-full min-h-[44px] py-2.5 px-4 rounded text-xs sm:text-sm tracking-wider transition-all whitespace-nowrap tabular-nums uppercase font-extrabold ${
                        activePackCount >= 2
                          ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-[0_4px_20px_rgba(245,158,11,0.45)] cursor-pointer'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                      }`}
                      style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                    >
                      Mở tất cả ({activePackCount} gói) · Bàn Lật Thẻ PC
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* SUB-TAB 2: BP PACK EXCHANGE STORE (EXCLUDES IPRM & LE — EXCLUSIVE TO FOOSBALL 10,000 PTS) */}
      {subTab === 'bp_exchange' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-[#0a101d] border border-amber-400/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-amber-300">Lưu ý Mùa Hiếm Độc Quyền:</strong> Hai gói{' '}
              <strong className="text-white">Infinite Prime (IPRM)</strong> &amp;{' '}
              <strong className="text-purple-300">Legendary Eternal (LE)</strong> không mở đổi bằng BP và không có trong Nhiệm Vụ Hằng Ngày — chỉ nhận duy nhất tại{' '}
              <strong className="text-[#a3e635]">Mốc 10.000 Điểm Sự Kiện Bi Lắc</strong>.
            </div>
            {onGoToFoosball && (
              <button
                type="button"
                onClick={() => {
                  gameSound.playClick(1.1);
                  onGoToFoosball();
                }}
                className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                Săn Mốc 10.000Đ Bi Lắc →
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {EXCHANGEABLE_PACK_IDS.map((packId) => {
              const pack = PACK_CATALOG[packId];
              const cost = BP_SHOP_PRICES[packId];
              const canAfford = bp >= cost;
              const currentQty = packs[packId] ?? 0;

              return (
                <div
                  key={`shop_${packId}`}
                  className="flex flex-col justify-between rounded-xl bg-[#0a101d] border border-white/10 p-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 tabular-nums">
                      <SeasonBadgeSvg season={pack.seasonCode} className="w-7 h-4 shrink-0" />
                      <span className="text-[11px] font-bold text-amber-400">
                        OVR {pack.minOvr}–{pack.maxOvr}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white line-clamp-2">{pack.name}</div>
                    <div className="text-xs text-slate-400 tabular-nums">
                      Đang có trong kho: <strong className="text-white">{currentQty}</strong> gói
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2 tabular-nums">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {formatBpCompact(cost)}
                    </span>
                    <button
                      type="button"
                      disabled={!canAfford}
                      onClick={() => {
                        gameSound.playClick(1.1);
                        onBuyPackWithBp(packId, cost);
                        setSelectedPackId(packId);
                      }}
                      className={`px-3 py-1.5 rounded-md text-xs font-extrabold transition-colors whitespace-nowrap ${
                        canAfford
                          ? 'bg-[#a3e635] hover:bg-[#bef264] text-slate-950 cursor-pointer'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Đổi 1 gói
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Walkout Tunnel & PC Multi-Card Flip Modal */}
      {tunnelState && (
        <WalkoutModal
          packId={tunnelState.packId}
          availableCount={packs[tunnelState.packId] ?? 0}
          initialMode={tunnelState.mode}
          multiCount={tunnelState.multiCount}
          onOpenOne={onOpenOnePack}
          onOpenMulti={onOpenMultiPacks}
          onOpenAll={onOpenAllPacks}
          onClose={() => setTunnelState(null)}
        />
      )}
    </div>
  );
};
