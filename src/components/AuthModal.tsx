import React, { useMemo, useState } from 'react';
import {
  SavedAccountSummary,
  bindGuestProfileToRealAccount,
  checkProfileHasAdminAccess,
  forceSaveManagerAccount,
  getLastAccountSavedTimestamp,
  getSavedAccountSummaries,
  loginManagerAccount,
  registerManagerAccount,
  removeSavedAccountFromDevice,
  signInWithGooglePopup,
  signOutManager,
  switchToSavedAccount,
} from '../firebase';
import { calculateSquadSummary, calculateVipStatus, formatBpCompact } from '../game/rules';
import { gameSound } from '../game/sound';
import { ManagerProfile } from '../game/types';

interface AuthModalProps {
  currentProfile: ManagerProfile;
  onAuthenticated: (profile: ManagerProfile) => void;
  onOpenAdminConsole?: () => void;
  onClose: () => void;
}

type AuthTab = 'saved' | 'bind_guest' | 'login' | 'register';

function formatTimeClock(ts: number | null): string {
  if (!ts) return 'Tự động lưu liên tục';
  const d = new Date(ts);
  return d.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const AuthModal: React.FC<AuthModalProps> = ({
  currentProfile,
  onAuthenticated,
  onOpenAdminConsole,
  onClose,
}) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const savedAccounts = useMemo<SavedAccountSummary[]>(() => {
    void refreshTick;
    return getSavedAccountSummaries();
  }, [refreshTick]);

  const defaultTab: AuthTab =
    savedAccounts.length > 0
      ? 'saved'
      : currentProfile.authMode === 'guest'
      ? 'bind_guest'
      : 'login';

  const [tab, setTab] = useState<AuthTab>(defaultTab);
  const [managerName, setManagerName] = useState(
    currentProfile.authMode === 'guest' && currentProfile.managerName !== 'HLV Khách'
      ? currentProfile.managerName
      : ''
  );
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberLogin, setRememberLogin] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSavedTs, setLastSavedTs] = useState<number | null>(() =>
    getLastAccountSavedTimestamp()
  );

  const currentVip = calculateVipStatus(currentProfile.vipPoints);
  const currentSummary = calculateSquadSummary(currentProfile.cards);
  const isCurrentAdmin = checkProfileHasAdminAccess(currentProfile);

  const handleManualSaveNow = () => {
    const { savedAt } = forceSaveManagerAccount(currentProfile);
    setLastSavedTs(savedAt);
    setRefreshTick((t) => t + 1);
    gameSound.playUpgradeOutcome(true);
    setErrorMsg('');
    setInfoMsg(
      `Đã lưu toàn bộ đội hình (${currentProfile.cards.length} thẻ), BP, FC & SVIP ${currentVip.level} lúc ${formatTimeClock(savedAt)}!`
    );
  };

  const handleQuickSwitch = (acc: SavedAccountSummary) => {
    setErrorMsg('');
    setInfoMsg('');
    try {
      const switched = switchToSavedAccount(acc.accountKey);
      gameSound.playUpgradeOutcome(true);
      onAuthenticated(switched);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể chuyển sang tài khoản đã lưu.'
      );
    }
  };

  const handleRemoveSaved = (acc: SavedAccountSummary) => {
    removeSavedAccountFromDevice(acc.accountKey);
    gameSound.playClick(0.85);
    setRefreshTick((t) => t + 1);
    setInfoMsg(`Đã bỏ lưu nhanh tài khoản "${acc.managerName}" trên thiết bị này.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const trimmedAccount = usernameOrEmail.trim();
    if (trimmedAccount.length < 3) {
      setErrorMsg('Tên tài khoản hoặc Email phải có ít nhất 3 ký tự.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    if (tab === 'bind_guest') {
      const trimmedName = managerName.trim();
      if (trimmedName.length < 2 || trimmedName.length > 32) {
        setErrorMsg('Tên Huấn Luyện Viên phải từ 2 đến 32 ký tự.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Mật khẩu xác nhận không khớp.');
        return;
      }

      setBusy(true);
      try {
        const bound = await bindGuestProfileToRealAccount({
          guestProfile: currentProfile,
          managerName: trimmedName,
          usernameOrEmail: trimmedAccount,
          password,
          rememberLogin,
        });
        gameSound.playUpgradeOutcome(true);
        setRefreshTick((t) => t + 1);
        onAuthenticated(bound);
        onClose();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Không thể liên kết tài khoản.');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (tab === 'register') {
      const trimmedName = managerName.trim();
      if (trimmedName.length < 2 || trimmedName.length > 32) {
        setErrorMsg('Tên Huấn Luyện Viên phải từ 2 đến 32 ký tự.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Mật khẩu xác nhận không khớp.');
        return;
      }

      setBusy(true);
      try {
        const { profile } = await registerManagerAccount({
          managerName: trimmedName,
          usernameOrEmail: trimmedAccount,
          password,
          rememberLogin,
        });
        gameSound.playUpgradeOutcome(true);
        setRefreshTick((t) => t + 1);
        onAuthenticated(profile);
        onClose();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Đăng ký không thành công.');
      } finally {
        setBusy(false);
      }
      return;
    }

    // Login mode
    setBusy(true);
    try {
      const profile = await loginManagerAccount({
        usernameOrEmail: trimmedAccount,
        password,
        rememberLogin,
      });
      gameSound.playClick(1.2);
      setRefreshTick((t) => t + 1);
      onAuthenticated(profile);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setBusy(true);
    try {
      const profile = await signInWithGooglePopup();
      gameSound.playUpgradeOutcome(true);
      setRefreshTick((t) => t + 1);
      onAuthenticated(profile);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? `Không thể hoàn tất đăng nhập Google: ${err.message}`
          : 'Đã hủy cửa sổ đăng nhập Google.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      const freshGuest = await signOutManager();
      gameSound.playClick(0.9);
      setRefreshTick((t) => t + 1);
      onAuthenticated(freshGuest);
      setInfoMsg(
        'Đã đăng xuất sang Phiên Khách mới. Các tài khoản thật của bạn vẫn được lưu an toàn trong mục "Tài Khoản Đã Lưu"!'
      );
      if (savedAccounts.length > 0) {
        setTab('saved');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trung tâm Tài khoản thật và Lưu trữ CLB FC Online"
      data-testid="fco-auth-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85"
    >
      <div className="w-full max-w-2xl max-h-[92%] overflow-y-auto rounded-xl fco-pc-panel border-[#a3e635]/45 p-4 sm:p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3.5">
          <div>
            <div className="text-[11px] font-bold tracking-wider text-[#a3e635]">
              EA SPORTS FC™ ONLINE PC · TRUNG TÂM TÀI KHOẢN THẬT &amp; LƯU TRỮ CLB
            </div>
            <h2
              className="text-2xl sm:text-3xl font-extrabold italic text-white mt-0.5"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              QUẢN LÝ &amp; LƯU LẠI TÀI KHOẢN HUẤN LUYỆN VIÊN
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại tài khoản"
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer shrink-0"
          >
            Đóng
          </button>
        </div>

        {/* Active Session & Manual Save Bar */}
        <div className="mt-4 rounded-lg bg-[#070b14] border border-white/12 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <strong className="text-sm text-white truncate">
                {currentProfile.managerName}
              </strong>
              <span className="text-slate-500">·</span>
              <span
                className={
                  currentProfile.authMode === 'guest'
                    ? 'text-amber-300 font-semibold'
                    : 'text-[#a3e635] font-semibold'
                }
              >
                {currentProfile.authMode === 'firebase'
                  ? 'Tài khoản Cloud Google'
                  : currentProfile.authMode === 'local'
                  ? `Tài khoản HLV Thật (${currentProfile.usernameOrEmail})`
                  : 'Phiên HLV Khách (nên liên kết Tài Khoản Thật)'}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 tabular-nums">
              <span>SVIP {currentVip.level}</span>
              <span>·</span>
              <span>CLB {formatBpCompact(currentSummary.squadValue)}</span>
              <span>·</span>
              <span>{currentProfile.cards.length} thẻ</span>
              <span>·</span>
              <span className="text-emerald-300">
                Lần lưu gần nhất: {formatTimeClock(lastSavedTs)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="auth-save-now-btn"
              onClick={handleManualSaveNow}
              className="px-3.5 py-2 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
            >
              Lưu Tài Khoản Ngay
            </button>

            {currentProfile.authMode !== 'guest' && (
              <button
                type="button"
                disabled={busy}
                onClick={handleLogout}
                className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold text-rose-300 cursor-pointer whitespace-nowrap"
              >
                Đăng xuất
              </button>
            )}
          </div>
        </div>

        {/* Integrated Game Control Bar — Strictly Visible Only Inside Administrator's Game Account */}
        {isCurrentAdmin && (
          <div className="mt-3 rounded-lg bg-[#0d1912] border border-[#a3e635]/45 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#a3e635]">
                TÀI KHOẢN QUẢN TRỊ VIÊN · TÍCH HỢP KIỂM SOÁT TRÒ CHƠI
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                Tài khoản này vừa thi đấu ĐXH, quản lý CLB như người chơi thật, vừa điều chỉnh luật máy chủ &amp; phát quà toàn thiết bị.
              </div>
            </div>

            {onOpenAdminConsole && (
              <button
                type="button"
                data-testid="auth-open-admin-console-btn"
                onClick={() => {
                  gameSound.playUpgradeOutcome(true);
                  onOpenAdminConsole();
                  onClose();
                }}
                className="px-3.5 py-2 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                Mở Kiểm Soát Trò Chơi
              </button>
            )}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 rounded-lg bg-[#060911] border border-white/10">
          <button
            type="button"
            onClick={() => {
              gameSound.playClick();
              setTab('saved');
              setErrorMsg('');
            }}
            className={`fco-pc-tab-skew py-2 px-2 rounded-sm text-xs font-black transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider ${
              tab === 'saved'
                ? 'fco-pc-btn-primary'
                : 'fco-pc-btn-slate'
            }`}
          >
            Đã Lưu ({savedAccounts.length})
          </button>

          {currentProfile.authMode === 'guest' && (
            <button
              type="button"
              onClick={() => {
                gameSound.playClick();
                setTab('bind_guest');
                setErrorMsg('');
              }}
              className={`fco-pc-tab-skew py-2 px-2 rounded-sm text-xs font-black transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider ${
                tab === 'bind_guest'
                  ? 'fco-pc-btn-gold'
                  : 'bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-300'
              }`}
            >
              Lưu Đội Khách Thành TK Thật
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              gameSound.playClick();
              setTab('login');
              setErrorMsg('');
            }}
            className={`fco-pc-tab-skew py-2 px-2 rounded-sm text-xs font-black transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider ${
              tab === 'login'
                ? 'fco-pc-btn-primary'
                : 'fco-pc-btn-slate'
            }`}
          >
            Đăng Nhập
          </button>

          <button
            type="button"
            onClick={() => {
              gameSound.playClick();
              setTab('register');
              setErrorMsg('');
            }}
            className={`fco-pc-tab-skew py-2 px-2 rounded-sm text-xs font-black transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider ${
              tab === 'register'
                ? 'fco-pc-btn-primary'
                : 'fco-pc-btn-slate'
            }`}
          >
            Tạo TK Thật Mới
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-3 px-3.5 py-2.5 rounded bg-rose-500/15 border border-rose-400/40 text-xs font-semibold text-rose-300"
          >
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div
            role="status"
            className="mt-3 px-3.5 py-2.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-xs font-semibold text-emerald-300"
          >
            {infoMsg}
          </div>
        )}

        {/* TAB 1: SAVED ACCOUNTS VAULT */}
        {tab === 'saved' && (
          <div className="mt-4 space-y-2.5" data-testid="saved-accounts-vault">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Danh sách tài khoản thật đã lưu trên máy — bấm 1 chạm để vào ngay đúng đội hình CLB
              </span>
            </div>

            {savedAccounts.length === 0 ? (
              <div className="rounded-lg bg-[#070b14] border border-white/10 p-6 text-center space-y-3">
                <div className="text-sm font-bold text-white">
                  Chưa có tài khoản thật nào được lưu trên thiết bị này
                </div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Hãy lưu ngay đội hình đang chơi thành Tài Khoản HLV Thật hoặc tạo tài khoản mới để hệ thống tự động ghi nhớ đội hình, BP, FC, SVIP và đưa lên Bảng Xếp Hạng Máy Chủ!
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {currentProfile.authMode === 'guest' && (
                    <button
                      type="button"
                      onClick={() => setTab('bind_guest')}
                      className="px-4 py-2 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer"
                    >
                      Lưu Đội Hình Hiện Tại Thành Tài Khoản Thật
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTab('register')}
                    className="px-4 py-2 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer"
                  >
                    Đăng Ký Tài Khoản HLV Mới
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {savedAccounts.map((acc) => {
                  const isActive =
                    (acc.authMode === 'local' &&
                      currentProfile.authMode === 'local' &&
                      currentProfile.usernameOrEmail?.toLowerCase() ===
                        acc.usernameOrEmail.toLowerCase()) ||
                    (acc.authMode === 'firebase' &&
                      currentProfile.authMode === 'firebase' &&
                      `cloud:${currentProfile.id}` === acc.accountKey);

                  return (
                    <div
                      key={acc.accountKey}
                      className={`rounded-lg p-3.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isActive
                          ? 'bg-[#111d13] border-[#a3e635]/70'
                          : 'bg-[#070b14] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <strong className="text-sm text-white truncate">
                            {acc.managerName}
                          </strong>
                          <span className="font-mono text-amber-300 font-bold">
                            SVIP {acc.vipLevel}
                          </span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-400 truncate">
                            {acc.usernameOrEmail}
                          </span>
                          {isActive && (
                            <span className="text-[#a3e635] font-bold">
                              · Đang sử dụng
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 tabular-nums">
                          <span className="text-emerald-300 font-mono">
                            CLB {formatBpCompact(acc.squadValue)}
                          </span>
                          <span>·</span>
                          <span>Quỹ {formatBpCompact(acc.bp)}</span>
                          <span>·</span>
                          <span>{acc.cardCount} cầu thủ (Max OVR {acc.bestCardOvr})</span>
                          <span>·</span>
                          <span>Lưu lúc {formatTimeClock(acc.lastSavedAt)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => handleQuickSwitch(acc)}
                            className="px-3.5 py-1.5 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                          >
                            Vào CLB Này
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveSaved(acc)}
                          className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer whitespace-nowrap"
                        >
                          Bỏ lưu
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2 / 3 / 4: BIND GUEST / LOGIN / REGISTER FORM */}
        {tab !== 'saved' && (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            {tab === 'bind_guest' && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-400/35 px-3.5 py-2.5 text-xs text-amber-200 leading-relaxed">
                Giữ nguyên <strong>100% đội hình hiện tại ({currentProfile.cards.length} cầu thủ)</strong>,{' '}
                <strong>{formatBpCompact(currentProfile.bp)}</strong>,{' '}
                <strong>{currentProfile.fc.toLocaleString('vi-VN')} FC</strong> và{' '}
                <strong>SVIP {currentVip.level}</strong> chuyển thẳng thành Tài Khoản Thật lưu vĩnh viễn trên máy &amp; Bảng Xếp Hạng!
              </div>
            )}

            {(tab === 'register' || tab === 'bind_guest') && (
              <div>
                <label
                  htmlFor="auth-manager-name"
                  className="block text-xs font-semibold text-slate-300 mb-1"
                >
                  Tên Huấn Luyện Viên (Hiển thị trong Sảnh &amp; BXH Máy Chủ)
                </label>
                <input
                  id="auth-manager-name"
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="Ví dụ: HLV Rồng Vàng VN"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#060911] border border-white/15 text-sm text-white focus:outline-none focus:border-[#a3e635]"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-username"
                className="block text-xs font-semibold text-slate-300 mb-1"
              >
                Tên tài khoản hoặc Email đăng nhập
              </label>
              <input
                id="auth-username"
                type="text"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="Nhập tên tài khoản (VD: khangfco2026) hoặc email"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#060911] border border-white/15 text-sm text-white focus:outline-none focus:border-[#a3e635]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={tab === 'login' ? 'sm:col-span-2' : ''}>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-semibold text-slate-300 mb-1"
                >
                  Mật khẩu (Tối thiểu 6 ký tự)
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#060911] border border-white/15 text-sm text-white focus:outline-none focus:border-[#a3e635]"
                />
              </div>

              {(tab === 'register' || tab === 'bind_guest') && (
                <div>
                  <label
                    htmlFor="auth-confirm-password"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    Xác nhận mật khẩu
                  </label>
                  <input
                    id="auth-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#060911] border border-white/15 text-sm text-white focus:outline-none focus:border-[#a3e635]"
                  />
                </div>
              )}
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer select-none pt-0.5">
              <input
                type="checkbox"
                checked={rememberLogin}
                onChange={(e) => setRememberLogin(e.target.checked)}
                className="w-4 h-4 accent-[#a3e635] rounded cursor-pointer"
              />
              <span>
                Ghi nhớ &amp; lưu lại tài khoản trên thiết bị (Tự động lưu đội hình &amp; chuyển nhanh 1 chạm)
              </span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-sm fco-pc-btn-primary fco-pc-tab-skew disabled:opacity-60 text-sm cursor-pointer whitespace-nowrap"
            >
              {busy
                ? 'Đang xử lý...'
                : tab === 'login'
                ? 'Đăng Nhập & Lưu Phiên CLB'
                : tab === 'bind_guest'
                ? 'Lưu Đội Hình Hiện Tại Thành Tài Khoản Thật'
                : 'Tạo Tài Khoản HLV Thật & Lưu Lại'}
            </button>
          </form>
        )}

        {/* Cloud Google Sign-In Footer */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <button
            type="button"
            disabled={busy}
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-white disabled:opacity-60 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>Đăng nhập Google Cloud Firebase (Đồng bộ trực tuyến &amp; Lưu tài khoản)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
