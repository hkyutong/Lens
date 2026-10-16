import * as fs from 'fs';
import * as path from 'path';

const CONFIG_NAME = '.lens-academic-private.json';
const KEYS = ['version', 'secret', 'workspace_root', 'log_root', 'upload_root'];

class AcademicPrivateConfigError extends Error {}

function reject(category: 'unsafe' | 'invalid' | 'conflict'): never {
  throw new AcademicPrivateConfigError(`academic_private_config_${category}`);
}

/** Load once before Nest creates any signing or workspace consumers. */
export function loadAcademicPrivateConfig(options: {
  cwd?: string;
  environment?: NodeJS.ProcessEnv;
} = {}): Readonly<{ loaded: boolean }> {
  try {
    const cwd = options.cwd ?? process.cwd();
    const environment = options.environment ?? process.env;
    const file = path.join(cwd, CONFIG_NAME);
    let descriptor: number;
    try {
      descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze({ loaded: false });
      reject('unsafe');
    }

    let config: Record<string, unknown>;
    try {
      const before = fs.fstatSync(descriptor);
      const named = fs.lstatSync(file);
      if (!before.isFile() || named.isSymbolicLink() || named.ino !== before.ino || named.dev !== before.dev ||
        before.nlink !== 1 || (before.mode & 0o7777) !== 0o600 || typeof process.geteuid !== 'function' ||
        before.uid !== process.geteuid() || before.size < 2 || before.size > 16384) reject('unsafe');
      const raw = fs.readFileSync(descriptor, 'utf8');
      const after = fs.fstatSync(descriptor);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) reject('unsafe');
      try { config = JSON.parse(raw); } catch (_) { reject('invalid'); }
    } catch (error) {
      if (error instanceof Error && ['academic_private_config_unsafe', 'academic_private_config_invalid'].includes(error.message)) throw error;
      reject('unsafe');
    } finally { fs.closeSync(descriptor); }

    if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).length !== KEYS.length ||
      Object.keys(config).some(key => !KEYS.includes(key)) || config.version !== 1 ||
      typeof config.secret !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(config.secret)) reject('invalid');

    let codeRoot: string;
    try { codeRoot = fs.realpathSync(cwd); } catch (_) { reject('invalid'); }
    for (const key of ['workspace_root', 'log_root', 'upload_root']) {
      const value = config[key];
      if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0') || !path.isAbsolute(value)) reject('invalid');
      try {
        const actual = fs.realpathSync(value);
      const academicCodeRoot = path.resolve(codeRoot, '..', 'academic-4.0');
      if (fs.existsSync(academicCodeRoot)) {
        const academicRelative = path.relative(fs.realpathSync(academicCodeRoot), actual);
        if (
          academicRelative === '' ||
          (academicRelative !== '..' &&
            !academicRelative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(academicRelative))
        ) {
          reject('unsafe');
        }
      }
        const relative = path.relative(codeRoot, actual);
        if (!fs.statSync(actual).isDirectory() || !(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))) reject('invalid');
      } catch (_) { reject('invalid'); }
    }
    const settings: Record<string, string> = {
      LENS_ACADEMIC_INTERNAL_SECRET: config.secret as string,
      LENS_ACADEMIC_WORKSPACE_ROOT: config.workspace_root as string,
      PATH_LOGGING: config.log_root as string,
      PATH_PRIVATE_UPLOAD: config.upload_root as string,
    };
    for (const [key, value] of Object.entries(settings)) {
      if (environment[key] && environment[key] !== value) reject('conflict');
    }
    for (const [key, value] of Object.entries(settings)) environment[key] = value;
    return Object.freeze({ loaded: true });

  } catch (error) {
    if (error instanceof AcademicPrivateConfigError) throw error;
    reject('unsafe');
  }
}
