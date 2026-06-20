import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/types";

async function getAuthUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/items/[id]">
) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = (await request.json()) as {
      completed?: boolean;
      type?: ItemType;
      title?: string;
      content?: string | null;
      startAt?: string | null;
      endAt?: string | null;
      deadlineAt?: string | null;
    };

    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing || existing.userId !== authUser.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.completed !== undefined) {
      data.completed = body.completed;
      data.completedAt = body.completed ? new Date() : null;
    }
    if (body.type !== undefined) data.type = body.type;
    if (body.title !== undefined) data.title = body.title;
    if ("content" in body) data.content = body.content ?? null;
    if ("startAt" in body)
      data.startAt = body.startAt ? new Date(body.startAt) : null;
    if ("endAt" in body)
      data.endAt = body.endAt ? new Date(body.endAt) : null;
    if ("deadlineAt" in body)
      data.deadlineAt = body.deadlineAt ? new Date(body.deadlineAt) : null;

    const item = await prisma.item.update({ where: { id }, data });
    return Response.json(item);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/items/[id]">
) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing || existing.userId !== authUser.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.item.delete({ where: { id } });
    return Response.json({ deleted: true, id });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
