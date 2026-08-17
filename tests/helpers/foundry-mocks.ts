import { vi } from "vitest";

/**
 * Foundry document mocks for the l5r5e system.
 *
 * Design rule: these mocks model the schema that `systems/l5r5e/template.json`
 * actually declares, not an idealized one. That is deliberate — it is what
 * makes the suite catch "this code reads a path that does not exist" bugs
 * (e.g. `system.silhouette`, which the l5r5e system does not define at all).
 *
 * Verified against template.json:
 *   - endurance / composure / focus / vigilance  → flat numbers
 *   - fatigue / strife / void_points             → { max, value }
 *   - social.honor                               → flat number, 0-100
 *   - stance                                     → plain string
 *   - character skills → system.skills.<category>.<skill>
 *   - npc skills       → system.skills.<category>   (flat category number)
 *   - silhouette       → DOES NOT EXIST anywhere in the system
 */

export const MODULE_NS = "l5r5e-combat-helper";

// ── generic helpers ─────────────────────────────────────────────────────────

function isPlainObject(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Set);
}

/** Recursive merge of `source` over a structural clone of `base`. */
export function deepMerge(base: any, source: any): any {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!source) return out;
  for (const [k, v] of Object.entries(source)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

/**
 * Applies a Foundry-style update payload, which may use dot-paths
 * (`{"system.fatigue.value": 4}`) and/or nested objects.
 */
export function applyUpdatePayload(doc: any, data: Record<string, any>): void {
  for (const [path, value] of Object.entries(data ?? {})) {
    if (!path.includes(".")) {
      doc[path] = isPlainObject(value) && isPlainObject(doc[path])
        ? deepMerge(doc[path], value)
        : value;
      continue;
    }
    const parts = path.split(".");
    let cursor = doc;
    for (const part of parts.slice(0, -1)) {
      if (!isPlainObject(cursor[part])) cursor[part] = {};
      cursor = cursor[part];
    }
    cursor[parts.at(-1)!] = value;
  }
}

/** An EmbeddedCollection stand-in: array semantics plus .get()/.has(). */
export class MockCollection<T extends { id?: string }> extends Array<T> {
  get(id: string): T | undefined {
    return this.find((e) => e?.id === id);
  }
  has(id: string): boolean {
    return this.some((e) => e?.id === id);
  }
  get contents(): T[] {
    return [...this];
  }
  // Keeps map/filter/slice from trying to construct a MockCollection with a
  // numeric length argument, which would throw.
  static get [Symbol.species]() {
    return Array;
  }
}

// ── flag store, shared by every document type ───────────────────────────────

function installFlagStore(doc: any, initial: Record<string, any> = {}): void {
  doc.flags = deepMerge({}, initial);

  // Reads are cloned so that a caller mutating the returned value in place
  // cannot silently "work" against the mock when it would not against Foundry.
  doc.getFlag = vi.fn((ns: string, key: string) => {
    const v = doc.flags?.[ns]?.[key];
    return v === undefined ? undefined : structuredClone(v);
  });
  doc.setFlag = vi.fn(async (ns: string, key: string, value: any) => {
    doc.flags[ns] ??= {};
    doc.flags[ns][key] = structuredClone(value);
    return doc;
  });
  doc.unsetFlag = vi.fn(async (ns: string, key: string) => {
    if (doc.flags?.[ns]) delete doc.flags[ns][key];
    return doc;
  });
}

// ── Item ────────────────────────────────────────────────────────────────────

const WEAPON_DEFAULTS = {
  category: "",
  skill: "melee",
  readied: false,
  range: "0",
  damage: 0,
  deadliness: 0,
  grip_1: "",
  grip_2: "",
  // from the shared `item` template
  equipped: false,
  quantity: 1,
  weight: 0,
  rarity: "0",
  zeni: "0",
  properties: [] as any[],
};

const ARMOR_DEFAULTS = {
  armor: { physical: 0, supernatural: 0 },
  equipped: false,
  quantity: 1,
  properties: [] as any[],
};

export interface MockItemInit {
  id?: string;
  name?: string;
  type?: string;
  system?: Record<string, any>;
  compendiumSource?: string;
  flags?: Record<string, any>;
}

export function createMockItem(init: MockItemInit = {}): any {
  const type = init.type ?? "weapon";
  const defaults =
    type === "weapon" ? WEAPON_DEFAULTS : type === "armor" ? ARMOR_DEFAULTS : {};

  const item: any = {
    id: init.id ?? `item-${Math.random().toString(36).slice(2, 9)}`,
    name: init.name ?? "Mock Item",
    type,
    system: deepMerge(defaults, init.system ?? {}),
    _stats: { compendiumSource: init.compendiumSource ?? null },
  };
  item._id = item.id;
  installFlagStore(item, init.flags);
  return item;
}

/** Convenience: a readied+equipped weapon, the common case in combat tests. */
export function createMockWeapon(init: MockItemInit = {}): any {
  return createMockItem({
    ...init,
    type: "weapon",
    system: { equipped: true, readied: true, ...(init.system ?? {}) },
  });
}

// ── ActiveEffect ────────────────────────────────────────────────────────────

export function createMockActiveEffect(init: any = {}): any {
  const effect: any = {
    id: init.id ?? `ae-${Math.random().toString(36).slice(2, 9)}`,
    name: init.name ?? init.label ?? "Mock Effect",
    label: init.label ?? init.name ?? "Mock Effect",
    icon: init.icon ?? null,
    img: init.img ?? null,
    changes: init.changes ?? [],
    statuses: new Set<string>(init.statuses ?? []),
  };
  effect._id = effect.id;
  installFlagStore(effect, init.flags);
  return effect;
}

// ── Actor ───────────────────────────────────────────────────────────────────

const PC_SKILLS = {
  artisan: { aesthetics: 0, composition: 0, design: 0, smithing: 0 },
  martial: { fitness: 0, melee: 0, ranged: 0, unarmed: 0, meditation: 0, tactics: 0 },
  scholar: { culture: 0, government: 0, medicine: 0, sentiment: 0, theology: 0 },
  social: { command: 0, courtesy: 0, games: 0, performance: 0 },
  trade: { commerce: 0, labor: 0, seafaring: 0, skulduggery: 0, survival: 0 },
};

const NPC_SKILLS = { artisan: 0, martial: 0, scholar: 0, social: 0, trade: 0 };

function baseSystem(type: string): Record<string, any> {
  return {
    identity: { school_rank: 1, clan: "", family: "", school: "" },
    rings: { earth: 1, air: 1, water: 1, fire: 1, void: 1 },
    social: { honor: 0, glory: 0, status: 0 },
    skills: structuredClone(type === "npc" ? NPC_SKILLS : PC_SKILLS),
    // conflict template — note the flat vs {max,value} split is real
    endurance: 0,
    composure: 0,
    focus: 0,
    vigilance: 0,
    void_points: { max: 1, value: 0 },
    fatigue: { max: 1, value: 0 },
    strife: { max: 1, value: 0 },
    stance: "void",
    prepared: true,
    // NOTE: no `silhouette` — the l5r5e system genuinely does not define it.
  };
}

export interface MockActorInit {
  id?: string;
  name?: string;
  type?: "character" | "npc";
  system?: Record<string, any>;
  items?: any[];
  effects?: any[];
  flags?: Record<string, any>;
  statuses?: string[];
  isOwner?: boolean;
  ownerUserIds?: string[];
}

export function createMockActor(init: MockActorInit = {}): any {
  const type = init.type ?? "character";

  const actor: any = {
    id: init.id ?? `actor-${Math.random().toString(36).slice(2, 9)}`,
    name: init.name ?? "Mock Actor",
    type,
    system: deepMerge(baseSystem(type), init.system ?? {}),
    items: new MockCollection<any>(...(init.items ?? [])),
    effects: new MockCollection<any>(...(init.effects ?? [])),
    statuses: new Set<string>(init.statuses ?? []),
    isOwner: init.isOwner ?? true,
    prototypeToken: { width: 1, height: 1, name: init.name ?? "Mock Actor" },
  };
  actor._id = actor.id;

  installFlagStore(actor, init.flags);

  actor.update = vi.fn(async (data: Record<string, any>) => {
    applyUpdatePayload(actor, data);
    return actor;
  });

  // Mutates BOTH representations: different call sites read different ones
  // (actor-utils reads `statuses`, technique-engine reads `effects[].statuses`).
  actor.toggleStatusEffect = vi.fn(async (statusId: string, options: any = {}) => {
    const active = options.active ?? !actor.statuses.has(statusId);
    if (active) {
      actor.statuses.add(statusId);
      if (!actor.effects.some((e: any) => e.statuses?.has(statusId))) {
        actor.effects.push(createMockActiveEffect({ name: statusId, statuses: [statusId] }));
      }
    } else {
      actor.statuses.delete(statusId);
      for (let i = actor.effects.length - 1; i >= 0; i--) {
        if (actor.effects[i].statuses?.has(statusId)) actor.effects.splice(i, 1);
      }
    }
    return active;
  });

  actor.createEmbeddedDocuments = vi.fn(async (docType: string, dataArray: any[]) => {
    if (docType !== "ActiveEffect") return [];
    const created = dataArray.map((d) => createMockActiveEffect(d));
    actor.effects.push(...created);
    for (const e of created) for (const s of e.statuses) actor.statuses.add(s);
    return created;
  });

  actor.deleteEmbeddedDocuments = vi.fn(async (docType: string, ids: string[]) => {
    if (docType !== "ActiveEffect") return [];
    const removed: any[] = [];
    for (const id of ids ?? []) {
      const idx = actor.effects.findIndex((e: any) => e.id === id);
      if (idx >= 0) removed.push(...actor.effects.splice(idx, 1));
    }
    return removed;
  });

  const ownerIds = init.ownerUserIds ?? [];
  actor.testUserPermission = vi.fn(
    (user: any, _level: string) => ownerIds.includes(user?.id) || Boolean(init.isOwner),
  );

  return actor;
}

// ── Roll / ChatMessage ──────────────────────────────────────────────────────

export interface MockRollInit {
  skillId?: string;
  skillCatId?: string;
  stance?: string;
  difficulty?: number;
  totalSuccess?: number;
  totalBonus?: number;
  opportunity?: number;
  strife?: number;
  rnkEnded?: boolean;
  item?: any;
  [k: string]: any;
}

/**
 * `roll.l5r5e` only ever needs the handful of fields the module reads:
 * rnkEnded, skillId, stance, item{name,system.technique_type,_stats}, and
 * summary{totalSuccess, opportunity}.
 */
export function createMockRoll(init: MockRollInit = {}): any {
  const difficulty = init.difficulty ?? 2;
  const totalSuccess = init.totalSuccess ?? 0;
  return {
    l5r5e: {
      rnkEnded: init.rnkEnded ?? true,
      skillId: init.skillId ?? "melee",
      skillCatId: init.skillCatId ?? "martial",
      stance: init.stance ?? "void",
      difficulty,
      item: init.item ?? null,
      summary: {
        totalSuccess,
        // matches systems/l5r5e/scripts/dice/roll.js
        totalBonus: init.totalBonus ?? Math.max(0, totalSuccess - difficulty),
        opportunity: init.opportunity ?? 0,
        strife: init.strife ?? 0,
      },
    },
  };
}

export interface MockMessageInit {
  id?: string;
  rolls?: any[];
  speaker?: Record<string, any>;
  content?: string;
  flags?: Record<string, any>;
  whisper?: string[];
  [k: string]: any;
}

export function createMockMessage(init: MockMessageInit = {}): any {
  const msg: any = {
    id: init.id ?? `msg-${Math.random().toString(36).slice(2, 9)}`,
    rolls: init.rolls ?? [],
    speaker: init.speaker ?? {},
    content: init.content ?? "",
    whisper: init.whisper ?? [],
    ownership: init.ownership ?? {},
  };
  msg._id = msg.id;
  installFlagStore(msg, init.flags);
  msg.update = vi.fn(async (data: Record<string, any>) => {
    applyUpdatePayload(msg, data);
    return msg;
  });
  msg.delete = vi.fn(async () => msg);
  return msg;
}

/** A world collection: iterable, indexable, with .get(). */
export class MockWorldCollection<T extends { id?: string }> extends MockCollection<T> {}
