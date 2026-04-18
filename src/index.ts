// ==============================
// IMPORTS
// ==============================
import "dotenv/config";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
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

// ==============================
// APP SETUP
// ==============================
console.log("🔥 ENTRY FILE EXECUTING...");

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ==============================
// ENV CONFIG
// ==============================
const FRONTEND_ORIGINS = (env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

const JWT_SECRET = env.JWT_SECRET || randomUUID();
const ADMIN_SESSION_TTL =
  (env.ADMIN_SESSION_TTL as SignOptions["expiresIn"]) || "12h";

const RESERVED_PATHS = new Set([
  "/",
  "/about",
  "/projects",
  "/careers",
  "/contact",
  "/admin",
]);

if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.JWT_SECRET) {
  logger.warn(
    "⚠️  Admin auth not fully configured. Set ADMIN_EMAIL, ADMIN_PASSWORD, and JWT_SECRET."
  );
}

// ==============================
// CORS
// ==============================
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (FRONTEND_ORIGINS.includes(origin)) return callback(null, true);
      logger.warn("CORS blocked", { origin });
      callback(new Error("CORS not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
  })
);

// ==============================
// MIDDLEWARE
// ==============================
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use((req, res, next) => {
  const id =
    (req.header("x-request-id") || "").trim() || randomUUID();
  (req as any).requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
});

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info("Request completed", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Number(ms.toFixed(2)),
    });
  });
  next();
});

// ==============================
// HELPERS
// ==============================
function getRequestId(req: Request): string {
  return (req as any).requestId || "unknown";
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
  message = "Request validation failed"
) {
  res.status(400).json({ error: "ValidationError", message, details: errors });
}

function parseBody<T>(
  schema: Parameters<typeof validateRequest<T>>[0],
  body: unknown,
  res: Response
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
  name = "id"
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res
      .status(400)
      .json({ error: "ValidationError", message: `${name} must be a positive integer` });
    return null;
  }
  return id;
}

// ==============================
// AUTH HELPERS
// ==============================
function getToken(req: Request): string | null {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

function isAdminJwtPayload(
  payload: unknown
): payload is JwtPayload & { sub: string; email: string; role: "admin" } {
  if (!payload || typeof payload !== "object") return false;
  const v = payload as Record<string, unknown>;
  return (
    typeof v.sub === "string" &&
    typeof v.email === "string" &&
    v.role === "admin"
  );
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized", message: "No token provided" });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!isAdminJwtPayload(decoded)) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid token payload" });
      return;
    }
    const data = await readDb();
    const admin = data.admins.find(
      (a) =>
        String(a.id) === decoded.sub &&
        a.email.toLowerCase() === decoded.email.toLowerCase() &&
        a.isActive
    );
    if (!admin) {
      res.status(401).json({ error: "Unauthorized", message: "Admin not found or inactive" });
      return;
    }
    res.locals.admin = { id: admin.id, email: admin.email };
    next();
  } catch (error) {
    res.status(401).json({
      error: "Unauthorized",
      message:
        error instanceof Error && error.message === "jwt expired"
          ? "Token expired"
          : "Invalid token",
    });
  }
}

// ==============================
// BASIC ROUTES
// ==============================
app.get("/", (_req, res) => {
  res.send("✅ Backend is live");
});

app.get("/api/healthz", async (_req, res) => {
  let dbStatus: "up" | "down" = "up";
  let dbError: string | null = null;
  try {
    db.prepare("SELECT 1 as ok").get();
  } catch (e) {
    dbStatus = "down";
    dbError = e instanceof Error ? e.message : "Unknown DB error";
  }
  const status = dbStatus === "up" ? "ok" : "degraded";
  res.status(status === "ok" ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    dependencies: {
      database: { status: dbStatus, error: dbError },
      email: {
        status:
          process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
            ? "configured"
            : "not_configured",
      },
      mediaStorage: {
        status:
          env.CLOUDINARY_CLOUD_NAME &&
          env.CLOUDINARY_API_KEY &&
          env.CLOUDINARY_API_SECRET
            ? "configured"
            : "not_configured",
      },
    },
  });
});

// ==============================
// AUTH ROUTES
// ==============================
app.post("/api/admin/login", async (req, res, next) => {
  try {
    const body = parseBody(loginSchema, req.body, res);
    if (!body) return;

    const { email, password } = body as { email: string; password: string };
    const data = await readDb();
    const admin = data.admins.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.isActive
    );

    if (!admin) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    const ok = await bcryptjs.compare(password, admin.passwordHash);
    if (!ok) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { email: admin.email, role: "admin" },
      JWT_SECRET,
      { subject: String(admin.id), expiresIn: ADMIN_SESSION_TTL }
    );

    admin.lastLoginAt = new Date().toISOString();
    admin.updatedAt = admin.lastLoginAt;
    await writeDb(data);

    res.json({ success: true, token, expiresIn: ADMIN_SESSION_TTL });
  } catch (err) {
    next(err);
  }
});

// ==============================
// VACANCIES
// ==============================
app.get("/api/vacancies", requireAdmin, async (_req, res) => {
  const data = await readDb();
  res.json(data.vacancies.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
});

app.get("/api/vacancies/active", async (_req, res) => {
  const data = await readDb();
  res.json(
    data.vacancies
      .filter((v) => v.active)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  );
});

app.post("/api/vacancies", requireAdmin, async (req, res) => {
  const body = parseBody(createVacancySchema, req.body, res);
  if (!body) return;
  const { title, department, location, type, description, active } = body as any;

  const data = await readDb();
  const vacancy = {
    id: nextId(data.vacancies),
    title: String(title),
    department: String(department),
    location: String(location),
    type: type ? String(type) : "Full-time",
    description: description ? String(description) : null,
    active: typeof active === "boolean" ? active : true,
    createdAt: new Date().toISOString(),
  };
  data.vacancies.push(vacancy);
  await writeDb(data);
  res.json(vacancy);
});

app.put("/api/vacancies/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) return;
  const body = parseBody(updateVacancySchema, req.body, res);
  if (!body) return;

  const data = await readDb();
  const vacancy = data.vacancies.find((v) => v.id === id);
  if (!vacancy) {
    res.status(404).json({ error: "Vacancy not found" });
    return;
  }

  const { title, department, location, type, description, active } = body as any;
  if (title !== undefined) vacancy.title = String(title);
  if (department !== undefined) vacancy.department = String(department);
  if (location !== undefined) vacancy.location = String(location);
  if (type !== undefined) vacancy.type = String(type);
  if (description !== undefined)
    vacancy.description = description ? String(description) : null;
  if (active !== undefined) vacancy.active = Boolean(active);

  await writeDb(data);
  res.json(vacancy);
});

app.delete("/api/vacancies/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) return;
  const data = await readDb();
  data.vacancies = data.vacancies.filter((v) => v.id !== id);
  await writeDb(data);
  res.json({ success: true });
});

// ==============================
// PUBLIC PROJECTS & VERTICALS
// ==============================
app.get("/api/projects/public", async (_req, res) => {
  const data = await readDb();
  const projects = data.projects
    .filter((p) => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((project) => ({
      ...project,
      galleryImages: data.projectImages
        .filter((img) => img.projectId === project.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  res.json(projects);
});

app.get("/api/verticals/public", async (_req, res) => {
  const data = await readDb();
  const verticals = data.verticals
    .filter((v) => v.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((vertical) => ({
      ...vertical,
      services: data.verticalServices
        .filter((s) => s.verticalId === vertical.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => s.service),
    }));
  res.json(verticals);
});

// ==============================
// ADMIN VERTICALS
// ==============================
app.get("/api/admin/verticals", requireAdmin, async (_req, res) => {
  const data = await readDb();
  const verticals = data.verticals
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((vertical) => ({
      ...vertical,
      services: data.verticalServices
        .filter((s) => s.verticalId === vertical.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => s.service),
    }));
  res.json(verticals);
});

app.post("/api/admin/verticals", requireAdmin, async (req, res) => {
  const body = parseBody(createVerticalSchema, req.body, res);
  if (!body) return;
  const { slug, title, description, image, path, services, active } = body as any;

  const normalizedSlug = slugify(String(slug || title));
  if (!normalizedSlug) {
    res.status(400).json({ error: "A valid slug is required" });
    return;
  }

  const normalizedPath = normalizePath(String(path || `/vertical/${normalizedSlug}`));
  if (RESERVED_PATHS.has(normalizedPath)) {
    res.status(400).json({ error: "This path is reserved" });
    return;
  }

  const parsedServices = Array.isArray(services)
    ? services.map((s: any) => String(s).trim()).filter((s: string) => s.length > 0)
    : [];

  const data = await readDb();
  if (data.verticals.some((v) => v.slug === normalizedSlug)) {
    res.status(409).json({ error: "Slug already exists" });
    return;
  }
  if (data.verticals.some((v) => v.path === normalizedPath)) {
    res.status(409).json({ error: "Path already exists" });
    return;
  }

  const now = new Date().toISOString();
  const verticalId = nextId(data.verticals);
  const vertical = {
    id: verticalId,
    slug: normalizedSlug,
    title: String(title),
    description: String(description),
    image: String(image),
    path: normalizedPath,
    active: typeof active === "boolean" ? active : true,
    sortOrder: data.verticals.length,
    createdAt: now,
    updatedAt: now,
  };

  data.verticals.push(vertical);
  data.verticalServices.push(
    ...parsedServices.map((service: string, index: number) => ({
      id: nextId(data.verticalServices) + index,
      verticalId,
      service,
      sortOrder: index,
    }))
  );
  data.verticalCovers.push({
    id: nextId(data.verticalCovers),
    verticalId: vertical.slug,
    image: vertical.image,
    updatedAt: now,
  });

  await writeDb(data);
  res.status(201).json({ ...vertical, services: parsedServices });
});

app.put("/api/admin/verticals/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) return;
  const body = parseBody(updateVerticalSchema, req.body, res);
  if (!body) return;

  const data = await readDb();
  const vertical = data.verticals.find((v) => v.id === id);
  if (!vertical) {
    res.status(404).json({ error: "Vertical not found" });
    return;
  }

  const { title, description, image, path, services, active } = body as any;
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
    if (data.verticals.some((v) => v.id !== id && v.path === normalizedPath)) {
      res.status(409).json({ error: "Path already exists" });
      return;
    }
    vertical.path = normalizedPath;
  }

  if (Array.isArray(services)) {
    const parsed = services
      .map((s: any) => String(s).trim())
      .filter((s: string) => s.length > 0);
    data.verticalServices = data.verticalServices.filter(
      (s) => s.verticalId !== id
    );
    const firstId = nextId(data.verticalServices);
    data.verticalServices.push(
      ...parsed.map((service: string, index: number) => ({
        id: firstId + index,
        verticalId: id,
        service,
        sortOrder: index,
      }))
    );
  }

  const cover = data.verticalCovers.find((c) => c.verticalId === vertical.slug);
  if (cover && image !== undefined) {
    cover.image = String(image);
    cover.updatedAt = new Date().toISOString();
  }

  vertical.updatedAt = new Date().toISOString();
  await writeDb(data);
  res.json({
    ...vertical,
    services: data.verticalServices
      .filter((s) => s.verticalId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.service),
  });
});

app.delete("/api/admin/verticals/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) return;
  const data = await readDb();
  const vertical = data.verticals.find((v) => v.id === id);
  if (!vertical) {
    res.status(404).json({ error: "Vertical not found" });
    return;
  }
  data.verticals = data.verticals.filter((v) => v.id !== id);
  data.verticalServices = data.verticalServices.filter((s) => s.verticalId !== id);
  data.verticalCovers = data.verticalCovers.filter(
    (c) => c.verticalId !== vertical.slug
  );
  await writeDb(data);
  res.json({ success: true });
});

// ==============================
// ADMIN PROJECTS
// ==============================
app.get("/api/admin/projects", requireAdmin, async (_req, res) => {
  const data = await readDb();
  const projects = data.projects
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((project) => ({
      ...project,
      galleryImages: data.projectImages
        .filter((img) => img.projectId === project.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  res.json(projects);
});

app.post("/api/admin/projects", requireAdmin, async (req, res) => {
  const body = parseBody(createProjectSchema, req.body, res);
  if (!body) return;
  const {
    slug, title, location, category, description,
    heroImage, year, status, verticalSlug, sortOrder, active,
  } = body as any;

  const data = await readDb();
  const normalizedVerticalSlug = verticalSlug ? String(verticalSlug) : null;
  if (
    normalizedVerticalSlug &&
    !data.verticals.some((v) => v.slug === normalizedVerticalSlug)
  ) {
    res.status(400).json({ error: "Invalid verticalSlug" });
    return;
  }

  const now = new Date().toISOString();
  const project = {
    id: nextId(data.projects),
    slug: String(slug),
    title: String(title),
    location: String(location),
    category: String(category),
    description: String(description),
    heroImage: String(heroImage),
    year: year ? String(year) : null,
    status: status ? String(status) : null,
    verticalSlug: normalizedVerticalSlug,
    sortOrder: typeof sortOrder === "number" ? sortOrder : data.projects.length,
    active: typeof active === "boolean" ? active : true,
    createdAt: now,
    updatedAt: now,
  };
  data.projects.push(project);
  await writeDb(data);
  res.json(project);
});

app.put("/api/admin/projects/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) return;
  const body = parseBody(updateProjectSchema, req.body, res);
  if (!body) return;

  const data = await readDb();
  const project = data.projects.find((p) => p.id === id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const {
    slug, title, location, category, description,
    heroImage, year, status, verticalSlug, sortOrder, active,
  } = body as any;

  if (verticalSlug !== undefined) {
    const n = verticalSlug ? String(verticalSlug) : null;
    if (n && !data.verticals.some((v) => v.slug === n)) {
      res.status(400).json({ error: "Invalid verticalSlug" });
      return;
    }
    project.verticalSlug = n;
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

  await writeDb(data);
  res.json(project);
});

app.delete("/api/admin/projects/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id, res);
  if (!id) return;
  const data = await readDb();
  data.projects = data.projects.filter((p) => p.id !== id);
  data.projectImages = data.projectImages.filter((img) => img.projectId !== id);
  await writeDb(data);
  res.json({ success: true });
});

app.post("/api/admin/projects/:id/images", requireAdmin, async (req, res) => {
  const projectId = parseIdParam(req.params.id, res, "projectId");
  if (!projectId) return;
  const body = parseBody(addProjectImageSchema, req.body, res);
  if (!body) return;

  const { imageUrl, caption, sortOrder } = body as any;
  const data = await readDb();
  const image = {
    id: nextId(data.projectImages),
    projectId,
    imageUrl: String(imageUrl),
    caption: caption ? String(caption) : null,
    sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
  };
  data.projectImages.push(image);
  await writeDb(data);
  res.json(image);
});

app.delete(
  "/api/admin/projects/:projectId/images/:imageId",
  requireAdmin,
  async (req, res) => {
    const imageId = parseIdParam(req.params.imageId, res, "imageId");
    if (!imageId) return;
    const data = await readDb();
    data.projectImages = data.projectImages.filter((img) => img.id !== imageId);
    await writeDb(data);
    res.json({ success: true });
  }
);

// ==============================
// SITE SETTINGS
// ==============================
app.get("/api/site-settings/public", async (_req, res) => {
  const data = await readDb();
  res.json({
    team:
      data.teamMembers.length > 0
        ? data.teamMembers.sort((a, b) => a.sortOrder - b.sortOrder)
        : null,
    verticalCovers:
      data.verticalCovers.length > 0
        ? Object.fromEntries(data.verticalCovers.map((c) => [c.verticalId, c.image]))
        : null,
    featuredSlugs:
      data.featuredProjects.length > 0
        ? data.featuredProjects
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((x) => x.projectSlug)
        : null,
    profile: data.siteProfile,
  });
});

app.get("/api/admin/site-profile", requireAdmin, async (_req, res) => {
  const data = await readDb();
  res.json(data.siteProfile);
});

app.put("/api/admin/site-profile", requireAdmin, async (req, res) => {
  const body = parseBody(updateSiteProfileSchema, req.body, res);
  if (!body) return;
  const {
    contactEmail, contactPhone, contactPhoneLabel,
    instagramUrl, linkedinUrl, officeName, officeFloor,
    officeAddress, mapsEmbedUrl, mapsDirectionsUrl,
  } = body as any;

  const data = await readDb();
  data.siteProfile = {
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
  await writeDb(data);
  res.json(data.siteProfile);
});

app.get("/api/admin/team-members", requireAdmin, async (_req, res) => {
  const data = await readDb();
  res.json(data.teamMembers.sort((a, b) => a.sortOrder - b.sortOrder));
});

app.put("/api/admin/team-members", requireAdmin, async (req, res) => {
  const body = parseBody(updateTeamMembersSchema, req.body, res);
  if (!body) return;
  const { members } = body as any;

  const data = await readDb();
  data.teamMembers = members.map((member: any, index: number) => ({
    id: index + 1,
    name: member.name,
    role: member.role,
    image: member.image,
    sortOrder: index,
  }));
  await writeDb(data);
  res.json(data.teamMembers);
});

app.get("/api/admin/vertical-covers", requireAdmin, async (_req, res) => {
  const data = await readDb();
  res.json(data.verticalCovers);
});

app.put("/api/admin/vertical-covers", requireAdmin, async (req, res) => {
  const body = parseBody(updateVerticalCoversSchema, req.body, res);
  if (!body) return;
  const { covers } = body as any;

  const data = await readDb();
  data.verticalCovers = covers.map((cover: any, index: number) => ({
    id: index + 1,
    verticalId: cover.verticalId,
    image: cover.image,
    updatedAt: new Date().toISOString(),
  }));
  await writeDb(data);
  res.json(data.verticalCovers);
});

app.get("/api/admin/featured-projects", requireAdmin, async (_req, res) => {
  const data = await readDb();
  res.json(data.featuredProjects.sort((a, b) => a.sortOrder - b.sortOrder));
});

app.put("/api/admin/featured-projects", requireAdmin, async (req, res) => {
  const body = parseBody(updateFeaturedProjectsSchema, req.body, res);
  if (!body) return;
  const { slugs } = body as any;

  const data = await readDb();
  data.featuredProjects = slugs.map((slug: string, index: number) => ({
    id: index + 1,
    projectSlug: slug,
    sortOrder: index,
  }));
  await writeDb(data);
  res.json(data.featuredProjects);
});

// ==============================
// STORAGE
// ==============================
app.post("/api/storage/uploads/request-url", requireAdmin, (_req, res) => {
  res.json(createCloudinaryUploadConfig());
});

app.get("/api/storage/public-objects/*path", (_req, res) => {
  res.status(404).json({ error: "File not found" });
});

app.get("/api/storage/objects/*path", (_req, res) => {
  res.status(404).json({ error: "Object not found" });
});

// ==============================
// EMAIL HELPER
// ==============================
function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// ==============================
// APPLY & CONTACT
// ==============================
app.post("/api/apply", upload.single("resume"), async (req, res, next) => {
  try {
    const body = parseBody(applySchema, req.body, res);
    if (!body) return;
    const { name, age, phone, email, role } = body as any;

    const transporter = getTransporter();
    if (!transporter) {
      res.json({ success: true, message: "Application accepted (email disabled)" });
      return;
    }

    await transporter.sendMail({
      from: `"RayTrace Careers" <${process.env.GMAIL_USER}>`,
      to: process.env.CONTACT_TO || process.env.GMAIL_USER,
      subject: `Job Application: ${role} - ${name}`,
      html: `<h2>New Job Application</h2>
             <p><b>Name:</b> ${name}</p>
             <p><b>Age:</b> ${age || "-"}</p>
             <p><b>Phone:</b> ${phone}</p>
             <p><b>Email:</b> ${email}</p>
             <p><b>Role:</b> ${role}</p>`,
      attachments: req.file
        ? [{ filename: req.file.originalname, content: req.file.buffer }]
        : [],
    });

    res.json({ success: true, message: "Application submitted successfully" });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      res.json({ success: true, message: "Application accepted (email failed in dev)" });
      return;
    }
    next(err);
  }
});

app.post("/api/contact", async (req, res, next) => {
  try {
    const body = parseBody(contactFormSchema, req.body, res);
    if (!body) return;
    const { name, email, message } = body as any;

    const transporter = getTransporter();
    if (!transporter) {
      res.json({ success: true, message: "Message accepted (email disabled)" });
      return;
    }

    await transporter.sendMail({
      from: `"RayTrace Website" <${process.env.GMAIL_USER}>`,
      to: process.env.CONTACT_TO || process.env.GMAIL_USER,
      replyTo: email,
      subject: `Request to Contact - ${name}`,
      html: `<h2>New Contact Request</h2>
             <p><b>Name:</b> ${name}</p>
             <p><b>Email:</b> ${email}</p>
             <p><b>Message:</b><br/>${message}</p>`,
    });

    res.json({ success: true, message: "Message sent successfully" });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      res.json({ success: true, message: "Message accepted (email failed in dev)" });
      return;
    }
    next(err);
  }
});

// ==============================
// 404 + ERROR HANDLER
// ==============================
app.use((req, res) => {
  res.status(404).json({
    error: "NotFound",
    message: `No route matches ${req.method} ${req.path}`,
    requestId: getRequestId(req),
  });
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (
    err instanceof SyntaxError &&
    "status" in err &&
    (err as any).status === 400
  ) {
    res.status(400).json({
      error: "ValidationError",
      message: "Malformed JSON payload",
      requestId: getRequestId(req),
    });
    return;
  }
  logger.error(
    "Unhandled server error",
    err instanceof Error ? err : undefined,
    { requestId: getRequestId(req), method: req.method, path: req.path }
  );
  res.status(500).json({
    error: "InternalServerError",
    message: "An unexpected error occurred",
    requestId: getRequestId(req),
  });
});

// ==============================
// START SERVER — called exactly once
// ==============================
async function start() {
  try {
    console.log("🚀 Starting server...");

    await initDatabase();
    console.log("✅ Database initialized");

    // Use process.env.PORT first (Hostinger injects this at runtime)
    const PORT: number = process.env.PORT
      ? Number(process.env.PORT)
      : Number(env.PORT) || 4000;

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on port ${PORT}`);
    });

    const shutdown = (signal: string) => {
      console.log(`⚠️ ${signal} received, shutting down...`);
      server.close(() => {
        console.log("🛑 Server closed");
        closeDatabase();
        process.exit(0);
      });
      setTimeout(() => {
        console.error("❌ Forced shutdown after timeout");
        closeDatabase();
        process.exit(1);
      }, 30_000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("❌ Startup failed:", err);
    process.exit(1);
  }
}

start(); // ← exactly once, no void start() duplicate