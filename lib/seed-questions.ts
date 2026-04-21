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
      { id: "a", label: "A crypto exchange" },
      { id: "b", label: "A digital dollar wallet built on Celo" },
      { id: "c", label: "A meme coin" },
      { id: "d", label: "A savings app with no crypto" },
    ],
    correctChoiceId: "b",
  },
  {
    prompt: "Where did MiniPay launch first?",
    choices: [
      { id: "a", label: "Inside the Opera Mini browser" },
      { id: "b", label: "As an Apple Watch app" },
      { id: "c", label: "As a Telegram bot" },
      { id: "d", label: "As a desktop Chrome extension" },
    ],
    correctChoiceId: "a",
  },
  {
    prompt: "To send money on MiniPay, you only need the recipient's…",
    choices: [
      { id: "a", label: "Full wallet address (0x...)" },
      { id: "b", label: "Phone number" },
      { id: "c", label: "Bank account" },
      { id: "d", label: "Passport number" },
    ],
    correctChoiceId: "b",
  },
  {
    prompt: "Which of these stablecoins does MiniPay support?",
    choices: [
      { id: "a", label: "Only USDC" },
      { id: "b", label: "Only USDT" },
      { id: "c", label: "USDC, USDT and USDm" },
      { id: "d", label: "Only Bitcoin" },
    ],
    correctChoiceId: "c",
  },
  {
    prompt: "In MiniPay, who pays the 'gas' (transaction fee)?",
    choices: [
      { id: "a", label: "The blockchain miners, for free" },
      { id: "b", label: "You do — but in stablecoins, not a separate gas token" },
      { id: "c", label: "Opera pays it for you forever" },
      { id: "d", label: "You need to buy ETH first" },
    ],
    correctChoiceId: "b",
  },
  {
    prompt: "How many people around the world use MiniPay?",
    choices: [
      { id: "a", label: "Around 10,000" },
      { id: "b", label: "Around 500,000" },
      { id: "c", label: "15 million+" },
      { id: "d", label: "1 billion+" },
    ],
    correctChoiceId: "c",
  },
  {
    prompt: "MiniPay is available in how many countries?",
    choices: [
      { id: "a", label: "2" },
      { id: "b", label: "15" },
      { id: "c", label: "66+" },
      { id: "d", label: "195" },
    ],
    correctChoiceId: "c",
  },
  {
    prompt: "Celo today is best described as…",
    choices: [
      { id: "a", label: "A Bitcoin sidechain" },
      { id: "b", label: "An Ethereum Layer 2" },
      { id: "c", label: "A standalone Layer 1" },
      { id: "d", label: "A centralized server" },
    ],
    correctChoiceId: "b",
  },
  {
    prompt: "Celo's blocks confirm roughly every…",
    choices: [
      { id: "a", label: "10 minutes" },
      { id: "b", label: "1 minute" },
      { id: "c", label: "1 second" },
      { id: "d", label: "10 seconds" },
    ],
    correctChoiceId: "c",
  },
  {
    prompt: "Celo's mission focuses on…",
    choices: [
      { id: "a", label: "High-end finance for institutions only" },
      { id: "b", label: "NFT trading" },
      { id: "c", label: "Real-world payments and financial access globally" },
      { id: "d", label: "Gaming tokens" },
    ],
    correctChoiceId: "c",
  },
];
