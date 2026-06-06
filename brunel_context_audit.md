# Brunel Chatbot Source and Retrieval Context Audit

Generated from the local repository only. I did not inspect environment variables, API keys or secrets.

## 1. Executive summary

The current chatbot is a Vercel-hosted, Framer-embeddable assistant for Brunel Centre research, Data Hub insights and the regional economy. It has 94 configured web sources and 59 Data Hub dataset mappings. The indexed source registry contains 59 Data Hub posts, 29 research articles, one Data Hub landing page, one Research landing page, two site/about pages and two other pages. All configured source URLs are syntactically valid.

Core behaviour is split into deterministic pre-checks and grounded retrieval. Small-talk, catalogue browsing and show-more are handled before retrieval. Real research/data questions use article chunk retrieval first, dataset summaries/analysis rows as fallback, and raw facts mainly for calculations/counts/method questions. Dedicated policy content is not currently configured, so policy catalogue requests return an empty-state that points to related research.

## 2. Source inventory

Full source inventory is in `source_inventory.csv`. Summary by source type:

- dataHubLanding: 1
- dataHubPost: 59
- otherPage: 2
- researchArticle: 29
- researchLanding: 1
- sitePage: 2

Summary by broad topic group:

- Business and industry: 14
- Economy and productivity: 3
- Employment and skills: 29
- Environment and sustainability: 7
- Health and population: 10
- Housing: 15
- Other: 5
- Policy and regional growth: 1
- Transport and infrastructure: 10

All 94 sources are marked as usable for grounded Q&A because ingestion reads every configured source. Catalogue inclusion is narrower: Data Hub catalogue uses only Data Hub post records; Research catalogue uses only Research article records; policy catalogue currently has no confirmed source records.

## 3. Source-type rules

- Data Hub post: URL contains `thebrunelcentre.co.uk/data-hub/` and the source ID starts `data-hub-` or tags include `data-hub`.
- Research article: URL contains `/research/`, ID is not `research`, and tags include `research`.
- Policy-related source: ID starts `policy`, tags include `policy`, `policy-insight` or `policy-insights`, or the URL matches a `/policy` path. Generic pages such as About, Consultancy and the homepage are excluded.
- Landing pages and generic pages can be used for grounded Q&A, but are not used as catalogue result items.

## 4. Data Hub catalogue inventory

The Data Hub catalogue has 59 confirmed post records. It lists titles as Markdown links and suppresses duplicate source cards. First batches are capped at 8 items and balanced across topic groups when no topic filter is supplied.

Data Hub dataset categories mapped in `datahub-datasets.json`:

- economy: 12
- environment: 5
- health: 2
- housing-and-land-use: 8
- labour-market: 17
- population: 6
- poverty-and-deprivation: 5
- transport: 4

Examples of confirmed Data Hub catalogue items:

- [Child poverty before housing costs in the Greater West of England (Children, aged 0-15)](https://www.thebrunelcentre.co.uk/data-hub/child-poverty-before-housing-costs-in-the-greater-west-of-england-%28children-aged-0-15%29)
- [Child poverty before housing costs in the Greater West of England (Dependent children, aged 0-19)](https://www.thebrunelcentre.co.uk/data-hub/child-poverty-before-housing-costs-in-the-greater-west-of-england-%28dependent-children-aged-0-19%29)
- [Commuting between local authorities in the Greater West of England, 2021](https://www.thebrunelcentre.co.uk/data-hub/commuting-between-local-authorities-in-the-greater-west-of-england-2021)
- [Travel to work in the Greater West of England: Distance travelled and mode of transport, 2021](https://www.thebrunelcentre.co.uk/data-hub/travel-to-work-in-the-greater-west-of-england-distance-travelled-and-mode-of-transport-2021)
- [Travel time to major employment centres in the Greater West of England, 2019](https://www.thebrunelcentre.co.uk/data-hub/travel-time-to-major-employment-centres-in-the-greater-west-of-england-2019)
- [Access to key services in the Greater West of England: schools, town centres and hospitals, 2019](https://www.thebrunelcentre.co.uk/data-hub/access-to-key-services-in-the-greater-west-of-england-schools-town-centres-and-hospitals-2019)
- [Child poverty after housing costs in the West of England area, 2023/24](https://www.thebrunelcentre.co.uk/data-hub/child-poverty-after-housing-costs-in-the-west-of-england-area-2023-24)
- [Additional regional data on child poverty in the South West of England](https://www.thebrunelcentre.co.uk/data-hub/additional-regional-data-on-child-poverty-in-the-south-west-of-england)

## 5. Research catalogue inventory

The Research catalogue has 29 confirmed article records. It uses the same deterministic catalogue renderer, Markdown links and show-more state as Data Hub.

Examples of confirmed Research catalogue items:

- [Homes first: closing the retrofit gap](https://www.thebrunelcentre.co.uk/research/homes-first-closing-the-retrofit-gap)
- [Job matching success in the West of England](https://www.thebrunelcentre.co.uk/research/job-matching-success-in-the-west-of-england)
- [Mobility and internal migration in the West of England](https://www.thebrunelcentre.co.uk/research/mobility-and-internal-migration-in-the-west-of-england)
- [The priority commercial, industrial and public sector emitters](https://www.thebrunelcentre.co.uk/research/the-priority-commercial-industrial-and-public-sector-emitters)
- [Migration trends and higher education in the West of England](https://www.thebrunelcentre.co.uk/research/migration-trends-and-higher-education-in-the-west-of-england)
- [Home to work: Movement of workers in the West of England](https://www.thebrunelcentre.co.uk/research/home-to-work-movement-of-workers-in-the-west-of-england)
- [Educational attainment: The West of England’s competitive advantage](https://www.thebrunelcentre.co.uk/research/educational-attainment-the-west-of-englands-competitive-advantage)
- [Bringing decarbonisation home: Bristol's heat network](https://www.thebrunelcentre.co.uk/research/bringing-decarbonisation-home-bristols-heat-network)

## 6. Policy content status

No dedicated policy source records are currently configured under the catalogue rules. The policy catalogue therefore returns the empty-state: it says no dedicated set of policy articles was found in the current sources and links to related Brunel Centre research. Policy-relevant questions can still be answered from article/research context if retrieval finds evidence, but there is no standalone policy article catalogue yet.

## 7. Dataset/raw data inventory

Full dataset mapping inventory is in `dataset_inventory.csv`. There are 59 Data Hub dataset mappings. Each mapping includes a public post URL, GitHub URL, GitHub path and ZIP folder. The ingestion code stores:

- Workbook file metadata in `brunel_dataset_files`.
- Analysis-sheet rows in `brunel_dataset_rows`.
- Raw-sheet parsed facts in `brunel_dataset_facts`, where the raw sheet has a detectable year-header layout.
- Embedded workbook summaries in `brunel_dataset_summaries`.

The parser chooses sheets by name rather than a formal manifest: first sheet containing `analysis`, all sheets containing `raw`, and a metadata sheet containing `meta`. This works for the current convention but is a schema dependency to watch.

## 8. Article-to-dataset mapping

Article-to-dataset mapping is done by `post_url`: dataset mappings point back to a public Data Hub post URL, and dataset tables store `post_slug`, `post_title` and `post_url`. There is no separate manual article-dataset relationship table beyond `content/datahub-datasets.json`.

Exact URL matching found 55 dataset mappings with matching source URLs and 4 URL mismatches. The mismatched titles are listed in the CSV notes and are likely URL/title formatting differences that should be reviewed before production.

Data Hub post records without exact dataset URL match:

- Population change comparisons in the Greater West of England, 1991–2024
- Annual change in greenhouse gas emissions in the Greater West of England, 2022–2023
- Trends over time in sustained destinations following 16–18 study in the Greater West of England
- Education, employment and NEET outcomes among young people in the Greater West of England aged 16–24

Dataset mappings without exact source URL match:

- Population change comparisons in the Greater West of England, 1991–2024
- Annual change in greenhouse gas emissions in the Greater West of England, 2022–2023
- Trends over time in sustained destinations following 16–18 study in the Greater West of England
- Education, employment and NEET outcomes among young people in the Greater West of England aged 16–24

## 9. Retrieval logic summary

See `retrieval_logic_summary.md` for the compact standalone version. In short, regular Q&A retrieves article chunks via vector search, dataset summaries via vector search, analysis rows via full-text search, and raw facts only when the user asks for calculation/count/method/raw/detail style work. Multi-topic retrieval expands recognised concepts and creates a confirmed topic-source map for the model.

## 10. Catalogue and show-more logic

Catalogue responses are deterministic and bypass OpenAI/Supabase retrieval. The handler detects Data Hub, Research and policy-related catalogue intents, groups results by broad topic, renders title links, and returns `suppressSourceLinks: true` so source cards are not duplicated.

Bare `show more` only continues when the immediately previous assistant message is a catalogue response with Data Hub or Research item links and the expected marker text. Greetings, thanks, acknowledgements and normal statistical answers do not create catalogue context. If no active catalogue exists, the bot asks what the user wants to see more of rather than defaulting to Research or Data Hub.

## 11. Link rendering and source display

Catalogue answers put URLs behind Markdown titles. The widget escapes HTML before applying Markdown formatting, supports headings, bullets, ordered lists, inline code, bold, italic and safe HTTP/HTTPS Markdown links, and opens links with `target="_blank"` and `rel="noopener noreferrer"`. Non-catalogue grounded answers can still append up to three source links below the message unless `suppressSourceLinks` is set.

## 12. Grounded-answer prompt / anti-hallucination rules

The system prompt instructs the model to answer only from Brunel Centre context, say when content is insufficient, use recent conversation only for follow-up references, apply Bath/BANES and Glos/South Glos aliases, cite source titles, use article context before dataset rows, avoid raw workbook details unless requested, keep NEET measures separate, avoid unsolicited calculations, avoid averaging percentages, use numerator/denominator for combined rates, interpret policy questions carefully, use news context when available, count multi-topic coverage correctly, distinguish confirmed linked sources from possible unlinked matches, and avoid invented statistics/dates/sources/policy positions.

## 13. Test coverage

Current tests are script-based Node tests:

- `scripts/test-small-talk.js`: acknowledgement/positive-feedback detection, thanks/farewell/greeting detection, and real follow-up messages bypassing small-talk.
- `scripts/test-datahub-catalogue.js`: Data Hub catalogue, Research catalogue, topic filters, show-more continuation, no raw URLs, clickable Markdown links, duplicate source suppression, policy empty-state, and bare show-more clarification.
- `scripts/test-retrieval-plan.js`: multi-topic concept extraction and query expansion for GDP/GVA, productivity, employment/wages, skills/productivity, emissions/energy, sectors/productivity, and NEET/housing/skills.

There are no end-to-end tests against live Supabase/OpenAI in the repository.

## 14. Gaps and risks

- Policy catalogue has no dedicated source records yet.
- Source registry dates are mostly empty, so latest/upcoming ordering cannot be audited from the local registry alone.
- The source registry appears static; README notes that production should replace `sources.json` with automated Framer CMS sync.
- Dataset ingestion relies on sheet naming conventions and a detectable raw wide-year layout. Raw sheets with other structures may ingest zero facts even if useful data exists.
- Metadata is stored but not exposed as a first-class searchable source table.
- Catalogue grouping is heuristic, based on titles/tags/categories. Some items may land in imperfect groups.
- One source has non-array tags: research-strategic-economic-audit-of-the-west-of-england. This did not break runtime catalogue code where array checks exist, but it is a data hygiene issue.
- Exact URL matching between Data Hub source records and dataset mappings has 4 mismatches. Review URL normalisation for punctuation, encoded characters and dash variants.
- Link rendering allows any HTTP/HTTPS link, not only Brunel Centre links. The model is grounded and catalogue links are registry-derived, but a stricter domain allow-list would be safer.
- Rate limiting is not visible in the current audited files.

## 15. Recommendations

1. Add automated Framer CMS sync for Data Hub, Research, News and any Policy/Policy Insight collections so the registry stays current.
2. Add a dedicated policy source type once policy insight CMS content is available.
3. Add URL normalisation between `sources.json` and `datahub-datasets.json` so article-to-dataset matches tolerate encoded parentheses, dash variants and trailing punctuation.
4. Add a dataset manifest or workbook parser rules per dataset family for raw sheets that are not wide-year tables.
5. Store metadata as first-class searchable metadata records if users need publisher/date/source-method answers.
6. Add backend rate limiting before production.
7. Add integration tests with mocked Supabase/OpenAI responses for article-first vs analysis-row vs raw-fact flow.
8. Add a Brunel-domain allow-list for rendered model links unless external source links are explicitly required.
