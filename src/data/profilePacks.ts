/* Starter profile quizzes (written in the profile script format — see lib/profile.ts).
   Built on the Big Five personality model, asked through everyday situations rather than "are you organised?". */

export interface ProfilePack {
  id: string;
  industry: "bank" | "any";
  title: string;
  desc: string;
  script: string;
}

const TRAITS = `Traits:
Explorer | compass | Curious, open to new ideas and ways
Planner | clipboard | Organised, accurate and careful
Energiser | bolt | Social, energised by people
Harmoniser | hands | Supportive, puts the team first
Anchor | anchor | Calm and steady under pressure`;

const BANK = `Title: Which Banking Role Matches You?
Intro: 16 everyday questions — nothing about banking. No right or wrong answers. Go with your first instinct, and we'll match you to the banking role that fits how you work.

${TRAITS}

Profiles:
Explorer + Planner | The Product Architect | Product & Strategy Manager | Designs new banking products, built properly
  Strengths: Sees the big picture and the detail; Turns ideas into workable plans; Spots gaps others miss
  Watch: Can over-design before testing; May get impatient with "how we've always done it"
  Work: Share the why, then give room to design the how; Bring them in early on new launches
Explorer + Energiser | The Digital Pioneer | Digital Banking / Fintech Lead | Brings new technology to customers with energy
  Strengths: Quick to try new tools; Gets people excited about change; Learns by doing
  Watch: Starts more than they finish; Can skip the fine print
  Work: Pair with a Planner for roll-outs; Give them a pilot to run
Explorer + Harmoniser | The Change Coach | Learning & Development Lead | Helps people grow and adapt
  Strengths: Makes change feel safe; Curious about people; Good at explaining new things
  Watch: Takes on others' worries; Avoids hard conversations
  Work: Ask for their view on how the team will take a change; Give them people to develop
Explorer + Anchor | The Market Strategist | Treasury / Investment Advisor | Spots opportunities and stays cool when markets move
  Strengths: Calm when things are volatile; Sees options others don't; Comfortable with risk
  Watch: Can seem detached; May move faster than the team
  Work: Give them data and a decision to make; Don't micro-manage the route
Planner + Energiser | The Team Captain | Branch or Department Manager | Drives targets with structure and spirit
  Strengths: Sets clear goals and rallies people; Organised under pressure; Follows through
  Watch: Can push too hard; May overlook quieter voices
  Work: Agree the targets, then let them lead; Tell them early when plans change
Planner + Harmoniser | The Operations Guardian | Operations & Service Lead | Keeps everything running smoothly for everyone
  Strengths: Reliable and thorough; Looks after people and process; Great at routines
  Watch: Finds sudden change stressful; Says yes too often
  Work: Give clear processes and notice of changes; Thank them for the invisible work
Planner + Anchor | The Risk Sentinel | Credit, Risk & Compliance Officer | Accurate, careful and unshakeable
  Strengths: Precise; Steady in an audit or a crisis; Fair and consistent
  Watch: Can seem cautious; Slow to say yes to new ideas
  Work: Bring them the facts; Ask "what could go wrong?" — they'll know
Energiser + Harmoniser | The Relationship Builder | Relationship Manager | Customers trust them and stay with them
  Strengths: Warm and easy to talk to; Remembers people; Builds loyalty
  Watch: Finds saying no hard; Paperwork can slip
  Work: Give them customers to look after; Help with the admin side
Energiser + Anchor | The Deal Maker | Corporate Banker / Business Development | Wins big deals and stays calm under pressure
  Strengths: Confident with clients; Thrives on targets; Handles setbacks well
  Watch: Can be impatient with process; May go it alone
  Work: Set the goal and the guardrails; Celebrate the wins publicly
Harmoniser + Anchor | The Trusted Counsellor | Customer Experience / Complaints Lead | The calm, caring voice people need
  Strengths: Patient; Calms upset customers; Listens before acting
  Watch: Absorbs stress quietly; Slow to raise their own needs
  Work: Check in on them after tough days; Trust them with sensitive cases

Check: 3 & 12 | Planner vs Explorer
Check: 4 & 10 | Anchor vs Planner

Questions:
Q: Your perfect Sunday morning:
A) Trying a café you've never been to | Explorer
B) Getting chores done early, then relaxing | Planner
C) Brunch with a big group of friends | Energiser
D) A slow breakfast with family | Harmoniser
Q*: Pick a colour you're drawn to right now:
A) Electric purple | Explorer
B) Navy blue | Planner
C) Bright orange | Energiser
D) Soft green | Harmoniser, Anchor
Q: You're planning a holiday. You:
A) Book a flight and figure out the rest there | Explorer
B) Make a day-by-day plan with every booking done | Planner
C) Organise a trip for the whole gang | Energiser
D) Choose somewhere everyone in the family will enjoy | Harmoniser
Q: You're stuck in a traffic jam and running late. You:
A) Stay calm — it's out of your hands | Anchor
B) Message ahead and re-plan your day | Planner
C) Call a friend and chat through it | Energiser
D) Look for a side road you've never tried | Explorer
Q: At a restaurant, you usually:
A) Order something you've never tried | Explorer
B) Order your usual favourite | Planner, Anchor
C) Suggest sharing dishes with the table | Energiser, Harmoniser
D) Check what others are having first | Harmoniser
Q*: Which picture would you hang on your wall?
A) A colourful abstract painting | Explorer
B) A neat architectural drawing | Planner
C) A crowded, lively street festival | Energiser
D) A calm lake at sunrise | Anchor, Harmoniser
Q: Your phone's home screen is:
A) Always changing as you try new apps | Explorer
B) Neatly organised into folders | Planner
C) Full of chats and notifications | Energiser
D) Whatever works — you don't think about it | Anchor
Q: At a party where you know only a few people, you:
A) Meet as many new people as you can | Energiser
B) Stay close to the people you know | Harmoniser
C) Find the most interesting person and talk for hours | Explorer
D) Enjoy watching, relaxed, from the side | Anchor
Q: A friend asks you to help them move house this weekend. You:
A) Say yes straight away | Harmoniser
B) Say yes and make a packing plan for them | Planner, Harmoniser
C) Bring more friends and make it fun | Energiser
D) Help, but keep some of the weekend for yourself | Anchor
Q: A big plan you were excited about gets cancelled at the last minute. You feel:
A) Fine — something else will come up | Anchor
B) Annoyed, because you'd planned it all | Planner
C) Excited to do something spontaneous instead | Explorer
D) Mostly sorry for the people who were looking forward to it | Harmoniser
Q*: Which film do you pick?
A) A mind-bending sci-fi | Explorer
B) A clever detective mystery | Planner, Anchor
C) A comedy with friends | Energiser
D) A heartwarming family story | Harmoniser
Q: Something at home breaks. You:
A) Watch a video and try to fix it yourself | Explorer
B) Read the manual first, step by step | Planner
C) Call someone who knows and fix it together | Energiser
D) Stay calm — it'll get fixed soon | Anchor
Q: Choosing a gift for a friend, you:
A) Find something unique they'd never expect | Explorer
B) Check their wish list or ask what they need | Planner
C) Plan a surprise experience together | Energiser
D) Pick something that shows how much you care | Harmoniser
Q: Someone cuts in front of you in a long queue. You:
A) Calmly point out where the queue starts | Anchor
B) Let it go — it's not worth the fuss | Harmoniser
C) Make a joke about it to the people around you | Energiser
D) Feel annoyed — rules are rules | Planner
Q*: Pick an animal you'd like to be for a day:
A) A fox — clever and curious | Explorer
B) An owl — wise and watchful | Planner, Anchor
C) A dolphin — playful and social | Energiser
D) An elephant — loyal and protective | Harmoniser
Q: After a really long week, you recharge by:
A) Starting a new hobby or project | Explorer
B) Sorting out your space and next week's plans | Planner
C) Going out with people | Energiser
D) Quiet time alone or with family | Anchor, Harmoniser`;

const WORK = `Title: What's Your Work Style?
Intro: 20 quick questions about how you like to work. No right or wrong answers — the last four are agree or disagree.

${TRAITS}

Profiles:
Explorer + Planner | The Architect | Strategist / Product Designer | Big ideas, built properly
  Strengths: Sees the whole system; Turns ideas into plans
  Watch: Can over-plan; Impatient with old habits
  Work: Give the why, then room for the how
Explorer + Energiser | The Spark | Innovator / Campaign Lead | Lights up a room with new ideas
  Strengths: Brings energy to change; Learns fast
  Watch: Starts more than they finish
  Work: Pair with a finisher; Give them a pilot
Explorer + Harmoniser | The Guide | Coach / Trainer | Helps others grow into what's next
  Strengths: Makes change feel safe; Curious about people
  Watch: Avoids hard conversations
  Work: Ask how the team will take a change
Explorer + Anchor | The Navigator | Analyst / Researcher | Finds a calm path through the unknown
  Strengths: Cool under uncertainty; Sees options
  Watch: Can seem distant
  Work: Give data and freedom
Planner + Energiser | The Captain | Team Lead / Project Manager | Sets the course and rallies the crew
  Strengths: Clear goals; Strong follow-through
  Watch: Can push too hard
  Work: Agree targets, then let them lead
Planner + Harmoniser | The Steward | Operations / Support Lead | Keeps people and process in good shape
  Strengths: Reliable; Looks after everyone
  Watch: Says yes too often
  Work: Give notice of changes; Thank the invisible work
Planner + Anchor | The Engineer | Specialist / Quality Lead | Precise, steady, dependable
  Strengths: Accurate; Calm in a crisis
  Watch: Cautious with new ideas
  Work: Bring facts; Ask what could go wrong
Energiser + Harmoniser | The Connector | Account / Community Manager | Builds trust and brings people together
  Strengths: Warm; Builds loyalty
  Watch: Finds saying no hard
  Work: Give them people to look after
Energiser + Anchor | The Closer | Sales / Business Development | Confident, persuasive, unshaken by setbacks
  Strengths: Thrives on targets; Bounces back
  Watch: Impatient with process
  Work: Set goal and guardrails; Celebrate wins
Harmoniser + Anchor | The Counsellor | HR / Customer Care Lead | The calm, caring voice in the room
  Strengths: Patient; Listens first
  Watch: Absorbs stress quietly
  Work: Check in after tough days

Check: 1 & 13 | Planner vs Explorer

Questions:
Q: A new software tool is rolled out at work. You:
A) Explore every feature before anyone else | Explorer
B) Wait for the guide and learn it step by step | Planner
C) Learn it together with colleagues | Energiser
D) Help teammates who are struggling with it | Harmoniser
Q: Your manager suddenly moves a deadline two days earlier. You:
A) Stay calm and re-plan the work | Anchor, Planner
B) Feel the stress and push through | Planner
C) Rally the team to get it done together | Energiser
D) Check how it affects the others first | Harmoniser
Q: At a work event where you know few people, you:
A) Start conversations with new people | Energiser
B) Stay with the one or two people you know | Harmoniser
C) Look for an interesting topic or display | Explorer
D) Leave once you've done what was needed | Planner
Q*: Your desk at the end of a normal day is:
A) Tidy, with everything in its place | Planner
B) Covered in notes and ideas | Explorer
C) Whatever state it's in — it doesn't bother you | Anchor
D) Cleared enough for whoever uses it next | Harmoniser
Q: Two teammates disagree in a meeting. You:
A) Find the middle ground between them | Harmoniser
B) Steer back to facts and the plan | Planner, Anchor
C) Suggest a third, new option | Explorer
D) Speak up and lighten the mood | Energiser
Q: You made a mistake that a client noticed. That evening you:
A) Let it go — it's fixed and you'll learn from it | Anchor
B) Replay it in your head several times | Planner
C) Talk it through with a friend | Energiser
D) Worry most about how it affected the client | Harmoniser
Q: You get a free hour at work. You'd rather:
A) Learn something new that isn't part of your job | Explorer
B) Get ahead on next week's tasks | Planner
C) Catch up with colleagues | Energiser
D) Offer help to someone who's busy | Harmoniser
Q: A colleague asks for help when you're already busy. You:
A) Help straight away | Harmoniser
B) Agree a time that works for you both | Planner
C) Point them to someone else who can help | Anchor
D) Help, and turn it into a quick team chat | Energiser
Q*: On holiday, you prefer:
A) Somewhere new, without a plan | Explorer
B) A planned trip with bookings made | Planner
C) A group trip with friends | Energiser
D) A quiet place to rest | Anchor
Q: For your next project, you'd pick:
A) Something no one has tried before | Explorer
B) A well-defined project with clear goals | Planner
C) A project with a big, lively team | Energiser
D) A project that clearly helps people | Harmoniser
Q: Ten minutes before a big presentation, you are:
A) Calm and ready | Anchor
B) Going over your notes one more time | Planner
C) Chatting with the audience as they arrive | Energiser
D) Picturing a new way to open the talk | Explorer
Q: Feedback that would motivate you most:
A) "That was a fresh idea." | Explorer
B) "That was thorough and reliable." | Planner
C) "You brought the team together." | Energiser, Harmoniser
D) "You stayed steady when things got hard." | Anchor
Q: When you read instructions, you:
A) Skim them, then work it out yourself | Explorer
B) Read every step before starting | Planner
C) Ask someone to show you instead | Energiser
D) Follow them, but adjust if they don't fit | Anchor
Q: Plans change at the last minute. You feel:
A) Fine — changes happen | Anchor
B) Annoyed, because you had it planned | Planner
C) Excited by something new | Explorer
D) Concerned for whoever it affects most | Harmoniser
Q: After a long, busy week, you recharge by:
A) Going out with people | Energiser
B) Doing a hobby or project of your own | Explorer
C) Resting quietly at home | Anchor
D) Spending time with family | Harmoniser
Q: Your team could be remembered for one thing. You'd choose:
A) Doing something truly new | Explorer
B) Delivering everything on time and well | Planner
C) Being the most fun team to work with | Energiser
D) Looking after each other | Harmoniser
Scale: I make a to-do list before I start my day. | Planner
Scale: I feel drained after a day full of meetings. | Energiser -
Scale: Small setbacks can ruin my mood for the day. | Anchor -
Scale: I go out of my way to make newcomers feel welcome. | Harmoniser`;

export const PROFILE_PACKS: ProfilePack[] = [
  { id: "profile-bank", industry: "bank", title: "Which Banking Role Matches You?", desc: "16 everyday questions match each person to one of 10 banking roles — Risk Sentinel, Relationship Builder, Digital Pioneer…", script: BANK },
  { id: "profile-any", industry: "any", title: "What's Your Work Style?", desc: "20 questions (including agree/disagree) reveal one of 10 work styles — Architect, Spark, Captain, Connector…", script: WORK },
];
