export function readAnalyticsEnabled(
  environment: Partial<Pick<
    NodeJS.ProcessEnv,
    'NODE_ENV' | 'SNICKERDOODLE_ANALYTICS_ENABLED'
  >> = process.env
) {
  return environment.NODE_ENV === 'production'
    && environment.SNICKERDOODLE_ANALYTICS_ENABLED === 'true';
}
