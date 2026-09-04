import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runLegacyRemovalGate } from './verify_legacy_removal_ready.mjs';

const write = async (root, relativePath, content) => {
  const filename = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content);
};

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lens-legacy-removal-gate-'));
try {
  const legacyFiles = [
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
  for (const filename of legacyFiles) await write(root, filename, 'legacy user interface');
  await write(root, 'chat/src/App.vue', '<template>Lens</template>');
  await write(root, 'chat/src/views/workbench/ResearchWorkspace.vue', 'Lens research workspace only');
  await write(root, 'chat/dist/index.html', '<script src="./index.js"></script>');
  await write(root, 'chat/dist/index.js', 'Lens');
  await write(root, 'service/public/chat/index.html', '<script src="./index.js"></script>');
  await write(root, 'service/public/chat/index.js', 'Lens');

  const now = Date.now();
  const evidencePath = path.join(root, 'evidence.json');
  await write(
    root,
    'evidence.json',
    JSON.stringify({
      allowRemoval: true,
      approvedBy: 'reviewer',
      realReadGate: true,
      controlledWriteGate: true,
      browserRegression: true,
      upload: true,
      share: true,
      deployment: true,
      rollback: true,
      userObservation: true,
      observationStartedAt: new Date(now - 48 * 3600000).toISOString(),
      observationEndedAt: new Date(now).toISOString(),
      observationHours: 48,
      candidateIndexSha256: 'wrong',
    }),
  );

  const blocked = await runLegacyRemovalGate({
    projectRoot: root,
    evidencePath,
    mirrorDir: path.join(root, 'service/public/chat'),
    minimumObservationHours: 24,
  });
  assert.equal(blocked.passed, false);
  assert.equal(blocked.canDelete, false);
  assert.equal(
    blocked.violations.some(message => message.includes('旧 99AI 用户端文件仍存在')),
    true,
  );
  assert.equal(
    blocked.missing.includes('candidateIndexSha256 与当前 chat/dist/index.html 不一致'),
    true,
  );

  const cleanEvidence = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
  const index = await fs.readFile(path.join(root, 'chat/dist/index.html'));
  cleanEvidence.candidateIndexSha256 = (await import('node:crypto'))
    .createHash('sha256')
    .update(index)
    .digest('hex');
  const manifestDigest = (await import('node:crypto')).createHash('sha256');
  manifestDigest.update('index.html');
  manifestDigest.update('\0');
  manifestDigest.update(index);
  manifestDigest.update('\0');
  manifestDigest.update('index.js');
  manifestDigest.update('\0');
  manifestDigest.update(await fs.readFile(path.join(root, 'chat/dist/index.js')));
  manifestDigest.update('\0');
  cleanEvidence.candidateManifestSha256 = manifestDigest.digest('hex');
  await fs.writeFile(evidencePath, JSON.stringify(cleanEvidence));
  for (const filename of legacyFiles) await fs.rm(path.join(root, filename));
  await fs.writeFile(path.join(root, 'service/public/chat/index.js'), 'drifted');
  const driftedMirror = await runLegacyRemovalGate({
    projectRoot: root,
    evidencePath,
    mirrorDir: path.join(root, 'service/public/chat'),
    minimumObservationHours: 24,
  });
  assert.equal(driftedMirror.passed, false);
  assert.equal(
    driftedMirror.missing.includes('部署镜像文件与当前候选包不一致：index.js'),
    true,
  );
  await fs.writeFile(path.join(root, 'service/public/chat/index.js'), 'Lens');
  const ready = await runLegacyRemovalGate({
    projectRoot: root,
    evidencePath,
    mirrorDir: path.join(root, 'service/public/chat'),
    minimumObservationHours: 24,
  });
  assert.equal(ready.passed, true);
  assert.equal(ready.canDelete, false);
  assert.equal(ready.removalVerified, true);
  assert.equal(ready.candidateFilesChecked, 2);
  for (const filename of legacyFiles)
    assert.equal(await fs.stat(path.join(root, filename)).then(() => true).catch(() => false), false);

  console.log(
    JSON.stringify(
      {
        passed: true,
        deletionPerformed: true,
        hashMismatchBlocked: true,
        removalVerified: true,
      },
      null,
      2,
    ),
  );
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
