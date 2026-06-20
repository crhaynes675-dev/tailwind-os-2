// Backend wiring — dedicated Tailwind OS3 API (clean CDK stack).
// Reuses the existing Cognito pool + jobs/customers data; new OS3 table
// for service tickets and checklists.
export const API_BASE = 'https://92hhz60r9e.execute-api.us-east-1.amazonaws.com/prod';
export const COGNITO_URL = 'https://cognito-idp.us-east-1.amazonaws.com/';
export const CLIENT_ID = 'gikbjh82ul60up99pvanoar2p';

export const TOKEN_KEYS = {
  id: 'os3_id_token',
  access: 'os3_access_token',
  refresh: 'os3_refresh_token',
  user: 'os3_user',
} as const;
