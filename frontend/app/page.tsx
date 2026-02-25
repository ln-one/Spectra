import { redirect } from "next/navigation";
import { TokenStorage } from "@/lib/auth";

export default function Home() {
  const token = TokenStorage.getAccessToken();
  
  if (!token) {
    redirect("/auth/login");
  }
  
  redirect("/projects");
}
