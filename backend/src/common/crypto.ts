import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Response } from 'express';
import type { RoleCode } from '../shared/index.js';
import { env } from '../config/env.js';

export const ACCESS_COOKIE_NAME = 'optronix_access_token';
export const REFRESH_COOKIE_NAME = 'optronix_refresh_token';

export interface AccessTokenPayload {
  sub: string;
  role: RoleCode;
  tv: number;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  tv: number;
  remember: boolean;
  type: 'refresh';
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  const fullPayload: AccessTokenPayload = { ...payload, type: 'access' };
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(fullPayload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type'>,
): string {
  const fullPayload: RefreshTokenPayload = { ...payload, type: 'refresh' };
  const expiresIn = payload.remember
    ? env.JWT_REMEMBER_EXPIRES_IN
    : env.JWT_REFRESH_EXPIRES_IN;
  const options: SignOptions = {
    expiresIn: expiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(fullPayload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  remember = false,
): void {
  const isSecure = env.COOKIE_SECURE || env.NODE_ENV === 'production';
  const accessMaxAgeMs = 15 * 60 * 1000;
  const refreshMaxAgeMs = remember
    ? 30 * 24 * 60 * 60 * 1000
    : 7 * 24 * 60 * 60 * 1000;

  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: accessMaxAgeMs,
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: refreshMaxAgeMs,
  });
}

export function clearAuthCookies(res: Response): void {
  const isSecure = env.COOKIE_SECURE || env.NODE_ENV === 'production';
  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
  });
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/api/v1/auth',
  });
}
