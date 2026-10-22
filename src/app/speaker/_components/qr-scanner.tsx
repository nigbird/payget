"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Full-screen camera view that reads the portal's pairing QR code. Uses the
 * browser's BarcodeDetector where it exists (Chrome on Android), otherwise
 * jsQR, loaded only then (iPhone Safari).
 */

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }

const SCAN_INTERVAL_MS = 250

async function makeReader(): Promise<(video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>> {
  const Native = (window as Window & { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
  if (Native) {
    try {
      const detector = new Native({ formats: ["qr_code"] })
      return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
    } catch {
      // unsupported format list on this device: fall through to jsQR
    }
  }
  const jsQR = (await import("jsqr")).default
  return async (video, canvas) => {
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return null
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, width, height)
    return jsQR(ctx.getImageData(0, 0, width, height).data, width, height)?.data ?? null
  }
}

export function QrScanner({ onScanned, onClose }: { onScanned: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)
  // Latest callback, so the camera isn't restarted when the parent re-renders.
  const onScannedRef = useRef(onScanned)
  onScannedRef.current = onScanned

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    let cancelled = false

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't use the camera. Paste the link instead.")
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      } catch (err) {
        const name = err instanceof Error ? err.name : ""
        setError(
          name === "NotAllowedError"
            ? "Camera access is blocked. Allow it in the browser's site settings, or paste the link."
            : "Couldn't open the camera. Paste the link instead."
        )
        return
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop())
      const video = videoRef.current!
      video.srcObject = stream
      await video.play().catch(() => {})

      const read = await makeReader()
      timer = setInterval(async () => {
        if (done.current || !videoRef.current || !canvasRef.current) return
        try {
          const text = await read(videoRef.current, canvasRef.current)
          if (text && !done.current) {
            done.current = true
            onScannedRef.current(text)
          }
        } catch {
          // a frame that couldn't be read; try the next one
        }
      }, SCAN_INTERVAL_MS)
    }
    void start()

    return () => {
      cancelled = true
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <p className="pl-2 text-base font-semibold text-white">Scan the pairing QR code</p>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="text-white hover:bg-white/15 hover:text-white">
          <X className="h-6 w-6" />
        </Button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        {!error && (
          <div className="relative h-64 w-64 rounded-3xl border-4 border-[#f8b513] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        )}
        {error && <p className="relative mx-6 rounded-2xl bg-white p-4 text-center text-sm text-[#5b371f]">{error}</p>}
      </div>
      <canvas ref={canvasRef} hidden />
    </div>
  )
}
