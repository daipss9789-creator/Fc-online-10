import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_GLOBAL_SERVER_RULES,
  MASTER_ADMIN_OWNER_EMAIL,
  MASTER_ADMIN_USERNAME,
  adminAdjustAccountVipPoints,
  adminApplyGlobalBroadcastGift,
  adminApplyMaxGodPreset,
  adminGrantPacksToAccount,
  adminGrantPlayerCardToAccount,
  adminModifyAccountBp,
  adminModifyAccountFc,
  adminModifyAccountTarpoi,
  adminRemoveOwnedCardFromAccount,
  adminRenameAccountManager,
  adminSetAccountSvipLevel,
  adminSetOwnedCardGradeInAccount,
  applyBroadcastGiftsToProfile,
  createMasterAdminProfile,
  isMasterAdminAccount,
} from './adminRules';
import {
  ALL_MARKET_GRADES,
  BP_PROTECTION_MIN_GRADE,
  MAX_CARD_GRADE,
  MAX_FODDER_COUNT,
  MAX_FOOSBALL_JACKPOT_FC,
  MAX_SAFE_BP,
  MIN_FOOSBALL_JACKPOT_FC,
  advanceFoosballJackpotStep,
  buildLeaderboardRowFromProfile,
  buyCardFromMarket,
  calculateBpProtectionCost,
  calculateEnhancementPreview,
  calculateMarketSellQuote,
  calculateProfileSquadOvr,
  calculateSquadSummary,
  calculateTopUpRewards,
  calculateVipStatus,
  canUseBpProtection,
  claimFoosballMilestoneReward,
  computeCardOvr,
  computeCardValueBp,
  createStarterProfile,
  drawCardFromPack,
  equipCardMiniface,
  estimateFodderGaugeContribution,
  exchangeBpForFoosballLoops,
  executeFoosballSpinsWithJackpot,
  formatCardSerial,
  getCumulativePointsForVipLevel,
  getFoosballLoopBpCost,
  getFoosballSpinCost,
  getMarketPriceBp,
  getUnclaimedReachedMilestones,
  isSerializedSeason,
  migrateLegacyProfile,
  rollSingleFoosballGoal,
  DAILY_CHECKIN_REWARDS,
  FC_ONLINE_RANK_TIERS,
  HEAD_COACH_CATALOG,
  INITIAL_CLUB_INBOX,
  LOBBY_GIFT_CODES,
  STAR_PASS_PREMIUM_COST_FC,
  STAR_PASS_TIERS,
  SVIP_MEMBERSHIP_PLANS,
  activateSvipPlan,
  calculateManagerLevelStatus,
  calculateMarketOrderBook,
  claimClubInboxMessages,
  claimDailyCheckIn,
  claimDailySvipSalary,
  claimLobbyMissionReward,
  claimStarPassTierReward,
  evaluateLobbyMissions,
  getRankTierForScore,
  openPacksFromProfile,
  purchaseShopOffer,
  redeemGiftCode,
  resolveCardEnhancement,
  sanitizeCustomMinifaceValue,
  sellCardOnMarket,
  simulateFcOnlineMatch,
  sortLeaderboard,
  unlockPremiumStarPass,
} from './rules';
import {
  buildSimulatedMatchResultFromGlxh,
  computeGlxhPossessionPercent,
  createGlxhMatchState,
  fastForwardGlxhMatch,
  stepGlxhSimulation,
} from './glxhMatchEngine';
import {
  HAPTIC_PATTERNS,
  resolvePackRevealVibrationPattern,
  resolveUpgradeVibrationPattern,
  vibrateDevice,
} from './haptics';
import { shouldReportFirebaseConfigError } from '../firebase';
import {
  CLUB_LICENSE_REGISTRY,
  FOOSBALL_MILESTONES,
  PACK_CATALOG,
  PACK_ORDER,
  PLAYER_TEMPLATE_MAP,
  PLAYER_TEMPLATES,
  SEASON_BADGE_ARTWORK,
  SEASON_CARD_ARTWORK,
  SEEDED_LEADERBOARD_MANAGERS,
  VIETNAM_CLUB_CODES,
  VIP_REWARD_TIERS,
  getMinifaceVariantsForPlayer,
  isVietnameseClubCode,
} from './catalog';
import { SHOP_OFFERS } from './shopCatalog';
import {
  ALL_FORMATIONS,
  ALL_TEAM_COLORS,
  FORMATION_CATALOG,
  buildFormationLineup,
  evaluateSquadTeamColors,
  prioritizeCardsForTeamColor,
  swapFormationSlots,
} from './tacticsAndTeamColor';
import { resolveTraitMeta } from './traits';

test('VIP level thresholds match exact FC Online prompt specification (1-5: 50, 5-10: 200, 10-20: 1000)', () => {
  assert.equal(getCumulativePointsForVipLevel(1), 50);
  assert.equal(getCumulativePointsForVipLevel(5), 250);
  assert.equal(getCumulativePointsForVipLevel(6), 450);
  assert.equal(getCumulativePointsForVipLevel(10), 1250);
  assert.equal(getCumulativePointsForVipLevel(11), 2250);
  assert.equal(getCumulativePointsForVipLevel(20), 11250);

  assert.equal(calculateVipStatus(0).level, 0);
  assert.equal(calculateVipStatus(49).level, 0);
  assert.equal(calculateVipStatus(50).level, 1);
  assert.equal(calculateVipStatus(250).level, 5);
  assert.equal(calculateVipStatus(449).level, 5);
  assert.equal(calculateVipStatus(450).level, 6);
  assert.equal(calculateVipStatus(1250).level, 10);
  assert.equal(calculateVipStatus(2249).level, 10);
  assert.equal(calculateVipStatus(2250).level, 11);
  assert.equal(calculateVipStatus(11250).level, 20);
  assert.equal(calculateVipStatus(25000).isMaxVip, true);
});

test('Top-up conversion grants 10 VIP points per 1000 VND and exact 40k/100k/150k foosball loops', () => {
  const r1k = calculateTopUpRewards(1000);
  assert.equal(r1k.vipPointsEarned, 10);
  assert.equal(r1k.bonusFoosballLoops, 0);

  const r40k = calculateTopUpRewards(40_000);
  assert.equal(r40k.vipPointsEarned, 400);
  assert.equal(r40k.bonusFoosballLoops, 1);

  const r100k = calculateTopUpRewards(100_000);
  assert.equal(r100k.vipPointsEarned, 1000);
  assert.equal(r100k.bonusFoosballLoops, 3);

  const r150k = calculateTopUpRewards(150_000);
  assert.equal(r150k.vipPointsEarned, 1500);
  assert.equal(r150k.bonusFoosballLoops, 4);
});

test('Foosball spin pricing (20/190/900 FC) and cumulative milestones 10 to 10000', () => {
  assert.equal(getFoosballSpinCost(1), 20);
  assert.equal(getFoosballSpinCost(10), 190);
  assert.equal(getFoosballSpinCost(100), 900);

  assert.equal(FOOSBALL_MILESTONES[0].spins, 10);
  assert.equal(FOOSBALL_MILESTONES[FOOSBALL_MILESTONES.length - 1].spins, 10000);

  const unclaimedAt105 = getUnclaimedReachedMilestones(105, [10, 30]);
  assert.deepEqual(unclaimedAt105, [50, 100]);

  assert.equal(MIN_FOOSBALL_JACKPOT_FC, 100);
  assert.equal(MAX_FOOSBALL_JACKPOT_FC, 1_000_000);

  let pot = MIN_FOOSBALL_JACKPOT_FC;
  for (let i = 0; i < 200; i++) {
    const next = advanceFoosballJackpotStep(pot);
    assert.ok(next >= pot && next <= MAX_FOOSBALL_JACKPOT_FC);
    pot = next;
  }
  assert.equal(pot, MAX_FOOSBALL_JACKPOT_FC);

  const noHitBatch = executeFoosballSpinsWithJackpot(10, 100, () => 0.5);
  assert.equal(noHitBatch.jackpotHits, 0);
  assert.equal(noHitBatch.totalJackpotFcWon, 0);
  assert.ok(noHitBatch.nextJackpotFc > 100 && noHitBatch.nextJackpotFc < 1_000_000);

  const maxHitBatch = executeFoosballSpinsWithJackpot(1, 1_000_000, () => 0.99);
  assert.equal(maxHitBatch.jackpotHits, 1);
  assert.equal(maxHitBatch.totalJackpotFcWon, 1_000_000);
  assert.equal(maxHitBatch.nextJackpotFc, 100);
  assert.equal(maxHitBatch.rewards[0].packId, 'icon_tm');
  assert.equal(maxHitBatch.rewards[0].jackpotWonFc, 1_000_000);
});

test('Card enhancement gives +1 on success and drops to a random lower grade (1..grade-1) on failure', () => {
  assert.equal(MAX_FODDER_COUNT, 5);
  const starter = createStarterProfile('uid_test', 'HLV Test');
  const target = starter.cards[0];
  const fiveFodders = starter.cards.slice(8, 13);
  assert.equal(fiveFodders.length, 5);

  assert.equal(calculateEnhancementPreview(target, [], 1).valid, false);
  assert.equal(
    calculateEnhancementPreview(target, starter.cards.slice(1, 7), 1).valid,
    false
  );
  assert.equal(calculateEnhancementPreview(target, [target], 1).valid, false);

  const preview1 = calculateEnhancementPreview(target, [fiveFodders[0]], 1);
  const preview5 = calculateEnhancementPreview(target, fiveFodders, 1);
  assert.equal(preview1.valid, true);
  assert.equal(preview5.valid, true);
  assert.ok(preview5.totalSuccessChance > preview1.totalSuccessChance);

  // Success -> +1 grade
  const winOutcome = resolveCardEnhancement(target, fiveFodders, 5, 0.0, () => 0.01);
  assert.equal(winOutcome.succeeded, true);
  assert.equal(winOutcome.newGrade, target.grade + 1);
  assert.equal(winOutcome.rhythmSweetSpot, true);
  assert.ok(winOutcome.newOvr > target.ovr);
  assert.ok(winOutcome.newValueBp > target.valueBp);

  // Failure from +1 stays +1
  const grade1Card = {
    ...target,
    grade: 1,
    ovr: computeCardOvr(128, 1),
    valueBp: computeCardValueBp(200_000_000_000, 1),
  };
  const failFloorOutcome = resolveCardEnhancement(grade1Card, fiveFodders, 0, 0.8, () => 0.999);
  assert.equal(failFloorOutcome.succeeded, false);
  assert.equal(failFloorOutcome.newGrade, 1);

  // Failure from +7 drops randomly into 1..6 depending on RNG drop roll
  const grade7Card = {
    ...target,
    grade: 7,
    ovr: computeCardOvr(128, 7),
    valueBp: computeCardValueBp(200_000_000_000, 7),
    customMinifaceUrl: '/minifaces/ucl26_mbappe.png',
  };

  const makeTwoStepRng = (first: number, second: number) => {
    let calls = 0;
    return () => (calls++ === 0 ? first : second);
  };

  const dropTo1 = resolveCardEnhancement(
    grade7Card,
    fiveFodders,
    0,
    0.8,
    makeTwoStepRng(0.999, 0.01)
  );
  const dropTo4 = resolveCardEnhancement(
    grade7Card,
    fiveFodders,
    0,
    0.8,
    makeTwoStepRng(0.999, 0.55)
  );
  const dropTo6 = resolveCardEnhancement(
    grade7Card,
    fiveFodders,
    0,
    0.8,
    makeTwoStepRng(0.999, 0.98)
  );

  assert.equal(dropTo1.succeeded, false);
  assert.equal(dropTo1.newGrade, 1);
  assert.equal(dropTo4.newGrade, 4);
  assert.equal(dropTo6.newGrade, 6);
  // Equipped Locker Room miniface is preserved across upgrades/downgrades
  assert.equal(dropTo4.updatedCard.customMinifaceUrl, '/minifaces/ucl26_mbappe.png');
});

test('Real FC Online frames, LE (135..140 OVR, 2MF animated), INFINITY_PRIME (57 legends + VN stars), UP & 26VB (1MF static), 165 club licenses (40 VN + 125 Intl), 365 player templates & authentic Trait Icons', () => {
  const seasons = new Set(PLAYER_TEMPLATES.map((t) => t.season));
  assert.deepEqual(
    Array.from(seasons).sort(),
    [
      '25UCL',
      '26TOTS',
      '26TOTY',
      '26UCL',
      '26VB',
      'BDO',
      'CU',
      'ICON_TM',
      'INFINITY_PRIME',
      'LE',
      'UP',
    ]
  );
  assert.equal(PACK_ORDER.length, 11);
  assert.equal(PLAYER_TEMPLATES.length, 365);

  // Verify INFINITY_PRIME has 57 templates: 47 retired World ICONs + 4 allowed active world stars + 6 Vietnamese stars/legends
  const ipCards = PLAYER_TEMPLATES.filter((t) => t.season === 'INFINITY_PRIME');
  assert.equal(ipCards.length, 57);
  const allowedActiveIpClubs: Record<string, string> = {
    ip_cr7: 'ALN',
    ip_messi: 'MIA',
    ip_neymar: 'SAN',
    ip_casemiro: 'MUN',
  };
  const ipVnCards = ipCards.filter((c) => c.nationalityCode === 'VN');
  assert.equal(ipVnCards.length, 6, `Expected 6 Vietnamese players in INFINITY_PRIME, got ${ipVnCards.length}`);
  for (const card of ipCards) {
    if (card.id in allowedActiveIpClubs) {
      assert.equal(card.clubCode, allowedActiveIpClubs[card.id]);
    } else if (card.nationalityCode === 'VN') {
      assert.ok(
        card.clubCode === 'ICONS' || isVietnameseClubCode(card.clubCode),
        `Vietnamese INFINITY_PRIME player ${card.id} must use ICONS or a licensed VN club, got ${card.clubCode}`
      );
    } else {
      assert.equal(
        card.clubCode,
        'ICONS',
        `Expected retired Infinity Prime legend ${card.id} to use clubCode ICONS, got ${card.clubCode}`
      );
      assert.equal(card.clubName, 'FC Online ICONs');
    }
  }
  for (const removedId of [
    'ip_mbappe',
    'ip_ramos',
    'ip_modric',
    'ip_vinicius',
    'ip_benzema',
    'ip_suarez',
    'ip_debruyne',
    'ip_vandijk',
    'ip_courtois',
    'ip_marquinhos',
  ]) {
    assert.equal(
      PLAYER_TEMPLATES.some((t) => t.id === removedId),
      false,
      `Active player ${removedId} must be removed from INFINITY_PRIME`
    );
  }

  // Verify all 22 ICON_TM legends use ICONS crest and all exist in INFINITY_PRIME
  const iconTmCards = PLAYER_TEMPLATES.filter((t) => t.season === 'ICON_TM');
  assert.equal(iconTmCards.length, 22);
  const ipNames = new Set(ipCards.map((c) => c.name));
  for (const ic of iconTmCards) {
    assert.equal(ic.clubCode, 'ICONS');
    assert.equal(ic.clubName, 'FC Online ICONs');
    assert.equal(
      ipNames.has(ic.name),
      true,
      `Every ICON_TM legend (${ic.name}) must also be present in INFINITY_PRIME`
    );
  }

  // Verify official /clubs/icons.png RGBA crest exists
  assert.equal(CLUB_LICENSE_REGISTRY.ICONS.logoUrl, '/clubs/icons.png');
  const iconsCrestBuf = fs.readFileSync(
    path.resolve(process.cwd(), 'public', 'clubs', 'icons.png')
  );
  assert.equal(iconsCrestBuf[25], 6);

  // Verify real FC Online card frames & season badges exist on disk
  for (const [, relUrl] of Object.entries(SEASON_CARD_ARTWORK)) {
    const p = path.resolve(process.cwd(), 'public', relUrl.slice(1));
    assert.ok(fs.existsSync(p), `Missing season card artwork: ${p}`);
  }
  for (const [, relUrl] of Object.entries(SEASON_BADGE_ARTWORK)) {
    const p = path.resolve(process.cwd(), 'public', relUrl.slice(1));
    assert.ok(fs.existsSync(p), `Missing season badge artwork: ${p}`);
  }

  // Verify all 165 official club licenses (40 Vietnamese clubs + 125 International clubs) and local RGBA crests
  const clubEntries = Object.values(CLUB_LICENSE_REGISTRY);
  assert.equal(clubEntries.length, 165);
  assert.equal(VIETNAM_CLUB_CODES.size, 40);
  const vnLicensedCount = clubEntries.filter((c) => isVietnameseClubCode(c.code)).length;
  assert.equal(vnLicensedCount, 40);
  let verifiedCrestCount = 0;
  for (const club of clubEntries) {
    assert.ok(club.logoUrl, `Club ${club.code} must define logoUrl`);
    const crestDisk = path.resolve(process.cwd(), 'public', club.logoUrl.slice(1));
    assert.ok(fs.existsSync(crestDisk), `Missing club crest PNG: ${crestDisk}`);
    const crestBuf = fs.readFileSync(crestDisk);
    assert.equal(crestBuf[0], 0x89, `Invalid PNG header for club crest ${club.code}`);
    assert.equal(crestBuf[25], 6, `Expected RGBA PNG32 for club crest ${club.code}`);
    verifiedCrestCount++;
  }
  assert.equal(verifiedCrestCount, 165, `Expected 165 club crests on disk, got ${verifiedCrestCount}`);

  // Verify 26VB Vietnam Best has 20 authentic FC Online Vietnam players with STRICTLY 1 static miniface
  const vb26Cards = PLAYER_TEMPLATES.filter((t) => t.season === '26VB');
  assert.equal(vb26Cards.length, 20);
  for (const vb of vb26Cards) {
    assert.ok(vb.baseOvr >= 110 && vb.baseOvr <= 118, `26VB ${vb.id} OVR out of 110..118: ${vb.baseOvr}`);
    assert.ok(vb.salary >= 21 && vb.salary <= 29, `26VB ${vb.id} salary out of 21..29: ${vb.salary}`);
    assert.equal(vb.nationalityCode, 'VN');
    assert.equal(vb.nationalityName, 'Việt Nam');
    assert.ok(vb.minifaceUrl.startsWith('/minifaces/vb26_'));
    assert.equal(vb.altMinifaceUrl, undefined, `26VB ${vb.id} must have strictly 1 static miniface`);
  }
  assert.deepEqual(PACK_CATALOG.vb_26.allowedSeasons, ['26VB']);

  // Verify LE (Legendary Eternal) has 38 legends & VN stars with +1 OVR strictly min 135 .. max 140 and 2 animated minifaces
  const leCards = PLAYER_TEMPLATES.filter((t) => t.season === 'LE');
  assert.equal(leCards.length, 38);
  assert.equal(Math.min(...leCards.map((c) => c.baseOvr)), 135);
  assert.equal(Math.max(...leCards.map((c) => c.baseOvr)), 140);
  assert.equal(leCards.filter((c) => c.nationalityCode === 'VN').length, 6);
  for (const le of leCards) {
    assert.ok(le.baseOvr >= 135 && le.baseOvr <= 140, `LE ${le.id} OVR out of 135..140: ${le.baseOvr}`);
    assert.ok(le.salary >= 32 && le.salary <= 36, `LE ${le.id} salary out of 32..36: ${le.salary}`);
    assert.ok(le.minifaceUrl.startsWith('/minifaces/le_'));
    assert.ok(le.altMinifaceUrl?.startsWith('/minifaces/le_'), `LE ${le.id} must have 2nd animated miniface`);
  }
  assert.deepEqual(PACK_CATALOG.le_pack.allowedSeasons, ['LE']);
  assert.equal(PACK_CATALOG.le_pack.minOvr, 135);
  assert.equal(PACK_CATALOG.le_pack.maxOvr, 140);
  const leCardBuf = fs.readFileSync(path.resolve(process.cwd(), 'public', 'cards', 'le.png'));
  const leBadgeBuf = fs.readFileSync(path.resolve(process.cwd(), 'public', 'seasons', 'le.png'));
  assert.equal(leCardBuf.readUInt32BE(16), 340);
  assert.equal(leCardBuf.readUInt32BE(20), 400);
  assert.equal(leBadgeBuf[0], 0x89);
  assert.ok(leBadgeBuf.readUInt32BE(16) >= 20 && leBadgeBuf.readUInt32BE(20) >= 16);

  // Verify UP (Unsung Players) has 22 players (OVR 114..118) with real FC Online frame + STRICTLY 1 static miniface
  const upCards = PLAYER_TEMPLATES.filter((t) => t.season === 'UP');
  assert.equal(upCards.length, 22);
  for (const up of upCards) {
    assert.ok(up.baseOvr >= 114 && up.baseOvr <= 118, `UP ${up.id} OVR out of 114..118: ${up.baseOvr}`);
    assert.ok(up.salary >= 23 && up.salary <= 26, `UP ${up.id} salary out of 23..26: ${up.salary}`);
    assert.ok(up.minifaceUrl.startsWith('/minifaces/up_'));
    assert.equal(up.altMinifaceUrl, undefined, `UP ${up.id} must have strictly 1 static miniface`);
  }
  assert.deepEqual(PACK_CATALOG.up_pack.allowedSeasons, ['UP']);
  const upCardBuf = fs.readFileSync(path.resolve(process.cwd(), 'public', 'cards', 'up.png'));
  const upBadgeBuf = fs.readFileSync(path.resolve(process.cwd(), 'public', 'seasons', 'up.png'));
  assert.equal(upCardBuf.readUInt32BE(16), 340);
  assert.equal(upCardBuf.readUInt32BE(20), 400);
  assert.equal(upBadgeBuf[0], 0x89);
  assert.ok(upBadgeBuf.readUInt32BE(16) >= 20 && upBadgeBuf.readUInt32BE(20) >= 16);

  // Verify 26UCL has 66 UCL 2026-2027 players strictly OVR 120..128 wearing ucl26_ kits
  const ucl26Cards = PLAYER_TEMPLATES.filter((t) => t.season === '26UCL');
  assert.equal(ucl26Cards.length, 66);
  for (const c of ucl26Cards) {
    assert.ok(c.baseOvr >= 120 && c.baseOvr <= 128, `26UCL ${c.id} OVR out of 120..128: ${c.baseOvr}`);
    assert.ok(
      c.minifaceUrl.startsWith('/minifaces/ucl26_'),
      `26UCL ${c.id} must use 2026-2027 UCL kit miniface`
    );
  }

  // Verify ZERO retired legends in 26UCL, 26TOTY, 26TOTS, 25UCL, BDO, CU & their pack pools
  const retiredLegendNames = new Set([
    'Pelé',
    'Ronaldo',
    'Ronaldinho',
    'Z. Zidane',
    'Kaká',
    'R. Gullit',
    'J. Cruyff',
    'P. Maldini',
    'T. Henry',
    'M. van Basten',
    'D. Beckham',
    'R. Ferdinand',
    'Xavi',
    'A. Iniesta',
    'P. Lahm',
    'Eusébio',
    'P. Vieira',
    'R. Carlos',
    'D. Drogba',
    'S. Eto’o',
    'G. Buffon',
    'A. Pirlo',
    'P. Nedvěd',
    'S. Gerrard',
    'F. Torres',
    'W. Rooney',
    'G. Bale',
    'E. Hazard',
    'Z. Ibrahimović',
    'F. Ribéry',
    'A. Robben',
    'A. Shevchenko',
    'F. Cannavaro',
    'Cafu',
    'L. Matthäus',
    'F. Beckenbauer',
    'G. Best',
    'Zico',
    'R. van Nistelrooy',
    'Raúl',
    'J. Stam',
    'P. Čech',
    'D. Maradona',
    'B. Charlton',
    'K. Rummenigge',
    'R. Baggio',
  ]);
  const activeOnlySeasons = new Set(['26UCL', '26TOTY', '26TOTS', '25UCL', 'BDO', 'CU']);
  for (const tpl of PLAYER_TEMPLATES) {
    assert.ok(CLUB_LICENSE_REGISTRY[tpl.clubCode], `Unregistered clubCode ${tpl.clubCode}`);
    assert.equal(tpl.clubName, CLUB_LICENSE_REGISTRY[tpl.clubCode].officialName);
    if (activeOnlySeasons.has(tpl.season)) {
      assert.equal(
        retiredLegendNames.has(tpl.name),
        false,
        `Active season ${tpl.season} must not contain retired legend ${tpl.name}`
      );
      assert.notEqual(tpl.clubCode, 'ICON');
    }
  }

  for (const activePackId of ['ucl_26', 'toty_26', 'tots_26', 'bdo_pack', 'ucl_25'] as const) {
    const allowed = PACK_CATALOG[activePackId].allowedSeasons;
    assert.equal(allowed.includes('INFINITY_PRIME'), false);
    assert.equal(allowed.includes('ICON_TM'), false);
  }

  // Verify every miniface PNG exists, is RGBA transparent, and EVERY season of a player has a distinct miniface hash
  const hashesByPlayer = new Map<string, Set<string>>();
  const urlsByPlayer = new Map<string, Set<string>>();

  for (const tpl of PLAYER_TEMPLATES) {
    assert.ok(tpl.baseOvr >= 110 && tpl.baseOvr <= 140, `Unexpected baseOvr for ${tpl.id}: ${tpl.baseOvr}`);
    assert.ok(tpl.salary >= 21 && tpl.salary <= 36, `Unexpected salary for ${tpl.id}: ${tpl.salary}`);
    assert.ok(tpl.minifaceUrl.startsWith('/minifaces/') && tpl.minifaceUrl.endsWith('.png'));

    // Verify every goldTraits entry maps to an authentic local 64x64 (standard) or 90x90 (gold) RGBA FC Online trait icon PNG
    for (const traitLabel of tpl.goldTraits ?? []) {
      const meta = resolveTraitMeta(traitLabel);
      assert.ok(meta.iconUrl.startsWith('/traits/trait_icon_') && meta.iconUrl.endsWith('.png'));
      const traitDisk = path.resolve(process.cwd(), 'public', meta.iconUrl.slice(1));
      assert.ok(fs.existsSync(traitDisk), `Missing FC Online trait icon PNG: ${traitDisk}`);
      const tBuf = fs.readFileSync(traitDisk);
      assert.equal(tBuf[0], 0x89);
      assert.equal(tBuf[25], 6, `Expected RGBA trait PNG for ${meta.iconUrl}`);
      const tw = tBuf.readUInt32BE(16);
      const th = tBuf.readUInt32BE(20);
      assert.ok(
        (tw === 90 && th === 90) || (tw === 64 && th === 64),
        `Expected 64x64 or 90x90 trait PNG for ${meta.iconUrl}, got ${tw}x${th}`
      );
    }

    const diskPath = path.resolve(process.cwd(), 'public', tpl.minifaceUrl.slice(1));
    assert.ok(fs.existsSync(diskPath), `Missing miniface PNG on disk: ${diskPath}`);
    const buf = fs.readFileSync(diskPath);
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x4e);
    assert.equal(buf[3], 0x47);
    assert.equal(buf[25], 6, `Expected RGBA transparent PNG for ${tpl.id}`);

    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    const pKey = tpl.name.toLowerCase();
    if (!hashesByPlayer.has(pKey)) {
      hashesByPlayer.set(pKey, new Set());
      urlsByPlayer.set(pKey, new Set());
    }
    assert.equal(
      urlsByPlayer.get(pKey)!.has(tpl.minifaceUrl),
      false,
      `Duplicate minifaceUrl across seasons for ${tpl.name}: ${tpl.minifaceUrl}`
    );
    assert.equal(
      hashesByPlayer.get(pKey)!.has(md5),
      false,
      `Duplicate miniface image hash across seasons for ${tpl.name} (${tpl.id})`
    );
    urlsByPlayer.get(pKey)!.add(tpl.minifaceUrl);
    hashesByPlayer.get(pKey)!.add(md5);

    if (
      tpl.season === 'INFINITY_PRIME' ||
      tpl.season === 'ICON_TM' ||
      tpl.season === 'LE'
    ) {
      assert.ok(
        tpl.altMinifaceUrl &&
          tpl.altMinifaceUrl.startsWith('/minifaces/') &&
          tpl.altMinifaceUrl.endsWith('.png'),
        `${tpl.season} card ${tpl.id} must define altMinifaceUrl for 2-miniface animation`
      );
      const altDiskPath = path.resolve(process.cwd(), 'public', tpl.altMinifaceUrl.slice(1));
      assert.ok(fs.existsSync(altDiskPath), `Missing alt miniface PNG on disk: ${altDiskPath}`);
      const altBuf = fs.readFileSync(altDiskPath);
      assert.equal(altBuf[25], 6, `Expected RGBA transparent alt PNG for ${tpl.id}`);
      assert.equal(buf.equals(altBuf), false, `Primary and alt miniface must differ for ${tpl.id}`);
    } else {
      assert.equal(
        tpl.altMinifaceUrl,
        undefined,
        `Non-animated season ${tpl.season} card ${tpl.id} must have strictly 1 static miniface`
      );
    }
  }

  // Explicitly verify Shevchenko & Van der Sar have 4 distinct RGBA portraits across IP and ICON_TM
  const shevaAndVdsPaths = [
    '/minifaces/ip_shevchenko.png',
    '/minifaces/ip_shevchenko_alt.png',
    '/minifaces/icon_shevchenko.png',
    '/minifaces/icon_shevchenko_alt.png',
    '/minifaces/ip_vandersar.png',
    '/minifaces/ip_vandersar_alt.png',
    '/minifaces/icon_vandersar.png',
    '/minifaces/icon_vandersar_alt.png',
  ];
  const shevaVdsHashes = new Set<string>();
  for (const rel of shevaAndVdsPaths) {
    const b = fs.readFileSync(path.resolve(process.cwd(), 'public', rel.slice(1)));
    assert.equal(b[25], 6);
    shevaVdsHashes.add(crypto.createHash('md5').update(b).digest('hex'));
  }
  assert.equal(shevaVdsHashes.size, 8);

  // Verify Locker Room multi-season options & equipCardMiniface
  const mbappeVariants = getMinifaceVariantsForPlayer('K. Mbappé');
  assert.ok(
    mbappeVariants.length >= 5,
    `Expected >= 5 distinct active-season minifaces for K. Mbappé, got ${mbappeVariants.length}`
  );
  assert.ok(mbappeVariants.some((v) => v.season === '26UCL'));
  assert.equal(mbappeVariants.some((v) => v.season === 'INFINITY_PRIME'), false);

  const profile = createStarterProfile('uid_demo', 'HLV Demo');
  assert.equal(profile.packs.iprm_pack, 0);
  assert.equal(profile.packs.le_pack, 0);
  assert.equal(profile.packs.ucl_26, 2);
  assert.equal(profile.packs.icon_tm, 1);
  assert.equal(profile.packs.vb_26, 2);
  assert.equal(profile.packs.up_pack, 2);

  const equippedCards = equipCardMiniface(
    profile.cards,
    profile.cards[0].uid,
    '/minifaces/toty26_mbappe.png'
  );
  assert.equal(equippedCards[0].customMinifaceUrl, '/minifaces/toty26_mbappe.png');
  const resetCards = equipCardMiniface(equippedCards, profile.cards[0].uid, undefined);
  assert.equal(resetCards[0].customMinifaceUrl, undefined);

  const pulledUcl26 = drawCardFromPack('ucl_26', () => 0.15, 'fixed_ucl26');
  assert.ok(pulledUcl26.ovr >= 120 && pulledUcl26.ovr <= 135);

  const summary = calculateSquadSummary([pulledUcl26, ...profile.cards]);
  assert.ok(summary.squadValue > 0 && summary.squadValue <= MAX_SAFE_BP);

  const migrated = migrateLegacyProfile({
    id: 'legacy_1',
    managerName: 'HLV Cũ',
    packs: { icon_tm: 2, toty_24: 4, ucl_24: 3, ut_24: 1, fodder_pack: 6 } as unknown as never,
    cards: [
      { uid: 'old_c1', templateId: 'toty_mbappe', grade: 4, ovr: 120, valueBp: 100, acquiredAt: 1 },
      { uid: 'old_c2', templateId: 'dc_kaka', grade: 2, ovr: 112, valueBp: 50, acquiredAt: 2 },
    ],
  });
  assert.equal(migrated.packs.iprm_pack, 0);
  assert.equal(migrated.packs.le_pack, 0);
  assert.equal(migrated.packs.ucl_26, 2);
  assert.equal(migrated.packs.toty_26, 4);
  assert.equal(migrated.cards[0].templateId, 'toty26_mbappe');
  assert.equal(migrated.cards[1].templateId, 'ip_kaka');

  const sortedVip = sortLeaderboard(
    [
      {
        ownerId: 'a',
        managerName: 'A',
        vipLevel: 5,
        vipPoints: 250,
        squadValue: 900,
        bestCardOvr: 125,
        bestCardName: 'X',
        bestCardSeason: '25UCL',
        bestCardGrade: 1,
      },
      {
        ownerId: 'b',
        managerName: 'B',
        vipLevel: 12,
        vipPoints: 3300,
        squadValue: 500,
        bestCardOvr: 122,
        bestCardName: 'Y',
        bestCardSeason: '26TOTY',
        bestCardGrade: 1,
      },
    ],
    'vip'
  );
  assert.equal(sortedVip[0].ownerId, 'b');
});

test('Transfer Market supports buying +1 to +13, selling with VIP tax discount, and authentic Infinite Prime PNGs differ from UC', () => {
  assert.equal(MAX_CARD_GRADE, 13);
  assert.deepEqual([...ALL_MARKET_GRADES], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

  // Authentic Infinite Prime card & badge PNG verification (must not alias 25ucl/UC)
  const ipCardPath = path.resolve(process.cwd(), 'public', 'cards', 'iprm.png');
  const ucl25CardPath = path.resolve(process.cwd(), 'public', 'cards', '25ucl.png');
  const ipBadgePath = path.resolve(process.cwd(), 'public', 'seasons', 'iprm.png');
  const ucl25BadgePath = path.resolve(process.cwd(), 'public', 'seasons', '25ucl.png');
  const ipCardBuf = fs.readFileSync(ipCardPath);
  const ucl25CardBuf = fs.readFileSync(ucl25CardPath);
  const ipBadgeBuf = fs.readFileSync(ipBadgePath);
  const ucl25BadgeBuf = fs.readFileSync(ucl25BadgePath);
  assert.equal(ipCardBuf.equals(ucl25CardBuf), false);
  assert.equal(ipBadgeBuf.equals(ucl25BadgeBuf), false);
  // PNG IHDR width/height: 340x400 for card frame, 30x24 for season badge
  assert.equal(ipCardBuf.readUInt32BE(16), 340);
  assert.equal(ipCardBuf.readUInt32BE(20), 400);
  assert.equal(ipBadgeBuf.readUInt32BE(16), 30);
  assert.equal(ipBadgeBuf.readUInt32BE(20), 24);

  // Every player template has strictly increasing OVR & BP from +1 to +13 within MAX_SAFE_BP
  for (const tpl of PLAYER_TEMPLATES) {
    let prevOvr = 0;
    let prevPrice = 0;
    for (const g of ALL_MARKET_GRADES) {
      const ovr = computeCardOvr(tpl.baseOvr, g);
      const price = getMarketPriceBp(tpl.id, g);
      assert.ok(ovr > prevOvr, `Expected strictly increasing OVR at +${g} for ${tpl.id}`);
      assert.ok(price > prevPrice, `Expected strictly increasing BP price at +${g} for ${tpl.id}`);
      assert.ok(Number.isSafeInteger(price) && price <= MAX_SAFE_BP);
      prevOvr = ovr;
      prevPrice = price;
    }
  }
  assert.equal(getMarketPriceBp('ip_cr7', 0), 0);
  assert.equal(getMarketPriceBp('ip_cr7', 14), 0);

  // Enhancement works up to +13 and stops at +13
  const baseProfile = createStarterProfile('mkt_tester', 'HLV Chuyển Nhượng');
  const fodders = baseProfile.cards.slice(12, 17);
  const grade12Card = {
    ...baseProfile.cards[0],
    grade: 12,
    ovr: computeCardOvr(137, 12),
    valueBp: computeCardValueBp(4_850_000_000_000, 12),
  };
  const previewTo13 = calculateEnhancementPreview(grade12Card, fodders, 10);
  assert.equal(previewTo13.valid, true);
  assert.equal(previewTo13.nextGrade, 13);

  const hit13 = resolveCardEnhancement(grade12Card, fodders, 10, 0.0, () => 0.001);
  assert.equal(hit13.succeeded, true);
  assert.equal(hit13.newGrade, 13);
  assert.equal(calculateEnhancementPreview(hit13.updatedCard, fodders, 10).valid, false);

  // Buy +13 CU B. Silva directly with starter BP (146.2T <= 250T)
  const buy13Res = buyCardFromMarket(baseProfile, 'cu_silva', 13, 'test13');
  assert.equal(buy13Res.ok, true);
  assert.equal(buy13Res.purchasedCard?.grade, 13);
  assert.equal(buy13Res.purchasedCard?.ovr, computeCardOvr(111, 13));
  assert.equal(buy13Res.nextProfile.cards.length, baseProfile.cards.length + 1);
  assert.equal(buy13Res.nextProfile.bp, baseProfile.bp - buy13Res.priceBp);

  // Reject invalid grade 14 & insufficient BP
  assert.equal(buyCardFromMarket(baseProfile, 'ip_cr7', 14).ok, false);
  assert.equal(buyCardFromMarket(baseProfile, 'ip_cr7', 13).ok, false);

  // VIP tax discount & selling on market
  const sampleCard = buy13Res.purchasedCard!;
  const quoteVip0 = calculateMarketSellQuote(sampleCard, 0);
  const quoteVip20 = calculateMarketSellQuote(sampleCard, 20);
  assert.equal(quoteVip0.effectiveTaxPercent, 40);
  assert.equal(quoteVip20.effectiveTaxPercent, 28);
  assert.ok(quoteVip20.netBp > quoteVip0.netBp);

  const sellRes = sellCardOnMarket(buy13Res.nextProfile, sampleCard.uid);
  assert.equal(sellRes.ok, true);
  assert.equal(sellRes.nextProfile.cards.length, baseProfile.cards.length);
  assert.ok(sellRes.nextProfile.bp > buy13Res.nextProfile.bp);

  // Guard minimum 11 squad cards
  const elevenCardProfile = {
    ...baseProfile,
    cards: baseProfile.cards.slice(0, 11),
  };
  assert.equal(sellCardOnMarket(elevenCardProfile, elevenCardProfile.cards[0].uid).ok, false);
});

test('All 22 tactical formations achieve 11/11 natural-fit starters and complete FC Online Team Color system works', () => {
  assert.equal(ALL_FORMATIONS.length, 22);
  const f4 = ALL_FORMATIONS.filter((c) => FORMATION_CATALOG[c].family === '4B');
  const f3 = ALL_FORMATIONS.filter((c) => FORMATION_CATALOG[c].family === '3B');
  const f5 = ALL_FORMATIONS.filter((c) => FORMATION_CATALOG[c].family === '5B');
  assert.equal(f4.length, 14);
  assert.equal(f3.length, 4);
  assert.equal(f5.length, 4);

  const starterProfile = createStarterProfile('tactical_hlv', 'HLV Chiến Thuật');
  for (const fCode of ALL_FORMATIONS) {
    const res = buildFormationLineup(starterProfile.cards, fCode);
    assert.equal(res.slots.length, 11, `Formation ${fCode} must assign 11 slots`);
    assert.equal(new Set(res.starterUids).size, 11, `Formation ${fCode} must have 11 unique players`);
    const naturalCount = res.slots.filter((s) => s.isNaturalFit).length;
    assert.equal(
      naturalCount,
      11,
      `Expected 11/11 natural-fit starters in formation ${fCode}, got ${naturalCount}/11`
    );
  }

  // Verify 2-click slot swap & bench substitution
  const base433 = buildFormationLineup(starterProfile.cards, '4-3-3');
  const swapped = swapFormationSlots(base433.starterUids, 0, base433.starterUids[2]);
  assert.equal(swapped[0], base433.starterUids[2]);
  assert.equal(swapped[2], base433.starterUids[0]);

  // Verify Team Color catalog covers all 40 Vietnamese clubs, 125 International clubs, Nations, and 11 Seasons + 4 Grades
  const vnClubTcs = ALL_TEAM_COLORS.filter((tc) => tc.category === 'VN_CLUB');
  const intlClubTcs = ALL_TEAM_COLORS.filter((tc) => tc.category === 'INTL_CLUB');
  const specialTcs = ALL_TEAM_COLORS.filter((tc) => tc.category === 'SPECIAL');
  assert.equal(vnClubTcs.length, 40);
  assert.equal(intlClubTcs.length, 125);
  assert.equal(specialTcs.length, 15); // 4 enhancement grade tiers + 11 seasons

  // Optimize starter squad for Công An Hà Nội FC (tc_club_cah) and verify Team Color OVR buff activates
  const optimizedCahUids = prioritizeCardsForTeamColor(
    starterProfile.cards,
    '4-3-3',
    'tc_club_cah'
  );
  const cahLineup = buildFormationLineup(starterProfile.cards, '4-3-3', optimizedCahUids);
  assert.equal(cahLineup.slots.length, 11);
  const evalCah = evaluateSquadTeamColors(
    cahLineup.slots.map((s) => s.card),
    'tc_club_cah'
  );
  assert.equal(evalCah.selectedTeamColor?.id, 'tc_club_cah');
  assert.ok(evalCah.activeBadges.length >= 1);
  assert.ok(evalCah.totalBoostedStarters >= 3);
  assert.ok(evalCah.boostedAvgOvr >= evalCah.baseAvgOvr);
});

test('Gold traits are strictly capped (0..2) and every player has 4-5 authentic standard hidden traits backed by 90x90 icons', () => {
  const zeroGoldSeasons = new Set(['CU', '25UCL', 'UP', '26VB', 'BDO', '26TOTS']);
  const maxOneGoldSeasons = new Set(['26TOTY', '26UCL', 'ICON_TM']);

  for (const tpl of PLAYER_TEMPLATES) {
    assert.ok(tpl.goldTraits && tpl.goldTraits.length >= 5 && tpl.goldTraits.length <= 7);
    const metas = tpl.goldTraits.map((name) => resolveTraitMeta(name));
    const goldCount = metas.filter((m) => m.tier === 'gold').length;
    const standardCount = metas.filter((m) => m.tier === 'standard').length;

    assert.ok(goldCount <= 2, `${tpl.id} has ${goldCount} gold traits (expected <= 2)`);
    assert.ok(
      standardCount >= 4,
      `${tpl.id} has only ${standardCount} standard traits (expected >= 4)`
    );

    if (zeroGoldSeasons.has(tpl.season)) {
      assert.equal(goldCount, 0, `${tpl.id} (${tpl.season}) must have 0 gold traits`);
    } else if (maxOneGoldSeasons.has(tpl.season)) {
      assert.ok(goldCount <= 1, `${tpl.id} (${tpl.season}) must have <= 1 gold trait`);
    }

    for (const m of metas) {
      const diskPath = path.join(process.cwd(), 'public', m.iconUrl.replace(/^\//, ''));
      assert.equal(fs.existsSync(diskPath), true, `Missing trait icon ${diskPath}`);
    }
  }
});

test('Sequential card serial numbers (#0001+) apply strictly to INFINITY_PRIME and LE seasons', () => {
  assert.equal(isSerializedSeason('INFINITY_PRIME'), true);
  assert.equal(isSerializedSeason('LE'), true);
  assert.equal(isSerializedSeason('ICON_TM'), false);
  assert.equal(isSerializedSeason('26UCL'), false);
  assert.equal(isSerializedSeason('26VB'), false);
  assert.equal(isSerializedSeason('UP'), false);

  const starter = createStarterProfile('serial_tester', 'HLV Số Thứ Tự');
  const serializedStarterCards = starter.cards.filter((c) =>
    isSerializedSeason(PLAYER_TEMPLATE_MAP[c.templateId].season)
  );
  const nonSerializedStarterCards = starter.cards.filter(
    (c) => !isSerializedSeason(PLAYER_TEMPLATE_MAP[c.templateId].season)
  );

  // Starter has zero IPRM/LE cards so serial allocation begins cleanly at #0001
  assert.equal(serializedStarterCards.length, 0);
  assert.equal(starter.nextCardSerial, 1);

  for (const c of nonSerializedStarterCards) {
    assert.equal(c.serialNumber, undefined, `Non-IPRM/LE card ${c.templateId} must not have serial`);
  }

  // Claiming Milestone 10,000 of Bi Lắc grants 1x iprm_pack + 1x le_pack
  const milestoneClaim = claimFoosballMilestoneReward(
    { ...starter, foosballSpins: 10_000 },
    10_000
  );
  assert.equal(milestoneClaim.ok, true);
  assert.equal(milestoneClaim.nextProfile.packs.le_pack, 1);
  assert.equal(milestoneClaim.nextProfile.packs.iprm_pack, 1);

  // Opening LE pack assigns 1 (formatted as '001')
  const openLe = openPacksFromProfile(milestoneClaim.nextProfile, 'le_pack', 1, () => 0.25);
  assert.equal(openLe.drawnCards.length, 1);
  assert.equal(openLe.drawnCards[0].serialNumber, 1);
  assert.equal(formatCardSerial(openLe.drawnCards[0].serialNumber), '001');
  assert.equal(openLe.nextProfile.nextCardSerial, 2);

  // Opening 26UCL pack does NOT assign or consume serial numbers
  const openUcl = openPacksFromProfile(openLe.nextProfile, 'ucl_26', 2, () => 0.4);
  assert.equal(openUcl.drawnCards.length, 2);
  assert.equal(openUcl.drawnCards[0].serialNumber, undefined);
  assert.equal(openUcl.drawnCards[1].serialNumber, undefined);
  assert.equal(openUcl.nextProfile.nextCardSerial, 2);

  // Opening IPRM pack assigns 2 (formatted as '002')
  const openIprm = openPacksFromProfile(openUcl.nextProfile, 'iprm_pack', 1, () => 0.1);
  assert.equal(openIprm.drawnCards.length, 1);
  assert.equal(openIprm.drawnCards[0].serialNumber, 2);
  assert.equal(formatCardSerial(openIprm.drawnCards[0].serialNumber), '002');
  assert.equal(openIprm.nextProfile.nextCardSerial, 3);

  // Official Release Requirement: Cards opened by an Admin account do NOT assign or consume sequential serial numbers
  const gmAccount = createMasterAdminProfile();
  const gmOpenLe = openPacksFromProfile(gmAccount, 'le_pack', 1, () => 0.25);
  assert.equal(gmOpenLe.drawnCards.length, 1);
  assert.equal(
    gmOpenLe.drawnCards[0].serialNumber,
    undefined,
    'Cards opened by admin account must NOT have serial numbers'
  );
  assert.equal(
    gmOpenLe.nextProfile.nextCardSerial,
    gmAccount.nextCardSerial,
    'Admin opening packs must NOT increment nextCardSerial'
  );

  // Master Admin initial squad must also have NO serial numbers
  for (const c of gmAccount.cards) {
    assert.equal(
      c.serialNumber,
      undefined,
      `Master Admin starting card ${c.templateId} must NOT have serial number`
    );
  }
});

test('+8 and above BP Grade Protection prevents grade drop on failed enhancement and rejects < +8', () => {
  const starter = createStarterProfile('prot_tester', 'HLV Bảo Vệ BP');
  const cardGrade8 = starter.cards.find((c) => c.grade >= BP_PROTECTION_MIN_GRADE);
  const cardGrade3 = starter.cards.find((c) => c.grade === 3);
  assert.ok(cardGrade8, 'Starter squad must include a +8 card for immediate BP protection testing');
  assert.ok(cardGrade3);

  assert.equal(canUseBpProtection(cardGrade8), true);
  assert.equal(canUseBpProtection(cardGrade3), false);

  const protCost = calculateBpProtectionCost(cardGrade8);
  assert.ok(protCost >= 5_000_000_000);
  assert.equal(calculateBpProtectionCost(cardGrade3), 0);

  const fodders = starter.cards.filter((c) => c.uid !== cardGrade8.uid).slice(0, 5);

  // Force failure (rng -> 0.999) WITH BP protection enabled -> keeps +8!
  const protectedFail = resolveCardEnhancement(
    cardGrade8,
    fodders,
    5,
    0.5,
    () => 0.999,
    true
  );
  assert.equal(protectedFail.succeeded, false);
  assert.equal(protectedFail.usedBpProtection, true);
  assert.equal(protectedFail.protectionCostBp, protCost);
  assert.equal(protectedFail.newGrade, cardGrade8.grade);
  assert.equal(protectedFail.updatedCard.grade, cardGrade8.grade);

  // Force failure WITHOUT BP protection -> drops below +8
  const unprotectedFail = resolveCardEnhancement(
    cardGrade8,
    fodders,
    5,
    0.5,
    () => 0.999,
    false
  );
  assert.equal(unprotectedFail.succeeded, false);
  assert.equal(unprotectedFail.usedBpProtection, false);
  assert.equal(unprotectedFail.protectionCostBp, 0);
  assert.ok(unprotectedFail.newGrade < cardGrade8.grade);
});

test('FC Online Shop & Tarpoi (Star Point) store purchases work across FC, BP, and Tarpoi', () => {
  assert.equal(SHOP_OFFERS.length, 24);
  const sections = new Set(SHOP_OFFERS.map((o) => o.section));
  assert.deepEqual(
    Array.from(sections).sort(),
    ['bp_chests', 'buy_tarpoi', 'packs', 'tarpoi_shop']
  );

  let profile = createStarterProfile('shop_tester', 'HLV Shop Tarpoi');
  assert.equal(profile.starPoints, 1500);

  // 1. Buy Tarpoi using BP
  const buyTarpoiBp = purchaseShopOffer(profile, 'tarpoi_buy_300_bp');
  assert.equal(buyTarpoiBp.ok, true);
  assert.equal(buyTarpoiBp.starPointsReceived, 300);
  assert.equal(buyTarpoiBp.nextProfile.starPoints, 1800);
  profile = buyTarpoiBp.nextProfile;

  // 2. Redeem Tarpoi in Shop Tarpoi for 20 Bi Lắc Loops + ICON TM pack
  const prevIcon = profile.packs.icon_tm;
  const prevLoops = profile.foosballLoops;
  const redeemLoops = purchaseShopOffer(profile, 'tarpoi_shop_bi_lac_loops_20');
  assert.equal(redeemLoops.ok, true);
  assert.equal(redeemLoops.nextProfile.packs.icon_tm, prevIcon + 1);
  assert.equal(redeemLoops.nextProfile.foosballLoops, prevLoops + 20);
  assert.ok(redeemLoops.nextProfile.starPoints < profile.starPoints);
  profile = redeemLoops.nextProfile;

  // 3. Buy Lucky BP Chest with FC
  const luckyBp = purchaseShopOffer(profile, 'shop_bp_lucky_box', () => 0.75);
  assert.equal(luckyBp.ok, true);
  assert.ok(luckyBp.bpReceived >= 12_000_000_000_000 && luckyBp.bpReceived <= 90_000_000_000_000);
});

test('Leaderboard contains zero fake NPC bots and tracks real game account types', () => {
  assert.equal(SEEDED_LEADERBOARD_MANAGERS.length, 0);

  const guestProfile = createStarterProfile('g1', 'HLV Khách', 'guest');
  const localProfile = createStarterProfile('l1', 'HLV Đăng Ký', 'local', 'hlv1');
  const cloudProfile = createStarterProfile('c1', 'HLV Cloud', 'firebase', 'hlv@cloud.vn');

  assert.equal(buildLeaderboardRowFromProfile(guestProfile, true).accountType, 'guest');
  assert.equal(buildLeaderboardRowFromProfile(localProfile, false).accountType, 'registered');
  assert.equal(buildLeaderboardRowFromProfile(cloudProfile, false).accountType, 'cloud');
});

test('Lobby Gift Codes, 7-Day Check-In, and Live HLV Missions update profile currencies and packs accurately', () => {
  assert.equal(LOBBY_GIFT_CODES.length, 4);
  assert.equal(DAILY_CHECKIN_REWARDS.length, 7);

  let profile = createStarterProfile('lobby_tester', 'HLV Sảnh Chính');
  const prevIcon = profile.packs.icon_tm;
  const prevBp = profile.bp;
  const prevTarpoi = profile.starPoints;

  // Empty & invalid gift code validation
  assert.equal(redeemGiftCode(profile, '   ', []).ok, false);
  assert.equal(redeemGiftCode(profile, 'INVALID999', []).ok, false);

  // Redeem valid gift code (case-insensitive) — grants ICON TM + Bi Lắc loops (never IPRM/LE)
  const giftRes = redeemGiftCode(profile, 'thelastdance', []);
  assert.equal(giftRes.ok, true);
  assert.equal(giftRes.normalizedCode, 'THELASTDANCE');
  assert.equal(giftRes.nextProfile.packs.icon_tm, prevIcon + 1);
  assert.equal(giftRes.nextProfile.packs.iprm_pack, 0);
  assert.equal(giftRes.nextProfile.packs.le_pack, 0);
  assert.equal(giftRes.nextProfile.bp, prevBp + 15_000_000_000_000);
  assert.equal(giftRes.nextProfile.starPoints, prevTarpoi + 300);

  // Reject duplicate gift code redemption
  assert.equal(redeemGiftCode(giftRes.nextProfile, 'THELASTDANCE', ['THELASTDANCE']).ok, false);
  profile = giftRes.nextProfile;

  // Daily check-in Day 1 succeeds and blocks duplicate same-day claim
  const check1 = claimDailyCheckIn(profile, 0, null, '2026-10-30');
  assert.equal(check1.ok, true);
  assert.equal(check1.dayClaimed, 1);
  assert.equal(check1.nextClaimedDaysCount, 1);
  assert.equal(
    claimDailyCheckIn(check1.nextProfile, 1, '2026-10-30', '2026-10-30').ok,
    false
  );
  profile = check1.nextProfile;

  // Live missions evaluate starter +8 card & OVR >= 135 as completed and claimable once
  const missions = evaluateLobbyMissions(profile, []);
  assert.equal(missions.length, 5);
  const grade8Mission = missions.find((m) => m.id === 'm_card_grade_8')!;
  assert.equal(grade8Mission.completed, true);

  const claimM = claimLobbyMissionReward(profile, 'm_card_grade_8', []);
  assert.equal(claimM.ok, true);
  assert.equal(claimM.nextProfile.packs.cu_fodder, profile.packs.cu_fodder + 2);
  assert.equal(
    claimLobbyMissionReward(claimM.nextProfile, 'm_card_grade_8', ['m_card_grade_8']).ok,
    false
  );
});

test('FC Online 100% New-Gen Lobby mechanics: Ranked/GLXH/Volta match simulation, Manager Level, Star Pass & Club Inbox', () => {
  assert.equal(HEAD_COACH_CATALOG.length, 6);
  assert.equal(FC_ONLINE_RANK_TIERS.length, 7);
  assert.equal(STAR_PASS_TIERS.length, 6);
  assert.equal(INITIAL_CLUB_INBOX.length, 3);

  // Manager Level & Rank Tiers
  const lv25 = calculateManagerLevelStatus(7350);
  assert.equal(lv25.level, 25);
  assert.equal(lv25.currentXp, 150);
  assert.equal(getRankTierForScore(2050).name, 'Thế Giới 1');
  assert.equal(getRankTierForScore(2450).name, 'Thách Đấu');
  assert.equal(getRankTierForScore(2700).name, 'Siêu Sao');

  // Ranked 1v1 & Volta 4v4 Match Simulation
  let profile = createStarterProfile('newgen_tester', 'HLV NewGen');
  const prevBp = profile.bp;
  const matchWin = simulateFcOnlineMatch({
    profile,
    squadOvr: 136,
    coachId: 'hc_ancelotti',
    currentElo: 2050,
    mode: 'ranked_1v1',
    rng: () => 0.15,
  });
  assert.equal(matchWin.outcome, 'WIN');
  assert.ok(matchWin.userGoals > matchWin.opponentGoals);
  assert.equal(matchWin.eloAfter, 2078);
  assert.equal(matchWin.nextProfile.bp, prevBp + 9_000_000_000_000);
  assert.ok(matchWin.highlights.some((h) => h.isUserGoal));
  profile = matchWin.nextProfile;

  const voltaWin = simulateFcOnlineMatch({
    profile,
    squadOvr: 136,
    coachId: 'hc_park',
    currentElo: matchWin.eloAfter,
    mode: 'volta_4v4',
    rng: () => 0.2,
  });
  assert.equal(voltaWin.outcome, 'WIN');
  assert.ok(voltaWin.userGoals >= 4);
  profile = voltaWin.nextProfile;

  // Star Pass Free & Premium FC Unlock
  const claimPremLocked = claimStarPassTierReward({
    profile,
    tier: 1,
    track: 'premium',
    starPassXp: 150,
    isPremiumUnlocked: false,
    claimedKeys: [],
  });
  assert.equal(claimPremLocked.ok, false);

  const prevFc = profile.fc;
  const unlockRes = unlockPremiumStarPass(profile, false);
  assert.equal(unlockRes.ok, true);
  assert.equal(unlockRes.nextProfile.fc, prevFc - STAR_PASS_PREMIUM_COST_FC);
  profile = unlockRes.nextProfile;

  const claimPremOk = claimStarPassTierReward({
    profile,
    tier: 1,
    track: 'premium',
    starPassXp: 150,
    isPremiumUnlocked: true,
    claimedKeys: [],
  });
  assert.equal(claimPremOk.ok, true);
  assert.equal(claimPremOk.claimKey, 'sp_1_premium');
  profile = claimPremOk.nextProfile;

  // Club Inbox Claim All — grants ICON TM & loops, ZERO iprm_pack / le_pack
  const prevIcon = profile.packs.icon_tm;
  const allIds = INITIAL_CLUB_INBOX.map((m) => m.id);
  const inboxRes = claimClubInboxMessages(profile, allIds, []);
  assert.equal(inboxRes.ok, true);
  assert.equal(inboxRes.claimedNowIds.length, 3);
  assert.equal(inboxRes.nextProfile.packs.icon_tm, prevIcon + 1);
  assert.equal(inboxRes.nextProfile.packs.iprm_pack, 0);
  assert.equal(inboxRes.nextProfile.packs.le_pack, 0);
  assert.equal(claimClubInboxMessages(inboxRes.nextProfile, allIds, allIds).ok, false);
});

test('INFINITY_PRIME and LE seasons are ultra-rare, absent from all daily missions/shop/VIP/spins, and exclusive to Milestone 10,000 of Bi Lắc', () => {
  const starter = createStarterProfile('u_rare_check', 'HLV Hiếm');
  assert.equal(starter.packs.iprm_pack, 0);
  assert.equal(starter.packs.le_pack, 0);
  assert.equal(starter.foosballLoops, 2);
  assert.equal(
    starter.cards.some((c) => {
      const s = PLAYER_TEMPLATE_MAP[c.templateId].season;
      return s === 'INFINITY_PRIME' || s === 'LE';
    }),
    false
  );

  // ICON_TM pack strictly excludes INFINITY_PRIME and LE
  assert.equal(PACK_CATALOG.icon_tm.allowedSeasons.includes('INFINITY_PRIME'), false);
  assert.equal(PACK_CATALOG.icon_tm.allowedSeasons.includes('LE'), false);

  // Legacy migration preserves foosballLoops and defaults missing iprm_pack/le_pack to 0
  const migrated = migrateLegacyProfile({
    id: 'u_legacy_foos',
    managerName: 'Legacy',
    foosballLoops: 9,
  } as any);
  assert.equal(migrated.foosballLoops, 9);
  assert.equal(migrated.packs.iprm_pack, 0);
  assert.equal(migrated.packs.le_pack, 0);

  // Absent from Daily/Live Missions, Check-in, Gift Codes, Star Pass, Inbox, SVIP Plans, VIP Tiers, and Shop
  for (const m of evaluateLobbyMissions(starter, [])) {
    assert.equal(m.bundle.packs?.iprm_pack ?? 0, 0, `Mission ${m.id} must not grant iprm_pack`);
    assert.equal(m.bundle.packs?.le_pack ?? 0, 0, `Mission ${m.id} must not grant le_pack`);
  }
  for (const d of DAILY_CHECKIN_REWARDS) {
    assert.equal(d.bundle.packs?.iprm_pack ?? 0, 0);
    assert.equal(d.bundle.packs?.le_pack ?? 0, 0);
  }
  for (const gc of LOBBY_GIFT_CODES) {
    assert.equal(gc.bundle.packs?.iprm_pack ?? 0, 0);
    assert.equal(gc.bundle.packs?.le_pack ?? 0, 0);
  }
  for (const tier of STAR_PASS_TIERS) {
    assert.equal(tier.freeBundle.packs?.iprm_pack ?? 0, 0);
    assert.equal(tier.freeBundle.packs?.le_pack ?? 0, 0);
    assert.equal(tier.premiumBundle.packs?.iprm_pack ?? 0, 0);
    assert.equal(tier.premiumBundle.packs?.le_pack ?? 0, 0);
  }
  for (const msg of INITIAL_CLUB_INBOX) {
    assert.equal(msg.bundle.packs?.iprm_pack ?? 0, 0);
    assert.equal(msg.bundle.packs?.le_pack ?? 0, 0);
  }
  for (const plan of SVIP_MEMBERSHIP_PLANS) {
    assert.notEqual(plan.packId, 'iprm_pack');
    assert.notEqual(plan.packId, 'le_pack');
  }
  for (const vipTier of VIP_REWARD_TIERS) {
    assert.notEqual(vipTier.packId, 'iprm_pack');
    assert.notEqual(vipTier.packId, 'le_pack');
  }
  for (const offer of SHOP_OFFERS) {
    assert.notEqual(offer.featuredPackId, 'iprm_pack');
    assert.notEqual(offer.featuredPackId, 'le_pack');
    for (const g of offer.packsGranted) {
      assert.notEqual(g.packId, 'iprm_pack', `Shop offer ${offer.id} must not sell iprm_pack`);
      assert.notEqual(g.packId, 'le_pack', `Shop offer ${offer.id} must not sell le_pack`);
    }
  }

  // Normal Bi Lắc goal spins (0.00 .. 0.99) never drop iprm_pack or le_pack
  for (let step = 0; step < 100; step++) {
    const r = rollSingleFoosballGoal(() => step / 100);
    assert.notEqual(r.packId, 'iprm_pack');
    assert.notEqual(r.packId, 'le_pack');
  }

  // In FOOSBALL_MILESTONES, ONLY milestone 10,000 grants iprm_pack and le_pack
  for (const ms of FOOSBALL_MILESTONES) {
    if (ms.spins < 10_000) {
      assert.notEqual(ms.rewardPackId, 'iprm_pack');
      assert.notEqual(ms.rewardPackId, 'le_pack');
      assert.notEqual(ms.bonusPackId, 'iprm_pack');
      assert.notEqual(ms.bonusPackId, 'le_pack');
    } else {
      assert.equal(ms.spins, 10_000);
      assert.equal(ms.rewardPackId, 'iprm_pack');
      assert.equal(ms.rewardPackCount, 1);
      assert.equal(ms.bonusPackId, 'le_pack');
      assert.equal(ms.bonusPackCount, 1);
      assert.equal(ms.rewardBp, 50_000_000_000_000);
    }
  }

  // Upgraded 12-milestone track includes intermediate tiers (3000, 7500) + dual packs + FC + Foosball Loops
  assert.equal(FOOSBALL_MILESTONES.length, 12);
  assert.ok(FOOSBALL_MILESTONES.some((m) => m.spins === 3000));
  assert.ok(FOOSBALL_MILESTONES.some((m) => m.spins === 7500));

  const claim30 = claimFoosballMilestoneReward({ ...starter, foosballSpins: 30 }, 30);
  assert.equal(claim30.ok, true);
  assert.equal(claim30.nextProfile.fc, starter.fc + 50);
  assert.equal(claim30.nextProfile.foosballLoops, starter.foosballLoops + 3);
  assert.equal(claim30.nextProfile.packs.ucl_25, starter.packs.ucl_25 + 3);
  assert.equal(claim30.nextProfile.packs.up_pack, starter.packs.up_pack + 1);

  // Claiming milestone 10,000 requires >= 10,000 points and awards both 1x iprm_pack + 1x le_pack
  assert.equal(
    claimFoosballMilestoneReward({ ...starter, foosballSpins: 9_999 }, 10_000).ok,
    false
  );
  const claim10k = claimFoosballMilestoneReward({ ...starter, foosballSpins: 10_000 }, 10_000);
  assert.equal(claim10k.ok, true);
  assert.equal(claim10k.nextProfile.packs.iprm_pack, 1);
  assert.equal(claim10k.nextProfile.packs.le_pack, 1);
  assert.equal(claim10k.nextProfile.bp, starter.bp + 50_000_000_000_000);
  assert.equal(claim10k.nextProfile.fc, starter.fc + 30_000);
  assert.equal(claimFoosballMilestoneReward(claim10k.nextProfile, 10_000).ok, false);

  // BP -> Foosball Loops exchange works accurately
  assert.equal(getFoosballLoopBpCost(10), 22_000_000_000_000);
  const ex10 = exchangeBpForFoosballLoops(starter, 10);
  assert.equal(ex10.ok, true);
  assert.equal(ex10.nextProfile.foosballLoops, starter.foosballLoops + 10);
  assert.equal(ex10.nextProfile.bp, starter.bp - 22_000_000_000_000);
});

test('SVIP membership plans and daily SVIP salary work purely via in-game BP and Tarpoi without VND top-up', () => {
  assert.ok(SVIP_MEMBERSHIP_PLANS.length >= 4);
  let profile = createStarterProfile('u_svip_test', 'HLV SVIP');

  const salary1 = claimDailySvipSalary(profile, null, '2026-10-30');
  assert.equal(salary1.ok, true);
  assert.ok(salary1.bpEarned > 0);
  assert.ok(salary1.fcEarned > 0);
  assert.ok(salary1.starPointsEarned > 0);
  assert.equal(salary1.nextProfile.vipPoints, profile.vipPoints + salary1.svipPointsEarned);

  const duplicateSalary = claimDailySvipSalary(salary1.nextProfile, '2026-10-30', '2026-10-30');
  assert.equal(duplicateSalary.ok, false);

  profile = salary1.nextProfile;
  const bpPlan = SVIP_MEMBERSHIP_PLANS.find((p) => p.currency === 'bp')!;
  const actBp = activateSvipPlan(profile, bpPlan.id);
  assert.equal(actBp.ok, true);
  assert.equal(actBp.nextProfile.vipPoints, profile.vipPoints + bpPlan.svipPointsGranted);
  assert.equal(actBp.nextProfile.fc, profile.fc + bpPlan.fcGranted);

  const tarpoiPlan = SVIP_MEMBERSHIP_PLANS.find((p) => p.currency === 'tarpoi')!;
  const richTarpoiProfile = { ...actBp.nextProfile, starPoints: 5_000 };
  const actTarpoi = activateSvipPlan(richTarpoiProfile, tarpoiPlan.id);
  assert.equal(actTarpoi.ok, true);
  assert.ok(actTarpoi.nextProfile.vipLevel >= richTarpoiProfile.vipLevel);

  const brokeProfile = { ...actBp.nextProfile, bp: 0, starPoints: 0 };
  assert.equal(activateSvipPlan(brokeProfile, bpPlan.id).ok, false);
  assert.equal(activateSvipPlan(brokeProfile, tarpoiPlan.id).ok, false);
});

test('PC Transfer Market Order Book generates deterministic sell/buy depth and 7-session history', () => {
  const ob = calculateMarketOrderBook('le_cr7', 5);
  assert.ok(ob.lowerBoundBp <= ob.standardPriceBp);
  assert.ok(ob.standardPriceBp <= ob.upperBoundBp);
  assert.equal(ob.sellOrders.length, 3);
  assert.equal(ob.buyOrders.length, 3);
  assert.equal(ob.recentHistoryBp.length, 7);
  assert.equal(ob.recentHistoryBp[6], ob.standardPriceBp);
  assert.ok(ob.sellOrders[0].priceBp <= ob.sellOrders[1].priceBp);
  assert.ok(ob.buyOrders[0].priceBp >= ob.buyOrders[1].priceBp);
});

test('Game Master account & remote multi-account SVIP, FC, BP, Tarpoi, Card +13, and Server Rules work deterministically', () => {
  // 1. Pre-provisioned Master GM account check
  const gm = createMasterAdminProfile();
  assert.equal(gm.vipLevel, 20);
  assert.equal(gm.fc, 999_999_999);
  assert.ok(gm.bp >= 1_000_000_000_000_000);
  assert.equal(isMasterAdminAccount(gm), true);

  const otherPlayer = createStarterProfile('hlv_target_1', 'HLV Người Chơi A', 'local', 'player_a');
  assert.equal(isMasterAdminAccount(otherPlayer), false);
  assert.equal(isMasterAdminAccount(otherPlayer, ['player_a']), true);
  assert.equal(
    isMasterAdminAccount({
      ...otherPlayer,
      usernameOrEmail: MASTER_ADMIN_OWNER_EMAIL,
    }),
    true
  );
  assert.equal(
    isMasterAdminAccount({
      ...otherPlayer,
      usernameOrEmail: MASTER_ADMIN_USERNAME,
    }),
    true
  );

  // 2. Edit SVIP of another account (SVIP 0 -> SVIP 18 -> SVIP 20)
  const sv18 = adminSetAccountSvipLevel(otherPlayer, 18);
  assert.equal(sv18.vipLevel, 18);
  assert.equal(calculateVipStatus(sv18.vipPoints).level, 18);

  const svAddPts = adminAdjustAccountVipPoints(sv18, 50_000, 'add');
  assert.equal(svAddPts.vipLevel, 20);

  // 3. Edit FC, BP, Tarpoi, and Manager Name of another account
  const fcEdited = adminModifyAccountFc(sv18, 250_000, 'set');
  assert.equal(fcEdited.fc, 250_000);
  const fcAdded = adminModifyAccountFc(fcEdited, 50_000, 'add');
  assert.equal(fcAdded.fc, 300_000);
  const fcSubbed = adminModifyAccountFc(fcAdded, 100_000, 'subtract');
  assert.equal(fcSubbed.fc, 200_000);

  const bpEdited = adminModifyAccountBp(fcSubbed, 777_000_000_000, 'set');
  assert.equal(bpEdited.bp, 777_000_000_000);

  const spEdited = adminModifyAccountTarpoi(bpEdited, 88_000, 'set');
  assert.equal(spEdited.starPoints, 88_000);

  const renamed = adminRenameAccountManager(spEdited, 'HLV Siêu Cấp VIP');
  assert.equal(renamed.managerName, 'HLV Siêu Cấp VIP');

  // 4. Grant +13 serialized card (#0001) & edit owned card grade in target account
  const grantRes = adminGrantPlayerCardToAccount(renamed, {
    templateId: 'le_cr7',
    grade: 13,
    customSerial: 1,
  });
  assert.equal(grantRes.ok, true);
  assert.equal(grantRes.grantedCard?.grade, 13);
  assert.equal(grantRes.grantedCard?.serialNumber, 1);
  assert.equal(grantRes.nextProfile.cards[0].templateId, 'le_cr7');

  const boostStarterRes = adminSetOwnedCardGradeInAccount(
    grantRes.nextProfile,
    grantRes.nextProfile.cards[1].uid,
    10
  );
  assert.equal(boostStarterRes.ok, true);
  assert.equal(boostStarterRes.nextProfile.cards[1].grade, 10);

  const removeRes = adminRemoveOwnedCardFromAccount(
    boostStarterRes.nextProfile,
    grantRes.grantedCard!.uid
  );
  assert.equal(removeRes.ok, true);
  assert.equal(
    removeRes.nextProfile.cards.some((c) => c.uid === grantRes.grantedCard!.uid),
    false
  );

  // 5. Grant season packs, God Preset, and Global Server Broadcast
  const withPacks = adminGrantPacksToAccount(removeRes.nextProfile, 'le_pack', 15, 'add');
  assert.equal(withPacks.packs.le_pack, removeRes.nextProfile.packs.le_pack + 15);

  const godProfile = adminApplyMaxGodPreset(otherPlayer);
  assert.equal(godProfile.vipLevel, 20);
  assert.ok(godProfile.fc >= 99_999_999);

  const broadcasted = adminApplyGlobalBroadcastGift([otherPlayer], {
    fcDelta: 12_345,
    bpDelta: 10_000_000_000,
    tarpoiDelta: 500,
    packId: 'iprm_pack',
    packCount: 3,
  });
  assert.equal(broadcasted[0].fc, otherPlayer.fc + 12_345);
  assert.equal(broadcasted[0].bp, otherPlayer.bp + 10_000_000_000);
  assert.equal(broadcasted[0].packs.iprm_pack, otherPlayer.packs.iprm_pack + 3);

  // 6. Global Server Rules: 100% Upgrade Rate & 0% Market Tax & Match Multiplier
  const gmRules = {
    ...DEFAULT_GLOBAL_SERVER_RULES,
    guaranteedUpgrade100: true,
    zeroMarketTax: true,
    matchRewardMultiplier: 3 as const,
  };
  const highTarget = { ...grantRes.grantedCard!, grade: 12 };
  const fodder = otherPlayer.cards[0];
  const preview100 = calculateEnhancementPreview(highTarget, [fodder], 1, gmRules);
  assert.equal(preview100.totalSuccessChance, 100);

  const outcome100 = resolveCardEnhancement(highTarget, [fodder], 1, 0.9, () => 0.9999, false, gmRules);
  assert.equal(outcome100.succeeded, true);
  assert.equal(outcome100.newGrade, 13);

  const zeroTaxQuote = calculateMarketSellQuote(highTarget, 0, gmRules);
  assert.equal(zeroTaxQuote.baseTaxBp, 0);
  assert.equal(zeroTaxQuote.effectiveTaxPercent, 0);
  assert.equal(zeroTaxQuote.netBp, zeroTaxQuote.grossBp);

  const normalMatch = simulateFcOnlineMatch({
    profile: otherPlayer,
    squadOvr: 130,
    coachId: 'hc_ancelotti',
    currentElo: 2000,
    mode: 'ranked_1v1',
    rng: () => 0.2,
  });
  const boostedMatch = simulateFcOnlineMatch({
    profile: otherPlayer,
    squadOvr: 130,
    coachId: 'hc_ancelotti',
    currentElo: 2000,
    mode: 'ranked_1v1',
    rng: () => 0.2,
    serverRules: gmRules,
  });
  assert.equal(boostedMatch.bpEarned, normalMatch.bpEarned * 3);
  assert.equal(boostedMatch.nextProfile.elo, boostedMatch.eloAfter);
  assert.equal(
    boostedMatch.nextProfile.wins,
    (otherPlayer.wins ?? 14) + (boostedMatch.outcome === 'WIN' ? 1 : 0)
  );
});

test('Cross-device multi-category leaderboards (ranked, squadOvr, squadValue, vip, bestOvr) and exact-once server broadcast gifts work across devices', () => {
  const adminProfile = createMasterAdminProfile();
  assert.equal(adminProfile.managerName, 'Quản Trị Viên FC Online');
  assert.equal(adminProfile.isDelegatedAdmin, true);
  assert.equal(adminProfile.elo, 2350);
  assert.ok(calculateProfileSquadOvr(adminProfile) >= 135);

  const pcPlayer = {
    ...createStarterProfile('hlv_pc_1', 'HLV Máy Bàn', 'local', 'hlvpc'),
    elo: 2520,
    wins: 38,
    draws: 4,
    losses: 6,
    managerXp: 15_000,
    squadOvr: 141,
    deviceLabel: 'PC Windows',
  };
  const mobileGuest = {
    ...createStarterProfile('guest_dev_mobile1', 'HLV Di Động', 'guest'),
    elo: 2190,
    wins: 19,
    draws: 2,
    losses: 5,
    managerXp: 9_200,
    squadOvr: 138,
    deviceLabel: 'Điện thoại Android',
  };
  const cloudVip = {
    ...adminSetAccountSvipLevel(
      createStarterProfile('cloud_uid_99', 'HLV Cloud Mac', 'firebase', 'mac@fco.vn'),
      19
    ),
    elo: 2110,
    squadOvr: 134,
    deviceLabel: 'Máy Mac',
  };

  const rows = [
    buildLeaderboardRowFromProfile(pcPlayer, false),
    buildLeaderboardRowFromProfile(mobileGuest, false),
    buildLeaderboardRowFromProfile(cloudVip, false),
    buildLeaderboardRowFromProfile(adminProfile, true),
  ];

  assert.equal(rows[0].deviceLabel, 'PC Windows');
  assert.equal(rows[1].deviceLabel, 'Điện thoại Android');
  assert.equal(rows[2].accountType, 'cloud');

  // 1. Ranked Elo Leaderboard
  const byRanked = sortLeaderboard(rows, 'ranked');
  assert.equal(byRanked[0].ownerId, 'hlv_pc_1');
  assert.equal(byRanked[1].ownerId, adminProfile.id);
  assert.equal(byRanked[2].ownerId, 'guest_dev_mobile1');

  // 2. Squad OVR Leaderboard
  const bySquadOvr = sortLeaderboard(rows, 'squadOvr');
  assert.ok((bySquadOvr[0].squadOvr ?? 0) >= (bySquadOvr[1].squadOvr ?? 0));
  assert.ok((bySquadOvr[1].squadOvr ?? 0) >= (bySquadOvr[2].squadOvr ?? 0));

  // 3. Squad Value Leaderboard
  const byValue = sortLeaderboard(rows, 'squadValue');
  assert.ok(byValue[0].squadValue >= byValue[1].squadValue);

  // 4. SVIP Leaderboard
  const byVip = sortLeaderboard(rows, 'vip');
  assert.equal(byVip[0].vipLevel, 20);
  assert.equal(byVip[1].vipLevel, 19);

  // 5. Best Card OVR Leaderboard
  const byBestOvr = sortLeaderboard(rows, 'bestOvr');
  assert.ok(byBestOvr[0].bestCardOvr >= byBestOvr[1].bestCardOvr);

  // Exact-once cross-device broadcast gift claiming
  const broadcastGift = {
    id: 'bcast_cross_device_01',
    createdAtMs: Date.now(),
    actorName: 'Quản Trị Viên FC Online',
    fcDelta: 25_000,
    bpDelta: 50_000_000_000,
    tarpoiDelta: 1_200,
    svipBonusPoints: 300,
    packId: 'le_pack' as const,
    packCount: 2,
  };

  const firstClaim = applyBroadcastGiftsToProfile(mobileGuest, [broadcastGift]);
  assert.equal(firstClaim.changed, true);
  assert.equal(firstClaim.claimedCount, 1);
  assert.equal(firstClaim.nextProfile.fc, mobileGuest.fc + 25_000);
  assert.equal(firstClaim.nextProfile.packs.le_pack, mobileGuest.packs.le_pack + 2);

  // Second sync from another channel (e.g. Cloud + Express Hub) must NOT double-claim
  const duplicateClaim = applyBroadcastGiftsToProfile(firstClaim.nextProfile, [broadcastGift]);
  assert.equal(duplicateClaim.changed, false);
  assert.equal(duplicateClaim.claimedCount, 0);
  assert.equal(duplicateClaim.nextProfile.fc, firstClaim.nextProfile.fc);
});

test('Mobile custom miniface Data URLs are sanitized, equipped on cards, and rejected if invalid or oversized', () => {
  const validWebpDataUrl = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const validPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.equal(sanitizeCustomMinifaceValue('/minifaces/ucl26_mbappe.png'), '/minifaces/ucl26_mbappe.png');
  assert.equal(sanitizeCustomMinifaceValue(validWebpDataUrl), validWebpDataUrl);
  assert.equal(sanitizeCustomMinifaceValue(validPngDataUrl), validPngDataUrl);
  assert.equal(sanitizeCustomMinifaceValue('data:image/svg+xml;base64,PHN2Zz4='), undefined);
  assert.equal(sanitizeCustomMinifaceValue('https://evil.example.com/a.png'), undefined);
  assert.equal(
    sanitizeCustomMinifaceValue(`data:image/png;base64,${'A'.repeat(170_000)}`),
    undefined
  );

  const starter = createStarterProfile('uid_mf', 'HLV Miniface');
  const firstUid = starter.cards[0].uid;
  const equipped = equipCardMiniface(starter.cards, firstUid, validWebpDataUrl);
  assert.equal(equipped[0].customMinifaceUrl, validWebpDataUrl);

  const migrated = migrateLegacyProfile({
    ...starter,
    cards: equipped,
  });
  assert.equal(migrated.cards[0].customMinifaceUrl, validWebpDataUrl);

  const reset = equipCardMiniface(equipped, firstUid, undefined);
  assert.equal(reset[0].customMinifaceUrl, undefined);
});

test('GLXH 2D tactical circle simulation runs 11v11 stat-driven AI, completes 90 minutes, and gives higher-stat teams a clear edge', () => {
  const strongProfile = createMasterAdminProfile();
  const state = createGlxhMatchState({
    profile: strongProfile,
    coachId: 'hc_guardiola',
    currentElo: 2150,
    seed: 202605,
  });

  assert.equal(state.players.length, 22);
  assert.equal(state.players.filter((p) => p.side === 'home').length, 11);
  assert.equal(state.players.filter((p) => p.side === 'away').length, 11);
  assert.equal(state.finished, false);

  const initialBallX = state.ball.x;
  for (let i = 0; i < 40; i++) {
    stepGlxhSimulation(state, 0.05);
  }
  assert.ok(state.simElapsedSec > 1.5);
  assert.ok(
    state.homePassesCompleted + state.awayPassesCompleted > 0 ||
      Math.abs(state.ball.x - initialBallX) > 0.1
  );

  fastForwardGlxhMatch(state);
  assert.equal(state.finished, true);
  assert.equal(state.minute, 90);

  const poss = computeGlxhPossessionPercent(state);
  assert.ok(poss >= 25 && poss <= 78);

  const simResult = buildSimulatedMatchResultFromGlxh({
    state,
    profile: strongProfile,
    coachId: 'hc_guardiola',
  });
  assert.equal(simResult.mode, 'glxh_manager');
  assert.equal(simResult.userGoals, state.homeGoals);
  assert.equal(simResult.opponentGoals, state.awayGoals);
  assert.ok(simResult.bpEarned >= 3_500_000_000_000);
  assert.ok(simResult.nextProfile.bp > strongProfile.bp);

  // Verify stat intelligence advantage: maxed 150+ OVR squad dominates weak 95 OVR opponent across 6 seeds
  let totalGoalsFor = 0;
  let totalGoalsAgainst = 0;
  for (let s = 1; s <= 6; s++) {
    const testMatch = createGlxhMatchState({
      profile: strongProfile,
      coachId: 'hc_ancelotti',
      currentElo: 2100,
      seed: 9000 + s * 73,
      opponentOvrOverride: 95,
    });
    fastForwardGlxhMatch(testMatch);
    totalGoalsFor += testMatch.homeGoals;
    totalGoalsAgainst += testMatch.awayGoals;
  }
  assert.ok(
    totalGoalsFor > totalGoalsAgainst,
    `Expected stronger stat squad to outscore 95 OVR opponent (got ${totalGoalsFor} vs ${totalGoalsAgainst})`
  );
});

test('Vibration haptics escalate for high-OVR pack reveals, upgrades, and safely invoke window.navigator.vibrate', () => {
  // Standard pack open success uses crisp success pulse
  assert.deepEqual(
    resolvePackRevealVibrationPattern({ ovr: 118, season: 'UP' }),
    HAPTIC_PATTERNS.success
  );

  // High OVR (123+) escalates to walkout burst
  assert.deepEqual(
    resolvePackRevealVibrationPattern({ ovr: 125, season: '26UCL' }),
    HAPTIC_PATTERNS.walkout
  );

  // Elite OVR (132+) or LE / IPRM / ICON_TM 128+ escalates to intense double-crescendo pattern
  assert.deepEqual(
    resolvePackRevealVibrationPattern({ ovr: 138, season: 'LE' }),
    HAPTIC_PATTERNS.eliteWalkout
  );
  assert.deepEqual(
    resolvePackRevealVibrationPattern({ ovr: 129, season: 'ICON_TM' }),
    HAPTIC_PATTERNS.eliteWalkout
  );

  // Enhancement vibration scaling
  assert.deepEqual(
    resolveUpgradeVibrationPattern({ succeeded: false, newGrade: 4, newOvr: 128 }),
    HAPTIC_PATTERNS.failure
  );
  assert.deepEqual(
    resolveUpgradeVibrationPattern({ succeeded: true, newGrade: 8, newOvr: 127 }),
    HAPTIC_PATTERNS.eliteWalkout
  );
  assert.deepEqual(
    resolveUpgradeVibrationPattern({ succeeded: true, newGrade: 6, newOvr: 134 }),
    HAPTIC_PATTERNS.eliteWalkout
  );

  // Node environment without window safely returns false
  assert.equal(vibrateDevice([30, 40, 80]), false);

  // Mocked window.navigator.vibrate receives the exact pattern
  const recorded: Array<number | number[]> = [];
  const prevWindow = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = {
    navigator: {
      vibrate: (pattern: number | number[]) => {
        recorded.push(pattern);
        return true;
      },
    },
  };
  try {
    const ok = vibrateDevice(HAPTIC_PATTERNS.eliteWalkout);
    assert.equal(ok, true);
    assert.deepEqual(recorded, [HAPTIC_PATTERNS.eliteWalkout]);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = prevWindow;
    }
  }
});

test('shouldReportFirebaseConfigError only triggers on persistent online failure or missing config', () => {
  // Missing config always reports
  assert.equal(
    shouldReportFirebaseConfigError({
      errorMessage: 'Failed to get document because the client is offline.',
      isNavigatorOnline: true,
      retryAttempt: 0,
      hasProjectId: false,
      hasDatabaseId: true,
    }),
    true
  );

  // Device itself is offline -> do not blame Firebase configuration
  assert.equal(
    shouldReportFirebaseConfigError({
      errorMessage: 'Failed to get document because the client is offline.',
      isNavigatorOnline: false,
      retryAttempt: 1,
      hasProjectId: true,
      hasDatabaseId: true,
    }),
    false
  );

  // First transient offline error while online waits for retry
  assert.equal(
    shouldReportFirebaseConfigError({
      errorMessage: 'Failed to get document because the client is offline.',
      isNavigatorOnline: true,
      retryAttempt: 0,
      hasProjectId: true,
      hasDatabaseId: true,
    }),
    false
  );

  // Permission denied proves backend was reached (not config/offline failure)
  assert.equal(
    shouldReportFirebaseConfigError({
      errorMessage: 'Missing or insufficient permissions.',
      isNavigatorOnline: true,
      retryAttempt: 1,
      hasProjectId: true,
      hasDatabaseId: true,
    }),
    false
  );

  // Persistent client-offline error after retry while online + valid config reports
  assert.equal(
    shouldReportFirebaseConfigError({
      errorMessage: 'Failed to get document because the client is offline.',
      isNavigatorOnline: true,
      retryAttempt: 1,
      hasProjectId: true,
      hasDatabaseId: true,
    }),
    true
  );
});

test('estimateFodderGaugeContribution scales cleanly by OVR delta and matches preview gauge total', () => {
  const equalSlot = estimateFodderGaugeContribution(120, 110); // required = 110 => delta = 0 => 1.00 bar (20%)
  assert.equal(equalSlot.bars, 1);
  assert.equal(equalSlot.percent, 20);

  const highSlot = estimateFodderGaugeContribution(120, 130); // clamped at 1.35 bars
  assert.equal(highSlot.bars, 1.35);

  const lowSlot = estimateFodderGaugeContribution(135, 100); // clamped at 0.32 bars
  assert.equal(lowSlot.bars, 0.32);

  const starter = createStarterProfile('g1', 'HLV Gauge', 'guest');
  const target = starter.cards[0];
  const fodders = starter.cards.slice(1, 6);
  const preview = calculateEnhancementPreview(target, fodders, 0);
  const manualSum = fodders.reduce(
    (sum, f) => sum + estimateFodderGaugeContribution(target.ovr, f.ovr).bars,
    0
  );
  assert.equal(preview.gaugePercent, Math.min(100, Math.round((manualSum / 5) * 100)));
});




