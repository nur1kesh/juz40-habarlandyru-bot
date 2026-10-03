export const CATEGORIES = [
  'housing',
  'tickets',
  'lost_found',
  'buy_sell',
  'services',
  'events',
  'education',
  'work',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const AI_STATUSES = ['approved', 'needs_review', 'rejected'] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

export interface AiResult {
  status: AiStatus;
  category: Category;
  confidence: number;
  cleaned_text: string;
  missing_information: string[];
  warnings: string[];
  reason: string | null;
}

export interface AiAnalysis {
  result: AiResult;
  /** Stored in DB for debugging. Never contains secrets. */
  raw: unknown;
}

export interface AiAnalyzer {
  analyze(text: string): Promise<AiAnalysis>;
}
