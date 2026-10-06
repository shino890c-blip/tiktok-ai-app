export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Controllable clock for tests (watchdog timeouts, scheduling). */
export class FakeClock implements Clock {
  private current: number;
  constructor(start: Date | string = "2026-01-01T00:00:00.000Z") {
    this.current = new Date(start).getTime();
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
  set(date: Date | string): void {
    this.current = new Date(date).getTime();
  }
}

export function iso(d: Date): string {
  return d.toISOString();
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
