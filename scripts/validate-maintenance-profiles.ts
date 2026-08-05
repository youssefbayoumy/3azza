import { MAINTENANCE_PROFILES, UNIVERSAL_MAINTENANCE_CATALOGUE } from '../src/maintenance/profiles';
import { validateMaintenanceProfile } from '../src/maintenance/validation';

let failures = 0;
for (const profile of MAINTENANCE_PROFILES) {
  const issues = validateMaintenanceProfile(profile, UNIVERSAL_MAINTENANCE_CATALOGUE);
  if (issues.length) {
    failures += issues.length;
    process.stderr.write(`${profile.id}:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n`);
  } else {
    process.stdout.write(`${profile.id} ${profile.profileVersion}: valid (${profile.rules.length} rules)\n`);
  }
}
if (failures) process.exitCode = 1;
