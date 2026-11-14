import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CLUB_LICENSE_REGISTRY,
  PLAYER_TEMPLATES,
  PLAYER_TEMPLATE_MAP,
  getMinifaceVariantsForPlayer,
  isVietnameseClubCode,
} from '../game/catalog';
import { MAX_CUSTOM_MINIFACE_LENGTH } from '../game/rules';
import { gameSound } from '../game/sound';
import { OwnedCard } from '../game/types';
import { ClubCrestSvg, NationFlagSvg, SeasonBadgeSvg } from './Emblems';
import { PlayerCardView } from './PlayerCardView';

const CUSTOM_MINIFACE_GALLERY_KEY = 'fco_custom_miniface_gallery_v1';

interface SavedCustomMiniface {
  id: string;
  label: string;
  dataUrl: string;
  createdAt: number;
}

function loadCustomMinifaceGallery(): SavedCustomMiniface[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_MINIFACE_GALLERY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is SavedCustomMiniface =>
          Boolean(x) &&
          typeof x.id === 'string' &&
          typeof x.dataUrl === 'string' &&
          x.dataUrl.startsWith('data:image/') &&
          x.dataUrl.length <= MAX_CUSTOM_MINIFACE_LENGTH
      )
      .slice(0, 12);
  } catch {
    return [];
  }
}

function saveCustomMinifaceGallery(items: SavedCustomMiniface[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOM_MINIFACE_GALLERY_KEY, JSON.stringify(items.slice(0, 12)));
  } catch {
    // Ignore storage quota errors
  }
}

function encodeCanvasUnderLimit(canvas: HTMLCanvasElement): string {
  const candidates: string[] = [];
  for (const q of [0.86, 0.72, 0.56]) {
    const webp = canvas.toDataURL('image/webp', q);
    if (webp.startsWith('data:image/webp')) {
      candidates.push(webp);
    }
  }
  candidates.push(canvas.toDataURL('image/png'));

  for (const url of candidates) {
    if (url.length <= 145_000) return url;
  }

  // Fallback: downscale to 160x160 if PNG fallback exceeded size
  const small = document.createElement('canvas');
  small.width = 160;
  small.height = 160;
  const sctx = small.getContext('2d');
  if (sctx) {
    sctx.drawImage(canvas, 0, 0, 160, 160);
    const webpSmall = small.toDataURL('image/webp', 0.72);
    if (webpSmall.length <= 145_000) return webpSmall;
    const pngSmall = small.toDataURL('image/png');
    if (pngSmall.length <= MAX_CUSTOM_MINIFACE_LENGTH) return pngSmall;
  }
  return candidates[0] ?? '';
}

interface LockerRoomViewProps {
  cards: OwnedCard[];
  preselectedCardUid?: string | null;
  onEquipMiniface: (cardUid: string, minifaceUrl?: string) => void;
  onGoToVault: () => void;
}

export const LockerRoomView: React.FC<LockerRoomViewProps> = ({
  cards,
  preselectedCardUid,
  onEquipMiniface,
  onGoToVault,
}) => {
  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      const tplA = PLAYER_TEMPLATE_MAP[a.templateId];
      const tplB = PLAYER_TEMPLATE_MAP[b.templateId];
      const varCountA = tplA ? getMinifaceVariantsForPlayer(tplA.name).length : 1;
      const varCountB = tplB ? getMinifaceVariantsForPlayer(tplB.name).length : 1;
      if (varCountB !== varCountA) return varCountB - varCountA;
      return b.ovr - a.ovr || b.valueBp - a.valueBp;
    });
  }, [cards]);

  const [selectedCardUid, setSelectedCardUid] = useState<string>(
    () => preselectedCardUid ?? sortedCards[0]?.uid ?? ''
  );
  const [previewMinifaceUrl, setPreviewMinifaceUrl] = useState<string | null | undefined>(
    undefined
  );
  const [clubSearch, setClubSearch] = useState<string>('ALL');
  const [clubRegionTab, setClubRegionTab] = useState<'ALL' | 'VN' | 'INTL'>('ALL');
  const [clubFilterQuery, setClubFilterQuery] = useState<string>('');
  const [equipToast, setEquipToast] = useState<string | null>(null);

  // Mobile Custom Miniface Studio State
  const [customGallery, setCustomGallery] = useState<SavedCustomMiniface[]>(() =>
    loadCustomMinifaceGallery()
  );
  const [loadedPhotoImg, setLoadedPhotoImg] = useState<HTMLImageElement | null>(null);
  const [loadedPhotoLabel, setLoadedPhotoLabel] = useState<string>('Ảnh Cầu Thủ Tự Tạo');
  const [studioZoom, setStudioZoom] = useState<number>(1.2);
  const [studioPanX, setStudioPanX] = useState<number>(0);
  const [studioPanY, setStudioPanY] = useState<number>(0);
  const [studioRemoveBg, setStudioRemoveBg] = useState<boolean>(false);
  const [studioBgTolerance, setStudioBgTolerance] = useState<number>(38);
  const [studioBustMask, setStudioBustMask] = useState<boolean>(true);
  const [studioError, setStudioError] = useState<string | null>(null);
  const studioCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    if (preselectedCardUid && cards.some((c) => c.uid === preselectedCardUid)) {
      setSelectedCardUid(preselectedCardUid);
      setPreviewMinifaceUrl(undefined);
    }
  }, [preselectedCardUid, cards]);

  useEffect(() => {
    if (!cards.some((c) => c.uid === selectedCardUid) && sortedCards.length > 0) {
      setSelectedCardUid(sortedCards[0].uid);
      setPreviewMinifaceUrl(undefined);
    }
  }, [cards, selectedCardUid, sortedCards]);

  const selectedCard = useMemo(
    () => cards.find((c) => c.uid === selectedCardUid) ?? sortedCards[0] ?? null,
    [cards, selectedCardUid, sortedCards]
  );

  const selectedTemplate = selectedCard
    ? PLAYER_TEMPLATE_MAP[selectedCard.templateId]
    : null;

  const minifaceOptions = useMemo(() => {
    if (!selectedTemplate) return [];
    return getMinifaceVariantsForPlayer(selectedTemplate.name);
  }, [selectedTemplate]);

  const currentlyEquippedUrl =
    selectedCard?.customMinifaceUrl ?? selectedTemplate?.minifaceUrl ?? '';

  const activePreviewUrl =
    previewMinifaceUrl === null
      ? selectedTemplate?.minifaceUrl ?? ''
      : previewMinifaceUrl ?? currentlyEquippedUrl;

  const clubDirectory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tpl of PLAYER_TEMPLATES) {
      counts[tpl.clubCode] = (counts[tpl.clubCode] ?? 0) + 1;
    }
    return Object.values(CLUB_LICENSE_REGISTRY)
      .map((club) => ({
        ...club,
        isVn: isVietnameseClubCode(club.code),
        playerCount: counts[club.code] ?? 0,
      }))
      .sort((a, b) => b.playerCount - a.playerCount || a.officialName.localeCompare(b.officialName));
  }, []);

  const vnClubsCount = useMemo(
    () => clubDirectory.filter((c) => c.isVn).length,
    [clubDirectory]
  );
  const intlClubsCount = clubDirectory.length - vnClubsCount;

  const visibleClubs = useMemo(() => {
    const q = clubFilterQuery.trim().toLowerCase();
    return clubDirectory.filter((club) => {
      if (clubRegionTab === 'VN' && !club.isVn) return false;
      if (clubRegionTab === 'INTL' && club.isVn) return false;
      if (!q) return true;
      return `${club.officialName} ${club.shortCode} ${club.code} ${club.league}`
        .toLowerCase()
        .includes(q);
    });
  }, [clubDirectory, clubRegionTab, clubFilterQuery]);

  const filteredOwnedCards = useMemo(() => {
    if (clubSearch === 'ALL') return sortedCards;
    return sortedCards.filter((c) => {
      const tpl = PLAYER_TEMPLATE_MAP[c.templateId];
      return tpl?.clubCode === clubSearch;
    });
  }, [sortedCards, clubSearch]);

  const handleApplyMiniface = (targetUrl?: string) => {
    if (!selectedCard || !selectedTemplate) return;
    gameSound.playUpgradeOutcome(true);
    onEquipMiniface(selectedCard.uid, targetUrl);
    setPreviewMinifaceUrl(undefined);
    const chosenOpt = minifaceOptions.find((o) => o.url === targetUrl);
    const isCustomData = Boolean(targetUrl && targetUrl.startsWith('data:image/'));
    setEquipToast(
      isCustomData
        ? `Đã trang bị Miniface tự tạo từ điện thoại cho ${selectedTemplate.name}!`
        : targetUrl && chosenOpt
        ? `Đã trang bị Miniface ${chosenOpt.seasonLabel} (${chosenOpt.clubName}) cho ${selectedTemplate.name}!`
        : `Đã khôi phục Miniface gốc mùa ${selectedTemplate.seasonLabel} cho ${selectedTemplate.name}!`
    );
    window.setTimeout(() => setEquipToast(null), 3200);
  };

  const renderStudioToCanvas = useCallback((): string | null => {
    const img = loadedPhotoImg;
    const canvas = studioCanvasRef.current;
    if (!img || !canvas) return null;

    const size = 220;
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);

    // Draw scaled & panned image centered
    const coverScale = Math.max(size / img.width, size / img.height) * studioZoom;
    const drawW = img.width * coverScale;
    const drawH = img.height * coverScale;
    const drawX = (size - drawW) / 2 + studioPanX;
    const drawY = (size - drawH) / 2 + studioPanY;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Optional corner-sampled chroma/background removal
    if (studioRemoveBg) {
      const imgData = ctx.getImageData(0, 0, size, size);
      const d = imgData.data;
      const samplePoints = [
        [2, 2],
        [size - 3, 2],
        [2, Math.floor(size * 0.35)],
        [size - 3, Math.floor(size * 0.35)],
      ];
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sc = 0;
      for (const [sx, sy] of samplePoints) {
        const idx = (sy * size + sx) * 4;
        if (d[idx + 3] > 20) {
          sr += d[idx];
          sg += d[idx + 1];
          sb += d[idx + 2];
          sc += 1;
        }
      }
      if (sc > 0) {
        sr /= sc;
        sg /= sc;
        sb /= sc;
        const tol = studioBgTolerance * 1.45;
        const soft = tol + 18;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          const distRgb = Math.hypot(d[i] - sr, d[i + 1] - sg, d[i + 2] - sb);
          if (distRgb < tol) {
            d[i + 3] = 0;
          } else if (distRgb < soft) {
            const alphaScale = (distRgb - tol) / (soft - tol);
            d[i + 3] = Math.round(d[i + 3] * alphaScale);
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }
    }

    // Optional FC Online portrait bust cutout & smooth bottom fade
    if (studioBustMask) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      const maskGrad = ctx.createLinearGradient(0, 0, 0, size);
      maskGrad.addColorStop(0, 'rgba(0,0,0,1)');
      maskGrad.addColorStop(0.76, 'rgba(0,0,0,1)');
      maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = maskGrad;
      ctx.beginPath();
      ctx.ellipse(size / 2, size * 0.52, size * 0.46, size * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    return encodeCanvasUnderLimit(canvas);
  }, [
    loadedPhotoImg,
    studioZoom,
    studioPanX,
    studioPanY,
    studioRemoveBg,
    studioBgTolerance,
    studioBustMask,
  ]);

  useEffect(() => {
    if (!loadedPhotoImg) return;
    const dataUrl = renderStudioToCanvas();
    if (dataUrl) {
      setPreviewMinifaceUrl(dataUrl);
    }
  }, [loadedPhotoImg, renderStudioToCanvas]);

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStudioError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setStudioError('Không thể đọc tệp ảnh vừa chọn.');
        return;
      }
      const img = new Image();
      img.onload = () => {
        setLoadedPhotoImg(img);
        const cleanName = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 22);
        setLoadedPhotoLabel(cleanName || 'Ảnh Tự Tạo');
        setStudioZoom(1.15);
        setStudioPanX(0);
        setStudioPanY(0);
        gameSound.playClick(1.1);
      };
      img.onerror = () => {
        setStudioError('Định dạng ảnh không hợp lệ. Vui lòng chọn ảnh PNG, JPG hoặc WEBP.');
      };
      img.src = result;
    };
    reader.onerror = () => {
      setStudioError('Không thể tải ảnh từ thiết bị.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveAndEquipCustomMiniface = () => {
    const dataUrl = renderStudioToCanvas();
    if (!dataUrl || dataUrl.length > MAX_CUSTOM_MINIFACE_LENGTH) {
      setStudioError('Không thể nén ảnh đạt chuẩn. Vui lòng thử lại với ảnh khác.');
      return;
    }
    const newItem: SavedCustomMiniface = {
      id: `cmf_${Date.now()}`,
      label: loadedPhotoLabel || 'Ảnh Điện Thoại',
      dataUrl,
      createdAt: Date.now(),
    };
    const nextGallery = [newItem, ...customGallery].slice(0, 12);
    setCustomGallery(nextGallery);
    saveCustomMinifaceGallery(nextGallery);
    handleApplyMiniface(dataUrl);
  };

  const handleDeleteCustomMiniface = (id: string) => {
    gameSound.playClick(0.9);
    const nextGallery = customGallery.filter((g) => g.id !== id);
    setCustomGallery(nextGallery);
    saveCustomMinifaceGallery(nextGallery);
  };

  if (!selectedCard || !selectedTemplate) {
    return (
      <div className="rounded-xl bg-[#0d1424] border border-white/10 p-8 text-center">
        <div className="text-lg font-bold text-white">Phòng Thay Đồ hiện chưa có cầu thủ</div>
        <p className="text-sm text-slate-400 mt-1">
          Hãy mở gói thẻ trong Kho Vật Phẩm để chiêu mộ cầu thủ mới.
        </p>
        <button
          type="button"
          onClick={onGoToVault}
          className="mt-4 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer whitespace-nowrap"
        >
          Đến Kho Vật Phẩm
        </button>
      </div>
    );
  }

  const isDefaultEquipped = !selectedCard.customMinifaceUrl;

  return (
    <div className="space-y-8" data-testid="locker-room-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2
            className="text-3xl font-bold italic tracking-wide text-white"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            PHÒNG THAY ĐỒ MINIFACE & BẢN QUYỀN CLB FC ONLINE
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Tùy chọn đổi <strong className="text-white">Miniface mùa thẻ thật chuẩn FC Online</strong> qua từng mùa giải (bao gồm{' '}
            <strong className="text-amber-300">Legendary Eternal (LE 135–140)</strong>,{' '}
            <strong className="text-yellow-300">Infinite Prime</strong>,{' '}
            <strong className="text-teal-300">Unsung Players (UP)</strong>,{' '}
            <strong className="text-rose-400">26VB Vietnam Best</strong>,{' '}
            <strong className="text-sky-300">26UCL</strong>, ICON TM) &amp; trọn bộ bản quyền {vnClubsCount} CLB Việt Nam + {intlClubsCount} CLB Quốc Tế.
          </p>
        </div>

        <div className="text-sm text-slate-300 tabular-nums shrink-0">
          Bản quyền chính thức:{' '}
          <strong className="text-[#a3e635] font-bold">
            {clubDirectory.length} CLB ({vnClubsCount} VN · {intlClubsCount} Quốc Tế)
          </strong>{' '}
          · <strong className="text-amber-400 font-bold">{PLAYER_TEMPLATES.length} Mùa Cầu Thủ</strong>
        </div>
      </div>

      {/* Main Locker Room Stage */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 lg:gap-6 items-stretch">
        {/* Left 5 cols: Live XL Card Preview & Equip Actions */}
        <div className="sm:col-span-5 rounded-xl fco-pc-panel p-4 sm:p-5 flex flex-col justify-between shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 fco-pack-stage-glow pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span className="text-[#a3e635] font-black uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                XEM TRƯỚC THẺ TRONG PHÒNG THAY ĐỒ
              </span>
              <span className="text-amber-300 font-bold tabular-nums">
                Có {minifaceOptions.length} Miniface khác nhau
              </span>
            </div>

            <div className="flex justify-center py-3 drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]" data-testid="locker-preview-card">
              <PlayerCardView
                card={selectedCard}
                size="xl"
                showStats
                showValue
                customMinifaceUrlOverride={previewMinifaceUrl}
              />
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Cầu thủ đang chọn:</span>
                <strong className="text-white">
                  {selectedTemplate.name} ({selectedTemplate.seasonLabel} +{selectedCard.grade})
                </strong>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">CLB bản quyền:</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-amber-300">
                  <ClubCrestSvg clubCode={selectedTemplate.clubCode} className="w-4 h-4" />
                  {selectedTemplate.clubName}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Trạng thái Miniface:</span>
                <span className="text-emerald-400 font-bold">
                  {selectedCard.customMinifaceUrl?.startsWith('data:image/')
                    ? 'Đang dùng Miniface Tự Tạo'
                    : selectedCard.customMinifaceUrl
                    ? 'Đang dùng Miniface Phòng Thay Đồ'
                    : 'Mặc định mùa gốc'}
                </span>
              </div>
            </div>

            {equipToast && (
              <div
                role="status"
                className="mt-3 rounded-lg bg-emerald-500/20 border border-emerald-400/60 px-3.5 py-2 text-xs font-bold text-emerald-300 shadow-md"
              >
                {equipToast}
              </div>
            )}
          </div>

          <div className="relative z-10 mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                handleApplyMiniface(
                  previewMinifaceUrl === null ? undefined : activePreviewUrl
                )
              }
              className="fco-pc-tab-skew flex-1 min-w-[140px] py-2.5 px-2.5 fco-pc-btn-gold text-[11px] lg:text-xs tracking-wider cursor-pointer whitespace-nowrap"
            >
              <span>Trang bị Miniface đang chọn</span>
            </button>

            <button
              type="button"
              disabled={isDefaultEquipped && previewMinifaceUrl === undefined}
              onClick={() => handleApplyMiniface(undefined)}
              className="fco-pc-tab-skew flex-1 sm:flex-initial py-2.5 px-2.5 fco-pc-btn-slate disabled:opacity-45 text-[11px] lg:text-xs tracking-wider cursor-pointer whitespace-nowrap"
            >
              <span>Mặc định mùa gốc</span>
            </button>
          </div>
        </div>

        {/* Right 7 cols: Player Roster Selector + Per-Season Miniface Wardrobe */}
        <div className="sm:col-span-7 flex flex-col gap-4">
          {/* 01. Pick Owned Card */}
          <div className="rounded-xl fco-pc-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-xs font-black text-[#a3e635] uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                01. Chọn Cầu Thủ Trong Đội Hình ({filteredOwnedCards.length} thẻ)
              </span>
              {clubSearch !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setClubSearch('ALL')}
                  className="text-xs text-amber-400 hover:underline cursor-pointer whitespace-nowrap font-bold"
                >
                  Bỏ lọc CLB ({CLUB_LICENSE_REGISTRY[clubSearch]?.officialName ?? clubSearch})
                </button>
              )}
            </div>

            <div className="flex gap-3.5 overflow-x-auto pt-4 px-2 pb-3">
              {filteredOwnedCards.map((c) => {
                const tpl = PLAYER_TEMPLATE_MAP[c.templateId];
                const mfCount = tpl ? getMinifaceVariantsForPlayer(tpl.name).length : 1;
                return (
                  <PlayerCardView
                    key={`locker_card_${c.uid}`}
                    card={c}
                    size="sm"
                    selected={c.uid === selectedCard.uid}
                    badgeNote={`${mfCount} MF`}
                    onClick={() => {
                      gameSound.playClick();
                      setSelectedCardUid(c.uid);
                      setPreviewMinifaceUrl(undefined);
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* 02. Choose Background-Free Miniface Across Seasons */}
          <div className="rounded-xl fco-pc-panel p-4 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-xs font-black text-white uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  02. Chọn Miniface Không Nền Của {selectedTemplate.name} ({minifaceOptions.length} phiên bản mùa khác nhau)
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Ấn vào từng mẫu áo đấu / mùa giải để xem thử trực tiếp trên thẻ lớn bên trái, sau đó ấn &ldquo;Trang bị Miniface đang chọn&rdquo;.
                </p>
              </div>
              <NationFlagSvg
                code={selectedTemplate.nationalityCode}
                className="w-7 h-5 rounded shadow shrink-0"
              />
            </div>

            <div
              data-testid="locker-miniface-options"
              className="grid grid-cols-2 sm:grid-cols-3 gap-3"
            >
              {minifaceOptions.map((opt) => {
                const isEquipped =
                  (selectedCard.customMinifaceUrl &&
                    selectedCard.customMinifaceUrl === opt.url) ||
                  (!selectedCard.customMinifaceUrl &&
                    selectedTemplate.minifaceUrl === opt.url);
                const isPreviewing = activePreviewUrl === opt.url;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      gameSound.playClick(1.08);
                      setPreviewMinifaceUrl(opt.url);
                    }}
                    aria-label={`Chọn Miniface ${selectedTemplate.name} mùa ${opt.seasonLabel} CLB ${opt.clubName}`}
                    className={`rounded-xl p-3 border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      isPreviewing
                        ? 'fco-pc-panel-glow border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                        : 'fco-pc-panel border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <SeasonBadgeSvg season={opt.season} className="w-8 h-5 shrink-0" />
                      <ClubCrestSvg clubCode={opt.clubCode} className="w-5 h-5 shrink-0" />
                    </div>

                    <div className="my-2 h-24 rounded-lg bg-[#080d19] border border-white/5 flex items-end justify-center overflow-hidden p-1">
                      <img
                        src={opt.url}
                        alt={`${selectedTemplate.name} - ${opt.seasonLabel}`}
                        referrerPolicy="no-referrer"
                        className="w-22 h-22 object-contain object-bottom drop-shadow-[0_6px_12px_rgba(0,0,0,0.9)]"
                      />
                    </div>

                    <div>
                      <div className="text-xs font-bold text-white truncate">
                        {opt.season === '26UCL'
                          ? 'Áo C1 2026–2027 (26UCL)'
                          : opt.season === '26VB'
                          ? 'Áo Tuyển Việt Nam (26VB)'
                          : opt.season === 'LE'
                          ? opt.seasonLabel.includes('Pose 2')
                            ? 'Legendary Eternal (LE · Pose 2)'
                            : 'Legendary Eternal (LE)'
                          : opt.season === 'UP'
                          ? 'Unsung Players (UP)'
                          : `Mùa ${opt.seasonLabel}`}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {opt.clubName}
                      </div>
                      <div className="mt-1.5 text-[11px] font-semibold">
                        {isEquipped ? (
                          <span className="text-emerald-400">Đang trang bị</span>
                        ) : isPreviewing ? (
                          <span className="text-amber-300">Đang xem thử</span>
                        ) : (
                          <span className="text-slate-500">Ấn để thử áo</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mobile Custom Miniface Studio */}
            <div
              data-testid="mobile-miniface-studio"
              className="mt-5 pt-4 border-t border-white/10 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div
                    className="text-xs font-black text-[#a3e635] uppercase tracking-wider"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    TẠO MINIFACE TỪ ẢNH ĐIỆN THOẠI
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Chọn ảnh từ thư viện hoặc chụp ảnh trên điện thoại, căn chỉnh vị trí, tách nền nhanh &amp; gắn trực tiếp lên thẻ cầu thủ.
                  </p>
                </div>

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    data-testid="mobile-miniface-file-input"
                    onChange={handlePhotoFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    data-testid="mobile-miniface-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    className="fco-pc-tab-skew px-3.5 py-2 fco-pc-btn-primary text-slate-950 font-black text-xs tracking-wider cursor-pointer whitespace-nowrap"
                  >
                    <span>Chọn Ảnh Điện Thoại</span>
                  </button>
                </div>
              </div>

              {studioError && (
                <div className="rounded-lg bg-rose-950/80 border border-rose-500/50 px-3 py-2 text-xs font-semibold text-rose-200">
                  {studioError}
                </div>
              )}

              {loadedPhotoImg && (
                <div className="rounded-xl bg-[#070c17] border border-[#a3e635]/40 p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* Interactive Drag & Preview Canvas */}
                  <div className="md:col-span-5 flex flex-col items-center gap-1.5">
                    <div
                      className="w-[180px] h-[180px] rounded-xl border border-white/15 overflow-hidden touch-none cursor-grab active:cursor-grabbing shadow-inner"
                      style={{
                        backgroundImage:
                          'linear-gradient(45deg, #111827 25%, transparent 25%), linear-gradient(-45deg, #111827 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #111827 75%), linear-gradient(-45deg, transparent 75%, #111827 75%)',
                        backgroundSize: '16px 16px',
                        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                        backgroundColor: '#090d16',
                      }}
                      onPointerDown={(ev) => {
                        ev.currentTarget.setPointerCapture(ev.pointerId);
                        dragOriginRef.current = {
                          x: ev.clientX,
                          y: ev.clientY,
                          panX: studioPanX,
                          panY: studioPanY,
                        };
                      }}
                      onPointerMove={(ev) => {
                        if (!dragOriginRef.current) return;
                        const dx = ev.clientX - dragOriginRef.current.x;
                        const dy = ev.clientY - dragOriginRef.current.y;
                        setStudioPanX(Math.max(-110, Math.min(110, Math.round(dragOriginRef.current.panX + dx))));
                        setStudioPanY(Math.max(-110, Math.min(110, Math.round(dragOriginRef.current.panY + dy))));
                      }}
                      onPointerUp={() => {
                        dragOriginRef.current = null;
                      }}
                      onPointerCancel={() => {
                        dragOriginRef.current = null;
                      }}
                    >
                      <canvas
                        ref={studioCanvasRef}
                        data-testid="mobile-miniface-canvas"
                        className="w-full h-full block"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Kéo trực tiếp lên ảnh để căn chỉnh khuôn mặt
                    </span>
                  </div>

                  {/* Sliders & Toggles */}
                  <div className="md:col-span-7 space-y-2.5 text-xs">
                    <div>
                      <label className="flex justify-between text-[11px] text-slate-300 font-semibold">
                        <span>Thu phóng ảnh</span>
                        <span className="font-mono text-[#a3e635]">{studioZoom.toFixed(2)}x</span>
                      </label>
                      <input
                        type="range"
                        min="0.7"
                        max="2.8"
                        step="0.05"
                        value={studioZoom}
                        onChange={(e) => setStudioZoom(Number(e.target.value))}
                        className="w-full accent-[#a3e635]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="flex justify-between text-[11px] text-slate-300 font-semibold">
                          <span>Dịch ngang</span>
                          <span className="font-mono text-slate-400">{studioPanX}px</span>
                        </label>
                        <input
                          type="range"
                          min="-110"
                          max="110"
                          step="1"
                          value={studioPanX}
                          onChange={(e) => setStudioPanX(Number(e.target.value))}
                          className="w-full accent-amber-400"
                        />
                      </div>
                      <div>
                        <label className="flex justify-between text-[11px] text-slate-300 font-semibold">
                          <span>Dịch dọc</span>
                          <span className="font-mono text-slate-400">{studioPanY}px</span>
                        </label>
                        <input
                          type="range"
                          min="-110"
                          max="110"
                          step="1"
                          value={studioPanY}
                          onChange={(e) => setStudioPanY(Number(e.target.value))}
                          className="w-full accent-amber-400"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-0.5">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={studioBustMask}
                          onChange={(e) => setStudioBustMask(e.target.checked)}
                          className="accent-[#a3e635]"
                        />
                        Cắt bán thân chuẩn FC Online
                      </label>

                      <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={studioRemoveBg}
                          onChange={(e) => setStudioRemoveBg(e.target.checked)}
                          className="accent-[#a3e635]"
                        />
                        Tự tách nền đơn sắc
                      </label>
                    </div>

                    {studioRemoveBg && (
                      <div>
                        <label className="flex justify-between text-[11px] text-slate-300 font-semibold">
                          <span>Độ nhạy tách nền</span>
                          <span className="font-mono text-sky-300">{studioBgTolerance}</span>
                        </label>
                        <input
                          type="range"
                          min="12"
                          max="90"
                          step="2"
                          value={studioBgTolerance}
                          onChange={(e) => setStudioBgTolerance(Number(e.target.value))}
                          className="w-full accent-sky-400"
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        data-testid="mobile-miniface-save-btn"
                        onClick={handleSaveAndEquipCustomMiniface}
                        className="flex-1 py-2 px-3 rounded-lg bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-black text-xs cursor-pointer whitespace-nowrap"
                      >
                        Lưu &amp; Trang Bị Lên Thẻ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLoadedPhotoImg(null);
                          setPreviewMinifaceUrl(undefined);
                        }}
                        className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {customGallery.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-300">
                    Miniface tự tạo đã lưu ({customGallery.length}/12):
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {customGallery.map((item) => {
                      const isEquipped = selectedCard.customMinifaceUrl === item.dataUrl;
                      const isPreviewing = activePreviewUrl === item.dataUrl;
                      return (
                        <div
                          key={item.id}
                          className={`relative rounded-lg p-2 border transition-all ${
                            isPreviewing
                              ? 'fco-pc-panel-glow border-[#a3e635]'
                              : 'bg-slate-950/80 border-white/10 hover:border-white/25'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              gameSound.playClick(1.06);
                              setPreviewMinifaceUrl(item.dataUrl);
                            }}
                            className="w-full text-left cursor-pointer"
                          >
                            <div className="h-16 rounded bg-[#080d19] flex items-end justify-center overflow-hidden p-1">
                              <img
                                src={item.dataUrl}
                                alt={item.label}
                                className="w-14 h-14 object-contain object-bottom"
                              />
                            </div>
                            <div className="text-[10px] font-bold text-white truncate mt-1">
                              {item.label}
                            </div>
                            <div className="text-[10px] font-semibold">
                              {isEquipped ? (
                                <span className="text-emerald-400">Đang dùng</span>
                              ) : isPreviewing ? (
                                <span className="text-amber-300">Đang thử</span>
                              ) : (
                                <span className="text-slate-500">Ấn để thử</span>
                              )}
                            </div>
                          </button>

                          <button
                            type="button"
                            aria-label={`Xóa ${item.label}`}
                            onClick={() => handleDeleteCustomMiniface(item.id)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 hover:bg-rose-600 text-slate-300 hover:text-white text-[10px] font-bold flex items-center justify-center cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 03. Full Official Club Licensing Showcase */}
      <div className="rounded-xl fco-pc-panel p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3
              className="text-2xl font-bold italic text-white"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              03. HỆ THỐNG BẢN QUYỀN TẤT CẢ CÂU LẠC BỘ CHÍNH THỨC ({clubDirectory.length} CLB)
            </h3>
            <p className="text-xs text-slate-400">
              Trọn bộ {vnClubsCount} CLB Bóng Đá Việt Nam (LPBank V.League 1, Hạng Nhất Quốc Gia &amp; Huyền Thoại) cùng {intlClubsCount} CLB Quốc Tế bản quyền chính thức.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-white/10">
              {(
                [
                  { id: 'ALL', label: `Tất cả CLB (${clubDirectory.length})` },
                  { id: 'VN', label: `CLB Việt Nam (${vnClubsCount})` },
                  { id: 'INTL', label: `CLB Quốc Tế (${intlClubsCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    gameSound.playClick();
                    setClubRegionTab(tab.id);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    clubRegionTab === tab.id
                      ? 'bg-[#a3e635] text-slate-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-64 shrink-0">
              <label htmlFor="locker-club-filter" className="sr-only">
                Tìm câu lạc bộ bản quyền
              </label>
              <input
                id="locker-club-filter"
                type="search"
                value={clubFilterQuery}
                onChange={(e) => setClubFilterQuery(e.target.value)}
                placeholder={`Tìm trong ${clubDirectory.length} CLB (VD: Công An Hà Nội, SLNA...)`}
                className="w-full rounded-lg bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        <div
          data-testid="licensed-clubs-grid"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5"
        >
          {visibleClubs.map((club) => {
            const active = clubSearch === club.code;
            return (
              <button
                key={club.code}
                type="button"
                onClick={() => {
                  gameSound.playClick();
                  setClubSearch((prev) => (prev === club.code ? 'ALL' : club.code));
                }}
                className={`rounded-lg p-2.5 border text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 border-amber-400'
                    : 'bg-slate-950/75 border-white/10 hover:border-white/25'
                }`}
              >
                <ClubCrestSvg clubCode={club.code} className="w-8 h-8 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {club.officialName}
                  </div>
                  <div className="text-[10px] text-slate-400 tabular-nums truncate">
                    {club.playerCount} thẻ cầu thủ
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
