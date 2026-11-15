import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";
import { getPrincipalFromApi } from "@/lib/api-server";

export default async function DashboardPage() {
  const principal = await getPrincipalFromApi();
  if (!principal) redirect("/login");
  return <DashboardClient principal={principal} />;
}
