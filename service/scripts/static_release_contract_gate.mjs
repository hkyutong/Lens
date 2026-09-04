import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const releaseScript = path.join(scriptDir, 'sync_static_release.mjs');

const writeFixture = async (root, files) => {
  for (const [relativePath, content] of Object.entries(files)) {
    const destination = path.join(root, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }
};

const runRelease = async args => {
  const { stdout } = await execFileAsync(process.execPath, [releaseScript, ...args], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
};

const read = file => fs.readFile(file, 'utf8');

const run = async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lens-static-release-contract-'));
  const candidateDir = path.join(tempRoot, 'candidate', 'dist');
  const targetDir = path.join(tempRoot, 'target', 'public', 'chat');
  const backupDir = path.join(tempRoot, 'backups', '.release-backups', 'chat-latest');

  try {
    await writeFixture(candidateDir, {
      'index.html': '<script src="./js/new-hash.js"></script>',
      'js/new-hash.js': 'new release',
      'stable.txt': 'new stable content',
    });
    await writeFixture(targetDir, {
      'index.html': '<script src="./js/old-hash.js"></script>',
      'js/old-hash.js': 'old release',
      'stable.txt': 'old stable content',
    });

    const syncResult = await runRelease([
      '--candidate',
      candidateDir,
      '--target',
      targetDir,
      '--backup',
      backupDir,
    ]);
    assert.equal(syncResult.mode, 'sync');
    assert.equal(syncResult.passed, true);
    assert.equal(syncResult.backupCreated, true);
    assert.equal(
      await read(path.join(targetDir, 'index.html')),
      '<script src="./js/new-hash.js"></script>',
    );
    assert.equal(await read(path.join(targetDir, 'stable.txt')), 'new stable content');
    assert.equal(await read(path.join(targetDir, 'js/old-hash.js')), 'old release');
    assert.equal(
      await read(path.join(backupDir, 'index.html')),
      '<script src="./js/old-hash.js"></script>',
    );

    const rollbackResult = await runRelease([
      '--rollback',
      '--target',
      targetDir,
      '--backup',
      backupDir,
    ]);
    assert.equal(rollbackResult.mode, 'rollback');
    assert.equal(rollbackResult.passed, true);
    assert.equal(
      await read(path.join(targetDir, 'index.html')),
      '<script src="./js/old-hash.js"></script>',
    );
    assert.equal(await read(path.join(targetDir, 'stable.txt')), 'old stable content');
    assert.equal(await read(path.join(targetDir, 'js/new-hash.js')), 'new release');

    const remainingFiles = await fs.readdir(targetDir);
    assert.equal(
      remainingFiles.some(file => file.startsWith('.index.html.next-')),
      false,
    );

    let unsafeRejected = false;
    try {
      await runRelease([
        '--candidate',
        candidateDir,
        '--target',
        path.join(tempRoot, 'unsafe', 'chat'),
        '--backup',
        backupDir,
      ]);
    } catch (error) {
      unsafeRejected = /目标目录必须是明确的 public\/chat/.test(String(error?.stderr || ''));
    }
    assert.equal(unsafeRejected, true);

    return {
      passed: true,
      syncAndRollback: true,
      oldHashedAssetsPreserved: true,
      scopedPathGuard: true,
      stagingResidue: false,
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
};

try {
  console.log(JSON.stringify(await run(), null, 2));
} catch (error) {
  console.error(`[static-release-contract] ${error?.message || 'unknown error'}`);
  process.exitCode = 1;
}
