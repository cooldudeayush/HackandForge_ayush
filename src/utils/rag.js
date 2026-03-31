const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'your', 'about', 'into', 'what', 'when', 'where',
  'which', 'their', 'they', 'will', 'would', 'could', 'should', 'there', 'been', 'were', 'them', 'then', 'than',
  'over', 'under', 'also', 'while', 'across', 'through', 'role', 'candidate', 'using', 'used'
])

export function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function keywordSet(text) {
  return new Set(
    normalizeText(text)
      .split(' ')
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  )
}

export function keywordOverlapScore(source, query) {
  const sourceWords = keywordSet(source)
  const queryWords = keywordSet(query)
  let overlap = 0
  queryWords.forEach((word) => {
    if (sourceWords.has(word)) overlap += 1
  })
  return overlap
}

export function chunkText(text, chunkSize = 420) {
  const sentences = (text || '').split(/(?<=[.?!])\s+/).map((item) => item.trim()).filter(Boolean)
  const chunks = []
  let current = ''

  sentences.forEach((sentence) => {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length > chunkSize && current) {
      chunks.push(current)
      current = sentence
    } else {
      current = next
    }
  })

  if (current) chunks.push(current)
  return chunks
}

export function retrieveRelevantChunks(text, query, limit = 3) {
  return chunkText(text)
    .map((chunk) => ({ chunk, score: keywordOverlapScore(chunk, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk)
}

export function buildInterviewContext({
  resumeText = '',
  jobDescriptionText = '',
  history = [],
  roleTitle = '',
  stage = '',
  memory = null
}) {
  const recentTurns = history.slice(-6)
  const recentQuestions = recentTurns.map((item) => item.question).filter(Boolean)
  const recentAnswers = recentTurns.map((item) => item.answer).filter(Boolean)
  const weakAreas = recentTurns
    .filter((item) => item.needsFollowUp || item.overall < 6)
    .map((item) => item.followUpFocus || item.improvements || item.feedback || item.question)
    .filter(Boolean)

  const query = [
    roleTitle,
    stage,
    recentQuestions.slice(-2).join(' '),
    recentAnswers.slice(-2).join(' '),
    weakAreas.slice(-2).join(' '),
    memory?.coveredTopics?.slice(-3).join(' '),
    memory?.weakSignals?.slice(-2).join(' ')
  ].filter(Boolean).join(' ')

  const resumeEvidence = retrieveRelevantChunks(resumeText, query || roleTitle, 4)
  const jdEvidence = retrieveRelevantChunks(jobDescriptionText, query || roleTitle, 3)

  return {
    query,
    resumeEvidence,
    jdEvidence,
    recentQuestions: recentQuestions.slice(-4),
    recentAnswers: recentAnswers.slice(-3),
    weakAreas: weakAreas.slice(-3),
    memorySnapshot: memory ? summarizeInterviewMemory(memory) : null
  }
}

function uniqueTrimmed(items, limit = 6) {
  return Array.from(new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))).slice(0, limit)
}

function topKeywords(text, limit = 4) {
  return Array.from(keywordSet(text)).slice(0, limit)
}

export function createInterviewMemory() {
  return {
    coveredTopics: [],
    candidateClaims: [],
    weakSignals: [],
    education: [],
    projectsMentioned: [],
    toolsClaimed: [],
    ownershipEvidence: [],
    impactMetrics: [],
    clarificationUsedForCurrentTopic: false,
    currentTopic: '',
    lastQuestion: '',
    lastAnswer: ''
  }
}

export function summarizeInterviewMemory(memory) {
  if (!memory) return ''
  return [
    memory.currentTopic ? `Current topic: ${memory.currentTopic}` : '',
    memory.coveredTopics?.length ? `Covered topics: ${memory.coveredTopics.join(', ')}` : '',
    memory.candidateClaims?.length ? `Candidate claims: ${memory.candidateClaims.join(' | ')}` : '',
    memory.weakSignals?.length ? `Weak signals: ${memory.weakSignals.join(' | ')}` : '',
    memory.education?.length ? `Education: ${memory.education.join(' | ')}` : '',
    memory.projectsMentioned?.length ? `Projects mentioned: ${memory.projectsMentioned.join(' | ')}` : '',
    memory.toolsClaimed?.length ? `Tools claimed: ${memory.toolsClaimed.join(', ')}` : '',
    memory.ownershipEvidence?.length ? `Ownership evidence: ${memory.ownershipEvidence.join(' | ')}` : '',
    memory.impactMetrics?.length ? `Impact metrics: ${memory.impactMetrics.join(' | ')}` : '',
    `Clarification already used for current topic: ${memory.clarificationUsedForCurrentTopic ? 'yes' : 'no'}`
  ].filter(Boolean).join('\n')
}

export function updateInterviewMemory(memory, entry = {}, question = {}) {
  const next = {
    ...(memory || createInterviewMemory()),
    coveredTopics: [...(memory?.coveredTopics || [])],
    candidateClaims: [...(memory?.candidateClaims || [])],
    weakSignals: [...(memory?.weakSignals || [])],
    education: [...(memory?.education || [])],
    projectsMentioned: [...(memory?.projectsMentioned || [])],
    toolsClaimed: [...(memory?.toolsClaimed || [])],
    ownershipEvidence: [...(memory?.ownershipEvidence || [])],
    impactMetrics: [...(memory?.impactMetrics || [])]
  }

  const questionText = question.text || question.question || entry.question || ''
  const answerText = entry.answer || ''
  const topicSeed = [question.stage || entry.stage || '', ...topKeywords(questionText, 3)].filter(Boolean).join(' ')
  const claimSeed = answerText.split(/[.!?]/).map((item) => item.trim()).filter((item) => item.split(' ').length >= 5).slice(0, 2)
  const weakSeed = [entry.followUpFocus, entry.improvements, entry.feedback]
    .filter(Boolean)
    .map((item) => String(item).split(/[.!?]/)[0].trim())

  next.coveredTopics = uniqueTrimmed([...next.coveredTopics, topicSeed], 10)
  next.candidateClaims = uniqueTrimmed([...next.candidateClaims, ...claimSeed], 8)

  if (entry.needsFollowUp || (typeof entry.overall === 'number' && entry.overall < 6)) {
    next.weakSignals = uniqueTrimmed([...next.weakSignals, ...weakSeed], 8)
  } else if (next.weakSignals.length) {
    const latestWeak = weakSeed[0]
    if (latestWeak) {
      next.weakSignals = next.weakSignals.filter((item) => item !== latestWeak)
    }
  }

  next.currentTopic = topicSeed || next.currentTopic
  next.lastQuestion = questionText
  next.lastAnswer = answerText
  next.clarificationUsedForCurrentTopic = Boolean(question.isClarification || entry.isClarification)

  const structured = entry.structuredMemoryUpdates || {}
  next.education = uniqueTrimmed([...next.education, ...(structured.education || [])], 6)
  next.projectsMentioned = uniqueTrimmed([...next.projectsMentioned, ...(structured.projectsMentioned || [])], 8)
  next.toolsClaimed = uniqueTrimmed([...next.toolsClaimed, ...(structured.toolsClaimed || [])], 12)
  next.ownershipEvidence = uniqueTrimmed([...next.ownershipEvidence, ...(structured.ownershipEvidence || [])], 8)
  next.impactMetrics = uniqueTrimmed([...next.impactMetrics, ...(structured.impactMetrics || [])], 8)

  return next
}

export function markClarificationInMemory(memory, question = {}) {
  const questionText = question.text || question.question || ''
  return {
    ...(memory || createInterviewMemory()),
    currentTopic: [question.stage || '', ...topKeywords(questionText, 3)].filter(Boolean).join(' '),
    lastQuestion: questionText,
    clarificationUsedForCurrentTopic: true
  }
}

export function beginMemoryTopic(memory, question = {}) {
  const questionText = question.text || question.question || ''
  return {
    ...(memory || createInterviewMemory()),
    currentTopic: [question.stage || '', ...topKeywords(questionText, 3)].filter(Boolean).join(' '),
    lastQuestion: questionText,
    clarificationUsedForCurrentTopic: Boolean(question.isClarification)
  }
}

function shuffle(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function rankQuestionsForContext(questions, queryText) {
  return [...questions].sort((a, b) => {
    const aScore = keywordOverlapScore(`${a.text} ${a.answer || ''} ${a.tags || ''}`, queryText)
    const bScore = keywordOverlapScore(`${b.text} ${b.answer || ''} ${b.tags || ''}`, queryText)
    if (bScore !== aScore) return bScore - aScore
    return Math.random() - 0.5
  })
}

export function blendQuestions({ personalized = [], bank = [], count = 3 }) {
  const targetPersonalized = personalized.length ? Math.min(personalized.length, Math.max(1, Math.floor(count / 2))) : 0
  const selected = []

  shuffle(personalized).slice(0, targetPersonalized).forEach((question) => selected.push(question))

  rankQuestionsForContext(bank, personalized.map((item) => item.text).join(' '))
    .filter((question) => !selected.some((picked) => picked.id === question.id))
    .slice(0, Math.max(0, count - selected.length))
    .forEach((question) => selected.push(question))

  return shuffle(selected).slice(0, count)
}

function inferStageFromText(text) {
  const normalized = normalizeText(text)
  if (/leadership|conflict|stakeholder|challenge|team|decision|ownership|career/.test(normalized)) return 'behavioral'
  if (/introduce|background|resume|journey|experience|motivation|why/.test(normalized)) return 'intro'
  return 'technical'
}

export function parseBulkQuestions(raw, defaultRoleId = '') {
  const parsedJson = (() => {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  })()

  if (Array.isArray(parsedJson)) {
    return parsedJson
      .filter((item) => item && item.text)
      .map((item, index) => ({
        id: `qimport_${Date.now()}_${index}`,
        roleId: item.roleId || defaultRoleId,
        stage: item.stage || inferStageFromText(item.text),
        difficulty: item.difficulty || 'medium',
        text: item.text.trim(),
        answer: (item.answer || item.expectedAnswer || '').trim(),
        tags: Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || '')
      }))
  }

  return raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
      const text = lines[0].replace(/^q[:\-]\s*/i, '')
      const answerLine = lines.find((line) => /^a(ns|swer)?[:\-]/i.test(line)) || ''
      const stageLine = lines.find((line) => /^stage[:\-]/i.test(line)) || ''
      const difficultyLine = lines.find((line) => /^difficulty[:\-]/i.test(line)) || ''

      return {
        id: `qimport_${Date.now()}_${index}`,
        roleId: defaultRoleId,
        stage: stageLine ? stageLine.split(':').slice(1).join(':').trim().toLowerCase() : inferStageFromText(text),
        difficulty: difficultyLine ? difficultyLine.split(':').slice(1).join(':').trim().toLowerCase() : 'medium',
        text,
        answer: answerLine ? answerLine.split(':').slice(1).join(':').trim() : '',
        tags: ''
      }
    })
    .filter((item) => item.text)
}
