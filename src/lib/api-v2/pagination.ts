/**
 * Keyset (cursor) pagination over `(sortField, id)`.
 *
 * Cursors are opaque base64url JSON bound to the sort they were issued for;
 * a cursor replayed with a different sort/order is refused rather than
 * silently returning a wrong page. They carry no secret — just a position.
 */
import { ApiError } from "./errors.ts";

export type SortField = "name" | "createdAt" | "updatedAt";
export type SortOrder = "asc" | "desc";

type CursorPayload = { s: SortField; o: SortOrder; v: string | number; i: string };

export function encodeCursor(
  sort: SortField,
  order: SortOrder,
  value: string | number | Date,
  id: string,
): string {
  const v = value instanceof Date ? value.getTime() : value;
  return Buffer.from(JSON.stringify({ s: sort, o: order, v, i: id } satisfies CursorPayload)).toString(
    "base64url",
  );
}

export function decodeCursor(
  raw: string,
  sort: SortField,
  order: SortOrder,
): { value: string | Date; id: string } {
  const invalid = () => new ApiError(400, "invalid_cursor", "Curseur invalide ou périmé.");
  if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw invalid();
  let p: Partial<CursorPayload>;
  try {
    p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (!p || p.s !== sort || p.o !== order || typeof p.i !== "string" || p.i.length === 0) throw invalid();
  if (sort === "name") {
    if (typeof p.v !== "string") throw invalid();
    return { value: p.v, id: p.i };
  }
  if (typeof p.v !== "number" || !Number.isFinite(p.v)) throw invalid();
  const d = new Date(p.v);
  if (Number.isNaN(d.getTime())) throw invalid();
  return { value: d, id: p.i };
}

/**
 * Prisma `where` fragment selecting rows strictly after the cursor, matching
 * `orderBy: [{ [field]: order }, { id: order }]`.
 */
export function keysetWhere(
  field: string,
  order: SortOrder,
  cursor: { value: string | Date; id: string },
) {
  const cmp = order === "asc" ? "gt" : "lt";
  return {
    OR: [
      { [field]: { [cmp]: cursor.value } },
      { AND: [{ [field]: cursor.value }, { id: { [cmp]: cursor.id } }] },
    ],
  };
}

export function orderBy(field: string, order: SortOrder) {
  return [{ [field]: order }, { id: order }];
}

/** Given `limit + 1` fetched rows, split into the page and the next cursor. */
export function sliceWithCursor<T extends { id: string }>(
  rows: T[],
  limit: number,
  cursorFor: (row: T) => string,
): { page: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { page: rows, nextCursor: null };
  const page = rows.slice(0, limit);
  return { page, nextCursor: cursorFor(page[page.length - 1]!) };
}
