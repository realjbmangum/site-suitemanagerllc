# PRD — Suite Manager LLC Website
> Status: DRAFT | Date: Feb 26, 2026 | Owner: Brian Mangum (for Chris)

---

## 1. Overview

### What We're Building
A marketing website for **Suite Manager LLC** — a full-service hotel operations management company. The site's sole job is to convince hotel owners and investors to reach out to Chris.

### Domain
`suitemanagerllc.com` (owned, hosted on Cloudflare Pages)

### Stack
- Astro + Tailwind CSS
- Cloudflare Pages (deploy)
- No CMS needed — static content
- Contact form → Web3Forms (or mailto fallback)

---

## 2. Problem Statement

Hotel owners who want to step away from day-to-day operations need a trusted operator. Chris needs a professional web presence that:
- Establishes instant credibility
- Clearly explains what Suite Manager does
- Gets potential clients to pick up the phone or fill out a form

---

## 3. Target Audience

**Primary:** Hotel owners and investors who own an independent or boutique hotel and need someone to run it.

**Pain points:**
- Tired of managing staff, reviews, OTA channels, and operations themselves
- Worried about occupancy rates, RevPAR, guest experience
- Want a professional operator — not a large corporate chain management company
- Need someone local/personal they can trust

**Decision trigger:** "I own this hotel. I don't want to run it anymore. Who do I call?"

---

## 4. Brand & Design Direction

### Vibe
**Modern & approachable** — professional but warm. Boutique feel. Not stuffy or corporate.

### Palette (to be refined in design phase)
- Warm neutrals (cream, warm white, soft beige)
- One rich accent color (deep teal, navy, or warm slate — research competitors to decide)
- Clean typography (serif for headings to feel premium, sans-serif for body)

### Tone of Voice
- Confident but conversational
- Partnership-focused ("We run it together" energy)
- Specific about outcomes (occupancy, guest experience, revenue)
- Never buzzword-heavy

### Logo
- Design from scratch — needs to feel premium and hospitality-forward
- Simple wordmark or icon + wordmark
- Must work on light and dark backgrounds

---

## 5. Pages & Content Architecture

### Required Pages (MVP)

| Page | Purpose |
|------|---------|
| **Home** | First impression. Problem → Solution → Trust → CTA |
| **Services** | What Suite Manager actually does (operations, staffing, revenue mgmt, etc.) |
| **About** | Who Chris is, his background, why he started this |
| **Contact** | Form + phone + email. Low friction. |

### Optional (Phase 2)
- Portfolio / Properties We Manage
- Case studies / Results
- Blog / Insights

---

## 6. Homepage Structure (Wireframe)

```
[NAV] Suite Manager LLC | Services | About | Contact | [Book a Call →]

[HERO]
  Headline: "Your Hotel. Expertly Managed."
  Subhead: "Suite Manager LLC handles the day-to-day so you can focus on what matters."
  CTA: [Let's Talk] + secondary: "See how it works ↓"
  Visual: Hero image (luxury hotel lobby or exterior — stock OK for now)

[TRUST BAR]
  X properties managed | X years experience | [any certs/affiliations]

[PROBLEM SECTION]
  "Hotel ownership should be passive."
  Pain points: missed calls, staffing nightmares, bad reviews, OTA chaos
  → "That's where we come in."

[SERVICES OVERVIEW]
  4-6 service tiles: Operations, Revenue Management, Guest Experience,
  Staff Management, OTA/Distribution, Reporting & Owner Portal

[HOW IT WORKS]
  Step 1: Discovery call → Step 2: Property assessment → Step 3: Transition → Step 4: Results

[ABOUT / CREDIBILITY]
  Chris's background, philosophy, brief personal story
  [Learn More About Us →]

[TESTIMONIALS / SOCIAL PROOF]
  If Chris has any — otherwise placeholder style, add later

[FINAL CTA]
  "Ready to hand off the keys?"
  [Schedule a Discovery Call]

[FOOTER]
```

---

## 7. Services Page Detail

Suite Manager LLC should clearly describe these service areas (to be refined with Chris):
- **Hotel Operations Management** — Daily ops, staff, vendor relationships
- **Revenue Management** — Pricing strategy, OTA channel management, occupancy optimization
- **Guest Experience** — Review management, guest communication, standards enforcement
- **Staff & HR** — Hiring, training, retention, scheduling
- **Financial Reporting** — Monthly P&L, owner reporting, budget management
- **Capital Projects** — Renovation oversight, FF&E purchasing

---

## 8. About Page Direction

- Chris's background (hospitality experience, properties managed, credentials)
- Why he started Suite Manager LLC
- Philosophy / approach ("We treat every property like it's ours")
- Photo placeholder (get a professional headshot)
- Contact CTA

---

## 9. Contact Page

- Headline: "Let's talk about your property"
- Simple form: Name, Email, Phone, Property Name, Message
- Alternative: "Prefer to call? [phone number]"
- Response time promise: "We respond within 24 hours"
- Backend: Web3Forms (no backend needed)

---

## 10. Design Constraints

- Mobile-first responsive
- Fast load (static Astro build)
- Accessibility basics (WCAG AA contrast, alt text, focus states)
- No animations that feel gimmicky — subtle, purposeful only
- Stock photography: Unsplash hotel/hospitality imagery until Chris has real photos

---

## 11. Research Requirements (Pre-Build)

Before designing, research agent should analyze:
- 5-8 hotel management company websites (competitors + best-in-class)
- What sections they lead with
- Color palette trends in hospitality management
- Trust signals they use (certifications, property counts, years in business)
- CTA patterns (what call-to-action converts in this space)
- Messaging frameworks (how they talk about their services)

---

## 12. Success Criteria

- [ ] Site live at suitemanagerllc.com
- [ ] Mobile-responsive, loads fast
- [ ] Contact form works (sends to Chris's email)
- [ ] Looks as premium as competitors
- [ ] Chris approves the design

---

## 13. Out of Scope (v1)

- Owner portal / login
- Property listings / portfolio page
- Blog / content strategy
- Booking integration
- CMS / content editing
- SEO strategy

---

## 14. Open Questions (Need Chris's Input)

- [ ] Chris's background and years of experience
- [ ] How many properties currently managed (or target number)
- [ ] Any specific services to highlight or de-emphasize
- [ ] Phone number and email to display
- [ ] Any certifications (AHLEI, CHM, etc.)
- [ ] Any existing photos (properties, headshot)
- [ ] Preferred accent color or "stay away from" colors
- [ ] Testimonials or reference clients (optional)

---

*PRD created Feb 26, 2026. Pending Chris's input on open questions.*
