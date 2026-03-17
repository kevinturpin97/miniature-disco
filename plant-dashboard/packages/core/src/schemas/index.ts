import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional().default(false),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const plantCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  speciesId: z.string().optional(),
  roomId: z.string().optional(),
  notes: z.string().max(1000).optional(),
  acquiredAt: z.string().optional(),
});

export const plantEditSchema = plantCreateSchema.partial().extend({ id: z.string() });

export const settingsProfileSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  avatar: z.string().url().optional().or(z.literal('')),
});

export const settingsNotificationsSchema = z.object({
  wateringReminders: z.boolean(),
  healthAlerts: z.boolean(),
  weeklyReport: z.boolean(),
  reminderHour: z.number().int().min(0).max(23),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type PlantCreateInput = z.infer<typeof plantCreateSchema>;
export type PlantEditInput = z.infer<typeof plantEditSchema>;
export type SettingsProfileInput = z.infer<typeof settingsProfileSchema>;
export type SettingsNotificationsInput = z.infer<typeof settingsNotificationsSchema>;
