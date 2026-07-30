/**
 * Command handler base contract.
 *
 * Every command handler MUST implement this interface. The CommandBus
 * dispatches commands to the registered handler by command type.
 */

import type { Result } from '@/shared/types/result';
import type { Command } from '@/application/commands/command';

export interface CommandHandler<TCommand extends Command = Command, TResult = unknown> {
  /** The command type this handler handles. */
  readonly commandType: string;
  /** Execute the command, returning a Result. */
  execute(command: TCommand): Promise<Result<TResult>>;
}
