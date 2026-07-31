/**
 * Identity commands barrel export.
 *
 * Re-exports all identity command types, payloads, handlers, and Zod schemas
 * for convenient consumption by the composition root and API routes.
 */

// Zod schemas (always first so the composition root can register validators).
export * from './schemas';

// Auth: register / verify / login / logout / refresh / change / reset password.
export * from './auth-commands';

// Waitlist: approve / reject / submit-for-approval.
export * from './waitlist-commands';

// User management: suspend / reactivate / delete / profile / email / MFA / roles.
export * from './user-management-commands';

// Organization: create / add member / remove member / join.
export * from './organization-commands';

// API keys: create / rotate / disable.
export * from './api-key-commands';

// Roles & permissions: create / update / delete.
export * from './role-commands';
