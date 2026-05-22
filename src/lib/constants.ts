export const UserRole = {
  ADMIN: 'ADMIN',
  STAFF: 'STAFF',
  KIOSK: 'KIOSK',
  DISPLAY: 'DISPLAY',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const TicketStatus = {
  PENDING: 'PENDING',
  CALLED: 'CALLED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  MISSED: 'MISSED',
} as const;

export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];
