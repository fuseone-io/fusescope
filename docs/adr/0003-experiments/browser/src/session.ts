export interface SessionRecord {
  id: string;
  previousId?: string;
  startedAt: number;
  lastActiveAt: number;
  sampled: boolean;
}

export interface SessionOptions {
  inactivityTimeoutMs: number;
  maxDurationMs: number;
  sampleRate: number;
}

export const STORAGE_KEY = 'fusescope.session';
const TOUCH_WRITE_INTERVAL_MS = 5_000;

export function newSessionId(random: (bytes: Uint8Array) => Uint8Array): string {
  return Array.from(random(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Deterministic per id, so every tab and every signal of a session agrees.
export function isSampled(sessionId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return parseInt(sessionId.slice(0, 8), 16) / 0xffffffff < rate;
}

export function isExpired(s: SessionRecord, now: number, o: SessionOptions): boolean {
  return now - s.lastActiveAt > o.inactivityTimeoutMs || now - s.startedAt > o.maxDurationMs;
}

export function nextSession(
  current: SessionRecord | undefined,
  now: number,
  o: SessionOptions,
  makeId: () => string,
): { session: SessionRecord; rotated: boolean } {
  if (current && !isExpired(current, now, o)) {
    return { session: { ...current, lastActiveAt: now }, rotated: false };
  }
  const id = makeId();
  return {
    session: { id, previousId: current?.id, startedAt: now, lastActiveAt: now, sampled: isSampled(id, o.sampleRate) },
    rotated: true,
  };
}

export interface KeyValueStore {
  get(): string | null;
  set(value: string): void;
}

export function localStorageStore(): KeyValueStore {
  return {
    get: () => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    set: (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, v);
      } catch {
        /* storage unavailable: session stays per tab */
      }
    },
  };
}

function parse(raw: string | null): SessionRecord | undefined {
  if (!raw) return undefined;
  try {
    const s = JSON.parse(raw) as SessionRecord;
    return typeof s.id === 'string' ? s : undefined;
  } catch {
    return undefined;
  }
}

export type SessionListener = (session: SessionRecord, previous?: SessionRecord) => void;

// Tabs share one session through localStorage; the `storage` event carries
// rotations and activity from other tabs.
export class SessionManager {
  private current: SessionRecord | undefined;
  private lastWrite = 0;
  private listeners: SessionListener[] = [];
  private readonly options: SessionOptions;
  private readonly store: KeyValueStore;
  private readonly now: () => number;
  private readonly makeId: () => string;

  constructor(
    options: SessionOptions,
    store: KeyValueStore = localStorageStore(),
    now: () => number = Date.now,
    makeId: () => string = () => newSessionId((b) => crypto.getRandomValues(b)),
  ) {
    this.options = options;
    this.store = store;
    this.now = now;
    this.makeId = makeId;
    this.current = parse(store.get());
    this.touch();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY) return;
        const next = parse(e.newValue);
        if (next && next.id !== this.current?.id) this.emit(next, this.current);
        if (next) this.current = next;
      });
    }
  }

  onChange(listener: SessionListener): void {
    this.listeners.push(listener);
  }

  get(): SessionRecord {
    return this.touch(false);
  }

  touch(activity = true): SessionRecord {
    const now = this.now();
    const base = parse(this.store.get()) ?? this.current;
    const previous = this.current;
    let session: SessionRecord;
    if (base && !isExpired(base, now, this.options)) {
      session = activity ? { ...base, lastActiveAt: now } : base;
      if (activity && now - this.lastWrite > TOUCH_WRITE_INTERVAL_MS) this.write(session, now);
    } else {
      session = nextSession(base, now, this.options, this.makeId).session;
      this.write(session, now);
    }
    this.current = session;
    if (previous?.id !== session.id) this.emit(session, previous);
    return session;
  }

  private write(session: SessionRecord, now: number): void {
    this.store.set(JSON.stringify(session));
    this.lastWrite = now;
  }

  private emit(session: SessionRecord, previous?: SessionRecord): void {
    for (const l of this.listeners) l(session, previous);
  }
}
