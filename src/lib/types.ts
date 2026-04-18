export type ProjectImage = {
  id: number;
  projectId: number;
  imageUrl: string;
  caption: string | null;
  sortOrder: number;
};

export type Project = {
  id: number;
  slug: string;
  title: string;
  location: string;
  category: string;
  description: string;
  heroImage: string;
  year: string | null;
  status: string | null;
  verticalSlug: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Vacancy = {
  id: number;
  title: string;
  department: string;
  location: string;
  type: string;
  description: string | null;
  active: boolean;
  createdAt: string;
};

export type TeamMember = {
  id: number;
  name: string;
  role: string;
  image: string;
  sortOrder: number;
};

export type VerticalCover = {
  id: number;
  verticalId: string;
  image: string;
  updatedAt: string;
};

export type Vertical = {
  id: number;
  slug: string;
  title: string;
  description: string;
  image: string;
  path: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type VerticalService = {
  id: number;
  verticalId: number;
  service: string;
  sortOrder: number;
};

export type FeaturedProject = {
  id: number;
  projectSlug: string;
  sortOrder: number;
};

export type SiteProfile = {
  id: number;
  contactEmail: string;
  contactPhone: string;
  contactPhoneLabel: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  officeName: string;
  officeFloor: string | null;
  officeAddress: string;
  mapsEmbedUrl: string | null;
  mapsDirectionsUrl: string | null;
};

export type Admin = {
  id: number;
  email: string;
  passwordHash: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DbState = {
  projects: Project[];
  projectImages: ProjectImage[];
  vacancies: Vacancy[];
  admins: Admin[];
  teamMembers: TeamMember[];
  verticals: Vertical[];
  verticalServices: VerticalService[];
  verticalCovers: VerticalCover[];
  featuredProjects: FeaturedProject[];
  siteProfile: SiteProfile;
};
