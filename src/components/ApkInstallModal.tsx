import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { gameSound } from '../game/sound';
import { FcOnlineTriangleMark } from './Emblems';

interface ApkInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkInstallModal: React.FC<ApkInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install, pwaBuilderUrl, appUrl } =
    usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (!isOpen) return null;

  const handle1TapInstall = async () => {
    gameSound.playClick(1.1);
    setInstalling(true);
    const success = await install();
    setInstalling(false);
    if (success) {
      gameSound.playUpgradeOutcome(true);
    }
  };

  const handleCopyLink = () => {
    gameSound.playClick(1.0);
    navigator.clipboard?.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cài đặt App Android APK FC Online"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none"
    >
      <div className="relative w-full max-w-xl max-h-[92%] flex flex-col rounded-2xl fco-pc-panel border-[#a3e635]/45 shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 fco-pc-topbar shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#131d31] to-[#070b12] border border-[#a3e635]/60 flex items-center justify-center shadow-md shadow-[#a3e635]/20 shrink-0">
              <FcOnlineTriangleMark className="w-7 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#a3e635] tracking-wider uppercase">
                Gói Ứng Dụng Điện Thoại Android / iOS
              </div>
              <h2
                className="text-xl sm:text-2xl font-extrabold italic text-white tracking-tight leading-none"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                CÀI ĐẶT APK &amp; WEBAPK FC ONLINE
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              gameSound.playClick(0.9);
              onClose();
            }}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content body */}
        <div className="p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto space-y-4 text-slate-200 text-sm">
          {/* Status banner */}
          {isInstalled ? (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#a3e635]/20 border border-[#a3e635]/50 flex items-center justify-center text-[#a3e635] shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <strong className="text-emerald-300 block">Đã cài đặt thành công WebAPK!</strong>
                <span className="text-xs text-slate-300">
                  Ứng dụng đang chạy ở chế độ Standalone toàn màn hình, mượt mà chuẩn PC trên điện thoại.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-xs text-amber-200">
              💡 Game hỗ trợ cài đặt trực tiếp thành <strong>WebAPK Android</strong> không cần file cài rườm rà, hoặc tải file <strong>.apk</strong> độc lập để cài đặt thủ công.
            </div>
          )}

          {/* Option 1: 1-Tap WebAPK Install */}
          <div className="p-4 rounded-xl bg-[#0e1627] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[#a3e635] text-slate-950 uppercase tracking-wider">
                  Cách 1 · Nhanh nhất
                </span>
                <span className="font-bold text-white text-base">Cài Đặt WebAPK 1 Chạm</span>
              </div>
              <span className="text-xs text-[#a3e635] font-semibold">Khuyên dùng cho Android</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Android Chrome sẽ trực tiếp tạo gói <strong>WebAPK chính thống</strong> có biểu tượng FC Online ngoài màn hình chính, tự động cập nhật, có phản hồi rung Haptic và mở không thanh URL.
            </p>

            {isInstallable ? (
              <button
                type="button"
                onClick={handle1TapInstall}
                disabled={installing}
                className="w-full py-3 px-4 rounded-sm fco-pc-btn-primary fco-pc-tab-skew text-sm tracking-wide flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {installing ? 'Đang mở cửa sổ cài đặt...' : 'CÀI ĐẶT NGAY LÊN ĐIỆN THOẠI (1 CHẠM)'}
              </button>
            ) : (
              <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-2 text-xs">
                <div className="font-semibold text-slate-200">Hướng dẫn thêm trên Google Chrome Android:</div>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>Nhấn nút <strong>3 chấm (⋮)</strong> ở góc trên bên phải trình duyệt Chrome.</li>
                  <li>Chọn mục <strong>"Cài đặt ứng dụng"</strong> hoặc <strong>"Thêm vào Màn hình chính"</strong>.</li>
                  <li>Nhấn <strong>"Cài đặt"</strong> — Android sẽ tự động tạo file ứng dụng APK ngay lập tức.</li>
                </ol>
              </div>
            )}
          </div>

          {/* Option 2: Standalone .APK File Generation via PWABuilder */}
          <div className="p-4 rounded-xl bg-[#0e1627] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500 text-white uppercase tracking-wider">
                  Cách 2
                </span>
                <span className="font-bold text-white text-base">Tải File Cài Đặt Độc Lập (.apk)</span>
              </div>
              <span className="text-xs text-blue-300 font-semibold">Tệp .apk phân phối</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Sử dụng công cụ chính thống <strong>PWABuilder (Google &amp; Microsoft)</strong> để đóng gói URL ứng dụng thành tệp <code>.apk</code> hoàn chỉnh cài đặt thủ công hoặc chia sẻ qua Zalo/Drive.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <a
                href={pwaBuilderUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => gameSound.playClick(1.05)}
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer text-center"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Tạo File .APK Trên PWABuilder
              </a>

              <button
                type="button"
                onClick={handleCopyLink}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                {copied ? '✓ Đã Sao Chép Link Game' : 'Sao Chép Link Để Tạo APK'}
              </button>
            </div>

            <div className="text-[11px] text-slate-500 bg-black/30 p-2.5 rounded-lg border border-white/5 space-y-1">
              <p>📌 <strong>Quy trình PWABuilder 3 bước:</strong></p>
              <p>1. Nhấn nút <em>"Tạo File .APK"</em> ở trên để mở PWABuilder với link game sẵn có.</p>
              <p>2. Nhấn <strong>"Package for Android"</strong>.</p>
              <p>3. Tải file <code>.apk</code> về máy Android và bấm mở để cài đặt (cho phép nguồn tin cậy).</p>
            </div>
          </div>

          {/* Option 3: iOS iPhone/iPad instruction */}
          {(isIOS || !isAndroid) && (
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-200 uppercase">
                  Apple iOS
                </span>
                <span className="font-bold text-slate-200 text-xs">Cài đặt trên iPhone / iPad (Safari):</span>
              </div>
              <p className="text-xs text-slate-400">
                1. Mở link game trên trình duyệt <strong>Safari</strong>.<br />
                2. Nhấn nút <strong>Chia sẻ (biểu tượng mũi tên đi lên)</strong> ở thanh dưới.<br />
                3. Cuộn xuống và chọn <strong>"Thêm vào Màn hình chính" (Add to Home Screen)</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-[#070b12] flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Phiên bản: <strong className="text-[#a3e635]">FC Online PC Mobile Ed. v2.4</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              gameSound.playClick(0.9);
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
