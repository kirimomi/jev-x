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

export interface PatchSettingsRequest {
  type: 'PATCH_SETTINGS';
  patch: Partial<UserFilterSettings>;
}

export interface PatchSettingsResponse {
  settings: UserFilterSettings;
}

export interface SettingsUpdatedMessage {
  type: 'SETTINGS_UPDATED';
  settings: UserFilterSettings;
}

export interface AnalyzeImageUrlRequest {
  type: 'ANALYZE_IMAGE_URL';
  url: string;
}

export interface AnalyzeImageUrlResponse {
  score: number;
}

export interface ErrorResponse {
  error: string;
}

export type ExtensionRequest =
  | EvaluateTweetsRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | PatchSettingsRequest
  | AnalyzeImageUrlRequest;

export type MessageMap = {
  EVALUATE_TWEETS: { request: EvaluateTweetsRequest; response: EvaluateTweetsResponse };
  GET_SETTINGS: { request: GetSettingsRequest; response: GetSettingsResponse };
  SAVE_SETTINGS: { request: SaveSettingsRequest; response: SaveSettingsResponse };
  PATCH_SETTINGS: { request: PatchSettingsRequest; response: PatchSettingsResponse };
  ANALYZE_IMAGE_URL: { request: AnalyzeImageUrlRequest; response: AnalyzeImageUrlResponse };
};

/**
 * Type-safe wrapper around chrome.runtime.sendMessage
 */
export async function sendExtensionMessage<K extends keyof MessageMap>(
  message: MessageMap[K]['request']
): Promise<MessageMap[K]['response']> {
  const res = await chrome.runtime.sendMessage(message);
  if (res && typeof res === 'object' && 'error' in res && typeof res.error === 'string') {
    throw new Error(res.error);
  }
  return res as MessageMap[K]['response'];
}
