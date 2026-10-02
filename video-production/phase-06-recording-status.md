# Phase 6 — source access and recording status

**Checked:** 2026-10-02. **No new source clips or local edited/rendered videos were produced in this pass.** The nine pre-existing renders are bundled in [`existing-video-delivery.zip`](existing-video-delivery.zip), with provenance notes in [`available-existing-videos/README.md`](available-existing-videos/README.md). Three additional externally hosted rendered cuts analogous to requested rows 1, 3, and 4 were found in a related public repository; their links, hashes, limited checks, and evidentiary gaps are recorded in [`phase-06-external-render-inventory.md`](phase-06-external-render-inventory.md). Those external cuts are not in this checkout and do **not** meet the source, caption-sidecar, EDL, and full audiovisual-QA requirements for completed deliverables.

## Download attempt

The user authorized obtaining public meeting recordings from YouTube or Granicus. I installed temporary `yt-dlp` and `imageio-ffmpeg` tools in the excluded home virtual environment and tested the public June 22 City Council YouTube source from the Phase 1 manifest and the City-hosted Granicus player host, **without cookies**. Both hosts closed the TLS connection with an EOF during the request. PyPI package access worked, but no media bytes were obtained from either video host. The extractor/FFmpeg tools therefore could not reach the recordings; the failure was before authentication and was not caused by missing cookies.

The web-page retrieval tools can show page text and source metadata but cannot save the meeting-video streams into the workspace. The attached browser-cookie file was not opened, copied, or used. Public recordings should not require a personal browser session; if that attachment contains live session cookies, remove it from the upload and revoke/sign out of the affected session as appropriate.

## What is needed to render the requested new videos

Any of the following would unblock source access:

1. Enable sandbox network egress to the official YouTube/Granicus video hosts so the public streams can be retrieved without account cookies; or
2. Provide the specific source recordings or exported clips as workspace files.

Then each clip still needs audiovisual review against its transcript candidate, speaker/context verification, an edit-decision list, rendering, and QA. The existing nine MP4s are prior selected edits; they do not contain the new Phase 2–5 work and are not a substitute for those checks.
