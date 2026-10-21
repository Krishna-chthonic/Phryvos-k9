import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { getRecipe, deleteCustomRecipe } from "@/lib/recipes/recipe-runner";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return vaultRoute(({ db, key }) => {
    const recipe = getRecipe({ db, key }, id);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }
    return NextResponse.json({ recipe });
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return vaultRoute(({ db, key }) => {
    const ok = deleteCustomRecipe({ db, key }, id);
    if (!ok) {
      return NextResponse.json(
        { error: "Cannot delete built-in recipe or recipe not found" },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true, message: `Recipe ${id} deleted.` });
  });
}
