import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRight, ChevronDown, GitCompareArrows,
  Search, ShieldAlert, TestTubes,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const COLORS = {
  Microbe: '#24c18a', Plant: '#9ad55c', Animal: '#f2b84b',
  'Other Eukaryote': '#b08cff',
}
const fmt = (value) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const monthLabel = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' })

function FilterSelect({ label, value, options, onChange }) {
  return <label className="filter-field"><span>{label}</span><div className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="All">All {label.toLowerCase()}</option>{options.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
}

function MetricStrip({ items }) {
  return <div className="analysis-metrics panel">{items.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value}</b><small>{item.detail}</small></div>)}</div>
}

export function TaxonExplorer({ records = [], warnings = [], onOpenLibrary }) {
  const [taxon, setTaxon] = useState('')
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [minReads, setMinReads] = useState('')
  const [minA, setMinA] = useState('')

  const dimensions = useMemo(() => ({
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
    taxa: [...new Set(records.map((row) => row.name))].sort((a, b) => a.localeCompare(b)),
  }), [records])
  useEffect(() => {
    if (!taxon && records.length) {
      const totals = new Map()
      records.forEach((row) => totals.set(row.name, (totals.get(row.name) || 0) + row.reads))
      setTaxon([...totals].sort((a, b) => b[1] - a[1])[0]?.[0] || '')
    }
  }, [records, taxon])

  const baseRows = useMemo(() => {
    const reads = minReads === '' ? 0 : Number(minReads)
    const damage = minA === '' ? null : Number(minA)
    return records.filter((row) =>
      (pipeline === 'All' || row.pipeline === pipeline) &&
      (kingdom === 'All' || row.kingdom === kingdom) &&
      row.reads >= (Number.isFinite(reads) ? reads : 0) &&
      (damage === null || (Number.isFinite(damage) && row.meanA !== null && row.meanA >= damage)))
  }, [records, pipeline, kingdom, minReads, minA])
  const rows = useMemo(() => baseRows.filter((row) => row.name === taxon), [baseRows, taxon])
  const warningIds = useMemo(() => new Set(warnings.map((row) => row.libraryId)), [warnings])

  const summary = useMemo(() => {
    const libraries = new Map()
    const months = new Map()
    let reads = 0; let aSum = 0; let aReads = 0
    for (const row of rows) {
      reads += row.reads
      const library = libraries.get(row.libraryId) || { libraryId: row.libraryId, reads: 0, aSum: 0, aReads: 0, month: row.month, controlType: row.controlType, pipeline: row.pipeline }
      library.reads += row.reads
      if (row.meanA !== null) { aSum += row.meanA * row.reads; aReads += row.reads; library.aSum += row.meanA * row.reads; library.aReads += row.reads }
      libraries.set(row.libraryId, library)
      const point = months.get(row.month) || { month: row.month, reads: 0 }
      point.reads += row.reads
      months.set(row.month, point)
    }
    return {
      reads, meanA: aReads ? aSum / aReads : null,
      libraries: [...libraries.values()].sort((a, b) => b.reads - a.reads),
      timeline: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    }
  }, [rows])
  const selectedKingdom = rows[0]?.kingdom || baseRows.find((row) => row.name === taxon)?.kingdom

  return <section className="analysis-page">
    <div className="explorer-hero">
      <div><span className="kicker">TAXON EXPLORER</span><h1>Taxon recurrence</h1><p>Follow one taxon across libraries, controls, and time.</p></div>
      <label className="analysis-search"><Search size={17} /><input list="taxon-explorer-options" value={taxon} onChange={(event) => setTaxon(event.target.value)} placeholder="Search taxon…" /><datalist id="taxon-explorer-options">{dimensions.taxa.map((name) => <option key={name} value={name} />)}</datalist></label>
    </div>
    <div className="panel explorer-filters analysis-filters">
      <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
      <FilterSelect label="Kingdom" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
      <label className="filter-field"><span>Minimum nreads</span><input type="number" min="0" placeholder="No minimum" value={minReads} onChange={(event) => setMinReads(event.target.value)} /></label>
      <label className="filter-field"><span>Minimum mean A</span><input type="number" min="0" step="0.01" placeholder="No minimum" value={minA} onChange={(event) => setMinA(event.target.value)} /></label>
    </div>
    <MetricStrip items={[
      { label: 'Assigned reads', value: fmt(summary.reads), detail: taxon || 'No taxon selected' },
      { label: 'Libraries', value: summary.libraries.length, detail: 'Matching controls' },
      { label: 'Months detected', value: summary.timeline.length, detail: 'After filters' },
      { label: 'Mean A', value: summary.meanA === null ? '—' : summary.meanA.toFixed(3), detail: 'Read-weighted' },
    ]} />
    <div className="analysis-grid">
      <article className="panel analysis-chart-panel">
        <div className="panel-head"><div><span className="kicker">RECURRENCE</span><h2>{taxon || 'Choose a taxon'}</h2><p>Assigned reads by month</p></div>{selectedKingdom && <span className="tag"><i style={{ background: COLORS[selectedKingdom] }} />{selectedKingdom}</span>}</div>
        {summary.timeline.length ? <div className="analysis-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={summary.timeline} margin={{ top: 15, right: 18, left: -5, bottom: 2 }}><defs><linearGradient id="taxon-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#20b884" stopOpacity=".35" /><stop offset="1" stopColor="#20b884" stopOpacity=".02" /></linearGradient></defs><CartesianGrid stroke="#e8ece9" vertical={false} /><XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} /><YAxis tickFormatter={fmt} tickLine={false} axisLine={false} /><Tooltip labelFormatter={monthLabel} formatter={(value) => [value.toLocaleString(), 'Reads']} /><Area dataKey="reads" stroke="#20a97b" fill="url(#taxon-area)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div> : <div className="analysis-empty">No observations match these filters.</div>}
      </article>
      <article className="panel analysis-list-panel">
        <div className="panel-head"><div><span className="kicker">LIBRARIES</span><h2>Where it appears</h2><p>{summary.libraries.length} matching libraries</p></div></div>
        <div className="analysis-list">{summary.libraries.slice(0, 50).map((item) => <button key={item.libraryId} onClick={() => onOpenLibrary(item.libraryId)}><span><b>{item.libraryId}{warningIds.has(item.libraryId) && <AlertTriangle size={11} />}</b><small>{item.month} · {item.controlType}</small></span><strong>{item.reads.toLocaleString()}<small>{item.aReads ? `A ${(item.aSum / item.aReads).toFixed(3)}` : 'A —'}</small></strong><ArrowRight size={14} /></button>)}</div>
      </article>
    </div>
  </section>
}

function summarizeLibrary(rows) {
  const profile = new Map()
  let reads = 0; let aSum = 0; let aReads = 0
  for (const row of rows) {
    reads += row.reads
    profile.set(row.name, (profile.get(row.name) || 0) + row.reads)
    if (row.meanA !== null) { aSum += row.meanA * row.reads; aReads += row.reads }
  }
  return { reads, profile, meanA: aReads ? aSum / aReads : null }
}

export function LibraryComparison({ records = [], warnings = [], onOpenLibrary }) {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')

  const libraryIds = useMemo(() => {
    const totals = new Map()
    records.forEach((row) => totals.set(row.libraryId, (totals.get(row.libraryId) || 0) + row.reads))
    return [...totals].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  }, [records])
  useEffect(() => {
    if (!left && libraryIds.length) setLeft(libraryIds[0])
    if (!right && libraryIds.length > 1) setRight(libraryIds[1])
  }, [libraryIds, left, right])
  const dimensions = useMemo(() => ({
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
  }), [records])
  const filtered = useMemo(() => records.filter((row) =>
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (kingdom === 'All' || row.kingdom === kingdom)
  ), [records, pipeline, kingdom])
  const leftSummary = summarizeLibrary(filtered.filter((row) => row.libraryId === left))
  const rightSummary = summarizeLibrary(filtered.filter((row) => row.libraryId === right))
  const names = new Set([...leftSummary.profile.keys(), ...rightSummary.profile.keys()])
  let distance = 0; let shared = 0; let leftOnly = 0; let rightOnly = 0
  const taxa = [...names].map((name) => {
    const leftReads = leftSummary.profile.get(name) || 0
    const rightReads = rightSummary.profile.get(name) || 0
    const leftShare = leftSummary.reads ? leftReads / leftSummary.reads : 0
    const rightShare = rightSummary.reads ? rightReads / rightSummary.reads : 0
    distance += Math.abs(leftShare - rightShare) * .5
    if (leftReads && rightReads) shared += 1
    else if (leftReads) leftOnly += 1
    else rightOnly += 1
    return { name, leftReads, rightReads, max: Math.max(leftShare, rightShare) }
  }).sort((a, b) => b.max - a.max).slice(0, 24)
  const warningIds = new Set(warnings.map((row) => row.libraryId))

  return <section className="analysis-page">
    <div className="explorer-hero"><div><span className="kicker">COMPARE LIBRARIES</span><h1>Profile comparison</h1><p>Compare relative taxon composition and damage side by side.</p></div></div>
    <div className="panel compare-controls">
      <label className="filter-field"><span>Library A</span><div className="select-wrap"><select value={left} onChange={(event) => setLeft(event.target.value)}>{libraryIds.map((id) => <option key={id}>{id}</option>)}</select><ChevronDown size={15} /></div></label>
      <span className="compare-vs"><GitCompareArrows size={18} />VS</span>
      <label className="filter-field"><span>Library B</span><div className="select-wrap"><select value={right} onChange={(event) => setRight(event.target.value)}>{libraryIds.map((id) => <option key={id}>{id}</option>)}</select><ChevronDown size={15} /></div></label>
      <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
      <FilterSelect label="Kingdom" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
    </div>
    <MetricStrip items={[
      { label: 'Bray–Curtis distance', value: distance.toFixed(3), detail: distance < .25 ? 'Similar profiles' : distance < .6 ? 'Moderately different' : 'Strongly different' },
      { label: 'Shared taxa', value: shared, detail: 'Present in both' },
      { label: `Only ${left || 'A'}`, value: leftOnly, detail: 'Unique taxa' },
      { label: `Only ${right || 'B'}`, value: rightOnly, detail: 'Unique taxa' },
    ]} />
    {left === right ? <div className="panel analysis-empty tall">Choose two different libraries to compare.</div> : <article className="panel compare-panel">
      <div className="compare-head"><button onClick={() => onOpenLibrary(left)}><b>{left}{warningIds.has(left) && <AlertTriangle size={12} />}</b><span>{fmt(leftSummary.reads)} reads · mean A {leftSummary.meanA?.toFixed(3) ?? '—'}</span></button><div><span>Relative abundance</span><small>Top {taxa.length} combined taxa</small></div><button onClick={() => onOpenLibrary(right)}><b>{right}{warningIds.has(right) && <AlertTriangle size={12} />}</b><span>{fmt(rightSummary.reads)} reads · mean A {rightSummary.meanA?.toFixed(3) ?? '—'}</span></button></div>
      <div className="compare-taxa">{taxa.map((item) => {
        const leftShare = leftSummary.reads ? item.leftReads / leftSummary.reads * 100 : 0
        const rightShare = rightSummary.reads ? item.rightReads / rightSummary.reads * 100 : 0
        return <div key={item.name}><span className="compare-bar left"><i style={{ width: `${leftShare}%` }} /></span><b title={item.name}>{item.name}</b><span className="compare-bar right"><i style={{ width: `${rightShare}%` }} /></span><small>{leftShare.toFixed(1)}%</small><small>{rightShare.toFixed(1)}%</small></div>
      })}</div>
    </article>}
  </section>
}

export function DamageExplorer({ records = [] }) {
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [minReads, setMinReads] = useState('50')
  const dimensions = useMemo(() => ({
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
  }), [records])
  const rows = useMemo(() => records.filter((row) =>
    row.meanA !== null && row.reads >= (Number(minReads) || 0) &&
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (kingdom === 'All' || row.kingdom === kingdom)
  ), [records, pipeline, kingdom, minReads])
  const analysis = useMemo(() => {
    const maxA = Math.max(.1, ...rows.map((row) => row.meanA))
    const ceiling = Math.ceil(maxA * 10) / 10
    const width = ceiling / 10
    const bins = Array.from({ length: 10 }, (_, index) => ({ label: `${(index * width).toFixed(2)}–${((index + 1) * width).toFixed(2)}`, observations: 0 }))
    const months = new Map(); const taxa = new Map()
    for (const row of rows) {
      const index = Math.min(9, Math.floor(row.meanA / width))
      bins[index].observations += 1
      const month = months.get(row.month) || { month: row.month, aSum: 0, reads: 0 }
      month.aSum += row.meanA * row.reads; month.reads += row.reads; months.set(row.month, month)
      const item = taxa.get(row.name) || { name: row.name, kingdom: row.kingdom, reads: 0, aSum: 0, libraries: new Set() }
      item.reads += row.reads; item.aSum += row.meanA * row.reads; item.libraries.add(row.libraryId); taxa.set(row.name, item)
    }
    return {
      bins,
      timeline: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((item) => ({ month: item.month, meanA: item.aSum / item.reads })),
      taxaCount: taxa.size,
      taxa: [...taxa.values()].map((item) => ({ ...item, meanA: item.aSum / item.reads })).sort((a, b) => b.meanA - a.meanA).slice(0, 50),
    }
  }, [rows])
  const totalReads = rows.reduce((sum, row) => sum + row.reads, 0)
  const weightedA = totalReads ? rows.reduce((sum, row) => sum + row.meanA * row.reads, 0) / totalReads : null

  return <section className="analysis-page">
    <div className="explorer-hero"><div><span className="kicker">DAMAGE / A</span><h1>Damage overview</h1><p>Explore read-weighted A estimates across taxa, libraries, and time.</p></div></div>
    <div className="panel explorer-filters damage-filters">
      <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
      <FilterSelect label="Kingdom" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
      <label className="filter-field"><span>Minimum nreads</span><input type="number" min="0" step="50" value={minReads} onChange={(event) => setMinReads(event.target.value)} /></label>
    </div>
    <MetricStrip items={[
      { label: 'Mean A', value: weightedA === null ? '—' : weightedA.toFixed(3), detail: 'Read-weighted' },
      { label: 'Observations', value: rows.length, detail: 'Library-taxon rows' },
      { label: 'Taxa', value: analysis.taxaCount, detail: 'Top 50 shown' },
      { label: 'Assigned reads', value: fmt(totalReads), detail: 'With A estimate' },
    ]} />
    <div className="damage-grid">
      <article className="panel analysis-chart-panel"><div className="panel-head"><div><span className="kicker">DISTRIBUTION</span><h2>A estimates</h2><p>Count of library-taxon observations</p></div></div><div className="analysis-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={analysis.bins} margin={{ top: 15, right: 15, bottom: 18, left: -12 }}><CartesianGrid stroke="#e8ece9" vertical={false} /><XAxis dataKey="label" angle={-30} textAnchor="end" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="observations" name="Observations" fill="#7b72df" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></article>
      <article className="panel analysis-chart-panel"><div className="panel-head"><div><span className="kicker">OVER TIME</span><h2>Mean A trend</h2><p>Read-weighted by month</p></div></div><div className="analysis-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={analysis.timeline} margin={{ top: 15, right: 18, bottom: 2, left: -5 }}><CartesianGrid stroke="#e8ece9" vertical={false} /><XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} domain={['auto', 'auto']} /><Tooltip labelFormatter={monthLabel} formatter={(value) => [value.toFixed(3), 'Mean A']} /><Line dataKey="meanA" stroke="#20a97b" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></article>
    </div>
    <article className="panel damage-table"><div className="panel-head"><div><span className="kicker">HIGHEST DAMAGE</span><h2>Taxa ranked by mean A</h2><p>Minimum read filter applies before aggregation</p></div></div><div className="table-scroll"><table><thead><tr><th>Taxon</th><th>Kingdom</th><th>Mean A</th><th>Reads</th><th>Libraries</th></tr></thead><tbody>{analysis.taxa.map((item) => <tr key={item.name}><td><b>{item.name}</b></td><td><span className="tag"><i style={{ background: COLORS[item.kingdom] }} />{item.kingdom}</span></td><td><strong>{item.meanA.toFixed(3)}</strong></td><td>{item.reads.toLocaleString()}</td><td>{item.libraries.size}</td></tr>)}</tbody></table></div></article>
  </section>
}

const groupLabels = { date: 'Control date (batch)', run: 'Sequencing run', flowcell: 'Flowcell', machine: 'Machine', project: 'Project' }
function metadataGroup(meta, field) {
  if (!meta) return 'Unknown'
  if (field === 'run') return meta.runNumber ? `${meta.machine || 'Machine'} · run ${meta.runNumber}` : 'Unknown'
  return meta[field] || 'Unknown'
}

export function RunQcExplorer({ records = [], metadata = [], warnings = [], onOpenLibrary }) {
  const [groupField, setGroupField] = useState('date')
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [selectedGroup, setSelectedGroup] = useState('')
  const metaMap = useMemo(() => new Map(metadata.map((item) => [item.libraryId, item])), [metadata])
  const dimensions = useMemo(() => ({
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
  }), [records])
  const warningIds = useMemo(() => new Set(warnings.map((row) => row.libraryId)), [warnings])
  const filtered = useMemo(() => records.filter((row) =>
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (kingdom === 'All' || row.kingdom === kingdom)
  ), [records, pipeline, kingdom])
  const groups = useMemo(() => {
    const result = new Map()
    for (const row of filtered) {
      const name = metadataGroup(metaMap.get(row.libraryId), groupField)
      const item = result.get(name) || { name, reads: 0, libraries: new Set(), taxa: new Map() }
      item.reads += row.reads; item.libraries.add(row.libraryId); item.taxa.set(row.name, (item.taxa.get(row.name) || 0) + row.reads); result.set(name, item)
    }
    return [...result.values()].map((item) => ({
      ...item,
      flagged: [...item.libraries].filter((id) => warningIds.has(id)).length,
      topTaxon: [...item.taxa].sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
    })).sort((a, b) => b.flagged - a.flagged || b.reads - a.reads)
  }, [filtered, metaMap, groupField, warningIds])
  const chosen = groups.some((item) => item.name === selectedGroup) ? selectedGroup : groups[0]?.name
  const chosenIds = new Set(groups.find((item) => item.name === chosen)?.libraries || [])
  const libraries = useMemo(() => {
    const result = new Map()
    for (const row of filtered) {
      if (!chosenIds.has(row.libraryId)) continue
      const item = result.get(row.libraryId) || { libraryId: row.libraryId, reads: 0, taxa: new Map() }
      item.reads += row.reads; item.taxa.set(row.name, (item.taxa.get(row.name) || 0) + row.reads); result.set(row.libraryId, item)
    }
    return [...result.values()].map((item) => ({ ...item, topTaxon: [...item.taxa].sort((a, b) => b[1] - a[1])[0]?.[0] || '—' })).sort((a, b) => b.reads - a.reads)
  }, [filtered, chosen, groupField, groups])
  const allLibraries = new Set(filtered.map((row) => row.libraryId))
  const flagged = [...allLibraries].filter((id) => warningIds.has(id)).length
  const totalReads = filtered.reduce((sum, row) => sum + row.reads, 0)

  return <section className="analysis-page">
    <div className="explorer-hero"><div><span className="kicker">RUN / BATCH QC</span><h1>Operational contamination</h1><p>Compare contamination load and warning concentration across sequencing metadata.</p></div></div>
    <div className="panel explorer-filters run-filters">
      <label className="filter-field"><span>Group by</span><div className="select-wrap"><select value={groupField} onChange={(event) => { setGroupField(event.target.value); setSelectedGroup('') }}>{Object.entries(groupLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={15} /></div></label>
      <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
      <FilterSelect label="Kingdom" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
    </div>
    <MetricStrip items={[
      { label: groupLabels[groupField], value: groups.length, detail: 'Groups represented' },
      { label: 'Libraries', value: allLibraries.size, detail: 'After filters' },
      { label: 'Flagged libraries', value: flagged, detail: allLibraries.size ? `${(flagged / allLibraries.size * 100).toFixed(1)}% of libraries` : 'No libraries' },
      { label: 'Assigned reads', value: fmt(totalReads), detail: 'Across groups' },
    ]} />
    {!metadata.length ? <div className="panel analysis-empty tall"><TestTubes size={23} /><b>Run metadata is unavailable</b><span>Rebuild dashboard data with the updated builder.</span></div> : <div className="run-grid">
      <article className="panel run-groups"><div className="panel-head"><div><span className="kicker">GROUPS</span><h2>{groupLabels[groupField]}</h2><p>Ranked by warnings, then read load</p></div></div><div className="run-group-list">{groups.map((item) => <button key={item.name} className={item.name === chosen ? 'active' : ''} onClick={() => setSelectedGroup(item.name)}><span><b>{item.name}</b><small>Top taxon: {item.topTaxon}</small></span><strong>{fmt(item.reads)}<small>{item.libraries.size} libraries · {item.flagged} flagged</small></strong>{item.flagged > 0 && <ShieldAlert size={15} />}</button>)}</div></article>
      <article className="panel run-libraries"><div className="panel-head"><div><span className="kicker">SELECTED GROUP</span><h2>{chosen || 'No group'}</h2><p>{libraries.length} contributing libraries</p></div></div><div className="analysis-list">{libraries.map((item) => {
        const meta = metaMap.get(item.libraryId)
        return <button key={item.libraryId} onClick={() => onOpenLibrary(item.libraryId)}><span><b>{item.libraryId}{warningIds.has(item.libraryId) && <AlertTriangle size={11} />}</b><small>{meta?.controlId || 'Control'} · {meta?.project || 'No project'}</small><em>{item.topTaxon}</em></span><strong>{item.reads.toLocaleString()}<small>{meta?.flowcell || 'No flowcell'}</small></strong><ArrowRight size={14} /></button>
      })}</div></article>
    </div>}
  </section>
}
