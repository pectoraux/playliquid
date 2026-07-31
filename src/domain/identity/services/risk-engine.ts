/**
 * Risk Engine — evaluates authentication risk based on signals.
 *
 * Signals:
 *   - New device (not in trusted device list)
 *   - Impossible travel (distance / time between logins exceeds physical limits)
 *   - Repeated failures (brute-force detection)
 *   - Unusual location (IP geolocation differs from typical)
 *   - Abnormal login times (off-hours for the user's timezone)
 *   - IP reputation (interface to external reputation service)
 *
 * Risk score: 0.0 (safe) → 1.0 (highly risky)
 * Score influences MFA requirements.
 */

export interface RiskSignals {
  readonly isNewDevice: boolean;
  readonly impossibleTravel: boolean;
  readonly recentFailureCount: number;
  readonly unusualLocation: boolean;
  readonly abnormalTime: boolean;
  readonly ipReputationScore: number; // 0 = clean, 1 = malicious
  readonly trustedDevice: boolean;
}

export interface RiskContext {
  readonly userId: string;
  readonly deviceFingerprint: string;
  readonly ipAddress: string;
  readonly geoLocation: { country: string; region: string; lat: number; lon: number } | null;
  readonly loginTime: number;
  readonly userTimezone: string;
  readonly lastLogin?: {
    readonly ipAddress: string;
    readonly geoLocation: { country: string; region: string; lat: number; lon: number } | null;
    readonly timestamp: number;
  };
  readonly knownDevices: readonly { fingerprint: string; trusted: boolean; lastSeenAt: string }[];
  readonly recentFailedAttempts: number;
  readonly ipReputation?: number;
}

export interface RiskAssessment {
  readonly score: number; // 0.0 - 1.0
  readonly level: 'low' | 'medium' | 'high' | 'critical';
  readonly signals: RiskSignals;
  readonly requiresMfa: boolean;
  readonly requiresStepUp: boolean;
  readonly reasons: string[];
}

export class RiskEngine {
  private readonly thresholds = {
    low: 0.2,
    medium: 0.5,
    high: 0.75,
  };

  /** Assess risk for a login attempt. */
  assess(ctx: RiskContext): RiskAssessment {
    const signals: RiskSignals = {
      isNewDevice: !ctx.knownDevices.some((d) => d.fingerprint === ctx.deviceFingerprint),
      impossibleTravel: this.checkImpossibleTravel(ctx),
      recentFailureCount: ctx.recentFailedAttempts,
      unusualLocation: this.checkUnusualLocation(ctx),
      abnormalTime: this.checkAbnormalTime(ctx),
      ipReputationScore: ctx.ipReputation ?? 0,
      trustedDevice: ctx.knownDevices.some(
        (d) => d.fingerprint === ctx.deviceFingerprint && d.trusted,
      ),
    };

    const score = this.calculateScore(signals);
    const level = this.scoreToLevel(score);
    const reasons = this.buildReasons(signals);

    return {
      score,
      level,
      signals,
      requiresMfa: score >= this.thresholds.medium || signals.isNewDevice,
      requiresStepUp: score >= this.thresholds.high,
      reasons,
    };
  }

  private calculateScore(signals: RiskSignals): number {
    let score = 0;

    if (signals.isNewDevice) score += 0.3;
    if (signals.impossibleTravel) score += 0.4;
    if (signals.recentFailureCount >= 5) score += 0.3;
    else if (signals.recentFailureCount >= 3) score += 0.2;
    if (signals.unusualLocation) score += 0.2;
    if (signals.abnormalTime) score += 0.1;
    score += signals.ipReputationScore * 0.3;

    // Trusted device reduces risk
    if (signals.trustedDevice) score -= 0.3;

    return Math.max(0, Math.min(1, score));
  }

  private scoreToLevel(score: number): RiskAssessment['level'] {
    if (score >= this.thresholds.high) return 'critical';
    if (score >= this.thresholds.medium) return 'high';
    if (score >= this.thresholds.low) return 'medium';
    return 'low';
  }

  private checkImpossibleTravel(ctx: RiskContext): boolean {
    if (!ctx.lastLogin || !ctx.lastLogin.geoLocation || !ctx.geoLocation) return false;
    const distance = this.haversineDistance(
      ctx.lastLogin.geoLocation.lat,
      ctx.lastLogin.geoLocation.lon,
      ctx.geoLocation.lat,
      ctx.geoLocation.lon,
    );
    const timeDiffHours = (ctx.loginTime - ctx.lastLogin.timestamp) / (1000 * 60 * 60);
    if (timeDiffHours <= 0) return false;
    // Max reasonable speed: 900 km/h (commercial flight)
    const maxDistance = timeDiffHours * 900;
    return distance > maxDistance;
  }

  private checkUnusualLocation(ctx: RiskContext): boolean {
    if (!ctx.lastLogin?.geoLocation || !ctx.geoLocation) return false;
    return ctx.lastLogin.geoLocation.country !== ctx.geoLocation.country;
  }

  private checkAbnormalTime(ctx: RiskContext): boolean {
    try {
      const hour = new Date(ctx.loginTime).toLocaleString('en-US', {
        timeZone: ctx.userTimezone,
        hour: 'numeric',
        hour12: false,
      });
      const h = parseInt(hour, 10);
      return h < 4 || h > 23; // 11pm - 4am local time
    } catch {
      return false;
    }
  }

  private buildReasons(signals: RiskSignals): string[] {
    const reasons: string[] = [];
    if (signals.isNewDevice) reasons.push('New device');
    if (signals.impossibleTravel) reasons.push('Impossible travel detected');
    if (signals.recentFailureCount >= 3) reasons.push(`${signals.recentFailureCount} recent failed attempts`);
    if (signals.unusualLocation) reasons.push('Unusual location');
    if (signals.abnormalTime) reasons.push('Abnormal login time');
    if (signals.ipReputationScore > 0.5) reasons.push('Poor IP reputation');
    if (signals.trustedDevice) reasons.push('Trusted device (risk reduced)');
    return reasons;
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
