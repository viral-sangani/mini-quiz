import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Mini Quiz",
  description:
    "Privacy Policy explaining how Celo Core Co. processes personal data for Celo Mini Apps, including MiniQuiz.",
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
