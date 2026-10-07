import { TweetData, FilterDecision, UserFilterSettings } from '../types/index.js';

export interface EvaluateTweetsRequest {
  type: 'EVALUATE_TWEETS';
  tweets: TweetData[];
}

export interface EvaluateTweetsResponse {
  decisions: FilterDecision[];
  showDebugBadges?: boolean;
  showFoldBanner?: boolean;
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface GetSettingsResponse {
  settings: UserFilterSettings;
  hasApiKey: boolean;
}

export interface SaveSettingsRequest {
  type: 'SAVE_SETTINGS';
  settings: UserFilterSettings;
  apiKey?: string;
}

export interface SaveSettingsResponse {
  success: boolean;
}

export interface AnalyzeImageUrlRequest {
  type: 'ANALYZE_IMAGE_URL';
  url: string;
}

export interface AnalyzeImageUrlResponse {
  score: number;
}

export interface FetchUserBioRequest {
  type: 'FETCH_USER_BIO';
  username: string;
}

export interface FetchUserBioResponse {
  bio?: string;
}

export type ExtensionRequest =
  | EvaluateTweetsRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | AnalyzeImageUrlRequest
  | FetchUserBioRequest;
