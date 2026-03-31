import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PORT = Number(process.env.RAG_SERVER_PORT || 3030)
const STORE_PATH = path.join(process.cwd(), 'server', 'data', 'rag-store.json')
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const GENERATE_MODEL = process.env.VITE_OLLAMA_MODEL || process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud'
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'your', 'about', 'into', 'what', 'when', 'where',
  'which', 'their', 'they', 'will', 'would', 'could', 'should', 'there', 'been', 'were', 'them', 'then', 'than',
  'over', 'under', 'also', 'while', 'across', 'through', 'role', 'candidate', 'using', 'used'
])

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  })
  res.end(JSON.stringify(data))
}

async function ensureStore() {
  await mkdir(path.dirname(STORE_PATH), { recursive: true })
  try {
    await readFile(STORE_PATH, 'utf8')
  } catch {
    await writeFile(STORE_PATH, JSON.stringify({ sessions: {} }, null, 2), 'utf8')
  }
}

async function readStore() {
  await ensureStore()
  const raw = await readFile(STORE_PATH, 'utf8')
  return JSON.parse(raw)
}

async function writeStore(store) {
  await ensureStore()
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
}

async function updateStore(mutator) {
  const store = await readStore()
  const next = await mutator(store)
  await writeStore(next)
  return next
}

async function parseBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function normalizeText(text = '') {
  return text.toLowerCase().replace(/[^a-z0-9+\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function keywordSet(text) {
  return new Set(
    normalizeText(text)
      .split(' ')
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  )
}

function topKeywords(text, limit = 5) {
  return Array.from(keywordSet(text)).slice(0, limit)
}

const KNOWN_SKILLS = [
  'sql', 'python', 'java', 'javascript', 'typescript', 'react', 'node', 'node.js', 'postgresql', 'mysql', 'mongodb',
  'redis', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'spark', 'airflow', 'tableau', 'power bi', 'excel',
  'tensorflow', 'pytorch', 'machine learning', 'deep learning', 'nlp', 'llm', 'genai', 'rag', 'data science',
  'data analysis', 'statistics', 'powerpoint', 'product management', 'system design', 'microservices', 'rest api',
  'graphql', 'etl', 'hadoop', 'scikit learn', 'pandas', 'numpy', 'git', 'linux'
]

function extractKnownSkills(text = '', limit = 12) {
  const normalized = normalizeText(text)
  return KNOWN_SKILLS.filter((skill) => normalized.includes(normalizeText(skill))).slice(0, limit)
}

function uniqueList(items = [], limit = 10) {
  return Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, limit)
}

function extractMetrics(text = '', limit = 6) {
  const matches = String(text).match(/\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s?(?:x|yrs?|years?|months?|days?|hours?)|\$\d+(?:,\d{3})*(?:\.\d+)?/gi) || []
  return uniqueList(matches, limit)
}

function extractBulletishLines(text = '', limit = 6) {
  return uniqueList(
    String(text)
      .split(/\n+/)
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line.split(' ').length >= 4),
    limit
  )
}

function buildSessionSignals(payload) {
  const resumeText = payload.resumeText || ''
  const jdText = payload.jobDescriptionText || ''
  const resumeProfile = payload.resumeProfile || {}

  return {
    resumeSkills: uniqueList([
      ...(resumeProfile.skills || []),
      ...extractKnownSkills(resumeText)
    ], 12),
    jdSkills: uniqueList(extractKnownSkills(`${payload.role?.jd || ''} ${jdText}`), 12),
    educationHighlights: uniqueList([
      resumeProfile.education || '',
      ...extractBulletishLines(resumeText).filter((line) => /btech|b\.tech|mtech|m\.tech|bachelor|master|university|college|education/i.test(line))
    ], 4),
    projectHighlights: uniqueList([
      ...(resumeProfile.projects || []),
      ...extractBulletishLines(resumeText).filter((line) => /project|built|developed|designed|implemented|model|pipeline|dashboard/i.test(line))
    ], 8),
    impactHints: extractMetrics(resumeText, 8)
  }
}

function keywordOverlap(text = '', query = '') {
  const source = keywordSet(text)
  const target = keywordSet(query)
  let score = 0
  target.forEach((item) => {
    if (source.has(item)) score += 1
  })
  return score
}

function chunkText(text, chunkSize = 700) {
  const paragraphs = String(text || '')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (!paragraphs.length) return []

  const chunks = []
  let current = ''

  for (const paragraph of paragraphs) {
    const parts = paragraph.split(/(?<=[.?!])\s+/).map((item) => item.trim()).filter(Boolean)
    for (const part of parts) {
      const next = current ? `${current} ${part}` : part
      if (next.length > chunkSize && current) {
        chunks.push(current)
        current = part
      } else {
        current = next
      }
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function cosineSimilarity(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (!magA || !magB) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

async function embedText(text) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBED_MODEL,
      prompt: text
    })
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.embedding) {
    throw new Error(data?.error || 'Embedding request failed.')
  }

  return data.embedding
}

async function callOllama(prompt, maxTokens = 900) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GENERATE_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: maxTokens
      }
    })
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || typeof data?.response !== 'string') {
    throw new Error(data?.error || 'Generation request failed.')
  }

  return data.response.replace(/```json|```/g, '').trim()
}

function parseJSON(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function summarizeMemory(memory = {}) {
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
    `Clarification used for current topic: ${memory.clarificationUsedForCurrentTopic ? 'yes' : 'no'}`
  ].filter(Boolean).join('\n')
}

async function buildDocument(type, name, text) {
  const rawChunks = chunkText(text)
  const chunks = []

  for (let index = 0; index < rawChunks.length; index += 1) {
    const chunkTextValue = rawChunks[index]
    const embedding = await embedText(chunkTextValue)
    chunks.push({
      id: `${type}_${index}_${randomUUID()}`,
      type,
      name,
      text: chunkTextValue,
      embedding,
      keywords: topKeywords(chunkTextValue, 8)
    })
  }

  return {
    type,
    name,
    text,
    chunks
  }
}

async function createRagSession(payload) {
  const id = `rag_${Date.now()}_${randomUUID().slice(0, 8)}`
  const documents = []

  if (payload.resumeText) {
    documents.push(await buildDocument('resume', payload.resumeFileName || 'resume', payload.resumeText))
  }
  if (payload.jobDescriptionText) {
    documents.push(await buildDocument('job_description', payload.jobDescriptionFileName || 'job_description', payload.jobDescriptionText))
  }

  const session = {
    id,
    createdAt: new Date().toISOString(),
    candidateName: payload.candidateName || 'Candidate',
    role: payload.role || {},
    resumeProfile: payload.resumeProfile || {},
    signals: buildSessionSignals(payload),
    documents,
    latestMemory: payload.interviewMemory || null
  }

  await updateStore((store) => {
    store.sessions[id] = session
    return store
  })

  return session
}

function flattenChunks(session) {
  return (session.documents || []).flatMap((document) => document.chunks || [])
}

async function retrieveEvidence(session, query, limit = 5) {
  const chunks = flattenChunks(session)
  if (!chunks.length) return []
  const queryEmbedding = await embedText(query)
  return chunks
    .map((chunk) => ({
      ...chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
      keywordScore: keywordOverlap(chunk.text, query)
    }))
    .sort((a, b) => (b.similarity + b.keywordScore * 0.08) - (a.similarity + a.keywordScore * 0.08))
    .slice(0, limit)
}

function recentTranscript(history = [], limit = 6) {
  return history.slice(-limit).map((item, index) => (
    `Turn ${index + 1}
Question: ${item.question}
Candidate answer: ${item.answer}
Feedback: ${item.feedback || 'N/A'}
Stage: ${item.stage || 'unknown'}`
  )).join('\n\n')
}

async function generateTurn(session, body) {
  const memory = body.interviewMemory || session.latestMemory || {}
  const signals = session.signals || {}
  const query = [
    body.currentStage,
    body.previousQuestion,
    body.previousAnswer,
    memory.currentTopic,
    memory.weakSignals?.join(' '),
    memory.candidateClaims?.slice(-2).join(' '),
    memory.toolsClaimed?.slice(-3).join(' '),
    signals.resumeSkills?.slice(0, 4).join(' '),
    signals.jdSkills?.slice(0, 4).join(' ')
  ].filter(Boolean).join(' ')

  const evidence = await retrieveEvidence(session, query || session.role?.title || 'interview context', 6)
  const prompt = `You are conducting a realistic live interview for the role ${session.role?.title || 'Open Role'}.

Be conversational, professional, sharp, and human.
Ask one question at a time.
Use the retrieved evidence and interview memory.
If a clarification was already used for the current topic, do not re-ask that topic again.
Do not repeat previous questions.
If the candidate asked to move on or remained unclear after one rephrase, pick a new angle.
Use candidate claims from memory when they are relevant, especially if the candidate mentioned them earlier in the interview.
You may briefly acknowledge or answer a candidate concern before the next question, but the turn should still move the interview forward.
Treat this like a real interview conversation, not a scripted questionnaire.
When the candidate has already shared useful context, build on it instead of restarting.
If the technical stage is active, prefer asking from tools the candidate has claimed or from resume/JD skills.
If the candidate's strongest tools are still unclear, ask which skill or tool they are most comfortable with before drilling deeper.
Use concrete project, metric, and ownership signals when choosing a follow-up.

Role:
- Title: ${session.role?.title || 'N/A'}
- JD: ${session.role?.jd || 'N/A'}
- Focus areas: ${session.role?.areas || 'N/A'}

Candidate profile:
- Headline: ${session.resumeProfile?.headline || 'N/A'}
- Summary: ${session.resumeProfile?.summary || 'N/A'}
- Skills: ${(session.resumeProfile?.skills || []).join(', ') || 'N/A'}
- Projects: ${(session.resumeProfile?.projects || []).join(' | ') || 'N/A'}

Session signals:
- Resume skills: ${(signals.resumeSkills || []).join(', ') || 'N/A'}
- JD skills: ${(signals.jdSkills || []).join(', ') || 'N/A'}
- Education highlights: ${(signals.educationHighlights || []).join(' | ') || 'N/A'}
- Project highlights: ${(signals.projectHighlights || []).join(' | ') || 'N/A'}
- Impact hints: ${(signals.impactHints || []).join(' | ') || 'N/A'}

Interview state:
- Stage: ${body.currentStage || 'introduction'}
- Previous question: ${body.previousQuestion || 'N/A'}
- Previous answer: ${body.previousAnswer || 'N/A'}
- Previous feedback: ${body.previousFeedback || 'N/A'}
- Forced clarification: ${body.forceClarification ? 'yes' : 'no'}
- Follow-up focus: ${body.followUpFocus || 'N/A'}
- Previous was clarification: ${body.previousWasClarification ? 'yes' : 'no'}
- Duration: ${body.durationMinutes || 10} minutes
- Elapsed: ${body.elapsedSeconds || 0} seconds

Interview memory:
${summarizeMemory(memory) || 'No memory yet.'}

Recent transcript:
${recentTranscript(body.history || []) || 'No prior turns yet.'}

Retrieved evidence:
${evidence.map((item) => `[${item.type}] ${item.text}`).join('\n') || 'No retrieved evidence.'}

Return ONLY valid JSON:
{
  "stage":"introduction|role_overview|behavioral|technical|candidate_questions|closing",
  "leadIn":"short natural interviewer acknowledgement",
  "question":"single interviewer question",
  "answerGuide":"what a strong answer should cover",
  "reason":"why this question helps evaluate the candidate",
  "isClarification":true|false,
  "shouldWrapUp":true|false
}`

  const fallback = {
    stage: body.currentStage || 'introduction',
    leadIn: 'Understood.',
    question: 'Could you walk me through one concrete example from your experience that best shows your fit for this role?',
    answerGuide: 'Context, ownership, decisions, results, and reflection.',
    reason: 'Fallback question.',
    isClarification: Boolean(body.forceClarification),
    shouldWrapUp: false
  }

  const text = await callOllama(prompt, 550)
  return {
    turn: parseJSON(text, fallback),
    evidence: evidence.map((item) => ({ type: item.type, text: item.text, similarity: item.similarity }))
  }
}

async function generateConversationReply(session, body) {
  const memory = body.interviewMemory || session.latestMemory || {}
  const signals = session.signals || {}
  const evidence = await retrieveEvidence(
    session,
    [
      body.candidateMessage,
      body.currentQuestion?.text || '',
      memory.currentTopic,
      memory.candidateClaims?.slice(-3).join(' '),
      memory.toolsClaimed?.slice(-3).join(' '),
      signals.resumeSkills?.slice(0, 4).join(' ')
    ].filter(Boolean).join(' '),
    6
  )

  const prompt = `You are conducting a live interview for ${session.role?.title || 'Open Role'}.

The candidate has just said something that may be conversational, meta, or exploratory.
Respond like a sharp human interviewer, not like a form bot.

Your behavior:
- answer the candidate directly when they ask a reasonable question
- if they ask whether you can read their resume, prove it by mentioning 2-3 concrete resume points from retrieved evidence
- if they ask for feedback mid-interview, give brief directional feedback, not the full evaluation report
- if they ask for clarification, rephrase simply
- if they ask a side question, answer briefly and then transition back naturally
- do not ignore the candidate's actual message
- do not always jump straight to a new question without first responding
- after replying, you may ask one relevant next question if it helps continue the interview
- use interview memory and prior conversation to stay consistent
- if the candidate asks whether you understood their background, cite specific facts from their resume or prior answers
- if they mentioned a tool, project, or impact earlier, you may refer back to it naturally

Role:
- Title: ${session.role?.title || 'N/A'}
- JD: ${session.role?.jd || 'N/A'}
- Focus areas: ${session.role?.areas || 'N/A'}

Candidate profile:
- Headline: ${session.resumeProfile?.headline || 'N/A'}
- Summary: ${session.resumeProfile?.summary || 'N/A'}
- Skills: ${(session.resumeProfile?.skills || []).join(', ') || 'N/A'}
- Projects: ${(session.resumeProfile?.projects || []).join(' | ') || 'N/A'}

Session signals:
- Resume skills: ${(signals.resumeSkills || []).join(', ') || 'N/A'}
- JD skills: ${(signals.jdSkills || []).join(', ') || 'N/A'}
- Education highlights: ${(signals.educationHighlights || []).join(' | ') || 'N/A'}
- Project highlights: ${(signals.projectHighlights || []).join(' | ') || 'N/A'}
- Impact hints: ${(signals.impactHints || []).join(' | ') || 'N/A'}

Current interview state:
- Stage: ${body.currentStage || 'introduction'}
- Current question: ${body.currentQuestion?.text || 'N/A'}
- Candidate message: ${body.candidateMessage || 'N/A'}
- Duration: ${body.durationMinutes || 10} minutes
- Elapsed: ${body.elapsedSeconds || 0} seconds

Interview memory:
${summarizeMemory(memory) || 'No memory yet.'}

Recent transcript:
${recentTranscript(body.history || []) || 'No prior turns yet.'}

Retrieved evidence:
${evidence.map((item) => `[${item.type}] ${item.text}`).join('\n') || 'No retrieved evidence.'}

Return ONLY valid JSON:
{
  "reply":"a direct human response to what the candidate said",
  "question":"optional next question to continue the interview, or empty string if not needed",
  "stage":"introduction|role_overview|behavioral|technical|candidate_questions|closing",
  "reason":"why this response/question helps",
  "isClarification":true|false,
  "shouldWrapUp":true|false
}`

  const fallback = {
    reply: 'I can read the details you uploaded, and I want to use them to keep this conversation relevant.',
    question: 'Could you walk me through one experience from your background that you think is most relevant here?',
    stage: body.currentStage || 'introduction',
    reason: 'Fallback conversational bridge.',
    isClarification: false,
    shouldWrapUp: false
  }

  return parseJSON(await callOllama(prompt, 650), fallback)
}

async function scoreTurn(session, body) {
  const memory = body.interviewMemory || session.latestMemory || {}
  const signals = session.signals || {}
  const evidence = await retrieveEvidence(session, `${body.question?.text || ''} ${body.answer || ''} ${memory.weakSignals?.join(' ') || ''}`, 6)
  const prompt = `You are a senior interviewer evaluating a candidate answer.

Role context: ${session.role?.jd || 'N/A'}
Question: "${body.question?.text || ''}"
Expected key points: "${body.question?.answer || ''}"
Candidate response: "${body.answer || ''}"

Interview memory:
${summarizeMemory(memory) || 'No memory yet.'}

Session signals:
- Resume skills: ${(signals.resumeSkills || []).join(', ') || 'N/A'}
- JD skills: ${(signals.jdSkills || []).join(', ') || 'N/A'}

Recent transcript:
${recentTranscript(body.history || [], 4) || 'No prior turns.'}

Retrieved evidence:
${evidence.map((item) => `[${item.type}] ${item.text}`).join('\n') || 'No retrieved evidence.'}

Return ONLY valid JSON:
{"relevance":<0-10>,"depth":<0-10>,"clarity":<0-10>,"correctness":<0-10>,"overall":<0-10>,"feedback":"<direct evidence-based feedback>","strengths":"<concrete strengths or 'None'>","improvements":"<specific improvements>","needsFollowUp":true|false,"followUpFocus":"<single short missing point>","structuredMemoryUpdates":{"education":["<education fact>"],"projectsMentioned":["<project or work item>"],"toolsClaimed":["<tool or technology>"],"ownershipEvidence":["<evidence of ownership/responsibility>"],"impactMetrics":["<metric/result>"]}}

Rules:
- Be direct and unsparing.
- Do not praise weak answers.
- needsFollowUp=true only if one focused clarification could realistically help.
- If the current topic already used a clarification, set needsFollowUp=false.
- If the answer is irrelevant, say so clearly.
- structuredMemoryUpdates should capture only concrete facts explicitly supported by the candidate's answer.
- If the candidate clearly says they are strongest or most comfortable with a particular tool/skill, include it in toolsClaimed.
- If a category is not supported, return an empty array for it.`

  const fallback = {
    relevance: 5,
    depth: 5,
    clarity: 5,
    correctness: 5,
    overall: 5,
    feedback: 'The answer is partial and lacks enough specific evidence.',
    strengths: 'None',
    improvements: 'Give a direct answer with more detail and a concrete example.',
    needsFollowUp: false,
    followUpFocus: '',
    structuredMemoryUpdates: {
      education: [],
      projectsMentioned: [],
      toolsClaimed: [],
      ownershipEvidence: [],
      impactMetrics: []
    }
  }

  const parsed = parseJSON(await callOllama(prompt, 800), fallback)
  if (memory.clarificationUsedForCurrentTopic) parsed.needsFollowUp = false
  return parsed
}

async function buildReport(session, body) {
  const transcript = (body.qaLog || []).map((item, index) => (
    `Q${index + 1} [${item.stage}]: ${item.question}
Candidate: ${item.answer}
Scores: relevance=${item.relevance}, depth=${item.depth}, clarity=${item.clarity}, correctness=${item.correctness}`
  )).join('\n\n')

  const prompt = `You are a senior hiring manager writing a formal report for ${session.candidateName || 'the candidate'} for the role ${session.role?.title || 'N/A'}.

Interview memory:
${summarizeMemory(body.interviewMemory || session.latestMemory || {}) || 'No memory provided.'}

Structured candidate facts:
- Education: ${(body.interviewMemory?.education || session.latestMemory?.education || []).join(' | ') || 'N/A'}
- Projects mentioned: ${(body.interviewMemory?.projectsMentioned || session.latestMemory?.projectsMentioned || []).join(' | ') || 'N/A'}
- Tools claimed: ${(body.interviewMemory?.toolsClaimed || session.latestMemory?.toolsClaimed || []).join(', ') || 'N/A'}
- Ownership evidence: ${(body.interviewMemory?.ownershipEvidence || session.latestMemory?.ownershipEvidence || []).join(' | ') || 'N/A'}
- Impact metrics: ${(body.interviewMemory?.impactMetrics || session.latestMemory?.impactMetrics || []).join(' | ') || 'N/A'}

Transcript:
${transcript}

Return ONLY valid JSON:
{
  "executiveSummary":"<4-5 sentence summary>",
  "technicalStrength":"<specific technical observation>",
  "communicationStrength":"<specific communication observation>",
  "areasForGrowth":"<2 specific development areas>",
  "benchmarkAnalysis":"<comparison against expected bar>",
  "hiringSuggestion":"<clear recommendation>"
}`

  const fallback = {
    executiveSummary: 'The interview covered multiple areas relevant to the role and produced enough evidence for an informed recommendation.',
    technicalStrength: 'The candidate demonstrated some relevant technical understanding.',
    communicationStrength: 'The candidate was able to communicate parts of their experience during the discussion.',
    areasForGrowth: 'The candidate should provide more specific examples and stronger evidence of ownership.',
    benchmarkAnalysis: 'Performance showed a mix of strengths and gaps against the expected benchmark.',
    hiringSuggestion: 'Proceed only if additional validation is planned.'
  }

  return parseJSON(await callOllama(prompt, 1000), fallback)
}

async function getSessionOrThrow(id) {
  const store = await readStore()
  const session = store.sessions[id]
  if (!session) throw new Error('RAG session not found.')
  return session
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    })
    res.end()
    return
  }

  try {
    const url = new URL(req.url, `http://localhost:${PORT}`)

    if (req.method === 'GET' && url.pathname === '/api/rag/health') {
      json(res, 200, { ok: true, model: GENERATE_MODEL, embedModel: EMBED_MODEL })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/rag/sessions') {
      const body = await parseBody(req)
      const session = await createRagSession(body)
      json(res, 200, { sessionId: session.id })
      return
    }

    const sessionMatch = url.pathname.match(/^\/api\/rag\/sessions\/([^/]+)\/(turn|score|report|memory|conversation)$/)
    if (req.method === 'POST' && sessionMatch) {
      const [, sessionId, action] = sessionMatch
      const body = await parseBody(req)
      const session = await getSessionOrThrow(sessionId)

      if (body.interviewMemory) {
        await updateStore((store) => {
          if (store.sessions[sessionId]) store.sessions[sessionId].latestMemory = body.interviewMemory
          return store
        })
      }

      if (action === 'turn') {
        const result = await generateTurn(session, body)
        json(res, 200, result)
        return
      }

      if (action === 'score') {
        const result = await scoreTurn(session, body)
        json(res, 200, result)
        return
      }

      if (action === 'report') {
        const result = await buildReport(session, body)
        json(res, 200, result)
        return
      }

      if (action === 'conversation') {
        const result = await generateConversationReply(session, body)
        json(res, 200, result)
        return
      }

      if (action === 'memory') {
        json(res, 200, { memory: session.latestMemory || null })
        return
      }
    }

    json(res, 404, { error: 'Not found' })
  } catch (error) {
    json(res, 500, { error: error?.message || 'Server error' })
  }
})

server.listen(PORT, () => {
  console.log(`RecruitAI RAG server running on http://localhost:${PORT}`)
})
