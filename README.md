# YouTube Subscription Checker

[![Listing on addons.mozilla.org][badge-amo]][amo-listing]
[![License][badge-license]][mpl]

A Firefox add-on that checks for new uploads from YouTube channels.

Features:
- Send desktop notifications about new uploads from your favorite channels
- Filters for including or excluding specific kind of videos
- Simple interface

# General architecture

The background add-on code is responsible for all the API requests to YouTube
and persisting data using `indexedDB`. The UI page talks to the add-on code
through `hub/app/bridge.js`. The general philosophy is to keep the responsibility of the UI page as small as possible.

The layout of the db can be found in `initialize_db()` in `storage.js`

[amo-listing]: https://addons.mozilla.org/en-US/firefox/addon/youtube-subscription-checker/
[mpl]: https://www.mozilla.org/en-US/MPL/2.0/

[badge-license]: https://img.shields.io/badge/license-MPL%202.0-blue.svg
[badge-amo]: https://img.shields.io/badge/AMO-2.3.1-blue.svg
