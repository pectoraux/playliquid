/**
 * Validation Suite — defines a set of platform checks for Phase A validation.
 *
 * Each suite is a collection of validation checks that verify a specific
 * aspect of the platform (event replay, ledger, AI, security, etc.).
 */

import { logger } from '@/shared/logging';

export interface ValidationCheck {
  readonly name: string;
  readonly description: string;
  readonly category: 'event_replay' | 'ledger' | 'ai' | 'security' | 'extension' | 'session' | 'performance' | 'data_integrity';
  readonly run: () => Promise<ValidationCheckResult>;
}

export interface ValidationCheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly durationMs: number;
}

export interface ValidationSuite {
  readonly name: string;
  readonly description: string;
  readonly checks: readonly ValidationCheck[];
}

export interface ValidationRunResult {
  readonly suite: string;
  readonly status: 'passed' | 'failed' | 'partial';
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly results: ValidationCheckResult[];
  readonly durationMs: number;
  readonly report: Record<string, unknown>;
}

export class ValidationSuiteRunner {
  private readonly suites = new Map<string, ValidationSuite>();

  registerSuite(suite: ValidationSuite): void {
    this.suites.set(suite.name, suite);
    logger.system().info('Validation suite registered', {
      suite: suite.name,
      checks: suite.checks.length,
    });
  }

  getSuiteNames(): string[] {
    return Array.from(this.suites.keys());
  }

  async run(suiteName: string): Promise<ValidationRunResult> {
    const suite = this.suites.get(suiteName);
    if (!suite) {
      throw new Error(`Validation suite not found: ${suiteName}`);
    }

    const startedAt = Date.now();
    logger.system().info('Validation run started', { suite: suiteName });

    const results: ValidationCheckResult[] = [];
    for (const check of suite.checks) {
      const checkStart = Date.now();
      try {
        const result = await check.run();
        results.push({
          ...result,
          name: check.name,
          durationMs: Date.now() - checkStart,
        });
      } catch (e) {
        results.push({
          name: check.name,
          passed: false,
          message: `Check threw: ${(e as Error).message}`,
          durationMs: Date.now() - checkStart,
        });
      }
    }

    const passedChecks = results.filter((r) => r.passed).length;
    const failedChecks = results.length - passedChecks;
    const status: ValidationRunResult['status'] =
      failedChecks === 0 ? 'passed' : passedChecks === 0 ? 'failed' : 'partial';

    const totalChecks = results.length;
    const result: ValidationRunResult = {
      suite: suiteName,
      status,
      totalChecks,
      passedChecks,
      failedChecks,
      results,
      durationMs: Date.now() - startedAt,
      report: {
        suite: suiteName,
        description: suite.description,
        summary: { status, totalChecks, passedChecks, failedChecks },
        checks: results.map((r) => ({
          name: r.name,
          passed: r.passed,
          message: r.message,
          durationMs: r.durationMs,
        })),
      },
    };

    logger.system().info('Validation run completed', {
      suite: suiteName,
      status,
      passed: passedChecks,
      failed: failedChecks,
      durationMs: result.durationMs,
    });

    return result;
  }
}
