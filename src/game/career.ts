/**
 * THE CAREER: the titans as a title run, and the belts you win on it
 * (DESIGN §3.13). TITANS on the console always fights your next bout:
 *
 *   1  AMATEUR BOUT            RUSTHOOK      the amateur belt
 *   2  NATIONAL CHAMPIONSHIP   PISTONKAISER  the national belt
 *   3  INTERCONTINENTAL TITLE  VULTURE       the intercontinental belt
 *   4  TITLE DEFENCE           JUGGERNAUT    your intercontinental belt, on the line
 *   5  WORLD CHAMPIONSHIP      GOLIATH       the world belt
 *   6  WORLD TITLE DEFENCE     GOLIATH       your world belt, on the line, again and again:
 *                                            the REMATCH, and he's learned new moves
 *
 * Win your next bout and the one after opens. Lose a DEFENCE and the belt
 * is stripped from you; the rematch is for it back. The last bout repeats
 * for as long as you're champion: each one won is a defence, counted.
 *
 * The rules are pure (`record`, run under Node by check:strike); the save
 * lives in localStorage, so a career carries over between sessions.
 */

export type BeltId = 'amateur' | 'national' | 'intercontinental' | 'world';

export interface Belt {
  id: BeltId;
  /** On the rack, and in "THE ___ BELT". */
  name: string;
  /** What winning it makes you. */
  champion: string;
  /** The strap's colour, the plates' metal, and the centre stone. */
  strap: number;
  metal: number;
  gem: number;
}

// The neon palette's (config.ts), spelled out so the rules run under
// plain Node for the checks.
const CYAN = 0x19f0ff;
const EMBER = 0xff7a1a;
const MAGENTA = 0xff2bd6;
const RED = 0xff2b4e;
const GOLD = 0xffc84a;
const SILVER = 0xcfe6ff;

export const BELTS: readonly Belt[] = [
  { id: 'amateur', name: 'AMATEUR', champion: 'AMATEUR CHAMPION', strap: CYAN, metal: SILVER, gem: 0xffffff },
  { id: 'national', name: 'NATIONAL', champion: 'NATIONAL CHAMPION', strap: EMBER, metal: GOLD, gem: RED },
  { id: 'intercontinental', name: 'INTERCONTINENTAL', champion: 'INTERCONTINENTAL CHAMPION', strap: MAGENTA, metal: GOLD, gem: CYAN },
  { id: 'world', name: 'WORLD', champion: 'WORLD CHAMPION', strap: 0x2a3cff, metal: GOLD, gem: RED },
];

export const beltOf = (id: BeltId): Belt => BELTS.find((b) => b.id === id)!;

export interface Bout {
  title: string;
  /** Short enough for a card's second line. */
  short: string;
  /** Which titan (TITANS index). */
  titan: number;
  /** The belt a win takes, or the one you put on the line. */
  wins?: BeltId;
  defends?: BeltId;
  /** Its own fight (titans/fights.ts), if not the titan's usual one. */
  fight?: string;
  /** Said under the stakes on its banner. */
  note?: string;
}

export const BOUTS: readonly Bout[] = [
  { title: 'AMATEUR BOUT', short: 'AMATEUR', titan: 0, wins: 'amateur' },
  { title: 'NATIONAL CHAMPIONSHIP', short: 'NATIONAL TITLE', titan: 1, wins: 'national' },
  { title: 'INTERCONTINENTAL TITLE', short: 'INTERCONTINENTAL', titan: 2, wins: 'intercontinental' },
  { title: 'TITLE DEFENCE', short: 'TITLE DEFENCE', titan: 3, defends: 'intercontinental' },
  { title: 'WORLD CHAMPIONSHIP', short: 'WORLD TITLE', titan: 4, wins: 'world' },
  { title: 'WORLD TITLE DEFENCE', short: 'WORLD DEFENCE', titan: 4, defends: 'world', fight: 'GOLIATH REMATCH', note: 'HE HAS LEARNED NEW TRICKS' },
];

/** The last bout: the world champion's defences, forever. */
export const LAST = BOUTS.length - 1;

export interface Career {
  /** Your next bout (BOUTS index). */
  next: number;
  held: BeltId[];
  /** Defences won, per belt. */
  defences: Partial<Record<BeltId, number>>;
}

export const freshCareer = (): Career => ({ next: 0, held: [], defences: {} });

/** What a bout did to your belts. */
export interface Outcome {
  /** A belt won (or won back). */
  won: BeltId | null;
  /** A belt defended. */
  kept: BeltId | null;
  /** A belt stripped from you. */
  lost: BeltId | null;
}

/** Record bout `i`, won or lost. Changes `c`; says what it did to your belts. */
export function record(c: Career, i: number, won: boolean): Outcome {
  const out: Outcome = { won: null, kept: null, lost: null };
  const b = BOUTS[i];
  if (!b) return out;
  if (won) {
    if (b.wins && !c.held.includes(b.wins)) {
      c.held.push(b.wins);
      out.won = b.wins;
    }
    if (b.defends) {
      if (c.held.includes(b.defends)) {
        c.defences[b.defends] = (c.defences[b.defends] ?? 0) + 1;
        out.kept = b.defends;
      } else {
        c.held.push(b.defends);
        out.won = b.defends;
      }
    }
    if (i === c.next && i < LAST) c.next++;
  } else if (b.defends && c.held.includes(b.defends)) {
    c.held = c.held.filter((x) => x !== b.defends);
    out.lost = b.defends;
  }
  return out;
}

/** What a bout is FOR, said on its banner: "FOR THE NATIONAL BELT". */
export function stakes(c: Career, i: number): string {
  const b = BOUTS[i];
  if (!b) return '';
  if (b.defends) {
    const belt = beltOf(b.defends);
    return c.held.includes(b.defends) ? `YOUR ${belt.name} BELT ON THE LINE` : `TO WIN THE ${belt.name} BELT BACK`;
  }
  return b.wins ? `FOR THE ${beltOf(b.wins).name} BELT` : '';
}

/* ── the save ────────────────────────────────────────────────────────── */

const KEY = 'flux-career';

function load(): Career {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Career> | null;
    if (!raw || typeof raw.next !== 'number') return freshCareer();
    const ids = new Set(BELTS.map((b) => b.id));
    return {
      next: Math.min(LAST, Math.max(0, Math.floor(raw.next))),
      held: (raw.held ?? []).filter((x): x is BeltId => ids.has(x)),
      defences: raw.defences ?? {},
    };
  } catch {
    return freshCareer();
  }
}

/** Your career, as saved. */
export const career: Career = typeof window === 'undefined' ? freshCareer() : load();

/** Record a bout on your career, and save it. */
export function recordBout(i: number, won: boolean): Outcome {
  const out = record(career, i, won);
  try {
    localStorage.setItem(KEY, JSON.stringify(career));
  } catch {
    /* a private window: this session's career only */
  }
  return out;
}
