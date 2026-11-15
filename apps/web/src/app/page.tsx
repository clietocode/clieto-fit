import { redirect } from "next/navigation";
import { getPrincipalFromApi } from "@/lib/api-server";

export default async function HomePage() {
  redirect((await getPrincipalFromApi()) ? "/dashboard" : "/login");
}
