import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { attachGlxhOnlineServer } from './src/server/glxhOnlineServer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HubServerRules {
  guaranteedUpgrade100: boolean;
  upgradeRateMultiplier: 1 | 1.5 | 2 | 3;
  zeroMarketTax: boolean;
  matchRewardMultiplier: 1 | 2 | 3;
  serverAnnouncement: string;
}

interface HubBroadcastGift {
  id: string;
  createdAtMs: number;
  actorName: string;
  fcDelta: number;
  bpDelta: number;
  tarpoiDelta: number;
  svipBonusPoints: number;
  packId: string;
  packCount: number;
}

interface HubAccountRecord {
  summaryKey: string;
  ownerId: string;
  accountKey: string;
  passwordHash?: string;
  authMode: 'guest' | 'local' | 'firebase';
  usernameOrEmail?: string;
  deviceLabel?: string;
  isBanned: boolean;
  banReason: string;
  isDelegatedAdmin: boolean;
  isMasterAdmin: boolean;
  adminRevision: number;
  updatedAtMs: number;
  leaderboardRow: Record<string, unknown>;
  profile: Record<string, unknown>;
}

interface HubState {
  serverRules: HubServerRules;
  serverRulesUpdatedAt: number;
  serverRulesUpdatedBy: string;
  broadcasts: HubBroadcastGift[];
  accounts: Record<string, HubAccountRecord>;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const HUB_FILE = path.join(DATA_DIR, 'fco_server_hub.json');

const VALID_PACK_IDS = new Set([
  'iprm_pack',
  'le_pack',
  'ucl_26',
  'vb_26',
  'icon_tm',
  'toty_26',
  'tots_26',
  'bdo_pack',
  'up_pack',
  'ucl_25',
  'cu_fodder',
]);

const RESERVED_ADMIN_LOGINS = new Set(['admin', 'gm_fconline', 'daipss9789@gmail.com']);

function createDefaultHubState(): HubState {
  return {
    serverRules: {
      guaranteedUpgrade100: false,
      upgradeRateMultiplier: 1,
      zeroMarketTax: false,
      matchRewardMultiplier: 1,
      serverAnnouncement: '',
    },
    serverRulesUpdatedAt: 0,
    serverRulesUpdatedBy: 'Hệ thống',
    broadcasts: [],
    accounts: {},
  };
}

function sanitizeServerRules(raw: unknown): HubServerRules {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const validUp: Array<1 | 1.5 | 2 | 3> = [1, 1.5, 2, 3];
  const validMatch: Array<1 | 2 | 3> = [1, 2, 3];
  const upMult = validUp.includes(obj.upgradeRateMultiplier as 1 | 1.5 | 2 | 3)
    ? (obj.upgradeRateMultiplier as 1 | 1.5 | 2 | 3)
    : 1;
  const matchMult = validMatch.includes(obj.matchRewardMultiplier as 1 | 2 | 3)
    ? (obj.matchRewardMultiplier as 1 | 2 | 3)
    : 1;
  return {
    guaranteedUpgrade100: Boolean(obj.guaranteedUpgrade100),
    upgradeRateMultiplier: upMult,
    zeroMarketTax: Boolean(obj.zeroMarketTax),
    matchRewardMultiplier: matchMult,
    serverAnnouncement:
      typeof obj.serverAnnouncement === 'string'
        ? obj.serverAnnouncement.trim().slice(0, 140)
        : '',
  };
}

function loadHubState(): HubState {
  try {
    if (!fs.existsSync(HUB_FILE)) {
      return createDefaultHubState();
    }
    const raw = fs.readFileSync(HUB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<HubState>;
    return {
      serverRules: sanitizeServerRules(parsed.serverRules),
      serverRulesUpdatedAt:
        typeof parsed.serverRulesUpdatedAt === 'number' ? parsed.serverRulesUpdatedAt : 0,
      serverRulesUpdatedBy:
        typeof parsed.serverRulesUpdatedBy === 'string'
          ? parsed.serverRulesUpdatedBy.slice(0, 32)
          : 'Hệ thống',
      broadcasts: Array.isArray(parsed.broadcasts) ? parsed.broadcasts.slice(0, 50) : [],
      accounts:
        parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {},
    };
  } catch {
    return createDefaultHubState();
  }
}

let hubState: HubState = loadHubState();

function persistHubState(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${HUB_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(hubState), 'utf8');
    fs.renameSync(tmpPath, HUB_FILE);
  } catch (err) {
    console.error('Failed to persist server hub state:', err);
  }
}

function sanitizeSafeKey(raw: unknown, maxLen: number = 140): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, maxLen);
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function sanitizeLeaderboardRow(
  rawRow: unknown,
  fallbackOwnerId: string,
  authMode: 'guest' | 'local' | 'firebase',
  deviceLabel?: string,
  isMasterAdmin?: boolean,
  updatedAtMs?: number
): Record<string, unknown> {
  const r = (rawRow && typeof rawRow === 'object' ? rawRow : {}) as Record<string, unknown>;
  const accountType =
    authMode === 'firebase' ? 'cloud' : authMode === 'local' ? 'registered' : 'guest';
  return {
    ownerId: sanitizeSafeKey(r.ownerId, 128) || fallbackOwnerId,
    managerName: sanitizeSafeKey(r.managerName, 32) || 'HLV FC Online',
    vipLevel: clampInt(r.vipLevel, 0, 20, 1),
    vipPoints: clampInt(r.vipPoints, 0, 100_000_000, 60),
    squadValue: clampInt(r.squadValue, 0, 8_500_000_000_000_000, 0),
    bestCardOvr: clampInt(r.bestCardOvr, 0, 300, 120),
    bestCardName: sanitizeSafeKey(r.bestCardName, 60) || 'Cầu thủ FC',
    bestCardSeason: sanitizeSafeKey(r.bestCardSeason, 16) || '26UCL',
    bestCardGrade: clampInt(r.bestCardGrade, 1, 13, 1),
    elo: clampInt(r.elo, 1000, 10_000, 2050),
    wins: clampInt(r.wins, 0, 1_000_000, 14),
    draws: clampInt(r.draws, 0, 1_000_000, 3),
    losses: clampInt(r.losses, 0, 1_000_000, 4),
    managerLevel: clampInt(r.managerLevel, 1, 100, 25),
    squadOvr: clampInt(r.squadOvr, 0, 300, 130),
    accountType,
    ...(deviceLabel ? { deviceLabel: deviceLabel.slice(0, 40) } : {}),
    ...(isMasterAdmin ? { isMasterAdmin: true } : {}),
    updatedAtMs: updatedAtMs ?? Date.now(),
  };
}

function getPublicLeaderboardRows(): Record<string, unknown>[] {
  return Object.values(hubState.accounts)
    .filter((acc) => !acc.isBanned && acc.leaderboardRow)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .slice(0, 200)
    .map((acc) => acc.leaderboardRow);
}

function summarizeAccountForAdmin(acc: HubAccountRecord): Record<string, unknown> {
  const p = acc.profile || {};
  const lb = acc.leaderboardRow || {};
  const cards = Array.isArray(p.cards) ? p.cards : [];
  const packsObj =
    p.packs && typeof p.packs === 'object' ? (p.packs as Record<string, unknown>) : {};
  const packCount = Object.values(packsObj).reduce<number>(
    (sum, val) => sum + (Number(val) || 0),
    0
  );

  return {
    summaryKey: acc.summaryKey,
    accountKey: acc.accountKey,
    managerName: sanitizeSafeKey(p.managerName, 32) || String(lb.managerName || 'HLV'),
    usernameOrEmail:
      sanitizeSafeKey(acc.usernameOrEmail, 80) ||
      (acc.authMode === 'guest'
        ? `Thiết bị: ${acc.deviceLabel || 'Trực tuyến'}`
        : acc.accountKey),
    authMode: acc.authMode,
    deviceLabel: acc.deviceLabel || '',
    vipLevel: clampInt(p.vipLevel ?? lb.vipLevel, 0, 20, 1),
    vipPoints: clampInt(p.vipPoints ?? lb.vipPoints, 0, 100_000_000, 60),
    fc: clampInt(p.fc, 0, 1_000_000_000, 500),
    bp: clampInt(p.bp, 0, 8_500_000_000_000_000, 0),
    starPoints: clampInt(p.starPoints, 0, 1_000_000_000, 0),
    squadValue: clampInt(lb.squadValue, 0, 8_500_000_000_000_000, 0),
    bestCardOvr: clampInt(lb.bestCardOvr, 0, 300, 120),
    bestCardName: String(lb.bestCardName || 'Cầu thủ'),
    elo: clampInt(p.elo ?? lb.elo, 1000, 10_000, 2050),
    squadOvr: clampInt(p.squadOvr ?? lb.squadOvr, 0, 300, 130),
    cardCount: cards.length,
    packCount,
    isBanned: Boolean(acc.isBanned),
    banReason: acc.banReason || '',
    isDelegatedAdmin: Boolean(acc.isDelegatedAdmin),
    isMasterAdmin: Boolean(acc.isMasterAdmin),
    adminRevision: acc.adminRevision,
    lastSavedAt: acc.updatedAtMs,
  };
}

async function startServer(): Promise<void> {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '4mb' }));

  app.use('/api/sync', (_req: Request, res: Response, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.get('/api/sync/bootstrap', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      serverRules: hubState.serverRules,
      serverRulesUpdatedAt: hubState.serverRulesUpdatedAt,
      serverRulesUpdatedBy: hubState.serverRulesUpdatedBy,
      broadcasts: hubState.broadcasts,
      leaderboardRows: getPublicLeaderboardRows(),
    });
  });

  app.post('/api/sync/account', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    const summaryKey = sanitizeSafeKey(body.summaryKey, 140);
    const ownerId = sanitizeSafeKey(body.ownerId, 128);
    if (!summaryKey || !ownerId) {
      res.status(400).json({ ok: false, error: 'Thiếu định danh tài khoản đồng bộ.' });
      return;
    }

    const authMode: 'guest' | 'local' | 'firebase' =
      body.authMode === 'firebase' || body.authMode === 'local' ? body.authMode : 'guest';
    const accountKey =
      sanitizeSafeKey(body.accountKey, 120) ||
      summaryKey.replace(/^(local:|cloud:|guest:)/, '');
    const deviceLabel = sanitizeSafeKey(body.deviceLabel, 40);
    const usernameOrEmail = sanitizeSafeKey(body.usernameOrEmail, 80);
    const clientAdminRevision = clampInt(body.clientAdminRevision, 0, 1_000_000_000, 0);

    const existing = hubState.accounts[summaryKey];
    const isMasterAdmin =
      summaryKey === 'local:admin' ||
      accountKey.toLowerCase() === 'admin' ||
      usernameOrEmail.toLowerCase() === 'daipss9789@gmail.com' ||
      ownerId === 'gm_master_admin';

    if (existing?.isBanned && !isMasterAdmin) {
      res.json({
        ok: true,
        isBanned: true,
        banReason: existing.banReason || 'Tài khoản đang tạm khóa bởi Quản Trị Viên.',
        serverRules: hubState.serverRules,
        serverRulesUpdatedAt: hubState.serverRulesUpdatedAt,
        broadcasts: hubState.broadcasts,
        leaderboardRows: getPublicLeaderboardRows(),
      });
      return;
    }

    if (existing && existing.adminRevision > clientAdminRevision) {
      res.json({
        ok: true,
        appliedAdminMutation: true,
        adminRevision: existing.adminRevision,
        isDelegatedAdmin: Boolean(existing.isDelegatedAdmin),
        profile: {
          ...existing.profile,
          adminRevision: existing.adminRevision,
          isDelegatedAdmin: Boolean(existing.isDelegatedAdmin),
        },
        leaderboardRow: existing.leaderboardRow,
        serverRules: hubState.serverRules,
        serverRulesUpdatedAt: hubState.serverRulesUpdatedAt,
        broadcasts: hubState.broadcasts,
        leaderboardRows: getPublicLeaderboardRows(),
      });
      return;
    }

    const now = Date.now();
    const rawProfile =
      body.profile && typeof body.profile === 'object'
        ? (body.profile as Record<string, unknown>)
        : {};
    const adminRevision = existing?.adminRevision ?? clientAdminRevision;
    const isDelegatedAdmin = Boolean(existing?.isDelegatedAdmin || rawProfile.isDelegatedAdmin);
    const effectiveDeviceLabel = deviceLabel || existing?.deviceLabel || 'Thiết bị Web';

    const sanitizedLb = sanitizeLeaderboardRow(
      body.leaderboardRow,
      ownerId,
      authMode,
      effectiveDeviceLabel,
      isMasterAdmin,
      now
    );

    hubState.accounts[summaryKey] = {
      summaryKey,
      ownerId,
      accountKey,
      ...(existing?.passwordHash ? { passwordHash: existing.passwordHash } : {}),
      authMode,
      usernameOrEmail: usernameOrEmail || existing?.usernameOrEmail,
      deviceLabel: effectiveDeviceLabel,
      isBanned: Boolean(existing?.isBanned),
      banReason: existing?.banReason || '',
      isDelegatedAdmin,
      isMasterAdmin,
      adminRevision,
      updatedAtMs: now,
      leaderboardRow: sanitizedLb,
      profile: {
        ...rawProfile,
        id: ownerId,
        adminRevision,
        isDelegatedAdmin,
        deviceLabel: effectiveDeviceLabel,
      },
    };
    persistHubState();

    res.json({
      ok: true,
      appliedAdminMutation: false,
      adminRevision,
      isDelegatedAdmin,
      serverRules: hubState.serverRules,
      serverRulesUpdatedAt: hubState.serverRulesUpdatedAt,
      broadcasts: hubState.broadcasts,
      leaderboardRows: getPublicLeaderboardRows(),
    });
  });

  app.post('/api/sync/register', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    const normKey = sanitizeSafeKey(body.accountKey, 80).toLowerCase();
    const passwordHash = sanitizeSafeKey(body.passwordHash, 64);
    const deviceLabel = sanitizeSafeKey(body.deviceLabel, 40) || 'Thiết bị Web';

    if (normKey.length < 3 || !passwordHash) {
      res.status(400).json({ ok: false, error: 'Thông tin đăng ký không hợp lệ.' });
      return;
    }
    if (RESERVED_ADMIN_LOGINS.has(normKey)) {
      res.status(409).json({
        ok: false,
        error: 'Tên định danh này thuộc quyền Quản Trị Viên hệ thống.',
      });
      return;
    }

    const summaryKey = `local:${normKey}`;
    const existing = hubState.accounts[summaryKey];
    if (existing && existing.passwordHash && existing.passwordHash !== passwordHash) {
      res.status(409).json({
        ok: false,
        error: 'Tài khoản này đã được đăng ký trên máy chủ. Vui lòng chọn tên khác hoặc đăng nhập.',
      });
      return;
    }

    const rawProfile =
      body.profile && typeof body.profile === 'object'
        ? (body.profile as Record<string, unknown>)
        : {};
    const ownerId = sanitizeSafeKey(rawProfile.id, 128) || `hlv_${Date.now().toString(36)}`;
    const now = Date.now();
    const sanitizedLb = sanitizeLeaderboardRow(
      body.leaderboardRow,
      ownerId,
      'local',
      deviceLabel,
      false,
      now
    );

    hubState.accounts[summaryKey] = {
      summaryKey,
      ownerId,
      accountKey: normKey,
      passwordHash,
      authMode: 'local',
      usernameOrEmail: normKey,
      deviceLabel,
      isBanned: false,
      banReason: '',
      isDelegatedAdmin: false,
      isMasterAdmin: false,
      adminRevision: 0,
      updatedAtMs: now,
      leaderboardRow: sanitizedLb,
      profile: {
        ...rawProfile,
        id: ownerId,
        authMode: 'local',
        usernameOrEmail: normKey,
        adminRevision: 0,
        deviceLabel,
      },
    };
    persistHubState();

    res.json({ ok: true, summaryKey, leaderboardRows: getPublicLeaderboardRows() });
  });

  app.post('/api/sync/login', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    const rawKey = sanitizeSafeKey(body.accountKey, 80).toLowerCase();
    const normKey = rawKey === 'gm_fconline' ? 'admin' : rawKey;
    const passwordHash = sanitizeSafeKey(body.passwordHash, 64);
    const deviceLabel = sanitizeSafeKey(body.deviceLabel, 40);

    const summaryKey = `local:${normKey}`;
    const existing = hubState.accounts[summaryKey];
    if (!existing) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Chưa có trên máy chủ.' });
      return;
    }
    if (existing.passwordHash && existing.passwordHash !== passwordHash) {
      res.status(401).json({
        ok: false,
        code: 'WRONG_PASSWORD',
        error: 'Mật khẩu không chính xác. Vui lòng kiểm tra lại.',
      });
      return;
    }
    if (existing.isBanned && normKey !== 'admin') {
      res.status(403).json({
        ok: false,
        code: 'BANNED',
        error: existing.banReason || 'Tài khoản này đã bị khóa bởi Quản Trị Viên.',
      });
      return;
    }

    if (deviceLabel) {
      existing.deviceLabel = deviceLabel;
      existing.leaderboardRow = {
        ...existing.leaderboardRow,
        deviceLabel,
      };
    }
    existing.updatedAtMs = Date.now();
    persistHubState();

    res.json({
      ok: true,
      summaryKey,
      adminRevision: existing.adminRevision,
      isDelegatedAdmin: Boolean(existing.isDelegatedAdmin),
      profile: {
        ...existing.profile,
        adminRevision: existing.adminRevision,
        isDelegatedAdmin: Boolean(existing.isDelegatedAdmin),
      },
    });
  });

  app.get('/api/sync/admin/accounts', (_req: Request, res: Response) => {
    const list = Object.values(hubState.accounts)
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      .map(summarizeAccountForAdmin);
    res.json({ ok: true, accounts: list });
  });

  app.post('/api/sync/admin/account-profile', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    const summaryKey = sanitizeSafeKey(body.summaryKey, 140);
    const existing = hubState.accounts[summaryKey];
    if (!existing) {
      res.json({ ok: false, profile: null });
      return;
    }
    res.json({
      ok: true,
      profile: existing.profile,
      adminRevision: existing.adminRevision,
      isBanned: existing.isBanned,
      banReason: existing.banReason,
      isDelegatedAdmin: existing.isDelegatedAdmin,
    });
  });

  app.post('/api/sync/admin/mutate-account', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    const summaryKey = sanitizeSafeKey(body.summaryKey, 140);
    const action = sanitizeSafeKey(body.action, 40);
    if (!summaryKey || !action) {
      res.status(400).json({ ok: false, error: 'Thiếu thông tin thao tác Quản Trị Viên.' });
      return;
    }

    const existing = hubState.accounts[summaryKey];
    if (action === 'delete_account') {
      if (summaryKey === 'local:admin') {
        res.status(400).json({ ok: false, error: 'Không thể xóa tài khoản Quản Trị Viên gốc.' });
        return;
      }
      delete hubState.accounts[summaryKey];
      persistHubState();
      res.json({ ok: true, leaderboardRows: getPublicLeaderboardRows() });
      return;
    }

    const now = Date.now();
    const nextRevision = (existing?.adminRevision ?? 0) + 1;
    const authMode: 'guest' | 'local' | 'firebase' =
      body.authMode === 'firebase' || body.authMode === 'local'
        ? body.authMode
        : existing?.authMode ?? (summaryKey.startsWith('cloud:') ? 'firebase' : summaryKey.startsWith('local:') ? 'local' : 'guest');

    const incomingProfile =
      body.profile && typeof body.profile === 'object'
        ? (body.profile as Record<string, unknown>)
        : existing?.profile ?? {};

    const ownerId =
      sanitizeSafeKey(incomingProfile.id, 128) ||
      existing?.ownerId ||
      summaryKey.replace(/^(local:|cloud:|guest:)/, '');

    const accountKey =
      sanitizeSafeKey(body.accountKey, 120) ||
      existing?.accountKey ||
      summaryKey.replace(/^(local:|cloud:|guest:)/, '');

    const isMasterAdmin =
      summaryKey === 'local:admin' ||
      accountKey.toLowerCase() === 'admin' ||
      ownerId === 'gm_master_admin';

    const nextIsBanned =
      typeof body.isBanned === 'boolean' && !isMasterAdmin
        ? body.isBanned
        : Boolean(existing?.isBanned);
    const nextBanReason =
      typeof body.banReason === 'string'
        ? body.banReason.trim().slice(0, 100)
        : existing?.banReason || '';
    const nextDelegated =
      typeof body.isDelegatedAdmin === 'boolean'
        ? body.isDelegatedAdmin
        : Boolean(existing?.isDelegatedAdmin);
    const nextPasswordHash =
      typeof body.passwordHash === 'string' && body.passwordHash
        ? body.passwordHash.slice(0, 64)
        : existing?.passwordHash;
    const effectiveDeviceLabel =
      sanitizeSafeKey(body.deviceLabel, 40) || existing?.deviceLabel || 'Thiết bị Web';

    const nextLb = body.leaderboardRow
      ? sanitizeLeaderboardRow(
          body.leaderboardRow,
          ownerId,
          authMode,
          effectiveDeviceLabel,
          isMasterAdmin,
          now
        )
      : existing?.leaderboardRow ??
        sanitizeLeaderboardRow({}, ownerId, authMode, effectiveDeviceLabel, isMasterAdmin, now);

    hubState.accounts[summaryKey] = {
      summaryKey,
      ownerId,
      accountKey,
      ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {}),
      authMode,
      usernameOrEmail:
        sanitizeSafeKey(body.usernameOrEmail, 80) ||
        existing?.usernameOrEmail ||
        accountKey,
      deviceLabel: effectiveDeviceLabel,
      isBanned: nextIsBanned,
      banReason: nextIsBanned ? nextBanReason : '',
      isDelegatedAdmin: nextDelegated,
      isMasterAdmin,
      adminRevision: nextRevision,
      updatedAtMs: now,
      leaderboardRow: nextLb,
      profile: {
        ...incomingProfile,
        id: ownerId,
        adminRevision: nextRevision,
        isDelegatedAdmin: nextDelegated,
      },
    };
    persistHubState();

    res.json({
      ok: true,
      adminRevision: nextRevision,
      leaderboardRows: getPublicLeaderboardRows(),
    });
  });

  app.post('/api/sync/admin/server-rules', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    const cleanRules = sanitizeServerRules(body.rules);
    const actorName = sanitizeSafeKey(body.actorName, 32) || 'Quản Trị Viên';
    hubState.serverRules = cleanRules;
    hubState.serverRulesUpdatedAt = Date.now();
    hubState.serverRulesUpdatedBy = actorName;
    persistHubState();

    res.json({
      ok: true,
      serverRules: hubState.serverRules,
      serverRulesUpdatedAt: hubState.serverRulesUpdatedAt,
    });
  });

  app.post('/api/sync/admin/official-reset', (_req: Request, res: Response) => {
    hubState.accounts = {};
    hubState.broadcasts = [];
    hubState.serverRules = {
      guaranteedUpgrade100: false,
      upgradeRateMultiplier: 1,
      zeroMarketTax: false,
      matchRewardMultiplier: 1,
      serverAnnouncement:
        'CHÍNH THỨC RA MẮT BẢN FULL: Đã reset toàn bộ tài khoản về ban đầu! Bắt đầu mùa giải mới công bằng cho mọi HLV.',
    };
    hubState.serverRulesUpdatedAt = Date.now();
    hubState.serverRulesUpdatedBy = 'Quản Trị Viên';
    persistHubState();

    res.json({
      ok: true,
      message: 'Đã hoàn tất reset toàn bộ máy chủ về bản chính thức.',
      serverRules: hubState.serverRules,
    });
  });

  app.post('/api/sync/admin/broadcast', (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    const id =
      sanitizeSafeKey(body.id, 100) ||
      `bcast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const packId =
      typeof body.packId === 'string' && VALID_PACK_IDS.has(body.packId)
        ? body.packId
        : 'ucl_26';

    const gift: HubBroadcastGift = {
      id,
      createdAtMs: Date.now(),
      actorName: sanitizeSafeKey(body.actorName, 32) || 'Quản Trị Viên',
      fcDelta: clampInt(body.fcDelta, 0, 100_000_000, 0),
      bpDelta: clampInt(body.bpDelta, 0, 5_000_000_000_000_000, 0),
      tarpoiDelta: clampInt(body.tarpoiDelta, 0, 100_000_000, 0),
      svipBonusPoints: clampInt(body.svipBonusPoints, 0, 1_000_000, 0),
      packId,
      packCount: clampInt(body.packCount, 0, 1_000, 0),
    };

    hubState.broadcasts = [
      gift,
      ...hubState.broadcasts.filter((b) => b.id !== gift.id),
    ].slice(0, 50);
    persistHubState();

    res.json({
      ok: true,
      gift,
      totalAccountsCount: Math.max(1, Object.keys(hubState.accounts).length),
    });
  });

  attachGlxhOnlineServer({
    app,
    httpServer,
    getHubAccounts: () => hubState.accounts,
  });

  const isProd =
    process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';

  if (!isProd) {
    const hmrTarget =
      process.env.DISABLE_HMR === 'true' ? false : { server: httpServer };
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: hmrTarget,
      },
      plugins: [
        {
          name: 'fco-vite-ws-bridge',
          config() {
            return {
              server: {
                ws: { server: httpServer },
                hmr: hmrTarget,
              },
            };
          },
        },
      ],
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`FC Online Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
