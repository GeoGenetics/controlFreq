import { Clock3, Database, GitCommit, History } from 'lucide-react'

const formatDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  })
}

export default function ChangeLog({ entries = [], data }) {
  return <div className="change-log-page">
    <header className="explorer-hero">
      <div><span className="kicker">PROJECT HISTORY</span><h1>Changelog</h1><p>Dated dashboard updates and data refreshes, newest first.</p></div>
      <div className="history-count"><History size={18} /><b>{entries.length}</b><span>commits in repository history</span></div>
    </header>

    <section className="panel data-history-card">
      <Database size={19} />
      <div><span>CURRENT DATASET</span><b>{data?.source || 'Unknown source'}</b><small><Clock3 size={13} />Generated {formatDate(data?.generatedAt)}</small></div>
    </section>

    <section className="panel change-history">
      <div className="panel-head"><div><span className="kicker">CODE HISTORY</span><h2>Repository commit history</h2><p>Commit date and time are shown in your local timezone.</p></div></div>
      <ol>{entries.map((entry) => <li key={entry.hash}>
        <i><GitCommit size={14} /></i>
        <div><b>{entry.title}</b><span><time dateTime={entry.date}>{formatDate(entry.date)}</time><code>{entry.hash}</code></span></div>
      </li>)}</ol>
      {!entries.length && <div className="analysis-empty">No version history was available in this build.</div>}
    </section>
  </div>
}
