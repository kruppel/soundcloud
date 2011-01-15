### Options for updating Dashboard/Favorites ###
A) Update periodically via nsIObserver/nsITimer
- Makes sense for the Dashboard
B) Flag update and post event
- Maybe makes more sense for Favorites? Still a usecase where a user
could go through another client, favorite, and not see the update in
Songbird.

note:
Related issue around losing view state... i.e. User plays from favorites
library and then library is refreshed (clear/populate) - Is that ok? Is
there another way to go about this?

### "Secure" information accessible via service interface ###
I didn't have a good solution in mind for restricting access to login
credentials. Both LastFM and Rhapsody I believe surface this information.
Especially when accounting for the autologin process, is there a way
to obfuscate these? Or is it not even worth the trouble?
[DONE] Also set prefs for oauth_token and token_secret... Should probably
encode/decode these strings.

### Blur searchbox once search is triggered ###

### Display informative message when no results are found ###

### Add favorited date to Favorites ###

### Allow for configuration of sandbox/test environment ###

### Disable edit, "dropping", and removal for directory ###

### Scrape artist for the playback history service ###
Requirement for scrobbling tracks.
