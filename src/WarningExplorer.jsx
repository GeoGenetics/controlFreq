import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Search } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import PageGuide from './PageGuide.jsx'

const CONTROL_COLORS = {
  'Extraction Negative': '#20a97b',
  'Library Negative': '#7b72df',
}
const fmt = (value) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const monthLabel = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' })
const dateLabel = (date) => new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })

function FilterSelect({ label, value, options, onChange }) {
  return <label className="filter-field"><span>{label}</span><div className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="All">All {label.toLowerCase()}</option>{options.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
}

function SortHeader({ label, column, sort, onSort }) {
  const active = sort.column === column
  return <th><button className={active ? 'sort-header active' : 'sort-header'} onClick={() => onSort(column)}>{label}<span>{active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>
}

function WarningTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><b>{monthLabel(label)}</b>{payload.filter((item) => item.value).map((item) => <div key={item.name}><i style={{ background: item.color }} />{item.name}<span>{item.value} warnings</span></div>)}</div>
}

export default function WarningExplorer({ warnings = [], warningMethod, onOpenLibrary, onOpenTaxon }) {
  const [controlType, setControlType] = useState('All')
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minimumReads, setMinimumReads] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ column: 'date', direction: 'desc' })

  const dimensions = useMemo(() => ({
    controlTypes: [...new Set(warnings.map((row) => row.controlType))].sort(),
    pipelines: [...new Set(warnings.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(warnings.map((row) => row.kingdom))].sort(),
    dates: warnings.map((row) => row.date || row.month).sort(),
  }), [warnings])

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    const reads = minimumReads === '' ? 0 : Number(minimumReads)
    return warnings.filter((row) => {
      const date = row.date || row.month
      return (controlType === 'All' || row.controlType === controlType) &&
        (pipeline === 'All' || row.pipeline === pipeline) &&
        (kingdom === 'All' || row.kingdom === kingdom) &&
        (!from || date >= from) && (!to || date <= to) &&
        (!Number.isFinite(reads) || row.reads >= reads) &&
        (!search || [row.libraryId, row.topTaxon, row.controlType, row.kingdom, row.pipeline].some((value) => String(value || '').toLowerCase().includes(search)))
    })
  }, [warnings, controlType, pipeline, kingdom, from, to, minimumReads, query])

  const rows = useMemo(() => {
    const direction = sort.direction === 'asc' ? 1 : -1
    const value = (row) => sort.column === 'date' ? row.date || row.month
      : sort.column === 'library' ? row.libraryId.toLowerCase()
        : sort.column === 'type' ? row.controlType.toLowerCase()
          : sort.column === 'kingdom' ? row.kingdom.toLowerCase()
            : sort.column === 'pipeline' ? row.pipeline.toLowerCase()
              : sort.column === 'taxon' ? (row.topTaxon || '').toLowerCase()
                : sort.column === 'fold' ? (row.fold ?? -Infinity)
                  : row.reads
    return [...filtered].sort((a, b) => typeof value(a) === 'string'
      ? value(a).localeCompare(value(b)) * direction
      : (value(a) - value(b)) * direction)
  }, [filtered, sort])

  const timeline = useMemo(() => {
    const months = new Map()
    for (const row of filtered) {
      const point = months.get(row.month) || { month: row.month }
      point[row.controlType] = (point[row.controlType] || 0) + 1
      months.set(row.month, point)
    }
    return [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
  }, [filtered])

  const controlTypes = [...new Set(filtered.map((row) => row.controlType))].sort()
  const uniqueLibraries = new Set(filtered.map((row) => row.libraryId)).size
  const totalReads = filtered.reduce((sum, row) => sum + row.reads, 0)
  const folds = filtered.map((row) => row.fold).filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  const medianFold = folds.length ? folds[Math.floor(folds.length / 2)] : null
  const changeSort = (column) => setSort((current) => ({ column, direction: current.column === column && current.direction === 'desc' ? 'asc' : 'desc' }))
  const reset = () => { setControlType('All'); setPipeline('All'); setKingdom('All'); setFrom(''); setTo(''); setMinimumReads(''); setQuery('') }

  return <section className="warning-page">
    <div className="explorer-hero"><div><span className="kicker">LIBRARY WARNINGS</span><h1>Warnings explorer</h1><p>Review unusually high contamination signals and the libraries behind them.</p></div><span className={`warning-count large ${filtered.length ? 'active' : ''}`}><AlertTriangle size={14} />{filtered.length}</span></div>
    <PageGuide items={[
      { title: 'Warnings are comparison results', text: 'Each row is one library, kingdom, and pipeline combination that exceeded its robust baseline—not necessarily one failed library.' },
      { title: 'Use the chart to find periods', text: 'Bar height is the number of warning rows in each month. Separate colours show extraction and library negatives.' },
      { title: 'Sort, filter, then investigate', text: 'Narrow by date, control type, kingdom, pipeline, reads, or text. Open the library for its taxonomy or the leading taxon for its recurrence history.' },
    ]} />

    <div className="panel warning-filters">
      <FilterSelect label="Control type" value={controlType} options={dimensions.controlTypes} onChange={setControlType} />
      <FilterSelect label="Kingdom" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
      <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
      <label className="filter-field"><span>From date</span><input type="date" min={dimensions.dates[0]} max={dimensions.dates.at(-1)} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="filter-field"><span>To date</span><input type="date" min={dimensions.dates[0]} max={dimensions.dates.at(-1)} value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label className="filter-field"><span>Minimum warning reads</span><input type="number" min="0" value={minimumReads} placeholder="No minimum" onChange={(event) => setMinimumReads(event.target.value)} /></label>
      <label className="warning-search"><Search size={15} /><input type="search" value={query} placeholder="Library or taxon…" onChange={(event) => setQuery(event.target.value)} /></label>
      <button className="reset" onClick={reset}>Reset</button>
    </div>

    <div className="warning-metrics panel">
      <div><span>Warning rows</span><b>{filtered.length}</b><small>Comparison groups over threshold</small></div>
      <div><span>Flagged libraries</span><b>{uniqueLibraries}</b><small>Distinct library IDs</small></div>
      <div><span>Warning reads</span><b>{fmt(totalReads)}</b><small>Across visible warning rows</small></div>
      <div><span>Median elevation</span><b>{medianFold === null ? '—' : `${medianFold.toFixed(1)}×`}</b><small>Relative to group median</small></div>
    </div>

    <article className="panel warning-chart-panel">
      <div className="panel-head"><div><span className="kicker">WARNING FREQUENCY</span><h2>Warnings over time</h2><p>Number of visible warning rows per month, split by control type</p></div><div className="legend">{controlTypes.map((type) => <span key={type}><i style={{ background: CONTROL_COLORS[type] || '#84978e' }} />{type}</span>)}</div></div>
      {timeline.length ? <div className="warning-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={timeline} margin={{ top: 15, right: 18, left: -15, bottom: 2 }}><CartesianGrid stroke="#e8ece9" vertical={false} /><XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip content={<WarningTooltip />} />{controlTypes.map((type) => <Bar key={type} dataKey={type} name={type} fill={CONTROL_COLORS[type] || '#84978e'} radius={[3, 3, 0, 0]} />)}</BarChart></ResponsiveContainer></div> : <div className="analysis-empty">No warnings match these filters.</div>}
    </article>

    <article className="panel warning-table-panel">
      <div className="panel-head"><div><span className="kicker">REVIEW QUEUE</span><h2>Warning details</h2><p>{warningMethod || 'Robust comparison threshold'} · {rows.length} rows</p></div></div>
      <div className="warning-table-scroll"><table><thead><tr><SortHeader label="Date" column="date" sort={sort} onSort={changeSort} /><SortHeader label="Library" column="library" sort={sort} onSort={changeSort} /><SortHeader label="Type" column="type" sort={sort} onSort={changeSort} /><SortHeader label="Kingdom" column="kingdom" sort={sort} onSort={changeSort} /><SortHeader label="Pipeline" column="pipeline" sort={sort} onSort={changeSort} /><SortHeader label="Reads" column="reads" sort={sort} onSort={changeSort} /><SortHeader label="Fold" column="fold" sort={sort} onSort={changeSort} /><SortHeader label="Leading taxon" column="taxon" sort={sort} onSort={changeSort} /></tr></thead><tbody>{rows.map((row) => <tr key={[row.libraryId, row.month, row.kingdom, row.pipeline].join('-')}><td>{dateLabel(row.date || row.month)}</td><td><button className="library-link" onClick={() => onOpenLibrary(row.libraryId)}>{row.libraryId}</button></td><td>{row.controlType}</td><td><span className="tag">{row.kingdom}</span></td><td>{row.pipeline}</td><td><b>{row.reads.toLocaleString()}</b><small className="warning-baseline">threshold {row.threshold.toLocaleString()}</small></td><td>{row.fold ? `${row.fold.toFixed(1)}×` : '—'}</td><td><button className="taxon-link" onClick={() => onOpenTaxon(row.topTaxon)}>{row.topTaxon || 'Unknown'}</button></td></tr>)}</tbody></table>{!rows.length && <div className="analysis-empty">No warnings match these filters.</div>}</div>
    </article>
  </section>
}
