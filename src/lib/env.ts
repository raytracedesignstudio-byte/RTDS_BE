import { z } from "zod";

/**
 * Environment validation schema
 * Ensures all required env vars are set with correct types before app starts
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().positive().default(4000),
  FRONTEND_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .refine((value) => {
      const origins = value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

      if (origins.length === 0) {
        return false;
      }

      return origins.every((origin) => {
        if (/^http:\/\/localhost:\d+$/.test(origin)) {
          return true;
        }

        try {
          const parsed = new URL(origin);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      });
    }, "FRONTEND_ORIGIN must be a comma-separated list of valid origins"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000/api"),
  SQLITE_PATH: z.string().default("./data/raytrace.db"),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(6, "Password must be at least 6 characters"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters for security"),
  ADMIN_SESSION_TTL: z.string().default("12h"),
  GMAIL_USER: z.string().email().optional().or(z.literal("")),
  GMAIL_APP_PASSWORD: z.string().optional().or(z.literal("")),
  CONTACT_TO: z.string().email().default("admin@example.com"),
  CLOUDINARY_CLOUD_NAME: z.string().optional().or(z.literal("")),
  CLOUDINARY_API_KEY: z.string().optional().or(z.literal("")),
  CLOUDINARY_API_SECRET: z.string().optional().or(z.literal("")),
  CLOUDINARY_FOLDER: z.string().default("raytrace"),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates environment variables at startup
 * Exits with error if validation fails
 */
export function validateEnv(): EnvConfig {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      console.error("❌ Environment validation failed:\n" + issues);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Get validated env config singleton
 */
export const env = validateEnv();
