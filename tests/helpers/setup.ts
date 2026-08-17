import { beforeEach, afterEach, expect, vi } from "vitest";
import en from "../../lang/en.json";
import { makeHookRegistry } from "./hooks";
import {
  MockWorldCollection,
  createMockMessage,
  deepMerge,
} from "./foundry-mocks";

/**
 * Installs the Foundry globals before every test and enforces the
 * anti-silent-failure policy after every test.
 *
 * Globals are rebuilt from scratch in `beforeEach` rather than cleared:
 * `game.actors`, `game.messages` and `game.user.targets` are collections whose
 * *contents* would otherwise leak between tests, which mock-call clearing does
 * not address.
 */

// ── i18n ────────────────────────────────────────────────────────────────────

const missingI18nKeys = new Set<string>();
let allowedMissingI18n: RegExp[] = [];

/**
 * Declares that this test is expected to hit a missing i18n key.
 * Without it, any missing key fails the test in afterEach.
 */
export function expectMissingI18n(pattern: RegExp): void {
  allowedMissingI18n.push(pattern);
}

function localize(key: string): string {
  const table = en as Record<string, string>;
  if (key in table) return table[key];
  missingI18nKeys.add(key);
  // Real Foundry returns the key itself when it cannot resolve it. Matching
  // that keeps control flow identical to production; the afterEach assertion
  // is what turns it into a failure.
  return key;
}

function format(key: string, data: Record<string, any> = {}): string {
  return localize(key).replace(/\{(\w+)\}/g, (m, name) =>
    name in (data ?? {}) ? String(data[name]) : m,
  );
}

// ── console / notification policy ───────────────────────────────────────────

const MODULE_LOG_RE = /L5R5e Combat Helper/;

interface Recorded {
  channel: "error" | "warn" | "notify-error" | "notify-warn";
  args: unknown[];
  /** Set once a declaration has claimed this entry, so re-scanning is idempotent. */
  matched?: boolean;
}

let recorded: Recorded[] = [];
let expectedLogs: { channel: Recorded["channel"] | "any"; pattern: RegExp; seen: boolean }[] = [];
let realConsoleError: typeof console.error;
let realConsoleWarn: typeof console.warn;

function declare(channel: Recorded["channel"] | "any", pattern: RegExp): void {
  expectedLogs.push({ channel, pattern, seen: false });
}

/** Declares an expected module-tagged console.error (or ui.notifications.error). */
export function expectModuleError(pattern: RegExp): void {
  declare("any", pattern);
}
/** Declares an expected module-tagged console.warn (or ui.notifications.warn). */
export function expectModuleWarn(pattern: RegExp): void {
  declare("any", pattern);
}

function recordedText(r: Recorded): string {
  return r.args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/** True if the entry looks like a module failure rather than incidental noise. */
function isModuleFailure(r: Recorded): boolean {
  if (r.channel === "notify-error") return true;
  const first = r.args[0];
  if (typeof first === "string" && MODULE_LOG_RE.test(first)) return true;
  return r.args.some((a) => a instanceof Error);
}

/**
 * Exposed so the positive-control test can verify the detector actually fires.
 * Returns the entries that would fail the current test, and marks matching
 * declarations as satisfied.
 *
 * Idempotent: entries already claimed by a declaration stay claimed, so a test
 * may call this and still have afterEach re-run it without double-reporting.
 */
export function collectUndeclaredFailures(): Recorded[] {
  const undeclared: Recorded[] = [];
  for (const r of recorded) {
    if (!isModuleFailure(r) || r.matched) continue;
    const text = recordedText(r);
    const match = expectedLogs.find((e) => !e.seen && e.pattern.test(text));
    if (match) {
      match.seen = true;
      r.matched = true;
    } else {
      undeclared.push(r);
    }
  }
  return undeclared;
}

/** Drops all recorded log entries and declarations (used by the control test). */
export function resetLogPolicy(): void {
  recorded = [];
  expectedLogs = [];
  missingI18nKeys.clear();
  allowedMissingI18n = [];
}

// ── globals ─────────────────────────────────────────────────────────────────

export function installFoundryGlobals(): void {
  const g = globalThis as any;

  const users = new MockWorldCollection<any>(
    { id: "gm", name: "GM", isGM: true, active: true },
    { id: "p1", name: "Player One", isGM: false, active: true },
  );

  g.game = {
    actors: new MockWorldCollection<any>(),
    messages: new MockWorldCollection<any>(),
    items: new MockWorldCollection<any>(),
    users,
    user: { id: "gm", name: "GM", isGM: true, active: true, targets: new Set() },
    settings: {
      // Module master switch defaults on; individual tests override.
      get: vi.fn(() => true),
      register: vi.fn(),
      registerMenu: vi.fn(),
      set: vi.fn(async () => undefined),
    },
    i18n: { localize: vi.fn(localize), format: vi.fn(format) },
    packs: { get: vi.fn(() => undefined) },
    combat: null,
    combats: new MockWorldCollection<any>(),
    l5r5e: {
      DicePickerDialog: vi.fn(function (this: any, params: any) {
        this.params = params;
        this.render = vi.fn();
        return this;
      }),
    },
  };

  g.Hooks = makeHookRegistry();

  g.ChatMessage = {
    create: vi.fn(async (data: any) => {
      const msg = createMockMessage(data);
      g.game.messages.push(msg);
      return msg;
    }),
    getSpeaker: vi.fn(({ actor }: any = {}) => ({
      actor: actor?.id ?? null,
      alias: actor?.name ?? null,
    })),
  };

  g.ui = {
    notifications: {
      warn: vi.fn((...args: unknown[]) => recorded.push({ channel: "notify-warn", args })),
      error: vi.fn((...args: unknown[]) => recorded.push({ channel: "notify-error", args })),
      info: vi.fn(),
    },
  };

  // No `.tokens`: token-effects early-returns on `canvas?.tokens`, so aura
  // side effects stay disabled for tests that do not opt in.
  g.canvas = {};

  g.CONST = {
    DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3, INHERIT: -1 },
  };

  g.CONFIG = { statusEffects: [], l5r5e: { stances: ["earth", "air", "water", "fire", "void"] } };

  g.foundry = {
    utils: {
      deepClone: (v: any) => structuredClone(v),
      duplicate: (v: any) => structuredClone(v),
      mergeObject: (target: any, source: any) => deepMerge(target, source),
      randomID: () => Math.random().toString(36).slice(2, 18),
    },
    applications: { api: { DialogV2: { confirm: vi.fn(async () => false) } } },
  };

  g.Dialog = vi.fn(function (this: any) {
    this.render = vi.fn();
    return this;
  }) as any;
  g.Dialog.confirm = vi.fn(async () => false);

  g.FormApplication = class {};
  g.Handlebars = { registerHelper: vi.fn() };
}

/** Opts a test into canvas token access (for token-effects aura tests). */
export function withCanvasTokens(tokens: any[]): void {
  (globalThis as any).canvas = { tokens: { placeables: tokens }, grid: { size: 100 } };
}

// ── lifecycle ───────────────────────────────────────────────────────────────

beforeEach(() => {
  resetLogPolicy();
  installFoundryGlobals();

  realConsoleError = console.error;
  realConsoleWarn = console.warn;
  console.error = vi.fn((...args: unknown[]) => recorded.push({ channel: "error", args }));
  console.warn = vi.fn((...args: unknown[]) => recorded.push({ channel: "warn", args }));
});

afterEach(() => {
  console.error = realConsoleError;
  console.warn = realConsoleWarn;

  const undeclared = collectUndeclaredFailures();
  const unmet = expectedLogs.filter((e) => !e.seen);
  const badKeys = [...missingI18nKeys].filter(
    (k) => !allowedMissingI18n.some((re) => re.test(k)),
  );

  const problems: string[] = [];
  if (undeclared.length) {
    problems.push(
      `Undeclared module failure(s):\n${undeclared
        .map((r) => `  [${r.channel}] ${recordedText(r)}`)
        .join("\n")}\nIf intentional, declare it with expectModuleError(/…/).`,
    );
  }
  if (unmet.length) {
    problems.push(
      `Declared log expectation never matched: ${unmet.map((e) => e.pattern).join(", ")}`,
    );
  }
  if (badKeys.length) {
    problems.push(
      `Missing i18n key(s) in lang/en.json:\n${badKeys.map((k) => `  ${k}`).join("\n")}`,
    );
  }

  resetLogPolicy();
  if (problems.length) expect.unreachable(problems.join("\n\n"));
});
