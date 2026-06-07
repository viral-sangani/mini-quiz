import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions — Mini Quiz",
  description:
    "Terms and Conditions governing your use of the Celo Mini Apps, including MiniQuiz.",
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
