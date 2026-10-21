import { Redirect } from "expo-router";

// QR scanning comes in M9; the tab is shown closed until then, and a deep link to it lands on the tasks.
export default function Scan() {
  return <Redirect href="/" />;
}
