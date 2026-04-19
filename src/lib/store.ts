import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import bcryptjs from "bcryptjs";
import { DbState, type SiteProfile } from "./types";
import { logger } from "./logger-new";

const sqlitePath = process.env.SQLITE_PATH || "./data/raytrace.db";
const resolvedDbPath = path.resolve(process.cwd(), sqlitePath);
const dbDir = path.dirname(resolvedDbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(resolvedDbPath);
db.pragma("foreign_keys = ON");

type ProjectRow = DbState["projects"][number];
type ProjectImageRow = DbState["projectImages"][number];
type VacancyRow = DbState["vacancies"][number];
type AdminRow = DbState["admins"][number];
type TeamMemberRow = DbState["teamMembers"][number];
type VerticalRow = DbState["verticals"][number];
type VerticalServiceRow = DbState["verticalServices"][number];
type VerticalCoverRow = DbState["verticalCovers"][number];
type FeaturedProjectRow = DbState["featuredProjects"][number];
type SiteProfileRow = DbState["siteProfile"];

function nowIso() {
  return new Date().toISOString();
}

const DEFAULT_IMAGE_URL =
  process.env.DEFAULT_IMAGE_URL ||
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1600&q=80";

const FALLBACK_GALLERY_SIZE = 4;

const DEFAULT_PROJECT_VERTICALS: Record<string, string> = {
  "golden-circle": "architecture",
  "villa-no-2": "architecture",
  zenith: "interior-design",
  krushi: "interior-design",
  dsr: "interior-design",
  iccc: "visualization",
  eipl: "visualization",
  livora: "project-management",
};

function defaultSiteProfile(): SiteProfile {
  return {
    id: 1,
    contactEmail: "raytracedesignstudio@gmail.com",
    contactPhone: "+918499085411",
    contactPhoneLabel: "Ram Teja Vallabhaneni",
    instagramUrl: "https://www.instagram.com/raytracedesignstudio/",
    linkedinUrl:
      "https://www.linkedin.com/in/ray-trace-design-studio-b80231390/",
    officeName: "RayTrace Design Studio",
    officeFloor: "5th Floor",
    officeAddress:
      "Myscape Rd, Financial District,\nNanakramguda, Hyderabad,\nTelangana 500032",
    mapsEmbedUrl:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3806.7!2d78.3548!3d17.4065!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bcb95eda0afde1b%3A0x3cebc045de555e12!2sMyscape%2C%20Financial%20District%2C%20Nanakramguda%2C%20Hyderabad%2C%20Telangana%20500032!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin",
    mapsDirectionsUrl: "https://maps.app.goo.gl/DMt5bxFukpiSWjeh6",
  };
}

function ensureColumn(
  tableName: string,
  columnName: string,
  statement: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(statement);
  }
}

function buildFallbackGalleryUrls(
  slug: string,
  heroImage?: string | null,
): string[] {
  const cover = heroImage || DEFAULT_IMAGE_URL;
  const extras = Array.from(
    { length: FALLBACK_GALLERY_SIZE - 1 },
    (_, index) =>
      `https://picsum.photos/seed/${encodeURIComponent(`${slug}-gallery-${index + 1}`)}/1600/1000`,
  );
  return [cover, ...extras];
}

function defaultState(): DbState {
  const createdAt = nowIso();
  const projects = [
    {
      id: 1,
      slug: "zenith",
      title: "Zenith",
      location: "Hyderabad",
      category: "Interior Design",
      description:
        "A refined apartment interior with sculptural 3D-textured TV walls, sleek modular kitchens, and elegant wardrobes.",
      heroImage: DEFAULT_IMAGE_URL,
      sortOrder: 0,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 2,
      slug: "iccc",
      title: "ICCC",
      location: "Hyderabad",
      category: "Interior Design",
      description:
        "A state-of-the-art command and control center with biophilic elements and premium lounge spaces.",
      heroImage: DEFAULT_IMAGE_URL,
      sortOrder: 1,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 3,
      slug: "krushi",
      title: "Krushi Residence",
      location: "Sri Nagar",
      category: "Interior Design",
      description:
        "A vibrant residential interior with geometric wood-panelled walls and layered material palette.",
      heroImage: DEFAULT_IMAGE_URL,
      sortOrder: 2,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 4,
      slug: "dsr",
      title: "DSR Residence",
      location: "Hyderabad",
      category: "Interior Design",
      description:
        "A contemporary residential interior blending warm timber tones with sleek modern finishes.",
      heroImage: DEFAULT_IMAGE_URL,
      sortOrder: 3,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 5,
      slug: "villa-no-2",
      title: "Villa No. 2",
      location: "Hyderabad",
      category: "Interior Design",
      description:
        "A luxurious villa interior with sculptural ceiling design and dramatic skylit staircase.",
      heroImage: DEFAULT_IMAGE_URL,
      sortOrder: 4,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 6,
      slug: "eipl",
      title: "EIPL",
      location: "Hyderabad",
      category: "Interior Design",
      description:
        "A premium apartment interior with marble feature walls and richly layered design language.",
      heroImage: DEFAULT_IMAGE_URL,
      sortOrder: 5,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 7,
      slug: "livora",
      title: "Livora",
      location: "Hyderabad",
      category: "Commercial",
      description:
        "A high-rise corporate office with premium materiality, panoramic boardroom, and biophilic zones.",
      heroImage: DEFAULT_IMAGE_URL,
      sortOrder: 6,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 8,
      slug: "melissa",
      title: "Melissa Clube",
      location: "Hyderabad",
      category: "Retail Design",
      description:
        "A vibrant retail interior blending sustainable visual merchandising with bold branding.",
      heroImage: DEFAULT_IMAGE_URL,
      sortOrder: 7,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 9,
      slug: "golden-circle",
      title: "Golden Circle",
      location: "Hyderabad",
      category: "Interior Design",
      description:
        "A refined apartment interior balancing warm wood tones with clean modern geometry.",
      heroImage: DEFAULT_IMAGE_URL,
      sortOrder: 8,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
  ].map((project) => ({
    ...project,
    year: "2025",
    status: "Completed",
    verticalSlug: DEFAULT_PROJECT_VERTICALS[project.slug] || null,
  }));

  const now = nowIso();
  const bootstrapEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = process.env.ADMIN_PASSWORD;
  const admins =
    bootstrapEmail && bootstrapPassword
      ? [
          {
            id: 1,
            email: bootstrapEmail,
            passwordHash: bcryptjs.hashSync(bootstrapPassword, 10),
            isActive: true,
            lastLoginAt: null,
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [];

  return {
    projects,
    projectImages: projects.flatMap((project) =>
      buildFallbackGalleryUrls(project.slug, project.heroImage).map(
        (imageUrl, index) => ({
          id: project.id * 100 + index,
          projectId: project.id,
          imageUrl,
          caption: null,
          sortOrder: index,
        }),
      ),
    ),
    vacancies: [],
    admins,
    teamMembers: [
      {
        id: 1,
        name: "Ram Teja Vallabhaneni",
        role: "Principal Architect & Founder",
        image: DEFAULT_IMAGE_URL,
        sortOrder: 0,
      },
      {
        id: 2,
        name: "Shamitha Kanagaluru",
        role: "Principal Architect & Founder",
        image: DEFAULT_IMAGE_URL,
        sortOrder: 1,
      },
      {
        id: 3,
        name: "Avinash P.",
        role: "Project Manager",
        image: DEFAULT_IMAGE_URL,
        sortOrder: 2,
      },
      {
        id: 4,
        name: "Kalyan",
        role: "Project Manager",
        image: DEFAULT_IMAGE_URL,
        sortOrder: 3,
      },
    ],
    verticals: [
      {
        id: 1,
        slug: "architecture",
        title: "Architecture",
        description:
          "From concept to completion, we craft structures that define skylines and stand the test of time.",
        image: DEFAULT_IMAGE_URL,
        path: "/architecture",
        active: true,
        sortOrder: 0,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 2,
        slug: "interior-design",
        title: "Interiors",
        description:
          "Curated spaces that balance aesthetic beauty with intuitive functionality and material elegance.",
        image: DEFAULT_IMAGE_URL,
        path: "/interior-design",
        active: true,
        sortOrder: 1,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 3,
        slug: "visualization",
        title: "Visualization",
        description:
          "Photorealistic renders and immersive walkthroughs that bring unbuilt spaces to life before a single brick is laid.",
        image: DEFAULT_IMAGE_URL,
        path: "/visualization",
        active: true,
        sortOrder: 2,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 4,
        slug: "project-management",
        title: "Project Management",
        description:
          "End-to-end oversight ensuring seamless delivery, on schedule, within budget, and true to vision.",
        image: DEFAULT_IMAGE_URL,
        path: "/project-management",
        active: true,
        sortOrder: 3,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    verticalServices: [
      {
        id: 1,
        verticalId: 1,
        service: "Residential Architecture",
        sortOrder: 0,
      },
      {
        id: 2,
        verticalId: 1,
        service: "Commercial Masterplanning",
        sortOrder: 1,
      },
      { id: 3, verticalId: 1, service: "Structural Innovation", sortOrder: 2 },
      { id: 4, verticalId: 1, service: "Landscape Integration", sortOrder: 3 },
      { id: 5, verticalId: 2, service: "Space Planning", sortOrder: 0 },
      {
        id: 6,
        verticalId: 2,
        service: "Bespoke Furniture Design",
        sortOrder: 1,
      },
      { id: 7, verticalId: 2, service: "Material Selection", sortOrder: 2 },
      { id: 8, verticalId: 2, service: "Lighting Architecture", sortOrder: 3 },
      {
        id: 9,
        verticalId: 3,
        service: "3D Architectural Rendering",
        sortOrder: 0,
      },
      {
        id: 10,
        verticalId: 3,
        service: "Interior Visualization",
        sortOrder: 1,
      },
      { id: 11, verticalId: 3, service: "Virtual Walkthroughs", sortOrder: 2 },
      { id: 12, verticalId: 3, service: "Concept Presentation", sortOrder: 3 },
      { id: 13, verticalId: 4, service: "Project Scheduling", sortOrder: 0 },
      {
        id: 14,
        verticalId: 4,
        service: "Contractor Coordination",
        sortOrder: 1,
      },
      { id: 15, verticalId: 4, service: "Budget Management", sortOrder: 2 },
      { id: 16, verticalId: 4, service: "Quality Assurance", sortOrder: 3 },
    ],
    verticalCovers: [
      {
        id: 1,
        verticalId: "architecture",
        image: DEFAULT_IMAGE_URL,
        updatedAt: createdAt,
      },
      {
        id: 2,
        verticalId: "interior-design",
        image: DEFAULT_IMAGE_URL,
        updatedAt: createdAt,
      },
      {
        id: 3,
        verticalId: "visualization",
        image: DEFAULT_IMAGE_URL,
        updatedAt: createdAt,
      },
      {
        id: 4,
        verticalId: "project-management",
        image: DEFAULT_IMAGE_URL,
        updatedAt: createdAt,
      },
    ],
    featuredProjects: [
      { id: 1, projectSlug: "zenith", sortOrder: 0 },
      { id: 2, projectSlug: "iccc", sortOrder: 1 },
      { id: 3, projectSlug: "krushi", sortOrder: 2 },
      { id: 4, projectSlug: "dsr", sortOrder: 3 },
    ],
    siteProfile: defaultSiteProfile(),
  };
}

function toProject(row: any): ProjectRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    location: row.location,
    category: row.category,
    description: row.description,
    heroImage: row.hero_image,
    year: row.year ? String(row.year) : null,
    status: row.status ? String(row.status) : null,
    verticalSlug: row.vertical_slug ? String(row.vertical_slug) : null,
    sortOrder: row.sort_order,
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toProjectImage(row: any): ProjectImageRow {
  return {
    id: row.id,
    projectId: row.project_id,
    imageUrl: row.image_url,
    caption: row.caption,
    sortOrder: row.sort_order,
  };
}

function toVacancy(row: any): VacancyRow {
  return {
    id: row.id,
    title: row.title,
    department: row.department,
    location: row.location,
    type: row.type,
    description: row.description,
    active: Boolean(row.active),
    createdAt: String(row.created_at),
  };
}

function toAdmin(row: any): AdminRow {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toTeamMember(row: any): TeamMemberRow {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    image: row.image,
    sortOrder: row.sort_order,
  };
}

function toVertical(row: any): VerticalRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    image: row.image,
    path: row.path,
    active: Boolean(row.active),
    sortOrder: row.sort_order,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toVerticalService(row: any): VerticalServiceRow {
  return {
    id: row.id,
    verticalId: row.vertical_id,
    service: row.service,
    sortOrder: row.sort_order,
  };
}

function toVerticalCover(row: any): VerticalCoverRow {
  return {
    id: row.id,
    verticalId: row.vertical_id,
    image: row.image,
    updatedAt: String(row.updated_at),
  };
}

function toFeaturedProject(row: any): FeaturedProjectRow {
  return {
    id: row.id,
    projectSlug: row.project_slug,
    sortOrder: row.sort_order,
  };
}

function toSiteProfile(row: any): SiteProfileRow {
  return {
    id: row.id,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactPhoneLabel: row.contact_phone_label,
    instagramUrl: row.instagram_url,
    linkedinUrl: row.linkedin_url,
    officeName: row.office_name,
    officeFloor: row.office_floor,
    officeAddress: row.office_address,
    mapsEmbedUrl: row.maps_embed_url,
    mapsDirectionsUrl: row.maps_directions_url,
  };
}

export async function initDatabase(): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      hero_image TEXT NOT NULL,
      year TEXT,
      status TEXT,
      vertical_slug TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vacancies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      department TEXT NOT NULL,
      location TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Full-time',
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      image TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
    );

    CREATE TABLE IF NOT EXISTS verticals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      image TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vertical_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vertical_id INTEGER NOT NULL,
      service TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      FOREIGN KEY(vertical_id) REFERENCES verticals(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vertical_covers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vertical_id TEXT NOT NULL UNIQUE,
      image TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS featured_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_slug TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      FOREIGN KEY(project_slug) REFERENCES projects(slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS site_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      contact_email TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      contact_phone_label TEXT,
      instagram_url TEXT,
      linkedin_url TEXT,
      office_name TEXT NOT NULL,
      office_floor TEXT,
      office_address TEXT NOT NULL,
      maps_embed_url TEXT,
      maps_directions_url TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_featured_projects_slug ON featured_projects(project_slug);
    CREATE INDEX IF NOT EXISTS idx_projects_active_sort ON projects(active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_project_images_project_sort ON project_images(project_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_vacancies_active_created ON vacancies(active, created_at);
    CREATE INDEX IF NOT EXISTS idx_admins_email_active ON admins(email, is_active);
    CREATE INDEX IF NOT EXISTS idx_team_members_sort ON team_members(sort_order);
    CREATE INDEX IF NOT EXISTS idx_verticals_active_sort ON verticals(active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_vertical_services_vertical_sort ON vertical_services(vertical_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_featured_projects_sort ON featured_projects(sort_order);
  `);

  ensureColumn("projects", "year", "ALTER TABLE projects ADD COLUMN year TEXT");
  ensureColumn(
    "projects",
    "status",
    "ALTER TABLE projects ADD COLUMN status TEXT",
  );
  ensureColumn(
    "projects",
    "vertical_slug",
    "ALTER TABLE projects ADD COLUMN vertical_slug TEXT",
  );
  ensureColumn(
    "admins",
    "last_login_at",
    "ALTER TABLE admins ADD COLUMN last_login_at TEXT",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_projects_vertical_active_sort ON projects(vertical_slug, active, sort_order)",
  );

  const countRow = db
    .prepare("SELECT COUNT(*) AS count FROM projects")
    .get() as { count: number };
  if ((countRow?.count || 0) === 0) {
    await writeDb(defaultState());
    return;
  }

  const state = await readDb();
  let needsWrite = false;

  if (state.admins.length === 0) {
    const bootstrapEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const bootstrapPassword = process.env.ADMIN_PASSWORD;
    if (bootstrapEmail && bootstrapPassword) {
      state.admins = [
        {
          id: 1,
          email: bootstrapEmail,
          passwordHash: bcryptjs.hashSync(bootstrapPassword, 10),
          isActive: true,
          lastLoginAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      ];
      needsWrite = true;
      logger.info("Bootstrapped initial admin account", {
        email: bootstrapEmail,
      });
    } else {
      logger.warn(
        "Admins table is empty and bootstrap credentials are missing",
      );
    }
  }

  if (!state.siteProfile?.contactEmail) {
    state.siteProfile = defaultSiteProfile();
    needsWrite = true;
  }

  state.projects = state.projects.map((project) => {
    const nextProject = { ...project };
    if (!nextProject.year) {
      nextProject.year = "2025";
      needsWrite = true;
    }
    if (!nextProject.status) {
      nextProject.status = "Completed";
      needsWrite = true;
    }
    if (!nextProject.verticalSlug) {
      const defaultVertical =
        DEFAULT_PROJECT_VERTICALS[nextProject.slug] || null;
      if (defaultVertical) {
        nextProject.verticalSlug = defaultVertical;
        needsWrite = true;
      }
    }
    return nextProject;
  });

  // Backfill local/dev projects that still have only one default image so sliders can show multiple photos.
  for (const project of state.projects) {
    const imagesForProject = state.projectImages
      .filter((image) => image.projectId === project.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const hasOnlyDefaultImage =
      imagesForProject.length <= 1 &&
      (imagesForProject.length === 0 ||
        imagesForProject[0].imageUrl === project.heroImage ||
        imagesForProject[0].imageUrl === DEFAULT_IMAGE_URL);

    if (!hasOnlyDefaultImage) {
      continue;
    }

    const firstImageId =
      state.projectImages.reduce(
        (maxId, image) => Math.max(maxId, image.id),
        0,
      ) + 1;
    const fallbackUrls = buildFallbackGalleryUrls(
      project.slug,
      project.heroImage,
    );

    state.projectImages = state.projectImages.filter(
      (image) => image.projectId !== project.id,
    );
    state.projectImages.push(
      ...fallbackUrls.map((imageUrl, index) => ({
        id: firstImageId + index,
        projectId: project.id,
        imageUrl,
        caption: null,
        sortOrder: index,
      })),
    );
    needsWrite = true;
  }

  if (state.verticals.length === 0) {
    const defaults = defaultState();
    state.verticals = defaults.verticals;
    state.verticalServices = defaults.verticalServices;
    if (state.verticalCovers.length === 0) {
      state.verticalCovers = defaults.verticalCovers;
    }
    needsWrite = true;
  }

  if (needsWrite) {
    await writeDb(state);
  }
}

export async function readDb(): Promise<DbState> {
  try {
    const projectsRes = db
      .prepare("SELECT * FROM projects ORDER BY sort_order, id")
      .all();
    const imagesRes = db
      .prepare("SELECT * FROM project_images ORDER BY sort_order, id")
      .all();
    const vacanciesRes = db
      .prepare("SELECT * FROM vacancies ORDER BY created_at, id")
      .all();
    const adminsRes = db.prepare("SELECT * FROM admins ORDER BY id").all();
    const teamRes = db
      .prepare("SELECT * FROM team_members ORDER BY sort_order, id")
      .all();
    const verticalsRes = db
      .prepare("SELECT * FROM verticals ORDER BY sort_order, id")
      .all();
    const verticalServicesRes = db
      .prepare(
        "SELECT * FROM vertical_services ORDER BY vertical_id, sort_order, id",
      )
      .all();
    const coversRes = db
      .prepare("SELECT * FROM vertical_covers ORDER BY id")
      .all();
    const featuredRes = db
      .prepare("SELECT * FROM featured_projects ORDER BY sort_order, id")
      .all();
    const siteProfileRes = db
      .prepare("SELECT * FROM site_profile WHERE id = 1")
      .get();

    logger.debug("Database read completed", {
      projects: projectsRes.length,
      images: imagesRes.length,
      vacancies: vacanciesRes.length,
      admins: adminsRes.length,
      team: teamRes.length,
      verticals: verticalsRes.length,
    });

    return {
      projects: projectsRes.map(toProject),
      projectImages: imagesRes.map(toProjectImage),
      vacancies: vacanciesRes.map(toVacancy),
      admins: adminsRes.map(toAdmin),
      teamMembers: teamRes.map(toTeamMember),
      verticals: verticalsRes.map(toVertical),
      verticalServices: verticalServicesRes.map(toVerticalService),
      verticalCovers: coversRes.map(toVerticalCover),
      featuredProjects: featuredRes.map(toFeaturedProject),
      siteProfile: siteProfileRes
        ? toSiteProfile(siteProfileRes)
        : defaultSiteProfile(),
    };
  } catch (error) {
    logger.error(
      "Database read error",
      error instanceof Error ? error : undefined,
    );
    throw error;
  }
}

export async function writeDb(next: DbState): Promise<void> {
  try {
    const upsertProject = db.prepare(
      `INSERT INTO projects (id, slug, title, location, category, description, hero_image, year, status, vertical_slug, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         slug=excluded.slug,
         title=excluded.title,
         location=excluded.location,
         category=excluded.category,
         description=excluded.description,
         hero_image=excluded.hero_image,
         year=excluded.year,
         status=excluded.status,
         vertical_slug=excluded.vertical_slug,
         sort_order=excluded.sort_order,
         active=excluded.active,
         created_at=excluded.created_at,
         updated_at=excluded.updated_at`,
    );
    const upsertProjectImage = db.prepare(
      `INSERT INTO project_images (id, project_id, image_url, caption, sort_order)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         project_id=excluded.project_id,
         image_url=excluded.image_url,
         caption=excluded.caption,
         sort_order=excluded.sort_order`,
    );
    const upsertVacancy = db.prepare(
      `INSERT INTO vacancies (id, title, department, location, type, description, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title,
         department=excluded.department,
         location=excluded.location,
         type=excluded.type,
         description=excluded.description,
         active=excluded.active,
         created_at=excluded.created_at`,
    );
    const upsertAdmin = db.prepare(
      `INSERT INTO admins (id, email, password_hash, is_active, last_login_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email=excluded.email,
         password_hash=excluded.password_hash,
         is_active=excluded.is_active,
         last_login_at=excluded.last_login_at,
         created_at=excluded.created_at,
         updated_at=excluded.updated_at`,
    );
    const upsertTeamMember = db.prepare(
      `INSERT INTO team_members (id, name, role, image, sort_order)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name,
         role=excluded.role,
         image=excluded.image,
         sort_order=excluded.sort_order`,
    );
    const upsertVertical = db.prepare(
      `INSERT INTO verticals (id, slug, title, description, image, path, active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         slug=excluded.slug,
         title=excluded.title,
         description=excluded.description,
         image=excluded.image,
         path=excluded.path,
         active=excluded.active,
         sort_order=excluded.sort_order,
         created_at=excluded.created_at,
         updated_at=excluded.updated_at`,
    );
    const upsertVerticalService = db.prepare(
      `INSERT INTO vertical_services (id, vertical_id, service, sort_order)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         vertical_id=excluded.vertical_id,
         service=excluded.service,
         sort_order=excluded.sort_order`,
    );
    const upsertVerticalCover = db.prepare(
      `INSERT INTO vertical_covers (id, vertical_id, image, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         vertical_id=excluded.vertical_id,
         image=excluded.image,
         updated_at=excluded.updated_at`,
    );
    const upsertFeaturedProject = db.prepare(
      `INSERT INTO featured_projects (id, project_slug, sort_order)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         project_slug=excluded.project_slug,
         sort_order=excluded.sort_order`,
    );
    const upsertSiteProfile = db.prepare(
      `INSERT INTO site_profile (
        id,
        contact_email,
        contact_phone,
        contact_phone_label,
        instagram_url,
        linkedin_url,
        office_name,
        office_floor,
        office_address,
        maps_embed_url,
        maps_directions_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        contact_email=excluded.contact_email,
        contact_phone=excluded.contact_phone,
        contact_phone_label=excluded.contact_phone_label,
        instagram_url=excluded.instagram_url,
        linkedin_url=excluded.linkedin_url,
        office_name=excluded.office_name,
        office_floor=excluded.office_floor,
        office_address=excluded.office_address,
        maps_embed_url=excluded.maps_embed_url,
        maps_directions_url=excluded.maps_directions_url`,
    );

    function pruneByIds(tableName: string, ids: number[]) {
      if (ids.length === 0) {
        db.prepare(`DELETE FROM ${tableName}`).run();
        return;
      }

      const placeholders = ids.map(() => "?").join(", ");
      db.prepare(
        `DELETE FROM ${tableName} WHERE id NOT IN (${placeholders})`,
      ).run(...ids);
    }

    const writeTx = db.transaction(() => {
      for (const project of next.projects) {
        upsertProject.run(
          project.id,
          project.slug,
          project.title,
          project.location,
          project.category,
          project.description,
          project.heroImage,
          project.year,
          project.status,
          project.verticalSlug,
          project.sortOrder,
          project.active ? 1 : 0,
          project.createdAt,
          project.updatedAt,
        );
      }
      pruneByIds(
        "projects",
        next.projects.map((project) => project.id),
      );

      for (const image of next.projectImages) {
        upsertProjectImage.run(
          image.id,
          image.projectId,
          image.imageUrl,
          image.caption,
          image.sortOrder,
        );
      }
      pruneByIds(
        "project_images",
        next.projectImages.map((image) => image.id),
      );

      for (const vacancy of next.vacancies) {
        upsertVacancy.run(
          vacancy.id,
          vacancy.title,
          vacancy.department,
          vacancy.location,
          vacancy.type,
          vacancy.description,
          vacancy.active ? 1 : 0,
          vacancy.createdAt,
        );
      }
      pruneByIds(
        "vacancies",
        next.vacancies.map((vacancy) => vacancy.id),
      );

      for (const admin of next.admins) {
        upsertAdmin.run(
          admin.id,
          admin.email,
          admin.passwordHash,
          admin.isActive ? 1 : 0,
          admin.lastLoginAt,
          admin.createdAt,
          admin.updatedAt,
        );
      }
      pruneByIds(
        "admins",
        next.admins.map((admin) => admin.id),
      );

      for (const member of next.teamMembers) {
        upsertTeamMember.run(
          member.id,
          member.name,
          member.role,
          member.image,
          member.sortOrder,
        );
      }
      pruneByIds(
        "team_members",
        next.teamMembers.map((member) => member.id),
      );

      for (const vertical of next.verticals) {
        upsertVertical.run(
          vertical.id,
          vertical.slug,
          vertical.title,
          vertical.description,
          vertical.image,
          vertical.path,
          vertical.active ? 1 : 0,
          vertical.sortOrder,
          vertical.createdAt,
          vertical.updatedAt,
        );
      }
      pruneByIds(
        "verticals",
        next.verticals.map((vertical) => vertical.id),
      );

      for (const service of next.verticalServices) {
        upsertVerticalService.run(
          service.id,
          service.verticalId,
          service.service,
          service.sortOrder,
        );
      }
      pruneByIds(
        "vertical_services",
        next.verticalServices.map((service) => service.id),
      );

      for (const cover of next.verticalCovers) {
        upsertVerticalCover.run(
          cover.id,
          cover.verticalId,
          cover.image,
          cover.updatedAt,
        );
      }
      pruneByIds(
        "vertical_covers",
        next.verticalCovers.map((cover) => cover.id),
      );

      for (const featured of next.featuredProjects) {
        upsertFeaturedProject.run(
          featured.id,
          featured.projectSlug,
          featured.sortOrder,
        );
      }
      pruneByIds(
        "featured_projects",
        next.featuredProjects.map((featured) => featured.id),
      );

      upsertSiteProfile.run(
        next.siteProfile.id,
        next.siteProfile.contactEmail,
        next.siteProfile.contactPhone,
        next.siteProfile.contactPhoneLabel,
        next.siteProfile.instagramUrl,
        next.siteProfile.linkedinUrl,
        next.siteProfile.officeName,
        next.siteProfile.officeFloor,
        next.siteProfile.officeAddress,
        next.siteProfile.mapsEmbedUrl,
        next.siteProfile.mapsDirectionsUrl,
      );
      if (next.siteProfile.id !== 1) {
        db.prepare("DELETE FROM site_profile WHERE id != ?").run(
          next.siteProfile.id,
        );
      }
    });

    writeTx();

    logger.info("Database write completed", {
      projects: next.projects.length,
      images: next.projectImages.length,
      vacancies: next.vacancies.length,
      admins: next.admins.length,
      team: next.teamMembers.length,
      verticals: next.verticals.length,
    });
  } catch (error) {
    logger.error(
      "Database write error - transaction rolled back",
      error instanceof Error ? error : undefined,
    );
    throw error;
  }
}

export function nextId(items: Array<{ id: number }>): number {
  const max = items.reduce((acc, item) => Math.max(acc, item.id), 0);
  return max + 1;
}

export function closeDatabase(): void {
  db.close();
}
