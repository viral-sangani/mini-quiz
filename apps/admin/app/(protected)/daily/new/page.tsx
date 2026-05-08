"use client";

import { Crumbs } from "@/components/Crumbs";
import { TopBar } from "@/components/TopBar";
import { DailyForm } from "@/components/admin/DailyForm";

export default function DailyNewPage() {
  return (
    <>
      <TopBar title="Daily quiz" />
      <div className="adm-content">
        <Crumbs
          items={[
            { label: "Home", href: "/overview" },
            { label: "Daily", href: "/daily" },
            { label: "New" },
          ]}
        />
        <div className="adm-page-h" style={{ marginTop: 8 }}>
          <div>
            <h1>New daily</h1>
          </div>
        </div>
        <DailyForm mode="create" />
      </div>
    </>
  );
}
