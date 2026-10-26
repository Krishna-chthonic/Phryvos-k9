import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  destroySession,
  getSession,
  sessionCount,
  touchSession,
} from "../lib/session/store.ts";

const key = () => Buffer.alloc(32, 3);

/** Replace Date.now with a manually advanced clock; restore after fn. */
function withClock(fn: (advance: (ms: number) => void) => void) {
  const real = Date.now.bind(Date);
  let t = Date.now();
  Date.now = () => t;
  try {
    fn((ms) => (t += ms));
  } finally {
    Date.now = real;
  }
}

describe("session store", () => {
  it("creates and fetches a session", () => {
    const token = createSession(key(), 60_000);
    const s = getSession(token);
    assert.ok(s);
    assert.ok(s.masterKey.equals(key()));
  });

  it("unknown / missing token returns null", () => {
    assert.equal(getSession("does-not-exist"), null);
    assert.equal(getSession(null), null);
    assert.equal(getSession(undefined), null);
  });

  it("expired sessions are reaped on read", () => {
    withClock((advance) => {
      const before = sessionCount();
      const token = createSession(key(), 1000);
      advance(1500);
      assert.equal(getSession(token), null);
      assert.equal(sessionCount(), before); // reaped, not orphaned
    });
  });

  it("touchSession extends idle expiry (sliding lock)", () => {
    withClock((advance) => {
      const token = createSession(key(), 60_000);
      advance(90_000); // would be expired by idle now
      touchSession(token, 60_000); // activity just happened → still valid
      assert.ok(getSession(token));
    });
  });

  it("destroySession removes the entry", () => {
    const token = createSession(key(), 60_000);
    assert.ok(getSession(token));
    destroySession(token);
    assert.equal(getSession(token), null);
    destroySession(null); // no-op, no throw
  });
});
