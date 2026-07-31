/**
 * RoleId and PermissionId value objects.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';
import { createId } from '@/shared/ids';

/** RoleId — identifies a role. */
export class RoleId extends ValueObject<{ value: string }> {
  constructor(value: string) {
    RoleId.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static validate(value: string): void {
    if (!value || value.length < 3) {
      throw new ValidationError('RoleId must be a non-empty string', 'roleId');
    }
  }

  static generate(): RoleId {
    return new RoleId(createId('role'));
  }

  toString(): string {
    return this.props.value;
  }
}

/** PermissionId — identifies a permission (e.g., "game.publish"). */
export class PermissionId extends ValueObject<{ value: string }> {
  constructor(value: string) {
    PermissionId.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  /** The resource part (e.g., "game" from "game.publish"). */
  get resource(): string {
    return this.props.value.split('.')[0] ?? '';
  }

  /** The action part (e.g., "publish" from "game.publish"). */
  get action(): string {
    return this.props.value.split('.').slice(1).join('.') ?? '';
  }

  static validate(value: string): void {
    if (!value || !value.includes('.')) {
      throw new ValidationError(
        'PermissionId must be in format "resource.action" (e.g., "game.publish")',
        'permissionId',
      );
    }
    if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/i.test(value)) {
      throw new ValidationError(
        `Invalid permission format: ${value}`,
        'permissionId',
      );
    }
  }

  toString(): string {
    return this.props.value;
  }
}

/** DeviceId — identifies a trusted device. */
export class DeviceId extends ValueObject<{ value: string }> {
  constructor(value: string) {
    DeviceId.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static validate(value: string): void {
    if (!value || value.length < 3) {
      throw new ValidationError('DeviceId must be a non-empty string', 'deviceId');
    }
  }

  static generate(): DeviceId {
    return new DeviceId(createId('device'));
  }

  toString(): string {
    return this.props.value;
  }
}

/** UserId — identifies a user. */
export class UserId extends ValueObject<{ value: string }> {
  constructor(value: string) {
    UserId.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static validate(value: string): void {
    if (!value || value.length < 3) {
      throw new ValidationError('UserId must be a non-empty string', 'userId');
    }
  }

  static generate(): UserId {
    return new UserId(createId('user'));
  }

  toString(): string {
    return this.props.value;
  }
}
