# Building the store apps

The web app is the app. Capacitor puts the *same* `mobile/` folder inside an Android and an
iOS container — there is no second codebase, no port, and no build step, because the app is
plain HTML and JavaScript. `npx cap sync` copies `mobile/` into both native projects and
that is the whole pipeline.

**The web version keeps working exactly as it does now.** The GitHub Pages URL your
technicians already use is unaffected by everything in this file. Shipping to the stores
adds a second way to install it; it does not replace the first.

---

## What is committed and what is not

| | |
|---|---|
| `android/`, `ios/` | **committed.** Capacitor generates them once and then they stop being output and become source: the permission list, the purpose strings, the icons and the signing config are decisions, and a regenerate silently loses them |
| `android/…/assets/public/`, `ios/…/App/public/` | **not committed.** That is the copy of `mobile/` that `cap sync` stamps in. Genuinely build output, and stale the moment `mobile/` changes |
| `ios-Info.plist.additions.xml` | the purpose strings, kept where they can be reviewed. Paste into `ios/App/App/Info.plist` after the iOS project is first created |

---

## Android

Everything here works on Linux, Windows or macOS.

```bash
npm install                    # once
npx cap sync android           # after any change to mobile/
npx cap open android           # opens Android Studio
```

**What you need:** Android Studio (which brings the SDK and JDK). Nothing else.

**First-run checklist**

1. **Package name is permanent.** It is `com.nordrim.conditionmonitoring` in
   `capacitor.config.json`. Change it *now* if it should be something else — after the
   first upload it can never change without publishing a separate app.
2. **Signing.** Use **Play App Signing** and let Google hold the upload key. If you keep
   the only key and lose it, the listing is dead and you start again under a new package
   name. In Android Studio: *Build → Generate Signed Bundle → Android App Bundle*.
3. **Build an `.aab`**, not an APK. Play has not accepted APKs for new apps since 2021.
4. **Target API level** must be within one year of the current Android release, so expect a
   rebuild roughly annually even if nothing else changes.

**The permissions are declared explicitly** in `android/app/src/main/AndroidManifest.xml`,
not left to plugin manifest merging. Only `@capacitor/network` ships an entry of its own —
a build that trusts the merge gets a camera that throws `SecurityException` the first time
an inspector taps the shutter, in the pit, on somebody else's phone. Each one is there
because something specific stops working without it:

| Permission | Without it |
|---|---|
| `INTERNET` | no upload, no register refresh |
| `ACCESS_NETWORK_STATE` | the queue cannot tell a dead interface from a working link |
| `CAMERA` | no photographs |
| `ACCESS_FINE_LOCATION` / `COARSE` | no GPS stamp on the round |
| `READ_MEDIA_IMAGES` (33+) / `READ_EXTERNAL_STORAGE` (≤32) | cannot attach a photograph already on the phone |

Nothing is requested speculatively. Both stores ask you to justify every permission, and
the shortest honest list is the easiest to defend.

---

## iOS

**This part needs a Mac.** There is no way around it: the toolchain that produces an `.ipa`
runs only on macOS. If nobody has one, use a cloud macOS runner — Codemagic, Bitrise, or
GitHub Actions `macos-latest` — and budget for it.

```bash
npm install
npx cap add ios                # first time only
npx cap sync ios
npx cap open ios               # opens Xcode
```

**First-run checklist**

1. Paste **`ios-Info.plist.additions.xml`** into `ios/App/App/Info.plist`. The purpose
   strings matter: Apple reads them, and a reviewer who finds *"to use the camera"* rejects
   the build. Ours say what the app does with the permission, in the words a person would
   use — which is also what the inspector sees in the dialog.
2. Set the team and bundle identifier in *Signing & Capabilities*.
3. Ship the **iPad** build too. The layouts are already tablet-capable and it costs one
   checkbox and one set of screenshots.
4. **TestFlight before review.** Get it onto five real phones in the pit first.

### The rejection risk to plan for

App Store Review **Guideline 4.2 — Minimum Functionality** exists to reject apps that are
just a website in a shell. This one is not, but it must not *look* like one:

- **It works with the aeroplane mode on.** Say this in the review notes, and tell the
  reviewer to try it. That is the strongest argument there is against 4.2, and it is
  already true — the whole app, all the reference data, every picker.
- Native camera, geolocation and share are wired through `mobile/native.js`, not the
  browser equivalents.
- No browser chrome, no URL bar, no web-style pull-to-refresh.
- Safe areas and the notch are handled (`viewport-fit=cover` plus `env(safe-area-inset-*)`).

---

## The native seam

`mobile/native.js` is the only file that knows whether it is running in a browser or a
shell. Everything else calls `CMNative.photo()`, `CMNative.geo.here()`,
`CMNative.net.onChange()`, `CMNative.share.file()` and gets the same shapes back either
way.

That is deliberate and worth protecting. The alternative — `if (isNative)` sprinkled
through the capture logic — is how one codebase quietly becomes two, with the web half
getting the bug fixes and the native half getting the attention, until the report a phone
prints and the report the office prints disagree. The rest of this project already resists
that (one report engine, one reference table, one severity model); the shell must not be
what breaks it.

**The web path is not a fallback in the apologetic sense.** It is the reference
implementation, it stays shipped, and it stays tested. Native is an optimisation for four
things the browser genuinely cannot do well:

| | Why native is better |
|---|---|
| Camera | the file input re-encodes, drops EXIF, and on some Android builds silently halves resolution |
| Large binaries | 150 photographs from an undercarriage round is not what IndexedDB blob storage is for, and iOS evicts it under pressure |
| Knowing the network | `navigator.onLine` reports the interface, not the internet — which is why build 69 needs a retry timer to work around it |
| Sharing a PDF | a share sheet, rather than a download landing in a folder nobody opens |

**Filesystem storage is written but not switched on.** Moving photographs out of IndexedDB
changes the record shape, and that belongs in one deliberate migration rather than
happening as a side effect of installing a shell. The interface exists now so the capture
code is already calling through it on the day it does.

---

## Deep links

A QR label on a machine opens the app already on that unit — with 1,085 units, the
alternative is scrolling a picker wearing gloves.

| Form | Where it works |
|---|---|
| `cm://unit/TK151` | the installed app, Android and iOS |
| `…/mobile/index.html?unit=TK151` | any browser, and the installed PWA |
| either, plus `&type=UC` | opens straight into that inspection type |

One handler serves all of them, so there is a single implementation of "go to this
machine". `launchMode="singleTask"` means scanning a second label re-enters the running app
instead of stacking another copy — which matters when someone walks a row of trucks.

---

## Releasing a change

```bash
# 1. change mobile/ as usual, bump BUILD in mobile/index.html and mobile/sw.js
# 2. the web is already done — push, and phones pick it up (see README, "Telling
#    people a new version is out")
# 3. for the stores:
npx cap sync
npx cap open android      # Build → Generate Signed Bundle → upload the .aab
npx cap open ios          # Product → Archive → Distribute
```

The web and the stores are allowed to drift by a few days — the app checks its own build
number against the server every half hour and says so. What must not drift is
`mobile/index.html`'s `BUILD` and `mobile/sw.js`'s: `ver.cjs` fails the sweep if they do.
