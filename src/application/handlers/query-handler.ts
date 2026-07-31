/**
 * Query handler base contract.
 */

import type { Result } from '@/shared/types/result';
import type { Query } from '@/application/queries/query';

export interface QueryHandler<TQuery extends Query = Query, TResult = unknown> {
  readonly queryType: string;
  execute(query: TQuery): Promise<Result<TResult>>;
}
