import { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import Topbar, { Page } from '../components/Topbar.jsx'
import { Badge, EmptyState, Tabs } from '../components/UI.jsx'
import { createRagInterviewSession } from '../utils/ai.js'
import { extractTextFromFile, parseResumeFile } from '../utils/resume.js'

export default function Interviewer() {
  const [tab, setTab] = useState('launch')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Topbar title="Interviewer" actions={<button className="btn btn-sm btn-ghost" onClick={() => document.querySelector('[data-back]')?.click()}>Exit</button>} />
      <Page>
        <Tabs tabs={[{ id: 'launch', label: 'Launch Session' }, { id: 'reports', label: 'All Reports' }]} active={tab} onChange={setTab} />
        {tab === 'launch' && <LaunchTab />}
        {tab === 'reports' && <ReportsTab />}
      </Page>
    </div>
  )
}

function LaunchTab() {
  const { state, setScreen, setCurrentSession } = useApp()
  const [form, setForm] = useState({
    name: '',
    email: '',
    roleId: '',
    difficulty: 'medium',
    durationMinutes: 10,
    notes: '',
    voiceMode: true,
    resumeFileName: '',
    resumeText: '',
    resumeProfile: null,
    jdFileName: '',
    jdText: ''
  })
  const [resumeStatus, setResumeStatus] = useState('')
  const [resumeError, setResumeError] = useState('')
  const [jdStatus, setJdStatus] = useState('')
  const [jdError, setJdError] = useState('')
  const [launching, setLaunching] = useState(false)

  const handleResumeUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setResumeError('')
    setResumeStatus(`Parsing ${file.name}...`)

    try {
      const parsed = await parseResumeFile(file)
      setForm((current) => ({
        ...current,
        resumeFileName: parsed.fileName,
        resumeText: parsed.text,
        resumeProfile: parsed.profile
      }))
      setResumeStatus(`Parsed ${parsed.fileName}`)
    } catch (error) {
      setResumeStatus('')
      setResumeError(error.message || 'Could not parse the uploaded resume.')
    }
  }

  const handleJobDescriptionUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setJdError('')
    setJdStatus(`Parsing ${file.name}...`)

    try {
      const text = await extractTextFromFile(file)
      setForm((current) => ({
        ...current,
        jdFileName: file.name,
        jdText: text
      }))
      setJdStatus(`Parsed ${file.name}`)
    } catch (error) {
      setJdStatus('')
      setJdError(error.message || 'Could not parse the uploaded job description.')
    }
  }

  const launch = async () => {
    if (!form.name || !form.roleId) return alert('Candidate name and role are required')
    if (!form.resumeText) return alert('Resume upload is required before launching the interview')
    const role = state.roles.find((r) => r.id === form.roleId)
    setLaunching(true)
    try {
      const ragSessionId = await createRagInterviewSession({
        candidateName: form.name,
        role,
        resumeText: form.resumeText,
        resumeFileName: form.resumeFileName,
        resumeProfile: form.resumeProfile,
        jobDescriptionText: form.jdText,
        jobDescriptionFileName: form.jdFileName
      })
      setCurrentSession({ ...form, role, ragSessionId, sessionSource: 'interviewer' })
      setScreen('interview')
    } catch (error) {
      alert(error.message || 'Unable to prepare interview context. Please make sure the RAG server and Ollama are running.')
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Configure Interview Session</h3>
        <div className="grid-2">
          <div className="form-group"><label>Candidate Name *</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" /></div>
          <div className="form-group"><label>Candidate Email</label><input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" /></div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label>Job Role *</label>
            <select value={form.roleId} onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}>
              <option value="">Select role...</option>
              {state.roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Difficulty Level</label>
            <select value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Interview Duration</label>
          <select value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: parseInt(e.target.value) }))}>
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
          </select>
        </div>

        <div className="grid-2">
          <div className="form-group"><label>Resume Upload *</label><input type="file" accept=".pdf,.txt,.md,.json" onChange={handleResumeUpload} /></div>
          <div className="form-group"><label>Interviewer Notes (optional)</label><textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Areas to focus on, candidate background..." /></div>
        </div>

        <div className="form-group">
          <label>Job Description Upload</label>
          <input type="file" accept=".pdf,.txt,.md,.json" onChange={handleJobDescriptionUpload} />
        </div>

        {(resumeStatus || resumeError || form.resumeFileName) && (
          <div className={`upload-status-card ${resumeError ? 'error' : ''}`} style={{ marginBottom: 16 }}>
            <div className="upload-status-title">{resumeError ? 'Resume upload issue' : 'Resume ready for RAG'}</div>
            <div className="upload-status-copy">{resumeError || resumeStatus || form.resumeFileName}</div>
          </div>
        )}

        {(jdStatus || jdError || form.jdFileName) && (
          <div className={`upload-status-card ${jdError ? 'error' : ''}`} style={{ marginBottom: 16 }}>
            <div className="upload-status-title">{jdError ? 'Job description upload issue' : 'Job description ready'}</div>
            <div className="upload-status-copy">{jdError || jdStatus || form.jdFileName}</div>
          </div>
        )}

        <div className="form-group">
          <label>Interview Mode</label>
          <div className="mode-toggle-card">
            <div>
              <div className="mode-toggle-title">Voice mode</div>
              <div className="mode-toggle-copy">
                Read questions aloud and let the candidate answer by microphone in supported browsers.
              </div>
            </div>
            <button
              type="button"
              className={`mode-toggle ${form.voiceMode ? 'active' : ''}`}
              onClick={() => setForm((f) => ({ ...f, voiceMode: !f.voiceMode }))}
              aria-pressed={form.voiceMode}
            >
              <span className="mode-toggle-knob" />
              <span>{form.voiceMode ? 'On' : 'Off'}</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={launch} disabled={launching}>{launching ? 'Preparing Interview...' : 'Launch Session'}</button>
        </div>
      </div>
    </div>
  )
}

function ReportsTab() {
  const { state, setViewingReport, setScreen } = useApp()
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')

  const filtered = state.sessions.filter((s) =>
    (!search || s.candidateName.toLowerCase().includes(search.toLowerCase())) &&
    (!filterRole || s.roleId === filterRole)
  ).slice().reverse()

  const open = (sess) => { setViewingReport(sess); setScreen('report') }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by candidate name..." style={{ width: 220 }} />
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={{ width: 200 }}>
          <option value="">All roles</option>
          {state.roles.map((r) => <option key={r.id} value={r.id}>{r.title.split('(')[0].trim()}</option>)}
        </select>
        <div style={{ fontSize: 13, color: 'var(--c-ink-3)', alignSelf: 'center', marginLeft: 'auto' }}>
          {filtered.length} session{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {!filtered.length ? <EmptyState icon="Report" text={state.sessions.length ? 'No sessions match your filter.' : 'No completed sessions yet.'} /> :
        filtered.map((sess) => {
          const hire = sess.overallScore >= (sess.threshold || 65)
          return (
            <div
              key={sess.id}
              className="card card-sm animate-fade"
              style={{ marginBottom: 10, cursor: 'pointer', transition: 'box-shadow .15s' }}
              onClick={() => open(sess)}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{sess.candidateName}</div>
                  <div style={{ fontSize: 12, color: 'var(--c-ink-3)', marginTop: 2 }}>
                    {sess.role} | {sess.difficulty} | {new Date(sess.date).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: hire ? 'var(--c-green-text)' : 'var(--c-red-text)' }}>
                    {Math.round(sess.overallScore)}%
                  </div>
                  <Badge color={hire ? 'green' : 'red'}>{hire ? 'Hire' : 'No Hire'}</Badge>
                </div>
              </div>
            </div>
          )
        })
      }
    </div>
  )
}
