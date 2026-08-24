/* ============================================================================
   BUILT-IN UPLOAD DESTINATIONS
   ----------------------------------------------------------------------------
   A phone that has never been configured picks these up on first open, so an
   inspector can install the app and start capturing with nothing to set up.

   The URLs ship empty. Paste yours in and every new phone is configured; leave
   them empty and the app asks for setup as before (⚙, or the Show setup code /
   Scan setup hand-off between phones).

   ⚠️  BEFORE YOU PASTE, KNOW WHAT IT COSTS
   An upload URL is a WRITE CREDENTIAL, and this file is served to anyone who
   opens the app — "view source" shows it. Filling these in means anyone who
   finds the site can write files into the Drive folder and the SharePoint
   library, and you cannot tell who did. That may well be an acceptable trade for
   removing per-phone setup — make it knowingly, not by accident.

   Safer ways to get the same convenience:
     • ⚙ → Show setup code / Scan setup — hands the settings phone to phone, so
       the credentials never reach the published site.
     • Host the app behind Cloudflare Pages + Access (free up to 50 users). Then
       the page is not public and filling these in is fine.

   To undo: clear the `url` fields AND rotate both endpoints — Apps Script:
   Manage deployments → Archive → new deployment. Power Automate: re-generate
   the trigger URL. Clearing them alone does not un-publish what was served.

   Settings already saved on a phone always win; these only fill in a phone that
   has no destination URL yet.
   ========================================================================== */
window.UPLOAD_DEFAULTS = {
  dests: [
    {
      id: "gas",                       // Google Drive via Apps Script
      on: true,
      url: "https://script.google.com/macros/s/AKfycbwWJ1vb-OjP0VQPcrnoEB8PkuFyhk86mecIrkcomSVFqE5ddJynSwSheuskNGMcwLGf/exec",                         // ← paste the /exec URL between the quotes
      sec: "",                         // must match SECRET in docs/google-upload.gs
      folder: "{TYPE}/{UNIT}/{YYYY-MM-DD}",
    },
    {
      id: "pa",                        // SharePoint / OneDrive via Power Automate
      /* OFF, so a phone opened for the first time does not pick it up ticked.

         Nothing in this system reads SharePoint back — the dashboard, the team
         list and the photographs on a report all come from Drive — and a round
         only counted as safely away once EVERY ticked destination had taken
         every file, so one unreachable mirror held every round on every phone
         for ever. The URL stays: tick it in ⚙ and it works exactly as before,
         as a second copy. See up_gas_only_v1 in index.html for the one-time
         correction that unticks it on phones that already have it. */
      on: false,
      url: "https://defaultcdec65183a8e4078a165704f2b7e42.df.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/18/workflows/6f45fe051c4e47429c9759483834044a/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=yiQSUSpmsqOe1LYqTqNYmDJ6bAczA4ungMZkYI68aFI",                         // ← paste the flow's HTTP POST URL here
      sec: "",                         // the sig= in that URL is the authentication
      folder: "{TYPE}/{UNIT}/{YYYY-MM-DD}",
    },
  ],
  // Photo size is deliberately NOT defaulted here — it stays on "Original" so no
  // inspector silently loses evidence detail. Change it per phone in ⚙.

  /* ------------------------------------------------------------------
     ONE-TIME BACKEND CHANGEOVER

     Updating the build does not move a phone's destinations: a slot that
     already has a URL is deliberately left alone, so a fleet in the field
     stays where it is through any number of updates. Editing `dests` above
     reaches nobody already carrying a URL, for exactly the same reason.

     This is how a fleet is moved. Fill in `to` and give it an `id`, and each
     phone does the change once, on its next open with signal:

        the URL it uses now  →  slides into the second copy (write only)
        `to`                 →  takes the main slot (read and write)
        both                 →  ticked, so nothing is stranded on one side

     Then every round lands in BOTH from that moment, and switching back is
     swapping two fields rather than hunting for what was missed.

     `id` is a name you choose, not a version. A phone that has done this one is
     never asked again; the next changeover is a NEW id, not an edit to this one.

     ⚠️ Same warning as the URLs above: this file is served to anyone who opens
     the app, so `to` is published the moment you fill it in. If that is not
     acceptable, leave it empty and use ⚙ → Show setup code instead — the phones
     have to be opened once for the update anyway, and scanning takes seconds.
     ------------------------------------------------------------------ */
  swap: {
    id:   "yandex-2026-08",            // ARMED — every phone does this once
    from: "https://script.google.com/macros/s/AKfycbwWJ1vb-OjP0VQPcrnoEB8PkuFyhk86mecIrkcomSVFqE5ddJynSwSheuskNGMcwLGf/exec",
    to:   "https://baimskaya-cm.duckdns.org",
    sec:  "",                          // the endpoint has no shared secret set
    folder: ""                         // keep whatever folder pattern is there
  },

  /* ------------------------------------------------------------------
     SWITCHING THE OLD DESTINATION OFF AGAIN

     The other half of a changeover. While both are ticked every file goes to
     both, and they are uploaded IN SEQUENCE — so a round is not away until the
     slowest has taken it, and the slow one is the backend being retired.

     Fill this in when you are satisfied the new backend is carrying the fleet,
     and each phone switches the second copy off once, on its next open. The URL
     stays behind, so turning it back on is one tick rather than a hunt for a
     string nobody wrote down.

     `id` is a name you choose, exactly like swap's. `dest` is "mirror" for the
     second copy, or "pa" / "post" for the others.
     ------------------------------------------------------------------ */
  retire: {
    id:   "google-off-2026-08",        // ARMED — every phone does this once
    dest: "mirror"                     // the Google second copy
  },
};
