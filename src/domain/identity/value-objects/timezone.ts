/**
 * Timezone value object — IANA timezone identifier.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

// A subset of common IANA timezones. In production this would be the full list.
const COMMON_TIMEZONES = new Set([
  'UTC', 'GMT',
  'Africa/Accra', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Cairo',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'America/Toronto', 'America/Mexico_City',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Istanbul',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai', 'Asia/Kolkata',
  'Australia/Sydney', 'Pacific/Auckland',
]);

export interface TimezoneProps {
  readonly value: string;
}

export class Timezone extends ValueObject<TimezoneProps> {
  constructor(value: string) {
    Timezone.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static validate(value: string): void {
    if (!value || value.length === 0) {
      throw new ValidationError('Timezone is required', 'timezone');
    }
    // Accept any slash-separated identifier or UTC/GMT
    if (!COMMON_TIMEZONES.has(value) && !value.includes('/')) {
      throw new ValidationError(`Invalid timezone: ${value}`, 'timezone');
    }
  }

  static default(): Timezone {
    return new Timezone('UTC');
  }

  toString(): string {
    return this.props.value;
  }
}
