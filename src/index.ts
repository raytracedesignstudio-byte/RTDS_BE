import "dotenv/config";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import bcryptjs from "bcryptjs";
import nodemailer from "nodemailer";
import { createCloudinaryUploadConfig } from "./lib/cloudinary.js";
import {
  db,
  initDatabase,
  closeDatabase,
  nextId,
  readDb,
  writeDb,
} from "./lib/store.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger-new.js";
import {
  addProjectImageSchema,
  applySchema,
  contactFormSchema,
  createProjectSchema,
  createVacancySchema,
  createVerticalSchema,
  loginSchema,
  updateFeaturedProjectsSchema,
  updateProjectSchema,
  updateSiteProfileSchema,
  updateTeamMembersSchema,
  updateVacancySchema,
  updateVerticalCoversSchema,
  updateVerticalSchema,
  validateRequest,
} from "./lib/validation.js";

// =============================================================================
// APPLICATION SETUP
// =============================================================================

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Extract validated environment config
const PORT = env.PORT;
const FRONTEND_ORIGINS = (env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());
const ADMIN_EMAIL = env.ADMIN_EMAIL || "";
const JWT_SECRET = env.JWT_SECRET || randomUUID();
const ADMIN_SESSION_TTL =
  (env.ADMIN_SESSION_TTL as SignOptions["expiresIn"] | undefined) || "12h";

// Warn if admin auth is not configured
if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.JWT_SECRET) {
  logger.warn(
    "⚠️  Admin authentication not fully configured. Public API is available, but admin login will be unavailable until ADMIN_EMAIL, ADMIN_PASSWORD, and JWT_SECRET are properly configured."
  );
}

const RESERVED_PATHS = new Set([
  "/",
  "/about",
  "/projects",
  "/careers",
  "/contact",
  "/admin",
]);

// =============================================================================
// CORS CONFIGURATION
// =============================================================================
// IMPORTANT FIX #1: Dynamic CORS origins from env
// Now accepts multiple origins (important for dev where port may drift)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, CURL requests)
      if (!origin) {
        return callback(null, true);
      }

      if (FRONTEND_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn("CORS request from unauthorized origin", { origin });
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true, // Important for httpOnly cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
  }),
);

function getRequestId(req: Request): string {
  return (req as Request & { requestId?: string }).requestId || "unknown";
}

app.use((req, res, next) => {
  const incomingRequestId = req.header("x-request-id");
  const requestId =
    incomingRequestId && incomingRequestId.trim().length > 0
      ? incomingRequestId.trim()
      : randomUUID();

  (req as Request & { requestId: string }).requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// =============================================================================
// REQUEST LOGGING MIDDLEWARE
// =============================================================================
app.use((req, res, next) => {
  const requestId = getRequestId(req);
  const startedAt = process.hrtime.bigint();

  logger.debug(`${req.method} ${req.path}`, {
    requestId,
    origin: req.get("origin"),
    contentType: req.get("content-type"),
    userAgent: req.get("user-agent"),
    ip: req.ip,
  });

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info("Request completed", {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    });
  });

  next();
});

// =============================================================================
// AUTHENTICATION HELPERS
// =============================================================================

/**
 * IMPORTANT FIX #3: Extract JWT from Authorization header
 * Supports Bearer token format: "Bearer <token>"
 */
function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice("Bearer ".length);
}

/**
 * IMPORTANT FIX #2: Authentication middleware with improved error handling
 * Validates JWT token from Authorization header
 */
function isAdminJwtPayload(payload: unknown): payload is JwtPayload & {
  sub: string;
  email: string;
  role: "admin";
} {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const value = payload as Record<string, unknown>;
  return (
    typeof value.sub === "string" &&
    typeof value.email === "string" &&
    value.role === "admin"
  );
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    logger.warn("Unauthorized request - no token provided", {
      path: req.path,
      method: req.method,
    });
    res.status(401).json({
      error: "Unauthorized",
      message: "No authorization token provided",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!isAdminJwtPayload(decoded)) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token payload",
      });
      return;
    }

    const db = await readDb();
    const admin = db.admins.find(
      (item) =>
        String(item.id) === decoded.sub &&
        item.email.toLowerCase() === decoded.email.toLowerCase() &&
        item.isActive,
    );

    if (!admin) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Admin account not found or inactive",
      });
      return;
    }

    res.locals.admin = {
      id: admin.id,
      email: admin.email,
    };
    next();
  } catch (error) {
    logger.warn("Unauthorized request - invalid token", {
      path: req.path,
      error: error instanceof Error ? error.message : "unknown",
    });
    res.status(401).json({
      error: "Unauthorized",
      message:
        error instanceof Error && error.message === "jwt expired"
          ? "Token expired"
          : "Invalid token",
    });
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePath(input: string): string {
  const trimmed = input.trim();
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

type ValidationError = { field: string; message: string };

function respondValidationError(
  res: Response,
  errors: ValidationError[],
  message = "Request validation failed",
) {
  res.status(400).json({
    error: "ValidationError",
    message,
    details: errors,
  });
}

function parseBody<T>(
  schema: Parameters<typeof validateRequest<T>>[0],
  body: unknown,
  res: Response,
): T | null {
  const parsed = validateRequest(schema, body) as
    | { success: true; data: T }
    | { success: false; errors?: ValidationError[] };
  if (!parsed.success) {
    respondValidationError(res, parsed.errors || []);
    return null;
  }
  return parsed.data;
}

function parseIdParam(
  value: string | string[] | undefined,
  res: Response,
  name = "id",
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({
      error: "ValidationError",
      message: `${name} must be a positive integer`,
    });
    return null;
  }
  return id;
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get("/api/healthz", (req, res) => {
  const requestId = getRequestId(req);

  let databaseStatus: "up" | "down" = "up";
  let databaseError: string | null = null;

  try {
    db.prepare("SELECT 1 as ok").get();
  } catch (error) {
    databaseStatus = "down";
    databaseError = error instanceof Error ? error.message : "Unknown DB error";
  }

  const gmailConfigured = Boolean(
    process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD,
  );
  const cloudinaryConfigured = Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
  );

  const overallStatus = databaseStatus === "up" ? "ok" : "degraded";
  const statusCode = overallStatus === "ok" ? 200 : 503;

  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    requestId,
    dependencies: {
      database: {
        status: databaseStatus,
        error: databaseError,
      },
      email: {
        status: gmailConfigured ? "configured" : "not_configured",
      },
      mediaStorage: {
        status: cloudinaryConfigured ? "configured" : "not_configured",
      },
    },
  });
});

// =============================================================================
// AUTHENTICATION ROUTES
// =============================================================================

async function handleAdminLogin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = parseBody(loginSchema, req.body, res);
    if (!body) {
      return;
    }
    const { email, password } = body;

    const normalizedEmail = email.trim().toLowerCase();
    const db = await readDb();
    const admin = db.admins.find(
      (item) => item.email.toLowerCase() === normalizedEmail && item.isActive,
    );

    if (!admin) {
      logger.warn("Login attempt with unknown admin email", {
        email: normalizedEmail,
      });
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
      return;
    }

    const isPasswordValid = await bcryptjs.compare(
      password,
      admin.passwordHash,
    );

    if (!isPasswordValid) {
      logger.warn("Login attempt with invalid password", {
        email: normalizedEmail,
      });
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
      return;
    }

    const token = jwt.sign({ email: admin.email, role: "admin" }, JWT_SECRET, {
      subject: String(admin.id),
      expiresIn: ADMIN_SESSION_TTL,
    });

    admin.lastLoginAt = new Date().toISOString();
    admin.updatedAt = admin.lastLoginAt;
    await writeDb(db);

    logger.info("Successful admin login", {
      adminId: admin.id,
      email: admin.email,
    });

    res.json({
      success: true,
      token,
      expiresIn: ADMIN_SESSION_TTL,
    });
  } catch (error) {
    next(error);
  }
}

app.post("/api/admin/login", handleAdminLogin);

// =============================================================================
// VACANCIES API
// =============================================================================

app.get("/api/vacancies", requireAdmin, async (_req, res) => {
  const db = await readDb();
  res.json(db.vacancies.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
});

app.get("/api/vacancies/active", async (_req, res) => {
  const db = await readDb();
  res.json(
    db.vacancies
      .filter((v) => v.active)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
});

app.post("/api/vacancies", requireAdmin, async (req, res) => {
  const body = parseBody(createVacancySchema, req.body, res);
  if (!body) {
    return;
  }
  const { title, department, location, type, description, active } = body;

  const db = await readDb();
  const vacancy = {
    id: nextId(db.vacancies),
    title: String(title),
    department: String(department),
    location: String(location),
    type: type ? String(type) : "Full-time",
    description: description ? String(description) : null,
    active: typeof active === "boolean" ? active : true,
    createdAt: new Date().toISOString(),
  };
  db.vacancies.push(vacancy);
  await writeDb(db);
  res.json(vacancy);
});

app.put("/api/vacancies/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) {
    return;
  }

  const body = parseBody(updateVacancySchema, req.body, res);
  if (!body) {
    return;
  }

  const db = await readDb();
  const vacancy = db.vacancies.find((v) => v.id === id);
  if (!vacancy) {
    res.status(404).json({ error: "Vacancy not found" });
    return;
  }

  const { title, department, location, type, description, active } = body;
  if (title !== undefined) vacancy.title = String(title);
  if (department !== undefined) vacancy.department = String(department);
  if (location !== undefined) vacancy.location = String(location);
  if (type !== undefined) vacancy.type = String(type);
  if (description !== undefined)
    vacancy.description = description ? String(description) : null;
  if (active !== undefined) vacancy.active = Boolean(active);

  await writeDb(db);
  res.json(vacancy);
});

app.delete("/api/vacancies/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) {
    return;
  }
  const db = await readDb();
  db.vacancies = db.vacancies.filter((v) => v.id !== id);
  await writeDb(db);
  res.json({ success: true });
});

app.get("/api/projects/public", async (_req, res) => {
  const db = await readDb();
  const projects = db.projects
    .filter((p) => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((project) => ({
      ...project,
      galleryImages: db.projectImages
        .filter((img) => img.projectId === project.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  res.json(projects);
});

app.get("/api/verticals/public", async (_req, res) => {
  const db = await readDb();
  const verticals = db.verticals
    .filter((v) => v.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((vertical) => ({
      ...vertical,
      services: db.verticalServices
        .filter((service) => service.verticalId === vertical.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((service) => service.service),
    }));
  res.json(verticals);
});

app.get("/api/admin/verticals", requireAdmin, async (_req, res) => {
  const db = await readDb();
  const verticals = db.verticals
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((vertical) => ({
      ...vertical,
      services: db.verticalServices
        .filter((service) => service.verticalId === vertical.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((service) => service.service),
    }));
  res.json(verticals);
});

app.post("/api/admin/verticals", requireAdmin, async (req, res) => {
  const body = parseBody(createVerticalSchema, req.body, res);
  if (!body) {
    return;
  }
  const { slug, title, description, image, path, services, active } = body;

  const normalizedSlug = slugify(String(slug || title));
  if (!normalizedSlug) {
    res.status(400).json({ error: "A valid slug is required" });
    return;
  }

  const normalizedPath = normalizePath(
    String(path || `/vertical/${normalizedSlug}`),
  );
  if (RESERVED_PATHS.has(normalizedPath)) {
    res.status(400).json({ error: "This path is reserved" });
    return;
  }

  const parsedServices = Array.isArray(services)
    ? services
        .map((service) => String(service).trim())
        .filter((service) => service.length > 0)
    : [];

  const db = await readDb();
  if (db.verticals.some((v) => v.slug === normalizedSlug)) {
    res.status(409).json({ error: "Slug already exists" });
    return;
  }
  if (db.verticals.some((v) => v.path === normalizedPath)) {
    res.status(409).json({ error: "Path already exists" });
    return;
  }

  const now = new Date().toISOString();
  const verticalId = nextId(db.verticals);
  const vertical = {
    id: verticalId,
    slug: normalizedSlug,
    title: String(title),
    description: String(description),
    image: String(image),
    path: normalizedPath,
    active: typeof active === "boolean" ? active : true,
    sortOrder: db.verticals.length,
    createdAt: now,
    updatedAt: now,
  };

  db.verticals.push(vertical);
  db.verticalServices.push(
    ...parsedServices.map((service, index) => ({
      id: nextId(db.verticalServices) + index,
      verticalId,
      service,
      sortOrder: index,
    })),
  );

  db.verticalCovers.push({
    id: nextId(db.verticalCovers),
    verticalId: vertical.slug,
    image: vertical.image,
    updatedAt: now,
  });

  await writeDb(db);
  res.status(201).json({ ...vertical, services: parsedServices });
});

app.put("/api/admin/verticals/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) {
    return;
  }

  const body = parseBody(updateVerticalSchema, req.body, res);
  if (!body) {
    return;
  }

  const db = await readDb();
  const vertical = db.verticals.find((v) => v.id === id);
  if (!vertical) {
    res.status(404).json({ error: "Vertical not found" });
    return;
  }

  const { title, description, image, path, services, active } = body;

  if (title !== undefined) vertical.title = String(title);
  if (description !== undefined) vertical.description = String(description);
  if (image !== undefined) vertical.image = String(image);
  if (active !== undefined) vertical.active = Boolean(active);

  if (path !== undefined) {
    const normalizedPath = normalizePath(String(path));
    if (RESERVED_PATHS.has(normalizedPath)) {
      res.status(400).json({ error: "This path is reserved" });
      return;
    }
    const conflict = db.verticals.some(
      (v) => v.id !== id && v.path === normalizedPath,
    );
    if (conflict) {
      res.status(409).json({ error: "Path already exists" });
      return;
    }
    vertical.path = normalizedPath;
  }

  if (Array.isArray(services)) {
    const parsedServices = services
      .map((service) => String(service).trim())
      .filter((service) => service.length > 0);
    db.verticalServices = db.verticalServices.filter(
      (service) => service.verticalId !== id,
    );
    const firstId = nextId(db.verticalServices);
    db.verticalServices.push(
      ...parsedServices.map((service, index) => ({
        id: firstId + index,
        verticalId: id,
        service,
        sortOrder: index,
      })),
    );
  }

  const cover = db.verticalCovers.find((c) => c.verticalId === vertical.slug);
  if (cover && image !== undefined) {
    cover.image = String(image);
    cover.updatedAt = new Date().toISOString();
  }

  vertical.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.json({
    ...vertical,
    services: db.verticalServices
      .filter((service) => service.verticalId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((service) => service.service),
  });
});

app.delete("/api/admin/verticals/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) {
    return;
  }
  const db = await readDb();
  const vertical = db.verticals.find((v) => v.id === id);
  if (!vertical) {
    res.status(404).json({ error: "Vertical not found" });
    return;
  }

  db.verticals = db.verticals.filter((v) => v.id !== id);
  db.verticalServices = db.verticalServices.filter(
    (service) => service.verticalId !== id,
  );
  db.verticalCovers = db.verticalCovers.filter(
    (cover) => cover.verticalId !== vertical.slug,
  );
  await writeDb(db);
  res.json({ success: true });
});

app.get("/api/admin/projects", requireAdmin, async (_req, res) => {
  const db = await readDb();
  const projects = db.projects
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((project) => ({
      ...project,
      galleryImages: db.projectImages
        .filter((img) => img.projectId === project.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  res.json(projects);
});

app.post("/api/admin/projects", requireAdmin, async (req, res) => {
  const body = parseBody(createProjectSchema, req.body, res);
  if (!body) {
    return;
  }
  const {
    slug,
    title,
    location,
    category,
    description,
    heroImage,
    year,
    status,
    verticalSlug,
    sortOrder,
    active,
  } = body;

  const db = await readDb();
  const normalizedVerticalSlug = verticalSlug ? String(verticalSlug) : null;
  if (
    normalizedVerticalSlug &&
    !db.verticals.some((vertical) => vertical.slug === normalizedVerticalSlug)
  ) {
    res.status(400).json({ error: "Invalid verticalSlug" });
    return;
  }
  const now = new Date().toISOString();
  const project = {
    id: nextId(db.projects),
    slug: String(slug),
    title: String(title),
    location: String(location),
    category: String(category),
    description: String(description),
    heroImage: String(heroImage),
    year: year ? String(year) : null,
    status: status ? String(status) : null,
    verticalSlug: normalizedVerticalSlug,
    sortOrder: typeof sortOrder === "number" ? sortOrder : db.projects.length,
    active: typeof active === "boolean" ? active : true,
    createdAt: now,
    updatedAt: now,
  };
  db.projects.push(project);
  await writeDb(db);
  res.json(project);
});

app.put("/api/admin/projects/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) {
    return;
  }

  const body = parseBody(updateProjectSchema, req.body, res);
  if (!body) {
    return;
  }

  const db = await readDb();
  const project = db.projects.find((p) => p.id === id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const {
    slug,
    title,
    location,
    category,
    description,
    heroImage,
    year,
    status,
    verticalSlug,
    sortOrder,
    active,
  } = body;
  if (verticalSlug !== undefined) {
    const normalizedVerticalSlug = verticalSlug ? String(verticalSlug) : null;
    if (
      normalizedVerticalSlug &&
      !db.verticals.some((vertical) => vertical.slug === normalizedVerticalSlug)
    ) {
      res.status(400).json({ error: "Invalid verticalSlug" });
      return;
    }
    project.verticalSlug = normalizedVerticalSlug;
  }
  if (slug !== undefined) project.slug = String(slug);
  if (title !== undefined) project.title = String(title);
  if (location !== undefined) project.location = String(location);
  if (category !== undefined) project.category = String(category);
  if (description !== undefined) project.description = String(description);
  if (heroImage !== undefined) project.heroImage = String(heroImage);
  if (year !== undefined) project.year = year ? String(year) : null;
  if (status !== undefined) project.status = status ? String(status) : null;
  if (sortOrder !== undefined) project.sortOrder = Number(sortOrder);
  if (active !== undefined) project.active = Boolean(active);
  project.updatedAt = new Date().toISOString();

  await writeDb(db);
  res.json(project);
});

app.delete("/api/admin/projects/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) {
    return;
  }
  const db = await readDb();
  db.projects = db.projects.filter((p) => p.id !== id);
  db.projectImages = db.projectImages.filter((img) => img.projectId !== id);
  await writeDb(db);
  res.json({ success: true });
});

app.post("/api/admin/projects/:id/images", requireAdmin, async (req, res) => {
  const projectId = parseIdParam(req.params.id, res, "projectId");
  if (!projectId) {
    return;
  }

  const body = parseBody(addProjectImageSchema, req.body, res);
  if (!body) {
    return;
  }

  const { imageUrl, caption, sortOrder } = body;
  const db = await readDb();
  const image = {
    id: nextId(db.projectImages),
    projectId,
    imageUrl: String(imageUrl),
    caption: caption ? String(caption) : null,
    sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
  };
  db.projectImages.push(image);
  await writeDb(db);
  res.json(image);
});

app.delete(
  "/api/admin/projects/:projectId/images/:imageId",
  requireAdmin,
  async (req, res) => {
    const imageId = parseIdParam(req.params.imageId, res, "imageId");
    if (!imageId) {
      return;
    }
    const db = await readDb();
    db.projectImages = db.projectImages.filter((img) => img.id !== imageId);
    await writeDb(db);
    res.json({ success: true });
  },
);

app.get("/api/site-settings/public", async (_req, res) => {
  const db = await readDb();
  res.json({
    team:
      db.teamMembers.length > 0
        ? db.teamMembers.sort((a, b) => a.sortOrder - b.sortOrder)
        : null,
    verticalCovers:
      db.verticalCovers.length > 0
        ? Object.fromEntries(
            db.verticalCovers.map((c) => [c.verticalId, c.image]),
          )
        : null,
    featuredSlugs:
      db.featuredProjects.length > 0
        ? db.featuredProjects
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((x) => x.projectSlug)
        : null,
    profile: db.siteProfile,
  });
});

app.get("/api/admin/site-profile", requireAdmin, async (_req, res) => {
  const db = await readDb();
  res.json(db.siteProfile);
});

app.put("/api/admin/site-profile", requireAdmin, async (req, res) => {
  const body = parseBody(updateSiteProfileSchema, req.body, res);
  if (!body) {
    return;
  }
  const {
    contactEmail,
    contactPhone,
    contactPhoneLabel,
    instagramUrl,
    linkedinUrl,
    officeName,
    officeFloor,
    officeAddress,
    mapsEmbedUrl,
    mapsDirectionsUrl,
  } = body;

  const db = await readDb();
  db.siteProfile = {
    id: 1,
    contactEmail: String(contactEmail),
    contactPhone: String(contactPhone),
    contactPhoneLabel: contactPhoneLabel ? String(contactPhoneLabel) : null,
    instagramUrl: instagramUrl ? String(instagramUrl) : null,
    linkedinUrl: linkedinUrl ? String(linkedinUrl) : null,
    officeName: String(officeName),
    officeFloor: officeFloor ? String(officeFloor) : null,
    officeAddress: String(officeAddress),
    mapsEmbedUrl: mapsEmbedUrl ? String(mapsEmbedUrl) : null,
    mapsDirectionsUrl: mapsDirectionsUrl ? String(mapsDirectionsUrl) : null,
  };

  await writeDb(db);
  res.json(db.siteProfile);
});

app.get("/api/admin/team-members", requireAdmin, async (_req, res) => {
  const db = await readDb();
  res.json(db.teamMembers.sort((a, b) => a.sortOrder - b.sortOrder));
});

app.put("/api/admin/team-members", requireAdmin, async (req, res) => {
  const body = parseBody(updateTeamMembersSchema, req.body, res);
  if (!body) {
    return;
  }
  const { members } = body;
  const db = await readDb();
  db.teamMembers = members.map((member, index) => ({
    id: index + 1,
    name: member.name,
    role: member.role,
    image: member.image,
    sortOrder: index,
  }));
  await writeDb(db);
  res.json(db.teamMembers);
});

app.get("/api/admin/vertical-covers", requireAdmin, async (_req, res) => {
  const db = await readDb();
  res.json(db.verticalCovers);
});

app.put("/api/admin/vertical-covers", requireAdmin, async (req, res) => {
  const body = parseBody(updateVerticalCoversSchema, req.body, res);
  if (!body) {
    return;
  }
  const { covers } = body;

  const db = await readDb();
  db.verticalCovers = covers.map((cover, index) => ({
    id: index + 1,
    verticalId: cover.verticalId,
    image: cover.image,
    updatedAt: new Date().toISOString(),
  }));
  await writeDb(db);
  res.json(db.verticalCovers);
});

app.get("/api/admin/featured-projects", requireAdmin, async (_req, res) => {
  const db = await readDb();
  res.json(db.featuredProjects.sort((a, b) => a.sortOrder - b.sortOrder));
});

app.put("/api/admin/featured-projects", requireAdmin, async (req, res) => {
  const body = parseBody(updateFeaturedProjectsSchema, req.body, res);
  if (!body) {
    return;
  }
  const { slugs } = body;

  const db = await readDb();
  db.featuredProjects = slugs.map((slug, index) => ({
    id: index + 1,
    projectSlug: slug,
    sortOrder: index,
  }));
  await writeDb(db);
  res.json(db.featuredProjects);
});

app.post("/api/storage/uploads/request-url", requireAdmin, (_req, res) => {
  res.json(createCloudinaryUploadConfig());
});

app.get("/api/storage/public-objects/*path", (_req, res) => {
  res.status(404).json({ error: "File not found" });
});

app.get("/api/storage/objects/*path", (_req, res) => {
  res.status(404).json({ error: "Object not found" });
});

function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return null;
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

app.post("/api/apply", upload.single("resume"), async (req, res) => {
  const body = parseBody(applySchema, req.body, res);
  if (!body) {
    return;
  }
  const { name, age, phone, email, role } = body;

  const transporter = getTransporter();
  if (!transporter) {
    res.json({
      success: true,
      message: "Application accepted (email disabled in local mode)",
    });
    return;
  }

  try {
    await transporter.sendMail({
      from: `"RayTrace Careers" <${process.env.GMAIL_USER}>`,
      to: process.env.CONTACT_TO || process.env.GMAIL_USER,
      subject: `Job Application: ${role} - ${name}`,
      html: `<h2>New Job Application</h2><p><b>Name:</b> ${name}</p><p><b>Age:</b> ${age || "-"}</p><p><b>Phone:</b> ${phone}</p><p><b>Email:</b> ${email}</p><p><b>Role:</b> ${role}</p>`,
      attachments: req.file
        ? [{ filename: req.file.originalname, content: req.file.buffer }]
        : [],
    });

    res.json({ success: true, message: "Application submitted successfully" });
  } catch (error) {
    logger.warn("Job application email delivery failed", {
      requestId: getRequestId(req),
      error: error instanceof Error ? error.message : String(error),
    });

    if (process.env.NODE_ENV !== "production") {
      res.json({
        success: true,
        message: "Application accepted (email delivery failed in local mode)",
      });
      return;
    }

    throw error;
  }
});

app.post("/api/contact", async (req, res) => {
  const body = parseBody(contactFormSchema, req.body, res);
  if (!body) {
    return;
  }
  const { name, email, message } = body;

  const transporter = getTransporter();
  if (!transporter) {
    res.json({
      success: true,
      message: "Message accepted (email disabled in local mode)",
    });
    return;
  }

  try {
    await transporter.sendMail({
      from: `"RayTrace Website" <${process.env.GMAIL_USER}>`,
      to: process.env.CONTACT_TO || process.env.GMAIL_USER,
      replyTo: email,
      subject: `Request to Contact - ${name}`,
      html: `<h2>New Contact Request</h2><p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Message:</b><br/>${message}</p>`,
    });

    res.json({ success: true, message: "Message sent successfully" });
  } catch (error) {
    logger.warn("Contact email delivery failed", {
      requestId: getRequestId(req),
      error: error instanceof Error ? error.message : String(error),
    });

    if (process.env.NODE_ENV !== "production") {
      res.json({
        success: true,
        message: "Message accepted (email delivery failed in local mode)",
      });
      return;
    }

    throw error;
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: "NotFound",
    message: `No route matches ${req.method} ${req.path}`,
    requestId: getRequestId(req),
  });
});

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = getRequestId(req);

  if (
    error instanceof SyntaxError &&
    "status" in error &&
    (error as { status?: number }).status === 400
  ) {
    res.status(400).json({
      error: "ValidationError",
      message: "Malformed JSON payload",
      requestId,
    });
    return;
  }

  logger.error(
    "Unhandled server error",
    error instanceof Error ? error : undefined,
    {
      requestId,
      method: req.method,
      path: req.path,
    },
  );
  res.status(500).json({
    error: "InternalServerError",
    message: "An unexpected error occurred",
    requestId,
  });
});

async function start() {
  await initDatabase();
  const server = app.listen(PORT, () => {
    logger.info(`raytrace-be listening on http://localhost:${PORT}`);
  });

  // Graceful shutdown handlers
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info("Server closed");
      closeDatabase();
      logger.info("Database closed");
      process.exit(0);
    });

    // Force exit after 30 seconds
    setTimeout(() => {
      logger.error("Forced shutdown after 30 seconds");
      closeDatabase();
      process.exit(1);
    }, 30_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void start();
