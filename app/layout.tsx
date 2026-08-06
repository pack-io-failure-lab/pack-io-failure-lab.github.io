import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PACK IO Failure Lab · REER Robotics",
  description: "Interactive simulation of stale and overlapping IO handshakes on the PACK production line.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
