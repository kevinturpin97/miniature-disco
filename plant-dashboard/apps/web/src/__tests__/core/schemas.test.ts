import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema, plantCreateSchema, forgotPasswordSchema } from '@core/schemas';

describe('loginSchema', () => {
  it('validates valid login', () => {
    const result = loginSchema.safeParse({ email: 'user@test.com', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'notanemail', password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = loginSchema.safeParse({ email: 'user@test.com', password: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('registerSchema', () => {
  const validData = { name: 'John Doe', email: 'john@test.com', password: 'Password1', confirmPassword: 'Password1' };

  it('validates valid registration', () => {
    expect(registerSchema.safeParse(validData).success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const result = registerSchema.safeParse({ ...validData, confirmPassword: 'Different1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.confirmPassword).toBeDefined();
    }
  });

  it('rejects name too short', () => {
    const result = registerSchema.safeParse({ ...validData, name: 'A' });
    expect(result.success).toBe(false);
  });

  it('requires uppercase in password', () => {
    const result = registerSchema.safeParse({ ...validData, password: 'password1', confirmPassword: 'password1' });
    expect(result.success).toBe(false);
  });
});

describe('plantCreateSchema', () => {
  it('validates valid plant', () => {
    const result = plantCreateSchema.safeParse({ name: 'My Monstera' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = plantCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('validates valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'test@example.com' }).success).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'invalid' }).success).toBe(false);
  });
});
