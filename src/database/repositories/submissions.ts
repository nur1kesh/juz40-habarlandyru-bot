import { Prisma, type PrismaClient, type Submission, type SubmissionStatus, type User } from '@prisma/client';

export type SubmissionWithUser = Submission & { user: User };

export class SubmissionRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: {
    userId: number;
    originalText: string;
    textHash: string;
    photoFileIds: string[];
    parentId: number | null;
  }): Promise<Submission> {
    return this.db.submission.create({ data });
  }

  getById(id: number): Promise<SubmissionWithUser | null> {
    return this.db.submission.findUnique({ where: { id }, include: { user: true } });
  }

  update(id: number, data: Prisma.SubmissionUpdateInput): Promise<Submission> {
    return this.db.submission.update({ where: { id }, data });
  }

  /**
   * Atomic status transition. Returns false if the submission is not in one of the `from` states
   * (already handled / double click / concurrent worker).
   */
  async claim(id: number, from: SubmissionStatus[], to: SubmissionStatus, incrementAttempts = false): Promise<boolean> {
    const res = await this.db.submission.updateMany({
      where: { id, status: { in: from } },
      data: { status: to, ...(incrementAttempts ? { attempts: { increment: 1 } } : {}) },
    });
    return res.count === 1;
  }

  countSince(userId: number, since: Date): Promise<number> {
    return this.db.submission.count({ where: { userId, createdAt: { gte: since } } });
  }

  /** Oldest submission in the window (used to tell the user when the limit resets). */
  oldestSince(userId: number, since: Date): Promise<Submission | null> {
    return this.db.submission.findFirst({ where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } });
  }

  findRecentByHash(userId: number, textHash: string, since: Date, statuses: SubmissionStatus[]): Promise<Submission | null> {
    return this.db.submission.findFirst({
      where: { userId, textHash, createdAt: { gte: since }, status: { in: statuses } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findLatestOpenForUser(userId: number): Promise<Submission | null> {
    return this.db.submission.findFirst({
      where: { userId, status: { in: ['approved', 'needs_review'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** needs_review submissions whose admin notification never arrived. */
  findUnnotifiedReviews(olderThan: Date, take = 20): Promise<Submission[]> {
    return this.db.submission.findMany({
      where: { status: 'needs_review', adminMessageId: null, updatedAt: { lt: olderThan } },
      orderBy: { updatedAt: 'asc' },
      take,
    });
  }

  findByStatusOlderThan(statuses: SubmissionStatus[], olderThan: Date, take = 20): Promise<Submission[]> {
    return this.db.submission.findMany({
      where: { status: { in: statuses }, updatedAt: { lt: olderThan } },
      orderBy: { updatedAt: 'asc' },
      take,
    });
  }

  /** Removes user text and AI payloads of finished submissions (data minimisation). */
  async purgeFinished(olderThan: Date): Promise<number> {
    const res = await this.db.submission.updateMany({
      where: {
        status: { in: ['published', 'rejected', 'cancelled'] },
        updatedAt: { lt: olderThan },
        NOT: { originalText: '' },
      },
      data: { originalText: '', cleanedText: null, aiRawResponse: Prisma.DbNull },
    });
    return res.count;
  }
}
