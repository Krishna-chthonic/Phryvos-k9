import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { getWorkflow, executeWorkflow } from "@/lib/workflows/workflow-engine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const workflow = getWorkflow(id);
  if (!workflow) {
    return Response.json({ error: { code: "not_found", message: `Workflow "${id}" not found` } }, { status: 404 });
  }

  const executionCtx = {
    db: ctx.db,
    key: ctx.key,
    workflowId: id,
    nodeOutputs: {},
  };

  const outcome = await executeWorkflow(workflow, executionCtx);
  return Response.json({
    ok: outcome.success,
    workflowId: id,
    results: outcome.results,
    errors: outcome.errors,
    nodes: workflow.nodes,
  });
}
