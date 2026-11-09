"use client";

import { useMemo, useState } from "react";
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type RowSelectionState, type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3 } from "lucide-react";

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  canSelectRow?: (row: TData) => boolean;
  label: string;
};

export function DataTable<TData>({ columns, data, getRowId, page, pageCount, onPageChange, sorting, onSortingChange, rowSelection, onRowSelectionChange, canSelectRow, label }: DataTableProps<TData>) {
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  // TanStack Table returns a mutable instance by design; passing it through memoized children can stale its internal state.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: onSortingChange ? undefined : getSortedRowModel(),
    getRowId,
    enableRowSelection: canSelectRow ? (row) => canSelectRow(row.original) : Boolean(onRowSelectionChange),
    manualPagination: true,
    pageCount,
    manualSorting: Boolean(onSortingChange),
    state: { pagination: { pageIndex: page - 1, pageSize: 25 }, sorting: sorting ?? localSorting, ...(rowSelection ? { rowSelection } : {}) },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex: page - 1, pageSize: 25 }) : updater;
      onPageChange(next.pageIndex + 1);
    },
    onSortingChange: (updater) => {
      const current = sorting ?? localSorting;
      const next = typeof updater === "function" ? updater(current) : updater;
      if (onSortingChange) onSortingChange(next); else setLocalSorting(next);
    },
    ...(onRowSelectionChange ? { onRowSelectionChange: (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => onRowSelectionChange(typeof updater === "function" ? updater(rowSelection ?? {}) : updater) } : {}),
  });
  const visibleColumns = useMemo(() => table.getAllLeafColumns().filter((column) => column.getCanHide()), [table]);

  return <div className="data-table-shell">
    <div className="data-table-toolbar"><span className="sr-only">{label}</span><details className="data-table-column-menu" open={columnMenuOpen} onToggle={(event) => setColumnMenuOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary aria-label="Show or hide columns"><Columns3 size={16} /> Columns</summary>
      <div role="group" aria-label="Visible columns">{visibleColumns.map((column) => <label key={column.id}><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} />{typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}</label>)}</div>
    </details></div>
    <div className="data-table-scroll"><table className="data-table" aria-label={label}><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} colSpan={header.colSpan} scope="col">{header.isPlaceholder ? null : <button type="button" className="data-table-header" disabled={!header.column.getCanSort()} onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === "asc" ? <ChevronUp size={14} /> : header.column.getIsSorted() === "desc" ? <ChevronDown size={14} /> : header.column.getCanSort() ? <span className="data-table-sort-hint" aria-hidden="true">↕</span> : null}</button>}</th>)}</tr>)}</thead><tbody>
      {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <tr key={row.id} data-selected={row.getIsSelected() || undefined}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>) : <tr><td colSpan={table.getVisibleLeafColumns().length} className="data-table-empty">No rows on this page.</td></tr>}
    </tbody></table></div>
    <div className="data-table-pagination"><span>Page {page} of {Math.max(pageCount, 1)}</span><div><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={16} /></button><button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight size={16} /></button></div></div>
  </div>;
}
