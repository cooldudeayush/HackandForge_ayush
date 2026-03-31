const MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'deepseek-r1:8b'
const API_URL = import.meta.env.VITE_OLLAMA_API_URL || 'http://localhost:11434/api/generate'
const RAG_API_URL = import.meta.env.VITE_RAG_API_URL || ''

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`)
    error.status = res.status
    throw error
  }
  return data
}

async function callOllama(prompt, options = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: options.maxTokens || 900
      }
    })
  })

  let data = null
  try {
    data = await res.json()
  } catch {
    throw new Error('Ollama returned a non-JSON response. Make sure ollama serve is running on localhost:11434.')
  }

  if (!res.ok) {
    const apiMessage = data?.error || data?.message || `Ollama request failed (${res.status})`
    throw new Error(apiMessage)
  }

  const text = data?.response
  if (!text || typeof text !== 'string') {
    throw new Error('Ollama returned an unexpected response format.')
  }

  return text.replace(/```json|```/g, '').trim()
}

function parseJSON(text, fallback) {
  try { return JSON.parse(text) }
  catch { return fallback }
}

export async function createRagInterviewSession(payload) {
  const data = await postJson(`${RAG_API_URL}/api/rag/sessions`, payload)
  return data.sessionId
}

export async function generateConversationReply({
  role,
  ragSessionId,
  candidateMessage,
  currentQuestion,
  currentStage,
  history = [],
  durationMinutes = 10,
  elapsedSeconds = 0,
  interviewMemory = null
}) {
  try {
    return await postJson(`${RAG_API_URL}/api/rag/sessions/${ragSessionId}/conversation`, {
      candidateMessage,
      currentQuestion,
      currentStage,
      history,
      durationMinutes,
      elapsedSeconds,
      interviewMemory
    })
  } catch (error) {
    if (error?.status !== 404) throw error

    const fallbackTurn = await generateInterviewTurn({
      ragSessionId,
      role,
      history,
      currentStage,
      durationMinutes,
      elapsedSeconds,
      previousQuestion: currentQuestion?.text || '',
      previousAnswer: candidateMessage,
      previousFeedback: 'Candidate asked a conversational question. Respond briefly and continue the interview naturally.',
      forceClarification: false,
      followUpFocus: '',
      previousWasClarification: false,
      interviewMemory
    })

    return {
      reply: 'I can work from the details you uploaded and use them to keep the interview relevant.',
      question: fallbackTurn.question || '',
      stage: fallbackTurn.stage || currentStage,
      reason: fallbackTurn.reason || 'Fallback after missing conversation endpoint.',
      isClarification: Boolean(fallbackTurn.isClarification),
      shouldWrapUp: Boolean(fallbackTurn.shouldWrapUp)
    }
  }
}

export async function scoreAnswer(question, answer, role, context = {}) {
  if (context.ragSessionId) {
    return postJson(`${RAG_API_URL}/api/rag/sessions/${context.ragSessionId}/score`, {
      question,
      answer,
      history: context.history || [],
      interviewMemory: context.interviewMemory || null
    })
  }

  const groundedContext = [
    context.jobDescription ? `Uploaded job description:\n${context.jobDescription}` : '',
    context.resumeChunks?.length ? `Relevant resume evidence:\n${context.resumeChunks.join('\n')}` : '',
    context.profileSummary ? `Candidate background summary: ${context.profileSummary}` : '',
    context.questionReason ? `Why this question was asked: ${context.questionReason}` : '',
    context.interviewMemory ? `Interview memory:\n${context.interviewMemory}` : '',
    context.retrievedContext ? `Retrieved interview context:\n${context.retrievedContext}` : '',
    context.recentHistory ? `Recent interview history:\n${context.recentHistory}` : ''
  ].filter(Boolean).join('\n\n')

  const prompt = `You are a senior technical interviewer assessing a candidate for ${role.title} at a leading enterprise company.

Role context: ${role.jd}
Question asked: "${question.text}"
Expected key points: "${question.answer}"
Candidate's response: "${answer}"
${groundedContext ? `\nGrounding context:\n${groundedContext}\n` : ''}

Evaluate objectively. Return ONLY valid JSON with no markdown fences:
{"relevance":<0-10>,"depth":<0-10>,"clarity":<0-10>,"correctness":<0-10>,"overall":<0-10>,"feedback":"<2-3 sentences of specific, actionable feedback referencing the response>","strengths":"<1-2 concrete strengths in this specific answer>","improvements":"<1-2 specific, actionable improvements>","needsFollowUp":true|false,"followUpFocus":"<short phrase describing the single most important missing point to clarify>"}

Scoring calibration:
- 9-10: Comprehensive, technically precise, well-structured, covers all key points with examples
- 7-8: Good coverage, mostly correct, minor gaps or imprecision
- 5-6: Partial coverage, some correct elements, notable gaps
- 3-4: Surface-level, vague, missing key concepts
- 1-2: Incorrect, evasive, or irrelevant

Tone rules:
- Be direct and unsparing.
- Do not sugarcoat weak answers.
- Do not invent strengths if the answer is poor.
- If the answer misses the question, say so clearly.
- Feedback should be candid, professional, and evidence-based.
- Set needsFollowUp=true only if one focused follow-up could realistically clarify an important gap.
- If the answer is too thin, evasive, or already had a clarification attempt, prefer needsFollowUp=false and let the interview move on.
- followUpFocus must be short and concrete, not a full question.`

  const text = await callOllama(prompt, { maxTokens: 800 })
  return parseJSON(text, {
    relevance: 5, depth: 5, clarity: 6, correctness: 5, overall: 5.2,
    feedback: 'Your answer shows some understanding. Adding more technical specifics and concrete examples would strengthen it significantly.',
    strengths: 'Demonstrated awareness of the core concept.',
    improvements: 'Provide specific technical details and a real-world example from your experience.',
    needsFollowUp: false,
    followUpFocus: ''
  })
}

export async function generateSessionSummary(qaLog, role, benchmark, context = {}) {
  if (context.ragSessionId) {
    return postJson(`${RAG_API_URL}/api/rag/sessions/${context.ragSessionId}/report`, {
      qaLog,
      interviewMemory: context.interviewMemory || null
    })
  }

  const transcript = qaLog.map((q, i) =>
    `Q${i + 1} [${q.stage}]: ${q.question}\nCandidate: ${q.answer}\nScores - Relevance:${q.relevance} Depth:${q.depth} Clarity:${q.clarity} Correctness:${q.correctness}`
  ).join('\n\n')

  const prompt = `You are a senior HR director writing a formal evaluation report for a ${role.title} candidate.

Benchmark expectations for this role (0-100 scale):
- Relevance: ${benchmark.relevance}%, Depth: ${benchmark.depth}%, Clarity: ${benchmark.clarity}%, Correctness: ${benchmark.correctness}%

Full interview transcript:
${transcript}

Write a professional, evidence-based evaluation. Return ONLY valid JSON with no markdown:
{
  "executiveSummary": "<4-5 sentence professional summary citing specific evidence from answers>",
  "technicalStrength": "<specific technical observation with example from answers>",
  "communicationStrength": "<communication and articulation observation>",
  "areasForGrowth": "<2 specific, evidence-based development areas>",
  "benchmarkAnalysis": "<3-4 sentences explicitly comparing candidate performance against role benchmark expectations, noting which dimensions meet/exceed/fall below bar and by how much>",
  "hiringSuggestion": "<2-3 sentence final recommendation with clear reasoning based on evidence>"
}`

  const text = await callOllama(prompt, { maxTokens: 1100 })
  return parseJSON(text, {
    executiveSummary: 'The candidate completed the structured interview across all three stages. Performance was evaluated across technical knowledge, communication clarity, and behavioral competencies.',
    technicalStrength: 'Demonstrated foundational understanding of relevant technical concepts.',
    communicationStrength: 'Responses were generally clear and structured.',
    areasForGrowth: 'Deeper technical depth and more concrete examples from past experience would strengthen the candidacy.',
    benchmarkAnalysis: 'Candidate performance was evaluated against the benchmark profile for this role. Some dimensions met expectations while others showed room for development.',
    hiringSuggestion: 'Based on the interview performance, further evaluation is recommended to confirm fit for this role.'
  })
}

export async function generateFollowUp(previousAnswer, role, stage) {
  const prompt = `You are an experienced interviewer conducting a ${stage} interview for ${role.title}.

The candidate just answered: "${previousAnswer}"

Generate ONE short, incisive follow-up question (max 25 words) that probes deeper into a specific gap or interesting point in their answer. Return ONLY the question text, no quotes, no explanation.`

  const text = await callOllama(prompt, { maxTokens: 100 })
  return text.trim().replace(/^["']|["']$/g, '')
}

export async function generateResumeQuestionSet({ role, resumeText, resumeProfile, questionCount = 6 }) {
  const prompt = `You are an expert hiring panel designing personalized interview questions for a ${role.title} candidate.

Role context:
- Title: ${role.title}
- Job description: ${role.jd}
- Focus areas: ${role.areas}

Candidate resume summary:
- Headline: ${resumeProfile.headline || 'N/A'}
- Summary: ${resumeProfile.summary || 'N/A'}
- Years of experience: ${resumeProfile.yearsExperience || 'Unknown'}
- Skills: ${(resumeProfile.skills || []).join(', ') || 'N/A'}
- Companies: ${(resumeProfile.companies || []).join(', ') || 'N/A'}
- Projects: ${(resumeProfile.projects || []).join(' | ') || 'N/A'}

Resume text:
${resumeText.slice(0, 9000)}

Generate ${questionCount} highly relevant interview questions grounded in the candidate's background.

Requirements:
- Mix behavioral, experience-based HR, and technical questions.
- Ask about real resume evidence, not generic trivia.
- Include at least 1 behavioral/HR question, 1 experience deep-dive question, and 1 technical question tied to listed skills/projects.
- Questions must be concise, interviewer-ready, and specific.
- Return ONLY valid JSON as an array.

Schema:
[
  {
    "stage":"intro|technical|behavioral",
    "difficulty":"easy|medium|hard",
    "type":"resume-experience|resume-technical|resume-behavioral|hr",
    "text":"question text",
    "answer":"key points the interviewer should listen for",
    "reason":"why this question is relevant to the resume"
  }
]`

  const fallback = [
    {
      stage: 'intro',
      difficulty: 'medium',
      type: 'resume-experience',
      text: `Walk me through the most relevant project on your resume and explain the problem, your ownership, and the measurable outcome.`,
      answer: 'Clear project context, exact ownership, decisions taken, tools used, results, and lessons learned.',
      reason: 'Anchors the interview in the candidate’s actual resume work.'
    },
    {
      stage: 'technical',
      difficulty: 'medium',
      type: 'resume-technical',
      text: `Pick one skill listed on your resume that you use heavily. Describe a production-grade challenge you solved with it.`,
      answer: 'Specific technical challenge, constraints, trade-offs, implementation details, and impact.',
      reason: 'Tests depth behind claimed skills.'
    },
    {
      stage: 'behavioral',
      difficulty: 'medium',
      type: 'resume-behavioral',
      text: `Tell me about a difficult decision or conflict you faced in one of the roles on your resume and how you handled it.`,
      answer: 'Situation, stakeholders, decision path, communication style, outcome, and reflection.',
      reason: 'Connects behavioral assessment to real candidate history.'
    }
  ]

  const text = await callOllama(prompt, { maxTokens: 1200 })
  return parseJSON(text, fallback)
}

export async function generateInterviewTurn({
  ragSessionId = '',
  role,
  resumeText = '',
  resumeProfile = {},
  jobDescriptionText = '',
  history = [],
  currentStage = 'introduction',
  durationMinutes = 10,
  elapsedSeconds = 0,
  previousQuestion = '',
  previousAnswer = '',
  previousFeedback = '',
  forceClarification = false,
  followUpFocus = '',
  previousWasClarification = false,
  interviewContext = null,
  interviewMemory = null
}) {
  if (ragSessionId) {
    const data = await postJson(`${RAG_API_URL}/api/rag/sessions/${ragSessionId}/turn`, {
      role,
      history,
      currentStage,
      durationMinutes,
      elapsedSeconds,
      previousQuestion,
      previousAnswer,
      previousFeedback,
      forceClarification,
      followUpFocus,
      previousWasClarification,
      interviewMemory
    })
    return data.turn
  }

  const remainingSeconds = Math.max(0, durationMinutes * 60 - elapsedSeconds)
  const transcript = history.slice(-6).map((item, index) => (
    `Turn ${index + 1}
Question: ${item.question}
Candidate answer: ${item.answer}
Feedback summary: ${item.feedback || 'N/A'}
Stage: ${item.stage || currentStage}`
  )).join('\n\n')

  const prompt = `You are conducting a realistic live interview for the role ${role.title}.

Your job is to behave like a strong human interviewer:
- be conversational, natural, and professional
- ask one question at a time
- use the job description, role context, and resume context
- if the previous answer was vague, ask a sharper follow-up for depth or clarity
- if the answer was strong enough, move to the next relevant area
- avoid sounding like a quiz engine
- do not mention "RAG", "question bank", or internal reasoning
- do not say "based on your resume" in every turn
- make the tone warm, engaging, and interviewer-like
- do not dump long context in one turn
- ask concise, human questions that feel like a live conversation

Role title: ${role.title}
Job description: ${role.jd}
Uploaded job description:
${jobDescriptionText.slice(0, 6000) || 'No uploaded job description.'}
Role focus areas: ${role.areas}
Current interview phase: ${currentStage}
Interview duration: ${durationMinutes} minutes
Elapsed time: ${elapsedSeconds} seconds
Remaining time: ${remainingSeconds} seconds

Candidate profile:
- Headline: ${resumeProfile.headline || 'N/A'}
- Summary: ${resumeProfile.summary || 'N/A'}
- Skills: ${(resumeProfile.skills || []).join(', ') || 'N/A'}
- Companies: ${(resumeProfile.companies || []).join(', ') || 'N/A'}
- Projects: ${(resumeProfile.projects || []).join(' | ') || 'N/A'}

Resume text:
${resumeText.slice(0, 7000) || 'No resume uploaded.'}

Recent interview history:
${transcript || 'No prior turns yet. Start the interview.'}

Retrieved interview context:
${interviewContext ? `
- Resume evidence:
${interviewContext.resumeEvidence?.join('\n') || 'N/A'}
- Job description evidence:
${interviewContext.jdEvidence?.join('\n') || 'N/A'}
- Recent questions:
${interviewContext.recentQuestions?.join('\n') || 'N/A'}
- Recent answers:
${interviewContext.recentAnswers?.join('\n') || 'N/A'}
- Open evaluation gaps:
${interviewContext.weakAreas?.join('\n') || 'N/A'}
` : 'No retrieved context available.'}

Interview memory:
${interviewMemory ? `
${interviewMemory.currentTopic ? `- Current topic: ${interviewMemory.currentTopic}` : ''}
${interviewMemory.coveredTopics?.length ? `- Covered topics: ${interviewMemory.coveredTopics.join(', ')}` : ''}
${interviewMemory.candidateClaims?.length ? `- Candidate claims: ${interviewMemory.candidateClaims.join(' | ')}` : ''}
${interviewMemory.weakSignals?.length ? `- Weak signals: ${interviewMemory.weakSignals.join(' | ')}` : ''}
- Clarification already used for current topic: ${interviewMemory.clarificationUsedForCurrentTopic ? 'yes' : 'no'}
` : 'No interview memory available yet.'}

Most recent answer context:
- Previous question: ${previousQuestion || 'N/A'}
- Previous answer: ${previousAnswer || 'N/A'}
- Evaluation summary: ${previousFeedback || 'N/A'}
- Forced clarification requested: ${forceClarification ? 'yes' : 'no'}
- Clarification focus: ${followUpFocus || 'N/A'}
- Previous question was already a clarification: ${previousWasClarification ? 'yes' : 'no'}

Return ONLY valid JSON:
{
  "stage":"introduction|role_overview|behavioral|technical|candidate_questions|closing",
  "leadIn":"a short natural interviewer response before the next question",
  "question":"the next interviewer question",
  "answerGuide":"what a strong answer should cover",
  "reason":"internal short rationale for why this question helps evaluate the candidate",
  "isClarification":true|false,
  "shouldWrapUp":true|false
}

Rules:
- The question must be a single interviewer utterance, not a list.
- leadIn should be 1 short sentence max and should feel human, such as acknowledging, redirecting, or pressing for clarity.
- Keep it under 45 words.
- If forceClarification is true, ask exactly one focused follow-up that targets the missing point in different words.
- If previousWasClarification is true, do not ask another clarification on the same topic. Move to a new angle or new topic.
- Prefer a follow-up only when the missing point matters for evaluation and can likely be answered.
- Prefer phase transitions that feel natural.
- Interview flow should roughly follow:
  1. introduction / opening
  2. brief role or context framing
  3. structured behavioral and technical evaluation
  4. invite candidate questions near the end
  5. close with next steps
- The very first substantive turn should gather candidate background and context in a natural way.
- Use the uploaded job description when present to tailor the depth and direction of questions.
- Use the retrieved interview context to avoid asking generic questions when concrete resume or JD evidence is already available.
- Respect the interview memory so you do not revisit the same topic unless there is a strong reason.
- Use recent candidate responses to decide whether to probe deeper, clarify, or move on.
- Never repeat a previous question unless you are deliberately narrowing it into a much sharper follow-up.
- The interviewer should sound like they are listening. Briefly acknowledge what the candidate said before changing direction.
- If the candidate asks for clarification, rephrase once in simpler language, then move on if they are still unclear.
- If the interview has already covered enough evaluation and time is low, move toward candidate_questions or closing.
- Set shouldWrapUp=true only when time is nearly done and it is appropriate to close.`

  const fallback = {
    stage: currentStage,
    leadIn: currentStage === 'introduction' ? 'Thanks for joining today.' : 'Understood.',
    question: currentStage === 'technical'
      ? 'Can you walk me through a technically challenging project you worked on and the decisions you made?'
      : currentStage === 'behavioral'
        ? 'Tell me about a situation where you had to show ownership under pressure.'
        : currentStage === 'candidate_questions'
          ? 'Before we wrap up, what would you like to ask about the role or team?'
          : currentStage === 'closing'
            ? 'Thanks for sharing. Before we close, is there anything else you want to highlight?'
            : currentStage === 'role_overview'
              ? `To frame the conversation, what part of the ${role.title} role feels most aligned with your experience so far?`
              : 'To get started, could you briefly introduce yourself and highlight the experience most relevant to this role?',
    answerGuide: 'Context, ownership, decisions, trade-offs, results, and reflection.',
    reason: 'Fallback conversational question.',
    isClarification: forceClarification,
    shouldWrapUp: remainingSeconds <= 90
  }

  const text = await callOllama(prompt, { maxTokens: 500 })
  return parseJSON(text, fallback)
}
