import { PACK_ORDER, PLAYER_TEMPLATE_MAP } from './catalog';
import {
  MAX_CARD_GRADE,
  MAX_SAFE_BP,
  calculateVipStatus,
  computeCardOvr,
  computeCardValueBp,
  createStarterProfile,
  getCumulativePointsForVipLevel,
  isSerializedSeason,
  sanitizeManagerName,
} from './rules';
import {
  GlobalServerRules,
  GmAuditLogEntry,
  ManagerProfile,
  OwnedCard,
  PackId,
  PackInventory,
  ServerBroadcastGift,
} from './types';

export const MASTER_ADMIN_PROFILE_ID = 'gm_master_admin';
export const MASTER_ADMIN_USERNAME = 'admin';
export const MASTER_ADMIN_ALT_USERNAME = 'gm_fconline';
export const MASTER_ADMIN_DEFAULT_PASSWORD = 'admin2026';
export const MASTER_ADMIN_OWNER_EMAIL = 'daipss9789@gmail.com';

const SERVER_RULES_STORAGE_KEY = 'fco_pc_gm_server_rules_v1';
const GM_AUDIT_LOG_STORAGE_KEY = 'fco_pc_gm_audit_log_v1';

export const DEFAULT_GLOBAL_SERVER_RULES: GlobalServerRules = {
  guaranteedUpgrade100: false,
  upgradeRateMultiplier: 1,
  zeroMarketTax: false,
  matchRewardMultiplier: 1,
  serverAnnouncement:
    'CHÍNH THỨC RA MẮT BẢN FULL: Đã reset toàn bộ tài khoản về ban đầu! Mọi HLV bắt đầu đua Top công bằng.',
};

/**
 * Checks whether a given ManagerProfile has Game Master / Super Admin control authority.
 */
export function isMasterAdminAccount(
  profile: ManagerProfile,
  delegatedAdminKeys: string[] = []
): boolean {
  if (profile.id === MASTER_ADMIN_PROFILE_ID) return true;
  if (profile.isDelegatedAdmin) return true;
  const acct = (profile.usernameOrEmail || '').trim().toLowerCase();
  if (
    acct === MASTER_ADMIN_USERNAME ||
    acct === MASTER_ADMIN_ALT_USERNAME ||
    acct === MASTER_ADMIN_OWNER_EMAIL
  ) {
    return true;
  }
  const normalizedSet = new Set(delegatedAdminKeys.map((k) => k.trim().toLowerCase()));
  return normalizedSet.has(acct) || normalizedSet.has(profile.id.toLowerCase());
}

/**
 * Builds the Administrator's playable Game Account ("Quản Trị Viên FC Online")
 * equipped with integrated Game Control authority, SVIP 20, Dream Squad, and competitive Rank telemetry.
 */
export function createMasterAdminProfile(): ManagerProfile {
  const starter = createStarterProfile(
    MASTER_ADMIN_PROFILE_ID,
    'Quản Trị Viên FC Online',
    'local',
    MASTER_ADMIN_USERNAME
  );

  const gmStarIds: Array<{ id: string; grade: number }> = [
    { id: 'le_cr7', grade: 10 },
    { id: 'le_messi', grade: 10 },
    { id: 'le_pele', grade: 10 },
    { id: 'ip_ronaldo', grade: 10 },
    { id: 'le_lecongvinh', grade: 10 },
    { id: 'ip_quanghai', grade: 10 },
    { id: 'le_zidane', grade: 9 },
    { id: 'le_gullit', grade: 9 },
    { id: 'le_vieira', grade: 9 },
    { id: 'le_maldini', grade: 9 },
    { id: 'le_rcarlos', grade: 9 },
    { id: 'le_thuram', grade: 9 },
    { id: 'ip_vandersar', grade: 9 },
    { id: 'ucl26_mbappe', grade: 8 },
    { id: 'ucl26_yamal', grade: 8 },
    { id: 'ucl26_bellingham', grade: 8 },
    { id: 'cu_saliba', grade: 3 },
    { id: 'cu_pedri', grade: 3 },
    { id: 'cu_theo', grade: 3 },
    { id: 'cu_son', grade: 3 },
    { id: 'cu_silva', grade: 3 },
  ];

  const now = Date.now();
  const gmCards: OwnedCard[] = [];
  for (let i = 0; i < gmStarIds.length; i++) {
    const spec = gmStarIds[i];
    const tpl = PLAYER_TEMPLATE_MAP[spec.id];
    if (!tpl) continue;
    gmCards.push({
      uid: `gm_card_${i}_${spec.id}`,
      templateId: tpl.id,
      grade: spec.grade,
      ovr: computeCardOvr(tpl.baseOvr, spec.grade),
      valueBp: computeCardValueBp(tpl.baseValueBp, spec.grade),
      acquiredAt: now - i * 1000,
      // Official Release: Cards owned or opened by Admin account do NOT have serial numbers
    });
  }

  const maxVipPoints = getCumulativePointsForVipLevel(20);
  const gmPacks: PackInventory = {
    iprm_pack: 50,
    le_pack: 50,
    ucl_26: 30,
    vb_26: 30,
    icon_tm: 30,
    toty_26: 25,
    tots_26: 25,
    bdo_pack: 20,
    up_pack: 20,
    ucl_25: 20,
    cu_fodder: 50,
  };

  return {
    ...starter,
    id: MASTER_ADMIN_PROFILE_ID,
    managerName: 'Quản Trị Viên FC Online',
    fc: 999_999_999,
    bp: 5_000_000_000_000_000,
    starPoints: 9_999_999,
    nextCardSerial: 15,
    vipPoints: maxVipPoints,
    vipLevel: 20,
    foosballLoops: 50,
    packs: gmPacks,
    cards: gmCards.length >= 11 ? gmCards : starter.cards,
    formation: '4-3-3',
    activeTeamColorId: 'auto',
    elo: 2350,
    wins: 24,
    draws: 3,
    losses: 2,
    managerXp: 10_800,
    isDelegatedAdmin: true,
    authMode: 'local',
    usernameOrEmail: MASTER_ADMIN_USERNAME,
  };
}

/**
 * Pure GM Mutation 1: Set exact SVIP tier (0 .. 20) on ANY target account.
 */
export function adminSetAccountSvipLevel(
  target: ManagerProfile,
  svipLevel: number
): ManagerProfile {
  const clampedLevel = Math.max(0, Math.min(20, Math.floor(svipLevel)));
  const exactPoints = getCumulativePointsForVipLevel(clampedLevel);
  return {
    ...target,
    vipPoints: exactPoints,
    vipLevel: clampedLevel,
  };
}

/**
 * Pure GM Mutation 2: Set or add raw VIP points on ANY target account and recompute SVIP level.
 */
export function adminAdjustAccountVipPoints(
  target: ManagerProfile,
  amount: number,
  mode: 'set' | 'add' | 'subtract'
): ManagerProfile {
  const safeVal = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
  const nextPoints =
    mode === 'set'
      ? Math.min(100_000_000, safeVal)
      : mode === 'add'
      ? Math.min(100_000_000, target.vipPoints + safeVal)
      : Math.max(0, target.vipPoints - safeVal);
  const vip = calculateVipStatus(nextPoints);
  return {
    ...target,
    vipPoints: vip.totalPoints,
    vipLevel: vip.level,
  };
}

/**
 * Pure GM Mutation 3: Edit FC balance (set, add, subtract) on ANY target account.
 */
export function adminModifyAccountFc(
  target: ManagerProfile,
  amount: number,
  mode: 'set' | 'add' | 'subtract'
): ManagerProfile {
  const safeVal = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
  const nextFc =
    mode === 'set'
      ? Math.min(1_000_000_000, safeVal)
      : mode === 'add'
      ? Math.min(1_000_000_000, target.fc + safeVal)
      : Math.max(0, target.fc - safeVal);
  return {
    ...target,
    fc: nextFc,
  };
}

/**
 * Pure GM Mutation 4: Edit BP balance (set, add, subtract) on ANY target account.
 */
export function adminModifyAccountBp(
  target: ManagerProfile,
  amountBp: number,
  mode: 'set' | 'add' | 'subtract'
): ManagerProfile {
  const safeVal = Math.max(0, Math.floor(Number.isFinite(amountBp) ? amountBp : 0));
  const nextBp =
    mode === 'set'
      ? Math.min(MAX_SAFE_BP, safeVal)
      : mode === 'add'
      ? Math.min(MAX_SAFE_BP, target.bp + safeVal)
      : Math.max(0, target.bp - safeVal);
  return {
    ...target,
    bp: nextBp,
  };
}

/**
 * Pure GM Mutation 5: Edit Star Points / Tarpoi balance (set, add, subtract) on ANY target account.
 */
export function adminModifyAccountTarpoi(
  target: ManagerProfile,
  amount: number,
  mode: 'set' | 'add' | 'subtract'
): ManagerProfile {
  const safeVal = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
  const cur = target.starPoints ?? 0;
  const nextSp =
    mode === 'set'
      ? Math.min(1_000_000_000, safeVal)
      : mode === 'add'
      ? Math.min(1_000_000_000, cur + safeVal)
      : Math.max(0, cur - safeVal);
  return {
    ...target,
    starPoints: nextSp,
  };
}

/**
 * Pure GM Mutation 6: Rename any target manager's display name.
 */
export function adminRenameAccountManager(
  target: ManagerProfile,
  nextName: string
): ManagerProfile {
  return {
    ...target,
    managerName: sanitizeManagerName(nextName),
  };
}

/**
 * Pure GM Mutation 7: Grant any player card at grade +1 ~ +13 directly into a target account's squad.
 */
export function adminGrantPlayerCardToAccount(
  target: ManagerProfile,
  params: {
    templateId: string;
    grade: number;
    customSerial?: number;
  }
): {
  ok: boolean;
  error?: string;
  grantedCard?: OwnedCard;
  nextProfile: ManagerProfile;
} {
  const tpl = PLAYER_TEMPLATE_MAP[params.templateId];
  if (!tpl) {
    return {
      ok: false,
      error: 'Không tìm thấy mẫu cầu thủ cần trao.',
      nextProfile: target,
    };
  }

  const grade = Math.max(1, Math.min(MAX_CARD_GRADE, Math.round(params.grade || 1)));
  let nextCursor = Math.max(1, Math.floor(target.nextCardSerial || 1));
  let assignedSerial: number | undefined;

  if (isSerializedSeason(tpl.season)) {
    if (
      typeof params.customSerial === 'number' &&
      Number.isFinite(params.customSerial) &&
      params.customSerial >= 1
    ) {
      assignedSerial = Math.min(100_000_000, Math.floor(params.customSerial));
      nextCursor = Math.max(nextCursor, assignedSerial + 1);
    } else if (!isMasterAdminAccount(target)) {
      // Only regular non-admin player accounts automatically receive sequential serial numbers
      assignedSerial = nextCursor;
      nextCursor += 1;
    }
  }

  const now = Date.now();
  const grantedCard: OwnedCard = {
    uid: `gm_grant_${now}_${Math.random().toString(36).slice(2, 8)}`,
    templateId: tpl.id,
    grade,
    ovr: computeCardOvr(tpl.baseOvr, grade),
    valueBp: computeCardValueBp(tpl.baseValueBp, grade),
    acquiredAt: now,
    ...(assignedSerial ? { serialNumber: assignedSerial } : {}),
  };

  return {
    ok: true,
    grantedCard,
    nextProfile: {
      ...target,
      nextCardSerial: nextCursor,
      cards: [grantedCard, ...target.cards],
    },
  };
}

/**
 * Pure GM Mutation 8: Directly set enhancement grade (+1 ~ +13) of an existing card inside a target account.
 */
export function adminSetOwnedCardGradeInAccount(
  target: ManagerProfile,
  cardUid: string,
  nextGrade: number
): {
  ok: boolean;
  error?: string;
  nextProfile: ManagerProfile;
} {
  const idx = target.cards.findIndex((c) => c.uid === cardUid);
  if (idx === -1) {
    return {
      ok: false,
      error: 'Không tìm thấy thẻ cầu thủ trong kho CLB mục tiêu.',
      nextProfile: target,
    };
  }

  const card = target.cards[idx];
  const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
  const clampedGrade = Math.max(1, Math.min(MAX_CARD_GRADE, Math.round(nextGrade)));
  const baseOvr = tpl ? tpl.baseOvr : card.ovr;
  const baseVal = tpl ? tpl.baseValueBp : card.valueBp;

  const updatedCard: OwnedCard = {
    ...card,
    grade: clampedGrade,
    ovr: computeCardOvr(baseOvr, clampedGrade),
    valueBp: computeCardValueBp(baseVal, clampedGrade),
  };

  const nextCards = [...target.cards];
  nextCards[idx] = updatedCard;

  return {
    ok: true,
    nextProfile: {
      ...target,
      cards: nextCards,
    },
  };
}

/**
 * Pure GM Mutation 9: Remove/confiscate an owned card from a target account (retaining minimum 11 starters).
 */
export function adminRemoveOwnedCardFromAccount(
  target: ManagerProfile,
  cardUid: string
): {
  ok: boolean;
  error?: string;
  nextProfile: ManagerProfile;
} {
  if (target.cards.length <= 11) {
    return {
      ok: false,
      error: 'CLB cần tối thiểu 11 cầu thủ để duy trì đội hình chính.',
      nextProfile: target,
    };
  }
  if (!target.cards.some((c) => c.uid === cardUid)) {
    return {
      ok: false,
      error: 'Không tìm thấy thẻ cầu thủ cần thu hồi.',
      nextProfile: target,
    };
  }

  return {
    ok: true,
    nextProfile: {
      ...target,
      cards: target.cards.filter((c) => c.uid !== cardUid),
      lineupSlotUids: target.lineupSlotUids
        ? target.lineupSlotUids.filter((u) => u !== cardUid)
        : undefined,
    },
  };
}

/**
 * Pure GM Mutation 10: Grant or set pack quantities in a target account's Vault.
 */
export function adminGrantPacksToAccount(
  target: ManagerProfile,
  packId: PackId,
  count: number,
  mode: 'add' | 'set' = 'add'
): ManagerProfile {
  const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const cur = target.packs[packId] ?? 0;
  const nextQty =
    mode === 'set'
      ? Math.min(100_000, safeCount)
      : Math.min(100_000, cur + safeCount);
  return {
    ...target,
    packs: {
      ...target.packs,
      [packId]: nextQty,
    },
  };
}

/**
 * Pure GM Mutation 11: 1-Click God Preset ("Full SVIP 20 + Full FC + Full BP + Full Gói Thẻ") for any account.
 */
export function adminApplyMaxGodPreset(target: ManagerProfile): ManagerProfile {
  const nextPacks: PackInventory = { ...target.packs };
  for (const pid of PACK_ORDER) {
    nextPacks[pid] = Math.min(100_000, (nextPacks[pid] ?? 0) + 25);
  }
  return {
    ...target,
    fc: Math.max(target.fc, 99_999_999),
    bp: Math.min(MAX_SAFE_BP, Math.max(target.bp, 2_000_000_000_000_000)),
    starPoints: Math.max(target.starPoints ?? 0, 5_000_000),
    vipPoints: getCumulativePointsForVipLevel(20),
    vipLevel: 20,
    foosballLoops: Math.max(target.foosballLoops ?? 0, 50),
    packs: nextPacks,
  };
}

/**
 * Pure GM Mutation 12: Reset a target account cleanly to starter resources while preserving identity.
 */
export function adminResetAccountStarter(target: ManagerProfile): ManagerProfile {
  return createStarterProfile(
    target.id,
    target.managerName,
    target.authMode,
    target.usernameOrEmail
  );
}

/**
 * Pure GM Mutation 13: Broadcast mass server gift to a list of real player profiles.
 */
export function adminApplyGlobalBroadcastGift(
  profiles: ManagerProfile[],
  gift: {
    fcDelta?: number;
    bpDelta?: number;
    tarpoiDelta?: number;
    svipBonusPoints?: number;
    packId?: PackId;
    packCount?: number;
  }
): ManagerProfile[] {
  return profiles.map((p) => {
    let next = { ...p };
    if (gift.fcDelta && gift.fcDelta > 0) {
      next = adminModifyAccountFc(next, gift.fcDelta, 'add');
    }
    if (gift.bpDelta && gift.bpDelta > 0) {
      next = adminModifyAccountBp(next, gift.bpDelta, 'add');
    }
    if (gift.tarpoiDelta && gift.tarpoiDelta > 0) {
      next = adminModifyAccountTarpoi(next, gift.tarpoiDelta, 'add');
    }
    if (gift.svipBonusPoints && gift.svipBonusPoints > 0) {
      next = adminAdjustAccountVipPoints(next, gift.svipBonusPoints, 'add');
    }
    if (gift.packId && gift.packCount && gift.packCount > 0) {
      next = adminGrantPacksToAccount(next, gift.packId, gift.packCount, 'add');
    }
    return next;
  });
}

/**
 * Applies any unclaimed cross-device ServerBroadcastGift entries exactly once per ManagerProfile.
 */
export function applyBroadcastGiftsToProfile(
  profile: ManagerProfile,
  broadcasts: ServerBroadcastGift[]
): {
  changed: boolean;
  claimedCount: number;
  latestGift?: ServerBroadcastGift;
  nextProfile: ManagerProfile;
} {
  if (!Array.isArray(broadcasts) || broadcasts.length === 0) {
    return { changed: false, claimedCount: 0, nextProfile: profile };
  }
  const claimedSet = new Set(profile.claimedBroadcastIds ?? []);
  const unclaimed = broadcasts.filter((b) => b && b.id && !claimedSet.has(b.id));
  if (unclaimed.length === 0) {
    return { changed: false, claimedCount: 0, nextProfile: profile };
  }

  let next = { ...profile };
  for (const gift of unclaimed) {
    next = adminApplyGlobalBroadcastGift([next], {
      fcDelta: gift.fcDelta,
      bpDelta: gift.bpDelta,
      tarpoiDelta: gift.tarpoiDelta,
      svipBonusPoints: gift.svipBonusPoints,
      packId: gift.packId,
      packCount: gift.packCount,
    })[0];
    claimedSet.add(gift.id);
  }

  next = {
    ...next,
    claimedBroadcastIds: Array.from(claimedSet).slice(-50),
  };

  return {
    changed: true,
    claimedCount: unclaimed.length,
    latestGift: unclaimed[0],
    nextProfile: next,
  };
}

/**
 * Global Server Rules Persistence (affects Enhancement %, Market Tax, Match Rewards, and Server Notice).
 */
export function sanitizeGlobalServerRules(
  raw?: Partial<GlobalServerRules> | null
): GlobalServerRules {
  if (!raw) return { ...DEFAULT_GLOBAL_SERVER_RULES };
  const validUpgradeMultipliers: Array<1 | 1.5 | 2 | 3> = [1, 1.5, 2, 3];
  const validMatchMultipliers: Array<1 | 2 | 3> = [1, 2, 3];

  const upMult = validUpgradeMultipliers.includes(
    raw.upgradeRateMultiplier as 1 | 1.5 | 2 | 3
  )
    ? (raw.upgradeRateMultiplier as 1 | 1.5 | 2 | 3)
    : 1;
  const matchMult = validMatchMultipliers.includes(
    raw.matchRewardMultiplier as 1 | 2 | 3
  )
    ? (raw.matchRewardMultiplier as 1 | 2 | 3)
    : 1;

  return {
    guaranteedUpgrade100: Boolean(raw.guaranteedUpgrade100),
    upgradeRateMultiplier: upMult,
    zeroMarketTax: Boolean(raw.zeroMarketTax),
    matchRewardMultiplier: matchMult,
    serverAnnouncement:
      typeof raw.serverAnnouncement === 'string'
        ? raw.serverAnnouncement.trim().slice(0, 140)
        : '',
  };
}

export function loadGlobalServerRules(): GlobalServerRules {
  if (typeof window === 'undefined') return { ...DEFAULT_GLOBAL_SERVER_RULES };
  try {
    const raw = window.localStorage.getItem(SERVER_RULES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GLOBAL_SERVER_RULES };
    return sanitizeGlobalServerRules(JSON.parse(raw) as Partial<GlobalServerRules>);
  } catch {
    return { ...DEFAULT_GLOBAL_SERVER_RULES };
  }
}

export function saveGlobalServerRules(rules: GlobalServerRules): GlobalServerRules {
  const clean = sanitizeGlobalServerRules(rules);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SERVER_RULES_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Ignore storage error
    }
  }
  return clean;
}

export function loadGmAuditLog(): GmAuditLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GM_AUDIT_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GmAuditLogEntry[]).slice(0, 80) : [];
  } catch {
    return [];
  }
}

export function appendGmAuditLog(
  entry: Omit<GmAuditLogEntry, 'id' | 'timestamp'>
): GmAuditLogEntry[] {
  const current = loadGmAuditLog();
  const created: GmAuditLogEntry = {
    ...entry,
    id: `gm_log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  };
  const next = [created, ...current].slice(0, 80);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(GM_AUDIT_LOG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  }
  return next;
}

export function clearGmAuditLog(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(GM_AUDIT_LOG_STORAGE_KEY);
  } catch {
    // Ignore storage error
  }
}
