# Privacy policy — Condition Monitoring

**Last updated: 2 August 2026**

Condition Monitoring is a tool for recording equipment inspections. It is used by
maintenance staff at a workplace, on equipment their employer owns. This policy says what
it does with information, in plain terms.

The short version: **the app has no account, collects nothing about you as a person beyond
the name you type on a report, and sends everything to a location your own organisation
owns and controls. There is no vendor server in the middle, and nothing is sold, shared or
used for advertising.**

---

## Who is responsible for your data

The organisation that deployed the app — your employer or the site operator — is the
**controller** of the inspection data. They chose where it is stored, they hold the account
it is stored in, and they decide how long it is kept.

The app's publisher supplies the software. Where the publisher has no access to the storage
location, the publisher does not hold your inspection data at all and cannot retrieve,
correct or delete it on your behalf. Requests about the data itself go to your organisation
— see **Contact** below.

---

## What the app records

Only what an inspection is made of:

| | |
|---|---|
| **Equipment readings** | measurements, grades, particle counts, hours, temperatures, coded defects and causes |
| **Photographs** | of the component being inspected. Up to four per component |
| **Location** | one GPS position per inspection, so a finding can be traced to the working area where it was found |
| **The inspector's name** | as typed. It has to appear on the report — that is the point of a report |
| **A device label** | e.g. `PH-07`, so two phones inspecting one machine on one day can be told apart |
| **Date and time** | of the inspection |

## What the app does *not* record

- No account, no email address, no password, no sign-up.
- No contacts, calendar, messages, call history, health or financial data.
- No advertising identifier. No advertising of any kind.
- **No background location.** Location is read once, when an inspection is saved or when
  the GPS button is pressed. The app does not have and does not request background
  location permission. It cannot follow you when it is not open.
- No analytics or usage tracking at the time of writing. If crash reporting is added, this
  policy and the store listings will be updated in the same release.

## Permissions, and what happens without them

| Permission | Used for | If you refuse |
|---|---|---|
| Camera | photographing the component | you can still complete an inspection; it has no photographs |
| Location | the GPS stamp on the round | the round saves without one |
| Photos / media | attaching a picture already on the phone | you can still take new ones |
| Network | uploading the round | everything works offline; the round waits in the queue |

Every one is optional. Refusing all of them still leaves a usable app.

## Where it goes

To the destination your organisation configured — a Google Drive folder they own, or a
server they run. Always over HTTPS.

The publisher operates no backend for this app. If your organisation uses Google Drive,
Google acts as their storage provider under their agreement with Google, not under this
policy. Nothing is sent to any other third party.

## While it is on your phone

Inspections are held on the device until they upload, and remain there afterwards so you
can review or correct them. They are inside the app's private storage, which other apps
cannot read. Photographs are not written to your camera roll unless you choose to save one.

Deleting the app deletes everything it holds on the device. Anything already uploaded is
your organisation's copy and is unaffected.

## How long it is kept

Your organisation decides. The app itself keeps records on the phone until they are
deleted there.

## Children

This is a workplace tool and is not directed at children. It collects nothing from anyone
knowingly under 18.

## Your rights

Depending on where you live you may have rights to see, correct, export or delete personal
information about you — in this app, that means your name where it appears on inspections.
Because your organisation controls the stored data, address those requests to them; they
can act on them directly. Ask your maintenance or reliability supervisor if you are not
sure who that is.

## Security

Everything in transit is encrypted with HTTPS. On-device data sits in the app's private
storage. Where a server backend is used, each phone carries its own credential, which can
be revoked individually if a phone is lost — without disturbing anyone else's.

No system is perfect, and this policy does not claim otherwise.

## Changes

Material changes will be reflected here and in the store listings, with the date at the top
updated. The version of this policy that applies is the one published at the time.

## Contact

**About inspection data** — your site's reliability or maintenance department, who control
where it is stored.

**About the app itself** — `[PUBLISHER CONTACT EMAIL]`, `[PUBLISHER LEGAL NAME AND ADDRESS]`.

> Both placeholders must be filled in with real, monitored details before this is published.
> Google Play and the App Store both check that the contact route works, and an unmonitored
> address fails review.
