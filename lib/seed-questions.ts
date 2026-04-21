export type SeedChoice = { id: string; label: string };
export type SeedQuestion = {
  prompt: string;
  choices: SeedChoice[];
  correctChoiceId: string;
};

export const SEED_QUESTIONS: SeedQuestion[] = [
  {
    prompt: "What is MiniPay?",
    choices: [
      { id: "a", label: "A meme coin on Ethereum" },
      { id: "b", label: "A stablecoin wallet built on Celo" },
      { id: "c", label: "A centralized exchange" },
      { id: "d", label: "A crypto debit card" },
    ],
    correctChoiceId: "b",
  },
  {
    prompt: "Which blockchain powers MiniPay?",
    choices: [
      { id: "a", label: "Bitcoin" },
      { id: "b", label: "Solana" },
      { id: "c", label: "Celo" },
      { id: "d", label: "Polygon" },
    ],
    correctChoiceId: "c",
  },
  {
    prompt: "MiniPay lets you send money using just a…",
    choices: [
      { id: "a", label: "0x address" },
      { id: "b", label: "Phone number" },
      { id: "c", label: "Email + password" },
      { id: "d", label: "Bank account" },
    ],
    correctChoiceId: "b",
  },
  {
    prompt: "Celo lets you pay gas fees with which stablecoin?",
    choices: [
      { id: "a", label: "USDT (Ethereum)" },
      { id: "b", label: "DAI" },
      { id: "c", label: "USDm (cUSD)" },
      { id: "d", label: "USDC (Ethereum)" },
    ],
    correctChoiceId: "c",
  },
  {
    prompt: "What does 'Mento' refer to on Celo?",
    choices: [
      { id: "a", label: "A governance token" },
      { id: "b", label: "The local-currency stablecoin protocol" },
      { id: "c", label: "An NFT marketplace" },
      { id: "d", label: "A bridge" },
    ],
    correctChoiceId: "b",
  },
  {
    prompt: "Roughly how many MiniPay activations are there worldwide?",
    choices: [
      { id: "a", label: "100K" },
      { id: "b", label: "1M" },
      { id: "c", label: "14M+" },
      { id: "d", label: "500M" },
    ],
    correctChoiceId: "c",
  },
  {
    prompt: "Celo's average block time is about…",
    choices: [
      { id: "a", label: "10 seconds" },
      { id: "b", label: "1 second" },
      { id: "c", label: "1 minute" },
      { id: "d", label: "10 minutes" },
    ],
    correctChoiceId: "b",
  },
  {
    prompt: "MiniPay is available in over how many countries?",
    choices: [
      { id: "a", label: "5" },
      { id: "b", label: "20" },
      { id: "c", label: "60+" },
      { id: "d", label: "200" },
    ],
    correctChoiceId: "c",
  },
  {
    prompt: "Which of these is true about Celo today?",
    choices: [
      { id: "a", label: "It's a Bitcoin sidechain" },
      { id: "b", label: "It's an Ethereum L2" },
      { id: "c", label: "It's a standalone L1" },
      { id: "d", label: "It's a Cosmos zone" },
    ],
    correctChoiceId: "b",
  },
  {
    prompt: "What makes MiniPay feel different from a 'crypto wallet'?",
    choices: [
      { id: "a", label: "No seed phrase, no gas worries — works like mobile money" },
      { id: "b", label: "It requires a hardware wallet" },
      { id: "c", label: "It only holds NFTs" },
      { id: "d", label: "It works only on desktop" },
    ],
    correctChoiceId: "a",
  },
];
