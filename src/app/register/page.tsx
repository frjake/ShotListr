import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Sign up" };

export default async function RegisterPage(props: PageProps<"/register">) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await props.searchParams;
  return <RegisterForm next={typeof next === "string" ? next : undefined} />;
}
