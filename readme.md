# Al-Rahm

## MTE Kenya 2026 Hackathon Project Write-Up

### 👥 Team

1. Salma Adam
2. Aisha Gojo
3. Aaliyah Mnavu
4. Rene Bosire

## 1. Problem Statement & Target Audience

### The Problem

Large Language Models (LLMs) and digital triage tools are increasingly used as primary health resources, yet they suffer from severe accuracy gaps and "missed urgency" flags specifically regarding women's health. Historically, medical data and diagnostic benchmarks have underrepresented women's unique physiological and lifestyle factors, leading to misdiagnoses or clinical evaluation blind spots.

### The Target Audience

Healthcare researchers, AI safety engineers, clinical trial coordinators, and digital health practitioners looking to validate healthcare models across specialties like obstetrics, gynecology, oncology, and primary care.

## 2. Solution Overview

An evaluation matrix and dashboard designed to systematically test, score, and surface failure modes in health models across critical criteria. The application analyzes safety response metrics, tracks error types (such as dosage mistakes or missing differential diagnoses), and ensures data equity is maintained across women's health infrastructure.

## 3. Core Features & User Flow

- **Multi-Specialty Diagnostics Panel:** Evaluates input queries against distinct medical spheres, including OB-GYN, primary care, and oncology.
- **Error Category Classification:** Systematically tags and quantifies model mistakes like missed urgency flags, incorrect treatment tracking, and outdated guidelines.
- **Live Evaluation Metrics:** Dynamic dashboard visualization showing system performance benchmarks with actual real-time data flow.

## 4. Technical Architecture & Tech Stack

- **Frontend Cloud:** Will be hosted on [Vercel](https://vercel.com) using a framework like Next.js / React to guarantee rapid load speeds and global availability.
- **Backend & Processing:** Node.js / Python server architecture to run criteria validation rubrics against clinical dataset rules.
- **Database / Gateway:** Integrated with cloud data storage configurations to store persistent conversation data safely.
- **APIs / Third-Party Tools:** Safaricom Daraja API and Africa's Talking SMS API.

### Project Structure

```text
Rahma/
├── backend/
├── frontend/
└── readme.md
```

- `backend/`: Server-side processing, evaluation rubrics, database access, and API integrations.
- `frontend/`: Dashboard, diagnostics panels, and evaluation metrics visualization.

## 5. Known Limitations

1. The M-Pesa sandbox credentials sometimes delay responses; real-time updates might require a manual page refresh.
2. Mobile responsive views are fully optimized for Android, but may have slight visual alignment issues on smaller iOS screens.

## 6. AI Disclosure Statement

**How AI was utilized:** Using GitHub Copilot for boilerplate backend routing and troubleshooting database connection errors. Using ChatGPT to refine the copy for our landing page onboarding flow.

**What is being built natively:** All core business logic, API integrations, and visual CSS styling are going to be handwritten and debugged by the team.

**AI Implementation:** Utilized generative coding systems to assist with standard boilerplate endpoint configuration, Tailwind styling grids, and mockup text parsing structures.

**Native Code Architecture:** All underlying scoring rules, evaluation matrices, database storage structures, and local clinical context parameters were handwritten and verified by the development team.
