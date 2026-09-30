"use client"

import { useCallback, useEffect, useState } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { BellRing, Copy, ExternalLink, Loader2, Plus, Speaker, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

type SoundDeviceDto = {
  id: string
  name: string
  createdAt: string
  lastSeenAt: string | null
}

type Props = { merchantId: string; canManage: boolean }

export function SoundDevicesTab({ merchantId, canManage }: Props) {
  const { toast } = useToast()
  const [devices, setDevices] = useState<SoundDeviceDto[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [testing, setTesting] = useState(false)
  const [pairing, setPairing] = useState<{ name: string; link: string } | null>(null)
  const [toRemove, setToRemove] = useState<SoundDeviceDto | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/merchants/${merchantId}/sound-devices`)
      if (res.ok) setDevices((await res.json()).devices ?? [])
    } finally {
      setLoading(false)
    }
  }, [merchantId])

  useEffect(() => {
    void load()
  }, [load])

  const addDevice = async () => {
    setNameError(null)
    setAdding(true)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/sound-devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.errors?.name) setNameError(data.errors.name)
        else toast({ variant: "destructive", title: "Could not add device", description: data?.error })
        return
      }
      setPairing({
        name: data.device.name,
        link: `${window.location.origin}/speaker#t=${encodeURIComponent(data.token)}`,
      })
      setName("")
      void load()
    } finally {
      setAdding(false)
    }
  }

  const removeDevice = async (device: SoundDeviceDto) => {
    const res = await fetch(`/api/merchants/${merchantId}/sound-devices/${device.id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast({ variant: "destructive", title: "Could not remove device", description: data?.error })
      return
    }
    toast({ title: `${device.name} removed`, description: "It will stop announcing within a minute." })
    void load()
  }

  const sendTest = async () => {
    setTesting(true)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/sound-devices/test`, { method: "POST" })
      toast(
        res.ok
          ? { title: "Test sent", description: "Every open speaker should announce 1.00 ETB now." }
          : { variant: "destructive", title: "Could not send test" }
      )
    } finally {
      setTesting(false)
    }
  }

  const copyLink = async () => {
    if (!pairing) return
    try {
      await navigator.clipboard.writeText(pairing.link)
      toast({ title: "Pairing link copied" })
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Select and copy the link manually." })
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-[#f8b513]/30 bg-gradient-to-br from-[#fff9ef] to-[#fdf1d4] shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-[#5b371f]">
            <Speaker className="h-5 w-5 text-[#754319]" />
            Payment Sound Devices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[#754319]/80">
          <p>
            A sound device is a phone, tablet or PC at your counter that announces every payment you receive, including
            payments customers make from other banks and wallets. Add a device, open its pairing link on it, and leave
            the page open with the volume up.
          </p>
          {canManage && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="sound-device-name">Device name</Label>
                <Input
                  id="sound-device-name"
                  placeholder="e.g. Front counter phone"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) void addDevice()
                  }}
                />
                {nameError && <p className="text-xs text-destructive">{nameError}</p>}
              </div>
              <Button onClick={addDevice} disabled={adding || !name.trim()} className="min-h-10">
                {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add device
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-white/60 bg-white/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-lg text-[#5b371f]">Paired devices</CardTitle>
          <Button variant="outline" size="sm" onClick={sendTest} disabled={testing || devices.length === 0}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
            Send test announcement
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#754319]" />
          ) : devices.length === 0 ? (
            <p className="text-sm text-[#754319]/70">No devices paired yet.</p>
          ) : (
            <ul className="divide-y divide-[#754319]/10">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#5b371f]">{d.name}</p>
                    <p className="text-xs text-[#754319]/70">
                      Paired {new Date(d.createdAt).toLocaleDateString()} ·{" "}
                      {d.lastSeenAt ? `last connected ${new Date(d.lastSeenAt).toLocaleString()}` : "never connected"}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToRemove(d)}
                      aria-label={`Remove ${d.name}`}
                      title="Remove device"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pairing} onOpenChange={(open) => !open && setPairing(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Pair &ldquo;{pairing?.name}&rdquo;</AlertDialogTitle>
            <AlertDialogDescription>
              Scan this code with the counter device, or open the link on it. This link is shown only once — anyone
              with it can hear your payment amounts, so don&apos;t share it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pairing && (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-xl bg-white p-3">
                <QRCodeCanvas value={pairing.link} size={200} />
              </div>
              <Input readOnly value={pairing.link} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="flex-1" onClick={copyLink}>
                  <Copy className="mr-2 h-4 w-4" /> Copy link
                </Button>
                <Button variant="outline" className="flex-1" asChild>
                  <a href={pairing.link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Use this browser
                  </a>
                </Button>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogAction>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toRemove} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {toRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The device will stop announcing payments. To use it again you&apos;ll need to pair it as a new device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toRemove) void removeDevice(toRemove)
                setToRemove(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
