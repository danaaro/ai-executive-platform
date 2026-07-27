import { redirect } from "next/navigation";

/**
 * The board is the product's front door now (wireframe #4b). The former
 * single-page agent chat lives on at /agents — the independent assistants
 * (Interview Coach, Evaluation Report) and the Phase-2 agents have no board
 * home yet, so it is still the only way to reach them.
 */
export default function RootPage() {
  redirect("/projects");
}
