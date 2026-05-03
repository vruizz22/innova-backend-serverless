export const LOCAL_AUTH_ISSUER =
  process.env['LOCAL_AUTH_ISSUER'] ?? 'innova-local-auth';
export const LOCAL_AUTH_ACCESS_SECRET =
  process.env['LOCAL_AUTH_ACCESS_SECRET'] ?? 'innova-local-access-secret';
export const LOCAL_AUTH_REFRESH_SECRET =
  process.env['LOCAL_AUTH_REFRESH_SECRET'] ?? 'innova-local-refresh-secret';
export const LOCAL_AUTH_RESET_SECRET =
  process.env['LOCAL_AUTH_RESET_SECRET'] ?? 'innova-local-reset-secret';
export const LOCAL_AUTH_ACCESS_TTL = '60m';
export const LOCAL_AUTH_REFRESH_TTL = '5d';
export const LOCAL_AUTH_RESET_TTL = '15m';
