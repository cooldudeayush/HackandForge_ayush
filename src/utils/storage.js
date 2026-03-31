// src/utils/storage.js
import { DEFAULT_ROLES } from '../data/seed.js'

const KEY = 'recruitai_v4'
const DEFAULT_SECTION_QUESTION_COUNTS = {
  introduction: 1,
  role_overview: 1,
  behavioral: 2,
  technical: 3,
  candidate_questions: 1,
  closing: 1
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        roles: parsed.roles || DEFAULT_ROLES,
        sessions: parsed.sessions || [],
        settings: {
          difficulty: 'medium',
          qcount: 3,
          threshold: 65,
          sectionQuestionCounts: DEFAULT_SECTION_QUESTION_COUNTS,
          ...(parsed.settings || {})
        }
      }
    }
  } catch (e) {}
  return {
    roles: DEFAULT_ROLES,
    sessions: [],
    settings: { difficulty: 'medium', qcount: 3, threshold: 65, sectionQuestionCounts: DEFAULT_SECTION_QUESTION_COUNTS }
  }
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) {}
}

export function clearState() {
  localStorage.removeItem(KEY)
}
