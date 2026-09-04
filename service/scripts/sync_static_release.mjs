import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

let argumentError = '';

const argumentValue = flag => {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : '';
  if (!value || value.startsWith('--')) {
    argumentError = `${flag} 缺少目录参数`;
    return '';
  }
  return path.resolve(value);
};

const mode = process.argv.includes('--rollback') ? 'rollback' : 'sync';
const targetDir = argumentValue('--target');
const backupDir = argumentValue('--backup');
const candidateDir = mode === 'sync' ? argumentValue('--candidate') : '';
const temporaryIndex = path.join(targetDir, `.index.html.next-${process.pid}`);
const temporaryBackup = `${backupDir}.next-${process.pid}`;

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const toPosix = value => value.split(path.sep).join('/');

const assertSafeDirectory = (directory, label) => {
  const parsed = path.parse(directory);
  if (directory === parsed.root || directory === path.dirname(directory)) {
    throw new Error(`${label} 不能是文件系统根目录`);
  }
};

const assertSeparateDirectories = directories => {
  for (let leftIndex = 0; leftIndex < directories.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < directories.length; rightIndex += 1) {
      const left = directories[leftIndex];
      const right = directories[rightIndex];
      if (
        left === right ||
        left.startsWith(`${right}${path.sep}`) ||
        right.startsWith(`${left}${path.sep}`)
      ) {
        throw new Error('候选、目标与备份目录必须彼此独立');
      }
    }
  }
};

const assertScopedPaths = () => {
  if (path.basename(targetDir) !== 'chat' || path.basename(path.dirname(targetDir)) !== 'public') {
    throw new Error('目标目录必须是明确的 public/chat');
  }
  if (
    path.basename(backupDir) !== 'chat-latest' ||
    path.basename(path.dirname(backupDir)) !== '.release-backups'
  ) {
    throw new Error('备份目录必须是明确的 .release-backups/chat-latest');
  }
};

const listFiles = async root => {
  const files = [];

  const visit = async relativeDir => {
    const entries = await fs.readdir(path.join(root, relativeDir), { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        await visit(relativePath);
      } else if (entry.isFile()) {
        files.push(toPosix(relativePath));
      } else {
        throw new Error(`静态目录包含非普通文件：${toPosix(relativePath)}`);
      }
    }
  };

  await visit('');
  return files;
};

const requireReleaseDirectory = async (directory, label) => {
  const stat = await fs.stat(directory).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`${label}不存在：${directory}`);
  const indexStat = await fs.stat(path.join(directory, 'index.html')).catch(() => null);
  if (!indexStat?.isFile()) throw new Error(`${label}缺少 index.html`);
};

const copyFilesWithIndexLast = async (sourceDir, files) => {
  await fs.mkdir(targetDir, { recursive: true });

  for (const relativePath of files) {
    if (relativePath === 'index.html') continue;
    const destination = path.join(targetDir, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(sourceDir, relativePath), destination);
  }

  await fs.copyFile(path.join(sourceDir, 'index.html'), temporaryIndex);
  await fs.rename(temporaryIndex, path.join(targetDir, 'index.html'));
};

const replaceLatestBackup = async () => {
  const targetStat = await fs.stat(targetDir).catch(() => null);
  if (!targetStat?.isDirectory()) return false;

  await fs.rm(temporaryBackup, { recursive: true, force: true });
  await fs.mkdir(path.dirname(temporaryBackup), { recursive: true });
  await fs.cp(targetDir, temporaryBackup, { recursive: true, errorOnExist: true });
  await fs.rm(backupDir, { recursive: true, force: true });
  await fs.rename(temporaryBackup, backupDir);
  return true;
};

const run = async () => {
  if (argumentError) throw new Error(argumentError);
  const directories = [targetDir, backupDir];
  if (candidateDir) directories.push(candidateDir);
  directories.forEach((directory, index) =>
    assertSafeDirectory(directory, ['目标目录', '备份目录', '候选目录'][index]),
  );
  assertSeparateDirectories(directories);
  assertScopedPaths();

  if (mode === 'sync') {
    await requireReleaseDirectory(candidateDir, '发布候选');
    const files = await listFiles(candidateDir);
    const backupCreated = await replaceLatestBackup();
    await copyFilesWithIndexLast(candidateDir, files);
    const indexContent = await fs.readFile(path.join(targetDir, 'index.html'));
    return {
      mode,
      passed: true,
      fileCount: files.length,
      backupCreated,
      indexSha256: sha256(indexContent),
    };
  }

  await requireReleaseDirectory(backupDir, '回滚备份');
  const files = await listFiles(backupDir);
  await copyFilesWithIndexLast(backupDir, files);
  const indexContent = await fs.readFile(path.join(targetDir, 'index.html'));
  return {
    mode,
    passed: true,
    fileCount: files.length,
    indexSha256: sha256(indexContent),
  };
};

try {
  console.log(JSON.stringify(await run(), null, 2));
} catch (error) {
  await fs.rm(temporaryIndex, { force: true }).catch(() => undefined);
  await fs.rm(temporaryBackup, { recursive: true, force: true }).catch(() => undefined);
  console.error(`[static-release] ${error?.message || 'unknown error'}`);
  process.exitCode = 1;
}
