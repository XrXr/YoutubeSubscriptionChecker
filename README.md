# YouTube Subscription Checker

[![Listing on addons.mozilla.org][badge-amo]][amo-listing]
[![License][badge-license]][mpl]

A Firefox add-on that checks for new uploads from YouTube channels.

Features:
- Send desktop notifications about new uploads from your favorite channels
- Filters for including or excluding specific kind of videos
- Simple interface

# Firefox 57

If you downgrade Firefox from 57 to any version below, you would notice that the addon isn't able to read its database. Unfortunately, Firefox 57 seems to have a storage format incompatible with previous versions. This is beyond what the addon
can handle, simply a decision made by Mozilla. The good news is that if you upgrade back to 57, everything would be still there. If you would like to downgrade Firefox, you can upgrade to Firefox 57, export from the addon, then import the data into the older version of Firefox.

If all else fails: **execute at your own risk and be very careful**

 -   Go to about:profiles, click "open directory" for the root directory of the the default profile
 -   Make a backup of this folder, just in case you misfire when deleting
 -   Shutdown Firefox completely. I recommend going through the menus.
 -   Delete storage.sqlite and storage/default/moz-extension+++5e6a782a-e7d5-438f-a45d-a9387d302362
 -   Open Firefox again. It will take a moment before the addon becomes responsive, Firefox is not used to this kind situation.


# General architecture

The background add-on code is responsible for all the API requests to YouTube
and persisting data using `indexedDB`. The UI page talks to the add-on code
through `hub/app/bridge.js`. The general philosophy is to keep the responsibility of the UI page as small as possible.

The layout of the db can be found in `initialize_db()` in `storage.js`

[amo-listing]: https://addons.mozilla.org/en-US/firefox/addon/youtube-subscription-checker/
[mpl]: https://www.mozilla.org/en-US/MPL/2.0/

[badge-license]: https://img.shields.io/badge/license-MPL%202.0-blue.svg
[badge-amo]: https://img.shields.io/badge/AMO-2.3.3-blue.svg

