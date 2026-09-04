import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LEGACY_FILES = [
  'chat/src/views/chat/components/AppList/index.vue',
  'chat/src/views/chat/components/AppTips/index.vue',
  'chat/src/views/chat/components/Welcome/index.vue',
  'chat/src/api/appStore.ts',
  'chat/src/store/modules/appStore/index.ts',
  'chat/src/api/plugin.ts',
  'chat/src/views/chat/components/sider/Plugin.vue',
  'chat/src/views/chat/components/sider/index.vue',
  'chat/src/views/chat/components/sider/List.vue',
  'chat/src/views/chat/components/sider/ListItem.vue',
  'chat/src/views/chat/components/AiBot/index.vue',
  'chat/src/views/chat/components/PresetHints/index.vue',
  'chat/src/components/MobileSettingsDialog.vue',
  'chat/src/components/BadWordsDialog.vue',
  'chat/src/components/CloseButtonDemo.vue',
  'chat/src/components/Identity.vue',
  'chat/src/components/Login/Wechat.vue',
  'chat/src/components/PhoneIdentity.vue',
  'chat/src/components/Settings/DataManagement.vue',
  'chat/src/api/global.ts',
  'chat/src/store/modules/appStore/helper.ts',
  'chat/src/store/modules/users/index.ts',
];

const ACTIVE_SOURCE_DIRS = [
  'chat/src/App.vue',
  'chat/src/api',
  'chat/src/components',
  'chat/src/store',
  'chat/src/views/workbench',
  'chat/src/domain',
  'chat/src/utils',
];

const LEGACY_MARKERS = [
  '@/api/appStore',
  'useAppCatStore',
  'fetchQueryAppCatsAPI',
  'fetchQueryAppsAPI',
  'fetchQueryMineAppsAPI',
  'fetchQueryOneCatAPI',
  'components/AppList',
  'components/AppTips',
  'components/Welcome',
  'components/AiBot',
  'components/PresetHints',
  '/app/queryCats',
  '/app/list',
  '/app/searchList',
  '/app/mineApps',
  '/app/collect',
  '/app/queryOneCat',
  '/plugin/pluginList',
];

const REQUIRED_EVIDENCE = [
  'realReadGate',
  'controlledWriteGate',
  'browserRegression',
  'upload',
  'share',
  'deployment',
  'rollback',
  'userObservation',
];

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const toPosix = value => value.split(path.sep).join('/');

const hashFiles = async (root, files) => {
  const digest = crypto.createHash('sha256');
  for (const relativePath of [...files].sort()) {
    digest.update(relativePath);
    digest.update('\0');
    digest.update(await fs.readFile(path.join(root, relativePath)));
    digest.update('\0');
  }
  return digest.digest('hex');
};

const walkFiles = async root => {
  const files = [];
  const visit = async relativeDir => {
    const absoluteDir = path.join(root, relativeDir);
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) await visit(relativePath);
      else if (entry.isFile()) files.push(toPosix(relativePath));
    }
  };
  await visit('');
  return files;
};

const readJson = async filename => {
  try {
    return JSON.parse(await fs.readFile(filename, 'utf8'));
  } catch (_error) {
    return null;
  }
};

const isoDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pathExists = async filename => Boolean(await fs.stat(filename).catch(() => null));

const collectActiveSourceFiles = async projectRoot => {
  const files = [];
  for (const relativePath of ACTIVE_SOURCE_DIRS) {
    const absolutePath = path.join(projectRoot, relativePath);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat) continue;
    if (stat.isFile()) files.push(relativePath);
    else
      files.push(
        ...(await walkFiles(absolutePath)).map(file => toPosix(path.join(relativePath, file))),
      );
  }
  return [...new Set(files)].filter(file => !LEGACY_FILES.includes(file));
};

export async function runLegacyRemovalGate({
  projectRoot,
  evidencePath,
  mirrorDir = '',
  minimumObservationHours = 24,
  requireReleaseEvidence = true,
} = {}) {
  const root = path.resolve(
    projectRoot || path.resolve(new URL('../..', import.meta.url).pathname),
  );
  const evidenceFile = path.resolve(
    evidencePath || path.join(root, '.legacy-removal-evidence.json'),
  );
  const missing = [];
  const violations = [];

  for (const relativePath of LEGACY_FILES) {
    if (await pathExists(path.join(root, relativePath)))
      violations.push(`旧 99AI 用户端文件仍存在：${relativePath}`);
  }

  const activeFiles = await collectActiveSourceFiles(root);
  for (const relativePath of activeFiles) {
    const source = await fs.readFile(path.join(root, relativePath), 'utf8');
    for (const marker of LEGACY_MARKERS) {
      if (source.includes(marker)) violations.push(`${relativePath} 仍引用旧用户端标记：${marker}`);
    }
  }

  const distRoot = path.join(root, 'chat/dist');
  const distFiles = (await pathExists(distRoot)) ? await walkFiles(distRoot) : [];
  const distTextFiles = distFiles.filter(file => /\.(?:css|html|js|json|svg|txt|xml)$/i.test(file));
  for (const relativePath of distTextFiles) {
    const source = await fs.readFile(path.join(distRoot, relativePath), 'utf8');
    for (const marker of LEGACY_MARKERS) {
      if (source.includes(marker))
        violations.push(`chat/dist/${relativePath} 仍包含旧用户端标记：${marker}`);
    }
  }

  const candidateIndex = path.join(distRoot, 'index.html');
  const candidateIndexBuffer = await fs.readFile(candidateIndex).catch(() => null);
  if (!candidateIndexBuffer) missing.push('当前 chat/dist 缺少 index.html');
  const candidateManifestSha256 = candidateIndexBuffer
    ? await hashFiles(distRoot, distFiles)
    : '';

  const evidence = requireReleaseEvidence ? await readJson(evidenceFile) : null;
  if (requireReleaseEvidence && !evidence) {
    missing.push(`缺少发布证据文件：${evidenceFile}`);
  } else if (evidence) {
    for (const key of REQUIRED_EVIDENCE) {
      if (evidence[key] !== true) missing.push(`证据未确认：${key}`);
    }
    if (evidence.allowRemoval !== true) missing.push('缺少 allowRemoval=true 的明确删除确认');
    if (!String(evidence.approvedBy || '').trim()) missing.push('缺少 approvedBy');

    const started = isoDate(evidence.observationStartedAt);
    const ended = isoDate(evidence.observationEndedAt);
    const declaredHours = Number(evidence.observationHours || 0);
    const measuredHours = started && ended ? (ended.getTime() - started.getTime()) / 3600000 : 0;
    if (
      !started ||
      !ended ||
      measuredHours < minimumObservationHours ||
      declaredHours < minimumObservationHours
    ) {
      missing.push(`稳定观察期不足 ${minimumObservationHours} 小时`);
    }
    if (candidateIndexBuffer) {
      const actualHash = sha256(candidateIndexBuffer);
      if (evidence.candidateIndexSha256 !== actualHash) {
        missing.push('candidateIndexSha256 与当前 chat/dist/index.html 不一致');
      }
      if (evidence.candidateManifestSha256 !== candidateManifestSha256) {
        missing.push('candidateManifestSha256 与当前 chat/dist 文件清单不一致');
      }
    }
  }

  if (requireReleaseEvidence && mirrorDir) {
    const resolvedMirrorDir = path.resolve(mirrorDir);
    const mirrorStat = await fs.stat(resolvedMirrorDir).catch(() => null);
    if (!mirrorStat?.isDirectory()) {
      missing.push(`部署镜像目录不存在：${resolvedMirrorDir}`);
    } else {
      const mirrorFiles = await walkFiles(resolvedMirrorDir);
      const candidateFiles = candidateIndexBuffer
        ? await walkFiles(distRoot)
        : [];
      for (const relativePath of candidateFiles) {
        const candidateFile = await fs.readFile(path.join(distRoot, relativePath));
        const mirrorFile = await fs
          .readFile(path.join(resolvedMirrorDir, relativePath))
          .catch(() => null);
        if (!mirrorFile) {
          missing.push(`部署镜像缺少候选文件：${relativePath}`);
        } else if (sha256(mirrorFile) !== sha256(candidateFile)) {
          missing.push(`部署镜像文件与当前候选包不一致：${relativePath}`);
        }
      }
    }
  } else if (requireReleaseEvidence) {
    missing.push('未提供部署镜像目录，无法证明灰度包已同步');
  }

  return {
    passed: missing.length === 0 && violations.length === 0,
    canDelete: false,
    removalVerified: missing.length === 0 && violations.length === 0,
    missing,
    violations,
    legacyFiles: LEGACY_FILES,
    activeSourceFilesChecked: activeFiles.length,
    candidateFilesChecked: distFiles.length,
    candidateIndexSha256: candidateIndexBuffer ? sha256(candidateIndexBuffer) : '',
    candidateManifestSha256,
  };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const evidenceArg = process.argv.indexOf('--evidence');
  const mirrorArg = process.argv.indexOf('--mirror');
  const hoursArg = process.argv.indexOf('--minimum-observation-hours');
  const sourceOnly = process.argv.includes('--source-only');
  const outcome = await runLegacyRemovalGate({
    evidencePath: evidenceArg >= 0 ? process.argv[evidenceArg + 1] : '',
    mirrorDir: mirrorArg >= 0 ? process.argv[mirrorArg + 1] : '',
    minimumObservationHours: hoursArg >= 0 ? Number(process.argv[hoursArg + 1]) : 24,
    requireReleaseEvidence: !sourceOnly,
  });
  console.log(JSON.stringify(outcome, null, 2));
  process.exitCode = outcome.passed ? 0 : 2;
}
