import * as Dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(__dirname, '..', '.env'),
];

for (const envPath of candidates) {
  if (!fs.existsSync(envPath)) continue;
  Dotenv.config({ path: envPath });
  break;
}
