/** Small deterministic PRNG so demo data is the same on every machine. */
export function createRandom(seed: number) {
  let t = seed >>> 0
  const next = () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    /** Integer in [min, max]. */
    int(min: number, max: number) {
      return Math.floor(next() * (max - min + 1)) + min
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)]
    },
    chance(probability: number) {
      return next() < probability
    },
    /** Pick by weights: weighted([["a", 3], ["b", 1]]). */
    weighted<T>(entries: readonly (readonly [T, number])[]): T {
      const total = entries.reduce((sum, [, w]) => sum + w, 0)
      let roll = next() * total
      for (const [value, w] of entries) {
        roll -= w
        if (roll <= 0) return value
      }
      return entries[entries.length - 1][0]
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    },
  }
}

export type Random = ReturnType<typeof createRandom>
