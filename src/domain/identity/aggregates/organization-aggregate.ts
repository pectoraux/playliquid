/**
 * Organization Aggregate — multi-tenant organization.
 *
 * Organizations can be Creator Studios, Platform Operations, Moderation Teams,
 * Enterprise Customers, or Tournament Organizers. Users belong to organizations
 * via memberships that carry roles and permissions.
 */

import { AggregateRoot } from '@/domain/shared/aggregate/aggregate-root';
import { BusinessRuleError } from '@/domain/shared/errors';
import {
  OrganizationCreated, MemberAdded, MemberRemoved,
} from '@/domain/identity/events/identity-events';

export type OrganizationType =
  | 'creator_studio'
  | 'platform_operations'
  | 'moderation_team'
  | 'enterprise_customer'
  | 'tournament_organizer';

export interface OrganizationMember {
  readonly userId: string;
  readonly roleId: string;
  readonly joinedAt: string;
  readonly status: 'active' | 'invited' | 'removed';
}

export class OrganizationAggregate extends AggregateRoot<string> {
  private _name: string = '';
  private _slug: string = '';
  private _type: OrganizationType = 'creator_studio';
  private _createdById: string = '';
  private _members: OrganizationMember[] = [];
  private _active: boolean = true;

  get name(): string { return this._name; }
  get slug(): string { return this._slug; }
  get type(): OrganizationType { return this._type; }
  get createdById(): string { return this._createdById; }
  get members(): readonly OrganizationMember[] { return this._members; }
  get active(): boolean { return this._active; }

  static create(params: {
    id: string;
    name: string;
    slug: string;
    type: OrganizationType;
    createdById: string;
  }): OrganizationAggregate {
    if (!params.name || params.name.trim().length === 0) {
      throw new BusinessRuleError('Organization name is required', 'ORG_NAME_REQUIRED');
    }
    if (!params.slug || !/^[a-z0-9-]+$/.test(params.slug)) {
      throw new BusinessRuleError('Organization slug must be lowercase alphanumeric with dashes', 'ORG_SLUG_INVALID');
    }

    const org = new OrganizationAggregate(params.id);
    org.raiseEvent(OrganizationCreated, {
      organizationId: params.id,
      name: params.name,
      slug: params.slug,
      type: params.type,
      createdById: params.createdById,
      createdAt: new Date().toISOString(),
    });
    return org;
  }

  addMember(userId: string, roleId: string, addedBy: string): void {
    if (!this._active) {
      throw new BusinessRuleError('Cannot add members to an inactive organization', 'ORG_INACTIVE');
    }
    if (this._members.some((m) => m.userId === userId && m.status === 'active')) {
      throw new BusinessRuleError('User is already a member', 'ALREADY_MEMBER');
    }

    this.raiseEvent(MemberAdded, {
      organizationId: String(this.id),
      userId,
      roleId,
      addedBy,
      addedAt: new Date().toISOString(),
    });
  }

  removeMember(userId: string, removedBy: string): void {
    const member = this._members.find((m) => m.userId === userId && m.status === 'active');
    if (!member) {
      throw new BusinessRuleError('User is not a member', 'NOT_A_MEMBER');
    }

    this.raiseEvent(MemberRemoved, {
      organizationId: String(this.id),
      userId,
      removedBy,
      removedAt: new Date().toISOString(),
    });
  }

  hasMember(userId: string): boolean {
    return this._members.some((m) => m.userId === userId && m.status === 'active');
  }

  getMemberRole(userId: string): string | null {
    const member = this._members.find((m) => m.userId === userId && m.status === 'active');
    return member?.roleId ?? null;
  }

  private applyOrganizationCreated(event: { payload: OrganizationCreatedPayload }): void {
    this._name = event.payload.name;
    this._slug = event.payload.slug;
    this._type = event.payload.type as OrganizationType;
    this._createdById = event.payload.createdById;
  }

  private applyMemberAdded(event: { payload: MemberAddedPayload }): void {
    this._members = [...this._members, {
      userId: event.payload.userId,
      roleId: event.payload.roleId,
      joinedAt: event.payload.addedAt,
      status: 'active',
    }];
  }

  private applyMemberRemoved(event: { payload: MemberRemovedPayload }): void {
    this._members = this._members.map((m) =>
      m.userId === event.payload.userId ? { ...m, status: 'removed' as const } : m,
    );
  }

  validate(): void {
    if (this._version > 0 && !this._name) {
      throw new BusinessRuleError('Organization must have a name', 'ORG_NAME_REQUIRED');
    }
  }

  protected toSnapshotState(): Record<string, unknown> {
    return {
      name: this._name,
      slug: this._slug,
      type: this._type,
      createdById: this._createdById,
      members: this._members,
      active: this._active,
    };
  }

  protected fromSnapshotState(state: Record<string, unknown>): void {
    this._name = (state.name as string) ?? '';
    this._slug = (state.slug as string) ?? '';
    this._type = (state.type as OrganizationType) ?? 'creator_studio';
    this._createdById = (state.createdById as string) ?? '';
    this._members = (state.members as OrganizationMember[]) ?? [];
    this._active = (state.active as boolean) ?? true;
  }
}
