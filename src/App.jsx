import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, BarChart3, Bell, ChevronDown, CircleHelp,
  Database, Download, FlaskConical, LayoutDashboard, RotateCcw, Search,
  Settings, ShieldCheck, SlidersHorizontal, Sparkles, TrendingDown, TrendingUp,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fallbackData } from './data.js'

const COLORS = {
  Microbe: '#24c18a', Plant: '#9ad55c', Animal: '#f2b84b',
  'Other Eukaryote': '#b08cff',
}
const formatNumber = (value) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const prettyDate = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' })

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <div className="select-wrap">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="All">All {label.toLowerCase()}</option>
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
        <ChevronDown size={15} />
      </div>
    </label>
  )
}

function MetricCard({ title, value, detail, icon: Icon, tone = 'green', change }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}><Icon size={19} /></div>
      <div className="metric-copy">
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      {change !== undefined && (
        <span className={`change ${change >= 0 ? 'up' : 'down'}`}>
          {change >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {Math.abs(change)}%
        </span>
      )}
    </article>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <b>{prettyDate(label)}</b>
      {payload.map((item) => (
        <div key={item.dataKey}><i style={{ background: item.color }} />{item.name}<span>{formatNumber(item.value)}</span></div>
      ))}
    </div>
  )
}

function App() {
  const [data, setData] = useState(fallbackData)
  const [controlType, setControlType] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [pipeline, setPipeline] = useState('All')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState(false)

  useEffect(() => {
    fetch('/dashboard-data.json')
      .then((response) => { if (!response.ok) throw new Error('No generated data'); return response.json() })
      .then(setData)
      .catch(() => {})
  }, [])

  const dimensions = useMemo(() => ({
    controlTypes: [...new Set(data.records.map((row) => row.controlType))],
    kingdoms: [...new Set(data.records.map((row) => row.kingdom))],
    pipelines: [...new Set(data.records.map((row) => row.pipeline))],
    months: [...new Set(data.records.map((row) => row.month))].sort(),
  }), [data])

  const filtered = useMemo(() => data.records.filter((row) =>
    (controlType === 'All' || row.controlType === controlType) &&
    (kingdom === 'All' || row.kingdom === kingdom) &&
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (!from || row.month >= from) && (!to || row.month <= to)
  ), [data, controlType, kingdom, pipeline, from, to])

  const charts = useMemo(() => {
    const monthMap = new Map()
    const kingdomMap = new Map()
    for (const row of filtered) {
      const point = monthMap.get(row.month) || { month: row.month }
      point[row.kingdom] = (point[row.kingdom] || 0) + row.reads
      monthMap.set(row.month, point)
      kingdomMap.set(row.kingdom, (kingdomMap.get(row.kingdom) || 0) + row.reads)
    }
    return {
      timeline: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
      composition: [...kingdomMap].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    }
  }, [filtered])

  const totalReads = filtered.reduce((sum, row) => sum + row.reads, 0)
  const libraryCount = Math.max(0, ...filtered.map((row) => row.libraries || 0))
  const latest = charts.timeline.at(-1)
  const previous = charts.timeline.at(-2)
  const latestTotal = latest ? Object.entries(latest).filter(([key]) => key !== 'month').reduce((sum, [, value]) => sum + value, 0) : 0
  const previousTotal = previous ? Object.entries(previous).filter(([key]) => key !== 'month').reduce((sum, [, value]) => sum + value, 0) : 0
  const delta = previousTotal ? Math.round(((latestTotal - previousTotal) / previousTotal) * 100) : 0
  const taxa = data.taxa.filter((taxon) =>
    (kingdom === 'All' || taxon.kingdom === kingdom) && taxon.name.toLowerCase().includes(query.toLowerCase())
  )

  const reset = () => { setControlType('All'); setKingdom('All'); setPipeline('All'); setFrom(''); setTo('') }
  const exportCsv = () => {
    const header = 'month,control_type,kingdom,pipeline,reads,libraries\n'
    const body = filtered.map((row) => [row.month, row.controlType, row.kingdom, row.pipeline, row.reads, row.libraries].join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([header + body], { type: 'text/csv' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'controlfreq-filtered.csv'; anchor.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top"><span><FlaskConical size={21} /></span><b>controlFreq</b></a>
        <nav>
          <small>WORKSPACE</small>
          <a className="active" href="#overview"><LayoutDashboard size={18} />Overview</a>
          <a href="#trends"><Activity size={18} />Contamination</a>
          <a href="#taxa"><Database size={18} />Taxa explorer</a>
          <small>TOOLS</small>
          <a href="#filters"><SlidersHorizontal size={18} />Filters</a>
          <a href="#settings"><Settings size={18} />Settings</a>
        </nav>
        <div className="side-status"><span><ShieldCheck size={17} /></span><div><b>Pipeline healthy</b><small>Last run completed</small></div></div>
        <div className="profile"><div>AR</div><span><b>Abigail Ramsøe</b><small>Laboratory team</small></span><ChevronDown size={15} /></div>
      </aside>

      <main id="top">
        <header className="topbar">
          <div><div className="eyebrow"><span /> LAB MONITORING</div><h1>Contamination overview</h1><p>Track recurring taxa and changes across negative controls.</p></div>
          <div className="top-actions"><button className="icon-button" onClick={() => setNotice(!notice)} aria-label="Notifications"><Bell size={19} /><i /></button><button className="secondary" onClick={exportCsv}><Download size={16} />Export data</button></div>
          {notice && <div className="notice"><b>Everything looks stable</b><span>No pipeline alerts in this reporting window.</span></div>}
        </header>

        <section className="filter-panel" id="filters">
          <div className="filter-title"><SlidersHorizontal size={17} /><b>Filter data</b><span>{filtered.length} grouped observations</span></div>
          <div className="filter-grid">
            <FilterSelect label="Control type" value={controlType} options={dimensions.controlTypes} onChange={setControlType} />
            <FilterSelect label="Kingdom" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
            <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
            <label className="filter-field"><span>From</span><input type="month" min={dimensions.months[0]} max={dimensions.months.at(-1)} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="filter-field"><span>To</span><input type="month" min={dimensions.months[0]} max={dimensions.months.at(-1)} value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <button className="reset" onClick={reset}><RotateCcw size={15} />Reset</button>
          </div>
        </section>

        <section className="metrics" id="overview">
          <MetricCard title="Filtered reads" value={formatNumber(totalReads)} detail="Across selected taxa" icon={Database} change={delta} />
          <MetricCard title="Control libraries" value={libraryCount} detail="In the largest period" icon={FlaskConical} tone="purple" />
          <MetricCard title="Taxa represented" value={taxa.length} detail="Above read threshold" icon={Sparkles} tone="amber" />
          <MetricCard title="Latest load" value={formatNumber(latestTotal)} detail={latest ? prettyDate(latest.month) : 'No matching data'} icon={Activity} tone="blue" />
        </section>

        <section className="chart-grid" id="trends">
          <article className="panel trend-panel">
            <div className="panel-head"><div><span className="kicker">READ VOLUME</span><h2>Contamination over time</h2><p>Monthly reads split by biological group</p></div><div className="legend">{dimensions.kingdoms.map((item) => <span key={item}><i style={{ background: COLORS[item] }} />{item}</span>)}</div></div>
            <div className="chart-area">
              {charts.timeline.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={charts.timeline} margin={{ top: 14, right: 8, left: -12, bottom: 0 }}><defs>{dimensions.kingdoms.map((item) => <linearGradient key={item} id={`fill-${item.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS[item]} stopOpacity=".28" /><stop offset="100%" stopColor={COLORS[item]} stopOpacity=".01" /></linearGradient>)}</defs><CartesianGrid stroke="#e8ece9" vertical={false} /><XAxis dataKey="month" tickFormatter={prettyDate} tickLine={false} axisLine={false} /><YAxis tickFormatter={formatNumber} tickLine={false} axisLine={false} /><Tooltip content={<CustomTooltip />} />{dimensions.kingdoms.map((item) => <Area key={item} type="monotone" dataKey={item} stroke={COLORS[item]} strokeWidth={2} fill={`url(#fill-${item.replace(/\s/g, '')})`} connectNulls />)}</AreaChart></ResponsiveContainer> : <EmptyState />}
            </div>
          </article>

          <article className="panel composition-panel">
            <div className="panel-head"><div><span className="kicker">DISTRIBUTION</span><h2>Kingdom composition</h2><p>Share of selected reads</p></div><button className="ghost" aria-label="Help"><CircleHelp size={17} /></button></div>
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={charts.composition} dataKey="value" innerRadius={68} outerRadius={90} paddingAngle={3} stroke="none">{charts.composition.map((item) => <Cell key={item.name} fill={COLORS[item.name]} />)}</Pie><Tooltip formatter={(value) => formatNumber(value)} /></PieChart></ResponsiveContainer>
              <div className="donut-total"><b>{formatNumber(totalReads)}</b><span>total reads</span></div>
            </div>
            <div className="composition-list">{charts.composition.map((item) => <div key={item.name}><span><i style={{ background: COLORS[item.name] }} />{item.name}</span><b>{totalReads ? Math.round(item.value / totalReads * 100) : 0}%</b></div>)}</div>
          </article>
        </section>

        <section className="bottom-grid" id="taxa">
          <article className="panel table-panel">
            <div className="panel-head"><div><span className="kicker">TAXA EXPLORER</span><h2>Most abundant contaminants</h2><p>Taxa ranked by total assigned reads</p></div><label className="search"><Search size={16} /><input placeholder="Search taxa…" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
            <div className="table-scroll"><table><thead><tr><th>Taxon</th><th>Kingdom</th><th>Assigned reads</th><th>Trend</th></tr></thead><tbody>{taxa.map((taxon, index) => <tr key={taxon.name}><td><span className="rank">{String(index + 1).padStart(2, '0')}</span><b>{taxon.name}</b></td><td><span className="tag"><i style={{ background: COLORS[taxon.kingdom] }} />{taxon.kingdom}</span></td><td><b>{taxon.reads.toLocaleString()}</b></td><td><span className={`trend ${taxon.change >= 0 ? 'up' : 'down'}`}>{taxon.change >= 0 ? '+' : ''}{taxon.change}%</span></td></tr>)}</tbody></table>{!taxa.length && <EmptyState />}</div>
          </article>
          <article className="panel library-panel">
            <div className="panel-head"><div><span className="kicker">THROUGHPUT</span><h2>Libraries processed</h2><p>Maximum controls represented per month</p></div></div>
            <div className="bar-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={charts.timeline.map((point) => ({ ...point, libraries: Math.max(...filtered.filter((row) => row.month === point.month).map((row) => row.libraries || 0)) }))}><CartesianGrid stroke="#e8ece9" vertical={false} /><XAxis dataKey="month" tickFormatter={(value) => prettyDate(value).split(' ')[0]} tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip labelFormatter={prettyDate} /><Bar dataKey="libraries" fill="#163e31" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </article>
        </section>

        <footer><span><i /> Data source: {data.source}</span><span>Updated {new Date(data.generatedAt).toLocaleString()}</span></footer>
      </main>
    </div>
  )
}

function EmptyState() { return <div className="empty"><AlertTriangle size={20} /><b>No matching data</b><span>Try widening the filters.</span></div> }

export default App
