import { TweetData, FilterDecision, UserFilterSettings } from '../types/index.js';

export interface EvaluateTweetsRequest {
  type: 'EVALUATE_TWEETS';
  tweets: TweetData[];
}

export interface EvaluateTweetsResponse {
  decisions: FilterDecision[];
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

export type ExtensionRequest =
  | EvaluateTweetsRequest
  | GetSettingsRequest
  | SaveSettingsRequest;
