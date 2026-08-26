export const ICQ_SMILES = [
  "acute.gif",
  "aggressive.gif",
  "air_kiss.gif",
  "angel.gif",
  "bad.gif",
  "bb.gif",
  "beach.gif",
  "beee.gif",
  "big_boss.gif",
  "biggrin.gif",
  "blum2.gif",
  "blush.gif",
  "boast.gif",
  "bomb.gif",
  "boredom.gif",
  "bye.gif",
  "censored.gif",
  "clapping.gif",
  "cray.gif",
  "crazy.gif",
  "curtsey.gif",
  "dance4.gif",
  "dash1.gif",
  "dirol.gif",
  "drinks.gif",
  "feminist.gif",
  "flirt.gif",
  "focus.gif",
  "fool.gif",
  "friends.gif",
  "gamer4.gif",
  "girl_cray2.gif",
  "girl_crazy.gif",
  "girl_drink4.gif",
  "girl_haha.gif",
  "girl_hospital.gif",
  "girl_impossible.gif",
  "girl_in_love.gif",
  "girl_sigh.gif",
  "give_heart2.gif",
  "give_rose.gif",
  "good.gif",
  "heart.gif",
  "help.gif",
  "hi.gif",
  "hunter.gif",
  "hysteric.gif",
  "i-m_so_happy.gif",
  "ireful1.gif",
  "king.gif",
  "kiss2.gif",
  "kiss3.gif",
  "lazy.gif",
  "lol.gif",
  "mail1.gif",
  "mamba.gif",
  "mega_shock.gif",
  "mocking.gif",
  "moil.gif",
  "music.gif",
  "nea.gif",
  "new_russian.gif",
  "ok.gif",
  "paint2.gif",
  "pardon.gif",
  "party2.gif",
  "pleasantry.gif",
  "popcorn1.gif",
  "prankster2.gif",
  "preved.gif",
  "punish.gif",
  "rofl.gif",
  "sad.gif",
  "sarcastic.gif",
  "scare.gif",
  "scratch_one-s_head.gif",
  "search.gif",
  "secret.gif",
  "shock.gif",
  "shout.gif",
  "slow.gif",
  "smile.gif",
  "smoke.gif",
  "sorry2.gif",
  "spiteful.gif",
  "spruce_up.gif",
  "stop.gif",
  "tease.gif",
  "tender.gif",
  "thank_you2.gif",
  "this.gif",
  "training1.gif",
  "unknown.gif",
  "vampire.gif",
  "vava.gif",
  "victory.gif",
  "wacko2.gif",
  "wink.gif",
  "wizard.gif",
  "yahoo.gif",
  "yes3.gif",
  "yess.gif",
] as const;

export type IcqFilename = (typeof ICQ_SMILES)[number];

export type IcqToken = { type: "text"; value: string } | { type: "icq"; filename: IcqFilename };

const ICQ_FILE_SET = new Set<string>(ICQ_SMILES);
const ICQ_FILENAME_RE = /^[A-Za-z0-9._-]+\.gif$/;
const ICQ_TOKEN_RE = /^\[icq:([A-Za-z0-9._-]+\.gif)\]/;

const LEGACY_CODES: { code: string; filename: IcqFilename }[] = [
  { code: "*THUMBS UP*", filename: "good.gif" },
  { code: "*JOKINGLY*", filename: "tease.gif" },
  { code: "*IN LOVE*", filename: "girl_in_love.gif" },
  { code: "*DRINK*", filename: "drinks.gif" },
  { code: "*TIRED*", filename: "lazy.gif" },
  { code: "*STOP*", filename: "stop.gif" },
  { code: ":'-(", filename: "cray.gif" },
  { code: "O:-)", filename: "angel.gif" },
  { code: "]:-)", filename: "vampire.gif" },
  { code: "]:->", filename: "vampire.gif" },
  { code: ":-{}", filename: "kiss2.gif" },
  { code: ":-\\", filename: "scratch_one-s_head.gif" },
  { code: ":-)", filename: "smile.gif" },
  { code: ":-(", filename: "sad.gif" },
  { code: ";-)", filename: "wink.gif" },
  { code: ":-D", filename: "biggrin.gif" },
  { code: ":-P", filename: "blum2.gif" },
  { code: ":-p", filename: "blum2.gif" },
  { code: "=-O", filename: "shock.gif" },
  { code: ":-O", filename: "shock.gif" },
  { code: ":-*", filename: "kiss2.gif" },
  { code: ":'(", filename: "cray.gif" },
  { code: ":-@", filename: "ireful1.gif" },
  { code: ">:O", filename: "shout.gif" },
  { code: ":-[", filename: "blush.gif" },
  { code: ":-/", filename: "scratch_one-s_head.gif" },
  { code: ":-$", filename: "pardon.gif" },
  { code: ":-!", filename: "girl_hospital.gif" },
  { code: ":-X", filename: "secret.gif" },
  { code: "O:)", filename: "angel.gif" },
  { code: "O-)", filename: "angel.gif" },
  { code: "8-)", filename: "dirol.gif" },
  { code: ":)", filename: "smile.gif" },
  { code: ":(", filename: "sad.gif" },
  { code: ";)", filename: "wink.gif" },
  { code: ":D", filename: "biggrin.gif" },
  { code: ":P", filename: "blum2.gif" },
  { code: ":p", filename: "blum2.gif" },
  { code: ":O", filename: "shock.gif" },
  { code: "8)", filename: "dirol.gif" },
  { code: ":X", filename: "secret.gif" },
];
LEGACY_CODES.sort((a, b) => b.code.length - a.code.length);

export function isIcqFilename(value: string): value is IcqFilename {
  return ICQ_FILENAME_RE.test(value) && ICQ_FILE_SET.has(value);
}

export function icqSrc(filename: IcqFilename) {
  return `/images/icq_smiles_hd/${filename}`;
}

export function icqToken(filename: IcqFilename) {
  return `[icq:${filename}]`;
}

export function icqTitle(filename: string) {
  return filename.replace(/\.gif$/i, "").replace(/_/g, " ").replace(/-/g, "'");
}

export function tokenizeIcq(text: string): IcqToken[] {
  const parts: IcqToken[] = [];
  let i = 0;
  while (i < text.length) {
    const icqHit = text.slice(i).match(ICQ_TOKEN_RE);
    if (icqHit && isIcqFilename(icqHit[1] ?? "")) {
      parts.push({ type: "icq", filename: icqHit[1] as IcqFilename });
      i += icqHit[0].length;
      continue;
    }
    const legacy = LEGACY_CODES.find((item) => text.startsWith(item.code, i));
    if (legacy) {
      parts.push({ type: "icq", filename: legacy.filename });
      i += legacy.code.length;
      continue;
    }
    const next = parts.at(-1);
    if (next?.type === "text") next.value += text[i];
    else parts.push({ type: "text", value: text[i] ?? "" });
    i += 1;
  }
  return parts;
}
