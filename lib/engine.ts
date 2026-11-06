/**
 * STARTIT analysis engine.
 *
 * Everything here is deterministic and runs in the browser so the frontend is
 * fully interactive without a backend. In production, `analyzeIdea` is the seam
 * where a server route (e.g. POST /api/audit) would call the scraping pipeline
 * (Reddit / HN / G2 / Product Hunt) plus an LLM, then return the same `Analysis`
 * shape. The UI never needs to change.
 */
import type {
  Analysis,
  Category,
  CheckIn,
  Grade,
  Hurdle,
  IdeaInput,
  PenaltyEvent,
  Phase,
  Saturation,
  Task,
} from "./types";
import { activePrefs, countryByCode, shortDate } from "./locale";

/* ---------------------------------------------------------------- dates -- */

export const DAY = 86_400_000;
// All date math runs on UTC midnights so results never drift by a day across time zones.
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parse = (s: string) => new Date(s + "T00:00:00Z");
export const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * DAY));
/** The founder's local calendar date as yyyy-mm-dd. */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);
/** Short date in the founder's locale (e.g. "Nov 2" or "2 Nov"). */
export const fmtDate = (s: string) => shortDate(s);

/** Fills {country} and {cities} in profile text with the founder's location. */
function loc(s: string) {
  const p = activePrefs();
  const name = countryByCode(p.country)?.name ?? "your country";
  return s.replace(/\{country\}/g, name).replace(/\{cities\}/g, p.country === "IN" ? "Tier-2 Indian cities" : `smaller cities in ${name}`);
}

/* --------------------------------------------------------------- hashing -- */

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
function pickN<T>(arr: T[], n: number, seed: number) {
  const copy = [...arr];
  const out: T[] = [];
  let s = seed;
  while (out.length < n && copy.length) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out.push(copy.splice(s % copy.length, 1)[0]);
  }
  return out;
}

/* ------------------------------------------------------------ categories -- */

interface CategoryProfile {
  base: number;
  keywords: RegExp;
  competitors: string[];
  hurdles: Hurdle[];
  communities: Community[];
  pivots: { niche: string; rationale: string; firstMove: string }[];
}

export interface Community {
  name: string;
  platform: "Reddit" | "Discord" | "Forum" | "Slack" | "Facebook" | "X";
  members: string;
  fit: "Core" | "Adjacent";
  angle: string;
  url: string;
}

const GENERIC_COMMUNITIES: Community[] = [
  { name: "r/SideProject", platform: "Reddit", members: "520k", fit: "Adjacent", angle: "Builders give blunt UX feedback within hours.", url: "https://www.reddit.com/r/SideProject/" },
  { name: "r/startups", platform: "Reddit", members: "1.9M", fit: "Adjacent", angle: "Use the weekly feedback thread only; self-promo is removed.", url: "https://www.reddit.com/r/startups/" },
  { name: "Indie Hackers", platform: "Forum", members: "100k+", fit: "Adjacent", angle: "Post a build-in-public milestone, not a pitch.", url: "https://www.indiehackers.com/" },
  { name: "Hacker News", platform: "Forum", members: "5M/mo", fit: "Adjacent", angle: "Show HN only when someone can try it without signing up.", url: "https://news.ycombinator.com/" },
];

const PROFILES: Record<Category, CategoryProfile> = {
  health: {
    base: 44,
    keywords: /\b(clinic|dental|dentist|doctor|patient|health|medical|therapy|therapist|pharma|hospital|appointment|care)\b/i,
    competitors: ["Practo", "Zocdoc", "Calendly", "Cliniko", "NexHealth"],
    hurdles: [
      { title: "Front-desk staff, not owners, decide tool adoption", detail: "Receptionists already juggle 3–4 systems. Owners buy, staff silently refuse to use it, and you churn in month two.", source: "r/Dentistry · 312 upvotes", severity: "high" },
      { title: "No-show pain is real but already 'solved' by phone calls", detail: "Clinics say a staff member calling patients the day before works well enough. You're competing with a free habit.", source: "r/medicine · 188 upvotes", severity: "high" },
      { title: "Patient data rules slow every sale", detail: "Any tool touching patient records triggers privacy questions under local law (DPDP in India, HIPAA in the US, GDPR in Europe). Expect a 4–8 week sales cycle, not a demo-to-close.", source: "Dentaltown forum · 96 replies", severity: "medium" },
      { title: "Practice-management software bundles scheduling for free", detail: "Clinics on an existing PMS see your product as a feature their vendor will ship next quarter.", source: "r/healthIT · 141 upvotes", severity: "medium" },
      { title: "Willingness to pay caps around one staff hour per month", detail: "Independent clinics compare price to a receptionist's hourly wage. Above that, the answer is 'we'll just hire'.", source: "r/smallbusiness · 77 upvotes", severity: "medium" },
      { title: "Clinic owners don't hang out where you can reach them", detail: "They're on WhatsApp groups and at association meetups, not on Product Hunt. Distribution needs feet on the ground.", source: "r/Dentistry · 205 upvotes", severity: "high" },
    ],
    communities: [
      { name: "r/Dentistry", platform: "Reddit", members: "190k", fit: "Core", angle: "Ask about no-show rates. Never post a link in the first week.", url: "https://www.reddit.com/r/Dentistry/" },
      { name: "Dentaltown", platform: "Forum", members: "250k", fit: "Core", angle: "Practice-management board is where owners vent about staff and tools.", url: "https://www.dentaltown.com/" },
      { name: "r/healthIT", platform: "Reddit", members: "45k", fit: "Adjacent", angle: "Validate the compliance story before you pitch clinics.", url: "https://www.reddit.com/r/healthIT/" },
      { name: "{country} dental association groups", platform: "Facebook", members: "Local", fit: "Core", angle: "City chapters run WhatsApp/FB groups. Offer a free no-show audit.", url: "https://www.facebook.com/search/groups/?q=indian%20dental%20association" },
    ],
    pivots: [
      { niche: "Single-chair dental clinics in {cities} that run bookings entirely over WhatsApp", rationale: "Practo and big PMS vendors target multi-doctor clinics in metros. Single-chair owners are their own receptionist and feel no-shows directly in revenue.", firstMove: "Visit 10 clinics in one city, count weekly no-shows on paper, and offer a WhatsApp reminder bot for free for 30 days." },
      { niche: "Physiotherapy clinics running multi-session treatment packages", rationale: "Session 4 of 10 is where patients drop off. Package-completion is a sharper pain than first-appointment booking.", firstMove: "Ask 15 physios how many packages are abandoned before the halfway mark." },
    ],
  },
  education: {
    base: 52,
    keywords: /\b(student|students|tutor|tutoring|school|exam|course|learn|learning|teacher|edtech|homework|jee|neet|upsc)\b/i,
    competitors: ["BYJU'S", "Unacademy", "Khan Academy", "Duolingo", "Physics Wallah"],
    hurdles: [
      { title: "Users and payers are different people", detail: "Students use it, parents pay. You need two value props and two funnels from day one.", source: "r/edtech · 233 upvotes", severity: "high" },
      { title: "Completion rates sit under 10%", detail: "Self-paced learning products lose most users by week two. Retention is the product, content is the commodity.", source: "r/learnprogramming · 1.2k upvotes", severity: "high" },
      { title: "Free content is effectively infinite", detail: "YouTube and free PDFs set the price anchor at zero for anything that looks like content.", source: "r/JEENEETards · 540 upvotes", severity: "high" },
      { title: "Seasonality wrecks your metrics", detail: "Usage spikes before exams and collapses after. Month-over-month growth will lie to you.", source: "r/edtech · 92 upvotes", severity: "medium" },
      { title: "Edtech trust is damaged", detail: "Aggressive sales tactics from big players made parents suspicious of new edtech brands.", source: "r/india · 870 upvotes", severity: "medium" },
    ],
    communities: [
      { name: "r/edtech", platform: "Reddit", members: "40k", fit: "Core", angle: "Teachers here will tell you exactly why tools fail in classrooms.", url: "https://www.reddit.com/r/edtech/" },
      { name: "r/Teachers", platform: "Reddit", members: "1M", fit: "Core", angle: "Ask about workload, not your product.", url: "https://www.reddit.com/r/Teachers/" },
      { name: "r/JEENEETards", platform: "Reddit", members: "300k", fit: "Core", angle: "Students are brutally honest about what they actually use.", url: "https://www.reddit.com/r/JEENEETards/" },
    ],
    pivots: [
      { niche: "Parents of Grade 11–12 students who want weekly progress proof, not more content", rationale: "Parents pay for reassurance. A weekly report is cheaper to build than courses and easier to charge for.", firstMove: "Run a manual WhatsApp progress report for 10 families for two weeks." },
    ],
  },
  fintech: {
    base: 58,
    keywords: /\b(finance|fintech|payment|payments|invoice|invoicing|bank|budget|expense|loan|credit|upi|accounting|tax|gst)\b/i,
    competitors: ["Razorpay", "Zoho Books", "QuickBooks", "Khatabook", "Stripe"],
    hurdles: [
      { title: "Regulation eats your runway", detail: "Anything that holds or moves money needs licences or a partner bank. Budget months, not weeks.", source: "r/fintech · 301 upvotes", severity: "high" },
      { title: "Trust is the product", detail: "Small businesses won't connect bank accounts to an unknown brand without referrals.", source: "r/smallbusiness · 410 upvotes", severity: "high" },
      { title: "Free incumbents own the basics", detail: "Khatabook and bank apps already give away ledgers and reminders.", source: "r/IndiaInvestments · 220 upvotes", severity: "medium" },
      { title: "Accountants are the real gatekeepers", detail: "SMBs use whatever their CA tells them to use.", source: "r/Accounting · 655 upvotes", severity: "high" },
      { title: "Fraud and chargebacks hit early", detail: "New payment products attract fraud before they attract real users.", source: "r/fintech · 140 upvotes", severity: "medium" },
    ],
    communities: [
      { name: "r/fintech", platform: "Reddit", members: "90k", fit: "Core", angle: "Ask about compliance paths, not features.", url: "https://www.reddit.com/r/fintech/" },
      { name: "r/Accounting", platform: "Reddit", members: "800k", fit: "Core", angle: "Accountants will tell you what clients actually struggle with.", url: "https://www.reddit.com/r/Accounting/" },
      { name: "r/smallbusiness", platform: "Reddit", members: "2M", fit: "Adjacent", angle: "Cash-flow threads are your pain-point goldmine.", url: "https://www.reddit.com/r/smallbusiness/" },
    ],
    pivots: [
      { niche: "Chartered accountants managing 30+ small-business GST filings", rationale: "Sell to the gatekeeper. One CA brings 30 clients and already feels the reconciliation pain.", firstMove: "Interview 8 CAs about their worst week of the GST cycle." },
    ],
  },
  productivity: {
    base: 74,
    keywords: /\b(productivity|todo|to-do|task|tasks|notes|note-taking|calendar|focus|habit|planner|workflow|project management)\b/i,
    competitors: ["Notion", "Todoist", "ClickUp", "Linear", "Motion"],
    hurdles: [
      { title: "The most crowded category on the internet", detail: "There are thousands of task apps. 'Cleaner UI' is not a reason to switch.", source: "r/productivity · 2.4k upvotes", severity: "high" },
      { title: "Switching costs are emotional", detail: "People have years of notes in their current tool. Migration is your real onboarding.", source: "r/Notion · 900 upvotes", severity: "high" },
      { title: "Users try everything, pay for nothing", detail: "Productivity enthusiasts sign up for free tiers and churn on the paywall.", source: "r/productivity · 610 upvotes", severity: "high" },
      { title: "Incumbents copy features in a quarter", detail: "Notion and ClickUp ship AI features faster than you can raise.", source: "r/SaaS · 380 upvotes", severity: "medium" },
      { title: "The real problem is behaviour, not tooling", detail: "Commenters repeatedly say the app was never what stopped them.", source: "r/getdisciplined · 1.1k upvotes", severity: "medium" },
    ],
    communities: [
      { name: "r/productivity", platform: "Reddit", members: "3M", fit: "Core", angle: "Share a workflow, not your app.", url: "https://www.reddit.com/r/productivity/" },
      { name: "r/Notion", platform: "Reddit", members: "500k", fit: "Adjacent", angle: "Power users here describe exact gaps.", url: "https://www.reddit.com/r/Notion/" },
    ],
    pivots: [
      { niche: "A single workflow for one profession, such as case-deadline tracking for solo lawyers", rationale: "Horizontal productivity is lost. Vertical workflow tools with domain rules still win.", firstMove: "Pick one profession and shadow three people for a day." },
    ],
  },
  commerce: {
    base: 60,
    keywords: /\b(ecommerce|e-commerce|marketplace|shop|store|seller|sellers|d2c|retail|dropship|inventory|shopify)\b/i,
    competitors: ["Shopify", "Amazon", "Meesho", "Etsy", "Dukaan"],
    hurdles: [
      { title: "Marketplaces die from the cold-start problem", detail: "No buyers without sellers, no sellers without buyers. Most die waiting.", source: "r/startups · 780 upvotes", severity: "high" },
      { title: "Customer acquisition costs keep rising", detail: "Meta and Google CPMs make paid growth unprofitable for small baskets.", source: "r/ecommerce · 520 upvotes", severity: "high" },
      { title: "Platform dependency", detail: "One Shopify or Amazon policy change can wipe out your channel.", source: "r/FulfillmentByAmazon · 300 upvotes", severity: "medium" },
      { title: "Returns and logistics eat margins", detail: "Founders consistently underestimate reverse logistics.", source: "r/ecommerce · 410 upvotes", severity: "medium" },
      { title: "Sellers want sales, not software", detail: "Tools that don't directly increase orders get cancelled.", source: "r/shopify · 260 upvotes", severity: "high" },
    ],
    communities: [
      { name: "r/ecommerce", platform: "Reddit", members: "400k", fit: "Core", angle: "Ask about margins. Everyone answers.", url: "https://www.reddit.com/r/ecommerce/" },
      { name: "r/shopify", platform: "Reddit", members: "200k", fit: "Core", angle: "App complaints are posted daily.", url: "https://www.reddit.com/r/shopify/" },
    ],
    pivots: [
      { niche: "Instagram-first home bakers who take orders in DMs", rationale: "They have demand but no ordering system. Too small for Shopify, too busy for spreadsheets.", firstMove: "DM 30 home bakers and offer to manage their order book for a week." },
    ],
  },
  food: {
    base: 68,
    keywords: /\b(food|restaurant|restaurants|delivery|meal|recipe|kitchen|cafe|grocery|cloud kitchen)\b/i,
    competitors: ["Swiggy", "Zomato", "Uber Eats", "Petpooja", "HelloFresh"],
    hurdles: [
      { title: "Razor-thin margins leave nothing for software", detail: "Restaurants run on 3–8% margins. Every subscription is scrutinised.", source: "r/restaurateur · 340 upvotes", severity: "high" },
      { title: "Aggregators own the customer", detail: "Swiggy and Zomato control discovery and data.", source: "r/india · 600 upvotes", severity: "high" },
      { title: "Owners have no time to onboard", detail: "Peak hours are sacred. Training happens never.", source: "r/KitchenConfidential · 1.5k upvotes", severity: "medium" },
      { title: "High churn from restaurant closures", detail: "A large share of new restaurants close in year one. Your customers disappear.", source: "r/restaurateur · 220 upvotes", severity: "medium" },
      { title: "Hardware and POS lock-in", detail: "Existing POS vendors bundle everything you plan to sell.", source: "r/restaurateur · 150 upvotes", severity: "medium" },
    ],
    communities: [
      { name: "r/restaurateur", platform: "Reddit", members: "60k", fit: "Core", angle: "Owners discuss real costs openly.", url: "https://www.reddit.com/r/restaurateur/" },
      { name: "r/KitchenConfidential", platform: "Reddit", members: "1M", fit: "Adjacent", angle: "Back-of-house truth, unfiltered.", url: "https://www.reddit.com/r/KitchenConfidential/" },
    ],
    pivots: [
      { niche: "Cloud kitchens running 3+ virtual brands from one kitchen", rationale: "Multi-brand ops create menu and inventory chaos the POS vendors ignore.", firstMove: "Find 5 multi-brand kitchens and map their daily order reconciliation." },
    ],
  },
  fitness: {
    base: 76,
    keywords: /\b(fitness|gym|workout|diet|nutrition|yoga|weight|calorie|running|trainer)\b/i,
    competitors: ["Cult.fit", "MyFitnessPal", "Strava", "Fitbod", "HealthifyMe"],
    hurdles: [
      { title: "January signups, February churn", detail: "Fitness apps lose most users within 30 days.", source: "r/Fitness · 3k upvotes", severity: "high" },
      { title: "Free YouTube coaching sets price at zero", detail: "Programs and plans are freely available everywhere.", source: "r/bodyweightfitness · 900 upvotes", severity: "high" },
      { title: "Wearable platforms own the data", detail: "Apple and Google sit between you and the user's metrics.", source: "r/QuantifiedSelf · 200 upvotes", severity: "medium" },
      { title: "Crowded with well-funded brands", detail: "Every angle has a funded competitor with a marketing budget.", source: "r/startups · 300 upvotes", severity: "high" },
      { title: "Motivation is the real product", detail: "Users say tracking was never the hard part.", source: "r/loseit · 1.4k upvotes", severity: "medium" },
    ],
    communities: [
      { name: "r/Fitness", platform: "Reddit", members: "10M", fit: "Core", angle: "Daily threads only. Self-promo is banned.", url: "https://www.reddit.com/r/Fitness/" },
      { name: "r/personaltraining", platform: "Reddit", members: "90k", fit: "Core", angle: "Trainers discuss client retention problems.", url: "https://www.reddit.com/r/personaltraining/" },
    ],
    pivots: [
      { niche: "Independent personal trainers managing 15–40 remote clients", rationale: "Sell picks and shovels to trainers instead of competing for consumers.", firstMove: "Ask 10 trainers how they track client check-ins today." },
    ],
  },
  creator: {
    base: 62,
    keywords: /\b(creator|creators|influencer|youtube|content|newsletter|podcast|instagram|tiktok|audience)\b/i,
    competitors: ["Beehiiv", "Kajabi", "Linktree", "Gumroad", "Patreon"],
    hurdles: [
      { title: "Most creators earn too little to pay", detail: "The long tail of creators makes little or nothing. Your market is the top few percent.", source: "r/NewTubers · 700 upvotes", severity: "high" },
      { title: "Tool fatigue", detail: "Creators already pay for 6–10 tools and resent each new one.", source: "r/creators · 210 upvotes", severity: "medium" },
      { title: "Platform algorithms change monthly", detail: "Your value prop can vanish with one platform update.", source: "r/youtubers · 400 upvotes", severity: "medium" },
      { title: "Crowded with funded tools", detail: "Linktree-likes and newsletter platforms are commoditised.", source: "r/SaaS · 260 upvotes", severity: "high" },
      { title: "Creators churn when they stop posting", detail: "Burnout means your customers quit, not just cancel.", source: "r/NewTubers · 500 upvotes", severity: "high" },
    ],
    communities: [
      { name: "r/NewTubers", platform: "Reddit", members: "500k", fit: "Core", angle: "Feedback threads welcome tool questions.", url: "https://www.reddit.com/r/NewTubers/" },
      { name: "r/Newsletters", platform: "Reddit", members: "30k", fit: "Core", angle: "Operators share real numbers.", url: "https://www.reddit.com/r/Newsletters/" },
    ],
    pivots: [
      { niche: "B2B newsletter operators selling sponsorships", rationale: "They have revenue and a concrete workflow problem: sponsor ops.", firstMove: "Map the sponsorship process with 6 operators doing $2k+/month." },
    ],
  },
  devtools: {
    base: 54,
    keywords: /\b(developer|developers|api|devops|code|coding|sdk|github|deploy|database|infra|llm|agent)\b/i,
    competitors: ["GitHub", "Vercel", "Supabase", "Cursor", "Postman"],
    hurdles: [
      { title: "Developers hate paying for tools", detail: "Open-source alternatives anchor expectations at free.", source: "r/programming · 1.8k upvotes", severity: "high" },
      { title: "Bottom-up adoption, top-down buying", detail: "Devs love it, procurement takes six months.", source: "r/devops · 500 upvotes", severity: "medium" },
      { title: "Platforms absorb features", detail: "GitHub and cloud vendors ship your feature as a checkbox.", source: "r/SaaS · 300 upvotes", severity: "high" },
      { title: "Security review blocks every enterprise deal", detail: "SOC 2 becomes table stakes faster than you expect.", source: "r/devops · 280 upvotes", severity: "medium" },
      { title: "Too many AI wrappers", detail: "Developers are sceptical of anything that looks like a thin LLM wrapper.", source: "r/ExperiencedDevs · 900 upvotes", severity: "high" },
    ],
    communities: [
      { name: "r/devops", platform: "Reddit", members: "350k", fit: "Core", angle: "Ask about the most hated part of their pipeline.", url: "https://www.reddit.com/r/devops/" },
      { name: "r/ExperiencedDevs", platform: "Reddit", members: "250k", fit: "Core", angle: "Senior engineers give direct feedback.", url: "https://www.reddit.com/r/ExperiencedDevs/" },
    ],
    pivots: [
      { niche: "Platform teams at 50–200-person startups migrating CI providers", rationale: "Migration windows are when teams buy new tools.", firstMove: "Find 10 teams that changed CI in the last year and ask what hurt." },
    ],
  },
  general: {
    base: 56,
    keywords: /.*/,
    competitors: ["Spreadsheets + WhatsApp", "Notion templates", "Freelancers on Upwork"],
    hurdles: [
      { title: "No clear buyer yet", detail: "The idea describes a product, not a person with a budget.", source: "r/startups · 420 upvotes", severity: "high" },
      { title: "The status quo is 'do nothing'", detail: "Most people tolerate the problem. Your real competitor is inertia.", source: "r/Entrepreneur · 650 upvotes", severity: "high" },
      { title: "Distribution plan is missing", detail: "Founders who can't name where the first 100 users come from rarely find them.", source: "r/SaaS · 380 upvotes", severity: "medium" },
      { title: "Feature, not a company", detail: "Commenters ask what stops an incumbent from adding this in a sprint.", source: "r/startups · 290 upvotes", severity: "medium" },
      { title: "Pricing is unclear", detail: "Without a price, interviews produce compliments instead of commitments.", source: "r/Entrepreneur · 240 upvotes", severity: "medium" },
    ],
    communities: [],
    pivots: [
      { niche: "One job title in one city with a problem that costs them money weekly", rationale: "Narrow beats broad. Pick a buyer you can visit in person.", firstMove: "Write down 20 people with that job title you could message today." },
    ],
  },
};

const CATEGORY_ORDER: Category[] = ["health", "education", "fintech", "fitness", "food", "devtools", "creator", "commerce", "productivity"];

export function detectCategory(idea: IdeaInput): Category {
  const text = `${idea.concept} ${idea.audience} ${idea.name}`;
  let best: Category = "general";
  let bestHits = 0;
  for (const c of CATEGORY_ORDER) {
    const re = new RegExp(PROFILES[c].keywords.source, "gi");
    const hits = (text.match(re) || []).length;
    if (hits > bestHits) {
      best = c;
      bestHits = hits;
    }
  }
  return best;
}

/* ------------------------------------------------------------- analysis -- */

export function analyzeIdea(idea: IdeaInput): Analysis {
  const category = detectCategory(idea);
  const p = PROFILES[category];
  const seed = hash(idea.name + idea.concept);
  const concept = idea.concept.toLowerCase();
  const audience = idea.audience.toLowerCase();
  const signals: { label: string; value: string }[] = [];

  let score = p.base;

  const buzz = (concept.match(/\b(ai|ai-powered|platform|super app|uber for|social|ecosystem|revolutionize|disrupt|all-in-one|blockchain|web3)\b/g) || []).length;
  if (buzz) {
    score += Math.min(buzz * 5, 18);
    signals.push({ label: "Buzzword density", value: `${buzz} flagged` });
  }

  if (/\b(everyone|anyone|all people|people|users|businesses)\b/.test(audience) && audience.split(/\s+/).length < 5) {
    score += 14;
    signals.push({ label: "Audience", value: "Too broad" });
  }

  let specificity = 0;
  if (/\d/.test(audience)) specificity++;
  if (/\b(in|across)\s+[a-z]/.test(audience)) specificity++;
  if (/\b(owner|owners|founder|manager|clinic|clinics|teacher|parents|freelancer|accountant|ca|agency|independent|solo|single)\b/.test(audience)) specificity++;
  if (audience.split(/\s+/).length >= 7) specificity++;
  score -= specificity * 6;
  signals.push({ label: "Audience specificity", value: `${specificity}/4` });

  const paid =
    /\b(subscription|per month|\/mo|a month|fee|pricing|pay|paid|commission|license)\b/.test(concept) ||
    /\p{Sc}/u.test(idea.concept) ||
    /\b[A-Z]{3}\s?\d/.test(idea.concept);
  if (paid) score -= 7;
  signals.push({ label: "Monetisation stated", value: paid ? "Yes" : "No" });

  if (idea.concept.trim().length < 50) {
    score += 9;
    signals.push({ label: "Concept clarity", value: "Vague" });
  }

  const wrapper = /\b(chatgpt|gpt|llm|ai assistant|ai chatbot)\b/.test(concept);
  if (wrapper) score += 6;

  score = Math.max(4, Math.min(97, Math.round(score)));

  const saturation: Saturation = score < 38 ? "Open Niche" : score < 66 ? "Competitive" : "Heavily Saturated";

  const flagged: Hurdle[] = [];
  if (wrapper) flagged.push({ title: "Looks like an LLM wrapper", detail: "Users ask why they wouldn't just paste this into ChatGPT. Your moat must be data or workflow, not the model.", source: "r/ChatGPT · 2.1k upvotes", severity: "high" });
  if (!paid) flagged.push({ title: "You haven't said who pays or how much", detail: "No price in the pitch means interviews will produce polite interest instead of pre-orders.", source: "r/SaaS · 512 upvotes", severity: "high" });
  const hurdles = [...flagged, ...pickN(p.hurdles, 5 - flagged.length, seed)].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1,
  );

  const pv = p.pivots[seed % p.pivots.length];
  const verdict =
    score >= 66
      ? "Dead on arrival as pitched. The market is crowded and nothing in the pitch explains why you win."
      : score >= 38
        ? "Survivable, but only if you narrow hard. Right now you're fighting incumbents on their turf."
        : "Promising. The niche is specific enough to own. Your risk is execution speed, not the idea.";

  return {
    killScore: score,
    saturation,
    verdict,
    hurdles,
    pivot: {
      headline: saturation === "Open Niche" ? "Double down, then expand" : "Shrink the market until you can own it",
      niche: loc(pv.niche),
      rationale: loc(pv.rationale),
      firstMove: loc(pv.firstMove),
    },
    competitors: pickN(p.competitors, 4, seed + 7),
    signals,
    category,
    analyzedAt: new Date().toISOString(),
  };
}

export function communitiesFor(category: Category): Community[] {
  const core = PROFILES[category].communities.map((c) => ({ ...c, name: loc(c.name) }));
  return [...core, ...GENERIC_COMMUNITIES].slice(0, 8);
}

export const SCAN_STEPS = [
  "Scraping r/startups, r/SaaS and niche subreddits",
  "Pulling Hacker News and Indie Hackers threads",
  "Mapping competitors and pricing pages",
  "Clustering complaints by severity",
  "Scoring saturation and survivability",
];

/* ---------------------------------------------------------------- tasks -- */

interface TaskSeed {
  title: string;
  phase: Phase;
  week: 1 | 2 | 3 | 4;
  dayOffset: number;
  tech: boolean;
}

const TASK_SEEDS: TaskSeed[] = [
  { title: "Run 10 problem interviews with target customers", phase: "Validation", week: 1, dayOffset: 3, tech: false },
  { title: "Write the one-sentence problem statement and kill criteria", phase: "Validation", week: 1, dayOffset: 2, tech: false },
  { title: "Ship a landing page with a waitlist and pricing", phase: "Validation", week: 1, dayOffset: 5, tech: true },
  { title: "Collect 3 pre-orders or signed letters of intent", phase: "Validation", week: 1, dayOffset: 6, tech: false },
  { title: "Set up auth, database schema and deploy pipeline", phase: "MVP Build", week: 2, dayOffset: 9, tech: true },
  { title: "Build the core workflow end to end (no polish)", phase: "MVP Build", week: 2, dayOffset: 12, tech: true },
  { title: "Wire analytics events for activation and retention", phase: "MVP Build", week: 2, dayOffset: 13, tech: true },
  { title: "Add payments with a single paid plan", phase: "MVP Build", week: 3, dayOffset: 16, tech: true },
  { title: "Onboard 5 design partners and watch them use it live", phase: "MVP Build", week: 3, dayOffset: 18, tech: false },
  { title: "Fix the top 3 blockers from design-partner sessions", phase: "MVP Build", week: 3, dayOffset: 20, tech: true },
  { title: "Post feedback thread in the top 3 core communities", phase: "Early-Adopter Launch", week: 4, dayOffset: 23, tech: false },
  { title: "Launch Show HN with a no-signup demo", phase: "Early-Adopter Launch", week: 4, dayOffset: 25, tech: true },
  { title: "Convert 10 early adopters to paying customers", phase: "Early-Adopter Launch", week: 4, dayOffset: 27, tech: false },
];

export function buildTasks(startDate: string): Task[] {
  return TASK_SEEDS.map((t, i) => {
    const due = addDays(startDate, t.dayOffset);
    return { id: `t${i + 1}`, title: t.title, phase: t.phase, week: t.week, due, originalDue: due, tech: t.tech, done: false, delayed: false, penalties: 0 };
  });
}

/* ------------------------------------------------------- AI code prompts -- */

export function codePrompt(task: Task, idea: IdeaInput): string {
  const stack = "Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase (Postgres + Auth), deployed on Vercel";
  const specifics: Record<string, string> = {
    t3: `Build a single-page landing site with: a hero that states the problem in the customer's words, a 3-step "how it works" section, one pricing card with a "Reserve your spot" CTA, and a waitlist form that writes {email, role, city, created_at} to a Supabase "waitlist" table. Add basic spam protection (honeypot field) and a thank-you state.`,
    t5: `Scaffold the project: Supabase email magic-link auth, a "profiles" table linked to auth.users, row-level security so users only read their own rows, environment variable handling, and a GitHub Actions workflow that runs typecheck + lint before a Vercel deploy.`,
    t6: `Implement the single core workflow end to end with the least UI possible. Define the data model, server actions for create/read/update, and one screen that completes the job. Skip settings, theming and edge-case polish. Add seed data so it can be demoed instantly.`,
    t7: `Add product analytics with PostHog. Track: signed_up, activated (first completion of the core workflow), returned_day_7, and upgraded. Create a typed track() helper so event names can't drift, and document each event in a README table.`,
    t8: `Integrate Razorpay (or Stripe) Checkout for a single monthly plan. Create a webhook route that verifies signatures and updates a "subscriptions" table with status and current_period_end. Gate the core workflow behind an active subscription after a 14-day trial.`,
    t10: `Given these blocker reports from design partners: [PASTE NOTES], propose the smallest code change for each, implement them, and add a regression test per fix.`,
    t12: `Create a public no-signup demo route (/demo) that loads seeded sample data, lets a visitor complete the core workflow in under 60 seconds, and resets on refresh. Add an OG image and fast first load (under 1.5s on 4G).`,
  };
  return `You are a senior full-stack engineer. I'm building **${idea.name}**: ${idea.concept}
Target customer: ${idea.audience}.

Stack: ${stack}.

Task: ${task.title}
${specifics[task.id] ?? "Break this task into the smallest shippable steps, then implement them."}

Constraints:
- Ship the simplest version that a real customer could use this week.
- Keep files small and typed; no placeholder TODOs in the output.
- Explain any environment variables or dashboard setup I need to do by hand.

Output: the file tree, then each file in full.`;
}

/* ------------------------------------------------------------- grading -- */

export function gradeFromScore(score: number): Grade {
  if (score >= 900) return "A+";
  if (score >= 800) return "A";
  if (score >= 700) return "B+";
  if (score >= 600) return "B";
  if (score >= 480) return "C";
  if (score >= 350) return "D";
  return "F";
}

export function scoreCheckIn(c: Pick<CheckIn, "goalsSet" | "goalsHit" | "interviews" | "signups" | "revenue">) {
  const ratio = c.goalsSet > 0 ? Math.min(1, c.goalsHit / c.goalsSet) : 0;
  const s = ratio * 700 + Math.min(c.interviews, 10) * 12 + Math.min(c.signups, 50) * 2 + (c.revenue > 0 ? 80 : 0);
  return Math.max(0, Math.min(1000, Math.round(s)));
}

export interface ExecutionBreakdown {
  score: number;
  grade: Grade;
  dueRate: number;
  overallRate: number;
  checkInAvg: number;
  penaltyHit: number;
  streak: number;
  dueCount: number;
  dueDone: number;
}

export function computeExecution(tasks: Task[], checkIns: CheckIn[], penalties: PenaltyEvent[], now = today()): ExecutionBreakdown {
  // Overdue tasks the founder deleted still count as due and not done, so deleting can't raise the score.
  const deletedOverdue = penalties.filter((p) => p.reason === "deleted").reduce((n, p) => n + p.taskIds.length, 0);
  const dueTasks = tasks.filter((t) => t.originalDue <= now);
  const dueDone = dueTasks.filter((t) => t.done).length;
  const dueCount = dueTasks.length + deletedOverdue;
  const dueRate = dueCount ? dueDone / dueCount : 1;
  const overallRate = tasks.length ? tasks.filter((t) => t.done).length / tasks.length : 0;
  const checkInAvg = checkIns.length ? checkIns.reduce((a, c) => a + c.score, 0) / checkIns.length : 0;
  const penaltyHit = penalties.reduce((a, p) => a + p.taskIds.length * 35, 0);
  const streak = gradeStreak(checkIns);

  const raw = dueRate * 480 + overallRate * 170 + checkInAvg * 0.3 + Math.min(streak, 4) * 12.5 - penaltyHit;
  const score = Math.max(0, Math.min(1000, Math.round(raw)));
  return { score, grade: gradeFromScore(score), dueRate, overallRate, checkInAvg, penaltyHit, streak, dueCount, dueDone };
}

/** Consecutive most-recent weeks graded B or better. */
export function gradeStreak(checkIns: CheckIn[]) {
  const sorted = [...checkIns].sort((a, b) => b.week - a.week);
  let n = 0;
  for (const c of sorted) {
    if (["A+", "A", "B+", "B"].includes(c.grade)) n++;
    else break;
  }
  return n;
}

export const GRADE_TONE: Record<Grade, "emerald" | "cyber" | "amber" | "flame"> = {
  "A+": "emerald",
  A: "emerald",
  "B+": "cyber",
  B: "cyber",
  C: "amber",
  D: "flame",
  F: "flame",
};

/* --------------------------------------------------------- launch copy -- */

export type CopyChannel = "reddit" | "x" | "hn";

export function launchCopy(channel: CopyChannel, idea: IdeaInput, analysis: Analysis | null, variant: number): { title?: string; body: string } {
  const pain = analysis?.hurdles[0]?.title.toLowerCase() ?? "this problem keeps coming up";
  const niche = analysis?.pivot.niche ?? idea.audience;
  const v = variant % 2;

  if (channel === "reddit") {
    return v === 0
      ? {
          title: `I built a small tool for ${idea.audience.toLowerCase()}. Tear it apart?`,
          body: `Hey all, I've spent the last few weeks talking to ${idea.audience.toLowerCase()} about one specific problem, and the same thing kept coming up: ${pain}.

So I built ${idea.name}. In one line: ${idea.concept}

What I'm looking for:
• Does this match a problem you actually have, or am I imagining it?
• What would stop you from trying it tomorrow?
• What do you use today instead?

No signup wall on the demo. Happy to hear it's a bad idea, that's more useful than silence.`,
        }
      : {
          title: `How do you handle this today? (${idea.audience})`,
          body: `Quick question for this sub before I sink more months into something.

I keep hearing that ${pain}. I've hacked together ${idea.name} to try to fix it, but I'd rather understand your current workaround first.

1. How often does this hit you in a normal week?
2. What does it cost you (time, money, patients/customers)?
3. Have you paid for anything to fix it?

If anyone wants to try what I built, comment and I'll DM. Not posting a link here.`,
        };
  }

  if (channel === "x") {
    return {
      body:
        v === 0
          ? `1/ I talked to ${idea.audience.toLowerCase()} for 3 weeks.

The #1 complaint wasn't what I expected: ${pain}.

So I built ${idea.name}. 🧵

2/ The problem: existing tools are built for big teams. ${niche} get ignored.

3/ What ${idea.name} does: ${idea.concept}

4/ What I learned validating it:
→ People don't pay for features. They pay to stop losing money.
→ The buyer and the user are often different people.
→ "Interesting" means no. Pre-orders mean yes.

5/ It's live for early adopters. If you're in this space, reply and I'll send access.

Brutal feedback welcome.`
          : `Building ${idea.name} in public. Week 3.

✅ 10 customer interviews
✅ Landing page + waitlist live
⏳ Core workflow in progress
❌ Missed one deadline (penalty applied, +14 days)

The niche: ${niche}.

Biggest risk right now: ${pain}.

Follow along, I post the real numbers every Sunday.`,
    };
  }

  return {
    title: `Show HN: ${idea.name} – ${idea.concept.split(/[.:—-]/)[0].trim().slice(0, 70)}`,
    body:
      v === 0
        ? `Hi HN, I'm the founder of ${idea.name}.

${idea.concept}

Why: while interviewing ${idea.audience.toLowerCase()}, the recurring problem was that ${pain}. Existing tools target larger organisations and price accordingly.

How it works: [2–3 sentences on the core mechanism, not the marketing].

There's a demo at [link] that needs no signup. It loads sample data so you can try the main flow in under a minute.

What I'd love feedback on: whether the narrow focus on ${niche.toLowerCase()} is right, and what you'd expect it to integrate with.`
        : `Hey HN. ${idea.name} is a small tool for ${idea.audience.toLowerCase()}.

The short version: ${idea.concept}

Technical notes: built with Next.js and Postgres. The interesting part was [the hardest technical decision]. Happy to go deep on that in the comments.

Try it without signing up: [link]

I know the obvious objection is "${pain}". Here's how I'm thinking about it: [your answer].`,
  };
}
