"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  proposedToolsQueue,
  recipes,
  toolCapabilities,
  tools,
} from "@/db/schema";
import type { Plan } from "@/lib/plan-types";
import { ensureUserProfile, isAdmin } from "@/lib/auth-helpers";

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

/**
 * Promote a queue entry into the directory.
 *
 *  - Inserts a tools row with status='available' (admin can bump to verified
 *    or featured later from the regular admin UI).
 *  - Copies capabilities into tool_capabilities.
 *  - Marks the queue entry as 'promoted'.
 *  - Best-effort: walks any plan_json that proposed this slug and clears
 *    proposed_tool=true so the recipe view picks up the directory entry.
 */
export async function promoteFromQueue(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id");

  const [row] = await db
    .select()
    .from(proposedToolsQueue)
    .where(eq(proposedToolsQueue.id, id))
    .limit(1);
  if (!row) throw new Error("Queue entry not found");

  // Allow inline overrides from the form.
  const slug = String(formData.get("slug") ?? row.slugSuggestion).trim();
  const name = String(formData.get("name") ?? row.name).trim();
  const description = String(
    formData.get("description") ?? row.description ?? "",
  ).trim();
  const homepageUrl =
    String(formData.get("homepage_url") ?? row.homepageUrl ?? "").trim() ||
    null;
  const repoUrl =
    String(formData.get("repo_url") ?? row.repoUrl ?? "").trim() || null;
  const kindRaw = String(formData.get("kind") ?? row.kind ?? "service");
  const allowedKinds = [
    "mcp_server",
    "cli",
    "api",
    "library",
    "sdk",
    "service",
  ] as const;
  const kind = (allowedKinds as readonly string[]).includes(kindRaw)
    ? (kindRaw as (typeof allowedKinds)[number])
    : "service";
  const tagsRaw = String(formData.get("category_tags") ?? "");
  const categoryTags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : row.categoryTags;
  const capsRaw = String(formData.get("capabilities") ?? "");
  const capabilities = capsRaw
    ? capsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : row.capabilities;

  const me = await ensureUserProfile();

  // Bail if the slug is already taken.
  const dup = await db
    .select({ id: tools.id })
    .from(tools)
    .where(eq(tools.slug, slug))
    .limit(1);
  if (dup[0]) {
    // Mark as duplicate; don't double-insert.
    await db
      .update(proposedToolsQueue)
      .set({
        status: "duplicate",
        reviewerUserId: me?.id ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(proposedToolsQueue.id, id));
    revalidatePath("/admin/queue");
    return;
  }

  const [created] = await db
    .insert(tools)
    .values({
      slug,
      name,
      kind,
      description: description || null,
      homepageUrl,
      repoUrl,
      categoryTags,
      status: "available",
    })
    .returning({ id: tools.id, slug: tools.slug });

  if (capabilities.length > 0) {
    await db.insert(toolCapabilities).values(
      capabilities.map((c) => ({
        toolId: created.id,
        capability: c,
      })),
    );
  }

  await db
    .update(proposedToolsQueue)
    .set({
      status: "promoted",
      reviewerUserId: me?.id ?? null,
      reviewedAt: new Date(),
    })
    .where(eq(proposedToolsQueue.id, id));

  // Best-effort: rewrite plan_json on recipes that proposed this slug.
  await rewritePlansAfterPromotion(slug).catch((e) =>
    console.warn("[promoteFromQueue] plan rewrite failed", e),
  );

  revalidatePath("/admin/queue");
  revalidatePath("/admin");
  revalidatePath("/browse");
}

export async function rejectFromQueue(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id");
  const me = await ensureUserProfile();
  await db
    .update(proposedToolsQueue)
    .set({
      status: "rejected",
      reviewerUserId: me?.id ?? null,
      reviewedAt: new Date(),
    })
    .where(eq(proposedToolsQueue.id, id));
  revalidatePath("/admin/queue");
}

export async function bulkAction(formData: FormData) {
  await requireAdmin();
  const action = String(formData.get("bulk_action") ?? "");
  const ids = formData
    .getAll("selected_ids")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  if (ids.length === 0) return;

  if (action === "reject") {
    const me = await ensureUserProfile();
    await db
      .update(proposedToolsQueue)
      .set({
        status: "rejected",
        reviewerUserId: me?.id ?? null,
        reviewedAt: new Date(),
      })
      .where(inArray(proposedToolsQueue.id, ids));
    revalidatePath("/admin/queue");
    return;
  }

  if (action === "promote") {
    // For bulk-promote we use the queue row's existing data verbatim.
    for (const id of ids) {
      const fd = new FormData();
      fd.set("id", String(id));
      // Trigger single promote per row, reusing the careful logic above.
      try {
        await promoteFromQueue(fd);
      } catch (e) {
        console.warn(`[bulkAction] promote ${id} failed`, e);
      }
    }
  }
}

/**
 * Add a tool directly to the directory (manual path). Bypasses the queue.
 * Status defaults to 'available' but can be raised on the same form.
 */
export async function addToolManually(formData: FormData) {
  await requireAdmin();

  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!slug || !name) throw new Error("slug and name required");

  const dup = await db
    .select({ id: tools.id })
    .from(tools)
    .where(eq(tools.slug, slug))
    .limit(1);
  if (dup[0]) throw new Error(`A tool with slug "${slug}" already exists`);

  const allowedKinds = [
    "mcp_server",
    "cli",
    "api",
    "library",
    "sdk",
    "service",
  ] as const;
  const allowedStatuses = [
    "available",
    "verified",
    "featured",
  ] as const;
  const kindRaw = String(formData.get("kind") ?? "service");
  const statusRaw = String(formData.get("status") ?? "available");
  const kind = (allowedKinds as readonly string[]).includes(kindRaw)
    ? (kindRaw as (typeof allowedKinds)[number])
    : "service";
  const status = (allowedStatuses as readonly string[]).includes(statusRaw)
    ? (statusRaw as (typeof allowedStatuses)[number])
    : "available";

  const description =
    String(formData.get("description") ?? "").trim() || null;
  const homepageUrl =
    String(formData.get("homepage_url") ?? "").trim() || null;
  const repoUrl = String(formData.get("repo_url") ?? "").trim() || null;
  const categoryTags = String(formData.get("category_tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const capabilities = String(formData.get("capabilities") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const [created] = await db
    .insert(tools)
    .values({
      slug,
      name,
      kind,
      description,
      homepageUrl,
      repoUrl,
      categoryTags,
      status,
    })
    .returning({ id: tools.id });

  if (capabilities.length > 0) {
    await db.insert(toolCapabilities).values(
      capabilities.map((c) => ({ toolId: created.id, capability: c })),
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/queue");
}

async function rewritePlansAfterPromotion(slug: string) {
  const all = await db.select().from(recipes);
  for (const r of all) {
    let dirty = false;
    const plan = r.planJson as Plan;
    for (const step of plan.steps) {
      for (const t of step.tools) {
        if (t.slug === slug && t.proposed_tool) {
          t.proposed_tool = false;
          delete t.proposed_homepage_url;
          delete t.proposed_kind;
          if (!t.status || t.status === "not_in_directory") {
            t.status = "available";
          }
          dirty = true;
        }
      }
    }
    if (dirty) {
      await db
        .update(recipes)
        .set({ planJson: plan, updatedAt: new Date() })
        .where(eq(recipes.id, r.id));
    }
  }
}
