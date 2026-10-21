import { router } from "expo-router";
import { useCapture } from "@/lib/capture";
import { TasksScreen } from "@/screens/TasksScreen";

export default function Tasks() {
  const capture = useCapture();
  return (
    <TasksScreen
      onOpenDocument={(id) => router.push({ pathname: "/document/[id]", params: { id } })}
      onShoot={() => {
        capture.reset();
        router.push("/capture");
      }}
    />
  );
}
