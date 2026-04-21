"use client";

import confetti, { type CreateTypes } from "canvas-confetti";

const COLORS = ["#58CC02", "#FFC800", "#FCFF52", "#FFFFFF"];

type Globals = typeof globalThis & {
  __miniQuizConfetti?: CreateTypes;
  __miniQuizConfettiCanvas?: HTMLCanvasElement;
};

function getInstance(): CreateTypes | null {
  if (typeof window === "undefined") return null;
  const g = globalThis as Globals;
  if (g.__miniQuizConfetti) return g.__miniQuizConfetti;

  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  document.body.appendChild(canvas);

  const instance = confetti.create(canvas, {
    resize: true,
    useWorker: false,
  });

  g.__miniQuizConfetti = instance;
  g.__miniQuizConfettiCanvas = canvas;
  return instance;
}

export function fireConfetti() {
  const instance = getInstance();
  if (!instance) return;
  instance({
    particleCount: 120,
    spread: 70,
    startVelocity: 45,
    origin: { y: 0.7 },
    colors: COLORS,
    scalar: 1,
    gravity: 1,
    ticks: 200,
  });
}

export function ConfettiBurst() {
  return null;
}
