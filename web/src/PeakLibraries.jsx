import { AlertTriangle, ArrowRight, X } from 'lucide-react'

const fmt = (value) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const prettyDate = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en', { month: 'long', year: 'numeric' })

export default function PeakLibraries({ month, taxon = "", records = [], overviewRows = [], warnings = [], onClose, onOpenLibrary }) {
  if (!month) return null
  const allowed = new Set(overviewRows.filter((row) => row.month === month && (!taxon || row.name === taxon)).map((row) => [row.month, row.controlType, row.kingdom, row.pipeline, row.name].join("\u0000")))
  const matching = records.filter((row) => allowed.has([row.month, row.controlType, row.kingdom, row.pipeline, row.name].join("\u0000")))

  const groups = new Map()
  for (const row of matching) {
    const item = groups.get(row.libraryId) || { libraryId: row.libraryId, reads: 0, taxa: new Map(), controlType: row.controlType }
    item.reads += row.reads
    item.taxa.set(row.name, (item.taxa.get(row.name) || 0) + row.reads)
    groups.set(row.libraryId, item)
  }
  const warningIds = new Set(warnings.filter((row) => row.month === month).map((row) => row.libraryId))
  const libraries = [...groups.values()].map((item) => ({
    ...item,
    warning: warningIds.has(item.libraryId),
    topTaxa: [...item.taxa].sort((a, b) => b[1] - a[1]).slice(0, 3),
  })).sort((a, b) => b.reads - a.reads)
  const total = libraries.reduce((sum, item) => sum + item.reads, 0)

  return <div className="peak-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="peak-drawer" role="dialog" aria-modal="true" aria-labelledby="peak-title">
      <div className="peak-head"><div><span className="kicker">{taxon ? 'HEATMAP CELL' : 'READ VOLUME PEAK'}</span><h2 id="peak-title">{taxon || prettyDate(month)}</h2><p>{taxon && <>{prettyDate(month)} · </>}{libraries.length} libraries · {total.toLocaleString()} matching reads</p></div><button onClick={onClose} aria-label="Close library breakdown"><X size={18} /></button></div>
      <div className="peak-columns"><span>Library and leading taxa</span><span>Contribution</span></div>
      <div className="peak-list">{libraries.map((item) => <button key={item.libraryId} onClick={() => onOpenLibrary(item.libraryId)}>
        <span className={item.warning ? 'peak-library warning' : 'peak-library'}><b>{item.libraryId}{item.warning && <AlertTriangle size={12} />}</b><small>{item.controlType}</small><em>{item.topTaxa.map(([name]) => name).join(' · ')}</em></span>
        <span className="peak-contribution"><b>{fmt(item.reads)}</b><small>{total ? (item.reads / total * 100).toFixed(1) : 0}%</small><i><span style={{ width: `${total ? item.reads / total * 100 : 0}%` }} /></i></span>
        <ArrowRight size={15} />
      </button>)}{!libraries.length && <div className="explorer-empty compact"><AlertTriangle size={21} /><h2>No library records match</h2><p>Try another heatmap cell or widen the overview filters.</p></div>}</div>
    </aside>
  </div>
}
