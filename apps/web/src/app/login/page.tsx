import { redirect } from "next/navigation";
import { getPrincipalFromApi } from "@/lib/api-server";
import LoginForm from "./login-form";

export default async function LoginPage() {
  if (await getPrincipalFromApi()) redirect("/dashboard");
  return <LoginForm />;
}
