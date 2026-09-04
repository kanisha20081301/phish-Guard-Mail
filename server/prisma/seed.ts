import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';

const database = new PrismaClient();

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed production');
  const passwordHash = await bcrypt.hash('Admin12345678!', 12);
  await database.user.upsert({
    where: { email: 'admin@phishguard.local' },
    update: { passwordHash },
    create: {
      email: 'admin@phishguard.local',
      displayName: 'Local Admin',
      role: UserRole.ADMIN,
      passwordHash,
    },
  });
}

seed().finally(() => database.$disconnect());
