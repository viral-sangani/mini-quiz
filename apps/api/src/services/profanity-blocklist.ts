// Username profanity blocklist. Conservative — covers obvious slurs and abusive
// terms. Matches against the lowercased username and any substring (so
// "fuckface" and "fck" both match). Prefer false positives over false
// negatives; admin can manually adjust a username if a benign one collides.
//
// Substrings are intentionally short fragments — adding a longer term that
// fully contains a fragment listed here is redundant.

const BLOCKED_FRAGMENTS = [
  // English profanity / slurs
  "fuck",
  "fck",
  "shit",
  "sht",
  "cunt",
  "pussy",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "cock",
  "wank",
  "twat",
  "nigg",
  "fag",
  "kike",
  "spic",
  "chink",
  "gook",
  "tranny",
  "retard",
  "rape",
  "molest",
  "pedo",
  "nazi",
  "hitler",
  "kkk",
  "isis",
  // Sexual / explicit
  "porn",
  "sex",
  "xxx",
  "anal",
  "boob",
  "tits",
  "cum",
  "jizz",
  "horny",
  "orgasm",
  // Hindi / regional (common roman-script forms)
  "chutiya",
  "chut",
  "lund",
  "madarchod",
  "behenchod",
  "bhenchod",
  "bhosdi",
  "bhosda",
  "gaand",
  "harami",
  "kutta",
  "kamina",
  "randi",
  "saala",
  "saale",
  // Spam / impersonation
  "admin",
  "support",
  "minipay",
  "celo",
  "official",
  "system",
  "moderator",
];

export function isBlockedUsername(value: string): boolean {
  const lower = value.toLowerCase();
  return BLOCKED_FRAGMENTS.some((frag) => lower.includes(frag));
}
