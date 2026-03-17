import { describe, it, expect, beforeEach } from 'vitest';
import { createToken, registerService, getService, hasService, clearRegistry } from '@core/di/container';

interface IFoo { greet(): string; }

describe('DI Container', () => {
  const FooToken = createToken<IFoo>('IFoo');

  beforeEach(() => clearRegistry());

  it('registers and resolves a service', () => {
    registerService(FooToken, { greet: () => 'hello' });
    const foo = getService(FooToken);
    expect(foo.greet()).toBe('hello');
  });

  it('throws if service not registered', () => {
    expect(() => getService(FooToken)).toThrow('not registered');
  });

  it('hasService returns false before registration', () => {
    expect(hasService(FooToken)).toBe(false);
  });

  it('hasService returns true after registration', () => {
    registerService(FooToken, { greet: () => 'hello' });
    expect(hasService(FooToken)).toBe(true);
  });

  it('clearRegistry removes all services', () => {
    registerService(FooToken, { greet: () => 'hello' });
    clearRegistry();
    expect(hasService(FooToken)).toBe(false);
  });
});
