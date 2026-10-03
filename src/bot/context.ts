import type { Context } from 'telegraf';
import type { User } from '@prisma/client';
import type { Config } from '../config/env';
import type { SubmissionRepository } from '../database/repositories/submissions';
import type { UserRepository } from '../database/repositories/users';
import type { ModerationService } from '../services/moderationService';
import type { Notifier } from '../services/notifier';
import type { PublishService } from '../services/publishService';
import type { SubmissionService } from '../services/submissionService';
import type { Logger } from '../utils/logger';

export interface BotContext extends Context {
  /** Set by the userContext middleware. */
  dbUser: User;
}

export interface BotDeps {
  config: Config;
  log: Logger;
  users: UserRepository;
  submissions: SubmissionRepository;
  submissionService: SubmissionService;
  publishService: PublishService;
  moderation: ModerationService;
  notifier: Notifier;
}
