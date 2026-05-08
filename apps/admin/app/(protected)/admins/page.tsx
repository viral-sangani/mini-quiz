"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Crumbs } from "@/components/Crumbs";
import { useToast } from "@/components/Toast";
import { AdminIcon } from "@/components/AdminIcon";
import { AdminAvatar, initialsOf } from "@/components/AdminAvatar";
import { adminApi } from "@/lib/admin-api";
import { ApiError } from "@/lib/api-client";
import { formatLocal } from "@/lib/time";
import { InviteAdminDialog } from "@/components/admin/InviteAdminDialog";
import { ResetPasswordDialog } from "@/components/admin/ResetPasswordDialog";

type AdminRow = {
  userId: string;
  email: string;
  name: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export default function AdminsPage() {
  const [myId, setMyId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const toast = useToast();
  const [resetTarget, setResetTarget] = useState<{
    userId: string;
    email: string;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.get<{ admins: AdminRow[] }>(
        "/admin/auth/admins",
      );
      setAdmins(data.admins);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admins");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void adminApi
      .get<{ userId: string; email: string }>("/admin/auth/me")
      .then((me) => setMyId(me.userId))
      .catch(() => setMyId(null));
  }, []);

  const onRevoke = async (target: AdminRow) => {
    if (!confirm(`Revoke admin access for ${target.email}?`)) return;
    try {
      await adminApi.del<void>(`/admin/auth/admins/${target.userId}`);
      toast.success(`${target.email} revoked`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to revoke admin");
    }
  };

  const canRevoke = (row: AdminRow) =>
    row.userId !== myId && admins.length > 1;

  return (
    <>
      <TopBar title="Admins" crumbs="People & Money" />
      <div className="adm-content">
        <div className="adm-page-h">
          <div>
            <Crumbs
              items={[
                { label: "Home", href: "/overview" },
                { label: "Admins" },
              ]}
            />
            <h1
              className="font-display text-2xl font-black tracking-tight"
              style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}
            >
              Admins
            </h1>
            <div className="adm-crumbs">
              {admins.length} {admins.length === 1 ? "admin" : "admins"}
            </div>
          </div>
          <div className="actions">
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => setInviteOpen(true)}
            >
              <AdminIcon name="plus" size={14} color="white" /> Invite admin
            </button>
          </div>
        </div>

        {error && (
          <div
            className="rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--a-wrong-tint)",
              color: "var(--a-wrong)",
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div className="adm-card">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Last login</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ color: "var(--a-ink-faint)", padding: 16 }}
                  >
                    Loading…
                  </td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ color: "var(--a-ink-faint)", padding: 16 }}
                  >
                    No admins yet. Invite one with the button above.
                  </td>
                </tr>
              ) : (
                admins.map((a) => (
                  <tr key={a.userId}>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <AdminAvatar
                          color="berry"
                          initials={initialsOf(a.name ?? a.email)}
                        />
                        <div>
                          <div style={{ fontWeight: 700 }}>
                            {a.name ?? a.email}
                            {a.userId === myId && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "var(--a-primary)",
                                }}
                              >
                                YOU
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--a-ink-faint)",
                            }}
                          >
                            {a.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {a.lastLoginAt
                        ? formatLocal(a.lastLoginAt, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                    <td>
                      {formatLocal(a.createdAt, { dateStyle: "medium" })}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          flexWrap: "nowrap",
                        }}
                      >
                        <button
                          type="button"
                          className="adm-btn adm-btn--sm"
                          onClick={() =>
                            setResetTarget({
                              userId: a.userId,
                              email: a.email,
                            })
                          }
                        >
                          Reset password
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn--sm adm-btn--danger"
                          disabled={!canRevoke(a)}
                          title={
                            !canRevoke(a)
                              ? a.userId === myId
                                ? "Cannot revoke yourself"
                                : "Cannot revoke the last admin"
                              : undefined
                          }
                          onClick={() => onRevoke(a)}
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <InviteAdminDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={() => {
          toast.success("Admin invited");
          void load();
        }}
      />
      <ResetPasswordDialog
        open={resetTarget !== null}
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={() => {
          toast.success("Password reset");
          void load();
        }}
      />
    </>
  );
}
