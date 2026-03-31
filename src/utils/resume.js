import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()

function normalizeWhitespace(text) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractSection(text, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`${escaped}[\\s\\S]*?(?=\\n[A-Z][A-Z &/]{2,}|$)`, 'i')
  const match = text.match(pattern)
  return match ? normalizeWhitespace(match[0]) : ''
}

function uniqueList(items, limit = 12) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, limit)
}

function extractSkills(text) {
  const skillsSection = extractSection(text, 'skills') || extractSection(text, 'technical skills')
  const inline = skillsSection || text
  const matches = inline.match(/\b(?:React|Node\.js|Node|JavaScript|TypeScript|Python|Java|C\+\+|AWS|Azure|GCP|Docker|Kubernetes|SQL|PostgreSQL|MongoDB|Redis|Kafka|Spark|Airflow|TensorFlow|PyTorch|NLP|Machine Learning|Deep Learning|System Design|REST|GraphQL|Microservices|CI\/CD|DevOps|Leadership|Product Strategy|Agile|Scrum|A\/B Testing)\b/gi) || []
  return uniqueList(matches, 16)
}

function extractCompanies(text) {
  const matches = text.match(/\b(?:at|with|for)\s+([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})/g) || []
  return uniqueList(matches.map((item) => item.replace(/^(at|with|for)\s+/i, '')), 8)
}

function extractEducation(text) {
  const education = extractSection(text, 'education')
  return education ? education.split('\n').slice(0, 4).join(' ').trim() : ''
}

function extractProjects(text) {
  const projects = extractSection(text, 'projects') || extractSection(text, 'project experience')
  const bullets = projects.match(/[-*]\s+.+/g) || []
  return uniqueList(bullets.map((item) => item.replace(/^[-*]\s+/, '')), 6)
}

export async function extractTextFromFile(file) {
  const lower = file.name.toLowerCase()

  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    const buffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: buffer }).promise
    const pages = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      const text = content.items.map((item) => item.str).join(' ')
      pages.push(text)
    }

    return normalizeWhitespace(pages.join('\n'))
  }

  if (
    file.type.startsWith('text/') ||
    lower.endsWith('.md') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.json')
  ) {
    return normalizeWhitespace(await file.text())
  }

  throw new Error('Unsupported file type. Please upload a PDF, TXT, MD, or JSON file.')
}

export function extractResumeProfile(text) {
  const normalized = normalizeWhitespace(text)
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean)
  const summary = lines.slice(0, 6).join(' ')
  const yearsMatch = normalized.match(/(\d+)\+?\s+years?\s+of\s+experience/i)
  const headline = lines[0] || 'Candidate'

  return {
    headline,
    summary,
    yearsExperience: yearsMatch ? yearsMatch[1] : '',
    skills: extractSkills(normalized),
    companies: extractCompanies(normalized),
    education: extractEducation(normalized),
    projects: extractProjects(normalized)
  }
}

export async function parseResumeFile(file) {
  const text = await extractTextFromFile(file)
  const profile = extractResumeProfile(text)

  return {
    fileName: file.name,
    text,
    profile
  }
}
