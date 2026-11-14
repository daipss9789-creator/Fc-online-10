export type GameShellState = 'title' | 'playing' | 'paused';

export type ActiveTab =
  | 'lobby'
  | 'squad'
  | 'market'
  | 'shop'
  | 'locker'
  | 'vault'
  | 'upgrade'
  | 'foosball'
  | 'vip'
  | 'leaderboard'
  | 'admin';

export interface GlobalServerRules {
  guaranteedUpgrade100: boolean;
  upgradeRateMultiplier: 1 | 1.5 | 2 | 3;
  zeroMarketTax: boolean;
  matchRewardMultiplier: 1 | 2 | 3;
  serverAnnouncement: string;
}

export interface GmAuditLogEntry {
  id: string;
  timestamp: number;
  actorName: string;
  targetAccountKey: string;
  targetManagerName: string;
  actionLabel: string;
  detail: string;
}

export interface ServerBroadcastGift {
  id: string;
  createdAtMs: number;
  actorName: string;
  fcDelta: number;
  bpDelta: number;
  tarpoiDelta: number;
  svipBonusPoints: number;
  packId: PackId;
  packCount: number;
}

export type LeaderboardCategory =
  | 'ranked'
  | 'squadOvr'
  | 'squadValue'
  | 'vip'
  | 'bestOvr';

export type SeasonCode =
  | 'INFINITY_PRIME'
  | 'LE'
  | '26UCL'
  | 'ICON_TM'
  | '26TOTY'
  | '26TOTS'
  | '26VB'
  | 'BDO'
  | 'UP'
  | '25UCL'
  | 'CU';

export type PackId =
  | 'iprm_pack'
  | 'le_pack'
  | 'ucl_26'
  | 'vb_26'
  | 'icon_tm'
  | 'toty_26'
  | 'tots_26'
  | 'bdo_pack'
  | 'up_pack'
  | 'ucl_25'
  | 'cu_fodder';

export type PositionCode =
  | 'ST'
  | 'CF'
  | 'LW'
  | 'RW'
  | 'CAM'
  | 'CM'
  | 'CDM'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'GK';

export interface PlayerStats {
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
}

export type MinifaceHairStyle =
  | 'dreads'
  | 'r9_crescent'
  | 'bald'
  | 'short_curly'
  | 'buzz_fade'
  | 'curls_headband'
  | 'blonde_bun'
  | 'blonde_flow'
  | 'curtain_blonde'
  | 'pompadour'
  | 'afro_curls'
  | 'blonde_tips'
  | 'parted_classic'
  | 'top_bun';

export type MinifaceFacialHair =
  | 'clean'
  | 'mustache'
  | 'goatee'
  | 'full_beard'
  | 'stubble';

export type MinifaceKitPattern =
  | 'solid'
  | 'stripes'
  | 'sash'
  | 'collar_trim'
  | 'halves';

export interface PlayerMinifaceSpec {
  skinHex: string;
  hairStyle: MinifaceHairStyle;
  hairHex: string;
  facialHair: MinifaceFacialHair;
  kitPattern: MinifaceKitPattern;
  kitPrimary: string;
  kitSecondary: string;
  kitTrim: string;
  headbandHex?: string;
}

export interface PlayerTemplate {
  id: string;
  name: string;
  shortName: string;
  season: SeasonCode;
  seasonLabel: string;
  baseOvr: number;
  salary: number;
  preferredFoot: number;
  weakFoot: number;
  skillMoves: number;
  goldTraits?: string[];
  position: PositionCode;
  nationalityCode: string;
  nationalityName: string;
  clubCode: string;
  clubName: string;
  baseValueBp: number;
  jerseyNumber: number;
  primaryColor: string;
  secondaryColor: string;
  stats: PlayerStats;
  minifaceUrl: string;
  altMinifaceUrl?: string;
  miniface: PlayerMinifaceSpec;
}

export interface OwnedCard {
  uid: string;
  templateId: string;
  grade: number; // 1 to 13
  ovr: number;
  valueBp: number;
  acquiredAt: number;
  customMinifaceUrl?: string;
  serialNumber?: number; // Sequential serial number exclusively for INFINITY_PRIME & LE
}

export interface MarketSellQuote {
  grossBp: number;
  baseTaxBp: number;
  vipDiscountBp: number;
  netBp: number;
  effectiveTaxPercent: number;
}

export interface MarketPurchaseResult {
  ok: boolean;
  error?: string;
  priceBp: number;
  purchasedCard?: OwnedCard;
  nextProfile: ManagerProfile;
}

export interface MarketSaleResult {
  ok: boolean;
  error?: string;
  soldCard?: OwnedCard;
  quote?: MarketSellQuote;
  nextProfile: ManagerProfile;
}

export interface MinifaceOption {
  id: string;
  url: string;
  season: SeasonCode;
  seasonLabel: string;
  kitNote: string;
  clubCode: string;
  clubName: string;
}

export interface PackDefinition {
  id: PackId;
  name: string;
  subtitle: string;
  seasonBadge: string;
  seasonCode: SeasonCode;
  minOvr: number;
  maxOvr: number;
  imageUrl: string;
  accentHex: string;
  secondaryHex: string;
  allowedSeasons: SeasonCode[];
  guaranteedMinGrade: number;
  maxInitialGrade: number;
}

export type PackInventory = Record<PackId, number>;

export interface FoosballMilestone {
  spins: number;
  label: string;
  rewardPackId?: PackId;
  rewardPackCount?: number;
  bonusPackId?: PackId;
  bonusPackCount?: number;
  rewardBp: number;
  rewardFc?: number;
  rewardLoops?: number;
}

export interface FoosballSpinReward {
  slotIndex: number;
  slotLabel: string;
  packId?: PackId;
  packCount: number;
  bpEarned: number;
  jackpotWonFc?: number;
}

export interface TopUpPackage {
  id: string;
  amountVnd: number;
  label: string;
  fcEarned: number;
  vipPointsEarned: number;
  bonusFoosballLoops: number;
  tag?: string;
}

export interface VipLevelStatus {
  level: number;
  totalPoints: number;
  currentStepPoints: number;
  requiredStepPoints: number;
  nextLevelTotalPoints: number;
  progressPercent: number;
  isMaxVip: boolean;
}

export interface VipRewardTier {
  vipLevel: number;
  packId: PackId;
  packCount: number;
  bonusBp: number;
  upgradeBoostPercent: number;
}

export type FormationCode =
  | '4-3-3'
  | '4-2-3-1'
  | '4-2-2-2'
  | '4-1-2-1-2'
  | '4-1-2-1-2-W'
  | '4-1-2-3'
  | '4-2-1-3'
  | '4-4-2'
  | '4-4-2-H'
  | '4-4-1-1'
  | '4-3-2-1'
  | '4-1-4-1'
  | '4-3-1-2'
  | '4-2-4'
  | '3-5-2'
  | '3-4-3'
  | '3-4-1-2'
  | '3-4-2-1'
  | '5-2-3'
  | '5-3-2'
  | '5-2-1-2'
  | '5-4-1';

export interface ManagerProfile {
  id: string;
  managerName: string;
  fc: number;
  bp: number;
  starPoints: number; // FC Online Star Point ("Tarpoi") balance
  nextCardSerial: number; // Sequential serial counter for INFINITY_PRIME & LE cards
  vipPoints: number;
  vipLevel: number;
  foosballLoops: number;
  foosballSpins: number;
  foosballJackpotFc: number;
  packs: PackInventory;
  claimedMilestones: number[];
  claimedVipRewards: number[];
  cards: OwnedCard[];
  formation?: FormationCode;
  activeTeamColorId?: string;
  lineupSlotUids?: string[];
  elo?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  managerXp?: number;
  squadOvr?: number;
  claimedBroadcastIds?: string[];
  adminRevision?: number;
  isDelegatedAdmin?: boolean;
  isBanned?: boolean;
  banReason?: string;
  deviceLabel?: string;
  authMode: 'guest' | 'local' | 'firebase';
  usernameOrEmail?: string;
}

export interface LeaderboardRow {
  ownerId: string;
  managerName: string;
  vipLevel: number;
  vipPoints: number;
  squadValue: number;
  bestCardOvr: number;
  bestCardName: string;
  bestCardSeason: string;
  bestCardGrade: number;
  elo?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  managerLevel?: number;
  squadOvr?: number;
  deviceLabel?: string;
  updatedAtMs?: number;
  isMasterAdmin?: boolean;
  isCurrentUser?: boolean;
  accountType?: 'cloud' | 'registered' | 'guest';
}
