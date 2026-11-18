'use client';

import React, { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PaginationStateInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData, index: number) => string;
  selectedRowId?: string | null;
  onRowClick?: (row: TData) => void;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  pagination?: PaginationStateInfo;
  toolbar?: React.ReactNode;
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  selectedRowId,
  onRowClick,
  isLoading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'Try adjusting your filters or create a new record.',
  emptyAction,
  pagination,
  toolbar,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div
      className={cn(
        'bg-surface-container-lowest rounded-xl border border-hairline overflow-hidden flex flex-col',
        className,
      )}
    >
      {toolbar ? (
        <div className="px-4 py-3.5 border-b border-hairline">{toolbar}</div>
      ) : null}

      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="bg-surface-container-low border-b border-hairline"
              >
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                      className={cn(
                        'px-4 py-2.5 text-label-sm font-medium text-on-surface-variant whitespace-nowrap select-none',
                        canSort && 'cursor-pointer hover:text-on-surface',
                      )}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="inline-flex items-center gap-1">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {canSort ? (
                            sorted === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-secondary" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="w-3 h-3 text-secondary" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-35" />
                            )
                          ) : null}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-hairline text-body-md">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr key={`skeleton-${rowIdx}`} className="bg-white">
                  {columns.map((_, colIdx) => (
                    <td key={`sk-cell-${colIdx}`} className="px-4 py-3.5">
                      <div className="h-4 w-full max-w-[140px] rounded bg-surface-container animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-14 text-center"
                >
                  <div className="max-w-sm mx-auto flex flex-col items-center gap-1.5">
                    <span className="text-headline-sm font-semibold text-on-surface">
                      {emptyTitle}
                    </span>
                    <p className="text-body-sm text-on-surface-variant">
                      {emptyDescription}
                    </p>
                    {emptyAction ? <div className="mt-3">{emptyAction}</div> : null}
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isSelected =
                  selectedRowId !== undefined &&
                  selectedRowId !== null &&
                  row.id === selectedRowId;

                return (
                  <tr
                    key={row.id}
                    onClick={
                      onRowClick ? () => onRowClick(row.original) : undefined
                    }
                    className={cn(
                      'transition-colors bg-surface-container-lowest hover:bg-surface-container-low tabular-nums',
                      onRowClick && 'cursor-pointer',
                      isSelected && 'bg-secondary-fixed/60',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="px-4 py-3 border-t border-hairline bg-surface-container-low/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-body-sm text-on-surface-variant tabular-nums">
          <span>
            Page{' '}
            <strong className="text-on-surface font-medium">
              {pagination.page}
            </strong>{' '}
            of{' '}
            <strong className="text-on-surface font-medium">
              {pagination.totalPages}
            </strong>{' '}
            · {pagination.total} total
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
