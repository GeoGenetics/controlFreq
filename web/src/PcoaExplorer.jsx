import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, FlaskConical, Network } from 'lucide-react'
import {
  CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import PageGuide from './PageGuide.jsx'

const CONTROL_COLORS = {
  'Extraction Negative': '#20a97b',
  'Library Negative': '#7b72df',
}
const fallbackColors = ['#20a97b', '#7b72df', '#e6a23c', '#4b91c5']

function FilterSelect({ label, value, options, onChange }) {
  return <label className="filter-field"><span>{label}</span><div className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="All">All {label.toLowerCase()}</option>{options.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div></label>
}

function multiply(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0))
}

function normalize(vector) {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => value / length)
}

function leadingEigenvector(matrix, previous = []) {
  const size = matrix.length
  const shift = Math.max(...matrix.map((row) => row.reduce((sum, value) => sum + Math.abs(value), 0)))
  let vector = normalize(Array.from({ length: size }, (_, index) => Math.sin((index + 1) * 1.618) + .3))
  for (let iteration = 0; iteration < 140; iteration += 1) {
    let next = multiply(matrix, vector).map((value, index) => value + shift * vector[index])
    for (const basis of previous) {
      const projection = next.reduce((sum, value, index) => sum + value * basis[index], 0)
      next = next.map((value, index) => value - projection * basis[index])
    }
    next = normalize(next)
    const stable = Math.abs(next.reduce((sum, value, index) => sum + value * vector[index], 0))
    vector = next
    if (1 - stable < 1e-10) break
  }
  const transformed = multiply(matrix, vector)
  const value = vector.reduce((sum, item, index) => sum + item * transformed[index], 0)
  return { vector, value }
}

function calculatePcoa(rows, minimumReads) {
  const libraryMap = new Map()
  const taxa = new Set()
  for (const row of rows) {
    taxa.add(row.name)
    const item = libraryMap.get(row.libraryId) || {
      libraryId: row.libraryId, month: row.month, controlType: row.controlType,
      reads: 0, profile: new Map(), pipelines: new Set(),
    }
    item.reads += row.reads
    item.profile.set(row.name, (item.profile.get(row.name) || 0) + row.reads)
    item.pipelines.add(row.pipeline)
    libraryMap.set(row.libraryId, item)
  }
  const libraries = [...libraryMap.values()].filter((item) => item.reads >= minimumReads)
  if (libraries.length < 3 || taxa.size < 2) return { points: [], variance: [0, 0], taxa: taxa.size }

  const names = [...taxa]
  const profiles = libraries.map((library) => names.map((name) => (library.profile.get(name) || 0) / library.reads))
  const size = libraries.length
  const squared = Array.from({ length: size }, () => Array(size).fill(0))
  for (let i = 0; i < size; i += 1) {
    for (let j = i + 1; j < size; j += 1) {
      let distance = 0
      for (let k = 0; k < names.length; k += 1) distance += Math.abs(profiles[i][k] - profiles[j][k])
      distance *= .5
      squared[i][j] = distance * distance
      squared[j][i] = squared[i][j]
    }
  }

  const rowMeans = squared.map((row) => row.reduce((sum, value) => sum + value, 0) / size)
  const grandMean = rowMeans.reduce((sum, value) => sum + value, 0) / size
  const centered = squared.map((row, i) => row.map((value, j) => -.5 * (value - rowMeans[i] - rowMeans[j] + grandMean)))
  const first = leadingEigenvector(centered)
  const second = leadingEigenvector(centered, [first.vector])
  const trace = centered.reduce((sum, row, index) => sum + Math.max(0, row[index]), 0) || 1
  const scaleOne = Math.sqrt(Math.max(0, first.value))
  const scaleTwo = Math.sqrt(Math.max(0, second.value))

  return {
    taxa: names.length,
    variance: [Math.max(0, first.value) / trace * 100, Math.max(0, second.value) / trace * 100],
    points: libraries.map((library, index) => ({
      ...library,
      pipeline: [...library.pipelines].sort().join(' + '),
      x: first.vector[index] * scaleOne,
      y: second.vector[index] * scaleTwo,
    })),
  }
}

function PcoaTooltip({ active, payload }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return <div className="pcoa-tooltip"><b>{point.libraryId}</b><span>{point.controlType} · {point.month}</span><span>{point.pipeline}</span><strong>{point.reads.toLocaleString()} reads</strong>{point.warning && <em><AlertTriangle size={11} />Flagged library</em>}</div>
}

export default function PcoaExplorer({ rankFilter, records = [], rank = 'genus', warnings = [], minReads, onMinReadsChange, onOpenLibrary }) {
  const [pipeline, setPipeline] = useState('All')
  const [kingdom, setKingdom] = useState('All')
  const [controlType, setControlType] = useState('All')
  const [minimumLibraryReads, setMinimumLibraryReads] = useState('0')
  const [minimumA, setMinimumA] = useState("")

  const dimensions = useMemo(() => ({
    pipelines: [...new Set(records.map((row) => row.pipeline))].sort(),
    kingdoms: [...new Set(records.map((row) => row.kingdom))].sort(),
    controlTypes: [...new Set(records.map((row) => row.controlType))].sort(),
  }), [records])
  const warningIds = useMemo(() => new Set(warnings.map((row) => row.libraryId)), [warnings])
  const rows = useMemo(() => records.filter((row) =>
    (pipeline === 'All' || row.pipeline === pipeline) &&
    (kingdom === 'All' || row.kingdom === kingdom) &&
    (controlType === 'All' || row.controlType === controlType) &&
    row.reads >= (Number(minReads) || 0) &&
    (minimumA === "" || (row.meanA !== null && row.meanA >= Number(minimumA)))
  ), [records, pipeline, kingdom, controlType, minReads, minimumA])
  const result = useMemo(() => calculatePcoa(rows, Number(minimumLibraryReads) || 0), [rows, minimumLibraryReads])
  const points = result.points.map((point) => ({ ...point, warning: warningIds.has(point.libraryId) }))
  const controlTypes = [...new Set(points.map((point) => point.controlType))]
  const colorFor = (value) => CONTROL_COLORS[value] || fallbackColors[Math.max(0, controlTypes.indexOf(value)) % fallbackColors.length]

  return <section className="pcoa-page">
    <div className="explorer-hero">
      <div><span className="kicker">LIBRARY SIMILARITY</span><h1>PCoA ordination</h1><p>Bray–Curtis distances calculated from relative {rank} abundance.</p></div>
      <div className="pcoa-key">{controlTypes.map((item) => <span key={item}><i style={{ background: colorFor(item) }} />{item}</span>)}<span><i className="warning-ring" />Warning</span></div>
    </div>

    <PageGuide items={[
      { title: 'Each dot is a library', text: 'Dots that sit close together have more similar relative taxon profiles. Dots far apart have more different profiles.' },
      { title: 'Axes summarize differences', text: 'PCoA 1 and PCoA 2 are calculated directions, not measured variables. The percentages show how much of the between-library variation each direction captures.' },
      { title: 'Use it to find clusters and outliers', text: 'Colours identify control types and red outlines mark warnings. Click a dot to inspect that library, and use filters to test whether the pattern remains.' },
    ]} />

    <div className="panel explorer-filters pcoa-filters">
      {rankFilter}
      <FilterSelect label="Pipeline" value={pipeline} options={dimensions.pipelines} onChange={setPipeline} />
      <FilterSelect label="Biological group" value={kingdom} options={dimensions.kingdoms} onChange={setKingdom} />
      <FilterSelect label="Control type" value={controlType} options={dimensions.controlTypes} onChange={setControlType} />
      <label className="filter-field"><span>Minimum nreads</span><input type="number" min="0" step="50" value={minReads} onChange={(event) => onMinReadsChange(event.target.value)} /></label>
      <label className="filter-field"><span>Minimum library total</span><input type="number" min="0" step="100" value={minimumLibraryReads} onChange={(event) => setMinimumLibraryReads(event.target.value)} /></label>
      <label className="filter-field"><span>Minimum 5′ C→T</span><input type="number" min="0" step="0.01" placeholder="No minimum" value={minimumA} onChange={(event) => setMinimumA(event.target.value)} /></label>
    </div>

    <article className="panel pcoa-panel">
      <div className="panel-head"><div><span className="kicker">ORDINATION</span><h2>{points.length} library profiles</h2><p>{result.taxa} taxa · closer points have more similar contamination profiles</p></div><span className="pcoa-help"><Network size={15} />Select a point to open its taxonomy</span></div>
      {points.length >= 3 ? <div className="pcoa-chart"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 24, right: 30, bottom: 18, left: 8 }}>
        <CartesianGrid stroke="#e8ece9" />
        <XAxis type="number" dataKey="x" name="PCoA 1" tickLine={false} axisLine={false} tickFormatter={(value) => value.toFixed(2)} label={{ value: `PCoA 1 (${result.variance[0].toFixed(1)}%)`, position: 'bottom', offset: 2 }} />
        <YAxis type="number" dataKey="y" name="PCoA 2" tickLine={false} axisLine={false} tickFormatter={(value) => value.toFixed(2)} label={{ value: `PCoA 2 (${result.variance[1].toFixed(1)}%)`, angle: -90, position: 'insideLeft' }} />
        <ZAxis range={[70, 70]} />
        <Tooltip content={<PcoaTooltip />} cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={points} onClick={(point) => onOpenLibrary(point.payload?.libraryId || point.libraryId)}>
          {points.map((point) => <Cell key={point.libraryId} fill={colorFor(point.controlType)} stroke={point.warning ? '#d94f43' : '#fff'} strokeWidth={point.warning ? 3 : 1.5} />)}
        </Scatter>
      </ScatterChart></ResponsiveContainer></div>
        : <div className="explorer-empty"><FlaskConical size={23} /><h2>Not enough matching libraries</h2><p>PCoA needs at least three libraries and two taxa. Widen the filters.</p></div>}
    </article>
  </section>
}
