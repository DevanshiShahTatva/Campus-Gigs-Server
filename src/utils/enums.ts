export enum ROLE {
  USER = 'user',
  ADMIN = 'admin',
}

export enum CONTACT_US_STATUS {
  PENDING = 'pending',
  RESPONDED = 'responded',
}

export enum BUY_PLAN_STATUS {
  PENDING = 'pending',
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}
export enum PAYMENT_TYPE {
  HOURLY = 'hourly',
  FIXED = 'fixed',
}

export enum PROFILE_TYPE {
  PROVIDER = 'provider',
  USER = 'user',
}

export enum GIG_STATUS {
  UNSTARTED = "un_started",
  INPROGRESS = "in_progress",
  COMPLETED = "completed",
  REJECTED = "rejected"
}

export enum BID_STATUS {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected'
}

export enum PRIORITY {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}
