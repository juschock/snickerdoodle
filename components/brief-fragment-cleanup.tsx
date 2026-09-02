"use client"

import { useEffect } from "react"

/** Remove any private capability fragment even when commercial intake is closed. */
export function BriefFragmentCleanup() {
  useEffect(() => {
    if (!window.location.hash) return
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
  }, [])

  return null
}
