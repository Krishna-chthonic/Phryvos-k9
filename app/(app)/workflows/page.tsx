import { WorkflowCanvas } from "@/components/workflows/WorkflowCanvas";
import { BUILTIN_WORKFLOW_TEMPLATES } from "@/lib/workflows/workflow-types";

export default function WorkflowsPage() {
  return <WorkflowCanvas initialWorkflows={BUILTIN_WORKFLOW_TEMPLATES} />;
}
