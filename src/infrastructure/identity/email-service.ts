/**
 * Console email service — logs emails to console for development.
 * In production this would use the SMTP provider from M2.
 */

import type { EmailService } from '@/application/ports/identity-ports';
import { logger } from '@/shared/logging';

export class ConsoleEmailService implements EmailService {
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    logger.system().info('Email: Verification', { email, token: token.substring(0, 16) + '...' });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    logger.system().info('Email: Password Reset', { email, token: token.substring(0, 16) + '...' });
  }

  async sendWelcomeEmail(email: string, username: string): Promise<void> {
    logger.system().info('Email: Welcome', { email, username });
  }

  async sendApprovalEmail(email: string): Promise<void> {
    logger.system().info('Email: Account Approved', { email });
  }

  async sendRejectionEmail(email: string, reason: string): Promise<void> {
    logger.system().info('Email: Account Rejected', { email, reason });
  }

  async sendSuspensionEmail(email: string, reason: string): Promise<void> {
    logger.system().info('Email: Account Suspended', { email, reason });
  }

  async sendMfaEnabledEmail(email: string): Promise<void> {
    logger.system().info('Email: MFA Enabled', { email });
  }

  async sendNewDeviceAlert(email: string, deviceInfo: string): Promise<void> {
    logger.system().info('Email: New Device Login', { email, deviceInfo });
  }

  async sendApiKeyCreatedEmail(email: string, keyName: string): Promise<void> {
    logger.system().info('Email: API Key Created', { email, keyName });
  }
}
