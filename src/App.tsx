import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminControlView } from './components/AdminControlView';
import { AuthModal } from './components/AuthModal';
import { FcOnlineTriangleMark, TitleCrestLockup } from './components/Emblems';
import { FoosballEventView } from './components/FoosballEventView';
import { LeaderboardView } from './components/LeaderboardView';
import { LobbyView } from './components/LobbyView';
import { LockerRoomView } from './components/LockerRoomView';
import { ShopView } from './components/ShopView';
import { SquadView } from './components/SquadView';
import { StadiumCanvas } from './components/StadiumCanvas';
import { TransferMarketView } from './components/TransferMarketView';
import { UpgradeView } from './components/UpgradeView';
import { VaultView } from './components/VaultView';
import { VipTopUpView } from './components/VipTopUpView';
import { ApkInstallModal } from './components/ApkInstallModal';
import { FcoIcon, FcoIconId } from './components/FcoIcons';
import {
  auth,
  checkProfileHasAdminAccess,
  detectDeviceLabel,
  fetchServerHubBootstrap,
  forceSaveManagerAccount,
  getCanonicalOwnerIdForProfile,
  getCanonicalSummaryKeyForProfile,
  getLocalLeaderboardRows,
  getSavedAccountSummaries,
  isGmSessionUnlocked,
  loadManagedAccountFullProfile,
  loadOrCreateCloudProfile,
  loadSavedSessionProfile,
  loginMasterAdminQuick,
  onAuthStateChanged,
  publishGlobalServerRulesEverywhere,
  saveProfileLocally,
  signOutManager,
  subscribeActiveAccountCrossWebSync,
  subscribeCloudBroadcasts,
  subscribeCloudServerRules,
  subscribeGlobalLeaderboard,
  switchToSavedAccount,
  syncProfileToCloud,
  syncProfileWithServerHub,
} from './firebase';
import {
  applyBroadcastGiftsToProfile,
  loadGlobalServerRules,
  saveGlobalServerRules,
} from './game/adminRules';
import {
  GENERATED_ASSETS,
  PLAYER_TEMPLATE_MAP,
  VIP_REWARD_TIERS,
} from './game/catalog';
import {
  EnhancementOutcome,
  MAX_SAFE_BP,
  ShopPurchaseResult,
  activateSvipPlan,
  buildLeaderboardRowFromProfile,
  buyCardFromMarket,
  calculateBpProtectionCost,
  calculateSquadSummary,
  calculateVipStatus,
  canUseBpProtection,
  claimDailySvipSalary,
  claimFoosballMilestoneReward,
  createStarterProfile,
  drawCardFromPack,
  equipCardMiniface,
  exchangeBpForFoosballLoops,
  executeFoosballSpinsWithJackpot,
  formatBpCompact,
  getFoosballSpinCost,
  getUnclaimedReachedMilestones,
  openPacksFromProfile,
  purchaseShopOffer,
  resolveCardEnhancement,
  sellCardOnMarket,
} from './game/rules';
import { gameSound } from './game/sound';
import {
  ActiveTab,
  FoosballSpinReward,
  FormationCode,
  GameShellState,
  GlobalServerRules,
  LeaderboardRow,
  ManagerProfile,
  MarketPurchaseResult,
  MarketSaleResult,
  OwnedCard,
  PackId,
  PackInventory,
  ServerBroadcastGift,
} from './game/types';
import {
  buildFormationLineup,
  evaluateSquadTeamColors,
  prioritizeCardsForTeamColor,
} from './game/tacticsAndTeamColor';

function getInitialShellState(): GameShellState {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      return 'playing';
    }
  }
  return 'title';
}

function getTodayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function loadSvipDailyClaimDate(profileId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(`fco_svip_daily_${profileId}`);
  } catch {
    return null;
  }
}

function saveSvipDailyClaimDate(profileId: string, dateKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`fco_svip_daily_${profileId}`, dateKey);
  } catch {
    // Ignore storage quota issues
  }
}

const TAB_ORDER: ActiveTab[] = [
  'lobby',
  'squad',
  'market',
  'upgrade',
  'vault',
  'foosball',
  'shop',
  'vip',
  'leaderboard',
  'locker',
  'admin',
];

export default function App() {
  const [shellState, setShellState] = useState<GameShellState>(getInitialShellState);
  const [{ tab: activeTab, dir: tabTransitionDir }, setTabState] = useState<{
    tab: ActiveTab;
    dir: 'forward' | 'backward' | 'initial';
  }>({ tab: 'lobby', dir: 'initial' });

  const setActiveTab = useCallback(
    (nextOrUpdater: ActiveTab | ((prev: ActiveTab) => ActiveTab)) => {
      setTabState((prev) => {
        const next =
          typeof nextOrUpdater === 'function' ? nextOrUpdater(prev.tab) : nextOrUpdater;
        if (next === prev.tab) return prev;
        const prevIdx = TAB_ORDER.indexOf(prev.tab);
        const nextIdx = TAB_ORDER.indexOf(next);
        return {
          tab: next,
          dir: nextIdx >= prevIdx ? 'forward' : 'backward',
        };
      });
    },
    []
  );
  const [muted, setMuted] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [showApkModal, setShowApkModal] = useState<boolean>(false);
  const [titleBgFailed, setTitleBgFailed] = useState<boolean>(false);
  const [preselectedUpgradeUid, setPreselectedUpgradeUid] = useState<string | null>(null);
  const [preselectedLockerUid, setPreselectedLockerUid] = useState<string | null>(null);
  const [preselectedMarketTemplateId, setPreselectedMarketTemplateId] = useState<string | null>(
    null
  );
  const [quickSaveNotice, setQuickSaveNotice] = useState<string | null>(null);
  const [forceLandscape, setForceLandscape] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      const isPortrait = window.innerHeight > window.innerWidth;
      return isTouch && isPortrait;
    } catch {
      return false;
    }
  });
  const mainStageRef = useRef<HTMLElement | null>(null);

  const [profile, setProfile] = useState<ManagerProfile>(() => {
    const saved = loadSavedSessionProfile();
    return saved ?? createStarterProfile('guest_default', 'HLV Khách', 'guest');
  });

  const [svipDailyClaimDate, setSvipDailyClaimDate] = useState<string | null>(() =>
    loadSvipDailyClaimDate(profile.id)
  );
  const [savedAccountsCount, setSavedAccountsCount] = useState<number>(() =>
    getSavedAccountSummaries().length
  );
  const [serverRules, setServerRules] = useState<GlobalServerRules>(() =>
    loadGlobalServerRules()
  );
  const [gmSessionUnlocked, setGmSessionUnlockedState] = useState<boolean>(() =>
    isGmSessionUnlocked()
  );

  const [cloudLeaderboard, setCloudLeaderboard] = useState<LeaderboardRow[]>([]);
  const [serverHubLeaderboard, setServerHubLeaderboard] = useState<LeaderboardRow[]>([]);
  const [liveSystemBanner, setLiveSystemBanner] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  const shellStateRef = useRef(shellState);
  const authModalOpenRef = useRef(authModalOpen);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const serverRulesRef = useRef(serverRules);
  serverRulesRef.current = serverRules;
  const lastServerRulesTsRef = useRef<number>(0);

  const hasAdminAccess = useMemo(
    () => checkProfileHasAdminAccess(profile),
    [profile]
  );

  const ingestBroadcasts = useCallback((gifts: ServerBroadcastGift[]) => {
    if (!gifts || gifts.length === 0) return;
    const res = applyBroadcastGiftsToProfile(profileRef.current, gifts);
    if (res.changed) {
      profileRef.current = res.nextProfile;
      setProfile(res.nextProfile);
      gameSound.playUpgradeOutcome(true);
      const sender = res.latestGift?.actorName ?? 'Quản Trị Viên';
      setLiveSystemBanner(
        `Quà toàn máy chủ từ ${sender}: đã cộng trực tiếp vào tài khoản CLB của bạn!`
      );
      window.setTimeout(() => setLiveSystemBanner(null), 5000);
    }
  }, []);

  const refreshCrossDeviceHub = useCallback(
    async (overrideProfile?: ManagerProfile) => {
      const target = overrideProfile ?? profileRef.current;
      const syncRes = await syncProfileWithServerHub(target);
      if (syncRes) {
        if (syncRes.leaderboardRows) {
          setServerHubLeaderboard(syncRes.leaderboardRows);
        }
        if (
          syncRes.serverRules &&
          typeof syncRes.serverRulesUpdatedAt === 'number' &&
          syncRes.serverRulesUpdatedAt > 0 &&
          syncRes.serverRulesUpdatedAt > lastServerRulesTsRef.current
        ) {
          lastServerRulesTsRef.current = syncRes.serverRulesUpdatedAt;
          const cleanRules = saveGlobalServerRules(syncRes.serverRules);
          serverRulesRef.current = cleanRules;
          setServerRules(cleanRules);
        }
        if (syncRes.broadcasts && syncRes.broadcasts.length > 0) {
          ingestBroadcasts(syncRes.broadcasts);
        }
        if (syncRes.isBanned && !checkProfileHasAdminAccess(target)) {
          signOutManager()
            .then((fallbackGuest) => {
              profileRef.current = fallbackGuest;
              setProfile(fallbackGuest);
              setActiveTab('lobby');
              setLiveSystemBanner(
                `Tài khoản đã bị Khóa bởi Quản Trị Viên: ${syncRes.banReason || 'Vi phạm quy định máy chủ'}`
              );
              window.setTimeout(() => setLiveSystemBanner(null), 7000);
            })
            .catch(() => {});
          return;
        }
        if (syncRes.appliedAdminMutation && syncRes.remoteProfile) {
          profileRef.current = syncRes.remoteProfile;
          setProfile(syncRes.remoteProfile);
          setGmSessionUnlockedState(isGmSessionUnlocked());
          setLiveSystemBanner(
            'Tài khoản CLB của bạn vừa được Quản Trị Viên cập nhật trực tiếp!'
          );
          window.setTimeout(() => setLiveSystemBanner(null), 5000);
        }
        return;
      }

      const boot = await fetchServerHubBootstrap();
      if (boot) {
        setServerHubLeaderboard(boot.leaderboardRows);
        if (boot.serverRulesUpdatedAt > 0 && boot.serverRulesUpdatedAt > lastServerRulesTsRef.current) {
          lastServerRulesTsRef.current = boot.serverRulesUpdatedAt;
          const cleanRules = saveGlobalServerRules(boot.serverRules);
          serverRulesRef.current = cleanRules;
          setServerRules(cleanRules);
        }
        if (boot.broadcasts.length > 0) {
          ingestBroadcasts(boot.broadcasts);
        }
      }
    },
    [ingestBroadcasts]
  );

  useEffect(() => {
    shellStateRef.current = shellState;
    document.body.dataset.state = shellState;
  }, [shellState]);

  useEffect(() => {
    authModalOpenRef.current = authModalOpen;
    if (!authModalOpen) {
      setSavedAccountsCount(getSavedAccountSummaries().length);
    }
  }, [authModalOpen]);

  useEffect(() => {
    setSvipDailyClaimDate(loadSvipDailyClaimDate(profile.id));
  }, [profile.id]);

  // Guard against unauthorized 'admin' tab selection & reset sub-screen scroll on tab change
  useEffect(() => {
    if (activeTab === 'admin' && !hasAdminAccess && !gmSessionUnlocked) {
      setActiveTab('lobby');
    }
    if (mainStageRef.current) {
      mainStageRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeTab, hasAdminAccess, gmSessionUnlocked, setActiveTab]);

  const activeAccountSummaryKey = useMemo(
    () => getCanonicalSummaryKeyForProfile(profile),
    [profile.id, profile.authMode, profile.usernameOrEmail]
  );

  // Live Cross-Web & Cross-Device Cloud Admin Account Mutation Listener
  useEffect(() => {
    const unsub = subscribeActiveAccountCrossWebSync(profileRef.current, {
      onRemoteUpdate: (updatedRemote) => {
        profileRef.current = updatedRemote;
        setProfile(updatedRemote);
        setGmSessionUnlockedState(isGmSessionUnlocked());
        setLiveSystemBanner(
          'Tài khoản CLB của bạn vừa được Quản Trị Viên cập nhật liên thiết bị / liên web!'
        );
        window.setTimeout(() => setLiveSystemBanner(null), 5000);
      },
      onRemoteBan: (reason) => {
        signOutManager()
          .then((fallbackGuest) => {
            profileRef.current = fallbackGuest;
            setProfile(fallbackGuest);
            setActiveTab('lobby');
            setLiveSystemBanner(`Tài khoản đã bị Khóa bởi Quản Trị Viên: ${reason}`);
            window.setTimeout(() => setLiveSystemBanner(null), 7000);
          })
          .catch(() => {});
      },
    });
    return () => unsub();
  }, [activeAccountSummaryKey, authReady]);

  // Firebase Auth listener, Cloud Rules/Broadcasts & Cross-Device Hub polling
  useEffect(() => {
    let unsubLb: (() => void) | null = null;
    let unsubRules: (() => void) | null = null;
    let unsubBroadcasts: (() => void) | null = null;

    const attachCloudStreams = () => {
      if (unsubLb) {
        unsubLb();
        unsubLb = null;
      }
      if (unsubRules) {
        unsubRules();
        unsubRules = null;
      }
      if (unsubBroadcasts) {
        unsubBroadcasts();
        unsubBroadcasts = null;
      }
      try {
        unsubLb = subscribeGlobalLeaderboard((rows) => {
          setCloudLeaderboard(rows);
        });
      } catch {
        // Handled inside subscribeGlobalLeaderboard
      }
      try {
        unsubRules = subscribeCloudServerRules((cloudRules) => {
          const clean = saveGlobalServerRules(cloudRules);
          serverRulesRef.current = clean;
          setServerRules(clean);
        });
      } catch {
        // Fallback gracefully if global_rules doc is absent
      }
      try {
        unsubBroadcasts = subscribeCloudBroadcasts((gifts) => {
          ingestBroadcasts(gifts);
        });
      } catch {
        // Fallback gracefully if offline
      }
    };

    refreshCrossDeviceHub().catch(() => {});

    const pollId = window.setInterval(() => {
      refreshCrossDeviceHub().catch(() => {});
    }, 6500);

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const loaded = await loadOrCreateCloudProfile(user);
          profileRef.current = loaded;
          setProfile(loaded);
          saveProfileLocally(loaded);
          setGmSessionUnlockedState(isGmSessionUnlocked());
          setSavedAccountsCount(getSavedAccountSummaries().length);
        } catch {
          // Keep current local profile if offline
        }
      }
      setAuthReady(true);
      attachCloudStreams();
      refreshCrossDeviceHub().catch(() => {});
    });

    return () => {
      window.clearInterval(pollId);
      unsubAuth();
      if (unsubLb) unsubLb();
      if (unsubRules) unsubRules();
      if (unsubBroadcasts) unsubBroadcasts();
    };
  }, [ingestBroadcasts, refreshCrossDeviceHub]);

  // Persist profile locally & debounced sync to Cross-Device Server Hub + Cloud Firestore
  useEffect(() => {
    saveProfileLocally(profile);
    setSavedAccountsCount(getSavedAccountSummaries().length);
    setGmSessionUnlockedState(isGmSessionUnlocked());
    const hubTimer = window.setTimeout(() => {
      refreshCrossDeviceHub(profile).catch(() => {});
      if (authReady && profile.authMode === 'firebase') {
        syncProfileToCloud(profile, false).catch(() => {});
      }
    }, 550);
    return () => window.clearTimeout(hubTimer);
  }, [profile, authReady, refreshCrossDeviceHub]);

  // Sync 90-degree CSS landscape class on <html> for mobile portrait viewports
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('fco-landscape-90', forceLandscape);
    return () => {
      document.documentElement.classList.remove('fco-landscape-90');
    };
  }, [forceLandscape]);

  // Reset scroll to top cleanly when switching client modes
  useEffect(() => {
    window.scrollTo(0, 0);
    mainStageRef.current?.scrollTo(0, 0);
  }, [activeTab]);

  const tryEnterNativeLandscape = useCallback(() => {
    try {
      const isTouch = window.matchMedia?.('(pointer: coarse)')?.matches;
      if (isTouch && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      const orient = screen.orientation as unknown as {
        lock?: (o: string) => Promise<void>;
      };
      if (orient?.lock) {
        orient.lock('landscape').catch(() => {});
      }
    } catch {
      // Graceful fallback when browser disallows orientation lock
    }
  }, []);

  const handleToggleLandscapeMode = useCallback(() => {
    gameSound.playClick(1.06);
    setForceLandscape((prev) => {
      const next = !prev;
      if (next) {
        tryEnterNativeLandscape();
      }
      return next;
    });
  }, [tryEnterNativeLandscape]);

  const startGame = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    tryEnterNativeLandscape();
    gameSound.playWalkoutStage('reveal');
    document.body.dataset.state = 'playing';
    setShellState('playing');
  }, [tryEnterNativeLandscape]);

  // Global keyboard shortcuts (Enter/Space on Title, Esc/P for Pause, M for Mute, 1-8 tabs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (inInput) return;

      if (shellStateRef.current === 'title' && !authModalOpenRef.current) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startGame();
          return;
        }
      }

      if (e.key === 'm' || e.key === 'M') {
        const nextMuted = gameSound.toggleMute();
        setMuted(nextMuted);
        return;
      }

      if (e.key === 'p' || e.key === 'P') {
        if (!authModalOpenRef.current && !document.querySelector('[role="dialog"]')) {
          setShellState((prev) => (prev === 'playing' ? 'paused' : 'playing'));
        }
        return;
      }

      if (e.key === 'Escape' && !authModalOpenRef.current) {
        if (document.querySelector('[role="dialog"]')) return;
        if (shellStateRef.current === 'paused') {
          setShellState('playing');
          return;
        }
        if (shellStateRef.current === 'playing') {
          setActiveTab((prevTab) => {
            if (prevTab !== 'lobby') {
              gameSound.playClick(0.95);
              return 'lobby';
            }
            setShellState('paused');
            return prevTab;
          });
        }
        return;
      }

      // Authentic FC Online PC Function Keys F1-F9
      const fnTabMap: Record<string, ActiveTab> = {
        F1: 'squad',
        F2: 'upgrade',
        F3: 'market',
        F4: 'vault',
        F5: 'shop',
        F6: 'foosball',
        F7: 'leaderboard',
        F8: 'locker',
        F9: 'vip',
      };
      if (fnTabMap[e.key]) {
        e.preventDefault(); // CRUCIAL: prevents F5 browser reload or F1 browser help
        if (shellStateRef.current === 'playing' && !document.querySelector('[role="dialog"]')) {
          gameSound.playClick();
          setActiveTab(fnTabMap[e.key]);
        }
        return;
      }

      if (shellStateRef.current === 'playing' && !document.querySelector('[role="dialog"]')) {
        const keyTabMap: Record<string, ActiveTab> = {
          '0': 'lobby',
          h: 'lobby',
          H: 'lobby',
          '1': 'squad',
          s: 'squad',
          S: 'squad',
          '2': 'market',
          '3': 'locker',
          l: 'locker',
          L: 'locker',
          '4': 'vault',
          k: 'vault',
          K: 'vault',
          '5': 'upgrade',
          u: 'upgrade',
          U: 'upgrade',
          '6': 'shop',
          '7': 'vip',
          '8': 'leaderboard',
          r: 'leaderboard',
          R: 'leaderboard',
          '9': 'foosball',
          b: 'foosball',
          B: 'foosball',
        };
        if (keyTabMap[e.key]) {
          gameSound.playClick();
          setActiveTab(keyTabMap[e.key]);
        }
      }
    };

    const onBlur = () => {
      // Clear any transient focus states without forcing pause modal
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [startGame]);

  const svipClaimDateRef = useRef(svipDailyClaimDate);
  svipClaimDateRef.current = svipDailyClaimDate;

  const handleUpdateServerRules = useCallback((nextRules: GlobalServerRules) => {
    const clean = saveGlobalServerRules(nextRules);
    lastServerRulesTsRef.current = Date.now();
    serverRulesRef.current = clean;
    setServerRules(clean);
    publishGlobalServerRulesEverywhere(clean, profileRef.current.managerName).catch(() => {});
  }, []);

  const handleReturnToMasterAdmin = useCallback(() => {
    const gmProfile = loginMasterAdminQuick();
    profileRef.current = gmProfile;
    setProfile(gmProfile);
    setGmSessionUnlockedState(true);
    setSavedAccountsCount(getSavedAccountSummaries().length);
    setActiveTab('admin');
  }, []);

  const handleSwitchIntoManagedAccount = useCallback(async (summaryKey: string) => {
    try {
      const switched = switchToSavedAccount(summaryKey, true);
      profileRef.current = switched;
      setProfile(switched);
      setGmSessionUnlockedState(true);
      setActiveTab('lobby');
    } catch {
      try {
        const remoteLoaded = await loadManagedAccountFullProfile(summaryKey);
        if (remoteLoaded) {
          saveProfileLocally(remoteLoaded);
          profileRef.current = remoteLoaded;
          setProfile(remoteLoaded);
          setGmSessionUnlockedState(true);
          setActiveTab('lobby');
        }
      } catch {
        // Keep current session if account was removed
      }
    }
  }, []);

  // Game Mutation Handlers (computed synchronously via profileRef so React 19 batching never drops state or duplicates serials)
  const handleOpenOnePack = useCallback((packId: PackId): OwnedCard | null => {
    const res = openPacksFromProfile(profileRef.current, packId, 1);
    if (res.drawnCards.length === 0) return null;
    profileRef.current = res.nextProfile;
    setProfile(res.nextProfile);
    return res.drawnCards[0];
  }, []);

  const handleOpenMultiPacks = useCallback((packId: PackId, count: number): OwnedCard[] => {
    const clampedCount = Math.max(1, Math.min(50, Math.floor(count)));
    const res = openPacksFromProfile(profileRef.current, packId, clampedCount);
    if (res.drawnCards.length === 0) return [];
    profileRef.current = res.nextProfile;
    setProfile(res.nextProfile);
    return res.drawnCards;
  }, []);

  const handleOpenAllPacks = useCallback((packId: PackId): OwnedCard[] => {
    const res = openPacksFromProfile(profileRef.current, packId, 50);
    if (res.drawnCards.length === 0) return [];
    profileRef.current = res.nextProfile;
    setProfile(res.nextProfile);
    return res.drawnCards;
  }, []);

  const handleBuyPackWithBp = useCallback((packId: PackId, costBp: number) => {
    setProfile((prev) => {
      if (prev.bp < costBp) return prev;
      return {
        ...prev,
        bp: prev.bp - costBp,
        packs: {
          ...prev.packs,
          [packId]: (prev.packs[packId] ?? 0) + 1,
        },
      };
    });
  }, []);

  const handlePurchaseShopOffer = useCallback((offerId: string): ShopPurchaseResult => {
    const res = purchaseShopOffer(profileRef.current, offerId);
    if (res.ok) {
      profileRef.current = res.nextProfile;
      setProfile(res.nextProfile);
    }
    return res;
  }, []);

  const handleExecuteUpgrade = useCallback(
    (
      targetUid: string,
      fodderUids: string[],
      rhythmOffset: number,
      useBpProtection: boolean = false
    ): EnhancementOutcome | null => {
      const cur = profileRef.current;
      const target = cur.cards.find((c) => c.uid === targetUid);
      const fodders = fodderUids
        .map((id) => cur.cards.find((c) => c.uid === id))
        .filter((c): c is OwnedCard => Boolean(c));
      if (!target || fodders.length < 1) return null;

      const wantProtection = Boolean(useBpProtection && canUseBpProtection(target));
      const protCost = wantProtection ? calculateBpProtectionCost(target) : 0;
      const effectiveProtection = wantProtection && cur.bp >= protCost;

      const vip = calculateVipStatus(cur.vipPoints);
      const computedOutcome = resolveCardEnhancement(
        target,
        fodders,
        vip.level,
        rhythmOffset,
        Math.random,
        effectiveProtection,
        serverRulesRef.current
      );

      setProfile((prev) => {
        const fodderSet = new Set(fodderUids);
        const nextCards = prev.cards
          .filter((c) => !fodderSet.has(c.uid))
          .map((c) => (c.uid === target.uid ? computedOutcome.updatedCard : c));

        return {
          ...prev,
          bp: Math.max(0, prev.bp - computedOutcome.protectionCostBp),
          cards: nextCards,
        };
      });
      return computedOutcome;
    },
    []
  );

  const handleQuickBuyFodderBundle = useCallback((): boolean => {
    const cost = 50_000_000_000;
    if (profileRef.current.bp < cost) return false;
    const newFodders = Array.from({ length: 5 }, (_, idx) =>
      drawCardFromPack('cu_fodder', Math.random, `fodder_${idx}`)
    );
    setProfile((prev) => {
      if (prev.bp < cost) return prev;
      return {
        ...prev,
        bp: prev.bp - cost,
        cards: [...prev.cards, ...newFodders],
      };
    });
    return true;
  }, []);

  // SVIP & Foosball Event Handlers (Milestone 10,000 Exclusive IPRM & LE)
  const handlePlayFoosballSpins = useCallback(
    (spinCount: 1 | 10 | 100): FoosballSpinReward[] => {
      const cur = profileRef.current;
      const costFc = getFoosballSpinCost(spinCount);
      if (cur.fc < costFc) return [];
      const batch = executeFoosballSpinsWithJackpot(spinCount, cur.foosballJackpotFc);
      const nextPacks: PackInventory = { ...cur.packs };
      let totalBpEarned = 0;
      for (const rw of batch.rewards) {
        totalBpEarned += rw.bpEarned;
        if (rw.packId && rw.packCount > 0) {
          nextPacks[rw.packId] = Math.min(100_000, (nextPacks[rw.packId] ?? 0) + rw.packCount);
        }
      }
      const nextProfile: ManagerProfile = {
        ...cur,
        fc: Math.max(0, Math.min(1_000_000_000, cur.fc - costFc + batch.totalJackpotFcWon)),
        bp: Math.min(MAX_SAFE_BP, cur.bp + totalBpEarned),
        packs: nextPacks,
        foosballSpins: cur.foosballSpins + spinCount,
        foosballJackpotFc: batch.nextJackpotFc,
      };
      profileRef.current = nextProfile;
      setProfile(nextProfile);
      return batch.rewards;
    },
    []
  );

  const handleUseFreeFoosballLoops = useCallback(
    (loopCount: number = 1): FoosballSpinReward[] => {
      const cur = profileRef.current;
      const count = Math.max(1, Math.min(100, Math.floor(loopCount)));
      if ((cur.foosballLoops ?? 0) < count) return [];
      const batch = executeFoosballSpinsWithJackpot(count, cur.foosballJackpotFc);
      const nextPacks: PackInventory = { ...cur.packs };
      let totalBpEarned = 0;
      for (const rw of batch.rewards) {
        totalBpEarned += rw.bpEarned;
        if (rw.packId && rw.packCount > 0) {
          nextPacks[rw.packId] = Math.min(100_000, (nextPacks[rw.packId] ?? 0) + rw.packCount);
        }
      }
      const nextProfile: ManagerProfile = {
        ...cur,
        fc: Math.min(1_000_000_000, cur.fc + batch.totalJackpotFcWon),
        bp: Math.min(MAX_SAFE_BP, cur.bp + totalBpEarned),
        packs: nextPacks,
        foosballLoops: Math.max(0, (cur.foosballLoops ?? 0) - count),
        foosballSpins: cur.foosballSpins + count,
        foosballJackpotFc: batch.nextJackpotFc,
      };
      profileRef.current = nextProfile;
      setProfile(nextProfile);
      return batch.rewards;
    },
    []
  );

  const handleExchangeBpForFoosballLoops = useCallback((loopsToBuy: 1 | 10 | 100) => {
    const res = exchangeBpForFoosballLoops(profileRef.current, loopsToBuy);
    if (res.ok) {
      profileRef.current = res.nextProfile;
      setProfile(res.nextProfile);
    }
    return { ok: res.ok, error: res.error };
  }, []);

  const handleClaimFoosballMilestone = useCallback((milestoneSpins: number) => {
    const res = claimFoosballMilestoneReward(profileRef.current, milestoneSpins);
    if (res.ok) {
      profileRef.current = res.nextProfile;
      setProfile(res.nextProfile);
    }
  }, []);

  const handleClaimAllFoosballMilestones = useCallback(() => {
    let working = profileRef.current;
    const claimable = getUnclaimedReachedMilestones(
      working.foosballSpins,
      working.claimedMilestones
    );
    if (claimable.length === 0) return;
    for (const spins of claimable) {
      const res = claimFoosballMilestoneReward(working, spins);
      if (res.ok) {
        working = res.nextProfile;
      }
    }
    profileRef.current = working;
    setProfile(working);
  }, []);

  const handleClaimDailySvipSalary = useCallback(() => {
    const today = getTodayDateKey();
    const res = claimDailySvipSalary(profileRef.current, svipClaimDateRef.current, today);
    if (!res.ok) {
      return { ok: false, error: res.error, summaryText: res.summaryText };
    }
    svipClaimDateRef.current = today;
    setSvipDailyClaimDate(today);
    saveSvipDailyClaimDate(profileRef.current.id, today);
    profileRef.current = res.nextProfile;
    setProfile(res.nextProfile);
    return { ok: true, summaryText: res.summaryText };
  }, []);

  const handleActivateSvipPlan = useCallback((planId: string) => {
    const res = activateSvipPlan(profileRef.current, planId);
    if (!res.ok) {
      return { ok: false, error: res.error, summaryText: res.summaryText };
    }
    profileRef.current = res.nextProfile;
    setProfile(res.nextProfile);
    return { ok: true, summaryText: res.summaryText };
  }, []);

  const handleClaimVipReward = useCallback((vipLevel: number) => {
    setProfile((prev) => {
      const currentVip = calculateVipStatus(prev.vipPoints).level;
      if (currentVip < vipLevel || prev.claimedVipRewards.includes(vipLevel)) {
        return prev;
      }
      const tier = VIP_REWARD_TIERS.find((t) => t.vipLevel === vipLevel);
      if (!tier) return prev;
      return {
        ...prev,
        bp: prev.bp + tier.bonusBp,
        packs: {
          ...prev.packs,
          [tier.packId]: (prev.packs[tier.packId] ?? 0) + tier.packCount,
        },
        claimedVipRewards: [...prev.claimedVipRewards, vipLevel],
      };
    });
  }, []);

  const handleQuickSaveHeader = useCallback(() => {
    gameSound.playUpgradeOutcome(true);
    const { savedAt } = forceSaveManagerAccount(profileRef.current);
    setSavedAccountsCount(getSavedAccountSummaries().length);
    const timeStr = new Date(savedAt).toLocaleTimeString('vi-VN');
    setQuickSaveNotice(`Đã lưu lúc ${timeStr}`);
    window.setTimeout(() => setQuickSaveNotice(null), 2600);
  }, []);

  const handleQuickSellCard = useCallback((cardUid: string) => {
    setProfile((prev) => {
      if (prev.cards.length <= 11) return prev;
      const card = prev.cards.find((c) => c.uid === cardUid);
      if (!card) return prev;
      return {
        ...prev,
        bp: Math.min(MAX_SAFE_BP, prev.bp + Math.round(card.valueBp * 0.85)),
        cards: prev.cards.filter((c) => c.uid !== cardUid),
      };
    });
  }, []);

  const handleBuyFromMarket = useCallback(
    (templateId: string, grade: number): MarketPurchaseResult => {
      const res = buyCardFromMarket(profileRef.current, templateId, grade);
      if (res.ok && res.purchasedCard) {
        profileRef.current = res.nextProfile;
        setProfile(res.nextProfile);
        const tpl = PLAYER_TEMPLATE_MAP[res.purchasedCard.templateId];
        gameSound.triggerCardObtainVibration(res.purchasedCard.ovr, tpl?.season);
      }
      return res;
    },
    []
  );

  const handleSellOnMarket = useCallback((cardUid: string): MarketSaleResult => {
    const res = sellCardOnMarket(profileRef.current, cardUid, serverRulesRef.current);
    if (res.ok && res.quote) {
      profileRef.current = res.nextProfile;
      setProfile(res.nextProfile);
    }
    return res;
  }, []);

  const handleEquipMiniface = useCallback((cardUid: string, minifaceUrl?: string) => {
    setProfile((prev) => ({
      ...prev,
      cards: equipCardMiniface(prev.cards, cardUid, minifaceUrl),
    }));
  }, []);

  const handleChangeFormation = useCallback((nextFormation: FormationCode) => {
    setProfile((prev) => ({
      ...prev,
      formation: nextFormation,
      lineupSlotUids:
        prev.activeTeamColorId && prev.activeTeamColorId !== 'auto'
          ? prioritizeCardsForTeamColor(prev.cards, nextFormation, prev.activeTeamColorId)
          : undefined,
    }));
  }, []);

  const handleChangeTeamColor = useCallback((nextTeamColorId: string) => {
    setProfile((prev) => ({
      ...prev,
      activeTeamColorId: nextTeamColorId,
    }));
  }, []);

  const handleChangeLineupSlots = useCallback((nextSlotUids?: string[]) => {
    setProfile((prev) => ({
      ...prev,
      lineupSlotUids: nextSlotUids,
    }));
  }, []);

  const handleOptimizeForTeamColor = useCallback((teamColorId: string) => {
    setProfile((prev) => {
      const f = prev.formation ?? '4-3-3';
      const optimized = prioritizeCardsForTeamColor(prev.cards, f, teamColorId);
      return {
        ...prev,
        activeTeamColorId: teamColorId,
        lineupSlotUids: optimized,
      };
    });
  }, []);

  // Combined Leaderboard: Cross-Device Server Hub + Cloud Firestore + Local Registered HLV + Active Device Session
  const combinedLeaderboard = useMemo(() => {
    const currentOwnerId = getCanonicalOwnerIdForProfile(profile);
    const map = new Map<string, LeaderboardRow>();
    for (const localRow of getLocalLeaderboardRows()) {
      map.set(localRow.ownerId, localRow);
    }
    for (const hubRow of serverHubLeaderboard) {
      map.set(hubRow.ownerId, hubRow);
    }
    for (const cloudRow of cloudLeaderboard) {
      map.set(cloudRow.ownerId, cloudRow);
    }
    const selfRow = buildLeaderboardRowFromProfile(
      {
        ...profile,
        id: currentOwnerId,
        deviceLabel: profile.deviceLabel || detectDeviceLabel(),
      },
      true
    );
    map.set(currentOwnerId, selfRow);
    return Array.from(map.values()).map((row) => ({
      ...row,
      isCurrentUser: row.ownerId === currentOwnerId,
    }));
  }, [cloudLeaderboard, serverHubLeaderboard, profile]);

  const vipStatus = useMemo(() => calculateVipStatus(profile.vipPoints), [profile.vipPoints]);
  const squadSummary = useMemo(() => calculateSquadSummary(profile.cards), [profile.cards]);
  const headerSquadOvr = useMemo(() => {
    const lineup = buildFormationLineup(
      profile.cards,
      profile.formation ?? '4-3-3',
      profile.lineupSlotUids
    );
    return evaluateSquadTeamColors(
      lineup.slots.map((s) => s.card),
      profile.activeTeamColorId ?? 'auto'
    ).boostedAvgOvr;
  }, [profile.cards, profile.formation, profile.lineupSlotUids, profile.activeTeamColorId]);
  const totalUnopenedPacks = useMemo(
    () => Object.values(profile.packs).reduce((s, n) => s + n, 0),
    [profile.packs]
  );

  // TITLE SCREEN SHELL (100% LANDSCAPE EA SPORTS FC ONLINE PC LAUNCHER)
  if (shellState === 'title') {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#050811] flex flex-col justify-between select-none">
        {/* Stadium Key-Art Backdrop with Left Calm Negative Space */}
        {!titleBgFailed && (
          <img
            src={GENERATED_ASSETS.stadiumTunnelBg}
            alt="Đường hầm sân vận động FC Online"
            referrerPolicy="no-referrer"
            onError={() => setTitleBgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        )}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, rgba(5,8,17,0.96) 0%, rgba(5,8,17,0.82) 48%, rgba(5,8,17,0.45) 100%)',
          }}
        />

        <StadiumCanvas paused={false} />

        {/* Top Slender FC Online PC Client Strip */}
        <header className="relative z-10 w-full px-3 sm:px-8 py-2 flex items-center justify-between gap-2 border-b border-white/10 bg-[#050811]/92 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FcOnlineTriangleMark className="w-6 h-5 shrink-0" />
            <span
              className="text-base sm:text-lg font-extrabold italic tracking-wide text-white whitespace-nowrap"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              EA SPORTS FC™ <span className="text-[#a3e635]">ONLINE</span>
            </span>
            <span className="hidden md:inline text-xs text-slate-400 whitespace-nowrap">· Máy Chủ Việt Nam · Mùa 2026</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              data-testid="title-landscape-toggle-btn"
              onClick={handleToggleLandscapeMode}
              className={`min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded text-[11px] sm:text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                forceLandscape
                  ? 'bg-[#a3e635] text-slate-950 border-[#bef264]'
                  : 'bg-slate-900/95 hover:bg-slate-800 text-slate-200 border-white/15'
              }`}
            >
              {forceLandscape ? 'Màn Ngang 90°: BẬT' : 'Xoay Ngang'}
            </button>
            <button
              type="button"
              onClick={() => setMuted(gameSound.toggleMute())}
              className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded bg-slate-900/95 hover:bg-slate-800 border border-white/15 text-[11px] sm:text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
            >
              {muted ? 'Âm thanh: Tắt' : 'Âm thanh: Bật'}
            </button>
          </div>
        </header>

        {/* Horizontal 2-Column Widescreen Launcher Hero (stacks cleanly on unrotated portrait mobile) */}
        <main className="relative z-10 flex-1 min-h-0 flex items-center px-4 sm:px-8 lg:px-14 py-2 sm:py-3 overflow-y-auto fco-touch-scroll">
          <div className="w-full max-w-[1320px] mx-auto grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 items-center">
            {/* Left 7 Cols: Title Emblem + Horizontal CTAs */}
            <div className="sm:col-span-7 space-y-2.5 sm:space-y-4 min-w-0">
              <TitleCrestLockup />

              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 pt-1">
                <button
                  type="button"
                  data-start="true"
                  onClick={startGame}
                  className="fco-pc-btn-primary fco-pc-tab-skew min-h-[44px] px-5 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-lg tracking-wider cursor-pointer whitespace-nowrap"
                >
                  Vào Sảnh Chính FC Online
                </button>

                <button
                  type="button"
                  data-testid="title-open-auth-btn"
                  onClick={() => {
                    gameSound.playClick();
                    setAuthModalOpen(true);
                  }}
                  className="fco-pc-btn-slate min-h-[42px] px-4 sm:px-5 py-2 sm:py-3 rounded-sm text-xs sm:text-sm cursor-pointer whitespace-nowrap tabular-nums"
                >
                  {savedAccountsCount > 0
                    ? `Tài Khoản HLV (${savedAccountsCount})`
                    : profile.authMode === 'guest'
                    ? 'Đăng Nhập / Lưu CLB'
                    : 'Quản Lý Tài Khoản'}
                </button>

                <button
                  type="button"
                  data-testid="title-apk-install-btn"
                  onClick={() => {
                    gameSound.playClick(1.05);
                    setShowApkModal(true);
                  }}
                  className="min-h-[42px] px-3.5 sm:px-4 py-2 sm:py-3 rounded-sm bg-[#0d2216] hover:bg-[#133321] border border-[#a3e635]/45 text-[#a3e635] font-extrabold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor">
                    <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1523-.5676.416.416 0 00-.5676.1523l-2.0223 3.503C15.5802 8.4116 13.8443 8.125 12 8.125s-3.5802.2866-5.1366.8299L4.8411 5.4519a.416.416 0 00-.5676-.1523.416.416 0 00-.1523.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.75h24c-.3432-4.0911-2.6889-7.5633-6.1185-9.4286" />
                  </svg>
                  <span>Cài APK</span>
                </button>

                {hasAdminAccess && (
                  <button
                    type="button"
                    data-testid="title-admin-console-btn"
                    onClick={() => {
                      setActiveTab('admin');
                      startGame();
                    }}
                    className="min-h-[42px] px-4 py-2 sm:py-3 rounded-sm bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Kiểm Soát Trò Chơi (GM)
                  </button>
                )}
              </div>
            </div>

            {/* Right 5 Cols: FC Online PC Manager Club Card */}
            <div className="sm:col-span-5 flex justify-start sm:justify-end min-w-0">
              <div className="w-full max-w-md fco-pc-panel-glow rounded-lg p-3 sm:p-5 space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
                  <span className="text-[11px] font-extrabold tracking-wider text-[#a3e635]">
                    HLV ĐẠI DIỆN · BẢN CHÍNH THỨC
                  </span>
                  <span className="text-[11px] font-mono text-amber-300 tabular-nums">
                    SVIP {vipStatus.level}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <strong
                    className="text-lg sm:text-2xl font-extrabold italic text-white truncate"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    {profile.managerName}
                  </strong>
                  <span className="font-mono text-sm sm:text-base font-black text-[#a3e635] tabular-nums shrink-0">
                    OVR {headerSquadOvr}
                  </span>
                </div>

                <div className="grid grid-cols-12 gap-1.5 sm:gap-2 text-center pt-0.5 tabular-nums">
                  <div className="col-span-5 rounded bg-[#060a12] border border-white/10 p-1.5 sm:p-2">
                    <div className="text-[10px] text-slate-400">QUỸ BP</div>
                    <div className="text-[11px] sm:text-xs font-mono font-bold text-emerald-300 leading-tight break-words">
                      {formatBpCompact(profile.bp)}
                    </div>
                  </div>
                  <div className="col-span-3 rounded bg-[#060a12] border border-white/10 p-1.5 sm:p-2">
                    <div className="text-[10px] text-slate-400">FC</div>
                    <div className="text-[11px] sm:text-xs font-mono font-bold text-amber-400 truncate">
                      {profile.fc.toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <div className="col-span-4 rounded bg-[#060a12] border border-white/10 p-1.5 sm:p-2">
                    <div className="text-[10px] text-slate-400">GÓI THẺ</div>
                    <div className="text-[11px] sm:text-xs font-mono font-bold text-sky-300 truncate">
                      {totalUnopenedPacks} gói
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 truncate">
                  {profile.authMode === 'guest'
                    ? 'Phiên Khách · Lưu tài khoản thật để giữ đội bóng vĩnh viễn'
                    : `Cloud Đã Lưu: ${profile.usernameOrEmail ?? 'HLV Máy Chủ VN'}`}
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Bottom Control Hint Bar */}
        <footer className="fco-short-hide relative z-10 px-4 sm:px-8 py-2 text-[11px] text-slate-400 tracking-wide border-t border-white/5 bg-[#050811]/90 flex items-center justify-between gap-2 shrink-0">
          <span className="truncate">
            Enter / Space Vào Sảnh · Esc Quay lại Sảnh · Phím F1–F9 / 1–9 Chuyển phân khu · M Âm thanh · P Tạm dừng
          </span>
          <span className="text-[#a3e635] font-semibold whitespace-nowrap shrink-0">
            EA SPORTS FC™ ONLINE PC · CHƠI MƯỢT TRÊN ĐIỆN THOẠI
          </span>
        </footer>

        {authModalOpen && (
          <AuthModal
            currentProfile={profile}
            onAuthenticated={(nextProfile) => {
              profileRef.current = nextProfile;
              setProfile(nextProfile);
              setGmSessionUnlockedState(isGmSessionUnlocked());
              setSavedAccountsCount(getSavedAccountSummaries().length);
            }}
            onOpenAdminConsole={() => {
              setActiveTab('admin');
              startGame();
            }}
            onClose={() => setAuthModalOpen(false)}
          />
        )}

        <ApkInstallModal
          isOpen={showApkModal}
          onClose={() => setShowApkModal(false)}
        />
      </div>
    );
  }

  // PLAYING & PAUSED GAME SHELL (100% NEW-GEN FC ONLINE PC CLIENT CHROME)
  const subScreenModes: Array<{ id: ActiveTab; label: string; icon: FcoIconId; countNote?: string }> = [
    { id: 'lobby', label: 'Sảnh', icon: 'lobby' },
    { id: 'squad', label: 'Đội bóng', icon: 'squad' },
    { id: 'market', label: 'TTCN', icon: 'market' },
    { id: 'upgrade', label: 'Nâng cấp', icon: 'upgrade' },
    {
      id: 'vault',
      label: 'Vật phẩm',
      icon: 'vault',
      countNote: totalUnopenedPacks > 0 ? `${totalUnopenedPacks}` : undefined,
    },
    {
      id: 'foosball',
      label: 'Bi Lắc 10K',
      icon: 'foosball',
      countNote: (profile.foosballLoops ?? 0) > 0 ? `${profile.foosballLoops}` : undefined,
    },
    { id: 'shop', label: 'Shop', icon: 'shop' },
    { id: 'vip', label: `SVIP ${vipStatus.level}`, icon: 'vip' },
    { id: 'leaderboard', label: 'BXH', icon: 'leaderboard' },
    { id: 'locker', label: 'Thay đồ', icon: 'locker' },
    ...(hasAdminAccess
      ? ([{ id: 'admin', label: 'Quản Trị', icon: 'admin' }] as Array<{
          id: ActiveTab;
          label: string;
          icon: FcoIconId;
        }>)
      : []),
  ];

  const activeModeTitle: Record<ActiveTab, string> = {
    lobby: 'SẢNH CHÍNH',
    squad: 'ĐỘI BÓNG CỦA TÔI · SƠ ĐỒ & TEAM COLOR',
    locker: 'PHÒNG THAY ĐỒ · MINIFACE & ÁO ĐẤU',
    market: 'THỊ TRƯỜNG CHUYỂN NHƯỢNG CHUẨN FC ONLINE PC (+1 ~ +13)',
    upgrade: 'PHÒNG NÂNG CẤP CẦU THỦ & BẢO VỆ CẤP +8 BẰNG BP',
    vault: 'KHO VẬT PHẨM & MỞ THẺ WALKOUT 100% FC ONLINE PC',
    shop: 'CỬA HÀNG VẬT PHẨM & SHOP ĐIỂM SAO TARPOI',
    foosball: 'SỰ KIỆN BI LẮC SIÊU CẤP · MỐC 10.000 ĐIỂM ĐỘC QUYỀN IPRM & LE',
    vip: 'ĐẶC QUYỀN HỘI VIÊN SVIP FC ONLINE PC (SVIP 1 – SVIP 20)',
    leaderboard: 'BẢNG XẾP HẠNG LIÊN THIẾT BỊ & ĐA HẠNG MỤC',
    admin: 'KIỂM SOÁT TRÒ CHƠI · TÀI KHOẢN QUẢN TRỊ VIÊN LIÊN WEB',
  };

  const activeModeShortTitle: Record<ActiveTab, string> = {
    lobby: 'SẢNH CHÍNH',
    squad: 'ĐỘI BÓNG',
    locker: 'THAY ĐỒ',
    market: 'TTCN (+1~+13)',
    upgrade: 'NÂNG CẤP',
    vault: 'VẬT PHẨM',
    shop: 'SHOP',
    foosball: 'BI LẮC 10K',
    vip: 'SVIP',
    leaderboard: 'BXH',
    admin: 'QUẢN TRỊ',
  };

  const isFixedLobby = activeTab === 'lobby';
  const todayDateKey = getTodayDateKey();

  return (
    <div className="relative w-full h-full max-h-full overflow-hidden bg-[#050810] text-slate-100 flex flex-col">
      {!isFixedLobby && <StadiumCanvas paused={shellState === 'paused'} />}

      {/* FC Online New-Gen Client Sub-Screen Top Bar (Crisp Carbon Header, Zero Blur) */}
      {!isFixedLobby && (
        <header className="relative z-40 shrink-0 fco-pc-topbar fco-chrome-fade">
          <div className="max-w-[1440px] mx-auto px-2.5 sm:px-5 py-1.5 flex items-center justify-between gap-2">
            {/* Left: ESC Back to Lobby + Mode Heading + Squad OVR */}
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 min-w-0 max-w-[48%] sm:max-w-[55%] lg:max-w-none">
              <button
                type="button"
                data-testid="client-back-lobby"
                onClick={() => {
                  gameSound.playClick(0.96);
                  setActiveTab('lobby');
                }}
                className="fco-pc-btn-primary fco-pc-tab-skew min-h-[34px] sm:min-h-[36px] px-2.5 sm:px-4 py-1 text-[11px] sm:text-xs tracking-wider cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 active:scale-95"
              >
                <span>← SẢNH</span>
                <span className="hidden md:inline font-mono text-[10px] bg-slate-950/20 px-1 rounded font-black">
                  [ESC]
                </span>
              </button>

              <div className="hidden sm:block h-5 w-[1px] bg-white/15 shrink-0" />

              <h1
                className="text-xs sm:text-xl font-black italic tracking-wide text-white uppercase truncate"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                <span className="lg:hidden">{activeModeShortTitle[activeTab]}</span>
                <span className="hidden lg:inline">{activeModeTitle[activeTab]}</span>
              </h1>

              <span className="hidden xl:inline text-xs font-mono text-slate-400 tabular-nums shrink-0">
                · {profile.managerName} · OVR {headerSquadOvr} · CLB{' '}
                {formatBpCompact(squadSummary.squadValue)}
              </span>
            </div>

            {/* Right: Live Currencies + 1-Click Save Account + Landscape Toggle + Utility */}
            <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar fco-touch-scroll">
              <div className="ml-auto flex w-max items-center gap-1 sm:gap-1.5 tabular-nums">
              <div className="fco-pc-currency-pill min-h-[34px] flex items-center px-2 sm:px-2.5 py-1 rounded-sm text-[11px] sm:text-xs font-black text-white whitespace-nowrap">
                <span className="text-[#a3e635] font-mono mr-1">BP</span>
                {formatBpCompact(profile.bp)}
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('shop')}
                className="hidden md:flex items-center gap-1 fco-pc-currency-pill hover:border-amber-400/50 min-h-[34px] px-2.5 py-1 rounded-sm text-xs font-bold text-amber-300 cursor-pointer whitespace-nowrap transition-colors"
              >
                <span className="text-amber-200/80 text-[10px]">TARPOI</span>
                <strong className="font-mono font-black">
                  {(profile.starPoints ?? 0).toLocaleString('vi-VN')}
                </strong>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('vip')}
                className="fco-pc-currency-pill hover:border-amber-400/50 min-h-[34px] flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-sm text-[11px] sm:text-xs font-bold text-amber-400 cursor-pointer whitespace-nowrap transition-colors"
              >
                <span className="font-mono font-black">{profile.fc.toLocaleString('vi-VN')} FC</span>
                <span className="text-slate-300 text-[10px] hidden lg:inline">
                  · SVIP {vipStatus.level}
                </span>
              </button>

              <button
                type="button"
                data-testid="header-quick-save-btn"
                onClick={handleQuickSaveHeader}
                className="min-h-[34px] px-2 sm:px-2.5 py-1 rounded-sm bg-[#122215] hover:bg-[#1a331f] border border-[#a3e635]/50 text-[11px] sm:text-xs font-black text-[#a3e635] cursor-pointer whitespace-nowrap transition-colors"
              >
                {quickSaveNotice ?? 'LƯU TK'}
              </button>

              <button
                type="button"
                onClick={handleToggleLandscapeMode}
                title="Chuyển chế độ Màn Hình Ngang 90°"
                className={`min-h-[34px] px-2.5 py-1 rounded-sm text-[11px] font-black border cursor-pointer whitespace-nowrap transition-colors ${
                  forceLandscape
                    ? 'bg-[#a3e635] text-slate-950 border-[#bef264]'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-white/15'
                }`}
              >
                Ngang
              </button>

              <button
                type="button"
                data-testid="header-apk-btn"
                onClick={() => {
                  gameSound.playClick(1.05);
                  setShowApkModal(true);
                }}
                className="min-h-[34px] px-2.5 py-1 rounded-sm bg-emerald-950/90 hover:bg-emerald-900 border border-[#a3e635]/50 text-[11px] sm:text-xs font-black text-[#a3e635] flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="currentColor">
                  <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1523-.5676.416.416 0 00-.5676.1523l-2.0223 3.503C15.5802 8.4116 13.8443 8.125 12 8.125s-3.5802.2866-5.1366.8299L4.8411 5.4519a.416.416 0 00-.5676-.1523.416.416 0 00-.1523.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.75h24c-.3432-4.0911-2.6889-7.5633-6.1185-9.4286" />
                </svg>
                <span className="hidden sm:inline">APK</span>
              </button>

              {(hasAdminAccess || gmSessionUnlocked) && (
                <button
                  type="button"
                  data-testid="header-gm-console-btn"
                  onClick={() => {
                    gameSound.playClick(1.1);
                    if (hasAdminAccess) {
                      setActiveTab('admin');
                    } else {
                      handleReturnToMasterAdmin();
                    }
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-sm bg-amber-400 hover:bg-amber-300 text-[11px] sm:text-xs font-extrabold text-slate-950 cursor-pointer whitespace-nowrap"
                >
                  {hasAdminAccess ? 'Quản Trị' : 'Về GM'}
                </button>
              )}

              <button
                type="button"
                data-testid="header-open-auth-btn"
                onClick={() => setAuthModalOpen(true)}
                className="min-h-[34px] px-2.5 py-1 rounded-sm bg-slate-800 hover:bg-slate-700 border border-white/10 text-[11px] sm:text-xs font-semibold text-slate-100 cursor-pointer whitespace-nowrap"
              >
                {profile.authMode === 'guest'
                  ? 'TK (Khách)'
                  : `TK (${savedAccountsCount > 0 ? savedAccountsCount : 1})`}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setMuted(gameSound.toggleMute());
                }}
                className="w-9 h-9 rounded-sm bg-slate-900 hover:bg-slate-800 border border-white/10 flex items-center justify-center text-slate-200 cursor-pointer shrink-0"
              >
                {muted ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                )}
              </button>
              </div>
            </div>
          </div>
        </header>
      )}

      {liveSystemBanner && (
        <div
          role="status"
          data-testid="live-system-banner"
          className="relative z-40 shrink-0 w-full bg-[#0d1d13] border-b border-[#a3e635]/50 px-4 py-1 text-center text-xs font-bold text-[#a3e635]"
        >
          {liveSystemBanner}
        </div>
      )}

      {/* Active Game Mode Stage */}
      <main
        ref={mainStageRef}
        className={
          isFixedLobby
            ? 'relative z-10 flex-1 min-h-0 w-full h-full overflow-hidden'
            : 'relative z-10 flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden fco-touch-scroll'
        }
      >
        <div
          key={activeTab}
          data-testid="active-tab-stage"
          data-active-tab={activeTab}
          data-transition-dir={tabTransitionDir}
          className={`${
            tabTransitionDir === 'forward'
              ? 'fco-tab-enter-forward'
              : tabTransitionDir === 'backward'
              ? 'fco-tab-enter-backward'
              : 'fco-tab-enter-initial'
          } ${
            isFixedLobby
              ? 'w-full h-full'
              : 'max-w-[1440px] mx-auto px-2.5 sm:px-5 py-2.5 sm:py-3.5'
          }`}
        >
        {activeTab === 'lobby' && (
          <LobbyView
            profile={profile}
            vipStatus={vipStatus}
            totalUnopenedPacks={totalUnopenedPacks}
            muted={muted}
            isAdmin={hasAdminAccess}
            gmSessionUnlocked={gmSessionUnlocked}
            serverRules={serverRules}
            forceLandscape={forceLandscape}
            onToggleLandscapeMode={handleToggleLandscapeMode}
            onReturnToMasterAdmin={handleReturnToMasterAdmin}
            onToggleMute={() => {
              const next = gameSound.toggleMute();
              setMuted(next);
            }}
            onOpenAuthModal={() => setAuthModalOpen(true)}
            onPauseGame={() => setShellState('paused')}
            onReturnToTitle={() => setShellState('title')}
            onUpdateProfile={(updater) => setProfile((prev) => updater(prev))}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onSelectForUpgrade={(uid) => {
              setPreselectedUpgradeUid(uid);
              setActiveTab('upgrade');
            }}
            onOpenLockerRoom={(uid) => {
              setPreselectedLockerUid(uid);
              setActiveTab('locker');
            }}
            onGoToMarketPlayer={(templateId) => {
              setPreselectedMarketTemplateId(templateId ?? null);
              setActiveTab('market');
            }}
          />
        )}

        {activeTab === 'squad' && (
          <SquadView
            cards={profile.cards}
            vipLevel={vipStatus.level}
            formation={profile.formation ?? '4-3-3'}
            activeTeamColorId={profile.activeTeamColorId ?? 'auto'}
            lineupSlotUids={profile.lineupSlotUids}
            onChangeFormation={handleChangeFormation}
            onChangeTeamColor={handleChangeTeamColor}
            onChangeLineupSlots={handleChangeLineupSlots}
            onOptimizeForTeamColor={handleOptimizeForTeamColor}
            onSelectForUpgrade={(uid) => {
              setPreselectedUpgradeUid(uid);
              setActiveTab('upgrade');
            }}
            onOpenLockerRoom={(uid) => {
              setPreselectedLockerUid(uid);
              setActiveTab('locker');
            }}
            onQuickSellCard={handleQuickSellCard}
            onGoToVault={() => setActiveTab('vault')}
            onGoToMarket={(templateId) => {
              if (templateId) setPreselectedMarketTemplateId(templateId);
              setActiveTab('market');
            }}
          />
        )}

        {activeTab === 'market' && (
          <TransferMarketView
            profileId={profile.id}
            bp={profile.bp}
            vipLevel={vipStatus.level}
            cards={profile.cards}
            serverRules={serverRules}
            initialTemplateId={preselectedMarketTemplateId}
            onBuyCard={handleBuyFromMarket}
            onSellCard={handleSellOnMarket}
            onGoToSquad={() => setActiveTab('squad')}
            onSelectCardForUpgrade={(uid) => {
              setPreselectedUpgradeUid(uid);
              setActiveTab('upgrade');
            }}
          />
        )}

        {activeTab === 'locker' && (
          <LockerRoomView
            cards={profile.cards}
            preselectedCardUid={preselectedLockerUid}
            onEquipMiniface={handleEquipMiniface}
            onGoToVault={() => setActiveTab('vault')}
          />
        )}

        {activeTab === 'shop' && (
          <ShopView
            fc={profile.fc}
            bp={profile.bp}
            starPoints={profile.starPoints ?? 0}
            packs={profile.packs}
            onPurchaseOffer={handlePurchaseShopOffer}
            onGoToVault={() => setActiveTab('vault')}
            onGoToTopUp={() => setActiveTab('vip')}
          />
        )}

        {activeTab === 'vault' && (
          <VaultView
            packs={profile.packs}
            bp={profile.bp}
            onOpenOnePack={handleOpenOnePack}
            onOpenMultiPacks={handleOpenMultiPacks}
            onOpenAllPacks={handleOpenAllPacks}
            onBuyPackWithBp={handleBuyPackWithBp}
            onGoToShop={() => setActiveTab('shop')}
            onGoToFoosball={() => setActiveTab('foosball')}
          />
        )}

        {activeTab === 'upgrade' && (
          <UpgradeView
            cards={profile.cards}
            vipLevel={vipStatus.level}
            bp={profile.bp}
            serverRules={serverRules}
            preselectedTargetId={preselectedUpgradeUid}
            onExecuteUpgrade={handleExecuteUpgrade}
            onQuickBuyFodderBundle={handleQuickBuyFodderBundle}
            onGoToMarket={() => setActiveTab('market')}
          />
        )}

        {activeTab === 'foosball' && (
          <FoosballEventView
            fc={profile.fc}
            bp={profile.bp}
            foosballLoops={profile.foosballLoops ?? 0}
            foosballSpins={profile.foosballSpins ?? 0}
            foosballJackpotFc={profile.foosballJackpotFc ?? 100}
            claimedMilestones={profile.claimedMilestones}
            onPlaySpins={handlePlayFoosballSpins}
            onUseFreeLoop={handleUseFreeFoosballLoops}
            onExchangeBpForLoops={handleExchangeBpForFoosballLoops}
            onClaimMilestone={handleClaimFoosballMilestone}
            onClaimAllMilestones={handleClaimAllFoosballMilestones}
            onGoToTopUp={() => setActiveTab('vip')}
          />
        )}

        {activeTab === 'vip' && (
          <VipTopUpView
            profile={profile}
            canClaimDailySalary={svipDailyClaimDate !== todayDateKey}
            onClaimDailySvipSalary={handleClaimDailySvipSalary}
            onActivateSvipPlan={handleActivateSvipPlan}
            onClaimVipReward={handleClaimVipReward}
            onGoToVault={() => setActiveTab('vault')}
          />
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardView
            rows={combinedLeaderboard}
            onOpenAuthModal={() => setAuthModalOpen(true)}
            onRefreshLeaderboard={() => refreshCrossDeviceHub()}
            isGuest={profile.authMode === 'guest'}
          />
        )}

        {activeTab === 'admin' && (hasAdminAccess || gmSessionUnlocked) && (
          <AdminControlView
            currentAdminProfile={profile}
            cloudLeaderboardRows={cloudLeaderboard}
            serverRules={serverRules}
            onUpdateServerRules={handleUpdateServerRules}
            onSyncActiveProfile={(updated) => {
              profileRef.current = updated;
              setProfile(updated);
            }}
            onSwitchIntoAccount={handleSwitchIntoManagedAccount}
            onReturnToPlay={() => setActiveTab('lobby')}
            onRefreshAccountsCount={() => {
              setSavedAccountsCount(getSavedAccountSummaries().length);
              refreshCrossDeviceHub().catch(() => {});
            }}
          />
        )}
        </div>
      </main>

      {/* Persistent Bottom FC Online Client Dock on Sub-Screens (Vector Icons + Touch Hitboxes) */}
      {!isFixedLobby && (
        <nav
          aria-label="Thanh chuyển nhanh chế độ FC Online PC"
          className="relative z-30 shrink-0 fco-pc-dock fco-chrome-fade px-2 sm:px-5 py-1.5"
        >
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar fco-touch-scroll">
            {subScreenModes.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={(e) => {
                    gameSound.playClick();
                    e.currentTarget.scrollIntoView({
                      behavior: 'smooth',
                      block: 'nearest',
                      inline: 'center',
                    });
                    setActiveTab(tab.id);
                  }}
                  className={`fco-pc-nav-btn min-h-[38px] px-3 sm:px-3.5 py-1.5 rounded-sm text-xs font-black uppercase tracking-wider transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                    active
                      ? 'fco-pc-btn-primary fco-pc-tab-skew shadow-[0_0_16px_rgba(163,230,53,0.35)]'
                      : 'bg-[#0f1728] hover:bg-[#1a253c] text-slate-200 hover:text-white border border-white/10 hover:border-[#a3e635]/60'
                  }`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  <FcoIcon name={tab.icon} className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="text-xs sm:text-[13px] tracking-wide">{tab.label}</span>
                  {tab.countNote && (
                    <span
                      className={`font-mono text-[10px] font-black px-1 py-0.2 rounded tabular-nums ${
                        active
                          ? 'bg-slate-950/20 text-slate-950'
                          : 'bg-[#a3e635]/20 text-[#a3e635] border border-[#a3e635]/40'
                      }`}
                    >
                      {tab.countNote}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* PAUSE MODAL */}
      {shellState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tạm dừng trò chơi"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80"
        >
          <div className="w-full max-w-md max-h-[92%] overflow-y-auto rounded-xl fco-pc-panel-glow border-amber-400/45 p-4 sm:p-6 text-center shadow-2xl">
            <h2
              className="text-2xl sm:text-3xl font-bold italic text-white"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              TẠM DỪNG QUẢN LÝ CLB
            </h2>

            <div className="mt-3 sm:mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="p-2 sm:p-2.5 rounded-lg bg-slate-950 border border-white/10">
                <div className="text-[11px] text-slate-400">CẤP SVIP</div>
                <div className="text-base sm:text-lg font-bold text-amber-400 tabular-nums">
                  SVIP {vipStatus.level}
                </div>
              </div>
              <div className="p-2 sm:p-2.5 rounded-lg bg-slate-950 border border-white/10">
                <div className="text-[11px] text-slate-400">OVR CAO NHẤT</div>
                <div className="text-base sm:text-lg font-bold text-sky-400 tabular-nums">
                  {squadSummary.bestCardOvr}
                </div>
              </div>
              <div className="p-2 sm:p-2.5 rounded-lg bg-slate-950 border border-white/10">
                <div className="text-[11px] text-slate-400">GÓI CHƯA MỞ</div>
                <div className="text-base sm:text-lg font-bold text-emerald-400 tabular-nums">
                  {totalUnopenedPacks}
                </div>
              </div>
            </div>

            <div className="mt-4 sm:mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  gameSound.playClick(1.1);
                  setShellState('playing');
                }}
                className="w-full py-2.5 sm:py-3 rounded-sm fco-pc-btn-primary fco-pc-tab-skew text-sm cursor-pointer"
              >
                Tiếp tục quản lý CLB
              </button>
              <button
                type="button"
                onClick={() => {
                  gameSound.playClick(0.9);
                  setShellState('title');
                }}
                className="w-full py-2 sm:py-2.5 rounded-sm fco-pc-btn-slate text-sm cursor-pointer"
              >
                Về màn hình chính
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUTH MODAL */}
      {authModalOpen && (
        <AuthModal
          currentProfile={profile}
          onAuthenticated={(nextProfile) => {
            profileRef.current = nextProfile;
            setProfile(nextProfile);
            setGmSessionUnlockedState(isGmSessionUnlocked());
            setSavedAccountsCount(getSavedAccountSummaries().length);
          }}
          onOpenAdminConsole={() => setActiveTab('admin')}
          onClose={() => setAuthModalOpen(false)}
        />
      )}

      {/* APK INSTALL MODAL */}
      <ApkInstallModal
        isOpen={showApkModal}
        onClose={() => setShowApkModal(false)}
      />
    </div>
  );
}
