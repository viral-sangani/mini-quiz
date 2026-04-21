"use client";

type State = "idle" | "selected" | "correct" | "wrong" | "disabled";

const CARD_STATE: Record<State, string> = {
  idle: "bg-white border-duo-gray-light shadow-3d-sm hover:bg-duo-cream",
  selected: "bg-white border-duo-blue shadow-3d-sm",
  correct: "bg-duo-green/10 border-duo-green shadow-3d-sm",
  wrong: "bg-duo-red/10 border-duo-red shadow-3d-sm",
  disabled: "bg-white border-duo-gray-light shadow-3d-sm opacity-50",
};

const CIRCLE_STATE: Record<State, string> = {
  idle: "bg-duo-gray-light text-duo-ink",
  selected: "bg-duo-blue text-white",
  correct: "bg-duo-green text-white",
  wrong: "bg-duo-red text-white",
  disabled: "bg-duo-gray-light text-duo-ink",
};

export function AnswerChoice({
  letter,
  label,
  state = "idle",
  onClick,
}: {
  letter: string;
  label: string;
  state?: State;
  onClick?: () => void;
}) {
  const disabled = state === "disabled";
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={state === "selected"}
      className={`btn-3d w-full flex items-center gap-4 rounded-2xl border-2 px-4 py-4 text-left ${CARD_STATE[state]} ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black text-lg ${CIRCLE_STATE[state]}`}
      >
        {letter}
      </span>
      <span className="flex-1 font-bold text-duo-ink text-base sm:text-lg">
        {label}
      </span>
      {state === "correct" && (
        <span className="tick-in text-duo-green font-black text-2xl" aria-label="correct">
          ✓
        </span>
      )}
      {state === "wrong" && (
        <span className="tick-in text-duo-red font-black text-2xl" aria-label="wrong">
          ✗
        </span>
      )}
    </button>
  );
}
