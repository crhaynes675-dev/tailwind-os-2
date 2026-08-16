// Backend wiring. Values come from the environment so a developer can point a
// local build at a non-production API without editing tracked source.
//
// The fallbacks are the live production values: a build with no .env behaves
// exactly as it did before, so existing deploys are unaffected. Set the
// VITE_* vars (see .env.example) to target anything else.
//
// None of these are secrets — the Cognito client ID is public by design and
// the API is authenticated per-request.
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? 'https://92hhz60r9e.execute-api.us-east-1.amazonaws.com/prod';
export const COGNITO_URL =
  import.meta.env.VITE_COGNITO_URL ?? 'https://cognito-idp.us-east-1.amazonaws.com/';
export const CLIENT_ID =
  import.meta.env.VITE_COGNITO_CLIENT_ID ?? 'gikbjh82ul60up99pvanoar2p';

/** Shown in the UI when running against anything other than production. */
export const ENV_NAME = import.meta.env.VITE_ENV_NAME ?? '';
export const IS_PRODUCTION = !ENV_NAME || ENV_NAME === 'production';

export const TOKEN_KEYS = {
  id: 'os3_id_token',
  access: 'os3_access_token',
  refresh: 'os3_refresh_token',
  user: 'os3_user',
} as const;
