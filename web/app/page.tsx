import { redirect } from "next/navigation";

/** The panel opens on Partiler (design G default); the auth gate sends guests to /login. */
export default function Home() {
  redirect("/batches");
}
