import { vi } from "vitest";

/**
 * Hook registry mock.
 *
 * The module's hook callbacks are closures created inside `register*()`
 * functions and are never exported — capturing them through this spy is the
 * only way to drive them from a test, and it exercises the registration
 * itself as a bonus (a test can assert which hooks were registered, and in
 * what order).
 */

export interface HookRegistry {
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  call: ReturnType<typeof vi.fn>;
  callAll: ReturnType<typeof vi.fn>;
  _registered: Map<string, Function[]>;
}

export function makeHookRegistry(): HookRegistry {
  const registered = new Map<string, Function[]>();

  const record = (event: string, cb: Function) => {
    if (!registered.has(event)) registered.set(event, []);
    registered.get(event)!.push(cb);
    return cb;
  };

  return {
    on: vi.fn(record),
    once: vi.fn(record),
    off: vi.fn((event: string, cb: Function) => {
      const list = registered.get(event);
      if (!list) return;
      const i = list.indexOf(cb);
      if (i >= 0) list.splice(i, 1);
    }),
    call: vi.fn(),
    callAll: vi.fn(),
    _registered: registered,
  };
}

function registry(): HookRegistry {
  const hooks = (globalThis as any).Hooks as HookRegistry;
  if (!hooks?._registered) {
    throw new Error(
      "Hooks registry not installed. Did tests/helpers/setup.ts run?",
    );
  }
  return hooks;
}

/** Every callback registered for `event`, in registration order. */
export function getHookCallbacks(event: string): Function[] {
  return [...(registry()._registered.get(event) ?? [])];
}

/**
 * A single registered callback. Throws rather than returning undefined so a
 * typo'd event name fails loudly instead of producing a confusing
 * "cb is not a function" later.
 */
export function getHookCallback(event: string, index = 0): Function {
  const list = getHookCallbacks(event);
  if (!list.length) {
    const known = [...registry()._registered.keys()].join(", ") || "(none)";
    throw new Error(`No callback registered for "${event}". Registered: ${known}`);
  }
  if (!list[index]) {
    throw new Error(`Only ${list.length} callback(s) for "${event}", wanted index ${index}`);
  }
  return list[index];
}

/** Which events have at least one registration, in first-registration order. */
export function getRegisteredHookEvents(): string[] {
  return [...registry()._registered.keys()];
}

/**
 * Fires every callback for `event` sequentially, awaiting each.
 *
 * Sequential and awaited on purpose: `combat-handler` and `kata-activation`
 * both listen on `createChatMessage` and mutate the same actor flags, so
 * Promise.all would hide real ordering hazards.
 */
export async function fireHook(event: string, ...args: unknown[]): Promise<void> {
  for (const cb of getHookCallbacks(event)) {
    await cb(...args);
  }
}
