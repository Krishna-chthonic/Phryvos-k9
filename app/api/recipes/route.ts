import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import {
  listRecipes,
  saveRecipe,
  executeRecipe,
  type RecipeSpec,
} from "@/lib/recipes/recipe-runner";

export async function GET() {
  return vaultRoute(({ db, key }) => {
    const recipes = listRecipes({ db, key });
    return NextResponse.json({
      recipes,
      totalCount: recipes.length,
    });
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  // Case A: Execute Recipe
  if (json.action === "execute" || json.recipeId) {
    const recipeId = json.recipeId;
    const parameters = json.parameters || {};

    return vaultRoute(async ({ db, key }) => {
      try {
        const result = await executeRecipe({ db, key }, recipeId, parameters);
        return NextResponse.json({
          success: true,
          result,
        });
      } catch (err) {
        return NextResponse.json(
          { success: false, error: err instanceof Error ? err.message : String(err) },
          { status: 500 },
        );
      }
    });
  }

  // Case B: Create / Save Custom Recipe
  if (json.name && Array.isArray(json.steps)) {
    return vaultRoute(({ db, key }) => {
      const saved = saveRecipe({ db, key }, {
        id: json.id || json.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
        name: json.name,
        description: json.description || "",
        category: json.category || "general",
        parameters: json.parameters || [],
        steps: json.steps,
        author: json.author || "user",
      });

      return NextResponse.json({
        success: true,
        recipe: saved,
      }, { status: 201 });
    });
  }

  return NextResponse.json({ error: "Unrecognized recipe action" }, { status: 400 });
}
