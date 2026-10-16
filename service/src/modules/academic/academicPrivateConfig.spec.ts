import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadAcademicPrivateConfig } from './academicPrivateConfig';
import { signAcademicRequest } from './academicInternalAuth';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeEach: any;
declare const afterEach: any;
declare const jest: any;

describe('persistent academic security configuration', () => {
  let root: string;
  let cwd: string;
  let file: string;
  let config: Record<string, unknown>;
  let environment: NodeJS.ProcessEnv;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-config-synthetic-')));
    cwd = path.join(root, 'code');
    fs.mkdirSync(cwd, { mode: 0o700 });
    for (const name of ['workspace', 'logs', 'uploads']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
    file = path.join(cwd, '.lens-academic-private.json');
    config = { version: 1, secret: '0123456789abcdef'.repeat(4), workspace_root: path.join(root, 'workspace'),
      log_root: path.join(root, 'logs'), upload_root: path.join(root, 'uploads') };
    environment = { UNRELATED_SYNTHETIC_SETTING: 'retained' };
  });
  afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  const write = () => fs.writeFileSync(file, JSON.stringify(config), { mode: 0o600 });

  it('loads persistent values before the academic signing consumer reads environment', () => {
    write();
    expect(loadAcademicPrivateConfig({ cwd, environment })).toEqual({ loaded: true });
    expect(environment.LENS_ACADEMIC_INTERNAL_SECRET).toBe('0123456789abcdef'.repeat(4));
    expect(environment.LENS_ACADEMIC_WORKSPACE_ROOT).toBe(path.join(root, 'workspace'));
    expect(environment.PATH_LOGGING).toBe(path.join(root, 'logs'));
    expect(environment.PATH_PRIVATE_UPLOAD).toBe(path.join(root, 'uploads'));
    expect(environment.UNRELATED_SYNTHETIC_SETTING).toBe('retained');
  });
  it('keeps explicit legacy environment when the private file is absent', () => {
    environment.LENS_ACADEMIC_INTERNAL_SECRET = 'legacy-synthetic-secret';
    expect(loadAcademicPrivateConfig({ cwd, environment })).toEqual({ loaded: false });
    expect(environment.LENS_ACADEMIC_INTERNAL_SECRET).toBe('legacy-synthetic-secret');
  });
  it('reloads the same persistent secret into a fresh process environment', () => {
    write(); loadAcademicPrivateConfig({ cwd, environment });
    const restarted: NodeJS.ProcessEnv = {};
    loadAcademicPrivateConfig({ cwd, environment: restarted });
    expect(restarted.LENS_ACADEMIC_INTERNAL_SECRET).toBe('0123456789abcdef'.repeat(4));
  });
  it('provides the persistent secret to the existing request signer', () => {
    write();
    const keys = ['LENS_ACADEMIC_INTERNAL_SECRET', 'LENS_ACADEMIC_WORKSPACE_ROOT', 'PATH_LOGGING', 'PATH_PRIVATE_UPLOAD'];
    const original = new Map(keys.map(key => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    try {
      loadAcademicPrivateConfig({ cwd });
      const identity = { ownerId: 1, requestId: '00000000-0000-4000-8000-000000000000' };
      const actual = signAcademicRequest('POST', '/synthetic', '{}', identity, undefined, '1700000000', '00000000-0000-4000-8000-000000000001');
      const explicit = signAcademicRequest('POST', '/synthetic', '{}', identity, '0123456789abcdef'.repeat(4), '1700000000', '00000000-0000-4000-8000-000000000001');
      expect(JSON.stringify(actual) === JSON.stringify(explicit)).toBe(true);
    } finally {
      for (const [key, value] of original) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
  it.each([0o644, 0o640, 0o700])('rejects a private file with unsafe permissions %i', mode => {
    write(); fs.chmodSync(file, mode);
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_unsafe');
    expect(environment).toEqual({ UNRELATED_SYNTHETIC_SETTING: 'retained' });
  });
  it('rejects a symbolic link instead of following it', () => {
    const target = path.join(root, 'synthetic.json');
    fs.writeFileSync(target, JSON.stringify(config), { mode: 0o600 }); fs.symlinkSync(target, file);
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_unsafe');
  });
  it('rejects a multiply linked secret file', () => {
    write(); fs.linkSync(file, path.join(root, 'duplicate.json'));
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_unsafe');
  });
  it('rejects another effective owner', () => {
    write(); const owner = fs.statSync(file).uid;
    jest.spyOn(process, 'geteuid').mockReturnValue(owner + 1);
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_unsafe');
  });
  it('rejects environment conflicts before changing any setting', () => {
    write(); environment.PATH_PRIVATE_UPLOAD = path.join(root, 'different-synthetic-root');
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_conflict');
    expect(environment).toEqual({ UNRELATED_SYNTHETIC_SETTING: 'retained', PATH_PRIVATE_UPLOAD: path.join(root, 'different-synthetic-root') });
  });
  it('accepts matching explicit values and fills missing settings', () => {
    write(); environment.LENS_ACADEMIC_INTERNAL_SECRET = '0123456789abcdef'.repeat(4);
    expect(loadAcademicPrivateConfig({ cwd, environment })).toEqual({ loaded: true });
    expect(environment.LENS_ACADEMIC_WORKSPACE_ROOT).toBe(path.join(root, 'workspace'));
  });
  it('rejects extra keys without partially loading a valid secret', () => {
    config.unrecognized = 'synthetic-only'; write();
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_invalid');
    expect(environment.LENS_ACADEMIC_INTERNAL_SECRET).toBeUndefined();
  });
  it.each(['short', 'x'.repeat(257), 'x'.repeat(31) + ' ', 'x'.repeat(31) + '\n', 'x'.repeat(31) + '中'])('rejects an invalid signing secret', secret => {
    config.secret = secret; write();
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_invalid');
  });
  it.each(['1', 2, true, null])('rejects an unsupported version', version => {
    config.version = version; write();
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_invalid');
  });
  it('rejects a workspace inside executable source', () => {
    config.workspace_root = cwd; write();
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_invalid');
  });
  it('rejects a workspace alias that resolves into executable source', () => {
    const alias = path.join(root, 'alias'); fs.symlinkSync(cwd, alias); config.workspace_root = alias; write();
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_invalid');
  });
  it('rejects a missing directory instead of silently creating storage', () => {
    config.upload_root = path.join(root, 'absent'); write();
    expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow('academic_private_config_invalid');
  });
  it('does not disclose invalid configuration or paths through its error', () => {
    fs.writeFileSync(file, '{"secret":"synthetic-private-value"', { mode: 0o600 });
    let message = '';
    try { loadAcademicPrivateConfig({ cwd, environment }); } catch (error) { message = String(error); }
    expect(message).toBe('Error: academic_private_config_invalid');
  });
  it.each(['workspace_root', 'log_root', 'upload_root'])(
    'rejects %s inside the sibling Academic code root',
    (key) => {
      const originalEnvironment = { ...environment };
      const academicRoot = path.join(path.dirname(cwd), 'academic-4.0');
      fs.mkdirSync(academicRoot, { recursive: true });
      config[key] = academicRoot;
      write();
      expect(() => loadAcademicPrivateConfig({ cwd, environment })).toThrow();
      expect(JSON.stringify(environment) === JSON.stringify(originalEnvironment)).toBe(true);
    },
  );

  it('closes filesystem failures without exposing their original detail', () => {
    write();
    const originalEnvironment = { ...environment };
    const failure = jest.spyOn(fs, 'realpathSync').mockImplementation(() => {
      throw new Error('SYNTHETIC_PRIVATE_PATH_DETAIL');
    });
    let rejected = false;
    let originalDetailReturned = false;
    try {
      loadAcademicPrivateConfig({ cwd, environment });
    } catch (error) {
      rejected = true;
      originalDetailReturned = String(error.message).includes('SYNTHETIC_PRIVATE_PATH_DETAIL');
    } finally {
      failure.mockRestore();
    }
    expect(rejected).toBe(true);
    expect(originalDetailReturned).toBe(false);
    expect(JSON.stringify(environment) === JSON.stringify(originalEnvironment)).toBe(true);
  });

});
