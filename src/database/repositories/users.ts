import type { PrismaClient, User } from '@prisma/client';

export interface TelegramUserInfo {
  id: number;
  username?: string;
  first_name?: string;
}

export class UserRepository {
  constructor(private readonly db: PrismaClient) {}

  upsert(from: TelegramUserInfo): Promise<User> {
    const data = { username: from.username ?? null, firstName: from.first_name ?? null };
    return this.db.user.upsert({
      where: { telegramId: BigInt(from.id) },
      create: { telegramId: BigInt(from.id), ...data },
      update: data,
    });
  }

  setAwaitingEdit(userId: number, submissionId: number | null): Promise<User> {
    return this.db.user.update({ where: { id: userId }, data: { awaitingEditSubmissionId: submissionId } });
  }
}
