/**
 * Demo data for each role.
 *
 * Provides realistic mock data that makes the app feel alive.
 * Each role has tailored data for their personalized home page.
 */

export interface PlayerData {
  recentGames: Array<{ id: string; title: string; lastPlayed: string; progress: number; thumbnail: string }>;
  dailyChallenge: { title: string; reward: number; expiresIn: string };
  leaderboardPosition: { rank: number; total: number; score: number };
  wallet: { balance: number; currency: string };
  friendsOnline: number;
  recentRewards: Array<{ id: string; title: string; amount: number; date: string }>;
}

export interface CreatorData {
  myGames: Array<{ id: string; title: string; status: 'published' | 'draft'; plays: number; revenue: number }>;
  revenue: { total: number; thisMonth: number; currency: string };
  publishingQueue: Array<{ id: string; title: string; status: string }>;
  analytics: { totalPlays: number; totalPlayers: number; avgRating: number };
}

export interface StudioData {
  studios: Array<{ id: string; name: string; members: number; projects: number }>;
  developers: Array<{ id: string; name: string; role: string; status: string }>;
  revenue: { total: number; thisMonth: number };
  projects: Array<{ id: string; title: string; status: string; deadline: string }>;
}

export interface MarketplaceData {
  storePerformance: { totalSales: number; revenue: number; conversionRate: number };
  featuredGames: Array<{ id: string; title: string; price: number; sales: number }>;
  sales: { today: number; thisWeek: number; thisMonth: number };
  subscriptions: { active: number; revenue: number };
}

export interface ModeratorData {
  reports: Array<{ id: string; type: string; severity: string; status: string; reportedAt: string }>;
  flaggedGames: Array<{ id: string; title: string; flagCount: number }>;
  antiCheat: { flaggedPlayers: number; bannedToday: number };
  incidents: Array<{ id: string; title: string; severity: string; status: string }>;
}

export interface SupportData {
  tickets: Array<{ id: string; subject: string; priority: string; status: string; createdAt: string }>;
  liveSessions: number;
  refundRequests: Array<{ id: string; amount: number; status: string }>;
  playerIssues: number;
  creatorIssues: number;
}

export interface FinanceData {
  revenue: { total: number; thisMonth: number; currency: string };
  payoutQueue: Array<{ id: string; payee: string; amount: number; status: string }>;
  liquidity: { available: number; reserved: number };
  settlement: { pending: number; completed: number };
}

export interface OperationsData {
  systemHealth: { status: string; uptime: string; incidents: number };
  realtime: { activeUsers: number; apiLatency: number; errorRate: number };
  queues: Array<{ name: string; depth: number; processing: number }>;
  alerts: Array<{ id: string; severity: string; message: string; timestamp: string }>;
}

export const playerData: PlayerData = {
  recentGames: [
    { id: 'game_1', title: 'Liquid Tournament', lastPlayed: '2 hours ago', progress: 75, thumbnail: '🏆' },
    { id: 'game_2', title: 'Bubble Pop Mania', lastPlayed: 'Yesterday', progress: 100, thumbnail: '🫧' },
    { id: 'game_3', title: 'Neon Runner', lastPlayed: '3 days ago', progress: 45, thumbnail: '🏃' },
    { id: 'game_4', title: 'Cosmic Puzzle', lastPlayed: '1 week ago', progress: 60, thumbnail: '🧩' },
  ],
  dailyChallenge: { title: 'Survive 10 waves in Liquid Tournament', reward: 500, expiresIn: '4h 23m' },
  leaderboardPosition: { rank: 142, total: 15420, score: 24500 },
  wallet: { balance: 12500, currency: 'GHS' },
  friendsOnline: 8,
  recentRewards: [
    { id: 'r1', title: 'Daily Login Bonus', amount: 100, date: 'Today' },
    { id: 'r2', title: 'Tournament Participation', amount: 250, date: 'Yesterday' },
    { id: 'r3', title: 'Achievement: Speed Demon', amount: 500, date: '2 days ago' },
  ],
};

export const creatorData: CreatorData = {
  myGames: [
    { id: 'g1', title: 'Liquid Tournament', status: 'published', plays: 12450, revenue: 3400 },
    { id: 'g2', title: 'Cosmic Puzzle', status: 'published', plays: 8200, revenue: 2100 },
    { id: 'g3', title: 'Untitled Game', status: 'draft', plays: 0, revenue: 0 },
  ],
  revenue: { total: 5500, thisMonth: 1200, currency: 'GHS' },
  publishingQueue: [
    { id: 'q1', title: 'Untitled Game', status: 'Reviewing' },
    { id: 'q2', title: 'Liquid Tournament v2', status: 'Scheduled' },
  ],
  analytics: { totalPlays: 20650, totalPlayers: 8400, avgRating: 4.6 },
};

export const studioData: StudioData = {
  studios: [
    { id: 's1', name: 'Liquid Games Studio', members: 12, projects: 5 },
    { id: 's2', name: 'Neon Interactive', members: 8, projects: 3 },
  ],
  developers: [
    { id: 'd1', name: 'Alex Chen', role: 'Lead Developer', status: 'Active' },
    { id: 'd2', name: 'Sam Patel', role: 'Game Designer', status: 'Active' },
    { id: 'd3', name: 'Jordan Lee', role: 'Artist', status: 'On Leave' },
  ],
  revenue: { total: 45000, thisMonth: 8200 },
  projects: [
    { id: 'p1', title: 'Liquid Tournament v2', status: 'In Development', deadline: '2024-03-15' },
    { id: 'p2', title: 'Mobile Port', status: 'Planning', deadline: '2024-04-30' },
    { id: 'p3', title: 'New IP', status: 'Concept', deadline: '2024-06-01' },
  ],
};

export const marketplaceData: MarketplaceData = {
  storePerformance: { totalSales: 34200, revenue: 89000, conversionRate: 4.2 },
  featuredGames: [
    { id: 'f1', title: 'Liquid Tournament', price: 25, sales: 3400 },
    { id: 'f2', title: 'Bubble Pop Mania', price: 15, sales: 8200 },
    { id: 'f3', title: 'Neon Runner', price: 20, sales: 5600 },
  ],
  sales: { today: 1240, thisWeek: 8900, thisMonth: 34200 },
  subscriptions: { active: 4200, revenue: 21000 },
};

export const moderatorData: ModeratorData = {
  reports: [
    { id: 'r1', type: 'Cheating', severity: 'high', status: 'Open', reportedAt: '5 min ago' },
    { id: 'r2', type: 'Harassment', severity: 'medium', status: 'Investigating', reportedAt: '1 hour ago' },
    { id: 'r3', type: 'Inappropriate Content', severity: 'high', status: 'Open', reportedAt: '2 hours ago' },
    { id: 'r4', type: 'Spam', severity: 'low', status: 'Resolved', reportedAt: '3 hours ago' },
  ],
  flaggedGames: [
    { id: 'fg1', title: 'Questionable Game', flagCount: 15 },
    { id: 'fg2', title: 'Another Game', flagCount: 8 },
  ],
  antiCheat: { flaggedPlayers: 23, bannedToday: 4 },
  incidents: [
    { id: 'i1', title: 'Mass cheating in tournament', severity: 'critical', status: 'Investigating' },
    { id: 'i2', title: 'Spam bot wave', severity: 'medium', status: 'Mitigated' },
  ],
};

export const supportData: SupportData = {
  tickets: [
    { id: 't1', subject: 'Payment not received', priority: 'high', status: 'Open', createdAt: '10 min ago' },
    { id: 't2', subject: 'Game crashing on launch', priority: 'medium', status: 'In Progress', createdAt: '30 min ago' },
    { id: 't3', subject: 'Cannot withdraw winnings', priority: 'high', status: 'Open', createdAt: '1 hour ago' },
    { id: 't4', subject: 'Account login issue', priority: 'low', status: 'Resolved', createdAt: '2 hours ago' },
  ],
  liveSessions: 12,
  refundRequests: [
    { id: 'rf1', amount: 250, status: 'Pending' },
    { id: 'rf2', amount: 100, status: 'Approved' },
  ],
  playerIssues: 8,
  creatorIssues: 3,
};

export const financeData: FinanceData = {
  revenue: { total: 234000, thisMonth: 45000, currency: 'GHS' },
  payoutQueue: [
    { id: 'pq1', payee: 'Creator Studio A', amount: 12000, status: 'Pending' },
    { id: 'pq2', payee: 'Indie Dev B', amount: 3400, status: 'Processing' },
    { id: 'pq3', payee: 'Studio C', amount: 8900, status: 'Pending' },
  ],
  liquidity: { available: 580000, reserved: 120000 },
  settlement: { pending: 14, completed: 89 },
};

export const operationsData: OperationsData = {
  systemHealth: { status: 'Healthy', uptime: '99.97%', incidents: 0 },
  realtime: { activeUsers: 3420, apiLatency: 45, errorRate: 0.02 },
  queues: [
    { name: 'outbox', depth: 0, processing: 0 },
    { name: 'projections', depth: 0, processing: 0 },
    { name: 'webhooks', depth: 3, processing: 1 },
  ],
  alerts: [
    { id: 'a1', severity: 'info', message: 'Deployment completed successfully', timestamp: '10 min ago' },
    { id: 'a2', severity: 'warning', message: 'Redis memory at 72%', timestamp: '1 hour ago' },
  ],
};

/** Get demo data for a role. */
export function getDemoData(role: string): unknown {
  switch (role) {
    case 'player': return playerData;
    case 'creator': return creatorData;
    case 'studio': return studioData;
    case 'marketplace': return marketplaceData;
    case 'moderator': return moderatorData;
    case 'support': return supportData;
    case 'finance': return financeData;
    case 'operations': return operationsData;
    case 'admin': return { player: playerData, creator: creatorData, finance: financeData, operations: operationsData };
    case 'developer': return { operations: operationsData, systemHealth: operationsData.systemHealth };
    default: return null;
  }
}
