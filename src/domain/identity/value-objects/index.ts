/**
 * Identity domain value objects barrel export.
 */

export * from './password-hash';
export * from './phone-number';
export * from './display-name';
export * from './timezone';
export * from './locale';
export * from './identity-ids';

// Re-export value objects that already exist in the shared value-objects module.
export { Email, Username, Country } from '@/domain/value-objects';
