// @ts-nocheck
/**
 * Actor references that survive unlinked tokens.
 *
 * An unlinked token's synthetic actor shares its `id` with the base actor in
 * the sidebar, so `game.actors.get(id)` silently resolves to the wrong
 * document (and can't tell two "Honorless Ronin" tokens apart). Chat cards
 * therefore store `actor.uuid` (`Scene.x.Token.y.Actor.z` for unlinked
 * tokens) and resolve it with `fromUuidSync`. Plain ids are still accepted so
 * cards posted before this change keep working.
 */

export function actorRef(actor) {
  return actor?.uuid ?? actor?.id ?? null;
}

export function resolveActor(ref) {
  if (!ref) return null;
  if (String(ref).includes(".") && typeof fromUuidSync === "function") {
    try {
      return fromUuidSync(ref) ?? null;
    } catch {
      return null;
    }
  }
  return game.actors.get(ref) ?? null;
}

/** The speaking actor of a message, resolving the token's actor when there is one. */
export function speakerActor(message) {
  const speaker = message?.speaker;
  if (!speaker) return null;
  const fromToken = typeof ChatMessage.getSpeakerActor === "function" ? ChatMessage.getSpeakerActor(speaker) : null;
  return fromToken ?? (speaker.actor ? game.actors.get(speaker.actor) ?? null : null);
}

/**
 * Every actor that can carry kata effects: world actors plus the synthetic
 * actors of unlinked tokens in every scene.
 */
export function kataEffectActors() {
  const actors = [...(game.actors ?? [])];
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (!token.actorLink && token.actor) actors.push(token.actor);
    }
  }
  return [...new Set(actors)];
}

/**
 * The actor who made an l5r5e roll. The system restores `roll.l5r5e.actor`
 * from its uuid on every client (the token's actor when unlinked); the
 * message speaker only carries the base actor id.
 */
export function rollActor(message, l5rData) {
  const actor = l5rData?.actor;
  if (actor && typeof actor === "object" && typeof actor.getFlag === "function") return actor;
  return speakerActor(message);
}
