import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRight, ChevronDown, ExternalLink, GitCompareArrows,
  LoaderCircle, Search, ShieldAlert, TestTubes,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'

const COLORS = {
  Microbe: '#24c18a', Plant: '#9ad55c', Animal: '#f2b84b',
  'Other Eukaryote': '#b08cff',
}
const fmt = (value) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const aColor = (value) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "#d8dfdc"
  const t = Math.max(0, Math.min(1, value / .3))
  return `hsl(${210 - 190 * t} 72% ${72 - 22 * t}%)`
}
const monthLabel = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' })

function FilterSelect({ label, value, options, onChange }) {
  return <label className="filter-field"><span>{label}</span><div className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="All">All {label.toLowerCase()}</option>{options.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
}

function MetricStrip({ items }) {
  return <div className="analysis-metrics panel">{items.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value}</b><small>{item.detail}</small></div>)}</div>
}

function TaxonATooltip({ active, payload, label }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return <div className="chart-tooltip"><b>{monthLabel(label)}</b><div>Reads<span>{point.reads.toLocaleString()}</span></div><div>Mean A<span>{point.meanA === null ? "—" : point.meanA.toFixed(3)}</span></div></div>
}

function PrevalenceTooltip({ active, payload }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return <div className="chart-tooltip landscape-tooltip"><b>{point.name}</b><small>{point.kingdom}</small><div>Prevalence<span>{point.prevalence.toFixed(1)}%</span></div><div>Mean relative abundance<span>{point.meanAbundance.toFixed(3)}%</span></div><div>Detected in<span>{point.detectedLibraries} of {point.eligibleLibraries} libraries</span></div><div>Total reads<span>{point.reads.toLocaleString()}</span></div><div>Mean A<span>{point.meanA === null ? '—' : point.meanA.toFixed(3)}</span></div><em>Click to open Taxon Explorer</em></div>
}

export function PrevalenceExplorer({ records = [], onOpenTaxon }) {
  const [controlType, setControlType] = useState('All')
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [minReads, setMinReads] = useState('50')
  const [minPrevalence, setMinPrevalence] = useState('0')
  const [minimumA, setMinimumA] = useState('')
  const dimensions = useMemo(() => ({
    controlTypes: [...new Set(records.map((row) => row.controlType))].sort(),
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
  }), [records])

  const analysis = useMemo(() => {
    const baseRows = records.filter((row) =>
      (controlType === 'All' || row.controlType === controlType) &&
      (pipeline === 'All' || row.pipeline === pipeline))
    const libraryTotals = new Map()
    for (const row of baseRows) libraryTotals.set(row.libraryId, (libraryTotals.get(row.libraryId) || 0) + row.reads)
    const groups = new Map()
    const aThreshold = minimumA === '' ? null : Number(minimumA)
    for (const row of baseRows) {
      if (kingdom !== 'All' && row.kingdom !== kingdom) continue
      if (aThreshold !== null && (!Number.isFinite(aThreshold) || row.meanA === null || row.meanA < aThreshold)) continue
      const key = row.kingdom + '\u0000' + row.name
      const item = groups.get(key) || { name: row.name, kingdom: row.kingdom, reads: 0, aSum: 0, aReads: 0, libraries: new Map() }
      item.reads += row.reads
      item.libraries.set(row.libraryId, (item.libraries.get(row.libraryId) || 0) + row.reads)
      if (row.meanA !== null) { item.aSum += row.meanA * row.reads; item.aReads += row.reads }
      groups.set(key, item)
    }
    const eligibleLibraries = libraryTotals.size
    const readThreshold = Number(minReads) || 0
    const prevalenceThreshold = Number(minPrevalence) || 0
    const points = [...groups.values()].map((item) => {
      const detectedLibraries = item.libraries.size
      const prevalence = eligibleLibraries ? detectedLibraries / eligibleLibraries * 100 : 0
      const meanAbundance = detectedLibraries ? [...item.libraries].reduce((sum, [libraryId, reads]) => sum + reads / (libraryTotals.get(libraryId) || 1), 0) / detectedLibraries * 100 : 0
      return { ...item, eligibleLibraries, detectedLibraries, prevalence, meanAbundance, logAbundance: Math.log10(Math.max(meanAbundance, .000001)), meanA: item.aReads ? item.aSum / item.aReads : null }
    }).filter((item) => item.reads >= readThreshold && item.prevalence >= prevalenceThreshold && item.meanAbundance > 0)
      .sort((a, b) => b.reads - a.reads)
    const abundanceValues = points.map((item) => item.logAbundance).sort((a, b) => a - b)
    const medianLogAbundance = abundanceValues.length ? abundanceValues[Math.floor(abundanceValues.length / 2)] : 0
    return { eligibleLibraries, points, medianLogAbundance }
  }, [records, controlType, pipeline, kingdom, minReads, minPrevalence, minimumA])

  const byKingdom = Object.fromEntries(dimensions.kingdoms.map((name) => [name, analysis.points.filter((item) => item.kingdom === name)]))
  const recurring = analysis.points.filter((item) => item.prevalence >= 50).length
  const dominant = analysis.points.filter((item) => item.logAbundance >= analysis.medianLogAbundance && item.prevalence >= 50).length
  const yTick = (value) => {
    const percent = 10 ** value
    return percent >= 1 ? percent.toFixed(0) + '%' : percent.toPrecision(1) + '%'
  }

  return <section className="analysis-page">
    <div className="explorer-hero"><div><span className="kicker">TAXA LANDSCAPE</span><h1>Prevalence vs abundance</h1><p>Separate recurring background taxa from rare, high-volume signals.</p></div></div>
    <div className="panel explorer-filters landscape-filters">
      <FilterSelect label="Control type" value={controlType} options={dimensions.controlTypes} onChange={setControlType} />
      <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
      <FilterSelect label="Kingdom" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
      <label className="filter-field"><span>Minimum total reads</span><input type="number" min="0" step="50" value={minReads} onChange={(event) => setMinReads(event.target.value)} /></label>
      <label className="filter-field"><span>Minimum prevalence (%)</span><input type="number" min="0" max="100" step="1" value={minPrevalence} onChange={(event) => setMinPrevalence(event.target.value)} /></label>
      <label className="filter-field"><span>Minimum mean A</span><input type="number" min="0" step="0.01" placeholder="No minimum" value={minimumA} onChange={(event) => setMinimumA(event.target.value)} /></label>
    </div>
    <MetricStrip items={[
      { label: 'Eligible libraries', value: analysis.eligibleLibraries, detail: 'Prevalence denominator' },
      { label: 'Taxa shown', value: analysis.points.length, detail: 'After filters' },
      { label: 'Recurring taxa', value: recurring, detail: 'In at least 50% of libraries' },
      { label: 'Common + abundant', value: dominant, detail: 'Upper-right region' },
    ]} />
    <article className="panel landscape-panel">
      <div className="panel-head"><div><span className="kicker">TAXON DISTRIBUTION</span><h2>Detection frequency and signal strength</h2><p>Abundance is the mean within-library read proportion when detected; point area represents total reads</p></div><div className="landscape-legend">{dimensions.kingdoms.filter((name) => kingdom === 'All' || kingdom === name).map((name) => <span key={name}><i style={{ background: COLORS[name] || '#84978e' }} />{name}</span>)}</div></div>
      {analysis.points.length ? <div className="landscape-chart"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 18, right: 28, bottom: 25, left: 18 }}><CartesianGrid stroke="#e8ece9" strokeDasharray="3 3" /><XAxis type="number" dataKey="prevalence" name="Prevalence" domain={[0, 100]} unit="%" tickLine={false} axisLine={false} label={{ value: 'Prevalence across eligible libraries (%)', position: 'bottom', offset: 10, fill: '#73817a', fontSize: 10 }} /><YAxis type="number" dataKey="logAbundance" name="Mean relative abundance" tickFormatter={yTick} tickLine={false} axisLine={false} width={50} label={{ value: 'Mean relative abundance when detected', angle: -90, position: 'insideLeft', offset: 3, fill: '#73817a', fontSize: 10 }} /><ZAxis type="number" dataKey="reads" range={[45, 500]} /><ReferenceLine x={50} stroke="#9ba8a2" strokeDasharray="5 5" /><ReferenceLine y={analysis.medianLogAbundance} stroke="#9ba8a2" strokeDasharray="5 5" /><Tooltip content={<PrevalenceTooltip />} cursor={{ strokeDasharray: '3 3' }} />{dimensions.kingdoms.map((name) => byKingdom[name]?.length ? <Scatter key={name} name={name} data={byKingdom[name]} fill={COLORS[name] || '#84978e'} fillOpacity={.78} stroke="#fff" strokeWidth={1} onClick={(point) => onOpenTaxon(point?.payload?.name || point?.name)} className="landscape-points" /> : null)}</ScatterChart></ResponsiveContainer></div> : <div className="analysis-empty tall">No taxa match these filters.</div>}
    </article>
    <p className="analysis-method-note">The vertical guide marks 50% prevalence; the horizontal guide is the median abundance among visible taxa. Relative abundance is calculated against all assigned taxon reads in each eligible library. Click any point to inspect that taxon.</p>
  </section>
}
export function TaxonExplorer({ records = [], warnings = [], selectedTaxon = "", onSelectTaxon, onOpenLibrary }) {
  const taxon = selectedTaxon
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [minReads, setMinReads] = useState('')
  const [minA, setMinA] = useState('')
  const [wiki, setWiki] = useState({ status: 'idle' })

  const dimensions = useMemo(() => ({
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
    taxa: [...new Set(records.map((row) => row.name))].sort((a, b) => a.localeCompare(b)),
  }), [records])

  useEffect(() => {
    if (!taxon) { setWiki({ status: 'idle' }); return undefined }
    const wikiTitle = taxon.replace(/^[a-z]__/, '').replaceAll('_', ' ').trim()
    const controller = new AbortController()
    setWiki({ status: 'loading' })
    const params = new URLSearchParams({
      action: 'query', format: 'json', origin: '*', redirects: '1',
      prop: 'extracts|pageimages|info', titles: wikiTitle, exintro: '1',
      explaintext: '1', inprop: 'url', pithumbsize: '320',
    })
    fetch('https://en.wikipedia.org/w/api.php?' + params, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Wikipedia request failed'); return response.json() })
      .then((payload) => {
        const page = Object.values(payload.query?.pages || {}).find((item) => !('missing' in item))
        if (!page) { setWiki({ status: 'missing' }); return }
        setWiki({ status: 'ready', title: page.title, extract: page.extract?.trim() || '', url: page.fullurl, image: page.thumbnail?.source })
      })
      .catch((error) => { if (error.name !== 'AbortError') setWiki({ status: 'error' }) })
    return () => controller.abort()
  }, [taxon])

  useEffect(() => {
    if (!taxon && records.length) {
      const totals = new Map()
      records.forEach((row) => totals.set(row.name, (totals.get(row.name) || 0) + row.reads))
      onSelectTaxon([...totals].sort((a, b) => b[1] - a[1])[0]?.[0] || "")
    }
  }, [records, taxon, onSelectTaxon])

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
      const point = months.get(row.month) || { month: row.month, reads: 0, aSum: 0, aReads: 0 }
      point.reads += row.reads
      if (row.meanA !== null) { point.aSum += row.meanA * row.reads; point.aReads += row.reads }
      months.set(row.month, point)
    }
    return {
      reads, meanA: aReads ? aSum / aReads : null,
      libraries: [...libraries.values()].sort((a, b) => b.reads - a.reads),
      timeline: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((item) => ({ ...item, meanA: item.aReads ? item.aSum / item.aReads : null })),
    }
  }, [rows])

  return <section className="analysis-page">
    <div className="explorer-hero">
      <div><span className="kicker">TAXON EXPLORER</span><h1>Taxon recurrence</h1><p>Follow one taxon across libraries, controls, and time.</p></div>
      <label className="analysis-search"><Search size={17} /><input list="taxon-explorer-options" value={taxon} onChange={(event) => onSelectTaxon(event.target.value)} placeholder="Search taxon…" /><datalist id="taxon-explorer-options">{dimensions.taxa.map((name) => <option key={name} value={name} />)}</datalist></label>
    </div>
    <article className="panel taxon-wiki-card">
      {wiki.status === 'loading' ? <div className="taxon-wiki-state"><LoaderCircle className="spin" size={18} /><span>Looking up {taxon} on Wikipedia…</span></div>
        : wiki.status === 'ready' ? <>{wiki.image && <img src={wiki.image} alt="" />}<div className="taxon-wiki-copy"><span className="kicker">FROM WIKIPEDIA</span><h2>{wiki.title}</h2><p>{wiki.extract || 'Wikipedia has a page for this taxon, but no introductory summary was returned.'}</p><a href={wiki.url} target="_blank" rel="noreferrer">Read the Wikipedia article<ExternalLink size={12} /></a><small>External background information; verify taxonomy against your reference database.</small></div></>
        : wiki.status === 'missing' ? <div className="taxon-wiki-state"><span>No exact Wikipedia page was found for <b>{taxon}</b>.</span></div>
        : wiki.status === 'error' ? <div className="taxon-wiki-state"><span>Wikipedia information is temporarily unavailable. Your dashboard data is unaffected.</span></div>
        : <div className="taxon-wiki-state"><span>Choose a taxon to load background information.</span></div>}
    </article>
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
        <div className="panel-head"><div><span className="kicker">RECURRENCE</span><h2>{taxon || 'Choose a taxon'}</h2><p>Bar height is reads; colour encodes monthly mean A</p></div><div className="a-legend"><span>Low A</span><i /><span>High A ≥ 0.30</span></div></div>
        {summary.timeline.length ? <div className="analysis-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.timeline} margin={{ top: 15, right: 18, left: -5, bottom: 2 }}><CartesianGrid stroke="#e8ece9" vertical={false} /><XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} /><YAxis tickFormatter={fmt} tickLine={false} axisLine={false} /><Tooltip content={<TaxonATooltip />} /><Bar dataKey="reads" radius={[4, 4, 0, 0]}>{summary.timeline.map((point) => <Cell key={point.month} fill={aColor(point.meanA)} />)}</Bar></BarChart></ResponsiveContainer></div> : <div className="analysis-empty">No observations match these filters.</div>}
      </article>
      <article className="panel analysis-list-panel">
        <div className="panel-head"><div><span className="kicker">LIBRARIES</span><h2>Where it appears</h2><p>{summary.libraries.length} matching libraries</p></div></div>
        <div className="analysis-list">{summary.libraries.slice(0, 50).map((item) => <button key={item.libraryId} onClick={() => onOpenLibrary(item.libraryId)}><span><b><i className="a-dot" style={{ background: aColor(item.aReads ? item.aSum / item.aReads : null) }} />{item.libraryId}{warningIds.has(item.libraryId) && <AlertTriangle size={11} />}</b><small>{item.month} · {item.controlType}</small></span><strong>{item.reads.toLocaleString()}<small>{item.aReads ? `A ${(item.aSum / item.aReads).toFixed(3)}` : 'A —'}</small></strong><ArrowRight size={14} /></button>)}</div>
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

export function LibraryComparison({ records = [], warnings = [], comparisonLibraries = [], onComparisonChange, onOpenTaxon, onOpenLibrary }) {
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [minimumA, setMinimumA] = useState('')

  const libraryIds = useMemo(() => {
    const totals = new Map()
    records.forEach((row) => totals.set(row.libraryId, (totals.get(row.libraryId) || 0) + row.reads))
    return [...totals].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  }, [records])
  const left = comparisonLibraries[0] || ""
  const right = comparisonLibraries[1] || ""
  useEffect(() => {
    const next = comparisonLibraries.filter((id) => libraryIds.includes(id)).slice(0, 2)
    for (const id of libraryIds) {
      if (next.length >= 2) break
      if (!next.includes(id)) next.push(id)
    }
    if (next.join("\u0000") !== comparisonLibraries.join("\u0000")) onComparisonChange(next)
  }, [libraryIds, comparisonLibraries, onComparisonChange])
  const dimensions = useMemo(() => ({
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
  }), [records])
  const filtered = useMemo(() => records.filter((row) =>
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (kingdom === 'All' || row.kingdom === kingdom) &&
    (minimumA === '' || (row.meanA !== null && row.meanA >= Number(minimumA)))
  ), [records, pipeline, kingdom, minimumA])
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
      <label className="filter-field"><span>Library A</span><div className="select-wrap"><select value={left} onChange={(event) => onComparisonChange([event.target.value, right].filter((id, index, list) => id && list.indexOf(id) === index))}>{libraryIds.map((id) => <option key={id}>{id}</option>)}</select><ChevronDown size={15} /></div></label>
      <span className="compare-vs"><GitCompareArrows size={18} />VS</span>
      <label className="filter-field"><span>Library B</span><div className="select-wrap"><select value={right} onChange={(event) => onComparisonChange([left, event.target.value].filter((id, index, list) => id && list.indexOf(id) === index))}>{libraryIds.map((id) => <option key={id}>{id}</option>)}</select><ChevronDown size={15} /></div></label>
      <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
      <FilterSelect label="Kingdom" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
      <label className="filter-field"><span>Minimum mean A</span><input type="number" min="0" step="0.01" placeholder="No minimum" value={minimumA} onChange={(event) => setMinimumA(event.target.value)} /></label>
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
        return <div key={item.name}><span className="compare-bar left"><i style={{ width: `${leftShare}%` }} /></span><button className="taxon-link compare-name" title={item.name} onClick={() => onOpenTaxon(item.name)}>{item.name}</button><span className="compare-bar right"><i style={{ width: `${rightShare}%` }} /></span><small>{leftShare.toFixed(1)}%</small><small>{rightShare.toFixed(1)}%</small></div>
      })}</div>
    </article>}
  </section>
}

export function DamageExplorer({ records = [], onOpenTaxon }) {
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [minReads, setMinReads] = useState('50')
  const [minimumA, setMinimumA] = useState('')
  const dimensions = useMemo(() => ({
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
  }), [records])
  const rows = useMemo(() => records.filter((row) =>
    row.meanA !== null && row.reads >= (Number(minReads) || 0) &&
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (kingdom === 'All' || row.kingdom === kingdom) &&
    (minimumA === '' || row.meanA >= Number(minimumA))
  ), [records, pipeline, kingdom, minReads, minimumA])
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
      <label className="filter-field"><span>Minimum mean A</span><input type="number" min="0" step="0.01" placeholder="No minimum" value={minimumA} onChange={(event) => setMinimumA(event.target.value)} /></label>
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
    <article className="panel damage-table"><div className="panel-head"><div><span className="kicker">HIGHEST DAMAGE</span><h2>Taxa ranked by mean A</h2><p>Minimum read filter applies before aggregation</p></div></div><div className="table-scroll"><table><thead><tr><th>Taxon</th><th>Kingdom</th><th>Mean A</th><th>Reads</th><th>Libraries</th></tr></thead><tbody>{analysis.taxa.map((item) => <tr key={item.name}><td><button className="taxon-link" onClick={() => onOpenTaxon(item.name)}>{item.name}</button></td><td><span className="tag"><i style={{ background: COLORS[item.kingdom] }} />{item.kingdom}</span></td><td><strong>{item.meanA.toFixed(3)}</strong></td><td>{item.reads.toLocaleString()}</td><td>{item.libraries.size}</td></tr>)}</tbody></table></div></article>
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
  const [minimumA, setMinimumA] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const metaMap = useMemo(() => new Map(metadata.map((item) => [item.libraryId, item])), [metadata])
  const dimensions = useMemo(() => ({
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
  }), [records])
  const warningIds = useMemo(() => new Set(warnings.map((row) => row.libraryId)), [warnings])
  const filtered = useMemo(() => records.filter((row) =>
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (kingdom === 'All' || row.kingdom === kingdom) &&
    (minimumA === '' || (row.meanA !== null && row.meanA >= Number(minimumA)))
  ), [records, pipeline, kingdom, minimumA])
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
      <label className="filter-field"><span>Minimum mean A</span><input type="number" min="0" step="0.01" placeholder="No minimum" value={minimumA} onChange={(event) => setMinimumA(event.target.value)} /></label>
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

function buildCooccurrence(rows, maxTaxa, minimumShared) {
  const libraries = new Map()
  const taxa = new Map()
  for (const row of rows) {
    const present = libraries.get(row.libraryId) || new Set()
    present.add(row.name); libraries.set(row.libraryId, present)
    const item = taxa.get(row.name) || { name: row.name, kingdom: row.kingdom, reads: 0, aSum: 0, aReads: 0, libraries: new Set() }
    item.reads += row.reads; item.libraries.add(row.libraryId)
    if (row.meanA !== null) { item.aSum += row.meanA * row.reads; item.aReads += row.reads }
    taxa.set(row.name, item)
  }
  const nodes = [...taxa.values()].sort((a, b) => b.libraries.size - a.libraries.size || b.reads - a.reads).slice(0, maxTaxa)
  const selected = new Set(nodes.map((node) => node.name))
  const counts = new Map()
  for (const present of libraries.values()) {
    const names = [...present].filter((name) => selected.has(name)).sort()
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const key = names[i] + "\u0000" + names[j]
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
  }
  const nodeMap = new Map(nodes.map((node, index) => [node.name, { ...node, index, degree: 0 }]))
  const edges = [...counts].map(([key, shared]) => {
    const [source, target] = key.split("\u0000")
    const union = nodeMap.get(source).libraries.size + nodeMap.get(target).libraries.size - shared
    return { source, target, shared, jaccard: union ? shared / union : 0 }
  }).filter((edge) => edge.shared >= minimumShared).sort((a, b) => b.jaccard - a.jaccard || b.shared - a.shared).slice(0, 100)
  edges.forEach((edge) => { nodeMap.get(edge.source).degree += 1; nodeMap.get(edge.target).degree += 1 })

  const laidOut = [...nodeMap.values()]
  laidOut.forEach((node, index) => {
    const angle = index / Math.max(1, laidOut.length) * Math.PI * 2
    node.x = Math.cos(angle) * 220
    node.y = Math.sin(angle) * 220
  })
  for (let iteration = 0; iteration < 130; iteration += 1) {
    const forces = laidOut.map(() => ({ x: 0, y: 0 }))
    for (let i = 0; i < laidOut.length; i += 1) {
      for (let j = i + 1; j < laidOut.length; j += 1) {
        const dx = laidOut[j].x - laidOut[i].x
        const dy = laidOut[j].y - laidOut[i].y
        const distanceSquared = Math.max(36, dx * dx + dy * dy)
        const force = 900 / distanceSquared
        const distance = Math.sqrt(distanceSquared)
        forces[i].x -= dx / distance * force; forces[i].y -= dy / distance * force
        forces[j].x += dx / distance * force; forces[j].y += dy / distance * force
      }
    }
    for (const edge of edges) {
      const source = nodeMap.get(edge.source); const target = nodeMap.get(edge.target)
      const dx = target.x - source.x; const dy = target.y - source.y
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const force = (distance - 115) * (.006 + edge.jaccard * .02)
      forces[source.index].x += dx / distance * force; forces[source.index].y += dy / distance * force
      forces[target.index].x -= dx / distance * force; forces[target.index].y -= dy / distance * force
    }
    laidOut.forEach((node, index) => {
      node.x = (node.x + forces[index].x) * .985
      node.y = (node.y + forces[index].y) * .985
    })
  }
  const xExtent = Math.max(1, ...laidOut.map((node) => Math.abs(node.x)))
  const yExtent = Math.max(1, ...laidOut.map((node) => Math.abs(node.y)))
  laidOut.forEach((node) => {
    node.x = 400 + node.x / xExtent * 325
    node.y = 300 + node.y / yExtent * 235
    node.radius = 7 + Math.sqrt(node.libraries.size) * 2.2
  })
  return { nodes: laidOut, nodeMap, edges, libraryCount: libraries.size, taxonCount: taxa.size }
}

export function CooccurrenceExplorer({ records = [], onOpenTaxon }) {
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [minimumA, setMinimumA] = useState('')
  const [minimumShared, setMinimumShared] = useState('3')
  const [maxTaxa, setMaxTaxa] = useState('30')
  const [hover, setHover] = useState(null)
  const dimensions = useMemo(() => ({
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
  }), [records])
  const filtered = useMemo(() => records.filter((row) =>
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (kingdom === 'All' || row.kingdom === kingdom) &&
    (minimumA === '' || (row.meanA !== null && row.meanA >= Number(minimumA)))
  ), [records, pipeline, kingdom, minimumA])
  const network = useMemo(() => buildCooccurrence(filtered, Number(maxTaxa), Math.max(1, Number(minimumShared) || 1)), [filtered, maxTaxa, minimumShared])
  const strongest = network.edges[0]

  return <section className="analysis-page">
    <div className="explorer-hero"><div><span className="kicker">CO-OCCURRENCE</span><h1>Taxon association network</h1><p>Edges connect taxa repeatedly detected in the same control libraries.</p></div><div className="network-legend"><span><i className="thin" />Weaker Jaccard</span><span><i className="thick" />Stronger Jaccard</span></div></div>
    <div className="panel explorer-filters network-filters">
      <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
      <FilterSelect label="Kingdom" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
      <label className="filter-field"><span>Minimum mean A</span><input type="number" min="0" step="0.01" placeholder="No minimum" value={minimumA} onChange={(event) => setMinimumA(event.target.value)} /></label>
      <label className="filter-field"><span>Minimum shared libraries</span><input type="number" min="1" max="50" value={minimumShared} onChange={(event) => setMinimumShared(event.target.value)} /></label>
      <label className="filter-field"><span>Most prevalent taxa</span><div className="select-wrap"><select value={maxTaxa} onChange={(event) => setMaxTaxa(event.target.value)}>{[20, 30, 40].map((value) => <option key={value} value={value}>Top {value}</option>)}</select><ChevronDown size={15} /></div></label>
    </div>
    <MetricStrip items={[
      { label: 'Libraries', value: network.libraryCount, detail: 'After filters' },
      { label: 'Taxa considered', value: network.nodes.length, detail: `Of ${network.taxonCount} detected` },
      { label: 'Associations', value: network.edges.length, detail: 'Up to 100 strongest' },
      { label: 'Strongest pair', value: strongest ? strongest.jaccard.toFixed(2) : '—', detail: strongest ? `${strongest.shared} shared libraries` : 'No qualifying pairs' },
    ]} />
    <div className="network-grid">
      <article className="panel network-panel">
        <div className="panel-head"><div><span className="kicker">LIBRARY CO-PRESENCE</span><h2>Co-occurrence network</h2><p>Node size is prevalence; edge strength is Jaccard similarity</p></div></div>
        {network.edges.length ? <div className="network-canvas"><svg viewBox="0 0 800 600" role="img" aria-label="Taxon co-occurrence network" onMouseLeave={() => setHover(null)}>
          <g className="network-edges">{network.edges.map((edge) => {
            const source = network.nodeMap.get(edge.source); const target = network.nodeMap.get(edge.target)
            return <line key={edge.source + ">" + edge.target} x1={source.x} y1={source.y} x2={target.x} y2={target.y} strokeWidth={.6 + edge.jaccard * 6} opacity={.18 + edge.jaccard * .55} />
          })}</g>
          <g className="network-nodes">{network.nodes.map((node, index) => <g key={node.name} transform={`translate(${node.x} ${node.y})`} onMouseMove={(event) => setHover({ node, x: event.clientX + 14, y: event.clientY + 14 })} onClick={() => onOpenTaxon(node.name)}>
            <circle r={node.radius} fill={COLORS[node.kingdom] || '#7b72df'} />
            {(index < 15 || node.degree >= 5) && <text y={node.radius + 12} textAnchor="middle">{node.name}</text>}
          </g>)}</g>
        </svg>{hover && <div className="network-tooltip" style={{ left: hover.x, top: hover.y }}><b>{hover.node.name}</b><span>{hover.node.kingdom}</span><div><strong>{hover.node.libraries.size}</strong> libraries · <strong>{hover.node.reads.toLocaleString()}</strong> reads</div><small>{hover.node.aReads ? `Mean A ${(hover.node.aSum / hover.node.aReads).toFixed(3)}` : 'Mean A unavailable'} · {hover.node.degree} associations</small><em>Click to open Taxon Explorer</em></div>}</div>
          : <div className="analysis-empty tall">No pairs meet the shared-library threshold. Lower the threshold or widen the filters.</div>}
      </article>
      <article className="panel network-pairs"><div className="panel-head"><div><span className="kicker">STRONGEST PAIRS</span><h2>Repeated associations</h2><p>Ranked by Jaccard similarity</p></div></div><div className="pair-list">{network.edges.slice(0, 30).map((edge) => <div key={edge.source + edge.target}><span><button className="taxon-link" onClick={() => onOpenTaxon(edge.source)}>{edge.source}</button><i>+</i><button className="taxon-link" onClick={() => onOpenTaxon(edge.target)}>{edge.target}</button></span><strong>{edge.jaccard.toFixed(2)}<small>{edge.shared} shared</small></strong></div>)}</div></article>
    </div>
    <p className="analysis-method-note">Co-occurrence is descriptive: shared laboratory sources, common background taxa, or broad prevalence can all create an edge. It does not establish biological interaction.</p>
  </section>
}
