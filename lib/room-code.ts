import { customAlphabet } from "nanoid";

// No confusing characters (0/O, 1/I/L)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const newRoomCode = customAlphabet(ALPHABET, 5);
export const newId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  12
);
