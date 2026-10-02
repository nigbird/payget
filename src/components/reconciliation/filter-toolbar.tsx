'use client'

import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Shared filter bar for the reconciliation tabs, so every tab lines up the
 * same way: search on the left and actions (refresh, export) on the right of
 * the first row, filters on an even grid below it.
 */
export function FilterToolbar({
  search,
  actions,
  children,
  footer,
}: {
  search: ReactNode
  actions?: ReactNode
  /** Filter controls; each child takes one grid cell. */
  children?: ReactNode
  /** Optional note under the filters, e.g. which view is active. */
  footer?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">{search}</div>
          {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
        </div>
        {children && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>}
        {footer}
      </CardContent>
    </Card>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  inputRef,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        placeholder={placeholder}
        className="pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** From/to date pair that fills one filter grid cell. */
export function DateRangeFilter({
  from,
  to,
  onChange,
  className = '',
}: {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Input
        type="date"
        aria-label="From date"
        className="min-w-0 flex-1"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange({ from: e.target.value, to })}
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To date"
        className="min-w-0 flex-1"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange({ from, to: e.target.value })}
      />
      {(from || to) && (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onChange({ from: '', to: '' })}>
          Clear
        </Button>
      )}
    </div>
  )
}
