import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ManagedAccountEntry,
  adminCreateNewPlayerAccount,
  adminDeleteManagedAccount,
  adminResetLocalAccountPassword,
  adminSetAccountBanStatus,
  adminSetDelegatedAdminStatus,
  auth,
  fetchServerManagedAccounts,
  getAllManagedAccounts,
  getCanonicalSummaryKeyForProfile,
  hasCloudAdminWriteAuthority,
  linkGoogleCloudAdminSession,
  loadManagedAccountFullProfile,
  mirrorKnownAccountsToCloudForAdmin,
  openOrCreateCrossWebTargetAccountByAdmin,
  persistManagedAccountMutation,
  performOfficialReleaseServerWipe,
  publishGlobalBroadcastGiftEverywhere,
  subscribeCloudManagedAccountsForAdmin,
} from '../firebase';
import {
  DEFAULT_GLOBAL_SERVER_RULES,
  MASTER_ADMIN_USERNAME,
  adminAdjustAccountVipPoints,
  adminApplyMaxGodPreset,
  adminGrantPacksToAccount,
  adminGrantPlayerCardToAccount,
  adminModifyAccountBp,
  adminModifyAccountFc,
  adminModifyAccountTarpoi,
  adminRemoveOwnedCardFromAccount,
  adminRenameAccountManager,
  adminResetAccountStarter,
  adminSetAccountSvipLevel,
  adminSetOwnedCardGradeInAccount,
  appendGmAuditLog,
  clearGmAuditLog,
  loadGmAuditLog,
} from '../game/adminRules';
import {
  PACK_CATALOG,
  PACK_ORDER,
  PLAYER_TEMPLATES,
  PLAYER_TEMPLATE_MAP,
  SEASON_CARD_ARTWORK,
} from '../game/catalog';
import {
  MAX_CARD_GRADE,
  calculateSquadSummary,
  calculateVipStatus,
  computeCardOvr,
  formatBpCompact,
  isSerializedSeason,
} from '../game/rules';
import { gameSound } from '../game/sound';
import {
  GlobalServerRules,
  GmAuditLogEntry,
  LeaderboardRow,
  ManagerProfile,
  OwnedCard,
  PackId,
  SeasonCode,
} from '../game/types';
import { SeasonBadgeSvg } from './Emblems';
import { PlayerCardView, getGradeBadgeStyle } from './PlayerCardView';

interface AdminControlViewProps {
  currentAdminProfile: ManagerProfile;
  cloudLeaderboardRows: LeaderboardRow[];
  serverRules: GlobalServerRules;
  onUpdateServerRules: (next: GlobalServerRules) => void;
  onSyncActiveProfile: (updated: ManagerProfile) => void;
  onSwitchIntoAccount: (summaryKey: string) => void;
  onReturnToPlay?: () => void;
  onRefreshAccountsCount: () => void;
}

type AdminWorkspaceTab = 'account_core' | 'cards_squad' | 'packs_broadcast' | 'server_rules';

const ALL_SEASONS = Object.keys(SEASON_CARD_ARTWORK) as SeasonCode[];
const ONE_BILLION_BP = 1_000_000_000;

function doesSummaryMatchProfile(summaryKey: string, profile: ManagerProfile): boolean {
  if (getCanonicalSummaryKeyForProfile(profile) === summaryKey) {
    return true;
  }
  if (summaryKey.startsWith('local:')) {
    const key = summaryKey.slice('local:'.length).toLowerCase();
    return (
      profile.authMode === 'local' &&
      (profile.usernameOrEmail || '').trim().toLowerCase() === key
    );
  }
  if (summaryKey.startsWith('guest:')) {
    return profile.authMode === 'guest' && summaryKey === 'guest:guest_default';
  }
  if (summaryKey.startsWith('cloud:')) {
    const uid = summaryKey.slice('cloud:'.length);
    return profile.authMode === 'firebase' && profile.id === uid;
  }
  return false;
}

export const AdminControlView: React.FC<AdminControlViewProps> = ({
  currentAdminProfile,
  cloudLeaderboardRows,
  serverRules,
  onUpdateServerRules,
  onSyncActiveProfile,
  onSwitchIntoAccount,
  onReturnToPlay,
  onRefreshAccountsCount,
}) => {
  const [directoryTick, setDirectoryTick] = useState<number>(0);
  const [remoteAccounts, setRemoteAccounts] = useState<ManagedAccountEntry[]>([]);
  const [cloudManagedAccounts, setCloudManagedAccounts] = useState<ManagedAccountEntry[]>([]);
  const [cloudAdminConnected, setCloudAdminConnected] = useState<boolean>(() =>
    hasCloudAdminWriteAuthority()
  );
  const [crossWebTargetInput, setCrossWebTargetInput] = useState<string>('');
  const [accountSearch, setAccountSearch] = useState<string>('');
  const [workspaceTab, setWorkspaceTab] = useState<AdminWorkspaceTab>('account_core');

  useEffect(() => {
    let active = true;
    const pullRemote = () => {
      setCloudAdminConnected(hasCloudAdminWriteAuthority());
      fetchServerManagedAccounts()
        .then((rows) => {
          if (active) setRemoteAccounts(rows);
        })
        .catch(() => {});
    };
    pullRemote();
    const timer = window.setInterval(pullRemote, 6500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [directoryTick]);

  useEffect(() => {
    setCloudAdminConnected(hasCloudAdminWriteAuthority());
    const unsub = subscribeCloudManagedAccountsForAdmin((entries) => {
      setCloudManagedAccounts(entries);
    });
    return () => unsub();
  }, [directoryTick, cloudAdminConnected]);

  const accounts = useMemo<ManagedAccountEntry[]>(() => {
    void directoryTick;
    return getAllManagedAccounts(cloudLeaderboardRows, remoteAccounts, cloudManagedAccounts);
  }, [directoryTick, cloudLeaderboardRows, remoteAccounts, cloudManagedAccounts]);

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.managerName.toLowerCase().includes(q) ||
        a.usernameOrEmail.toLowerCase().includes(q) ||
        a.accountKey.toLowerCase().includes(q) ||
        (a.deviceLabel || '').toLowerCase().includes(q)
    );
  }, [accounts, accountSearch]);

  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const initial = getAllManagedAccounts(cloudLeaderboardRows);
    const nonGm = initial.find((a) => !a.isMasterAdmin);
    return nonGm?.summaryKey ?? initial[0]?.summaryKey ?? `local:${MASTER_ADMIN_USERNAME}`;
  });

  const [targetProfile, setTargetProfile] = useState<ManagerProfile | null>(null);
  const [loadingTarget, setLoadingTarget] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  // Create New Player Account Form
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newManagerName, setNewManagerName] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('123456');
  const [newInitSvip, setNewInitSvip] = useState<number>(5);
  const [newInitFc, setNewInitFc] = useState<number>(25000);
  const [newInitBpBillions, setNewInitBpBillions] = useState<number>(500000);

  // Tab 1 Inputs (SVIP, FC, BP, Tarpoi, Account Security)
  const [vipPointsInput, setVipPointsInput] = useState<string>('5000');
  const [fcInput, setFcInput] = useState<string>('50000');
  const [bpBillionsInput, setBpBillionsInput] = useState<string>('10000');
  const [tarpoiInput, setTarpoiInput] = useState<string>('10000');
  const [foosballLoopsInput, setFoosballLoopsInput] = useState<string>('100');
  const [foosballSpinsInput, setFoosballSpinsInput] = useState<string>('10000');
  const [renameInput, setRenameInput] = useState<string>('');
  const [resetPasswordInput, setResetPasswordInput] = useState<string>('');
  const [banReasonInput, setBanReasonInput] = useState<string>('Vi phạm nội quy máy chủ');

  // Tab 2 Inputs (Grant Player Cards + Edit Owned Squad)
  const [tplSearch, setTplSearch] = useState<string>('');
  const [tplSeason, setTplSeason] = useState<'ALL' | SeasonCode>('ALL');
  const [selectedTplId, setSelectedTplId] = useState<string>('ucl26_mbappe');
  const [grantGrade, setGrantGrade] = useState<number>(10);
  const [grantCopies, setGrantCopies] = useState<number>(1);
  const [grantCustomSerial, setGrantCustomSerial] = useState<string>('1');
  const [ownedSearch, setOwnedSearch] = useState<string>('');

  // Tab 3 Inputs (Packs & Mass Broadcast)
  const [bcastFc, setBcastFc] = useState<string>('50000');
  const [bcastBpBillions, setBcastBpBillions] = useState<string>('50000');
  const [bcastTarpoi, setBcastTarpoi] = useState<string>('5000');
  const [bcastVipPts, setBcastVipPts] = useState<string>('500');
  const [bcastPackId, setBcastPackId] = useState<PackId>('ucl_26');
  const [bcastPackCount, setBcastPackCount] = useState<string>('5');

  // Tab 4 Inputs (Server Rules & Audit Log)
  const [announcementDraft, setAnnouncementDraft] = useState<string>(
    serverRules.serverAnnouncement
  );
  const [auditLogs, setAuditLogs] = useState<GmAuditLogEntry[]>(() => loadGmAuditLog());

  useEffect(() => {
    setAnnouncementDraft(serverRules.serverAnnouncement);
  }, [serverRules.serverAnnouncement]);

  const selectedSummary = useMemo(
    () => accounts.find((a) => a.summaryKey === selectedKey) ?? null,
    [accounts, selectedKey]
  );

  const loadSelectedTarget = useCallback(async (keyToLoad: string) => {
    setLoadingTarget(true);
    try {
      const loaded = await loadManagedAccountFullProfile(keyToLoad);
      setTargetProfile(loaded);
      if (loaded) {
        setRenameInput(loaded.managerName);
      }
    } catch (err: unknown) {
      setStatusBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Không thể tải dữ liệu tài khoản mục tiêu.',
      });
    } finally {
      setLoadingTarget(false);
    }
  }, []);

  useEffect(() => {
    if (selectedKey) {
      loadSelectedTarget(selectedKey);
    }
  }, [selectedKey, loadSelectedTarget]);

  const recordLogAndNotify = useCallback(
    (
      actionLabel: string,
      detail: string,
      targetName?: string,
      targetKeyOverride?: string
    ) => {
      const updatedLogs = appendGmAuditLog({
        actorName: currentAdminProfile.managerName,
        targetAccountKey: targetKeyOverride ?? selectedKey,
        targetManagerName: targetName ?? targetProfile?.managerName ?? 'Toàn máy chủ',
        actionLabel,
        detail,
      });
      setAuditLogs(updatedLogs);
      setStatusBanner({
        tone: 'success',
        text: `${actionLabel}: ${detail}`,
      });
    },
    [currentAdminProfile.managerName, selectedKey, targetProfile?.managerName]
  );

  const commitTargetMutation = useCallback(
    async (
      nextTarget: ManagerProfile,
      actionLabel: string,
      detail: string
    ) => {
      try {
        const saved = await persistManagedAccountMutation(selectedKey, nextTarget);
        setTargetProfile(saved);
        if (doesSummaryMatchProfile(selectedKey, currentAdminProfile)) {
          onSyncActiveProfile(saved);
        }
        setDirectoryTick((t) => t + 1);
        onRefreshAccountsCount();
        gameSound.playUpgradeOutcome(true);
        recordLogAndNotify(actionLabel, detail, saved.managerName);
      } catch (err: unknown) {
        gameSound.playUpgradeOutcome(false);
        setStatusBanner({
          tone: 'error',
          text: err instanceof Error ? err.message : 'Lỗi lưu thay đổi tài khoản mục tiêu.',
        });
      }
    },
    [
      selectedKey,
      currentAdminProfile,
      onSyncActiveProfile,
      onRefreshAccountsCount,
      recordLogAndNotify,
    ]
  );

  const handleCreatePlayerAccount = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = adminCreateNewPlayerAccount({
        managerName: newManagerName.trim() || `HLV ${newUsername.trim()}`,
        usernameOrEmail: newUsername,
        password: newPassword,
        initialSvipLevel: newInitSvip,
        initialFc: newInitFc,
        initialBp: Math.max(0, newInitBpBillions) * ONE_BILLION_BP,
      });
      setNewManagerName('');
      setNewUsername('');
      setShowCreateForm(false);
      setDirectoryTick((t) => t + 1);
      onRefreshAccountsCount();
      setSelectedKey(created.summaryKey);
      setTargetProfile(created.profile);
      gameSound.playUpgradeOutcome(true);
      recordLogAndNotify(
        'Tạo tài khoản HLV mới',
        `Đã tạo "${created.profile.managerName}" (${created.profile.usernameOrEmail}) · SVIP ${created.profile.vipLevel} · ${created.profile.fc.toLocaleString('vi-VN')} FC`,
        created.profile.managerName,
        created.summaryKey
      );
    } catch (err: unknown) {
      gameSound.playUpgradeOutcome(false);
      setStatusBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Không thể tạo tài khoản người chơi mới.',
      });
    }
  };

  const handleLinkGoogleCloudAdmin = async () => {
    try {
      const res = await linkGoogleCloudAdminSession();
      setCloudAdminConnected(res.hasCloudWriteAccess);
      setDirectoryTick((t) => t + 1);
      if (res.hasCloudWriteAccess) {
        gameSound.playUpgradeOutcome(true);
        recordLogAndNotify(
          'Kết nối Cloud Admin Liên Web',
          `Đã xác thực Google Admin (${res.email}) — mở khóa chỉnh sửa tài khoản Khác Thiết Bị & Khác Web toàn cầu!`,
          res.email,
          'CLOUD_ADMIN'
        );
      } else {
        setStatusBanner({
          tone: 'error',
          text: `Email Google "${res.email}" chưa có quyền Cloud Admin gốc (daipss9789@gmail.com) hoặc Phó GM Cloud.`,
        });
      }
    } catch (err: unknown) {
      setStatusBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Không thể kết nối phiên Google Admin.',
      });
    }
  };

  const handleMirrorAllAccountsToCloud = async () => {
    try {
      const mirrored = await mirrorKnownAccountsToCloudForAdmin(accounts);
      setDirectoryTick((t) => t + 1);
      gameSound.playUpgradeOutcome(true);
      recordLogAndNotify(
        'Đồng bộ danh sách TK lên Cloud Liên Web',
        `Đã đẩy ${mirrored} tài khoản lên Cloud Firestore để quản lý xuyên suốt mọi thiết bị & mọi đường dẫn Web`,
        `Cloud Liên Web (${mirrored} TK)`,
        'CLOUD_SYNC'
      );
    } catch (err: unknown) {
      setStatusBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Lỗi đồng bộ danh sách tài khoản lên Cloud.',
      });
    }
  };

  const handleOpenCrossWebTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await openOrCreateCrossWebTargetAccountByAdmin(crossWebTargetInput);
      setCrossWebTargetInput('');
      setSelectedKey(res.summaryKey);
      setTargetProfile(res.profile);
      setRenameInput(res.profile.managerName);
      setDirectoryTick((t) => t + 1);
      onRefreshAccountsCount();
      gameSound.playUpgradeOutcome(true);
      recordLogAndNotify(
        res.createdNewTarget ? 'Khởi tạo & Mở TK Liên Web' : 'Mở TK Khác Thiết Bị / Khác Web',
        `Đang kiểm soát trực tiếp "${res.profile.managerName}" (${res.summaryKey})`,
        res.profile.managerName,
        res.summaryKey
      );
    } catch (err: unknown) {
      gameSound.playUpgradeOutcome(false);
      setStatusBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Không thể mở tài khoản liên web.',
      });
    }
  };

  // Filtered player catalog for Card Granting
  const filteredCatalog = useMemo(() => {
    const q = tplSearch.trim().toLowerCase();
    return PLAYER_TEMPLATES.filter((t) => {
      if (tplSeason !== 'ALL' && t.season !== tplSeason) return false;
      if (!q) return true;
      return `${t.name} ${t.shortName} ${t.seasonLabel} ${t.clubName} ${t.position}`
        .toLowerCase()
        .includes(q);
    }).slice(0, 48);
  }, [tplSearch, tplSeason]);

  const activeGrantTemplate = useMemo(
    () =>
      PLAYER_TEMPLATE_MAP[selectedTplId] ??
      filteredCatalog[0] ??
      PLAYER_TEMPLATES[0],
    [selectedTplId, filteredCatalog]
  );

  const previewGrantCard = useMemo<OwnedCard>(() => {
    const parsedSerial = Number(grantCustomSerial);
    return {
      uid: `gm_preview_${activeGrantTemplate.id}_${grantGrade}`,
      templateId: activeGrantTemplate.id,
      grade: grantGrade,
      ovr: computeCardOvr(activeGrantTemplate.baseOvr, grantGrade),
      valueBp: activeGrantTemplate.baseValueBp,
      acquiredAt: 0,
      ...(isSerializedSeason(activeGrantTemplate.season)
        ? {
            serialNumber:
              Number.isFinite(parsedSerial) && parsedSerial >= 1
                ? Math.floor(parsedSerial)
                : 1,
          }
        : {}),
    };
  }, [activeGrantTemplate, grantGrade, grantCustomSerial]);

  const filteredTargetOwnedCards = useMemo(() => {
    if (!targetProfile) return [];
    const q = ownedSearch.trim().toLowerCase();
    return [...targetProfile.cards]
      .filter((c) => {
        if (!q) return true;
        const tpl = PLAYER_TEMPLATE_MAP[c.templateId];
        if (!tpl) return false;
        return `${tpl.name} ${tpl.shortName} ${tpl.seasonLabel} +${c.grade}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp);
  }, [targetProfile, ownedSearch]);

  const targetVip = useMemo(
    () => (targetProfile ? calculateVipStatus(targetProfile.vipPoints) : null),
    [targetProfile]
  );
  const targetSquadSummary = useMemo(
    () => (targetProfile ? calculateSquadSummary(targetProfile.cards) : null),
    [targetProfile]
  );

  const handleGrantSelectedCard = async () => {
    if (!targetProfile) return;
    const copies = Math.max(1, Math.min(10, Math.floor(grantCopies)));
    const parsedSerial = Number(grantCustomSerial);
    let working = targetProfile;
    let lastCard: OwnedCard | undefined;

    for (let i = 0; i < copies; i++) {
      const serialForCopy =
        isSerializedSeason(activeGrantTemplate.season) &&
        Number.isFinite(parsedSerial) &&
        parsedSerial >= 1
          ? Math.floor(parsedSerial) + i
          : undefined;

      const res = adminGrantPlayerCardToAccount(working, {
        templateId: activeGrantTemplate.id,
        grade: grantGrade,
        customSerial: serialForCopy,
      });
      if (!res.ok) {
        setStatusBanner({ tone: 'error', text: res.error ?? 'Không thể trao thẻ.' });
        return;
      }
      working = res.nextProfile;
      lastCard = res.grantedCard;
    }

    const serialLabel =
      lastCard?.serialNumber !== undefined
        ? ` (NO.${String(lastCard.serialNumber).padStart(3, '0')})`
        : '';
    await commitTargetMutation(
      working,
      'Trao thẻ cầu thủ GM',
      `Đã trao ${copies}x ${activeGrantTemplate.name} (${activeGrantTemplate.seasonLabel} +${grantGrade})${serialLabel} vào CLB "${targetProfile.managerName}"`
    );
  };

  const handleMassBoostAllTargetCards = async (gradeToSet: number) => {
    if (!targetProfile) return;
    let working = targetProfile;
    for (const c of targetProfile.cards) {
      if (c.grade < gradeToSet) {
        working = adminSetOwnedCardGradeInAccount(working, c.uid, gradeToSet).nextProfile;
      }
    }
    await commitTargetMutation(
      working,
      'Nâng cấp đồng loạt kho thẻ',
      `Đã nâng toàn bộ ${working.cards.length} cầu thủ của "${targetProfile.managerName}" lên tối thiểu +${gradeToSet}`
    );
  };

  const handleBroadcastToAllAccounts = async () => {
    const fcDelta = Math.max(0, Math.floor(Number(bcastFc) || 0));
    const bpDelta = Math.max(0, Math.floor(Number(bcastBpBillions) || 0)) * ONE_BILLION_BP;
    const tarpoiDelta = Math.max(0, Math.floor(Number(bcastTarpoi) || 0));
    const svipBonusPoints = Math.max(0, Math.floor(Number(bcastVipPts) || 0));
    const packCount = Math.max(0, Math.floor(Number(bcastPackCount) || 0));

    if (
      fcDelta === 0 &&
      bpDelta === 0 &&
      tarpoiDelta === 0 &&
      svipBonusPoints === 0 &&
      packCount === 0
    ) {
      setStatusBanner({
        tone: 'error',
        text: 'Vui lòng nhập ít nhất 1 phần quà (> 0) trước khi phát toàn máy chủ.',
      });
      return;
    }

    const { rewardedCount } = await publishGlobalBroadcastGiftEverywhere({
      actorName: currentAdminProfile.managerName,
      fcDelta,
      bpDelta,
      tarpoiDelta,
      svipBonusPoints,
      packId: bcastPackId,
      packCount,
    });

    // Reload both active admin profile and selected target profile
    loadSelectedTarget(selectedKey);
    loadManagedAccountFullProfile(
      getCanonicalSummaryKeyForProfile(currentAdminProfile)
    ).then((freshSelf) => {
      if (freshSelf) onSyncActiveProfile(freshSelf);
    });

    setDirectoryTick((t) => t + 1);
    onRefreshAccountsCount();
    gameSound.playUpgradeOutcome(true);
    recordLogAndNotify(
      'Phát quà Toàn Máy Chủ & Mọi Thiết Bị',
      `Đã đồng bộ quà tới ${rewardedCount} tài khoản trên mọi thiết bị (+${fcDelta.toLocaleString('vi-VN')} FC · +${formatBpCompact(bpDelta)} · +${tarpoiDelta.toLocaleString('vi-VN')} Tarpoi · +${packCount} gói ${PACK_CATALOG[bcastPackId].name})`,
      `Toàn máy chủ (${rewardedCount} TK)`,
      'ALL_SERVER'
    );
  };

  const handleTriggerOfficialReleaseReset = async () => {
    const confirmed = window.confirm(
      '🔴 BẠN CÓ CHẮC CHẮN MUỐN PHÁT HÀNH BẢN CHÍNH THỨC VÀ RESET MỌI ACC VỀ BAN ĐẦU?\n\n' +
        '1. Toàn bộ tài khoản thử nghiệm trên máy chủ sẽ được reset về trạng thái sơ cấp ban đầu (30 cầu thủ chuẩn, tiền tệ mặc định, cấp 1).\n' +
        '2. Bảng xếp hạng và phiên thử nghiệm sẽ được làm mới hoàn toàn cho mùa giải chính thức.\n' +
        '3. Toàn bộ các thẻ cầu thủ mở ra hoặc sở hữu trên tài khoản Quản trị viên (Admin) sẽ KHÔNG tính số thứ tự trên thẻ để nhường số thứ tự #0001+ độc quyền cho người chơi.'
    );
    if (!confirmed) return;

    try {
      gameSound.playUpgradeOutcome(true);
      const res = await performOfficialReleaseServerWipe(
        currentAdminProfile.managerName || 'Quản Trị Viên'
      );
      setStatusBanner({ tone: 'success', text: res.message });
      onUpdateServerRules({
        ...serverRules,
        serverAnnouncement:
          'CHÍNH THỨC RA MẮT BẢN FULL: Đã reset toàn bộ tài khoản về ban đầu! Bắt đầu mùa giải mới công bằng cho mọi HLV.',
      });
      onRefreshAccountsCount();
      onSyncActiveProfile(res.freshProfile);
      setTargetProfile(res.freshProfile);
      setDirectoryTick((t) => t + 1);
    } catch (err) {
      setStatusBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi reset bản chính thức.',
      });
    }
  };

  return (
    <div className="space-y-4 pb-10" data-testid="gm-admin-view">
      {/* Integrated Admin Game Account Command Header */}
      <div className="rounded-xl fco-pc-panel-glow border-[#a3e635]/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="space-y-1">
          <div className="text-xs font-bold tracking-wider text-[#a3e635]">
            EA SPORTS FC™ ONLINE PC · KIỂM SOÁT TRÒ CHƠI TRONG TÀI KHOẢN QUẢN TRỊ VIÊN
          </div>
          <h2
            className="text-2xl sm:text-3xl font-extrabold italic tracking-wide text-white"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            ĐIỀU CHỈNH SỰ KIỆN, QUÀ TẶNG &amp; TÀI KHOẢN LIÊN THIẾT BỊ
          </h2>
          <div className="text-xs text-slate-400 tabular-nums">
            Tài khoản Quản Trị đang đăng nhập:{' '}
            <strong className="text-[#a3e635]">{currentAdminProfile.managerName}</strong> · Mọi điều
            chỉnh Luật Máy Chủ &amp; Quà Toàn Server được đồng bộ trực tiếp để tất cả người chơi trên
            mọi thiết bị sử dụng ngay · Tổng TK liên thiết bị:{' '}
            <strong className="text-white">{accounts.length}</strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onReturnToPlay && (
            <button
              type="button"
              data-testid="gm-return-to-play-btn"
              onClick={() => {
                gameSound.playClick(1.05);
                onReturnToPlay();
              }}
              className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
            >
              Thi Đấu Bằng TK Quản Trị
            </button>
          )}

          <button
            type="button"
            data-testid="gm-toggle-create-account-btn"
            onClick={() => {
              gameSound.playClick();
              setShowCreateForm((prev) => !prev);
            }}
            className="px-4 py-2 rounded-lg bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
          >
            {showCreateForm ? 'Đóng Khung Tạo TK' : '+ Tạo Tài Khoản Người Chơi Mới'}
          </button>

          <button
            type="button"
            onClick={() => {
              gameSound.playClick();
              setDirectoryTick((t) => t + 1);
              loadSelectedTarget(selectedKey);
            }}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold text-slate-200 cursor-pointer whitespace-nowrap"
          >
            Làm Mới Liên Thiết Bị &amp; Web
          </button>
        </div>
      </div>

      {/* Cross-Web & Cross-Device Cloud Admin Command Bar */}
      <div
        data-testid="gm-cross-web-bar"
        className="rounded-xl fco-pc-panel border-sky-400/35 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3.5"
      >
        <div className="space-y-1">
          <div className="text-xs font-bold text-sky-300">
            ĐỒNG BỘ QUẢN TRỊ LIÊN THIẾT BỊ &amp; KHÁC ĐƯỜNG DẪN WEB (CLOUD FIRESTORE GLOBAL)
          </div>
          <div className="text-xs text-slate-300">
            {cloudAdminConnected ? (
              <>
                Trạng thái:{' '}
                <strong className="text-[#a3e635]">
                  ĐÃ KẾT NỐI CLOUD ADMIN TOÀN CẦU ({auth.currentUser?.email || 'Cloud GM'})
                </strong>{' '}
                · Mọi chỉnh sửa SVIP, FC, BP, Thẻ +13, Khóa TK &amp; Quà Máy Chủ tự động áp dụng sang cả điện thoại, PC khác và các đường dẫn Web khác!
              </>
            ) : (
              <>
                Trạng thái:{' '}
                <strong className="text-amber-300">Đang đồng bộ nội bộ Máy Chủ Web hiện tại</strong>{' '}
                · Bấm kết nối Google Admin (<strong className="text-white">daipss9789@gmail.com</strong>) để chỉnh trực tiếp tài khoản đang chơi ở cả các đường dẫn Web khác!
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!cloudAdminConnected ? (
              <button
                type="button"
                data-testid="gm-link-cloud-admin-btn"
                onClick={handleLinkGoogleCloudAdmin}
                className="px-3.5 py-1.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
              >
                Kết Nối Google Admin Liên Web
              </button>
            ) : (
              <button
                type="button"
                data-testid="gm-mirror-cloud-accounts-btn"
                onClick={handleMirrorAllAccountsToCloud}
                className="px-3.5 py-1.5 rounded-lg bg-[#132417] hover:bg-[#1a3320] border border-[#a3e635]/45 text-[#a3e635] font-bold text-xs cursor-pointer whitespace-nowrap"
              >
                Đồng Bộ Tất Cả TK Lên Cloud Liên Web ({accounts.length})
              </button>
            )}
          </div>
        </div>

        <form
          onSubmit={handleOpenCrossWebTarget}
          data-testid="gm-open-cross-web-form"
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={crossWebTargetInput}
            onChange={(e) => setCrossWebTargetInput(e.target.value)}
            placeholder="Nhập username, guest_... hoặc cloud:UID ở Web khác"
            aria-label="Nhập mã tài khoản khác thiết bị hoặc khác web cần chỉnh"
            className="w-full sm:w-72 px-3 py-2 rounded-lg bg-[#050912] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
          />
          <button
            type="submit"
            data-testid="gm-open-cross-web-submit-btn"
            className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            Mở &amp; Chỉnh TK Khác Web
          </button>
        </form>
      </div>

      {/* Status Notification */}
      {statusBanner && (
        <div
          role="status"
          data-testid="gm-status-banner"
          className={`rounded-lg px-4 py-3 border text-xs font-semibold flex items-center justify-between gap-3 ${
            statusBanner.tone === 'success'
              ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200'
              : 'bg-rose-500/15 border-rose-400/45 text-rose-200'
          }`}
        >
          <span>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="px-2.5 py-1 rounded bg-black/30 hover:bg-black/50 text-[11px] text-white cursor-pointer shrink-0"
          >
            Ẩn
          </button>
        </div>
      )}

      {/* Inline Create New Player Account Drawer */}
      {showCreateForm && (
        <form
          onSubmit={handleCreatePlayerAccount}
          data-testid="gm-create-account-form"
          className="rounded-xl bg-[#09111f] border border-amber-400/45 p-4 sm:p-5 space-y-3.5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-amber-300">
              Tạo Nhanh Tài Khoản Người Chơi Thật Để Quản Lý / Cấp Quà
            </h3>
            <span className="text-xs text-slate-400">
              Tự động lưu trên máy chủ &amp; hiển thị trên Bảng Xếp Hạng
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div>
              <label
                htmlFor="gm-new-hlv"
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Tên HLV Hiển Thị
              </label>
              <input
                id="gm-new-hlv"
                type="text"
                value={newManagerName}
                onChange={(e) => setNewManagerName(e.target.value)}
                placeholder="VD: HLV Tuấn Anh"
                className="w-full px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-white focus:outline-none focus:border-[#a3e635]"
              />
            </div>

            <div>
              <label
                htmlFor="gm-new-user"
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Tên Đăng Nhập (*)
              </label>
              <input
                id="gm-new-user"
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="VD: tuananh2026"
                className="w-full px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-white focus:outline-none focus:border-[#a3e635]"
              />
            </div>

            <div>
              <label
                htmlFor="gm-new-pass"
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Mật Khẩu (&ge; 6 ký tự)
              </label>
              <input
                id="gm-new-pass"
                type="text"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-[#a3e635]"
              />
            </div>

            <div>
              <label
                htmlFor="gm-new-svip"
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Cấp SVIP Khởi Đầu (0–20)
              </label>
              <input
                id="gm-new-svip"
                type="number"
                min={0}
                max={20}
                value={newInitSvip}
                onChange={(e) => setNewInitSvip(Number(e.target.value))}
                className="w-full px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-amber-300 font-mono tabular-nums focus:outline-none focus:border-[#a3e635]"
              />
            </div>

            <div>
              <label
                htmlFor="gm-new-fc"
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Số Dư FC Khởi Đầu
              </label>
              <input
                id="gm-new-fc"
                type="number"
                min={0}
                value={newInitFc}
                onChange={(e) => setNewInitFc(Number(e.target.value))}
                className="w-full px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-[#a3e635] font-mono tabular-nums focus:outline-none focus:border-[#a3e635]"
              />
            </div>

            <div>
              <label
                htmlFor="gm-new-bp"
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Quỹ BP (Đơn vị: Tỷ BP)
              </label>
              <input
                id="gm-new-bp"
                type="number"
                min={0}
                value={newInitBpBillions}
                onChange={(e) => setNewInitBpBillions(Number(e.target.value))}
                className="w-full px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-emerald-300 font-mono tabular-nums focus:outline-none focus:border-[#a3e635]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              data-testid="gm-submit-create-account-btn"
              className="px-5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
            >
              Khởi Tạo Tài Khoản &amp; Chọn Chỉnh Sửa Ngay
            </button>
          </div>
        </form>
      )}

      {/* Main 12-Column Split: Left Account Directory (4 cols) + Right Control Workspace (8 cols) */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
        {/* LEFT SIDEBAR: MULTI-ACCOUNT DIRECTORY */}
        <aside
          aria-label="Danh sách tài khoản người chơi trên máy chủ"
          className="sm:col-span-4 rounded-xl fco-pc-panel p-3.5 sm:p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white">
               Chọn Tài Khoản Cần Chỉnh ({filteredAccounts.length})
            </h3>
            <span className="text-[11px] text-slate-400 tabular-nums">
              Hỗ trợ TK Khác &amp; TK Đang Dùng
            </span>
          </div>

          <input
            type="search"
            value={accountSearch}
            onChange={(e) => setAccountSearch(e.target.value)}
            placeholder="Tìm theo tên HLV hoặc tên đăng nhập..."
            aria-label="Tìm kiếm tài khoản người chơi"
            className="w-full px-3 py-2 rounded-lg bg-[#050912] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#a3e635]"
          />

          <div className="space-y-2 max-h-[340px] sm:max-h-[560px] overflow-y-auto pr-1">
            {filteredAccounts.map((acc) => {
              const isSelected = acc.summaryKey === selectedKey;
              const isSelf = doesSummaryMatchProfile(acc.summaryKey, currentAdminProfile);

              return (
                <button
                  key={acc.summaryKey}
                  type="button"
                  data-testid={`gm-account-row-${acc.accountKey}`}
                  onClick={() => {
                    gameSound.playClick();
                    setSelectedKey(acc.summaryKey);
                  }}
                  className={`w-full text-left rounded-lg p-3 border transition-colors cursor-pointer space-y-1.5 ${
                    isSelected
                      ? 'bg-[#122116] border-[#a3e635]'
                      : 'bg-[#060a13] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-white truncate">{acc.managerName}</strong>
                    <span className="font-mono text-xs font-extrabold text-amber-300 tabular-nums shrink-0">
                      SVIP {acc.vipLevel}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                    <span className="truncate font-mono">{acc.usernameOrEmail}</span>
                    {acc.deviceLabel && (
                      <span className="text-slate-300">· {acc.deviceLabel}</span>
                    )}
                    {acc.isMasterAdmin && (
                      <span className="text-[#a3e635] font-bold">· TK Quản Trị</span>
                    )}
                    {!acc.isMasterAdmin && acc.isDelegatedAdmin && (
                      <span className="text-sky-300 font-bold">· Phó Quản Trị</span>
                    )}
                    {acc.isBanned && (
                      <span className="text-rose-400 font-bold">· Đang Khóa</span>
                    )}
                    {isSelf && (
                      <span className="text-emerald-300 font-semibold">· Đang đăng nhập</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/8 text-[11px] font-mono tabular-nums">
                    <span className="text-amber-300">
                      {acc.fc.toLocaleString('vi-VN')} FC
                    </span>
                    <span className="text-emerald-300">{formatBpCompact(acc.bp)}</span>
                    <span className="text-slate-300">
                      {typeof acc.elo === 'number' ? `${acc.elo} ĐXH · ` : ''}
                      {acc.cardCount} thẻ (Max {acc.bestCardOvr})
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* RIGHT WORKSPACE: TARGET INSPECTOR & 4 GM FUNCTION SUITES */}
        <section className="sm:col-span-8 space-y-4">
          {/* Selected Target Account Live Telemetry Card */}
          {loadingTarget || !targetProfile || !targetVip || !targetSquadSummary ? (
            <div className="rounded-xl bg-[#0a101d] border border-white/12 p-8 text-center text-sm text-slate-300">
              Đang đồng bộ hồ sơ tài khoản mục tiêu...
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-[#a3e635] tracking-wider">
                      ĐANG KIỂM SOÁT TÀI KHOẢN MỤC TIÊU
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <h3
                        className="text-2xl font-extrabold italic text-white truncate"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        {targetProfile.managerName}
                      </h3>
                      <span className="text-xs font-mono text-slate-400">
                        ({selectedSummary?.usernameOrEmail ?? targetProfile.id})
                      </span>
                      {selectedSummary?.isBanned && (
                        <span className="text-xs font-bold text-rose-400">
                          · ĐANG BỊ KHÓA ({selectedSummary.banReason || 'Vi phạm'})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!doesSummaryMatchProfile(selectedKey, currentAdminProfile) && (
                      <button
                        type="button"
                        data-testid="gm-enter-target-club-btn"
                        onClick={() => {
                          gameSound.playUpgradeOutcome(true);
                          onSwitchIntoAccount(selectedKey);
                        }}
                        className="px-4 py-2 rounded fco-pc-btn-gold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Vào Kiểm Tra CLB Này
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid="gm-god-preset-btn"
                      onClick={() =>
                        commitTargetMutation(
                          adminApplyMaxGodPreset(targetProfile),
                          'Kích hoạt Full God Mode',
                          `Đã nâng "${targetProfile.managerName}" lên SVIP 20 · 99.999.999 FC · 2.000 Nghìn Tỷ BP · +275 Gói Thẻ`
                        )
                      }
                      className="px-4 py-2 rounded fco-pc-btn-primary text-xs cursor-pointer whitespace-nowrap"
                    >
                      1 Chạm Full SVIP 20 + Max FC/BP
                    </button>
                  </div>
                </div>

                {/* Live 5-Metric Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 tabular-nums">
                  <div className="rounded-lg bg-[#060a13] border border-white/10 p-2.5">
                    <div className="text-[11px] text-slate-400">Cấp Hội Viên</div>
                    <div
                      data-testid="gm-target-svip-value"
                      className="text-lg font-black text-amber-300 font-mono"
                    >
                      SVIP {targetVip.level}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {targetVip.totalPoints.toLocaleString('vi-VN')} Điểm VIP
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#060a13] border border-white/10 p-2.5">
                    <div className="text-[11px] text-slate-400">Số Dư FC</div>
                    <div
                      data-testid="gm-target-fc-value"
                      className="text-lg font-black text-[#a3e635] font-mono truncate"
                    >
                      {targetProfile.fc.toLocaleString('vi-VN')} FC
                    </div>
                    <div className="text-[10px] text-slate-500">Chỉnh tự do</div>
                  </div>

                  <div className="rounded-lg bg-[#060a13] border border-white/10 p-2.5">
                    <div className="text-[11px] text-slate-400">Quỹ BP Khả Dụng</div>
                    <div
                      data-testid="gm-target-bp-value"
                      className="text-base font-black text-emerald-300 font-mono truncate"
                    >
                      {formatBpCompact(targetProfile.bp)}
                    </div>
                    <div className="text-[10px] text-slate-500">Mua &amp; Đập thẻ</div>
                  </div>

                  <div className="rounded-lg bg-[#060a13] border border-white/10 p-2.5">
                    <div className="text-[11px] text-slate-400">Điểm Sao Tarpoi</div>
                    <div className="text-lg font-black text-sky-300 font-mono">
                      {(targetProfile.starPoints ?? 0).toLocaleString('vi-VN')}
                    </div>
                    <div className="text-[10px] text-slate-500">Shop Tarpoi</div>
                  </div>

                  <div className="rounded-lg bg-[#060a13] border border-white/10 p-2.5 col-span-2 sm:col-span-1">
                    <div className="text-[11px] text-slate-400">Giá Trị Đội Hình</div>
                    <div className="text-base font-black text-white font-mono truncate">
                      {formatBpCompact(targetSquadSummary.squadValue)}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {targetProfile.cards.length} thẻ · Max {targetSquadSummary.bestCardOvr}
                    </div>
                  </div>
                </div>
              </div>

              {/* 4-Tab Workspace Navigation */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 rounded-xl fco-pc-panel">
                {(
                  [
                    { id: 'account_core', label: '1. Chỉnh SVIP · FC · BP · TK' },
                    { id: 'cards_squad', label: '2. Trao Thẻ +13 & Kho Thẻ' },
                    { id: 'packs_broadcast', label: '3. Gói Thẻ & Quà Máy Chủ' },
                    { id: 'server_rules', label: '4. Luật Máy Chủ & Nhật Ký' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`gm-tab-${tab.id}`}
                    onClick={() => {
                      gameSound.playClick();
                      setWorkspaceTab(tab.id);
                    }}
                    className={`fco-pc-tab-skew py-2.5 px-2.5 rounded-sm text-xs font-black transition-all cursor-pointer whitespace-nowrap truncate uppercase tracking-wider ${
                      workspaceTab === tab.id
                        ? 'fco-pc-btn-primary'
                        : 'fco-pc-btn-slate'
                    }`}
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* =============================================================== */}
              {/* TAB 1: CHỈNH SVIP, FC, BP, TARPOI & QUẢN TRỊ BẢO MẬT TÀI KHOẢN  */}
              {/* =============================================================== */}
              {workspaceTab === 'account_core' && (
                <div className="space-y-4">
                  {/* 1A. CHỈNH SVIP TÀI KHOẢN MỤC TIÊU (SVIP 0 -> SVIP 20) */}
                  <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-extrabold text-amber-300">
                        Chỉnh Cấp SVIP Cho Tài Khoản &ldquo;{targetProfile.managerName}&rdquo; (SVIP 0 – SVIP 20)
                      </h4>
                      <span className="text-xs font-mono text-slate-400 tabular-nums">
                        Hiện tại: SVIP {targetVip.level} ({targetVip.totalPoints.toLocaleString('vi-VN')} điểm)
                      </span>
                    </div>

                    <div className="grid grid-cols-7 sm:grid-cols-11 gap-1.5">
                      {Array.from({ length: 21 }, (_, lv) => {
                        const active = targetVip.level === lv;
                        return (
                          <button
                            key={`svip_btn_${lv}`}
                            type="button"
                            data-testid={`gm-set-svip-${lv}`}
                            onClick={() =>
                              commitTargetMutation(
                                adminSetAccountSvipLevel(targetProfile, lv),
                                'Chỉnh cấp SVIP',
                                `Đã đặt cấp SVIP ${lv} cho tài khoản "${targetProfile.managerName}"`
                              )
                            }
                            className={`py-1.5 rounded text-xs font-extrabold font-mono tabular-nums cursor-pointer transition-colors ${
                              active
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-[#060a13] hover:bg-slate-800 text-slate-200 border border-white/10'
                            }`}
                          >
                            {lv === 0 ? 'SV0' : `SV${lv}`}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label htmlFor="gm-vip-pts" className="text-xs text-slate-400">
                        Điểm VIP tùy chỉnh:
                      </label>
                      <input
                        id="gm-vip-pts"
                        type="number"
                        min={0}
                        value={vipPointsInput}
                        onChange={(e) => setVipPointsInput(e.target.value)}
                        className="w-32 px-3 py-1.5 rounded bg-[#050912] border border-white/15 text-xs font-mono text-amber-300 tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          commitTargetMutation(
                            adminAdjustAccountVipPoints(
                              targetProfile,
                              Number(vipPointsInput),
                              'add'
                            ),
                            'Cộng điểm SVIP',
                            `Đã cộng +${Number(vipPointsInput).toLocaleString('vi-VN')} điểm VIP cho "${targetProfile.managerName}"`
                          )
                        }
                        className="px-3 py-1.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                      >
                        + Cộng Điểm VIP
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          commitTargetMutation(
                            adminAdjustAccountVipPoints(
                              targetProfile,
                              Number(vipPointsInput),
                              'set'
                            ),
                            'Đặt điểm SVIP',
                            `Đã đặt chính xác ${Number(vipPointsInput).toLocaleString('vi-VN')} điểm VIP cho "${targetProfile.managerName}"`
                          )
                        }
                        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Đặt Chính Xác
                      </button>
                    </div>
                  </div>

                  {/* 1B. CHỈNH FC TÀI KHOẢN MỤC TIÊU */}
                  <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-extrabold text-[#a3e635]">
                        Chỉnh Số Dư FC Cho Tài Khoản &ldquo;{targetProfile.managerName}&rdquo;
                      </h4>
                      <span className="text-xs font-mono text-slate-300 tabular-nums">
                        Số dư hiện tại: {targetProfile.fc.toLocaleString('vi-VN')} FC
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '+10.000 FC', delta: 10_000, mode: 'add' as const },
                        { label: '+100.000 FC', delta: 100_000, mode: 'add' as const },
                        { label: '+250.000 FC', delta: 250_000, mode: 'add' as const },
                        { label: '+1.000.000 FC', delta: 1_000_000, mode: 'add' as const },
                        { label: '+50.000.000 FC', delta: 50_000_000, mode: 'add' as const },
                        { label: 'Reset 0 FC', delta: 0, mode: 'set' as const },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          data-testid={`gm-fc-preset-${preset.delta}`}
                          onClick={() =>
                            commitTargetMutation(
                              adminModifyAccountFc(targetProfile, preset.delta, preset.mode),
                              'Chỉnh số dư FC',
                              `${preset.label} cho tài khoản "${targetProfile.managerName}"`
                            )
                          }
                          className="px-3 py-1.5 rounded bg-[#101c14] hover:bg-[#172b1d] border border-[#a3e635]/40 text-xs font-bold text-[#a3e635] font-mono tabular-nums cursor-pointer whitespace-nowrap"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label htmlFor="gm-fc-custom" className="text-xs text-slate-400">
                        Nhập số FC:
                      </label>
                      <input
                        id="gm-fc-custom"
                        data-testid="gm-fc-custom-input"
                        type="number"
                        min={0}
                        value={fcInput}
                        onChange={(e) => setFcInput(e.target.value)}
                        className="w-36 px-3 py-1.5 rounded bg-[#050912] border border-white/15 text-xs font-mono text-[#a3e635] tabular-nums"
                      />
                      <button
                        type="button"
                        data-testid="gm-fc-set-btn"
                        onClick={() =>
                          commitTargetMutation(
                            adminModifyAccountFc(targetProfile, Number(fcInput), 'set'),
                            'Đặt số dư FC',
                            `Đã đặt chính xác ${Number(fcInput).toLocaleString('vi-VN')} FC cho "${targetProfile.managerName}"`
                          )
                        }
                        className="px-3 py-1.5 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Đặt Chính Xác FC
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          commitTargetMutation(
                            adminModifyAccountFc(targetProfile, Number(fcInput), 'add'),
                            'Cộng thêm FC',
                            `Đã cộng +${Number(fcInput).toLocaleString('vi-VN')} FC cho "${targetProfile.managerName}"`
                          )
                        }
                        className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                      >
                        + Cộng FC
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          commitTargetMutation(
                            adminModifyAccountFc(targetProfile, Number(fcInput), 'subtract'),
                            'Trừ bớt FC',
                            `Đã trừ -${Number(fcInput).toLocaleString('vi-VN')} FC của "${targetProfile.managerName}"`
                          )
                        }
                        className="px-3 py-1.5 rounded bg-rose-900/70 hover:bg-rose-800 text-rose-200 font-bold text-xs cursor-pointer whitespace-nowrap"
                      >
                        - Trừ FC
                      </button>
                    </div>
                  </div>

                  {/* 1C. CHỈNH QUỸ BP & ĐIỂM SAO TARPOI */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3">
                      <h4 className="text-sm font-extrabold text-emerald-300">
                        Chỉnh Quỹ BP (Đơn vị nhập: Tỷ BP)
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: '+1.000 Tỷ BP', bil: 1_000 },
                          { label: '+50.000 Tỷ BP', bil: 50_000 },
                          { label: '+500.000 Tỷ BP', bil: 500_000 },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() =>
                              commitTargetMutation(
                                adminModifyAccountBp(
                                  targetProfile,
                                  p.bil * ONE_BILLION_BP,
                                  'add'
                                ),
                                'Cộng quỹ BP',
                                `Đã cộng ${p.label} cho "${targetProfile.managerName}"`
                              )
                            }
                            className="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-xs font-bold text-emerald-300 font-mono cursor-pointer whitespace-nowrap"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={bpBillionsInput}
                          onChange={(e) => setBpBillionsInput(e.target.value)}
                          aria-label="Số Tỷ BP cần chỉnh"
                          className="w-28 px-2.5 py-1.5 rounded bg-[#050912] border border-white/15 text-xs font-mono text-emerald-300 tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            commitTargetMutation(
                              adminModifyAccountBp(
                                targetProfile,
                                Number(bpBillionsInput) * ONE_BILLION_BP,
                                'set'
                              ),
                              'Đặt quỹ BP',
                              `Đã đặt quỹ ${Number(bpBillionsInput).toLocaleString('vi-VN')} Tỷ BP cho "${targetProfile.managerName}"`
                            )
                          }
                          className="px-2.5 py-1.5 rounded bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Đặt Tỷ BP
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            commitTargetMutation(
                              adminModifyAccountBp(
                                targetProfile,
                                Number(bpBillionsInput) * ONE_BILLION_BP,
                                'add'
                              ),
                              'Cộng quỹ BP',
                              `Đã cộng +${Number(bpBillionsInput).toLocaleString('vi-VN')} Tỷ BP cho "${targetProfile.managerName}"`
                            )
                          }
                          className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs cursor-pointer whitespace-nowrap"
                        >
                          + Cộng
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            commitTargetMutation(
                              adminModifyAccountBp(
                                targetProfile,
                                Number(bpBillionsInput) * ONE_BILLION_BP,
                                'subtract'
                              ),
                              'Trừ quỹ BP',
                              `Đã trừ -${Number(bpBillionsInput).toLocaleString('vi-VN')} Tỷ BP của "${targetProfile.managerName}"`
                            )
                          }
                          className="px-2.5 py-1.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-200 font-bold text-xs cursor-pointer whitespace-nowrap"
                        >
                          - Trừ
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3">
                      <h4 className="text-sm font-extrabold text-sky-300">
                        Chỉnh Điểm Sao Tarpoi
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {[1_000, 10_000, 100_000, 1_000_000].map((sp) => (
                          <button
                            key={`sp_${sp}`}
                            type="button"
                            onClick={() =>
                              commitTargetMutation(
                                adminModifyAccountTarpoi(targetProfile, sp, 'add'),
                                'Cộng Điểm Sao Tarpoi',
                                `Đã cộng +${sp.toLocaleString('vi-VN')} Tarpoi cho "${targetProfile.managerName}"`
                              )
                            }
                            className="px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-xs font-bold text-sky-300 font-mono cursor-pointer whitespace-nowrap"
                          >
                            +{sp.toLocaleString('vi-VN')}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={tarpoiInput}
                          onChange={(e) => setTarpoiInput(e.target.value)}
                          aria-label="Số Điểm Sao Tarpoi cần chỉnh"
                          className="w-28 px-2.5 py-1.5 rounded bg-[#050912] border border-white/15 text-xs font-mono text-sky-300 tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            commitTargetMutation(
                              adminModifyAccountTarpoi(
                                targetProfile,
                                Number(tarpoiInput),
                                'set'
                              ),
                              'Đặt Điểm Sao Tarpoi',
                              `Đã đặt ${Number(tarpoiInput).toLocaleString('vi-VN')} Tarpoi cho "${targetProfile.managerName}"`
                            )
                          }
                          className="px-2.5 py-1.5 rounded bg-sky-400 hover:bg-sky-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Đặt Tarpoi
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            commitTargetMutation(
                              adminModifyAccountTarpoi(
                                targetProfile,
                                Number(tarpoiInput),
                                'subtract'
                              ),
                              'Trừ Tarpoi',
                              `Đã trừ -${Number(tarpoiInput).toLocaleString('vi-VN')} Tarpoi của "${targetProfile.managerName}"`
                            )
                          }
                          className="px-2.5 py-1.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-200 font-bold text-xs cursor-pointer whitespace-nowrap"
                        >
                          - Trừ
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 1C-2. CHỈNH VÒNG BI LẮC & ĐIỂM BI LẮC (MỐC 10.000 ĐIỂM IPRM & LE) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 tabular-nums">
                        <h4 className="text-sm font-extrabold text-[#a3e635]">
                          Chỉnh Vòng Bi Lắc Miễn Phí
                        </h4>
                        <span className="text-xs font-mono text-slate-300">
                          Hiện có: {(targetProfile.foosballLoops ?? 0).toLocaleString('vi-VN')} vòng
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[10, 100, 1000, 10000].map((lp) => (
                          <button
                            key={`lp_${lp}`}
                            type="button"
                            onClick={() =>
                              commitTargetMutation(
                                {
                                  ...targetProfile,
                                  foosballLoops: Math.min(
                                    1_000_000,
                                    (targetProfile.foosballLoops ?? 0) + lp
                                  ),
                                },
                                'Cộng Vòng Bi Lắc',
                                `Đã cộng +${lp.toLocaleString('vi-VN')} Vòng Bi Lắc cho "${targetProfile.managerName}"`
                              )
                            }
                            className="px-2.5 py-1 rounded bg-[#101c14] hover:bg-[#172b1d] border border-[#a3e635]/40 text-xs font-bold text-[#a3e635] font-mono cursor-pointer whitespace-nowrap tabular-nums"
                          >
                            +{lp.toLocaleString('vi-VN')} vòng
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={foosballLoopsInput}
                          onChange={(e) => setFoosballLoopsInput(e.target.value)}
                          aria-label="Số Vòng Bi Lắc cần đặt"
                          className="w-28 px-2.5 py-1.5 rounded bg-[#050912] border border-white/15 text-xs font-mono text-[#a3e635] tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            commitTargetMutation(
                              {
                                ...targetProfile,
                                foosballLoops: Math.max(
                                  0,
                                  Math.min(1_000_000, Math.floor(Number(foosballLoopsInput) || 0))
                                ),
                              },
                              'Đặt Vòng Bi Lắc',
                              `Đã đặt ${Math.max(0, Math.floor(Number(foosballLoopsInput) || 0)).toLocaleString('vi-VN')} Vòng Bi Lắc cho "${targetProfile.managerName}"`
                            )
                          }
                          className="px-2.5 py-1.5 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Đặt Số Vòng
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 tabular-nums">
                        <h4 className="text-sm font-extrabold text-amber-300">
                          Chỉnh Điểm Bi Lắc (Mốc 10.000Đ IPRM &amp; LE)
                        </h4>
                        <span className="text-xs font-mono text-slate-300">
                          Hiện có: {(targetProfile.foosballSpins ?? 0).toLocaleString('vi-VN')} điểm
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            commitTargetMutation(
                              {
                                ...targetProfile,
                                foosballSpins: Math.max(targetProfile.foosballSpins ?? 0, 10_000),
                              },
                              'Mở khóa Mốc 10.000Đ Bi Lắc',
                              `Đã đặt 10.000 Điểm Bi Lắc để mở khóa gói IPRM & LE cho "${targetProfile.managerName}"`
                            )
                          }
                          className="px-2.5 py-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold cursor-pointer whitespace-nowrap"
                        >
                          Đặt Ngay 10.000 Điểm
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            commitTargetMutation(
                              {
                                ...targetProfile,
                                foosballSpins: 0,
                                claimedMilestones: [],
                              },
                              'Làm mới mốc Bi Lắc',
                              `Đã đặt lại tiến độ & mốc nhận quà Bi Lắc về 0 cho "${targetProfile.managerName}"`
                            )
                          }
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          Reset Tiến Độ Mốc
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={foosballSpinsInput}
                          onChange={(e) => setFoosballSpinsInput(e.target.value)}
                          aria-label="Số Điểm Bi Lắc cần đặt"
                          className="w-28 px-2.5 py-1.5 rounded bg-[#050912] border border-white/15 text-xs font-mono text-amber-300 tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            commitTargetMutation(
                              {
                                ...targetProfile,
                                foosballSpins: Math.max(
                                  0,
                                  Math.min(10_000_000, Math.floor(Number(foosballSpinsInput) || 0))
                                ),
                              },
                              'Đặt Điểm Bi Lắc',
                              `Đã đặt ${Math.max(0, Math.floor(Number(foosballSpinsInput) || 0)).toLocaleString('vi-VN')} Điểm Bi Lắc cho "${targetProfile.managerName}"`
                            )
                          }
                          className="px-2.5 py-1.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Đặt Điểm
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 1D. ĐỔI TÊN HLV, ĐẶT LẠI MẬT KHẨU, PHÂN QUYỀN PHÓ GM, KHÓA / XÓA TÀI KHOẢN */}
                  <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3.5">
                    <h4 className="text-sm font-extrabold text-white">
                      Quản Trị Hồ Sơ, Bảo Mật, Phân Quyền GM &amp; Khóa Tài Khoản
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          placeholder="Tên HLV mới..."
                          aria-label="Đổi tên Huấn luyện viên"
                          className="flex-1 px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            commitTargetMutation(
                              adminRenameAccountManager(targetProfile, renameInput),
                              'Đổi tên HLV',
                              `Đã đổi tên HLV thành "${renameInput.trim()}"`
                            )
                          }
                          className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                        >
                          Lưu Tên HLV
                        </button>
                      </div>

                      {selectedKey.startsWith('local:') && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={resetPasswordInput}
                            onChange={(e) => setResetPasswordInput(e.target.value)}
                            placeholder="Mật khẩu mới (>= 6 ký tự)"
                            aria-label="Mật khẩu mới cho tài khoản"
                            className="flex-1 px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs font-mono text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                adminResetLocalAccountPassword(selectedKey, resetPasswordInput);
                                setResetPasswordInput('');
                                gameSound.playUpgradeOutcome(true);
                                recordLogAndNotify(
                                  'Đặt lại mật khẩu',
                                  `Đã cấp mật khẩu mới cho tài khoản "${targetProfile.managerName}"`
                                );
                              } catch (err: unknown) {
                                setStatusBanner({
                                  tone: 'error',
                                  text:
                                    err instanceof Error
                                      ? err.message
                                      : 'Lỗi đặt lại mật khẩu.',
                                });
                              }
                            }}
                            className="px-3 py-2 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold cursor-pointer whitespace-nowrap"
                          >
                            Đổi Mật Khẩu
                          </button>
                        </div>
                      )}
                    </div>

                    {!selectedSummary?.isMasterAdmin && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={banReasonInput}
                            onChange={(e) => setBanReasonInput(e.target.value)}
                            placeholder="Lý do khóa tài khoản..."
                            aria-label="Lý do khóa tài khoản"
                            className="w-52 px-3 py-1.5 rounded bg-[#050912] border border-white/15 text-xs text-slate-200"
                          />

                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const nextBan = !selectedSummary?.isBanned;
                                adminSetAccountBanStatus(selectedKey, nextBan, banReasonInput);
                                setDirectoryTick((t) => t + 1);
                                gameSound.playClick();
                                recordLogAndNotify(
                                  nextBan ? 'Khóa tài khoản' : 'Mở khóa tài khoản',
                                  nextBan
                                    ? `Đã khóa "${targetProfile.managerName}" (${banReasonInput})`
                                    : `Đã mở khóa cho "${targetProfile.managerName}"`
                                );
                              } catch (err: unknown) {
                                setStatusBanner({
                                  tone: 'error',
                                  text: err instanceof Error ? err.message : 'Lỗi khóa TK.',
                                });
                              }
                            }}
                            className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer whitespace-nowrap ${
                              selectedSummary?.isBanned
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-rose-600 hover:bg-rose-500 text-white'
                            }`}
                          >
                            {selectedSummary?.isBanned
                              ? 'Mở Khóa Tài Khoản'
                              : 'Khóa (Ban) Tài Khoản'}
                          </button>

                          {!selectedKey.startsWith('guest:') && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextGrant = !selectedSummary?.isDelegatedAdmin;
                                adminSetDelegatedAdminStatus(selectedKey, nextGrant);
                                setDirectoryTick((t) => t + 1);
                                gameSound.playClick();
                                recordLogAndNotify(
                                  nextGrant ? 'Cấp quyền Phó GM' : 'Thu hồi quyền Phó GM',
                                  `${nextGrant ? 'Đã cấp' : 'Đã thu hồi'} quyền Quản Trị GM cho "${targetProfile.managerName}"`
                                );
                              }}
                              className="px-3 py-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-xs font-bold text-sky-200 cursor-pointer whitespace-nowrap"
                            >
                              {selectedSummary?.isDelegatedAdmin
                                ? 'Thu Hồi Quyền Phó GM'
                                : 'Cấp Quyền Phó GM'}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              commitTargetMutation(
                                adminResetAccountStarter(targetProfile),
                                'Reset CLB về mặc định',
                                `Đã làm mới tài nguyên & đội hình gốc cho "${targetProfile.managerName}"`
                              )
                            }
                            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer whitespace-nowrap"
                          >
                            Reset Về Mặc Định
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const removedName = targetProfile.managerName;
                                await adminDeleteManagedAccount(selectedKey);
                                setDirectoryTick((t) => t + 1);
                                onRefreshAccountsCount();
                                setSelectedKey(`local:${MASTER_ADMIN_USERNAME}`);
                                recordLogAndNotify(
                                  'Xóa vĩnh viễn tài khoản',
                                  `Đã xóa tài khoản "${removedName}" khỏi máy chủ`,
                                  removedName
                                );
                              } catch (err: unknown) {
                                setStatusBanner({
                                  tone: 'error',
                                  text: err instanceof Error ? err.message : 'Không thể xóa TK.',
                                });
                              }
                            }}
                            className="px-3 py-1.5 rounded bg-rose-950 hover:bg-rose-900 border border-rose-500/40 text-xs font-bold text-rose-200 cursor-pointer whitespace-nowrap"
                          >
                            Xóa Tài Khoản
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* =============================================================== */}
              {/* TAB 2: TRAO THẺ CẦU THỦ (+1 ~ +13, #0001+) & CHỈNH KHO THẺ      */}
              {/* =============================================================== */}
              {workspaceTab === 'cards_squad' && (
                <div className="space-y-4">
                  {/* Grant Any Player Card Card */}
                  <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-extrabold text-[#a3e635]">
                        Trao Thẻ Cầu Thủ Bất Kỳ (+1 ~ +{MAX_CARD_GRADE}) Vào CLB &ldquo;{targetProfile.managerName}&rdquo;
                      </h4>
                      <span className="text-xs text-slate-400">
                        Hỗ trợ chọn Số Thứ Tự #0001+ cho mùa LE &amp; Infinity Prime
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                      {/* Left Catalog Picker */}
                      <div className="md:col-span-7 space-y-2.5">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="search"
                            value={tplSearch}
                            onChange={(e) => setTplSearch(e.target.value)}
                            placeholder="Tìm Ronaldo, Messi, Pelé, Quang Hải, Công Vinh..."
                            aria-label="Tìm cầu thủ để trao cho tài khoản"
                            className="flex-1 px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-white"
                          />
                          <select
                            value={tplSeason}
                            onChange={(e) => setTplSeason(e.target.value as 'ALL' | SeasonCode)}
                            aria-label="Lọc theo mùa thẻ"
                            className="px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-white"
                          >
                            <option value="ALL">Tất cả 11 mùa</option>
                            {ALL_SEASONS.map((s) => (
                              <option key={s} value={s}>
                                Mùa {s}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="max-h-64 overflow-y-auto rounded-lg bg-[#050912] border border-white/10 divide-y divide-white/6">
                          {filteredCatalog.map((tpl) => {
                            const active = tpl.id === activeGrantTemplate.id;
                            return (
                              <button
                                key={tpl.id}
                                type="button"
                                onClick={() => {
                                  gameSound.playClick();
                                  setSelectedTplId(tpl.id);
                                }}
                                className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-xs cursor-pointer ${
                                  active
                                    ? 'bg-[#132417] text-[#a3e635]'
                                    : 'hover:bg-white/5 text-slate-200'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <SeasonBadgeSvg season={tpl.season} className="w-7 h-4 shrink-0" />
                                  <strong className="truncate">{tpl.name}</strong>
                                  <span className="text-[11px] text-slate-400 shrink-0">
                                    {tpl.position}
                                  </span>
                                </div>
                                <span className="font-mono font-bold tabular-nums shrink-0">
                                  OVR {computeCardOvr(tpl.baseOvr, grantGrade)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right Card Preview + Grade & Serial Controls */}
                      <div className="md:col-span-5 rounded-lg bg-[#060a13] border border-white/10 p-3.5 flex flex-col items-center gap-3">
                        <PlayerCardView card={previewGrantCard} size="sm" showValue />

                        <div className="w-full space-y-2">
                          <div className="text-[11px] font-semibold text-slate-300">
                            Chọn cấp thẻ cộng (+1 ~ +{MAX_CARD_GRADE}):
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: MAX_CARD_GRADE }, (_, i) => i + 1).map((g) => {
                              const st = getGradeBadgeStyle(g);
                              return (
                                <button
                                  key={`gm_gr_${g}`}
                                  type="button"
                                  data-testid={`gm-grant-grade-${g}`}
                                  onClick={() => setGrantGrade(g)}
                                  className={`py-1 rounded text-[10px] font-extrabold font-mono cursor-pointer ${
                                    grantGrade === g ? 'ring-2 ring-white' : 'opacity-75 hover:opacity-100'
                                  }`}
                                  style={{
                                    background: st.bg,
                                    color: st.text,
                                    border: `1px solid ${st.border}`,
                                  }}
                                >
                                  +{g}
                                </button>
                              );
                            })}
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <label
                                htmlFor="gm-grant-copies"
                                className="block text-[11px] text-slate-400 mb-0.5"
                              >
                                Số lượng trao
                              </label>
                              <select
                                id="gm-grant-copies"
                                value={grantCopies}
                                onChange={(e) => setGrantCopies(Number(e.target.value))}
                                className="w-full px-2 py-1.5 rounded bg-[#0a101d] border border-white/15 text-xs text-white font-mono"
                              >
                                <option value={1}>1 thẻ</option>
                                <option value={3}>3 thẻ</option>
                                <option value={5}>5 thẻ</option>
                              </select>
                            </div>

                            {isSerializedSeason(activeGrantTemplate.season) && (
                              <div>
                                <label
                                  htmlFor="gm-grant-serial"
                                  className="block text-[11px] text-amber-300 mb-0.5"
                                >
                                  Số Thứ Tự (#)
                                </label>
                                <input
                                  id="gm-grant-serial"
                                  type="number"
                                  min={1}
                                  value={grantCustomSerial}
                                  onChange={(e) => setGrantCustomSerial(e.target.value)}
                                  className="w-full px-2 py-1.5 rounded bg-[#0a101d] border border-amber-400/40 text-xs font-mono text-amber-300"
                                />
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            data-testid="gm-grant-card-submit-btn"
                            onClick={handleGrantSelectedCard}
                            className="w-full py-2.5 rounded-lg bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                          >
                            Trao {grantCopies}x {activeGrantTemplate.shortName} (+{grantGrade}) Vào TK Này
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Inspect & Boost Existing Owned Cards of Target Account */}
                  <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-extrabold text-white">
                          Kho Thẻ Đang Sở Hữu Của &ldquo;{targetProfile.managerName}&rdquo; ({targetProfile.cards.length} thẻ)
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Bấm 1 chạm để nâng thẻ bất kỳ lên +8 / +10 / +13 hoặc thu hồi thẻ
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleMassBoostAllTargetCards(10)}
                          className="px-3 py-1.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Nâng Cả Đội Lên +10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMassBoostAllTargetCards(13)}
                          className="px-3 py-1.5 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Nâng Cả Đội Lên +13
                        </button>
                      </div>
                    </div>

                    <input
                      type="search"
                      value={ownedSearch}
                      onChange={(e) => setOwnedSearch(e.target.value)}
                      placeholder="Lọc cầu thủ đang có trong CLB này..."
                      aria-label="Lọc cầu thủ đang sở hữu của tài khoản mục tiêu"
                      className="w-full px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-white"
                    />

                    <div className="max-h-72 overflow-y-auto divide-y divide-white/8 rounded-lg bg-[#060a13] border border-white/10">
                      {filteredTargetOwnedCards.slice(0, 40).map((card) => {
                        const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
                        if (!tpl) return null;
                        const gBadge = getGradeBadgeStyle(card.grade);
                        return (
                          <div
                            key={card.uid}
                            className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <SeasonBadgeSvg season={tpl.season} className="w-7 h-4 shrink-0" />
                              <strong className="text-white truncate">{tpl.name}</strong>
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-extrabold font-mono tabular-nums"
                                style={{
                                  background: gBadge.bg,
                                  color: gBadge.text,
                                  border: `1px solid ${gBadge.border}`,
                                }}
                              >
                                +{card.grade}
                              </span>
                              <span className="font-mono text-slate-400 tabular-nums">
                                OVR {card.ovr}
                              </span>
                              {card.serialNumber !== undefined && (
                                <span className="font-mono font-bold text-amber-300 text-[11px] tabular-nums">
                                  NO.{String(card.serialNumber).padStart(3, '0')}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {[8, 10, 13].map((targetGr) => (
                                <button
                                  key={`${card.uid}_to_${targetGr}`}
                                  type="button"
                                  disabled={card.grade === targetGr}
                                  onClick={() =>
                                    commitTargetMutation(
                                      adminSetOwnedCardGradeInAccount(
                                        targetProfile,
                                        card.uid,
                                        targetGr
                                      ).nextProfile,
                                      'Chỉnh cấp cộng thẻ',
                                      `Đã chỉnh ${tpl.name} lên +${targetGr} trong CLB "${targetProfile.managerName}"`
                                    )
                                  }
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-[11px] font-mono font-bold text-amber-300 cursor-pointer"
                                >
                                  +{targetGr}
                                </button>
                              ))}

                              <button
                                type="button"
                                disabled={targetProfile.cards.length <= 11}
                                onClick={() => {
                                  const res = adminRemoveOwnedCardFromAccount(
                                    targetProfile,
                                    card.uid
                                  );
                                  if (!res.ok) {
                                    setStatusBanner({
                                      tone: 'error',
                                      text: res.error ?? 'Không thể thu hồi thẻ.',
                                    });
                                    return;
                                  }
                                  commitTargetMutation(
                                    res.nextProfile,
                                    'Thu hồi thẻ cầu thủ',
                                    `Đã thu hồi thẻ ${tpl.name} (+${card.grade}) khỏi "${targetProfile.managerName}"`
                                  );
                                }}
                                className="px-2 py-1 rounded bg-rose-950 hover:bg-rose-900 disabled:opacity-40 text-[11px] font-semibold text-rose-200 cursor-pointer"
                              >
                                Xóa
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* =============================================================== */}
              {/* TAB 3: PHÁT GÓI THẺ 11 MÙA & QUÀ ĐỒNG LOẠT TOÀN MÁY CHỦ        */}
              {/* =============================================================== */}
              {workspaceTab === 'packs_broadcast' && (
                <div className="space-y-4">
                  {/* Grant Season Packs to Selected Target */}
                  <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3">
                    <h4 className="text-sm font-extrabold text-[#a3e635]">
                      Phát Gói Thẻ Mùa Giải Cho &ldquo;{targetProfile.managerName}&rdquo;
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {PACK_ORDER.map((pid) => {
                        const pack = PACK_CATALOG[pid];
                        const curQty = targetProfile.packs[pid] ?? 0;
                        return (
                          <div
                            key={pid}
                            className="rounded-lg bg-[#060a13] border border-white/10 p-3 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-white truncate">{pack.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                                Đang có: <strong className="text-amber-300">{curQty}</strong> gói
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {[5, 20, 100].map((qty) => (
                                <button
                                  key={`${pid}_${qty}`}
                                  type="button"
                                  onClick={() =>
                                    commitTargetMutation(
                                      adminGrantPacksToAccount(targetProfile, pid, qty, 'add'),
                                      'Phát gói thẻ GM',
                                      `Đã phát +${qty} ${pack.name} cho "${targetProfile.managerName}"`
                                    )
                                  }
                                  className="px-2 py-1 rounded bg-[#132417] hover:bg-[#1b3521] border border-[#a3e635]/35 text-[11px] font-mono font-bold text-[#a3e635] cursor-pointer"
                                >
                                  +{qty}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mass Server Broadcast Gift */}
                  <div className="rounded-xl bg-[#0a101d] border border-amber-400/40 p-4 space-y-3.5">
                    <div>
                      <h4 className="text-sm font-extrabold text-amber-300">
                        Phát Quà Đồng Loạt Toàn Máy Chủ ({accounts.length} Tài Khoản Cùng Lúc)
                      </h4>
                      <p className="text-xs text-slate-400">
                        Tất cả tài khoản HLV đã đăng ký, tài khoản Khách và tài khoản lưu trên máy chủ đều nhận ngay lập tức
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 text-xs">
                      <div>
                        <label htmlFor="bc-fc" className="block text-[11px] text-slate-300 mb-1">
                          Tặng FC
                        </label>
                        <input
                          id="bc-fc"
                          type="number"
                          min={0}
                          value={bcastFc}
                          onChange={(e) => setBcastFc(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-[#050912] border border-white/15 font-mono text-[#a3e635]"
                        />
                      </div>

                      <div>
                        <label htmlFor="bc-bp" className="block text-[11px] text-slate-300 mb-1">
                          Tặng Tỷ BP
                        </label>
                        <input
                          id="bc-bp"
                          type="number"
                          min={0}
                          value={bcastBpBillions}
                          onChange={(e) => setBcastBpBillions(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-[#050912] border border-white/15 font-mono text-emerald-300"
                        />
                      </div>

                      <div>
                        <label htmlFor="bc-sp" className="block text-[11px] text-slate-300 mb-1">
                          Tặng Tarpoi
                        </label>
                        <input
                          id="bc-sp"
                          type="number"
                          min={0}
                          value={bcastTarpoi}
                          onChange={(e) => setBcastTarpoi(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-[#050912] border border-white/15 font-mono text-sky-300"
                        />
                      </div>

                      <div>
                        <label htmlFor="bc-vip" className="block text-[11px] text-slate-300 mb-1">
                          Điểm SVIP
                        </label>
                        <input
                          id="bc-vip"
                          type="number"
                          min={0}
                          value={bcastVipPts}
                          onChange={(e) => setBcastVipPts(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-[#050912] border border-white/15 font-mono text-amber-300"
                        />
                      </div>

                      <div>
                        <label htmlFor="bc-pack" className="block text-[11px] text-slate-300 mb-1">
                          Loại Gói Thẻ
                        </label>
                        <select
                          id="bc-pack"
                          value={bcastPackId}
                          onChange={(e) => setBcastPackId(e.target.value as PackId)}
                          className="w-full px-2 py-1.5 rounded bg-[#050912] border border-white/15 text-white"
                        >
                          {PACK_ORDER.map((pid) => (
                            <option key={pid} value={pid}>
                              {PACK_CATALOG[pid].seasonBadge}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="bc-pqty" className="block text-[11px] text-slate-300 mb-1">
                          Số Gói
                        </label>
                        <input
                          id="bc-pqty"
                          type="number"
                          min={0}
                          value={bcastPackCount}
                          onChange={(e) => setBcastPackCount(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-[#050912] border border-white/15 font-mono text-white"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid="gm-broadcast-gift-btn"
                      onClick={handleBroadcastToAllAccounts}
                      className="w-full py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                    >
                      Phát Quà Toàn Máy Chủ Ngay Lập Tức
                    </button>
                  </div>
                </div>
              )}

              {/* =============================================================== */}
              {/* TAB 4: LUẬT MÁY CHỦ TOÀN CỤC & NHẬT KÝ LỆNH KIỂM SOÁT GM       */}
              {/* =============================================================== */}
              {workspaceTab === 'server_rules' && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-extrabold text-[#a3e635]">
                        Điều Khiển Luật Máy Chủ Toàn Cục (Áp Dụng Cho Mọi Tài Khoản)
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateServerRules({ ...DEFAULT_GLOBAL_SERVER_RULES });
                          recordLogAndNotify(
                            'Đặt lại Luật Máy Chủ',
                            'Đã đưa tỉ lệ đập thẻ, thuế TTCN và thưởng trận đấu về chuẩn mặc định'
                          );
                        }}
                        className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                      >
                        Về Mặc Định Chuẩn
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* 100% Upgrade Toggle */}
                      <div className="rounded-lg bg-[#060a13] border border-white/10 p-3.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-white">
                            100% Đập Thẻ Thành Công Tuyệt Đối
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Mọi pha đập thẻ từ +1 lên +{MAX_CARD_GRADE} đều đạt 100% thành công
                          </div>
                        </div>
                        <button
                          type="button"
                          data-testid="gm-toggle-100-upgrade"
                          onClick={() => {
                            const nextVal = !serverRules.guaranteedUpgrade100;
                            onUpdateServerRules({
                              ...serverRules,
                              guaranteedUpgrade100: nextVal,
                            });
                            gameSound.playClick(1.1);
                            recordLogAndNotify(
                              'Luật Đập Thẻ Máy Chủ',
                              nextVal
                                ? 'ĐÃ BẬT 100% Tỉ lệ đập thẻ thành công toàn máy chủ'
                                : 'Đã tắt chế độ 100% đập thẻ'
                            );
                          }}
                          className={`px-3.5 py-2 rounded font-extrabold cursor-pointer whitespace-nowrap shrink-0 ${
                            serverRules.guaranteedUpgrade100
                              ? 'bg-[#a3e635] text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {serverRules.guaranteedUpgrade100 ? 'ĐANG BẬT 100%' : 'Đang Tắt'}
                        </button>
                      </div>

                      {/* Zero Market Tax Toggle */}
                      <div className="rounded-lg bg-[#060a13] border border-white/10 p-3.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-white">
                            Miễn 100% Thuế TTCN (0% Thuế Bán Thẻ)
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Người chơi bán cầu thủ trên TTCN nhận đủ 100% BP không trừ thuế
                          </div>
                        </div>
                        <button
                          type="button"
                          data-testid="gm-toggle-zero-tax"
                          onClick={() => {
                            const nextVal = !serverRules.zeroMarketTax;
                            onUpdateServerRules({
                              ...serverRules,
                              zeroMarketTax: nextVal,
                            });
                            gameSound.playClick(1.1);
                            recordLogAndNotify(
                              'Luật Thuế TTCN',
                              nextVal
                                ? 'ĐÃ BẬT Miễn 100% thuế TTCN (0% thuế) toàn máy chủ'
                                : 'Đã khôi phục thuế TTCN tiêu chuẩn'
                            );
                          }}
                          className={`px-3.5 py-2 rounded font-extrabold cursor-pointer whitespace-nowrap shrink-0 ${
                            serverRules.zeroMarketTax
                              ? 'bg-[#a3e635] text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {serverRules.zeroMarketTax ? 'ĐANG MIỄN THUẾ 0%' : 'Đang Tắt'}
                        </button>
                      </div>

                      {/* Upgrade Multiplier */}
                      <div className="rounded-lg bg-[#060a13] border border-white/10 p-3.5 space-y-2">
                        <div className="font-bold text-white">
                          Hệ Số Nhân Tỉ Lệ Đập Thẻ Sự Kiện
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {([1, 1.5, 2, 3] as const).map((mult) => (
                            <button
                              key={`up_m_${mult}`}
                              type="button"
                              onClick={() => {
                                onUpdateServerRules({
                                  ...serverRules,
                                  upgradeRateMultiplier: mult,
                                });
                                recordLogAndNotify(
                                  'Hệ số đập thẻ',
                                  `Đặt hệ số nhân tỉ lệ nâng cấp x${mult}`
                                );
                              }}
                              className={`py-1.5 rounded font-mono font-bold cursor-pointer ${
                                serverRules.upgradeRateMultiplier === mult
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              x{mult}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Match Reward Multiplier */}
                      <div className="rounded-lg bg-[#060a13] border border-white/10 p-3.5 space-y-2">
                        <div className="font-bold text-white">
                          Hệ Số Nhân Thưởng BP Đấu Xếp Hạng &amp; GLXH
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {([1, 2, 3] as const).map((mult) => (
                            <button
                              key={`m_m_${mult}`}
                              type="button"
                              onClick={() => {
                                onUpdateServerRules({
                                  ...serverRules,
                                  matchRewardMultiplier: mult,
                                });
                                recordLogAndNotify(
                                  'Hệ số thưởng trận đấu',
                                  `Đặt thưởng BP trận đấu x${mult}`
                                );
                              }}
                              className={`py-1.5 rounded font-mono font-bold cursor-pointer ${
                                serverRules.matchRewardMultiplier === mult
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              x{mult} BP
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Global Server Announcement */}
                    <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={announcementDraft}
                        onChange={(e) => setAnnouncementDraft(e.target.value)}
                        placeholder="Nhập thông báo GM toàn máy chủ hiển thị trên Sảnh Chính..."
                        aria-label="Thông báo toàn máy chủ"
                        className="flex-1 px-3 py-2 rounded bg-[#050912] border border-white/15 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateServerRules({
                            ...serverRules,
                            serverAnnouncement: announcementDraft,
                          });
                          recordLogAndNotify(
                            'Cập nhật thông báo máy chủ',
                            announcementDraft.trim() || 'Đã tắt thông báo chạy chữ'
                          );
                        }}
                        className="px-4 py-2 rounded bg-[#a3e635] hover:bg-[#bef264] text-slate-950 font-extrabold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Phát Thông Báo Sảnh
                      </button>
                    </div>
                  </div>

                  {/* OFFICIAL RELEASE SERVER RESET / LAUNCH WIPE */}
                  <div className="rounded-xl bg-gradient-to-br from-[#1a0c0c] to-[#0c0505] border border-rose-500/40 p-4 space-y-3 shadow-lg shadow-rose-950/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white uppercase tracking-wider">
                            Official Release
                          </span>
                          <h4 className="text-base font-extrabold text-rose-300">
                            PHÁT HÀNH BẢN CHÍNH THỨC · RESET MỌI ACC VỀ BAN ĐẦU
                          </h4>
                        </div>
                        <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">
                          Reset toàn bộ máy chủ về trạng thái sơ cấp ban đầu: xóa dữ liệu thử nghiệm, đưa mọi HLV về đội hình 30 cầu thủ chuẩn khởi đầu, xóa bảng xếp hạng test và đưa máy chủ vào trạng thái đua Top công bằng. Các cầu thủ mở ra trên tài khoản Quản trị viên sẽ KHÔNG tính số thứ tự trên thẻ để nhường số thứ tự #0001+ độc quyền cho người chơi.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-rose-500/20">
                      <span className="text-[11px] text-slate-400">
                        Áp dụng toàn máy chủ: xóa tài khoản thử nghiệm và khởi tạo mùa giải mới.
                      </span>
                      <button
                        type="button"
                        data-testid="gm-official-release-reset-btn"
                        onClick={handleTriggerOfficialReleaseReset}
                        className="px-4 py-2.5 rounded bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-black text-xs shadow-md cursor-pointer whitespace-nowrap active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <span>🔴 Kích Hoạt Reset Bản Chính Thức</span>
                      </button>
                    </div>
                  </div>

                  {/* GM Audit Log */}
                  <div className="rounded-xl bg-[#0a101d] border border-white/12 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-extrabold text-white">
                        Nhật Ký Lệnh Kiểm Soát GM ({auditLogs.length})
                      </h4>
                      {auditLogs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            clearGmAuditLog();
                            setAuditLogs([]);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
                        >
                          Xóa Nhật Ký
                        </button>
                      )}
                    </div>

                    {auditLogs.length === 0 ? (
                      <div className="text-xs text-slate-500 py-4 text-center">
                        Chưa có lệnh GM nào được ghi nhận trong phiên này.
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto divide-y divide-white/8 text-xs">
                        {auditLogs.map((log) => (
                          <div key={log.id} className="py-2 flex items-start justify-between gap-3">
                            <div>
                              <strong className="text-[#a3e635]">{log.actionLabel}</strong>
                              <span className="text-slate-400"> · {log.targetManagerName}: </span>
                              <span className="text-slate-200">{log.detail}</span>
                            </div>
                            <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString('vi-VN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
