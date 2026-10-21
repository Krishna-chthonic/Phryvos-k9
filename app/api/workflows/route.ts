import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { listWorkflows, saveWorkflow, deleteWorkflow, type Workflow } from "@/lib/workflows/workflow-engine";

export async function GET() {
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  return Response.json({
    workflows: listWorkflows(),
  });
}

export async function POST(req: Request) {
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const body = (await req.json().catch(() => null)) as Partial<Workflow> | null;
  if (!body || !body.name) {
    return Response.json({ error: { code: "invalid_body", message: "Workflow name is required" } }, { status: 400 });
  }

  const id = body.id || `flow_${Date.now()}`;
  const workflow: Workflow = {
    id,
    name: body.name,
    description: body.description || "",
    category: body.category || "automation",
    status: body.status || "active",
    nodes: body.nodes || [],
    edges: body.edges || [],
    createdAt: body.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  const saved = saveWorkflow(workflow);
  return Response.json({ workflow: saved });
}

export async function DELETE(req: Request) {
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ error: { code: "missing_id", message: "Workflow id parameter required" } }, { status: 400 });
  }

  const deleted = deleteWorkflow(id);
  return Response.json({ ok: deleted });
}
