import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Нагрузка — Hypeman",
  robots: { index: false, follow: false },
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
