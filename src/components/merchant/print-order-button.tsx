"use client"

import { useState } from "react"
import { Printer, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useToast } from "@/hooks/use-toast"
import { printOrder } from "@/lib/print-order"
import type { Transaction } from "@/lib/db"

type Props = {
  transaction: Transaction
  merchantName: string
  /** Called after table/shift are saved so the caller can refresh its transaction list. */
  onSaved?: (printInfo: { tableNo: string | null; shift: string | null }) => void
}

export function PrintOrderButton({ transaction, merchantName, onSaved }: Props) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [tableNo, setTableNo] = useState(transaction.printInfo?.tableNo ?? "")
  const [shift, setShift] = useState(transaction.printInfo?.shift ?? "")
  const [saving, setSaving] = useState(false)

  // Default click: print immediately with whatever table/shift is already stored (or the
  // defaults) — no preview or edit step required.
  const handleQuickPrint = () => {
    printOrder(transaction, merchantName)
  }

  const handleSaveAndPrint = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/print-info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNo: tableNo.trim() || null, shift: shift.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to save")
      onSaved?.(data)
      printOrder(transaction, merchantName, { tableNo: data.tableNo, shift: data.shift })
      setOpen(false)
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to save table/shift",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-slate-400 hover:text-[#754319]"
        onClick={handleQuickPrint}
        aria-label="Print order"
        title="Print order"
      >
        <Printer className="h-4 w-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-6 rounded-full text-slate-300 hover:text-slate-500"
            aria-label="Edit table & shift before printing"
            title="Edit table & shift"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 rounded-2xl p-0 shadow-2xl border-slate-100" align="end">
          <Accordion type="single" collapsible defaultValue="edit">
            <AccordionItem value="edit" className="border-none">
              <AccordionTrigger className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 hover:no-underline">
                Edit table & shift
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Table No (defaults to 0)
                    </Label>
                    <Input
                      value={tableNo}
                      onChange={(e) => setTableNo(e.target.value)}
                      placeholder="0"
                      className="h-9 rounded-xl"
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Shift (defaults to Shift 1)
                    </Label>
                    <Input
                      value={shift}
                      onChange={(e) => setShift(e.target.value)}
                      placeholder="Shift 1"
                      className="h-9 rounded-xl"
                      maxLength={20}
                    />
                  </div>
                  <Button
                    onClick={handleSaveAndPrint}
                    disabled={saving}
                    className="h-9 w-full rounded-xl border border-white/20 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 hover:opacity-95"
                  >
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Printer className="mr-1.5 h-3.5 w-3.5" />}
                    Save & Print
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </PopoverContent>
      </Popover>
    </div>
  )
}
