// Backend wiring — reuses the existing Tailwind OS AWS backend.
export const API_BASE = 'https://tshd22yk1l.execute-api.us-east-1.amazonaws.com/prod';
export const COGNITO_URL = 'https://cognito-idp.us-east-1.amazonaws.com/';
export const CLIENT_ID = 'gikbjh82ul60up99pvanoar2p';

export const TOKEN_KEYS = {
  id: 'os3_id_token',
  access: 'os3_access_token',
  refresh: 'os3_refresh_token',
  user: 'os3_user',
} as const;
