import React, { useMemo, useState } from 'react';
import { PACK_CATALOG } from '../game/catalog';
import { formatBpCompact, ShopPurchaseResult } from '../game/rules';
import { SHOP_OFFERS, ShopOffer, ShopSectionId } from '../game/shopCatalog';
import { gameSound } from '../game/sound';
import { PackInventory } from '../game/types';
import { SeasonBadgeSvg } from './Emblems';
import { PackArtwork } from './PackArtwork';

interface ShopViewProps {
  fc: number;
  bp: number;
  starPoints: number;
  packs: PackInventory;
  onPurchaseOffer: (offerId: string) => ShopPurchaseResult;
  onGoToVault: () => void;
  onGoToTopUp: () => void;
}

type ShopFilterTab = 'ALL' | ShopSectionId;

const SECTION_META: Record<
  ShopSectionId,
  { label: string; subtitle: string }
> = {
  packs: {
    label: 'Gói Thẻ & Combo Mùa Giải',
    subtitle: 'Mua gói thẻ Infinite Prime, Legendary Eternal (có Số Thứ Tự #0001+), 26UCL, 26VB, ICON TM kèm thưởng Tarpoi',
  },
  bp_chests: {
    label: 'Rương & Gói BP Trắng',
    subtitle: 'Mở rương BP trắng cố định hoặc Rương May Mắn BP phục vụ mua sắm TTCN và Bảo vệ cấp đập thẻ +8 trở lên',
  },
  buy_tarpoi: {
    label: 'Mua Tarpoi (Điểm Sao)',
    subtitle: 'Quy đổi trực tiếp Điểm Sao Tarpoi bằng FC hoặc BP để tích lũy đổi siêu phẩm trong Shop Tarpoi',
  },
  tarpoi_shop: {
    label: 'Shop Tarpoi Độc Quyền',
    subtitle: 'Dùng Điểm Sao Tarpoi đổi trực tiếp Gói LE 135–140, Infinite Prime, ICON TM và Rương Bảo Vệ Đập Thẻ +8',
  },
};

function TarpoiStarIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#1E1B18" stroke="#F59E0B" strokeWidth="1.6" />
      <polygon
        points="12,3.6 14.4,8.7 20,9.4 15.9,13.3 17,18.9 12,16.1 7,18.9 8.1,13.3 4,9.4 9.6,8.7"
        fill="#FACC15"
        stroke="#FEF08A"
        strokeWidth="0.9"
      />
    </svg>
  );
}

function BpChestArtwork({ isLucky }: { isLucky: boolean }) {
  return (
    <div className="w-24 h-28 rounded-xl bg-gradient-to-b from-[#132920] via-[#0c1a17] to-[#070f12] border border-emerald-400/45 flex flex-col items-center justify-center p-2 shadow-lg">
      <svg viewBox="0 0 64 64" className="w-14 h-14" aria-hidden="true">
        <rect
          x="8"
          y="22"
          width="48"
          height="32"
          rx="5"
          fill="#064E3B"
          stroke={isLucky ? '#FACC15' : '#34D399'}
          strokeWidth="2.5"
        />
        <path
          d="M10 24 L54 24 L50 13 L14 13 Z"
          fill="#047857"
          stroke={isLucky ? '#FEF08A' : '#6EE7B7'}
          strokeWidth="2.2"
        />
        <rect x="27" y="20" width="10" height="12" rx="2" fill="#FACC15" stroke="#FEF9C3" strokeWidth="1.5" />
        <circle cx="32" cy="43" r="6" fill="#10B981" stroke="#A7F3D0" strokeWidth="1.5" />
      </svg>
      <span className="mt-1 text-[10px] font-extrabold tracking-wider text-emerald-300">
        {isLucky ? 'LUCKY BP' : 'RƯƠNG BP'}
      </span>
    </div>
  );
}

function TarpoiBundleArtwork({ isShopRedeem }: { isShopRedeem: boolean }) {
  return (
    <div
      className={`w-24 h-28 rounded-xl border flex flex-col items-center justify-center p-2 shadow-lg ${
        isShopRedeem
          ? 'bg-gradient-to-b from-[#2c1d08] via-[#181209] to-[#0a0d16] border-amber-400/65'
          : 'bg-gradient-to-b from-[#1e2638] via-[#101829] to-[#080d18] border-amber-300/45'
      }`}
    >
      <TarpoiStarIcon className="w-14 h-14 drop-shadow-[0_4px_12px_rgba(250,204,21,0.45)]" />
      <span className="mt-1.5 text-[10px] font-extrabold tracking-wider text-amber-300">
        {isShopRedeem ? 'SHOP TARPOI' : 'ĐIỂM SAO'}
      </span>
    </div>
  );
}

export const ShopView: React.FC<ShopViewProps> = ({
  fc,
  bp,
  starPoints,
  packs,
  onPurchaseOffer,
  onGoToVault,
  onGoToTopUp,
}) => {
  const [activeSection, setActiveSection] = useState<ShopFilterTab>('ALL');
  const [banner, setBanner] = useState<{
    ok: boolean;
    message: string;
    packsAdded: number;
  } | null>(null);

  const totalOwnedPacks = useMemo(
    () => Object.values(packs).reduce((s, n) => s + (n ?? 0), 0),
    [packs]
  );

  const visibleSections: ShopSectionId[] = useMemo(() => {
    if (activeSection === 'ALL') {
      return ['packs', 'bp_chests', 'buy_tarpoi', 'tarpoi_shop'];
    }
    return [activeSection];
  }, [activeSection]);

  const canAffordOffer = (offer: ShopOffer): boolean => {
    if (offer.currency === 'fc') return fc >= offer.cost;
    if (offer.currency === 'bp') return bp >= offer.cost;
    return starPoints >= offer.cost;
  };

  const formatCostLabel = (offer: ShopOffer): string => {
    if (offer.currency === 'fc') return `${offer.cost.toLocaleString('vi-VN')} FC`;
    if (offer.currency === 'bp') return formatBpCompact(offer.cost);
    return `${offer.cost.toLocaleString('vi-VN')} Tarpoi`;
  };

  const handleBuy = (offer: ShopOffer) => {
    const res = onPurchaseOffer(offer.id);
    if (!res.ok) {
      gameSound.playClick(0.75);
      setBanner({
        ok: false,
        message: res.error ?? 'Giao dịch không thành công.',
        packsAdded: 0,
      });
      return;
    }

    gameSound.playUpgradeOutcome(true);
    const parts: string[] = [];
    if (res.packsAdded > 0) {
      parts.push(`+${res.packsAdded} gói thẻ vào Kho Vật Phẩm`);
    }
    if (res.bpReceived > 0) {
      parts.push(`+${formatBpCompact(res.bpReceived)}`);
    }
    if (res.starPointsReceived > 0) {
      parts.push(`+${res.starPointsReceived.toLocaleString('vi-VN')} Tarpoi`);
    }

    setBanner({
      ok: true,
      message: `Mua thành công "${offer.title}": ${parts.join(' · ')}!`,
      packsAdded: res.packsAdded,
    });
  };

  return (
    <div data-testid="fco-shop-view" className="space-y-4 pb-6">
      {/* Compact FC Online PC Store Sub-Nav & Tarpoi Strip */}
      <div className="rounded-xl fco-pc-panel px-3.5 py-2.5 sm:px-4 sm:py-3 space-y-2.5 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: 'TẤT CẢ (24)' },
                { id: 'packs', label: 'GÓI THẺ & COMBO' },
                { id: 'bp_chests', label: 'RƯƠNG BP' },
                { id: 'buy_tarpoi', label: 'MUA TARPOI' },
                { id: 'tarpoi_shop', label: 'SHOP TARPOI' },
              ] as Array<{ id: ShopFilterTab; label: string }>
            ).map((tab) => {
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    gameSound.playClick();
                    setActiveSection(tab.id);
                  }}
                  className={`fco-pc-tab-skew min-h-[36px] px-3.5 py-1.5 text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider ${
                    active
                      ? 'fco-pc-btn-gold'
                      : 'fco-pc-btn-slate'
                  }`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 tabular-nums shrink-0">
            <div
              data-testid="shop-tarpoi-balance"
              className="px-3 py-1.5 rounded bg-[#1c1507] border border-amber-400/75 flex items-center gap-1.5 shadow-inner"
            >
              <TarpoiStarIcon className="w-4 h-4 shrink-0" />
              <span className="text-[11px] font-black text-amber-200">TARPOI</span>
              <strong className="font-mono text-xs sm:text-sm text-amber-300">
                {starPoints.toLocaleString('vi-VN')}
              </strong>
            </div>

            <button
              type="button"
              onClick={() => {
                gameSound.playClick();
                onGoToVault();
              }}
              className="min-h-[36px] px-3 py-1.5 rounded fco-pc-btn-primary text-xs transition-transform cursor-pointer whitespace-nowrap"
            >
              Kho Vật Phẩm ({totalOwnedPacks})
            </button>

            <button
              type="button"
              onClick={() => {
                gameSound.playClick();
                onGoToTopUp();
              }}
              className="min-h-[36px] px-3 py-1.5 rounded fco-pc-btn-slate text-amber-300 font-bold text-xs transition-transform cursor-pointer whitespace-nowrap"
            >
              SVIP
            </button>
          </div>
        </div>

        {banner && (
          <div
            role="status"
            data-testid="shop-purchase-banner"
            className={`mt-4 px-4 py-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 text-xs font-semibold ${
              banner.ok
                ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                : 'bg-rose-500/15 border-rose-400/50 text-rose-200'
            }`}
          >
            <span>{banner.message}</span>
            {banner.ok && banner.packsAdded > 0 && (
              <button
                type="button"
                onClick={() => {
                  gameSound.playClick(1.1);
                  onGoToVault();
                }}
                className="px-3 py-1.5 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
              >
                Mở Gói Ngay Tại Kho Vật Phẩm →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Store Sections */}
      {visibleSections.map((secId) => {
        const meta = SECTION_META[secId];
        const secOffers = SHOP_OFFERS.filter((o) => o.section === secId);

        return (
          <section key={secId} className="space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/10 pb-2.5">
              <div>
                <h3
                  className="text-2xl font-bold italic text-white tracking-wide"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {meta.label}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{meta.subtitle}</p>
              </div>
              <span className="text-xs text-slate-400 tabular-nums shrink-0">
                {secOffers.length} vật phẩm
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {secOffers.map((offer) => {
                const affordable = canAffordOffer(offer);
                const isLuckyBp = Boolean(offer.bpLuckyMax && offer.bpLuckyMax > offer.bpGranted);

                return (
                  <div
                    key={offer.id}
                    data-testid={`shop-offer-${offer.id}`}
                    className={`rounded-xl p-4 border flex flex-col justify-between transition-all ${
                      offer.section === 'tarpoi_shop'
                        ? 'fco-pc-panel-glow border-amber-400/50 hover:border-amber-400 hover:shadow-[0_0_24px_rgba(245,158,11,0.25)]'
                        : 'fco-pc-panel hover:border-[#a3e635]/50 hover:shadow-[0_0_24px_rgba(163,230,53,0.18)]'
                    }`}
                  >
                    <div>
                      {/* Kicker Line (Clean unboxed metadata per anti-slop rules) */}
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {offer.featuredSeason && (
                            <SeasonBadgeSvg
                              season={offer.featuredSeason}
                              className="w-6 h-4 shrink-0"
                            />
                          )}
                          <span className="font-semibold text-amber-300 truncate">
                            {offer.badge ?? meta.label}
                          </span>
                        </div>
                        <span className="font-mono text-slate-400 shrink-0 uppercase tracking-wider text-[10px]">
                          {offer.currency === 'tarpoi'
                            ? 'Đổi bằng Tarpoi'
                            : offer.currency === 'fc'
                            ? 'Mua bằng FC'
                            : 'Đổi bằng BP'}
                        </span>
                      </div>

                      {/* Main Offer Body */}
                      <div className="flex items-start gap-3.5">
                        <div className="shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.7)]">
                          {offer.featuredPackId ? (
                            <PackArtwork
                              packId={offer.featuredPackId}
                              quantity={offer.packsGranted[0]?.count}
                              size="sm"
                            />
                          ) : offer.section === 'bp_chests' ? (
                            <BpChestArtwork isLucky={isLuckyBp} />
                          ) : (
                            <TarpoiBundleArtwork
                              isShopRedeem={offer.section === 'tarpoi_shop'}
                            />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4
                            className="text-base font-bold text-white leading-snug tracking-wide uppercase"
                            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                          >
                            {offer.title}
                          </h4>
                          <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                            {offer.subtitle}
                          </p>

                          {/* Explicit Itemized Contents */}
                          <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1 text-xs tabular-nums">
                            {offer.packsGranted.map((pg) => (
                              <div
                                key={`${offer.id}_${pg.packId}`}
                                className="text-slate-200 font-medium"
                              >
                                • {PACK_CATALOG[pg.packId].name}{' '}
                                <strong className="text-[#a3e635]">x{pg.count}</strong>
                              </div>
                            ))}
                            {offer.bpGranted > 0 && (
                              <div className="text-emerald-300 font-mono">
                                •{' '}
                                {isLuckyBp && offer.bpLuckyMax
                                  ? `Ngẫu nhiên ${formatBpCompact(offer.bpGranted)} ~ ${formatBpCompact(
                                      offer.bpLuckyMax
                                    )}`
                                  : `+${formatBpCompact(offer.bpGranted)}`}
                              </div>
                            )}
                            {offer.starPointsGranted > 0 && (
                              <div className="text-amber-300 font-mono font-semibold">
                                • +{offer.starPointsGranted.toLocaleString('vi-VN')} Tarpoi (Điểm Sao)
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Price & Action CTA */}
                    <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                      <div className="tabular-nums">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Giá niêm yết</div>
                        <div
                          className={`text-sm font-black font-mono tracking-tight ${
                            offer.currency === 'tarpoi'
                              ? 'text-amber-300'
                              : offer.currency === 'fc'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {formatCostLabel(offer)}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={!affordable}
                        aria-label={`Mua ${offer.title} giá ${formatCostLabel(offer)}`}
                        onClick={() => handleBuy(offer)}
                        className={`fco-pc-tab-skew min-h-[40px] px-4 py-2 text-xs font-extrabold uppercase tracking-wide transition-all whitespace-nowrap ${
                          affordable
                            ? offer.currency === 'tarpoi'
                              ? 'fco-pc-btn-gold cursor-pointer'
                              : offer.currency === 'fc'
                              ? 'fco-pc-btn-primary cursor-pointer'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-[0_4px_16px_rgba(16,185,129,0.4)] cursor-pointer'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                        }`}
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        <span>
                          {affordable
                            ? offer.currency === 'tarpoi'
                              ? 'Đổi Tarpoi'
                              : 'Mua ngay'
                            : offer.currency === 'tarpoi'
                            ? 'Thiếu Tarpoi'
                            : offer.currency === 'fc'
                            ? 'Thiếu FC'
                            : 'Thiếu BP'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};
