"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { TopBar } from "@/components/TopBar";
import { AdminIcon } from "@/components/AdminIcon";

type AdminTopic = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconName: string;
  coverColor: string;
  published: boolean;
  questionCount: number;
  headCount: number;
  createdAt: string;
};

export default function PracticeListPage() {
  const [topics, setTopics] = useState<AdminTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.get<{ topics: AdminTopic[] }>(
        "/admin/practice/topics",
      );
      setTopics(data.topics);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const togglePublished = async (t: AdminTopic) => {
    try {
      await adminApi.patch(`/admin/practice/topics/${t.id}`, {
        published: !t.published,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = async (t: AdminTopic) => {
    if (
      !confirm(
        `Delete "${t.title}"? All ${t.questionCount} questions and ${t.headCount} player histories will be removed.`,
      )
    )
      return;
    try {
      await adminApi.del(`/admin/practice/topics/${t.id}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <>
      <TopBar
        title="Practice"
        primaryAction={
          <Link href="/practice/new" className="adm-btn adm-btn--primary">
            <AdminIcon name="plus" size={14} color="white" /> New topic
          </Link>
        }
      />
      <div className="adm-main">
        {error && (
          <div className="adm-card" style={{ padding: 12, color: "var(--a-danger)" }}>
            {error}
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {loading && topics.length === 0 ? (
            <div className="adm-card" style={{ padding: 18 }}>
              Loading…
            </div>
          ) : topics.length === 0 ? (
            <div className="adm-card" style={{ padding: 18, color: "var(--a-ink-faint)" }}>
              No practice topics yet. Create your first one.
            </div>
          ) : (
            topics.map((t) => (
              <div key={t.id} className="adm-card" style={{ padding: 14 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: `var(--a-${t.coverColor}, var(--a-primary))`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: 800,
                    }}
                  >
                    {t.title.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "var(--a-ink-faint)" }}>
                      /{t.slug}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: 12,
                    color: "var(--a-ink-soft)",
                    marginBottom: 12,
                  }}
                >
                  <span>{t.questionCount} questions</span>
                  <span>{t.headCount} players</span>
                  <span style={{ color: t.published ? "var(--a-success, #16a34a)" : "var(--a-ink-faint)", fontWeight: 700 }}>
                    {t.published ? "Published" : "Draft"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Link
                    href={`/practice/${t.id}`}
                    className="adm-btn adm-btn--sm"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    className="adm-btn adm-btn--sm"
                    onClick={() => void togglePublished(t)}
                  >
                    {t.published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--sm adm-btn--danger"
                    onClick={() => void remove(t)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
