import { WorkflowCanvas } from "@/components/workflows/WorkflowCanvas";
import { listWorkflows } from "@/lib/workflows/workflow-engine";

export default function WorkflowsPage() {
  const workflows = listWorkflows();
  return <WorkflowCanvas initialWorkflows={workflows} />;
}
