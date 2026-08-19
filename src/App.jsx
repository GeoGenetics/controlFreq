import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ChevronDown, ChevronLeft, Database, Download,
  ChartScatter, FlaskConical, History, LayoutDashboard, Network, RotateCcw, Search,
  SlidersHorizontal, Sparkles, TrendingDown, TrendingUp,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fallbackData } from './data.js'
import ChangeLog from "./ChangeLog.jsx"
import LibraryExplorer from "./LibraryExplorer.jsx"
import PcoaExplorer from "./PcoaExplorer.jsx"
import PeakLibraries from "./PeakLibraries.jsx"
import PageGuide from "./PageGuide.jsx"
import RankFilter from "./RankFilter.jsx"
import WarningExplorer from "./WarningExplorer.jsx"
import WikiTaxonTooltip from "./WikiTaxonTooltip.jsx"
import { CooccurrenceExplorer, DamageExplorer, LibraryComparison, PrevalenceExplorer, RunQcExplorer, TaxonExplorer } from "./AdvancedViews.jsx"

const COLORS = {
  Bacteria: '#24c18a', Microbe: '#24c18a', Archaea: '#38a7c7', Plant: '#9ad55c', Animal: '#f2b84b',
  'Other Eukaryote': '#b08cff',
}
const TAB_LABELS = {
  overview: 'Overview', warnings: 'Library warnings', library: 'Library explorer',
  compare: 'Compare libraries', pcoa: 'PCoA', taxon: 'Taxon explorer',
  prevalence: 'Taxa landscape', cooccurrence: 'Co-occurrence', damage: 'Damage / C→T', run: 'Run / batch QC',
  changelog: 'Changelog',
}
const RANK_ORDER = ['phylum', 'class', 'order', 'family', 'genus', 'species']
const formatNumber = (value) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const prettyDate = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' })
const VIRIDIS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']
const viridisColor = (value) => {
  const scaled = Math.max(0, Math.min(1, value)) * (VIRIDIS.length - 1)
  const index = Math.min(VIRIDIS.length - 2, Math.floor(scaled))
  const amount = scaled - index
  const rgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
  const left = rgb(VIRIDIS[index]); const right = rgb(VIRIDIS[index + 1])
  return `rgb(${left.map((channel, i) => Math.round(channel + (right[i] - channel) * amount)).join(',')})`
}

function SortHeader({ label, column, sort, onSort, title }) {
  const active = sort.column === column
  return <th title={title}><button className={active ? 'sort-header active' : 'sort-header'} onClick={() => onSort(column)}>{label}<span>{active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>
}

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

function RecentChangeColumn({ title, detail, tone, items, kind, onOpenTaxon }) {
  const value = (item) => kind === 'new' ? formatNumber(item.latest) + ' reads'
    : kind === 'gone' ? formatNumber(item.previous) + ' before'
      : (item.delta > 0 ? '+' : '−') + formatNumber(Math.abs(item.delta))
  return <article className={'recent-change-column ' + tone}><header><b>{title}</b><span>{detail}</span></header><div>{items.map((item) => <div key={item.kingdom + '-' + item.name}><i style={{ background: COLORS[item.kingdom] }} /><button className="taxon-link" onClick={() => onOpenTaxon(item.name)}>{item.name}</button><span><b>{value(item)}</b>{item.percent !== null && kind !== 'new' && kind !== 'gone' && <small>{item.percent > 0 ? '+' : ''}{item.percent.toFixed(1)}%</small>}</span></div>)}{!items.length && <p>No matching taxa</p>}</div></article>
}

function App() {
  const [data, setData] = useState(fallbackData)
  const [rankPayloads, setRankPayloads] = useState({})
  const [loadingRank, setLoadingRank] = useState('')
  const [controlType, setControlType] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [pipeline, setPipeline] = useState('All')
  const [taxon, setTaxon] = useState('')
  const [rank, setRank] = useState('genus')
  const [minReads, setMinReads] = useState('50')
  const [taxaSort, setTaxaSort] = useState({ column: 'reads', direction: 'desc' })
  const [minA, setMinA] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState("overview")
  const [navigationHistory, setNavigationHistory] = useState([])
  const [selectedLibrary, setSelectedLibrary] = useState("")
  const [peakMonth, setPeakMonth] = useState("")
  const [peakTaxon, setPeakTaxon] = useState("")
  const [comparisonLibraries, setComparisonLibraries] = useState([])
  const [selectedTaxon, setSelectedTaxon] = useState("")
  const [recentReferenceMonth, setRecentReferenceMonth] = useState("")
  const [recentComparisonMonth, setRecentComparisonMonth] = useState("")

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}dashboard-data.json`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error('No generated data'); return response.json() })
      .then(setData).catch(() => {})
  }, [])

  useEffect(() => {
    const files = data.rankFiles?.[rank]
    if (!files || rank === 'genus' || rankPayloads[rank]) return
    let cancelled = false
    setLoadingRank(rank)
    Promise.all([
      fetch(import.meta.env.BASE_URL + files.taxa, { cache: 'no-store' }),
      fetch(import.meta.env.BASE_URL + files.libraries, { cache: 'no-store' }),
    ]).then(async (responses) => {
      if (responses.some((response) => !response.ok)) throw new Error('Rank data unavailable')
      return Promise.all(responses.map((response) => response.json()))
    }).then(([taxonRecords, libraryTaxonRecords]) => {
      if (!cancelled) setRankPayloads((current) => ({ ...current, [rank]: { taxonRecords, libraryTaxonRecords } }))
    }).catch(() => {}).finally(() => { if (!cancelled) setLoadingRank('') })
    return () => { cancelled = true }
  }, [data.rankFiles, rank, rankPayloads])

  const allTaxonRows = useMemo(() => {
    const rows = rankPayloads[rank]?.taxonRecords || (data.taxonRecords?.length
      ? data.taxonRecords
      : data.records.map((row) => ({ ...row, name: 'All taxa', meanA: null })))
    return rows.map((row) => ({ ...row, rank: row.rank || 'genus' }))
  }, [data, rank, rankPayloads])
  const rankOptions = useMemo(() => {
    const available = new Set([...(data.ranks || []), ...allTaxonRows.map((row) => row.rank)])
    return RANK_ORDER.filter((item) => available.has(item))
  }, [data, allTaxonRows])
  const taxonIndex = useMemo(() => {
    if (data.taxonIndex?.length) return data.taxonIndex
    const rows = [
      ...(data.taxonRecords || data.taxa || []),
      ...Object.values(rankPayloads).flatMap((payload) => payload.taxonRecords || []),
    ]
    const unique = new Map()
    for (const row of rows) {
      const itemRank = row.rank || 'genus'
      unique.set(`${itemRank}\u0000${row.name}`, { rank: itemRank, name: row.name })
    }
    return [...unique.values()].sort((left, right) => RANK_ORDER.indexOf(left.rank) - RANK_ORDER.indexOf(right.rank) || left.name.localeCompare(right.name))
  }, [data, rankPayloads])
  const taxonRows = useMemo(() => allTaxonRows.filter((row) => row.rank === rank), [allTaxonRows, rank])
  const libraryTaxonRows = useMemo(() => (rankPayloads[rank]?.libraryTaxonRecords || data.libraryTaxonRecords || [])
    .filter((row) => (row.rank || 'genus') === rank), [data, rank, rankPayloads])

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

  const recentMonthOptions = useMemo(() => [...new Set(filtered.map((row) => row.month))].sort().reverse(), [filtered])

  const recentChanges = useMemo(() => {
    const autoComparison = recentMonthOptions[0]
    const autoReference = recentMonthOptions[1]
    const requestedComparison = recentMonthOptions.includes(recentComparisonMonth) ? recentComparisonMonth : autoComparison
    const requestedReference = recentMonthOptions.includes(recentReferenceMonth) ? recentReferenceMonth : autoReference
    const comparisonMonth = requestedComparison
    const referenceMonth = requestedReference !== comparisonMonth
      ? requestedReference
      : recentMonthOptions.find((month) => month !== comparisonMonth)
    if (!comparisonMonth || !referenceMonth) return { comparisonMonth, referenceMonth, newTaxa: [], goneTaxa: [], rising: [], falling: [] }
    const groups = new Map()
    for (const row of filtered) {
      if (row.month !== comparisonMonth && row.month !== referenceMonth) continue
      const key = row.kingdom + '\u0000' + row.name
      const item = groups.get(key) || { name: row.name, kingdom: row.kingdom, previous: 0, latest: 0 }
      if (row.month === comparisonMonth) item.latest += row.reads
      else item.previous += row.reads
      groups.set(key, item)
    }
    const items = [...groups.values()].map((item) => ({
      ...item,
      delta: item.latest - item.previous,
      percent: item.previous ? (item.latest - item.previous) / item.previous * 100 : null,
    }))
    return {
      comparisonMonth, referenceMonth,
      newTaxa: items.filter((item) => !item.previous && item.latest).sort((a, b) => b.latest - a.latest).slice(0, 5),
      goneTaxa: items.filter((item) => item.previous && !item.latest).sort((a, b) => b.previous - a.previous).slice(0, 5),
      rising: items.filter((item) => item.previous && item.latest && item.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5),
      falling: items.filter((item) => item.previous && item.latest && item.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5),
    }
  }, [filtered, recentMonthOptions, recentReferenceMonth, recentComparisonMonth])

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

  const rankWarnings = useMemo(() => (data.libraryWarnings || []).filter((row) =>
    (row.rank || 'genus') === rank), [data, rank])
  const warnings = useMemo(() => rankWarnings.filter((row) =>
    (controlType === 'All' || row.controlType === controlType) &&
    (kingdom === 'All' || row.kingdom === kingdom) &&
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (!from || row.month >= from) && (!to || row.month <= to)
  ).sort((a, b) => (b.date || b.month).localeCompare(a.date || a.month) || b.reads - a.reads), [rankWarnings, controlType, kingdom, pipeline, from, to])

  const totalReads = filtered.reduce((sum, row) => sum + row.reads, 0)
  const libraryCount = Math.max(0, ...filtered.map((row) => row.libraries || 0))
  const flaggedLibraries = new Set(warnings.map((row) => row.libraryId)).size
  const latest = charts.timeline.at(-1)
  const previous = charts.timeline.at(-2)
  const sumPoint = (point) => point ? Object.entries(point).filter(([key]) => key !== 'month').reduce((sum, [, value]) => sum + value, 0) : 0
  const latestTotal = sumPoint(latest)
  const previousTotal = sumPoint(previous)
  const delta = previousTotal ? Math.round((latestTotal - previousTotal) / previousTotal * 100) : 0
  const visibleTaxa = useMemo(() => {
    const direction = taxaSort.direction === 'asc' ? 1 : -1
    const value = (item) => taxaSort.column === 'taxon' ? item.name.toLowerCase()
      : taxaSort.column === 'kingdom' ? item.kingdom.toLowerCase()
        : taxaSort.column === 'meanA' ? (item.meanA ?? -Infinity)
          : taxaSort.column === 'trend' ? item.change : item.reads
    return taxa.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => typeof value(a) === 'string' ? value(a).localeCompare(value(b)) * direction : (value(a) - value(b)) * direction)
      .slice(0, 50)
  }, [taxa, query, taxaSort])

  const changeTaxaSort = (column) => setTaxaSort((current) => ({
    column,
    direction: current.column === column && current.direction === 'desc' ? 'asc' : 'desc',
  }))

  const reset = () => {
    setControlType('All'); setKingdom('All'); setPipeline('All'); setTaxon('')
    setRank('genus'); setSelectedTaxon('')
    setMinReads('50'); setMinA(''); setFrom(''); setTo('')
  }

  const navigateTo = (tab) => {
    if (tab === activeTab) return
    setNavigationHistory((current) => [...current, { tab: activeTab, scrollY: window.scrollY }].slice(-20))
    setActiveTab(tab)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
  const goBack = () => {
    const previous = navigationHistory.at(-1)
    if (!previous) return
    setNavigationHistory((current) => current.slice(0, -1))
    setActiveTab(previous.tab)
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: previous.scrollY, behavior: 'auto' })))
  }
  const openTaxon = (taxonName, taxonRank = rank) => { setRank(taxonRank); setSelectedTaxon(taxonName); navigateTo("taxon") }
  const selectTaxon = useCallback((taxonName, taxonRank) => {
    const inferredRank = taxonRank
      || taxonIndex.find((item) => item.name === taxonName && item.rank === rank)?.rank
      || taxonIndex.find((item) => item.name === taxonName)?.rank
    if (inferredRank && inferredRank !== rank) setRank(inferredRank)
    setSelectedTaxon(taxonName)
  }, [rank, taxonIndex])
  const openPeak = (month, taxonName = "") => { setPeakMonth(month); setPeakTaxon(taxonName) }
  const closePeak = () => { setPeakMonth(""); setPeakTaxon("") }
  const addToComparison = (libraryId) => setComparisonLibraries((current) => current.includes(libraryId) ? current : current.length < 2 ? [...current, libraryId] : [current[1], libraryId])
  const removeFromComparison = (libraryId) => setComparisonLibraries((current) => current.filter((id) => id !== libraryId))
  const compareLibraries = (left, right) => { setComparisonLibraries([left, right]); navigateTo("compare") }
  const changeRank = (nextRank) => { setRank(nextRank); setSelectedTaxon('') }
  const rankFilter = <RankFilter rank={rank} options={rankOptions} loading={loadingRank === rank} onChange={changeRank} />

  const exportCsv = () => {
    const header = 'rank,month,control_type,biological_group,pipeline,taxon,reads,libraries,mean_A\n'
    const body = filtered.map((row) => [row.rank, row.month, row.controlType, row.kingdom, row.pipeline, row.name, row.reads, row.libraries, row.meanA ?? ''].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([header + body], { type: 'text/csv' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'controlfreq-filtered.csv'; anchor.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top"><span><FlaskConical size={21} /></span><b>controlFreq</b></a>
        <nav>
          <small>MONITOR</small>
          <button className={activeTab === "overview" ? "active" : ""} onClick={() => navigateTo("overview")}><LayoutDashboard size={18} />Overview</button>
          <button className={activeTab === "warnings" ? "active" : ""} onClick={() => navigateTo("warnings")}><AlertTriangle size={18} />Library warnings</button>
          <small>LIBRARIES</small>
          <button className={activeTab === "library" ? "active" : ""} onClick={() => navigateTo("library")}><Network size={18} />Library explorer</button>
          <button className={activeTab === "compare" ? "active" : ""} onClick={() => navigateTo("compare")}><Network size={18} />Compare libraries</button>
          <button className={activeTab === "pcoa" ? "active" : ""} onClick={() => navigateTo("pcoa")}><ChartScatter size={18} />PCoA</button>
          <small>TAXA</small>
          <button className={activeTab === "taxon" ? "active" : ""} onClick={() => navigateTo("taxon")}><Search size={18} />Taxon explorer</button>
          <button className={activeTab === "prevalence" ? "active" : ""} onClick={() => navigateTo("prevalence")}><ChartScatter size={18} />Taxa landscape</button>
          <button className={activeTab === "cooccurrence" ? "active" : ""} onClick={() => navigateTo("cooccurrence")}><Network size={18} />Co-occurrence</button>
          <small>QUALITY</small>
          <button className={activeTab === "damage" ? "active" : ""} onClick={() => navigateTo("damage")}><Sparkles size={18} />Damage / C→T</button>
          <button className={activeTab === "run" ? "active" : ""} onClick={() => navigateTo("run")}><Database size={18} />Run / batch QC</button>
          <small>ABOUT</small>
          <button className={activeTab === "changelog" ? "active" : ""} onClick={() => navigateTo("changelog")}><History size={18} />Changelog</button>
        </nav>
      </aside>

      <main id="top">
        {navigationHistory.length > 0 && <button className="context-back" onClick={goBack}><ChevronLeft size={15} />Back to {TAB_LABELS[navigationHistory.at(-1).tab] || 'previous page'}</button>}
        {activeTab === "overview" ? <>
        <header className="topbar">
          <div><div className="eyebrow"><span /> LAB MONITORING</div><h1>Contamination overview</h1><p>Track recurring taxa and changes across negative controls.</p></div>
          <div className="top-actions"><button className="secondary" onClick={exportCsv}><Download size={16} />Export data</button></div>
        </header>

        <PageGuide items={[
          { title: 'Start with filters', text: 'Choose a taxonomic rank here, then use the remaining filters to narrow every number and plot. Rank defaults to genus; minimum nreads defaults to 50 and stays synchronized with the other analysis tabs.' },
          { title: 'Read the patterns', text: 'Recent Changes defaults to the newest two matching months, or lets you select any other pair. The timeline shows longer-term volume and the viridis heatmap shows which taxa drive it; click taxon names or chart cells to investigate.' },
          { title: 'Read the summary cards', text: 'Peak libraries is the largest distinct-library count behind one visible taxon, month, control type, biological group, and pipeline result. Latest load sums all visible assigned reads in the newest matching month.' },
        ]} />

        <section className="filter-panel" id="filters">
          <div className="filter-title"><SlidersHorizontal size={17} /><b>Filter data</b><span>{filtered.length} {rank}-month observations</span></div>
          <div className="filter-grid">
            {rankFilter}
            <FilterSelect label="Control type" value={controlType} options={dimensions.controlTypes} onChange={setControlType} />
            <FilterSelect label="Biological group" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
            <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
            <label className="filter-field"><span>Taxon</span><input type="search" list="taxa-options" placeholder="All taxa" value={taxon} onChange={(event) => setTaxon(event.target.value)} /><datalist id="taxa-options">{dimensions.taxa.map((name) => <option key={name} value={name} />)}</datalist></label>
            <label className="filter-field"><span>Minimum nreads</span><input type="number" min="0" step="50" value={minReads} onChange={(event) => setMinReads(event.target.value)} /></label>
            <label className="filter-field"><span>Minimum 5′ C→T</span><input type="number" min="0" step="0.01" placeholder="No minimum" value={minA} onChange={(event) => setMinA(event.target.value)} /></label>
            <label className="filter-field"><span>From</span><input type="month" min={dimensions.months[0]} max={dimensions.months.at(-1)} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="filter-field"><span>To</span><input type="month" min={dimensions.months[0]} max={dimensions.months.at(-1)} value={to} onChange={(event) => setTo(event.target.value)} /></label>
            <button className="reset" onClick={reset}><RotateCcw size={15} />Reset</button>
          </div>
          <p className="filter-note">The nreads threshold is shared with every analysis page. Here it applies to each {rank}/month group; mean 5′ C→T is weighted by assigned reads.</p>
        </section>

        <section className="metrics" id="overview">
          <MetricCard title="Filtered reads" value={formatNumber(totalReads)} detail="% is change from previous matching month" icon={Database} change={delta} />
          <MetricCard title="Peak libraries" value={libraryCount} detail="Largest library count in one result" icon={FlaskConical} tone="purple" />
          <MetricCard title="Taxa represented" value={taxa.length} detail="After all filters" icon={Sparkles} tone="amber" />
          <MetricCard title="Latest load" value={formatNumber(latestTotal)} detail={latest ? `Total reads in ${prettyDate(latest.month)}` : 'No matching data'} icon={Activity} tone="blue" />
          <MetricCard title="Flagged libraries" value={flaggedLibraries} detail="Above robust baseline" icon={AlertTriangle} tone={flaggedLibraries ? 'red' : 'green'} />
        </section>

        <section className="panel recent-changes-panel">
          <div className="panel-head recent-change-head"><div><span className="kicker">RECENT CHANGES</span><h2>What changed between two matching months?</h2><p>{recentChanges.referenceMonth && recentChanges.comparisonMonth ? prettyDate(recentChanges.comparisonMonth) + ' versus ' + prettyDate(recentChanges.referenceMonth) : 'Choose a range containing at least two matching months'}</p></div><div className="recent-change-controls"><label><span>Reference month</span><select value={recentChanges.referenceMonth || ''} onChange={(event) => setRecentReferenceMonth(event.target.value)} disabled={recentMonthOptions.length < 2}>{recentMonthOptions.map((month) => <option key={month} value={month} disabled={month === recentChanges.comparisonMonth}>{prettyDate(month)}</option>)}</select></label><span>→</span><label><span>Comparison month</span><select value={recentChanges.comparisonMonth || ''} onChange={(event) => setRecentComparisonMonth(event.target.value)} disabled={recentMonthOptions.length < 2}>{recentMonthOptions.map((month) => <option key={month} value={month} disabled={month === recentChanges.referenceMonth}>{prettyDate(month)}</option>)}</select></label>{(recentReferenceMonth || recentComparisonMonth) && <button onClick={() => { setRecentReferenceMonth(''); setRecentComparisonMonth('') }}><RotateCcw size={12} />Use newest pair</button>}<small>After active filters</small></div></div>
          {recentChanges.referenceMonth ? <div className="recent-change-grid">
            <RecentChangeColumn title="Newly detected" detail="Absent in reference month" tone="new" kind="new" items={recentChanges.newTaxa} onOpenTaxon={openTaxon} />
            <RecentChangeColumn title="Biggest increases" detail="Ranked by added reads" tone="rising" kind="rising" items={recentChanges.rising} onOpenTaxon={openTaxon} />
            <RecentChangeColumn title="Biggest decreases" detail="Ranked by lost reads" tone="falling" kind="falling" items={recentChanges.falling} onOpenTaxon={openTaxon} />
            <RecentChangeColumn title="No longer detected" detail="Absent in comparison month" tone="gone" kind="gone" items={recentChanges.goneTaxa} onOpenTaxon={openTaxon} />
          </div> : <EmptyState title="Two months are needed" detail="Widen the date or other filters to compare recent changes." />}
          <p className="recent-change-footnote">“Newly” and “no longer” mean present or absent after the active filters; they do not prove biological arrival or disappearance.</p>
        </section>

        <section className="chart-grid" id="trends">
          <article className="panel trend-panel">
            <div className="panel-head"><div><span className="kicker">READ VOLUME</span><h2>Contamination over time</h2><p>Monthly reads after all filters · click a month for its libraries</p></div><div className="legend">{dimensions.kingdoms.map((item) => <span key={item}><i style={{ background: COLORS[item] }} />{item}</span>)}</div></div>
            <div className="chart-area">{charts.timeline.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={charts.timeline} margin={{ top: 14, right: 8, left: -12, bottom: 0 }} onClick={(state) => state?.activeLabel && openPeak(state.activeLabel)} className="clickable-chart"><defs>{dimensions.kingdoms.map((item) => <linearGradient key={item} id={`fill-${item.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS[item]} stopOpacity=".28" /><stop offset="100%" stopColor={COLORS[item]} stopOpacity=".01" /></linearGradient>)}</defs><CartesianGrid stroke="#e8ece9" vertical={false} /><XAxis dataKey="month" tickFormatter={prettyDate} tickLine={false} axisLine={false} /><YAxis tickFormatter={formatNumber} tickLine={false} axisLine={false} /><Tooltip content={<CustomTooltip />} />{dimensions.kingdoms.map((item) => <Area key={item} type="monotone" dataKey={item} stroke={COLORS[item]} strokeWidth={2} fill={`url(#fill-${item.replace(/\s/g, '')})`} connectNulls />)}</AreaChart></ResponsiveContainer> : <EmptyState />}</div>
          </article>
          <article className="panel composition-panel">
            <div className="panel-head"><div><span className="kicker">DISTRIBUTION</span><h2>Biological-group composition</h2><p>Share of selected reads</p></div></div>
            <div className="donut-wrap">{charts.composition.length ? <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={charts.composition} dataKey="value" innerRadius={68} outerRadius={90} paddingAngle={3} stroke="none">{charts.composition.map((item) => <Cell key={item.name} fill={COLORS[item.name]} />)}</Pie><Tooltip formatter={(value) => formatNumber(value)} /></PieChart></ResponsiveContainer> : <EmptyState />}<div className="donut-total"><b>{formatNumber(totalReads)}</b><span>total reads</span></div></div>
            <div className="composition-list">{charts.composition.map((item) => <div key={item.name}><span><i style={{ background: COLORS[item.name] }} />{item.name}</span><b>{totalReads ? Math.round(item.value / totalReads * 100) : 0}%</b></div>)}</div>
          </article>
        </section>

        <section className="panel heatmap-panel" id="heatmap">
          <div className="panel-head"><div><span className="kicker">TAXA x TIME</span><h2>Most abundant taxa over time</h2><p>Top 12 taxa after filtering; viridis colour uses log-scaled reads</p></div><div className="heat-legend"><span>Low</span><i /><i /><i /><i /><i /><span>High</span></div></div>
          <div className="heatmap-scroll">{heatmap.top.length ? <table className="heatmap-table"><thead><tr><th>Taxon</th>{heatmap.months.map((month) => <th key={month}><button className="heatmap-date" onClick={() => openPeak(month)} title={`Open libraries from ${prettyDate(month)}`}>{prettyDate(month)}</button></th>)}</tr></thead><tbody>{heatmap.top.map((item) => {
            const key = `${item.kingdom}\u0000${item.name}`
            return <tr key={key}><th><i style={{ background: COLORS[item.kingdom] }} /><button className="taxon-link" onClick={() => openTaxon(item.name)}>{item.name}</button></th>{heatmap.months.map((month) => {
              const value = heatmap.values.get(`${key}\u0000${month}`) || 0
              const intensity = value && heatmap.max ? Math.log1p(value) / Math.log1p(heatmap.max) : 0
              return <td key={month} title={`${item.name} - ${prettyDate(month)} - ${value.toLocaleString()} reads`}>{value ? <button className="heatmap-cell" style={{ background: viridisColor(intensity), color: intensity < .55 ? '#fff' : '#18261f' }} onClick={() => openPeak(month, item.name)} aria-label={`Open ${item.name} libraries from ${prettyDate(month)}`}>{formatNumber(value)}</button> : <span />}</td>
            })}</tr>
          })}</tbody></table> : <EmptyState />}</div>
        </section>

        <section className="bottom-grid overview-taxa-only" id="taxa">
          <article className="panel table-panel">
            <div className="panel-head"><div><span className="kicker">TAXA EXPLORER</span><h2>Most abundant contaminants</h2><p>Trend is the read-count change from the previous to the latest matching month</p></div><label className="search"><Search size={16} /><input placeholder="Search results..." value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
            <div className="table-scroll"><table><thead><tr><SortHeader label="Taxon" column="taxon" sort={taxaSort} onSort={changeTaxaSort} /><SortHeader label="Biological group" column="kingdom" sort={taxaSort} onSort={changeTaxaSort} /><SortHeader label="Assigned reads" column="reads" sort={taxaSort} onSort={changeTaxaSort} /><SortHeader label="Mean 5′ C→T" column="meanA" sort={taxaSort} onSort={changeTaxaSort} /><SortHeader label="Trend" column="trend" sort={taxaSort} onSort={changeTaxaSort} title="Percent change in reads from the previous to the latest matching month" /></tr></thead><tbody>{visibleTaxa.map((item, index) => <tr key={`${item.kingdom}-${item.name}`}><td><span className="rank">{String(index + 1).padStart(2, '0')}</span><button className="taxon-link" onClick={() => openTaxon(item.name)}>{item.name}</button></td><td><span className="tag"><i style={{ background: COLORS[item.kingdom] }} />{item.kingdom}</span></td><td><b>{item.reads.toLocaleString()}</b></td><td>{item.meanA === null ? '-' : item.meanA.toFixed(3)}</td><td><span className={`trend ${item.change >= 0 ? 'up' : 'down'}`} title="Change in reads from the previous to latest matching month">{item.change >= 0 ? '+' : ''}{item.change}%</span></td></tr>)}</tbody></table>{!visibleTaxa.length && <EmptyState />}</div>
          </article>
        </section>

        </> : activeTab === "warnings" ? <WarningExplorer rankFilter={rankFilter} warnings={rankWarnings} warningMethod={data.warningMethod} onOpenLibrary={(libraryId) => { setSelectedLibrary(libraryId); navigateTo("library") }} onOpenTaxon={openTaxon} />
          : activeTab === "library" ? <LibraryExplorer rankFilter={rankFilter} records={libraryTaxonRows} rank={rank} warnings={rankWarnings} warningMethod={data.warningMethod} selectedLibrary={selectedLibrary} minReads={minReads} onMinReadsChange={setMinReads} onSelectLibrary={setSelectedLibrary} comparisonLibraries={comparisonLibraries} onAddToComparison={addToComparison} onRemoveFromComparison={removeFromComparison} onOpenComparison={() => navigateTo("compare")} onCompareWith={compareLibraries} onOpenTaxon={openTaxon} />
          : activeTab === "pcoa" ? <PcoaExplorer rankFilter={rankFilter} records={libraryTaxonRows} rank={rank} warnings={rankWarnings} minReads={minReads} onMinReadsChange={setMinReads} onOpenLibrary={(libraryId) => { setSelectedLibrary(libraryId); navigateTo("library") }} />
          : activeTab === "taxon" ? <TaxonExplorer rankFilter={rankFilter} records={libraryTaxonRows} rank={rank} taxonOptions={taxonIndex} warnings={rankWarnings} selectedTaxon={selectedTaxon} minReads={minReads} onMinReadsChange={setMinReads} onSelectTaxon={selectTaxon} onOpenLibrary={(libraryId) => { setSelectedLibrary(libraryId); navigateTo("library") }} />
          : activeTab === "prevalence" ? <PrevalenceExplorer rankFilter={rankFilter} records={libraryTaxonRows} minReads={minReads} onMinReadsChange={setMinReads} onOpenTaxon={openTaxon} />
          : activeTab === "compare" ? <LibraryComparison rankFilter={rankFilter} records={libraryTaxonRows} metadata={data.libraryMetadata || []} warnings={rankWarnings} comparisonLibraries={comparisonLibraries} minReads={minReads} onMinReadsChange={setMinReads} onComparisonChange={setComparisonLibraries} onOpenTaxon={openTaxon} onOpenLibrary={(libraryId) => { setSelectedLibrary(libraryId); navigateTo("library") }} />
          : activeTab === "damage" ? <DamageExplorer rankFilter={rankFilter} records={libraryTaxonRows} minReads={minReads} onMinReadsChange={setMinReads} onOpenTaxon={openTaxon} />
          : activeTab === "run" ? <RunQcExplorer rankFilter={rankFilter} records={libraryTaxonRows} metadata={data.libraryMetadata || []} warnings={rankWarnings} minReads={minReads} onMinReadsChange={setMinReads} onOpenLibrary={(libraryId) => { setSelectedLibrary(libraryId); navigateTo("library") }} />
          : activeTab === "cooccurrence" ? <CooccurrenceExplorer rankFilter={rankFilter} records={libraryTaxonRows} minReads={minReads} onMinReadsChange={setMinReads} onOpenTaxon={openTaxon} />
          : <ChangeLog entries={__APP_CHANGE_LOG__} data={data} />}

        <PeakLibraries month={peakMonth} taxon={peakTaxon} records={libraryTaxonRows} overviewRows={filtered} warnings={rankWarnings} onClose={closePeak} onOpenLibrary={(libraryId) => { closePeak(); setSelectedLibrary(libraryId); navigateTo("library") }} />

        <WikiTaxonTooltip />

        <footer><span><i /> Data source: {data.source}</span><span>Updated {new Date(data.generatedAt).toLocaleString()}</span></footer>
      </main>
    </div>
  )
}

export default App
