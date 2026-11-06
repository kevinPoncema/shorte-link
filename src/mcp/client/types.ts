export interface QrVisualConfig {
  foregroundColor?: string;
  backgroundColor?: string;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  format?: 'png' | 'svg';
}

export interface LinkRecord {
  id: string;
  name: string;
  shortCode: string;
  targetUrl: string;
  isActive: boolean;
  qrConfig?: QrVisualConfig;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedLinks {
  items: LinkRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LinkStatsBreakdownItem {
  name: string;
  count: number;
  percentage: number;
}

export interface LinkStatsTimelinePoint {
  date: string;
  clicks: number;
}

export interface LinkStatsSummary {
  totalClicks: number;
  uniqueVisitors: number;
  firstClickAt?: string | null;
  lastClickAt?: string | null;
}

export interface LinkStatsResponse {
  linkId: string;
  period: string;
  retentionDaysApplied: number;
  summary: LinkStatsSummary;
  timeline: LinkStatsTimelinePoint[];
  breakdowns: {
    os: LinkStatsBreakdownItem[];
    browsers: LinkStatsBreakdownItem[];
    countries: LinkStatsBreakdownItem[];
    referrers: LinkStatsBreakdownItem[];
  };
}

export interface UserProfile {
  id: string;
  email: string;
  plan: 'STARTER' | 'PRO' | string;
  createdAt?: string;
  accessToken?: string;
}

export interface AuthLoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    plan: string;
  };
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  itemType: 'pvc_card' | 'acrylic_stand' | 'nfc_sticker' | string;
  quantity: number;
  unitPrice: number;
  linkId?: string | null;
  customDesignMetadata?: Record<string, any>;
}

export interface ShippingAddressInfo {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone: string;
  notes?: string;
}

export interface PhysicalOrderRecord {
  id: string;
  userId: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' | string;
  fulfillmentStatus: 'unfulfilled' | 'in_production' | 'shipped' | 'delivered' | string;
  totalAmount: number;
  currency: string;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  trackingNumber?: string | null;
  shippingAddress: ShippingAddressInfo;
  items: OrderItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planId: string;
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingConfigResponse {
  physicalOrdersEnabled: boolean;
  proPriceIdConfigured: boolean;
  currency: string;
  prices: {
    pvcCard: number;
    acrylicStand: number;
    nfcSticker: number;
  };
}
