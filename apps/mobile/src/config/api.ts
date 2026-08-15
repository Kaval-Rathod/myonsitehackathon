export const getApiUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  throw new Error('EXPO_PUBLIC_API_URL environment variable is not defined. Must be configured for the backend URL.');
};
