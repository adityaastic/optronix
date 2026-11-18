import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const DEV_ACCESS_FALLBACK = 'optronix-dev-jwt-access-secret-key-2026-secure';
const DEV_REFRESH_FALLBACK = 'optronix-dev-jwt-refresh-secret-key-2026-secure';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z
      .string()
      .min(10)
      .default('mongodb://127.0.0.1:27017/optronix'),
    JWT_ACCESS_SECRET: z.string().min(16).default(DEV_ACCESS_FALLBACK),
    JWT_REFRESH_SECRET: z.string().min(16).default(DEV_REFRESH_FALLBACK),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    JWT_REMEMBER_EXPIRES_IN: z.string().default('30d'),
    COOKIE_SECURE: z
      .string()
      .optional()
      .transform((v) =>
        v === undefined || v.trim() === '' ? undefined : v.trim() === 'true',
      ),
    CORS_ORIGIN: z
      .string()
      .default(
        'http://localhost:3000,http://localhost:8081,http://127.0.0.1:8081',
      ),
    APP_WEB_URL: z.string().default('http://localhost:3000'),
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    SMTP_FROM_NAME: z.string().default('Optronix Operations'),
    ENFORCE_MANAGER_REOPEN_PIN: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    DEFAULT_GEOFENCE_RADIUS_METERS: z.coerce
      .number()
      .int()
      .min(25)
      .max(5000)
      .default(100),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production') {
      if (
        val.JWT_ACCESS_SECRET === DEV_ACCESS_FALLBACK ||
        val.JWT_ACCESS_SECRET.includes('change-this')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message:
            'Production requires an explicit, high-entropy JWT_ACCESS_SECRET.',
        });
      }
      if (
        val.JWT_REFRESH_SECRET === DEV_REFRESH_FALLBACK ||
        val.JWT_REFRESH_SECRET.includes('change-this')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message:
            'Production requires an explicit, high-entropy JWT_REFRESH_SECRET.',
        });
      }
    }
  });

export const env = envSchema.parse(process.env);
