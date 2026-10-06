'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

const NAV_BUTTON =
  'h-8 w-8 rounded-xl border-[#F1E7D0] bg-white text-slate-600 hover:bg-amber-50/50 disabled:opacity-50'

/** Up to five page numbers, centred on the current page where there's room. */
function visiblePages(page: number, totalPages: number) {
  const count = Math.min(5, totalPages)
  const first =
    totalPages <= 5 || page <= 3 ? 1 : page >= totalPages - 2 ? totalPages - 4 : page - 2
  return Array.from({ length: count }, (_, i) => first + i)
}

/**
 * Footer shared by every reconciliation table: "Showing x to y of z", a
 * page-size picker, and first/prev/numbered/next/last buttons. Renders nothing
 * for an empty table.
 */
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  if (total <= 0) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F1E7D0] bg-amber-50/20 px-6 py-4">
      <div className="flex items-center gap-3 text-xs font-medium text-[#6B7280]">
        <span>
          Showing <span className="font-bold text-[#1F2937]">{(page - 1) * pageSize + 1}</span> to{' '}
          <span className="font-bold text-[#1F2937]">{Math.min(page * pageSize, total)}</span> of{' '}
          <span className="font-bold text-[#1F2937]">{total}</span> results
        </span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" className={NAV_BUTTON} aria-label="First page" onClick={() => onPageChange(1)} disabled={page <= 1}>
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className={NAV_BUTTON} aria-label="Previous page" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <div className="mx-1 flex items-center gap-1">
          {visiblePages(page, totalPages).map((n) => (
            <Button
              key={n}
              variant={n === page ? 'default' : 'outline'}
              size="sm"
              className={`h-8 min-w-[32px] rounded-2xl border-[#F1E7D0] text-xs font-bold transition-all ${
                n === page
                  ? 'border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15'
                  : 'bg-white text-slate-600 hover:bg-amber-50/50'
              }`}
              onClick={() => onPageChange(n)}
            >
              {n}
            </Button>
          ))}
        </div>

        <Button variant="outline" size="icon" className={NAV_BUTTON} aria-label="Next page" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className={NAV_BUTTON} aria-label="Last page" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
