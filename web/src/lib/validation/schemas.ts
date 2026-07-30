/**
 * Common Validation Schemas
 *
 * Zod schemas for validating user input across the application.
 * Provides type-safe validation with detailed error messages.
 */

import { z } from 'zod';

import type { AnimalWrite } from '@/types/api-generated';

/**
 * A whole number of zero or more, as typed — digits and nothing else.
 *
 * Deliberately a string test rather than a numeric one: `Number('2.5')` and `Number('-1')` are
 * both perfectly good numbers, so only the text the person typed can tell "5" from "2.5" or
 * "-1". `'0'` matches, which is the point — a newborn animal is zero years old, and a
 * truthiness check on Age is the classic bug this closes.
 */
const WHOLE_NUMBER = /^\d+$/;

/**
 * The animal write form — Name, Species, Age, Habitat and Diet, and nothing else (R17).
 *
 * **This is the only field validation that exists anywhere in this system.** The backend
 * declares no `required:` fields and performs no validation of its own: it inserts whatever it
 * is sent straight into the database (R19). So a rule missing here is not "caught later" — it
 * is not caught at all, and the bad row is permanent.
 *
 * Every value is held as the **string the control produced**, because that is what a DOM entry
 * hands you and what has to be shown back to the person when it is refused. Age and HabitatId
 * become numbers on the way to the wire — see {@link animalWriteFromForm} — never before, so a
 * rejected entry can be redisplayed exactly as typed.
 *
 * The habitat is mandatory for a reason worth restating: the backend INNER JOINs Habitat when
 * it reads, so an animal saved against a missing habitat is created and then **permanently
 * invisible in every list** (BR5). There is no unpicking that from the UI.
 *
 * Consumed through react-hook-form's Zod resolver by
 * `web/src/components/animals/AnimalForm.tsx` (add and edit share it), and directly through
 * {@link validateRequest} anywhere else the same rules are needed.
 */
export const animalFormSchema = z.object({
  Name: z.string().trim().min(1, 'Enter the animal’s name'),
  Species: z.string().trim().min(1, 'Enter the species'),
  Age: z
    .string()
    .trim()
    .min(1, 'Enter the age')
    .regex(WHOLE_NUMBER, 'Age must be a whole number of 0 or more'),
  // '' is "nothing chosen yet" — the form never preselects a habitat for the user (BR5).
  HabitatId: z.string().min(1, 'Choose a habitat'),
  Diet: z.string().trim().min(1, 'Enter the diet'),
});

/** What the animal form holds while it is being filled in: five strings. */
export type AnimalFormValues = z.infer<typeof animalFormSchema>;

/** An untouched add form — nothing typed, and deliberately no habitat chosen (BR5). */
export const EMPTY_ANIMAL_FORM: AnimalFormValues = {
  Name: '',
  Species: '',
  Age: '',
  HabitatId: '',
  Diet: '',
};

/**
 * The request body a validated form becomes: the five writable fields, with `Age` and
 * `HabitatId` as **numbers**.
 *
 * The DOM hands every value over as a string and this backend stores whatever it is sent
 * (R19), so `"5"` would be written into an integer column verbatim. The return type is
 * `Required<AnimalWrite>` rather than `AnimalWrite` on purpose: every field on the generated
 * types is optional (the spec declares no `required:` arrays), so only this signature makes a
 * forgotten field a compile error.
 *
 * `Id`, `HabitatName`, `LastChangedUser` and `LastChangedDate` are absent and must stay absent
 * — the first two are backend-derived, and the change-tracking pair is injected server-side as
 * an HTTP header (R5/BR3).
 */
export function animalWriteFromForm(
  values: AnimalFormValues,
): Required<AnimalWrite> {
  return {
    Name: values.Name,
    Species: values.Species,
    Age: Number(values.Age),
    HabitatId: Number(values.HabitatId),
    Diet: values.Diet,
  };
}

/**
 * Email validation schema
 * Validates email format and normalizes to lowercase
 */
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim();

/**
 * Password validation schema
 * Requires minimum 8 characters with at least:
 * - One uppercase letter
 * - One lowercase letter
 * - One number
 * - One special character
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(
    /[^A-Za-z0-9]/,
    'Password must contain at least one special character',
  );

/**
 * Relaxed password schema for optional/less strict use cases
 * Only requires minimum length
 */
export const simplePasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters');

/**
 * User ID validation schema
 * Validates MongoDB ObjectId or UUID format
 */
export const userIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Invalid user ID format',
  );

/**
 * File upload validation schema
 * Validates file type and size
 */
export const fileUploadSchema = z.object({
  name: z.string().min(1, 'File name is required'),
  size: z.number().max(5 * 1024 * 1024, 'File size must be less than 5MB'), // 5MB limit
  type: z
    .string()
    .regex(
      /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/,
      'File type must be JPEG, PNG, GIF, WebP, or PDF',
    ),
});

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

/**
 * Search query schema
 */
export const searchSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200).trim(),
  filters: z.record(z.string(), z.string()).optional(),
});

/**
 * Generic form field validation
 */
export const formFieldSchemas = {
  name: z.string().min(1, 'Name is required').max(100).trim(),
  description: z.string().max(500).optional(),
  url: z.string().url('Invalid URL format').optional().or(z.literal('')),
  phoneNumber: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
    .optional()
    .or(z.literal('')),
  dateString: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
};

/**
 * Type-safe validation helper
 * Validates data against a schema and returns typed result
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validation result with success flag, data, and errors
 *
 * @example
 * ```ts
 * const result = validateRequest(paginationSchema, { page: '2', limit: '20' });
 * if (result.success) {
 *   // result.data is typed as { page: number, limit: number }
 *   console.log(result.data.page);
 * } else {
 *   console.error(result.errors);
 * }
 * ```
 */
export function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): { success: true; data: z.infer<T> } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: result.error.issues.map((err: z.ZodIssue) => {
      const path = err.path.join('.');
      return path ? `${path}: ${err.message}` : err.message;
    }),
  };
}

/**
 * Async version of validateRequest for schemas with async refinements
 */
export async function validateRequestAsync<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): Promise<
  { success: true; data: z.infer<T> } | { success: false; errors: string[] }
> {
  const result = await schema.safeParseAsync(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: result.error.issues.map((err: z.ZodIssue) => {
      const path = err.path.join('.');
      return path ? `${path}: ${err.message}` : err.message;
    }),
  };
}

/**
 * Sanitize HTML input to prevent XSS attacks
 * Strips HTML tags and dangerous characters
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, '') // Remove dangerous characters
    .trim();
}

/**
 * Create a schema with sanitization
 * Useful for text inputs that should not contain HTML
 */
export const sanitizedStringSchema = z.string().transform(sanitizeHtml);
