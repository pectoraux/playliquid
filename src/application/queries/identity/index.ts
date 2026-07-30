/**
 * Identity queries barrel export.
 *
 * Re-exports all identity query types, payloads, handlers, and view models
 * for convenient consumption by the composition root and API routes.
 */

// User views + permissions.
export * from './user-queries';

// Waitlist listing + stats.
export * from './waitlist-queries';

// Organization views + members.
export * from './organization-queries';

// Audit log listing + lookup.
export * from './audit-queries';

// API key listing + lookup (hash stripped).
export * from './api-key-queries';

// Roles + permissions.
export * from './role-queries';
