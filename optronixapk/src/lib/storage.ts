import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'optronix_mobile_access_token';
const REFRESH_TOKEN_KEY = 'optronix_mobile_refresh_token';
const API_BASE_URL_KEY = 'optronix_mobile_api_url';
const OFFLINE_QUEUE_KEY = 'optronix_mobile_offline_visits';

const memoryFallback = new Map<string, string>();

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      memoryFallback.set(key, value);
      return;
    }
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    memoryFallback.set(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return window.localStorage.getItem(key) ?? memoryFallback.get(key) ?? null;
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  }
  try {
    return (await SecureStore.getItemAsync(key)) ?? memoryFallback.get(key) ?? null;
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

async function deleteItem(key: string): Promise<void> {
  memoryFallback.delete(key);
  if (Platform.OS === 'web') {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore web storage restrictions
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore native keystore error
  }
}

export async function saveTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await Promise.all([
    setItem(ACCESS_TOKEN_KEY, accessToken),
    setItem(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

export async function loadTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const [accessToken, refreshToken] = await Promise.all([
    getItem(ACCESS_TOKEN_KEY),
    getItem(REFRESH_TOKEN_KEY),
  ]);
  return { accessToken, refreshToken };
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    deleteItem(ACCESS_TOKEN_KEY),
    deleteItem(REFRESH_TOKEN_KEY),
  ]);
}

export function getDefaultApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  if (Platform.OS === 'android') {
    // 10.0.2.2 maps Android Emulator directly to host localhost:4000
    return 'http://10.0.2.2:4000/api/v1';
  }
  return 'http://localhost:4000/api/v1';
}

export async function loadSavedApiBaseUrl(): Promise<string> {
  const saved = await getItem(API_BASE_URL_KEY);
  return saved?.trim() ? saved.trim().replace(/\/+$/, '') : getDefaultApiBaseUrl();
}

export async function saveApiBaseUrl(url: string): Promise<string> {
  const cleaned = url.trim().replace(/\/+$/, '') || getDefaultApiBaseUrl();
  await setItem(API_BASE_URL_KEY, cleaned);
  return cleaned;
}

export interface MobileQueuedVisit {
  id: string;
  meetingId: string;
  action: 'check-in' | 'check-out';
  payload: Record<string, unknown>;
}

export async function loadMobileOfflineQueue(): Promise<MobileQueuedVisit[]> {
  const raw = await getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MobileQueuedVisit[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveMobileOfflineQueue(
  items: MobileQueuedVisit[],
): Promise<void> {
  await setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
}
