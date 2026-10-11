import type {
  Accent,
  Attempt,
  AttemptStatus,
  Course,
  Degree,
  Major,
  Relation,
  Term,
} from "@/lib/coursemap/types";

export type {
  Accent,
  Attempt,
  AttemptStatus,
  Course,
  Degree,
  Major,
  Relation,
  Term,
};

export const catalogueYears = [2024, 2025, 2026];

export const courses: Course[] = [
  {
    code: "COMP1100",
    name: "Programming as Problem Solving",
    year: 2026,
    units: 6,
    level: 1000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Dr Alex Chen",
    sessions: ["Semester 1"],
    delivery: "In person",
    description:
      "A first course in programming, computational thinking and systematic problem solving.",
    prerequisiteText: "None",
    prerequisiteCodes: [],
    incompatibilities: ["COMP1130"],
    countsTowards: ["Computing core", "Software Development major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP1100",
    lastChanged: "3 Mar 2026",
    parseState: "Verified",
    accent: "blue",
  },
  {
    code: "MATH1005",
    name: "Discrete Mathematical Models",
    year: 2026,
    units: 6,
    level: 1000,
    subject: "Mathematics",
    school: "Mathematical Sciences Institute",
    convener: "Prof Mia Foster",
    sessions: ["Semester 1", "Semester 2"],
    delivery: "In person",
    description:
      "Discrete structures and mathematical reasoning used throughout computing.",
    prerequisiteText: "None",
    prerequisiteCodes: [],
    incompatibilities: ["MATH6005"],
    countsTowards: ["Mathematics requirement", "Degree core"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/MATH1005",
    lastChanged: "18 Feb 2026",
    parseState: "Verified",
    accent: "violet",
  },
  {
    code: "COMP1110",
    name: "Structured Programming",
    year: 2026,
    units: 6,
    level: 1000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Dr Alex Chen",
    sessions: ["Semester 2"],
    delivery: "In person",
    description:
      "Object-oriented design, data structures and larger-scale programming practice.",
    prerequisiteText: "Completion of COMP1100 or COMP1130",
    prerequisiteCodes: ["COMP1100"],
    incompatibilities: ["COMP1140", "COMP6710"],
    countsTowards: ["Computing core", "Software Development major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP1110",
    lastChanged: "6 Mar 2026",
    parseState: "Verified",
    accent: "mint",
  },
  {
    code: "COMP1600",
    name: "Foundations of Computing",
    year: 2026,
    units: 6,
    level: 1000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Dr Priya Nair",
    sessions: ["Semester 2"],
    delivery: "In person",
    description:
      "Logical and mathematical foundations for analysing computation and algorithms.",
    prerequisiteText: "None",
    prerequisiteCodes: [],
    incompatibilities: ["COMP6260"],
    countsTowards: ["Computing core", "Theoretical Computer Science major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP1600",
    lastChanged: "12 Jan 2026",
    parseState: "Automatic",
    accent: "cyan",
  },
  {
    code: "COMP2100",
    name: "Software Design Methodologies",
    year: 2026,
    units: 6,
    level: 2000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Dr Sarah Lim",
    sessions: ["Semester 1"],
    delivery: "In person",
    description:
      "Techniques for designing, testing and maintaining reliable software systems.",
    prerequisiteText: "Successful completion of COMP1110",
    prerequisiteCodes: ["COMP1110"],
    incompatibilities: ["COMP6442"],
    countsTowards: ["Computing core", "Software Development major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP2100",
    lastChanged: "21 Apr 2026",
    parseState: "Verified",
    accent: "amber",
  },
  {
    code: "COMP2120",
    name: "Software Engineering",
    year: 2026,
    units: 6,
    level: 2000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Dr Sarah Lim",
    sessions: ["Semester 2"],
    delivery: "In person",
    description:
      "Team-based software engineering, requirements, architecture and delivery practices.",
    prerequisiteText: "COMP2100",
    prerequisiteCodes: ["COMP2100"],
    incompatibilities: ["COMP6120"],
    countsTowards: ["Software Development major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP2120",
    lastChanged: "2 May 2026",
    parseState: "Automatic",
    accent: "blue",
  },
  {
    code: "COMP2300",
    name: "Computer Organisation and Program Execution",
    year: 2026,
    units: 6,
    level: 2000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Dr Noah Williams",
    sessions: ["Semester 1"],
    delivery: "In person",
    description:
      "How programs execute across instruction sets, memory and processor architecture.",
    prerequisiteText: "COMP1110 and COMP1600",
    prerequisiteCodes: ["COMP1110", "COMP1600"],
    incompatibilities: ["COMP6300"],
    countsTowards: ["Computing core", "Cyber Security major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP2300",
    lastChanged: "15 Feb 2026",
    parseState: "Automatic",
    accent: "rose",
  },
  {
    code: "COMP2310",
    name: "Systems, Networks and Concurrency",
    year: 2026,
    units: 6,
    level: 2000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Dr Noah Williams",
    sessions: ["Semester 2"],
    delivery: "In person",
    description:
      "Operating systems, networks, concurrency and the design of reliable systems software.",
    prerequisiteText: "COMP2300",
    prerequisiteCodes: ["COMP2300"],
    incompatibilities: ["COMP6310"],
    countsTowards: ["Computing core", "Cyber Security major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP2310",
    lastChanged: "15 Feb 2026",
    parseState: "Automatic",
    accent: "rose",
  },
  {
    code: "COMP2400",
    name: "Relational Databases",
    year: 2026,
    units: 6,
    level: 2000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Dr Emma Rossi",
    sessions: ["Semester 1", "Semester 2"],
    delivery: "Hybrid",
    description:
      "Data modelling, relational theory, SQL and dependable database application design.",
    prerequisiteText: "COMP1110",
    prerequisiteCodes: ["COMP1110"],
    incompatibilities: ["COMP6240"],
    countsTowards: ["Computing elective", "Data Science major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP2400",
    lastChanged: "29 Mar 2026",
    parseState: "Automatic",
    accent: "violet",
  },
  {
    code: "COMP2610",
    name: "Information Theory",
    year: 2026,
    units: 6,
    level: 2000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Prof Mia Foster",
    sessions: ["Semester 2"],
    delivery: "In person",
    description:
      "Mathematical foundations of information, coding, compression and communication.",
    prerequisiteText: "MATH1005 and 6 units of programming",
    prerequisiteCodes: ["MATH1005", "COMP1100"],
    incompatibilities: ["COMP6261"],
    countsTowards: ["Theoretical Computer Science major", "Computing elective"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP2610",
    lastChanged: "9 Jun 2026",
    parseState: "Review",
    accent: "cyan",
  },
  {
    code: "COMP3430",
    name: "Cybercrime",
    year: 2026,
    units: 6,
    level: 3000,
    subject: "Cyber Security",
    school: "School of Computing",
    convener: "Dr Owen Park",
    sessions: ["Semester 2"],
    delivery: "Hybrid",
    description:
      "Technical, legal and social dimensions of cybercrime and digital investigations.",
    prerequisiteText: "12 units of 2000-level COMP courses",
    prerequisiteCodes: ["COMP2300", "COMP2310"],
    incompatibilities: [],
    countsTowards: ["Cyber Security major", "3000-level computing requirement"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP3430",
    lastChanged: "7 Jul 2026",
    parseState: "Review",
    accent: "rose",
  },
  {
    code: "COMP3600",
    name: "Algorithms",
    year: 2026,
    units: 6,
    level: 3000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Dr Priya Nair",
    sessions: ["Semester 1"],
    delivery: "In person",
    description:
      "Design and analysis of efficient algorithms for challenging computational problems.",
    prerequisiteText:
      "To enrol in this course you must have completed the following: 24 units of COMP coded courses AND (6 units of MATH OR COMP1600)",
    prerequisiteCodes: ["COMP1600"],
    incompatibilities: ["COMP6466"],
    countsTowards: ["Computing core", "Theoretical Computer Science major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP3600",
    lastChanged: "11 May 2026",
    parseState: "Review",
    accent: "cyan",
  },
  {
    code: "COMP3620",
    name: "Artificial Intelligence",
    year: 2026,
    units: 6,
    level: 3000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Dr Leila Morgan",
    sessions: ["Semester 2"],
    delivery: "In person",
    description:
      "Search, reasoning, planning and learning techniques for intelligent systems.",
    prerequisiteText: "COMP2100 and MATH1005",
    prerequisiteCodes: ["COMP2100", "MATH1005"],
    incompatibilities: ["COMP6320"],
    countsTowards: [
      "Intelligent Systems major",
      "3000-level computing requirement",
    ],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP3620",
    lastChanged: "13 Apr 2026",
    parseState: "Automatic",
    accent: "mint",
  },
  {
    code: "COMP3670",
    name: "Introduction to Machine Learning",
    year: 2026,
    units: 6,
    level: 3000,
    subject: "Data Science",
    school: "School of Computing",
    convener: "Dr Leila Morgan",
    sessions: ["Semester 1"],
    delivery: "Hybrid",
    description: "Foundational models and methods for learning from data.",
    prerequisiteText: "MATH1005 and COMP2100",
    prerequisiteCodes: ["MATH1005", "COMP2100"],
    incompatibilities: ["COMP6670"],
    countsTowards: ["Data Science major", "Intelligent Systems major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP3670",
    lastChanged: "26 May 2026",
    parseState: "Automatic",
    accent: "mint",
  },
  {
    code: "COMP3703",
    name: "Software Security",
    year: 2026,
    units: 6,
    level: 3000,
    subject: "Cyber Security",
    school: "School of Computing",
    convener: "Dr Owen Park",
    sessions: ["Semester 1"],
    delivery: "In person",
    description:
      "Secure software design, implementation, testing and vulnerability analysis.",
    prerequisiteText: "COMP2100 and COMP2300",
    prerequisiteCodes: ["COMP2100", "COMP2300"],
    incompatibilities: ["COMP6703"],
    countsTowards: ["Cyber Security major", "Software Development major"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP3703",
    lastChanged: "1 Jun 2026",
    parseState: "Automatic",
    accent: "amber",
  },
  {
    code: "COMP3900",
    name: "Computing Project",
    year: 2026,
    units: 12,
    level: 3000,
    subject: "Computing",
    school: "School of Computing",
    convener: "Prof Daniel Wright",
    sessions: ["Semester 1", "Semester 2"],
    delivery: "Project",
    description:
      "A substantial team project integrating technical knowledge and professional practice.",
    prerequisiteText: "96 units completed, including COMP2100",
    prerequisiteCodes: ["COMP2100"],
    incompatibilities: ["COMP6390"],
    permissionText:
      "Permission from the course convener is required before enrolment.",
    countsTowards: ["Capstone", "3000-level computing requirement"],
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP3900",
    lastChanged: "30 Jun 2026",
    parseState: "Verified",
    accent: "amber",
  },
];

export const degrees: Degree[] = [
  {
    code: "BCOMP",
    name: "Bachelor of Computing",
    units: 144,
    duration: 3,
    college: "College of Systems and Society",
    description:
      "A flexible computing degree with a major, core courses and room for electives.",
  },
  {
    code: "BACOMPH",
    name: "Bachelor of Advanced Computing (Honours)",
    units: 192,
    duration: 4,
    college: "College of Systems and Society",
    description:
      "An intensive computing programme with advanced study and an honours research year.",
  },
  {
    code: "BIT",
    name: "Bachelor of Information Technology",
    units: 144,
    duration: 3,
    college: "College of Systems and Society",
    description:
      "Applied information technology with flexible computing and university electives.",
  },
];

export const majors: Major[] = [
  {
    code: "SOFT-MAJ",
    name: "Software Development",
    units: 48,
    colour: "#8b5cf6",
    description: "Design, build and maintain dependable software systems.",
    courseCodes: [
      "COMP1100",
      "COMP1110",
      "COMP2100",
      "COMP2120",
      "COMP3703",
      "COMP3900",
    ],
  },
  {
    code: "CYBR-MAJ",
    name: "Cyber Security",
    units: 48,
    colour: "#e05f7e",
    description:
      "Secure software, systems, networks and information infrastructure.",
    courseCodes: [
      "COMP1100",
      "COMP1110",
      "COMP2300",
      "COMP2310",
      "COMP3430",
      "COMP3703",
    ],
  },
  {
    code: "DASC-MAJ",
    name: "Data Science",
    units: 48,
    colour: "#158b68",
    description: "Turn complex data into useful models and decisions.",
    courseCodes: ["MATH1005", "COMP1110", "COMP2400", "COMP3670", "COMP3900"],
  },
  {
    code: "AINT-MAJ",
    name: "Intelligent Systems",
    units: 48,
    colour: "#ca7b16",
    description: "Build systems that learn, reason and act autonomously.",
    courseCodes: ["MATH1005", "COMP1110", "COMP2100", "COMP3620", "COMP3670"],
  },
  {
    code: "THCS-MAJ",
    name: "Theoretical Computer Science",
    units: 48,
    colour: "#2883d8",
    description:
      "Explore computation through logic, algorithms and complexity.",
    courseCodes: ["MATH1005", "COMP1600", "COMP2100", "COMP2610", "COMP3600"],
  },
];

export const terms: Term[] = [
  {
    id: "2026-s1",
    year: 2026,
    name: "Semester 1",
    shortName: "S1",
    dates: "Feb - Jun",
  },
  {
    id: "2026-s2",
    year: 2026,
    name: "Semester 2",
    shortName: "S2",
    dates: "Jul - Nov",
  },
  {
    id: "2027-s1",
    year: 2027,
    name: "Semester 1",
    shortName: "S1",
    dates: "Feb - Jun",
  },
  {
    id: "2027-s2",
    year: 2027,
    name: "Semester 2",
    shortName: "S2",
    dates: "Jul - Nov",
  },
  {
    id: "2028-s1",
    year: 2028,
    name: "Semester 1",
    shortName: "S1",
    dates: "Feb - Jun",
  },
  {
    id: "2028-s2",
    year: 2028,
    name: "Semester 2",
    shortName: "S2",
    dates: "Jul - Nov",
  },
];

export const initialAttempts: Attempt[] = [
  {
    id: "a-comp1100",
    courseCode: "COMP1100",
    termId: "2026-s1",
    status: "completed",
    mark: 78,
  },
  {
    id: "a-math1005",
    courseCode: "MATH1005",
    termId: "2026-s1",
    status: "completed",
    mark: 72,
  },
  {
    id: "a-comp1110-fail",
    courseCode: "COMP1110",
    termId: "2026-s2",
    status: "failed",
    mark: 43,
  },
  {
    id: "a-comp1600",
    courseCode: "COMP1600",
    termId: "2026-s2",
    status: "planned",
  },
  {
    id: "a-comp1110-repeat",
    courseCode: "COMP1110",
    termId: "2027-s1",
    status: "planned",
  },
  {
    id: "a-comp2100",
    courseCode: "COMP2100",
    termId: "2027-s2",
    status: "planned",
  },
  {
    id: "a-comp2120",
    courseCode: "COMP2120",
    termId: "2028-s1",
    status: "planned",
  },
  {
    id: "a-comp3900",
    courseCode: "COMP3900",
    termId: "2028-s2",
    status: "planned",
  },
];

export const relations: Relation[] = [
  {
    id: "r1",
    source: "COMP1110",
    relation: "Prerequisite",
    target: "COMP1100",
    group: "one_of:1",
    hardness: "Hard",
    confidence: 99,
    state: "Verified",
    sourceText: "Completion of COMP1100 or COMP1130",
  },
  {
    id: "r2",
    source: "COMP2100",
    relation: "Prerequisite",
    target: "COMP1110",
    group: "all_of:1",
    hardness: "Hard",
    confidence: 100,
    state: "Verified",
    sourceText: "Successful completion of COMP1110",
  },
  {
    id: "r3",
    source: "COMP2300",
    relation: "Prerequisite",
    target: "COMP1110",
    group: "all_of:1",
    hardness: "Hard",
    confidence: 98,
    state: "Automatic",
    sourceText: "COMP1110 and COMP1600",
  },
  {
    id: "r4",
    source: "COMP2300",
    relation: "Prerequisite",
    target: "COMP1600",
    group: "all_of:1",
    hardness: "Hard",
    confidence: 98,
    state: "Automatic",
    sourceText: "COMP1110 and COMP1600",
  },
  {
    id: "r5",
    source: "COMP3900",
    relation: "Permission",
    target: "Course convener",
    group: "all_of:2",
    hardness: "Hard",
    confidence: 100,
    state: "Verified",
    sourceText: "...and permission of the course convener",
  },
  {
    id: "r6",
    source: "COMP2100",
    relation: "Incompatible",
    target: "COMP6442",
    group: "incompat:1",
    hardness: "Hard",
    confidence: 97,
    state: "Automatic",
    sourceText: "Incompatible with COMP6442",
  },
  {
    id: "r7",
    source: "BCOMP",
    relation: "Requires",
    target: "SOFT-MAJ",
    group: "structure:major",
    hardness: "Allocation",
    confidence: 96,
    state: "Automatic",
    sourceText: "48 units from completion of one listed major",
  },
  {
    id: "r8",
    source: "COMP2610",
    relation: "Prerequisite",
    target: "6 units programming",
    group: "all_of:2",
    hardness: "Hard",
    confidence: 71,
    state: "Review",
    sourceText: "MATH1005 and at least 6 units of programming courses",
  },
];

export const requirementGroups = [
  {
    id: "core",
    name: "Computing core",
    description: "Eight compulsory computing courses",
    total: 48,
    colour: "#8b5cf6",
  },
  {
    id: "math",
    name: "Mathematics requirement",
    description: "Six units from the approved mathematics list",
    total: 6,
    colour: "#2883d8",
  },
  {
    id: "major",
    name: "Selected major",
    description: "Complete one 48-unit computing major",
    total: 48,
    colour: "#158b68",
  },
  {
    id: "advanced",
    name: "Advanced computing",
    description: "At least 18 units of 3000-level COMP courses",
    total: 18,
    colour: "#ca7b16",
  },
  {
    id: "electives",
    name: "University electives",
    description: "Courses chosen from across ANU",
    total: 24,
    colour: "#e05f7e",
  },
];

export function courseByCode(code: string) {
  return courses.find((course) => course.code === code);
}

/** Direct prerequisites followed by every earlier prerequisite in the chain. */
export function prerequisiteChainCodes(code: string) {
  const result: string[] = [];
  const visited = new Set<string>();

  const visit = (courseCode: string) => {
    const course = courseByCode(courseCode);
    if (!course) return;
    for (const prerequisite of course.prerequisiteCodes) {
      if (visited.has(prerequisite)) continue;
      visited.add(prerequisite);
      result.push(prerequisite);
      visit(prerequisite);
    }
  };

  visit(code);
  return result;
}

export function courseOccurrenceLimit(code: string) {
  return courseByCode(code)?.units === 12 ? 2 : 1;
}

export function degreeByCode(code: string) {
  return degrees.find((degree) => degree.code === code) ?? degrees[0];
}

export function majorByCode(code: string) {
  return majors.find((major) => major.code === code) ?? majors[0];
}

/* --- Rich course detail (demo data shaped like ANU Programs and Courses) --- */

export type AssessmentItem = {
  title: string;
  weight: number;
  outcomes: number[];
};

export type CourseOffering = {
  session: string;
  classNumber: number;
  startDate: string;
  lastEnrolDate: string;
  censusDate: string;
  endDate: string;
  mode: string;
};

export type SeltResult = {
  term: string;
  enrolled: number;
  responses: number;
  agreement: number;
};

export type SeltTheme = {
  theme: string;
  agreement: number;
};

export type CourseDetail = {
  about: string;
  college: string;
  career: string;
  areasOfInterest: string[];
  coTaught: string[];
  workloadHours: number;
  feeBand: number;
  domesticFee: number;
  internationalFee: number;
  learningOutcomes: string[];
  assessment: AssessmentItem[];
  assessmentNote: string;
  offerings: CourseOffering[];
  selt: SeltResult[];
  seltThemes: SeltTheme[];
};

const courseContent: Record<
  string,
  { about: string; learningOutcomes: string[]; assessment: AssessmentItem[] }
> = {
  COMP1100: {
    about:
      "An introduction to programming as a disciplined, creative activity. You will design small functional programs from scratch, learning how types, abstraction and systematic testing turn problem statements into working, trustworthy code.",
    learningOutcomes: [
      "Design and implement small functional programs from problem statements.",
      "Reason about program correctness using types and equational thinking.",
      "Choose appropriate data structures for simple computational problems.",
      "Apply systematic testing and debugging practice.",
    ],
    assessment: [
      {
        title: "Labs and programming assignments",
        weight: 45,
        outcomes: [1, 3, 4],
      },
      { title: "Mid-semester exam", weight: 15, outcomes: [1, 2] },
      { title: "Final exam", weight: 40, outcomes: [1, 2, 3] },
    ],
  },
  MATH1005: {
    about:
      "Discrete mathematics is the language of computing. This course builds fluency with logic, proof, sets, graphs and counting, giving you the reasoning tools that later computing and mathematics courses rely on.",
    learningOutcomes: [
      "Construct correct mathematical proofs using logic and induction.",
      "Model problems with sets, relations, functions and graphs.",
      "Apply counting and probability arguments to discrete problems.",
      "Communicate mathematical reasoning clearly.",
    ],
    assessment: [
      { title: "Weekly quizzes", weight: 20, outcomes: [1, 2, 3] },
      { title: "Assignments", weight: 30, outcomes: [1, 2, 4] },
      { title: "Final exam", weight: 50, outcomes: [1, 2, 3] },
    ],
  },
  COMP1110: {
    about:
      "A second programming course that scales your skills from small exercises to real software. Working in teams, you will design object-oriented programs, use core data structures and practise the version-control and review workflows used in industry.",
    learningOutcomes: [
      "Design object-oriented programs with appropriate abstractions.",
      "Implement and use fundamental data structures.",
      "Build, test and refactor a medium-sized group project.",
      "Use version control and code review in team workflows.",
    ],
    assessment: [
      { title: "Group project", weight: 35, outcomes: [1, 3, 4] },
      { title: "Individual assignments", weight: 25, outcomes: [1, 2] },
      { title: "Final exam", weight: 40, outcomes: [1, 2, 3] },
    ],
  },
  COMP1600: {
    about:
      "What can computers actually do, and how do we reason about them precisely? This course introduces automata, formal languages and logic, building the mathematical foundations for algorithms, verification and theoretical computer science.",
    learningOutcomes: [
      "Model computation with automata and formal languages.",
      "Apply propositional and predicate logic to program reasoning.",
      "Prove program properties with induction and invariants.",
      "Relate decidability limits to practical computing problems.",
    ],
    assessment: [
      { title: "Assignments", weight: 40, outcomes: [1, 2, 3] },
      { title: "Mid-semester exam", weight: 20, outcomes: [1, 2] },
      { title: "Final exam", weight: 40, outcomes: [1, 2, 3, 4] },
    ],
  },
  COMP2100: {
    about:
      "Software rarely fails because typing code is hard; it fails when design, testing and collaboration break down. This course teaches the methodical side of software: patterns, modular architecture, automated testing and the tooling that keeps a shared codebase healthy.",
    learningOutcomes: [
      "Apply design patterns and modular architecture to evolving software.",
      "Write effective automated tests across unit and integration levels.",
      "Use tooling for building, profiling and debugging software.",
      "Collaborate on a shared codebase with disciplined workflows.",
    ],
    assessment: [
      { title: "Pair project", weight: 40, outcomes: [1, 2, 4] },
      { title: "Lab exercises", weight: 20, outcomes: [2, 3] },
      { title: "Final exam", weight: 40, outcomes: [1, 2, 3] },
    ],
  },
  COMP2120: {
    about:
      "How teams turn requirements into delivered software. You will practise the full engineering lifecycle, from eliciting requirements and designing architecture through to iterative delivery, quality assurance and release management, in a semester-long team project.",
    learningOutcomes: [
      "Elicit and document requirements with stakeholders.",
      "Design software architectures and justify trade-offs.",
      "Deliver working software iteratively in a team.",
      "Apply quality assurance and release management practice.",
    ],
    assessment: [
      { title: "Team project", weight: 50, outcomes: [1, 2, 3, 4] },
      { title: "Individual reflection", weight: 10, outcomes: [3, 4] },
      { title: "Final exam", weight: 40, outcomes: [1, 2, 4] },
    ],
  },
  COMP2300: {
    about:
      "A journey down the stack, from the code you write to the silicon that runs it. You will program close to the hardware, exploring instruction sets, memory and processor architecture to understand exactly how programs execute.",
    learningOutcomes: [
      "Explain how programs execute on modern processors.",
      "Write and debug assembly for a small instruction set.",
      "Build programs that interact with memory-mapped hardware.",
      "Analyse the interaction of compilers, memory and architecture.",
    ],
    assessment: [
      { title: "Hardware labs", weight: 30, outcomes: [2, 3] },
      { title: "Design projects", weight: 40, outcomes: [2, 3, 4] },
      { title: "Final exam", weight: 30, outcomes: [1, 4] },
    ],
  },
  COMP2310: {
    about:
      "Modern software is concurrent and networked by default. This course covers operating system abstractions, writing concurrent programs without races or deadlock, and building reliable networked services on real transport protocols.",
    learningOutcomes: [
      "Design concurrent programs that avoid races and deadlock.",
      "Explain operating system abstractions for processes and memory.",
      "Build networked services over standard transport protocols.",
      "Evaluate reliability trade-offs in systems software.",
    ],
    assessment: [
      { title: "Systems projects", weight: 45, outcomes: [1, 3, 4] },
      { title: "Lab checkpoints", weight: 15, outcomes: [1, 2] },
      { title: "Final exam", weight: 40, outcomes: [1, 2, 4] },
    ],
  },
  COMP2400: {
    about:
      "Databases keep the world's information consistent under pressure. You will model data with relational theory, master SQL over normalised schemas and learn how transactions keep applications safe when everything happens at once.",
    learningOutcomes: [
      "Model data with entity-relationship and relational designs.",
      "Write correct and efficient SQL over normalised schemas.",
      "Apply normalisation theory to remove redundancy.",
      "Build applications that use transactions safely.",
    ],
    assessment: [
      { title: "Assignments", weight: 40, outcomes: [1, 2, 3] },
      { title: "Mid-semester exam", weight: 20, outcomes: [1, 3] },
      { title: "Final exam", weight: 40, outcomes: [2, 3, 4] },
    ],
  },
  COMP2610: {
    about:
      "Information theory asks a deceptively simple question: how far can data be compressed, and how reliably can it be transmitted? You will study entropy, coding and channel capacity, with connections to statistics and machine learning.",
    learningOutcomes: [
      "Quantify information with entropy and related measures.",
      "Design and analyse source coding and compression schemes.",
      "Explain channel capacity and error-correcting codes.",
      "Apply information-theoretic reasoning to learning problems.",
    ],
    assessment: [
      { title: "Assignments", weight: 50, outcomes: [1, 2, 4] },
      { title: "Final exam", weight: 50, outcomes: [1, 2, 3] },
    ],
  },
  COMP3430: {
    about:
      "Cybercrime sits at the intersection of technology, law and human behaviour. This course examines attack campaigns and digital investigations end to end, developing both the technical and communication skills that security work demands.",
    learningOutcomes: [
      "Analyse cybercrime through technical and legal lenses.",
      "Conduct structured digital investigations with sound evidence handling.",
      "Evaluate defences against common attack campaigns.",
      "Communicate risk to technical and non-technical audiences.",
    ],
    assessment: [
      { title: "Case study portfolio", weight: 40, outcomes: [1, 3, 4] },
      { title: "Investigation project", weight: 30, outcomes: [2, 4] },
      { title: "Final exam", weight: 30, outcomes: [1, 2, 3] },
    ],
  },
  COMP3600: {
    about:
      "Algorithm design and analysis is the core intellectual toolkit of computer science. You will master divide and conquer, greedy methods and dynamic programming, prove correctness and complexity, and learn to recognise problems that resist efficient solutions.",
    learningOutcomes: [
      "Design algorithms with divide and conquer, greedy and dynamic programming.",
      "Prove correctness and analyse asymptotic complexity.",
      "Select data structures that meet performance requirements.",
      "Recognise intractability and apply approximation strategies.",
    ],
    assessment: [
      { title: "Assignments", weight: 40, outcomes: [1, 2, 3] },
      { title: "Mid-semester exam", weight: 20, outcomes: [1, 2] },
      { title: "Final exam", weight: 40, outcomes: [1, 2, 3, 4] },
    ],
  },
  COMP3620: {
    about:
      "Artificial intelligence as an engineering discipline. You will formulate problems for search, planning and constraint solving, build agents that reason under uncertainty, and confront the practical and ethical questions raised by deployed AI systems.",
    learningOutcomes: [
      "Formulate problems for search, planning and constraint solving.",
      "Build agents that reason under uncertainty.",
      "Implement and evaluate core AI algorithms.",
      "Assess ethical implications of deployed AI systems.",
    ],
    assessment: [
      { title: "Programming assignments", weight: 45, outcomes: [1, 2, 3] },
      { title: "Group research task", weight: 15, outcomes: [3, 4] },
      { title: "Final exam", weight: 40, outcomes: [1, 2, 4] },
    ],
  },
  COMP3670: {
    about:
      "A mathematically grounded introduction to machine learning. Starting from linear algebra and probability, you will derive core learning algorithms from first principles and develop the judgement to validate, regularise and evaluate models on real data.",
    learningOutcomes: [
      "Derive and implement core learning algorithms from first principles.",
      "Select models with sound validation and regularisation practice.",
      "Analyse learning methods with linear algebra and probability.",
      "Evaluate model performance and failure modes on real data.",
    ],
    assessment: [
      { title: "Assignments", weight: 40, outcomes: [1, 3] },
      { title: "Mid-semester exam", weight: 20, outcomes: [2, 3] },
      { title: "Final exam", weight: 40, outcomes: [1, 2, 4] },
    ],
  },
  COMP3703: {
    about:
      "Secure software is designed, not patched. This course covers vulnerabilities across the software lifecycle, threat modelling, static and dynamic analysis, and the professional practice of remediation and responsible disclosure.",
    learningOutcomes: [
      "Identify vulnerabilities across the software lifecycle.",
      "Apply secure design principles and threat modelling.",
      "Test software with static and dynamic analysis tooling.",
      "Plan remediation and disclosure responsibly.",
    ],
    assessment: [
      { title: "Security assessments", weight: 50, outcomes: [1, 2, 3] },
      { title: "Practical exam", weight: 20, outcomes: [3] },
      { title: "Final exam", weight: 30, outcomes: [1, 2, 4] },
    ],
  },
  COMP3900: {
    about:
      "The capstone: a substantial software product delivered for a real client, in a team, over a full semester. You will integrate everything from the computing curriculum while managing scope, risk and delivery like a professional engineering team.",
    learningOutcomes: [
      "Deliver a substantial software product for a real client.",
      "Manage scope, risk and delivery in a team setting.",
      "Integrate technical knowledge across the computing curriculum.",
      "Present and defend design decisions to a diverse audience.",
    ],
    assessment: [
      { title: "Sprint deliverables", weight: 50, outcomes: [1, 2, 3] },
      {
        title: "Final product and demonstration",
        weight: 35,
        outcomes: [1, 3, 4],
      },
      { title: "Individual reflection", weight: 15, outcomes: [2, 4] },
    ],
  },
};

const collegeBySchool: Record<string, string> = {
  "School of Computing": "College of Systems and Society",
  "Mathematical Sciences Institute": "College of Science",
};

const areasBySubject: Record<string, string[]> = {
  Computing: ["Computer Science", "Software Engineering"],
  Mathematics: ["Mathematics", "Statistics"],
  "Cyber Security": ["Cyber Security", "Computer Science"],
  "Data Science": ["Data Science", "Machine Learning"],
};

const offeringDates: Record<
  string,
  {
    startDate: string;
    lastEnrolDate: string;
    censusDate: string;
    endDate: string;
  }
> = {
  "Semester 1": {
    startDate: "23 Feb 2026",
    lastEnrolDate: "2 Mar 2026",
    censusDate: "31 Mar 2026",
    endDate: "29 May 2026",
  },
  "Semester 2": {
    startDate: "27 Jul 2026",
    lastEnrolDate: "3 Aug 2026",
    censusDate: "31 Aug 2026",
    endDate: "30 Oct 2026",
  },
};

/** Deterministic generator so demo values stay stable across server and client renders. */
function seededRandom(seedText: string) {
  let seed = 0;
  for (const character of seedText) {
    seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  }
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function sampleSelt(course: Course): SeltResult[] {
  const random = seededRandom(`selt-${course.code}`);
  const baseEnrolled =
    course.level === 1000 ? 320 : course.level === 2000 ? 180 : 110;
  let agreement = 68 + random() * 22;
  const results: SeltResult[] = [];

  for (let year = 2022; year <= 2026; year += 1) {
    for (const session of ["Semester 1", "Semester 2"]) {
      if (!course.sessions.includes(session)) continue;
      if (year === 2026 && session === "Semester 2") continue;
      agreement = Math.min(97, Math.max(55, agreement + (random() - 0.5) * 14));
      const enrolled = Math.round(baseEnrolled * (0.85 + random() * 0.3));
      const responses = Math.max(
        5,
        Math.round(enrolled * (0.08 + random() * 0.22)),
      );
      results.push({
        term: `${session === "Semester 1" ? "S1" : "S2"} ${year}`,
        enrolled,
        responses,
        agreement: Math.round(agreement),
      });
    }
  }
  return results;
}

const seltThemeNames = [
  "Teaching and learning activities",
  "Workload",
  "Feedback",
  "Analytical development",
  "Overall learning experience",
];

function sampleSeltThemes(course: Course, latest: SeltResult): SeltTheme[] {
  const random = seededRandom(`themes-${course.code}`);
  return seltThemeNames.map((theme) => ({
    theme,
    agreement:
      theme === "Overall learning experience"
        ? latest.agreement
        : Math.round(
            Math.min(
              97,
              Math.max(52, latest.agreement + (random() - 0.5) * 18),
            ),
          ),
  }));
}

export function courseDetail(course: Course): CourseDetail {
  const content = courseContent[course.code] ?? {
    about: course.description,
    learningOutcomes: [],
    assessment: [],
  };
  const random = seededRandom(`class-${course.code}`);
  const offerings: CourseOffering[] = course.sessions.map((session) => ({
    session,
    classNumber:
      session === "Semester 1"
        ? 2000 + Math.floor(random() * 3000)
        : 7000 + Math.floor(random() * 2500),
    mode: course.delivery,
    ...offeringDates[session],
  }));

  const selt = sampleSelt(course);
  const latest = selt[selt.length - 1];

  return {
    about: content.about,
    college: collegeBySchool[course.school] ?? "College of Systems and Society",
    career: "Undergraduate",
    areasOfInterest: areasBySubject[course.subject] ?? [course.subject],
    coTaught: course.incompatibilities.filter((item) =>
      /^[A-Z]{4}6\d{3}[A-Z]?$/.test(item),
    ),
    workloadHours: course.units === 12 ? 260 : 130,
    feeBand: 2,
    domesticFee: course.units * 920,
    internationalFee: course.units * 1170,
    learningOutcomes: content.learningOutcomes,
    assessment: content.assessment,
    assessmentNote:
      "Indicative only. Assessment details are confirmed in the class summary at the start of each offering.",
    offerings,
    selt,
    seltThemes: sampleSeltThemes(course, latest),
  };
}
