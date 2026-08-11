import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, CornerUpLeft, GitCompareArrows, Search, Sparkles, X } from 'lucide-react'
import PageGuide from './PageGuide.jsx'

const PALETTE = ['#20b884', '#6d8ee8', '#f0ad3d', '#9b72d4', '#e06d5d', '#46a8b6', '#88b84c']
const fmt = (value) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

function SelectFilter({ label, value, options, onChange }) {
  return <label className="filter-field"><span>{label}</span><div className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="All">All {label.toLowerCase()}</option>{options.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
}

function buildTree(rows) {
  const root = { name: 'All taxa', reads: 0, aSum: 0, aReads: 0, children: new Map(), path: [] }
  for (const row of rows) {
    root.reads += row.reads
    if (row.meanA !== null) { root.aSum += row.meanA * row.reads; root.aReads += row.reads }
    let node = root
    const lineage = (row.path || `${row.kingdom}|${row.name}`).split('|').filter(Boolean)
    for (const name of lineage) {
      if (!node.children.has(name)) node.children.set(name, { name, reads: 0, aSum: 0, aReads: 0, children: new Map(), path: [...node.path, name] })
      node = node.children.get(name)
      node.reads += row.reads
      if (row.meanA !== null) { node.aSum += row.meanA * row.reads; node.aReads += row.reads }
    }
  }
  return root
}

function findNode(root, path) {
  let node = root
  for (const name of path) {
    node = node.children.get(name)
    if (!node) return root
  }
  return node
}

function polar(cx, cy, radius, angle) {
  const radians = (angle - 90) * Math.PI / 180
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) }
}

function arcPath(inner, outer, start, end) {
  const adjustedEnd = Math.min(end, start + 359.99)
  const a = polar(260, 250, outer, start)
  const b = polar(260, 250, outer, adjustedEnd)
  const c = polar(260, 250, inner, adjustedEnd)
  const d = polar(260, 250, inner, start)
  const large = adjustedEnd - start > 180 ? 1 : 0
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 ${large} 0 ${d.x} ${d.y} Z`
}

function Sunburst({ tree, focusPath, onFocus }) {
  const [hover, setHover] = useState(null)
  const focus = findNode(tree, focusPath)
  const arcs = []
  const walk = (node, start, end, depth, branch) => {
    if (depth > 4 || !node.children.size) return
    let angle = start
    const children = [...node.children.values()].sort((a, b) => b.reads - a.reads)
    children.forEach((child, index) => {
      const width = (end - start) * child.reads / node.reads
      const next = angle + width
      const branchIndex = depth === 1 ? index : branch
      if (width > .6) arcs.push({ node: child, start: angle, end: next, depth, branch: branchIndex })
      walk(child, angle, next, depth + 1, branchIndex)
      angle = next
    })
  }
  walk(focus, 0, 360, 1, 0)
  const meanA = focus.aReads ? focus.aSum / focus.aReads : null

  return <div className="sunburst-wrap">
    <svg className="sunburst" viewBox="0 0 520 500" role="img" aria-label={"Taxonomic hierarchy for " + focus.name} onMouseLeave={() => setHover(null)}>
      {arcs.map(({ node, start, end, depth, branch }) => <path
        key={node.path.join('>')}
        d={arcPath(72 + (depth - 1) * 39, 108 + (depth - 1) * 39, start + .25, end - .25)}
        fill={PALETTE[branch % PALETTE.length]}
        opacity={1 - (depth - 1) * .1}
        onClick={() => onFocus(node.path)}
        onMouseMove={(event) => setHover({ node, x: event.clientX + 14, y: event.clientY + 14 })}
        className="sunburst-arc"
      />)}
      <circle cx="260" cy="250" r="68" className="sunburst-core" />
      <text x="260" y="238" textAnchor="middle" className="sunburst-label">{focus.name}</text>
      <text x="260" y="260" textAnchor="middle" className="sunburst-value">{fmt(focus.reads)}</text>
      <text x="260" y="278" textAnchor="middle" className="sunburst-detail">{meanA === null ? 'No A value' : `mean A ${meanA.toFixed(3)}`}</text>
    </svg>
    {hover && <div className="sunburst-tooltip" style={{ left: hover.x, top: hover.y }}><b>{hover.node.name}</b><span>{hover.node.path.join(" › ")}</span><div><strong>{hover.node.reads.toLocaleString()}</strong> reads · <strong>{(hover.node.reads / focus.reads * 100).toFixed(1)}%</strong> of view</div>{hover.node.aReads > 0 && <small>Mean A {(hover.node.aSum / hover.node.aReads).toFixed(3)}</small>}<em>Click to focus</em></div>}
    <p className="sunburst-hint">Select a segment to focus · use the breadcrumb to move back</p>
  </div>
}

export default function LibraryExplorer({ records = [], warnings = [], warningMethod, selectedLibrary, onSelectLibrary, comparisonLibraries = [], onAddToComparison, onRemoveFromComparison, onOpenComparison, onOpenTaxon }) {
  const [libraryQuery, setLibraryQuery] = useState(selectedLibrary || '')
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [minReads, setMinReads] = useState('')
  const [minA, setMinA] = useState('')
  const [focusPath, setFocusPath] = useState([])

  const libraryIds = useMemo(() => [...new Set(records.map((row) => row.libraryId))].sort(), [records])
  useEffect(() => { if (selectedLibrary) setLibraryQuery(selectedLibrary) }, [selectedLibrary])
  useEffect(() => { setFocusPath([]) }, [selectedLibrary, pipeline, kingdom, minReads, minA])

  const chooseLibrary = (value) => {
    setLibraryQuery(value)
    if (libraryIds.includes(value)) onSelectLibrary(value)
  }
  const matches = libraryQuery && !libraryIds.includes(libraryQuery)
    ? libraryIds.filter((id) => id.toLowerCase().includes(libraryQuery.toLowerCase())).slice(0, 8)
    : []

  const libraryRows = useMemo(() => records.filter((row) => row.libraryId === selectedLibrary), [records, selectedLibrary])
  const pipelines = [...new Set(libraryRows.map((row) => row.pipeline))].sort()
  const kingdoms = [...new Set(libraryRows.map((row) => row.kingdom))].sort()
  const filtered = useMemo(() => {
    const reads = minReads === '' ? 0 : Number(minReads)
    const damage = minA === '' ? null : Number(minA)
    return libraryRows.filter((row) =>
      (pipeline === 'All' || row.pipeline === pipeline) &&
      (kingdom === 'All' || row.kingdom === kingdom) &&
      row.reads >= (Number.isFinite(reads) ? reads : 0) &&
      (damage === null || (Number.isFinite(damage) && row.meanA !== null && row.meanA >= damage)))
  }, [libraryRows, pipeline, kingdom, minReads, minA])

  const tree = useMemo(() => buildTree(filtered), [filtered])
  const focused = findNode(tree, focusPath)
  const topTaxa = [...focused.children.values()].sort((a, b) => b.reads - a.reads).slice(0, 12)
  const libraryWarnings = warnings.filter((row) => row.libraryId === selectedLibrary)
  const meta = libraryRows[0]

  return <section className="library-explorer">
    <div className="explorer-hero">
      <div><span className="kicker">LIBRARY EXPLORER</span><h1>Taxonomic overview</h1><p>Inspect a control library from kingdom down to genus.</p></div>
      <div className="library-search">
        <label htmlFor="library-id"><Search size={17} /><input id="library-id" value={libraryQuery} onChange={(event) => chooseLibrary(event.target.value)} placeholder="Search library ID…" autoComplete="off" /></label>
        {matches.length > 0 && <div className="library-results">{matches.map((id) => <button key={id} onClick={() => chooseLibrary(id)}>{id}</button>)}</div>}
      </div>
    </div>

    <PageGuide items={[
      { title: 'Choose one library', text: 'Search for a library ID or arrive here by clicking a warning, chart drill-down, or PCoA point. Everything below then describes that single library.' },
      { title: 'Explore the rings', text: 'Larger Krona segments contain more assigned reads. Click a segment to zoom into that branch; use the breadcrumb above the plot to move back up.' },
      { title: 'Filter or compare', text: 'Read and A filters hide taxon observations that do not meet the threshold. Add the library to slot A or B when you want a direct profile comparison.' },
    ]} />

    {!records.length ? <div className="panel explorer-empty"><Sparkles size={23} /><h2>Library taxonomy is not in this data file</h2><p>Rebuild dashboard-data.json with the updated builder to enable this view.</p></div>
      : !selectedLibrary ? <div className="panel explorer-empty"><Search size={23} /><h2>Choose a library to explore</h2><p>Search by library ID, or open one directly from the warnings on Overview.</p></div>
      : !libraryRows.length ? <div className="panel explorer-empty"><AlertTriangle size={23} /><h2>Library not found</h2><p>Try another ID from the search field.</p></div>
      : <>
        <div className="library-summary panel">
          <div><span>Library ID</span><b>{selectedLibrary}</b></div>
          <div><span>Control</span><b>{meta.controlType}</b></div>
          <div><span>Collection month</span><b>{meta.month}</b></div>
          <div><span>Assigned reads</span><b>{filtered.reduce((sum, row) => sum + row.reads, 0).toLocaleString()}</b></div>
          <div><span>Taxa shown</span><b>{filtered.length}</b></div>
          <div className={libraryWarnings.length ? 'summary-warning' : ''}><span>Warnings</span><b>{libraryWarnings.length}</b></div>
        </div>

        <div className="library-compare-tray panel">
          <div className="compare-tray-intro"><span><GitCompareArrows size={17} /></span><div><b>Compare library profiles</b><small>Add this library as A or B, then open the synchronized comparison.</small></div></div>
          <div className="compare-tray-slots">{comparisonLibraries.map((libraryId, index) => <span key={libraryId}><i>{index === 0 ? "A" : "B"}</i><b>{libraryId}</b><button onClick={() => onRemoveFromComparison(libraryId)} aria-label={"Remove " + libraryId + " from comparison"}><X size={12} /></button></span>)}{comparisonLibraries.length < 2 && <em>{comparisonLibraries.length ? "Library B is empty" : "Both comparison slots are empty"}</em>}</div>
          <div className="compare-tray-actions"><button className="secondary" disabled={comparisonLibraries.includes(selectedLibrary)} onClick={() => onAddToComparison(selectedLibrary)}>{comparisonLibraries.includes(selectedLibrary) ? "Added" : comparisonLibraries.length >= 2 ? "Replace oldest" : comparisonLibraries.length === 0 ? "Add as library A" : "Add as library B"}</button>{comparisonLibraries.length === 2 && <button className="compare-now" onClick={onOpenComparison}>Compare now<GitCompareArrows size={14} /></button>}</div>
        </div>

        <article className={`library-warning-guide panel ${libraryWarnings.length ? "flagged" : "clear"}`}>
          <div className="warning-guide-intro">
            <span className="warning-guide-icon">{libraryWarnings.length ? <AlertTriangle size={18} /> : <Sparkles size={18} />}</span>
            <div><span className="kicker">HOW WARNINGS WORK</span><h2>{libraryWarnings.length ? `Flagged in ${libraryWarnings.length} comparison ${libraryWarnings.length === 1 ? "group" : "groups"}` : "No warning for this library"}</h2><p>A warning is a statistical review flag, not a pipeline failure or proof of a contamination source.</p></div>
          </div>
          <div className="warning-guide-method"><b>Trigger</b><span>{warningMethod || "Above median + 3 scaled MAD among comparable libraries (minimum 4 libraries)."}</span><small>Libraries are compared only within the same control type, kingdom, and pipeline.</small></div>
          {libraryWarnings.length > 0 ? <div className="library-warning-details">{libraryWarnings.map((item) => <div key={[item.month, item.kingdom, item.pipeline].join("-")}>
            <span><b>{item.kingdom}</b><small>{item.pipeline} · {item.controlType}</small><em>Leading taxon: <button className="taxon-link compact" onClick={() => onOpenTaxon(item.topTaxon)}>{item.topTaxon || "Unknown"}</button></em></span>
            <span><strong>{item.reads.toLocaleString()} reads</strong><small>Baseline median {item.baseline.toLocaleString()} · threshold {item.threshold.toLocaleString()}</small><em>{item.fold ? item.fold + "× the median" : "Baseline median is zero"}</em></span>
          </div>)}</div> : <div className="library-warning-clear"><span />This library does not exceed the robust baseline in any comparison group.</div>}
        </article>

        <div className="panel explorer-filters">
          <SelectFilter label="Pipeline" value={pipeline} options={pipelines} onChange={setPipeline} />
          <SelectFilter label="Kingdom" value={kingdom} options={kingdoms} onChange={setKingdom} />
          <label className="filter-field"><span>Minimum nreads</span><input type="number" min="0" placeholder="No minimum" value={minReads} onChange={(event) => setMinReads(event.target.value)} /></label>
          <label className="filter-field"><span>Minimum A</span><input type="number" min="0" step="0.01" placeholder="No minimum" value={minA} onChange={(event) => setMinA(event.target.value)} /></label>
        </div>

        <div className="explorer-grid">
          <article className="panel sunburst-panel">
            <div className="panel-head explorer-panel-head"><div><span className="kicker">KRONA-STYLE VIEW</span><h2>Taxonomic hierarchy</h2><p>Arc size represents assigned reads.</p></div></div>
            <div className="taxonomy-breadcrumb">
              <button onClick={() => setFocusPath([])}><CornerUpLeft size={13} />All taxa</button>
              {focusPath.map((name, index) => <button key={focusPath.slice(0, index + 1).join('>')} onClick={() => setFocusPath(focusPath.slice(0, index + 1))}>{name}</button>)}
            </div>
            {filtered.length ? <Sunburst tree={tree} focusPath={focusPath} onFocus={setFocusPath} /> : <div className="explorer-empty compact"><AlertTriangle size={20} /><h2>No matching taxa</h2><p>Widen the filters to restore the hierarchy.</p></div>}
          </article>

          <article className="panel lineage-panel">
            <div className="panel-head"><div><span className="kicker">CURRENT LEVEL</span><h2>{focused.name}</h2><p>{topTaxa.length} branches shown, ranked by reads</p></div></div>
            <div className="lineage-list">{topTaxa.map((item, index) => <button key={item.path.join('>')} onClick={() => item.children.size ? setFocusPath(item.path) : onOpenTaxon(item.name)}>
              <span className="lineage-rank">{String(index + 1).padStart(2, '0')}</span>
              <span><b>{item.name}</b><small>{item.aReads ? `mean A ${(item.aSum / item.aReads).toFixed(3)}` : 'A unavailable'}</small></span>
              <strong>{item.reads.toLocaleString()}<small>reads</small></strong>
            </button>)}</div>
          </article>
        </div>
      </>}
  </section>
}
