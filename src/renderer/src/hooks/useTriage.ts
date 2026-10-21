import { useCallback, useEffect, useMemo, useState } from 'react'

export type TriageState = 'fixed' | 'ignored'
export interface TriageEntry {
  state: TriageState
  at: number
}

type TriageMap = Record<string, TriageEntry>

function storageKey(repo: string, identity: string): string {
  return `ocr.triage.${repo}.${identity}`
}

function read(repo: string, identity: string): TriageMap {
  try {
    const raw = localStorage.getItem(storageKey(repo, identity))
    return raw ? (JSON.parse(raw) as TriageMap) : {}
  } catch {
    return {}
  }
}

export function useTriage(repo: string, identity: string) {
  const [map, setMap] = useState<TriageMap>(() => read(repo, identity))

  useEffect(() => {
    setMap(read(repo, identity))
  }, [repo, identity])

  const persist = useCallback(
    (next: TriageMap) => {
      setMap(next)
      try {
        localStorage.setItem(storageKey(repo, identity), JSON.stringify(next))
      } catch {
        /* storage may be full; the in-memory triage still works */
      }
    },
    [repo, identity]
  )

  const mark = useCallback(
    (key: string, state: TriageState | null) => {
      const next = { ...map }
      if (state) next[key] = { state, at: Date.now() }
      else delete next[key]
      persist(next)
    },
    [map, persist]
  )

  const clear = useCallback(() => persist({}), [persist])

  const counts = useMemo(() => {
    let fixed = 0
    let ignored = 0
    for (const entry of Object.values(map)) {
      if (entry.state === 'fixed') fixed++
      else ignored++
    }
    return { fixed, ignored }
  }, [map])

  return { map, mark, clear, counts }
}
