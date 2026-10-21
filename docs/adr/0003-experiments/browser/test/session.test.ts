import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSampled, SessionManager, type KeyValueStore } from '../src/session.ts';

const options = { inactivityTimeoutMs: 15 * 60_000, maxDurationMs: 4 * 3_600_000, sampleRate: 1 };

function memoryStore(): KeyValueStore & { value: string | null } {
  const s = { value: null as string | null, get: () => s.value, set: (v: string) => void (s.value = v) };
  return s;
}

function harness(store = memoryStore()) {
  const clock = { now: 1_000_000 };
  let n = 0;
  const make = () => new SessionManager(options, store, () => clock.now, () => `id${++n}`.padEnd(32, '0'));
  return { clock, store, make };
}

test('rotates after inactivity and keeps the previous id', () => {
  const { clock, make } = harness();
  const m = make();
  const first = m.get().id;
  clock.now += 16 * 60_000;
  const s = m.get();
  assert.notEqual(s.id, first);
  assert.equal(s.previousId, first);
});

test('activity extends the session', () => {
  const { clock, make } = harness();
  const m = make();
  const first = m.get().id;
  for (let i = 0; i < 10; i++) {
    clock.now += 10 * 60_000;
    m.touch();
  }
  assert.equal(m.get().id, first);
});

test('rotates at max duration despite activity', () => {
  const { clock, make } = harness();
  const m = make();
  const first = m.get().id;
  for (let i = 0; i < 25; i++) {
    clock.now += 10 * 60_000;
    m.touch();
  }
  assert.notEqual(m.get().id, first);
});

test('two tabs sharing storage share the session and its rotation', () => {
  const { clock, store, make } = harness();
  const tabA = make();
  const tabB = make();
  assert.equal(tabA.get().id, tabB.get().id);
  clock.now += 16 * 60_000;
  const rotated = tabA.get().id;
  assert.equal(tabB.get().id, rotated);
  assert.ok(store.value?.includes(rotated));
});

test('sampling is deterministic per session id', () => {
  assert.equal(isSampled('00000000'.padEnd(32, 'a'), 0.1), true);
  assert.equal(isSampled('ffffffff'.padEnd(32, 'a'), 0.1), false);
  const ids = Array.from({ length: 10_000 }, (_, i) => (i * 2654435761 >>> 0).toString(16).padStart(8, '0'));
  const rate = ids.filter((id) => isSampled(id, 0.25)).length / ids.length;
  assert.ok(Math.abs(rate - 0.25) < 0.02, `rate ${rate}`);
});
