import { BookOpen, ChevronDown } from 'lucide-react'

export default function PageGuide({ items = [] }) {
  return <details className="page-guide" open>
    <summary><span><BookOpen size={16} /><b>How to read this page</b><small>Plain-language guide</small></span><ChevronDown size={16} /></summary>
    <div className="page-guide-items">{items.map((item, index) => <section key={item.title}>
      <i>{index + 1}</i>
      <div><b>{item.title}</b><p>{item.text}</p></div>
    </section>)}</div>
  </details>
}
