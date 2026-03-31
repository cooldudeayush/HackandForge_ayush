import { useState } from 'react'
import { useApp } from '../AppContext.jsx'
import Topbar, { Page } from '../components/Topbar.jsx'
import { ProgressSteps } from '../components/UI.jsx'
import { createRagInterviewSession } from '../utils/ai.js'
import { extractTextFromFile, parseResumeFile } from '../utils/resume.js'

export default function CandidateSetup() {
  const { state, setScreen, setCurrentSession } = useApp()
  const [form, setForm] = useState({
    name: '',
    email: '',
    roleId: '',
    experience: '2-3',
    durationMinutes: 10,
    intro: '',
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
  const [starting, setStarting] = useState(false)

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

  const start = async () => {
    if (!form.name || !form.roleId) return alert('Please enter your name and select a role')
    if (!form.resumeText) return alert('Please upload your resume before starting the interview')
    const role = state.roles.find((r) => r.id === form.roleId)
    setStarting(true)
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
      setCurrentSession({ ...form, role, ragSessionId, difficulty: state.settings.difficulty, sessionSource: 'candidate' })
      setScreen('interview')
    } catch (error) {
      alert(error.message || 'Unable to prepare interview context. Please make sure the RAG server and Ollama are running.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Topbar actions={<button className="btn btn-sm btn-ghost" onClick={() => setScreen('login')}>Back</button>} />
      <Page>
        <div style={{ maxWidth: 640, margin: '20px auto' }}>
          <ProgressSteps steps={['Profile', 'Interview', 'Report']} current={0} />
          <div className="card">
            <h2 style={{ marginBottom: 4 }}>Your Profile</h2>
            <p style={{ color: 'var(--c-ink-3)', fontSize: 13, marginBottom: 20 }}>
              Fill in your details to begin a structured interview that can adapt to your uploaded resume.
            </p>

            <div className="grid-2">
              <div className="form-group"><label>Full Name *</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" /></div>
              <div className="form-group"><label>Email Address</label><input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@email.com" /></div>
            </div>

            <div className="form-group">
              <label>Position Applying For *</label>
              <select value={form.roleId} onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}>
                <option value="">Select a position...</option>
                {state.roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Years of Experience</label>
                <select value={form.experience} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))}>
                  <option value="0-1">0-1 years (Fresher / Junior)</option>
                  <option value="2-3">2-3 years</option>
                  <option value="4-6">4-6 years (Mid-level)</option>
                  <option value="7+">7+ years (Senior / Lead)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Resume Upload *</label>
                <input type="file" accept=".pdf,.txt,.md,.json" onChange={handleResumeUpload} />
              </div>
            </div>

            <div className="form-group">
              <label>Job Description Upload</label>
              <input type="file" accept=".pdf,.txt,.md,.json" onChange={handleJobDescriptionUpload} />
            </div>

            <div className="form-group">
              <label>Interview Duration</label>
              <select value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: parseInt(e.target.value) }))}>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
              </select>
            </div>

            {(resumeStatus || resumeError || form.resumeFileName) && (
              <div className={`upload-status-card ${resumeError ? 'error' : ''}`} style={{ marginBottom: 16 }}>
                <div className="upload-status-title">{resumeError ? 'Resume upload issue' : 'Resume ready for RAG'}</div>
                <div className="upload-status-copy">
                  {resumeError || resumeStatus || form.resumeFileName}
                </div>
              </div>
            )}

            {(jdStatus || jdError || form.jdFileName) && (
              <div className={`upload-status-card ${jdError ? 'error' : ''}`} style={{ marginBottom: 16 }}>
                <div className="upload-status-title">{jdError ? 'Job description upload issue' : 'Job description ready'}</div>
                <div className="upload-status-copy">{jdError || jdStatus || form.jdFileName}</div>
              </div>
            )}

            <div className="form-group">
              <label>Brief Introduction (optional)</label>
              <textarea rows={3} value={form.intro} onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))} placeholder="Tell us a bit about yourself, your background, and what excites you about this role..." />
            </div>

            <div className="form-group">
              <label>Interview Mode</label>
              <div className="mode-toggle-card">
                <div>
                  <div className="mode-toggle-title">Voice mode</div>
                  <div className="mode-toggle-copy">
                    Hear each interview question aloud and answer using your microphone in supported browsers.
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

            {form.roleId && (
              <div style={{ background: 'var(--c-bg-2)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 16, fontSize: 13, color: 'var(--c-ink-3)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--c-ink)' }}>Interview format: </strong>
                The interview will run as a timed, conversational session driven by the role, job description, and your uploaded resume for approximately {form.durationMinutes} minutes.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-lg" onClick={start} disabled={starting}>{starting ? 'Preparing Interview...' : 'Start Interview'}</button>
            </div>
          </div>
        </div>
      </Page>
    </div>
  )
}
