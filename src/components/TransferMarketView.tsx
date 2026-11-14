import React, { useEffect, useMemo, useState } from 'react';
import { PLAYER_TEMPLATES, PLAYER_TEMPLATE_MAP } from '../game/catalog';
import {
  ALL_MARKET_GRADES,
  MAX_CARD_GRADE,
  calculateMarketOrderBook,
  calculateMarketSellQuote,
  computeCardOvr,
  formatBpCompact,
  getMarketPriceBp,
} from '../game/rules';
import { gameSound } from '../game/sound';
import {
  GlobalServerRules,
  MarketPurchaseResult,
  MarketSaleResult,
  OwnedCard,
  PlayerTemplate,
  PositionCode,
  SeasonCode,
} from '../game/types';
import { ClubCrestSvg, NationFlagSvg, SeasonBadgeSvg } from './Emblems';
import {
  PlayerCardView,
  getGradeBadgeStyle,
  getPositionColorHex,
} from './PlayerCardView';
import { TraitBadges } from './TraitBadges';

interface TransferMarketViewProps {
  profileId: string;
  bp: number;
  vipLevel: number;
  cards: OwnedCard[];
  serverRules?: GlobalServerRules;
  initialTemplateId?: string | null;
  onBuyCard: (templateId: string, grade: number) => MarketPurchaseResult;
  onSellCard: (cardUid: string) => MarketSaleResult;
  onGoToSquad: () => void;
  onSelectCardForUpgrade: (cardUid: string) => void;
}

type MarketTab = 'search' | 'sell' | 'transactions' | 'watchlist';
type SeasonFilter = 'ALL' | SeasonCode;
type ExactPositionFilter = 'ALL' | PositionCode;
type MarketSort = 'ovr_desc' | 'price_asc' | 'price_desc' | 'salary_asc';

interface MarketTransactionRecord {
  id: string;
  type: 'BUY' | 'SELL';
  templateId: string;
  playerName: string;
  season: SeasonCode;
  seasonLabel: string;
  grade: number;
  ovr: number;
  grossBp: number;
  taxBp: number;
  netBp: number;
  timestamp: number;
}

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

const EXACT_POSITIONS: ExactPositionFilter[] = [
  'ALL',
  'ST',
  'CF',
  'LW',
  'RW',
  'CAM',
  'CM',
  'CDM',
  'CB',
  'LB',
  'RB',
  'GK',
];

const SEASON_TABS: Array<{ id: SeasonFilter; label: string }> = [
  { id: 'ALL', label: 'Tất cả mùa' },
  { id: 'LE', label: 'LE' },
  { id: 'INFINITY_PRIME', label: 'IPRM' },
  { id: 'ICON_TM', label: 'ICON TM' },
  { id: '26VB', label: '26VB' },
  { id: '26UCL', label: '26UCL' },
  { id: '26TOTY', label: '26TOTY' },
  { id: '26TOTS', label: '26TOTS' },
  { id: 'BDO', label: 'BDO' },
  { id: 'UP', label: 'UP' },
  { id: '25UCL', label: '25UCL' },
  { id: 'CU', label: 'CU' },
];

function getLobbyStateKey(profileId: string): string {
  return `fco_newgen_lobby_v2_${profileId}`;
}

function getMarketTxKey(profileId: string): string {
  return `fco_pc_market_tx_${profileId}`;
}

function readWatchlistIds(profileId: string): string[] {
  try {
    const raw = localStorage.getItem(getLobbyStateKey(profileId));
    if (!raw) return DEFAULT_WATCHLIST_IDS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.watchlistTemplateIds)) {
      return parsed.watchlistTemplateIds.filter((id: unknown): id is string => typeof id === 'string');
    }
    return DEFAULT_WATCHLIST_IDS;
  } catch {
    return DEFAULT_WATCHLIST_IDS;
  }
}

function writeWatchlistIds(profileId: string, nextIds: string[]): void {
  try {
    const key = getLobbyStateKey(profileId);
    const raw = localStorage.getItem(key);
    const existing = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      key,
      JSON.stringify({
        ...(existing && typeof existing === 'object' ? existing : {}),
        watchlistTemplateIds: nextIds,
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

function readMarketTransactions(profileId: string): MarketTransactionRecord[] {
  try {
    const raw = localStorage.getItem(getMarketTxKey(profileId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMarketTransactions(profileId: string, rows: MarketTransactionRecord[]): void {
  try {
    localStorage.setItem(getMarketTxKey(profileId), JSON.stringify(rows.slice(0, 60)));
  } catch {
    // Ignore storage quota errors
  }
}

export const TransferMarketView: React.FC<TransferMarketViewProps> = ({
  profileId,
  bp,
  vipLevel,
  cards,
  serverRules,
  initialTemplateId,
  onBuyCard,
  onSellCard,
  onGoToSquad,
  onSelectCardForUpgrade,
}) => {
  const [activeTab, setActiveTab] = useState<MarketTab>('search');
  const [selectedGrade, setSelectedGrade] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [clubSellQuery, setClubSellQuery] = useState<string>('');
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('ALL');
  const [posFilter, setPosFilter] = useState<ExactPositionFilter>('ALL');
  const [sortBy, setSortBy] = useState<MarketSort>('ovr_desc');
  const [affordableOnly, setAffordableOnly] = useState<boolean>(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);
  const [visibleLimit, setVisibleLimit] = useState<number>(32);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    () => initialTemplateId ?? 'le_cr7'
  );
  const [watchlistIds, setWatchlistIds] = useState<string[]>(() => readWatchlistIds(profileId));
  const [txHistory, setTxHistory] = useState<MarketTransactionRecord[]>(() =>
    readMarketTransactions(profileId)
  );
  const [feedbackBanner, setFeedbackBanner] = useState<{
    tone: 'success' | 'error';
    message: string;
    purchasedUid?: string;
    purchasedGrade?: number;
  } | null>(null);

  useEffect(() => {
    setWatchlistIds(readWatchlistIds(profileId));
    setTxHistory(readMarketTransactions(profileId));
  }, [profileId]);

  useEffect(() => {
    if (initialTemplateId && PLAYER_TEMPLATE_MAP[initialTemplateId]) {
      setSelectedTemplateId(initialTemplateId);
      setActiveTab('search');
    }
  }, [initialTemplateId]);

  const toggleWatchlist = (templateId: string) => {
    gameSound.playClick(1.08);
    setWatchlistIds((prev) => {
      const next = prev.includes(templateId)
        ? prev.filter((id) => id !== templateId)
        : [templateId, ...prev];
      writeWatchlistIds(profileId, next);
      return next;
    });
  };

  const appendTransaction = (entry: MarketTransactionRecord) => {
    setTxHistory((prev) => {
      const next = [entry, ...prev].slice(0, 60);
      writeMarketTransactions(profileId, next);
      return next;
    });
  };

  const filteredTemplates = useMemo<PlayerTemplate[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const basePool =
      activeTab === 'watchlist'
        ? PLAYER_TEMPLATES.filter((t) => watchlistIds.includes(t.id))
        : PLAYER_TEMPLATES;

    const list = basePool.filter((tpl) => {
      if (seasonFilter !== 'ALL' && tpl.season !== seasonFilter) return false;
      if (posFilter !== 'ALL' && tpl.position !== posFilter) return false;
      if (q) {
        const hay = `${tpl.name} ${tpl.shortName} ${tpl.clubName} ${tpl.nationalityName} ${tpl.seasonLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (affordableOnly) {
        const price = getMarketPriceBp(tpl.id, selectedGrade);
        if (price > bp) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const priceA = getMarketPriceBp(a.id, selectedGrade);
      const priceB = getMarketPriceBp(b.id, selectedGrade);
      const ovrA = computeCardOvr(a.baseOvr, selectedGrade);
      const ovrB = computeCardOvr(b.baseOvr, selectedGrade);

      if (sortBy === 'price_asc') return priceA - priceB || ovrB - ovrA;
      if (sortBy === 'price_desc') return priceB - priceA || ovrB - ovrA;
      if (sortBy === 'salary_asc') return a.salary - b.salary || ovrB - ovrA;
      return ovrB - ovrA || priceB - priceA;
    });

    return list;
  }, [activeTab, watchlistIds, searchQuery, seasonFilter, posFilter, sortBy, affordableOnly, selectedGrade, bp]);

  const activeTemplate = useMemo<PlayerTemplate>(() => {
    const direct = PLAYER_TEMPLATE_MAP[selectedTemplateId];
    if (direct && filteredTemplates.some((t) => t.id === direct.id)) {
      return direct;
    }
    return filteredTemplates[0] ?? direct ?? PLAYER_TEMPLATES[0];
  }, [selectedTemplateId, filteredTemplates]);

  const orderBook = useMemo(
    () => calculateMarketOrderBook(activeTemplate.id, selectedGrade),
    [activeTemplate.id, selectedGrade]
  );

  const previewMarketCard = useMemo<OwnedCard>(
    () => ({
      uid: `preview_mkt_${activeTemplate.id}_${selectedGrade}`,
      templateId: activeTemplate.id,
      grade: selectedGrade,
      ovr: computeCardOvr(activeTemplate.baseOvr, selectedGrade),
      valueBp: orderBook.standardPriceBp,
      acquiredAt: 0,
    }),
    [activeTemplate, selectedGrade, orderBook.standardPriceBp]
  );

  const sortedClubCards = useMemo(() => {
    const q = clubSellQuery.trim().toLowerCase();
    return [...cards]
      .filter((card) => {
        if (!q) return true;
        const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
        if (!tpl) return false;
        return `${tpl.name} ${tpl.shortName} ${tpl.seasonLabel} ${tpl.clubName}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.valueBp - a.valueBp || b.ovr - a.ovr);
  }, [cards, clubSellQuery]);

  const vipTaxDiscountPercent = serverRules?.zeroMarketTax
    ? 100
    : Math.min(30, Number((vipLevel * 1.5).toFixed(1)));
  const effectiveTaxRateLabel = serverRules?.zeroMarketTax
    ? 0
    : Number((40 * (1 - vipTaxDiscountPercent / 100)).toFixed(1));

  const handlePurchase = (templateId: string, grade: number) => {
    const res = onBuyCard(templateId, grade);
    if (res.ok && res.purchasedCard) {
      const tpl = PLAYER_TEMPLATE_MAP[templateId];
      gameSound.playUpgradeOutcome(true);
      if (tpl) {
        appendTransaction({
          id: `tx_buy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: 'BUY',
          templateId: tpl.id,
          playerName: tpl.name,
          season: tpl.season,
          seasonLabel: tpl.seasonLabel,
          grade,
          ovr: res.purchasedCard.ovr,
          grossBp: res.priceBp,
          taxBp: 0,
          netBp: res.priceBp,
          timestamp: Date.now(),
        });
      }
      setFeedbackBanner({
        tone: 'success',
        message: `Khớp lệnh MUA thành công ${tpl?.name ?? 'cầu thủ'} (${tpl?.seasonLabel ?? ''} +${grade}) giá ${formatBpCompact(res.priceBp)}! Đã chuyển thẳng về CLB.`,
        purchasedUid: res.purchasedCard.uid,
        purchasedGrade: grade,
      });
    } else {
      gameSound.playUpgradeOutcome(false);
      setFeedbackBanner({
        tone: 'error',
        message: res.error ?? 'Giao dịch thất bại.',
      });
    }
  };

  const handleSell = (cardUid: string) => {
    const res = onSellCard(cardUid);
    if (res.ok && res.soldCard && res.quote) {
      const tpl = PLAYER_TEMPLATE_MAP[res.soldCard.templateId];
      gameSound.playClick(1.15);
      if (tpl) {
        appendTransaction({
          id: `tx_sell_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: 'SELL',
          templateId: tpl.id,
          playerName: tpl.name,
          season: tpl.season,
          seasonLabel: tpl.seasonLabel,
          grade: res.soldCard.grade,
          ovr: res.soldCard.ovr,
          grossBp: res.quote.grossBp,
          taxBp: Math.max(0, res.quote.grossBp - res.quote.netBp),
          netBp: res.quote.netBp,
          timestamp: Date.now(),
        });
      }
      setFeedbackBanner({
        tone: 'success',
        message: `Khớp lệnh BÁN ${tpl?.name ?? 'cầu thủ'} (+${res.soldCard.grade}) nhận về +${formatBpCompact(res.quote.netBp)} (đã áp dụng ưu đãi SVIP ${vipLevel} giảm ${vipTaxDiscountPercent}% thuế)!`,
      });
    } else {
      gameSound.playUpgradeOutcome(false);
      setFeedbackBanner({
        tone: 'error',
        message: res.error ?? 'Không thể bán cầu thủ.',
      });
    }
  };

  // Build SVG coordinates for 7-session trend chart
  const chartPoints = useMemo(() => {
    const vals = orderBook.recentHistoryBp;
    const minVal = Math.min(...vals, orderBook.lowerBoundBp);
    const maxVal = Math.max(...vals, orderBook.upperBoundBp);
    const span = Math.max(1, maxVal - minVal);
    const width = 280;
    const height = 66;
    const padX = 10;
    const padY = 8;

    const coords = vals.map((v, idx) => {
      const x = padX + (idx / Math.max(1, vals.length - 1)) * (width - padX * 2);
      const y = height - padY - ((v - minVal) / span) * (height - padY * 2);
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), v };
    });

    const polyline = coords.map((p) => `${p.x},${p.y}`).join(' ');
    const areaPath = `M ${coords[0].x},${height - padY} L ${coords
      .map((p) => `${p.x},${p.y}`)
      .join(' L ')} L ${coords[coords.length - 1].x},${height - padY} Z`;

    return { coords, polyline, areaPath, minVal, maxVal, width, height };
  }, [orderBook]);

  const visibleTemplates = filteredTemplates.slice(0, visibleLimit);
  const sellOrdersDisplay = useMemo(
    () => [...orderBook.sellOrders].reverse(),
    [orderBook.sellOrders]
  );

  return (
    <div className="space-y-3 pb-6" data-testid="transfer-market-view">
      {/* Authentic FC Online PC Market Sub-Navigation Bar */}
      <div className="rounded-xl fco-pc-panel px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div
          role="tablist"
          aria-label="Chế độ Thị trường chuyển nhượng FC Online PC"
          className="flex flex-wrap items-center gap-1.5"
        >
          {(
            [
              { id: 'search', label: 'Tìm kiếm cầu thủ' },
              { id: 'sell', label: `Cầu thủ CLB / Bán (${cards.length})` },
              { id: 'transactions', label: `Giao dịch (${txHistory.length})` },
              { id: 'watchlist', label: `Yêu thích ★ (${watchlistIds.length})` },
            ] as const
          ).map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`market-tab-${t.id}`}
                onClick={() => {
                  gameSound.playClick();
                  setActiveTab(t.id);
                  setVisibleLimit(32);
                }}
                className={`fco-pc-tab-skew min-h-[36px] px-3.5 py-1.5 text-xs sm:text-[13px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                  active
                    ? 'fco-pc-btn-primary shadow-[0_0_14px_rgba(163,230,53,0.35)]'
                    : 'fco-pc-btn-slate'
                }`}
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div
          data-testid="market-tax-status"
          className="px-3 py-1.5 rounded bg-[#060a12] border border-amber-400/30 text-[11px] sm:text-xs text-amber-300 font-semibold tabular-nums self-start lg:self-auto"
        >
          {serverRules?.zeroMarketTax
            ? 'SỰ KIỆN GM: MIỄN 100% THUẾ TTCN (0% THUẾ)'
            : `SVIP ${vipLevel} · Giảm ${vipTaxDiscountPercent}% thuế (còn ${effectiveTaxRateLabel}%)`}
        </div>
      </div>

      {/* Transaction Feedback Banner */}
      {feedbackBanner && (
        <div
          role="status"
          data-testid="market-feedback-banner"
          className={`rounded-xl px-4 py-3 border flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm ${
            feedbackBanner.tone === 'success'
              ? 'bg-emerald-950/70 border-emerald-400/50 text-emerald-200'
              : 'bg-rose-950/70 border-rose-400/50 text-rose-200'
          }`}
        >
          <span className="font-semibold">{feedbackBanner.message}</span>
          <div className="flex items-center gap-2">
            {feedbackBanner.purchasedUid && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    gameSound.playClick();
                    onGoToSquad();
                  }}
                  className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                >
                  Đưa vào Đội Hình
                </button>
                {(feedbackBanner.purchasedGrade ?? 1) < MAX_CARD_GRADE && (
                  <button
                    type="button"
                    onClick={() => {
                      gameSound.playClick();
                      if (feedbackBanner.purchasedUid) {
                        onSelectCardForUpgrade(feedbackBanner.purchasedUid);
                      }
                    }}
                    className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                  >
                    Đem đi Đập Thẻ
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="px-2.5 py-1.5 rounded-md bg-slate-900/90 hover:bg-slate-800 text-slate-300 text-xs cursor-pointer whitespace-nowrap"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1 & TAB 4: PC SEARCH MARKET & WATCHLIST + ORDER BOOK INSPECTOR    */}
      {/* ===================================================================== */}
      {(activeTab === 'search' || activeTab === 'watchlist') && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
          {/* LEFT 8 COLS: PC FILTER CONSOLE + DENSE PLAYER DATA TABLE */}
          <div className="md:col-span-7 lg:col-span-8 space-y-3.5">
            {/* PC Filter Matrix */}
            <div className="rounded-xl fco-pc-panel p-3 sm:p-3.5 space-y-2.5">
              {/* Row 1: Search Input + Sort + Mobile Filter Toggle + Affordable Checkbox */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-5">
                  <label
                    htmlFor="pc-market-search"
                    className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1"
                  >
                    Tìm cầu thủ, CLB hoặc quốc tịch
                  </label>
                  <input
                    id="pc-market-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setVisibleLimit(32);
                    }}
                    placeholder="VD: Ronaldo, Messi, Quang Hải, Mbappé..."
                    className="w-full min-h-[38px] rounded-md bg-[#050912] border border-white/15 px-3 py-1.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#a3e635]"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label
                    htmlFor="pc-market-sort"
                    className="block text-[10px] sm:text-[11px] font-semibold text-slate-400 mb-1"
                  >
                    Sắp xếp bảng giá
                  </label>
                  <select
                    id="pc-market-sort"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as MarketSort)}
                    className="w-full min-h-[38px] rounded-md bg-[#050912] border border-white/15 px-3 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:border-[#a3e635]"
                  >
                    <option value="ovr_desc">Chỉ số OVR cao → thấp</option>
                    <option value="price_desc">Giá trị BP cao → thấp</option>
                    <option value="price_asc">Giá trị BP thấp → cao</option>
                    <option value="salary_asc">Lương tối ưu thấp → cao</option>
                  </select>
                </div>

                <div className="sm:col-span-3 flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 cursor-pointer select-none py-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={affordableOnly}
                      onChange={(e) => {
                        gameSound.playClick();
                        setAffordableOnly(e.target.checked);
                        setVisibleLimit(32);
                      }}
                      className="w-4 h-4 rounded accent-[#a3e635]"
                    />
                    <span>Đủ BP</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      gameSound.playClick();
                      setMobileFiltersOpen((prev) => !prev);
                    }}
                    className="lg:hidden min-h-[36px] px-2.5 py-1 rounded bg-slate-800 border border-white/15 text-[11px] font-bold text-[#a3e635] cursor-pointer whitespace-nowrap"
                  >
                    {mobileFiltersOpen ? 'Thu lọc ▲' : 'Vị trí & Mùa ▼'}
                  </button>
                </div>
              </div>

              {/* Row 2 & Row 3: Position + Season Filters (always shown on lg+, toggleable on mobile) */}
              <div className={`${mobileFiltersOpen ? 'block' : 'hidden lg:block'} space-y-2`}>
                <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-white/8">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1.5">Vị trí:</span>
                  {EXACT_POSITIONS.map((pos) => {
                    const active = posFilter === pos;
                    const posHex = pos === 'ALL' ? '#a3e635' : getPositionColorHex(pos);
                    return (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => {
                          gameSound.playClick();
                          setPosFilter(pos);
                          setVisibleLimit(32);
                        }}
                        className={`min-h-[30px] px-2.5 py-1 rounded text-[11px] font-extrabold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'text-slate-950 shadow'
                            : 'bg-[#050912] text-slate-300 hover:text-white border border-white/10'
                        }`}
                        style={active ? { backgroundColor: posHex } : undefined}
                      >
                        {pos === 'ALL' ? 'TẤT CẢ' : pos}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-white/8">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1.5">Mùa thẻ:</span>
                  {SEASON_TABS.map((tab) => {
                    const active = seasonFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          gameSound.playClick();
                          setSeasonFilter(tab.id);
                          setVisibleLimit(32);
                        }}
                        className={`min-h-[30px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-[#a3e635] text-slate-950 font-extrabold'
                            : 'bg-[#050912] text-slate-300 hover:text-white border border-white/10'
                        }`}
                      >
                        {tab.id !== 'ALL' && (
                          <SeasonBadgeSvg season={tab.id} className="w-4 h-3 shrink-0" />
                        )}
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: +1 .. +13 Enhancement Grade Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/8">
                <div className="flex items-center gap-1 overflow-x-auto fco-touch-scroll pb-0.5 max-w-full">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1 shrink-0">
                    Cấp cộng:
                  </span>
                  {ALL_MARKET_GRADES.map((g) => {
                    const gStyle = getGradeBadgeStyle(g);
                    const isSelected = selectedGrade === g;
                    return (
                      <button
                        key={`mkt_grade_${g}`}
                        type="button"
                        onClick={() => {
                          gameSound.playClick(1 + g * 0.015);
                          setSelectedGrade(g);
                        }}
                        aria-pressed={isSelected}
                        className={`min-h-[28px] px-2 py-0.5 rounded font-extrabold text-[11px] tabular-nums transition-transform cursor-pointer whitespace-nowrap shrink-0 ${
                          isSelected
                            ? 'ring-2 ring-white scale-105'
                            : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          background: gStyle.bg,
                          color: gStyle.text,
                          border: `1px solid ${gStyle.border}`,
                        }}
                      >
                        +{g}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                  Kết quả: <strong className="text-white">{filteredTemplates.length}</strong> cầu thủ
                </span>
              </div>
            </div>

            {/* PC Dense Tabular Listings */}
            <div className="rounded-xl bg-[#0a101d] border border-white/10 overflow-hidden">
              {/* Desktop Column Header */}
              <div className="hidden md:grid md:grid-cols-12 gap-2 px-3.5 py-2.5 bg-[#060a13] border-b border-white/10 text-[11px] font-bold text-slate-400">
                <div className="col-span-5">Cầu thủ &amp; Mùa giải</div>
                <div className="col-span-2 text-center">Vị trí · OVR</div>
                <div className="col-span-1 text-center">Lương</div>
                <div className="col-span-4 text-right">Giá chuẩn (+{selectedGrade}) &amp; Lệnh mua</div>
              </div>

              {visibleTemplates.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <div className="text-sm font-bold text-white">
                    {activeTab === 'watchlist'
                      ? 'Chưa có cầu thủ yêu thích phù hợp với bộ lọc hiện tại'
                      : `Không tìm thấy cầu thủ phù hợp ở mức +${selectedGrade}`}
                  </div>
                  <p className="text-xs text-slate-400">
                    Bấm ngôi sao ★ cạnh tên cầu thủ để lưu vào danh sách theo dõi hoặc đặt lại bộ lọc tìm kiếm.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSeasonFilter('ALL');
                      setPosFilter('ALL');
                      setAffordableOnly(false);
                      setSelectedGrade(1);
                    }}
                    className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                  >
                    Đặt lại bộ lọc TTCN
                  </button>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-white/6">
                    {visibleTemplates.map((tpl) => {
                      const ovrAtGrade = computeCardOvr(tpl.baseOvr, selectedGrade);
                      const priceAtGrade = getMarketPriceBp(tpl.id, selectedGrade);
                      const canAfford = bp >= priceAtGrade;
                      const isInspected = activeTemplate.id === tpl.id;
                      const isFav = watchlistIds.includes(tpl.id);
                      const gradeBadge = getGradeBadgeStyle(selectedGrade);

                      return (
                        <div
                          key={`mkt_row_${tpl.id}`}
                          className={`px-3.5 py-2.5 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center transition-colors ${
                            isInspected
                              ? 'bg-[#132038] border-y border-[#a3e635]/35'
                              : 'hover:bg-white/[0.03]'
                          }`}
                        >
                          {/* Col 1-5: Star + Portrait + Name + Club + Traits */}
                          <div className="md:col-span-5 flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              aria-label={
                                isFav
                                  ? `Bỏ theo dõi ${tpl.name}`
                                  : `Theo dõi ${tpl.name}`
                              }
                              onClick={() => toggleWatchlist(tpl.id)}
                              className={`w-9 h-9 rounded flex items-center justify-center text-sm transition-colors cursor-pointer shrink-0 ${
                                isFav
                                  ? 'text-amber-400 bg-amber-500/15 border border-amber-400/40'
                                  : 'text-slate-500 hover:text-amber-300 bg-[#060a13] border border-white/8'
                              }`}
                            >
                              ★
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                gameSound.playClick();
                                setSelectedTemplateId(tpl.id);
                              }}
                              className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                            >
                              <div className="w-11 h-11 rounded-md bg-[#050912] border border-white/10 flex items-end justify-center overflow-hidden shrink-0 p-0.5">
                                <img
                                  src={tpl.minifaceUrl}
                                  alt={tpl.name}
                                  referrerPolicy="no-referrer"
                                  className="w-10 h-10 object-contain object-bottom"
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <SeasonBadgeSvg
                                    season={tpl.season}
                                    className="w-6 h-4 shrink-0"
                                  />
                                  <span className="font-bold text-xs sm:text-sm text-white truncate">
                                    {tpl.name}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                                  <ClubCrestSvg
                                    clubCode={tpl.clubCode}
                                    className="w-3.5 h-3.5 shrink-0"
                                  />
                                  <span className="truncate">{tpl.clubName}</span>
                                </div>
                                {tpl.goldTraits && tpl.goldTraits.length > 0 && (
                                  <div className="mt-1">
                                    <TraitBadges
                                      traits={tpl.goldTraits}
                                      variant="inline-icons"
                                      maxItems={5}
                                    />
                                  </div>
                                )}
                              </div>
                            </button>
                          </div>

                          {/* Col 6-7: Position + OVR + Grade Badge */}
                          <div className="md:col-span-2 flex md:justify-center items-center gap-2 tabular-nums">
                            <span
                              className="text-xs font-extrabold"
                              style={{ color: getPositionColorHex(tpl.position) }}
                            >
                              {tpl.position}
                            </span>
                            <span className="text-sm font-extrabold text-white">{ovrAtGrade}</span>
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-extrabold leading-none"
                              style={{
                                background: gradeBadge.bg,
                                color: gradeBadge.text,
                                border: `1px solid ${gradeBadge.border}`,
                              }}
                            >
                              +{selectedGrade}
                            </span>
                          </div>

                          {/* Col 8: Salary */}
                          <div className="hidden md:flex md:col-span-1 justify-center">
                            <span className="text-xs font-mono font-bold text-slate-300 tabular-nums">
                              {tpl.salary}
                            </span>
                          </div>

                          {/* Col 9-12: Standard Market Price + Buy CTA */}
                          <div className="md:col-span-4 flex items-center justify-between md:justify-end gap-2.5 tabular-nums">
                            <div className="text-left md:text-right">
                              <div
                                className={`text-xs sm:text-sm font-bold font-mono ${
                                  canAfford ? 'text-emerald-400' : 'text-slate-400'
                                }`}
                              >
                                {formatBpCompact(priceAtGrade)}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {canAfford ? 'Khớp lệnh ngay' : 'Thiếu quỹ BP'}
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={!canAfford}
                              aria-label={`Mua ${tpl.name} mùa ${tpl.seasonLabel} cộng ${selectedGrade}`}
                              onClick={() => {
                                setSelectedTemplateId(tpl.id);
                                handlePurchase(tpl.id, selectedGrade);
                              }}
                              className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 ${
                                canAfford
                                  ? 'bg-[#a3e635] hover:bg-[#bef264] text-slate-950 cursor-pointer'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              Mua +{selectedGrade}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredTemplates.length > visibleLimit && (
                    <div className="p-3 border-t border-white/10 text-center bg-[#060a13]">
                      <button
                        type="button"
                        onClick={() => setVisibleLimit((prev) => prev + 32)}
                        className="px-5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap tabular-nums"
                      >
                        Tải thêm cầu thủ ({filteredTemplates.length - visibleLimit} còn lại)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT 4 COLS: FC ONLINE PC ORDER BOOK & 7-SESSION PRICE CHART */}
          <div
            data-testid="pc-market-orderbook"
            className="md:col-span-5 lg:col-span-4 rounded-xl fco-pc-panel-glow p-4 space-y-3"
          >
            {/* Inspector Player Header */}
            <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <SeasonBadgeSvg season={activeTemplate.season} className="w-5 h-3.5 shrink-0" />
                  <span>{activeTemplate.seasonLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>Lương {activeTemplate.salary}</span>
                </div>
                <h3 className="text-base font-bold text-white truncate mt-0.5">
                  {activeTemplate.name}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <NationFlagSvg
                  code={activeTemplate.nationalityCode}
                  className="w-6 h-4 rounded shadow"
                />
                <button
                  type="button"
                  onClick={() => toggleWatchlist(activeTemplate.id)}
                  className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                    watchlistIds.includes(activeTemplate.id)
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50'
                      : 'bg-[#060a13] text-slate-300 border border-white/10 hover:text-white'
                  }`}
                >
                  {watchlistIds.includes(activeTemplate.id) ? '★ Đã lưu' : '☆ Theo dõi'}
                </button>
              </div>
            </div>

            {/* Card Preview + Quick Grade Switcher */}
            <div className="flex flex-col items-center gap-2.5">
              <PlayerCardView card={previewMarketCard} size="md" showStats={false} showValue />

              <div className="w-full grid grid-cols-7 gap-1 pt-1">
                {ALL_MARKET_GRADES.map((g) => {
                  const badge = getGradeBadgeStyle(g);
                  const active = selectedGrade === g;
                  return (
                    <button
                      key={`ob_grade_${g}`}
                      type="button"
                      onClick={() => {
                        gameSound.playClick(1 + g * 0.015);
                        setSelectedGrade(g);
                      }}
                      className={`py-1 rounded text-[10px] font-extrabold tabular-nums cursor-pointer ${
                        active ? 'ring-2 ring-white scale-105' : 'opacity-75 hover:opacity-100'
                      }`}
                      style={{
                        background: badge.bg,
                        color: badge.text,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      +{g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Upper / Standard / Lower Price Summary */}
            <div className="rounded-lg bg-[#060a13] border border-white/10 p-2.5 space-y-1 text-xs tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Giá cao nhất (Trần):</span>
                <span className="font-mono font-semibold text-rose-300">
                  {formatBpCompact(orderBook.upperBoundBp)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold">Giá chuẩn TTCN (+{selectedGrade}):</span>
                <strong className="font-mono text-white">
                  {formatBpCompact(orderBook.standardPriceBp)}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Giá thấp nhất (Sàn):</span>
                <span className="font-mono font-semibold text-sky-300">
                  {formatBpCompact(orderBook.lowerBoundBp)}
                </span>
              </div>
            </div>

            {/* Authentic FC Online PC Order Book (Blue Sell Orders / Red Buy Orders) */}
            <div className="rounded-lg bg-[#060a13] border border-white/10 overflow-hidden">
              <div className="grid grid-cols-3 px-3 py-1.5 bg-[#0c1324] border-b border-white/10 text-[10px] font-bold text-slate-400">
                <span>Lượng bán</span>
                <span className="text-center">Mức giá giao dịch</span>
                <span className="text-right">Lượng mua</span>
              </div>

              {/* 3 Blue Sell Rows (Lượng bán) */}
              <div className="divide-y divide-white/5">
                {sellOrdersDisplay.map((row, idx) => (
                  <div
                    key={`sell_ob_${idx}`}
                    className="grid grid-cols-3 items-center px-3 py-1.5 bg-sky-500/[0.07] text-[11px] tabular-nums"
                  >
                    <span className="font-mono font-bold text-sky-400">{row.quantity} thẻ</span>
                    <span className="font-mono font-semibold text-sky-200 text-center">
                      {formatBpCompact(row.priceBp)}
                    </span>
                    <span className="text-right text-[10px] text-slate-500">Đang rao bán</span>
                  </div>
                ))}

                {/* 3 Red Buy Rows (Lượng mua) */}
                {orderBook.buyOrders.map((row, idx) => (
                  <div
                    key={`buy_ob_${idx}`}
                    className="grid grid-cols-3 items-center px-3 py-1.5 bg-rose-500/[0.07] text-[11px] tabular-nums"
                  >
                    <span className="text-[10px] text-slate-500">Đặt mua chờ</span>
                    <span className="font-mono font-semibold text-rose-200 text-center">
                      {formatBpCompact(row.priceBp)}
                    </span>
                    <span className="font-mono font-bold text-rose-400 text-right">
                      {row.quantity} lệnh
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 7-Session SVG Price Trend Chart */}
            <div className="rounded-lg bg-[#060a13] border border-white/10 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] tabular-nums">
                <span className="font-bold text-slate-300">Biểu đồ giá 7 phiên gần nhất</span>
                <span className="font-mono text-[#a3e635]">
                  Hiện tại: {formatBpCompact(orderBook.standardPriceBp)}
                </span>
              </div>
              <svg
                viewBox={`0 0 ${chartPoints.width} ${chartPoints.height}`}
                className="w-full h-16 overflow-visible"
                role="img"
                aria-label={`Biểu đồ biến động giá 7 phiên của ${activeTemplate.name}`}
              >
                <defs>
                  <linearGradient id="fcoPriceArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a3e635" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#a3e635" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d={chartPoints.areaPath} fill="url(#fcoPriceArea)" />
                <polyline
                  fill="none"
                  stroke="#a3e635"
                  strokeWidth="2"
                  points={chartPoints.polyline}
                />
                {chartPoints.coords.map((pt, idx) => (
                  <circle
                    key={`pt_${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={idx === chartPoints.coords.length - 1 ? 3.5 : 2.2}
                    fill={idx === chartPoints.coords.length - 1 ? '#facc15' : '#a3e635'}
                  />
                ))}
              </svg>
            </div>

            {activeTemplate.goldTraits && activeTemplate.goldTraits.length > 0 && (
              <div
                data-testid="market-inspector-traits"
                className="rounded-lg bg-[#060a13] border border-white/10 p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-amber-300">Chỉ số ẩn cầu thủ</span>
                  <span className="text-slate-400 tabular-nums">
                    {activeTemplate.goldTraits.length} đặc tính
                  </span>
                </div>
                <TraitBadges
                  traits={activeTemplate.goldTraits}
                  variant="compact"
                  maxItems={6}
                />
              </div>
            )}

            {/* Primary PC Purchase Action */}
            <button
              type="button"
              data-testid="pc-market-buy-btn"
              disabled={bp < orderBook.standardPriceBp}
              onClick={() => handlePurchase(activeTemplate.id, selectedGrade)}
              className={`w-full min-h-[44px] py-3 px-4 rounded-lg font-extrabold text-sm tracking-wide transition-colors whitespace-nowrap tabular-nums ${
                bp >= orderBook.standardPriceBp
                  ? 'bg-[#a3e635] hover:bg-[#bef264] text-slate-950 cursor-pointer shadow-lg'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {bp >= orderBook.standardPriceBp
                ? `MUA NGAY (+${selectedGrade}) · ${formatBpCompact(orderBook.standardPriceBp)}`
                : `Không đủ BP (${formatBpCompact(orderBook.standardPriceBp)})`}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: SELL OWNED CLUB PLAYERS (TABULAR PC VIEW)                      */}
      {/* ===================================================================== */}
      {activeTab === 'sell' && (
        <div className="space-y-3.5">
          <div className="rounded-xl bg-[#0a101d] border border-white/10 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-xs text-slate-300 space-y-0.5 tabular-nums">
              <div>
                Thuế TTCN cơ bản 40% · Đặc quyền{' '}
                <strong className="text-amber-300">SVIP {vipLevel}</strong> giảm{' '}
                <strong className="text-emerald-400">{vipTaxDiscountPercent}% tiền thuế</strong> (chỉ chịu{' '}
                {effectiveTaxRateLabel}% thuế).
              </div>
              <div className="text-slate-400">
                Quân số CLB hiện tại: <strong className="text-white">{cards.length}</strong> cầu thủ
                (hệ thống giữ tối thiểu 11 cầu thủ thi đấu).
              </div>
            </div>

            <div className="w-full md:w-72">
              <input
                type="search"
                value={clubSellQuery}
                onChange={(e) => setClubSellQuery(e.target.value)}
                placeholder="Lọc nhanh cầu thủ trong CLB..."
                aria-label="Lọc cầu thủ trong CLB để bán"
                className="w-full rounded-md bg-[#050912] border border-white/15 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#a3e635]"
              />
            </div>
          </div>

          <div className="rounded-xl fco-pc-panel overflow-hidden">
            <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2.5 bg-[#060a13] border-b border-white/10 text-[11px] font-bold text-slate-400">
              <div className="col-span-4">Cầu thủ sở hữu</div>
              <div className="col-span-2 text-right">Giá gốc TTCN</div>
              <div className="col-span-2 text-right">Thuế (- SVIP {vipLevel})</div>
              <div className="col-span-2 text-right">Thực nhận BP</div>
              <div className="col-span-2 text-right">Thao tác</div>
            </div>

            <div className="divide-y divide-white/6">
              {sortedClubCards.map((card) => {
                const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
                if (!tpl) return null;
                const quote = calculateMarketSellQuote(card, vipLevel, serverRules);
                const canSell = cards.length > 11;
                const gBadge = getGradeBadgeStyle(card.grade);

                return (
                  <div
                    key={`sell_row_${card.uid}`}
                    className="px-4 py-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center hover:bg-white/[0.02]"
                  >
                    <div className="sm:col-span-4 flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-md bg-[#050912] border border-white/10 flex items-end justify-center overflow-hidden shrink-0 p-0.5">
                        <img
                          src={card.customMinifaceUrl || tpl.minifaceUrl}
                          alt={tpl.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 object-contain object-bottom"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <SeasonBadgeSvg season={tpl.season} className="w-6 h-4 shrink-0" />
                          <span className="font-bold text-sm text-white truncate">{tpl.name}</span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-extrabold tabular-nums"
                            style={{
                              background: gBadge.bg,
                              color: gBadge.text,
                              border: `1px solid ${gBadge.border}`,
                            }}
                          >
                            +{card.grade}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 tabular-nums mt-0.5">
                          {tpl.position} · OVR {card.ovr} · {tpl.clubName}
                        </div>
                      </div>
                    </div>

                    <div className="sm:col-span-2 flex justify-between sm:justify-end text-xs tabular-nums">
                      <span className="sm:hidden text-slate-400">Giá gốc:</span>
                      <span className="font-mono text-slate-200">
                        {formatBpCompact(quote.grossBp)}
                      </span>
                    </div>

                    <div className="sm:col-span-2 flex justify-between sm:justify-end text-xs tabular-nums">
                      <span className="sm:hidden text-slate-400">Thuế ({quote.effectiveTaxPercent}%):</span>
                      <span className="font-mono text-rose-300">
                        -{formatBpCompact(Math.max(0, quote.grossBp - quote.netBp))} ({quote.effectiveTaxPercent}%)
                      </span>
                    </div>

                    <div className="sm:col-span-2 flex justify-between sm:justify-end text-xs tabular-nums">
                      <span className="sm:hidden text-slate-400">Thực nhận:</span>
                      <strong className="font-mono text-emerald-400">
                        +{formatBpCompact(quote.netBp)}
                      </strong>
                    </div>

                    <div className="sm:col-span-2 flex items-center justify-end gap-2">
                      {card.grade < MAX_CARD_GRADE && (
                        <button
                          type="button"
                          onClick={() => {
                            gameSound.playClick();
                            onSelectCardForUpgrade(card.uid);
                          }}
                          className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-300 cursor-pointer whitespace-nowrap"
                        >
                          Đập thẻ
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!canSell}
                        aria-label={`Bán ${tpl.name} cộng ${card.grade} nhận ${formatBpCompact(quote.netBp)}`}
                        onClick={() => handleSell(card.uid)}
                        className={`px-3 py-1.5 rounded-md text-xs font-extrabold transition-colors whitespace-nowrap ${
                          canSell
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {canSell ? 'Bán lên TTCN' : 'Giữ đủ 11 CT'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: TRANSACTION HISTORY LEDGER (DANH SÁCH GIAO DỊCH PC)            */}
      {/* ===================================================================== */}
      {activeTab === 'transactions' && (
        <div
          data-testid="market-transactions-panel"
          className="rounded-xl bg-[#0a101d] border border-white/10 overflow-hidden"
        >
          <div className="px-4 py-3 bg-[#060a13] border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-200 tabular-nums">
              LỊCH SỬ KHỚP LỆNH MUA &amp; BÁN TRÊN TTCN ({txHistory.length} GIAO DỊCH)
            </div>
            {txHistory.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  gameSound.playClick();
                  setTxHistory([]);
                  writeMarketTransactions(profileId, []);
                }}
                className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer whitespace-nowrap"
              >
                Xóa lịch sử giao dịch
              </button>
            )}
          </div>

          {txHistory.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <div className="text-sm font-bold text-white">
                Chưa có lịch sử giao dịch nào được ghi nhận
              </div>
              <p className="text-xs text-slate-400">
                Mọi lệnh Mua ngay hoặc Bán cầu thủ CLB của bạn sẽ được lưu tự động tại đây như FC Online bản PC.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/6">
              {txHistory.map((tx) => {
                const gBadge = getGradeBadgeStyle(tx.grade);
                return (
                  <div
                    key={tx.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs tabular-nums"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`px-2 py-0.5 rounded font-extrabold text-[11px] shrink-0 ${
                          tx.type === 'BUY'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        }`}
                      >
                        {tx.type === 'BUY' ? 'MUA VÀO' : 'BÁN RA'}
                      </span>
                      <SeasonBadgeSvg season={tx.season} className="w-6 h-4 shrink-0" />
                      <span className="font-bold text-white truncate">{tx.playerName}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-extrabold shrink-0"
                        style={{
                          background: gBadge.bg,
                          color: gBadge.text,
                          border: `1px solid ${gBadge.border}`,
                        }}
                      >
                        +{tx.grade}
                      </span>
                      <span className="text-slate-400 shrink-0">OVR {tx.ovr}</span>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      {tx.type === 'SELL' && tx.taxBp > 0 && (
                        <span className="text-slate-400">
                          Thuế: <span className="font-mono text-rose-300">-{formatBpCompact(tx.taxBp)}</span>
                        </span>
                      )}
                      <strong
                        className={`font-mono ${
                          tx.type === 'BUY' ? 'text-sky-300' : 'text-emerald-400'
                        }`}
                      >
                        {tx.type === 'BUY' ? `-${formatBpCompact(tx.netBp)}` : `+${formatBpCompact(tx.netBp)}`}
                      </strong>
                      <span className="text-[11px] text-slate-500">
                        {new Date(tx.timestamp).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
