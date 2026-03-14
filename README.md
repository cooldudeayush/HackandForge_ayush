# RecruitAI - Enterprise Interview Simulation Platform

An intelligent web-based interview simulation system powered by Ollama. Supports three user roles (Admin, Interviewer, Candidate), dynamic question progression across three stages, real-time AI scoring, benchmark comparison, admin access gating, and full PDF report export.

---

## Features

- **3 User Roles** - Admin, Interviewer, Candidate with dedicated dashboards
- **3 Interview Stages** - Introduction -> Technical Deep-Dive -> Behavioral
- **3 Built-in Roles** - Software Engineer (Backend), Data Scientist / ML Engineer, Product Manager
- **24 Pre-loaded Questions** - Covering all roles and stages at multiple difficulty levels
- **AI Scoring** (Ollama local model) - Rates each answer on Relevance, Depth, Clarity, and Correctness (0-100)
- **Real-time Feedback** - Strengths, improvements, and detailed feedback per answer
- **Benchmark Profiles** - Admin-configurable per-role expected scores used as reference targets
- **Dual Radar Chart** - Candidate vs benchmark overlay visualization
- **Gap Analysis Table** - Per-dimension comparison with meets/below status and visual bars
- **AI Executive Summary** - Auto-generated hire/no-hire recommendation with evidence-based reasoning
- **PDF Export** - Full report with all tables, scores, and analysis via jsPDF
- **Admin Access Gate** - Lightweight passcode lock for the admin workspace during demos
- **LocalStorage Persistence** - All data (sessions, roles, questions) stored in the browser
- **Session Timer** - Tracks interview duration

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Plain CSS with CSS variables (no framework) |
| AI Engine | Ollama local API |
| Charts | Custom SVG radar chart |
| PDF | jsPDF + jspdf-autotable |
| State | React Context + LocalStorage |

---

## Setup & Installation

### Prerequisites
- Node.js 18+
- Ollama installed locally with the `deepseek-r1:8b` model available

### 1. Install dependencies

```bash
cd recruitai
npm install
```

### 2. Configure Ollama

Run Ollama locally and the app will call your local model directly.

> **Important:** The app expects `ollama serve` to be running locally on port `11434`.

Create `.env`:

```env
VITE_OLLAMA_API_URL=http://localhost:11434/api/generate
VITE_OLLAMA_MODEL=gpt-oss:120b-cloud
VITE_ADMIN_PASSCODE=admin123
```

`VITE_ADMIN_PASSCODE` is optional. If omitted, the app falls back to `admin123`.

### 3. Start the development server

```bash
npm run dev
```

Open http://localhost:3001 in your browser.

### 4. Build for production

```bash
npm run build
npm run preview
```

---

## Project Structure

```text
recruitai/
|-- index.html
|-- package.json
|-- vite.config.js
`-- src/
    |-- main.jsx              # Entry point
    |-- App.jsx               # Screen router
    |-- AppContext.jsx        # Global state (React Context)
    |-- index.css             # Design system / global styles
    |-- data/
    |   `-- seed.js           # Default roles and questions
    |-- utils/
    |   |-- ai.js             # Ollama local API calls (scoring, summary)
    |   |-- pdf.js            # PDF report export
    |   `-- storage.js        # LocalStorage helpers
    |-- components/
    |   |-- UI.jsx            # Shared components (badges, score bars, etc.)
    |   |-- RadarChart.jsx    # SVG dual radar chart
    |   `-- Topbar.jsx        # Top navigation bar
    `-- pages/
        |-- Login.jsx         # Role selection screen
        |-- Admin.jsx         # Admin dashboard (roles, benchmarks, questions, settings)
        |-- Interviewer.jsx   # Session launch + reports list
        |-- CandidateSetup.jsx # Candidate profile form
        |-- Interview.jsx     # Live interview chat engine
        `-- Report.jsx        # Full evaluation report
```

---

## How to Use

## Demo Access

- **Admin demo passcode:** `admin123`
- This passcode is intended only for hackathon evaluation and prototype walkthroughs.

### As Admin
1. Enter as **Admin**
2. Unlock the admin workspace with the configured passcode
3. **Job Roles** tab - view or add custom roles with JD and expertise areas
4. **Benchmarks** tab - set expected minimum scores per dimension for each role using sliders
5. **Question Bank** tab - view all 24 default questions or add custom ones; filter by role/stage
6. **Settings** tab - configure default difficulty, questions per stage, and hire threshold

### As Interviewer
1. Enter as **Interviewer**
2. **Launch Session** tab - enter candidate name, select role and difficulty, click Launch
3. **All Reports** tab - browse completed sessions; click any to open the full report

### As Candidate
1. Enter as **Candidate**
2. Fill in your profile (name, role, experience)
3. Complete 3 stages of questions - type answers and submit
4. View your full evaluation report with scores, radar chart, benchmark comparison, and AI recommendation

---

## Evaluation Dimensions

| Dimension | What it measures |
|---|---|
| **Relevance** | How directly the answer addresses the question |
| **Depth** | Technical depth, detail, and completeness |
| **Clarity** | Structure, articulation, and communication quality |
| **Correctness** | Factual and technical accuracy |

---

## Extending the Platform

- **Add a new role:** Admin -> Job Roles -> Add Role, then Admin -> Question Bank -> add questions for that role
- **Adjust benchmarks:** Admin -> Benchmarks -> slide per-dimension targets for any role
- **Change AI model:** Update `VITE_OLLAMA_MODEL` in `.env`
- **Change admin passcode:** Update `VITE_ADMIN_PASSCODE` in `.env`
- **Add voice input:** Integrate Web Speech API in `Interview.jsx` alongside the textarea
- **Backend integration:** Replace `src/utils/storage.js` with API calls to a real database

---

## Demo Walkthrough (Hackathon)

1. **Admin** -> Benchmarks -> raise SWE benchmark to 80% to make it challenging
2. **Interviewer** -> Launch Session -> "Priya Sharma", Software Engineer (Backend), Hard
3. **Candidate** -> Complete the interview (answer all 9 questions across 3 stages)
4. **Interviewer** -> All Reports -> open the session -> review full report with radar chart + benchmark gap analysis + PDF export

---

## Why Ollama (Local AI)?

| Feature | Cloud API | RecruitAI (Ollama) |
|---|---|---|
| Data privacy | No - Sent to cloud | Yes - Stays on device |
| API cost | No - Pay per call | Yes - Completely free |
| Internet required | No - Yes | Yes - Works offline |
| Model control | No - Fixed by provider | Yes - Swap any model |

---

## Future Scope

- [ ] Voice input support via Web Speech API
- [ ] Multi-language interview support
- [ ] PostgreSQL / Firebase backend for enterprise multi-user deployment
- [ ] Email delivery of PDF reports to HR inbox
- [ ] Calendar integration for scheduling interview sessions
- [ ] Interviewer effectiveness scoring alongside candidate scoring
- [ ] Custom scoring rubric configurable per company
- [ ] Auto-generated follow-up questions based on weak answers

---

## Built-in Roles

| Role | Expertise Areas |
|---|---|
| Software Engineer (Backend) | System Design, APIs, Databases, Algorithms, Scalability |
| Data Scientist / ML Engineer | Python, Machine Learning, Statistics, MLOps, SQL |
| Product Manager | Strategy, Roadmapping, Analytics, Agile, Stakeholder Management |

---

## Team

> Built with love for **Hack & Forge Hackathon 2025**

| | |
|---|---|
| Developer | Ayush |
| GitHub | [cooldudeayush](https://github.com/cooldudeayush) |
| Hackathon | Hack & Forge 2025 |
| Track | Enterprise AI |

---

## Notes for Judges

- All AI processing is local - no cloud credentials required
- App works offline once Ollama and the model are downloaded
- Admin configuration is protected by a lightweight passcode gate for demo control
- Data persists in browser LocalStorage - clears if browser data is wiped
- node_modules and dist are included for zero-setup convenience

---

## Contributing

Pull requests are welcome.
For major changes, please open an issue first to discuss.

---

## License

MIT - free to use, modify, and distribute.

---
