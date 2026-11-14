import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  enableNetwork,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  DEFAULT_GLOBAL_SERVER_RULES,
  MASTER_ADMIN_ALT_USERNAME,
  MASTER_ADMIN_DEFAULT_PASSWORD,
  MASTER_ADMIN_OWNER_EMAIL,
  MASTER_ADMIN_PROFILE_ID,
  MASTER_ADMIN_USERNAME,
  adminApplyGlobalBroadcastGift,
  createMasterAdminProfile,
  isMasterAdminAccount,
  sanitizeGlobalServerRules,
} from './game/adminRules';
import { PLAYER_TEMPLATE_MAP } from './game/catalog';
import {
  MAX_CARD_GRADE,
  MAX_SAFE_BP,
  buildLeaderboardRowFromProfile,
  calculateManagerLevelStatus,
  calculateProfileSquadOvr,
  calculateSquadSummary,
  calculateVipStatus,
  clampFoosballJackpotFc,
  createStarterProfile,
  getCumulativePointsForVipLevel,
  isSerializedSeason,
  migrateLegacyProfile,
  sanitizeCustomMinifaceValue,
  sanitizeManagerName,
  truncateUtf8Bytes,
} from './game/rules';
import {
  GlobalServerRules,
  LeaderboardRow,
  ManagerProfile,
  OwnedCard,
  PackId,
  PackInventory,
  ServerBroadcastGift,
} from './game/types';

const TOKEN_REFRESH_SAFETY_BUFFER_MS = 6 * 60 * 1000;
const LEGACY_IDB_CLEANED_FLAG = 'fco_cleaned_legacy_fbase_idb_v1';

interface InternalFirebaseTokenShape {
  stsTokenManager?: {
    accessToken?: string;
    expirationTime?: number;
  };
}

function purgeExpiredFirebaseAuthStorageSync(forceAll: boolean = false): void {
  if (typeof window === 'undefined') return;
  const stores: Storage[] = [];
  try {
    stores.push(window.localStorage);
  } catch {
    // Ignore storage access errors
  }
  try {
    stores.push(window.sessionStorage);
  } catch {
    // Ignore storage access errors
  }

  const now = Date.now();
  for (const store of stores) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key || !key.startsWith('firebase:authUser:')) continue;
        if (forceAll) {
          keysToRemove.push(key);
          continue;
        }
        const raw = store.getItem(key);
        if (!raw) {
          keysToRemove.push(key);
          continue;
        }
        try {
          const parsed = JSON.parse(raw) as InternalFirebaseTokenShape;
          const exp = parsed?.stsTokenManager?.expirationTime;
          const accessToken = parsed?.stsTokenManager?.accessToken;
          if (
            !accessToken ||
            typeof exp !== 'number' ||
            !Number.isFinite(exp) ||
            exp <= now + TOKEN_REFRESH_SAFETY_BUFFER_MS
          ) {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      }
      for (const k of keysToRemove) {
        store.removeItem(k);
      }
    } catch {
      // Ignore storage iteration errors
    }
  }

  // Clean up legacy IndexedDB Firebase Auth store from older sessions so stale expired tokens never linger
  try {
    if (
      typeof window.indexedDB !== 'undefined' &&
      (forceAll || window.localStorage.getItem(LEGACY_IDB_CLEANED_FLAG) !== '1')
    ) {
      window.localStorage.setItem(LEGACY_IDB_CLEANED_FLAG, '1');
      window.indexedDB.deleteDatabase('firebaseLocalStorageDb');
    }
  } catch {
    // Ignore IndexedDB cleanup errors
  }
}

const app = initializeApp(firebaseConfig);
export const auth = createSafeFirebaseAuth();
export const db = getFirestoreInstance();
export const googleProvider = new GoogleAuthProvider();

function createSafeFirebaseAuth() {
  if (typeof window === 'undefined') {
    return getAuth(app);
  }
  purgeExpiredFirebaseAuthStorageSync(false);
  try {
    return initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

function getFirestoreInstance() {
  if (typeof window === 'undefined') {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        experimentalLongPollingOptions: {
          timeoutSeconds: 20,
        },
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export function hasUsableFirebaseUserSession(
  user: User | null | undefined = auth.currentUser
): user is User {
  if (!user) return false;
  const sts = (user as unknown as InternalFirebaseTokenShape)?.stsTokenManager;
  if (sts && typeof sts.expirationTime === 'number') {
    return sts.expirationTime > Date.now() + 30_000;
  }
  return true;
}

function isTokenServiceErrorMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('token-service-api') ||
    lower.includes('securetoken') ||
    lower.includes('fetching auth token failed') ||
    lower.includes('auth/user-token-expired') ||
    lower.includes('auth/invalid-user-token')
  );
}

export function isOfflineOrTokenServiceError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const combined = `${code} ${msg}`;
  if (isTokenServiceErrorMessage(combined)) {
    return true;
  }
  const lower = combined.toLowerCase();
  return (
    lower.includes('the client is offline') ||
    lower.includes('client is offline') ||
    lower.includes('unavailable') ||
    lower.includes('network-request-failed')
  );
}

function recoverFromBrokenTokenIfNeeded(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  if (isTokenServiceErrorMessage(`${code} ${msg}`)) {
    purgeExpiredFirebaseAuthStorageSync(true);
    signOut(auth).catch(() => {});
  }
}

function setupProactiveTokenExpiryGuard(): void {
  if (typeof window === 'undefined') return;
  let expiryTimer: number | null = null;

  onIdTokenChanged(auth, (user) => {
    if (expiryTimer !== null) {
      window.clearTimeout(expiryTimer);
      expiryTimer = null;
    }
    if (!user) return;
    const expMs = (user as unknown as InternalFirebaseTokenShape)?.stsTokenManager?.expirationTime;
    if (typeof expMs !== 'number' || !Number.isFinite(expMs)) return;

    // Check 5m30s before token expiry (30s before Firebase Auth's internal 5m refresh timer)
    const delayMs = Math.max(0, expMs - Date.now() - 330_000);
    expiryTimer = window.setTimeout(async () => {
      try {
        const resp = await fetch(
          `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=refresh_token&refresh_token=probe_status',
          }
        );
        if (resp.status === 403) {
          // Token Service API is disabled in GCP project; sign out cleanly before Firestore WebChannel breaks
          purgeExpiredFirebaseAuthStorageSync(true);
          await signOut(auth).catch(() => {});
        }
      } catch {
        // Ignore network probe error
      }
    }, delayMs);
  });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionCheckInFlight: Promise<void> | null = null;
let connectionValidated = false;

export function shouldReportFirebaseConfigError(params: {
  errorMessage: string;
  isNavigatorOnline: boolean;
  retryAttempt: number;
  hasProjectId: boolean;
  hasDatabaseId: boolean;
}): boolean {
  if (!params.hasProjectId || !params.hasDatabaseId) {
    return true;
  }
  if (!params.isNavigatorOnline) {
    return false;
  }
  if (!params.errorMessage.includes('the client is offline')) {
    return false;
  }
  return params.retryAttempt >= 1;
}

async function testConnection(retryAttempt: number = 0): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  if (retryAttempt === 0 && connectionCheckInFlight) {
    return connectionCheckInFlight;
  }

  const run = async (attempt: number): Promise<void> => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      connectionValidated = true;
    } catch (error) {
      recoverFromBrokenTokenIfNeeded(error);
      const errorMessage = error instanceof Error ? error.message : String(error ?? '');
      const isNavigatorOnline =
        typeof navigator === 'undefined' ? true : navigator.onLine !== false;

      if (errorMessage.includes('the client is offline')) {
        if (!isNavigatorOnline) {
          return;
        }
        if (attempt < 1) {
          await enableNetwork(db).catch(() => {});
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
          return run(attempt + 1);
        }
        if (
          shouldReportFirebaseConfigError({
            errorMessage,
            isNavigatorOnline,
            retryAttempt: attempt,
            hasProjectId: Boolean(firebaseConfig.projectId),
            hasDatabaseId: Boolean(firebaseConfig.firestoreDatabaseId),
          })
        ) {
          console.error('Please check your Firebase configuration.');
        }
      } else {
        // Any server-side response (e.g., permission-denied) confirms backend reachability
        connectionValidated = true;
      }
    }
  };

  if (retryAttempt === 0) {
    connectionCheckInFlight = run(0).finally(() => {
      connectionCheckInFlight = null;
    });
    return connectionCheckInFlight;
  }
  return run(retryAttempt);
}

if (typeof window !== 'undefined') {
  setupProactiveTokenExpiryGuard();
  testConnection(0);
  window.addEventListener('online', () => {
    enableNetwork(db).catch(() => {});
    if (!connectionValidated) {
      testConnection(0);
    }
  });
}

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'doc_default';
}

const DEVICE_UID_STORAGE_KEY = 'fco_pc_device_uid_v1';

export function getOrCreateDeviceUid(): string {
  if (typeof window === 'undefined') return 'server_node';
  try {
    const existing = window.localStorage.getItem(DEVICE_UID_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{6,64}$/.test(existing)) {
      return existing;
    }
    const created = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(DEVICE_UID_STORAGE_KEY, created);
    return created;
  } catch {
    return 'dev_browser';
  }
}

export function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Thiết bị Web';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Điện thoại Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone / iPad';
  if (/Windows/i.test(ua)) return 'PC Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Máy Mac';
  if (/Linux/i.test(ua)) return 'PC Linux';
  return 'Thiết bị Web';
}

export function getCanonicalOwnerIdForProfile(profile: ManagerProfile): string {
  if (profile.authMode === 'guest') {
    return `guest_${getOrCreateDeviceUid()}`;
  }
  return profile.id;
}

export function getCanonicalSummaryKeyForProfile(profile: ManagerProfile): string {
  if (profile.authMode === 'firebase') {
    return `cloud:${sanitizeFirestoreId(profile.id)}`;
  }
  if (profile.authMode === 'local') {
    const acct = (profile.usernameOrEmail || profile.id).trim().toLowerCase();
    return `local:${acct}`;
  }
  return `guest:${getCanonicalOwnerIdForProfile(profile)}`;
}

export function sanitizeCustomMinifaceUrl(raw: unknown): string | undefined {
  return sanitizeCustomMinifaceValue(raw);
}

export function toSafeInt(
  val: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  const floored = Math.floor(val);
  if (!Number.isFinite(floored)) return fallback;
  return Math.max(min, Math.min(max, floored));
}

export function sanitizeDeviceLabel(raw: unknown, fallback: string = 'Thiết bị Web'): string {
  const cleaned = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  const bounded = truncateUtf8Bytes(cleaned, 40).trim();
  return bounded.length >= 2 ? bounded : fallback;
}

export function sanitizeBoundText(raw: unknown, maxBytes: number, fallback: string): string {
  const cleaned = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  const bounded = truncateUtf8Bytes(cleaned, maxBytes).trim();
  return bounded.length >= 1 ? bounded : fallback;
}

export function sanitizeIntList(raw: unknown, maxLen: number = 24): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    .slice(0, maxLen)
    .map((n) => Math.trunc(n));
}

function isFirestoreTimestamp(val: unknown): boolean {
  return Boolean(
    val &&
      typeof val === 'object' &&
      'toMillis' in val &&
      typeof (val as { toMillis?: unknown }).toMillis === 'function'
  );
}

export function clampPackMap(packs: PackInventory): PackInventory {
  const clamp = (n: unknown) => toSafeInt(n, 0, 100_000, 0);
  const src = (packs ?? {}) as Partial<PackInventory>;
  return {
    iprm_pack: clamp(src.iprm_pack),
    le_pack: clamp(src.le_pack),
    ucl_26: clamp(src.ucl_26),
    vb_26: clamp(src.vb_26),
    icon_tm: clamp(src.icon_tm),
    toty_26: clamp(src.toty_26),
    tots_26: clamp(src.tots_26),
    bdo_pack: clamp(src.bdo_pack),
    up_pack: clamp(src.up_pack),
    ucl_25: clamp(src.ucl_25),
    cu_fodder: clamp(src.cu_fodder),
  };
}

let delegatedCloudAdminUid: string | null = null;

export async function refreshDelegatedCloudAdminStatus(user: User | null): Promise<boolean> {
  if (!hasUsableFirebaseUserSession(user) || !user.emailVerified) {
    delegatedCloudAdminUid = null;
    return false;
  }
  if ((user.email || '').trim().toLowerCase() === MASTER_ADMIN_OWNER_EMAIL) {
    delegatedCloudAdminUid = user.uid;
    return true;
  }
  const safeUid = sanitizeFirestoreId(user.uid);
  try {
    const adminSnap = await getDoc(doc(db, 'admins', safeUid));
    if (adminSnap.exists()) {
      delegatedCloudAdminUid = user.uid;
      return true;
    }
  } catch (error) {
    recoverFromBrokenTokenIfNeeded(error);
  }
  delegatedCloudAdminUid = null;
  return false;
}

export function hasCloudAdminWriteAuthority(): boolean {
  const u = auth.currentUser;
  if (!hasUsableFirebaseUserSession(u) || !u.emailVerified) return false;
  if ((u.email || '').trim().toLowerCase() === MASTER_ADMIN_OWNER_EMAIL) return true;
  return delegatedCloudAdminUid === u.uid;
}

export function resolveCrossWebSummaryAndDocId(rawInputOrSummaryKey: string): {
  summaryKey: string;
  docId: string;
  accountKey: string;
  authMode: 'local' | 'guest' | 'firebase';
  cloudUid?: string;
} {
  const trimmed = rawInputOrSummaryKey.trim();
  if (trimmed.startsWith('cloud:')) {
    const rawUid = sanitizeFirestoreId(trimmed.slice('cloud:'.length));
    return {
      summaryKey: `cloud:${rawUid}`,
      docId: sanitizeFirestoreId(`cloud_${rawUid}`),
      accountKey: rawUid,
      authMode: 'firebase',
      cloudUid: rawUid,
    };
  }
  if (trimmed.startsWith('guest:') || trimmed.startsWith('guest_')) {
    const stripped = sanitizeFirestoreId(trimmed.replace(/^guest:/i, ''));
    const guestId = stripped.startsWith('guest_') ? stripped : `guest_${stripped}`;
    const safeDocId = sanitizeFirestoreId(guestId);
    return {
      summaryKey: `guest:${safeDocId}`,
      docId: safeDocId,
      accountKey: safeDocId,
      authMode: 'guest',
    };
  }
  const cleanLocal = trimmed.replace(/^local:/i, '').trim().toLowerCase() || 'hlv_fconline';
  const safeDocId = sanitizeFirestoreId(`local_${cleanLocal}`);
  return {
    summaryKey: `local:${cleanLocal}`,
    docId: safeDocId,
    accountKey: cleanLocal,
    authMode: 'local',
  };
}

export async function loadOrCreateCloudProfile(user: User): Promise<ManagerProfile> {
  const uid = sanitizeFirestoreId(user.uid);
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  const buildLocalCloudFallback = (): ManagerProfile => {
    const cachedSnap = readCloudSnapshots()[uid];
    if (cachedSnap && cachedSnap.profile) {
      const isCloudMaster =
        (user.email || '').trim().toLowerCase() === MASTER_ADMIN_OWNER_EMAIL &&
        user.emailVerified;
      if (isCloudMaster || cachedSnap.isDelegatedAdmin) {
        setGmSessionUnlocked(true);
      }
      return {
        ...cachedSnap.profile,
        id: uid,
        authMode: 'firebase',
        usernameOrEmail: user.email || cachedSnap.profile.usernameOrEmail,
        deviceLabel: detectDeviceLabel(),
      };
    }
    const isCloudMaster =
      (user.email || '').trim().toLowerCase() === MASTER_ADMIN_OWNER_EMAIL &&
      user.emailVerified;
    if (isCloudMaster) {
      setGmSessionUnlocked(true);
      return {
        ...createMasterAdminProfile(),
        id: uid,
        managerName: sanitizeManagerName(user.displayName || 'Quản Trị Viên FC Online'),
        authMode: 'firebase',
        usernameOrEmail: user.email || MASTER_ADMIN_OWNER_EMAIL,
        deviceLabel: detectDeviceLabel(),
      };
    }
    return {
      ...createStarterProfile(
        uid,
        user.displayName || (user.email ? user.email.split('@')[0] : 'HLV Cloud'),
        'firebase',
        user.email || undefined
      ),
      deviceLabel: detectDeviceLabel(),
    };
  };

  if (!hasUsableFirebaseUserSession(user)) {
    purgeExpiredFirebaseAuthStorageSync(true);
    signOut(auth).catch(() => {});
    return buildLocalCloudFallback();
  }

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return buildLocalCloudFallback();
    }
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (existingSnap && existingSnap.exists()) {
    const data = existingSnap.data();
    const cardsPath = `users/${uid}/cards`;
    let cards: OwnedCard[] = [];
    try {
      const cardsQ = query(
        collection(db, 'users', uid, 'cards'),
        where('ownerId', '==', uid),
        limit(100)
      );
      const cardSnaps = await getDocs(cardsQ);
      cards = cardSnaps.docs.map((d) => {
        const cd = d.data();
        const templateId = String(cd.templateId);
        const tpl = PLAYER_TEMPLATE_MAP[templateId];
        const customMf = sanitizeCustomMinifaceUrl(cd.customMinifaceUrl);
        const rawSerial = Number(cd.serialNumber);
        const validSerial =
          tpl &&
          isSerializedSeason(tpl.season) &&
          Number.isFinite(rawSerial) &&
          rawSerial >= 1
            ? Math.min(100_000_000, Math.floor(rawSerial))
            : undefined;
        return {
          uid: d.id,
          templateId,
          grade: Number(cd.grade) || 1,
          ovr: Number(cd.ovr) || 105,
          valueBp: Number(cd.valueBp) || 10_000_000_000,
          acquiredAt: Date.now(),
          ...(customMf ? { customMinifaceUrl: customMf } : {}),
          ...(validSerial ? { serialNumber: validSerial } : {}),
        };
      });
    } catch (error) {
      if (isOfflineOrTokenServiceError(error)) {
        recoverFromBrokenTokenIfNeeded(error);
        return buildLocalCloudFallback();
      }
      handleFirestoreError(error, OperationType.LIST, cardsPath);
    }

    const isDelegatedCloudAdmin = await refreshDelegatedCloudAdminStatus(user);
    const isCloudMasterAdmin =
      ((user.email || '').trim().toLowerCase() === MASTER_ADMIN_OWNER_EMAIL &&
        user.emailVerified) ||
      isDelegatedCloudAdmin ||
      Boolean(data.isDelegatedAdmin);

    const migrated = migrateLegacyProfile({
      id: uid,
      managerName: sanitizeManagerName(data.managerName || user.displayName || 'HLV Cloud'),
      fc: Number(data.fc ?? 500),
      bp: Number(data.bp ?? 500_000_000_000),
      starPoints: typeof data.starPoints === 'number' ? data.starPoints : undefined,
      nextCardSerial: typeof data.nextCardSerial === 'number' ? data.nextCardSerial : undefined,
      vipPoints: Number(data.vipPoints ?? 60),
      vipLevel: Number(data.vipLevel ?? calculateVipStatus(Number(data.vipPoints ?? 60)).level),
      foosballLoops: Number(data.foosballLoops ?? 0),
      foosballSpins: Number(data.foosballSpins ?? 0),
      foosballJackpotFc: clampFoosballJackpotFc(Number(data.foosballJackpotFc ?? 100)),
      packs: data.packs ?? undefined,
      claimedMilestones: Array.isArray(data.claimedMilestones)
        ? data.claimedMilestones.slice(0, 24).map(Number)
        : [],
      claimedVipRewards: Array.isArray(data.claimedVipRewards)
        ? data.claimedVipRewards.slice(0, 24).map(Number)
        : [],
      cards,
      formation: typeof data.formation === 'string' ? (data.formation as ManagerProfile['formation']) : undefined,
      activeTeamColorId:
        typeof data.activeTeamColorId === 'string' ? data.activeTeamColorId : undefined,
      lineupSlotUids: Array.isArray(data.lineupSlotUids)
        ? data.lineupSlotUids.slice(0, 11).filter((u): u is string => typeof u === 'string')
        : undefined,
      elo: typeof data.elo === 'number' ? data.elo : undefined,
      wins: typeof data.wins === 'number' ? data.wins : undefined,
      draws: typeof data.draws === 'number' ? data.draws : undefined,
      losses: typeof data.losses === 'number' ? data.losses : undefined,
      managerXp: typeof data.managerXp === 'number' ? data.managerXp : undefined,
      squadOvr: typeof data.squadOvr === 'number' ? data.squadOvr : undefined,
      claimedBroadcastIds: Array.isArray(data.claimedBroadcastIds)
        ? data.claimedBroadcastIds.slice(0, 50).filter((id): id is string => typeof id === 'string')
        : undefined,
      adminRevision: typeof data.adminRevision === 'number' ? data.adminRevision : 0,
      isBanned: Boolean(data.isBanned),
      banReason: typeof data.banReason === 'string' ? data.banReason : '',
      isDelegatedAdmin: isCloudMasterAdmin,
      deviceLabel: detectDeviceLabel(),
      authMode: 'firebase',
      usernameOrEmail: user.email || undefined,
    });

    if (isCloudMasterAdmin) {
      setGmSessionUnlocked(true);
    }

    return {
      ...migrated,
      packs: clampPackMap(migrated.packs),
    };
  }

  await refreshDelegatedCloudAdminStatus(user);

  const isCloudMasterAdmin =
    (user.email || '').trim().toLowerCase() === MASTER_ADMIN_OWNER_EMAIL &&
    user.emailVerified;

  const baseStarter = isCloudMasterAdmin
    ? {
        ...createMasterAdminProfile(),
        id: uid,
        managerName: sanitizeManagerName(user.displayName || 'Quản Trị Viên FC Online'),
        authMode: 'firebase' as const,
        usernameOrEmail: user.email || MASTER_ADMIN_OWNER_EMAIL,
        deviceLabel: detectDeviceLabel(),
      }
    : {
        ...createStarterProfile(
          uid,
          user.displayName || (user.email ? user.email.split('@')[0] : 'HLV Cloud'),
          'firebase',
          user.email || undefined
        ),
        deviceLabel: detectDeviceLabel(),
      };

  if (isCloudMasterAdmin) {
    setGmSessionUnlocked(true);
  }

  if (user.emailVerified) {
    await syncProfileToCloud(baseStarter, true);
  }
  return baseStarter;
}

export async function syncProfileToCloud(
  profile: ManagerProfile,
  isNewDocument: boolean = false
): Promise<void> {
  const currentUser = auth.currentUser;
  if (
    !hasUsableFirebaseUserSession(currentUser) ||
    !currentUser.emailVerified ||
    profile.authMode !== 'firebase'
  ) {
    return;
  }

  const uid = sanitizeFirestoreId(currentUser.uid);
  const summary = calculateSquadSummary(profile.cards);
  const vip = calculateVipStatus(profile.vipPoints);
  const userPath = `users/${uid}`;
  const lbPath = `leaderboard_entries/${uid}`;

  const safeFormation =
    typeof profile.formation === 'string' &&
    /^[a-zA-Z0-9-]{5,16}$/.test(profile.formation)
      ? profile.formation
      : '4-3-3';
  const safeTeamColorId =
    typeof profile.activeTeamColorId === 'string' &&
    /^[a-zA-Z0-9_-]{2,48}$/.test(profile.activeTeamColorId)
      ? profile.activeTeamColorId
      : 'auto';
  const safeLineupSlots = Array.isArray(profile.lineupSlotUids)
    ? profile.lineupSlotUids
        .filter((u): u is string => typeof u === 'string' && u.length >= 1 && u.length <= 128)
        .map((u) => sanitizeFirestoreId(u))
        .slice(0, 11)
    : [];

  const squadOvr = toSafeInt(calculateProfileSquadOvr(profile), 0, 300, 110);
  const managerLevel = toSafeInt(
    calculateManagerLevelStatus(profile.managerXp ?? 7_350).level,
    1,
    100,
    1
  );
  const safeElo = toSafeInt(profile.elo, 1000, 10_000, 2050);
  const safeWins = toSafeInt(profile.wins, 0, 1_000_000, 14);
  const safeDraws = toSafeInt(profile.draws, 0, 1_000_000, 3);
  const safeLosses = toSafeInt(profile.losses, 0, 1_000_000, 4);
  const safeManagerXp = toSafeInt(profile.managerXp, 0, 100_000_000, 7_350);
  const safeClaimedBroadcasts = Array.isArray(profile.claimedBroadcastIds)
    ? profile.claimedBroadcastIds
        .filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id))
        .map((id) => sanitizeFirestoreId(id))
        .slice(-50)
    : [];
  const deviceLabel = sanitizeDeviceLabel(profile.deviceLabel || detectDeviceLabel(), 'Thiết bị Web');
  const safeBestCardName = sanitizeBoundText(summary.bestCardName, 60, 'Cầu thủ FC');
  const safeBestCardSeason = sanitizeBoundText(summary.bestCardSeason, 16, '26UCL');

  const userPayload = {
    ownerId: uid,
    managerName: sanitizeManagerName(profile.managerName),
    deviceLabel,
    fc: toSafeInt(profile.fc, 0, 1_000_000_000, 0),
    bp: toSafeInt(profile.bp, 0, MAX_SAFE_BP, 0),
    starPoints: toSafeInt(profile.starPoints, 0, 1_000_000_000, 0),
    nextCardSerial: toSafeInt(profile.nextCardSerial, 1, 100_000_000, 11),
    vipPoints: toSafeInt(vip.totalPoints, 0, 100_000_000, 0),
    vipLevel: toSafeInt(vip.level, 0, 20, 0),
    foosballLoops: toSafeInt(profile.foosballLoops, 0, 1_000_000, 0),
    foosballSpins: toSafeInt(profile.foosballSpins, 0, 10_000_000, 0),
    foosballJackpotFc: clampFoosballJackpotFc(profile.foosballJackpotFc),
    squadValue: toSafeInt(summary.squadValue, 0, MAX_SAFE_BP, 0),
    bestCardOvr: toSafeInt(summary.bestCardOvr, 0, 300, 0),
    bestCardName: safeBestCardName,
    bestCardSeason: safeBestCardSeason,
    bestCardGrade: toSafeInt(summary.bestCardGrade, 1, MAX_CARD_GRADE, 1),
    packs: clampPackMap(profile.packs),
    claimedMilestones: sanitizeIntList(profile.claimedMilestones, 24),
    claimedVipRewards: sanitizeIntList(profile.claimedVipRewards, 24),
    formation: safeFormation,
    activeTeamColorId: safeTeamColorId,
    ...(safeLineupSlots.length > 0 ? { lineupSlotUids: safeLineupSlots } : {}),
    elo: safeElo,
    wins: safeWins,
    draws: safeDraws,
    losses: safeLosses,
    managerXp: safeManagerXp,
    squadOvr,
    ...(safeClaimedBroadcasts.length > 0 ? { claimedBroadcastIds: safeClaimedBroadcasts } : {}),
    updatedAt: serverTimestamp(),
  };

  try {
    const userDocRef = doc(db, 'users', uid);
    const existingCheck = await getDocFromServer(userDocRef).catch(() => getDoc(userDocRef));
    if (!existingCheck.exists()) {
      await setDoc(userDocRef, {
        ...userPayload,
        createdAt: serverTimestamp(),
      });
    } else {
      const existingData = existingCheck.data();
      if (Boolean(existingData.isBanned) && !hasCloudAdminWriteAuthority()) {
        return;
      }
      const existingRev = toSafeInt(existingData.adminRevision, 0, 100_000_000, 0);
      if (!isNewDocument && existingRev > (profile.adminRevision ?? 0)) {
        return;
      }
      if (
        existingData.ownerId === uid &&
        isFirestoreTimestamp(existingData.createdAt)
      ) {
        await updateDoc(userDocRef, {
          ...userPayload,
          ...(safeLineupSlots.length === 0 && 'lineupSlotUids' in existingData
            ? { lineupSlotUids: [] }
            : {}),
          ...(safeClaimedBroadcasts.length === 0 && 'claimedBroadcastIds' in existingData
            ? { claimedBroadcastIds: [] }
            : {}),
        });
      } else {
        const safeExistingBanReason =
          'banReason' in existingData && typeof existingData.banReason === 'string'
            ? truncateUtf8Bytes(existingData.banReason, 100)
            : undefined;
        await setDoc(userDocRef, {
          ...userPayload,
          ...('isBanned' in existingData ? { isBanned: Boolean(existingData.isBanned) } : {}),
          ...(safeExistingBanReason !== undefined ? { banReason: safeExistingBanReason } : {}),
          ...('isDelegatedAdmin' in existingData
            ? { isDelegatedAdmin: Boolean(existingData.isDelegatedAdmin) }
            : {}),
          ...('adminRevision' in existingData ? { adminRevision: existingRev } : {}),
          createdAt: isFirestoreTimestamp(existingData.createdAt)
            ? existingData.createdAt
            : serverTimestamp(),
        });
      }
    }
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  try {
    const lbPayload = {
      ownerId: uid,
      boardScope: 'GLOBAL',
      managerName: sanitizeManagerName(profile.managerName),
      vipLevel: toSafeInt(vip.level, 0, 20, 0),
      vipPoints: toSafeInt(vip.totalPoints, 0, 100_000_000, 0),
      squadValue: toSafeInt(summary.squadValue, 0, MAX_SAFE_BP, 0),
      bestCardOvr: toSafeInt(summary.bestCardOvr, 0, 300, 0),
      bestCardName: safeBestCardName,
      bestCardSeason: safeBestCardSeason,
      bestCardGrade: toSafeInt(summary.bestCardGrade, 1, MAX_CARD_GRADE, 1),
      elo: safeElo,
      wins: safeWins,
      draws: safeDraws,
      losses: safeLosses,
      managerLevel,
      squadOvr,
      deviceLabel,
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'leaderboard_entries', uid), lbPayload);
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, lbPath);
  }

  // Sync top 25 cards in batch while preserving immutable createdAt on existing card docs
  try {
    const existingCardsSnap = await getDocs(
      query(collection(db, 'users', uid, 'cards'), where('ownerId', '==', uid), limit(100))
    );
    const existingCardMap = new Map<string, Record<string, unknown>>();
    for (const d of existingCardsSnap.docs) {
      existingCardMap.set(d.id, d.data());
    }

    const batch = writeBatch(db);
    const topCards = [...profile.cards]
      .sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp)
      .slice(0, 25);
    const keepIds = new Set<string>();

    for (const card of topCards) {
      const cid = sanitizeFirestoreId(card.uid);
      keepIds.add(cid);
      const customMf = sanitizeCustomMinifaceUrl(card.customMinifaceUrl);
      const safeTplId = sanitizeFirestoreId(card.templateId).slice(0, 64);
      const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
      const validSerial =
        tpl &&
        isSerializedSeason(tpl.season) &&
        typeof card.serialNumber === 'number' &&
        Number.isFinite(card.serialNumber) &&
        card.serialNumber >= 1
          ? Math.min(100_000_000, Math.floor(card.serialNumber))
          : undefined;
      const prevDoc = existingCardMap.get(cid);
      const preservedCreatedAt =
        prevDoc && prevDoc.templateId === safeTplId && isFirestoreTimestamp(prevDoc.createdAt)
          ? prevDoc.createdAt
          : serverTimestamp();

      batch.set(doc(db, 'users', uid, 'cards', cid), {
        ownerId: uid,
        templateId: safeTplId,
        grade: Math.max(1, Math.min(MAX_CARD_GRADE, Math.floor(card.grade || 1))),
        ovr: Math.max(1, Math.min(300, Math.floor(card.ovr || 100))),
        valueBp: Math.max(0, Math.min(MAX_SAFE_BP, Math.floor(card.valueBp || 0))),
        ...(customMf ? { customMinifaceUrl: customMf } : {}),
        ...(validSerial ? { serialNumber: validSerial } : {}),
        createdAt: preservedCreatedAt,
        updatedAt: serverTimestamp(),
      });
    }

    let removedCount = 0;
    for (const oldId of existingCardMap.keys()) {
      if (!keepIds.has(oldId) && removedCount < 25) {
        batch.delete(doc(db, 'users', uid, 'cards', oldId));
        removedCount += 1;
      }
    }

    await batch.commit();
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/cards`);
  }
}

export function subscribeGlobalLeaderboard(
  onRows: (rows: LeaderboardRow[]) => void
): () => void {
  const q = query(
    collection(db, 'leaderboard_entries'),
    where('boardScope', '==', 'GLOBAL'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows: LeaderboardRow[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          ownerId: String(data.ownerId || d.id),
          managerName: String(data.managerName || 'HLV'),
          vipLevel: Number(data.vipLevel || 0),
          vipPoints: Number(data.vipPoints || 0),
          squadValue: Number(data.squadValue || 0),
          bestCardOvr: Number(data.bestCardOvr || 110),
          bestCardName: String(data.bestCardName || 'Cầu thủ'),
          bestCardSeason: String(data.bestCardSeason || '26TOTY'),
          bestCardGrade: Number(data.bestCardGrade || 1),
          elo: typeof data.elo === 'number' ? data.elo : 2050,
          wins: typeof data.wins === 'number' ? data.wins : 14,
          draws: typeof data.draws === 'number' ? data.draws : 3,
          losses: typeof data.losses === 'number' ? data.losses : 4,
          managerLevel: typeof data.managerLevel === 'number' ? data.managerLevel : 25,
          squadOvr: typeof data.squadOvr === 'number' ? data.squadOvr : 130,
          ...(typeof data.deviceLabel === 'string' && data.deviceLabel
            ? { deviceLabel: data.deviceLabel }
            : {}),
          accountType: 'cloud',
        };
      });
      onRows(rows);
    },
    (error) => {
      if (isOfflineOrTokenServiceError(error)) {
        recoverFromBrokenTokenIfNeeded(error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, 'leaderboard_entries');
    }
  );
}

export function subscribeCloudServerRules(
  onRules: (rules: GlobalServerRules) => void
): () => void {
  const ref = doc(db, 'server_config', 'global_rules');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onRules(sanitizeGlobalServerRules(data as Partial<GlobalServerRules>));
    },
    () => {
      // Fallback gracefully when global_rules doc is not yet created
    }
  );
}

export async function publishCloudServerRules(
  rules: GlobalServerRules,
  actorName: string
): Promise<void> {
  if (!hasCloudAdminWriteAuthority()) return;
  const clean = sanitizeGlobalServerRules(rules);
  const path = 'server_config/global_rules';
  try {
    await setDoc(doc(db, 'server_config', 'global_rules'), {
      configId: 'global_rules',
      guaranteedUpgrade100: clean.guaranteedUpgrade100,
      upgradeRateMultiplier: clean.upgradeRateMultiplier,
      zeroMarketTax: clean.zeroMarketTax,
      matchRewardMultiplier: clean.matchRewardMultiplier,
      serverAnnouncement: truncateUtf8Bytes(clean.serverAnnouncement, 140),
      updatedBy: sanitizeManagerName(actorName),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeCloudBroadcasts(
  onBroadcasts: (gifts: ServerBroadcastGift[]) => void
): () => void {
  const q = query(
    collection(db, 'server_broadcasts'),
    where('scope', '==', 'GLOBAL'),
    limit(35)
  );
  return onSnapshot(
    q,
    (snap) => {
      const gifts: ServerBroadcastGift[] = snap.docs
        .map((d) => {
          const data = d.data();
          const tsMs =
            data.createdAt && typeof data.createdAt.toMillis === 'function'
              ? Number(data.createdAt.toMillis())
              : Date.now();
          return {
            id: String(data.broadcastId || d.id),
            createdAtMs: tsMs,
            actorName: String(data.actorName || 'Quản Trị Viên'),
            fcDelta: Number(data.fcDelta || 0),
            bpDelta: Number(data.bpDelta || 0),
            tarpoiDelta: Number(data.tarpoiDelta || 0),
            svipBonusPoints: Number(data.svipBonusPoints || 0),
            packId: (String(data.packId || 'ucl_26') as PackId),
            packCount: Number(data.packCount || 0),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onBroadcasts(gifts);
    },
    () => {
      // Fallback gracefully if offline
    }
  );
}

export async function publishCloudBroadcast(gift: ServerBroadcastGift): Promise<void> {
  if (!hasCloudAdminWriteAuthority()) return;
  const bid = sanitizeFirestoreId(gift.id);
  const path = `server_broadcasts/${bid}`;
  try {
    await setDoc(doc(db, 'server_broadcasts', bid), {
      broadcastId: bid,
      scope: 'GLOBAL',
      actorName: sanitizeManagerName(gift.actorName),
      fcDelta: Math.max(0, Math.min(100_000_000, Math.floor(gift.fcDelta))),
      bpDelta: Math.max(0, Math.min(5_000_000_000_000_000, Math.floor(gift.bpDelta))),
      tarpoiDelta: Math.max(0, Math.min(100_000_000, Math.floor(gift.tarpoiDelta))),
      svipBonusPoints: Math.max(0, Math.min(1_000_000, Math.floor(gift.svipBonusPoints))),
      packId: gift.packId,
      packCount: Math.max(0, Math.min(1_000, Math.floor(gift.packCount))),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Local HLV Account Vault + Master GM Account Control Engine
const LOCAL_ACCOUNTS_KEY = 'fco_pc_registered_accounts_v1';
const CLOUD_SAVED_SNAPSHOTS_KEY = 'fco_pc_saved_cloud_accounts_v1';
const GUEST_SNAPSHOT_KEY = 'fco_pc_guest_snapshot_v1';
const ACTIVE_SESSION_KEY = 'fco_pc_active_session_v1';
const LAST_SAVED_AT_KEY = 'fco_pc_last_saved_at_v1';
const GM_SESSION_UNLOCKED_KEY = 'fco_pc_gm_session_unlocked_v1';

interface StoredLocalAccount {
  accountKey: string;
  passwordHash: string;
  rememberLogin?: boolean;
  lastSavedAt?: number;
  isBanned?: boolean;
  banReason?: string;
  isDelegatedAdmin?: boolean;
  profile: ManagerProfile;
}

interface StoredCloudSnapshot {
  accountKey: string;
  lastSavedAt: number;
  isBanned?: boolean;
  banReason?: string;
  isDelegatedAdmin?: boolean;
  profile: ManagerProfile;
}

export interface SavedAccountSummary {
  accountKey: string;
  managerName: string;
  usernameOrEmail: string;
  authMode: 'local' | 'firebase';
  vipLevel: number;
  squadValue: number;
  bestCardOvr: number;
  cardCount: number;
  bp: number;
  fc: number;
  isMasterAdmin?: boolean;
  isBanned?: boolean;
  lastSavedAt: number;
}

export interface ManagedAccountEntry {
  summaryKey: string; // 'local:...' | 'guest:...' | 'cloud:...'
  accountKey: string;
  managerName: string;
  usernameOrEmail: string;
  authMode: 'guest' | 'local' | 'firebase';
  deviceLabel?: string;
  elo?: number;
  squadOvr?: number;
  vipLevel: number;
  vipPoints: number;
  fc: number;
  bp: number;
  starPoints: number;
  squadValue: number;
  bestCardOvr: number;
  bestCardName: string;
  cardCount: number;
  packCount: number;
  isBanned: boolean;
  banReason: string;
  isDelegatedAdmin: boolean;
  isMasterAdmin: boolean;
  lastSavedAt: number;
}

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h_${(h >>> 0).toString(16)}`;
}

export function isGmSessionUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(GM_SESSION_UNLOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setGmSessionUnlocked(unlocked: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (unlocked) {
      window.sessionStorage.setItem(GM_SESSION_UNLOCKED_KEY, '1');
    } else {
      window.sessionStorage.removeItem(GM_SESSION_UNLOCKED_KEY);
    }
  } catch {
    // Ignore storage error
  }
}

export function isCurrentFirebaseUserCloudAdmin(): boolean {
  const u = auth.currentUser;
  if (!hasUsableFirebaseUserSession(u) || !u.emailVerified || !u.email) return false;
  return u.email.trim().toLowerCase() === MASTER_ADMIN_OWNER_EMAIL;
}

function readLocalAccounts(): Record<string, StoredLocalAccount> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, StoredLocalAccount>) : {};
    const normalized: Record<string, StoredLocalAccount> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && v.profile) {
        normalized[k.toLowerCase()] = {
          ...v,
          accountKey: k.toLowerCase(),
          rememberLogin: v.rememberLogin !== false,
          lastSavedAt: typeof v.lastSavedAt === 'number' ? v.lastSavedAt : Date.now(),
          isBanned: Boolean(v.isBanned),
          banReason: typeof v.banReason === 'string' ? v.banReason : '',
          isDelegatedAdmin: Boolean(v.isDelegatedAdmin),
          profile: migrateLegacyProfile(
            v.profile as unknown as Partial<ManagerProfile> & Record<string, unknown>
          ),
        };
      }
    }

    // Provision the Administrator Game Account internally without auto-pinning it in regular players' Saved Vaults
    if (!normalized[MASTER_ADMIN_USERNAME]) {
      const gmProfile = createMasterAdminProfile();
      normalized[MASTER_ADMIN_USERNAME] = {
        accountKey: MASTER_ADMIN_USERNAME,
        passwordHash: simpleHash(MASTER_ADMIN_DEFAULT_PASSWORD),
        rememberLogin: false,
        lastSavedAt: 0,
        isBanned: false,
        banReason: '',
        isDelegatedAdmin: true,
        profile: gmProfile,
      };
      try {
        window.localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(normalized));
      } catch {
        // Ignore storage quota issues
      }
    }

    return normalized;
  } catch {
    return {};
  }
}

function writeLocalAccounts(accounts: Record<string, StoredLocalAccount>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // Ignore storage quota issues
  }
}

function readCloudSnapshots(): Record<string, StoredCloudSnapshot> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CLOUD_SAVED_SNAPSHOTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredCloudSnapshot>;
    const normalized: Record<string, StoredCloudSnapshot> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && v.profile) {
        normalized[k] = {
          accountKey: k,
          lastSavedAt: typeof v.lastSavedAt === 'number' ? v.lastSavedAt : Date.now(),
          isBanned: Boolean(v.isBanned),
          banReason: typeof v.banReason === 'string' ? v.banReason : '',
          isDelegatedAdmin: Boolean(v.isDelegatedAdmin),
          profile: migrateLegacyProfile(
            v.profile as unknown as Partial<ManagerProfile> & Record<string, unknown>
          ),
        };
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function writeCloudSnapshots(snaps: Record<string, StoredCloudSnapshot>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLOUD_SAVED_SNAPSHOTS_KEY, JSON.stringify(snaps));
  } catch {
    // Ignore storage error
  }
}

function readGuestSnapshot(): { profile: ManagerProfile; lastSavedAt: number; isBanned?: boolean; banReason?: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GUEST_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      profile?: Partial<ManagerProfile> & Record<string, unknown>;
      lastSavedAt?: number;
      isBanned?: boolean;
      banReason?: string;
    };
    if (!parsed || !parsed.profile) return null;
    return {
      profile: {
        ...migrateLegacyProfile(parsed.profile),
        authMode: 'guest',
      },
      lastSavedAt: typeof parsed.lastSavedAt === 'number' ? parsed.lastSavedAt : Date.now(),
      isBanned: Boolean(parsed.isBanned),
      banReason: typeof parsed.banReason === 'string' ? parsed.banReason : '',
    };
  } catch {
    return null;
  }
}

function writeGuestSnapshot(
  profile: ManagerProfile,
  meta?: { isBanned?: boolean; banReason?: string }
): void {
  if (typeof window === 'undefined') return;
  try {
    const prev = readGuestSnapshot();
    window.localStorage.setItem(
      GUEST_SNAPSHOT_KEY,
      JSON.stringify({
        profile: {
          ...profile,
          authMode: 'guest',
          foosballLoops: Math.max(0, Math.min(1_000_000, Math.floor(profile.foosballLoops ?? 0))),
        },
        lastSavedAt: Date.now(),
        isBanned: meta?.isBanned ?? prev?.isBanned ?? false,
        banReason: meta?.banReason ?? prev?.banReason ?? '',
      })
    );
  } catch {
    // Ignore storage error
  }
}

export function getDelegatedAdminKeys(): string[] {
  const accounts = readLocalAccounts();
  const cloudSnaps = readCloudSnapshots();
  const keys: string[] = [];
  for (const acc of Object.values(accounts)) {
    if (acc.isDelegatedAdmin) {
      keys.push(acc.accountKey.toLowerCase());
      keys.push(acc.profile.id.toLowerCase());
    }
  }
  for (const snap of Object.values(cloudSnaps)) {
    if (snap.isDelegatedAdmin) {
      keys.push(snap.accountKey.toLowerCase());
      if (snap.profile.usernameOrEmail) {
        keys.push(snap.profile.usernameOrEmail.toLowerCase());
      }
    }
  }
  return keys;
}

export function checkProfileHasAdminAccess(profile: ManagerProfile): boolean {
  if (hasCloudAdminWriteAuthority()) return true;
  return isMasterAdminAccount(profile, getDelegatedAdminKeys());
}

export function getLocalLeaderboardRows(): LeaderboardRow[] {
  const accounts = readLocalAccounts();
  return Object.values(accounts)
    .filter(
      (acc) =>
        !acc.isBanned &&
        !(
          acc.accountKey === MASTER_ADMIN_USERNAME &&
          acc.rememberLogin === false &&
          (acc.lastSavedAt ?? 0) === 0
        )
    )
    .map((acc) => buildLeaderboardRowFromProfile(acc.profile, false));
}

export function getSavedAccountSummaries(): SavedAccountSummary[] {
  const accounts = readLocalAccounts();
  const cloudSnaps = readCloudSnapshots();
  const delegated = getDelegatedAdminKeys();
  const list: SavedAccountSummary[] = [];

  for (const acc of Object.values(accounts)) {
    if (acc.rememberLogin === false) continue;
    const summary = calculateSquadSummary(acc.profile.cards);
    const vip = calculateVipStatus(acc.profile.vipPoints);
    list.push({
      accountKey: `local:${acc.accountKey}`,
      managerName: sanitizeManagerName(acc.profile.managerName),
      usernameOrEmail: acc.profile.usernameOrEmail || acc.accountKey,
      authMode: 'local',
      vipLevel: vip.level,
      squadValue: summary.squadValue,
      bestCardOvr: summary.bestCardOvr,
      cardCount: acc.profile.cards.length,
      bp: acc.profile.bp,
      fc: acc.profile.fc,
      isMasterAdmin: isMasterAdminAccount(acc.profile, delegated),
      isBanned: Boolean(acc.isBanned),
      lastSavedAt: acc.lastSavedAt ?? Date.now(),
    });
  }

  for (const snap of Object.values(cloudSnaps)) {
    const summary = calculateSquadSummary(snap.profile.cards);
    const vip = calculateVipStatus(snap.profile.vipPoints);
    list.push({
      accountKey: `cloud:${snap.accountKey}`,
      managerName: sanitizeManagerName(snap.profile.managerName),
      usernameOrEmail: snap.profile.usernameOrEmail || 'Google Cloud HLV',
      authMode: 'firebase',
      vipLevel: vip.level,
      squadValue: summary.squadValue,
      bestCardOvr: summary.bestCardOvr,
      cardCount: snap.profile.cards.length,
      bp: snap.profile.bp,
      fc: snap.profile.fc,
      isMasterAdmin: isMasterAdminAccount(snap.profile, delegated),
      isBanned: Boolean(snap.isBanned),
      lastSavedAt: snap.lastSavedAt,
    });
  }

  return list.sort((a, b) => b.lastSavedAt - a.lastSavedAt);
}

export function getLastAccountSavedTimestamp(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(LAST_SAVED_AT_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function saveProfileLocally(profile: ManagerProfile): void {
  if (typeof window === 'undefined') return;
  try {
    const cleanProfile: ManagerProfile = {
      ...profile,
      foosballLoops: Math.max(0, Math.min(1_000_000, Math.floor(profile.foosballLoops ?? 0))),
    };
    const now = Date.now();
    window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(cleanProfile));
    window.localStorage.setItem(LAST_SAVED_AT_KEY, String(now));

    if (checkProfileHasAdminAccess(cleanProfile)) {
      setGmSessionUnlocked(true);
    }

    if (cleanProfile.authMode === 'guest') {
      writeGuestSnapshot(cleanProfile);
    } else if (cleanProfile.authMode === 'local' && cleanProfile.usernameOrEmail) {
      const key = cleanProfile.usernameOrEmail.toLowerCase();
      const accounts = readLocalAccounts();
      if (accounts[key]) {
        accounts[key] = {
          ...accounts[key],
          lastSavedAt: now,
          profile: cleanProfile,
        };
        writeLocalAccounts(accounts);
      }
    } else if (cleanProfile.authMode === 'firebase') {
      const cloudSnaps = readCloudSnapshots();
      cloudSnaps[cleanProfile.id] = {
        ...(cloudSnaps[cleanProfile.id] ?? {}),
        accountKey: cleanProfile.id,
        lastSavedAt: now,
        profile: cleanProfile,
      };
      writeCloudSnapshots(cloudSnaps);
    }
  } catch {
    // Ignore storage error
  }
}

export function forceSaveManagerAccount(profile: ManagerProfile): { savedAt: number } {
  saveProfileLocally(profile);
  if (profile.authMode === 'firebase') {
    syncProfileToCloud(profile, false).catch(() => {});
  }
  syncProfileWithServerHub(profile).catch(() => {});
  return { savedAt: Date.now() };
}

export function switchToSavedAccount(
  summaryKey: string,
  gmBypass: boolean = false
): ManagerProfile {
  if (summaryKey.startsWith('guest:')) {
    const guestSnap = readGuestSnapshot();
    if (!guestSnap) {
      const fresh = createStarterProfile('guest_default', 'HLV Khách', 'guest');
      saveProfileLocally(fresh);
      return fresh;
    }
    if (guestSnap.isBanned && !gmBypass) {
      throw new Error(
        `Phiên CLB này đã bị Khóa bởi GM Kiểm Soát Game. Lý do: ${
          guestSnap.banReason || 'Vi phạm quy định máy chủ'
        }`
      );
    }
    saveProfileLocally(guestSnap.profile);
    return guestSnap.profile;
  }

  if (summaryKey.startsWith('local:')) {
    const rawKey = summaryKey.slice('local:'.length).toLowerCase();
    const accounts = readLocalAccounts();
    const found = accounts[rawKey];
    if (!found) {
      throw new Error('Không tìm thấy dữ liệu tài khoản đã lưu trên thiết bị.');
    }
    if (found.isBanned && !gmBypass && rawKey !== MASTER_ADMIN_USERNAME) {
      throw new Error(
        `Tài khoản "${found.profile.managerName}" đã bị Khóa bởi GM Kiểm Soát Game. Lý do: ${
          found.banReason || 'Vi phạm quy định máy chủ'
        }`
      );
    }
    saveProfileLocally(found.profile);
    return found.profile;
  }

  if (summaryKey.startsWith('cloud:')) {
    const rawId = summaryKey.slice('cloud:'.length);
    const snaps = readCloudSnapshots();
    const found = snaps[rawId];
    if (!found) {
      throw new Error('Không tìm thấy bản lưu tài khoản Cloud trên thiết bị.');
    }
    if (found.isBanned && !gmBypass) {
      throw new Error(
        `Tài khoản Cloud "${found.profile.managerName}" đã bị Khóa bởi GM. Lý do: ${
          found.banReason || 'Vi phạm quy định máy chủ'
        }`
      );
    }
    saveProfileLocally(found.profile);
    return found.profile;
  }

  throw new Error('Mã tài khoản đã lưu không hợp lệ.');
}

export function loginMasterAdminQuick(): ManagerProfile {
  const accounts = readLocalAccounts();
  const gmAcc = accounts[MASTER_ADMIN_USERNAME];
  const gmProfile = gmAcc ? gmAcc.profile : createMasterAdminProfile();
  if (accounts[MASTER_ADMIN_USERNAME]) {
    accounts[MASTER_ADMIN_USERNAME] = {
      ...accounts[MASTER_ADMIN_USERNAME],
      rememberLogin: true,
      lastSavedAt: Date.now(),
    };
    writeLocalAccounts(accounts);
  }
  setGmSessionUnlocked(true);
  saveProfileLocally(gmProfile);
  return gmProfile;
}

export function removeSavedAccountFromDevice(summaryKey: string): void {
  if (summaryKey.startsWith('local:')) {
    const rawKey = summaryKey.slice('local:'.length).toLowerCase();
    const accounts = readLocalAccounts();
    if (accounts[rawKey]) {
      accounts[rawKey] = {
        ...accounts[rawKey],
        rememberLogin: false,
      };
      writeLocalAccounts(accounts);
    }
    return;
  }
  if (summaryKey.startsWith('cloud:')) {
    const rawId = summaryKey.slice('cloud:'.length);
    const snaps = readCloudSnapshots();
    if (snaps[rawId]) {
      delete snaps[rawId];
      writeCloudSnapshots(snaps);
    }
  }
}

export const OFFICIAL_RELEASE_BUILD_VERSION = 'v1.0.0_OFFICIAL_RELEASE';
export const OFFICIAL_RELEASE_RESET_KEY = 'fco_official_release_reset_v1_applied';

/**
 * Resets all test and pre-release accounts, sessions, and storage back to fresh initial state.
 * Called automatically on official release boot and callable on-demand by Master Admin.
 */
export function performOfficialReleaseLocalReset(): void {
  if (typeof window === 'undefined') return;
  try {
    // 1. Remove all pre-release test sessions and snapshots
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    window.localStorage.removeItem(LOCAL_ACCOUNTS_KEY);
    window.localStorage.removeItem(CLOUD_SAVED_SNAPSHOTS_KEY);
    window.localStorage.removeItem(GUEST_SNAPSHOT_KEY);
    window.localStorage.removeItem(LAST_SAVED_AT_KEY);
    window.localStorage.removeItem('fco_pc_gm_audit_log_v1');

    // 2. Clear any user-specific lobby states, SVIP daily claim dates, and market tx logs
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (
        k &&
        (k.startsWith('fco_newgen_lobby_v2_') ||
          k.startsWith('fco_svip_daily_') ||
          k.startsWith('fco_market_tx_'))
      ) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }

    // 3. Mark official release reset as applied
    window.localStorage.setItem(OFFICIAL_RELEASE_RESET_KEY, '1');

    // 4. Re-initialize local account registry with clean Master Admin
    readLocalAccounts();
  } catch (err) {
    console.warn('Official release local reset error:', err);
  }
}

/**
 * Performs official release server wipe across local accounts, hub, and Firestore rules.
 */
export async function performOfficialReleaseServerWipe(
  actorName: string = 'Quản Trị Viên'
): Promise<{ success: boolean; message: string; freshProfile: ManagerProfile }> {
  performOfficialReleaseLocalReset();

  const freshStarter = createStarterProfile('guest_default', 'HLV Khách', 'guest');

  // Broadcast announcement and reset rules
  const officialRules: GlobalServerRules = {
    ...DEFAULT_GLOBAL_SERVER_RULES,
    serverAnnouncement:
      'CHÍNH THỨC RA MẮT BẢN FULL: Đã reset toàn bộ tài khoản về ban đầu! Bắt đầu mùa giải mới công bằng cho mọi HLV.',
  };

  try {
    await publishGlobalServerRulesEverywhere(officialRules, actorName);
  } catch {
    // Local fallback already saved
  }

  try {
    if (typeof window !== 'undefined') {
      await fetch('/api/sync/admin/official-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch {
    // Best effort on standalone client mode
  }

  return {
    success: true,
    message:
      'Đã reset toàn bộ tài khoản máy chủ về ban đầu! Mọi HLV bắt đầu lại từ đội hình sơ cấp, số thứ tự thẻ bảo lưu độc quyền cho người chơi.',
    freshProfile: freshStarter,
  };
}

export function loadSavedSessionProfile(): ManagerProfile | null {
  if (typeof window === 'undefined') return null;

  // Official Release Check: Reset pre-release test accounts once on official version launch
  if (window.localStorage.getItem(OFFICIAL_RELEASE_RESET_KEY) !== '1') {
    performOfficialReleaseLocalReset();
    return null;
  }

  // Ensure Master Admin account exists in local vault on startup
  readLocalAccounts();
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ManagerProfile> & Record<string, unknown>;
    if (parsed && parsed.id && Array.isArray(parsed.cards) && parsed.packs) {
      const migrated = migrateLegacyProfile(parsed);
      if (checkProfileHasAdminAccess(migrated)) {
        setGmSessionUnlocked(true);
      }
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

export async function bindGuestProfileToRealAccount(params: {
  guestProfile: ManagerProfile;
  managerName: string;
  usernameOrEmail: string;
  password: string;
  rememberLogin?: boolean;
}): Promise<ManagerProfile> {
  const cleanName = sanitizeManagerName(params.managerName);
  const cleanAccount = params.usernameOrEmail.trim().toLowerCase();
  const remember = params.rememberLogin !== false;
  const passHash = simpleHash(params.password);
  const deviceLabel = detectDeviceLabel();

  if (
    cleanAccount === MASTER_ADMIN_USERNAME ||
    cleanAccount === MASTER_ADMIN_ALT_USERNAME ||
    cleanAccount === MASTER_ADMIN_OWNER_EMAIL
  ) {
    throw new Error('Tên tài khoản này thuộc quyền Quản Trị Viên hệ thống. Vui lòng chuyển sang Đăng nhập.');
  }

  const accounts = readLocalAccounts();
  if (accounts[cleanAccount]) {
    throw new Error('Tên tài khoản này đã tồn tại. Vui lòng chọn tên khác hoặc chuyển sang Đăng nhập.');
  }

  let uid = `hlv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  if (cleanAccount.includes('@')) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanAccount, params.password);
      await updateProfile(cred.user, { displayName: cleanName });
      uid = sanitizeFirestoreId(cred.user.uid);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/email-already-in-use') {
        throw new Error('Email này đã tồn tại trên hệ thống. Vui lòng chuyển sang Đăng nhập.');
      }
    }
  }

  const boundProfile: ManagerProfile = {
    ...params.guestProfile,
    id: uid,
    managerName: cleanName,
    foosballLoops: Math.max(
      0,
      Math.min(1_000_000, Math.floor(params.guestProfile.foosballLoops ?? 0))
    ),
    deviceLabel,
    authMode: 'local',
    usernameOrEmail: cleanAccount,
  };

  await registerAccountOnServerHub({
    accountKey: cleanAccount,
    passwordHash: passHash,
    profile: boundProfile,
    deviceLabel,
  });

  accounts[cleanAccount] = {
    accountKey: cleanAccount,
    passwordHash: passHash,
    rememberLogin: remember,
    lastSavedAt: Date.now(),
    isBanned: false,
    banReason: '',
    isDelegatedAdmin: false,
    profile: boundProfile,
  };
  writeLocalAccounts(accounts);
  saveProfileLocally(boundProfile);
  return boundProfile;
}

export async function registerManagerAccount(params: {
  managerName: string;
  usernameOrEmail: string;
  password: string;
  rememberLogin?: boolean;
}): Promise<{ profile: ManagerProfile; cloudLinked: boolean }> {
  const cleanName = sanitizeManagerName(params.managerName);
  const cleanAccount = params.usernameOrEmail.trim().toLowerCase();
  const remember = params.rememberLogin !== false;
  const passHash = simpleHash(params.password);
  const deviceLabel = detectDeviceLabel();

  if (
    cleanAccount === MASTER_ADMIN_USERNAME ||
    cleanAccount === MASTER_ADMIN_ALT_USERNAME ||
    cleanAccount === MASTER_ADMIN_OWNER_EMAIL
  ) {
    throw new Error('Tên tài khoản này thuộc quyền Quản Trị Viên hệ thống. Vui lòng chuyển sang Đăng nhập.');
  }

  const accounts = readLocalAccounts();
  if (accounts[cleanAccount]) {
    throw new Error('Tài khoản này đã được đăng ký. Vui lòng chọn tên tài khoản khác hoặc đăng nhập.');
  }

  let uid = `hlv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  let cloudLinked = false;

  if (cleanAccount.includes('@')) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanAccount, params.password);
      await updateProfile(cred.user, { displayName: cleanName });
      uid = sanitizeFirestoreId(cred.user.uid);
      cloudLinked = true;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/email-already-in-use') {
        throw new Error('Email này đã tồn tại trên hệ thống. Vui lòng chuyển sang Đăng nhập.');
      }
    }
  }

  const profile: ManagerProfile = {
    ...createStarterProfile(uid, cleanName, 'local', cleanAccount),
    deviceLabel,
  };

  await registerAccountOnServerHub({
    accountKey: cleanAccount,
    passwordHash: passHash,
    profile,
    deviceLabel,
  });

  accounts[cleanAccount] = {
    accountKey: cleanAccount,
    passwordHash: passHash,
    rememberLogin: remember,
    lastSavedAt: Date.now(),
    isBanned: false,
    banReason: '',
    isDelegatedAdmin: false,
    profile,
  };
  writeLocalAccounts(accounts);
  saveProfileLocally(profile);
  return { profile, cloudLinked };
}

export async function loginManagerAccount(params: {
  usernameOrEmail: string;
  password: string;
  rememberLogin?: boolean;
}): Promise<ManagerProfile> {
  const rawLogin = params.usernameOrEmail.trim().toLowerCase();
  const cleanAccount =
    rawLogin === MASTER_ADMIN_ALT_USERNAME ||
    (rawLogin === MASTER_ADMIN_OWNER_EMAIL && params.password === MASTER_ADMIN_DEFAULT_PASSWORD)
      ? MASTER_ADMIN_USERNAME
      : rawLogin;
  const remember = params.rememberLogin !== false;
  const passHash = simpleHash(params.password);
  const deviceLabel = detectDeviceLabel();

  // 1. Try cross-device central Server Hub login first so any account registered on another device works seamlessly
  const remoteLogin = await loginAccountOnServerHub(cleanAccount, passHash, deviceLabel);
  if (remoteLogin.status === 'wrong_password' || remoteLogin.status === 'banned') {
    throw new Error(remoteLogin.error || 'Không thể đăng nhập tài khoản.');
  }
  if (remoteLogin.status === 'ok' && remoteLogin.profile) {
    const accounts = readLocalAccounts();
    const isGm = cleanAccount === MASTER_ADMIN_USERNAME || Boolean(remoteLogin.isDelegatedAdmin);
    const hydrated: ManagerProfile = {
      ...remoteLogin.profile,
      authMode: 'local',
      usernameOrEmail: cleanAccount,
      deviceLabel,
      ...(isGm ? { isDelegatedAdmin: true } : {}),
    };
    accounts[cleanAccount] = {
      accountKey: cleanAccount,
      passwordHash: passHash,
      rememberLogin: remember,
      lastSavedAt: Date.now(),
      isBanned: false,
      banReason: '',
      isDelegatedAdmin: isGm,
      profile: hydrated,
    };
    writeLocalAccounts(accounts);
    setGmSessionUnlocked(isGm);
    saveProfileLocally(hydrated);
    return hydrated;
  }

  // 2. Local Vault login (includes Administrator Game Account on first device boot)
  const accounts = readLocalAccounts();
  const stored = accounts[cleanAccount];

  if (stored) {
    if (stored.passwordHash !== passHash) {
      throw new Error('Mật khẩu không chính xác. Vui lòng kiểm tra lại.');
    }
    if (stored.isBanned && cleanAccount !== MASTER_ADMIN_USERNAME) {
      throw new Error(
        `Tài khoản "${stored.profile.managerName}" đã bị Khóa bởi Quản Trị Viên. Lý do: ${
          stored.banReason || 'Vi phạm quy định máy chủ'
        }`
      );
    }
    const isGm = cleanAccount === MASTER_ADMIN_USERNAME || Boolean(stored.isDelegatedAdmin);
    const updatedProfile: ManagerProfile = {
      ...stored.profile,
      deviceLabel,
      ...(isGm ? { isDelegatedAdmin: true } : {}),
    };
    accounts[cleanAccount] = {
      ...stored,
      rememberLogin: remember,
      lastSavedAt: Date.now(),
      profile: updatedProfile,
    };
    writeLocalAccounts(accounts);
    setGmSessionUnlocked(isGm);
    saveProfileLocally(updatedProfile);

    // Push credentials + squad snapshot to central cross-device hub so other devices can log in & view rank
    mutateServerHubAccount({
      summaryKey: `local:${cleanAccount}`,
      action: 'save_profile',
      accountKey: cleanAccount,
      authMode: 'local',
      usernameOrEmail: cleanAccount,
      passwordHash: passHash,
      isDelegatedAdmin: isGm,
      deviceLabel,
      profile: updatedProfile,
    }).catch(() => {});

    return updatedProfile;
  }

  if (cleanAccount.includes('@')) {
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanAccount, params.password);
      const profile = await loadOrCreateCloudProfile(cred.user);
      saveProfileLocally(profile);
      syncProfileWithServerHub(profile).catch(() => {});
      return profile;
    } catch {
      throw new Error('Không tìm thấy tài khoản hoặc sai mật khẩu.');
    }
  }

  // 3. Cross-Web Cloud Managed Account hydration (for accounts provisioned by Admin on another web URL)
  const crossWebDocId = `local_${sanitizeFirestoreId(cleanAccount)}`;
  const crossWebManaged = await loadCloudManagedAccountByDocId(
    crossWebDocId,
    `local:${cleanAccount}`
  );
  if (crossWebManaged) {
    if (crossWebManaged.isBanned && cleanAccount !== MASTER_ADMIN_USERNAME) {
      throw new Error(
        `Tài khoản "${crossWebManaged.profile.managerName}" đã bị Khóa bởi Quản Trị Viên. Lý do: ${
          crossWebManaged.banReason || 'Vi phạm quy định máy chủ'
        }`
      );
    }
    const isGm = cleanAccount === MASTER_ADMIN_USERNAME || crossWebManaged.isDelegatedAdmin;
    const hydratedCrossWeb: ManagerProfile = {
      ...crossWebManaged.profile,
      authMode: 'local',
      usernameOrEmail: cleanAccount,
      deviceLabel,
      ...(isGm ? { isDelegatedAdmin: true } : {}),
    };
    accounts[cleanAccount] = {
      accountKey: cleanAccount,
      passwordHash: passHash,
      rememberLogin: remember,
      lastSavedAt: Date.now(),
      isBanned: false,
      banReason: '',
      isDelegatedAdmin: isGm,
      profile: hydratedCrossWeb,
    };
    writeLocalAccounts(accounts);
    setGmSessionUnlocked(isGm);
    saveProfileLocally(hydratedCrossWeb);
    registerAccountOnServerHub({
      accountKey: cleanAccount,
      passwordHash: passHash,
      profile: hydratedCrossWeb,
      deviceLabel,
    }).catch(() => {});
    return hydratedCrossWeb;
  }

  throw new Error('Tài khoản chưa tồn tại trên máy chủ. Vui lòng đăng ký HLV mới trước.');
}

export async function signInWithGooglePopup(): Promise<ManagerProfile> {
  const cred =
    typeof window !== 'undefined'
      ? await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver)
      : await signInWithPopup(auth, googleProvider);
  const profile = await loadOrCreateCloudProfile(cred.user);
  saveProfileLocally(profile);
  syncProfileWithServerHub(profile).catch(() => {});
  return profile;
}

export async function linkGoogleCloudAdminSession(): Promise<{
  email: string;
  uid: string;
  hasCloudWriteAccess: boolean;
}> {
  const cred =
    typeof window !== 'undefined'
      ? await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver)
      : await signInWithPopup(auth, googleProvider);
  await refreshDelegatedCloudAdminStatus(cred.user);
  const allowed = hasCloudAdminWriteAuthority();
  if (allowed) {
    setGmSessionUnlocked(true);
  }
  return {
    email: cred.user.email || '',
    uid: cred.user.uid,
    hasCloudWriteAccess: allowed,
  };
}

export async function signOutManager(): Promise<ManagerProfile> {
  setGmSessionUnlocked(false);
  if (auth.currentUser) {
    await signOut(auth);
  }
  const guestSnap = readGuestSnapshot();
  const nextGuest = guestSnap
    ? guestSnap.profile
    : createStarterProfile('guest_default', 'HLV Khách', 'guest');
  saveProfileLocally(nextGuest);
  return nextGuest;
}

// ============================================================================
// GAME MASTER (GM) MULTI-ACCOUNT DIRECTORY & CONTROL ENGINE
// ============================================================================

function countTotalPacks(packs: PackInventory): number {
  return Object.values(packs).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

export function getAllManagedAccounts(
  cloudLeaderboardRows: LeaderboardRow[] = [],
  remoteServerAccounts: ManagedAccountEntry[] = [],
  cloudManagedEntries: ManagedAccountEntry[] = []
): ManagedAccountEntry[] {
  const accounts = readLocalAccounts();
  const cloudSnaps = readCloudSnapshots();
  const guestSnap = readGuestSnapshot();
  const delegated = getDelegatedAdminKeys();
  const entries = new Map<string, ManagedAccountEntry>();

  // 1. Central Cross-Device Server Hub Accounts (includes ALL devices: Android, iPhone, PC, Mac, Cloud, Local, Guest)
  for (const remote of remoteServerAccounts) {
    if (remote && remote.summaryKey) {
      entries.set(remote.summaryKey, remote);
    }
  }

  // 1B. Cross-Web Firestore Cloud Managed Accounts (shared across ais-dev, ais-pre, deployed URLs & devices)
  for (const cm of cloudManagedEntries) {
    if (cm && cm.summaryKey) {
      const existing = entries.get(cm.summaryKey);
      if (!existing || cm.lastSavedAt >= existing.lastSavedAt) {
        entries.set(cm.summaryKey, cm);
      }
    }
  }

  // 2. Registered Local Accounts on this device
  for (const acc of Object.values(accounts)) {
    const summary = calculateSquadSummary(acc.profile.cards);
    const vip = calculateVipStatus(acc.profile.vipPoints);
    const squadOvr = calculateProfileSquadOvr(acc.profile);
    const summaryKey = `local:${acc.accountKey}`;
    const existingRemote = entries.get(summaryKey);
    if (!existingRemote || (acc.lastSavedAt ?? 0) >= existingRemote.lastSavedAt) {
      entries.set(summaryKey, {
        summaryKey,
        accountKey: acc.accountKey,
        managerName: sanitizeManagerName(acc.profile.managerName),
        usernameOrEmail: acc.profile.usernameOrEmail || acc.accountKey,
        authMode: 'local',
        deviceLabel: acc.profile.deviceLabel || existingRemote?.deviceLabel || detectDeviceLabel(),
        elo: acc.profile.elo ?? 2050,
        squadOvr,
        vipLevel: vip.level,
        vipPoints: vip.totalPoints,
        fc: acc.profile.fc,
        bp: acc.profile.bp,
        starPoints: acc.profile.starPoints ?? 0,
        squadValue: summary.squadValue,
        bestCardOvr: summary.bestCardOvr,
        bestCardName: summary.bestCardName,
        cardCount: acc.profile.cards.length,
        packCount: countTotalPacks(acc.profile.packs),
        isBanned: Boolean(acc.isBanned),
        banReason: acc.banReason || '',
        isDelegatedAdmin: Boolean(acc.isDelegatedAdmin),
        isMasterAdmin:
          acc.accountKey === MASTER_ADMIN_USERNAME ||
          acc.profile.id === MASTER_ADMIN_PROFILE_ID,
        lastSavedAt: acc.lastSavedAt ?? Date.now(),
      });
    }
  }

  // 3. Guest Club Snapshot on this device (keyed by per-device UID)
  if (guestSnap) {
    const summary = calculateSquadSummary(guestSnap.profile.cards);
    const vip = calculateVipStatus(guestSnap.profile.vipPoints);
    const guestOwnerId = getCanonicalOwnerIdForProfile(guestSnap.profile);
    const guestSummaryKey = `guest:${guestOwnerId}`;
    if (!entries.has(guestSummaryKey)) {
      entries.set(guestSummaryKey, {
        summaryKey: guestSummaryKey,
        accountKey: guestOwnerId,
        managerName: sanitizeManagerName(guestSnap.profile.managerName),
        usernameOrEmail: `Thiết bị này (${detectDeviceLabel()})`,
        authMode: 'guest',
        deviceLabel: detectDeviceLabel(),
        elo: guestSnap.profile.elo ?? 2050,
        squadOvr: calculateProfileSquadOvr(guestSnap.profile),
        vipLevel: vip.level,
        vipPoints: vip.totalPoints,
        fc: guestSnap.profile.fc,
        bp: guestSnap.profile.bp,
        starPoints: guestSnap.profile.starPoints ?? 0,
        squadValue: summary.squadValue,
        bestCardOvr: summary.bestCardOvr,
        bestCardName: summary.bestCardName,
        cardCount: guestSnap.profile.cards.length,
        packCount: countTotalPacks(guestSnap.profile.packs),
        isBanned: Boolean(guestSnap.isBanned),
        banReason: guestSnap.banReason || '',
        isDelegatedAdmin: false,
        isMasterAdmin: false,
        lastSavedAt: guestSnap.lastSavedAt,
      });
    }
  }

  // 4. Saved Cloud Account Snapshots
  for (const snap of Object.values(cloudSnaps)) {
    const summary = calculateSquadSummary(snap.profile.cards);
    const vip = calculateVipStatus(snap.profile.vipPoints);
    const summaryKey = `cloud:${snap.accountKey}`;
    if (!entries.has(summaryKey)) {
      entries.set(summaryKey, {
        summaryKey,
        accountKey: snap.accountKey,
        managerName: sanitizeManagerName(snap.profile.managerName),
        usernameOrEmail:
          snap.profile.usernameOrEmail || `Cloud UID: ${snap.accountKey.slice(0, 10)}`,
        authMode: 'firebase',
        deviceLabel: snap.profile.deviceLabel || 'Cloud Google',
        elo: snap.profile.elo ?? 2050,
        squadOvr: calculateProfileSquadOvr(snap.profile),
        vipLevel: vip.level,
        vipPoints: vip.totalPoints,
        fc: snap.profile.fc,
        bp: snap.profile.bp,
        starPoints: snap.profile.starPoints ?? 0,
        squadValue: summary.squadValue,
        bestCardOvr: summary.bestCardOvr,
        bestCardName: summary.bestCardName,
        cardCount: snap.profile.cards.length,
        packCount: countTotalPacks(snap.profile.packs),
        isBanned: Boolean(snap.isBanned),
        banReason: snap.banReason || '',
        isDelegatedAdmin: Boolean(snap.isDelegatedAdmin),
        isMasterAdmin: isMasterAdminAccount(snap.profile, delegated),
        lastSavedAt: snap.lastSavedAt,
      });
    }
  }

  // 5. Live Firestore Leaderboard Cloud Entries not yet cached
  for (const row of cloudLeaderboardRows) {
    const inferredKey = row.ownerId.startsWith('local_')
      ? `local:${row.ownerId.slice('local_'.length)}`
      : row.ownerId.startsWith('guest_')
      ? `guest:${row.ownerId}`
      : `cloud:${row.ownerId.replace(/^cloud_/, '')}`;
    if (!entries.has(inferredKey)) {
      const mode: 'local' | 'guest' | 'firebase' = inferredKey.startsWith('local:')
        ? 'local'
        : inferredKey.startsWith('guest:')
        ? 'guest'
        : 'firebase';
      entries.set(inferredKey, {
        summaryKey: inferredKey,
        accountKey: inferredKey.replace(/^(local:|guest:|cloud:)/, ''),
        managerName: sanitizeManagerName(row.managerName),
        usernameOrEmail:
          mode === 'firebase'
            ? `Cloud UID: ${row.ownerId.replace(/^cloud_/, '').slice(0, 12)}`
            : inferredKey,
        authMode: mode,
        deviceLabel: row.deviceLabel || 'Khác Web / Cloud',
        elo: row.elo ?? 2050,
        squadOvr: row.squadOvr ?? 130,
        vipLevel: row.vipLevel,
        vipPoints: row.vipPoints,
        fc: 500,
        bp: 250_000_000_000_000,
        starPoints: 1500,
        squadValue: row.squadValue,
        bestCardOvr: row.bestCardOvr,
        bestCardName: row.bestCardName,
        cardCount: 18,
        packCount: 10,
        isBanned: false,
        banReason: '',
        isDelegatedAdmin: false,
        isMasterAdmin: false,
        lastSavedAt: Date.now() - 60_000,
      });
    }
  }

  return Array.from(entries.values()).sort((a, b) => {
    if (a.isMasterAdmin !== b.isMasterAdmin) {
      return a.isMasterAdmin ? 1 : -1;
    }
    return b.lastSavedAt - a.lastSavedAt;
  });
}

export async function loadCloudManagedAccountByDocId(
  docIdRaw: string,
  fallbackSummaryKey: string
): Promise<{
  profile: ManagerProfile;
  isBanned: boolean;
  banReason: string;
  isDelegatedAdmin: boolean;
  adminRevision: number;
} | null> {
  const docId = sanitizeFirestoreId(docIdRaw);
  try {
    const snap = await getDoc(doc(db, 'cloud_managed_accounts', docId));
    if (!snap.exists()) return null;
    const data = snap.data();
    const cardsSnap = await getDocs(
      query(
        collection(db, 'cloud_managed_accounts', docId, 'cards'),
        where('accountId', '==', docId),
        where('syncScope', '==', 'GLOBAL'),
        limit(100)
      )
    );
    const cards: OwnedCard[] = cardsSnap.docs.map((d) => {
      const cd = d.data();
      const templateId = String(cd.templateId);
      const tpl = PLAYER_TEMPLATE_MAP[templateId];
      const customMf = sanitizeCustomMinifaceUrl(cd.customMinifaceUrl);
      const rawSerial = Number(cd.serialNumber);
      const validSerial =
        tpl &&
        isSerializedSeason(tpl.season) &&
        Number.isFinite(rawSerial) &&
        rawSerial >= 1
          ? Math.min(100_000_000, Math.floor(rawSerial))
          : undefined;
      return {
        uid: d.id,
        templateId,
        grade: Number(cd.grade) || 1,
        ovr: Number(cd.ovr) || 105,
        valueBp: Number(cd.valueBp) || 10_000_000_000,
        acquiredAt: Date.now(),
        ...(customMf ? { customMinifaceUrl: customMf } : {}),
        ...(validSerial ? { serialNumber: validSerial } : {}),
      };
    });

    const resolved = resolveCrossWebSummaryAndDocId(fallbackSummaryKey);
    const authMode: 'local' | 'guest' | 'firebase' =
      data.authMode === 'firebase' || data.authMode === 'local' ? data.authMode : 'guest';
    const adminRevision =
      typeof data.adminRevision === 'number' ? Math.max(0, Math.floor(data.adminRevision)) : 0;
    const isBanned = Boolean(data.isBanned);
    const banReason = typeof data.banReason === 'string' ? data.banReason : '';
    const isDelegatedAdmin = Boolean(data.isDelegatedAdmin);

    const profile = migrateLegacyProfile({
      id: authMode === 'firebase' ? resolved.accountKey : docId,
      managerName: sanitizeManagerName(data.managerName || 'HLV Liên Web'),
      deviceLabel: typeof data.deviceLabel === 'string' ? data.deviceLabel : 'Khác Web / Thiết bị',
      fc: Number(data.fc ?? 500),
      bp: Number(data.bp ?? 250_000_000_000_000),
      starPoints: typeof data.starPoints === 'number' ? data.starPoints : 1500,
      nextCardSerial: typeof data.nextCardSerial === 'number' ? data.nextCardSerial : 11,
      vipPoints: Number(data.vipPoints ?? 60),
      vipLevel: Number(data.vipLevel ?? 1),
      foosballLoops: Number(data.foosballLoops ?? 0),
      foosballSpins: Number(data.foosballSpins ?? 0),
      foosballJackpotFc: clampFoosballJackpotFc(Number(data.foosballJackpotFc ?? 100)),
      packs: data.packs ?? undefined,
      claimedMilestones: Array.isArray(data.claimedMilestones)
        ? data.claimedMilestones.slice(0, 24).map(Number)
        : [],
      claimedVipRewards: Array.isArray(data.claimedVipRewards)
        ? data.claimedVipRewards.slice(0, 24).map(Number)
        : [],
      cards,
      formation:
        typeof data.formation === 'string'
          ? (data.formation as ManagerProfile['formation'])
          : undefined,
      activeTeamColorId:
        typeof data.activeTeamColorId === 'string' ? data.activeTeamColorId : undefined,
      lineupSlotUids: Array.isArray(data.lineupSlotUids)
        ? data.lineupSlotUids.slice(0, 11).filter((u): u is string => typeof u === 'string')
        : undefined,
      elo: typeof data.elo === 'number' ? data.elo : undefined,
      wins: typeof data.wins === 'number' ? data.wins : undefined,
      draws: typeof data.draws === 'number' ? data.draws : undefined,
      losses: typeof data.losses === 'number' ? data.losses : undefined,
      managerXp: typeof data.managerXp === 'number' ? data.managerXp : undefined,
      squadOvr: typeof data.squadOvr === 'number' ? data.squadOvr : undefined,
      claimedBroadcastIds: Array.isArray(data.claimedBroadcastIds)
        ? data.claimedBroadcastIds.slice(0, 50).filter((id): id is string => typeof id === 'string')
        : undefined,
      adminRevision,
      isBanned,
      banReason,
      isDelegatedAdmin,
      authMode,
      usernameOrEmail: authMode === 'local' ? resolved.accountKey : undefined,
    });

    return { profile, isBanned, banReason, isDelegatedAdmin, adminRevision };
  } catch {
    return null;
  }
}

export async function loadManagedAccountFullProfile(
  summaryKey: string
): Promise<ManagerProfile | null> {
  const resolved = resolveCrossWebSummaryAndDocId(summaryKey);

  // 1. Check Cross-Web Cloud Managed Account & Server Hub in parallel/sequence, picking highest adminRevision
  const [remoteProfile, cloudManaged] = await Promise.all([
    fetchServerManagedAccountProfile(resolved.summaryKey),
    loadCloudManagedAccountByDocId(resolved.docId, resolved.summaryKey),
  ]);

  if (remoteProfile && cloudManaged) {
    return (cloudManaged.adminRevision ?? 0) >= (remoteProfile.adminRevision ?? 0)
      ? cloudManaged.profile
      : remoteProfile;
  }
  if (cloudManaged) {
    return cloudManaged.profile;
  }
  if (remoteProfile) {
    return remoteProfile;
  }

  if (resolved.summaryKey.startsWith('local:')) {
    const key = resolved.accountKey.toLowerCase();
    const accounts = readLocalAccounts();
    return accounts[key]?.profile ?? null;
  }

  if (resolved.summaryKey.startsWith('guest:')) {
    const guestSnap = readGuestSnapshot();
    if (guestSnap) return guestSnap.profile;
    const fresh = createStarterProfile(resolved.accountKey, 'HLV Khách', 'guest');
    writeGuestSnapshot(fresh);
    return fresh;
  }

  if (resolved.summaryKey.startsWith('cloud:')) {
    const targetUid = sanitizeFirestoreId(resolved.accountKey);
    if (hasCloudAdminWriteAuthority()) {
      const userPath = `users/${targetUid}`;
      try {
        const snap = await getDoc(doc(db, 'users', targetUid));
        if (snap.exists()) {
          const data = snap.data();
          let cards: OwnedCard[] = [];
          if (isCurrentFirebaseUserCloudAdmin()) {
            const cardsQ = query(
              collection(db, 'users', targetUid, 'cards'),
              where('ownerId', '==', targetUid),
              limit(100)
            );
            const cardSnaps = await getDocs(cardsQ);
            cards = cardSnaps.docs.map((d) => {
              const cd = d.data();
              const templateId = String(cd.templateId);
              const tpl = PLAYER_TEMPLATE_MAP[templateId];
              const customMf = sanitizeCustomMinifaceUrl(cd.customMinifaceUrl);
              const rawSerial = Number(cd.serialNumber);
              const validSerial =
                tpl &&
                isSerializedSeason(tpl.season) &&
                Number.isFinite(rawSerial) &&
                rawSerial >= 1
                  ? Math.min(100_000_000, Math.floor(rawSerial))
                  : undefined;
              return {
                uid: d.id,
                templateId,
                grade: Number(cd.grade) || 1,
                ovr: Number(cd.ovr) || 105,
                valueBp: Number(cd.valueBp) || 10_000_000_000,
                acquiredAt: Date.now(),
                ...(customMf ? { customMinifaceUrl: customMf } : {}),
                ...(validSerial ? { serialNumber: validSerial } : {}),
              };
            });
          }

          const loaded = migrateLegacyProfile({
            id: targetUid,
            managerName: sanitizeManagerName(data.managerName || 'HLV Cloud'),
            deviceLabel: typeof data.deviceLabel === 'string' ? data.deviceLabel : 'Cloud Google',
            fc: Number(data.fc ?? 500),
            bp: Number(data.bp ?? 250_000_000_000_000),
            starPoints: typeof data.starPoints === 'number' ? data.starPoints : 1500,
            nextCardSerial: typeof data.nextCardSerial === 'number' ? data.nextCardSerial : 11,
            vipPoints: Number(data.vipPoints ?? 60),
            vipLevel: Number(data.vipLevel ?? 1),
            foosballLoops: Number(data.foosballLoops ?? 0),
            foosballSpins: Number(data.foosballSpins ?? 0),
            foosballJackpotFc: clampFoosballJackpotFc(Number(data.foosballJackpotFc ?? 100)),
            packs: data.packs ?? undefined,
            claimedMilestones: Array.isArray(data.claimedMilestones)
              ? data.claimedMilestones.slice(0, 24).map(Number)
              : [],
            claimedVipRewards: Array.isArray(data.claimedVipRewards)
              ? data.claimedVipRewards.slice(0, 24).map(Number)
              : [],
            cards,
            formation:
              typeof data.formation === 'string'
                ? (data.formation as ManagerProfile['formation'])
                : undefined,
            activeTeamColorId:
              typeof data.activeTeamColorId === 'string' ? data.activeTeamColorId : undefined,
            lineupSlotUids: Array.isArray(data.lineupSlotUids)
              ? data.lineupSlotUids.slice(0, 11).filter((u): u is string => typeof u === 'string')
              : undefined,
            elo: typeof data.elo === 'number' ? data.elo : undefined,
            wins: typeof data.wins === 'number' ? data.wins : undefined,
            draws: typeof data.draws === 'number' ? data.draws : undefined,
            losses: typeof data.losses === 'number' ? data.losses : undefined,
            managerXp: typeof data.managerXp === 'number' ? data.managerXp : undefined,
            squadOvr: typeof data.squadOvr === 'number' ? data.squadOvr : undefined,
            adminRevision: typeof data.adminRevision === 'number' ? data.adminRevision : 0,
            isBanned: Boolean(data.isBanned),
            banReason: typeof data.banReason === 'string' ? data.banReason : '',
            isDelegatedAdmin: Boolean(data.isDelegatedAdmin),
            authMode: 'firebase',
            usernameOrEmail: `Cloud UID: ${targetUid.slice(0, 12)}`,
          });

          const cloudSnaps = readCloudSnapshots();
          cloudSnaps[targetUid] = {
            ...(cloudSnaps[targetUid] ?? {}),
            accountKey: targetUid,
            lastSavedAt: Date.now(),
            isBanned: Boolean(data.isBanned),
            banReason: typeof data.banReason === 'string' ? data.banReason : '',
            isDelegatedAdmin: Boolean(data.isDelegatedAdmin),
            profile: loaded,
          };
          writeCloudSnapshots(cloudSnaps);
          return loaded;
        }
      } catch (error) {
        if (isOfflineOrTokenServiceError(error)) {
          recoverFromBrokenTokenIfNeeded(error);
          const cloudSnaps = readCloudSnapshots();
          return cloudSnaps[targetUid]?.profile ?? null;
        }
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    }

    const cloudSnaps = readCloudSnapshots();
    return cloudSnaps[targetUid]?.profile ?? null;
  }

  return null;
}

async function syncTargetCloudAccountByAdmin(
  targetUidRaw: string,
  profile: ManagerProfile,
  rbacMeta?: {
    isBanned?: boolean;
    banReason?: string;
    isDelegatedAdmin?: boolean;
    adminRevision?: number;
  }
): Promise<void> {
  if (!hasCloudAdminWriteAuthority()) return;
  const targetUid = sanitizeFirestoreId(targetUidRaw);
  const summary = calculateSquadSummary(profile.cards);
  const vip = calculateVipStatus(profile.vipPoints);
  const squadOvr = toSafeInt(calculateProfileSquadOvr(profile), 0, 300, 110);
  const managerLevel = toSafeInt(
    calculateManagerLevelStatus(profile.managerXp ?? 7_350).level,
    1,
    100,
    1
  );
  const safeElo = toSafeInt(profile.elo, 1000, 10_000, 2050);
  const safeWins = toSafeInt(profile.wins, 0, 1_000_000, 14);
  const safeDraws = toSafeInt(profile.draws, 0, 1_000_000, 3);
  const safeLosses = toSafeInt(profile.losses, 0, 1_000_000, 4);
  const safeManagerXp = toSafeInt(profile.managerXp, 0, 100_000_000, 7_350);
  const userPath = `users/${targetUid}`;
  const lbPath = `leaderboard_entries/${targetUid}`;
  const safeDeviceLabel = sanitizeDeviceLabel(profile.deviceLabel || 'Cloud Google', 'Cloud Google');
  const safeBestCardName = sanitizeBoundText(summary.bestCardName, 60, 'Cầu thủ FC');
  const safeBestCardSeason = sanitizeBoundText(summary.bestCardSeason, 16, '26UCL');

  const safeFormation =
    typeof profile.formation === 'string' &&
    /^[a-zA-Z0-9-]{5,16}$/.test(profile.formation)
      ? profile.formation
      : '4-3-3';
  const safeTeamColorId =
    typeof profile.activeTeamColorId === 'string' &&
    /^[a-zA-Z0-9_-]{2,48}$/.test(profile.activeTeamColorId)
      ? profile.activeTeamColorId
      : 'auto';
  const safeLineupSlots = Array.isArray(profile.lineupSlotUids)
    ? profile.lineupSlotUids
        .filter((u): u is string => typeof u === 'string' && u.length >= 1 && u.length <= 128)
        .map((u) => sanitizeFirestoreId(u))
        .slice(0, 11)
    : [];

  let nextIsBanned = rbacMeta?.isBanned ?? Boolean(profile.isBanned);
  let nextBanReason = truncateUtf8Bytes(rbacMeta?.banReason ?? profile.banReason ?? '', 100);
  let nextDelegated = rbacMeta?.isDelegatedAdmin ?? Boolean(profile.isDelegatedAdmin);
  let nextAdminRevision = toSafeInt(rbacMeta?.adminRevision ?? profile.adminRevision ?? 1, 0, 100_000_000, 1);

  try {
    const targetDocRef = doc(db, 'users', targetUid);
    const existingCheck = await getDocFromServer(targetDocRef).catch(() => getDoc(targetDocRef));
    if (existingCheck.exists()) {
      const ed = existingCheck.data();
      if (rbacMeta?.isBanned === undefined && 'isBanned' in ed) nextIsBanned = Boolean(ed.isBanned);
      if (rbacMeta?.banReason === undefined && typeof ed.banReason === 'string') {
        nextBanReason = truncateUtf8Bytes(ed.banReason, 100);
      }
      if (rbacMeta?.isDelegatedAdmin === undefined && 'isDelegatedAdmin' in ed) {
        nextDelegated = Boolean(ed.isDelegatedAdmin);
      }
      const existingRev = toSafeInt(ed.adminRevision, 0, 100_000_000, 0);
      nextAdminRevision = Math.max(nextAdminRevision, existingRev + 1);
    }

    const userPayload = {
      ownerId: targetUid,
      managerName: sanitizeManagerName(profile.managerName),
      deviceLabel: safeDeviceLabel,
      fc: toSafeInt(profile.fc, 0, 1_000_000_000, 0),
      bp: toSafeInt(profile.bp, 0, MAX_SAFE_BP, 0),
      starPoints: toSafeInt(profile.starPoints, 0, 1_000_000_000, 0),
      nextCardSerial: toSafeInt(profile.nextCardSerial, 1, 100_000_000, 11),
      vipPoints: toSafeInt(vip.totalPoints, 0, 100_000_000, 0),
      vipLevel: toSafeInt(vip.level, 0, 20, 0),
      foosballLoops: toSafeInt(profile.foosballLoops, 0, 1_000_000, 0),
      foosballSpins: toSafeInt(profile.foosballSpins, 0, 10_000_000, 0),
      foosballJackpotFc: clampFoosballJackpotFc(profile.foosballJackpotFc),
      squadValue: toSafeInt(summary.squadValue, 0, MAX_SAFE_BP, 0),
      bestCardOvr: toSafeInt(summary.bestCardOvr, 0, 300, 0),
      bestCardName: safeBestCardName,
      bestCardSeason: safeBestCardSeason,
      bestCardGrade: toSafeInt(summary.bestCardGrade, 1, MAX_CARD_GRADE, 1),
      packs: clampPackMap(profile.packs),
      claimedMilestones: sanitizeIntList(profile.claimedMilestones, 24),
      claimedVipRewards: sanitizeIntList(profile.claimedVipRewards, 24),
      formation: safeFormation,
      activeTeamColorId: safeTeamColorId,
      ...(safeLineupSlots.length > 0 ? { lineupSlotUids: safeLineupSlots } : {}),
      elo: safeElo,
      wins: safeWins,
      draws: safeDraws,
      losses: safeLosses,
      managerXp: safeManagerXp,
      squadOvr,
      isBanned: nextIsBanned,
      banReason: nextIsBanned ? nextBanReason : '',
      isDelegatedAdmin: nextDelegated,
      adminRevision: nextAdminRevision,
      updatedAt: serverTimestamp(),
    };

    if (!existingCheck.exists()) {
      await setDoc(targetDocRef, {
        ...userPayload,
        createdAt: serverTimestamp(),
      });
    } else {
      const existingData = existingCheck.data();
      if (
        existingData.ownerId === targetUid &&
        isFirestoreTimestamp(existingData.createdAt)
      ) {
        await updateDoc(targetDocRef, userPayload);
      } else {
        await setDoc(targetDocRef, {
          ...userPayload,
          createdAt: isFirestoreTimestamp(existingData.createdAt)
            ? existingData.createdAt
            : serverTimestamp(),
        });
      }
    }
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  try {
    if (nextIsBanned) {
      await deleteDoc(doc(db, 'leaderboard_entries', targetUid)).catch(() => {});
    } else {
      await setDoc(doc(db, 'leaderboard_entries', targetUid), {
        ownerId: targetUid,
        boardScope: 'GLOBAL',
        managerName: sanitizeManagerName(profile.managerName),
        vipLevel: toSafeInt(vip.level, 0, 20, 0),
        vipPoints: toSafeInt(vip.totalPoints, 0, 100_000_000, 0),
        squadValue: toSafeInt(summary.squadValue, 0, MAX_SAFE_BP, 0),
        bestCardOvr: toSafeInt(summary.bestCardOvr, 0, 300, 0),
        bestCardName: safeBestCardName,
        bestCardSeason: safeBestCardSeason,
        bestCardGrade: toSafeInt(summary.bestCardGrade, 1, MAX_CARD_GRADE, 1),
        elo: safeElo,
        wins: safeWins,
        draws: safeDraws,
        losses: safeLosses,
        managerLevel,
        squadOvr,
        deviceLabel: safeDeviceLabel,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, lbPath);
  }

  try {
    const existingCardsMap = new Map<string, Record<string, unknown>>();
    if (isCurrentFirebaseUserCloudAdmin()) {
      const existingSnap = await getDocs(
        query(collection(db, 'users', targetUid, 'cards'), where('ownerId', '==', targetUid), limit(100))
      );
      for (const d of existingSnap.docs) {
        existingCardsMap.set(d.id, d.data());
      }
    }

    const batch = writeBatch(db);
    const topCards = [...profile.cards]
      .sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp)
      .slice(0, 25);
    const keepIds = new Set<string>();

    for (const card of topCards) {
      const cid = sanitizeFirestoreId(card.uid);
      keepIds.add(cid);
      const safeTplId = sanitizeFirestoreId(card.templateId).slice(0, 64);
      const customMf = sanitizeCustomMinifaceUrl(card.customMinifaceUrl);
      const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
      const validSerial =
        tpl &&
        isSerializedSeason(tpl.season) &&
        typeof card.serialNumber === 'number' &&
        Number.isFinite(card.serialNumber) &&
        card.serialNumber >= 1
          ? Math.min(100_000_000, Math.floor(card.serialNumber))
          : undefined;
      const prev = existingCardsMap.get(cid);
      const createdAtVal =
        prev && prev.templateId === safeTplId && prev.createdAt
          ? prev.createdAt
          : serverTimestamp();

      batch.set(doc(db, 'users', targetUid, 'cards', cid), {
        ownerId: targetUid,
        templateId: safeTplId,
        grade: Math.max(1, Math.min(MAX_CARD_GRADE, Math.floor(card.grade || 1))),
        ovr: Math.max(1, Math.min(300, Math.floor(card.ovr || 100))),
        valueBp: Math.max(0, Math.min(MAX_SAFE_BP, Math.floor(card.valueBp || 0))),
        ...(customMf ? { customMinifaceUrl: customMf } : {}),
        ...(validSerial ? { serialNumber: validSerial } : {}),
        createdAt: createdAtVal,
        updatedAt: serverTimestamp(),
      });
    }

    let deleted = 0;
    for (const oldId of existingCardsMap.keys()) {
      if (!keepIds.has(oldId) && deleted < 25) {
        batch.delete(doc(db, 'users', targetUid, 'cards', oldId));
        deleted += 1;
      }
    }
    await batch.commit();
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `users/${targetUid}/cards`);
  }
}

export async function publishCloudManagedAccountByAdmin(
  summaryKeyRaw: string,
  profile: ManagerProfile,
  opts?: {
    isBanned?: boolean;
    banReason?: string;
    isDelegatedAdmin?: boolean;
    bumpRevision?: boolean;
  }
): Promise<number | null> {
  if (!hasCloudAdminWriteAuthority()) return null;
  const resolved = resolveCrossWebSummaryAndDocId(summaryKeyRaw);
  const { docId, authMode, cloudUid } = resolved;

  const summary = calculateSquadSummary(profile.cards);
  const vip = calculateVipStatus(profile.vipPoints);
  const squadOvr = toSafeInt(calculateProfileSquadOvr(profile), 0, 300, 110);
  const managerLevel = toSafeInt(
    calculateManagerLevelStatus(profile.managerXp ?? 7_350).level,
    1,
    100,
    1
  );
  const safeElo = toSafeInt(profile.elo, 1000, 10_000, 2050);
  const safeWins = toSafeInt(profile.wins, 0, 1_000_000, 14);
  const safeDraws = toSafeInt(profile.draws, 0, 1_000_000, 3);
  const safeLosses = toSafeInt(profile.losses, 0, 1_000_000, 4);
  const safeManagerXp = toSafeInt(profile.managerXp, 0, 100_000_000, 7_350);
  const safeDeviceLabel = sanitizeDeviceLabel(profile.deviceLabel || detectDeviceLabel(), 'Thiết bị Web');
  const safeBestCardName = sanitizeBoundText(summary.bestCardName, 60, 'Cầu thủ FC');
  const safeBestCardSeason = sanitizeBoundText(summary.bestCardSeason, 16, '26UCL');

  const safeFormation =
    typeof profile.formation === 'string' &&
    /^[a-zA-Z0-9-]{5,16}$/.test(profile.formation)
      ? profile.formation
      : '4-3-3';
  const safeTeamColorId =
    typeof profile.activeTeamColorId === 'string' &&
    /^[a-zA-Z0-9_-]{2,48}$/.test(profile.activeTeamColorId)
      ? profile.activeTeamColorId
      : 'auto';
  const safeLineupSlots = Array.isArray(profile.lineupSlotUids)
    ? profile.lineupSlotUids
        .filter((u): u is string => typeof u === 'string' && u.length >= 1 && u.length <= 128)
        .map((u) => sanitizeFirestoreId(u))
        .slice(0, 11)
    : [];
  const safeClaimedBroadcasts = Array.isArray(profile.claimedBroadcastIds)
    ? profile.claimedBroadcastIds
        .filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id))
        .map((id) => sanitizeFirestoreId(id))
        .slice(-50)
    : [];

  let existingRev = 0;
  let existingBanned = Boolean(profile.isBanned);
  let existingReason = truncateUtf8Bytes(profile.banReason || '', 100);
  let existingDelegated = Boolean(profile.isDelegatedAdmin);

  const cmPath = `cloud_managed_accounts/${docId}`;
  try {
    const existingSnap = await getDoc(doc(db, 'cloud_managed_accounts', docId));
    if (existingSnap.exists()) {
      const ed = existingSnap.data();
      existingRev = toSafeInt(ed.adminRevision, 0, 100_000_000, 0);
      existingBanned = Boolean(ed.isBanned);
      existingReason = typeof ed.banReason === 'string' ? truncateUtf8Bytes(ed.banReason, 100) : '';
      existingDelegated = Boolean(ed.isDelegatedAdmin);
    }
  } catch {
    // Doc not created yet
  }

  const nextIsBanned = opts?.isBanned !== undefined ? opts.isBanned : existingBanned;
  const nextBanReason = nextIsBanned
    ? truncateUtf8Bytes(opts?.banReason !== undefined ? opts.banReason : existingReason, 100)
    : '';
  const nextDelegated =
    opts?.isDelegatedAdmin !== undefined ? opts.isDelegatedAdmin : existingDelegated;
  const nextRevision =
    opts?.bumpRevision === false
      ? toSafeInt(Math.max(profile.adminRevision ?? 0, existingRev), 0, 100_000_000, 0)
      : toSafeInt(Math.max((profile.adminRevision ?? 0) + 1, existingRev + 1), 1, 100_000_000, 1);

  try {
    await setDoc(doc(db, 'cloud_managed_accounts', docId), {
      accountId: docId,
      syncScope: 'GLOBAL',
      authMode,
      managerName: sanitizeManagerName(profile.managerName),
      deviceLabel: safeDeviceLabel,
      fc: toSafeInt(profile.fc, 0, 1_000_000_000, 0),
      bp: toSafeInt(profile.bp, 0, MAX_SAFE_BP, 0),
      starPoints: toSafeInt(profile.starPoints, 0, 1_000_000_000, 0),
      nextCardSerial: toSafeInt(profile.nextCardSerial, 1, 100_000_000, 11),
      vipPoints: toSafeInt(vip.totalPoints, 0, 100_000_000, 0),
      vipLevel: toSafeInt(vip.level, 0, 20, 0),
      foosballLoops: toSafeInt(profile.foosballLoops, 0, 1_000_000, 0),
      foosballSpins: toSafeInt(profile.foosballSpins, 0, 10_000_000, 0),
      foosballJackpotFc: clampFoosballJackpotFc(profile.foosballJackpotFc),
      squadValue: toSafeInt(summary.squadValue, 0, MAX_SAFE_BP, 0),
      bestCardOvr: toSafeInt(summary.bestCardOvr, 0, 300, 0),
      bestCardName: safeBestCardName,
      bestCardSeason: safeBestCardSeason,
      bestCardGrade: toSafeInt(summary.bestCardGrade, 1, MAX_CARD_GRADE, 1),
      elo: safeElo,
      wins: safeWins,
      draws: safeDraws,
      losses: safeLosses,
      managerXp: safeManagerXp,
      squadOvr,
      packs: clampPackMap(profile.packs),
      claimedMilestones: sanitizeIntList(profile.claimedMilestones, 24),
      claimedVipRewards: sanitizeIntList(profile.claimedVipRewards, 24),
      ...(safeClaimedBroadcasts.length > 0 ? { claimedBroadcastIds: safeClaimedBroadcasts } : {}),
      formation: safeFormation,
      activeTeamColorId: safeTeamColorId,
      ...(safeLineupSlots.length > 0 ? { lineupSlotUids: safeLineupSlots } : {}),
      isBanned: nextIsBanned,
      banReason: nextBanReason,
      isDelegatedAdmin: nextDelegated,
      adminRevision: nextRevision,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return null;
    }
    handleFirestoreError(error, OperationType.WRITE, cmPath);
  }

  try {
    const existingCardsSnap = await getDocs(
      query(
        collection(db, 'cloud_managed_accounts', docId, 'cards'),
        where('accountId', '==', docId),
        where('syncScope', '==', 'GLOBAL'),
        limit(100)
      )
    );
    const existingCardsMap = new Map<string, Record<string, unknown>>();
    for (const d of existingCardsSnap.docs) {
      existingCardsMap.set(d.id, d.data());
    }

    const batch = writeBatch(db);
    const topCards = [...profile.cards]
      .sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp)
      .slice(0, 25);
    const keepIds = new Set<string>();

    for (const card of topCards) {
      const cid = sanitizeFirestoreId(card.uid);
      keepIds.add(cid);
      const safeTplId = sanitizeFirestoreId(card.templateId).slice(0, 64);
      const customMf = sanitizeCustomMinifaceUrl(card.customMinifaceUrl);
      const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
      const validSerial =
        tpl &&
        isSerializedSeason(tpl.season) &&
        typeof card.serialNumber === 'number' &&
        Number.isFinite(card.serialNumber) &&
        card.serialNumber >= 1
          ? Math.min(100_000_000, Math.floor(card.serialNumber))
          : undefined;
      const prev = existingCardsMap.get(cid);
      const createdAtVal =
        prev && prev.templateId === safeTplId && prev.createdAt
          ? prev.createdAt
          : serverTimestamp();

      batch.set(doc(db, 'cloud_managed_accounts', docId, 'cards', cid), {
        accountId: docId,
        syncScope: 'GLOBAL',
        templateId: safeTplId,
        grade: Math.max(1, Math.min(MAX_CARD_GRADE, Math.floor(card.grade || 1))),
        ovr: Math.max(1, Math.min(300, Math.floor(card.ovr || 100))),
        valueBp: Math.max(0, Math.min(MAX_SAFE_BP, Math.floor(card.valueBp || 0))),
        ...(customMf ? { customMinifaceUrl: customMf } : {}),
        ...(validSerial ? { serialNumber: validSerial } : {}),
        createdAt: createdAtVal,
        updatedAt: serverTimestamp(),
      });
    }

    let deleted = 0;
    for (const oldId of existingCardsMap.keys()) {
      if (!keepIds.has(oldId) && deleted < 25) {
        batch.delete(doc(db, 'cloud_managed_accounts', docId, 'cards', oldId));
        deleted += 1;
      }
    }
    await batch.commit();
  } catch (error) {
    if (isOfflineOrTokenServiceError(error)) {
      recoverFromBrokenTokenIfNeeded(error);
      return nextRevision;
    }
    handleFirestoreError(error, OperationType.WRITE, `cloud_managed_accounts/${docId}/cards`);
  }

  // Publish cross-web Global Leaderboard entry (for local/guest docId; cloudUid handled below)
  if (authMode !== 'firebase') {
    const lbPath = `leaderboard_entries/${docId}`;
    try {
      if (nextIsBanned) {
        await deleteDoc(doc(db, 'leaderboard_entries', docId)).catch(() => {});
      } else {
        await setDoc(doc(db, 'leaderboard_entries', docId), {
          ownerId: docId,
          boardScope: 'GLOBAL',
          managerName: sanitizeManagerName(profile.managerName),
          vipLevel: Math.max(0, Math.min(20, vip.level)),
          vipPoints: Math.max(0, Math.min(100_000_000, Math.floor(vip.totalPoints))),
          squadValue: Math.max(0, Math.min(MAX_SAFE_BP, Math.floor(summary.squadValue))),
          bestCardOvr: Math.max(0, Math.min(300, Math.floor(summary.bestCardOvr || 0))),
          bestCardName: safeBestCardName,
          bestCardSeason: safeBestCardSeason,
          bestCardGrade: Math.max(1, Math.min(MAX_CARD_GRADE, Math.floor(summary.bestCardGrade || 1))),
          elo: safeElo,
          wins: safeWins,
          draws: safeDraws,
          losses: safeLosses,
          managerLevel,
          squadOvr,
          deviceLabel: safeDeviceLabel,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      if (isOfflineOrTokenServiceError(error)) {
        recoverFromBrokenTokenIfNeeded(error);
        return nextRevision;
      }
      handleFirestoreError(error, OperationType.WRITE, lbPath);
    }
  } else if (cloudUid) {
    await syncTargetCloudAccountByAdmin(cloudUid, profile, {
      isBanned: nextIsBanned,
      banReason: nextBanReason,
      isDelegatedAdmin: nextDelegated,
      adminRevision: nextRevision,
    });

    if (isCurrentFirebaseUserCloudAdmin() && opts?.isDelegatedAdmin !== undefined) {
      try {
        if (nextDelegated) {
          await setDoc(doc(db, 'admins', cloudUid), {
            uid: cloudUid,
            grantedAt: serverTimestamp(),
          });
        } else {
          await deleteDoc(doc(db, 'admins', cloudUid)).catch(() => {});
        }
      } catch {
        // Non-fatal if target user doc was not yet initialized
      }
    }
  }

  return nextRevision;
}

export function subscribeCloudManagedAccountsForAdmin(
  onEntries: (entries: ManagedAccountEntry[]) => void
): () => void {
  if (!isCurrentFirebaseUserCloudAdmin()) {
    onEntries([]);
    return () => {};
  }
  const q = query(
    collection(db, 'cloud_managed_accounts'),
    where('syncScope', '==', 'GLOBAL'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const mapped: ManagedAccountEntry[] = snap.docs.map((d) => {
        const data = d.data();
        const docId = String(data.accountId || d.id);
        const mode: 'local' | 'guest' | 'firebase' =
          data.authMode === 'firebase' || data.authMode === 'local' ? data.authMode : 'guest';
        const accountKey =
          mode === 'firebase'
            ? docId.replace(/^cloud_/, '')
            : mode === 'local'
            ? docId.replace(/^local_/, '')
            : docId;
        const summaryKey =
          mode === 'firebase'
            ? `cloud:${accountKey}`
            : mode === 'local'
            ? `local:${accountKey}`
            : `guest:${accountKey}`;
        const packs = clampPackMap((data.packs as PackInventory) || createStarterProfile('x', 'HLV', 'guest').packs);
        const tsMs =
          data.updatedAt && typeof data.updatedAt.toMillis === 'function'
            ? Number(data.updatedAt.toMillis())
            : Date.now();

        return {
          summaryKey,
          accountKey,
          managerName: sanitizeManagerName(data.managerName || 'HLV Liên Web'),
          usernameOrEmail:
            mode === 'firebase' ? `Cloud UID: ${accountKey.slice(0, 12)}` : `${accountKey} (Cloud Web)`,
          authMode: mode,
          deviceLabel: typeof data.deviceLabel === 'string' ? data.deviceLabel : 'Khác Web',
          elo: typeof data.elo === 'number' ? data.elo : 2050,
          squadOvr: typeof data.squadOvr === 'number' ? data.squadOvr : 130,
          vipLevel: Number(data.vipLevel ?? 1),
          vipPoints: Number(data.vipPoints ?? 60),
          fc: Number(data.fc ?? 500),
          bp: Number(data.bp ?? 0),
          starPoints: Number(data.starPoints ?? 0),
          squadValue: Number(data.squadValue ?? 0),
          bestCardOvr: Number(data.bestCardOvr ?? 120),
          bestCardName: String(data.bestCardName || 'Cầu thủ'),
          cardCount: 22,
          packCount: countTotalPacks(packs),
          isBanned: Boolean(data.isBanned),
          banReason: typeof data.banReason === 'string' ? data.banReason : '',
          isDelegatedAdmin: Boolean(data.isDelegatedAdmin),
          isMasterAdmin: summaryKey === `local:${MASTER_ADMIN_USERNAME}`,
          lastSavedAt: tsMs,
        };
      });
      onEntries(mapped);
    },
    () => {
      onEntries([]);
    }
  );
}

export async function openOrCreateCrossWebTargetAccountByAdmin(
  rawIdentifier: string
): Promise<{
  summaryKey: string;
  profile: ManagerProfile;
  createdNewTarget: boolean;
}> {
  const trimmed = rawIdentifier.trim();
  if (trimmed.length < 2) {
    throw new Error('Vui lòng nhập Tên đăng nhập, Mã Khách (guest_...) hoặc Cloud UID tối thiểu 2 ký tự.');
  }
  const resolved = resolveCrossWebSummaryAndDocId(trimmed);
  const existingProfile = await loadManagedAccountFullProfile(resolved.summaryKey);
  if (existingProfile) {
    if (hasCloudAdminWriteAuthority()) {
      await publishCloudManagedAccountByAdmin(resolved.summaryKey, existingProfile, {
        bumpRevision: false,
      }).catch(() => {});
    }
    return {
      summaryKey: resolved.summaryKey,
      profile: existingProfile,
      createdNewTarget: false,
    };
  }

  const starter = createStarterProfile(
    resolved.authMode === 'firebase' ? resolved.accountKey : resolved.docId,
    `HLV ${resolved.accountKey.slice(0, 18)}`,
    resolved.authMode,
    resolved.authMode === 'local' ? resolved.accountKey : undefined
  );
  const targetDraft: ManagerProfile = {
    ...starter,
    deviceLabel: 'Đồng bộ Liên Web',
  };
  const saved = await persistManagedAccountMutation(resolved.summaryKey, targetDraft);
  return {
    summaryKey: resolved.summaryKey,
    profile: saved,
    createdNewTarget: true,
  };
}

export async function mirrorKnownAccountsToCloudForAdmin(
  entries: ManagedAccountEntry[]
): Promise<number> {
  if (!hasCloudAdminWriteAuthority()) return 0;
  let mirrored = 0;
  for (const entry of entries.slice(0, 25)) {
    const full = await loadManagedAccountFullProfile(entry.summaryKey);
    if (!full) continue;
    await publishCloudManagedAccountByAdmin(entry.summaryKey, full, {
      isBanned: entry.isBanned,
      banReason: entry.banReason,
      isDelegatedAdmin: entry.isDelegatedAdmin,
      bumpRevision: false,
    }).catch(() => {});
    mirrored += 1;
  }
  return mirrored;
}

export function subscribeActiveAccountCrossWebSync(
  profile: ManagerProfile,
  callbacks: {
    onRemoteUpdate: (next: ManagerProfile) => void;
    onRemoteBan: (reason: string) => void;
  }
): () => void {
  const summaryKey = getCanonicalSummaryKeyForProfile(profile);
  const resolved = resolveCrossWebSummaryAndDocId(summaryKey);
  let disposed = false;
  let lastAppliedRev = profile.adminRevision ?? 0;

  const unsubManaged = onSnapshot(
    doc(db, 'cloud_managed_accounts', resolved.docId),
    async (snap) => {
      if (disposed || !snap.exists()) return;
      const data = snap.data();
      if (Boolean(data.isBanned) && !isMasterAdminAccount(profile)) {
        callbacks.onRemoteBan(
          typeof data.banReason === 'string' && data.banReason
            ? data.banReason
            : 'Tài khoản đã bị tạm khóa bởi Quản Trị Viên.'
        );
        return;
      }
      const remoteRev = typeof data.adminRevision === 'number' ? Math.floor(data.adminRevision) : 0;
      if (remoteRev > lastAppliedRev) {
        lastAppliedRev = remoteRev;
        const full = await loadCloudManagedAccountByDocId(resolved.docId, resolved.summaryKey);
        if (!disposed && full) {
          const merged: ManagerProfile = {
            ...full.profile,
            id: profile.id,
            authMode: profile.authMode,
            usernameOrEmail: profile.usernameOrEmail ?? full.profile.usernameOrEmail,
            adminRevision: remoteRev,
          };
          if (merged.isDelegatedAdmin) {
            setGmSessionUnlocked(true);
          }
          saveProfileLocally(merged);
          callbacks.onRemoteUpdate(merged);
        }
      }
    },
    () => {
      // Ignore transient offline errors
    }
  );

  let unsubUserDoc: (() => void) | null = null;
  const currentUid = hasUsableFirebaseUserSession(auth.currentUser)
    ? sanitizeFirestoreId(auth.currentUser.uid)
    : null;
  if (
    profile.authMode === 'firebase' &&
    currentUid &&
    currentUid === sanitizeFirestoreId(profile.id)
  ) {
    unsubUserDoc = onSnapshot(
      doc(db, 'users', currentUid),
      async (snap) => {
        if (disposed || !snap.exists() || !auth.currentUser) return;
        const data = snap.data();
        if (Boolean(data.isBanned) && !hasCloudAdminWriteAuthority()) {
          callbacks.onRemoteBan(
            typeof data.banReason === 'string' && data.banReason
              ? data.banReason
              : 'Tài khoản Cloud đã bị khóa bởi Quản Trị Viên.'
          );
          return;
        }
        const remoteRev = typeof data.adminRevision === 'number' ? Math.floor(data.adminRevision) : 0;
        if (remoteRev > lastAppliedRev) {
          lastAppliedRev = remoteRev;
          try {
            const fresh = await loadOrCreateCloudProfile(auth.currentUser);
            if (!disposed) {
              saveProfileLocally(fresh);
              callbacks.onRemoteUpdate(fresh);
            }
          } catch {
            // Ignore offline errors
          }
        }
      },
      () => {}
    );
  }

  return () => {
    disposed = true;
    unsubManaged();
    if (unsubUserDoc) unsubUserDoc();
  };
}

export async function persistManagedAccountMutation(
  summaryKeyRaw: string,
  nextProfile: ManagerProfile
): Promise<ManagerProfile> {
  const resolved = resolveCrossWebSummaryAndDocId(summaryKeyRaw);
  const summaryKey = resolved.summaryKey;
  let cleanProfile: ManagerProfile = {
    ...nextProfile,
    foosballLoops: Math.max(0, Math.min(1_000_000, Math.floor(nextProfile.foosballLoops ?? 0))),
    squadOvr: calculateProfileSquadOvr(nextProfile),
  };
  const now = Date.now();

  // 1. Push remote mutation to same-URL Cross-Device Server Hub
  const remoteRes = await mutateServerHubAccount({
    summaryKey,
    action: 'save_profile',
    profile: cleanProfile,
  });
  if (typeof remoteRes?.adminRevision === 'number') {
    cleanProfile = {
      ...cleanProfile,
      adminRevision: remoteRes.adminRevision,
    };
  }

  // 2. Push Cross-Web Cloud Firestore mutation so ANY web URL & ANY device receives live updates!
  if (hasCloudAdminWriteAuthority()) {
    const cloudRev = await publishCloudManagedAccountByAdmin(summaryKey, cleanProfile, {
      bumpRevision: true,
    });
    if (typeof cloudRev === 'number') {
      cleanProfile = {
        ...cleanProfile,
        adminRevision: Math.max(cleanProfile.adminRevision ?? 0, cloudRev),
      };
    }
  }

  if (summaryKey.startsWith('local:')) {
    const key = summaryKey.slice('local:'.length).toLowerCase();
    const accounts = readLocalAccounts();
    if (accounts[key]) {
      accounts[key] = {
        ...accounts[key],
        lastSavedAt: now,
        profile: {
          ...cleanProfile,
          authMode: 'local',
          usernameOrEmail: cleanProfile.usernameOrEmail || key,
        },
      };
      writeLocalAccounts(accounts);
    }
  } else if (summaryKey.startsWith('guest:')) {
    const localGuestId = getCanonicalOwnerIdForProfile(
      createStarterProfile('guest_default', 'HLV Khách', 'guest')
    );
    if (summaryKey === `guest:${localGuestId}` || summaryKey === 'guest:guest_default') {
      writeGuestSnapshot({
        ...cleanProfile,
        authMode: 'guest',
      });
    }
  } else if (summaryKey.startsWith('cloud:')) {
    const targetUid = sanitizeFirestoreId(summaryKey.slice('cloud:'.length));
    const snaps = readCloudSnapshots();
    snaps[targetUid] = {
      ...(snaps[targetUid] ?? {}),
      accountKey: targetUid,
      lastSavedAt: now,
      profile: {
        ...cleanProfile,
        id: targetUid,
        authMode: 'firebase',
      },
    };
    writeCloudSnapshots(snaps);
  }

  return cleanProfile;
}

export function adminCreateNewPlayerAccount(params: {
  managerName: string;
  usernameOrEmail: string;
  password: string;
  initialSvipLevel?: number;
  initialFc?: number;
  initialBp?: number;
}): { summaryKey: string; profile: ManagerProfile } {
  const cleanName = sanitizeManagerName(params.managerName);
  const cleanAccount = params.usernameOrEmail.trim().toLowerCase();
  if (cleanAccount.length < 3) {
    throw new Error('Tên đăng nhập tài khoản mới phải có ít nhất 3 ký tự.');
  }
  if (params.password.length < 6) {
    throw new Error('Mật khẩu tài khoản mới phải có ít nhất 6 ký tự.');
  }

  const accounts = readLocalAccounts();
  if (accounts[cleanAccount]) {
    throw new Error(`Tài khoản "${cleanAccount}" đã tồn tại trên hệ thống.`);
  }

  const uid = `hlv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const base = createStarterProfile(uid, cleanName, 'local', cleanAccount);
  const svipLv = Math.max(0, Math.min(20, Math.floor(params.initialSvipLevel ?? 1)));
  const exactPts = getCumulativePointsForVipLevel(svipLv);
  const passHash = simpleHash(params.password);
  const deviceLabel = detectDeviceLabel();

  const profile: ManagerProfile = {
    ...base,
    fc:
      typeof params.initialFc === 'number' && Number.isFinite(params.initialFc)
        ? Math.max(0, Math.min(1_000_000_000, Math.floor(params.initialFc)))
        : base.fc,
    bp:
      typeof params.initialBp === 'number' && Number.isFinite(params.initialBp)
        ? Math.max(0, Math.min(MAX_SAFE_BP, Math.floor(params.initialBp)))
        : base.bp,
    vipPoints: exactPts,
    vipLevel: svipLv,
    foosballLoops: base.foosballLoops,
    deviceLabel,
  };

  accounts[cleanAccount] = {
    accountKey: cleanAccount,
    passwordHash: passHash,
    rememberLogin: true,
    lastSavedAt: Date.now(),
    isBanned: false,
    banReason: '',
    isDelegatedAdmin: false,
    profile,
  };
  writeLocalAccounts(accounts);

  const summaryKey = `local:${cleanAccount}`;
  mutateServerHubAccount({
    summaryKey,
    action: 'create_account',
    accountKey: cleanAccount,
    authMode: 'local',
    usernameOrEmail: cleanAccount,
    passwordHash: passHash,
    deviceLabel,
    profile,
  }).catch(() => {});

  if (hasCloudAdminWriteAuthority()) {
    publishCloudManagedAccountByAdmin(summaryKey, profile, {
      isBanned: false,
      banReason: '',
      isDelegatedAdmin: false,
      bumpRevision: true,
    }).catch(() => {});
  }

  return { summaryKey, profile };
}

export function adminResetLocalAccountPassword(
  summaryKey: string,
  newPassword: string
): void {
  if (!summaryKey.startsWith('local:')) {
    throw new Error('Chỉ hỗ trợ đặt lại mật khẩu trực tiếp cho tài khoản HLV đăng ký trên máy chủ.');
  }
  if (newPassword.length < 6) {
    throw new Error('Mật khẩu mới phải từ 6 ký tự trở lên.');
  }
  const key = summaryKey.slice('local:'.length).toLowerCase();
  const passHash = simpleHash(newPassword);
  const accounts = readLocalAccounts();
  if (accounts[key]) {
    accounts[key] = {
      ...accounts[key],
      passwordHash: passHash,
      lastSavedAt: Date.now(),
    };
    writeLocalAccounts(accounts);
  }
  mutateServerHubAccount({
    summaryKey,
    action: 'reset_password',
    passwordHash: passHash,
  }).catch(() => {});
}

export function adminSetAccountBanStatus(
  summaryKeyRaw: string,
  isBanned: boolean,
  banReason: string = ''
): void {
  const resolved = resolveCrossWebSummaryAndDocId(summaryKeyRaw);
  const summaryKey = resolved.summaryKey;
  if (summaryKey === `local:${MASTER_ADMIN_USERNAME}`) {
    throw new Error('Không thể khóa Tài Khoản Quản Trị Viên gốc.');
  }
  const cleanReason = isBanned ? banReason.trim().slice(0, 100) : '';
  mutateServerHubAccount({
    summaryKey,
    action: 'set_ban',
    isBanned,
    banReason: cleanReason,
  }).catch(() => {});

  if (hasCloudAdminWriteAuthority()) {
    loadManagedAccountFullProfile(summaryKey)
      .then((loaded) => {
        if (loaded) {
          return publishCloudManagedAccountByAdmin(summaryKey, loaded, {
            isBanned,
            banReason: cleanReason,
            bumpRevision: true,
          });
        }
        return null;
      })
      .catch(() => {});
  }

  if (summaryKey.startsWith('local:')) {
    const key = summaryKey.slice('local:'.length).toLowerCase();
    const accounts = readLocalAccounts();
    if (accounts[key]) {
      accounts[key] = {
        ...accounts[key],
        isBanned,
        banReason: cleanReason,
      };
      writeLocalAccounts(accounts);
    }
    return;
  }
  if (summaryKey.startsWith('guest:')) {
    const guestSnap = readGuestSnapshot();
    if (guestSnap) {
      writeGuestSnapshot(guestSnap.profile, {
        isBanned,
        banReason: cleanReason,
      });
    }
    return;
  }
  if (summaryKey.startsWith('cloud:')) {
    const uid = summaryKey.slice('cloud:'.length);
    const snaps = readCloudSnapshots();
    if (snaps[uid]) {
      snaps[uid] = {
        ...snaps[uid],
        isBanned,
        banReason: cleanReason,
      };
      writeCloudSnapshots(snaps);
    }
  }
}

export function adminSetDelegatedAdminStatus(
  summaryKeyRaw: string,
  granted: boolean
): void {
  const resolved = resolveCrossWebSummaryAndDocId(summaryKeyRaw);
  const summaryKey = resolved.summaryKey;
  if (summaryKey === `local:${MASTER_ADMIN_USERNAME}`) return;
  mutateServerHubAccount({
    summaryKey,
    action: 'set_delegated_admin',
    isDelegatedAdmin: granted,
  }).catch(() => {});

  if (hasCloudAdminWriteAuthority()) {
    loadManagedAccountFullProfile(summaryKey)
      .then((loaded) => {
        if (loaded) {
          return publishCloudManagedAccountByAdmin(
            summaryKey,
            { ...loaded, isDelegatedAdmin: granted },
            {
              isDelegatedAdmin: granted,
              bumpRevision: true,
            }
          );
        }
        return null;
      })
      .catch(() => {});
  }

  if (summaryKey.startsWith('local:')) {
    const key = summaryKey.slice('local:'.length).toLowerCase();
    const accounts = readLocalAccounts();
    if (accounts[key]) {
      accounts[key] = {
        ...accounts[key],
        isDelegatedAdmin: granted,
        profile: {
          ...accounts[key].profile,
          isDelegatedAdmin: granted,
        },
      };
      writeLocalAccounts(accounts);
    }
    return;
  }
  if (summaryKey.startsWith('cloud:')) {
    const uid = summaryKey.slice('cloud:'.length);
    const snaps = readCloudSnapshots();
    if (snaps[uid]) {
      snaps[uid] = {
        ...snaps[uid],
        isDelegatedAdmin: granted,
        profile: {
          ...snaps[uid].profile,
          isDelegatedAdmin: granted,
        },
      };
      writeCloudSnapshots(snaps);
    }
  }
}

export async function adminDeleteManagedAccount(summaryKeyRaw: string): Promise<void> {
  const resolved = resolveCrossWebSummaryAndDocId(summaryKeyRaw);
  const summaryKey = resolved.summaryKey;
  if (summaryKey === `local:${MASTER_ADMIN_USERNAME}`) {
    throw new Error('Không thể xóa Tài Khoản Quản Trị Viên gốc (admin).');
  }
  await mutateServerHubAccount({
    summaryKey,
    action: 'delete_account',
  }).catch(() => {});

  if (hasCloudAdminWriteAuthority()) {
    try {
      await deleteDoc(doc(db, 'cloud_managed_accounts', resolved.docId)).catch(() => {});
      await deleteDoc(doc(db, 'leaderboard_entries', resolved.docId)).catch(() => {});
    } catch {
      // Ignore if doc did not exist
    }
  }

  if (summaryKey.startsWith('local:')) {
    const key = summaryKey.slice('local:'.length).toLowerCase();
    const accounts = readLocalAccounts();
    delete accounts[key];
    writeLocalAccounts(accounts);
    return;
  }
  if (summaryKey.startsWith('guest:')) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(GUEST_SNAPSHOT_KEY);
    }
    return;
  }
  if (summaryKey.startsWith('cloud:')) {
    const uid = sanitizeFirestoreId(summaryKey.slice('cloud:'.length));
    const snaps = readCloudSnapshots();
    delete snaps[uid];
    writeCloudSnapshots(snaps);
    if (hasCloudAdminWriteAuthority()) {
      try {
        await deleteDoc(doc(db, 'leaderboard_entries', uid)).catch(() => {});
        await deleteDoc(doc(db, 'users', uid));
      } catch (error) {
        if (isOfflineOrTokenServiceError(error)) {
          recoverFromBrokenTokenIfNeeded(error);
          return;
        }
        handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
      }
    }
  }
}

export function adminBroadcastGiftToAllLocalAccounts(
  gift: {
    fcDelta?: number;
    bpDelta?: number;
    tarpoiDelta?: number;
    svipBonusPoints?: number;
    packId?: PackId;
    packCount?: number;
  },
  broadcastId?: string
): { rewardedCount: number } {
  const accounts = readLocalAccounts();
  const keys = Object.keys(accounts);
  let rewardedCount = 0;

  const stampBroadcastId = (p: ManagerProfile): ManagerProfile => {
    if (!broadcastId) return p;
    const set = new Set(p.claimedBroadcastIds ?? []);
    set.add(broadcastId);
    return {
      ...p,
      claimedBroadcastIds: Array.from(set).slice(-50),
    };
  };

  for (const key of keys) {
    if (broadcastId && (accounts[key].profile.claimedBroadcastIds ?? []).includes(broadcastId)) {
      continue;
    }
    const updated = stampBroadcastId(
      adminApplyGlobalBroadcastGift([accounts[key].profile], gift)[0]
    );
    accounts[key] = {
      ...accounts[key],
      lastSavedAt: Date.now(),
      profile: updated,
    };
    rewardedCount += 1;
  }
  writeLocalAccounts(accounts);

  const guestSnap = readGuestSnapshot();
  if (
    guestSnap &&
    !(broadcastId && (guestSnap.profile.claimedBroadcastIds ?? []).includes(broadcastId))
  ) {
    const updatedGuest = stampBroadcastId(
      adminApplyGlobalBroadcastGift([guestSnap.profile], gift)[0]
    );
    writeGuestSnapshot(updatedGuest);
    rewardedCount += 1;
  }

  const cloudSnaps = readCloudSnapshots();
  for (const uid of Object.keys(cloudSnaps)) {
    if (broadcastId && (cloudSnaps[uid].profile.claimedBroadcastIds ?? []).includes(broadcastId)) {
      continue;
    }
    const updatedCloud = stampBroadcastId(
      adminApplyGlobalBroadcastGift([cloudSnaps[uid].profile], gift)[0]
    );
    cloudSnaps[uid] = {
      ...cloudSnaps[uid],
      lastSavedAt: Date.now(),
      profile: updatedCloud,
    };
    rewardedCount += 1;
  }
  writeCloudSnapshots(cloudSnaps);

  return { rewardedCount };
}

// ============================================================================
// CROSS-DEVICE EXPRESS SERVER HUB SYNC ENGINE (/api/sync/*)
// ============================================================================

export interface ServerHubBootstrapPayload {
  serverRules: GlobalServerRules;
  serverRulesUpdatedAt: number;
  broadcasts: ServerBroadcastGift[];
  leaderboardRows: LeaderboardRow[];
}

export async function fetchServerHubBootstrap(): Promise<ServerHubBootstrapPayload | null> {
  if (typeof window === 'undefined') return null;
  try {
    const resp = await fetch('/api/sync/bootstrap', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      ok?: boolean;
      serverRules?: Partial<GlobalServerRules>;
      serverRulesUpdatedAt?: number;
      broadcasts?: ServerBroadcastGift[];
      leaderboardRows?: LeaderboardRow[];
    };
    if (!json.ok) return null;
    return {
      serverRules: sanitizeGlobalServerRules(json.serverRules),
      serverRulesUpdatedAt: Number(json.serverRulesUpdatedAt || 0),
      broadcasts: Array.isArray(json.broadcasts) ? json.broadcasts : [],
      leaderboardRows: Array.isArray(json.leaderboardRows) ? json.leaderboardRows : [],
    };
  } catch {
    return null;
  }
}

export async function syncProfileWithServerHub(profile: ManagerProfile): Promise<{
  appliedAdminMutation: boolean;
  remoteProfile?: ManagerProfile;
  isBanned?: boolean;
  banReason?: string;
  serverRules?: GlobalServerRules;
  serverRulesUpdatedAt?: number;
  broadcasts?: ServerBroadcastGift[];
  leaderboardRows?: LeaderboardRow[];
} | null> {
  if (typeof window === 'undefined') return null;
  try {
    const ownerId = getCanonicalOwnerIdForProfile(profile);
    const summaryKey = getCanonicalSummaryKeyForProfile(profile);
    const deviceLabel = profile.deviceLabel || detectDeviceLabel();
    const baseLb = buildLeaderboardRowFromProfile(
      {
        ...profile,
        id: ownerId,
        deviceLabel,
      },
      false
    );

    const resp = await fetch('/api/sync/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        summaryKey,
        ownerId,
        accountKey:
          profile.authMode === 'local'
            ? (profile.usernameOrEmail || profile.id).toLowerCase()
            : ownerId,
        authMode: profile.authMode,
        usernameOrEmail: profile.usernameOrEmail,
        deviceLabel,
        clientAdminRevision: profile.adminRevision ?? 0,
        profile: {
          ...profile,
          deviceLabel,
        },
        leaderboardRow: baseLb,
      }),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      ok?: boolean;
      isBanned?: boolean;
      banReason?: string;
      appliedAdminMutation?: boolean;
      adminRevision?: number;
      isDelegatedAdmin?: boolean;
      profile?: Partial<ManagerProfile> & Record<string, unknown>;
      serverRules?: Partial<GlobalServerRules>;
      serverRulesUpdatedAt?: number;
      broadcasts?: ServerBroadcastGift[];
      leaderboardRows?: LeaderboardRow[];
    };
    if (!json.ok) return null;

    if (json.appliedAdminMutation && json.profile) {
      const migrated = migrateLegacyProfile({
        ...json.profile,
        id: profile.id,
        authMode: profile.authMode,
        usernameOrEmail: profile.usernameOrEmail,
        adminRevision: json.adminRevision ?? (profile.adminRevision ?? 0) + 1,
        isDelegatedAdmin: Boolean(json.isDelegatedAdmin),
      });
      saveProfileLocally(migrated);
      return {
        appliedAdminMutation: true,
        remoteProfile: migrated,
        serverRules: json.serverRules ? sanitizeGlobalServerRules(json.serverRules) : undefined,
        serverRulesUpdatedAt: json.serverRulesUpdatedAt,
        broadcasts: Array.isArray(json.broadcasts) ? json.broadcasts : [],
        leaderboardRows: Array.isArray(json.leaderboardRows) ? json.leaderboardRows : [],
      };
    }

    return {
      appliedAdminMutation: false,
      isBanned: Boolean(json.isBanned),
      banReason: json.banReason,
      serverRules: json.serverRules ? sanitizeGlobalServerRules(json.serverRules) : undefined,
      serverRulesUpdatedAt: json.serverRulesUpdatedAt,
      broadcasts: Array.isArray(json.broadcasts) ? json.broadcasts : [],
      leaderboardRows: Array.isArray(json.leaderboardRows) ? json.leaderboardRows : [],
    };
  } catch {
    return null;
  }
}

async function registerAccountOnServerHub(params: {
  accountKey: string;
  passwordHash: string;
  profile: ManagerProfile;
  deviceLabel: string;
}): Promise<void> {
  if (typeof window === 'undefined') return;
  let resp: Response;
  try {
    resp = await fetch('/api/sync/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        accountKey: params.accountKey,
        passwordHash: params.passwordHash,
        deviceLabel: params.deviceLabel,
        profile: params.profile,
        leaderboardRow: buildLeaderboardRowFromProfile(params.profile, false),
      }),
    });
  } catch {
    // Allow offline fallback if server endpoint is temporarily unreachable
    return;
  }

  if (resp.status === 409) {
    const errJson = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      errJson.error ||
        'Tài khoản này đã được đăng ký trên một thiết bị khác. Vui lòng chuyển sang Đăng nhập.'
    );
  }
}

async function loginAccountOnServerHub(
  accountKey: string,
  passwordHash: string,
  deviceLabel: string
): Promise<{
  status: 'ok' | 'not_found' | 'wrong_password' | 'banned' | 'offline';
  profile?: ManagerProfile;
  isDelegatedAdmin?: boolean;
  error?: string;
}> {
  if (typeof window === 'undefined') return { status: 'offline' };
  try {
    const resp = await fetch('/api/sync/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ accountKey, passwordHash, deviceLabel }),
    });
    if (resp.status === 404) return { status: 'not_found' };
    const json = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
      error?: string;
      isDelegatedAdmin?: boolean;
      adminRevision?: number;
      profile?: Partial<ManagerProfile> & Record<string, unknown>;
    };
    if (resp.status === 401 || json.code === 'WRONG_PASSWORD') {
      return {
        status: 'wrong_password',
        error: json.error || 'Mật khẩu không chính xác. Vui lòng kiểm tra lại.',
      };
    }
    if (resp.status === 403 || json.code === 'BANNED') {
      return {
        status: 'banned',
        error: json.error || 'Tài khoản đã bị tạm khóa bởi Quản Trị Viên.',
      };
    }
    if (json.ok && json.profile) {
      const migrated = migrateLegacyProfile({
        ...json.profile,
        authMode: 'local',
        usernameOrEmail: accountKey,
        adminRevision: json.adminRevision ?? 0,
        isDelegatedAdmin: Boolean(json.isDelegatedAdmin),
      });
      return {
        status: 'ok',
        profile: migrated,
        isDelegatedAdmin: Boolean(json.isDelegatedAdmin),
      };
    }
    return { status: 'not_found' };
  } catch {
    return { status: 'offline' };
  }
}

export async function fetchServerManagedAccounts(): Promise<ManagedAccountEntry[]> {
  if (typeof window === 'undefined') return [];
  try {
    const resp = await fetch('/api/sync/admin/accounts', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as {
      ok?: boolean;
      accounts?: ManagedAccountEntry[];
    };
    return json.ok && Array.isArray(json.accounts) ? json.accounts : [];
  } catch {
    return [];
  }
}

async function fetchServerManagedAccountProfile(
  summaryKey: string
): Promise<ManagerProfile | null> {
  if (typeof window === 'undefined') return null;
  try {
    const resp = await fetch('/api/sync/admin/account-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ summaryKey }),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      ok?: boolean;
      adminRevision?: number;
      isDelegatedAdmin?: boolean;
      profile?: Partial<ManagerProfile> & Record<string, unknown>;
    };
    if (!json.ok || !json.profile) return null;
    return migrateLegacyProfile({
      ...json.profile,
      adminRevision: json.adminRevision,
      isDelegatedAdmin: Boolean(json.isDelegatedAdmin),
    });
  } catch {
    return null;
  }
}

async function mutateServerHubAccount(params: {
  summaryKey: string;
  action:
    | 'save_profile'
    | 'create_account'
    | 'reset_password'
    | 'set_ban'
    | 'set_delegated_admin'
    | 'delete_account';
  profile?: ManagerProfile;
  passwordHash?: string;
  isBanned?: boolean;
  banReason?: string;
  isDelegatedAdmin?: boolean;
  accountKey?: string;
  authMode?: 'guest' | 'local' | 'firebase';
  usernameOrEmail?: string;
  deviceLabel?: string;
}): Promise<{ adminRevision?: number } | null> {
  if (typeof window === 'undefined') return null;
  try {
    const lbRow = params.profile
      ? buildLeaderboardRowFromProfile(
          {
            ...params.profile,
            id:
              params.profile.authMode === 'guest'
                ? params.summaryKey.replace(/^guest:/, '')
                : params.profile.id,
          },
          false
        )
      : undefined;

    const resp = await fetch('/api/sync/admin/mutate-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        ...params,
        ...(lbRow ? { leaderboardRow: lbRow } : {}),
      }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as { adminRevision?: number };
  } catch {
    return null;
  }
}

export async function publishGlobalServerRulesEverywhere(
  rules: GlobalServerRules,
  actorName: string
): Promise<GlobalServerRules> {
  const clean = sanitizeGlobalServerRules(rules);
  try {
    await fetch('/api/sync/admin/server-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ rules: clean, actorName }),
    });
  } catch {
    // Offline fallback
  }
  await publishCloudServerRules(clean, actorName).catch(() => {});
  return clean;
}

export async function publishGlobalBroadcastGiftEverywhere(params: {
  actorName: string;
  fcDelta: number;
  bpDelta: number;
  tarpoiDelta: number;
  svipBonusPoints: number;
  packId: PackId;
  packCount: number;
}): Promise<{ rewardedCount: number; broadcastId: string }> {
  const broadcastId = `bcast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const { rewardedCount: localCount } = adminBroadcastGiftToAllLocalAccounts(
    params,
    broadcastId
  );

  let serverCount = 0;
  try {
    const resp = await fetch('/api/sync/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        id: broadcastId,
        ...params,
      }),
    });
    if (resp.ok) {
      const json = (await resp.json()) as { totalAccountsCount?: number };
      serverCount = Number(json.totalAccountsCount || 0);
    }
  } catch {
    // Offline fallback
  }

  const giftObj: ServerBroadcastGift = {
    id: broadcastId,
    createdAtMs: Date.now(),
    actorName: params.actorName,
    fcDelta: params.fcDelta,
    bpDelta: params.bpDelta,
    tarpoiDelta: params.tarpoiDelta,
    svipBonusPoints: params.svipBonusPoints,
    packId: params.packId,
    packCount: params.packCount,
  };
  await publishCloudBroadcast(giftObj).catch(() => {});

  return {
    rewardedCount: Math.max(localCount, serverCount, 1),
    broadcastId,
  };
}

export { onAuthStateChanged };
