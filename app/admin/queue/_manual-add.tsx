"use client";

import { Button } from "@/components/ui/button";
import { addToolManually } from "./actions";

export function ManualAddTool() {
  return (
    <form
      action={addToolManually}
      className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-neutral-200 bg-white p-4 sm:grid-cols-2"
    >
      <Field label="Slug" required>
        <input
          name="slug"
          required
          placeholder="lowercase-kebab-id"
          className="font-mono text-xs"
        />
      </Field>
      <Field label="Name" required>
        <input name="name" required placeholder="Human readable name" />
      </Field>
      <Field label="Kind">
        <select name="kind" defaultValue="service">
          {["mcp_server", "cli", "api", "library", "sdk", "service"].map(
            (k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ),
          )}
        </select>
      </Field>
      <Field label="Status">
        <select name="status" defaultValue="available">
          <option value="available">available</option>
          <option value="verified">verified</option>
          <option value="featured">featured</option>
        </select>
      </Field>
      <Field label="Homepage URL">
        <input name="homepage_url" type="url" />
      </Field>
      <Field label="Repo URL">
        <input name="repo_url" type="url" />
      </Field>
      <Field label="Category tags (comma-separated)" full>
        <input
          name="category_tags"
          placeholder="database, postgres, …"
          className="font-mono text-xs"
        />
      </Field>
      <Field label="Capabilities (comma-separated)" full>
        <input
          name="capabilities"
          placeholder="manages migrations, branching, …"
          className="font-mono text-xs"
        />
      </Field>
      <Field label="Description" full>
        <textarea
          name="description"
          rows={2}
          placeholder="One or two sentences."
        />
      </Field>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit">Add tool</Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={full ? "sm:col-span-2 block" : "block"}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-0.5 [&>input]:w-full [&>input]:rounded-md [&>input]:border [&>input]:border-neutral-300 [&>input]:bg-white [&>input]:px-2 [&>input]:py-1 [&>input]:text-xs [&>input]:outline-none [&>input:focus]:border-neutral-900 [&>select]:w-full [&>select]:rounded-md [&>select]:border [&>select]:border-neutral-300 [&>select]:bg-white [&>select]:px-2 [&>select]:py-1 [&>select]:text-xs [&>textarea]:w-full [&>textarea]:rounded-md [&>textarea]:border [&>textarea]:border-neutral-300 [&>textarea]:bg-white [&>textarea]:px-2 [&>textarea]:py-1 [&>textarea]:text-xs [&>textarea]:resize-none">
        {children}
      </div>
    </label>
  );
}
