"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";

export default function PracticeNewPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverColor, setCoverColor] = useState("primary");
  const [published, setPublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-suggest a slug from the title as the admin types, but only as long
  // as the slug field hasn't been hand-edited. Saves the most common copy
  // step on this form.
  const [slugTouched, setSlugTouched] = useState(false);
  const onTitleChange = (val: string) => {
    setTitle(val);
    if (!slugTouched) {
      const auto = val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      setSlug(auto);
    }
  };

  const submit = async () => {
    setError(null);
    if (!slug.trim()) return setError("Slug is required");
    if (!title.trim()) return setError("Title is required");
    setSubmitting(true);
    try {
      const res = await adminApi.post<{ quiz: { id: string } }>(
        "/admin/practice/quizzes",
        {
          slug: slug.trim().toLowerCase(),
          title: title.trim(),
          description: description.trim() || null,
          coverColor,
          published,
        },
      );
      router.push(`/practice/${res.quiz.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TopBar title="Practice" />
      <div className="adm-content">
        <div className="adm-page-h">
          <div>
            <h1>New practice quiz</h1>
            <div className="adm-crumbs">Practice › New</div>
          </div>
        </div>
        <div className="adm-card" style={{ maxWidth: 540 }}>
          <div className="adm-card-h">
            <h3>Quiz details</h3>
          </div>
          <div style={{ padding: 18, display: "grid", gap: 12 }}>
            <div className="adm-field">
              <label>Title</label>
              <input
                className="adm-input"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Celo basics"
                disabled={submitting}
              />
            </div>
            <div className="adm-field">
              <label>Slug</label>
              <input
                className="adm-input"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                placeholder="celo-basics"
                disabled={submitting}
              />
              <span style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
                URL handle. Lowercase letters, numbers, hyphens.
              </span>
            </div>
            <div className="adm-field">
              <label>Description</label>
              <textarea
                className="adm-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                disabled={submitting}
              />
            </div>
            <div className="adm-field">
              <label>Cover color</label>
              <select
                className="adm-input"
                value={coverColor}
                onChange={(e) => setCoverColor(e.target.value)}
                disabled={submitting}
              >
                <option value="primary">Primary</option>
                <option value="berry">Berry</option>
                <option value="sky">Sky</option>
                <option value="accent">Accent</option>
                <option value="ink">Ink</option>
              </select>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                disabled={submitting}
              />
              Publish immediately (needs at least 10 questions)
            </label>
            {error && (
              <div style={{ color: "var(--a-danger, #b91c1c)", fontSize: 12, fontWeight: 600 }}>
                {error}
              </div>
            )}
          </div>
          <div
            style={{
              padding: "12px 18px",
              borderTop: "1px solid var(--a-line)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create quiz"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
