import { useApp } from '../AppContext.jsx'
import Topbar, { Page } from '../components/Topbar.jsx'
import RadarChart from '../components/RadarChart.jsx'
import { ScoreBar, Badge, StageBadge, StatCard, Divider } from '../components/UI.jsx'
import { exportReportPDF } from '../utils/pdf.js'

const DIM_KEYS = ['relevance', 'depth', 'clarity', 'correctness']

export default function Report() {
  const { viewingReport: s, setScreen } = useApp()
  if (!s) return null

  const hire = s.overallScore >= (s.threshold || 65)
  const dims = s.dimensions || {}
  const bm = s.benchmark || {}
  const duration = s.duration ? `${Math.floor(s.duration / 60)}m ${s.duration % 60}s` : '-'
  const memory = s.interviewMemory || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Topbar
        title="Session Report"
        subtitle={s.candidateName}
        actions={(
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={() => exportReportPDF(s)}>PDF Report</button>
            <button className="btn btn-sm btn-primary" onClick={() => setScreen('login')}>Home</button>
          </div>
        )}
      />

      <Page maxWidth={1180}>
        <div className={`report-hero ${hire ? 'hire' : 'nohire'}`}>
          <div className="report-hero-main">
            <div className="screen-eyebrow">{hire ? 'Strong Recommendation' : 'Needs Review'}</div>
            <h1 className="screen-title" style={{ marginBottom: 10 }}>{s.candidateName}</h1>
            <div className="report-meta-line">{s.role} · {s.candidateEmail} · {new Date(s.date).toLocaleDateString()} · {duration}</div>
            <p className="screen-subtitle" style={{ maxWidth: 640, margin: '10px 0 0' }}>
              A structured view of interview performance across dimensions, stages, and benchmark alignment.
            </p>
          </div>

          <div className={`report-verdict-card ${hire ? 'hire' : 'nohire'}`}>
            <div className="report-verdict-label">{hire ? 'Recommended: Hire' : 'Recommended: No Hire'}</div>
            <div className="report-verdict-score">{Math.round(s.overallScore)}%</div>
            <div className="report-verdict-threshold">Threshold {s.threshold}%</div>
          </div>
        </div>

        <div className="report-kpi-grid">
          <div className="screen-stat-card">
            <div className="screen-stat-value">{Object.keys(s.stageScores || {}).length || 0}</div>
            <div className="screen-stat-label">Stages Completed</div>
          </div>
          <div className="screen-stat-card">
            <div className="screen-stat-value">{(s.qaLog || []).length}</div>
            <div className="screen-stat-label">Questions Answered</div>
          </div>
          <div className="screen-stat-card">
            <div className="screen-stat-value">{duration}</div>
            <div className="screen-stat-label">Session Duration</div>
          </div>
        </div>

        {s.summary && (
          <div className="card report-summary-card">
            <div className="section-heading-row" style={{ marginBottom: 12 }}>
              <div>
                <h3>Executive Summary</h3>
                <p className="section-note">Condensed evaluation narrative based on the full interview transcript.</p>
              </div>
            </div>

            <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--c-ink-3)' }}>{s.summary.executiveSummary}</p>
            <Divider />

            <div className="grid-3">
              {[
                { label: 'Technical', val: s.summary.technicalStrength },
                { label: 'Communication', val: s.summary.communicationStrength },
                { label: 'Growth Areas', val: s.summary.areasForGrowth }
              ].map(({ label, val }) => (
                <div key={label} className="report-detail-card">
                  <div className="report-detail-label">{label}</div>
                  <div className="report-detail-value">{val || '-'}</div>
                </div>
              ))}
            </div>

            {s.summary.hiringSuggestion && (
              <>
                <Divider />
                <div className={`report-suggestion ${hire ? 'hire' : 'nohire'}`}>
                  {s.summary.hiringSuggestion}
                </div>
              </>
            )}
          </div>
        )}

        {(memory.education?.length || memory.projectsMentioned?.length || memory.toolsClaimed?.length || memory.ownershipEvidence?.length || memory.impactMetrics?.length) && (
          <div className="card report-summary-card" style={{ marginBottom: 18 }}>
            <div className="section-heading-row" style={{ marginBottom: 12 }}>
              <div>
                <h3>Structured Candidate Snapshot</h3>
                <p className="section-note">Compact facts captured during the interview to help with grounded review.</p>
              </div>
            </div>

            <div className="grid-3">
              {[
                { label: 'Education', val: memory.education?.join(' | ') },
                { label: 'Projects Mentioned', val: memory.projectsMentioned?.join(' | ') },
                { label: 'Tools Claimed', val: memory.toolsClaimed?.join(', ') },
                { label: 'Ownership Evidence', val: memory.ownershipEvidence?.join(' | ') },
                { label: 'Impact Metrics', val: memory.impactMetrics?.join(' | ') }
              ]
                .filter((item) => item.val)
                .map(({ label, val }) => (
                  <div key={label} className="report-detail-card">
                    <div className="report-detail-label">{label}</div>
                    <div className="report-detail-value">{val}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="grid-2" style={{ marginBottom: 18 }}>
          <div className="card report-chart-card">
            <div className="section-heading-row" style={{ marginBottom: 12 }}>
              <div>
                <h3>Skill Radar</h3>
                <p className="section-note">Candidate profile against the role benchmark.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--c-ink-3)', marginBottom: 14 }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#4F6EF7', marginRight: 5, verticalAlign: 'middle' }} />Candidate</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'rgba(79,110,247,.2)', border: '1.5px dashed #4F6EF7', marginRight: 5, verticalAlign: 'middle' }} />Benchmark</span>
            </div>
            <RadarChart candidate={dims} benchmark={bm} size={240} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.keys(s.stageScores || {}).length > 0 && (
              <div className="card">
                <div className="section-heading-row" style={{ marginBottom: 12 }}>
                  <div>
                    <h3>Score by Stage</h3>
                    <p className="section-note">Performance snapshot across the structured interview journey.</p>
                  </div>
                </div>
                <div className="grid-3" style={{ gap: 8 }}>
                  {Object.entries(s.stageScores).map(([stage, score]) => (
                    <StatCard
                      key={stage}
                      label={stage.charAt(0).toUpperCase() + stage.slice(1)}
                      value={`${score}%`}
                      color={score >= 70 ? 'var(--c-green-text)' : score >= 50 ? 'var(--c-amber-text)' : 'var(--c-red-text)'}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <div className="section-heading-row" style={{ marginBottom: 12 }}>
                <div>
                  <h3>Dimension Breakdown</h3>
                  <p className="section-note">Overall performance by evaluation dimension.</p>
                </div>
              </div>
              {DIM_KEYS.map((dim) => (
                <ScoreBar key={dim} label={dim.charAt(0).toUpperCase() + dim.slice(1)} value={dims[dim] || 0} />
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-heading-row" style={{ marginBottom: 14 }}>
            <div>
              <h3>Benchmark Comparison</h3>
              <p className="section-note">
                Expected minimum performance for <strong>{s.role}</strong>, with visual comparison against the role benchmark.
              </p>
            </div>
          </div>

          {s.summary?.benchmarkAnalysis && (
            <div className="report-analysis-card">
              {s.summary.benchmarkAnalysis}
            </div>
          )}

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th style={{ textAlign: 'center' }}>Candidate</th>
                  <th style={{ textAlign: 'center' }}>Benchmark</th>
                  <th style={{ textAlign: 'center' }}>Gap</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ minWidth: 160 }}>Visual</th>
                </tr>
              </thead>
              <tbody>
                {DIM_KEYS.map((dim) => {
                  const cVal = dims[dim] || 0
                  const bVal = bm[dim] || 70
                  const gap = cVal - bVal
                  const meets = cVal >= bVal
                  return (
                    <tr key={dim}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{dim.charAt(0).toUpperCase() + dim.slice(1)}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{cVal}%</td>
                      <td style={{ textAlign: 'center', color: 'var(--c-ink-3)', fontFamily: 'var(--font-mono)' }}>{bVal}%</td>
                      <td
                        style={{
                          textAlign: 'center',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: gap >= 0 ? 'var(--c-green-text)' : 'var(--c-red-text)'
                        }}
                      >
                        {gap >= 0 ? `+${gap}` : gap}%
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Badge color={meets ? 'green' : 'red'}>{meets ? 'Meets' : 'Below'}</Badge>
                      </td>
                      <td><GapBar cVal={cVal} bVal={bVal} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="section-heading-row" style={{ marginBottom: 14 }}>
            <div>
              <h3>Per-Question Evaluation</h3>
              <p className="section-note">Detailed scoring and feedback for each answer in the session.</p>
            </div>
          </div>

          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th style={{ width: 100 }}>Stage</th>
                  <th style={{ minWidth: 220 }}>Question</th>
                  <th style={{ minWidth: 180 }}>Candidate Response</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Score</th>
                  <th style={{ width: 60, textAlign: 'center' }}>Rel</th>
                  <th style={{ width: 60, textAlign: 'center' }}>Dep</th>
                  <th style={{ width: 60, textAlign: 'center' }}>Cla</th>
                  <th style={{ width: 60, textAlign: 'center' }}>Cor</th>
                  <th style={{ minWidth: 200 }}>AI Feedback</th>
                </tr>
              </thead>
              <tbody>
                {(s.qaLog || []).map((q, i) => {
                  const avg = Math.round(((q.relevance + q.depth + q.clarity + q.correctness) / 4) * 10)
                  const col = avg >= 70 ? 'var(--c-green-text)' : avg >= 50 ? 'var(--c-amber-text)' : 'var(--c-red-text)'

                  return (
                    <tr key={i}>
                      <td style={{ color: 'var(--c-ink-3)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                      <td><StageBadge stage={q.stage} /></td>
                      <td style={{ fontSize: 13, lineHeight: 1.5 }}>{q.question}</td>
                      <td style={{ fontSize: 12, color: 'var(--c-ink-3)', lineHeight: 1.5 }}>
                        {(q.answer || '').substring(0, 120)}
                        {(q.answer || '').length > 120 ? '...' : ''}
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: col }}>{avg}%</td>
                      {['relevance', 'depth', 'clarity', 'correctness'].map((d) => (
                        <td
                          key={d}
                          style={{
                            textAlign: 'center',
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 500,
                            color: Math.round((q[d] || 0) * 10) >= 70
                              ? 'var(--c-green-text)'
                              : Math.round((q[d] || 0) * 10) >= 50
                                ? 'var(--c-amber-text)'
                                : 'var(--c-red-text)'
                          }}
                        >
                          {Math.round((q[d] || 0) * 10)}
                        </td>
                      ))}
                      <td style={{ fontSize: 12, color: 'var(--c-ink-3)', lineHeight: 1.5 }}>{q.feedback || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Page>
    </div>
  )
}

function GapBar({ cVal, bVal }) {
  return (
    <div style={{ position: 'relative', height: 8, background: 'var(--c-bg-3)', borderRadius: 99, overflow: 'visible' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${bVal}%`,
          background: 'rgba(79,110,247,.15)',
          borderRadius: 99
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${cVal}%`,
          background: cVal >= bVal ? '#4F6EF7' : '#EF4444',
          borderRadius: 99,
          transition: 'width 1s ease'
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -3,
          left: `${bVal}%`,
          width: 2,
          height: 14,
          background: '#AFA9EC',
          borderRadius: 1,
          transform: 'translateX(-50%)'
        }}
      />
    </div>
  )
}
