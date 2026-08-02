# Store submission pack

Everything a submission asks for, written out so it can be pasted rather than invented at
the keyboard at 11pm. Two things you must supply that no document can: a **D-U-N-S number**
for the organisation (allow two weeks) and a **public URL for the privacy policy**.

The privacy answers below are the app's actual behaviour, checked against the code. Do not
soften them. A data-safety form that does not match what the binary does is the most common
cause of a Play rejection, and the mismatch is found by an automated scan, not by a human
you can explain it to.

---

## 1. Identity

| | |
|---|---|
| App name | Condition Monitoring |
| Short name | Condition |
| Android package | `com.nordrim.conditionmonitoring` — **permanent** |
| iOS bundle id | `com.nordrim.conditionmonitoring` |
| Category | Business |
| Content rating | Everyone / 4+ |
| Ads | none |
| In-app purchases | none |
| Target audience | 18+, workplace |

> Change the package name **now** if it should not carry `nordrim`. After the first upload
> it can never change without publishing a separate app under a new listing.

---

## 2. What the app collects — the honest answer

This is the source of truth for both stores' forms.

| Data | Collected | Why | Leaves the device | Linked to a person |
|---|---|---|---|---|
| Photographs | yes | evidence of the component's condition | yes — to the site's own Drive folder or server | no |
| Approximate + precise location | yes | one GPS stamp per round, so a finding can be traced to a working area | yes, with the round | no |
| Name typed by the inspector | yes | the report has to say who inspected it | yes | **yes** |
| Readings, grades, defect codes | yes | the inspection itself | yes | no |
| Device identifier (`PH-07`) | yes | so two phones inspecting one machine can be told apart | yes | no |
| Contacts, calendar, messages, health, financial, browsing | **no** | — | — | — |
| Advertising ID | **no** | — | — | — |
| Analytics / crash reporting | **not currently** | if Sentry is added later, this table and both forms must change in the same release | | |

**Three claims you can make and defend:**

- **No account, no sign-up.** Nothing is collected about who *installs* it.
- **No third-party sharing.** Data goes to the customer's own Google Drive folder or their
  own server. There is no vendor backend in the middle.
- **It is not a tracking app.** Location is captured once per inspection, on a deliberate
  action, never in the background. There is no background location permission — check the
  manifest; that absence is the proof.

### Play — Data safety form

- Does your app collect or share any of the required user data types? → **Yes**
- *Location → Approximate* → collected, **not** shared, **required**, purpose: **App functionality**
- *Location → Precise* → collected, **not** shared, **required**, purpose: **App functionality**
- *Photos and videos → Photos* → collected, **not** shared, **required**, purpose: **App functionality**
- *Personal info → Name* → collected, **not** shared, **optional**, purpose: **App functionality**
- *App activity · App info and performance · Device IDs* → **not collected**
- Encrypted in transit? → **Yes** (HTTPS only; ATS on, no cleartext exception)
- Can users request deletion? → **Yes**, via the contact in the privacy policy
- Independent security review? → **No**

> "Shared" in Play's vocabulary means transferred to a *third party*. Uploading to the
> customer's own Drive or their own server is not sharing, and answering yes would be both
> wrong and far harder to explain.

### App Store — Privacy nutrition label

| Type | Answer |
|---|---|
| Location — Precise | Collected · **App Functionality** · not linked to identity · not used for tracking |
| User Content — Photos | Collected · **App Functionality** · not linked · not used for tracking |
| Contact Info — Name | Collected · **App Functionality** · **linked to identity** · not used for tracking |
| Identifiers | Not collected |
| Tracking | **No.** No ATT prompt is required, and none is shown. |

### iOS purpose strings

Verbatim from `ios-Info.plist.additions.xml`. Apple reads these; *"to use the camera"* gets
rejected.

- **Camera** — "To photograph the component you are inspecting, so the finding has evidence attached to it."
- **Photo library** — "To attach a photograph you have already taken of the component you are inspecting."
- **Photo library add** — "To save an inspection photograph to your phone if you choose to."
- **Location when in use** — "To record where the machine was standing when you inspected it, so a finding can be traced back to the working area."

---

## 3. Listing copy

### English

**Short description (80 max)**

> Offline field inspections for heavy equipment fleets. Works with no signal.

**Full description**

> Condition Monitoring is a field capture tool for the people who inspect heavy equipment —
> and it is built for the place that work actually happens: underground, in a pit, at the
> back of a workshop, with no signal and gloves on.
>
> **It works offline. Not "mostly".** Every inspection type, the full defect and cause
> reference, the wear limits for every machine model, and the report engine are all on the
> phone. Turn on aeroplane mode and nothing changes. Rounds queue and send themselves the
> moment anything can be reached — no button to remember.
>
> **Five inspection types**
> • Magnetic plug — particle count, component and oil hours, graded per position
> • Filter cut — findings per filter
> • General inspection — any component in your asset register
> • Temperature — reading and ambient, against per-component warn and alarm limits
> • Undercarriage — millimetre measurements against the manufacturer's new and condemn
>   figures, with wear worked out for you and shown on a machine diagram
>
> **Findings that planning can act on.** Coded to ISO 14224, with a defect and direct-cause
> matrix that offers the failure modes that actually apply to the component in front of
> you — not a list of 132 to scroll. A recommended action carries the work-request priority
> your CMMS files it under.
>
> **A report, not a data dump.** One machine, one round, one page — photographs beside the
> findings they belong to, and the verdict in a sentence a supervisor can act on. English
> and Russian throughout.
>
> **Photographs where they matter.** Four per component, not four per machine. A
> thirty-six-point undercarriage round can carry over a hundred, and every one reaches the
> report.
>
> **Nothing is lost.** Work is saved as you go, survives the app closing, and says plainly
> what has been sent and what is still waiting. Two people inspecting the same machine on
> the same day keeps both versions rather than silently discarding one.
>
> Your data goes to your own Google Drive folder or your own server. There is no account to
> create and no third party in the middle.

### Русский

**Краткое описание (80)**

> Осмотры техники в поле. Работает без связи.

**Полное описание**

> «Condition Monitoring» — инструмент для тех, кто осматривает тяжёлую технику, и сделан
> он для того места, где эта работа происходит на самом деле: в карьере, под землёй, в
> дальнем углу мастерской, без связи и в перчатках.
>
> **Работает офлайн. Полностью.** Все виды осмотров, полный справочник дефектов и причин,
> предельные износы по каждой модели и генератор отчётов — всё на телефоне. Включите
> авиарежим: ничего не изменится. Осмотры встают в очередь и уходят сами, как только
> появляется связь — нажимать ничего не нужно.
>
> **Пять видов осмотра**
> • Магнитная пробка — счёт частиц, наработка узла и масла, оценка по каждой позиции
> • Разрезка фильтра — находки по каждому фильтру
> • Общий осмотр — любой узел из вашего справочника оборудования
> • Термография — замер и температура среды, с пределами предупреждения и тревоги
> • Ходовая часть — замеры в миллиметрах против заводских значений «новое» и «предел», с
>   расчётом износа и отображением на схеме машины
>
> **Находки, с которыми можно работать.** Кодировка по ISO 14224; матрица дефектов и
> прямых причин предлагает те виды отказа, которые применимы именно к этому узлу.
> Рекомендованное действие несёт приоритет заявки в том виде, в каком его принимает 1С.
>
> **Отчёт, а не выгрузка.** Одна машина, один осмотр, одна страница: фотографии рядом с
> находками, вывод одной фразой. Русский и английский везде.
>
> **Фотографии там, где нужно.** По четыре на узел, а не на машину. Осмотр ходовой из
> тридцати шести точек может нести больше сотни, и каждая попадёт в отчёт.
>
> **Ничего не теряется.** Работа сохраняется по ходу, переживает закрытие приложения и
> честно показывает, что отправлено, а что ещё ждёт.
>
> Данные уходят в вашу папку Google Диска или на ваш сервер. Учётная запись не нужна,
> третьих лиц нет.

---

## 4. Screenshots

Six, in this order — it is an argument, not a gallery. Take them on a real device with real
data, in the **light** theme: it reads better on a store page and it is what an inspector
actually uses outdoors.

| # | Screen | Caption to burn in |
|---|---|---|
| 1 | Capture, mid-round, a plug graded | **Inspect with gloves on.** One job per screen. |
| 2 | Undercarriage map, worn points red | **Measure the undercarriage.** Wear against the manufacturer's limits. |
| 3 | Defect picker showing applicable modes | **The right failure modes, not all 132.** |
| 4 | A Critical finding with the P1 tag | **A finding planning can act on.** |
| 5 | Queue: two rounds waiting, "will retry by itself" | **No signal? Keep working.** |
| 6 | The one-page report | **One machine. One page.** |

Sizes: Play wants 1080×1920 (or 1080×2400), a 1024×500 feature graphic and a 512×512 icon.
Apple wants 6.7″ (1290×2796) and 6.5″ (1242×2688), plus 12.9″ iPad (2048×2732) if you ship
iPad — and you should, the layouts are already tablet-capable.

---

## 5. Review notes — the ones that matter

Paste into App Store Connect's *Notes for Review*. Guideline 4.2 (Minimum Functionality) is
the real risk for anything built on web technology, and this is the answer to it.

> **No account is needed. Please try it in aeroplane mode.**
>
> Turn the device's radios off before launching, then: pick an inspection type, pick a unit
> (e.g. TK151), grade a position, take a photograph, and save. Everything works — the full
> equipment register, the ISO 14224 defect and cause reference, the per-model wear limits
> and the PDF report generator are all resident on the device. That is the app's central
> purpose: it is used in open-pit mines and underground workings with no signal for hours
> at a time, and a round captured there must not be lost.
>
> Turn the radios back on and the queued round uploads by itself, with no user action.
>
> Camera, geolocation, filesystem and sharing use the native APIs, not their browser
> equivalents. Location is captured once per inspection, on a deliberate action, and never
> in the background — there is no background location entitlement.
>
> The app uploads to a folder or a server that the operating company owns and configures.
> There is no vendor backend and no third-party data sharing. A reviewer needs no
> credentials to see all of the above.

For Play's *App access* section: **"All functionality is available without signing in."**

---

## 6. Privacy policy

Publish `docs/privacy-policy.md` at a stable public URL and put that URL in both listings.
It must be reachable **before** you submit — a 404 fails review on the spot.

---

## 7. Order of work

1. Register the **D-U-N-S number**. Two weeks. Start here.
2. Play Console as an **organisation**, $25 once. A personal account triggers the
   20-testers-for-14-days rule before you may go to production.
3. Apple Developer Program, $99/year, organisation. Phone verification.
4. Publish the privacy policy.
5. Icon, feature graphic, six screenshots.
6. Android internal testing track → real phones in the pit.
7. TestFlight → the same phones.
8. Both forms, from §2, word for word.
9. Submit. Assume one rejection round on a first submission and plan the date around it.
