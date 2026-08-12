import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

const cache = new Map()

const normalizeTaxon = (value) => value.replace(/^[a-z]__/, '').replaceAll('_', ' ').trim()

async function loadSummary(taxon) {
  if (cache.has(taxon)) return cache.get(taxon)
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', redirects: '1',
    prop: 'extracts|pageimages|info', titles: taxon, exintro: '1',
    explaintext: '1', inprop: 'url', pithumbsize: '180',
  })
  try {
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`)
    if (!response.ok) throw new Error('Wikipedia request failed')
    const payload = await response.json()
    const page = Object.values(payload.query?.pages || {}).find((item) => !('missing' in item))
    const result = page
      ? { status: 'ready', title: page.title, extract: page.extract?.trim() || 'No introductory summary is available.', image: page.thumbnail?.source }
      : { status: 'missing', title: taxon }
    cache.set(taxon, result)
    return result
  } catch {
    return { status: 'error', title: taxon }
  }
}

export default function WikiTaxonTooltip() {
  const [preview, setPreview] = useState(null)
  const timer = useRef(null)
  const requestId = useRef(0)

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current)
      requestId.current += 1
      setPreview(null)
    }
    const show = (link) => {
      const taxon = normalizeTaxon(link.dataset.taxon || link.textContent || '')
      if (!taxon || taxon.toLowerCase() === 'unknown' || taxon.toLowerCase() === 'all taxa') return
      clearTimeout(timer.current)
      const rect = link.getBoundingClientRect()
      const above = rect.bottom + 245 > window.innerHeight
      const x = Math.max(12, Math.min(rect.left, window.innerWidth - 352))
      const y = above ? rect.top - 9 : rect.bottom + 9
      const currentRequest = ++requestId.current
      timer.current = setTimeout(() => {
        setPreview({ taxon, x, y, above, status: 'loading' })
        loadSummary(taxon).then((result) => {
          if (requestId.current === currentRequest) setPreview({ taxon, x, y, above, ...result })
        })
      }, 420)
    }
    const onMouseOver = (event) => {
      const link = event.target.closest?.('.taxon-link')
      if (link && !link.contains(event.relatedTarget)) show(link)
    }
    const onMouseOut = (event) => {
      const link = event.target.closest?.('.taxon-link')
      if (link && !link.contains(event.relatedTarget)) hide()
    }
    const onFocus = (event) => { const link = event.target.closest?.('.taxon-link'); if (link) show(link) }
    const onBlur = (event) => { if (event.target.closest?.('.taxon-link')) hide() }
    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    window.addEventListener('scroll', hide, true)
    return () => {
      clearTimeout(timer.current)
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])

  if (!preview) return null
  return <aside className={`wiki-hover ${preview.above ? 'above' : ''}`} style={{ left: preview.x, top: preview.y }} role="tooltip">
    {preview.status === 'loading' ? <div className="wiki-hover-state"><LoaderCircle className="spin" size={15} />Loading Wikipedia preview…</div>
      : preview.status === 'ready' ? <>{preview.image && <img src={preview.image} alt="" />}<div><span>WIKIPEDIA PREVIEW</span><b>{preview.title}</b><p>{preview.extract}</p><small>Background information; verify against your reference database.</small></div></>
        : preview.status === 'missing' ? <div className="wiki-hover-state">No exact Wikipedia page found for <b>{preview.taxon}</b>.</div>
          : <div className="wiki-hover-state">Wikipedia preview is temporarily unavailable.</div>}
  </aside>
}
