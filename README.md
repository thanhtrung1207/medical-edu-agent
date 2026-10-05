---
title: Medical Education AI Agent
emoji: 🏥
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 8000
pinned: false
---

# Medical Education AI Agent 🏥

AI Agent hỗ trợ giảng dạy y khoa, được xây dựng trên Google Agent Development Kit (ADK).

## Features

- **Q&A Expert**: Trả lời câu hỏi y khoa dựa trên evidence-based medicine
- **Quiz Master**: Tạo câu hỏi trắc nghiệm theo format USMLE/NMLE
- **Case Study Analyst**: Phân tích ca lâm sàng
- **Exam Preparation**: Hỗ trợ ôn thi y khoa

## Tech Stack

- **Backend**: Python + Google ADK + FastAPI
- **Frontend**: Next.js + CopilotKit + Tailwind CSS
- **Vector DB**: ChromaDB (local) / Pinecone (production)
- **AI Model**: Google Gemini 2.0 Flash

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker & Docker Compose (optional)

### Setup

1. Clone and install dependencies:
```bash
cd medical-edu-agent
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Google API key
```

3. Run the backend:
```bash
uvicorn main:app --reload --port 8000
```

4. Run the frontend:
```bash
cd frontend
npm install
npm run dev
```

### Docker

```bash
docker-compose up -d
```

## Project Structure

```
medical-edu-agent/
├── agents/          # AI Agent definitions
├── tools/           # Custom tools for agents
├── data/            # Medical knowledge base data
├── frontend/        # Next.js web interface
├── tests/           # Test suite
├── main.py          # FastAPI server entry point
└── docker-compose.yml
```

## Architecture

```
Frontend (Next.js + CopilotKit) 
    ↕ AG-UI Protocol / REST API
Backend (Python + ADK + FastAPI)
    ├── Root Agent (Coordinator)
    ├── Q&A Expert Agent
    ├── Quiz Master Agent
    ├── Case Study Agent
    └── Exam Prep Agent
    ↕
Knowledge Base (ChromaDB + Medical PDFs)
```

## License

MIT
