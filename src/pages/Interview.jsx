import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { useApp } from '../AppContext.jsx'
import { generateConversationReply, generateInterviewTurn, scoreAnswer, generateSessionSummary } from '../utils/ai.js'
import {
  beginMemoryTopic,
  buildInterviewContext,
  createInterviewMemory,
  markClarificationInMemory,
  retrieveRelevantChunks,
  summarizeInterviewMemory,
  updateInterviewMemory
} from '../utils/rag.js'
import { Spinner } from '../components/UI.jsx'

const STAGES = ['introduction', 'role_overview', 'behavioral', 'technical', 'candidate_questions', 'closing']
const STAGE_LABELS = {
  introduction: 'Introduction',
  role_overview: 'Role Overview',
  behavioral: 'Behavioral',
  technical: 'Technical',
  candidate_questions: 'Candidate Questions',
  closing: 'Closing'
}

function normalizeQuestion(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isMoveOnSignal(text) {
  const normalized = (text || '').toLowerCase()
  return ['next question', 'move on', 'skip', 'already introduced', 'go to the next', 'next please', 'move to next question', 'go ahead'].some((phrase) => normalized.includes(phrase))
}

function isClarificationSignal(text) {
  const normalized = (text || '').toLowerCase()
  return [
    'you mean',
    'what do you mean',
    'can you repeat',
    'can you rephrase',
    'did not understand',
    "didn't understand",
    'not clear',
    'which one',
    'what exactly',
    'i do not understand',
    "i don't understand"
  ].some((phrase) => normalized.includes(phrase))
}

function isConversationalTurn(text) {
  const normalized = (text || '').toLowerCase().trim()
  if (!normalized) return false
  if (isMoveOnSignal(normalized) || isClarificationSignal(normalized)) return false
  return (
    normalized.includes('?') ||
    ['can you', 'could you', 'did you', 'do you', 'have you', 'what do you', 'what can you', 'feedback', 'read my resume', 'tell me about my resume', 'what did you understand'].some((phrase) => normalized.includes(phrase))
  )
}

function nextStage(stage) {
  const index = STAGES.indexOf(stage)
  return index >= 0 && index < STAGES.length - 1 ? STAGES[index + 1] : stage
}

function getStageCounts(history = []) {
  return history.reduce((acc, item) => {
    const key = item.stage || 'introduction'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function buildFallbackTurn(stage, role, history = []) {
  const asked = new Set(history.map((item) => normalizeQuestion(item.question)))
  const options = {
    introduction: [
      'Before we dive in, could you give me a quick overview of your background and what led you toward this role?',
      'To start us off, what parts of your journey do you think are most relevant for this conversation?'
    ],
    role_overview: [
      `When you look at this ${role.title} role, which responsibilities feel most aligned with what you have actually done?`,
      `What part of this role do you feel most ready to take on from day one, and why?`
    ],
    behavioral: [
      'Can you tell me about a time you had to handle ambiguity or pressure and what you did in that situation?',
      'Tell me about a situation where collaboration was difficult and how you helped move things forward.'
    ],
    technical: [
      'Can you walk me through one technically demanding project and explain the key decisions you made along the way?',
      'Pick one project you are proud of and explain the problem, your approach, and the trade-offs you had to make.'
    ],
    candidate_questions: [
      'Before we wrap up, what would you like to ask me about the role, team, or expectations?',
      'What questions do you have for me before we close?'
    ],
    closing: [
      'Thanks, that gives me a solid picture. Is there anything important we have not covered yet that you want to add?',
      'Before we close, is there one last thing you want me to remember about your fit for this role?'
    ]
  }

  const question = (options[stage] || options.technical).find((item) => !asked.has(normalizeQuestion(item))) || options[stage]?.[0] || options.technical[0]
  return {
    stage,
    leadIn: stage === 'introduction' ? 'Thanks for being here.' : 'Got it.',
    question,
    answerGuide: 'Concrete context, ownership, decisions, trade-offs, results, and reflection.',
    reason: 'Local fallback to keep the interview moving without repetition.',
    shouldWrapUp: stage === 'closing'
  }
}

function buildClarificationTurn(stage, focus, history = []) {
  const asked = new Set(history.map((item) => normalizeQuestion(item.question)))
  const baseQuestion = focus
    ? `I want to make sure I understood that correctly. Could you walk me through ${focus} with a specific example or concrete detail?`
    : 'I want to stay on that for a moment. Could you give me one concrete example so I can understand your exact contribution more clearly?'
  const question = asked.has(normalizeQuestion(baseQuestion))
    ? 'Let me ask that a little differently. What exactly did you do, and what was the measurable outcome?'
    : baseQuestion

  return {
    stage,
    leadIn: 'I want to understand that part a bit better.',
    question,
    answerGuide: 'Specific actions, exact ownership, technical or business detail, and measurable outcome.',
    reason: `One-time clarification follow-up${focus ? ` about ${focus}` : ''}.`,
    isClarification: true,
    shouldWrapUp: false
  }
}

function buildRephraseTurn(stage, previousQuestion, history = []) {
  const asked = new Set(history.map((item) => normalizeQuestion(item.question)))
  const simplified = previousQuestion
    ? `Let me rephrase that more simply. ${previousQuestion}`
    : 'Let me ask that more clearly. Could you answer with one specific example from your experience?'
  const question = asked.has(normalizeQuestion(simplified))
    ? 'Let me put it more directly: what is one experience or example that best shows your fit for this role?'
    : simplified

  return {
    stage,
    leadIn: 'Let me rephrase that clearly.',
    question,
    answerGuide: 'Answer directly with one relevant example, clear ownership, and outcome.',
    reason: 'One-time rephrase because the candidate asked for clarification.',
    isClarification: true,
    shouldWrapUp: false
  }
}

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export default function Interview() {
  const { state, currentSession, addSession, setViewingReport, setScreen } = useApp()
  const role = currentSession.role
  const ragSessionId = currentSession.ragSessionId || ''
  const resumeText = currentSession.resumeText || ''
  const resumeProfile = currentSession.resumeProfile || null
  const resumeSummary = [resumeProfile?.summary, currentSession.intro].filter(Boolean).join(' ')
  const uploadedJobDescription = currentSession.jdText || ''
  const durationMinutes = currentSession.durationMinutes || 10
  const totalDurationSeconds = durationMinutes * 60
  const sectionQuestionCounts = state.settings.sectionQuestionCounts || {}

  const [messages, setMessages] = useState([])
  const [stage, setStage] = useState('introduction')
  const [currentQ, setCurrentQ] = useState(null)
  const [qAsked, setQAsked] = useState(0)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [finished, setFinished] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [startTime] = useState(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [voiceEnabled, setVoiceEnabled] = useState(currentSession?.voiceMode !== false)
  const [isListening, setIsListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [dictationPreview, setDictationPreview] = useState('')
  const [speechSupported] = useState(() => Boolean(getSpeechRecognition()))
  const [ttsSupported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window)

  const chatRef = useRef(null)
  const inputRef = useRef(null)
  const qaLogRef = useRef([])
  const hasInitializedRef = useRef(false)
  const recognitionRef = useRef(null)
  const listeningRef = useRef(false)
  const voiceEnabledRef = useRef(currentSession?.voiceMode !== false)
  const transcriptBaseRef = useRef('')
  const transcriptAccumRef = useRef('')
  const isFinalizingRef = useRef(false)
  const elapsedRef = useRef(0)
  const interviewMemoryRef = useRef(createInterviewMemory())

  useEffect(() => {
    const t = setInterval(() => {
      const nextElapsed = Math.floor((Date.now() - startTime) / 1000)
      elapsedRef.current = nextElapsed
      setElapsed(nextElapsed)
    }, 1000)
    return () => clearInterval(t)
  }, [startTime])

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled
  }, [voiceEnabled])

  const fmt = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  const pushMsg = useCallback((type, content, extra = {}) => {
    setMessages((prev) => [...prev, { id: Date.now() + Math.random(), type, content, ...extra }])
    setTimeout(() => chatRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }), 50)
  }, [])

  const stopSpeaking = useCallback(() => {
    if (ttsSupported) window.speechSynthesis.cancel()
  }, [ttsSupported])

  const speakText = useCallback((text) => {
    if (!voiceEnabledRef.current || !ttsSupported || !text) return
    stopSpeaking()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.lang = 'en-US'
    window.speechSynthesis.speak(utterance)
  }, [stopSpeaking, ttsSupported])

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !listeningRef.current) return
    listeningRef.current = false
    recognitionRef.current.stop()
  }, [])

  const startListening = useCallback(() => {
    if (!speechSupported || loading || finished || initializing) {
      if (!speechSupported) setVoiceError('Voice input is not available in this browser. Chrome and Edge support it best.')
      return
    }

    stopSpeaking()

    if (!recognitionRef.current) {
      const SpeechRecognition = getSpeechRecognition()
      if (!SpeechRecognition) {
        setVoiceError('Voice input is not available in this browser. Chrome and Edge support it best.')
        return
      }

      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = (event) => {
        let finalChunk = ''
        let interimChunk = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0]?.transcript || ''
          if (event.results[i].isFinal) finalChunk += transcript
          else interimChunk += transcript
        }

        if (finalChunk) transcriptAccumRef.current += `${finalChunk} `
        const combined = `${transcriptBaseRef.current}${transcriptAccumRef.current}${interimChunk}`.trim()
        setDictationPreview(interimChunk.trim())
        setAnswer(combined)
      }

      recognition.onerror = (event) => {
        listeningRef.current = false
        setIsListening(false)
        if (event.error !== 'aborted') {
          setVoiceError(event.error === 'not-allowed'
            ? 'Microphone access was blocked. Please allow microphone permission and try again.'
            : 'Voice capture stopped unexpectedly. Please try again.')
        }
      }

      recognition.onend = () => {
        listeningRef.current = false
        setIsListening(false)
        setDictationPreview('')
      }

      recognitionRef.current = recognition
    }

    transcriptBaseRef.current = answer.trim() ? `${answer.trim()} ` : ''
    transcriptAccumRef.current = ''
    setVoiceError('')
    setDictationPreview('')
    listeningRef.current = true
    setIsListening(true)

    try {
      recognitionRef.current.start()
    } catch {
      listeningRef.current = false
      setIsListening(false)
      setVoiceError('Voice capture could not start. If the microphone is already active, stop it and try again.')
    }
  }, [answer, finished, initializing, loading, speechSupported, stopSpeaking])

  useEffect(() => {
    return () => {
      stopListening()
      stopSpeaking()
    }
  }, [stopListening, stopSpeaking])

  const askNextQuestion = useCallback(async (history, stageHint = stage, options = {}) => {
    const candidateMovedOn = history.length && isMoveOnSignal(history[history.length - 1]?.answer)
    const stageCounts = getStageCounts(history)
    let effectiveStage = options.movePastCurrent || candidateMovedOn ? nextStage(stageHint) : stageHint

    while (!options.forceClarification && !options.rephraseRequested) {
      const limit = sectionQuestionCounts[effectiveStage]
      if (typeof limit !== 'number' || limit < 0) break
      if ((stageCounts[effectiveStage] || 0) < limit) break
      const next = nextStage(effectiveStage)
      if (next === effectiveStage) break
      effectiveStage = next
    }

    const contextBundle = buildInterviewContext({
      resumeText,
      jobDescriptionText: uploadedJobDescription,
      history,
      roleTitle: role.title,
      stage: effectiveStage,
      memory: interviewMemoryRef.current
    })

    const nextTurn = await generateInterviewTurn({
      ragSessionId,
      role,
      resumeText,
      resumeProfile: resumeProfile || { headline: currentSession.name, summary: resumeSummary, skills: [] },
      jobDescriptionText: uploadedJobDescription,
      history,
      currentStage: effectiveStage,
      durationMinutes,
      elapsedSeconds: elapsedRef.current,
      previousQuestion: options.previousQuestion || '',
      previousAnswer: options.previousAnswer || '',
      previousFeedback: options.previousFeedback || '',
      forceClarification: Boolean(options.forceClarification),
      followUpFocus: options.followUpFocus || '',
      previousWasClarification: Boolean(options.previousWasClarification),
      interviewContext: contextBundle,
      interviewMemory: interviewMemoryRef.current
    })

    const recentQuestions = history.slice(-6).map((item) => normalizeQuestion(item.question))
    const proposedQuestion = normalizeQuestion(nextTurn.question)
    const repeated = proposedQuestion && recentQuestions.some((item) => item === proposedQuestion || item.includes(proposedQuestion) || proposedQuestion.includes(item))
    const safeTurn = options.rephraseRequested
      ? buildRephraseTurn(effectiveStage, options.previousQuestion, history)
      : repeated
      ? options.forceClarification
        ? buildClarificationTurn(nextTurn.stage || effectiveStage, options.followUpFocus, history)
        : buildFallbackTurn(nextTurn.stage || effectiveStage, role, history)
      : nextTurn

    setStage(safeTurn.stage || effectiveStage)
    setCurrentQ({
      text: safeTurn.question,
      answer: safeTurn.answerGuide,
      reason: safeTurn.reason,
      stage: safeTurn.stage || effectiveStage,
      isClarification: Boolean(safeTurn.isClarification || options.forceClarification),
      shouldWrapUp: safeTurn.shouldWrapUp
    })
    interviewMemoryRef.current = safeTurn.isClarification
      ? markClarificationInMemory(interviewMemoryRef.current, safeTurn)
      : beginMemoryTopic(interviewMemoryRef.current, safeTurn)
    setQAsked((count) => count + 1)
    const spokenTurn = [safeTurn.leadIn, safeTurn.question].filter(Boolean).join(' ')
    pushMsg('ai', spokenTurn)
    speakText(spokenTurn)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [currentSession.name, durationMinutes, pushMsg, ragSessionId, resumeProfile, resumeSummary, resumeText, role, sectionQuestionCounts, speakText, stage, uploadedJobDescription])

  const finishInterview = useCallback(async (log) => {
    if (isFinalizingRef.current) return
    isFinalizingRef.current = true
    setFinished(true)
    stopListening()
    stopSpeaking()

    const bm = role.benchmark || {}
    let summary = null
    try {
      summary = await generateSessionSummary(log, role, bm, {
        ragSessionId,
        interviewMemory: interviewMemoryRef.current
      })
    } catch {}

    const dimAvg = (dim) => (log.length ? Math.round((log.reduce((a, q) => a + (q[dim] || 0), 0) / log.length) * 10) : 0)
    const dims = {
      relevance: dimAvg('relevance'),
      depth: dimAvg('depth'),
      clarity: dimAvg('clarity'),
      correctness: dimAvg('correctness')
    }
    const overall = Math.round(Object.values(dims).reduce((a, b) => a + b, 0) / 4)

    const stageScores = {}
    STAGES.forEach((stg) => {
      const stageQs = log.filter((item) => item.stage === stg)
      if (stageQs.length) {
        stageScores[stg] = Math.round(
          (stageQs.reduce((a, item) => a + (item.relevance + item.depth + item.clarity + item.correctness) / 4, 0) / stageQs.length) * 10
        )
      }
    })

    const session = {
      id: `s${Date.now()}`,
      candidateName: currentSession.name,
      candidateEmail: currentSession.email || '-',
      role: role.title,
      roleId: role.id,
      difficulty: currentSession.difficulty,
      date: new Date().toISOString(),
      overallScore: overall,
      threshold: state.settings.threshold,
      stageScores,
      dimensions: dims,
      benchmark: bm,
      qaLog: log,
      summary,
      duration: Math.floor((Date.now() - startTime) / 1000),
      resumeFileName: currentSession.resumeFileName || '',
      resumeProfile,
      scheduledDurationMinutes: durationMinutes,
      interviewMemory: interviewMemoryRef.current
    }

    addSession(session)
    setViewingReport(session)
    setScreen('report')
  }, [addSession, currentSession, durationMinutes, ragSessionId, resumeProfile, role, setScreen, setViewingReport, startTime, state.settings.threshold, stopListening, stopSpeaking])

  const endInterviewOnly = useCallback(() => {
    if (!window.confirm('End this interview without generating a report?')) return
    stopListening()
    stopSpeaking()
    setScreen(currentSession.sessionSource === 'interviewer' ? 'interviewer' : 'login')
  }, [currentSession.sessionSource, setScreen, stopListening, stopSpeaking])

  const generateReportNow = useCallback(() => {
    finishInterview(qaLogRef.current)
  }, [finishInterview])

  useEffect(() => {
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true

    const initialize = async () => {
      setInitializing(true)
      await askNextQuestion([], 'introduction')
      setInitializing(false)
    }

    initialize()
  }, [askNextQuestion])

  useEffect(() => {
    if (!finished && !initializing && elapsed >= totalDurationSeconds) {
      generateReportNow()
    }
  }, [elapsed, finished, generateReportNow, initializing, totalDurationSeconds])

  const submit = useCallback(async () => {
    const text = answer.trim()
    if (!text || loading || finished || initializing || !currentQ) return

    stopListening()
    setAnswer('')
    setDictationPreview('')
    pushMsg('user', text)
    setLoading(true)

    try {
      if (isMoveOnSignal(text)) {
        await askNextQuestion(qaLogRef.current, currentQ.stage || stage, {
          movePastCurrent: true,
          previousQuestion: currentQ.text,
          previousAnswer: text,
          previousFeedback: 'Candidate explicitly asked to move on.',
          previousWasClarification: true
        })
        setLoading(false)
        return
      }

      if (isClarificationSignal(text)) {
        await askNextQuestion(
          qaLogRef.current,
          currentQ.stage || stage,
          currentQ.isClarification
            ? {
                movePastCurrent: true,
                previousQuestion: currentQ.text,
                previousAnswer: text,
                previousFeedback: 'Candidate remained unclear even after a clarification. Move on to a different angle.',
                previousWasClarification: true
              }
            : {
                rephraseRequested: true,
                forceClarification: true,
                previousQuestion: currentQ.text,
                previousAnswer: text,
                previousFeedback: 'Candidate asked for a clearer rephrase of the question.',
                followUpFocus: 'rephrase the same question more clearly',
                previousWasClarification: false
              }
        )
        setLoading(false)
        return
      }

      if (isConversationalTurn(text) && ragSessionId) {
        const replyTurn = await generateConversationReply({
          role,
          ragSessionId,
          candidateMessage: text,
          currentQuestion: currentQ,
          currentStage: currentQ.stage || stage,
          history: qaLogRef.current,
          durationMinutes,
          elapsedSeconds: elapsedRef.current,
          interviewMemory: interviewMemoryRef.current
        })

        const spokenTurn = [replyTurn.reply, replyTurn.question].filter(Boolean).join(' ')
        pushMsg('ai', spokenTurn)
        speakText(spokenTurn)

        if (replyTurn.question) {
          setStage(replyTurn.stage || currentQ.stage || stage)
          setCurrentQ({
            text: replyTurn.question,
            answer: 'Direct answer, concrete evidence, ownership, and relevant detail.',
            reason: replyTurn.reason,
            stage: replyTurn.stage || currentQ.stage || stage,
            isClarification: Boolean(replyTurn.isClarification),
            shouldWrapUp: replyTurn.shouldWrapUp
          })
          interviewMemoryRef.current = replyTurn.isClarification
            ? markClarificationInMemory(interviewMemoryRef.current, { ...replyTurn, text: replyTurn.question })
            : beginMemoryTopic(interviewMemoryRef.current, { ...replyTurn, text: replyTurn.question })
        }

        setLoading(false)
        return
      }

      const contextBundle = buildInterviewContext({
        resumeText,
        jobDescriptionText: uploadedJobDescription,
        history: qaLogRef.current,
        roleTitle: role.title,
        stage: currentQ.stage || stage,
        memory: interviewMemoryRef.current
      })
      const resumeChunks = retrieveRelevantChunks(resumeText, `${currentQ.text} ${text}`, 3)
      const scores = await scoreAnswer(currentQ, text, role, {
        ragSessionId,
        history: qaLogRef.current,
        jobDescription: uploadedJobDescription.slice(0, 4000),
        resumeChunks,
        profileSummary: resumeSummary,
        questionReason: currentQ.reason,
        interviewMemory: summarizeInterviewMemory(interviewMemoryRef.current),
        retrievedContext: [
          contextBundle.resumeEvidence?.length ? `Resume evidence:\n${contextBundle.resumeEvidence.join('\n')}` : '',
          contextBundle.jdEvidence?.length ? `Job description evidence:\n${contextBundle.jdEvidence.join('\n')}` : '',
          contextBundle.weakAreas?.length ? `Open evaluation gaps:\n${contextBundle.weakAreas.join('\n')}` : '',
          contextBundle.memorySnapshot ? `Interview memory:\n${contextBundle.memorySnapshot}` : ''
        ].filter(Boolean).join('\n\n'),
        recentHistory: qaLogRef.current.slice(-3).map((item) => (
          `Question: ${item.question}\nAnswer: ${item.answer}\nFeedback: ${item.feedback || 'N/A'}`
        )).join('\n\n')
      })

      const entry = {
        ...scores,
        question: currentQ.text,
        answer: text,
        stage: currentQ.stage || stage,
        modelAnswer: currentQ.answer,
        reason: currentQ.reason,
        isClarification: Boolean(currentQ.isClarification)
      }

      const newLog = [...qaLogRef.current, entry]
      qaLogRef.current = newLog
      interviewMemoryRef.current = updateInterviewMemory(interviewMemoryRef.current, entry, currentQ)
      const remainingSeconds = Math.max(0, totalDurationSeconds - elapsedRef.current)
      if (remainingSeconds <= 45 || currentQ.shouldWrapUp) {
        setLoading(false)
        finishInterview(newLog)
        return
      }

      const shouldClarify = Boolean(scores.needsFollowUp) && !currentQ.isClarification

      await askNextQuestion(
        newLog,
        currentQ.stage || stage,
        shouldClarify
          ? {
              forceClarification: true,
              followUpFocus: scores.followUpFocus || scores.improvements,
              previousQuestion: currentQ.text,
              previousAnswer: text,
              previousFeedback: scores.feedback,
              previousWasClarification: false
            }
          : {
              previousQuestion: currentQ.text,
              previousAnswer: text,
              previousFeedback: scores.feedback,
              previousWasClarification: Boolean(currentQ.isClarification)
            }
      )
    } catch (error) {
      const message = error?.message === 'RAG session not found.'
        ? 'Interview error: The local RAG server session was not found. Restart `npm run server`, then start a new interview.'
        : `Interview error: ${error?.message || 'Unable to continue the interview.'}`
      pushMsg('sys', message)
    }

    setLoading(false)
  }, [answer, askNextQuestion, currentQ, finishInterview, finished, initializing, loading, pushMsg, ragSessionId, resumeSummary, resumeText, role, stage, stopListening, totalDurationSeconds, uploadedJobDescription])

  const remainingSeconds = Math.max(0, totalDurationSeconds - elapsed)
  const progress = Math.min(100, (elapsed / totalDurationSeconds) * 100)
  const stageIdx = STAGES.indexOf(stage)

  return (
    <div className="interview-shell">
      <header className="interview-topbar">
        <div>
          <div className="interview-session-label">Live Interview Session</div>
          <div className="interview-session-title">{currentSession.name}</div>
          <div className="interview-session-meta">{role.title} | {durationMinutes}-minute interview</div>
        </div>

        <div className="interview-status-row">
          <div className="interview-status-pill">Asked {qAsked}</div>
          <div className="interview-status-pill">Time left {fmt(remainingSeconds)}</div>
          <button className="btn btn-sm" onClick={generateReportNow} disabled={finished || initializing || loading}>Generate Report</button>
          <button className="btn btn-sm btn-danger" onClick={endInterviewOnly} disabled={finished || initializing}>End Interview</button>
        </div>
      </header>

      <div className="interview-content">
        <aside className="interview-sidebar">
          <div className="card interview-panel">
            <div className="interview-panel-label">Session Timeline</div>
            <div className="interview-progress-track">
              <div className="interview-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="interview-progress-meta">{fmt(elapsed)} elapsed of {fmt(totalDurationSeconds)}</div>

            <div className="interview-stage-list">
              {STAGES.map((stg, index) => (
                <div key={stg} className={`interview-stage-item ${index < stageIdx ? 'done' : index === stageIdx ? 'active' : ''}`}>
                  <div className="interview-stage-index">{index < stageIdx ? 'OK' : index + 1}</div>
                  <div>
                    <div className="interview-stage-name">{STAGE_LABELS[stg]}</div>
                    <div className="interview-stage-note">{index < stageIdx ? 'Covered' : index === stageIdx ? 'Current focus' : 'Later in the interview'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="interview-main">
          <div className="card interview-chat-card">
            <div className="interview-chat-header">
              <div>
                <div className="interview-panel-label">Conversation</div>
                <div className="interview-chat-subtitle">Adaptive interview driven by role, resume, job description, and live conversation context</div>
              </div>
            </div>

            <div ref={chatRef} className="interview-chat-stream">
              {messages.map((message) => <Message key={message.id} msg={message} />)}
              {(loading || initializing) && (
                <div className="interview-loading-row">
                  <Spinner size={14} />
                  <span>{initializing ? 'Starting the interview...' : 'Evaluating your answer and preparing the next turn...'}</span>
                </div>
              )}
            </div>

            <div className="interview-input-shell">
              <div className="interview-input-label">Your Response</div>
              <div className="interview-input-row">
                <div className="interview-input-stack">
                  <textarea
                    ref={inputRef}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') submit() }}
                    disabled={loading || finished || initializing}
                    rows={4}
                    placeholder={finished ? 'Interview complete.' : voiceEnabled ? 'Type or dictate your answer here...' : 'Type your answer here...'}
                    style={{ flex: 1, resize: 'none' }}
                  />
                  {(isListening || dictationPreview) && (
                    <div className="interview-dictation-banner">
                      <span className={`interview-voice-dot ${isListening ? 'live' : 'ok'}`} />
                      {isListening ? 'Listening...' : 'Voice capture ready'}
                      {dictationPreview ? <span className="interview-dictation-preview">{dictationPreview}</span> : null}
                    </div>
                  )}
                </div>

                <div className="interview-input-actions">
                  <button
                    type="button"
                    className={`btn btn-icon ${isListening ? 'btn-danger' : voiceEnabled ? 'btn-primary' : ''}`}
                    onClick={() => {
                      if (!voiceEnabled) setVoiceEnabled(true)
                      if (isListening) stopListening()
                      else startListening()
                    }}
                    disabled={loading || finished || initializing || !speechSupported}
                    title={isListening ? 'Stop voice input' : 'Start voice input'}
                    aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                    style={{ height: 54, width: 54, justifyContent: 'center' }}
                  >
                    {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => {
                      if (!voiceEnabled) setVoiceEnabled(true)
                      if (currentQ) speakText(currentQ.text)
                    }}
                    disabled={!currentQ || !ttsSupported}
                    title="Replay question"
                    aria-label="Replay question"
                    style={{ height: 54, width: 54, justifyContent: 'center' }}
                  >
                    {ttsSupported ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  </button>
                  <button className="btn btn-primary" onClick={submit} disabled={loading || finished || initializing || !answer.trim()} style={{ height: 54, padding: '0 22px', alignSelf: 'flex-end' }}>
                    {loading ? <Spinner size={14} /> : 'Send'}
                  </button>
                </div>
              </div>
              <div className="interview-input-note">Ctrl+Enter to submit. You can end the interview anytime or generate the report whenever you want.</div>
              {voiceError ? <div className="interview-voice-error">{voiceError}</div> : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function Message({ msg }) {
  if (msg.type === 'sys') return <div className="msg msg-sys animate-fade">{msg.content}</div>
  if (msg.type === 'user') return <div className="msg msg-user animate-fade">{msg.content}</div>
  if (msg.type === 'ai') return <div className="msg msg-ai animate-fade">{msg.content}</div>
  return null
}
