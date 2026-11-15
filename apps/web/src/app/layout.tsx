import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clieto Fit | Gym Training Portal",
  description: "Training, attendance, and member management for independent gyms.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
