import { z } from "zod";

/**
 * Request body validators for API endpoints
 * Ensures incoming data conforms to expected schema before processing
 */

// Project validators
export const createProjectSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  title: z.string().min(1, "Title is required"),
  location: z.string().min(1, "Location is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required"),
  heroImage: z.string().url("Hero image must be a valid URL"),
  year: z.string().optional(),
  status: z.string().optional(),
  verticalSlug: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  active: z.boolean().optional().default(true),
});

export const updateProjectSchema = createProjectSchema.partial();

export const addProjectImageSchema = z.object({
  imageUrl: z.string().url("Image URL must be a valid URL"),
  caption: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

// Vacancy validators
export const createVacancySchema = z.object({
  title: z.string().min(1, "Title is required"),
  department: z.string().min(1, "Department is required"),
  location: z.string().min(1, "Location is required"),
  type: z.string().optional().default("Full-time"),
  description: z.string().optional(),
  active: z.boolean().optional().default(true),
});

export const updateVacancySchema = createVacancySchema.partial();

// Vacancy apply validators
export const applyVacancySchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().regex(/^\+?[\d\s\-()]{7,}$/, "Invalid phone number"),
  resume_url: z.string().url("Resume URL must be valid"),
  cover_letter: z.string().optional(),
});

// Vertical validators
export const createVerticalSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  image: z.string().url("Image must be a valid URL"),
  path: z.string().optional(),
  services: z.array(z.string()).optional().default([]),
  active: z.boolean().optional().default(true),
});

export const updateVerticalSchema = createVerticalSchema.partial();

// Team member validators
export const createTeamMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.string().min(1, "Role is required"),
  image: z.string().url("Image must be a valid URL"),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updateTeamMemberSchema = createTeamMemberSchema.partial();

// Site profile validators
export const updateSiteProfileSchema = z.object({
  contactEmail: z.string().email("contactEmail must be a valid email"),
  contactPhone: z.string().min(1, "contactPhone is required"),
  contactPhoneLabel: z.string().optional(),
  instagramUrl: z.string().url().optional().or(z.literal("")),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  officeName: z.string().min(1, "officeName is required"),
  officeFloor: z.string().optional(),
  officeAddress: z.string().min(1, "officeAddress is required"),
  mapsEmbedUrl: z.string().optional(),
  mapsDirectionsUrl: z.string().url().optional().or(z.literal("")),
});

export const updateTeamMembersSchema = z.object({
  members: z.array(
    z.object({
      name: z.string().min(1, "Member name is required"),
      role: z.string().min(1, "Member role is required"),
      image: z.string().url("Member image must be a valid URL"),
    }),
  ),
});

export const updateVerticalCoversSchema = z.object({
  covers: z.array(
    z.object({
      verticalId: z.string().min(1, "verticalId is required"),
      image: z.string().url("Cover image must be a valid URL"),
    }),
  ),
});

export const updateFeaturedProjectsSchema = z.object({
  slugs: z.array(z.string().min(1, "Project slug must not be empty")),
});

// Auth validators
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// Contact form validators
export const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  message: z.string().min(1, "Message is required"),
});

export const applySchema = z.object({
  name: z.string().min(1, "Name is required"),
  age: z.string().optional(),
  phone: z.string().regex(/^[+\d\s\-()]{7,}$/u, "Invalid phone number"),
  email: z.string().email("Invalid email address"),
  role: z.string().min(1, "Role is required"),
});

/**
 * Validate request body against schema
 * Returns { success: true, data } or { success: false, errors }
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown) {
  try {
    return {
      success: true,
      data: schema.parse(data),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      };
    }
    return {
      success: false,
      errors: [{ field: "unknown", message: "Validation error" }],
    };
  }
}
