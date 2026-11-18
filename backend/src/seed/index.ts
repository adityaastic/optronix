import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import {
  DEFAULT_SEED_PASSWORD,
  seedCoreUsersAndRbac,
  seedSampleDomainData,
} from './seedData.js';

async function runSeed() {
  await connectDatabase(env.MONGODB_URI);
  const seeded = await seedCoreUsersAndRbac();
  await seedSampleDomainData(seeded);
  console.log('[OPTRONIX SEED] Core RBAC, Enterprise Personas & Sample Accounts/Meetings seeded:');
  console.log(`  - Admin:         ${seeded.admin.email} (${seeded.admin.employeeCode})`);
  console.log(`  - North Manager: ${seeded.northManager.email} (${seeded.northManager.employeeCode})`);
  console.log(`  - Sales Rep 1:   ${seeded.aditya.email} (${seeded.aditya.employeeCode})`);
  console.log(`  - Sales Rep 2:   ${seeded.rahul.email} (${seeded.rahul.employeeCode})`);
  console.log(`  - Sales Rep 3:   ${seeded.amit.email} (${seeded.amit.employeeCode})`);
  console.log(`  - Default Pass:  ${DEFAULT_SEED_PASSWORD}`);
  await disconnectDatabase();
}

void runSeed().catch((err) => {
  console.error('[OPTRONIX SEED] Failed:', err);
  process.exit(1);
});
