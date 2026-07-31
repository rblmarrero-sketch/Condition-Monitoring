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
      url: "",                         // ← paste the /exec URL between the quotes
      sec: "",                         // must match SECRET in docs/google-upload.gs
      folder: "{YYYY-MM}",
    },
    {
      id: "pa",                        // SharePoint / OneDrive via Power Automate
      on: true,
      url: "",                         // ← paste the flow's HTTP POST URL here
      sec: "",                         // the sig= in that URL is the authentication
      folder: "{YYYY-MM}",
    },
  ],
  // Photo size is deliberately NOT defaulted here — it stays on "Original" so no
  // inspector silently loses evidence detail. Change it per phone in ⚙.
};
