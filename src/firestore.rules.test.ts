import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesSource = fs.readFileSync(
  path.resolve(process.cwd(), 'firestore.rules'),
  'utf8'
);
const blueprint = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8')
);

test('firestore.rules enforces global default deny and covers every blueprint collection', () => {
  assert.ok(rulesSource.includes("rules_version = '2';"));
  assert.ok(rulesSource.includes('match /{document=**}'));
  assert.ok(rulesSource.includes('allow read, write: if false;'));

  assert.ok(blueprint.firestore['/users/{userId}']);
  assert.ok(blueprint.firestore['/users/{userId}/cards/{cardId}']);
  assert.ok(blueprint.firestore['/cloud_managed_accounts/{accountId}']);
  assert.ok(blueprint.firestore['/cloud_managed_accounts/{accountId}/cards/{cardId}']);
  assert.ok(blueprint.firestore['/leaderboard_entries/{userId}']);
  assert.ok(blueprint.firestore['/server_config/{configId}']);
  assert.ok(blueprint.firestore['/server_broadcasts/{broadcastId}']);

  assert.ok(rulesSource.includes('match /admins/{adminId}'));
  assert.ok(rulesSource.includes('match /users/{userId}'));
  assert.ok(rulesSource.includes('match /cloud_managed_accounts/{accountId}'));
  assert.ok(rulesSource.includes('match /cards/{cardId}'));
  assert.ok(rulesSource.includes('match /leaderboard_entries/{userId}'));
  assert.ok(rulesSource.includes('match /server_config/{configId}'));
  assert.ok(rulesSource.includes('match /server_broadcasts/{broadcastId}'));
});

test('Dirty Dozen security gates and cross-web/cross-device admin & leaderboard invariants exist in production firestore.rules', () => {
  // 1. Verified email gate on writes
  assert.ok(rulesSource.includes('request.auth.token.email_verified == true'));
  // 2. Identity spoofing guard (ownerId bound to path targetUserId + auth uid or admin)
  assert.ok(rulesSource.includes('data.ownerId == targetUserId'));
  assert.ok(rulesSource.includes('(userId == request.auth.uid || isAdmin())'));
  // 3 & 4. Private user enumeration forbidden + null-safe non-existent doc reads
  assert.ok(rulesSource.includes('allow list: if false;'));
  assert.ok(rulesSource.includes('resource == null ||'));
  // 5. Shadow field blocking & RBAC preservation on owner updates
  assert.ok(rulesSource.includes('data.keys().hasOnly('));
  assert.ok(rulesSource.includes('incoming().diff(existing()).affectedKeys().hasOnly('));
  assert.ok(rulesSource.includes('isOwnerRbacPreservedOnUserUpdate()'));
  assert.ok(rulesSource.includes('isLegacyUserDocSchema()'));
  // 6 & 7. Resource & ID poisoning bounds
  assert.ok(rulesSource.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"));
  assert.ok(rulesSource.includes('data.managerName.size() <= 32'));
  // 8. Master gate parent check on subcollections & cross-web managed accounts
  assert.ok(rulesSource.includes('isParentUserDocValid(userId)'));
  assert.ok(rulesSource.includes('isParentCloudManagedDocValid(accountId)'));
  assert.ok(rulesSource.includes('isValidCloudManagedAccountDoc(incoming(), accountId)'));
  assert.ok(rulesSource.includes('isValidCloudManagedCardDoc(incoming(), accountId)'));
  // 9. Strict server timestamps
  assert.ok(rulesSource.includes('incoming().updatedAt == request.time'));
  assert.ok(rulesSource.includes('incoming().createdAt == request.time'));
  // 10. Immutable fields on card update & broadcast immutability
  assert.ok(rulesSource.includes('incoming().templateId == existing().templateId'));
  assert.ok(rulesSource.includes('isValidServerRulesDoc(incoming(), configId)'));
  assert.ok(rulesSource.includes('isValidServerBroadcastDoc(incoming(), broadcastId)'));
  // 11. Bounded arrays
  assert.ok(rulesSource.includes('isValidIntList(data.claimedVipRewards, 24)'));
  assert.ok(rulesSource.includes('isValidStringIdList(data.claimedBroadcastIds, 50)'));
  // 12. Competitive rankings + VIP bounds + Pack allowlist
  assert.ok(rulesSource.includes('data.vipLevel >= 0 && data.vipLevel <= 20'));
  assert.ok(rulesSource.includes('data.elo >= 1000 && data.elo <= 10000'));
  assert.ok(rulesSource.includes('data.squadOvr >= 0 && data.squadOvr <= 300'));
  assert.ok(
    rulesSource.includes(
      'data.foosballJackpotFc is int && data.foosballJackpotFc >= 100 && data.foosballJackpotFc <= 1000000'
    )
  );
  for (const key of [
    'iprm_pack',
    'le_pack',
    'ucl_26',
    'icon_tm',
    'toty_26',
    'tots_26',
    'vb_26',
    'bdo_pack',
    'up_pack',
    'ucl_25',
    'cu_fodder',
  ]) {
    assert.ok(rulesSource.includes(`'${key}'`), `Expected pack key ${key} in firestore.rules`);
  }
  assert.ok(blueprint.entities.UserSave.properties.elo);
  assert.ok(blueprint.entities.CloudManagedAccountDoc.properties.accountId);
  assert.ok(blueprint.entities.LeaderboardEntry.properties.elo);
  assert.ok(blueprint.entities.LeaderboardEntry.properties.squadOvr);
  assert.ok(blueprint.entities.ServerRulesDoc.properties.guaranteedUpgrade100);
  assert.ok(blueprint.entities.ServerBroadcastDoc.properties.broadcastId);
});

