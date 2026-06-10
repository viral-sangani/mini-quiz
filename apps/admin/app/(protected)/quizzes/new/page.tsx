"use client";

import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Crumbs } from "@/components/Crumbs";
import { QuizForm } from "@/components/admin/QuizForm";
import { adminApi } from "@/lib/admin-api";
import type { AdminQuiz } from "@mini-quiz/shared";

export default function NewQuizPage() {
  const router = useRouter();
  return (
    <>
      <TopBar title="Games" />
      <div className="adm-content">
        <div className="adm-form-shell">
          <Crumbs
            items={[
              { label: "Home", href: "/overview" },
              { label: "Games", href: "/quizzes" },
              { label: "New" },
            ]}
          />
          <div className="adm-page-h" style={{ marginTop: 8 }}>
            <div>
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
      </div>
    </>
  );
}
