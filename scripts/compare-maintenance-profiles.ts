import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compareMaintenanceProfiles } from '../src/maintenance/compareProfiles';
import type { ScooterMaintenanceProfile } from '../src/maintenance/types';

const [leftPath, rightPath] = process.argv.slice(2);
if (!leftPath || !rightPath) {
  throw new Error('Usage: npm run maintenance:compare -- <left-profile.json> <right-profile.json>');
}
const read = (path: string) => JSON.parse(readFileSync(resolve(path), 'utf8')) as ScooterMaintenanceProfile;
process.stdout.write(`${JSON.stringify(compareMaintenanceProfiles(read(leftPath), read(rightPath)), null, 2)}\n`);
