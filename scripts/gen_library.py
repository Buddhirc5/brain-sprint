"""Builds src/data/library.json — the starter question library new companies can copy.
Generic sets (any industry) are written here; banking sets come from the demo bank's quizzes.
Run: python3 scripts/gen_library.py"""
import json, random, pathlib

random.seed(7)
ROOT = pathlib.Path(__file__).resolve().parent.parent

def mcq(i, topic, q, opts, ans, why):
    return ({"id": i, "type": "mcq", "topic": topic, "q": q, "options": opts, "explain": why}, str(ans))

def tf(i, topic, q, val, why):
    return ({"id": i, "type": "tf", "topic": topic, "q": q, "explain": why}, "T" if val else "F")

def match(i, topic, q, pairs, why):
    left = [p[0] for p in pairs]; rights = [p[1] for p in pairs]
    right = rights[:]
    while right == rights: random.shuffle(right)
    return ({"id": i, "type": "match", "topic": topic, "q": q, "left": left, "right": right, "explain": why}, ",".join(str(right.index(r)) for r in rights))

def order(i, topic, q, steps, why):
    items = steps[:]
    while items == steps: random.shuffle(items)
    return ({"id": i, "type": "order", "topic": topic, "q": q, "items": items, "explain": why}, ",".join(str(items.index(s)) for s in steps))

def item(id_, title, topic, industry, qs):
    return {"id": id_, "title": title, "topic": topic, "industry": industry,
            "questions": [q for q, _ in qs], "answers": {q["id"]: a for q, a in qs}}

T1 = "Cyber Security"
cyber = item("lib-cyber", "Cyber Security Basics", T1, "any", [
    mcq("cy1", T1, "An email says your account will be closed in 2 hours unless you 'verify' your password. What should you do?",
        ["Click the link quickly", "Reply with your password", "Report it as phishing and delete it", "Forward it to a colleague to check"], 2,
        "Urgency plus a request for credentials is a classic phishing sign. Report it using your company's phishing button."),
    tf("cy2", T1, "It's safe to reuse a strong password on several work systems.", False,
       "If one system leaks, every system with the same password is exposed. Use a password manager and unique passwords."),
    mcq("cy3", T1, "Which of these is the strongest password?", ["Summer2026!", "P@ssw0rd", "river-Lamp-kite-73-Mango", "Company123"], 2,
        "Long passphrases of random words are far harder to crack than short 'complex' words."),
    match("cy4", T1, "Match each threat to what it means", [["Phishing", "Fake message that tricks you into acting"], ["Malware", "Harmful software"], ["Tailgating", "Following someone through a secure door"], ["Vishing", "Scam by phone call"]],
          "Knowing the names helps you report attacks quickly and accurately."),
    tf("cy5", T1, "You should lock your screen every time you leave your desk, even for a minute.", True,
       "An unlocked screen lets anyone act as you. Windows + L (or Ctrl + Cmd + Q on Mac) takes a second."),
    order("cy6", T1, "You clicked a suspicious link. Put the steps in order.", ["Disconnect from the network", "Report it to IT security", "Change passwords from a safe device", "Watch for unusual activity"],
          "Contain first, then report, then recover. Reporting fast limits the damage."),
])
T2 = "Data Privacy"
privacy = item("lib-privacy", "Data Privacy Essentials", T2, "any", [
    mcq("dp1", T2, "What is personal data?", ["Only ID card numbers", "Any information that can identify a person", "Only data stored on paper", "Only customer bank details"], 1,
        "Names, emails, phone numbers, photos and IDs are all personal data when they can identify someone."),
    tf("dp2", T2, "It's fine to email a customer list to your personal address so you can work from home.", False,
       "Company data must stay on approved systems. Personal email is outside the company's controls."),
    mcq("dp3", T2, "A customer asks what data you hold about them. What do you do?", ["Ignore it", "Send everything by WhatsApp", "Follow the data request process and verify their identity", "Tell them it's confidential"], 2,
        "People have a right to access their data, but identity must be verified first and the official process used."),
    tf("dp4", T2, "Collect only the personal data you actually need for the task.", True, "This is 'data minimisation' — less data means less risk."),
    match("dp5", T2, "Match each principle to its meaning", [["Minimisation", "Collect only what you need"], ["Accuracy", "Keep data correct and up to date"], ["Retention", "Keep data only as long as needed"], ["Security", "Protect data from loss or misuse"]],
          "These principles appear in most privacy laws, from GDPR to local data-protection acts."),
    mcq("dp6", T2, "You found printed customer forms left at the printer. Best action?", ["Leave them", "Bin them", "Return them securely and tell the owner / your manager", "Take a photo"], 2,
        "Treat it as a possible data incident: secure the documents and report it."),
])
T3 = "Customer Service"
service = item("lib-service", "Customer Service Excellence", T3, "any", [
    mcq("cs1", T3, "A customer is upset. What should you do first?", ["Explain the policy", "Listen fully without interrupting", "Transfer them", "Offer a discount"], 1,
        "People calm down when they feel heard. Listen, acknowledge, then solve."),
    tf("cs2", T3, "Promising a callback time you can't meet is better than saying you don't know yet.", False,
       "Broken promises damage trust more than honest uncertainty. Give a realistic time and keep it."),
    order("cs3", T3, "Put the complaint-handling steps in order", ["Listen", "Apologise and empathise", "Agree a solution", "Follow up"],
          "The LAAF flow: listen, apologise, agree, follow up."),
    mcq("cs4", T3, "Which phrase sounds most helpful?", ["That's not my department", "Let me find the right person and stay with you", "You'll have to call again", "It's the system"], 1,
        "Own the problem until it reaches someone who can solve it."),
    tf("cs5", T3, "Using the customer's name (when appropriate) makes service feel more personal.", True, "Small personal touches build rapport."),
])
T4 = "Health & Safety"
safety = item("lib-safety", "Workplace Health & Safety", T4, "any", [
    mcq("hs1", T4, "The fire alarm sounds. What do you do?", ["Finish your email", "Use the lift", "Leave by the nearest exit and go to the assembly point", "Wait for your manager"], 2,
        "Never use lifts in a fire. Go straight to the assembly point so wardens can count everyone."),
    tf("hs2", T4, "You should report near-misses even when nobody was hurt.", True, "Near-misses show where the next accident could happen."),
    match("hs3", T4, "Match the sign colour to its meaning", [["Red", "Prohibition or fire equipment"], ["Yellow", "Warning"], ["Blue", "Mandatory action"], ["Green", "Safe condition / exit"]],
          "Safety sign colours follow ISO 7010 in most countries."),
    mcq("hs4", T4, "Good screen posture means the top of the monitor is…", ["Well above your eyes", "At or slightly below eye level", "On the desk", "Behind you"], 1,
        "At or just below eye level keeps your neck neutral."),
    tf("hs5", T4, "A small spill can be left for the cleaners if you're busy.", False, "Slips are among the most common workplace injuries. Clean or signal it right away."),
])
T5 = "Company Policies"
ethics = item("lib-ethics", "Code of Conduct & Ethics", T5, "any", [
    mcq("et1", T5, "A supplier offers you an expensive gift during a tender. You should…", ["Accept quietly", "Decline and report it per the gifts policy", "Accept and share with the team", "Ask for cash instead"], 1,
        "Gifts during a tender can look like bribery. Decline and declare it."),
    tf("et2", T5, "A conflict of interest only matters if you actually benefit from it.", False, "Even the appearance of a conflict must be declared."),
    mcq("et3", T5, "Where can you raise a concern anonymously?", ["Social media", "The whistleblowing channel", "Nowhere", "The customer"], 1,
        "Whistleblowing channels protect people who speak up in good faith."),
    tf("et4", T5, "Speaking up about misconduct in good faith is protected from retaliation.", True, "Retaliation against good-faith reporters is itself misconduct."),
    order("et5", T5, "You notice something that may break policy. Put the steps in order.", ["Pause and don't join in", "Note the facts", "Raise it with your manager or the ethics line", "Cooperate with any review"],
          "Stop, record, report, cooperate."),
])
T6 = "General Knowledge"
fun = item("lib-fun", "Friday Fun Trivia", T6, "any", [
    mcq("fn1", T6, "Which planet is known as the Red Planet?", ["Venus", "Mars", "Jupiter", "Mercury"], 1, "Iron oxide dust gives Mars its red colour."),
    tf("fn2", T6, "Honey never spoils if stored properly.", True, "Low water and high acidity keep bacteria out — edible honey has been found in ancient tombs."),
    mcq("fn3", T6, "How many minutes are in a full day?", ["1,240", "1,440", "1,600", "2,400"], 1, "24 × 60 = 1,440."),
    match("fn4", T6, "Match the country to its capital", [["Japan", "Tokyo"], ["Australia", "Canberra"], ["Canada", "Ottawa"], ["Brazil", "Brasília"]], "Canberra, Ottawa and Brasília catch lots of people out."),
    tf("fn5", T6, "Lightning never strikes the same place twice.", False, "Tall buildings are struck many times a year."),
])

# banking sets — taken from the demo bank's quizzes (answers from its key file)
seed = json.loads((ROOT / "src/demo/seed.json").read_text())
def from_seed(gid, id_, title, topic):
    g = seed["games"][gid]; k = seed["keys"][gid]["answers"]
    qs = []
    for q in g["questions"]:
        q = {kk: vv for kk, vv in q.items() if kk != "check"}
        q["id"] = id_[4:] + "-" + q["id"]
        qs.append((q, k[q["id"].split("-", 1)[1]]))
    return item(id_, title, topic, "bank", qs)

bank = [
    from_seed("g-aml", "lib-aml", "AML Sprint", "AML & Compliance"),
    from_seed("g-cyber", "lib-bcyber", "Cyber Shield for Banks", "Cyber Security"),
    from_seed("g-digital", "lib-digital", "Digital Banking Blitz", "Digital & Payments"),
]
lib = [cyber, privacy, service, safety, ethics, fun] + bank
txt = json.dumps(lib, ensure_ascii=False, indent=1).replace("harbor-secure-login.co", "yourbank-secure-login.co")
(ROOT / "src/data").mkdir(exist_ok=True)
(ROOT / "src/data/library.json").write_text(txt)
print(len(lib), "sets,", sum(len(i["questions"]) for i in lib), "questions")
