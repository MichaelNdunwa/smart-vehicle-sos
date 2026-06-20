"use client";

import { useEffect, useState } from "react";

export default function PaginatedPanel({ title, icon, items, pageSize = 5, renderItem, emptyState }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (page - 1) * pageSize;
  const visibleItems = items.slice(start, start + pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  return (
    <section className="rounded-xl bg-surface-card p-6 shadow-sm ring-1 ring-border-default">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-text-primary">
          {icon && <span className="text-text-muted">{icon}</span>}
          {title}
        </h2>
        <span className="flex items-center gap-1.5 text-sm font-medium text-text-muted">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border-default text-text-secondary transition hover:bg-surface-muted hover:text-text-primary disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="min-w-[2.5rem] text-center tabular-nums text-xs font-semibold text-text-secondary">
            {page}/{totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border-default text-text-secondary transition hover:bg-surface-muted hover:text-text-primary disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            aria-label="Next page"
          >
            ›
          </button>
        </span>
      </div>
      {items.length === 0 ? (
        emptyState
      ) : (
        <div className="grid gap-2.5">
          {visibleItems.map((item) => renderItem(item))}
        </div>
      )}
    </section>
  );
}
