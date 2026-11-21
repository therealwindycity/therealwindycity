/* Point-of-Order Exhibit — 2026 Cheyenne Transcript-vs-Document Contradiction Matrix
   Rows 1–6 from the owner-supplied contradiction matrix (AI Mode pull, Nov 2026);
   rows 7–18 reconstructed from this repo's verified records (dockets, debriefs,
   violations register, highlands timeline, legal dissertation).

   DISCIPLINE: every row cites a verified meeting body, date, speaker/document
   source, and statute/packet discrepancy. No invented verbatim video timestamps.
   Where a pin-cite was corrected by repo audit (OMA mapping), the correction is
   carried in the row itself. */

(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  root.POE_MATRIX = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const REBUTTAL_SECONDS = 30;

  const rows = [
    {
      id: 'POE-01',
      date: 'July 13, 2026',
      body: 'City Council',
      source: 'Microsoft representatives / Highlands Annexation Ordinance (Ord. 4687)',
      claim: 'Microsoft representatives stated on the record that Microsoft had closed the purchase transaction and was the actual legal owner as of June 26, 2026, during the public hearing on the 3,460-acre Highlands annexation.',
      record: 'The written annexation ordinance adopted 6–3 by Council that same evening still listed Lummis Livestock Company LLC as the legal owner of record without amendment.',
      statute: 'Wyo. Stat. §§ 15-1-402 / 15-1-404',
      leverage: 'Statutory defect / judicial review: annexation petitions require accurate ownership verification; failure to amend the ordinance on the record forms the basis for arbitrary-and-capricious nullification challenges (cited in Donis litigation).',
      tags: ['annexation', 'highlands', 'ordinance'],
      irac: {
        issue: 'Whether an annexation ordinance that recites a superseded owner of record, after the buyer conceded closing on the record the same evening, satisfies the ownership-verification requirements of Wyo. Stat. §§ 15-1-402 and 15-1-404.',
        rule: 'Wyo. Stat. §§ 15-1-402 and 15-1-404 require accurate ownership verification in annexation petitions; findings that are contradicted by the agency’s own hearing record are arbitrary and capricious under Wyoming review standards.',
        application: 'On July 13, 2026, Microsoft’s representatives told the Council the purchase had closed as of June 26, 2026. The ordinance adopted 6–3 that night still named Lummis Livestock Company LLC and was never amended on the record — the written instrument contradicts the sworn-by-presence hearing representation inside the same proceeding.',
        conclusion: 'The ownership recital is impeachable by the City’s own record; preserve the point for § 15-1-409 appeal / arbitrary-and-capricious challenge and demand a correcting amendment before publication.'
      },
      rebuttal: 'On July 13, Microsoft told this Council it had closed the purchase and owned the land as of June 26. The ordinance you adopted that night still names Lummis Livestock LLC. Wyoming Statutes 15-1-402 and 15-1-404 require accurate ownership verification. You adopted a title the record already contradicted. Correct it on the record — or expect it in court.',
      sources: ['highlands-timeline.md', 'highlands-meetings-analysis.md', 'miller-comments-2026-07-13.md']
    },
    {
      id: 'POE-02',
      date: 'Sept. 28 – Nov. 17, 2026',
      body: 'Council & Finance Committee',
      source: "Bally's Wyoming, LLC / Supporting Doc. 21 & Nov. 17 Finance Packet",
      claim: "In September/October, Bally's secured special use and simulcasting approval for 3307 Nationway (Cadillac Ranch). By Nov. 17 Finance, Bally's sought a bar & grill liquor license for 1734 Meadowland Dr. (former Old Chicago), characterizing the Meadowland operation as a ~10-employee venue keeping the prior restaurant footprint.",
      record: 'While Meadowland Dr. was approved for simulcasting in Sept. and framed as a low-impact restaurant layout in Nov., Bally’s simultaneously expanded its multi-site gaming footprint across Cheyenne (3307 Nationway & 1734 Meadowland) while tapping scarce municipal bar & grill license inventory (leaving only 2 citywide).',
      statute: 'UDC § 2.2.7',
      leverage: 'Licensing & zoning scrutiny: challenge cumulative traffic, parking, and gaming-concentration impacts under UDC § 2.2.7 across dual sites during the Nov. 23 full Council liquor license vote.',
      tags: ['licensing', 'gaming', 'ballys'],
      irac: {
        issue: 'Whether separate approvals for gaming, simulcasting, and liquor at two Bally’s sites may be reviewed cumulatively under UDC § 2.2.7 rather than one application at a time.',
        rule: 'UDC § 2.2.7 requires compatibility review of land uses; local liquor licensing is a Council discretion checkpoint where cumulative impacts on traffic, parking, and license inventory are cognizable.',
        application: 'The same operator holds special-use/simulcasting at 3307 Nationway (Sept.) and sought bar & grill liquor at 1734 Meadowland (Nov. 17), describing a ~10-restaurant-footprint venue while the citywide bar & grill pool dropped to two. Each application was framed as isolated; the footprint is not.',
        conclusion: 'Demand a consolidated UDC § 2.2.7 record across both sites before the Nov. 23 liquor vote; a license granted on a single-site record is vulnerable on compatibility grounds.'
      },
      rebuttal: 'Bally’s wants you to review these applications one at a time. Don’t. Nationway gaming in September, Meadowland liquor in November — same operator, one footprint, two doors. UDC 2.2.7 requires compatibility review of cumulative impacts. Two sites, two traffic counts, one depleted license pool — only two bar and grill licenses left citywide. Build the combined record on both sites before the November 23 vote.',
      sources: ['2026-09-14-council/RED_TEAM_and_SPEECHES_2026-09-14.md', '2026-09-14-council/civicwatch/briefs/brief_2026-09-21_event1443.md']
    },
    {
      id: 'POE-03',
      date: 'March 9 – Nov. 9, 2026',
      body: 'Public Services & City Council',
      source: 'Planning Staff & Council Majority / County Pocket Annexation No. 10 & PLTA-26-4',
      claim: 'In March 2026, Council delayed annexing the 49-acre pocket (16 parcels, including WY Fresh Farm) until Nov. 9 with assurances that staff would draft UDC urban agriculture amendments (PLTA-26-4) to protect ongoing farm operations.',
      record: 'On Nov. 9, Council voted 8–2 to annex WY Fresh Farm effective Dec. 7 before adopting the promised UDC agricultural protections (one amendment was postponed two weeks and a second rejected outright). Municipal code converts post-annexation zoning infractions into criminal misdemeanors (up to 6 months jail / $750 fine), and no exemption from municipal nuisance ordinances was included.',
      statute: 'Due process / estoppel record; Wyo. Food Freedom Act context (PLTA-26-4)',
      leverage: 'Cite the March 9–Nov. 9 sequence as a bait-and-switch regulatory taking / constructive eviction: annexation stripped county agricultural protections without enacting the promised UDC safe harbors.',
      tags: ['annexation', 'wy-fresh', 'urban-ag'],
      irac: {
        issue: 'Whether the City is equitably estopped from annexing farmland and imposing criminal zoning exposure before delivering the urban-agriculture protections it promised as the express condition of postponement.',
        rule: 'Promissory estoppel requires a clear promise, reasonable reliance, and detriment; due process forbids criminalizing conduct under a regulatory scheme the regulator admitted it had not yet aligned or enacted.',
        application: 'March 9: postponement to Nov. 9 sold as time to draft PLTA-26-4 protections (“write the actual law… adhere to the Wyoming Food Freedom Act”). Aug. 21: Director Bloom concedes farm ordinances “don’t necessarily fall in line with state statute.” Nov. 9: annexation approved 8–2 effective Dec. 7 with the protections postponed/rejected — and the code carries up to six months / $750 for zoning infractions.',
        conclusion: 'The reliance sequence is documented end-to-end; it supports estoppel, regulatory-taking, and arbitrary-and-capricious theories against the Dec. 7 effective date.'
      },
      rebuttal: 'In March you postponed the WY Fresh annexation promising urban-farm protections. In August your planning director admitted the farm ordinances don’t even line up with state statute. On November ninth you annexed anyway — protections postponed, one rejected. December seventh, that family farms under criminal penalties you promised to remove. That is estoppel, and it is on your record.',
      sources: ['drops-2026-08-24-wy-fresh-endgame.md', 'TONIGHT-2026-08-24-master-brief.md', 'TONIGHT-2026-08-24-final-agenda-analysis.md']
    },
    {
      id: 'POE-04',
      date: 'Oct. 21 – Nov. 16, 2026',
      body: 'Planning Comm., Public Services & Council',
      source: 'Chief of Staff Amber Ash, Planner Seth Lloyd / UDC §§ 5.7.1 & 5.7.14',
      claim: 'City leadership and planning staff promoted new UDC rules (§ 5.7.1 Data Centers; § 5.7.14 Power Generation) as “stringent guardrails” responding to public concern over noise, water, lighting, and on-site power generation.',
      record: 'At the Oct. 21 Planning Commission, § 5.7.1 was postponed after floor amendments added 1–2 mile setbacks for on-site power and 2,000-ft setbacks for round-the-clock fuel cells/generators. By Nov. 12–16, Council again postponed second reading to Nov. 23 amid unresolved noise standards, while existing projects (e.g., Microsoft’s 3,460-acre annexation) raced ahead under legacy Business Park/Industrial “use-by-right” rules.',
      statute: 'UDC §§ 5.7.1 & 5.7.14; vested-rights doctrine',
      leverage: 'Demand explicit non-severability and applicability language prior to Nov. 23 second reading so pending hyperscale site plans cannot vest under pre-amendment UDC rules.',
      tags: ['udc', 'data-centers', 'vested-rights'],
      irac: {
        issue: 'Whether “guardrail” amendments enacted after development applications are pending can be evaded through vesting under the pre-amendment UDC use-by-right rules.',
        rule: 'Vested-rights doctrine protects reliance on rules in effect at a qualifying application stage; a jurisdiction may control that gap only through explicit applicability/non-severability text in the enacting ordinance.',
        application: 'The City marketed §§ 5.7.1/5.7.14 as stringent, yet both readings were postponed (Oct. 21 PC; Nov. 12–16 Council → Nov. 23) with noise standards unresolved, while the 3,460-acre Highlands package and other hyperscale projects proceed under legacy Business Park/Industrial use-by-right.',
        conclusion: 'Without express prospective-applicability language, the guardrails are structurally severable from pending projects; demand that language on the record before second reading.'
      },
      rebuttal: 'You call these data-center rules stringent guardrails. October twenty-first, postponed. November twelfth, postponed again to the twenty-third. Noise standards still unresolved — while Microsoft’s three thousand four hundred sixty acres races ahead under the old use-by-right rules. If you mean it, put applicability and non-severability in the ordinance text before second reading. Otherwise the guardrails guard nothing.',
      sources: ['udc-draft-fulltext-analysis.md', 'udc-sleeper-items-scan-2026-08-24.md', 'highlands-timeline.md']
    },
    {
      id: 'POE-05',
      date: 'Oct. 26 – Nov. 2026',
      body: 'Council & Finance Committee',
      source: 'Engineering Dept. / Contract No. 7782 Mod. 2 (DHM Design)',
      claim: 'Engineering staff and DDA partners framed the Reed Avenue Rail Corridor as advancing smoothly on a $2.56M FRA grant and 2021 6th Penny funds toward construction.',
      record: 'Contract Modification #2 to Contract #7782 (referred Oct. 26) nearly doubled the design contract cost due to major BNSF Railway alignment/crossing redesign demands — even though the City’s project page still listed “Final design is expected in early 2025” and Engineering had to seek ~$15M on the 2026 6th Penny ballot to fund just half of construction.',
      statute: '2017/2023 6th Penny ballot-language scope; municipal contract amendment authority',
      leverage: 'Pull Contract #7782 Mod. 2 line items to verify whether 6th Penny ballot language authorizes paying for BNSF-mandated scope escalations.',
      tags: ['contracts', 'reed-avenue', '6th-penny'],
      irac: {
        issue: 'Whether Contract No. 7782 Modification 2 — nearly doubling design cost for BNSF-mandated redesign — falls within the authorized scope of 6th Penny ballot funds and the original FRA-grant project description.',
        rule: '6th Penny appropriations are bound by ballot-language project scope; contract modifications must stay within authorized purpose, and capital project pages must reflect actual design status.',
        application: 'The corridor was publicly framed as smoothly advancing on a $2.56M FRA grant plus 2021 6th Penny money, and the project page still said final design was expected in early 2025 — yet Mod. 2 (referred Oct. 26) nearly doubles the design contract for BNSF alignment/crossing redesign, while ~$15M more is sought on the 2026 ballot for half of construction.',
        conclusion: 'Produce Mod. 2 line items against ballot language; if BNSF scope is not authorized, the amendment needs a new appropriation, not a quiet modification.'
      },
      rebuttal: 'The Reed Avenue corridor was sold as smooth — a 2.56 million dollar federal grant, 2021 sixth-penny money, final design “expected in early 2025.” Then contract modification two nearly doubles the design cost for BNSF redesign, and you’re asking for fifteen million more on this year’s ballot. Show us the line items. Does ballot language cover this, or don’t you know?',
      sources: ['PULL-2026-08-27-status-to-date.md', 'miller-change-vector.md', 'miller-press-index.md']
    },
    {
      id: 'POE-06',
      date: 'Sept. – Oct. 2026',
      body: 'Finance & City Council',
      source: 'Police Dept. / Lenco, Motorola & Axon sole-source waivers',
      claim: 'Approved via consent/routine purchasing actions as single-vendor standardization needs: 2 Lenco BearCat G3s for $853,980; Motorola radios for $176,868.02; Axon in-car cameras for $88,410.20.',
      record: 'Totaling $1,119,258.22 across three separate sole-source waivers in 60 days, the Lenco purchase pulled $853,980 directly from General Fund Reserves alongside a separate $250,000 reserve draw for Airport Golf Course cart paths — bypassing competitive bidding while tapping unallocated reserves.',
      statute: 'Wyo. Stat. § 15-1-113 (municipal bidding framework); City sole-source justification requirements',
      leverage: 'Audit written sole-source justifications and reserve-draw authority for all three waivers; the pattern — three vendors, one quarter, reserves as the funding line — is the story, not any single buy.',
      tags: ['procurement', 'sole-source', 'reserves'],
      irac: {
        issue: 'Whether three sole-source waivers totaling $1,119,258.22 in 60 days, funded in part from General Fund Reserves, satisfy the written-justification and reserve-expenditure requirements governing municipal purchases.',
        rule: 'Wyo. Stat. § 15-1-113 and the City’s purchasing ordinance require documented sole-source justification and lawful appropriation source; reserves are for contingencies, not recurring equipment cycles.',
        application: 'Lenco $853,980 (reserves), Motorola $176,868.02, Axon $88,410.20 — all inside60 days, each presented as routine/consent. The Motorola pair ($94,847.22 + $82,020.80) is documented in the Aug. 24 docket with “system failing” language and State Contract 39014-WYOLINK pricing; no failure-date work order was produced with the packet.',
        conclusion: 'The technical locks (WyoLink, Axon platform) may survive on the merits — the funding line and missing failure documentation will not. Demand both before any further waiver.'
      },
      rebuttal: 'Three sole-source waivers in sixty days: Lenco, Motorola, Axon — one million one hundred nineteen thousand dollars, no bids. Eight hundred fifty-three thousand of it straight from General Fund Reserves, next to a quarter-million for golf cart paths. If the system is failing, show us the work order and the date. If it’s routine, why are you raiding the reserves?',
      sources: ['docket-2026-08-24-gb.md', 'redteam-2026-08-24-agenda.md', 'TONIGHT-2026-08-24-final-agenda-analysis.md', 'CA-pull-kit-2026-08-24.md']
    },
    {
      id: 'POE-07',
      date: 'Oct. 26, 2026',
      body: 'City Council',
      source: 'Item 30c / Historic Pumphouse contract record',
      claim: 'The $1,365,402.00 Historic Pumphouse contract was placed strictly as an Announcement five months after the May fire — zero committee referral, zero roll-call vote.',
      record: 'A contract of this size was announced rather than agendized for referral and approval, with no roll-call recorded on execution.',
      statute: 'CMC § 2.04.160(B),(D) & Wyo. Stat. § 15-1-113',
      leverage: 'Contracts over the statutory threshold require sealed bidding and Council approval prior to execution; an announcement is not an approval (RONR 23:6(c) continuing-breach framing).',
      tags: ['contracts', 'pumphouse', 'bidding'],
      irac: {
        issue: 'Whether announcing a $1,365,402.00 contract as an “Announcement” item, without committee referral or a roll-call vote, satisfies CMC § 2.04.160 referral/readings and Wyo. Stat. § 15-1-113 bidding-and-approval requirements.',
        rule: 'CMC § 2.04.160(B),(D) requires committee referral and the ordinance reading path; Wyo. Stat. § 15-1-113 requires sealed bidding above the threshold and Council approval before execution.',
        application: 'On Oct. 26, 2026 the $1,365,402.00 Pumphouse contract — five months after the May fire — appeared strictly as an Announcement. No referral, no roll-call, no bid record surfaced with the item.',
        conclusion: 'Execution without bid and approval is voidable; demand the sealed-bid file, the referral history, and a ratifying roll-call — or rescind.'
      },
      rebuttal: 'Item thirty-c: a million three hundred sixty-five thousand dollars for the Pumphouse — announced, not agendized. No committee referral. No roll-call vote. Five months after the fire, you told the public instead of asking them. Cheyenne code and Wyoming statute 15-1-113 require sealed bidding and council approval before execution. Produce the bid file — or rescind.',
      sources: ['pipeline/notebooklm/cheyenne_minutes_2019.md', 'miller-canon-index.md']
    },
    {
      id: 'POE-08',
      date: 'Aug. 10, 2026',
      body: 'City Council',
      source: 'Post-executive-session action / Aug. 10 minutes (meta 149954)',
      claim: 'Council exited closed session before adjournment and passed an un-noticed motion directing the City Attorney to seek a declaratory judgment on whether the referendum process applies to the annexation ordinance — 8–1 (Moody dissenting).',
      record: 'The minutes minuted the DJ authorization in full (executive session under § 16-4-405 first; action on emergence; all-yes except Moody). No prior public notice of the action item existed on the agenda.',
      statute: 'Wyo. Stat. §§ 16-4-403 (purpose-circumvention), 16-4-405; RONR 9:24. Repo audit correction: the kit’s “16-4-403(a) public action / 16-4-404 agenda” pin-cites do not track the codification — § 403 is the anti-circumvention clause; OMA requires notice of meetings, not itemized agendas (itemization is Cheyenne self-imposed).',
      leverage: 'Purpose-circumvention theory under § 16-4-403 plus any ordinance-based agenda rule; grade B− per repo legal audit — real, but narrower than “null and void” rhetoric. Live precedent: 2025 Evanston sequential-deliberations enforcement ($750/member exposure).',
      tags: ['open-meetings', 'executive-session', 'referendum'],
      irac: {
        issue: 'Whether public action taken immediately on emergence from an executive session, without prior notice of that action, violates the Open Meetings Act’s anti-circumvention clause or only Cheyenne’s self-imposed itemized-agenda practice.',
        rule: 'Wyo. Stat. § 16-4-403 bars using meetings or sequential communications to circumvent the Act; § 16-4-405 governs executive sessions; the OMA requires notice of meetings — itemized agendas are a local practice. RONR 9:24 requires business to be taken up in order.',
        application: 'Aug. 10: executive session first, then an 8–1 vote (Moody no) authorizing a declaratory-judgment suit crowding out a referendum with 3,200–3,275 signatures reported against a 2,739 bar. The action was minuted in full but never noticed in advance. The State Superintendent publicly cautioned the city against undermining the statutory process.',
        conclusion: 'Liability hinges on purpose-circumvention and any ordinance agenda rule — plead those precisely; the raw “null and void” framing overstates the statute per the repo’s own audit.'
      },
      rebuttal: 'August tenth: you walked out of executive session and voted eight to one to sue the referendum out of existence — no agenda item, no notice, nothing. The minutes prove the vote. Wyoming’s open meetings law bans using this process to circumvent the act you’re sitting under. Moody read the constitution plainly. The rest of you should read the statute.',
      sources: ['miller-legal-dissertation.md', 'miller-dossier.md', 'highlands-timeline.md', 'miller-canon-index.md']
    },
    {
      id: 'POE-09',
      date: 'Apr. 27, 2026',
      body: 'City Council',
      source: 'Mayor Collins ruling / Granicus record of proceedings',
      claim: 'Mayor Collins ruled Miller out of order because “his remarks were not accurate in relation to previous agenda items” — three separate sustained points of order that night cut comments as “not germane” while other commenters on the same items completed their turns.',
      record: 'The ruling treated factual disagreement as a breach of order; enforcement asymmetry is visible in the same record — other speakers on the same items were not similarly cut.',
      statute: 'U.S. Const. amend. I & RONR (12th ed.) § 43:29',
      leverage: 'RONR 43:29: factual disagreement is never a breach of order; silencing viewpoint in an open forum violates the First Amendment (Make Salt Lake v. Salt Lake City, 875 F.3d 1312 (10th Cir. 2017) — controlling circuit authority).',
      tags: ['first-amendment', 'parliamentary', 'comment-forum'],
      irac: {
        issue: 'Whether ruling a speaker out of order because his remarks were “not accurate” — while permitting other commenters on the same items to finish — is a viewpoint-neutral time/place restriction or viewpoint discrimination in a designated forum.',
        rule: 'RONR § 43:29: factual disagreement is never itself a breach of order. First Amendment designated-forum rules (Rosenberger; Make Salt Lake, 10th Cir. 2017) permit reasonable, viewpoint-neutral restrictions only.',
        application: 'Apr. 27, 2026: three sustained points of order (Moody/White; Moody/Laybourn; multiple members) cut one commenter as “not germane”/inaccurate while others on the same items completed their turns. The stated ground was accuracy — a substantive disagreement, not disorderly conduct.',
        conclusion: 'The asymmetry plus the accuracy rationale is the classic Make Salt Lake pattern; preserve the Granicus record for injunctive and nominal-damages claims.'
      },
      rebuttal: 'On April twenty-seventh you ruled me out of order because my remarks were “not accurate.” Robert’s Rules 43:29 is clear: factual disagreement is never a breach of order. You cut one speaker three times while others finished the same items. That is not parliamentarianism — that is viewpoint enforcement, and the Tenth Circuit has said so plainly.',
      sources: ['miller-violations-register.md', 'miller-comments-2026-07-13.md', 'miller-canon-index.md']
    },
    {
      id: 'POE-10',
      date: 'June 1 – July 13, 2026',
      body: 'Planning Commission → Governing Body',
      source: 'PC disapproval (PUDC-26-116 / 26-85) vs. July 13 overrule',
      claim: 'The governing body framed the July 13 approvals as routine processing of the Highlands package, with staff memos justifying the path as sufficient.',
      record: 'The Planning Commission’s June 1 outcome was a statutory disapproval (3–2 in favor, but 4 of 7 full-board votes required) and a formal denial recommendation on the BP zone change; the Council overruled under W.S. § 15-1-506 on July 13 with, in counsel’s words, “zero new technical studies, zero updated infrastructure analysis, zero empirical data.”',
      statute: 'W.S. § 15-1-506 (overrule of PC disapproval); arbitrary-and-capricious review',
      leverage: 'The record’s strongest count per the repo legal audit: a zoning vote taken over an admitted evidentiary void — recitals-as-findings framing, quorum-artifact disapproval, no new evidence between June 1 and July 13.',
      tags: ['highlands', 'planning', 'overrule'],
      irac: {
        issue: 'Whether overruling a Planning Commission disapproval under W.S. § 15-1-506 without new substantial evidence can survive arbitrary-and-capricious review when the absence of evidence is admitted on the record.',
        rule: 'W.S. § 15-1-506 permits overrule but does not dispense with reviewable reasons; Wyoming reverses zoning decisions unsupported by substantial evidence in the record (the “evidentiary void” line of cases).',
        application: 'June 1: FLUM amendment deemed disapproved (3–2 for, quorum artifact) and BP zone change formally denied. June 8 → July 13: no new studies; counsel logged “zero new technical studies, zero updated infrastructure analysis, zero empirical data.” July 13: items 15, 19, 20 adopted 6–3 over that void; recitals drafted as findings.',
        conclusion: 'This is the cleanest nullification candidate in the record: admitted void + statutory overrule + recitals-as-findings; build the § 15-1-409 / arbitrary-and-capricious record around it.'
      },
      rebuttal: 'June first, your planning commission disapproved the Highlands FLUM and recommended denial of the zone change. July thirteenth you overruled them — with zero new studies, zero infrastructure analysis, zero empirical data. Those are counsel’s words, on the record. Wyoming law does not let you overrule your own experts into an evidentiary void and call it findings.',
      sources: ['highlands-timeline.md', 'highlands-meetings-analysis.md', 'miller-comments-2026-07-13.md', 'miller-legal-dissertation.md']
    },
    {
      id: 'POE-11',
      date: 'June 1 – July 13, 2026',
      body: 'Planning Commission → Governing Body',
      source: 'PUDC-26-121 (Reed Land Addition) staff report p. 5',
      claim: 'The 387-acre Reed Land Addition AG→BP rezone was presented as part of the routine Highlands/Microsoft cluster advancing in lockstep.',
      record: 'The Planning Commission explicitly recommended denial on June 1; the Council approved it anyway on July 13 (item 16, 8–1) — reading the City’s own staff report, which states that taking land “anticipated for majority residential development” into a business park “would adversely affect the general welfare of the community” during a documented housing crisis.',
      statute: 'UDC review criteria (PUDC-26-121 p. 5); W.S. § 15-1-506',
      leverage: 'The City’s own written criterion defeats its vote: housing-footprint deletion during a documented crisis, over a PC denial recommendation, with no new evidence.',
      tags: ['highlands', 'housing', 'rezoning'],
      irac: {
        issue: 'Whether rezoning 387 acres from residential-anticipated agricultural use to business park can be reconciled with the UDC’s own general-welfare criterion after the Planning Commission recommended denial.',
        rule: 'The UDC review criteria incorporated in the staff report make documented housing need a general-welfare factor; § 15-1-506 overrule still requires a record.',
        application: 'June 1: PC recommends denial of PUDC-26-121. Staff report p. 5: BP zoning of residential-anticipated land “would adversely affect the general welfare” amid documented housing challenges. July 13: approved 8–1 anyway, deleting a 387-acre residential footprint.',
        conclusion: 'The written criterion, the PC denial, and the vote cannot all stand; this is a quotable, packet-sourced defect — no transcript dependence required.'
      },
      rebuttal: 'The Reed parcel: your planning commission recommended denial. Your own staff report says rezoning it to business park “would adversely affect the general welfare” — during a documented housing crisis. You approved it eight to one anyway, deleting three hundred eighty acres of residential land. When the city’s written criteria defeat the city’s vote, the vote loses.',
      sources: ['miller-comments-2026-07-13.md', 'highlands-timeline.md', 'highlands-meetings-analysis.md']
    },
    {
      id: 'POE-12',
      date: 'Sept. 8 – Sept. 14, 2026',
      body: 'Planning Commission → City Council',
      source: 'Orchard Hills PC memo 150451 / Item 23 overrule',
      claim: 'Staff and sponsors introduced the Orchard Hills package as a normal sequencing — “so that all items related to [the] development can be discussed at the same time” — with land-use memos boasting “no public comments.”',
      record: 'The Planning Commission voted 6–0 to deny on Sept. 8 (staff: DENY on criteria 1, 2, 7, 8); six days later the Council agenda carried a resolution overruling that unanimous denial (Item 23), while notice framing rested on the mailing date (mailed Aug. 13, deadline Aug. 14, receipt Aug. 17) and the FLUM piece was bundled/postponed to “line up” with annexation/zoning.',
      statute: 'W.S. § 15-1-506; UDC criteria 1, 2, 7, 8; notice practice',
      leverage: 'The City’s own record is against the item (debrief language): unanimous PC denial + staff denial + six-day turnaround + bundling — demand individual votes and findings, not a package.',
      tags: ['orchard-hills', 'overrule', 'notice'],
      irac: {
        issue: 'Whether a six-day turnaround from a unanimous 6–0 Planning Commission denial to a packaged Council overrule, with notice measured by mailing date, produces a reviewable record under § 15-1-506.',
        rule: '§ 15-1-506 overrule requires reasons engaging the PC’s disapproval; UDC criteria 1, 2, 7, 8 were the stated grounds of denial; notice adequacy is judged on actual opportunity to be heard.',
        application: 'Sept. 8: PC denies 6–0 (memo 150451), staff denies on four criteria. Sept. 14: Item 23 overrule lands on the agenda; staff memo postpones the FLUM piece to Oct. 12 to “line up”; mailed Aug. 13 with Aug. 14 deadline (receipt Aug. 17); memos tout “no public comments” while the page logged 191–208 views.',
        conclusion: 'A unanimous denial answered by a bundled overrule in six days, with compliance framed on mailing, is the record to compel findings against — item by item, not package.'
      },
      rebuttal: 'September eighth, your planning commission denied Orchard Hills — six to nothing. Your staff denied it on four criteria. Six days later the agenda carries your overrule, bundled and postponed to “line up,” with notice measured from the day you mailed it. A unanimous denial deserves individual findings. Give this item its own vote, and its own record.',
      sources: ['2026-09-14-council/RED_TEAM_and_SPEECHES_2026-09-14.md', '2026-09-14-council/DEBRIEF_2026-09-14.md']
    },
    {
      id: 'POE-13',
      date: 'Aug. 21, 2026 (work session) → Nov. 9, 2026',
      body: 'Planning Work Session → City Council',
      source: 'Director Charles Bloom, 3:06 on city tape / Cap City News same day',
      claim: 'The department administered farm-and-ranch ordinances carrying criminal exposure (up to 6 months jail / $750 fine) against family farms while assuring the public the process was orderly.',
      record: 'Director Bloom, on the city’s own tape: “Our farm and ranch related ordinances have not been updated in a very long time and they don’t necessarily fall in line with state statute.” Cap City News printed the same sentence the same day.',
      statute: 'Municipal farm/ranch code vs. Wyoming statute alignment; due process',
      leverage: 'The regulator admits the code is not aligned with state statute while it carries criminal penalties — every citation written under it is impeachable; the confession is press-corroborated, not single-sourced.',
      tags: ['wy-fresh', 'confession', 'criminal-penalty'],
      irac: {
        issue: 'Whether criminal enforcement may proceed under municipal farm ordinances the department head admits on the record do not necessarily conform to state statute.',
        rule: 'Due process requires legally intelligible standards; ordinances must conform to the state-law framework they purport to enforce, and admissions by the enforcing official are party admissions.',
        application: 'Aug. 21, 3:06 p.m. tape: Bloom’s non-alignment admission, printed same-day by Cap City News. The same code carries up to six months / $750 for zoning infractions and was aimed at WY Fresh Farm through the Nov. 9 annexation.',
        conclusion: 'The admission guts criminal reliance on the farm code pre-alignment; use it against any citation and as the estoppel spine for the Nov. 9 sequence.'
      },
      rebuttal: 'Your own planning director said it on your own tape, August twenty-first: the farm ordinances “don’t necessarily fall in line with state statute.” That is the code you threaten families with — six months, seven hundred fifty dollars. He said it. Cap City printed it. You don’t get to criminalize farming under a law your regulator admits is wrong.',
      sources: ['drops-2026-08-24-wy-fresh-endgame.md', 'TONIGHT-2026-08-24-master-brief.md']
    },
    {
      id: 'POE-14',
      date: 'June 8 – July 13, 2026',
      body: 'City Council',
      source: 'Mayor Collins / annexation hearing record',
      claim: 'Mayor Collins, repeatedly: the hearing is about annexation criteria, not future development — “Annexation doesn’t do anything but change the color of the map.”',
      record: 'The same ordinance package advanced on July 13 carried the AG→BP zone change (item 15), assigned AG holding-zone zoning (item 14), FLUM/urban-service-boundary amendments (items 19–20), and the Reed Land rezone (item 16) — development entitlements, not map colors.',
      statute: 'W.S. § 15-1-402 hearing scope vs. UDC zone-change/FLUM authority',
      leverage: 'The hearing-scope representation is contradicted by the packet itself: if annexation were inert, the entitlements would not ride the same bus; if it is not, the § 15-1-402 hearing was under-informed.',
      tags: ['highlands', 'annexation', 'hearing-scope'],
      irac: {
        issue: 'Whether limiting the § 15-1-402 annexation hearing to “map color” while the same package carries zone changes and FLUM amendments misstates the scope of decision before the public.',
        rule: 'W.S. § 15-1-402 governs annexation compliance; zone changes and FLUM amendments are separate UDC actions with their own criteria — but here they were advanced as one package.',
        application: 'June 8: the mayor repeatedly framed annexation as changing “the color of the map.” The June 8–July 13 package simultaneously introduced assigned zoning, BP zone change, FLUM amendment, and urban-service-boundary expansion for the same 3,460 acres.',
        conclusion: 'Either the representation or the bundling is false; use the packet to show the hearing was told the decision was smaller than it was.'
      },
      rebuttal: 'On June eighth you told the public annexation “doesn’t do anything but change the color of the map.” Then the same package brought business-park zoning, a future-land-use amendment, and the urban service boundary — for the same three thousand four hundred sixty acres. You can’t sell a hearing as harmless and vote the entitlements in the same breath.',
      sources: ['highlands-timeline.md', 'highlands-meetings-analysis.md']
    },
    {
      id: 'POE-15',
      date: 'Sept. 14, 2026',
      body: 'City Council',
      source: "Skybox (O'Neal) testimony / mandate claims on the record",
      claim: 'Skybox representatives projected 350–500 FTE over three shifts and a “Commitment to Cheyenne,” advanced alongside mandate claims (“anti-data-center candidates lost the election”).',
      record: "Skybox admitted no lease with King Ranch — “verbal conversations” only — and that the “Commitment to Cheyenne” is not yet in writing; Trammell Crow’s Orchard Hills binding conditions were likewise only promised “in writing” at a future date.",
      statute: 'Contract/development-agreement formation; comp-plan sequencing',
      leverage: 'Condition third readings on executed development agreements — Wolf’s on-record point: less than a month to produce written commitments; nothing signed means nothing to enforce.',
      tags: ['skybox', 'development-agreement', 'mandate'],
      irac: {
        issue: 'Whether approvals may rest on unwritten “commitments” and an electoral-mandate narrative when the proponent admits no lease and no executed agreement exists.',
        rule: 'Municipal approvals bind through executed agreements and recorded conditions, not testimony; legislative mandates are asserted through votes, not characterizations of an election.',
        application: 'Sept. 14: Skybox — 350–500 FTE, three shifts — but no lease with King Ranch, only “verbal conversations”; “Commitment to Cheyenne” not in writing. Same meeting: mandate framing offered as a reason to proceed while Orchard Hills conditions awaited future drafting.',
        conclusion: 'Make written, executed agreements the condition of every third reading; an admission of nothing-signed converts “commitment” into testimony you can cross-examine.'
      },
      rebuttal: 'Skybox: three shifts, five hundred jobs — and no lease. “Verbal conversations” only. A “Commitment to Cheyenne” that exists in no writing. You ask us to approve on promises while the mandate gets quoted from an election. Condition third reading on executed agreements. If it isn’t signed, it isn’t a commitment — it’s a hope.',
      sources: ['2026-09-14-council/DEBRIEF_2026-09-14.md', '2026-09-14-council/RED_TEAM_and_SPEECHES_2026-09-14.md']
    },
    {
      id: 'POE-16',
      date: 'Sept. 14, 2026',
      body: 'City Council',
      source: 'Item 26d (CheyenneNext $351,790) vs. same-agenda FLUM amendments',
      claim: 'Item 26d was presented as a routine contract for the CheyenneNext comprehensive-plan update (Houseal Lavigne, $351,790; adoption Nov. 2027) — “I support planning.”',
      record: 'On the same agenda the Council approved ~2,149 acres of FLUM amendments (Orchard Hills, Hitching Post, Campstool, Cox Ranch) that pre-empt the plan being written; Councilman Laybourn called the comp plan “not routine” and Bloom confirmed updates lapsed — requested FY2020 and FY2025, never funded.',
      statute: 'Comprehensive-plan primacy in Zoning; contract scope',
      leverage: 'Sequencing contradiction: paying a consultant $351,790 to write a plan the same night’s votes rewrite, one developer at a time — either the plan matters or it doesn’t.',
      tags: ['comp-plan', 'sequencing', 'cheynennext'],
      irac: {
        issue: 'Whether adopting thousands of acres of FLUM amendments while contracting for a comprehensive-plan update undermines the plan’s statutory role as the basis of zoning decisions.',
        rule: 'Wyoming zoning authority rests on a comprehensive plan as the basis for amendments; contract spending should not be mooted by same-period spot amendments.',
        application: 'Sept. 14: $351,790 for CheyenneNext (adopt Nov. 2027) voted the same night as ~2,149 acres of FLUM changes across four developments; funding included $112,900 rolled over from unspent county-pocket-annexation budget; plan updates lapsed since 2014 (requested FY2020/FY2025, unfunded).',
        conclusion: 'The vote structure defeats the stated purpose of the contract; demand either a moratorium on FLUM amendments until adoption or a scope explanation on the record.'
      },
      rebuttal: 'Tonight you pay three hundred fifty-one thousand dollars to write a comprehensive plan — and the same agenda amends that plan for over two thousand acres, one developer at a time. You defunded this update for years, now you call it routine. Either the plan is the basis of zoning, or it’s wallpaper. You can’t buy it and burn it in the same meeting.',
      sources: ['2026-09-14-council/DEBRIEF_2026-09-14.md', '2026-09-14-council/RED_TEAM_and_SPEECHES_2026-09-14.md', 'miller-canon-index.md']
    },
    {
      id: 'POE-17',
      date: 'Sept. 14, 2026',
      body: 'City Council',
      source: 'Mayor Collins / Councilman Wolf on-record rebuttal',
      claim: 'The Mayor stated that DEQ plus “19 agencies” vet data centers before permit — offered as assurance of the regulatory gauntlet.',
      record: 'Wolf rebutted on the record: DEQ regulates only backup-generator air permits and stormwater — no wildlife, no water-use oversight, and not Industrial Siting; Rinne later confirmed business parks escape the siting-council impact-fee process (DEQ air/water/hazmat still applies either way).',
      statute: 'Wyoming Industrial Siting Act scope; DEQ permitting jurisdiction',
      leverage: 'The count is wrong and the assurance is overstated: a “19 agencies” claim that collapses to air-and-stormwater on the same record impeaches the safety narrative wholesale.',
      tags: ['deq', 'industrial-siting', 'data-centers'],
      irac: {
        issue: 'Whether the representation that DEQ and “19 agencies” vet data centers before permit accurately states the regulatory scope governing hyperscale development in Cheyenne.',
        rule: 'The Wyoming Industrial Siting Act assigns siting-council review above thresholds and for specified uses; DEQ permits cover air (including backup generators), water, and hazmat — not wildlife or water-use impacts as claimed.',
        application: 'Sept. 14: “19 agencies” assurance from the dais; same meeting, Wolf’s record rebuttal — DEQ scope is generator air permits and stormwater; no Industrial Siting review for the business-park structure; Rinne confirms business parks dodge the siting-council impact-fee process.',
        conclusion: 'The on-record rebuttal stands uncontradicted; the assurance was not corrected — use the exchange, not a paraphrase, as the exhibit.'
      },
      rebuttal: 'We were told nineteen agencies vet these projects. On the same record, Councilman Wolf corrected it: DEQ covers backup-generator air permits and stormwater — no water use, no wildlife, no Industrial Siting. Your own member’s correction went unanswered. If the safety case needs a number that isn’t true, what else in the packet is padding?',
      sources: ['2026-09-14-council/DEBRIEF_2026-09-14.md']
    },
    {
      id: 'POE-18',
      date: 'May 26, 2026',
      body: 'City Council',
      source: 'Comment-forum administration / press (CSD “Before the Discussion”)',
      claim: 'Council operated a one-item comment restriction on the fast-tracked rezoning while the moratorium item remained pending — the mayor’s “chat GBT” exchange marking the tone — under a framing of orderly, limited public input.',
      record: 'The violations register logs this as viewpoint-based treatment in the comment forum: restriction applied while a related moratorium item was live, part of a documented pattern (Apr. 27 POO cascade; later livestream comment disablement after the June video surge).',
      statute: 'U.S. Const. amend. I (designated forum: Rosenberger; Make Salt Lake, 10th Cir. 2017)',
      leverage: 'Forum restriction plus pattern evidence — the asymmetry, timing, and subsequent comment shutdown form the Mt. Healthy / Monell timeline; treatment, not access, is the claim.',
      tags: ['first-amendment', 'comment-forum', 'pattern'],
      irac: {
        issue: 'Whether a one-item comment restriction applied to a fast-tracked rezoning, while a related moratorium item was pending, is a reasonable content-neutral condition or viewpoint-based forum management.',
        rule: 'Designated-forum doctrine: restrictions must be reasonable and viewpoint-neutral; a pattern of enforcement asymmetry plus timing evidence supports retaliation/inference under Mt. Healthy once protected conduct is shown.',
        application: 'May 26: comment limited to one item on the rezoning under consideration while the moratorium item sat pending; “chat GBT” exchange from the dais; Apr. 27’s three-point-of-order cascade and the post-viral comment disablement bookend the same summer.',
        conclusion: 'Standalone, it is a condition; in the documented sequence, it is evidence — plead it as pattern, with the register’s [R] flags and press corroboration.'
      },
      rebuttal: 'May twenty-sixth: one item, one comment window — on the rezoning you were rushing — while the moratorium item sat right there. Orderly process is not viewpoint triage. Robert’s Rules don’t have a “chat GPT” exception. The April points of order, this restriction, the comments shut off after the videos spread — one pattern, one forum, one First Amendment problem.',
      sources: ['miller-violations-register.md']
    }
  ];

  // ---- integrity helpers (used by both UI and tests) ----
  function wordCount(s) {
    return String(s || '').trim().split(/\s+/).filter(Boolean).length;
  }

  // 30 s at a podium ≈ 130–150 wpm; flag outside a generous 55–90 word band.
  function rebuttalWords(row) { return wordCount(row.rebuttal); }

  function validate() {
    const errors = [];
    if (rows.length !== 18) errors.push('expected 18 rows, got ' + rows.length);
    const ids = new Set();
    for (const r of rows) {
      const tag = r.id || '(missing id)';
      if (ids.has(tag)) errors.push(tag + ': duplicate id');
      ids.add(tag);
      for (const f of ['date', 'body', 'source', 'claim', 'record', 'statute', 'leverage', 'rebuttal']) {
        if (!r[f] || !String(r[f]).trim()) errors.push(tag + ': empty field ' + f);
      }
      for (const k of ['issue', 'rule', 'application', 'conclusion']) {
        if (!r.irac || !r.irac[k] || !String(r.irac[k]).trim()) errors.push(tag + ': empty IRAC ' + k);
      }
      const wc = rebuttalWords(r);
      if (wc < 55 || wc > 90) errors.push(tag + ': rebuttal ' + wc + ' words outside 55–90');
      if (!Array.isArray(r.sources) || r.sources.length < 1) errors.push(tag + ': no sources');
      if (!Array.isArray(r.tags) || r.tags.length < 1) errors.push(tag + ': no tags');
      // No invented timestamps: forbid clock-style claims in claim/record fields.
      for (const f of ['claim', 'record']) {
        if (/\b\d{1,2}:\d{2}:\d{2}\b/.test(String(r[f]))) errors.push(tag + ': invented timestamp pattern in ' + f);
      }
    }
    return errors;
  }

  function allTags() {
    const s = new Set();
    for (const r of rows) for (const t of r.tags) s.add(t);
    return Array.from(s).sort();
  }

  function allBodies() {
    const s = new Set();
    for (const r of rows) s.add(r.body);
    return Array.from(s).sort();
  }

  function findRow(id) { return rows.find(r => r.id === id) || null; }

  function filterRows(q, tag) {
    const needle = (q || '').trim().toLowerCase();
    return rows.filter(r => {
      if (tag && !(r.tags || []).includes(tag)) return false;
      if (!needle) return true;
      const hay = [r.id, r.date, r.body, r.source, r.claim, r.record, r.statute, r.leverage,
        r.irac.issue, r.irac.rule, r.irac.application, r.irac.conclusion, r.rebuttal,
        (r.tags || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }

  // Split a rebuttal into word tokens with cumulative times across 30 s.
  function rebuttalTimeline(row, seconds) {
    const total = seconds || REBUTTAL_SECONDS;
    const words = String(row.rebuttal).trim().split(/\s+/).filter(Boolean);
    const n = words.length || 1;
    return words.map((w, i) => ({
      word: w,
      start: (i / n) * total,
      end: ((i + 1) / n) * total
    }));
  }

  return {
    VERSION: '1.0.0',
    REBUTTAL_SECONDS,
    rows,
    validate,
    allTags,
    allBodies,
    findRow,
    filterRows,
    rebuttalWords,
    rebuttalTimeline,
    wordCount
  };
});
