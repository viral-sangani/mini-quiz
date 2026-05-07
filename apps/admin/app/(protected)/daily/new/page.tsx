"use client";

import { TopBar } from "@/components/TopBar";
import { DailyForm } from "@/components/admin/DailyForm";

export default function DailyNewPage() {
  return (
    <>
      <TopBar
        title="New daily"
        crumbs={<span>Daily › New</span>}
        primaryAction={<span />}
      />
      <div className="adm-main">
        <DailyForm mode="create" />
      </div>
    </>
  );
}
