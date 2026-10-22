"use client"

import React, { createContext, useContext } from "react"
import { setNonce } from "get-nonce"

const NonceContext = createContext<string | undefined>(undefined)

export const NonceProvider = ({
  nonce,
  children,
}: {
  nonce: string | undefined
  children: React.ReactNode
}) => {
  // Radix's scroll lock (react-remove-scroll → react-style-singleton) injects a
  // <style> element when a dialog/select/menu opens and takes its nonce from
  // get-nonce. The CSP allows <style> elements only with this request's nonce,
  // so hand it over before anything opens. Browser only: on the server this is
  // a module-level value shared by all requests.
  if (typeof window !== "undefined" && nonce) setNonce(nonce)

  return (
    <NonceContext.Provider value={nonce}>{children}</NonceContext.Provider>
  )
}

export const useNonce = () => useContext(NonceContext)
