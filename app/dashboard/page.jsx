"use client";

import dynamic from "next/dynamic";

// Disable SSR for the dashboard to avoid hydration issues
const ConversionDashboard = dynamic(
  () => import("@/components/ConversionDashboard"),
  { ssr: false }
);

export default function DashboardPage() {
  return <ConversionDashboard />;
}
