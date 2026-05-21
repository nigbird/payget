function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function resolveAbsoluteUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  if (url.startsWith("/")) return `${window.location.origin}${url}`
  return `${window.location.origin}/${url}`
}

/** Rasterize the on-screen QR SVG (with excavated logo) to a high-res PNG. */
export async function downloadQrFromSvgElement(
  svgElement: SVGSVGElement,
  options: { fileName: string; outputSize?: number }
): Promise<void> {
  const outputSize = options.outputSize ?? 1024
  const clone = svgElement.cloneNode(true) as SVGSVGElement

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")
  clone.setAttribute("width", String(outputSize))
  clone.setAttribute("height", String(outputSize))

  const imageEls = clone.querySelectorAll("image")
  await Promise.all(
    Array.from(imageEls).map(async (el) => {
      const href =
        el.getAttribute("href") ||
        el.getAttributeNS("http://www.w3.org/1999/xlink", "href")
      if (!href || href.startsWith("data:")) return

      try {
        const response = await fetch(resolveAbsoluteUrl(href), { credentials: "include" })
        if (!response.ok) throw new Error("Logo fetch failed")
        const dataUrl = await blobToDataUrl(await response.blob())
        el.setAttribute("href", dataUrl)
        el.removeAttributeNS("http://www.w3.org/1999/xlink", "href")
      } catch {
        el.remove()
      }
    })
  )

  const svgString = new XMLSerializer().serializeToString(clone)
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
  const blobUrl = URL.createObjectURL(svgBlob)

  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = outputSize
        canvas.height = outputSize
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          reject(new Error("Canvas is not supported"))
          return
        }
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, outputSize, outputSize)
        ctx.drawImage(img, 0, 0, outputSize, outputSize)

        const link = document.createElement("a")
        link.download = options.fileName
        link.href = canvas.toDataURL("image/png")
        link.click()
        resolve()
      }
      img.onerror = () => reject(new Error("Failed to rasterize QR SVG"))
      img.src = blobUrl
    })
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

/** Scale a visible QR canvas to a high-res PNG without blurring modules. */
export async function downloadQrFromCanvasElement(
  sourceCanvas: HTMLCanvasElement,
  options: { fileName: string; outputSize?: number; waitMs?: number }
): Promise<void> {
  if (options.waitMs && options.waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, options.waitMs))
  }

  const outputSize = options.outputSize ?? 1024
  const exportCanvas = document.createElement("canvas")
  exportCanvas.width = outputSize
  exportCanvas.height = outputSize

  const ctx = exportCanvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is not supported")

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, outputSize, outputSize)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sourceCanvas, 0, 0, outputSize, outputSize)

  const link = document.createElement("a")
  link.download = options.fileName
  link.href = exportCanvas.toDataURL("image/png")
  link.click()
}

export function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.download = fileName
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}
