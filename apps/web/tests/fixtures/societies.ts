import type { Society } from "@/lib/societies";
import type { SocietyEvent } from "@/lib/society-events";
// Local UI fixtures. Names come from the supplied ANUSA directory and ANU's
// university-life page; descriptions and categories are drafts for review.
export const EXAMPLE_SOCIETIES: Society[] = [
  {
    slug: "amnesty-school-group",
    name: "Amnesty School Group",
    shortName: "Amnesty",
    category: "Advocacy",
    summary: "Connect with students interested in human rights and advocacy.",
    overview:
      "A place to explore human rights, discuss issues that matter to you and meet other students interested in advocacy.",
    interests: ["Human rights", "Advocacy", "Community"],
  },
  {
    slug: "actuarial-society",
    name: "ANU Actuarial Society",
    shortName: "Actuarial",
    logoUrl: "https://resources.getqpay.com/images/63f788d52666e_.png",
    category: "Academic",
    summary: "Meet fellow students interested in actuarial studies and risk.",
    overview:
      "Connect with students who share an interest in actuarial studies, statistics and risk. Explore the community beyond your lectures.",
    interests: ["Actuarial studies", "Statistics", "Careers"],
  },
  {
    slug: "afec-students-society",
    name: "ANU AFEC Students' Society",
    shortName: "AFEC",
    logoUrl: "https://portal.getqpay.com/content/logos/logo_societyid_22.png",
    category: "Academic",
    summary: "A community around accounting, finance, economics and commerce.",
    overview:
      "Meet students across accounting, finance, economics and commerce, with shared interests in study, business and life at university.",
    interests: ["Finance", "Economics", "Commerce"],
  },
  {
    slug: "african-cultural-society",
    name: "ANU African Cultural Society",
    shortName: "African Cultural",
    logoUrl:
      "https://resources.hellorubric.com/uploaded_assets/a419d35b-5c95-4fc8-a7be-44be4e0c7b3d.png",
    category: "Culture and community",
    summary: "Explore African cultures and connect with a campus community.",
    overview:
      "A community for students interested in African cultures, shared experiences and connections at ANU.",
    interests: ["Culture", "Community", "Connection"],
  },
  {
    slug: "agricultural-society",
    name: "ANU Agricultural Society",
    shortName: "Agricultural",
    logoUrl: "https://resources.getqpay.com/images/6487e9090a208_.png",
    category: "Hobbies and interests",
    summary: "Share an interest in agriculture, food systems and rural life.",
    overview:
      "Connect with other students interested in agriculture, food systems and rural communities, whether it relates to your studies or a personal interest.",
    interests: ["Agriculture", "Food systems", "Rural life"],
  },
  {
    slug: "anime-and-gaming-society",
    name: "ANU Anime and Gaming Society",
    shortName: "Anime and Gaming",
    logoUrl: "https://resources.hellorubric.com/images/66ea59668029d_.png",
    category: "Hobbies and interests",
    summary: "We do everything anime & games.",
    overview: "We do everything anime & games.",
    interests: ["Anime", "Gaming", "Pop culture"],
  },
  {
    slug: "chess-society",
    name: "ANU Chess Society",
    shortName: "Chess",
    logoUrl:
      "https://resources.hellorubric.com/uploaded_assets/1dc2044c-615e-4f2b-bae4-d031cf7c4fda.png",
    category: "Hobbies and interests",
    summary: "Find other students who enjoy a game of chess.",
    overview:
      "Explore a shared interest in chess, from learning the basics to discussing strategy and meeting other players on campus.",
    interests: ["Chess", "Strategy", "Games"],
    website: "https://linktr.ee/anuchesssociety",
  },
  {
    slug: "computer-science-students-association",
    directoryUrl: "https://campus.hellorubric.com/?s=243",
    links: [
      { label: "Instagram", url: "https://www.instagram.com/anucssa/" },
      { label: "Facebook", url: "https://www.facebook.com/groups/anucssa/" },
      { label: "Discord", url: "https://discord.com/invite/UETrGuS" },
    ],
    name: "ANU Computer Science Students' Association",
    shortName: "CSSA",
    logoUrl: "https://resources.getqpay.com/images/63c28ac2a9c60_.png",
    category: "Academic",
    summary:
      "A community for computing, software engineering and related interests.",
    overview:
      "Meet students studying or interested in computer science, software engineering and related fields. Explore computing beyond your coursework.",
    interests: ["Computing", "Software", "Technology"],
    website: "https://cs.club.anu.edu.au/",
  },
  {
    slug: "dining-society",
    name: "ANU Dining Society",
    shortName: "Dining",
    logoUrl: "https://portal.getqpay.com/content/logos/logo_societyid_1418.png",
    category: "Hobbies and interests",
    summary: "Connect over food and explore Canberra's dining scene.",
    overview:
      "Share your interest in food with other students and discover more of Canberra's dining scene.",
    interests: ["Food", "Canberra", "Social"],
  },
  {
    slug: "music-society",
    name: "ANU Music Society",
    shortName: "Music",
    category: "Arts and performance",
    summary: "Meet fellow music lovers and explore ensemble playing.",
    overview:
      "A community for students interested in making music together, including concert band, orchestra and big band.",
    interests: ["Music", "Ensembles", "Performance"],
  },
];

// Public Rubric listings checked on 28 September 2026. This is a local snapshot,
// not an automated feed. Times use the Canberra offset on the event date.
export const EXAMPLE_SOCIETY_EVENTS: SocietyEvent[] = [
  {
    id: "d703f8a1-0453-47b4-bdca-d7c1afb29077",
    sourceId: "83324",
    societySlug: "society-for-arts-and-social-sciences",
    category: "workshop",
    title: "Interview Workshop",
    host: "ANU Society for Arts and Social Sciences",
    hostProfileUrl: "https://campus.hellorubric.com/?s=305",
    startsAt: "2026-09-29T12:15:00+10:00",
    endsAt: "2026-09-30T15:30:00+10:00",
    location: "Marie Reay Teaching Centre, Room 5.02",
    sourceUrl: "https://campus.hellorubric.com/?eid=83324",
    description:
      "An interactive workshop from SASS and ANU Careers and Employability covering interview preparation, etiquette and ways to communicate your experience. Open to members and non-members.",
  },
  {
    id: "6fc40105-8a26-4ee2-bb07-434a26fb5c23",
    sourceId: "73879",
    category: "social",
    title: "Team Finding Mixer | ANU CSSA Game Jam 2026",
    host: "ANU Computer Science Students' Association",
    hostProfileUrl: "https://campus.hellorubric.com/?s=243",
    societySlug: "computer-science-students-association",
    startsAt: "2026-09-29T18:00:00+10:00",
    endsAt: "2026-09-29T20:00:00+10:00",
    location: "Birch Innovation Space, 35 Science Road",
    sourceUrl: "https://campus.hellorubric.com/?eid=73879",
    artworkUrl:
      "https://resources.hellorubric.com/uploaded_assets/ba337b15-32d8-4680-b80c-76392886b360.png",
    ticketsUrl: "https://events.humanitix.com/cssa-game-jam-2026",
    description:
      "Meet other students and find a team for the CSSA Game Jam. The optional mixer runs from 6 to 8 pm at Birch Innovation Space, with food and time to get to know potential teammates. The game jam follows on 2 to 4 October.",
  },
  {
    id: "606a6e37-7f1f-4807-8626-34fb2517bbc3",
    sourceId: "72410",
    societySlug: "roleplaying-society",
    category: "gaming",
    title: "TTRPG Tuesdays",
    host: "ANU Roleplaying Society",
    hostProfileUrl: "https://campus.hellorubric.com/?s=1451",
    startsAt: "2026-09-29T18:00:00+10:00",
    endsAt: "2026-09-29T22:00:00+10:00",
    location: "Haydon-Allen Building, Room G050",
    sourceUrl: "https://campus.hellorubric.com/?eid=72410",
    artworkUrl:
      "https://resources.hellorubric.com/uploaded_assets/36ddb5ac-f40b-4ac2-aa86-05b312ef725d.png",
    description:
      "An evening of tabletop roleplaying one-shots, including Dungeons & Dragons, Cyberpunk Red, Daggerheart and Vampire: The Masquerade. No sign-up or equipment is needed. The organisers list free pizza.",
  },
];
