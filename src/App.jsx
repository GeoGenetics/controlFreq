import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ChevronDown, Database, Download,
  ChartScatter, FlaskConical, LayoutDashboard, Network, RotateCcw, Search,
  SlidersHorizontal, Sparkles, TrendingDown, TrendingUp,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fallbackData } from './data.js'
import LibraryExplorer from "./LibraryExplorer.jsx"
import PcoaExplorer from "./PcoaExplorer.jsx"
import PeakLibraries from "./PeakLibraries.jsx"
import PageGuide from "./PageGuide.jsx"
import { CooccurrenceExplorer, DamageExplorer, LibraryComparison, PrevalenceExplorer, RunQcExplorer, TaxonExplorer } from "./AdvancedViews.jsx"

const COLORS = {
  Microbe: '#24c18a', Plant: '#9ad55c', Animal: '#f2b84b',
  'Other Eukaryote': '#b08cff',
}
const formatNumber = (value) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const prettyDate = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' })

function FilterSelect({ label, value, options, onChange }) {
  return <label className="filter-field"><span>{label}</span><div className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="All">All {label.toLowerCase()}</option>{options.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
}

function MetricCard({ title, value, detail, icon: Icon, tone = 'green', change }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19} /></div><div className="metric-copy"><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>{change !== undefined && <span className={`change ${change >= 0 ? 'up' : 'down'}`}>{change >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(change)}%</span>}</article>
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><b>{prettyDate(label)}</b>{payload.map((item) => <div key={item.dataKey}><i style={{ background: item.color }} />{item.name}<span>{formatNumber(item.value)}</span></div>)}</div>
}

function EmptyState({ title = 'No matching data', detail = 'Try widening the filters.' }) {
  return <div className="empty"><AlertTriangle size={20} /><b>{title}</b><span>{detail}</span></div>
}

function App() {
  const [data, setData] = useState(fallbackData)
  const [controlType, setControlType] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [pipeline, setPipeline] = useState('All')
  const [taxon, setTaxon] = useState('')
  const [minReads, setMinReads] = useState('')
  const [minA, setMinA] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedLibrary, setSelectedLibrary] = useState("")
  const [peakMonth, setPeakMonth] = useState("")
  const [peakTaxon, setPeakTaxon] = useState("")
  const [comparisonLibraries, setComparisonLibraries] = useState([])
  const [selectedTaxon, setSelectedTaxon] = useState("")

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}dashboard-data.json`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error('No generated data'); return response.json() })
      .then(setData).catch(() => {})
  }, [])

  const taxonRows = useMemo(() => data.taxonRecords?.length
    ? data.taxonRecords
    : data.records.map((row) => ({ ...row, name: 'All taxa', meanA: null })), [data])

  const dimensions = useMemo(() => ({
    controlTypes: [...new Set(taxonRows.map((row) => row.controlType))].sort(),
    kingdoms: [...new Set(taxonRows.map((row) => row.kingdom))].sort(),
    pipelines: [...new Set(taxonRows.map((row) => row.pipeline))].sort(),
    taxa: [...new Set(taxonRows.map((row) => row.name))].sort((a, b) => a.localeCompare(b)),
    months: [...new Set(taxonRows.map((row) => row.month))].sort(),
  }), [taxonRows])

  const filtered = useMemo(() => {
    const reads = minReads === '' ? 0 : Number(minReads)
    const damage = minA === '' ? null : Number(minA)
    const name = taxon.trim().toLowerCase()
    return taxonRows.filter((row) =>
      (controlType === 'All' || row.controlType === controlType) &&
      (kingdom === 'All' || row.kingdom === kingdom) &&
      (pipeline === 'All' || row.pipeline === pipeline) &&
      (!name || row.name.toLowerCase().includes(name)) &&
      (!Number.isFinite(reads) || row.reads >= reads) &&
      (damage === null || (Number.isFinite(damage) && row.meanA !== null && row.meanA >= damage)) &&
      (!from || row.month >= from) && (!to || row.month <= to))
  }, [taxonRows, controlType, kingdom, pipeline, taxon, minReads, minA, from, to])

  const charts = useMemo(() => {
    const months = new Map()
    const kingdoms = new Map()
    for (const row of filtered) {
      const point = months.get(row.month) || { month: row.month }
      point[row.kingdom] = (point[row.kingdom] || 0) + row.reads
      months.set(row.month, point)
      kingdoms.set(row.kingdom, (kingdoms.get(row.kingdom) || 0) + row.reads)
    }
    return {
      timeline: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      composition: [...kingdoms].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    }
  }, [filtered])

  const taxa = useMemo(() => {
    const groups = new Map()
    for (const row of filtered) {
      const key = `${row.kingdom}\u0000${row.name}`
      const item = groups.get(key) || { name: row.name, kingdom: row.kingdom, reads: 0, aSum: 0, aReads: 0, months: new Map() }
      item.reads += row.reads
      item.months.set(row.month, (item.months.get(row.month) || 0) + row.reads)
      if (row.meanA !== null) { item.aSum += row.meanA * row.reads; item.aReads += row.reads }
      groups.set(key, item)
    }
    return [...groups.values()].map((item) => {
      const values = [...item.months].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
      const previous = values.at(-2) || 0
      const latest = values.at(-1) || 0
      return { ...item, meanA: item.aReads ? item.aSum / item.aReads : null, change: previous ? Math.round((latest - previous) / previous * 1000) / 10 : 0 }
    }).sort((a, b) => b.reads - a.reads)
  }, [filtered])

  const heatmap = useMemo(() => {
    const top = taxa.slice(0, 12)
    const selected = new Set(top.map((item) => `${item.kingdom}\u0000${item.name}`))
    const months = [...new Set(filtered.map((row) => row.month))].sort()
    const values = new Map()
    let max = 0
    for (const row of filtered) {
      const key = `${row.kingdom}\u0000${row.name}`
      if (!selected.has(key)) continue
      const cell = `${key}\u0000${row.month}`
      const value = (values.get(cell) || 0) + row.reads
      values.set(cell, value); max = Math.max(max, value)
    }
    return { top, months, values, max }
  }, [filtered, taxa])

  const warnings = useMemo(() => (data.libraryWarnings || []).filter((row) =>
    (controlType === 'All' || row.controlType === controlType) &&
    (kingdom === 'All' || row.kingdom === kingdom) &&
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (!from || row.month >= from) && (!to || row.month <= to)
  ), [data, controlType, kingdom, pipeline, from, to])

  const totalReads = filtered.reduce((sum, row) => sum + row.reads, 0)
  const libraryCount = Math.max(0, ...filtered.map((row) => row.libraries || 0))
  const flaggedLibraries = new Set(warnings.map((row) => row.libraryId)).size
  const latest = charts.timeline.at(-1)
  const previous = charts.timeline.at(-2)
  const sumPoint = (point) => point ? Object.entries(point).filter(([key]) => key !== 'month').reduce((sum, [, value]) => sum + value, 0) : 0
  const latestTotal = sumPoint(latest)
  const previousTotal = sumPoint(previous)
  const delta = previousTotal ? Math.round((latestTotal - previousTotal) / previousTotal * 100) : 0
  const visibleTaxa = taxa.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())).slice(0, 50)

  const reset = () => {
    setControlType('All'); setKingdom('All'); setPipeline('All'); setTaxon('')
    setMinReads(''); setMinA(''); setFrom(''); setTo('')
  }

  const openTaxon = (taxonName) => { setSelectedTaxon(taxonName); setActiveTab("taxon"); window.scrollTo({ top: 0, behavior: "smooth" }) }
  const openPeak = (month, taxonName = "") => { setPeakMonth(month); setPeakTaxon(taxonName) }
  const closePeak = () => { setPeakMonth(""); setPeakTaxon("") }
  const addToComparison = (libraryId) => setComparisonLibraries((current) => current.includes(libraryId) ? current : current.length < 2 ? [...current, libraryId] : [current[1], libraryId])
  const removeFromComparison = (libraryId) => setComparisonLibraries((current) => current.filter((id) => id !== libraryId))

  const exportCsv = () => {
    const header = 'month,control_type,kingdom,pipeline,taxon,reads,libraries,mean_A\n'
    const body = filtered.map((row) => [row.month, row.controlType, row.kingdom, row.pipeline, row.name, row.reads, row.libraries, row.meanA ?? ''].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([header + body], { type: 'text/csv' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'controlfreq-filtered.csv'; anchor.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top"><span><FlaskConical size={21} /></span><b>controlFreq</b></a>
        <nav>
          <small>MONITOR</small>
          <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}><LayoutDashboard size={18} />Overview</button>
          <small>LIBRARIES</small>
          <button className={activeTab === "library" ? "active" : ""} onClick={() => setActiveTab("library")}><Network size={18} />Library explorer</button>
          <button className={activeTab === "compare" ? "active" : ""} onClick={() => setActiveTab("compare")}><Network size={18} />Compare libraries</button>
          <button className={activeTab === "pcoa" ? "active" : ""} onClick={() => setActiveTab("pcoa")}><ChartScatter size={18} />PCoA</button>
          <small>TAXA</small>
          <button className={activeTab === "taxon" ? "active" : ""} onClick={() => setActiveTab("taxon")}><Search size={18} />Taxon explorer</button>
          <button className={activeTab === "prevalence" ? "active" : ""} onClick={() => setActiveTab("prevalence")}><ChartScatter size={18} />Taxa landscape</button>
          <button className={activeTab === "cooccurrence" ? "active" : ""} onClick={() => setActiveTab("cooccurrence")}><Network size={18} />Co-occurrence</button>
          <small>QUALITY</small>
          <button className={activeTab === "damage" ? "active" : ""} onClick={() => setActiveTab("damage")}><Sparkles size={18} />Damage / A</button>
          <button className={activeTab === "run" ? "active" : ""} onClick={() => setActiveTab("run")}><Database size={18} />Run / batch QC</button>
          {activeTab === "overview" && <>
            <small>SECTIONS</small>
            <a href="#trends"><Activity size={18} />Contamination</a>
            <a href="#heatmap"><Sparkles size={18} />Taxa heatmap</a>
            <a href="#warnings"><AlertTriangle size={18} />Warnings</a>
            <a href="#filters"><SlidersHorizontal size={18} />Filters</a>
          </>}
        </nav>
      </aside>

      <main id="top">
        {activeTab === "overview" ? <>
        <header className="topbar">
          <div><div className="eyebrow"><span /> LAB MONITORING</div><h1>Contamination overview</h1><p>Track recurring taxa and changes across negative controls.</p></div>
          <div className="top-actions"><button className="secondary" onClick={exportCsv}><Download size={16} />Export data</button></div>
        </header>

        <PageGuide items={[
          { title: 'Start with filters', text: 'Filters narrow every number and plot on this page. Leave them at All for the full dataset, or change one at a time to understand its effect.' },
          { title: 'Read the patterns', text: 'The timeline shows when read volume changes; the heatmap shows which taxa drive those changes. Click either view to see the contributing libraries.' },
          { title: 'Treat warnings as review flags', text: 'A warning means a library is unusually high compared with similar controls. It does not by itself identify the source or prove a failed run.' },
        ]} />

        <section className="filter-panel" id="filters">
          <div className="filter-title"><SlidersHorizontal size={17} /><b>Filter data</b><span>{filtered.length} taxon-month observations</span></div>
          <div className="filter-grid">
            <FilterSelect label="Control type" value={controlType} options={dimensions.controlTypes} onChange={setControlType} />
            <FilterSelect label="Kingdom" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
            <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
            <label className="filter-field"><span>Taxon</span><input type="search" list="taxa-options" placeholder="All taxa" value={taxon} onChange={(event) => setTaxon(event.target.value)} /><datalist id="taxa-options">{dimensions.taxa.map((name) => <option key={name} value={name} />)}</datalist></label>
            <label className="filter-field"><span>Minimum reads</span><input type="number" min="0" step="50" placeholder="No minimum" value={minReads} onChange={(event) => setMinReads(event.target.value)} /></label>
            <label className="filter-field"><span>Minimum mean A</span><input type="number" min="0" step="0.01" placeholder="No minimum" value={minA} onChange={(event) => setMinA(event.target.value)} /></label>
            <label className="filter-field"><span>From</span><input type="month" min={dimensions.months[0]} max={dimensions.months.at(-1)} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="filter-field"><span>To</span><input type="month" min={dimensions.months[0]} max={dimensions.months.at(-1)} value={to} onChange={(event) => setTo(event.target.value)} /></label>
            <button className="reset" onClick={reset}><RotateCcw size={15} />Reset</button>
          </div>
          <p className="filter-note">Read and A thresholds apply to each taxon/month group. Mean A is weighted by assigned reads.</p>
        </section>

        <section className="metrics" id="overview">
          <MetricCard title="Filtered reads" value={formatNumber(totalReads)} detail="Across selected taxa" icon={Database} change={delta} />
          <MetricCard title="Peak libraries" value={libraryCount} detail="Largest matching group" icon={FlaskConical} tone="purple" />
          <MetricCard title="Taxa represented" value={taxa.length} detail="After all filters" icon={Sparkles} tone="amber" />
          <MetricCard title="Latest load" value={formatNumber(latestTotal)} detail={latest ? prettyDate(latest.month) : 'No matching data'} icon={Activity} tone="blue" />
          <MetricCard title="Flagged libraries" value={flaggedLibraries} detail="Above robust baseline" icon={AlertTriangle} tone={flaggedLibraries ? 'red' : 'green'} />
        </section>

        <section className="chart-grid" id="trends">
          <article className="panel trend-panel">
            <div className="panel-head"><div><span className="kicker">READ VOLUME</span><h2>Contamination over time</h2><p>Monthly reads after all filters · click a month for its libraries</p></div><div className="legend">{dimensions.kingdoms.map((item) => <span key={item}><i style={{ background: COLORS[item] }} />{item}</span>)}</div></div>
            <div className="chart-area">{charts.timeline.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={charts.timeline} margin={{ top: 14, right: 8, left: -12, bottom: 0 }} onClick={(state) => state?.activeLabel && openPeak(state.activeLabel)} className="clickable-chart"><defs>{dimensions.kingdoms.map((item) => <linearGradient key={item} id={`fill-${item.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS[item]} stopOpacity=".28" /><stop offset="100%" stopColor={COLORS[item]} stopOpacity=".01" /></linearGradient>)}</defs><CartesianGrid stroke="#e8ece9" vertical={false} /><XAxis dataKey="month" tickFormatter={prettyDate} tickLine={false} axisLine={false} /><YAxis tickFormatter={formatNumber} tickLine={false} axisLine={false} /><Tooltip content={<CustomTooltip />} />{dimensions.kingdoms.map((item) => <Area key={item} type="monotone" dataKey={item} stroke={COLORS[item]} strokeWidth={2} fill={`url(#fill-${item.replace(/\s/g, '')})`} connectNulls />)}</AreaChart></ResponsiveContainer> : <EmptyState />}</div>
          </article>
          <article className="panel composition-panel">
            <div className="panel-head"><div><span className="kicker">DISTRIBUTION</span><h2>Kingdom composition</h2><p>Share of selected reads</p></div></div>
            <div className="donut-wrap">{charts.composition.length ? <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={charts.composition} dataKey="value" innerRadius={68} outerRadius={90} paddingAngle={3} stroke="none">{charts.composition.map((item) => <Cell key={item.name} fill={COLORS[item.name]} />)}</Pie><Tooltip formatter={(value) => formatNumber(value)} /></PieChart></ResponsiveContainer> : <EmptyState />}<div className="donut-total"><b>{formatNumber(totalReads)}</b><span>total reads</span></div></div>
            <div className="composition-list">{charts.composition.map((item) => <div key={item.name}><span><i style={{ background: COLORS[item.name] }} />{item.name}</span><b>{totalReads ? Math.round(item.value / totalReads * 100) : 0}%</b></div>)}</div>
          </article>
        </section>

        <section className="panel heatmap-panel" id="heatmap">
          <div className="panel-head"><div><span className="kicker">TAXA x TIME</span><h2>Most abundant taxa over time</h2><p>Top 12 taxa after filtering; colour intensity uses log-scaled reads</p></div><div className="heat-legend"><span>Low</span><i /><i /><i /><i /><span>High</span></div></div>
          <div className="heatmap-scroll">{heatmap.top.length ? <table className="heatmap-table"><thead><tr><th>Taxon</th>{heatmap.months.map((month) => <th key={month}><button className="heatmap-date" onClick={() => openPeak(month)} title={`Open libraries from ${prettyDate(month)}`}>{prettyDate(month)}</button></th>)}</tr></thead><tbody>{heatmap.top.map((item) => {
            const key = `${item.kingdom}\u0000${item.name}`
            return <tr key={key}><th><i style={{ background: COLORS[item.kingdom] }} /><button className="taxon-link" onClick={() => openTaxon(item.name)}>{item.name}</button></th>{heatmap.months.map((month) => {
              const value = heatmap.values.get(`${key}\u0000${month}`) || 0
              const intensity = value && heatmap.max ? 0.12 + 0.88 * Math.log1p(value) / Math.log1p(heatmap.max) : 0
              return <td key={month} title={`${item.name} - ${prettyDate(month)} - ${value.toLocaleString()} reads`}>{value ? <button className="heatmap-cell" style={{ background: `rgba(26, 170, 117, ${intensity})` }} onClick={() => openPeak(month, item.name)} aria-label={`Open ${item.name} libraries from ${prettyDate(month)}`}>{formatNumber(value)}</button> : <span />}</td>
            })}</tr>
          })}</tbody></table> : <EmptyState />}</div>
        </section>

        <section className="bottom-grid" id="taxa">
          <article className="panel table-panel">
            <div className="panel-head"><div><span className="kicker">TAXA EXPLORER</span><h2>Most abundant contaminants</h2><p>Up to 50 taxa ranked after filtering</p></div><label className="search"><Search size={16} /><input placeholder="Search results..." value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
            <div className="table-scroll"><table><thead><tr><th>Taxon</th><th>Kingdom</th><th>Assigned reads</th><th>Mean A</th><th>Trend</th></tr></thead><tbody>{visibleTaxa.map((item, index) => <tr key={`${item.kingdom}-${item.name}`}><td><span className="rank">{String(index + 1).padStart(2, '0')}</span><button className="taxon-link" onClick={() => openTaxon(item.name)}>{item.name}</button></td><td><span className="tag"><i style={{ background: COLORS[item.kingdom] }} />{item.kingdom}</span></td><td><b>{item.reads.toLocaleString()}</b></td><td>{item.meanA === null ? '-' : item.meanA.toFixed(3)}</td><td><span className={`trend ${item.change >= 0 ? 'up' : 'down'}`}>{item.change >= 0 ? '+' : ''}{item.change}%</span></td></tr>)}</tbody></table>{!visibleTaxa.length && <EmptyState />}</div>
          </article>
          <article className="panel warning-panel" id="warnings">
            <div className="panel-head"><div><span className="kicker">LIBRARY WARNINGS</span><h2>Higher than normal content</h2><p>{data.warningMethod || 'Available after rebuilding dashboard data'}</p></div><span className={`warning-count ${warnings.length ? 'active' : ''}`}>{warnings.length}</span></div>
            <div className="warning-list">{warnings.slice(0, 12).map((item) => <div className="warning-row" key={`${item.libraryId}-${item.month}-${item.kingdom}-${item.pipeline}`}><span className="warning-icon"><AlertTriangle size={15} /></span><div><button className="library-link" onClick={() => { setSelectedLibrary(item.libraryId); setActiveTab("library"); window.scrollTo({ top: 0, behavior: "smooth" }) }}>{item.libraryId}</button><span>{prettyDate(item.month)} - {item.controlType} - {item.kingdom}</span><small>Top taxon: <button className="taxon-link compact" onClick={() => openTaxon(item.topTaxon)}>{item.topTaxon || 'Unknown'}</button></small></div><strong>{formatNumber(item.reads)}<small>{item.fold ? `${item.fold}x median` : `median ${formatNumber(item.baseline)}`}</small></strong></div>)}{!warnings.length && <EmptyState title="No unusual libraries" detail="None exceed the robust baseline for this selection." />}</div>
          </article>
        </section>

        </> : activeTab === "library" ? <LibraryExplorer records={data.libraryTaxonRecords || []} warnings={data.libraryWarnings || []} warningMethod={data.warningMethod} selectedLibrary={selectedLibrary} onSelectLibrary={setSelectedLibrary} comparisonLibraries={comparisonLibraries} onAddToComparison={addToComparison} onRemoveFromComparison={removeFromComparison} onOpenComparison={() => setActiveTab("compare")} onOpenTaxon={openTaxon} />
          : activeTab === "pcoa" ? <PcoaExplorer records={data.libraryTaxonRecords || []} warnings={data.libraryWarnings || []} onOpenLibrary={(libraryId) => { setSelectedLibrary(libraryId); setActiveTab("library") }} />
          : activeTab === "taxon" ? <TaxonExplorer records={data.libraryTaxonRecords || []} warnings={data.libraryWarnings || []} selectedTaxon={selectedTaxon} onSelectTaxon={setSelectedTaxon} onOpenLibrary={(libraryId) => { setSelectedLibrary(libraryId); setActiveTab("library") }} />
          : activeTab === "prevalence" ? <PrevalenceExplorer records={data.libraryTaxonRecords || []} onOpenTaxon={openTaxon} />
          : activeTab === "compare" ? <LibraryComparison records={data.libraryTaxonRecords || []} warnings={data.libraryWarnings || []} comparisonLibraries={comparisonLibraries} onComparisonChange={setComparisonLibraries} onOpenTaxon={openTaxon} onOpenLibrary={(libraryId) => { setSelectedLibrary(libraryId); setActiveTab("library") }} />
          : activeTab === "damage" ? <DamageExplorer records={data.libraryTaxonRecords || []} onOpenTaxon={openTaxon} />
          : activeTab === "run" ? <RunQcExplorer records={data.libraryTaxonRecords || []} metadata={data.libraryMetadata || []} warnings={data.libraryWarnings || []} onOpenLibrary={(libraryId) => { setSelectedLibrary(libraryId); setActiveTab("library") }} />
          : <CooccurrenceExplorer records={data.libraryTaxonRecords || []} onOpenTaxon={openTaxon} />}

        <PeakLibraries month={peakMonth} taxon={peakTaxon} records={data.libraryTaxonRecords || []} overviewRows={filtered} warnings={data.libraryWarnings || []} onClose={closePeak} onOpenLibrary={(libraryId) => { closePeak(); setSelectedLibrary(libraryId); setActiveTab("library") }} />

        <footer><span><i /> Data source: {data.source}</span><span>Updated {new Date(data.generatedAt).toLocaleString()}</span></footer>
      </main>
    </div>
  )
}

export default App
