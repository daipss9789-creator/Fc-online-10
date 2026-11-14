import React, { useState } from 'react';
import { PACK_CATALOG, VIP_REWARD_TIERS } from '../game/catalog';
import {
  SVIP_MEMBERSHIP_PLANS,
  calculateVipStatus,
  formatBpCompact,
  getCumulativePointsForVipLevel,
  getMarketTaxDiscountRate,
  getVipEnhancementBoostPercent,
} from '../game/rules';
import { gameSound } from '../game/sound';
import { ManagerProfile } from '../game/types';
import { PackArtwork } from './PackArtwork';

interface VipTopUpViewProps {
  profile: ManagerProfile;
  canClaimDailySalary: boolean;
  onClaimDailySvipSalary: () => { ok: boolean; error?: string; summaryText: string };
  onActivateSvipPlan: (planId: string) => { ok: boolean; error?: string; summaryText: string };
  onClaimVipReward: (vipLevel: number) => void;
  onGoToVault: () => void;
}

export const VipTopUpView: React.FC<VipTopUpViewProps> = ({
  profile,
  canClaimDailySalary,
  onClaimDailySvipSalary,
  onActivateSvipPlan,
  onClaimVipReward,
  onGoToVault,
}) => {
  const vipStatus = calculateVipStatus(profile.vipPoints);
  const taxRebatePct = Math.round(getMarketTaxDiscountRate(vipStatus.level) * 100);
  const enhanceBoostPct = getVipEnhancementBoostPercent(vipStatus.level);
  const dailyBpPreview = (8 + vipStatus.level * 2) * 1_000_000_000_000;
  const dailyFcPreview = 80 + vipStatus.level * 10;
  const dailyTarpoiPreview = 120 + vipStatus.level * 15;

  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null);

  const handleDailySalary = () => {
    const res = onClaimDailySvipSalary();
    if (!res.ok) {
      gameSound.playClick(0.8);
      setBanner({ ok: false, message: res.error ?? 'Không thể nhận lương hôm nay.' });
      return;
    }
    gameSound.playUpgradeOutcome(true);
    setBanner({ ok: true, message: res.summaryText });
  };

  const handleActivatePlan = (planId: string) => {
    const res = onActivateSvipPlan(planId);
    if (!res.ok) {
      gameSound.playClick(0.8);
      setBanner({ ok: false, message: res.error ?? 'Chưa đủ điều kiện kích hoạt gói SVIP.' });
      return;
    }
    gameSound.playUpgradeOutcome(true);
    setBanner({ ok: true, message: res.summaryText });
  };

  return (
    <div data-testid="fco-svip-view" className="space-y-6">
      {/* SVIP Hero Status Card (Zero Money Top-Up, 100% Pure SVIP Privileges) */}
      <div className="rounded-xl fco-pc-panel-glow p-4 sm:p-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 lg:gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black tracking-wider text-amber-300 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              <span>HỘI VIÊN ĐẶC QUYỀN SVIP FC ONLINE PC (SVIP 1 – SVIP 20)</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-[#a3e635]">KHÔNG NẠP TIỀN · CÀY CHAY BP &amp; TARPOI</span>
            </div>

            <div className="flex flex-wrap items-baseline gap-4">
              <span
                className="text-4xl sm:text-6xl font-black italic fco-text-gold tabular-nums tracking-wide"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                SVIP {vipStatus.level}
              </span>
              <span className="text-sm text-slate-300 tabular-nums">
                Điểm tích lũy SVIP:{' '}
                <strong className="text-amber-300 font-mono font-bold">
                  {vipStatus.totalPoints.toLocaleString('vi-VN')} điểm
                </strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 tabular-nums">
              <span>
                Giảm thuế TTCN hiện tại:{' '}
                <strong className="text-emerald-300 font-mono font-bold">-{taxRebatePct}%</strong>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                Trợ lực tỉ lệ Đập Thẻ:{' '}
                <strong className="text-[#a3e635] font-mono font-bold">+{enhanceBoostPct}%</strong>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                Quy tắc cấp: <strong className="text-white">SVIP 1→5</strong> (50đ/cấp) ·{' '}
                <strong className="text-white">5→10</strong> (200đ/cấp) ·{' '}
                <strong className="text-white">10→20</strong> (1.000đ/cấp)
              </span>
            </div>
          </div>

          {/* Right Progress & Club Wallet */}
          <div className="w-full sm:w-[290px] lg:w-[400px] shrink-0 space-y-2.5">
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="text-slate-300 font-semibold">
                {vipStatus.isMaxVip
                  ? 'Đã đạt đỉnh cao SVIP 20 Chí Tôn'
                  : `Tiến độ thăng cấp SVIP ${vipStatus.level + 1}`}
              </span>
              <span className="font-mono font-bold text-amber-400">
                {vipStatus.isMaxVip
                  ? 'MAX SVIP 20'
                  : `${vipStatus.currentStepPoints} / ${vipStatus.requiredStepPoints} điểm`}
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-slate-950 border border-white/15 overflow-hidden p-[1px]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 transition-transform duration-300 origin-left shadow-[0_0_12px_rgba(245,158,11,0.6)]"
                style={{ transform: `scaleX(${vipStatus.progressPercent / 100})` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 tabular-nums pt-0.5">
              <span>
                Quỹ BP: <strong className="text-emerald-300 font-mono font-bold">{formatBpCompact(profile.bp)}</strong>
              </span>
              <span>
                Tarpoi:{' '}
                <strong className="text-amber-300 font-mono font-bold">
                  {(profile.starPoints ?? 0).toLocaleString('vi-VN')}
                </strong>
              </span>
              <span>
                FC: <strong className="text-amber-400 font-mono font-bold">{profile.fc.toLocaleString('vi-VN')}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Daily SVIP Check-In Salary Strip */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs space-y-0.5">
            <div className="font-black text-white uppercase tracking-wide text-xs" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              LƯƠNG ĐẶC QUYỀN HỘI VIÊN SVIP MỖI NGÀY (THEO CẤP SVIP {vipStatus.level})
            </div>
            <div className="text-slate-300 tabular-nums">
              Nhận miễn phí mỗi ngày:{' '}
              <strong className="text-emerald-300 font-mono">+{formatBpCompact(dailyBpPreview)}</strong> ·{' '}
              <strong className="text-amber-400 font-mono">+{dailyFcPreview} FC</strong> ·{' '}
              <strong className="text-amber-300 font-mono">+{dailyTarpoiPreview} Tarpoi</strong> ·{' '}
              <strong className="text-[#a3e635] font-mono">+40 Điểm SVIP</strong>
            </div>
          </div>

          <button
            type="button"
            data-testid="claim-daily-svip-btn"
            disabled={!canClaimDailySalary}
            onClick={handleDailySalary}
            className={`fco-pc-tab-skew px-5 py-2.5 text-xs font-black transition-all whitespace-nowrap shrink-0 uppercase tracking-wide ${
              canClaimDailySalary
                ? 'fco-pc-btn-primary cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
            }`}
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            <span>{canClaimDailySalary ? 'Nhận Lương Ngày SVIP Ngay' : 'Đã Nhận Lương SVIP Hôm Nay'}</span>
          </button>
        </div>

        {banner && (
          <div
            role="status"
            data-testid="svip-status-banner"
            className={`mt-4 px-4 py-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 text-xs font-semibold ${
              banner.ok
                ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                : 'bg-rose-500/15 border-rose-400/50 text-rose-200'
            }`}
          >
            <span>{banner.message}</span>
            <button
              type="button"
              onClick={() => {
                gameSound.playClick();
                onGoToVault();
              }}
              className="px-3 py-1.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
            >
              Mở Kho Vật Phẩm →
            </button>
          </div>
        )}
      </div>

      {/* Section 2: Activate / Upgrade SVIP Membership Using In-Game BP or Tarpoi */}
      <section className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/10 pb-2.5">
          <div>
            <h3
              className="text-2xl font-bold italic text-white"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              KÍCH HOẠT &amp; GIA HẠN THẺ HỘI VIÊN SVIP (ĐỔI BẰNG BP &amp; TARPOI)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Sử dụng BP trắng hoặc Điểm Sao Tarpoi tích lũy từ trận đấu để thăng cấp SVIP, nhận FC và Gói Thẻ Mùa Giải
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {SVIP_MEMBERSHIP_PLANS.map((plan) => {
            const affordable =
              plan.currency === 'bp'
                ? profile.bp >= plan.cost
                : (profile.starPoints ?? 0) >= plan.cost;
            const costLabel =
              plan.currency === 'bp'
                ? formatBpCompact(plan.cost)
                : `${plan.cost.toLocaleString('vi-VN')} Tarpoi`;

            return (
              <div
                key={plan.id}
                data-testid={`svip-plan-${plan.id}`}
                className="rounded-xl fco-pc-panel hover:border-amber-400/80 p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all hover:shadow-[0_0_24px_rgba(245,158,11,0.22)]"
              >
                <div className="flex items-start gap-4">
                  {plan.packId && (
                    <div className="shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.8)]">
                      <PackArtwork packId={plan.packId} quantity={plan.packCount} size="sm" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-black text-amber-300 uppercase tracking-wider">{plan.tag}</span>
                      <span className="font-mono text-slate-400 text-[10px] uppercase">
                        {plan.currency === 'bp' ? 'Đổi bằng quỹ BP' : 'Đổi bằng Điểm Sao Tarpoi'}
                      </span>
                    </div>

                    <h4
                      className="text-base sm:text-lg font-black text-white mt-0.5 uppercase tracking-wide"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                    >
                      {plan.title}
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{plan.subtitle}</p>

                    <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1 text-xs tabular-nums">
                      <div className="text-amber-300 font-bold font-mono">
                        • +{plan.svipPointsGranted.toLocaleString('vi-VN')} Điểm SVIP &amp; +{plan.fcGranted.toLocaleString('vi-VN')} FC
                      </div>
                      {plan.bpGranted > 0 && (
                        <div className="text-emerald-300 font-mono">
                          • Tặng thêm +{formatBpCompact(plan.bpGranted)}
                        </div>
                      )}
                      {plan.starPointsGranted > 0 && (
                        <div className="text-amber-200 font-mono">
                          • Tặng thêm +{plan.starPointsGranted.toLocaleString('vi-VN')} Tarpoi
                        </div>
                      )}
                      {plan.packId && plan.packCount && (
                        <div className="text-slate-200 font-medium">
                          • {PACK_CATALOG[plan.packId].name}{' '}
                          <strong className="text-[#a3e635]">x{plan.packCount}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                  <div className="tabular-nums">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Chi phí kích hoạt</div>
                    <div
                      className={`text-sm font-black font-mono ${
                        plan.currency === 'bp' ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {costLabel}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!affordable}
                    onClick={() => handleActivatePlan(plan.id)}
                    className={`px-4 py-2 rounded text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                      affordable
                        ? 'fco-pc-btn-gold cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                    }`}
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    {affordable
                      ? 'Kích Hoạt Gói SVIP'
                      : plan.currency === 'bp'
                      ? 'Chưa đủ BP'
                      : 'Chưa đủ Tarpoi'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3: SVIP 1 – SVIP 20 Privilege Milestone Rewards */}
      <section className="space-y-4">
        <div>
          <h3
            className="text-2xl font-bold italic text-white"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            BẢNG ĐẶC QUYỀN CẤP ĐỘ SVIP (SVIP 1 – SVIP 20)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mỗi cấp SVIP mở khóa Gói Thẻ Mùa Giải, thưởng BP trắng, giảm thuế TTCN (tối đa -30%) và tăng tỉ lệ đập thẻ vĩnh viễn!
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {VIP_REWARD_TIERS.map((tier) => {
            const reqPts = getCumulativePointsForVipLevel(tier.vipLevel);
            const unlocked = vipStatus.level >= tier.vipLevel;
            const claimed = profile.claimedVipRewards.includes(tier.vipLevel);
            const pack = PACK_CATALOG[tier.packId];
            const tierTaxRebate = Math.round(getMarketTaxDiscountRate(tier.vipLevel) * 100);

            return (
              <div
                key={tier.vipLevel}
                className={`rounded-xl p-3.5 border flex flex-col justify-between transition-all ${
                  claimed
                    ? 'fco-pc-panel border-emerald-500/40 opacity-80'
                    : unlocked
                    ? 'fco-pc-panel-glow border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.22)]'
                    : 'fco-pc-panel border-white/10 opacity-70'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xl font-black italic tabular-nums tracking-wide ${
                        unlocked ? 'fco-text-gold' : 'text-slate-400'
                      }`}
                      style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                    >
                      SVIP {tier.vipLevel}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {reqPts.toLocaleString('vi-VN')}đ
                    </span>
                  </div>

                  <div className="mt-2 text-xs font-bold text-white uppercase tracking-wide">
                    {pack.seasonBadge} x{tier.packCount}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-mono font-bold tabular-nums mt-0.5">
                    +{formatBpCompact(tier.bonusBp)}
                  </div>
                  <div className="text-[10px] text-slate-300 mt-0.5 tabular-nums">
                    Đập thẻ +{tier.upgradeBoostPercent}% · Thuế -{tierTaxRebate}%
                  </div>
                </div>

                <div className="mt-3">
                  {claimed ? (
                    <span className="block text-center text-xs font-black text-emerald-400 uppercase tracking-wider font-mono">
                      ✓ Đã nhận
                    </span>
                  ) : unlocked ? (
                    <button
                      type="button"
                      onClick={() => {
                        gameSound.playUpgradeOutcome(true);
                        onClaimVipReward(tier.vipLevel);
                      }}
                      className="w-full py-1.5 px-3 rounded fco-pc-btn-gold text-xs cursor-pointer whitespace-nowrap"
                    >
                      Nhận quà SVIP {tier.vipLevel}
                    </button>
                  ) : (
                    <span className="block text-center text-[11px] text-slate-500 font-medium">
                      Chưa đạt cấp
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
