# RecruitAI

RecruitAI is an AI-powered interview simulation platform for structured candidate evaluation. It helps admins configure interview flows, lets interviewers run role-based sessions, and gives candidates detailed feedback with scoring, benchmark comparison, and exportable reports.

## Core Capabilities

- Multi-role experience for Admin, Interviewer, and Candidate
- Structured interview flow across introduction, technical, and behavioral stages
- AI-generated interview turns and answer scoring through Ollama
- Resume-aware questioning with PDF resume parsing
- Optional RAG-backed interview context server for grounded follow-up questions
- Benchmark-based candidate evaluation across multiple scoring dimensions
- Dual radar chart and gap analysis views in the final report
- PDF export for full interview summaries
- Local persistence for sessions, roles, benchmarks, and question banks

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Styling | CSS |
| AI | Ollama |
| Charts | Recharts + custom UI |
| PDF | jsPDF + jspdf-autotable |
| Resume Parsing | pdfjs-dist |
| Optional Backend | Node.js HTTP server for RAG workflows |

## Project Structure

```text
recruitai/
|-- server/
|   |-- index.js
|   `-- data/
|       `-- rag-store.json
|-- src/
|   |-- components/
|   |-- data/
|   |-- pages/
|   |-- utils/
|   |-- App.jsx
|   |-- AppContext.jsx
|   |-- index.css
|   `-- main.jsx
|-- index.html
|-- package.json
|-- package-lock.json
|-- vite.config.js
`-- README.md
```

## Main Workflows

### Admin

- Configure job roles, benchmarks, and interview settings
- Manage question banks for different roles and stages
- Control admin access with a passcode

### Interviewer

- Launch interview sessions for selected roles and difficulty levels
- Review completed interview reports
- Compare candidate performance against benchmarks

### Candidate

- Upload profile details and resume
- Complete a guided AI interview
- Receive a structured evaluation report with strengths, gaps, and recommendations

## Setup

### Prerequisites

- Node.js 18+
- Ollama installed locally
- A downloaded Ollama model such as `deepseek-r1:8b` or the model configured in your `.env`

### Install dependencies

```bash
npm install
```

### Configure environment

Create a `.env` file in the project root:

```env
VITE_OLLAMA_API_URL=http://localhost:11434/api/generate
VITE_OLLAMA_MODEL=deepseek-r1:8b
VITE_ADMIN_PASSCODE=admin123
VITE_RAG_API_URL=http://localhost:3030
```

Notes:

- `VITE_ADMIN_PASSCODE` is optional. If omitted, the app uses `admin123`.
- `VITE_RAG_API_URL` is only needed when using the RAG server.

### Start the frontend

```bash
npm run dev
```

### Start the optional RAG server

```bash
npm run server
```

### Build for production

```bash
npm run build
npm run preview
```

## How It Works

1. An admin defines interview roles, scoring expectations, and question banks.
2. A candidate can upload resume details that are parsed into structured signals.
3. The platform generates interview turns based on role context, prior answers, and optional retrieved evidence.
4. Each response is scored on relevance, depth, clarity, and correctness.
5. The final report summarizes performance, compares it against benchmark targets, and can be exported as a PDF.

## Evaluation Dimensions

| Dimension | Meaning |
|---|---|
| Relevance | How directly the answer addresses the question |
| Depth | Technical or situational depth in the response |
| Clarity | Communication quality and structure |
| Correctness | Accuracy of the answer |

## Optional RAG Mode

RecruitAI includes an optional Node.js RAG server that can:

- Create session-level context from uploaded resumes and job descriptions
- Retrieve relevant evidence for interview turns
- Generate grounded follow-up questions
- Produce more context-aware scoring and final reports

If you do not need RAG-backed interviews, the frontend can still run using direct Ollama calls.

## Customization

- Update interview models through `VITE_OLLAMA_MODEL`
- Change the admin passcode through `VITE_ADMIN_PASSCODE`
- Add or edit default roles and questions in [`src/data/seed.js`](c:\Users\ayush\Desktop\recruitai\src\data\seed.js)
- Extend AI behavior in [`src/utils/ai.js`](c:\Users\ayush\Desktop\recruitai\src\utils\ai.js)
- Modify RAG behavior in [`server/index.js`](c:\Users\ayush\Desktop\recruitai\server\index.js)

## Scripts

```bash
npm run dev
npm run server
npm run build
npm run preview
```

## Repository

GitHub: [cooldudeayush/Recruit_ai](https://github.com/cooldudeayush/Recruit_ai)
