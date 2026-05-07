"use client";

import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { QuizForm } from "@/components/admin/QuizForm";
import { adminApi } from "@/lib/admin-api";
import type { AdminQuiz } from "@mini-quiz/shared";

export default function NewQuizPage() {
  const router = useRouter();
  return (
    <>
      <TopBar title="New game" crumbs="Games / New" />
      <div className="adm-content">
        <div className="adm-page-h">
          <div>
            <div className="adm-crumbs">Games / New game</div>
            <h1>Create a new game</h1>
          </div>
        </div>
        <QuizForm
          submitLabel="Create game"
          onSubmit={async (v) => {
            const data = await adminApi.post<{ quiz: AdminQuiz }>(
              "/admin/quizzes",
              v,
            );
            router.push(`/quizzes/${data.quiz.id}`);
          }}
        />
      </div>
    </>
  );
}
