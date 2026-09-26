import { Factory, FileText, Inbox, Layers, Package, SlidersHorizontal, Upload, Users, type LucideIcon } from "lucide-react";

export type PageKey = "tasks" | "products" | "batches" | "suppliers" | "documents" | "imports" | "users" | "settings";

export interface NavItem {
  key: PageKey;
  href: `/${PageKey}`;
  icon: LucideIcon;
}

export interface NavGroup {
  /** Translation key under nav.groups; the first group has no title (design G). */
  title?: "passport" | "supplyChain" | "admin";
  items: NavItem[];
}

const item = (key: PageKey, icon: LucideIcon): NavItem => ({ key, href: `/${key}`, icon });

/** Menu of design G. The tasks counter comes with /tasks in M4 and is hidden until then. */
export const NAV: NavGroup[] = [
  { items: [item("tasks", Inbox)] },
  { title: "passport", items: [item("products", Package), item("batches", Layers)] },
  { title: "supplyChain", items: [item("suppliers", Factory), item("documents", FileText), item("imports", Upload)] },
  { title: "admin", items: [item("users", Users), item("settings", SlidersHorizontal)] },
];

export const PAGE_KEYS: PageKey[] = NAV.flatMap((group) => group.items.map((i) => i.key));

export function pageKeyFromPath(pathname: string): PageKey | undefined {
  const first = pathname.split("/")[1];
  return PAGE_KEYS.find((key) => key === first);
}

/** Pages whose header also shows "İçe aktar" (the rest only their primary action). */
export const PAGES_WITH_IMPORT: readonly PageKey[] = ["products", "batches"];

/** Pages without header or empty-state buttons (tasks: nothing to act on until M4). */
export const PAGES_WITHOUT_ACTIONS: readonly PageKey[] = ["tasks"];
