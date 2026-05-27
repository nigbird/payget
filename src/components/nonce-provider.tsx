"use client"

import React, { createContext, useContext } from "react"

const NonceContext = createContext<string | undefined>(undefined)

export const NonceProvider = ({
  nonce,
  children,
}: {
  nonce: string | undefined
  children: React.ReactNode
}) => {
  return (
    <NonceContext.Provider value={nonce}>{children}</NonceContext.Provider>
  )
}

export const useNonce = () => useContext(NonceContext)
