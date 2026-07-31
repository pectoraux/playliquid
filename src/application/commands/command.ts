/**
 * Command base type.
 *
 * A command is an intention to change state. It is named in the imperative
 * mood (e.g., StartGame, DepositFunds). Commands flow through the CommandBus
 * and are handled by exactly one CommandHandler.
 */

import type { Metadata } from '@/shared/types';

export interface Command {
  /** Discriminator identifying the command type. */
  readonly commandType: string;
  /** Correlation id for distributed tracing. */
  readonly correlationId?: string;
  /** Causation id — the event/command that caused this one. */
  readonly causationId?: string;
  /** Idempotency key for deduplication. */
  readonly idempotencyKey?: string;
  /** The user initiating the command. */
  readonly userId?: string;
  /** Additional metadata. */
  readonly metadata?: Metadata;
  /** Optional payload (commands with typed payloads use CommandWithPayload). */
  readonly payload?: unknown;
}

/** A command that carries a typed payload. */
export interface CommandWithPayload<TPayload> extends Command {
  readonly payload: TPayload;
}

/** Metadata extracted from a command for handlers and middleware. */
export interface CommandContext {
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly idempotencyKey: string | null;
  readonly userId: string | null;
  readonly metadata: Metadata;
}

/** Extract context from a command, generating ids where missing. */
export function extractCommandContext(command: Command): CommandContext {
  return {
    correlationId: command.correlationId ?? '',
    causationId: command.causationId ?? null,
    idempotencyKey: command.idempotencyKey ?? null,
    userId: command.userId ?? null,
    metadata: command.metadata ?? {},
  };
}
