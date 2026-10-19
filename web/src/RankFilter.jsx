import { ChevronDown } from 'lucide-react'

export default function RankFilter({ rank, options, loading, onChange }) {
  return <label className="filter-field"><span>{loading ? 'Taxonomic rank · Loading…' : 'Taxonomic rank'}</span><div className="select-wrap"><select value={rank} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select><ChevronDown size={15} /></div></label>
}
