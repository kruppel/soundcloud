### Options for updating Dashboard/Favorites ###
A) Update periodically via nsIObserver/nsITimer [done]
- Makes sense for the Dashboard
B) Flag update and post event [done]
- Maybe makes more sense for Favorites? Still a usecase where a user
could go through another client, favorite, and not see the update in
Songbird.

note:
Related issue around losing view state... i.e. User plays from favorites
library and then library is refreshed (clear/populate) - Is that ok? Is
there another way to go about this?

### Blur searchbox once search is triggered ###

### Display informative message when no results are found ###

### Add favorited date to Favorites ###

### Allow for configuration of sandbox/test environment ###

### Disable edit, "dropping", and removal for directory ###

### Focus authorization dialog window ###

### Attempt to login to SoundCloud in the background before auth ###

### Scrape artist for the playback history service ###
Requirement for scrobbling tracks.

### [pref] Mediacore adjustments ###
- songbird.mediacore.output.buffertime
- songbird.mediacore.streaming.buffersize
- refresh rate for dashboard

### Download ###
Copy over all properties

### Disable editable title ###
Not sure if this is even possible...

### [playlistcommand] Copy permalink URL ###

### [playlistcommand] Follow user ###
