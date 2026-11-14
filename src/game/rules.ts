import {
  FOOSBALL_MILESTONES,
  PACK_CATALOG,
  PLAYER_TEMPLATES,
  PLAYER_TEMPLATE_MAP,
} from './catalog';
import {
  SHOP_OFFER_MAP,
  ShopOffer,
} from './shopCatalog';
import {
  FoosballSpinReward,
  FormationCode,
  GlobalServerRules,
  LeaderboardCategory,
  LeaderboardRow,
  ManagerProfile,
  MarketPurchaseResult,
  MarketSaleResult,
  MarketSellQuote,
  OwnedCard,
  PackId,
  PackInventory,
  SeasonCode,
  VipLevelStatus,
} from './types';
import {
  buildFormationLineup,
  evaluateSquadTeamColors,
  isValidFormationCode,
} from './tacticsAndTeamColor';

export const MAX_FODDER_COUNT = 5;
export const MAX_CARD_GRADE = 13;
export const BP_PROTECTION_MIN_GRADE = 8;
export const MAX_SAFE_BP = 8_500_000_000_000_000;
export const SERIALIZED_SEASONS: readonly SeasonCode[] = [
  'INFINITY_PRIME',
  'LE',
] as const;

export function isSerializedSeason(season: SeasonCode): boolean {
  return season === 'INFINITY_PRIME' || season === 'LE';
}

export function formatCardSerial(serialNumber?: number): string | null {
  if (
    typeof serialNumber !== 'number' ||
    !Number.isFinite(serialNumber) ||
    serialNumber < 1
  ) {
    return null;
  }
  return String(Math.floor(serialNumber)).padStart(3, '0');
}

/**
 * Checks whether a given ManagerProfile is an Administrator / GM account.
 * Cards opened by an Admin account do NOT assign or consume sequential serial numbers (#0001+).
 */
export function isProfileAdminAccount(
  profile?: ManagerProfile | null,
  delegatedAdminKeys: string[] = []
): boolean {
  if (!profile) return false;
  if (profile.id === 'gm_master_admin_daipss9789') return true;
  if (profile.isDelegatedAdmin) return true;
  const acct = (profile.usernameOrEmail || '').trim().toLowerCase();
  if (
    acct === 'daipss9789@gmail.com' ||
    acct === 'admin' ||
    acct === 'master_admin'
  ) {
    return true;
  }
  if (delegatedAdminKeys.length > 0) {
    const set = new Set(delegatedAdminKeys.map((k) => k.trim().toLowerCase()));
    if (set.has(acct) || set.has(profile.id.toLowerCase())) return true;
  }
  return false;
}
export const ALL_MARKET_GRADES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
] as const;
export const MIN_FOOSBALL_JACKPOT_FC = 100;
export const MAX_FOOSBALL_JACKPOT_FC = 1_000_000;
export const FOOSBALL_JACKPOT_STAGES = [
  100,
  1_000,
  5_000,
  25_000,
  100_000,
  250_000,
  500_000,
  1_000_000,
] as const;

export function clampFoosballJackpotFc(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return MIN_FOOSBALL_JACKPOT_FC;
  }
  return Math.max(
    MIN_FOOSBALL_JACKPOT_FC,
    Math.min(MAX_FOOSBALL_JACKPOT_FC, Math.floor(raw))
  );
}

const GRADE_OVR_BONUS: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 4,
  5: 6,
  6: 8,
  7: 11,
  8: 15,
  9: 19,
  10: 24,
  11: 28,
  12: 32,
  13: 37,
};

const GRADE_VALUE_MULTIPLIER: Record<number, number> = {
  1: 1,
  2: 1.65,
  3: 2.8,
  4: 5,
  5: 9.5,
  6: 18,
  7: 35,
  8: 70,
  9: 135,
  10: 260,
  11: 490,
  12: 920,
  13: 1720,
};

const LEGACY_TEMPLATE_MAP: Record<string, string> = {
  toty_mbappe: 'toty26_mbappe',
  toty_messi: 'bdo_messi',
  toty_ronaldo_cr7: 'toty26_ronaldo_cr7',
  toty_haaland: 'toty26_haaland',
  toty_bellingham: 'toty26_bellingham',
  toty_debruyne: 'tots26_palmer',
  toty_vandijk: 'toty26_vandijk',
  toty_theo: 'cu_theo',
  toty_courtois: 'toty26_courtois',
  ucl_vinicius: 'toty26_vinicius',
  ucl_kane: 'tots26_kane',
  ucl_rodri: 'toty26_rodri',
  ucl_valverde: 'tots26_valverde',
  ucl_yamal: 'tots26_yamal',
  ucl_hakimi: 'ucl25_hakimi',
  ut_son: 'cu_son',
  ut_salah: 'tots26_salah',
  ut_saka: 'tots26_saka',
  dc_kaka: 'ip_kaka',
  dc_modric: 'bdo_modric',
  dc_rudiger: 'ucl25_rudiger',
  dc_fodder_silva: 'cu_silva',
  dc_fodder_saliba: 'cu_saliba',
  dc_fodder_pedri: 'cu_pedri',
  ip_mbappe: 'ucl26_mbappe',
  ip_ramos: 'ip_maldini',
  ip_modric: 'ip_pirlo',
  ip_vinicius: 'ucl26_vinicius',
  ip_benzema: 'bdo_benzema',
  ip_suarez: 'ip_torres',
  ip_debruyne: 'toty26_debruyne',
  ip_vandijk: 'ucl26_saliba',
  ip_courtois: 'ip_vandersar',
  ip_marquinhos: 'ip_puyol',
};

export function computeCardOvr(baseOvr: number, grade: number): number {
  const clamped = Math.max(1, Math.min(MAX_CARD_GRADE, Math.round(grade)));
  return baseOvr + (GRADE_OVR_BONUS[clamped] ?? 0);
}

export function computeCardValueBp(baseValueBp: number, grade: number): number {
  const clamped = Math.max(1, Math.min(MAX_CARD_GRADE, Math.round(grade)));
  const raw = Math.round(baseValueBp * (GRADE_VALUE_MULTIPLIER[clamped] ?? 1));
  return Math.min(8_490_000_000_000_000, raw);
}

/**
 * Seamlessly migrates any previously saved localStorage or Firestore profile
 * from legacy seasons (24TOTY, 24UCL, UT, DC) to the new 2026 seasons
 * (ICON_TM, 26TOTY, 26TOTS, BDO, 25UCL, CU) with updated OVRs and BP values.
 */
export function migrateLegacyProfile(raw: Partial<ManagerProfile> & Record<string, unknown>): ManagerProfile {
  const fallback = createStarterProfile(
    typeof raw.id === 'string' && raw.id ? raw.id : 'guest_default',
    typeof raw.managerName === 'string' ? raw.managerName : 'HLV Khách',
    raw.authMode === 'local' || raw.authMode === 'firebase' ? raw.authMode : 'guest',
    typeof raw.usernameOrEmail === 'string' ? raw.usernameOrEmail : undefined
  );

  const rawPacks = (raw.packs ?? {}) as Record<string, number>;
  const clampQty = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;

  const hasNewKeys =
    'iprm_pack' in rawPacks ||
    'le_pack' in rawPacks ||
    'ucl_26' in rawPacks ||
    'vb_26' in rawPacks ||
    'toty_26' in rawPacks ||
    'tots_26' in rawPacks ||
    'bdo_pack' in rawPacks ||
    'up_pack' in rawPacks ||
    'ucl_25' in rawPacks ||
    'cu_fodder' in rawPacks;

  const migratedPacks: PackInventory = hasNewKeys
    ? {
        iprm_pack: clampQty(rawPacks.iprm_pack ?? 0),
        le_pack: clampQty(rawPacks.le_pack ?? 0),
        ucl_26: clampQty(rawPacks.ucl_26 ?? ('ucl_26' in rawPacks ? 0 : 2)),
        vb_26: clampQty(rawPacks.vb_26 ?? ('vb_26' in rawPacks ? 0 : 2)),
        icon_tm: clampQty(rawPacks.icon_tm),
        toty_26: clampQty(rawPacks.toty_26),
        tots_26: clampQty(rawPacks.tots_26),
        bdo_pack: clampQty(rawPacks.bdo_pack),
        up_pack: clampQty(rawPacks.up_pack ?? ('up_pack' in rawPacks ? 0 : 2)),
        ucl_25: clampQty(rawPacks.ucl_25),
        cu_fodder: clampQty(rawPacks.cu_fodder),
      }
    : {
        iprm_pack: 0,
        le_pack: 0,
        ucl_26: fallback.packs.ucl_26,
        vb_26: fallback.packs.vb_26,
        icon_tm: clampQty(rawPacks.icon_tm ?? fallback.packs.icon_tm),
        toty_26: clampQty(rawPacks.toty_24 ?? fallback.packs.toty_26),
        tots_26: clampQty(rawPacks.ut_24 ?? fallback.packs.tots_26),
        bdo_pack: fallback.packs.bdo_pack,
        up_pack: fallback.packs.up_pack,
        ucl_25: clampQty(rawPacks.ucl_24 ?? fallback.packs.ucl_25),
        cu_fodder: clampQty(rawPacks.fodder_pack ?? fallback.packs.cu_fodder),
      };

  const rawCards = Array.isArray(raw.cards) ? raw.cards : [];
  let fallbackSerialCursor = 1;
  const migratedCards: OwnedCard[] = rawCards
    .map((item, idx) => {
      const mappedId = LEGACY_TEMPLATE_MAP[item.templateId] ?? item.templateId;
      const tpl = PLAYER_TEMPLATE_MAP[mappedId];
      if (!tpl) return null;
      const grade = Math.max(1, Math.min(MAX_CARD_GRADE, Math.round(Number(item.grade) || 1)));
      const rawCustomMf = sanitizeCustomMinifaceValue(item.customMinifaceUrl);
      const finalCustomMf =
        rawCustomMf && (!tpl.altMinifaceUrl && rawCustomMf === tpl.minifaceUrl)
          ? undefined
          : rawCustomMf;
      const rawSerial = Number((item as { serialNumber?: unknown }).serialNumber);
      const cardSerial = isSerializedSeason(tpl.season)
        ? Number.isFinite(rawSerial) && rawSerial >= 1
          ? Math.floor(rawSerial)
          : fallbackSerialCursor++
        : undefined;
      if (cardSerial && cardSerial >= fallbackSerialCursor) {
        fallbackSerialCursor = cardSerial + 1;
      }
      return {
        uid: typeof item.uid === 'string' && item.uid ? item.uid : `mig_${idx}_${tpl.id}`,
        templateId: tpl.id,
        grade,
        ovr: computeCardOvr(tpl.baseOvr, grade),
        valueBp: computeCardValueBp(tpl.baseValueBp, grade),
        acquiredAt: Number(item.acquiredAt) || Date.now() - idx * 500,
        ...(finalCustomMf ? { customMinifaceUrl: finalCustomMf } : {}),
        ...(cardSerial ? { serialNumber: cardSerial } : {}),
      };
    })
    .filter((c): c is OwnedCard => Boolean(c));

  const finalCards = migratedCards.length > 0 ? migratedCards : fallback.cards;
  const maxCardSerial = finalCards.reduce(
    (maxS, c) => (c.serialNumber && c.serialNumber > maxS ? c.serialNumber : maxS),
    0
  );
  const rawNextSerial =
    typeof raw.nextCardSerial === 'number' && Number.isFinite(raw.nextCardSerial)
      ? Math.max(1, Math.floor(raw.nextCardSerial))
      : 1;
  const nextCardSerial = Math.max(rawNextSerial, maxCardSerial + 1);

  const validCardUids = new Set(finalCards.map((c) => c.uid));
  const migratedFormation: FormationCode = isValidFormationCode(raw.formation)
    ? raw.formation
    : '4-3-3';
  const migratedTeamColorId =
    typeof raw.activeTeamColorId === 'string' &&
    /^[a-zA-Z0-9_-]{2,48}$/.test(raw.activeTeamColorId)
      ? raw.activeTeamColorId
      : 'auto';
  const migratedLineupUids = Array.isArray(raw.lineupSlotUids)
    ? raw.lineupSlotUids
        .filter((u): u is string => typeof u === 'string' && validCardUids.has(u))
        .slice(0, 11)
    : undefined;

  const vipPoints = typeof raw.vipPoints === 'number' ? Math.max(0, Math.floor(raw.vipPoints)) : fallback.vipPoints;
  const starPoints =
    typeof raw.starPoints === 'number' && Number.isFinite(raw.starPoints)
      ? Math.max(0, Math.min(1_000_000_000, Math.floor(raw.starPoints)))
      : fallback.starPoints;

  const elo =
    typeof raw.elo === 'number' && Number.isFinite(raw.elo)
      ? Math.max(1000, Math.min(10_000, Math.floor(raw.elo)))
      : fallback.elo ?? 2050;
  const wins =
    typeof raw.wins === 'number' && Number.isFinite(raw.wins)
      ? Math.max(0, Math.min(1_000_000, Math.floor(raw.wins)))
      : fallback.wins ?? 14;
  const draws =
    typeof raw.draws === 'number' && Number.isFinite(raw.draws)
      ? Math.max(0, Math.min(1_000_000, Math.floor(raw.draws)))
      : fallback.draws ?? 3;
  const losses =
    typeof raw.losses === 'number' && Number.isFinite(raw.losses)
      ? Math.max(0, Math.min(1_000_000, Math.floor(raw.losses)))
      : fallback.losses ?? 4;
  const managerXp =
    typeof raw.managerXp === 'number' && Number.isFinite(raw.managerXp)
      ? Math.max(0, Math.min(100_000_000, Math.floor(raw.managerXp)))
      : fallback.managerXp ?? 7350;
  const claimedBroadcastIds = Array.isArray(raw.claimedBroadcastIds)
    ? raw.claimedBroadcastIds
        .filter(
          (id): id is string =>
            typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
        )
        .slice(-50)
    : [];
  const adminRevision =
    typeof raw.adminRevision === 'number' && Number.isFinite(raw.adminRevision)
      ? Math.max(0, Math.floor(raw.adminRevision))
      : undefined;
  const deviceLabel =
    typeof raw.deviceLabel === 'string' && raw.deviceLabel.trim().length >= 2
      ? raw.deviceLabel.trim().slice(0, 40)
      : undefined;

  const computedSquadOvr = calculateProfileSquadOvr({
    cards: finalCards,
    formation: migratedFormation,
    activeTeamColorId: migratedTeamColorId,
    lineupSlotUids: migratedLineupUids,
  });

  return {
    id: fallback.id,
    managerName: sanitizeManagerName(fallback.managerName),
    fc: typeof raw.fc === 'number' ? Math.max(0, Math.floor(raw.fc)) : fallback.fc,
    bp: typeof raw.bp === 'number' ? Math.max(0, Math.floor(raw.bp)) : fallback.bp,
    starPoints,
    nextCardSerial,
    vipPoints,
    vipLevel: calculateVipStatus(vipPoints).level,
    foosballLoops:
      typeof raw.foosballLoops === 'number' && Number.isFinite(raw.foosballLoops)
        ? Math.max(0, Math.min(1_000_000, Math.floor(raw.foosballLoops)))
        : fallback.foosballLoops,
    foosballSpins:
      typeof raw.foosballSpins === 'number'
        ? Math.max(0, Math.floor(raw.foosballSpins))
        : fallback.foosballSpins,
    foosballJackpotFc: clampFoosballJackpotFc(raw.foosballJackpotFc),
    packs: migratedPacks,
    claimedMilestones: Array.isArray(raw.claimedMilestones)
      ? raw.claimedMilestones.map(Number).filter(Number.isFinite)
      : [],
    claimedVipRewards: Array.isArray(raw.claimedVipRewards)
      ? raw.claimedVipRewards.map(Number).filter(Number.isFinite)
      : [],
    cards: finalCards,
    formation: migratedFormation,
    activeTeamColorId: migratedTeamColorId,
    ...(migratedLineupUids && migratedLineupUids.length > 0
      ? { lineupSlotUids: migratedLineupUids }
      : {}),
    elo,
    wins,
    draws,
    losses,
    managerXp,
    squadOvr: computedSquadOvr,
    ...(claimedBroadcastIds.length > 0 ? { claimedBroadcastIds } : {}),
    ...(typeof adminRevision === 'number' ? { adminRevision } : {}),
    ...(raw.isDelegatedAdmin ? { isDelegatedAdmin: true } : {}),
    ...(raw.isBanned ? { isBanned: true } : {}),
    ...(typeof raw.banReason === 'string' && raw.banReason.trim()
      ? { banReason: raw.banReason.trim().slice(0, 100) }
      : {}),
    ...(deviceLabel ? { deviceLabel } : {}),
    authMode: fallback.authMode,
    usernameOrEmail: fallback.usernameOrEmail,
  };
}

/**
 * Exact VIP cumulative point curve requested by user:
 * - VIP 1 -> 5: 50 points each (50, 100, 150, 200, 250)
 * - VIP 5 -> 10: 200 points each (450, 650, 850, 1050, 1250)
 * - VIP 10 -> 20: 1000 points each (2250 ... 11250)
 */
export function getCumulativePointsForVipLevel(level: number): number {
  if (level <= 0) return 0;
  if (level <= 5) return level * 50;
  if (level <= 10) return 250 + (level - 5) * 200;
  const clamped = Math.min(20, level);
  return 1250 + (clamped - 10) * 1000;
}

export function calculateVipStatus(rawPoints: number): VipLevelStatus {
  const totalPoints = Math.max(0, Math.floor(rawPoints));
  let level = 0;
  for (let candidate = 1; candidate <= 20; candidate++) {
    if (totalPoints >= getCumulativePointsForVipLevel(candidate)) {
      level = candidate;
    } else {
      break;
    }
  }

  if (level >= 20) {
    const maxPts = getCumulativePointsForVipLevel(20);
    return {
      level: 20,
      totalPoints,
      currentStepPoints: totalPoints - getCumulativePointsForVipLevel(19),
      requiredStepPoints: 1000,
      nextLevelTotalPoints: maxPts,
      progressPercent: 100,
      isMaxVip: true,
    };
  }

  const currentFloor = getCumulativePointsForVipLevel(level);
  const nextFloor = getCumulativePointsForVipLevel(level + 1);
  const requiredStepPoints = nextFloor - currentFloor;
  const currentStepPoints = totalPoints - currentFloor;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((currentStepPoints / requiredStepPoints) * 100))
  );

  return {
    level,
    totalPoints,
    currentStepPoints,
    requiredStepPoints,
    nextLevelTotalPoints: nextFloor,
    progressPercent,
    isMaxVip: false,
  };
}

export function getMarketTaxDiscountRate(vipLevel: number): number {
  const clampedVip = Math.max(0, Math.min(20, Math.floor(vipLevel)));
  return Math.min(0.3, clampedVip * 0.015);
}

export function getVipEnhancementBoostPercent(vipLevel: number): number {
  const clampedVip = Math.max(0, Math.min(20, Math.floor(vipLevel)));
  return Number(Math.min(10, clampedVip * 0.5).toFixed(1));
}

/**
 * Exact Top-Up conversion requested by user:
 * - 1,000 VND = 10 VIP points (+ 10 FC)
 * - 40,000 VND -> 1 Foosball event loop
 * - 100,000 VND -> 3 Foosball event loops
 * - 150,000 VND -> 4 Foosball event loops
 */
export function calculateTopUpRewards(amountVnd: number): {
  fcEarned: number;
  vipPointsEarned: number;
  bonusFoosballLoops: number;
  bonusStarPoints: number;
} {
  const normalizedThousands = Math.max(0, Math.floor(amountVnd / 1000));
  const vipPointsEarned = normalizedThousands * 10;
  const fcEarned = normalizedThousands * 10;
  const bonusStarPoints = Math.floor(fcEarned * 0.25);

  let bonusFoosballLoops = 0;
  if (amountVnd === 40_000) {
    bonusFoosballLoops = 1;
  } else if (amountVnd === 100_000) {
    bonusFoosballLoops = 3;
  } else if (amountVnd === 150_000) {
    bonusFoosballLoops = 4;
  } else if (amountVnd === 500_000) {
    bonusFoosballLoops = 14;
  } else if (amountVnd === 1_000_000) {
    bonusFoosballLoops = 30;
  } else if (amountVnd >= 150_000) {
    bonusFoosballLoops = Math.floor(amountVnd / 150_000) * 4;
  } else if (amountVnd >= 100_000) {
    bonusFoosballLoops = 3;
  } else if (amountVnd >= 40_000) {
    bonusFoosballLoops = 1;
  }

  return {
    fcEarned,
    vipPointsEarned,
    bonusFoosballLoops,
    bonusStarPoints,
  };
}

/**
 * Exact Foosball Spin FC pricing requested by user:
 * - 1 spin = 20 FC
 * - 10 spins = 190 FC
 * - 100 spins = 900 FC
 */
export function getFoosballSpinCost(spinCount: 1 | 10 | 100): number {
  if (spinCount === 1) return 20;
  if (spinCount === 10) return 190;
  return 900;
}

export function rollSingleFoosballGoal(rng: () => number = Math.random): FoosballSpinReward {
  const r = rng();
  // Normal Foosball spins NEVER drop INFINITY_PRIME or LE (exclusive to Milestone 10,000 points!)
  if (r < 0.08) {
    return {
      slotIndex: 2,
      slotLabel: 'Khung Thành Vàng: Gói ICON TM',
      packId: 'icon_tm',
      packCount: 1,
      bpEarned: 110_000_000_000,
    };
  }
  if (r < 0.19) {
    return {
      slotIndex: 2,
      slotLabel: 'Khung Thành C1: Gói 26UCL (2026–2027)',
      packId: 'ucl_26',
      packCount: 1,
      bpEarned: 95_000_000_000,
    };
  }
  if (r < 0.32) {
    return {
      slotIndex: 1,
      slotLabel: 'Góc Chữ A: Gói 26TOTY',
      packId: 'toty_26',
      packCount: 1,
      bpEarned: 45_000_000_000,
    };
  }
  if (r < 0.49) {
    return {
      slotIndex: 3,
      slotLabel: 'Góc Cao: Gói 26TOTS',
      packId: 'tots_26',
      packCount: 1,
      bpEarned: 32_000_000_000,
    };
  }
  if (r < 0.62) {
    return {
      slotIndex: 3,
      slotLabel: 'Khung Thành Sao Vàng: Gói 26 Vietnam Best',
      packId: 'vb_26',
      packCount: 1,
      bpEarned: 28_000_000_000,
    };
  }
  if (r < 0.74) {
    return {
      slotIndex: 0,
      slotLabel: 'Cột Dọc Trái: Gói Ballon d’Or',
      packId: 'bdo_pack',
      packCount: 1,
      bpEarned: 24_000_000_000,
    };
  }
  if (r < 0.87) {
    return {
      slotIndex: 1,
      slotLabel: 'Góc Thấp: Gói Unsung Players (UP)',
      packId: 'up_pack',
      packCount: 1,
      bpEarned: 22_000_000_000,
    };
  }
  return {
    slotIndex: 4,
    slotLabel: 'Cột Dọc Phải: Gói CU Phôi Cao Cấp',
    packId: 'cu_fodder',
    packCount: 1,
    bpEarned: 20_000_000_000,
  };
}

/**
 * Progressive Special Jackpot (Giải Đặc Biệt Bi Lắc):
 * Starts at 100 FC and increases on every non-jackpot spin up to 1,000,000 FC.
 * Awards the accumulated FC pot + 1 ICON_TM pack (IPRM & LE remain strictly exclusive to Milestone 10,000!).
 */
export function advanceFoosballJackpotStep(currentPotFc: number): number {
  const clamped = clampFoosballJackpotFc(currentPotFc);
  return Math.min(MAX_FOOSBALL_JACKPOT_FC, Math.round(clamped * 1.045 + 160));
}

export interface FoosballJackpotBatchResult {
  rewards: FoosballSpinReward[];
  nextJackpotFc: number;
  totalJackpotFcWon: number;
  jackpotHits: number;
}

export function executeFoosballSpinsWithJackpot(
  spinCount: number,
  initialPotFc: number,
  rng: () => number = Math.random
): FoosballJackpotBatchResult {
  let pot = clampFoosballJackpotFc(initialPotFc);
  let totalJackpotFcWon = 0;
  let jackpotHits = 0;
  const rewards: FoosballSpinReward[] = [];
  const count = Math.max(1, Math.floor(spinCount));

  for (let i = 0; i < count; i++) {
    const guaranteedJackpot = pot >= MAX_FOOSBALL_JACKPOT_FC;
    const jackpotRoll = rng();
    if (guaranteedJackpot || jackpotRoll < 0.008) {
      const wonFc = pot;
      totalJackpotFcWon += wonFc;
      jackpotHits += 1;
      rewards.push({
        slotIndex: 2,
        slotLabel: `GIẢI ĐẶC BIỆT: +${wonFc.toLocaleString('vi-VN')} FC & Gói ICON TM`,
        packId: 'icon_tm',
        packCount: 1,
        bpEarned: 150_000_000_000,
        jackpotWonFc: wonFc,
      });
      pot = MIN_FOOSBALL_JACKPOT_FC;
    } else {
      rewards.push(rollSingleFoosballGoal(rng));
      pot = advanceFoosballJackpotStep(pot);
    }
  }

  return {
    rewards,
    nextJackpotFc: pot,
    totalJackpotFcWon,
    jackpotHits,
  };
}

export function getUnclaimedReachedMilestones(
  totalSpins: number,
  claimedMilestones: number[]
): number[] {
  const claimedSet = new Set(claimedMilestones);
  return FOOSBALL_MILESTONES.filter(
    (m) => totalSpins >= m.spins && !claimedSet.has(m.spins)
  ).map((m) => m.spins);
}

export function claimFoosballMilestoneReward(
  profile: ManagerProfile,
  milestoneSpins: number
): {
  ok: boolean;
  error?: string;
  nextProfile: ManagerProfile;
} {
  const milestone = FOOSBALL_MILESTONES.find((m) => m.spins === milestoneSpins);
  if (!milestone) {
    return { ok: false, error: 'Mốc điểm Bi Lắc không tồn tại.', nextProfile: profile };
  }
  if (profile.foosballSpins < milestone.spins) {
    return {
      ok: false,
      error: `Chưa đạt mốc ${milestone.spins.toLocaleString('vi-VN')} điểm Bi Lắc.`,
      nextProfile: profile,
    };
  }
  if (profile.claimedMilestones.includes(milestone.spins)) {
    return { ok: false, error: 'Mốc thưởng này đã được nhận.', nextProfile: profile };
  }
  const nextPacks: PackInventory = { ...profile.packs };
  if (milestone.rewardPackId && milestone.rewardPackCount) {
    nextPacks[milestone.rewardPackId] = Math.min(
      100_000,
      (nextPacks[milestone.rewardPackId] ?? 0) + milestone.rewardPackCount
    );
  }
  if (milestone.bonusPackId && milestone.bonusPackCount) {
    nextPacks[milestone.bonusPackId] = Math.min(
      100_000,
      (nextPacks[milestone.bonusPackId] ?? 0) + milestone.bonusPackCount
    );
  }
  return {
    ok: true,
    nextProfile: {
      ...profile,
      bp: Math.min(MAX_SAFE_BP, profile.bp + milestone.rewardBp),
      fc: Math.min(1_000_000_000, profile.fc + (milestone.rewardFc ?? 0)),
      foosballLoops: Math.min(1_000_000, (profile.foosballLoops ?? 0) + (milestone.rewardLoops ?? 0)),
      packs: nextPacks,
      claimedMilestones: [...profile.claimedMilestones, milestone.spins],
    },
  };
}

export function getFoosballLoopBpCost(loopsToBuy: 1 | 10 | 100): number {
  if (loopsToBuy === 1) return 2_500_000_000_000;
  if (loopsToBuy === 10) return 22_000_000_000_000;
  return 200_000_000_000_000;
}

export function exchangeBpForFoosballLoops(
  profile: ManagerProfile,
  loopsToBuy: 1 | 10 | 100
): {
  ok: boolean;
  error?: string;
  costBp: number;
  nextProfile: ManagerProfile;
} {
  const costBp = getFoosballLoopBpCost(loopsToBuy);
  if (profile.bp < costBp) {
    return {
      ok: false,
      error: `Không đủ BP để đổi ${loopsToBuy} Vòng Bi Lắc (cần ${formatBpCompact(costBp)}).`,
      costBp,
      nextProfile: profile,
    };
  }
  return {
    ok: true,
    costBp,
    nextProfile: {
      ...profile,
      bp: profile.bp - costBp,
      foosballLoops: Math.min(1_000_000, profile.foosballLoops + loopsToBuy),
    },
  };
}

/**
 * FC Online Card Enhancement (Đập Thẻ) Gauge & Chance Calculation
 * - Requires 1..5 fodder cards (`chọn 5 con phôi hoặc ít hơn`)
 */
const BASE_MAX_SUCCESS_BY_NEXT_GRADE: Record<number, number> = {
  2: 88,
  3: 76,
  4: 64,
  5: 50,
  6: 38,
  7: 27,
  8: 18,
  9: 12,
  10: 8,
  11: 5.5,
  12: 3.8,
  13: 2.5,
};

export interface EnhancementPreview {
  valid: boolean;
  nextGrade: number;
  gaugeBars: number; // 0 to 5
  gaugePercent: number; // 0 to 100
  baseSuccessChance: number;
  vipBonusChance: number;
  totalSuccessChance: number;
  projectedOvr: number;
  projectedValueBp: number;
}

export function estimateFodderGaugeContribution(
  targetOvr: number,
  fodderOvr: number
): { bars: number; percent: number } {
  const requiredPerSlotOvr = Math.max(108, targetOvr - 10);
  const delta = fodderOvr - requiredPerSlotOvr;
  const bars = Number(Math.max(0.32, Math.min(1.35, 1 + delta * 0.08)).toFixed(2));
  const percent = Math.round((bars / MAX_FODDER_COUNT) * 100);
  return { bars, percent };
}

export function calculateEnhancementPreview(
  targetCard: OwnedCard,
  fodderCards: OwnedCard[],
  vipLevel: number = 0,
  serverRules?: GlobalServerRules
): EnhancementPreview {
  const template = PLAYER_TEMPLATE_MAP[targetCard.templateId];
  const baseOvr = template ? template.baseOvr : targetCard.ovr;
  const baseValueBp = template ? template.baseValueBp : targetCard.valueBp;

  if (
    targetCard.grade >= MAX_CARD_GRADE ||
    fodderCards.length < 1 ||
    fodderCards.length > MAX_FODDER_COUNT ||
    fodderCards.some((f) => f.uid === targetCard.uid)
  ) {
    return {
      valid: false,
      nextGrade: Math.min(MAX_CARD_GRADE, targetCard.grade + 1),
      gaugeBars: 0,
      gaugePercent: 0,
      baseSuccessChance: 0,
      vipBonusChance: 0,
      totalSuccessChance: 0,
      projectedOvr: targetCard.ovr,
      projectedValueBp: targetCard.valueBp,
    };
  }

  const nextGrade = targetCard.grade + 1;
  // Calibrated for 2026 FC Online OVR 111–125+ meta so CU (111–114) & 25UCL (114–117) fill gauge realistically
  let rawGaugeUnits = 0;
  for (const fodder of fodderCards) {
    rawGaugeUnits += estimateFodderGaugeContribution(targetCard.ovr, fodder.ovr).bars;
  }

  const gaugePercent = Math.min(100, Math.round((rawGaugeUnits / 5) * 100));
  const gaugeBars = Math.min(5, Math.max(1, Math.round((gaugePercent / 100) * 5)));

  const maxRate = BASE_MAX_SUCCESS_BY_NEXT_GRADE[nextGrade] ?? 10;
  const rateMultiplier = serverRules?.upgradeRateMultiplier ?? 1;
  const baseSuccessChance = Number(
    (((maxRate * gaugePercent) / 100) * rateMultiplier).toFixed(1)
  );
  const vipBonusChance = Number(Math.min(10, vipLevel * 0.5).toFixed(1));
  const totalSuccessChance = serverRules?.guaranteedUpgrade100
    ? 100
    : Number(
        Math.min(
          rateMultiplier > 1 ? 99 : 96,
          baseSuccessChance + vipBonusChance
        ).toFixed(1)
      );

  return {
    valid: true,
    nextGrade,
    gaugeBars,
    gaugePercent,
    baseSuccessChance,
    vipBonusChance,
    totalSuccessChance,
    projectedOvr: computeCardOvr(baseOvr, nextGrade),
    projectedValueBp: computeCardValueBp(baseValueBp, nextGrade),
  };
}

export function canUseBpProtection(card: OwnedCard): boolean {
  return card.grade >= BP_PROTECTION_MIN_GRADE && card.grade < MAX_CARD_GRADE;
}

const BP_PROTECTION_RATE_BY_GRADE: Record<number, number> = {
  8: 0.12,
  9: 0.15,
  10: 0.18,
  11: 0.22,
  12: 0.26,
};

export function calculateBpProtectionCost(card: OwnedCard): number {
  if (!canUseBpProtection(card)) return 0;
  const rate = BP_PROTECTION_RATE_BY_GRADE[card.grade] ?? 0.2;
  return Math.max(
    5_000_000_000,
    Math.min(MAX_SAFE_BP, Math.round(card.valueBp * rate))
  );
}

export interface EnhancementOutcome {
  succeeded: boolean;
  previousGrade: number;
  newGrade: number;
  newOvr: number;
  newValueBp: number;
  rhythmSweetSpot: boolean;
  effectiveChance: number;
  usedBpProtection: boolean;
  protectionCostBp: number;
  updatedCard: OwnedCard;
}

export function resolveCardEnhancement(
  targetCard: OwnedCard,
  fodderCards: OwnedCard[],
  vipLevel: number,
  normalizedRhythmOffset: number,
  rng: () => number = Math.random,
  useBpProtection: boolean = false,
  serverRules?: GlobalServerRules
): EnhancementOutcome {
  const preview = calculateEnhancementPreview(
    targetCard,
    fodderCards,
    vipLevel,
    serverRules
  );
  if (!preview.valid) {
    throw new Error('Invalid enhancement selection: requires 1 to 5 distinct fodder cards.');
  }

  const template = PLAYER_TEMPLATE_MAP[targetCard.templateId];
  const baseOvr = template ? template.baseOvr : targetCard.ovr;
  const baseValueBp = template ? template.baseValueBp : targetCard.valueBp;

  const protectedActive = Boolean(useBpProtection && canUseBpProtection(targetCard));
  const protectionCostBp = protectedActive ? calculateBpProtectionCost(targetCard) : 0;

  const rhythmSweetSpot = Math.abs(normalizedRhythmOffset) <= 0.25;
  const rhythmBonus = rhythmSweetSpot ? 5 : 0;
  const effectiveChance = serverRules?.guaranteedUpgrade100
    ? 100
    : Math.min(
        (serverRules?.upgradeRateMultiplier ?? 1) > 1 ? 99.5 : 98,
        preview.totalSuccessChance + rhythmBonus
      );

  const roll = rng() * 100;
  const succeeded = serverRules?.guaranteedUpgrade100 ? true : roll < effectiveChance;

  let newGrade = targetCard.grade;
  if (succeeded) {
    newGrade = Math.min(MAX_CARD_GRADE, targetCard.grade + 1);
  } else if (targetCard.grade <= 1 || protectedActive) {
    newGrade = targetCard.grade;
  } else {
    // Random drop to any lower grade in [1 .. targetCard.grade - 1]
    const clampedDropRoll = Math.min(0.999999, Math.max(0, rng()));
    newGrade = 1 + Math.floor(clampedDropRoll * (targetCard.grade - 1));
  }

  const newOvr = computeCardOvr(baseOvr, newGrade);
  const newValueBp = computeCardValueBp(baseValueBp, newGrade);

  return {
    succeeded,
    previousGrade: targetCard.grade,
    newGrade,
    newOvr,
    newValueBp,
    rhythmSweetSpot,
    effectiveChance,
    usedBpProtection: protectedActive,
    protectionCostBp,
    updatedCard: {
      ...targetCard,
      grade: newGrade,
      ovr: newOvr,
      valueBp: newValueBp,
    },
  };
}

const LOCAL_MINIFACE_REGEX = /^\/minifaces\/[a-zA-Z0-9_-]+\.png$/;
const DATA_URL_MINIFACE_REGEX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_CUSTOM_MINIFACE_LENGTH = 160_000;

export function sanitizeCustomMinifaceValue(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length < 14 || trimmed.length > MAX_CUSTOM_MINIFACE_LENGTH) {
    return undefined;
  }
  if (trimmed.length <= 128 && LOCAL_MINIFACE_REGEX.test(trimmed)) {
    if (trimmed.startsWith('/minifaces/vb26_') && trimmed.endsWith('_alt.png')) {
      return trimmed.replace('_alt.png', '.png');
    }
    return trimmed;
  }
  if (DATA_URL_MINIFACE_REGEX.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

export function equipCardMiniface(
  cards: OwnedCard[],
  cardUid: string,
  minifaceUrl?: string
): OwnedCard[] {
  const cleanUrl = sanitizeCustomMinifaceValue(minifaceUrl);

  return cards.map((card) => {
    if (card.uid !== cardUid) return card;
    const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
    // If resetting or picking the default primary miniface of a non-2MF card, clear override
    if (!cleanUrl || (tpl && !tpl.altMinifaceUrl && cleanUrl === tpl.minifaceUrl)) {
      const next = { ...card };
      delete next.customMinifaceUrl;
      return next;
    }
    return {
      ...card,
      customMinifaceUrl: cleanUrl,
    };
  });
}

export function drawCardFromPack(
  packId: PackId,
  rng: () => number = Math.random,
  idSuffix?: string,
  serialAllocator?: () => number
): OwnedCard {
  const pack = PACK_CATALOG[packId];
  const candidates = PLAYER_TEMPLATES.filter(
    (t) =>
      pack.allowedSeasons.includes(t.season) &&
      t.baseOvr >= pack.minOvr &&
      t.baseOvr <= pack.maxOvr
  );
  const pool = candidates.length > 0 ? candidates : PLAYER_TEMPLATES;
  const chosen = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];

  const gradeSpan = Math.max(0, pack.maxInitialGrade - pack.guaranteedMinGrade);
  const gradeRoll = rng();
  const extraGrade = gradeRoll > 0.85 ? gradeSpan : gradeRoll > 0.55 ? Math.min(1, gradeSpan) : 0;
  const grade = Math.min(MAX_CARD_GRADE, pack.guaranteedMinGrade + extraGrade);

  const ovr = computeCardOvr(chosen.baseOvr, grade);
  const valueBp = computeCardValueBp(chosen.baseValueBp, grade);
  const allocatedSerial =
    isSerializedSeason(chosen.season) && serialAllocator
      ? Math.max(1, Math.floor(serialAllocator()))
      : undefined;

  return {
    uid: `card_${Date.now()}_${idSuffix ?? Math.floor(rng() * 1_000_000)}`,
    templateId: chosen.id,
    grade,
    ovr,
    valueBp,
    acquiredAt: Date.now(),
    ...(allocatedSerial ? { serialNumber: allocatedSerial } : {}),
  };
}

export function openPacksFromProfile(
  profile: ManagerProfile,
  packId: PackId,
  maxCount: number = 1,
  rng: () => number = Math.random,
  delegatedAdminKeys: string[] = []
): { drawnCards: OwnedCard[]; nextProfile: ManagerProfile } {
  const currentQty = profile.packs[packId] ?? 0;
  if (currentQty < 1 || maxCount < 1) {
    return { drawnCards: [], nextProfile: profile };
  }
  const toOpen = Math.min(currentQty, Math.min(50, Math.floor(maxCount)));
  const isAdmin = isProfileAdminAccount(profile, delegatedAdminKeys);
  let nextSerial = Math.max(1, Math.floor(profile.nextCardSerial || 1));

  // Regular players allocate sequential serial numbers (#0001+) for INFINITY_PRIME and LE.
  // Cards opened by an Admin account do NOT assign or consume serial numbers on cards!
  const serialAllocator = isAdmin ? undefined : () => nextSerial++;

  const drawnCards = Array.from({ length: toOpen }, (_, i) =>
    drawCardFromPack(
      packId,
      rng,
      `open_${i}_${isAdmin ? 'adm_' + Date.now() + '_' + i : nextSerial}`,
      serialAllocator
    )
  );

  return {
    drawnCards,
    nextProfile: {
      ...profile,
      nextCardSerial: isAdmin ? profile.nextCardSerial : nextSerial,
      packs: {
        ...profile.packs,
        [packId]: currentQty - toOpen,
      },
      cards: [...drawnCards, ...profile.cards],
    },
  };
}

export interface ShopPurchaseResult {
  ok: boolean;
  error?: string;
  offer?: ShopOffer;
  bpReceived: number;
  starPointsReceived: number;
  packsAdded: number;
  loopsAdded: number;
  nextProfile: ManagerProfile;
}

export function purchaseShopOffer(
  profile: ManagerProfile,
  offerId: string,
  rng: () => number = Math.random
): ShopPurchaseResult {
  const offer = SHOP_OFFER_MAP[offerId];
  if (!offer) {
    return {
      ok: false,
      error: 'Không tìm thấy gói vật phẩm trong Cửa Hàng FC Online.',
      bpReceived: 0,
      starPointsReceived: 0,
      packsAdded: 0,
      loopsAdded: 0,
      nextProfile: profile,
    };
  }

  if (offer.currency === 'fc' && profile.fc < offer.cost) {
    return {
      ok: false,
      error: `Không đủ FC để mua "${offer.title}" (cần ${offer.cost.toLocaleString('vi-VN')} FC). Hãy nhận thêm FC tại Đặc Quyền SVIP hoặc Điểm Danh CLB!`,
      bpReceived: 0,
      starPointsReceived: 0,
      packsAdded: 0,
      loopsAdded: 0,
      nextProfile: profile,
    };
  }
  if (offer.currency === 'bp' && profile.bp < offer.cost) {
    return {
      ok: false,
      error: `Không đủ BP để đổi "${offer.title}" (cần ${formatBpCompact(offer.cost)}).`,
      bpReceived: 0,
      starPointsReceived: 0,
      packsAdded: 0,
      loopsAdded: 0,
      nextProfile: profile,
    };
  }
  if (offer.currency === 'tarpoi' && profile.starPoints < offer.cost) {
    return {
      ok: false,
      error: `Không đủ Điểm Sao Tarpoi để đổi "${offer.title}" (cần ${offer.cost.toLocaleString('vi-VN')} Tarpoi).`,
      bpReceived: 0,
      starPointsReceived: 0,
      packsAdded: 0,
      loopsAdded: 0,
      nextProfile: profile,
    };
  }

  let bpReceived = offer.bpGranted;
  if (offer.bpLuckyMax && offer.bpLuckyMax > offer.bpGranted) {
    const r = Math.min(0.999999, Math.max(0, rng()));
    const minT = Math.round(offer.bpGranted / 1_000_000_000_000);
    const maxT = Math.round(offer.bpLuckyMax / 1_000_000_000_000);
    bpReceived = (minT + Math.floor(r * (maxT - minT + 1))) * 1_000_000_000_000;
  }

  const nextPacks: PackInventory = { ...profile.packs };
  let packsAdded = 0;
  for (const grant of offer.packsGranted) {
    nextPacks[grant.packId] = Math.min(100_000, (nextPacks[grant.packId] ?? 0) + grant.count);
    packsAdded += grant.count;
  }

  const nextFc = offer.currency === 'fc' ? Math.max(0, profile.fc - offer.cost) : profile.fc;
  const baseBpAfterCost =
    offer.currency === 'bp' ? Math.max(0, profile.bp - offer.cost) : profile.bp;
  const nextBp = Math.min(MAX_SAFE_BP, baseBpAfterCost + bpReceived);
  const baseTarpoiAfterCost =
    offer.currency === 'tarpoi'
      ? Math.max(0, profile.starPoints - offer.cost)
      : profile.starPoints;
  const nextStarPoints = Math.min(
    1_000_000_000,
    baseTarpoiAfterCost + offer.starPointsGranted
  );

  return {
    ok: true,
    offer,
    bpReceived,
    starPointsReceived: offer.starPointsGranted,
    packsAdded,
    loopsAdded: offer.foosballLoopsGranted,
    nextProfile: {
      ...profile,
      fc: nextFc,
      bp: nextBp,
      starPoints: nextStarPoints,
      foosballLoops: profile.foosballLoops + offer.foosballLoopsGranted,
      packs: nextPacks,
    },
  };
}

export function calculateSquadSummary(cards: OwnedCard[]): {
  squadValue: number;
  totalSalary: number;
  bestCardOvr: number;
  bestCardName: string;
  bestCardSeason: string;
  bestCardGrade: number;
  bestCard: OwnedCard | null;
} {
  if (cards.length === 0) {
    return {
      squadValue: 0,
      totalSalary: 0,
      bestCardOvr: 111,
      bestCardName: 'Chưa có cầu thủ',
      bestCardSeason: 'CU',
      bestCardGrade: 1,
      bestCard: null,
    };
  }

  // Top 18 squad value (starting XI + 7 subs) & Starting XI total salary
  const sortedByVal = [...cards].sort((a, b) => b.valueBp - a.valueBp);
  const rawSquadValue = sortedByVal
    .slice(0, 18)
    .reduce((sum, c) => sum + c.valueBp, 0);
  const squadValue = Math.min(MAX_SAFE_BP, rawSquadValue);

  const sortedByOvr = [...cards].sort((a, b) => {
    if (b.ovr !== a.ovr) return b.ovr - a.ovr;
    return b.valueBp - a.valueBp;
  });

  const totalSalary = sortedByOvr.slice(0, 11).reduce((sum, c) => {
    const tpl = PLAYER_TEMPLATE_MAP[c.templateId];
    return sum + (tpl ? tpl.salary : 25);
  }, 0);

  const best = sortedByOvr[0];
  const tpl = PLAYER_TEMPLATE_MAP[best.templateId];

  return {
    squadValue,
    totalSalary,
    bestCardOvr: best.ovr,
    bestCardName: tpl ? tpl.name : 'Cầu thủ FC',
    bestCardSeason: tpl ? tpl.seasonLabel : '25UCL',
    bestCardGrade: best.grade,
    bestCard: best,
  };
}

/**
 * FC Online Transfer Market (Thị Trường Chuyển Nhượng +1 ~ +13)
 */
export function getMarketPriceBp(templateId: string, grade: number): number {
  const tpl = PLAYER_TEMPLATE_MAP[templateId];
  if (!tpl) return 0;
  if (!Number.isInteger(grade) || grade < 1 || grade > MAX_CARD_GRADE) {
    return 0;
  }
  return computeCardValueBp(tpl.baseValueBp, grade);
}

export function calculateMarketSellQuote(
  card: OwnedCard,
  vipLevel: number = 0,
  serverRules?: GlobalServerRules
): MarketSellQuote {
  const grossBp = Math.max(0, Math.round(card.valueBp));
  if (serverRules?.zeroMarketTax) {
    return {
      grossBp,
      baseTaxBp: 0,
      vipDiscountBp: 0,
      netBp: grossBp,
      effectiveTaxPercent: 0,
    };
  }
  // Standard FC Online 40% transfer market fee + VIP tax discount (up to 30% off tax at VIP 20)
  const baseTaxBp = Math.round(grossBp * 0.4);
  const clampedVip = Math.max(0, Math.min(20, Math.floor(vipLevel)));
  const vipTaxDiscountRate = Math.min(0.3, clampedVip * 0.015);
  const vipDiscountBp = Math.round(baseTaxBp * vipTaxDiscountRate);
  const netBp = Math.max(0, grossBp - baseTaxBp + vipDiscountBp);
  const effectiveTaxPercent = Number((40 * (1 - vipTaxDiscountRate)).toFixed(1));

  return {
    grossBp,
    baseTaxBp,
    vipDiscountBp,
    netBp,
    effectiveTaxPercent,
  };
}

export function buyCardFromMarket(
  profile: ManagerProfile,
  templateId: string,
  grade: number,
  uidSuffix?: string
): MarketPurchaseResult {
  const tpl = PLAYER_TEMPLATE_MAP[templateId];
  if (!tpl) {
    return {
      ok: false,
      error: 'Không tìm thấy dữ liệu cầu thủ trên Thị Trường Chuyển Nhượng.',
      priceBp: 0,
      nextProfile: profile,
    };
  }

  if (!Number.isInteger(grade) || grade < 1 || grade > MAX_CARD_GRADE) {
    return {
      ok: false,
      error: `Cấp thẻ mua phải nằm trong khoảng +1 đến +${MAX_CARD_GRADE}.`,
      priceBp: 0,
      nextProfile: profile,
    };
  }

  const priceBp = getMarketPriceBp(tpl.id, grade);
  if (profile.bp < priceBp) {
    return {
      ok: false,
      error: `Không đủ BP để mua ${tpl.name} (+${grade}). Cần ${formatBpCompact(priceBp)}.`,
      priceBp,
      nextProfile: profile,
    };
  }

  const now = Date.now();
  const purchasedCard: OwnedCard = {
    uid: `mkt_${now}_${uidSuffix ?? Math.floor(Math.random() * 1_000_000)}`,
    templateId: tpl.id,
    grade,
    ovr: computeCardOvr(tpl.baseOvr, grade),
    valueBp: priceBp,
    acquiredAt: now,
  };

  return {
    ok: true,
    priceBp,
    purchasedCard,
    nextProfile: {
      ...profile,
      bp: Math.max(0, profile.bp - priceBp),
      cards: [purchasedCard, ...profile.cards],
    },
  };
}

export function sellCardOnMarket(
  profile: ManagerProfile,
  cardUid: string,
  serverRules?: GlobalServerRules
): MarketSaleResult {
  if (profile.cards.length <= 11) {
    return {
      ok: false,
      error: 'CLB cần giữ tối thiểu 11 cầu thủ cho Đội Hình Chính.',
      nextProfile: profile,
    };
  }

  const target = profile.cards.find((c) => c.uid === cardUid);
  if (!target) {
    return {
      ok: false,
      error: 'Không tìm thấy thẻ cầu thủ trong đội hình CLB.',
      nextProfile: profile,
    };
  }

  const vip = calculateVipStatus(profile.vipPoints);
  const quote = calculateMarketSellQuote(target, vip.level, serverRules);

  return {
    ok: true,
    soldCard: target,
    quote,
    nextProfile: {
      ...profile,
      bp: Math.min(MAX_SAFE_BP, profile.bp + quote.netBp),
      cards: profile.cards.filter((c) => c.uid !== cardUid),
    },
  };
}

export function createStarterProfile(
  id: string,
  managerName: string,
  authMode: 'guest' | 'local' | 'firebase' = 'guest',
  usernameOrEmail?: string
): ManagerProfile {
  const now = Date.now();
  // Starter squad contains ZERO INFINITY_PRIME and ZERO LE cards so IPRM & LE remain ultra-rare!
  const starterTemplateIds: Array<{ id: string; grade: number }> = [
    { id: 'icon_ronaldo_r9', grade: 5 },
    { id: 'icon_gullit', grade: 5 },
    { id: 'icon_pele', grade: 5 },
    { id: 'icon_zidane', grade: 5 },
    { id: 'icon_henry', grade: 5 },
    { id: 'icon_vieira', grade: 5 },
    { id: 'icon_maldini', grade: 5 },
    { id: 'icon_cafu', grade: 5 },
    { id: 'icon_vandersar', grade: 5 },
    { id: 'ucl26_mbappe', grade: 5 },
    { id: 'ucl26_yamal', grade: 5 },
    { id: 'ucl26_vinicius', grade: 5 },
    { id: 'ucl26_pedri', grade: 5 },
    { id: 'ucl26_rodri', grade: 5 },
    { id: 'ucl26_saliba', grade: 5 },
    { id: 'ucl26_nunomendes', grade: 5 },
    { id: 'ucl26_courtois', grade: 3 },
    { id: 'toty26_haaland', grade: 4 },
    { id: 'tots26_dembele', grade: 4 },
    { id: 'bdo_vinicius', grade: 3 },
    { id: 'up_makelele', grade: 4 },
    { id: 'up_zanetti', grade: 5 },
    { id: 'cu_neymar', grade: 2 },
    { id: 'cu_son', grade: 1 },
    { id: 'vb26_quanghai', grade: 8 },
    { id: 'vb26_dinhbac', grade: 5 },
    { id: 'vb26_hoangduc', grade: 5 },
    { id: 'vb26_ngochai', grade: 5 },
    { id: 'vb26_vietanh', grade: 5 },
    { id: 'vb26_vanhau', grade: 5 },
  ];

  let nextCardSerial = 1;
  const cards: OwnedCard[] = starterTemplateIds.map((entry, idx) => {
    const tpl = PLAYER_TEMPLATE_MAP[entry.id];
    const serialNumber = isSerializedSeason(tpl.season) ? nextCardSerial++ : undefined;
    return {
      uid: `starter_${idx + 1}_${id.slice(0, 8)}`,
      templateId: tpl.id,
      grade: entry.grade,
      ovr: computeCardOvr(tpl.baseOvr, entry.grade),
      valueBp: computeCardValueBp(tpl.baseValueBp, entry.grade),
      acquiredAt: now - idx * 1000,
      ...(serialNumber ? { serialNumber } : {}),
    };
  });

  // Starter packs have 0 iprm_pack and 0 le_pack (strictly exclusive to Bi Lắc 10,000 milestone)
  const packs: PackInventory = {
    iprm_pack: 0,
    le_pack: 0,
    ucl_26: 2,
    vb_26: 2,
    icon_tm: 1,
    toty_26: 3,
    tots_26: 3,
    bdo_pack: 2,
    up_pack: 2,
    ucl_25: 4,
    cu_fodder: 5,
  };

  const starterSquadOvr = calculateProfileSquadOvr({
    cards,
    formation: '4-3-3',
    activeTeamColorId: 'auto',
  });

  return {
    id,
    managerName: sanitizeManagerName(managerName),
    fc: 500,
    bp: 250_000_000_000_000,
    starPoints: 1_500,
    nextCardSerial,
    vipPoints: 60, // Starts at VIP 1 (50 pts) with 10/50 progress toward VIP 2
    vipLevel: calculateVipStatus(60).level,
    foosballLoops: 2,
    foosballSpins: 0,
    foosballJackpotFc: MIN_FOOSBALL_JACKPOT_FC,
    packs,
    claimedMilestones: [],
    claimedVipRewards: [],
    cards,
    formation: '4-3-3',
    activeTeamColorId: 'auto',
    elo: 2050,
    wins: 14,
    draws: 3,
    losses: 4,
    managerXp: 7_350,
    squadOvr: starterSquadOvr,
    claimedBroadcastIds: [],
    authMode,
    usernameOrEmail,
  };
}

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

export function getUtf8ByteLength(str: string): number {
  if (utf8Encoder) {
    return utf8Encoder.encode(str).length;
  }
  return unescape(encodeURIComponent(str)).length;
}

export function truncateUtf8Bytes(raw: string, maxBytes: number): string {
  if (maxBytes <= 0 || !raw) return '';
  if (getUtf8ByteLength(raw) <= maxBytes) return raw;
  let result = '';
  let byteCount = 0;
  for (const ch of raw) {
    const chBytes = getUtf8ByteLength(ch);
    if (byteCount + chBytes > maxBytes) break;
    result += ch;
    byteCount += chBytes;
  }
  return result;
}

export function sanitizeManagerName(raw: string): string {
  const trimmed = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2) return 'HLV FC Online';
  const bounded = truncateUtf8Bytes(trimmed, 32).trim();
  return bounded.length >= 2 ? bounded : 'HLV FC Online';
}

export function calculateProfileSquadOvr(
  profile: Pick<ManagerProfile, 'cards' | 'formation' | 'activeTeamColorId' | 'lineupSlotUids'>
): number {
  if (!profile.cards || profile.cards.length === 0) return 110;
  const lineup = buildFormationLineup(
    profile.cards,
    profile.formation ?? '4-3-3',
    profile.lineupSlotUids
  );
  const starterCards = lineup.slots.map((s) => s.card);
  const tcEval = evaluateSquadTeamColors(starterCards, profile.activeTeamColorId ?? 'auto');
  return Math.max(50, Math.min(260, tcEval.boostedAvgOvr || 110));
}

export function buildLeaderboardRowFromProfile(
  profile: ManagerProfile,
  isCurrentUser: boolean = false
): LeaderboardRow {
  const summary = calculateSquadSummary(profile.cards);
  const vip = calculateVipStatus(profile.vipPoints);
  const squadOvr = calculateProfileSquadOvr(profile);
  const managerLevel = calculateManagerLevelStatus(profile.managerXp ?? 7_350).level;
  const elo = Math.max(1000, Math.min(10_000, Math.floor(profile.elo ?? 2050)));
  const wins = Math.max(0, Math.min(1_000_000, Math.floor(profile.wins ?? 14)));
  const draws = Math.max(0, Math.min(1_000_000, Math.floor(profile.draws ?? 3)));
  const losses = Math.max(0, Math.min(1_000_000, Math.floor(profile.losses ?? 4)));
  const accountType =
    profile.authMode === 'firebase'
      ? 'cloud'
      : profile.authMode === 'local'
      ? 'registered'
      : 'guest';
  return {
    ownerId: profile.id,
    managerName: sanitizeManagerName(profile.managerName),
    vipLevel: vip.level,
    vipPoints: vip.totalPoints,
    squadValue: summary.squadValue,
    bestCardOvr: summary.bestCardOvr,
    bestCardName: summary.bestCardName.slice(0, 60),
    bestCardSeason: summary.bestCardSeason.slice(0, 16),
    bestCardGrade: Math.max(1, Math.min(MAX_CARD_GRADE, summary.bestCardGrade)),
    elo,
    wins,
    draws,
    losses,
    managerLevel,
    squadOvr,
    ...(profile.deviceLabel ? { deviceLabel: profile.deviceLabel } : {}),
    isCurrentUser,
    accountType,
  };
}

export function sortLeaderboard(
  rows: LeaderboardRow[],
  category: LeaderboardCategory
): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    if (category === 'ranked') {
      const eloDiff = (b.elo ?? 2050) - (a.elo ?? 2050);
      if (eloDiff !== 0) return eloDiff;
      const winDiff = (b.wins ?? 0) - (a.wins ?? 0);
      if (winDiff !== 0) return winDiff;
      const ovrDiff = (b.squadOvr ?? 0) - (a.squadOvr ?? 0);
      if (ovrDiff !== 0) return ovrDiff;
      return b.squadValue - a.squadValue;
    }
    if (category === 'squadOvr') {
      const ovrDiff = (b.squadOvr ?? 0) - (a.squadOvr ?? 0);
      if (ovrDiff !== 0) return ovrDiff;
      const lvDiff = (b.managerLevel ?? 1) - (a.managerLevel ?? 1);
      if (lvDiff !== 0) return lvDiff;
      if (b.squadValue !== a.squadValue) return b.squadValue - a.squadValue;
      return b.bestCardOvr - a.bestCardOvr;
    }
    if (category === 'vip') {
      if (b.vipLevel !== a.vipLevel) return b.vipLevel - a.vipLevel;
      if (b.vipPoints !== a.vipPoints) return b.vipPoints - a.vipPoints;
      return b.squadValue - a.squadValue;
    }
    if (category === 'squadValue') {
      if (b.squadValue !== a.squadValue) return b.squadValue - a.squadValue;
      const ovrDiff = (b.squadOvr ?? 0) - (a.squadOvr ?? 0);
      if (ovrDiff !== 0) return ovrDiff;
      return b.bestCardOvr - a.bestCardOvr;
    }
    if (b.bestCardOvr !== a.bestCardOvr) return b.bestCardOvr - a.bestCardOvr;
    if (b.bestCardGrade !== a.bestCardGrade) return b.bestCardGrade - a.bestCardGrade;
    return b.squadValue - a.squadValue;
  });
}

export function formatBpCompact(bp: number): string {
  if (bp >= 1_000_000_000_000) {
    return `${(bp / 1_000_000_000_000).toFixed(2)} Nghìn Tỷ BP`;
  }
  if (bp >= 1_000_000_000) {
    return `${Math.round(bp / 1_000_000_000).toLocaleString('vi-VN')} Tỷ BP`;
  }
  return `${Math.round(bp).toLocaleString('vi-VN')} BP`;
}

// ================= LOBBY GIFT CODES, DAILY CHECK-IN & MISSIONS =================

export interface LobbyRewardBundle {
  bp?: number;
  fc?: number;
  starPoints?: number;
  foosballLoops?: number;
  packs?: Partial<Record<PackId, number>>;
}

export interface LobbyGiftCodeDef {
  code: string;
  title: string;
  rewardText: string;
  bundle: LobbyRewardBundle;
}

export const LOBBY_GIFT_CODES: LobbyGiftCodeDef[] = [
  {
    code: 'THELASTDANCE',
    title: 'Quà Siêu Kinh Điển Huyền Thoại',
    rewardText: '1 Gói ICON TM + 3 Vòng Bi Lắc + 15 Nghìn Tỷ BP + 300 Tarpoi',
    bundle: {
      bp: 15_000_000_000_000,
      starPoints: 300,
      foosballLoops: 3,
      packs: { icon_tm: 1 },
    },
  },
  {
    code: 'WORLDCUP2026',
    title: 'Chiến Dịch World Cup 2026',
    rewardText: '3 Gói 26UCL + 3 Vòng Bi Lắc + 250 Tarpoi',
    bundle: {
      starPoints: 250,
      foosballLoops: 3,
      packs: { ucl_26: 3 },
    },
  },
  {
    code: 'FCONLINEVN',
    title: 'Tự Hào Máy Chủ Việt Nam',
    rewardText: '2 Gói Sao Vàng 26VB + 10 Nghìn Tỷ BP + 150 FC',
    bundle: {
      bp: 10_000_000_000_000,
      fc: 150,
      packs: { vb_26: 2 },
    },
  },
  {
    code: 'TARPOIVIP',
    title: 'Tiếp Sức Shop Điểm Sao Tarpoi',
    rewardText: '800 Tarpoi + 5 Gói Phôi CU + 5 Nghìn Tỷ BP',
    bundle: {
      bp: 5_000_000_000_000,
      starPoints: 800,
      packs: { cu_fodder: 5 },
    },
  },
];

export function applyLobbyRewardBundle(
  profile: ManagerProfile,
  bundle: LobbyRewardBundle
): ManagerProfile {
  const nextPacks: PackInventory = { ...profile.packs };
  if (bundle.packs) {
    for (const [k, qty] of Object.entries(bundle.packs) as Array<[PackId, number]>) {
      if (qty && qty > 0) {
        nextPacks[k] = Math.min(100_000, (nextPacks[k] ?? 0) + qty);
      }
    }
  }
  return {
    ...profile,
    bp: Math.min(MAX_SAFE_BP, profile.bp + (bundle.bp ?? 0)),
    fc: Math.min(1_000_000_000, profile.fc + (bundle.fc ?? 0)),
    starPoints: Math.min(1_000_000_000, (profile.starPoints ?? 0) + (bundle.starPoints ?? 0)),
    foosballLoops: Math.min(1_000_000, profile.foosballLoops + (bundle.foosballLoops ?? 0)),
    packs: nextPacks,
  };
}

export function redeemGiftCode(
  profile: ManagerProfile,
  rawCode: string,
  alreadyRedeemedCodes: string[]
): {
  ok: boolean;
  error?: string;
  normalizedCode: string;
  rewardText?: string;
  nextProfile: ManagerProfile;
} {
  const normalizedCode = rawCode.trim().toUpperCase();
  if (!normalizedCode) {
    return {
      ok: false,
      error: 'Vui lòng nhập mã Gift Code trước khi xác nhận.',
      normalizedCode: '',
      nextProfile: profile,
    };
  }
  const found = LOBBY_GIFT_CODES.find((g) => g.code === normalizedCode);
  if (!found) {
    return {
      ok: false,
      error: `Mã "${normalizedCode}" không hợp lệ hoặc đã hết hạn sự kiện.`,
      normalizedCode,
      nextProfile: profile,
    };
  }
  if (alreadyRedeemedCodes.includes(normalizedCode)) {
    return {
      ok: false,
      error: `Tài khoản HLV của bạn đã nhập mã "${normalizedCode}" trước đó.`,
      normalizedCode,
      nextProfile: profile,
    };
  }
  return {
    ok: true,
    normalizedCode,
    rewardText: found.rewardText,
    nextProfile: applyLobbyRewardBundle(profile, found.bundle),
  };
}

export interface DailyCheckInDef {
  day: number;
  title: string;
  rewardText: string;
  bundle: LobbyRewardBundle;
}

export const DAILY_CHECKIN_REWARDS: DailyCheckInDef[] = [
  {
    day: 1,
    title: 'Ngày 1',
    rewardText: '5 Nghìn Tỷ BP + 100 Tarpoi',
    bundle: { bp: 5_000_000_000_000, starPoints: 100 },
  },
  {
    day: 2,
    title: 'Ngày 2',
    rewardText: '2 Gói 26UCL + 120 Tarpoi',
    bundle: { starPoints: 120, packs: { ucl_26: 2 } },
  },
  {
    day: 3,
    title: 'Ngày 3',
    rewardText: '10 Nghìn Tỷ BP + 100 FC',
    bundle: { bp: 10_000_000_000_000, fc: 100 },
  },
  {
    day: 4,
    title: 'Ngày 4',
    rewardText: '2 Gói Sao Vàng 26VB + 200 Tarpoi',
    bundle: { starPoints: 200, packs: { vb_26: 2 } },
  },
  {
    day: 5,
    title: 'Ngày 5',
    rewardText: '1 Gói ICON TM + 15 Nghìn Tỷ BP',
    bundle: { bp: 15_000_000_000_000, packs: { icon_tm: 1 } },
  },
  {
    day: 6,
    title: 'Ngày 6',
    rewardText: '300 Tarpoi + 150 FC + 2 Gói Phôi CU',
    bundle: { fc: 150, starPoints: 300, packs: { cu_fodder: 2 } },
  },
  {
    day: 7,
    title: 'Ngày 7 (Đặc Biệt)',
    rewardText: '2 Gói ICON TM + 5 Vòng Bi Lắc + 25 Nghìn Tỷ BP + 500 Tarpoi',
    bundle: { bp: 25_000_000_000_000, starPoints: 500, foosballLoops: 5, packs: { icon_tm: 2 } },
  },
];

export function claimDailyCheckIn(
  profile: ManagerProfile,
  claimedDaysCount: number,
  lastCheckInDateKey: string | null,
  todayDateKey: string
): {
  ok: boolean;
  error?: string;
  dayClaimed: number;
  rewardText?: string;
  nextClaimedDaysCount: number;
  nextProfile: ManagerProfile;
} {
  if (lastCheckInDateKey === todayDateKey) {
    return {
      ok: false,
      error: 'Bạn đã điểm danh nhận quà hôm nay rồi. Hãy quay lại vào ngày mai!',
      dayClaimed: claimedDaysCount,
      nextClaimedDaysCount: claimedDaysCount,
      nextProfile: profile,
    };
  }
  const nextIndex = claimedDaysCount % DAILY_CHECKIN_REWARDS.length;
  const reward = DAILY_CHECKIN_REWARDS[nextIndex];
  return {
    ok: true,
    dayClaimed: reward.day,
    rewardText: reward.rewardText,
    nextClaimedDaysCount: claimedDaysCount + 1,
    nextProfile: applyLobbyRewardBundle(profile, reward.bundle),
  };
}

export interface EvaluatedLobbyMission {
  id: string;
  title: string;
  progressLabel: string;
  rewardText: string;
  completed: boolean;
  claimed: boolean;
  bundle: LobbyRewardBundle;
}

export function evaluateLobbyMissions(
  profile: ManagerProfile,
  claimedMissionIds: string[]
): EvaluatedLobbyMission[] {
  const summary = calculateSquadSummary(profile.cards);
  const vip = calculateVipStatus(profile.vipPoints);
  const highestGrade = profile.cards.reduce((mx, c) => Math.max(mx, c.grade), 1);
  const serialCardCount = profile.cards.filter((c) => c.serialNumber !== undefined).length;

  const rawMissions: Array<Omit<EvaluatedLobbyMission, 'claimed'>> = [
    {
      id: 'm_squad_ovr_135',
      title: 'Sở hữu Siêu sao OVR 135 trở lên trong CLB',
      progressLabel: `${Math.min(135, summary.bestCardOvr)}/135 OVR`,
      rewardText: '8 Nghìn Tỷ BP + 150 Tarpoi',
      completed: summary.bestCardOvr >= 135,
      bundle: { bp: 8_000_000_000_000, starPoints: 150 },
    },
    {
      id: 'm_card_grade_8',
      title: 'Nắm giữ cầu thủ cấp cộng +8 trở lên (Đủ chuẩn Bảo vệ BP)',
      progressLabel: `+${Math.min(8, highestGrade)}/+8`,
      rewardText: '12 Nghìn Tỷ BP + 2 Gói Phôi CU',
      completed: highestGrade >= 8,
      bundle: { bp: 12_000_000_000_000, packs: { cu_fodder: 2 } },
    },
    {
      id: 'm_serial_cards',
      title: 'Tích lũy 100 điểm sút Sự Kiện Bi Lắc hướng tới Mốc 10.000',
      progressLabel: `${Math.min(100, profile.foosballSpins)}/100 điểm`,
      rewardText: '250 Tarpoi + 2 Vòng Bi Lắc + 1 Gói 26UCL',
      completed: profile.foosballSpins >= 100 || serialCardCount >= 1,
      bundle: { starPoints: 250, foosballLoops: 2, packs: { ucl_26: 1 } },
    },
    {
      id: 'm_squad_depth_15',
      title: 'Xây dựng chiều sâu CLB từ 15 cầu thủ trở lên',
      progressLabel: `${Math.min(15, profile.cards.length)}/15 cầu thủ`,
      rewardText: '10 Nghìn Tỷ BP + 200 Tarpoi',
      completed: profile.cards.length >= 15,
      bundle: { bp: 10_000_000_000_000, starPoints: 200 },
    },
    {
      id: 'm_vip_active',
      title: 'Kích hoạt Đặc Quyền Hội Viên SVIP 1 trở lên',
      progressLabel: `SVIP ${vip.level}/1`,
      rewardText: '1 Gói ICON TM + 2 Vòng Bi Lắc + 300 Tarpoi',
      completed: vip.level >= 1,
      bundle: { starPoints: 300, foosballLoops: 2, packs: { icon_tm: 1 } },
    },
  ];

  return rawMissions.map((m) => ({
    ...m,
    claimed: claimedMissionIds.includes(m.id),
  }));
}

export function claimLobbyMissionReward(
  profile: ManagerProfile,
  missionId: string,
  claimedMissionIds: string[]
): {
  ok: boolean;
  error?: string;
  rewardText?: string;
  nextProfile: ManagerProfile;
} {
  const evaluated = evaluateLobbyMissions(profile, claimedMissionIds);
  const target = evaluated.find((m) => m.id === missionId);
  if (!target) {
    return { ok: false, error: 'Không tìm thấy nhiệm vụ.', nextProfile: profile };
  }
  if (!target.completed) {
    return {
      ok: false,
      error: 'Nhiệm vụ chưa hoàn thành điều kiện nhận thưởng.',
      nextProfile: profile,
    };
  }
  if (target.claimed) {
    return {
      ok: false,
      error: 'Bạn đã nhận phần thưởng nhiệm vụ này rồi.',
      nextProfile: profile,
    };
  }
  return {
    ok: true,
    rewardText: target.rewardText,
    nextProfile: applyLobbyRewardBundle(profile, target.bundle),
  };
}

// ================= FC ONLINE 100% NEW-GEN LOBBY MECHANISMS =================

export interface ManagerLevelStatus {
  level: number;
  currentXp: number;
  nextLevelXp: number;
  progressPercent: number;
}

export function calculateManagerLevelStatus(totalManagerXp: number): ManagerLevelStatus {
  const safeXp = Math.max(0, Math.floor(totalManagerXp));
  const xpPerLevel = 300;
  const level = Math.min(100, 1 + Math.floor(safeXp / xpPerLevel));
  const currentXp = level >= 100 ? xpPerLevel : safeXp % xpPerLevel;
  const progressPercent = level >= 100 ? 100 : Math.round((currentXp / xpPerLevel) * 100);
  return {
    level,
    currentXp,
    nextLevelXp: xpPerLevel,
    progressPercent,
  };
}

export interface HeadCoachDef {
  id: string;
  name: string;
  nationality: string;
  philosophy: string;
  buffSummary: string;
  tacticalBonusOvr: number;
}

export const HEAD_COACH_CATALOG: HeadCoachDef[] = [
  {
    id: 'hc_ancelotti',
    name: 'Carlo Ancelotti',
    nationality: 'Ý',
    philosophy: 'Chuyển Trạng Thái & Phản Công Sắc Bén',
    buffSummary: 'Sút Xoáy +2 · Chuyền Dài +2 · Bình Tĩnh +2',
    tacticalBonusOvr: 2,
  },
  {
    id: 'hc_guardiola',
    name: 'Pep Guardiola',
    nationality: 'Tây Ban Nha',
    philosophy: 'Tiki-Taka Kiểm Soát Không Gian',
    buffSummary: 'Chuyền Ngắn +2 · Giữ Bóng +2 · Tầm Nhìn +2',
    tacticalBonusOvr: 2,
  },
  {
    id: 'hc_ferguson',
    name: 'Sir Alex Ferguson',
    nationality: 'Scotland',
    philosophy: 'Tấn Công Biên Tốc Độ Cao',
    buffSummary: 'Tốc Độ +2 · Dứt Điểm +2 · Tạt Bóng +2',
    tacticalBonusOvr: 2,
  },
  {
    id: 'hc_klopp',
    name: 'Jürgen Klopp',
    nationality: 'Đức',
    philosophy: 'Gegenpressing Cường Độ Cao',
    buffSummary: 'Thể Lực +2 · Tăng Tốc +2 · Quyết Đoán +2',
    tacticalBonusOvr: 2,
  },
  {
    id: 'hc_park',
    name: 'Park Hang-seo',
    nationality: 'Hàn Quốc',
    philosophy: 'Phòng Ngự Phản Công Kỷ Luật Thép',
    buffSummary: 'Cắt Bóng +2 · Kèm Người +2 · Phản Xạ GK +2',
    tacticalBonusOvr: 2,
  },
  {
    id: 'hc_zidane',
    name: 'Zinedine Zidane',
    nationality: 'Pháp',
    philosophy: 'Bản Lĩnh Đấu Trường Châu Âu',
    buffSummary: 'Sút Xa +2 · Khéo Léo +2 · Đánh Đầu +2',
    tacticalBonusOvr: 2,
  },
];

export type FcMatchMode = 'ranked_1v1' | 'glxh_manager' | 'volta_4v4';

export interface RankTierInfo {
  id: string;
  name: string;
  shortCode: string;
  minElo: number;
  accentHex: string;
}

export const FC_ONLINE_RANK_TIERS: RankTierInfo[] = [
  { id: 'amateur', name: 'Nghiệp Dư 1', shortCode: 'ND1', minElo: 0, accentHex: '#94a3b8' },
  { id: 'semi_pro', name: 'Bán Chuyên 1', shortCode: 'BC1', minElo: 1400, accentHex: '#38bdf8' },
  { id: 'pro', name: 'Chuyên Nghiệp 1', shortCode: 'CN1', minElo: 1700, accentHex: '#22c55e' },
  { id: 'world_class', name: 'Thế Giới 1', shortCode: 'TG1', minElo: 1950, accentHex: '#a855f7' },
  { id: 'legend', name: 'Huyền Thoại', shortCode: 'HT', minElo: 2200, accentHex: '#f59e0b' },
  { id: 'challenger', name: 'Thách Đấu', shortCode: 'TĐ', minElo: 2400, accentHex: '#f97316' },
  { id: 'super_champ', name: 'Siêu Sao', shortCode: 'SS', minElo: 2650, accentHex: '#a3e635' },
];

export function getRankTierForScore(elo: number): RankTierInfo {
  const clamped = Math.max(1000, Math.floor(elo));
  let matched = FC_ONLINE_RANK_TIERS[0];
  for (const tier of FC_ONLINE_RANK_TIERS) {
    if (clamped >= tier.minElo) {
      matched = tier;
    }
  }
  return matched;
}

export interface MatchHighlightEvent {
  minute: number;
  scorerName: string;
  seasonLabel: string;
  isUserGoal: boolean;
  scorerSide?: 'home' | 'away';
}

export interface SimulatedMatchResult {
  id: string;
  mode: FcMatchMode;
  modeLabel: string;
  opponentName: string;
  opponentOvr: number;
  userGoals: number;
  opponentGoals: number;
  outcome: 'WIN' | 'DRAW' | 'LOSS';
  possessionPercent: number;
  shotsOnTarget: number;
  opponentShots: number;
  mvpName: string;
  highlights: MatchHighlightEvent[];
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  bpEarned: number;
  starPointsEarned: number;
  managerXpEarned: number;
  starPassXpEarned: number;
  playedAt: number;
  nextProfile: ManagerProfile;
}

const OPPONENT_CLUB_POOL = [
  'CLB Hà Nội Galácticos',
  'Sài Gòn Pressing FC',
  'Đà Nẵng Challengers',
  'Hải Phòng RedStorm',
  'Thủ Đô United VN',
  'Rồng Vàng Legends',
  'Bình Dương Titans',
  'Nam Định Royal FC',
];

export function simulateFcOnlineMatch(params: {
  profile: ManagerProfile;
  squadOvr: number;
  coachId?: string;
  currentElo: number;
  mode: FcMatchMode;
  rng?: () => number;
  serverRules?: GlobalServerRules;
}): SimulatedMatchResult {
  const { profile, squadOvr, coachId, currentElo, mode, serverRules } = params;
  const rng = params.rng ?? Math.random;

  const coach = HEAD_COACH_CATALOG.find((c) => c.id === coachId) ?? HEAD_COACH_CATALOG[0];
  const effectiveUserOvr = squadOvr + coach.tacticalBonusOvr;

  const oppName =
    OPPONENT_CLUB_POOL[Math.min(OPPONENT_CLUB_POOL.length - 1, Math.floor(rng() * OPPONENT_CLUB_POOL.length))];
  const baseOppOvr = Math.min(141, Math.max(126, Math.round(128 + (currentElo - 1800) / 110)));
  const opponentOvr = baseOppOvr + Math.floor(rng() * 3) - 1;

  const ovrAdvantage = effectiveUserOvr - opponentOvr;
  const winThreshold = Math.min(0.82, Math.max(0.32, 0.56 + ovrAdvantage * 0.03));
  const drawThreshold = Math.min(0.92, winThreshold + 0.17);
  const outcomeRoll = rng();

  let userGoals = 0;
  let opponentGoals = 0;
  let outcome: 'WIN' | 'DRAW' | 'LOSS' = 'WIN';

  if (mode === 'volta_4v4') {
    if (outcomeRoll < winThreshold) {
      outcome = 'WIN';
      userGoals = 4 + Math.floor(rng() * 2); // Volta first-to-4/5 street scoreline
      opponentGoals = Math.min(userGoals - 1, 1 + Math.floor(rng() * 3));
    } else if (outcomeRoll < drawThreshold) {
      outcome = 'DRAW';
      userGoals = 3;
      opponentGoals = 3;
    } else {
      outcome = 'LOSS';
      opponentGoals = 4 + Math.floor(rng() * 2);
      userGoals = Math.min(opponentGoals - 1, 1 + Math.floor(rng() * 3));
    }
  } else {
    if (outcomeRoll < winThreshold) {
      outcome = 'WIN';
      userGoals = 2 + Math.floor(rng() * 3);
      opponentGoals = Math.floor(rng() * Math.min(2, userGoals));
    } else if (outcomeRoll < drawThreshold) {
      outcome = 'DRAW';
      const g = 1 + Math.floor(rng() * 2);
      userGoals = g;
      opponentGoals = g;
    } else {
      outcome = 'LOSS';
      opponentGoals = 2 + Math.floor(rng() * 2);
      userGoals = Math.floor(rng() * opponentGoals);
    }
  }

  // Pick realistic goalscorers from user's top attacking/midfield cards
  const sortedAttackers = [...profile.cards].sort((a, b) => {
    const ta = PLAYER_TEMPLATE_MAP[a.templateId];
    const tb = PLAYER_TEMPLATE_MAP[b.templateId];
    const scoreA =
      a.ovr +
      (ta && ['ST', 'CF', 'LW', 'RW', 'CAM'].includes(ta.position) ? 15 : 0);
    const scoreB =
      b.ovr +
      (tb && ['ST', 'CF', 'LW', 'RW', 'CAM'].includes(tb.position) ? 15 : 0);
    return scoreB - scoreA;
  });

  const highlights: MatchHighlightEvent[] = [];
  for (let i = 0; i < userGoals; i++) {
    const pick =
      sortedAttackers[Math.min(sortedAttackers.length - 1, Math.floor(rng() * Math.min(5, sortedAttackers.length)))];
    const tpl = pick ? PLAYER_TEMPLATE_MAP[pick.templateId] : undefined;
    highlights.push({
      minute: Math.min(90, 9 + i * Math.floor(76 / Math.max(1, userGoals)) + Math.floor(rng() * 11)),
      scorerName: tpl ? tpl.shortName : 'Siêu Sao CLB',
      seasonLabel: tpl ? tpl.seasonLabel : 'LE',
      isUserGoal: true,
    });
  }
  const opponentStarPool: Array<{ name: string; season: string }> = [
    { name: 'K. Mbappé', season: '26TOTY' },
    { name: 'Ronaldo Nazário', season: 'ICON TM' },
    { name: 'E. Haaland', season: '26UCL' },
    { name: 'Ruud Gullit', season: 'LE' },
    { name: 'Thierry Henry', season: 'IPRM' },
    { name: 'Nguyễn Xuân Son', season: '26VB' },
    { name: 'Johan Cruyff', season: 'LE' },
    { name: 'M. van Basten', season: 'ICON TM' },
  ];
  for (let j = 0; j < opponentGoals; j++) {
    const oppPick =
      opponentStarPool[Math.min(opponentStarPool.length - 1, Math.floor(rng() * opponentStarPool.length))];
    highlights.push({
      minute: Math.min(89, 14 + j * 27 + Math.floor(rng() * 14)),
      scorerName: oppPick.name,
      seasonLabel: oppPick.season,
      isUserGoal: false,
    });
  }
  highlights.sort((a, b) => a.minute - b.minute);

  const mvpTpl = sortedAttackers[0] ? PLAYER_TEMPLATE_MAP[sortedAttackers[0].templateId] : undefined;
  const mvpName =
    outcome === 'LOSS'
      ? highlights.find((h) => !h.isUserGoal)?.scorerName ?? 'Ronaldo Nazário'
      : highlights.find((h) => h.isUserGoal)?.scorerName ??
        (mvpTpl ? mvpTpl.name : 'Đội Trưởng CLB');

  const eloDelta =
    mode === 'volta_4v4'
      ? outcome === 'WIN'
        ? 14
        : outcome === 'DRAW'
        ? 4
        : -6
      : outcome === 'WIN'
      ? 28
      : outcome === 'DRAW'
      ? 6
      : -12;
  const eloAfter = Math.max(1000, currentElo + eloDelta);

  const matchMult = serverRules?.matchRewardMultiplier ?? 1;
  const bpEarned =
    (outcome === 'WIN'
      ? 9_000_000_000_000
      : outcome === 'DRAW'
      ? 5_500_000_000_000
      : 3_500_000_000_000) * matchMult;
  const starPointsEarned = (outcome === 'WIN' ? 120 : outcome === 'DRAW' ? 80 : 50) * matchMult;
  const managerXpEarned = outcome === 'WIN' ? 260 : outcome === 'DRAW' ? 180 : 120;
  const starPassXpEarned = outcome === 'WIN' ? 150 : outcome === 'DRAW' ? 110 : 80;

  const modeLabel =
    mode === 'ranked_1v1'
      ? 'Xếp Hạng 1vs1 Chính Thức'
      : mode === 'glxh_manager'
      ? 'Giả Lập Xếp Hạng (GLXH)'
      : 'Volta Live Đường Phố 4vs4';

  const possessionPercent = Math.min(
    68,
    Math.max(41, Math.round(52 + ovrAdvantage * 1.4 + (rng() * 6 - 3)))
  );
  const shotsOnTarget = Math.max(userGoals + 2, 4 + Math.floor(rng() * 6));
  const opponentShots = Math.max(opponentGoals + 1, 2 + Math.floor(rng() * 5));

  const rewardedProfile = applyLobbyRewardBundle(profile, {
    bp: bpEarned,
    starPoints: starPointsEarned,
  });

  const nextProfile: ManagerProfile = {
    ...rewardedProfile,
    elo: eloAfter,
    wins: Math.min(1_000_000, (profile.wins ?? 14) + (outcome === 'WIN' ? 1 : 0)),
    draws: Math.min(1_000_000, (profile.draws ?? 3) + (outcome === 'DRAW' ? 1 : 0)),
    losses: Math.min(1_000_000, (profile.losses ?? 4) + (outcome === 'LOSS' ? 1 : 0)),
    managerXp: Math.min(100_000_000, (profile.managerXp ?? 7_350) + managerXpEarned),
    squadOvr: Math.max(50, Math.min(260, Math.round(squadOvr))),
  };

  return {
    id: `match_${Date.now()}_${Math.floor(rng() * 10000)}`,
    mode,
    modeLabel,
    opponentName: oppName,
    opponentOvr,
    userGoals,
    opponentGoals,
    outcome,
    possessionPercent,
    shotsOnTarget,
    opponentShots,
    mvpName,
    highlights,
    eloBefore: currentElo,
    eloAfter,
    eloDelta,
    bpEarned,
    starPointsEarned,
    managerXpEarned,
    starPassXpEarned,
    playedAt: Date.now(),
    nextProfile,
  };
}

export interface StarPassTierDef {
  tier: number;
  requiredXp: number;
  freeLabel: string;
  freeBundle: LobbyRewardBundle;
  premiumLabel: string;
  premiumBundle: LobbyRewardBundle;
}

export const STAR_PASS_PREMIUM_COST_FC = 200;

export const STAR_PASS_TIERS: StarPassTierDef[] = [
  {
    tier: 1,
    requiredXp: 0,
    freeLabel: '5 Nghìn Tỷ BP + 80 Tarpoi',
    freeBundle: { bp: 5_000_000_000_000, starPoints: 80 },
    premiumLabel: '15 Nghìn Tỷ BP + 2 Gói 26UCL',
    premiumBundle: { bp: 15_000_000_000_000, packs: { ucl_26: 2 } },
  },
  {
    tier: 2,
    requiredXp: 120,
    freeLabel: '2 Gói Phôi CU + 100 Tarpoi',
    freeBundle: { starPoints: 100, packs: { cu_fodder: 2 } },
    premiumLabel: '2 Gói Sao Vàng 26VB + 200 Tarpoi',
    premiumBundle: { starPoints: 200, packs: { vb_26: 2 } },
  },
  {
    tier: 3,
    requiredXp: 250,
    freeLabel: '8 Nghìn Tỷ BP + 1 Gói UP',
    freeBundle: { bp: 8_000_000_000_000, packs: { up_pack: 1 } },
    premiumLabel: '1 Gói 26TOTY + 200 Tarpoi',
    premiumBundle: { starPoints: 200, packs: { toty_26: 1 } },
  },
  {
    tier: 4,
    requiredXp: 400,
    freeLabel: '150 Tarpoi + 1 Gói 26TOTS',
    freeBundle: { starPoints: 150, packs: { tots_26: 1 } },
    premiumLabel: '20 Nghìn Tỷ BP + 1 Gói ICON TM',
    premiumBundle: { bp: 20_000_000_000_000, packs: { icon_tm: 1 } },
  },
  {
    tier: 5,
    requiredXp: 580,
    freeLabel: '12 Nghìn Tỷ BP + 2 Gói Phôi CU',
    freeBundle: { bp: 12_000_000_000_000, packs: { cu_fodder: 2 } },
    premiumLabel: '2 Gói ICON TM + 5 Vòng Bi Lắc + 350 Tarpoi',
    premiumBundle: { starPoints: 350, foosballLoops: 5, packs: { icon_tm: 2 } },
  },
  {
    tier: 6,
    requiredXp: 780,
    freeLabel: '1 Gói ICON TM + 3 Vòng Bi Lắc + 250 Tarpoi',
    freeBundle: { starPoints: 250, foosballLoops: 3, packs: { icon_tm: 1 } },
    premiumLabel: '3 Gói ICON TM + 10 Vòng Bi Lắc + 35 Nghìn Tỷ BP',
    premiumBundle: { bp: 35_000_000_000_000, foosballLoops: 10, packs: { icon_tm: 3 } },
  },
];

export function unlockPremiumStarPass(
  profile: ManagerProfile,
  alreadyPremium: boolean
): {
  ok: boolean;
  error?: string;
  nextProfile: ManagerProfile;
} {
  if (alreadyPremium) {
    return {
      ok: false,
      error: 'Bạn đã mở khóa Thẻ Ngôi Sao Vượt Trội (Premium) mùa này rồi.',
      nextProfile: profile,
    };
  }
  if (profile.fc < STAR_PASS_PREMIUM_COST_FC) {
    return {
      ok: false,
      error: `Không đủ FC để mở khóa Star Pass Vượt Trội (cần ${STAR_PASS_PREMIUM_COST_FC} FC).`,
      nextProfile: profile,
    };
  }
  return {
    ok: true,
    nextProfile: {
      ...profile,
      fc: profile.fc - STAR_PASS_PREMIUM_COST_FC,
    },
  };
}

export function claimStarPassTierReward(params: {
  profile: ManagerProfile;
  tier: number;
  track: 'free' | 'premium';
  starPassXp: number;
  isPremiumUnlocked: boolean;
  claimedKeys: string[];
}): {
  ok: boolean;
  error?: string;
  claimKey: string;
  rewardText?: string;
  nextProfile: ManagerProfile;
} {
  const { profile, tier, track, starPassXp, isPremiumUnlocked, claimedKeys } = params;
  const def = STAR_PASS_TIERS.find((t) => t.tier === tier);
  const claimKey = `sp_${tier}_${track}`;
  if (!def) {
    return { ok: false, error: 'Cấp Star Pass không tồn tại.', claimKey, nextProfile: profile };
  }
  if (starPassXp < def.requiredXp) {
    return {
      ok: false,
      error: `Chưa đủ điểm Star Pass XP (cần ${def.requiredXp} XP). Hãy đá Xếp Hạng hoặc GLXH để tích điểm!`,
      claimKey,
      nextProfile: profile,
    };
  }
  if (track === 'premium' && !isPremiumUnlocked) {
    return {
      ok: false,
      error: `Hãy mở khóa nhánh Star Pass Vượt Trội (${STAR_PASS_PREMIUM_COST_FC} FC) trước khi nhận mốc này.`,
      claimKey,
      nextProfile: profile,
    };
  }
  if (claimedKeys.includes(claimKey)) {
    return {
      ok: false,
      error: 'Phần thưởng mốc Star Pass này đã được nhận.',
      claimKey,
      nextProfile: profile,
    };
  }
  const bundle = track === 'free' ? def.freeBundle : def.premiumBundle;
  const rewardText = track === 'free' ? def.freeLabel : def.premiumLabel;
  return {
    ok: true,
    claimKey,
    rewardText,
    nextProfile: applyLobbyRewardBundle(profile, bundle),
  };
}

export interface ClubInboxMail {
  id: string;
  sender: string;
  title: string;
  rewardText: string;
  bundle: LobbyRewardBundle;
}

export const INITIAL_CLUB_INBOX: ClubInboxMail[] = [
  {
    id: 'mail_newgen_welcome',
    sender: 'Ban Điều Hành FC Online VN',
    title: 'Quà Ra Mắt Sảnh Chính FC Online Thế Hệ Mới',
    rewardText: '1 Gói ICON TM + 3 Vòng Bi Lắc + 12 Nghìn Tỷ BP + 250 Tarpoi',
    bundle: { bp: 12_000_000_000_000, starPoints: 250, foosballLoops: 3, packs: { icon_tm: 1 } },
  },
  {
    id: 'mail_ranked_kickoff',
    sender: 'Hội Đồng Giải Đấu Xếp Hạng',
    title: 'Tiếp Sức Đua Top Xếp Hạng 1vs1 & GLXH Mùa Mới',
    rewardText: '2 Gói 26UCL + 8 Nghìn Tỷ BP + 150 FC',
    bundle: { bp: 8_000_000_000_000, fc: 150, packs: { ucl_26: 2 } },
  },
  {
    id: 'mail_upgrade_support',
    sender: 'Trung Tâm Kỹ Thuật CLB',
    title: 'Hỗ Trợ Phôi Nâng Cấp & Quỹ Bảo Vệ Cấp +8',
    rewardText: '10 Nghìn Tỷ BP + 3 Gói Phôi CU + 150 Tarpoi',
    bundle: { bp: 10_000_000_000_000, starPoints: 150, packs: { cu_fodder: 3 } },
  },
];

export function claimClubInboxMessages(
  profile: ManagerProfile,
  mailIdsToClaim: string[],
  alreadyClaimedMailIds: string[]
): {
  ok: boolean;
  claimedNowIds: string[];
  summaryText: string;
  nextProfile: ManagerProfile;
} {
  let current = profile;
  const claimedNowIds: string[] = [];
  for (const id of mailIdsToClaim) {
    if (alreadyClaimedMailIds.includes(id)) continue;
    const mail = INITIAL_CLUB_INBOX.find((m) => m.id === id);
    if (!mail) continue;
    current = applyLobbyRewardBundle(current, mail.bundle);
    claimedNowIds.push(id);
  }
  if (claimedNowIds.length === 0) {
    return {
      ok: false,
      claimedNowIds: [],
      summaryText: 'Không còn thư đính kèm vật phẩm nào chưa nhận.',
      nextProfile: profile,
    };
  }
  return {
    ok: true,
    claimedNowIds,
    summaryText: `Đã nhận thành công ${claimedNowIds.length} thư vật phẩm từ Hộp Thư CLB!`,
    nextProfile: current,
  };
}

// ================= PURE SVIP MEMBERSHIP & PC MARKET ORDER BOOK =================

export interface SvipMembershipPlan {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  currency: 'bp' | 'tarpoi';
  cost: number;
  svipPointsGranted: number;
  fcGranted: number;
  bpGranted: number;
  starPointsGranted: number;
  packId?: PackId;
  packCount?: number;
}

export const SVIP_MEMBERSHIP_PLANS: SvipMembershipPlan[] = [
  {
    id: 'svip_weekly_bp',
    title: 'Thẻ Hội Viên SVIP Tuần',
    subtitle: 'Kích hoạt bằng quỹ BP CLB · Tăng nhanh Điểm SVIP & nhận FC/Tarpoi',
    tag: 'CÀY CHAY BP',
    currency: 'bp',
    cost: 15_000_000_000_000,
    svipPointsGranted: 80,
    fcGranted: 120,
    bpGranted: 0,
    starPointsGranted: 150,
    packId: 'cu_fodder',
    packCount: 2,
  },
  {
    id: 'svip_monthly_bp',
    title: 'Thẻ Hội Viên SVIP Tháng',
    subtitle: 'Gói SVIP tiêu chuẩn mùa giải · Cộng mạnh Điểm SVIP, FC & Gói 26UCL',
    tag: 'PHỔ BIẾN NHẤT',
    currency: 'bp',
    cost: 45_000_000_000_000,
    svipPointsGranted: 300,
    fcGranted: 350,
    bpGranted: 0,
    starPointsGranted: 400,
    packId: 'ucl_26',
    packCount: 1,
  },
  {
    id: 'svip_elite_tarpoi',
    title: 'Huy Hiệu SVIP Tinh Anh',
    subtitle: 'Đổi bằng Điểm Sao Tarpoi từ trận đấu · Nhận Điểm SVIP + Sao Vàng 26VB',
    tag: 'ĐỔI TARPOI',
    currency: 'tarpoi',
    cost: 350,
    svipPointsGranted: 260,
    fcGranted: 250,
    bpGranted: 10_000_000_000_000,
    starPointsGranted: 0,
    packId: 'vb_26',
    packCount: 1,
  },
  {
    id: 'svip_supreme_season',
    title: 'Thẻ SVIP Chí Tôn Mùa Giải',
    subtitle: 'Thăng vọt +1.000 Điểm SVIP · Tặng ngay 2 Gói ICON TM & 650 FC',
    tag: 'SVIP CHÍ TÔN',
    currency: 'tarpoi',
    cost: 900,
    svipPointsGranted: 1_000,
    fcGranted: 650,
    bpGranted: 25_000_000_000_000,
    starPointsGranted: 0,
    packId: 'icon_tm',
    packCount: 2,
  },
];

export function activateSvipPlan(
  profile: ManagerProfile,
  planId: string
): {
  ok: boolean;
  error?: string;
  plan?: SvipMembershipPlan;
  summaryText: string;
  nextProfile: ManagerProfile;
} {
  const plan = SVIP_MEMBERSHIP_PLANS.find((p) => p.id === planId);
  if (!plan) {
    return {
      ok: false,
      error: 'Không tìm thấy gói Hội Viên SVIP.',
      summaryText: '',
      nextProfile: profile,
    };
  }
  if (plan.currency === 'bp' && profile.bp < plan.cost) {
    return {
      ok: false,
      error: `Không đủ BP để kích hoạt ${plan.title} (cần ${formatBpCompact(plan.cost)}).`,
      summaryText: '',
      nextProfile: profile,
    };
  }
  if (plan.currency === 'tarpoi' && (profile.starPoints ?? 0) < plan.cost) {
    return {
      ok: false,
      error: `Không đủ Điểm Sao Tarpoi để kích hoạt ${plan.title} (cần ${plan.cost.toLocaleString('vi-VN')} Tarpoi).`,
      summaryText: '',
      nextProfile: profile,
    };
  }

  const nextVipPoints = Math.min(100_000_000, profile.vipPoints + plan.svipPointsGranted);
  const nextVipLevel = calculateVipStatus(nextVipPoints).level;
  const nextPacks: PackInventory = { ...profile.packs };
  if (plan.packId && plan.packCount) {
    nextPacks[plan.packId] = Math.min(100_000, (nextPacks[plan.packId] ?? 0) + plan.packCount);
  }

  const bpAfterCost = plan.currency === 'bp' ? profile.bp - plan.cost : profile.bp;
  const tarpoiAfterCost =
    plan.currency === 'tarpoi' ? (profile.starPoints ?? 0) - plan.cost : profile.starPoints ?? 0;

  const nextProfile: ManagerProfile = {
    ...profile,
    bp: Math.min(MAX_SAFE_BP, bpAfterCost + plan.bpGranted),
    fc: Math.min(1_000_000_000, profile.fc + plan.fcGranted),
    starPoints: Math.min(1_000_000_000, tarpoiAfterCost + plan.starPointsGranted),
    vipPoints: nextVipPoints,
    vipLevel: nextVipLevel,
    packs: nextPacks,
  };

  return {
    ok: true,
    plan,
    summaryText: `Kích hoạt ${plan.title} thành công: +${plan.svipPointsGranted} Điểm SVIP (Cấp SVIP ${nextVipLevel}) · +${plan.fcGranted} FC!`,
    nextProfile,
  };
}

export function claimDailySvipSalary(
  profile: ManagerProfile,
  lastClaimDateKey: string | null,
  todayDateKey: string
): {
  ok: boolean;
  error?: string;
  bpEarned: number;
  fcEarned: number;
  starPointsEarned: number;
  svipPointsEarned: number;
  summaryText: string;
  nextProfile: ManagerProfile;
} {
  if (lastClaimDateKey === todayDateKey) {
    return {
      ok: false,
      error: 'Bạn đã nhận Lương Đặc Quyền SVIP hôm nay rồi. Hãy quay lại vào ngày mai!',
      bpEarned: 0,
      fcEarned: 0,
      starPointsEarned: 0,
      svipPointsEarned: 0,
      summaryText: '',
      nextProfile: profile,
    };
  }

  const svipLv = calculateVipStatus(profile.vipPoints).level;
  const bpEarned = (8 + svipLv * 2) * 1_000_000_000_000;
  const starPointsEarned = 120 + svipLv * 15;
  const fcEarned = 80 + svipLv * 10;
  const svipPointsEarned = 40;
  const nextVipPoints = Math.min(100_000_000, profile.vipPoints + svipPointsEarned);
  const nextVipLevel = calculateVipStatus(nextVipPoints).level;

  return {
    ok: true,
    bpEarned,
    fcEarned,
    starPointsEarned,
    svipPointsEarned,
    summaryText: `Đã nhận Lương Ngày SVIP ${svipLv}: +${formatBpCompact(bpEarned)} · +${fcEarned} FC · +${starPointsEarned} Tarpoi · +${svipPointsEarned} Điểm SVIP!`,
    nextProfile: {
      ...profile,
      bp: Math.min(MAX_SAFE_BP, profile.bp + bpEarned),
      fc: Math.min(1_000_000_000, profile.fc + fcEarned),
      starPoints: Math.min(1_000_000_000, (profile.starPoints ?? 0) + starPointsEarned),
      vipPoints: nextVipPoints,
      vipLevel: nextVipLevel,
    },
  };
}

export interface MarketOrderBookRow {
  priceBp: number;
  quantity: number;
}

export interface MarketOrderBookSnapshot {
  standardPriceBp: number;
  upperBoundBp: number;
  lowerBoundBp: number;
  sellOrders: MarketOrderBookRow[]; // Blue (Lượng bán) ascending from lowest ask
  buyOrders: MarketOrderBookRow[]; // Red (Lượng mua) descending from highest bid
  recentHistoryBp: number[]; // 7-session price trend for PC chart
}

export function calculateMarketOrderBook(
  templateId: string,
  grade: number
): MarketOrderBookSnapshot {
  const standardPriceBp = getMarketPriceBp(templateId, grade);
  let seed = grade * 97;
  for (let i = 0; i < templateId.length; i++) {
    seed = (seed * 31 + templateId.charCodeAt(i)) % 100_003;
  }

  const upperBoundBp = Math.round(standardPriceBp * 1.07);
  const lowerBoundBp = Math.max(1_000_000, Math.round(standardPriceBp * 0.93));

  const sellMultipliers = [1.0, 1.025, 1.055];
  const buyMultipliers = [0.985, 0.96, 0.935];

  const sellOrders: MarketOrderBookRow[] = sellMultipliers.map((m, idx) => ({
    priceBp: Math.round(standardPriceBp * m),
    quantity:
      grade >= 10
        ? (seed + idx) % 3
        : grade >= 8
        ? 1 + ((seed + idx * 3) % 5)
        : 2 + ((seed + idx * 7) % 18),
  }));

  const buyOrders: MarketOrderBookRow[] = buyMultipliers.map((m, idx) => ({
    priceBp: Math.max(1_000_000, Math.round(standardPriceBp * m)),
    quantity:
      grade >= 8
        ? 3 + ((seed + idx * 5) % 14)
        : 1 + ((seed + idx * 11) % 12),
  }));

  const waveOffsets = [-0.055, -0.028, -0.04, -0.012, 0.018, -0.006, 0];
  const recentHistoryBp = waveOffsets.map((off, idx) => {
    const jitter = (((seed + idx * 17) % 9) - 4) * 0.004;
    return Math.max(1_000_000, Math.round(standardPriceBp * (1 + off + jitter)));
  });
  recentHistoryBp[recentHistoryBp.length - 1] = standardPriceBp;

  return {
    standardPriceBp,
    upperBoundBp,
    lowerBoundBp,
    sellOrders,
    buyOrders,
    recentHistoryBp,
  };
}



