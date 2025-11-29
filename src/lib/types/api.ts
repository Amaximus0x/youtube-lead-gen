// API Response types matching the backend DTOs

export interface VideoInfo {
  title: string;
  views: number;
  uploadDate: string;
  uploadedAgo: string;
}

export interface SocialLinks {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  tiktok?: string;
  discord?: string;
  twitch?: string;
  linkedin?: string;
  website?: string;
}

export interface ChannelSearchResult {
  channelId: string;
  name: string;
  url: string;
  description?: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
  country?: string;
  language?: string;
  thumbnailUrl?: string;
  relevanceScore?: number;
  emails?: string[];
  email_sources?: Record<string, string>; // Map of email to source
  socialLinks?: SocialLinks;
  latestVideos?: VideoInfo[]; // Latest 3 videos from the channel
  lastPostedVideoDate?: string; // Date of most recent video (YYYY-MM-DD)
  avgRecentViews?: number; // Average views of 3 most recent videos
}

export interface SearchStats {
  total: number;
  filtered: number;
  keyword: string;
  displayed?: number;
  remaining?: number;
}

export interface Pagination {
  currentPage: number;
  pageSize: number;
  totalChannels: number;
  totalPages: number;
  hasMore: boolean;
  searchSessionId: string;
}

export interface SearchResponse {
  channels: ChannelSearchResult[];
  stats: SearchStats;
  pagination: Pagination;
  enrichmentQueued: boolean;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  statusCode?: number;
}

export interface SearchFilters {
  minSubscribers?: number;
  maxSubscribers?: number;
  minAvgViews?: number;
  maxAvgViews?: number;
  country?: string;
  englishOnly?: boolean;
  excludeMusicChannels?: boolean;
  excludeBrands?: boolean;
}

export interface SearchRequest {
  keyword: string;
  limit?: number;
  page?: number;
  pageSize?: number;
  searchSessionId?: string;
  filters?: SearchFilters;
}
