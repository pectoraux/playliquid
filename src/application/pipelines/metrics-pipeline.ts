/**
 * Metrics middleware — records command dispatch counts and durations.
 */

import type { CommandMiddleware } from './pipeline';
import type { Command } from '@/application/commands/command';
import { Result } from '@/shared/types/result';
import type { MetricsRecorder } from '@/application/ports';

export class MetricsMiddleware implements CommandMiddleware {
  readonly name = 'metrics';

  constructor(private readonly metrics: MetricsRecorder) {}

  async handle<T>(command: Command, next: (command: Command) => Promise<Result<T>>): Promise<Result<T>> {
    const startedAt = Date.now();
    try {
      const result = await next(command);
      const durationMs = Date.now() - startedAt;
      this.metrics.recordCommand(command.commandType, durationMs, result.ok);
      return result;
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      this.metrics.recordCommand(command.commandType, durationMs, false);
      throw e;
    }
  }
}
