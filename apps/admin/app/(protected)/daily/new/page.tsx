"use client";

import { TopBar } from "@/components/TopBar";
import { DailyForm } from "@/components/admin/DailyForm";

export default function DailyNewPage() {
  return (
    <>
      <TopBar title="Daily quiz" />
      <div className="adm-content">
        <div className="adm-page-h">
          <div>
            <h1>New daily</h1>
            <div className="adm-crumbs">Daily › New</div>
          </div>
        </div>
        <DailyForm mode="create" />
      </div>
    </>
  );
}
