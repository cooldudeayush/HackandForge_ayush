import { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import Topbar, { Page } from '../components/Topbar.jsx'
import { Badge, EmptyState, Tabs } from '../components/UI.jsx'
import { clearState } from '../utils/storage.js'

export default function Admin() {
  const { state, setScreen, lockAdmin } = useApp()
  const [tab, setTab] = useState('roles')

  const stats = [
    { label: 'Active Roles', value: state.roles.length },
    { label: 'Stored Sessions', value: state.sessions.length },
    { label: 'Interview Mode', value: 'AI Led' }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Topbar
        title="Admin"
        subtitle="Workspace Control"
        actions={
          <button className="btn btn-sm btn-ghost" onClick={() => {
            lockAdmin()
            setScreen('login')
          }}>Exit</button>
        }
      />

      <Page maxWidth={1180}>
        <div className="screen-hero screen-hero-admin">
          <div className="screen-hero-copy">
            <div className="screen-eyebrow">Configuration Hub</div>
            <h1 className="screen-title">Define roles and scoring for the conversational interview flow.</h1>
            <p className="screen-subtitle">
              The interview now runs as an AI-led conversation driven by role context, job descriptions, and uploaded resumes.
            </p>
          </div>

          <div className="screen-stat-grid">
            {stats.map((item) => (
              <div key={item.label} className="screen-stat-card">
                <div className="screen-stat-value">{item.value}</div>
                <div className="screen-stat-label">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="app-section-card">
          <Tabs
            tabs={[
              { id: 'roles', label: 'Job Roles' },
              { id: 'benchmarks', label: 'Benchmarks' },
              { id: 'settings', label: 'Settings' }
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'roles' && <RolesTab />}
          {tab === 'benchmarks' && <BenchmarksTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </Page>
    </div>
  )
}

function RolesTab() {
  const { state, update } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', department: '', jd: '', areas: '' })

  const save = () => {
    if (!form.title || !form.jd) return alert('Title and job description are required')

    update((s) => ({
      ...s,
      roles: [
        ...s.roles,
        {
          id: `r${Date.now()}`,
          title: form.title,
          department: form.department || 'General',
          jd: form.jd,
          areas: form.areas,
          benchmark: { relevance: 72, depth: 72, clarity: 72, correctness: 72 },
          color: '#4F6EF7'
        }
      ]
    }))

    setForm({ title: '', department: '', jd: '', areas: '' })
    setShowForm(false)
  }

  const del = (id) => {
    if (!confirm('Delete this role? This will not delete existing sessions.')) return
    update((s) => ({ ...s, roles: s.roles.filter((role) => role.id !== id) }))
  }

  return (
    <div>
      <div className="section-heading-row">
        <div>
          <h3>Job Roles</h3>
          <p className="section-note">Create clear role definitions with strong job descriptions so the interviewer can ask better questions.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>+ Add Role</button>
      </div>

      {showForm && (
        <div className="card animate-slide section-highlight-card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 16 }}>New Role</h3>
          <div className="grid-2">
            <div className="form-group">
              <label>Role Title</label>
              <input placeholder="e.g. Senior Data Scientist" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Department</label>
              <input placeholder="e.g. Engineering" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
          </div>

          <div className="form-group">
            <label>Job Description</label>
            <textarea rows={4} placeholder="Describe responsibilities, success criteria, technical expectations, and collaboration context..." value={form.jd} onChange={(e) => setForm((f) => ({ ...f, jd: e.target.value }))} />
          </div>

          <div className="form-group">
            <label>Expertise Areas (comma-separated)</label>
            <input placeholder="Python, Machine Learning, SQL" value={form.areas} onChange={(e) => setForm((f) => ({ ...f, areas: e.target.value }))} />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save}>Save Role</button>
          </div>
        </div>
      )}

      {!state.roles.length ? (
        <EmptyState icon="Role" text="No roles yet. Add one above." />
      ) : (
        <div className="section-stack">
          {state.roles.map((role) => (
            <div key={role.id} className="card card-sm animate-fade role-card-upgraded">
              <div className="role-card-header">
                <div>
                  <div className="role-card-title-row">
                    <div className="role-card-title">{role.title}</div>
                    <Badge color="blue">{role.department}</Badge>
                  </div>
                  <div className="role-card-desc">{role.jd}</div>
                  <div className="role-card-tags">
                    {(role.areas || '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => (
                      <span key={item} className="soft-tag">{item}</span>
                    ))}
                  </div>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => del(role.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BenchmarksTab() {
  const { state, update } = useApp()

  const updateBM = (roleId, dim, val) => {
    update((s) => ({
      ...s,
      roles: s.roles.map((role) =>
        role.id === roleId ? { ...role, benchmark: { ...role.benchmark, [dim]: parseInt(val) } } : role
      )
    }))
  }

  return (
    <div>
      <div className="section-heading-row" style={{ marginBottom: 18 }}>
        <div>
          <h3>Benchmark Profiles</h3>
          <p className="section-note">Define the expected bar for each role so the final report stays grounded and consistent.</p>
        </div>
      </div>

      {!state.roles.length ? (
        <EmptyState icon="Bars" text="No roles defined yet. Create roles first." />
      ) : (
        <div className="section-stack">
          {state.roles.map((role) => {
            const benchmark = role.benchmark || { relevance: 70, depth: 70, clarity: 70, correctness: 70 }
            return (
              <div key={role.id} className="card benchmark-card-upgraded">
                <div className="benchmark-header">
                  <div>
                    <div className="benchmark-title">{role.title}</div>
                    <div className="benchmark-subtitle">{role.department}</div>
                  </div>
                  <Badge color="purple">Benchmark</Badge>
                </div>

                <div className="grid-2" style={{ gap: 20 }}>
                  {['relevance', 'depth', 'clarity', 'correctness'].map((dim) => (
                    <div key={dim} className="benchmark-slider-card">
                      <div className="benchmark-slider-header">
                        <label style={{ margin: 0, textTransform: 'capitalize', fontSize: 13, color: 'var(--c-ink)', fontWeight: 600 }}>
                          {dim}
                        </label>
                        <span className="benchmark-slider-value">{benchmark[dim]}%</span>
                      </div>
                      <input type="range" min={0} max={100} step={5} value={benchmark[dim]} onChange={(e) => updateBM(role.id, dim, e.target.value)} style={{ width: '100%' }} />
                      <div className="benchmark-slider-labels">
                        <span>Minimum bar</span>
                        <span>High bar</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SettingsTab() {
  const { state, update } = useApp()
  const settings = state.settings

  const set = (key, value) => update((prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }))
  const setSectionCount = (section, value) => update((prev) => ({
    ...prev,
    settings: {
      ...prev.settings,
      sectionQuestionCounts: {
        ...(prev.settings.sectionQuestionCounts || {}),
        [section]: Math.max(0, parseInt(value) || 0)
      }
    }
  }))

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'recruitai_export.json'
    a.click()
  }

  const reset = () => {
    if (!confirm('This will delete all local data including sessions. Are you sure?')) return
    clearState()
    window.location.reload()
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="section-stack">
        <div className="card section-highlight-card">
          <h3 style={{ marginBottom: 16 }}>Session Defaults</h3>
          <div className="grid-2">
            <div className="form-group">
              <label>Default Difficulty</label>
              <select value={settings.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="form-group">
              <label>Reference Question Count</label>
              <select value={settings.qcount} onChange={(e) => set('qcount', parseInt(e.target.value))}>
                <option value={2}>2 turns</option>
                <option value={3}>3 turns</option>
                <option value={4}>4 turns</option>
                <option value={5}>5 turns</option>
                <option value={6}>6 turns</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Hire Recommendation Threshold (%)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <input type="range" min={0} max={100} step={5} value={settings.threshold} onChange={(e) => set('threshold', parseInt(e.target.value))} style={{ flex: 1 }} />
              <span className="benchmark-slider-value">{settings.threshold}%</span>
            </div>
            <div className="section-note" style={{ marginTop: 8 }}>
              Candidates scoring above this threshold receive a "Recommend: Hire" verdict in the final report.
            </div>
          </div>
        </div>

        <div className="card section-highlight-card">
          <h3 style={{ marginBottom: 16 }}>Section Question Limits</h3>
          <div className="section-note" style={{ marginBottom: 14 }}>
            Control how many scored questions the interviewer should ask in each section before moving forward.
          </div>
          <div className="grid-2">
            {[
              ['introduction', 'Introduction'],
              ['role_overview', 'Role Overview'],
              ['behavioral', 'Behavioral'],
              ['technical', 'Technical'],
              ['candidate_questions', 'Candidate Questions'],
              ['closing', 'Closing']
            ].map(([key, label]) => (
              <div key={key} className="form-group">
                <label>{label}</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={settings.sectionQuestionCounts?.[key] ?? 0}
                  onChange={(e) => setSectionCount(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Data Management</h3>
          <div className="section-note" style={{ marginBottom: 14 }}>
            {state.sessions.length} session{state.sessions.length !== 1 ? 's' : ''} stored locally and {state.roles.length} roles defined.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={exportData}>Export JSON</button>
            <button className="btn btn-sm btn-danger" onClick={reset}>Reset All Data</button>
          </div>
        </div>
      </div>
    </div>
  )
}
